import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getDistantFishTexture } from './assets/distantFishTexture.js';

/**
 * Distant fish-cloud layers.
 *
 * Each cloud is a single `THREE.Points` draw call with hundreds or
 * thousands of tiny salmon-silhouette sprites distributed inside an
 * ellipsoid. Their job is to fill the *far* depth with the suggestion
 * of huge living masses without paying for real fish geometry.
 *
 * - Clouds are positioned in fixed world space, spread horizontally,
 *   vertically (above and below camera y=0), and at varied z-depths.
 * - Each cloud rotates slowly around its own y-axis at slightly
 *   different rates, so they don't drift in lockstep.
 * - A small global yaw on the whole `<group>` adds a shared current
 *   bias so the field as a whole flows.
 * - Each cloud has its own color biased toward the fog hue, so its
 *   edge naturally dissolves into the scene's water medium. Scene
 *   `THREE.Fog` is also applied (via `fog: true` on the material).
 *
 * Cloud configuration is just a static table; it's deliberately easy
 * to tune by hand. `density`, `speed`, and `opacity` are global
 * multipliers exposed to Leva.
 */

const CLOUD_DEFS = [
  // Big bait ball, right and slightly up, mid distance.
  {
    center: [12, 2.5, -22],
    radius: 9,
    baseCount: 1200,
    vertical: 0.65,
    color: '#5a89a0',
    rate: 0.05,
  },
  // Long swarm streaming below the viewer.
  {
    center: [-14, -3.5, -24],
    radius: 11,
    baseCount: 1600,
    vertical: 0.55,
    color: '#3d6c87',
    rate: 0.04,
  },
  // High-up overhead drift.
  {
    center: [3, 8.5, -27],
    radius: 8,
    baseCount: 900,
    vertical: 0.5,
    color: '#65a0b8',
    rate: 0.07,
  },
  // Deep / behind, very faint mass.
  {
    center: [-5, -7.5, -30],
    radius: 10,
    baseCount: 1400,
    vertical: 0.6,
    color: '#3a6480',
    rate: 0.045,
  },
  // The far back-wall bait ball: largest cloud, dissolves into fog.
  {
    center: [0, 0.5, -40],
    radius: 16,
    baseCount: 2400,
    vertical: 0.75,
    color: '#2c5670',
    rate: 0.025,
  },
  // Mirror behind the viewer so turning around still feels full.
  {
    center: [4, 1.0, 14],
    radius: 11,
    baseCount: 1100,
    vertical: 0.6,
    color: '#406c84',
    rate: 0.035,
  },
];

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
}) {
  const ref = useRef();

  // Uniform-in-volume ellipsoid distribution.
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Cube-root keeps points roughly uniform in volume rather than
      // bunching at the centre.
      const r = radius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * vertical;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, [count, radius, vertical]);

  // Per-point size jitter so the swarm isn't a perfect uniform grid
  // of dots.
  const sizes = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = 0.6 + Math.random() * 0.9;
    }
    return arr;
  }, [count]);

  useFrame((s, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * rate * speed;
    // Very slow tilt so the swarm "breathes".
    ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.07) * 0.04;
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
        size={0.22}
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
}) {
  const texture = useMemo(() => getDistantFishTexture(), []);
  const groupRef = useRef();

  useFrame((s, dt) => {
    if (!groupRef.current) return;
    // Global low-frequency yaw so the whole sphere of clouds drifts
    // imperceptibly. Tied to `speed` so Leva can speed it up for
    // dramatic effect or stop it entirely.
    groupRef.current.rotation.y += dt * 0.012 * speed;
  });

  if (density <= 0) return null;

  return (
    <group ref={groupRef}>
      {CLOUD_DEFS.map((c, i) => {
        const count = Math.max(40, Math.round(c.baseCount * density));
        // Distant clouds get a slightly faded opacity; the global
        // fog handles the colour blend, this just keeps the deepest
        // mass from ever popping forward.
        const o = opacity * (1 - i * 0.04);
        return (
          <BackgroundCloud
            key={i}
            center={c.center}
            radius={c.radius}
            count={count}
            vertical={c.vertical}
            color={c.color}
            rate={c.rate}
            opacity={Math.max(0.05, o)}
            speed={speed}
            texture={texture}
          />
        );
      })}
    </group>
  );
}
