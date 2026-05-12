import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Salmon Days only: a vast horizontal “ocean underside” sheet far above
 * the camera — slow waves, sun-fleck shimmer, no hard silhouette. Follows
 * the viewer on XZ, stays high on Y so it never reads as a low ceiling.
 */

const SIMPLEX_3D = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,0.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.,i1.z,i2.z,1.))
    +i.y+vec4(0.,i1.y,i2.y,1.))
    +i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=1./7.;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const VERT = /* glsl */ `
${SIMPLEX_3D}
uniform float uTime;
uniform float uWaveStrength;
uniform float uAnimSpeed;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  float t = uTime * uAnimSpeed;
  vec3 pos = position;

  float w =
    sin(pos.x * 0.0038 + t * 0.72) * cos(pos.y * 0.0032 - t * 0.58);
  w += 0.45 * sin((pos.x * 0.55 + pos.y * 0.72) * 0.0044 + t * 0.48);
  w += 0.32 * snoise(vec3(pos.xy * 0.0016, t * 0.2));
  w += 0.2 * snoise(vec3(pos.xy * 0.0042 + vec2(t * 0.08, -t * 0.06), t * 0.28));
  pos.z += w * uWaveStrength;

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${SIMPLEX_3D}
uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uHighlightColor;
uniform vec3 uYellow;
uniform float uAnimSpeed;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  float t = uTime * uAnimSpeed;
  vec2 p = vWorldPos.xz * 0.0085;

  float ripple = snoise(vec3(p + vec2(t * 0.065, -t * 0.05), t * 0.16));
  ripple += 0.32 * snoise(vec3(p * 1.45 - vec2(t * 0.035, t * 0.042), t * 0.22));

  float sun = pow(max(0.0, ripple * 0.5 + 0.5), 2.65);
  float sunW = snoise(vec3(p * 0.38 + vec2(-t * 0.028, t * 0.024), t * 0.08));
  sun *= 0.42 + 0.58 * smoothstep(0.15, 0.92, sunW * 0.5 + 0.5);

  vec3 col = mix(uBaseColor, uHighlightColor, 0.2 + ripple * 0.24);
  col = mix(col, uYellow, sun * 0.42);
  col += uYellow * sun * 0.26;

  // Slow wide luminous veil (no high-frequency “snow”).
  float veil = snoise(vec3(vWorldPos.xz * 0.022 + vec2(t * 0.018, -t * 0.014), t * 0.07));
  veil += 0.45 * snoise(vec3(vWorldPos.xz * 0.045 + vec2(-t * 0.01, t * 0.012), t * 0.11));
  float veilL = smoothstep(0.2, 0.78, veil * 0.5 + 0.5);
  col += mix(uHighlightColor, uYellow, 0.35) * veilL * 0.18;

  vec3 cam = cameraPosition;
  float dist = distance(vWorldPos, cam);
  float fogF = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, fogF * 0.78);

  float alpha = uOpacity * (1.0 - fogF * 0.48);
  gl_FragColor = vec4(col, alpha);
}
`;

export default function SalmonOceanCanopy({
  heightAboveCamera = 128,
  planeSize = [2800, 1700],
  segments = [96, 96],
  waveStrength = 14,
  animationSpeed = 0.14,
  baseColor = '#6eb8e8',
  highlightColor = '#d8f2ff',
  yellowColor = '#fff1b8',
  opacity = 0.68,
  fogColor = '#a8c4f5',
  fogNear = 80,
  fogFar = 650,
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWaveStrength: { value: waveStrength },
      uAnimSpeed: { value: animationSpeed },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uHighlightColor: { value: new THREE.Color(highlightColor) },
      uYellow: { value: new THREE.Color(yellowColor) },
      uOpacity: { value: opacity },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
    }),
    [],
  );

  useFrame((s) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = camera.position;
    mesh.position.set(c.x, c.y + heightAboveCamera, c.z);
    mesh.rotation.x = -Math.PI / 2;
    const u = mesh.material.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uWaveStrength.value = waveStrength;
    u.uAnimSpeed.value = animationSpeed;
    u.uBaseColor.value.set(baseColor);
    u.uHighlightColor.value.set(highlightColor);
    u.uYellow.value.set(yellowColor);
    u.uOpacity.value = opacity;
    u.uFogColor.value.set(fogColor);
    u.uFogNear.value = fogNear;
    u.uFogFar.value = Math.max(fogNear + 1, fogFar);
  });

  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      renderOrder={-15}
      raycast={() => null}
    >
      <planeGeometry args={[...planeSize, ...segments]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
