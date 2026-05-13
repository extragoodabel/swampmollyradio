import { Html } from '@react-three/drei';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AQ_CAR_DEBUG, AQ_CAR_INFO_DEBUG } from '../debug/aquariumRecovery.js';

const HACKLES_URL =
  'https://www.girlnoise.press/collections/our-books/products/hackles-by-makayla-danielle-gay';

/**
 * Screen-stabilized HTML at a world anchor (near the rusty car). Fog-independent.
 *
 * @param {{
 *   position: [number, number, number];
 *   rotation: [number, number, number];
 *   open: boolean;
 *   onFadeOutComplete?: () => void;
 * }} props
 */
export default function SwampHacklesHtmlPanel({
  position,
  rotation,
  open,
  onFadeOutComplete,
}) {
  const { camera, size } = useThree();
  const worldRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const dbgAcc = useRef(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setEntered(true)),
      );
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    return undefined;
  }, [open]);

  const showVisually = entered && open;

  useLayoutEffect(() => {
    worldRef.current.set(position[0], position[1], position[2]);
  }, [position]);

  useEffect(() => {
    if (!AQ_CAR_INFO_DEBUG && !AQ_CAR_DEBUG) return;
    const w = worldRef.current;
    console.info('[aqcarinfodebug] SwampHacklesHtmlPanel mounted', {
      medium: 'Html (drei) — DOM in canvas, world-anchored + euler toward volume',
      worldPosition: position.slice(),
      rotationRad: rotation.slice(),
      mountCondition: 'Scene: shown | hiding',
      openUi: open,
      distCamToAnchor: camera.position.distanceTo(w),
    });
    return () => {
      if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
        console.info('[aqcarinfodebug] SwampHacklesHtmlPanel unmounted');
      }
    };
  }, [position, rotation, open, camera]);

  const handleTransitionEnd = useCallback(
    (e) => {
      if (e.propertyName !== 'opacity') return;
      if (open) return;
      onFadeOutComplete?.();
    },
    [open, onFadeOutComplete],
  );

  useFrame((_, dt) => {
    if (!AQ_CAR_INFO_DEBUG && !AQ_CAR_DEBUG) return;
    dbgAcc.current += dt;
    if (dbgAcc.current < 0.85) return;
    dbgAcc.current = 0;
    const w = worldRef.current;
    console.info('[aqcarinfodebug] SwampHacklesHtmlPanel heartbeat', {
      worldPosition: w.toArray(),
      distCam: camera.position.distanceTo(w),
      openUi: open,
      viewportCss: { width: size.width, height: size.height },
    });
  });

  return (
    <group position={position} rotation={rotation}>
      <Html
        center
        transform
        occlude={false}
        distanceFactor={10}
        zIndexRange={[200, 0]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className={`swamp-hackles-html__wrap ${showVisually ? 'swamp-hackles-html__wrap--open' : 'swamp-hackles-html__wrap--closed'}`}
          onTransitionEnd={handleTransitionEnd}
        >
          <a
            href={HACKLES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="swamp-hackles-html__blocklink"
          >
            <p className="swamp-hackles-html__line swamp-hackles-html__line--title">
              <em>Hackles</em>
            </p>
            <p className="swamp-hackles-html__line swamp-hackles-html__line--body">
              by Makayla Danielle Gay
            </p>
            <p className="swamp-hackles-html__line swamp-hackles-html__line--body">
              is available at
            </p>
            <p className="swamp-hackles-html__line swamp-hackles-html__line--cta">
              <span className="swamp-hackles-html__cta">Girl Noise Press</span>
            </p>
          </a>
        </div>
      </Html>
    </group>
  );
}
