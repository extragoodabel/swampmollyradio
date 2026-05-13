import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadio } from '../audio/RadioContext.jsx';
import { AQ_ORB_DEBUG } from '../debug/aquariumRecovery.js';
import { getDustTexture } from './assets/dustTexture.js';
import { getHaloTexture } from './assets/haloTexture.js';

/**
 * Diegetic underwater radio beacon — visual + play/pause only.
 * Station changes live in the top-left `RadioOverlay` controls, not here.
 */

const DEFAULT_MOD = { beam: 1, haze: 1, shimmer: 1 };

/** Consider pointer up a tap when movement stays within this (px). */
const TAP_THRESHOLD_PX = 20;

/**
 * Tunable beacon look + placement (merged with `theme.radio.beaconVisual`).
 * Distant placement: `TypographicDistantBeacon` (outside typography pullback group).
 * Depth uses `beaconDepthOffsetBeyondTypography`, or legacy `beaconDepthOffsetBeyondLetters`.
 */
export const DEFAULT_BEACON_VISUAL = {
  /**
   * World units from “o” anchor along ray (spawn camera → anchor), then pushed past anchor.
   * Larger values = clearer parallax vs letters.
   */
  beaconDepthOffsetBeyondTypography: 16,
  /** Legacy alias for depth. */
  beaconDepthOffsetBeyondLetters: 16,
  /** Extra world offset after depth solve (before parenting transform). */
  beaconWorldOffsetFromOSlot: [0, 0, 0],
  /** Nudges beacon in camera right / up (world-ish, from camera basis). */
  beaconScreenAlignX: 0,
  beaconScreenAlignY: 0,
  /** Multiplier on perspective-correct scale (fine-tune apparent size at spawn). */
  beaconApparentScaleMul: 1,
  /** Explicit world scale (×). Stacks with `beaconWorldScaleMul`. */
  beaconWorldScale: 1,
  /** Extra uniform scale on the placement group (world). */
  beaconWorldScaleMul: 1,
  /** Multiplies `auraScaleMul` for bloom/halos; alias: `beaconAuraScale`. */
  beaconAuraScaleMul: 1,
  /** Multiplies orbit dust radius (stacked with `orbitRadiusMul`). */
  beaconOrbitRadiusMul: 1,
  slotLocalZOffset: 0,
  typographyScaleMul: 1.02,
  coreRadiusMul: 1.28,
  hitboxRadiusMul: 1.06,
  auraScaleMul: 1.12,
  softAuraScaleMul: 2.18,
  softAuraOpacityMul: 0.37,
  orbitRadiusMul: 1.04,
  orbitParticleCount: 26,
  orbitParticleSizeMul: 1.0,
};

export function resolveBeaconVisual(partial) {
  const p = partial && typeof partial === 'object' ? partial : {};
  const merged = { ...DEFAULT_BEACON_VISUAL, ...p };
  const depthBeyond =
    p.beaconDepthOffsetBeyondTypography ?? p.beaconDepthOffsetBeyondLetters;
  if (depthBeyond != null && Number.isFinite(Number(depthBeyond))) {
    merged.beaconDepthOffsetBeyondTypography = Number(depthBeyond);
  }
  merged.beaconAuraScaleMul =
    p.beaconAuraScaleMul ??
    p.beaconAuraScale ??
    DEFAULT_BEACON_VISUAL.beaconAuraScaleMul;
  if (merged.beaconWorldScale == null || !Number.isFinite(merged.beaconWorldScale)) {
    merged.beaconWorldScale = DEFAULT_BEACON_VISUAL.beaconWorldScale;
  }
  if (merged.beaconScreenAlignX == null || !Number.isFinite(merged.beaconScreenAlignX)) {
    merged.beaconScreenAlignX = DEFAULT_BEACON_VISUAL.beaconScreenAlignX;
  }
  if (merged.beaconScreenAlignY == null || !Number.isFinite(merged.beaconScreenAlignY)) {
    merged.beaconScreenAlignY = DEFAULT_BEACON_VISUAL.beaconScreenAlignY;
  }
  const woff = p.beaconWorldOffsetFromOSlot ?? merged.beaconWorldOffsetFromOSlot;
  merged.beaconWorldOffsetFromOSlot =
    Array.isArray(woff) && woff.length >= 3
      ? [Number(woff[0]) || 0, Number(woff[1]) || 0, Number(woff[2]) || 0]
      : [0, 0, 0];
  return merged;
}

function makeOrbitPositions(count) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3 + 0] = 0;
    arr[i * 3 + 1] = 0;
    arr[i * 3 + 2] = 0;
  }
  return arr;
}

function makeOrbitSeeds(count) {
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4 + 0] = 0.45 + Math.random() * 0.45;
    arr[i * 4 + 1] = Math.random() * Math.PI * 2;
    arr[i * 4 + 2] = 0.15 + Math.random() * 0.45;
    arr[i * 4 + 3] = 0.3 + Math.random() * 0.7;
  }
  return arr;
}

export default function AmbientRadio({
  position = [3, 0.5, -5],
  glowIntensity = 1,
  enabled = true,
  embedded = false,
  modRef = null,
  typographyScale = 1,
  murkTint = null,
  beaconAtmosphere = null,
  beaconVisual: beaconVisualProp = null,
}) {
  const groupRef = useRef();
  const spinGroupRef = useRef();
  const innerRef = useRef();
  const haloRef = useRef();
  const softHaloRef = useRef();
  const innerMat = useRef();
  const haloMat = useRef();
  const softHaloMat = useRef();
  const orbitRef = useRef();
  const orbitMat = useRef();
  const hovered = useRef(false);

  const bv = useMemo(
    () => resolveBeaconVisual(beaconVisualProp),
    [beaconVisualProp],
  );

  const orbitCount = useMemo(
    () =>
      THREE.MathUtils.clamp(Math.round(bv.orbitParticleCount), 8, 48),
    [bv.orbitParticleCount],
  );

  const orbitPositions = useMemo(
    () => makeOrbitPositions(orbitCount),
    [orbitCount],
  );
  const orbitSeeds = useMemo(() => makeOrbitSeeds(orbitCount), [orbitCount]);

  const murkColor = useMemo(
    () => (murkTint ? new THREE.Color(murkTint) : null),
    [murkTint],
  );

  const worldPos = useMemo(() => new THREE.Vector3(), []);

  const {
    isPlaying,
    isLoading,
    toggle,
    station,
    beaconNavSuspendedRef,
  } = useRadio();

  useEffect(() => {
    if (!AQ_ORB_DEBUG) return;
    console.info('[aqorbdebug] orb mounted', {
      embedded,
      enabled,
      glowIntensity,
      position: embedded ? '(parent slot)' : [...position],
      toggleCallable: typeof toggle === 'function',
      stationId: station?.id,
      isPlaying,
      isLoading,
    });
  }, [
    embedded,
    enabled,
    glowIntensity,
    position,
    toggle,
    station?.id,
    isPlaying,
    isLoading,
  ]);

  const tapRef = useRef({
    active: false,
    pointerId: -1,
    x0: 0,
    y0: 0,
  });

  const haloTexture = useMemo(() => getHaloTexture(), []);
  const dustTexture = useMemo(() => getDustTexture(), []);

  const tryPlayPauseToggle = (reason) => {
    if (AQ_ORB_DEBUG) {
      console.info('[aqorbdebug] orb click', {
        reason,
        toggleCallable: typeof toggle === 'function',
        stationId: station?.id,
        stationName: station?.name,
        isPlaying,
        isLoading,
      });
    }
    if (typeof toggle !== 'function') {
      if (AQ_ORB_DEBUG) {
        console.warn('[aqorbdebug] play/pause handler missing — stub only');
      }
      return;
    }
    try {
      toggle();
    } catch (err) {
      console.warn('[aquarium] AmbientRadio toggle failed', err);
    }
  };

  const endTap = (e, opts = { cancelled: false }) => {
    const tr = tapRef.current;
    if (!tr.active || (e?.pointerId != null && e.pointerId !== tr.pointerId)) {
      return;
    }
    tapRef.current = {
      active: false,
      pointerId: -1,
      x0: 0,
      y0: 0,
    };
    beaconNavSuspendedRef.current = false;
    document.body.style.cursor = hovered.current ? 'pointer' : '';

    if (
      !opts.cancelled &&
      e &&
      Math.hypot(e.clientX - tr.x0, e.clientY - tr.y0) < TAP_THRESHOLD_PX
    ) {
      tryPlayPauseToggle('tap');
    }
  };

  useEffect(() => {
    return () => {
      beaconNavSuspendedRef.current = false;
      document.body.style.cursor = '';
    };
  }, [beaconNavSuspendedRef]);

  useFrame((state) => {
    if (!enabled) return;
    const t = state.clock.elapsedTime;

    const mod = modRef?.current ?? DEFAULT_MOD;
    const typ = Math.max(0.35, typographyScale);
    const coreR = 0.22 * bv.coreRadiusMul;
    const orbitRScale =
      coreR *
      typ *
      bv.orbitRadiusMul *
      (bv.beaconOrbitRadiusMul ?? 1) *
      (beaconAtmosphere?.orbitDustBaseScale ?? 1);
    const visMul = mod.beam * mod.haze * mod.shimmer;

    let proxSmooth = 0;
    let presenceMul = 1;
    if (beaconAtmosphere && groupRef.current) {
      groupRef.current.getWorldPosition(worldPos);
      const dist = worldPos.distanceTo(state.camera.position);
      const rawProx =
        1 -
        THREE.MathUtils.smoothstep(
          dist,
          beaconAtmosphere.proximityNear,
          beaconAtmosphere.proximityFar,
        );
      proxSmooth = rawProx * rawProx * (3 - 2 * rawProx);
      presenceMul =
        beaconAtmosphere.baseVisibilityMul *
        THREE.MathUtils.lerp(
          1,
          beaconAtmosphere.proximityBrightMax,
          proxSmooth,
        );
    }

    if (groupRef.current) {
      if (embedded) {
        groupRef.current.position.set(0, 0, 0);
        groupRef.current.rotation.y = t * 0.07;
      } else {
        groupRef.current.position.set(
          position[0] + Math.sin(t * 0.32) * 0.1,
          position[1] + Math.cos(t * 0.41) * 0.08,
          position[2] + Math.sin(t * 0.27) * 0.06,
        );
        groupRef.current.rotation.y = t * 0.18;
      }
    }

    if (spinGroupRef.current) {
      spinGroupRef.current.rotation.y = t * 0.12;
    }

    const beat = Math.sin(t * 3.0) * 0.5 + Math.sin(t * 5.3) * 0.35;
    const playMix = isPlaying ? 1 : 0;
    const pulse = 1 + (isPlaying ? beat * 0.18 : Math.sin(t * 1.0) * 0.04);
    const hoverBoost = hovered.current ? 1.2 : 1.0;

    if (innerRef.current) {
      innerRef.current.scale.setScalar(pulse * typ);
    }
    if (haloRef.current) {
      let haloScale =
        (1.6 + pulse * 0.45 + playMix * 0.25) *
        typ *
        bv.auraScaleMul *
        (bv.beaconAuraScaleMul ?? 1);
      if (beaconAtmosphere) {
        haloScale *= 1 + (1 - proxSmooth) * beaconAtmosphere.haloFarSpread;
      }
      haloRef.current.scale.set(haloScale, haloScale, haloScale);
    }
    if (softHaloRef.current && haloRef.current) {
      const hs = haloRef.current.scale.x * bv.softAuraScaleMul;
      softHaloRef.current.scale.set(hs, hs, hs);
    }

    if (innerMat.current) {
      const baseAlpha = isPlaying ? 0.95 : 0.72;
      const loadFlicker = isLoading ? 0.85 + Math.sin(t * 9) * 0.15 : 1.0;
      const discoverBoost = embedded ? 1.08 : 1.0;
      innerMat.current.opacity = Math.max(
        0.22,
        baseAlpha *
          glowIntensity *
          hoverBoost *
          loadFlicker *
          visMul *
          discoverBoost *
          presenceMul,
      );
      const target = isPlaying ? warm : cool;
      innerMat.current.color.lerp(target, 0.05);
      if (embedded && murkColor) {
        const murkAmt = beaconAtmosphere?.murkLerpInner ?? 0.22;
        innerMat.current.color.lerp(murkColor, murkAmt);
      }
    }
    if (haloMat.current) {
      const baseAlpha = isPlaying ? 0.92 : 0.58;
      haloMat.current.opacity = Math.max(
        0.14,
        baseAlpha *
          glowIntensity *
          hoverBoost *
          visMul *
          (embedded ? 1.06 : 1.0) *
          presenceMul,
      );
      if (embedded && murkColor) {
        const murkAmt = beaconAtmosphere?.murkLerpHalo ?? 0.14;
        haloMat.current.color.lerp(murkColor, murkAmt);
      }
    }

    if (softHaloMat.current && haloMat.current) {
      softHaloMat.current.opacity = Math.max(
        0.045,
        haloMat.current.opacity *
          bv.softAuraOpacityMul *
          (embedded ? 1.05 : 1.0),
      );
      softHaloMat.current.color.copy(haloMat.current.color);
    }

    const op = orbitRef.current?.geometry?.attributes?.position;
    if (op) {
      const arr = op.array;
      const tEff = t * (isPlaying ? 1.0 : 0.35);
      const dMul =
        1 +
        proxSmooth * (beaconAtmosphere?.orbitDustProxScale ?? 0.4);
      for (let i = 0; i < orbitCount; i++) {
        const radius = orbitSeeds[i * 4 + 0];
        const phase = orbitSeeds[i * 4 + 1];
        const omega = orbitSeeds[i * 4 + 2];
        const vAmp = orbitSeeds[i * 4 + 3];
        const a = phase + tEff * omega;
        arr[i * 3 + 0] = Math.cos(a) * radius * orbitRScale * dMul;
        arr[i * 3 + 1] =
          Math.sin(tEff * omega * 1.3 + phase) * vAmp * 0.5 * orbitRScale * dMul;
        arr[i * 3 + 2] = Math.sin(a) * radius * orbitRScale * dMul;
      }
      op.needsUpdate = true;
    }

    if (orbitMat.current) {
      const dSize =
        0.095 *
        bv.orbitParticleSizeMul *
        typ *
        (1 + proxSmooth * (beaconAtmosphere?.orbitDustProxScale ?? 0.35));
      orbitMat.current.size = dSize;
      const baseDustA = (isPlaying ? 0.62 : 0.42) * presenceMul * visMul;
      orbitMat.current.opacity = Math.max(
        0.08,
        baseDustA *
          glowIntensity *
          (embedded ? 1.02 : 0.95) *
          (1 - (beaconAtmosphere?.murkLerpDust ?? 0) * 0.35),
      );
      if (embedded && murkColor) {
        const murkAmt = beaconAtmosphere?.murkLerpDust ?? 0.12;
        orbitMat.current.color.copy(dustOrbColor).lerp(murkColor, murkAmt);
      } else {
        orbitMat.current.color.copy(dustOrbColor);
      }
    }

  });

  if (!enabled) return null;

  return (
    <group
      ref={groupRef}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        hovered.current = false;
        if (!tapRef.current.active) {
          document.body.style.cursor = '';
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        beaconNavSuspendedRef.current = true;
        tapRef.current = {
          active: true,
          pointerId: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
        };
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        endTap(e, { cancelled: false });
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        endTap(e, { cancelled: true });
      }}
      onLostPointerCapture={(e) => {
        endTap(e, { cancelled: true });
      }}
    >
      <group ref={spinGroupRef}>
        <mesh ref={innerRef} raycast={() => null}>
          <icosahedronGeometry args={[0.22 * bv.coreRadiusMul, 1]} />
          <meshBasicMaterial
            ref={innerMat}
            color={'#9be7f2'}
            transparent
            opacity={0.8}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <mesh
          scale={Math.max(typographyScale, 0.72) * bv.hitboxRadiusMul}
        >
          <sphereGeometry args={[1.0, 16, 12]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>

        <points
          ref={orbitRef}
          key={orbitCount}
          raycast={() => null}
          frustumCulled={false}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={orbitCount}
              array={orbitPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={orbitMat}
            map={dustTexture}
            size={0.1}
            color={'#bdeaf2'}
            transparent
            depthWrite={false}
            opacity={0.72}
            sizeAttenuation
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>

        <sprite ref={softHaloRef} raycast={() => null}>
          <spriteMaterial
            ref={softHaloMat}
            map={haloTexture}
            transparent
            depthWrite={false}
            toneMapped={false}
            color={'#c8f0fb'}
            blending={THREE.AdditiveBlending}
          />
        </sprite>

        <sprite ref={haloRef} raycast={() => null}>
          <spriteMaterial
            ref={haloMat}
            map={haloTexture}
            transparent
            depthWrite={false}
            toneMapped={false}
            color={'#bef3fb'}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
    </group>
  );
}

const warm = new THREE.Color('#cdeff5');
const cool = new THREE.Color('#79b6c0');
const dustOrbColor = new THREE.Color('#bdeaf2');
