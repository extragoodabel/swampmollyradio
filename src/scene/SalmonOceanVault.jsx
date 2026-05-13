import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Salmon Days only: camera-centered sky sphere — abyss below, strong
 * moving overhead surface light (caustics + warm sun pools). No plane
 * edges; pairs with the distant BackgroundField sheet.
 */

const VERT = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uSurfaceTint;
  uniform vec3 uWarmPeach;
  uniform vec3 uAquaSheen;
  uniform float uShimmer;
  uniform float uVaultCaustic;
  uniform float uOverheadGlow;
  uniform vec3 uCameraPos;

  varying vec3 vWorldPos;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    vec2 p0 = p;
    s += a * noise2(p0); a *= 0.52; p0 *= 2.02; p0 += vec2(0.0, 0.0);
    s += a * noise2(p0); a *= 0.52; p0 *= 2.02; p0 += vec2(0.13, 0.07);
    s += a * noise2(p0); a *= 0.52; p0 *= 2.02; p0 += vec2(0.26, 0.14);
    s += a * noise2(p0); a *= 0.52; p0 *= 2.02; p0 += vec2(0.39, 0.21);
    s += a * noise2(p0);
    return s;
  }

  void main() {
    vec3 dir = normalize(vWorldPos - uCameraPos);
    float up = dir.y;

    float abyss = 1.0 - smoothstep(-0.92, 0.06, up);
    vec3 col = mix(uMidColor, uDeepColor, abyss * abyss * (3.0 - 2.0 * abyss));

    // Horizon belt — very soft mid-water lift (avoid a crisp “band”).
    float belt = smoothstep(-0.22, 0.28, up) * (1.0 - smoothstep(0.48, 0.94, up));
    col = mix(col, uMidColor * 1.14, belt * 0.18);

    // --- Overhead: soft refracted sunlight — low-frequency pools only (no
    // screen-space sparkle). Wider cone so zenith reads as distant water.
    float overhead = smoothstep(0.12, 0.72, up);
    vec2 cBase = vWorldPos.xz * 0.014;
    float t = uTime;
    vec2 drift1 = vec2(0.022, 0.016) * t;
    vec2 drift2 = vec2(-0.019, 0.021) * t * 0.55;

    float ca1 = fbm(cBase + drift1);
    float ca2 = fbm(cBase * 1.85 - drift2 + vec2(4.2, 1.8));
    float ca3 = fbm(cBase * 3.2 + drift1 * 1.1 + vec2(-12.0, 7.0));
    float caustic =
      pow(clamp(ca1 * 0.62 + ca2 * 0.28 + ca3 * 0.10, 0.0, 1.0), 1.05);
    caustic *= uShimmer * uVaultCaustic * overhead;

    vec3 caustCol = mix(uAquaSheen, uSurfaceTint, ca2 * 0.52);
    caustCol = mix(caustCol, uWarmPeach, ca3 * 0.38);
    col += caustCol * caustic * 1.05;

    // Diagonal light rake — very soft, wide bands (no sharp glass stripes).
    float rake =
      sin(vWorldPos.x * 0.034 + vWorldPos.z * 0.027 + t * 0.34)
      * sin(vWorldPos.x * -0.022 + vWorldPos.z * 0.044 + t * 0.24);
    rake = pow(abs(rake) * 0.5 + 0.5, 2.15) * 0.22;
    col += mix(uSurfaceTint, uWarmPeach, 0.35) * rake * overhead * uShimmer * uVaultCaustic * 0.45
        * smoothstep(0.15, 0.68, up);

    // Drifting veil — cloud-like breakup (fbm), replaces hash glitter.
    float veil = fbm(cBase * 0.4 + drift2 * 0.35 + vec2(0.0, t * 0.018));
    float veilW = smoothstep(0.28, 0.82, veil);
    col += mix(uWarmPeach, uSurfaceTint, 0.45) * veilW * smoothstep(0.25, 0.88, up)
        * uVaultCaustic * uShimmer * 0.14;

    // Broad warm bloom looking up — soft sun pool.
    float zenith = pow(clamp(up, 0.0, 1.0), 1.25);
    col += uSurfaceTint * zenith * (0.42 + caustic * 0.32) * uOverheadGlow;
    col += uWarmPeach * pow(zenith, 1.9) * 0.22 * uOverheadGlow;
    col += uAquaSheen * smoothstep(0.35, 0.94, up) * (0.12 + rake * 0.22);

    // --- Peripheral: rich side abyss (deep blue); down-vector stays darker via low below weight.
    float horiz = length(dir.xz);
    float hDark = smoothstep(0.2, 1.05, horiz);
    float below = 1.0 - smoothstep(-0.84, 0.16, up);
    float blendW = clamp(hDark * 0.74 + below * 0.09, 0.0, 1.0);
    blendW = pow(blendW, 0.78);
    vec3 farWater = mix(uDeepColor, uMidColor * vec3(0.66, 0.69, 0.84), 0.68);
    farWater = mix(farWater, uDeepColor * vec3(0.48, 0.53, 0.69), 0.38);
    col = mix(col, farWater, blendW * 0.8);

    float forwardHaze =
      smoothstep(-0.12, 0.48, -dir.z) * (1.0 - smoothstep(0.42, 0.94, up));
    col = mix(col, uMidColor * vec3(0.94, 0.97, 1.04), forwardHaze * 0.1);

    // Slow peripheral breathing: matches backdrop mood; fades at zenith and nadir.
    float nadirQuiet = smoothstep(-0.86, -0.24, up);
    float sideAxis = pow(clamp(horiz, 0.0, 1.0), 1.08);
    float zenithGuard = 1.0 - smoothstep(0.48, 0.92, up);
    float wbA = sin(uTime * 0.152 + vWorldPos.x * 0.0056 + vWorldPos.z * 0.0045);
    float wbB = sin(uTime * 0.091 + horiz * 2.75 + vWorldPos.y * 0.016);
    float waterBreath = 0.922 + wbA * 0.048 + wbB * 0.034;
    col = mix(col, col * waterBreath, sideAxis * zenithGuard * nadirQuiet * 0.68);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function SalmonOceanVault({
  deepColor = '#03060c',
  midColor = '#122a48',
  surfaceTint = '#f5ebff',
  warmPeach = '#ffd8bc',
  aquaSheen = '#c8f0ff',
  shimmer = 1,
  vaultCaustic = 1,
  overheadGlow = 1,
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(deepColor) },
      uMidColor: { value: new THREE.Color(midColor) },
      uSurfaceTint: { value: new THREE.Color(surfaceTint) },
      uWarmPeach: { value: new THREE.Color(warmPeach) },
      uAquaSheen: { value: new THREE.Color(aquaSheen) },
      uShimmer: { value: shimmer },
      uVaultCaustic: { value: vaultCaustic },
      uOverheadGlow: { value: overheadGlow },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    [],
  );

  useFrame((s) => {
    const m = meshRef.current;
    if (!m) return;
    m.position.copy(camera.position);
    const u = m.material.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uDeepColor.value.set(deepColor);
    u.uMidColor.value.set(midColor);
    u.uSurfaceTint.value.set(surfaceTint);
    u.uWarmPeach.value.set(warmPeach);
    u.uAquaSheen.value.set(aquaSheen);
    u.uShimmer.value = shimmer;
    u.uVaultCaustic.value = vaultCaustic;
    u.uOverheadGlow.value = overheadGlow;
    u.uCameraPos.value.copy(camera.position);
  });

  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      renderOrder={-50}
      raycast={() => null}
    >
      <sphereGeometry args={[640, 60, 44]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
