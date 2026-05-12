import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getBubbleTexture } from '../assets/bubbleTexture.js';

/**
 * Pooled bubble system for fish scatter trails.
 *
 * Architecture:
 *   - One THREE.Points draw call backed by three buffer attributes:
 *     position, aSize (per-bubble world size), aAlpha (per-bubble opacity).
 *   - A parallel JS array `data[]` holds per-bubble runtime state
 *     (active flag, age, velocity, lifetime, base size). Inactive
 *     slots have position pushed offscreen and alpha zeroed.
 *   - `scatterCtx.bubble.spawn(origin, scatterDir, intensity)` is set by
 *     this component on mount. ScatterManager calls it whenever a fish
 *     scatters; we pop free slots out of `data[]` and overwrite them.
 *
 * The shader is a minimum-viable Points shader: world-distance scaled
 * point size and a per-bubble alpha multiplier on top of the sprite's
 * own alpha. That gives us pool-friendly cheap bubbles (no instanced
 * meshes, no per-bubble materials, single draw call).
 */

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uPixelRatio;

  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // World-to-screen point size: bigger when close.
    gl_PointSize = aSize * uPixelRatio * 140.0 / max(0.5, -mv.z);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a < 0.02) discard;
    gl_FragColor = vec4(uColor * (0.6 + t.r * 0.6), t.a * vAlpha);
  }
`;

const _back = new THREE.Vector3();
const _jitter = new THREE.Vector3();
const _spawnAt = new THREE.Vector3();

export default function BubbleTrails({
  scatterCtx,
  enabled = true,
  maxBubbles = 120,
  lifetime = 2.2,
  spawnRate = 1.0,
}) {
  const pointsRef = useRef();
  const bubbleTexture = useMemo(() => getBubbleTexture(), []);
  const dpr = useThree((s) => s.viewport.dpr);

  // Buffer attribute arrays + per-bubble runtime data, re-allocated
  // whenever maxBubbles changes (Leva slider).
  const buffers = useMemo(() => {
    const positions = new Float32Array(maxBubbles * 3);
    const sizes = new Float32Array(maxBubbles);
    const alphas = new Float32Array(maxBubbles);
    const data = new Array(maxBubbles);
    for (let i = 0; i < maxBubbles; i++) {
      positions[i * 3 + 0] = 9999;
      positions[i * 3 + 1] = 9999;
      positions[i * 3 + 2] = 9999;
      sizes[i] = 0;
      alphas[i] = 0;
      data[i] = {
        active: false,
        age: 0,
        lifetime: lifetime,
        baseSize: 0,
        velocity: new THREE.Vector3(),
        wobblePhase: 0,
      };
    }
    return { positions, sizes, alphas, data };
  }, [maxBubbles, lifetime]);

  // Latest-config ref so the spawn closure doesn't capture stale Leva.
  const liveProps = useRef({ enabled, lifetime, spawnRate });
  liveProps.current = { enabled, lifetime, spawnRate };

  useEffect(() => {
    if (!scatterCtx) return undefined;

    scatterCtx.bubble.spawn = (origin, scatterDir, intensity = 1) => {
      const p = liveProps.current;
      if (!p.enabled || maxBubbles <= 0) return;

      const { data, positions, sizes, alphas } = buffers;
      _back.copy(scatterDir).negate();

      // Count of bubbles scales with intensity * Leva rate.
      const baseCount = 3 + Math.floor(Math.random() * 3); // 3-5
      const want = Math.max(
        1,
        Math.round(baseCount * p.spawnRate * (0.7 + intensity * 0.5)),
      );

      let spawned = 0;
      for (let i = 0; i < maxBubbles && spawned < want; i++) {
        if (data[i].active) continue;

        _jitter.set(
          (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.35,
        );
        _spawnAt
          .copy(origin)
          .addScaledVector(_back, 0.15 + Math.random() * 0.35)
          .add(_jitter);

        data[i].active = true;
        data[i].age = 0;
        data[i].lifetime = p.lifetime * (0.7 + Math.random() * 0.6);
        data[i].baseSize = 0.16 + Math.random() * 0.16;
        data[i].wobblePhase = Math.random() * Math.PI * 2;

        // Velocity: short backward kick, dominant upward buoyancy.
        data[i].velocity.set(
          _back.x * 0.3 + (Math.random() - 0.5) * 0.25,
          0.32 + Math.random() * 0.35,
          _back.z * 0.3 + (Math.random() - 0.5) * 0.25,
        );

        positions[i * 3 + 0] = _spawnAt.x;
        positions[i * 3 + 1] = _spawnAt.y;
        positions[i * 3 + 2] = _spawnAt.z;
        sizes[i] = data[i].baseSize;
        alphas[i] = 0.0; // fades in over first ~10% of lifetime
        spawned++;
      }

      const geom = pointsRef.current?.geometry;
      if (geom) {
        geom.attributes.position.needsUpdate = true;
        geom.attributes.aSize.needsUpdate = true;
        geom.attributes.aAlpha.needsUpdate = true;
      }
    };

    return () => {
      if (scatterCtx?.bubble) scatterCtx.bubble.spawn = null;
    };
  }, [scatterCtx, buffers, maxBubbles]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const { data, positions, sizes, alphas } = buffers;
    let dirty = false;

    for (let i = 0; i < maxBubbles; i++) {
      const b = data[i];
      if (!b.active) continue;
      b.age += d;
      const u = b.age / b.lifetime;

      if (u >= 1) {
        b.active = false;
        positions[i * 3 + 0] = 9999;
        positions[i * 3 + 1] = 9999;
        positions[i * 3 + 2] = 9999;
        sizes[i] = 0;
        alphas[i] = 0;
        dirty = true;
        continue;
      }

      // Drag: bubbles slow laterally, buoyancy slowly accelerates upward
      // then plateaus.
      b.velocity.x *= 0.965;
      b.velocity.z *= 0.965;
      const targetUp = 0.55 + b.baseSize * 1.2;
      b.velocity.y += (targetUp - b.velocity.y) * 0.06;

      // Tiny sinusoidal sway -- "real" bubbles wobble.
      const wobble = Math.sin(b.age * 6 + b.wobblePhase) * 0.04 * d * 60;

      positions[i * 3 + 0] += b.velocity.x * d + wobble * 0.02;
      positions[i * 3 + 1] += b.velocity.y * d;
      positions[i * 3 + 2] += b.velocity.z * d;

      // Fade in (0-15%) then fade out (50-100%).
      let alpha;
      if (u < 0.15) alpha = u / 0.15;
      else if (u < 0.5) alpha = 1.0;
      else alpha = 1.0 - (u - 0.5) / 0.5;
      alphas[i] = alpha * 0.75;

      // Bubbles shrink a little near end of life.
      sizes[i] = b.baseSize * (1.0 - u * 0.35);

      dirty = true;
    }

    if (dirty && pointsRef.current) {
      const geom = pointsRef.current.geometry;
      geom.attributes.position.needsUpdate = true;
      geom.attributes.aSize.needsUpdate = true;
      geom.attributes.aAlpha.needsUpdate = true;
    }
  });

  const uniforms = useMemo(
    () => ({
      uMap: { value: bubbleTexture },
      uColor: { value: new THREE.Color('#dbeef4') },
      uPixelRatio: { value: dpr || 1 },
    }),
    [bubbleTexture, dpr],
  );

  // When maxBubbles changes the parent re-creates `buffers`. React
  // doesn't reseat the bufferAttribute array on its own, so we key the
  // <points> on maxBubbles to force a re-mount of the geometry.
  if (maxBubbles <= 0) return null;

  return (
    <points key={maxBubbles} ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={maxBubbles}
          array={buffers.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={maxBubbles}
          array={buffers.sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aAlpha"
          count={maxBubbles}
          array={buffers.alphas}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
