import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AQ_CAR_DEBUG } from '../debug/aquariumRecovery.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { dimSwampMaterials } from './swampSubmergedGlbUtils.js';

/**
 * Second distant submerged prop — Swamp Molly only. Smaller footprint than the
 * vintage car; back-left + far +Z, fog-friendly. No headlight cones.
 */

export const FIAT_PANDA_4X4_URL = '/models/fiat_panda_4x4.glb';

function SwampSunkenFiatPandaLoaded({ seabedY = -12 }) {
  const { scene } = useGLTF(FIAT_PANDA_4X4_URL);
  const [carRoot, setCarRoot] = useState(null);
  const frameRef = useRef(null);
  const logAcc = useRef(0);
  const { camera } = useThree();

  useLayoutEffect(() => {
    const fogMurk = new THREE.Color('#14110e');
    const root = scene.clone(true);

    dimSwampMaterials(root, fogMurk);
    /** Push body materials slightly darker; strip distant-read emissive. */
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.color) continue;
        m.color.multiplyScalar(0.88);
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
    /** Compact city car — noticeably smaller than the vintage sedan. */
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

  const floorY = seabedY + 0.22;
  /**
   * Rusty car sits ~[-4.5, _, 71] (behind default camera, −X).
   * Fiat on the opposite far edge: +X, similar +Z band — back-left in the world
   * when the user turns from the initial forward view.
   */
  const groupPos = useMemo(
    () => [42, floorY - 0.78, 63],
    [floorY],
  );

  useFrame((_, delta) => {
    if (!AQ_CAR_DEBUG || !frameRef.current) return;
    logAcc.current += delta;
    if (logAcc.current < 0.9) return;
    logAcc.current = 0;
    const grp = frameRef.current;
    grp.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(grp).getCenter(new THREE.Vector3());
    console.info('[aqcardebug] swamp fiat panda', {
      distCamToCarCenter: camera.position.distanceTo(center),
      carBoundsCenterWorld: center.toArray(),
    });
  });

  return (
    <group position={groupPos} rotation={[0, -0.52, 0]}>
      <group ref={frameRef} scale={0.98}>
        {carRoot && <primitive object={carRoot} />}
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
