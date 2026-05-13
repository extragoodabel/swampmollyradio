import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { AQ_CAR_DEBUG, AQ_CAR_INFO_DEBUG } from '../debug/aquariumRecovery.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import SubmergedHeadlights, {
  SWAMP_HEADLIGHT_TUNING_VINTAGE,
} from './SubmergedHeadlights.jsx';
import {
  collectHeadlightAnchors,
  dimSwampMaterials,
} from './swampSubmergedGlbUtils.js';

import { rustyCarInteractRef } from './rustyCarClickBridge.js';

/** Warm gold/amber — visible through murk (emissive + additive halo). */
export const CAR_CLICK_GLOW_COLOR = new THREE.Color('#f2b84a');
/** ~1.0–1.5s pulse window */
export const RUSTY_CAR_PULSE_SEC = 1.28;
/** Stronger than legacy 2×; multiplied into emissive + halo */
export const RUSTY_CAR_CLICK_PULSE_INTENSITY = 5.2;

/**
 * Distant submerged car — Swamp Molly only. `rusty_vintage_car.glb` + murk;
 * sealed-beam cones via `SubmergedHeadlights`.
 */

export const RUSTY_VINTAGE_CAR_URL = '/models/rusty_vintage_car.glb';

/** Applied in car-root local space after GLB headlight detection (tune without re-exporting GLB). */
export const SWAMP_VINTAGE_HEADLIGHT_OFFSET_LEFT = new THREE.Vector3(
  0,
  0.02,
  -0.1,
);
export const SWAMP_VINTAGE_HEADLIGHT_OFFSET_RIGHT = new THREE.Vector3(
  0,
  0.02,
  -0.1,
);

function applyAnchorOffsets(anchors) {
  if (!anchors?.length) return anchors;
  const out = anchors.map((v) => v.clone());
  if (out[0]) out[0].add(SWAMP_VINTAGE_HEADLIGHT_OFFSET_LEFT);
  if (out[1]) out[1].add(SWAMP_VINTAGE_HEADLIGHT_OFFSET_RIGHT);
  return out;
}

function SwampSunkenCarLoaded({
  seabedY = -12,
  fogNear,
  fogFar,
  fogColor,
  headlightsEnabled = true,
  infoBubbleInteractable = false,
  onRustyCarHacklesToggle,
}) {
  const { scene } = useGLTF(RUSTY_VINTAGE_CAR_URL);
  const [carRoot, setCarRoot] = useState(null);
  const [anchors, setAnchors] = useState([]);
  const [infoHitHover, setInfoHitHover] = useState(false);
  const frameRef = useRef(null);
  const logAcc = useRef(0);
  const carRootRef = useRef(null);
  const materialPulseBaseRef = useRef(/** @type {Map<THREE.Material, { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity: number }>} */ (new Map()));
  const pulseRemainRef = useRef(0);
  const pulseDistBoostRef = useRef(1);
  const { camera } = useThree();

  useCursor(infoBubbleInteractable && infoHitHover);

  const computePulseDistBoost = useMemo(
    () => () => {
      const fr = frameRef.current;
      if (!fr) return 1;
      fr.updateMatrixWorld(true);
      const c = new THREE.Box3()
        .setFromObject(fr)
        .getCenter(new THREE.Vector3());
      const d = camera.position.distanceTo(c);
      return THREE.MathUtils.clamp(d / 13, 1, 4.75);
    },
    [camera],
  );

  useLayoutEffect(() => {
    rustyCarInteractRef.pulse = () => {
      pulseDistBoostRef.current = computePulseDistBoost();
      pulseRemainRef.current = RUSTY_CAR_PULSE_SEC;
    };
    return () => {
      rustyCarInteractRef.pulse = null;
    };
  }, [computePulseDistBoost]);

  useLayoutEffect(() => {
    const fogMurk = new THREE.Color('#151210');
    const root = scene.clone(true);

    dimSwampMaterials(root, fogMurk);

    const box0 = new THREE.Box3().setFromObject(root);
    const size0 = box0.getSize(new THREE.Vector3());
    const maxXZ = Math.max(size0.x, size0.z, 0.001);
    const targetLen = 8.85;
    const s = targetLen / maxXZ;
    root.scale.multiplyScalar(s);

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const sink = 0.22;
    root.position.y -= box.min.y + sink;

    root.rotation.order = 'YXZ';
    root.rotation.y = -0.11;
    root.rotation.x = 0.052;
    root.rotation.z = 0.04;

    root.updateMatrixWorld(true);
    setAnchors(collectHeadlightAnchors(root));
    root.traverse((o) => {
      if (o.isMesh) o.raycast = () => {};
    });
    carRootRef.current = root;
    setCarRoot(root);
  }, [scene]);

  useLayoutEffect(() => {
    const root = carRootRef.current ?? carRoot;
    if (!root) return;
    const map = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || map.has(m)) continue;
        const snap = {
          emissiveIntensity:
            m.emissiveIntensity !== undefined ? m.emissiveIntensity : 0,
        };
        if (m.emissive) snap.emissive = m.emissive.clone();
        if (m.color) snap.color = m.color.clone();
        map.set(m, snap);
      }
    });
    materialPulseBaseRef.current = map;
  }, [carRoot]);

  const floorY = seabedY + 0.22;
  const groupPos = [-4.45, floorY - 0.86, 71];
  const adjustedAnchors = useMemo(() => applyAnchorOffsets(anchors), [anchors]);

  useFrame((_, delta) => {
    const root = carRootRef.current ?? carRoot;
    const baseMap = materialPulseBaseRef.current;

    if (root && baseMap?.size) {
      if (pulseRemainRef.current > 0) {
        pulseRemainRef.current = Math.max(
          0,
          pulseRemainRef.current - delta,
        );
      }
      const u =
        pulseRemainRef.current <= 0
          ? 0
          : 1 - pulseRemainRef.current / RUSTY_CAR_PULSE_SEC;
      const hump = Math.sin(Math.min(1, u) * Math.PI);
      const db = pulseDistBoostRef.current;

      root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          const b = baseMap.get(m);
          if (!b || !m) continue;
          const w = hump * 0.48 * RUSTY_CAR_CLICK_PULSE_INTENSITY * db;
          if (b.emissive && m.emissive) {
            m.emissive.copy(b.emissive).lerp(CAR_CLICK_GLOW_COLOR, Math.min(1, w * 0.38));
            m.emissiveIntensity = b.emissiveIntensity + w * 1.12;
          } else if (b.color && m.color) {
            m.color.copy(b.color).lerp(CAR_CLICK_GLOW_COLOR, w * 0.16);
          }
        }
      });
    }

    if (!AQ_CAR_DEBUG || !frameRef.current) return;
    logAcc.current += delta;
    if (logAcc.current < 0.9) return;
    logAcc.current = 0;
    const grp = frameRef.current;
    grp.updateMatrixWorld(true);
    const cam = camera.position;
    const center = new THREE.Box3().setFromObject(grp).getCenter(new THREE.Vector3());
    const dist = cam.distanceTo(center);
    const wpHead = adjustedAnchors.map((a) => {
      const v = new THREE.Vector3(a.x, a.y, a.z);
      grp.localToWorld(v);
      return { x: v.x, y: v.y, z: v.z, distCam: cam.distanceTo(v) };
    });
    console.info('[aqcardebug] swamp vintage car', {
      distCamToCarCenter: dist,
      carBoundsCenterWorld: center.toArray(),
      headlightWorld: wpHead,
      headlightsEnabled,
    });
  });

  return (
    <group position={groupPos} rotation={[0, Math.PI, 0]}>
      <group ref={frameRef} scale={1.05}>
        {carRoot && <primitive object={carRoot} />}
        {infoBubbleInteractable && (
          <mesh
            position={[0, 1.05, 0.1]}
            userData={{ aqPickId: 'rusty-car-hit' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const b = e.nativeEvent?.button;
              if (b != null && b !== 0) return;
              pulseDistBoostRef.current = computePulseDistBoost();
              pulseRemainRef.current = RUSTY_CAR_PULSE_SEC;
              if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
                console.info('[aqcarinfodebug] rusty car click received (hit mesh)', {
                  pulseRemainSec: RUSTY_CAR_PULSE_SEC,
                  intersectionCount: e.intersections?.length ?? 0,
                  pickIds:
                    e.intersections?.map((h) => h.object?.userData?.aqPickId) ?? [],
                  note: 'onRustyCarHacklesToggle runs after pulse; see Scene logs for hackles state',
                });
              }
              onRustyCarHacklesToggle?.();
            }}
            onPointerOver={() => setInfoHitHover(true)}
            onPointerOut={() => setInfoHitHover(false)}
          >
            <boxGeometry args={[12, 4.85, 6.55]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {carRoot && headlightsEnabled && (
          <SubmergedHeadlights
            anchors={adjustedAnchors}
            fogNear={fogNear}
            fogFar={fogFar}
            fogColor={fogColor}
            tuning={SWAMP_HEADLIGHT_TUNING_VINTAGE}
          />
        )}
        {AQ_CAR_DEBUG &&
          adjustedAnchors.length > 0 &&
          adjustedAnchors.map((a, i) => (
            <mesh
              key={`hl-dbg-${i}`}
              position={[a.x, a.y, a.z + 0.06]}
              raycast={() => null}
            >
              <sphereGeometry args={[0.055, 8, 6]} />
              <meshBasicMaterial
                color={i === 0 ? '#ff2222' : '#22ff66'}
                depthTest
              />
            </mesh>
          ))}
      </group>
    </group>
  );
}

/**
 * @param {{
 *   seabedY: number;
 *   fogNear: number;
 *   fogFar: number;
 *   fogColor: string;
 *   headlightsEnabled?: boolean;
 *   infoBubbleInteractable?: boolean;
 *   onRustyCarHacklesToggle?: () => void;
 * }} props
 */
export default function SwampSunkenCar(props) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <SwampSunkenCarLoaded {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

useGLTF.preload(RUSTY_VINTAGE_CAR_URL);
