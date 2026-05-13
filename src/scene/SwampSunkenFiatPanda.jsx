import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AQ_CAR_DEBUG } from '../debug/aquariumRecovery.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { dimSwampMaterials } from './swampSubmergedGlbUtils.js';

/**
 * Fiat Panda 4x4 — manual headlight cones (no GLB lamp detection).
 *
 * Car mesh: `aqswamprestore >= 10` (`car2`). Cones + lens: `aqswamprestore >= 11` (`car2Headlights`).
 *
 * Lamp rig is a sibling `<group ref={fiatLampsAttachRef}>` whose transform is **copied from
 * `carRoot` every frame** (`useFrame` + `useLayoutEffect`) so it never desyncs from the GLB
 * (R3F `<group quaternion={carRoot.quaternion}>` is unreliable with mutable THREE objects).
 *
 * Headlight materials use `fog={false}` so beams stay readable at least as far as the fogged
 * body (`FIAT_BODY_EXTRA_ALBEDO_MUL`). No distance-based fade on lights.
 */

export const FIAT_PANDA_4X4_URL = '/models/fiat_panda_4x4.glb';

// --- Tune Fiat lamps here (car-root local space after scale / sink / root rotation). ---
/** Match `SubmergedHeadlights` global strength bump. */
const FIAT_HEADLIGHT_STRENGTH_MUL = 3;

export const FIAT_HEADLIGHT_LEFT_LOCAL = new THREE.Vector3(-0.64, 0.24, -1.05);
export const FIAT_HEADLIGHT_RIGHT_LOCAL = new THREE.Vector3(0.64, 0.24, -1.05);

export const FIAT_HEADLIGHT_DIRECTION_LOCAL = new THREE.Vector3(
  0,
  -0.26,
  -1,
).normalize();

export const FIAT_HEADLIGHT_CONE_LENGTH = 8.1;

export const FIAT_HEADLIGHT_CONE_RADIUS = 0.72;

export const FIAT_HEADLIGHT_CONE_OPACITY = 0.17 * FIAT_HEADLIGHT_STRENGTH_MUL;

export const FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS = 1.22;

export const FIAT_HEADLIGHT_CONE_HALO1_RADIUS_MUL = 1.22;
export const FIAT_HEADLIGHT_CONE_HALO1_LENGTH_MUL = 1.12;
export const FIAT_HEADLIGHT_CONE_HALO1_OPACITY_MUL = 0.42;

export const FIAT_HEADLIGHT_CONE_HALO2_RADIUS_MUL = 1.52;
export const FIAT_HEADLIGHT_CONE_HALO2_LENGTH_MUL = 1.3;
export const FIAT_HEADLIGHT_CONE_HALO2_OPACITY =
  0.055 * FIAT_HEADLIGHT_STRENGTH_MUL;

/** Warm orange — readable from distance, still murky. */
export const FIAT_HEADLIGHT_COLOR = '#f2a24a';

export const FIAT_HEADLIGHT_POOL_COLOR = '#b87238';

export const FIAT_HEADLIGHT_LENS_SIZE = 0.092;

export const FIAT_HEADLIGHT_LENS_OPACITY = Math.min(
  1,
  0.68 * FIAT_HEADLIGHT_STRENGTH_MUL,
);

export const FIAT_HEADLIGHT_POOL_LEFT_LOCAL = new THREE.Vector3(
  -0.52,
  -0.58,
  -2.35,
);
export const FIAT_HEADLIGHT_POOL_RIGHT_LOCAL = new THREE.Vector3(
  0.52,
  -0.58,
  -2.35,
);

export const FIAT_HEADLIGHT_POOL_SIZE = [2.15, 2.65];

export const FIAT_HEADLIGHT_POOL_OPACITY =
  0.085 * FIAT_HEADLIGHT_STRENGTH_MUL;

/** Darken GLB slightly more so lights read first in fog. */
const FIAT_BODY_EXTRA_ALBEDO_MUL = 0.84;

const _coneBeamAxis = new THREE.Vector3(0, -1, 0);

export const SWAMP_FIAT_HEADLIGHT_LEFT = FIAT_HEADLIGHT_LEFT_LOCAL;
export const SWAMP_FIAT_HEADLIGHT_RIGHT = FIAT_HEADLIGHT_RIGHT_LOCAL;

/** @deprecated Prefer `FIAT_HEADLIGHT_DIRECTION_LOCAL` (Vector3). */
export const SWAMP_FIAT_HEADLIGHT_CONE_EULER = [
  FIAT_HEADLIGHT_DIRECTION_LOCAL.x,
  FIAT_HEADLIGHT_DIRECTION_LOCAL.y,
  FIAT_HEADLIGHT_DIRECTION_LOCAL.z,
];

function syncLocalSpaceGroupFromCar(target, car) {
  if (!target || !car) return;
  target.position.copy(car.position);
  target.quaternion.copy(car.quaternion);
  target.scale.copy(car.scale);
}

function fiatHeadlightAnchors() {
  return [
    FIAT_HEADLIGHT_LEFT_LOCAL.clone(),
    FIAT_HEADLIGHT_RIGHT_LOCAL.clone(),
  ];
}

function useFiatHeadlightQuaternion() {
  return useMemo(() => {
    const dir = FIAT_HEADLIGHT_DIRECTION_LOCAL.clone();
    if (dir.lengthSq() < 1e-12) {
      dir.set(0, 0, -1);
    } else {
      dir.normalize();
    }
    return new THREE.Quaternion().setFromUnitVectors(_coneBeamAxis, dir);
  }, []);
}

function FiatHeadlightGroundPools() {
  const pools = useMemo(
    () => [
      FIAT_HEADLIGHT_POOL_LEFT_LOCAL,
      FIAT_HEADLIGHT_POOL_RIGHT_LOCAL,
    ],
    [],
  );

  const bias = FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS;

  return (
    <>
      {pools.map((pos, i) => (
        <group
          key={`fiat-pool-${i}`}
          position={[pos.x, pos.y, pos.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <mesh raycast={() => null} renderOrder={8}>
            <planeGeometry args={FIAT_HEADLIGHT_POOL_SIZE} />
            <meshBasicMaterial
              attach="material"
              color={FIAT_HEADLIGHT_POOL_COLOR}
              transparent
              opacity={FIAT_HEADLIGHT_POOL_OPACITY * bias}
              depthWrite={false}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

function FiatManualHeadlightCones() {
  const headlightQuat = useFiatHeadlightQuaternion();
  const h = FIAT_HEADLIGHT_CONE_LENGTH;
  const r = FIAT_HEADLIGHT_CONE_RADIUS;
  const op = FIAT_HEADLIGHT_CONE_OPACITY * FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS;
  const lensOp =
    FIAT_HEADLIGHT_LENS_OPACITY * FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS;

  const positions = useMemo(
    () => [FIAT_HEADLIGHT_LEFT_LOCAL, FIAT_HEADLIGHT_RIGHT_LOCAL],
    [],
  );

  const halo1Op = op * FIAT_HEADLIGHT_CONE_HALO1_OPACITY_MUL;
  const r1 = r * FIAT_HEADLIGHT_CONE_HALO1_RADIUS_MUL;
  const h1 = h * FIAT_HEADLIGHT_CONE_HALO1_LENGTH_MUL;
  const r2 = r * FIAT_HEADLIGHT_CONE_HALO2_RADIUS_MUL;
  const h2 = h * FIAT_HEADLIGHT_CONE_HALO2_LENGTH_MUL;
  const halo2Op =
    FIAT_HEADLIGHT_CONE_HALO2_OPACITY * FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS;

  return (
    <>
      {positions.map((pos, i) => (
        <group
          key={`fiat-hl-cone-${i}`}
          position={[pos.x, pos.y, pos.z]}
          quaternion={headlightQuat}
        >
          <mesh
            position={[0, -h * 0.5, 0]}
            raycast={() => null}
            renderOrder={12}
          >
            <coneGeometry args={[r, h, 48, 1, false]} />
            <meshBasicMaterial
              attach="material"
              color={FIAT_HEADLIGHT_COLOR}
              transparent
              opacity={op}
              depthWrite={false}
              fog={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[0, -h1 * 0.5, 0]}
            raycast={() => null}
            renderOrder={11}
          >
            <coneGeometry args={[r1, h1, 40, 1, true]} />
            <meshBasicMaterial
              attach="material"
              color={FIAT_HEADLIGHT_COLOR}
              transparent
              opacity={halo1Op}
              depthWrite={false}
              fog={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[0, -h2 * 0.52, 0]}
            raycast={() => null}
            renderOrder={10}
          >
            <coneGeometry args={[r2, h2, 32, 1, true]} />
            <meshBasicMaterial
              attach="material"
              color={FIAT_HEADLIGHT_COLOR}
              transparent
              opacity={halo2Op}
              depthWrite={false}
              fog={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh raycast={() => null} renderOrder={14}>
            <sphereGeometry args={[FIAT_HEADLIGHT_LENS_SIZE, 14, 12]} />
            <meshBasicMaterial
              attach="material"
              color={FIAT_HEADLIGHT_COLOR}
              transparent
              opacity={lensOp}
              depthWrite={false}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <FiatHeadlightGroundPools />
    </>
  );
}

function FiatCarDebugDots({ anchors }) {
  return (
    <>
      {anchors.map((a, i) => (
        <mesh
          key={`fiat-hl-dbg-${i}`}
          position={[a.x, a.y, a.z]}
          raycast={() => null}
        >
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial
            color={i === 0 ? '#ffaa44' : '#ffcc66'}
            depthTest
            fog={false}
          />
        </mesh>
      ))}
    </>
  );
}

function SwampSunkenFiatPandaLoaded({
  headlightsEnabled = true,
  seabedY = -12,
}) {
  const { scene } = useGLTF(FIAT_PANDA_4X4_URL);
  const [carRoot, setCarRoot] = useState(null);
  const frameRef = useRef(null);
  const outerGroupRef = useRef(null);
  const carObjRef = useRef(null);
  const fiatLampsAttachRef = useRef(null);
  const logAcc = useRef(0);
  const { camera } = useThree();

  const anchors = useMemo(() => fiatHeadlightAnchors(), []);

  useLayoutEffect(() => {
    const fogMurk = new THREE.Color('#14110e');
    const root = scene.clone(true);

    dimSwampMaterials(root, fogMurk);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.color) continue;
        m.color.multiplyScalar(0.82);
        m.color.multiplyScalar(FIAT_BODY_EXTRA_ALBEDO_MUL);
        if ('emissive' in m && m.emissive?.multiplyScalar) {
          m.emissive.setHex(0x000000);
        }
        if (m.emissiveIntensity !== undefined) {
          m.emissiveIntensity = 0;
        }
      }
    });

    const box0 = new THREE.Box3().setFromObject(root);
    const size0 = box0.getSize(new THREE.Vector3());
    const maxXZ = Math.max(size0.x, size0.z, 0.001);
    const targetLen = 4.05;
    const s = targetLen / maxXZ;
    root.scale.multiplyScalar(s);

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const sink = 0.26;
    root.position.y -= box.min.y + sink;

    root.rotation.order = 'YXZ';
    root.rotation.y = 0.38;
    root.rotation.x = 0.045;
    root.rotation.z = -0.06;

    setCarRoot(root);
  }, [scene]);

  useLayoutEffect(() => {
    syncLocalSpaceGroupFromCar(fiatLampsAttachRef.current, carRoot);
  }, [carRoot]);

  const floorY = seabedY + 0.22;
  const groupPos = useMemo(
    () => [42, floorY - 0.78, 63],
    [floorY],
  );

  useFrame((_, delta) => {
    syncLocalSpaceGroupFromCar(fiatLampsAttachRef.current, carRoot);

    if (!AQ_CAR_DEBUG) return;
    const car = carObjRef.current ?? carRoot;
    if (!car) return;
    logAcc.current += delta;
    if (logAcc.current < 0.9) return;
    logAcc.current = 0;

    car.updateMatrixWorld(true);
    const grp = frameRef.current;
    if (grp) grp.updateMatrixWorld(true);

    const attach = fiatLampsAttachRef.current;
    let coneMeshCount = 0;
    let lensMeshCount = 0;
    if (attach && headlightsEnabled) {
      attach.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (o.geometry.type === 'ConeGeometry') coneMeshCount += 1;
        else if (o.geometry.type === 'SphereGeometry') {
          const r = o.geometry.parameters?.radius ?? 0;
          if (r > 0.04) lensMeshCount += 1;
        }
      });
    }

    const center = new THREE.Box3()
      .setFromObject(car)
      .getCenter(new THREE.Vector3());
    const cam = camera.position;
    const dist = cam.distanceTo(center);

    const wp = anchors.map((a, i) => {
      const v = new THREE.Vector3(a.x, a.y, a.z);
      car.localToWorld(v);
      return {
        i,
        local: [a.x, a.y, a.z],
        world: v.toArray(),
        distCam: cam.distanceTo(v),
      };
    });

    const carEuler = new THREE.Euler().setFromQuaternion(
      car.quaternion,
      'YXZ',
    );

    const outer = outerGroupRef.current;
    const outerPos = outer
      ? outer.getWorldPosition(new THREE.Vector3()).toArray()
      : groupPos;

    const lampWorld = attach?.getWorldPosition(new THREE.Vector3()).toArray();

    console.info('[aqcardebug] swamp fiat panda — manual headlight cones', {
      distCamToCarBoundsCenter: dist,
      carBoundsCenterWorld: center.toArray(),
      carLocalPosition: car.position.toArray(),
      carLocalRotationYXZRad: [carEuler.x, carEuler.y, carEuler.z],
      lampAttachWorldApprox: lampWorld,
      outerGroupWorldPosition: outerPos,
      headlightLocalOffsets: wp.map((p) => p.local),
      headlightWorld: wp,
      directionLocal: FIAT_HEADLIGHT_DIRECTION_LOCAL.toArray(),
      coneLength: FIAT_HEADLIGHT_CONE_LENGTH,
      coneRadius: FIAT_HEADLIGHT_CONE_RADIUS,
      headlightsEnabled,
      coneMeshesMountedCount: coneMeshCount,
      lensGlowMeshesMountedCount: lensMeshCount,
      lampAttachSyncedEveryFrame: true,
      headlightMaterialsFog: false,
      distanceBasedLightFade: false,
      distanceVisibilityBias: FIAT_HEADLIGHT_DISTANCE_VISIBILITY_BIAS,
      restoreNote:
        'Fiat mesh: aqswamprestore >= 10. Fiat cones: aqswamprestore >= 11 (car2Headlights), unless aqswampkill=headlights.',
    });
  });

  return (
    <group ref={outerGroupRef} position={groupPos} rotation={[0, -0.52, 0]}>
      <group ref={frameRef} scale={0.98}>
        {carRoot && (
          <>
            <primitive object={carRoot} ref={carObjRef} />
            <group ref={fiatLampsAttachRef}>
              {headlightsEnabled && <FiatManualHeadlightCones />}
              {AQ_CAR_DEBUG && <FiatCarDebugDots anchors={anchors} />}
            </group>
          </>
        )}
      </group>
    </group>
  );
}

/**
 * @param {{
 *   headlightsEnabled?: boolean;
 *   seabedY: number;
 *   fogNear?: number;
 *   fogFar?: number;
 *   fogColor?: string;
 * }} props
 */
export default function SwampSunkenFiatPanda(props) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <SwampSunkenFiatPandaLoaded {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

useGLTF.preload(FIAT_PANDA_4X4_URL);
