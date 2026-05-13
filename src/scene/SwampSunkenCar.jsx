import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { AQ_CAR_DEBUG } from '../debug/aquariumRecovery.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import SubmergedHeadlights, {
  SWAMP_HEADLIGHT_TUNING_VINTAGE,
} from './SubmergedHeadlights.jsx';
import {
  collectHeadlightAnchors,
  dimSwampMaterials,
} from './swampSubmergedGlbUtils.js';

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
  poemInteractable = false,
  onVintagePoemOpenRequest,
}) {
  const { scene } = useGLTF(RUSTY_VINTAGE_CAR_URL);
  const [carRoot, setCarRoot] = useState(null);
  const [anchors, setAnchors] = useState([]);
  const [poemHitHover, setPoemHitHover] = useState(false);
  const frameRef = useRef(null);
  const logAcc = useRef(0);
  const { camera } = useThree();

  useCursor(poemInteractable && poemHitHover);

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
    setCarRoot(root);
  }, [scene]);

  const floorY = seabedY + 0.22;
  const groupPos = [-4.45, floorY - 0.86, 71];
  const adjustedAnchors = useMemo(() => applyAnchorOffsets(anchors), [anchors]);

  useFrame((_, delta) => {
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
        {poemInteractable && (
          <mesh
            position={[0, 1.05, 0.1]}
            onPointerDown={(e) => {
              e.stopPropagation();
              const b = e.nativeEvent?.button;
              if (b != null && b !== 0) return;
              onVintagePoemOpenRequest?.();
            }}
            onPointerOver={() => setPoemHitHover(true)}
            onPointerOut={() => setPoemHitHover(false)}
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
 *   poemInteractable?: boolean;
 *   onVintagePoemOpenRequest?: () => void;
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
