import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * `SurfacePlane`
 *
 * The underside of the ocean surface, seen from depth.
 *
 * Implementation outline:
 *   - One large subdivided `PlaneGeometry` (80x80 units, 80x80 segments
 *     by default). Rotated so it lies flat above the viewer.
 *   - A custom `ShaderMaterial`:
 *       Vertex stage: layered low-frequency sines + cheap value noise
 *         displace the surface vertically. The amplitude is small so
 *         the silhouette is broad and calm, never choppy.
 *       Fragment stage: an analytic caustic field (three multiplied
 *         drifting sine layers, raised to a power) produces moving
 *         highlights. The highlights are blended toward a warm yellow
 *         to read as refracted sunlight. A soft radial vignette and a
 *         distance-from-camera fog blend make the plane dissolve into
 *         the scene's water medium at its rim, so the edges of the
 *         finite plane never read as edges.
 *   - The mesh follows the camera in X and Z each frame (Y is fixed
 *     to `height`), so the viewer is always near the centre of the
 *     plane. This avoids ever seeing a hard rim no matter how far the
 *     user has scrolled forward / backward.
 *
 * The shader samples caustic flow in *world* XZ coordinates rather
 * than UV, so the highlights stay locked to the world and we get a
 * convincing sense of the surface being above the world rather than
 * pinned to the camera. The mesh follows the camera, but the visual
 * texture does not.
 */

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uRipple;
  uniform float uRippleSpeed;
  uniform float uDiagonal;

  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vWave;

  // Cheap, deterministic value noise -- good enough for slow,
  // broad surface motion. Smoothstep interpolation keeps it free
  // of sharp edges.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vec3 pos = position;
    vLocal = position.xy;

    float t = uTime * uRippleSpeed;
    // Diagonal drift bias so the wave field flows.
    vec2 drift = vec2(0.6, 0.35) * uDiagonal * t;

    // Three broad, slow waves. The dominant one is the longest
    // wavelength; the third adds an organic break to the regularity.
    float w1 = sin(position.x * 0.13 + t * 0.9 + drift.x) * 1.0;
    float w2 = sin(position.y * 0.16 + t * 0.7 + drift.y) * 0.85;
    float w3 = vnoise(position.xy * 0.10 + drift * 0.6) * 1.6 - 0.8;
    float wave = (w1 + w2 + w3) * uRipple;

    // The mesh is rotated -PI/2 around X to lie flat, so local Z
    // becomes world -Y. Pushing pos.z negative sends the vertex up
    // in world space; we let the wave swing both directions so the
    // mean surface stays at the configured height uniform.
    pos.z += wave;
    vWave = wave;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uShimmer;
  uniform float uYellow;
  uniform float uFogBlend;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uFogColor;
  uniform vec3 uBaseColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uYellowColor;
  uniform vec2 uCameraXZ;
  uniform float uPlaneSize;

  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vWave;

  // Analytic "caustic" field. Three drifting sine layers multiplied
  // together produce the characteristic moving net of bright cells.
  float caustic(vec2 p, float t) {
    p += vec2(t * 0.08, -t * 0.05);
    float a = sin(p.x * 0.85 + sin(p.y * 0.6 + t * 0.4)) * 0.5 + 0.5;
    float b = sin((p.x - p.y) * 1.15 + t * 0.3) * 0.5 + 0.5;
    float c = sin(p.y * 1.4 - t * 0.25 + sin(p.x * 0.3)) * 0.5 + 0.5;
    return pow(a * b * c, 1.4);
  }

  void main() {
    // Radial vignette in the plane's local frame so the rim
    // dissolves to alpha 0 instead of showing the plane's edge.
    vec2 rUv = vLocal / (uPlaneSize * 0.5);
    float r = length(rUv);
    float vignette = smoothstep(1.0, 0.45, r);
    if (vignette <= 0.001) discard;

    // Caustic sampled in world XZ so the highlights are locked to
    // the world (the mesh follows the camera horizontally, but the
    // shimmer doesn't slide with it).
    float c = caustic(vWorld.xz, uTime);

    // A slow envelope so the surface "catches" the overhead light
    // every several seconds. Multiplicative so it never makes the
    // surface darker than baseline.
    float sunCatch = 0.85 + 0.4 * (sin(uTime * 0.12) * 0.5 + 0.5);

    vec3 base = uBaseColor;
    vec3 high = mix(uHighlightColor, uYellowColor, clamp(c * uYellow, 0.0, 1.0));
    vec3 color = mix(base, high, c * uShimmer * sunCatch);

    // Tiny darkening when the wave dips, brightening when it peaks.
    color *= 0.92 + clamp(vWave, -1.0, 1.0) * 0.08;

    // Fog blend based on horizontal distance from the camera. The
    // mesh follows the camera in X/Z, so this is effectively a
    // radial fade in plane-local space, but matched to the scene fog.
    float horizDist = length(vWorld.xz - uCameraXZ);
    float fogF = clamp(
      (horizDist - uFogNear) / max(0.0001, uFogFar - uFogNear),
      0.0, 1.0
    ) * uFogBlend;
    color = mix(color, uFogColor, fogF);

    float alpha = uOpacity * vignette * (1.0 - fogF * 0.85);
    gl_FragColor = vec4(color, alpha);
  }
`;

const PLANE_SEGMENTS = 80;

export default function SurfacePlane({
  height = 14,
  opacity = 0.55,
  rippleStrength = 0.45,
  rippleSpeed = 0.5,
  shimmerStrength = 1.0,
  yellowIntensity = 0.6,
  diagonalFlow = 1.0,
  fogBlend = 1.0,
  fogColor = '#0e3850',
  fogNear = 4,
  fogFar = 28,
  planeSize = 80,
  baseColor = '#5a90a8',
  highlightColor = '#a8d7e6',
  yellowColor = '#f6e9b4',
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  // Geometry and material are created once. Uniforms are mutated in
  // useFrame; we never rebuild the program.
  const geometry = useMemo(
    () =>
      new THREE.PlaneGeometry(planeSize, planeSize, PLANE_SEGMENTS, PLANE_SEGMENTS),
    [planeSize],
  );

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
          uOpacity: { value: opacity },
          uShimmer: { value: shimmerStrength },
          uYellow: { value: yellowIntensity },
          uRipple: { value: rippleStrength },
          uRippleSpeed: { value: rippleSpeed },
          uDiagonal: { value: diagonalFlow },
          uFogBlend: { value: fogBlend },
          uFogNear: { value: fogNear },
          uFogFar: { value: fogFar },
          uFogColor: { value: new THREE.Color(fogColor) },
          uBaseColor: { value: new THREE.Color(baseColor) },
          uHighlightColor: { value: new THREE.Color(highlightColor) },
          uYellowColor: { value: new THREE.Color(yellowColor) },
          uCameraXZ: { value: new THREE.Vector2(0, 0) },
          uPlaneSize: { value: planeSize },
        },
      }),
    // Uniforms are kept fresh in the per-frame block below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((s) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = s.clock.elapsedTime;

    // Mesh follows the camera in X/Z, anchored at `height`. This
    // keeps the surface visually infinite -- the plane's edge is
    // always pushed out radially from the viewer and then hidden by
    // the rim vignette + fog blend.
    mesh.position.x = camera.position.x;
    mesh.position.z = camera.position.z;
    mesh.position.y = height;

    const u = material.uniforms;
    u.uTime.value = t;
    u.uOpacity.value = opacity;
    u.uShimmer.value = shimmerStrength;
    u.uYellow.value = yellowIntensity;
    u.uRipple.value = rippleStrength;
    u.uRippleSpeed.value = rippleSpeed;
    u.uDiagonal.value = diagonalFlow;
    u.uFogBlend.value = fogBlend;
    u.uFogNear.value = fogNear;
    u.uFogFar.value = fogFar;
    u.uFogColor.value.set(fogColor);
    u.uBaseColor.value.set(baseColor);
    u.uHighlightColor.value.set(highlightColor);
    u.uYellowColor.value.set(yellowColor);
    u.uPlaneSize.value = planeSize;
    u.uCameraXZ.value.set(camera.position.x, camera.position.z);
  });

  return (
    <mesh
      ref={meshRef}
      // -PI/2 around X lays the plane flat with its visible face down.
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
      // Decorative -- never block clicks on the radio beacon.
      raycast={() => null}
      geometry={geometry}
      material={material}
    />
  );
}
