import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * `Seabed`
 *
 * The sandy floor of the aquarium, viewed from above. Mirrors
 * `SurfacePlane` but inverted: the visible face points up, the
 * displacement is gentler (broad sand dunes, not wave crests),
 * and the colour palette runs white / cream / gold instead of
 * aqua / sun.
 *
 * Implementation notes:
 *   - Big subdivided `PlaneGeometry` (96x96 units, 96x96 segments)
 *     rotated +PI/2 around X so the up-facing side is visible from
 *     the viewer's vantage in the middle of the water column.
 *   - Custom `ShaderMaterial` with two passes:
 *       Vertex: a stack of slow sines + cheap value noise gives
 *         broad dunes and ripple bands. Amplitude is intentionally
 *         small -- the seabed should *suggest* relief, never look
 *         like mountainous terrain.
 *       Fragment: a "sand caustic" field (three drifting sines
 *         multiplied together, similar to SurfacePlane but
 *         softened) shimmers warm gold across the surface. A
 *         radial vignette dissolves the plane's rim into the fog,
 *         and a horizontal-distance fog blend matches the scene's
 *         atmospheric depth.
 *   - The mesh follows the camera in X/Z (Y is fixed at -depth) so
 *     the viewer is always above the same patch of seabed. Caustic
 *     and dune samples are taken from world XZ so the texture stays
 *     locked to the world, not pinned to the camera.
 */

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uRipple;
  uniform float uRippleSpeed;

  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vWave;

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

    // Broad ripples. Frequencies deliberately lower than the surface
    // plane's so the dunes feel large and slow rather than choppy.
    float w1 = sin(position.x * 0.10 + t * 0.35) * 0.55;
    float w2 = sin(position.y * 0.13 - t * 0.28) * 0.40;
    // Long-wavelength noise picks up the breaks between ripple lines.
    float w3 = (vnoise(position.xy * 0.07 + vec2(t * 0.05, -t * 0.04)) * 2.0 - 1.0) * 0.70;

    float wave = (w1 + w2 + w3) * uRipple;
    // The plane is rotated +PI/2 around X so it faces up; local +Z
    // becomes world +Y. Adding to pos.z pushes the dune up in world.
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
  uniform float uGold;
  uniform float uFogBlend;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uFogColor;
  uniform vec3 uSandColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uGoldColor;
  uniform vec2 uCameraXZ;
  uniform float uPlaneSize;

  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vWave;

  // Soft caustic shimmer for the sand. Same building blocks as the
  // surface plane's, but with a softer power curve so we never get
  // sharp bright net cells -- just a gentle drifting brightness.
  float caustic(vec2 p, float t) {
    p += vec2(t * 0.05, -t * 0.03);
    float a = sin(p.x * 0.55 + sin(p.y * 0.4 + t * 0.3)) * 0.5 + 0.5;
    float b = sin((p.x + p.y) * 0.75 + t * 0.2) * 0.5 + 0.5;
    float c = sin(p.y * 0.95 - t * 0.18) * 0.5 + 0.5;
    return pow(a * b * c, 0.9);
  }

  void main() {
    vec2 rUv = vLocal / (uPlaneSize * 0.5);
    float r = length(rUv);
    float vignette = smoothstep(1.0, 0.5, r);
    if (vignette <= 0.001) discard;

    float c = caustic(vWorld.xz, uTime);

    // The base sand colour is a warm cream. The "highlight" colour
    // is a brighter white-ivory, which lifts the dune crests; the
    // gold colour is mixed into the brightest caustic peaks for
    // refracted-sun warmth.
    vec3 base = uSandColor;
    vec3 high = mix(uHighlightColor, uGoldColor, clamp(c * uGold, 0.0, 1.0));
    vec3 color = mix(base, high, c * 0.8);

    // Dune crests get a touch lighter, valleys a touch darker.
    color *= 0.85 + clamp(vWave, -1.5, 1.5) * 0.10;

    // Camera-horizontal fog blend. The mesh follows the camera in
    // X/Z, so this distance is essentially how far out from the
    // viewer the sample lies. Pulling the seabed toward the fog
    // colour at distance is what gives the "slightly out of focus"
    // brief direction without a real DOF pass.
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

const PLANE_SEGMENTS = 96;

export default function Seabed({
  depth = 12,
  opacity = 0.85,
  rippleStrength = 0.55,
  rippleSpeed = 0.4,
  goldIntensity = 0.55,
  fogBlend = 1.0,
  fogColor = '#0e3850',
  fogNear = 4,
  fogFar = 28,
  planeSize = 96,
  sandColor = '#d8c8a4',
  highlightColor = '#f4ecd6',
  goldColor = '#e7c685',
}) {
  const meshRef = useRef();
  const { camera } = useThree();

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
          uRipple: { value: rippleStrength },
          uRippleSpeed: { value: rippleSpeed },
          uGold: { value: goldIntensity },
          uFogBlend: { value: fogBlend },
          uFogNear: { value: fogNear },
          uFogFar: { value: fogFar },
          uFogColor: { value: new THREE.Color(fogColor) },
          // Warm cream sand -- not bright white, so it reads as
          // soft and natural at depth rather than artificial.
          uSandColor: { value: new THREE.Color(sandColor) },
          uHighlightColor: { value: new THREE.Color(highlightColor) },
          uGoldColor: { value: new THREE.Color(goldColor) },
          uCameraXZ: { value: new THREE.Vector2(0, 0) },
          uPlaneSize: { value: planeSize },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((s) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = s.clock.elapsedTime;

    // Track the camera horizontally so the seabed never reveals an
    // edge. Y is fixed at the negative depth so the floor sits the
    // same distance below the viewer at all times.
    mesh.position.x = camera.position.x;
    mesh.position.z = camera.position.z;
    mesh.position.y = -depth;

    const u = material.uniforms;
    u.uTime.value = t;
    u.uOpacity.value = opacity;
    u.uRipple.value = rippleStrength;
    u.uRippleSpeed.value = rippleSpeed;
    u.uGold.value = goldIntensity;
    u.uFogBlend.value = fogBlend;
    u.uFogNear.value = fogNear;
    u.uFogFar.value = fogFar;
    u.uFogColor.value.set(fogColor);
    u.uCameraXZ.value.set(camera.position.x, camera.position.z);
    u.uSandColor.value.set(sandColor);
    u.uHighlightColor.value.set(highlightColor);
    u.uGoldColor.value.set(goldColor);
    u.uPlaneSize.value = planeSize;
  });

  return (
    <mesh
      ref={meshRef}
      // +PI/2 around X lays the plane flat with its visible face up.
      rotation={[Math.PI / 2, 0, 0]}
      frustumCulled={false}
      raycast={() => null}
      geometry={geometry}
      material={material}
    />
  );
}
