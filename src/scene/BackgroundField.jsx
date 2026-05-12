import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function buildBentPlaneGeometry(width, height, segX, segY, bendZ) {
  const geo = new THREE.PlaneGeometry(width, height, segX, segY);
  const bend = Number(bendZ);
  if (!Number.isFinite(bend) || bend <= 0.001) return geo;
  const hw = width * 0.5;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const t = Math.min(1, Math.abs(x) / Math.max(1e-6, hw));
    const zBump = bend * (1 - t * t);
    pos.setZ(i, pos.getZ(i) + zBump);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

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
uniform float uOpenOceanMotion;
uniform float uOpenOceanTopCurl;

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
  vec2 pSlow = uv * uNoiseScale * 0.38 - flowDir * t * 0.11 * uDiagonalFlowStrength;

  float n1 = snoise(vec3(p,        t * 0.30));
  float n2 = snoise(vec3(p * 2.1,  t * 0.40)) * 0.55;
  float n3 = snoise(vec3(p * 4.3,  t * 0.50)) * 0.28;
  float nSlow = snoise(vec3(pSlow, t * 0.088)) * 0.42;
  float hDefault = (n1 + n2 + n3) / 1.83;
  float hOcean = (n1 + n2 + n3 + nSlow) / 2.05;
  float om = clamp(uOpenOceanMotion, 0.0, 2.8);
  float h = mix(hDefault, hOcean, min(1.0, om));

  float clothAmp = mix(1.0, 1.24, smoothstep(0.35, 1.35, om));
  float cloth = sin(position.x * 0.0105 + t * 1.08)
      * cos(position.y * 0.0088 - t * 0.92) * 0.62;
  cloth += sin((position.x * 0.62 + position.y * 0.78) * 0.0127 + t * 0.68) * 0.48;
  cloth += snoise(vec3(position.xy * 0.017, t * 0.38)) * 0.55;
  cloth += snoise(vec3(position.xy * 0.041 + vec2(t * 0.06, -t * 0.057), t * 0.29)) * 0.32;
  cloth += sin(position.x * 0.0068 + position.y * 0.0052 - t * 0.44) * 0.38 * step(0.02, om);
  h += cloth * om * clothAmp;
  h = clamp(h, -2.5, 2.5);

  vHeight = h;
  vFlow = snoise(vec3(p * 1.4 - flowDir * t * 0.6 * uDiagonalFlowStrength, t * 0.25));
  vFlow = clamp(vFlow, -2.0, 2.0);

  float dispStr = clamp(uDisplacementStrength, 0.0, 18.0);
  vec3 displaced = position + normal * h * dispStr;

  /* Recovery: curl uses model units — the old 255× scale folded the far plane wildly. */
  if (uOpenOceanTopCurl > 0.001) {
    float tC = uTime * uAnimationSpeed;
    float curlMask = smoothstep(0.24, 1.0, vUv.y);
    float cn = snoise(vec3(position.xy * 0.0035 + vec2(tC * 0.052, -tC * 0.041), tC * 0.11));
    float irregular = mix(0.74, 1.26, cn * 0.5 + 0.5);
    float curlAmt =
      clamp(uOpenOceanTopCurl, 0.0, 2.5) * curlMask * curlMask * irregular * 10.0;
    displaced.z -= curlAmt;
  }
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

/**
 * Salmon Days — STABLE baseline: luminous moving field, same structure as `FRAGMENT_SHADER`.
 * No pocket/mask/dither (those caused low-alpha + dark-frame failures). Re-introduce edge
 * feathery only after visibility is confirmed.
 */
const FRAGMENT_SHADER_OPEN_OCEAN = `
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
uniform float uAlphaEdgeWidth;
uniform float uAlphaTopSoft;

varying vec2 vUv;
varying float vHeight;
varying float vFogDepth;
varying float vFlow;

void main() {
  float vH = clamp(vHeight, -4.0, 4.0);
  float vF = clamp(vFlow, -4.0, 4.0);

  float t = uTime * uAnimationSpeed;
  float tSlow = uTime * uAnimationSpeed * 0.42;
  vec2 flowDir = normalize(vec2(0.62, 0.78));
  vec2 flowDir2 = normalize(vec2(-0.38, 0.92));

  float gradT = clamp(
    vH * 0.5 + 0.5 + vF * 0.26 * uGradientIntensity,
    0.0, 1.0
  );

  vec3 c0 = vec3(0.10, 0.22, 0.48);
  vec3 c1 = vec3(0.20, 0.42, 0.80);
  vec3 c2 = vec3(0.40, 0.70, 0.96);
  vec3 c3 = vec3(0.85, 0.52, 0.70);
  vec3 c4 = vec3(0.95, 0.78, 0.52);
  vec3 c5 = vec3(0.92, 0.88, 0.82);
  vec3 c6 = vec3(0.82, 0.94, 1.0);
  vec3 col;
  if (gradT < 0.16) col = mix(c0, c1, gradT / 0.16);
  else if (gradT < 0.38) col = mix(c1, c2, (gradT - 0.16) / 0.22);
  else if (gradT < 0.62) col = mix(c2, c3, (gradT - 0.38) / 0.24);
  else if (gradT < 0.78) col = mix(c3, c4, (gradT - 0.62) / 0.16);
  else if (gradT < 0.90) col = mix(c4, c5, (gradT - 0.78) / 0.12);
  else col = mix(c5, c6, (gradT - 0.90) / 0.10);

  vec2 pinkUV = vUv * uNoiseScale * 0.52 - flowDir * t * 0.38 * uDiagonalFlowStrength;
  float pinkN = snoise(vec3(pinkUV + vec2(100.0, 200.0), t * 0.17));
  float pinkMask = smoothstep(0.38, 0.78, pinkN) * uPinkAccentStrength * 0.38;
  col = mix(col, vec3(0.92, 0.48, 0.72), pinkMask);

  vec2 peachUV = vUv * uNoiseScale * 0.38 + flowDir2 * tSlow * 0.28;
  float peachN = snoise(vec3(peachUV + vec2(-40.0, 90.0), tSlow * 0.13));
  float peachMask = smoothstep(0.35, 0.74, peachN) * 0.35 * uGradientIntensity;
  col = mix(col, vec3(1.0, 0.76, 0.60), peachMask);

  float shimmer = snoise(vec3(vUv * uNoiseScale * 2.9
                              - flowDir * t * 1.05 * uDiagonalFlowStrength,
                              t * 0.65));
  shimmer = smoothstep(0.48, 0.92, shimmer) * 0.22;
  col += vec3(0.62, 0.82, 0.92) * shimmer * uGradientIntensity;

  float breathe = 0.94 + 0.08 * sin(uTime * uAnimationSpeed * 0.85);
  col *= breathe;

  float fogDen = max(1.0, uFogFar - uFogNear);
  float fogFactor = clamp((vFogDepth - uFogNear) / fogDen, 0.0, 1.0);
  col = mix(col, uFogColor, fogFactor * 0.58);

  float alpha = clamp(uBackgroundOpacity * (0.92 - fogFactor * 0.22), 0.45, 1.0);
  if (uAlphaEdgeWidth > 0.001) {
    float emin = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float eAtt = smoothstep(0.0, uAlphaEdgeWidth, emin);
    alpha *= mix(0.5, 1.0, eAtt);
  }
  if (uAlphaTopSoft > 0.001) {
    float topAtt = 1.0 - smoothstep(1.0 - uAlphaTopSoft, 1.0, vUv.y);
    alpha *= mix(0.55, 1.0, topAtt);
  }
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
  /** `openOcean` = Salmon Days-style luminous void; `default` = shared swampy baseline. */
  palette = 'default',
  /** When `palette === 'openOcean'`, scales ribbon / cloth undulation amplitude (can exceed 1). */
  openOceanMotionBoost = 1,
  /** When `palette === 'openOcean'`, rolls the upper UV rows backward in -Z to hide a flat horizon. */
  openOceanTopCurl = 0,
  /**
   * Soft cyclorama: plane vertices bow toward +Z at center (subtle U-wrap).
   * Salmon Days open-ocean only; keep 0 for flat Swamp plane.
   */
  cycloramaBend = 0,
  /** `openOcean` only: fade alpha near UV rectangle edges (hides corners). ~0.04–0.08 */
  openOceanAlphaEdgeWidth = 0,
  /** `openOcean` only: fade alpha across top UV band to blend with zenith / surface glow. */
  openOceanTopSoft = 0,
}) {
  const matRef = useRef();
  const fragmentShader = useMemo(
    () => (palette === 'openOcean' ? FRAGMENT_SHADER_OPEN_OCEAN : FRAGMENT_SHADER),
    [palette],
  );

  const bentGeometry = useMemo(
    () =>
      buildBentPlaneGeometry(
        size[0],
        size[1],
        segments[0],
        segments[1],
        cycloramaBend,
      ),
    [size[0], size[1], segments[0], segments[1], cycloramaBend],
  );

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
      uOpenOceanMotion: { value: 0 },
      uOpenOceanTopCurl: { value: 0 },
      uAlphaEdgeWidth: { value: 0 },
      uAlphaTopSoft: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const oceanBoost = palette === 'openOcean' ? openOceanMotionBoost : 0;
  const oceanCurl = palette === 'openOcean' ? openOceanTopCurl : 0;
  const oceanEdgeW =
    palette === 'openOcean'
      ? THREE.MathUtils.clamp(Number(openOceanAlphaEdgeWidth), 0, 0.22)
      : 0;
  const oceanTopS =
    palette === 'openOcean'
      ? THREE.MathUtils.clamp(Number(openOceanTopSoft), 0, 0.45)
      : 0;

  useFrame((_, delta) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    const d = Math.min(0.1, Math.max(0, delta));
    u.uTime.value += Number.isFinite(d) ? d : 0;
    u.uDisplacementStrength.value = THREE.MathUtils.clamp(
      Number(displacementStrength),
      0,
      18,
    );
    u.uNoiseScale.value = THREE.MathUtils.clamp(Number(noiseScale), 0.2, 8);
    u.uAnimationSpeed.value = THREE.MathUtils.clamp(Number(animationSpeed), 0.02, 2);
    u.uGradientIntensity.value = THREE.MathUtils.clamp(Number(gradientIntensity), 0.2, 8);
    u.uPinkAccentStrength.value = THREE.MathUtils.clamp(Number(pinkAccentStrength), 0, 6);
    u.uDiagonalFlowStrength.value = THREE.MathUtils.clamp(
      Number(diagonalFlowStrength),
      0,
      6,
    );
    u.uBackgroundOpacity.value = THREE.MathUtils.clamp(
      Number(backgroundOpacity),
      0.35,
      1,
    );
    u.uFogColor.value.set(fogColor);
    let fn = Number(fogNear);
    let ff = Number(fogFar);
    if (!Number.isFinite(fn)) fn = 14;
    if (!Number.isFinite(ff)) ff = 58;
    if (ff <= fn) ff = fn + 1;
    u.uFogNear.value = fn;
    u.uFogFar.value = ff;
    u.uOpenOceanMotion.value = THREE.MathUtils.clamp(oceanBoost, 0, 3);
    u.uOpenOceanTopCurl.value = THREE.MathUtils.clamp(oceanCurl, 0, 2.5);
    u.uAlphaEdgeWidth.value = oceanEdgeW;
    u.uAlphaTopSoft.value = oceanTopS;
  });

  return (
    <mesh
      position={position}
      geometry={bentGeometry}
      renderOrder={-10}
      frustumCulled={false}
      // Decorative cloth — ignore picking so it never competes with R3F's
      // pointer pipeline or blocks drag starting on the canvas.
      raycast={() => null}
    >
      <shaderMaterial
        key={palette}
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
