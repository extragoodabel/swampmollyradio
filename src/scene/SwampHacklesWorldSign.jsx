import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import hacklesFontUrl from 'three/examples/fonts/droid/droid_sans_mono_regular.typeface.json?url';
import { AQ_CAR_INFO_DEBUG, AQ_CAR_DEBUG } from '../debug/aquariumRecovery.js';

const HACKLES_URL =
  'https://www.girlnoise.press/collections/our-books/products/hackles-by-makayla-danielle-gay';

/** Matches rusty car pulse tint (`SwampSunkenCar`) for cause/effect read. */
const HACKLES_OUTLINE = '#4f7a82';
const HACKLES_FILL_MAIN = '#cdeef3';
const HACKLES_FILL_MUTED = '#a8d5df';
const HACKLES_FILL_LINK = '#b8f0ff';

/**
 * Location-locked in-world Hackles / Girl Noise Press plaque near the rusty car.
 * Entire block opens the URL; "Girl Noise Press" is visually emphasized.
 *
 * @param {{ position: [number, number, number]; rotation: [number, number, number] }} props
 */
export default function SwampHacklesWorldSign({ position, rotation }) {
  const floatRef = useRef(null);
  const { camera } = useThree();
  const fadeRef = useRef(0);
  const fadeDoneRef = useRef(false);
  const [matFade, setMatFade] = useState(0);
  const [hitHover, setHitHover] = useState(false);
  useCursor(hitHover);

  const openLink = useCallback((e) => {
    e.stopPropagation();
    const b = e.nativeEvent?.button;
    if (b != null && b !== 0) return;
    const w = window.open(HACKLES_URL, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  }, []);

  useLayoutEffect(() => {
    if (!AQ_CAR_INFO_DEBUG && !AQ_CAR_DEBUG) return;
    const p = new THREE.Vector3(position[0], position[1], position[2]);
    console.info('[aqcarinfodebug] SwampHacklesWorldSign mounted', {
      position: position.slice(),
      rotation: rotation.slice(),
      distCamToSignAnchor: camera.position.distanceTo(p),
    });
  }, [position, rotation, camera]);

  const tRef = useRef(0);
  useFrame((_, dt) => {
    tRef.current += dt;
    if (!fadeDoneRef.current) {
      fadeRef.current = Math.min(1, fadeRef.current + dt * 2.05);
      setMatFade(fadeRef.current);
      if (fadeRef.current >= 1) fadeDoneRef.current = true;
    }

    const fr = floatRef.current;
    if (fr) {
      const bob = Math.sin(tRef.current * 0.88) * 0.038;
      const sway = Math.sin(tRef.current * 0.52) * 0.014;
      fr.position.y = bob;
      fr.rotation.z = sway;
    }
  });

  const fo = useMemo(() => THREE.MathUtils.clamp(matFade, 0, 1), [matFade]);
  const outlineOp = 0.42 + fo * 0.38;
  const lineOutlineW = 0.022;

  return (
    <group
      position={position}
      rotation={rotation}
      frustumCulled={false}
      renderOrder={125}
    >
      <group ref={floatRef} frustumCulled={false}>
        <mesh
          position={[0, -0.38, 0.05]}
          onPointerDown={openLink}
          onPointerOver={() => setHitHover(true)}
          onPointerOut={() => setHitHover(false)}
          frustumCulled={false}
          renderOrder={126}
        >
          <planeGeometry args={[3.55, 1.22]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        <Text
          font={hacklesFontUrl}
          fontSize={0.33}
          color={HACKLES_FILL_MAIN}
          fillOpacity={0.92 * fo}
          outlineColor={HACKLES_OUTLINE}
          outlineWidth={lineOutlineW}
          outlineOpacity={outlineOp}
          anchorX="center"
          anchorY="top"
          maxWidth={3.4}
          position={[0, 0.08, 0]}
          depthTest={false}
          depthOffset={-0.001}
          renderOrder={127}
        >
          Hackles by Makayla Danielle Gay
        </Text>
        <Text
          font={hacklesFontUrl}
          fontSize={0.26}
          color={HACKLES_FILL_MUTED}
          fillOpacity={0.85 * fo}
          outlineColor={HACKLES_OUTLINE}
          outlineWidth={lineOutlineW * 0.9}
          outlineOpacity={outlineOp * 0.92}
          anchorX="center"
          anchorY="top"
          letterSpacing={0.02}
          position={[0, -0.32, 0]}
          depthTest={false}
          depthOffset={-0.001}
          renderOrder={127}
        >
          is available at
        </Text>
        <Text
          font={hacklesFontUrl}
          fontSize={0.31}
          color={HACKLES_FILL_LINK}
          fillOpacity={fo}
          outlineColor="#9ee0f0"
          outlineWidth={lineOutlineW * 1.08}
          outlineOpacity={Math.min(0.95, outlineOp * 1.15)}
          anchorX="center"
          anchorY="top"
          letterSpacing={0.06}
          position={[0, -0.62, 0]}
          depthTest={false}
          depthOffset={-0.001}
          renderOrder={127}
        >
          Girl Noise Press
        </Text>
      </group>
    </group>
  );
}
