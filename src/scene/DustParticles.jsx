import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getDustTexture } from './assets/dustTexture.js';

/**
 * Floating dust / suspended particulate. Cheap THREE.Points with a soft
 * radial alpha sprite. Each particle drifts upward and wraps around the
 * vertical bounds. Horizontal jitter is driven by per-particle sine waves.
 */
export default function DustParticles({
  count = 350,
  bounds = { x: 18, y: 8, z: 14 },
}) {
  const pointsRef = useRef();
  const texture = useMemo(() => getDustTexture(), []);

  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * bounds.x;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * bounds.y;
      positions[i * 3 + 2] = -Math.random() * bounds.z;

      seeds[i * 3 + 0] = Math.random() * Math.PI * 2;
      seeds[i * 3 + 1] = 0.05 + Math.random() * 0.12;
      seeds[i * 3 + 2] = 0.4 + Math.random() * 0.8;
    }
    return { positions, seeds };
  }, [count, bounds.x, bounds.y, bounds.z]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const pts = pointsRef.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      arr[ix + 1] += seeds[ix + 1] * d;
      arr[ix + 0] +=
        Math.sin(performance.now() * 0.0003 * seeds[ix + 2] + seeds[ix]) * d * 0.15;

      if (arr[ix + 1] > bounds.y) {
        arr[ix + 1] = -bounds.y;
        arr[ix + 0] = (Math.random() * 2 - 1) * bounds.x;
      }
    }

    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        size={0.08}
        sizeAttenuation
        transparent
        depthWrite={false}
        opacity={0.55}
        color={'#bcd5e6'}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
