import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * `KelpForest`
 *
 * Sparse, slow-swaying kelp threads anchored to the seabed.
 *
 * Implementation outline:
 *   - One `InstancedMesh` of N ribbon strands. The base geometry is
 *     a single thin vertical `PlaneGeometry` subdivided heavily on
 *     the Y axis (64 segments) so a vertex shader can curl it into
 *     a smooth spiralling/swaying form.
 *   - Per-instance attributes (`aPhase`, `aSwayAmp`, `aSpiralRate`,
 *     `aThickness`, `aColor`) live as `InstancedBufferAttribute`s on
 *     the geometry. The vertex shader uses them to rotate `position.x`
 *     around the strand's local Y axis (spiral), then displace the
 *     ribbon laterally with a sine envelope weighted toward the top
 *     (sway, anchored at the base).
 *   - Per-instance transforms (world position, height-scale, yaw)
 *     ride on `instanceMatrix`. We deliberately do NOT scale X via
 *     the matrix: the shader handles ribbon thickness through
 *     `aThickness` so sway amplitudes stay denominated in world
 *     units regardless of how thin each strand is.
 *   - Strands are distributed in a radial ring around the world
 *     origin. The inner radius is held open so the camera area
 *     stays clear; `distanceBias` pushes the rest of the population
 *     outward to give the "thicker in the distance" silhouette.
 *
 * Performance: with default settings (90 strands x 130 verts =
 * ~11.7k vertices in a single draw call) this is comfortably under
 * the cost of any of the other shader passes already in the scene.
 *
 * Integration:
 *   - Roots are placed at the configured `seabedY` so strands grow
 *     from the floor up toward the fish layer. Tall strands can
 *     reach the fish; most stay below.
 *   - Fog/colour blending matches the scene fog uniforms so distant
 *     kelp dissolves naturally into the water medium.
 */

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSwayStrength;
  uniform float uSwaySpeed;
  uniform float uVerticalDream;
  uniform float uDreamVSpeed;

  attribute float aPhase;
  attribute float aSwayAmp;
  attribute float aSpiralRate;
  attribute float aThickness;
  attribute vec3 aColor;

  varying float vU;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vEdge;

  void main() {
    vec3 p = position;
    // Base geometry is centred: y in [-0.5, 0.5]. Normalise to 0..1
    // so 0 is the anchored base, 1 is the free tip.
    float u = p.y + 0.5;
    vU = u;
    // Keep the x sign so the fragment shader can softly fade the
    // ribbon edges (silhouette antialias without alphaTest).
    vEdge = p.x * 2.0; // -1..+1 across the ribbon's width

    // Spiral the ribbon: rotate the local X coord around the local
    // Y axis by an angle that increases with height. The result is
    // a screw-shaped ribbon that, even when viewed flat-on, presents
    // continually changing widths -- gives the "twisting thread"
    // silhouette without needing crossed geometry.
    float spiral = aSpiralRate * u + aPhase * 0.5;
    float sx = sin(spiral);
    float cx = cos(spiral);
    vec3 rotated = vec3(p.x * aThickness * cx, p.y, p.x * aThickness * sx);

    // Sway. Stronger near the top, anchored at u = 0. The exponent
    // > 1 keeps the lower portion of the strand visually rooted.
    float sw = uTime * uSwaySpeed + aPhase;
    float weight = pow(u, 1.7);
    rotated.x += sin(sw)                  * aSwayAmp * uSwayStrength * weight;
    rotated.z += cos(sw * 0.9 + aPhase)   * aSwayAmp * uSwayStrength * weight * 0.7;
    // A tiny secondary high-frequency wiggle adds organic motion
    // without making the strand look like it's twitching.
    rotated.x += sin(sw * 2.2 + u * 6.0)  * aSwayAmp * uSwayStrength * 0.12 * weight;

    float vDrift = uVerticalDream * pow(u, 1.25);
    rotated.y += sin(uTime * uDreamVSpeed + aPhase * 1.7) * vDrift;
    rotated.y += sin(uTime * uDreamVSpeed * 0.63 + u * 3.1) * vDrift * 0.35;

    vec4 world = modelMatrix * instanceMatrix * vec4(rotated, 1.0);
    vWorld = world.xyz;
    vColor = aColor;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uFogColor;
  uniform float uAbyssBlend;

  varying float vU;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vEdge;

  void main() {
    // Vertical gradient: darker at the rooted base, brighter at the
    // tip (where any overhead light would hit).
    vec3 base = vColor * 0.45;
    vec3 tip  = vColor * 1.20;
    vec3 c = mix(base, tip, smoothstep(0.0, 1.0, vU));

    // Soft fades at the very root and the very tip so neither end
    // looks chopped off.
    float endFade = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.85, vU);

    // Open-ocean giant kelp: roots dissolve into abyss (no visible endpoint).
    if (uAbyssBlend > 0.01) {
      float rootVeil = smoothstep(0.0, 0.38, vU);
      vec3 deepCol = uFogColor * 0.06;
      c = mix(deepCol, c, rootVeil);
      float rootAlpha = smoothstep(0.0, 0.22, vU);
      endFade *= mix(1.0, rootAlpha, uAbyssBlend);
    }

    // Lateral edge softening: the ribbon's outer edges feather out
    // so we don't see a hard line where the plane ends. This stands
    // in for proper geometric thickness.
    float widthFade = 1.0 - smoothstep(0.55, 1.0, abs(vEdge));

    // Camera-distance fog blend, matched to the scene fog uniforms
    // so distant strands dissolve into the same medium as the rest
    // of the world.
    float dist = length(vWorld - cameraPosition);
    float fogF = clamp((dist - uFogNear) / max(0.0001, uFogFar - uFogNear), 0.0, 1.0);
    c = mix(c, uFogColor, fogF);

    float alpha = uOpacity * endFade * widthFade * (1.0 - fogF * 0.85);
    if (alpha < 0.005) discard;

    gl_FragColor = vec4(c, alpha);
  }
`;

const MAX_KELP = 420;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function KelpForest({
  count = 90,
  distanceBias = 1.0,
  swayStrength = 1.0,
  swaySpeed = 1.0,
  opacity = 0.55,
  seabedY = -12,
  // Inner ring radius held clear of strands, so the camera position
  // stays open and the user can navigate without kelp blocking view.
  innerRadius = 4,
  // Outer radius the kelp population spreads to. Slightly inside the
  // fog-far horizon so distant strands fade rather than vanish.
  outerRadius = 22,
  fogColor = '#0e3850',
  fogNear = 4,
  fogFar = 28,
  // Fraction of strands as broad moss clumps; remainder splits between
  // trailing hangers and ribbon kelp via `trailerRatio`.
  mossRatio = 0,
  /** Fraction of (non-moss) strands as heavy trailing / hanging growth (Swamp). */
  trailerRatio = 0,
  /** Theme multipliers — Swamp Molly bumps moss/ribbon scale; Salmon stays 1. */
  mossHeightMul = 1,
  mossThicknessMul = 1,
  ribbonHeightMul = 1,
  ribbonThicknessMul = 1,
  /** Salmon Days: giant kelp column / abyss dissolve (does not affect Swamp). */
  visualMode = 'default',
  abyssBlend = 0,
  /** Subtle vertical “current” shimmer in `visualMode === 'openOcean'`. */
  verticalDream = 0.12,
  dreamVerticalSpeed = 0.18,
  seed = 2024,
}) {
  const meshRef = useRef();

  const safeCount = Math.min(MAX_KELP, Math.max(0, Math.floor(count)));

  // Base ribbon geometry. 1 unit tall, 1 unit wide (X/+-0.5);
  // the instance matrix and per-instance `aThickness` shape each
  // strand from there. 64 Y-segments is plenty for a smooth spiral.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 64);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uSwayStrength: { value: swayStrength },
          uSwaySpeed: { value: swaySpeed },
          uVerticalDream: { value: 0 },
          uDreamVSpeed: { value: 0.22 },
          uOpacity: { value: opacity },
          uFogColor: { value: new THREE.Color(fogColor) },
          uFogNear: { value: fogNear },
          uFogFar: { value: fogFar },
          uAbyssBlend: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Build the per-instance dataset once per (count, distanceBias,
  // seabedY, radii, seed). All of these are slow human-driven
  // controls, so rebuilding the buffers when they change is fine.
  const instanceData = useMemo(() => {
    if (safeCount === 0) return null;
    const rand = mulberry32(seed);

    const matrices = new Float32Array(safeCount * 16);
    const phases = new Float32Array(safeCount);
    const swayAmps = new Float32Array(safeCount);
    const spiralRates = new Float32Array(safeCount);
    const thicknesses = new Float32Array(safeCount);
    const colors = new Float32Array(safeCount * 3);

    const tmp = new THREE.Object3D();

    const minR = Math.max(0.5, innerRadius);
    const maxR = Math.max(minR + 1, outerRadius);

    for (let i = 0; i < safeCount; i++) {
      // Biased radial distribution. With `distanceBias = 0` strands
      // are uniform in the annulus (each unit of area equally likely
      // to host a strand). Larger bias pushes the population toward
      // the outer rim, leaving the foreground sparse.
      const u = Math.pow(rand(), 1 / (1 + distanceBias));
      const r = Math.sqrt(u * (maxR * maxR - minR * minR) + minR * minR);
      const angle = rand() * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const kindRoll = rand();
      const tr = Math.min(
        Math.max(0, trailerRatio),
        Math.max(0, 1 - mossRatio),
      );
      const isMoss = kindRoll < mossRatio;
      const isTrailer =
        !isMoss && kindRoll < mossRatio + tr;

      let height;
      let thickness;
      let swayBase;
      let spiralRate;
      let r0;
      let g0;
      let b0;
      let lightness;

      if (isMoss) {
        // Moss: broad clumps rooted in the seabed — scaled by theme on swamp.
        height = (2.2 + rand() * 5.2) * mossHeightMul;
        thickness =
          (0.62 + Math.pow(rand(), 1.35) * 1.22) * mossThicknessMul;
        swayBase = 0.16 + rand() * 0.28;
        spiralRate = (rand() * 2 - 1) * 0.55;
        const olive = rand();
        lightness = 0.44 + rand() * 0.26;
        r0 = 0.18 + olive * 0.22;
        g0 = 0.34 + (1 - olive) * 0.16;
        b0 = 0.14 + olive * 0.08;
      } else if (isTrailer) {
        // Trailing / hanging swamp masses — taller, thicker ribbons, lazy spiral.
        height = (5.5 + rand() * 14.5) * ribbonHeightMul;
        thickness =
          (0.24 + Math.pow(rand(), 1.05) * 0.52) * ribbonThicknessMul;
        swayBase = 0.3 + rand() * 0.58;
        spiralRate =
          (rand() * 2 - 1) * (1.4 + Math.pow(rand(), 2) * 2.8);
        const olive = rand();
        lightness = 0.48 + rand() * 0.3;
        r0 = 0.13 + olive * 0.18;
        g0 = 0.36 + (1 - olive) * 0.14;
        b0 = 0.16 + olive * 0.12;
      } else {
        // Standard kelp ribbons — longer columns in open ocean (sparse rim).
        if (visualMode === 'openOcean') {
          height = (30 + rand() * 98) * ribbonHeightMul;
          thickness =
            (0.09 + Math.pow(rand(), 1.4) * 0.22) * ribbonThicknessMul;
          swayBase = (0.38 + rand() * 0.62) * 0.78;
          const sBase = rand() * 2 - 1;
          spiralRate = Math.sign(sBase) * Math.pow(Math.abs(sBase), 3) * 3.6;
          const cool = rand();
          lightness = 0.42 + rand() * 0.32;
          r0 = 0.1 + (1 - cool) * 0.1;
          g0 = 0.36 + cool * 0.14 + lightness * 0.12;
          b0 = 0.26 + cool * 0.28;
        } else {
          height = (4.2 + rand() * 12.5) * ribbonHeightMul;
          thickness =
            (0.11 + Math.pow(rand(), 1.35) * 0.32) * ribbonThicknessMul;
          swayBase = 0.48 + rand() * 0.95;
          const sBase = rand() * 2 - 1;
          spiralRate = Math.sign(sBase) * Math.pow(Math.abs(sBase), 3) * 4.8;
          const cool = rand();
          lightness = 0.54 + rand() * 0.34;
          r0 = 0.12 + (1 - cool) * 0.14;
          g0 = 0.40 + cool * 0.08 + lightness * 0.15;
          b0 = 0.22 + cool * 0.30;
        }
      }

      const rootJitterY =
        visualMode === 'openOcean' ? (rand() - 0.5) * 9.0 : 0;
      tmp.position.set(x, seabedY + height * 0.5 + rootJitterY, z);
      // Random yaw so each strand faces a different direction --
      // when paired with the random sway phase, this prevents the
      // ribbons from all looking like they're flexing along the
      // same world axis.
      tmp.rotation.set(0, rand() * Math.PI * 2, 0);
      // Only Y is scaled; X/Z stay at 1 so sway amplitudes in the
      // shader are in real world units, not multiplied by the
      // ribbon's narrowness.
      tmp.scale.set(1, height, 1);
      tmp.updateMatrix();
      tmp.matrix.toArray(matrices, i * 16);

      phases[i] = rand() * Math.PI * 2;
      // Taller strands carry a bit more sway amplitude -- gives a
      // sense that mass and length matter, even though there's no
      // physics here. Moss uses its own (lower) base sway so its
      // chunky clumps don't whip around.
      swayAmps[i] = swayBase * (0.55 + height / 14);
      spiralRates[i] = spiralRate;
      thicknesses[i] = thickness;

      colors[i * 3 + 0] = Math.min(1, r0 * lightness);
      colors[i * 3 + 1] = Math.min(1, g0 * lightness * 1.05);
      colors[i * 3 + 2] = Math.min(1, b0 * lightness);
    }

    return { matrices, phases, swayAmps, spiralRates, thicknesses, colors };
  }, [
    safeCount,
    distanceBias,
    seabedY,
    innerRadius,
    outerRadius,
    seed,
    mossRatio,
    trailerRatio,
    mossHeightMul,
    mossThicknessMul,
    ribbonHeightMul,
    ribbonThicknessMul,
    visualMode,
  ]);

  // Push the instance buffers onto the geometry / mesh once the
  // mesh has mounted. Rebuilds whenever the dataset rebuilds.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !instanceData) return;

    mesh.count = safeCount;
    mesh.instanceMatrix.array.set(instanceData.matrices);
    mesh.instanceMatrix.needsUpdate = true;

    const g = mesh.geometry;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(instanceData.phases, 1));
    g.setAttribute(
      'aSwayAmp',
      new THREE.InstancedBufferAttribute(instanceData.swayAmps, 1),
    );
    g.setAttribute(
      'aSpiralRate',
      new THREE.InstancedBufferAttribute(instanceData.spiralRates, 1),
    );
    g.setAttribute(
      'aThickness',
      new THREE.InstancedBufferAttribute(instanceData.thicknesses, 1),
    );
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(instanceData.colors, 3));
  }, [instanceData, safeCount]);

  useFrame((s) => {
    const u = material.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uSwayStrength.value = swayStrength;
    u.uSwaySpeed.value = swaySpeed;
    u.uVerticalDream.value = visualMode === 'openOcean' ? verticalDream : 0;
    u.uDreamVSpeed.value = dreamVerticalSpeed;
    u.uOpacity.value = opacity;
    u.uFogColor.value.set(fogColor);
    u.uFogNear.value = fogNear;
    u.uFogFar.value = fogFar;
    u.uAbyssBlend.value = abyssBlend;
  });

  if (safeCount === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      // Mesh capacity matches the active strand count exactly. R3F
      // will rebuild the InstancedMesh whenever `args` changes, so
      // bumping the density slider causes a clean reallocation; the
      // attribute buffers built in the useMemo above are sized to
      // match. Strand layout is deterministic per seed, so the
      // rebuild is visually stable.
      args={[geometry, material, safeCount]}
      raycast={() => null}
      frustumCulled={false}
    />
  );
}
