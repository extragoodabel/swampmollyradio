import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Volumetric light-field background.
 *
 * A very large, heavily subdivided plane parked far behind the fish.
 * The vertex shader displaces it with low-amplitude 3D simplex noise
 * (so it folds rather than spikes) and the fragment shader maps the
 * height + a second noise sample through a hand-picked underwater
 * palette (deep blue -> teal -> aqua -> sea green -> yellow), with
 * an occasional pink/magenta accent and a faint caustic-shimmer pass.
 *
 * 3D simplex noise lets time live in the Z axis of the noise input,
 * so the pattern evolves naturally without obvious directional motion.
 * A separate UV offset along (0.62, 0.78) gives the deliberate
 * diagonal flow asked for. Manual depth fade (not scene fog) is wider
 * than the fish fog so the background dissolves gradually rather than
 * snapping to black with the fish.
 */

const SIMPLEX_3D_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERTEX_SHADER = `
${SIMPLEX_3D_GLSL}

uniform float uTime;
uniform float uDisplacementStrength;
uniform float uNoiseScale;
uniform float uAnimationSpeed;
uniform float uDiagonalFlowStrength;

varying vec2 vUv;
varying float vHeight;
varying float vFogDepth;
varying float vFlow;

void main() {
  vUv = uv;

  float t = uTime * uAnimationSpeed;
  vec2 flowDir = normalize(vec2(0.62, 0.78));
  vec2 flowOffset = -flowDir * t * 0.5 * uDiagonalFlowStrength;
  vec2 p = uv * uNoiseScale + flowOffset;

  float n1 = snoise(vec3(p,        t * 0.30));
  float n2 = snoise(vec3(p * 2.1,  t * 0.40)) * 0.55;
  float n3 = snoise(vec3(p * 4.3,  t * 0.50)) * 0.28;
  float h  = (n1 + n2 + n3) / 1.83;

  vHeight = h;
  vFlow = snoise(vec3(p * 1.4 - flowDir * t * 0.6 * uDiagonalFlowStrength, t * 0.25));

  vec3 displaced = position + normal * h * uDisplacementStrength;
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
${SIMPLEX_3D_GLSL}

uniform float uTime;
uniform float uAnimationSpeed;
uniform float uNoiseScale;
uniform float uGradientIntensity;
uniform float uPinkAccentStrength;
uniform float uDiagonalFlowStrength;
uniform float uBackgroundOpacity;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying float vHeight;
varying float vFogDepth;
varying float vFlow;

vec3 palette(float t) {
  vec3 c0 = vec3(0.040, 0.100, 0.180); // deep blue
  vec3 c1 = vec3(0.050, 0.300, 0.460); // teal-blue
  vec3 c2 = vec3(0.140, 0.580, 0.660); // aqua
  vec3 c3 = vec3(0.300, 0.720, 0.520); // sea green
  vec3 c4 = vec3(0.940, 0.840, 0.380); // yellow highlight
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

void main() {
  float t = uTime * uAnimationSpeed;
  vec2 flowDir = normalize(vec2(0.62, 0.78));

  float gradT = clamp(
    vHeight * 0.5 + 0.5 + vFlow * 0.22 * uGradientIntensity,
    0.0, 1.0
  );
  vec3 col = palette(gradT);

  // Pink / magenta accent: rare patches driven by a separate noise.
  vec2 pinkUV = vUv * uNoiseScale * 0.55
                - flowDir * t * 0.4 * uDiagonalFlowStrength;
  float pinkN = snoise(vec3(pinkUV + vec2(100.0, 200.0), t * 0.18));
  float pinkMask = smoothstep(0.45, 0.78, pinkN) * uPinkAccentStrength * 0.35;
  vec3 pink = vec3(0.82, 0.42, 0.68);
  col = mix(col, pink, pinkMask);

  // Faint caustic shimmer: small high-frequency noise lifted into highlights.
  float shimmer = snoise(vec3(vUv * uNoiseScale * 3.0
                              - flowDir * t * 1.2 * uDiagonalFlowStrength,
                              t * 0.7));
  shimmer = smoothstep(0.55, 0.95, shimmer) * 0.18;
  col += vec3(0.55, 0.78, 0.85) * shimmer * uGradientIntensity;

  // Manual depth fade to scene fog colour. Wider than the scene fog
  // so the plane dissolves gradually rather than vanishing with the fish.
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  col = mix(col, uFogColor, fogFactor);

  float alpha = uBackgroundOpacity * (1.0 - fogFactor * 0.45);
  gl_FragColor = vec4(col, alpha);
}
`;

export default function BackgroundField({
  displacementStrength = 2.5,
  noiseScale = 2.6,
  animationSpeed = 0.18,
  gradientIntensity = 1.0,
  pinkAccentStrength = 0.6,
  diagonalFlowStrength = 1.0,
  backgroundOpacity = 0.85,
  position = [0, 0, -28],
  size = [110, 60],
  segments = [220, 130],
  fogColor = '#0e3850',
  fogNear = 14,
  fogFar = 58,
}) {
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDisplacementStrength: { value: displacementStrength },
      uNoiseScale: { value: noiseScale },
      uAnimationSpeed: { value: animationSpeed },
      uGradientIntensity: { value: gradientIntensity },
      uPinkAccentStrength: { value: pinkAccentStrength },
      uDiagonalFlowStrength: { value: diagonalFlowStrength },
      uBackgroundOpacity: { value: backgroundOpacity },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uTime.value += delta;
    u.uDisplacementStrength.value = displacementStrength;
    u.uNoiseScale.value = noiseScale;
    u.uAnimationSpeed.value = animationSpeed;
    u.uGradientIntensity.value = gradientIntensity;
    u.uPinkAccentStrength.value = pinkAccentStrength;
    u.uDiagonalFlowStrength.value = diagonalFlowStrength;
    u.uBackgroundOpacity.value = backgroundOpacity;
    u.uFogColor.value.set(fogColor);
  });

  return (
    <mesh position={position} renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[...size, ...segments]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
