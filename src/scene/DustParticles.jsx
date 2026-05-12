import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getDustTexture } from './assets/dustTexture.js';

/**
 * Floating dust / suspended particulate, drawn as a single
 * THREE.Points draw call with a custom ShaderMaterial that supports
 * per-particle size, base alpha, shimmer phase + amplitude, and
 * drift speed.
 *
 * Depth stratification:
 *   - foreground band (~20%): larger, closer, faint shimmer
 *   - midwater band   (~55%): medium, mid-depth, stronger shimmer
 *   - distant band    (~25%): smallest, far back, low opacity
 *
 * Shimmer is a per-particle sine pulse on alpha so individual
 * specks "catch the light" without the whole field strobing in
 * sync. The shader does its own fog attenuation so additive
 * particles fade to nothing at distance instead of additively
 * adding the fog color, which would look wrong.
 *
 * Particles drift upward and wobble laterally; when one crosses
 * the top of the bounds it respawns at the bottom *inside the same
 * Z-band* so the depth strata stay coherent over time.
 */

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aBaseAlpha;
  attribute float aShimmerPhase;
  attribute float aShimmerAmp;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uShimmerStrength;
  uniform float uPixelRatio;

  varying float vAlpha;

  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Per-particle shimmer envelope: a slow sine on alpha that's
    // driven by uTime so different particles peak at different
    // moments. Clamped to [0,1] so heavy shimmer doesn't push the
    // base alpha past full opacity.
    float shimmer = sin(uTime * 1.4 + aShimmerPhase) * aShimmerAmp * uShimmerStrength;
    vAlpha = clamp(aBaseAlpha * (1.0 + shimmer), 0.0, 1.0) * uOpacity;

    // World-to-screen point size, scaled by viewer distance so
    // close-band particles read as physically larger.
    gl_PointSize = aSize * uPixelRatio * 220.0 / max(0.5, -mvPosition.z);

    #include <fog_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;

  #include <fog_pars_fragment>

  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a < 0.02) discard;

    // For additive particles, fog should *attenuate* the contribution
    // (distant glow disappears) rather than mix toward fogColor (which
    // would add a teal cast on top of the existing dest pixels).
    float fogAttenuation = 1.0;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      fogAttenuation = 1.0 - fogFactor;
    #endif

    gl_FragColor = vec4(uColor, t.a * vAlpha * fogAttenuation);
  }
`;

// Depth bands. Each entry produces a slice of the total count with
// its own size, alpha, shimmer-amp and drift-speed ranges.
//
// fraction sums to ~1.0; rounding leftovers go into the last band.
function defineBands(bounds) {
  return [
    {
      name: 'foreground',
      fraction: 0.20,
      zRange: [-bounds.z * 0.15, bounds.z * 0.40],
      sizeRange: [0.07, 0.13],
      alphaRange: [0.40, 0.70],
      shimmerAmpRange: [0.12, 0.40],
      speedRange: [0.07, 0.14],
      jitterAmpRange: [0.10, 0.22],
    },
    {
      name: 'midwater',
      fraction: 0.55,
      zRange: [-bounds.z * 0.65, -bounds.z * 0.15],
      sizeRange: [0.035, 0.075],
      alphaRange: [0.32, 0.55],
      shimmerAmpRange: [0.20, 0.55],
      speedRange: [0.05, 0.10],
      jitterAmpRange: [0.06, 0.16],
    },
    {
      name: 'distant',
      fraction: 0.25,
      zRange: [-bounds.z, -bounds.z * 0.65],
      sizeRange: [0.018, 0.04],
      alphaRange: [0.14, 0.30],
      shimmerAmpRange: [0.10, 0.32],
      speedRange: [0.025, 0.06],
      jitterAmpRange: [0.04, 0.10],
    },
  ];
}

function randInRange([a, b]) {
  return a + Math.random() * (b - a);
}

export default function DustParticles({
  count = 700,
  bounds = { x: 20, y: 9, z: 24 },
  opacity = 0.65,
  shimmerStrength = 1.0,
  color = '#bcd5e6',
}) {
  const pointsRef = useRef();
  const matRef = useRef();
  const texture = useMemo(() => getDustTexture(), []);
  const dpr = useThree((s) => s.viewport.dpr);

  // Allocate buffer attribute arrays + per-particle CPU metadata.
  // `zBandRanges[i]` keeps the band each particle belongs to so
  // recycling respects the depth strata.
  const {
    positions,
    sizes,
    baseAlphas,
    shimmerPhases,
    shimmerAmps,
    driftSpeeds,
    jitterFreqs,
    jitterAmps,
    zBandRanges,
  } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const baseAlphas = new Float32Array(count);
    const shimmerPhases = new Float32Array(count);
    const shimmerAmps = new Float32Array(count);
    const driftSpeeds = new Float32Array(count);
    const jitterFreqs = new Float32Array(count);
    const jitterAmps = new Float32Array(count);
    const zBandRanges = new Array(count);

    const bands = defineBands(bounds);

    const fill = (i, band) => {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * bounds.x;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * bounds.y;
      positions[i * 3 + 2] = randInRange(band.zRange);
      sizes[i] = randInRange(band.sizeRange);
      baseAlphas[i] = randInRange(band.alphaRange);
      shimmerPhases[i] = Math.random() * Math.PI * 2;
      shimmerAmps[i] = randInRange(band.shimmerAmpRange);
      driftSpeeds[i] = randInRange(band.speedRange);
      jitterFreqs[i] = 0.4 + Math.random() * 0.8;
      jitterAmps[i] = randInRange(band.jitterAmpRange);
      zBandRanges[i] = band.zRange;
    };

    let i = 0;
    bands.forEach((band) => {
      const limit = Math.min(count, i + Math.round(count * band.fraction));
      for (; i < limit; i++) fill(i, band);
    });
    // Rounding leftovers fall into the last (distant) band.
    while (i < count) {
      fill(i, bands[bands.length - 1]);
      i++;
    }

    return {
      positions,
      sizes,
      baseAlphas,
      shimmerPhases,
      shimmerAmps,
      driftSpeeds,
      jitterFreqs,
      jitterAmps,
      zBandRanges,
    };
  }, [count, bounds.x, bounds.y, bounds.z]);

  // Uniforms are created once and mutated in place; opacity +
  // shimmerStrength are pushed every render so the Leva sliders
  // respond without thrashing the material.
  //
  // `UniformsLib.fog` is spread in (cloned, so each material has
  // its own uniform refs) because three.js' WebGLRenderer assumes
  // `material.uniforms.fogColor/fogNear/fogFar` exist when
  // `material.fog === true` and scene.fog is non-null. Built-in
  // materials get these for free; ShaderMaterial does not.
  const uniforms = useMemo(
    () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uShimmerStrength: { value: shimmerStrength },
      uPixelRatio: { value: dpr || 1 },
    }),
    [texture, color, dpr],
  );
  uniforms.uOpacity.value = opacity;
  uniforms.uShimmerStrength.value = shimmerStrength;

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const pts = pointsRef.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array;
    const now = performance.now() * 0.0003;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      arr[ix + 1] += driftSpeeds[i] * d;
      arr[ix + 0] +=
        Math.sin(now * jitterFreqs[i] + shimmerPhases[i]) *
        d *
        jitterAmps[i];

      if (arr[ix + 1] > bounds.y) {
        arr[ix + 1] = -bounds.y;
        arr[ix + 0] = (Math.random() * 2 - 1) * bounds.x;
        const band = zBandRanges[i];
        arr[ix + 2] = band[0] + Math.random() * (band[1] - band[0]);
      }
    }

    pts.geometry.attributes.position.needsUpdate = true;
    if (matRef.current) matRef.current.uniforms.uTime.value += d;
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
        <bufferAttribute
          attach="attributes-aSize"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aBaseAlpha"
          count={count}
          array={baseAlphas}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aShimmerPhase"
          count={count}
          array={shimmerPhases}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aShimmerAmp"
          count={count}
          array={shimmerAmps}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        fog
      />
    </points>
  );
}
