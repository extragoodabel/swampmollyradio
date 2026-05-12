import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Salmon Days only: camera-centered sky sphere for infinite abyss below and
 * soft overhead surface glow — no finite plane edges. Fills the canvas with
 * volumetric-feeling depth; pairs with the distant BackgroundField light sheet.
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
  uniform float uShimmer;
  uniform vec3 uCameraPos;

  varying vec3 vWorldPos;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 dir = normalize(vWorldPos - uCameraPos);
    float up = dir.y;

    float abyss = smoothstep(0.28, -0.78, up);
    vec3 col = mix(uMidColor, uDeepColor, abyss);

    float belt = smoothstep(-0.12, 0.18, up) * (1.0 - smoothstep(0.42, 0.88, up));
    col = mix(col, uMidColor * 1.12, belt * 0.35);

    float upper = smoothstep(0.08, 0.72, up);
    vec2 shUv = vWorldPos.xz * 0.012 + uTime * vec2(0.018, 0.011);
    float sh =
      hash21(shUv) * 0.22
      + hash21(shUv * 2.7 + 4.1) * 0.14
      + sin(uTime * 0.35 + vWorldPos.x * 0.031 + vWorldPos.z * 0.027) * 0.04;
    sh *= uShimmer;

    vec3 silver = vec3(0.92, 0.95, 1.0);
    col += silver * sh * smoothstep(0.1, 0.55, up);
    col += uSurfaceTint * pow(clamp(up, 0.0, 1.0), 1.8) * 0.42;
    col += uSurfaceTint * smoothstep(0.35, 0.95, up) * 0.18;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function SalmonOceanVault({
  deepColor = '#03060c',
  midColor = '#122a48',
  surfaceTint = '#f5ebff',
  shimmer = 1,
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(deepColor) },
      uMidColor: { value: new THREE.Color(midColor) },
      uSurfaceTint: { value: new THREE.Color(surfaceTint) },
      uShimmer: { value: shimmer },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    [deepColor, midColor, surfaceTint, shimmer],
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
    u.uShimmer.value = shimmer;
    u.uCameraPos.value.copy(camera.position);
  });

  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      renderOrder={-50}
      raycast={() => null}
    >
      <sphereGeometry args={[520, 48, 36]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={true}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
