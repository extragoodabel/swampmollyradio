import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getBubbleTexture } from './assets/bubbleTexture.js';

/**
 * Continuous ambient bubble field.
 *
 * Pooled THREE.Points draw call with three buffer attributes
 * (position, aSize, aAlpha) and a parallel JS `data[]` array of
 * per-bubble runtime state (active, age, baseSize, riseSpeed,
 * wobble*).
 *
 * Each frame:
 *   1. Advance active bubbles: rise, wobble laterally + on Z,
 *      compute fade envelope from Y-progress, recycle on top exit.
 *   2. Accumulate `spawnAccumulator += delta * spawnRate`; whenever
 *      it crosses 1, pop a free slot and spawn a new bubble near
 *      the bottom of the volume.
 *
 * Distinct from BubbleTrails (scatter-only). Both share the bubble
 * sprite. Render order doesn't matter visually -- both use
 * NormalBlending with depthWrite off.
 *
 * Performance-wise the active count is capped by `maxCount`, so
 * raising spawnRate just makes recycling tighter -- it never
 * spawns past the pool.
 */

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uPixelRatio;

  #include <fog_pars_vertex>

  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * 160.0 / max(0.5, -mvPosition.z);

    #include <fog_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;

  #include <fog_pars_fragment>

  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a < 0.02) discard;
    gl_FragColor = vec4(uColor * (0.55 + t.r * 0.55), t.a * vAlpha * uOpacity);

    #include <fog_fragment>
  }
`;

export default function AmbientBubbles({
  maxCount = 60,
  spawnRate = 1.2,
  opacity = 0.55,
  riseSpeed = 1.0,
  sizeVariation = 1.0,
  bounds = { x: 20, y: 9, z: 24 },
}) {
  const pointsRef = useRef();
  const bubbleTexture = useMemo(() => getBubbleTexture(), []);
  const dpr = useThree((s) => s.viewport.dpr);

  // Pool buffers are re-allocated whenever maxCount changes (Leva).
  // The <points> element is keyed on maxCount so the geometry is
  // re-mounted with the new arrays.
  const buffers = useMemo(() => {
    const positions = new Float32Array(maxCount * 3);
    const sizes = new Float32Array(maxCount);
    const alphas = new Float32Array(maxCount);
    const data = new Array(maxCount);
    for (let i = 0; i < maxCount; i++) {
      positions[i * 3 + 0] = 9999;
      positions[i * 3 + 1] = 9999;
      positions[i * 3 + 2] = 9999;
      sizes[i] = 0;
      alphas[i] = 0;
      data[i] = {
        active: false,
        age: 0,
        baseSize: 0,
        riseSpeed: 0,
        wobblePhase: 0,
        wobbleFreq: 0,
        wobbleAmp: 0,
      };
    }
    return { positions, sizes, alphas, data };
  }, [maxCount]);

  const spawnAccumulator = useRef(0);

  // Latest-config ref so the spawn closure never captures stale
  // Leva values when the slider moves between frames.
  const liveProps = useRef({ spawnRate, opacity, riseSpeed, sizeVariation });
  liveProps.current = { spawnRate, opacity, riseSpeed, sizeVariation };

  // See DustParticles for why fog uniforms must be merged in
  // manually -- three.js' refreshUniformsFog expects them on the
  // material, but ShaderMaterial doesn't auto-include them.
  const uniforms = useMemo(
    () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMap: { value: bubbleTexture },
      uColor: { value: new THREE.Color('#dbeef4') },
      uOpacity: { value: opacity },
      uPixelRatio: { value: dpr || 1 },
    }),
    [bubbleTexture, dpr],
  );
  uniforms.uOpacity.value = opacity;

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const p = liveProps.current;
    const { data, positions, sizes, alphas } = buffers;
    let dirty = false;

    // 1) Advance existing bubbles.
    for (let i = 0; i < maxCount; i++) {
      const b = data[i];
      if (!b.active) continue;
      const ix = i * 3;
      b.age += d;

      positions[ix + 1] += b.riseSpeed * p.riseSpeed * d;
      // Wobble on X dominant, slight Z phase-shifted wobble for
      // a non-planar drift.
      positions[ix + 0] +=
        Math.sin(b.age * b.wobbleFreq + b.wobblePhase) * b.wobbleAmp * d;
      positions[ix + 2] +=
        Math.cos(b.age * b.wobbleFreq * 0.7 + b.wobblePhase) *
        b.wobbleAmp *
        0.4 *
        d;

      // Fade envelope by Y-progress through [-bounds.y, +bounds.y].
      const yProgress = (positions[ix + 1] + bounds.y) / (bounds.y * 2);
      let alpha;
      if (yProgress < 0.1) alpha = yProgress / 0.1; // fade in
      else if (yProgress < 0.75) alpha = 1.0; // hold
      else alpha = Math.max(0, 1.0 - (yProgress - 0.75) / 0.25); // fade out
      alphas[i] = alpha * 0.75;

      // Slight shrink near the top so bubbles don't pop off square.
      sizes[i] = b.baseSize * (1.0 - Math.max(0, yProgress - 0.6) * 0.35);

      // Recycle once past the top, or as a safety after a max age
      // (handles a Leva-slowed riseSpeed that leaves bubbles
      // floating indefinitely).
      if (yProgress > 1.0 || b.age > 40) {
        b.active = false;
        positions[ix + 0] = 9999;
        positions[ix + 1] = 9999;
        positions[ix + 2] = 9999;
        sizes[i] = 0;
        alphas[i] = 0;
      }
      dirty = true;
    }

    // 2) Spawn budget: spawnRate is bubbles-per-second.
    spawnAccumulator.current += d * p.spawnRate;
    while (spawnAccumulator.current >= 1) {
      spawnAccumulator.current -= 1;
      let slot = -1;
      for (let i = 0; i < maxCount; i++) {
        if (!data[i].active) {
          slot = i;
          break;
        }
      }
      if (slot < 0) break; // pool saturated, drop remaining budget

      const ix = slot * 3;
      positions[ix + 0] = (Math.random() * 2 - 1) * bounds.x;
      // Spawn just under the floor with a tiny vertical jitter so
      // not every bubble emerges from exactly the same plane.
      positions[ix + 1] = -bounds.y + Math.random() * bounds.y * 0.15;
      positions[ix + 2] = -Math.random() * bounds.z;

      // Size variation is a multiplier on top of the random spread,
      // so 0 gives uniform tiny bubbles and 2.0 gives a wider range.
      const baseSize = 0.06 + Math.random() * 0.18 * p.sizeVariation;
      const slotData = data[slot];
      slotData.active = true;
      slotData.age = 0;
      slotData.baseSize = baseSize;
      slotData.riseSpeed = 0.35 + Math.random() * 0.45;
      slotData.wobblePhase = Math.random() * Math.PI * 2;
      slotData.wobbleFreq = 1.5 + Math.random() * 2.5;
      slotData.wobbleAmp = 0.05 + Math.random() * 0.12;

      sizes[slot] = baseSize;
      alphas[slot] = 0;
      dirty = true;
    }

    if (dirty && pointsRef.current) {
      const geom = pointsRef.current.geometry;
      geom.attributes.position.needsUpdate = true;
      geom.attributes.aSize.needsUpdate = true;
      geom.attributes.aAlpha.needsUpdate = true;
    }
  });

  if (maxCount <= 0) return null;

  return (
    <points key={maxCount} ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={maxCount}
          array={buffers.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={maxCount}
          array={buffers.sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aAlpha"
          count={maxCount}
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
        fog
      />
    </points>
  );
}
