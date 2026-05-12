import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import AmbientRadio from './AmbientRadio.jsx';
import { resolveRadioSlotIndex } from '../theme/themes.js';
import { computeLetterSlots } from './letterLayout.js';
import { LetterRadioSlot } from './FloatingLetters.jsx';
import { AQ_TYPO_DEBUG_LOG } from '../debug/aquariumRecovery.js';
import {
  typographyFillHex,
  typographyHighlightColor,
} from './typographyPalette.js';

/** Bypass camera-distance readability curve so the embedded orb stays visible while debugging. */
const NEUTRAL_ORB_READABILITY = {
  anchor: [0, 0, 0],
  readStart: 0,
  readPeak: 8000,
  readEnd: 9000,
  readFadeStart: 12000,
  readFadeEnd: 13000,
  closeMul: 1,
  peakMul: 1,
  farMul: 1,
  pullbackLiftStart: 0,
  pullbackLiftEnd: 0.001,
  pullbackLiftMax: 0,
  pullbackScaleStart: 0,
  pullbackScaleEnd: 0.001,
  pullbackScaleExtra: 0,
};

function makeGlyphTexture(char, fillHex, crestHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 78px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(64, 36, 64, 96);
  g.addColorStop(0, crestHex);
  g.addColorStop(0.45, fillHex);
  g.addColorStop(1, fillHex);
  ctx.fillStyle = g;
  ctx.fillText(char === ' ' ? '' : char, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _scratchHi = new THREE.Color();

function CanvasGlyph({
  char,
  baseX,
  baseY,
  baseZ,
  phase,
  scale,
  floatStrength,
  fillHex,
  crestHex,
  highlight,
  opacity,
  shimmerStrength,
}) {
  const groupRef = useRef();
  const matRef = useRef();
  const baseRgb = useMemo(() => new THREE.Color(fillHex), [fillHex]);

  const map = useMemo(
    () => makeGlyphTexture(char, fillHex, crestHex),
    [char, fillHex, crestHex],
  );

  useFrame((s) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    const t = s.clock.elapsedTime;
    const fs = floatStrength;
    const driftX =
      (Math.sin(t * 0.31 + phase) * 0.6 +
        Math.sin(t * 0.53 + phase * 1.7) * 0.3) *
      fs;
    const driftY =
      (Math.sin(t * 0.27 + phase * 1.3) * 0.7 +
        Math.sin(t * 0.46 + phase * 2.1) * 0.25) *
      fs;
    const driftZ =
      (Math.sin(t * 0.22 + phase * 1.9) * 0.5 +
        Math.sin(t * 0.39 + phase * 2.7) * 0.18) *
      fs *
      0.6;
    g.position.set(baseX + driftX, baseY + driftY, baseZ + driftZ);

    const flapX =
      (Math.sin(t * 0.45 + phase * 1.1) * 0.12 +
        Math.sin(t * 0.83 + phase * 2.3) * 0.06) *
      (0.6 + floatStrength * 6);
    const twistY =
      (Math.sin(t * 0.37 + phase * 0.8) * 0.14 +
        Math.sin(t * 0.71 + phase * 1.9) * 0.06) *
      (0.6 + floatStrength * 6);
    const tiltZ =
      (Math.sin(t * 0.29 + phase) * 0.08 +
        Math.sin(t * 0.57 + phase * 1.4) * 0.03) *
      (0.6 + floatStrength * 6);
    g.rotation.set(flapX, twistY, tiltZ);

    const flutter =
      1 +
      Math.sin(t * 0.62 + phase * 1.3) * 0.04 * (0.4 + floatStrength * 8);
    g.scale.set(1, flutter, 1);

    const wobble =
      Math.sin(t * 0.62 + phase) * 0.55 +
      Math.sin(t * 1.19 + phase * 2.2) * 0.28 +
      Math.sin(t * 2.03 + phase * 4.05) * 0.17;
    const glintRare =
      Math.pow(Math.max(0, Math.sin(t * 0.81 + phase * 2.4)), 18) * 0.95;
    const sunCatch = Math.pow(Math.max(0, Math.sin(t * 0.44 + phase * 1.1)), 6) * 0.42;

    const sh = shimmerStrength;
    const lift = (0.42 + 0.58 * (0.5 + 0.5 * wobble)) * sh * 0.14 + glintRare + sunCatch * sh;
    _scratchHi.copy(baseRgb).lerp(highlight, Math.min(1, 0.22 + lift * 1.35));
    m.color.copy(_scratchHi);
    m.opacity = THREE.MathUtils.clamp(
      opacity * (0.74 + wobble * 0.11 * sh + glintRare * 0.45 + sunCatch * 0.28),
      0.52,
      0.98,
    );
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <mesh renderOrder={40}>
        <planeGeometry args={[scale * 0.92, scale * 0.92]} />
        <meshBasicMaterial
          ref={matRef}
          map={map}
          transparent
          opacity={opacity}
          alphaTest={0.06}
          fog={false}
          toneMapped={false}
          depthWrite={false}
          depthTest
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Troika-free typography: system UI font rasterized to canvas textures.
 * Does not suspend; ignores scene fog on glyphs. Same slot layout as SDF path.
 */
export default function CanvasFloatingLetters({
  text,
  depthSpread = 7,
  floatStrength = 0.06,
  opacity = 0.62,
  scale = 0.3,
  spacing = 1.2,
  murkiness = 0.78,
  rowGapMul = 1,
  intraLineYJitterMul = 1,
  interRowJitterMul = 0,
  lineXJitterMul = 1,
  floatLayout = null,
  radioSlot = null,
  radioEmbedded = false,
  radioGlowIntensity = 1,
  beaconAtmosphere = null,
  typographyReadability: _typographyReadability,
  typographyTint = null,
  shimmerStrength = 0.55,
  beam = null,
  /** Stronger Z clamp for recovery (keeps phrase in frustum). */
  safeClampZ = 3.8,
}) {
  const mergedFloatLayout = useMemo(
    () => ({
      sequentialDepthShare: 0.52,
      randomZAsFracOfSpread: 0.22,
      xJitterAsFracOfSpacing: 0.14,
      yJitterAsFracOfSpacing: 0.46,
      ...(floatLayout ?? {}),
    }),
    [floatLayout],
  );

  const fillHex = useMemo(
    () => typographyFillHex(murkiness, typographyTint),
    [murkiness, typographyTint],
  );
  const highlight = useMemo(
    () => typographyHighlightColor(typographyTint),
    [typographyTint],
  );
  const crestHex = useMemo(() => {
    const c = new THREE.Color(fillHex);
    c.lerp(highlight, 0.38);
    return `#${c.getHexString()}`;
  }, [fillHex, highlight]);

  const radioSlotIndex = useMemo(
    () => resolveRadioSlotIndex(text, radioSlot),
    [text, radioSlot],
  );

  const layout = useMemo(
    () =>
      computeLetterSlots(
        text,
        spacing,
        depthSpread,
        rowGapMul,
        intraLineYJitterMul,
        interRowJitterMul,
        lineXJitterMul,
        mergedFloatLayout,
        { maxAbsZ: safeClampZ },
      ),
    [
      text,
      spacing,
      depthSpread,
      rowGapMul,
      intraLineYJitterMul,
      interRowJitterMul,
      lineXJitterMul,
      mergedFloatLayout,
      safeClampZ,
    ],
  );

  useEffect(() => {
    if (!AQ_TYPO_DEBUG_LOG) return;
    const readable = layout.filter((s) => !/\s/.test(s.char)).length;
    const samples = layout
      .filter((s) => !/\s/.test(s.char))
      .slice(0, 6)
      .map(({ baseX, baseY, baseZ }) => ({ x: baseX, y: baseY, z: baseZ }));
    console.info('[aquarium] CanvasFloatingLetters mounted', {
      phrase: text,
      themeChars: text.length,
      slotCount: layout.length,
      glyphSlots: readable,
      radioSlotIndex,
      positionSamples: samples,
    });
  }, [text, layout, radioSlotIndex]);

  return (
    <group>
      {layout.map((l, i) => {
        if (/\s/.test(l.char)) return null;

        const useRadioGlyph =
          radioEmbedded && radioSlotIndex != null && i === radioSlotIndex;

        if (useRadioGlyph) {
          return (
            <LetterRadioSlot
              key={i}
              baseX={l.baseX}
              baseY={l.baseY}
              baseZ={l.baseZ}
              phase={l.phase}
              scale={scale}
              opacity={opacity}
              floatStrength={floatStrength}
              shimmerStrength={shimmerStrength}
              murkTint={fillHex}
              glowIntensity={radioGlowIntensity}
              beam={beam}
              beaconAtmosphere={beaconAtmosphere}
              typographyReadability={NEUTRAL_ORB_READABILITY}
            />
          );
        }

        return (
          <CanvasGlyph
            key={i}
            char={l.char}
            baseX={l.baseX}
            baseY={l.baseY}
            baseZ={l.baseZ}
            phase={l.phase}
            scale={scale}
            floatStrength={floatStrength}
            fillHex={fillHex}
            crestHex={crestHex}
            highlight={highlight}
            opacity={opacity}
            shimmerStrength={shimmerStrength}
          />
        );
      })}
    </group>
  );
}
