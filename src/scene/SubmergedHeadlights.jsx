import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Volumetric cone, spot, and lens emissive strengths vs authored tuning presets. */
const HEADLIGHT_STRENGTH_MUL = 3;

const NOISE_GLSL = `
float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n00 = mix(n000, n100, f.x);
  float n01 = mix(n010, n110, f.x);
  float n0 = mix(n00, n01, f.y);
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float n10 = mix(n001, n101, f.x);
  float n11 = mix(n011, n111, f.x);
  float n1 = mix(n10, n11, f.y);
  return mix(n0, n1, f.z);
}
`;

function buildHeadlightShaders(shaftHalf) {
  void shaftHalf;
  const HEADLIGHT_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying float vDepth;

  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

  const HEADLIGHT_FRAG = /* glsl */ `
  ${NOISE_GLSL}

  uniform float uTime;
  uniform float uIntensity;
  uniform float uSoftness;
  uniform vec3 uCoreColor;
  uniform vec3 uHazeColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uBeamFogReach;
  uniform float uMurk;
  uniform float uRadiusNarrow;
  uniform float uRadiusWide;
  uniform float uShaftHalf;

  varying vec3 vLocal;
  varying float vDepth;

  void main() {
    float y = vLocal.y;
    float shaftLen = uShaftHalf * 2.0;
    float along =
      smoothstep(-uShaftHalf, -uShaftHalf * 0.62, y)
      * (1.0 - smoothstep(uShaftHalf * 0.58, uShaftHalf, y));
    along = pow(along, 0.92);

    float r = length(vLocal.xz);
    float yNorm = clamp((y + uShaftHalf) / max(0.0001, shaftLen), 0.0, 1.0);
    float coneR = mix(uRadiusNarrow, uRadiusWide, yNorm);

    float edgeFall = 1.0 - smoothstep(coneR * (0.14 + uSoftness * 0.12), coneR * 1.08, r);
    float softVol = exp(-(r * r) / max(0.016, coneR * coneR * 0.52)) * 0.55;
    float shellVol = smoothstep(coneR * 0.05, coneR * 0.88, r) * (1.0 - smoothstep(coneR * 0.9, coneR * 1.12, r));

    vec3 nPos = vLocal * vec3(1.15, 0.38, 1.15) + vec3(0.0, uTime * 0.12, uTime * 0.07);
    float grain = noise3(nPos * 1.35) * 0.5 + noise3(nPos * 2.9) * 0.25 + 0.35;
    float dustPulse = 0.82 + 0.18 * sin(uTime * 0.71 + y * 0.18 + r * 2.4);
    float particulate = mix(0.55, 1.0, grain) * dustPulse;

    float radialEnvelope = softVol + shellVol * 0.62 * (0.45 + 0.55 * grain);
    radialEnvelope *= edgeFall;

    float flicker =
      0.94
      + 0.034 * sin(uTime * 0.51 + y * 0.28)
      + 0.02 * sin(uTime * 0.88 - r * 1.35);

    float fogDenom = max(0.0001, uFogFar * uBeamFogReach - uFogNear);
    float fogF = clamp((vDepth - uFogNear) / fogDenom, 0.0, 1.0);
    float fogDissolve = mix(1.0, 0.18, pow(fogF, 1.08));
    fogDissolve *= mix(1.0, 0.32, uMurk * fogF * 0.62);

    float alpha =
      along * radialEnvelope * uIntensity * flicker * fogDissolve * particulate * 1.12;

    if (alpha < 0.000035) discard;

    float bright = 0.35 + 0.65 * grain * edgeFall;
    vec3 col = mix(uHazeColor, uCoreColor, bright * 0.55);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

  return { HEADLIGHT_VERT, HEADLIGHT_FRAG };
}

function createHeadlightMaterial(shaftHalf) {
  const { HEADLIGHT_VERT, HEADLIGHT_FRAG } = buildHeadlightShaders(shaftHalf);
  return new THREE.ShaderMaterial({
    vertexShader: HEADLIGHT_VERT,
    fragmentShader: HEADLIGHT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uShaftHalf: { value: shaftHalf },
      uIntensity: { value: 0.2 },
      uSoftness: { value: 1.2 },
      uCoreColor: { value: new THREE.Color('#c4b090') },
      uHazeColor: { value: new THREE.Color('#4a4538') },
      uFogNear: { value: 7 },
      uFogFar: { value: 34 },
      uBeamFogReach: { value: 2.8 },
      uMurk: { value: 0.88 },
      uRadiusNarrow: { value: 0.1 },
      uRadiusWide: { value: 3.55 },
    },
  });
}

function MurkHeadlightCone({
  geometry,
  fogNear,
  fogFar,
  fogColor,
  murk,
  shaftHalf,
  tune,
  proximityMulRef,
}) {
  const mat = useMemo(() => createHeadlightMaterial(shaftHalf), [shaftHalf]);

  const haze = useMemo(() => {
    const c = new THREE.Color(fogColor);
    c.multiplyScalar(0.34);
    c.offsetHSL(0.03, -0.04, -0.12);
    return c;
  }, [fogColor]);

  const core = useMemo(() => {
    const c = new THREE.Color(tune.coreColorHint);
    c.lerp(new THREE.Color(fogColor), tune.coreFogLerp);
    c.multiplyScalar(tune.coreMul);
    return c;
  }, [fogColor, tune.coreColorHint, tune.coreFogLerp, tune.coreMul]);

  useFrame((s) => {
    const m = mat;
    if (!m) return;
    m.uniforms.uTime.value = s.clock.elapsedTime;
    m.uniforms.uShaftHalf.value = shaftHalf;
    m.uniforms.uFogNear.value = fogNear;
    m.uniforms.uFogFar.value = fogFar;
    m.uniforms.uBeamFogReach.value = tune.beamFogReach;
    m.uniforms.uMurk.value = murk;
    const pm = proximityMulRef?.current ?? 1;
    m.uniforms.uIntensity.value = tune.coneIntensity * pm;
    m.uniforms.uSoftness.value = tune.coneSoftness;
    m.uniforms.uCoreColor.value.copy(core);
    m.uniforms.uHazeColor.value.copy(haze);
    m.uniforms.uRadiusNarrow.value = tune.radiusNarrow;
    m.uniforms.uRadiusWide.value = tune.radiusWide;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, shaftHalf]}
      geometry={geometry}
      material={mat}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={6}
    />
  );
}

function SoftHeadlightSpot({
  color,
  intensity,
  distance,
  angle,
  penumbra,
  decay,
  targetZ,
  yBias = -0.06,
  proximityMulRef,
}) {
  const lightRef = useRef(null);
  const targetRef = useRef(null);

  useFrame(() => {
    const L = lightRef.current;
    if (!L) return;
    const pm = proximityMulRef?.current ?? 1;
    L.intensity = intensity * pm;
  });

  useLayoutEffect(() => {
    const L = lightRef.current;
    const T = targetRef.current;
    if (L && T) {
      L.target = T;
      L.target.updateMatrixWorld();
    }
  }, []);

  return (
    <>
      <spotLight
        ref={lightRef}
        position={[0, 0, 0.04]}
        color={color}
        intensity={intensity}
        distance={distance}
        angle={angle}
        penumbra={penumbra}
        decay={decay}
        castShadow={false}
      />
      <group ref={targetRef} position={[0, yBias, targetZ]} />
    </>
  );
}

function SealedBeamLens({
  color,
  emissive,
  emissiveIntensity,
  radius,
  z = 0.05,
  proximityMulRef,
}) {
  const matRef = useRef();

  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const pm = proximityMulRef?.current ?? 1;
    m.emissiveIntensity = emissiveIntensity * pm;
  });

  return (
    <mesh
      position={[0, 0, z]}
      rotation={[Math.PI / 2, 0, 0]}
      raycast={() => null}
      renderOrder={5}
    >
      <circleGeometry args={[radius, 14]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={0.94}
        depthWrite={false}
        fog
        toneMapped
      />
    </mesh>
  );
}

function mergeTuning(t) {
  const S = HEADLIGHT_STRENGTH_MUL;
  return {
    murk: t.murk ?? 0.9,
    shaftHalf: t.shaftHalf ?? 9.2,
    coneIntensity: (t.coneIntensity ?? 0.14) * S,
    coneSoftness: t.coneSoftness ?? 1.75,
    beamFogReach: t.beamFogReach ?? 2.35,
    radiusNarrow: t.radiusNarrow ?? 0.085,
    radiusWide: t.radiusWide ?? 2.95,
    coreColorHint: t.coreColorHint ?? '#6a5c48',
    coreFogLerp: t.coreFogLerp ?? 0.28,
    coreMul: t.coreMul ?? 0.38,
    lensRadius: t.lensRadius ?? 0.1,
    lensZ: t.lensZ ?? 0.055,
    lensColor: t.lensColor ?? '#f2e8d4',
    lensEmissive: t.lensEmissive ?? '#e8d2a0',
    lensEmissiveIntensity: (t.lensEmissiveIntensity ?? 1.05) * S,
    spotColor: t.spotColor ?? '#ffd9a8',
    spotIntensity: (t.spotIntensity ?? 0.48) * S,
    spotDistance: t.spotDistance ?? 15,
    spotAngle: t.spotAngle ?? 0.48,
    spotPenumbra: t.spotPenumbra ?? 0.93,
    spotDecay: t.spotDecay ?? 2.1,
    spotTargetZ: t.spotTargetZ ?? -11,
    beamStartBias: t.beamStartBias ?? 0.08,
    coneRadiusTop: t.coneRadiusTop ?? 0.09,
    coneRadiusBottom: t.coneRadiusBottom ?? 3.15,
    coneRadialSegs: t.coneRadialSegs ?? 24,
    /** Extra Euler (rad, order XYZ) on each lamp group — aim beams without moving anchors. */
    lampEuler: t.lampEuler ?? [0, 0, 0],
    /** Camera distance at which proximity mul starts rising (far). */
    proximityFar: t.proximityFar ?? 54,
    /** Camera distance at which proximity mul reaches 1 (near). */
    proximityNear: t.proximityNear ?? 10.5,
    /** Minimum intensity multiplier when camera is at/ beyond proximityFar. */
    proximityMinMul: t.proximityMinMul ?? 0.22,
  };
}

/** Preset tuning — rusty vintage sedan (longer beam, wider cone). */
export const SWAMP_HEADLIGHT_TUNING_VINTAGE = {
  murk: 0.92,
  shaftHalf: 9.2,
  coneIntensity: 0.26,
  coneSoftness: 1.82,
  beamFogReach: 2.45,
  radiusNarrow: 0.092,
  radiusWide: 3.22,
  coreColorHint: '#554a3e',
  coreFogLerp: 0.34,
  coreMul: 0.34,
  lensRadius: 0.12,
  lensEmissiveIntensity: 0.64,
  lensEmissive: '#c4b08a',
  spotIntensity: 0.34,
  spotDistance: 20,
  spotAngle: 0.52,
  spotColor: '#d8c4a4',
};

/**
 * Submerged Fiat Panda — shorter, murkier cones; faint sealed-beam read at distance.
 * Body stays dark; headlights + cones carry discovery. Tune `SwampSunkenFiatPanda` anchors.
 */
export const SWAMP_HEADLIGHT_TUNING_FIAT = {
  murk: 0.93,
  shaftHalf: 4.8,
  coneIntensity: 0.14,
  coneSoftness: 1.95,
  beamFogReach: 2.12,
  radiusNarrow: 0.062,
  radiusWide: 2.38,
  coreColorHint: '#4a443a',
  coreFogLerp: 0.45,
  coreMul: 0.31,
  lensRadius: 0.088,
  lensZ: 0.04,
  lensColor: '#ddd0bc',
  lensEmissive: '#c8b896',
  lensEmissiveIntensity: 0.48,
  spotColor: '#baa892',
  spotIntensity: 0.26,
  spotDistance: 13,
  spotAngle: 0.42,
  spotPenumbra: 0.97,
  spotDecay: 2.5,
  spotTargetZ: -8.2,
  beamStartBias: 0.03,
  coneRadiusTop: 0.056,
  coneRadiusBottom: 2.15,
  coneRadialSegs: 20,
  lampEuler: [0, 0, 0],
  proximityFar: 72,
  proximityNear: 12,
  proximityMinMul: 0.4,
};

/**
 * Swamp-only: old sealed-beam read — warm volumetric cones + faint spots + lens discs.
 * `anchors` are in the same space as the parent of this component (typically car root local).
 */
export default function SubmergedHeadlights({
  anchors,
  fogNear,
  fogFar,
  fogColor,
  tuning: tuningProp = {},
}) {
  const { camera } = useThree();
  const rootRef = useRef(null);
  const proximityMulRef = useRef(0.45);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  const tune = useMemo(
    () => mergeTuning(tuningProp),
    [tuningProp],
  );

  useFrame(() => {
    if (!rootRef.current || !anchors?.length) return;
    let minD = 1e9;
    for (const pos of anchors) {
      scratch.set(pos.x, pos.y, pos.z + tune.beamStartBias);
      rootRef.current.localToWorld(scratch);
      minD = Math.min(minD, camera.position.distanceTo(scratch));
    }
    const th = THREE.MathUtils.smoothstep(
      minD,
      tune.proximityFar,
      tune.proximityNear,
    );
    proximityMulRef.current = THREE.MathUtils.lerp(
      tune.proximityMinMul,
      1,
      th,
    );
  });

  const coneGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(
      tune.coneRadiusTop,
      tune.coneRadiusBottom,
      tune.shaftHalf * 2,
      tune.coneRadialSegs,
      1,
      false,
    );
    g.computeVertexNormals();
    return g;
  }, [
    tune.coneRadiusBottom,
    tune.coneRadiusTop,
    tune.coneRadialSegs,
    tune.shaftHalf,
  ]);

  if (!anchors?.length) return null;

  return (
    <group ref={rootRef}>
      {anchors.map((pos, i) => (
        <group
          key={i}
          position={[pos.x, pos.y, pos.z + tune.beamStartBias]}
          rotation={tune.lampEuler}
        >
          <SealedBeamLens
            color={tune.lensColor}
            emissive={tune.lensEmissive}
            emissiveIntensity={tune.lensEmissiveIntensity}
            radius={tune.lensRadius}
            z={tune.lensZ}
            proximityMulRef={proximityMulRef}
          />
          <SoftHeadlightSpot
            color={tune.spotColor}
            intensity={tune.spotIntensity}
            distance={tune.spotDistance}
            angle={tune.spotAngle}
            penumbra={tune.spotPenumbra}
            decay={tune.spotDecay}
            targetZ={tune.spotTargetZ}
            proximityMulRef={proximityMulRef}
          />
          <MurkHeadlightCone
            geometry={coneGeom}
            fogNear={fogNear}
            fogFar={fogFar}
            fogColor={fogColor}
            murk={tune.murk}
            shaftHalf={tune.shaftHalf}
            tune={tune}
            proximityMulRef={proximityMulRef}
          />
        </group>
      ))}
    </group>
  );
}
