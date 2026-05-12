import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext.jsx';
import { mergeDistantFishEnv } from '../theme/themes.js';
import { getDistantFishTexture } from './assets/distantFishTexture.js';

/** Salmon Days: peripheral / mid-depth sprites so life is not only overhead. */
const SALMON_EXTRA_CLOUD_DEFS = [
  { center: [0, 1, 22], radius: 13, baseCount: 240, vertical: 0.82, rate: 0.0055 },
  { center: [-22, -3, 14], radius: 11, baseCount: 210, vertical: 0.88, rate: 0.0062 },
  { center: [24, 4, 12], radius: 12, baseCount: 220, vertical: 0.9, rate: 0.0058 },
  { center: [-14, 6, -18], radius: 10, baseCount: 200, vertical: 0.62, rate: 0.0065 },
  { center: [18, -8, 6], radius: 11, baseCount: 215, vertical: 0.94, rate: 0.0059 },
  { center: [-8, -12, 20], radius: 10, baseCount: 195, vertical: 0.98, rate: 0.006 },
  { center: [12, 3, -12], radius: 9, baseCount: 180, vertical: 0.72, rate: 0.0064 },
  { center: [-26, 2, 4], radius: 11, baseCount: 205, vertical: 0.8, rate: 0.0056 },
];

/**
 * Distant fish-cloud layers — atmospheric only (tiny point sprites, low opacity).
 *
 * Volumetric placement wraps the viewer: deep -Z, upper vault, lower depths,
 * lateral +Z and ±X so orbit / tilt / pull-back always has faint life in view.
 * Theme palettes tune swamp (murk) vs salmon (pale silver).
 *
 * `density` / `speed` / `opacity` remain global Leva multipliers.
 */

const _cA = new THREE.Color();
const _cB = new THREE.Color();
const _cOut = new THREE.Color();

/**
 * Irregular cloud table: avoid ring-like symmetry; varied radii and depths.
 */
const VOLUMETRIC_CLOUD_DEFS = [
  { center: [0, -5, -54], radius: 15, baseCount: 400, vertical: 0.92, rate: 0.011 },
  { center: [-34, 5, -42], radius: 13, baseCount: 360, vertical: 0.78, rate: 0.013 },
  { center: [30, -7, -48], radius: 14, baseCount: 380, vertical: 0.84, rate: 0.012 },
  { center: [-10, 17, -30], radius: 11, baseCount: 300, vertical: 0.52, rate: 0.016 },
  { center: [16, 15, 20], radius: 10, baseCount: 280, vertical: 0.48, rate: 0.015 },
  { center: [-22, 13, 4], radius: 11, baseCount: 310, vertical: 0.56, rate: 0.014 },
  { center: [5, -17, -20], radius: 12, baseCount: 320, vertical: 0.74, rate: 0.012 },
  { center: [-14, -16, 10], radius: 11, baseCount: 300, vertical: 0.7, rate: 0.013 },
  { center: [36, 1, 4], radius: 12, baseCount: 310, vertical: 0.76, rate: 0.011 },
  { center: [-32, -3, 12], radius: 13, baseCount: 330, vertical: 0.82, rate: 0.011 },
  { center: [6, 3, 40], radius: 10, baseCount: 270, vertical: 0.68, rate: 0.012 },
  { center: [-26, 7, 34], radius: 11, baseCount: 290, vertical: 0.72, rate: 0.011 },
  { center: [24, -11, -26], radius: 12, baseCount: 360, vertical: 0.86, rate: 0.012 },
  { center: [-20, -1, -32], radius: 13, baseCount: 370, vertical: 0.88, rate: 0.011 },
  { center: [18, 9, -38], radius: 11, baseCount: 320, vertical: 0.8, rate: 0.012 },
];

function cloudMixColor(paletteA, paletteB, index, total) {
  const tw = (index + 0.413) / Math.max(1, total);
  const j = Math.sin(index * 2.847 + 1.1) * 0.5 + 0.5;
  const t = THREE.MathUtils.clamp(tw * 0.78 + j * 0.22, 0, 1);
  _cA.set(paletteA);
  _cB.set(paletteB);
  return '#' + _cOut.copy(_cA).lerp(_cB, t).getHexString();
}

function BackgroundCloud({
  center,
  radius,
  count,
  vertical,
  color,
  rate,
  opacity,
  speed,
  texture,
  pointSize,
  rotationMul,
}) {
  const ref = useRef();

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * vertical;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, [count, radius, vertical]);

  const sizes = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = 0.42 + Math.random() * 0.58;
    }
    return arr;
  }, [count]);

  useFrame((s, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * rate * speed * rotationMul;
    ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.052) * 0.028;
  });

  return (
    <points
      ref={ref}
      position={center}
      frustumCulled={false}
      raycast={() => null}
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        size={pointSize}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
        fog
        toneMapped={false}
      />
    </points>
  );
}

export default function BackgroundFishClouds({
  density = 1.0,
  speed = 1.0,
  opacity = 0.55,
  peripheralDensity = 0.25,
}) {
  const { theme, themeId } = useTheme();
  const env = useMemo(() => mergeDistantFishEnv(theme), [theme]);
  const texture = useMemo(() => getDistantFishTexture(), []);
  const groupRef = useRef();

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.0085 * speed * env.cloudGlobalYawMul;
  });

  if (density <= 0) return null;

  const cloudDefs =
    themeId === 'salmonDaysRadio'
      ? [...VOLUMETRIC_CLOUD_DEFS, ...SALMON_EXTRA_CLOUD_DEFS]
      : VOLUMETRIC_CLOUD_DEFS;
  const n = cloudDefs.length;
  const countScale = density * env.cloudCountScale;
  const rimMul = 0.76 + 0.24 * peripheralDensity;

  return (
    <group ref={groupRef}>
      {cloudDefs.map((c, i) => {
        const count = Math.max(36, Math.round(c.baseCount * countScale));
        const depthFade = 0.92 - (i % 6) * 0.016;
        const o =
          opacity *
          env.cloudOpacityMul *
          rimMul *
          depthFade *
          (c.center[2] < -28 ? 1 : 0.94);
        const color = cloudMixColor(
          env.cloudPaletteA,
          env.cloudPaletteB,
          i,
          n,
        );
        const salmon = themeId === 'salmonDaysRadio';
        const oClamped = salmon
          ? THREE.MathUtils.clamp(o, 0.26, 0.99)
          : THREE.MathUtils.clamp(o, 0.04, 0.95);
        return (
          <BackgroundCloud
            key={`${c.center.join(',')}-${i}`}
            center={c.center}
            radius={c.radius}
            count={count}
            vertical={c.vertical}
            color={color}
            rate={c.rate}
            opacity={oClamped}
            speed={speed}
            texture={texture}
            pointSize={env.cloudPointSize}
            rotationMul={env.cloudRotationMul}
          />
        );
      })}
    </group>
  );
}
