import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Theme-driven underwater light: `style === 'ocean'` is broad open-water
 * sun; `style === 'swamp'` uses a separate fragment branch — soft
 * fragmented volumetric murk (pockets, streaks, muddy fringe) meant to
 * read as distant headlights / haze in dirty water, not a spotlight cone.
 * Optional `secondLayer` adds a second faint billboarding region with its
 * own phase offset.
 */

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uStyle;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftness;
  uniform float uFalloff;
  uniform float uDiffusion;
  uniform float uCausticStrength;
  uniform float uNoiseScale;
  uniform float uShimmerSpeed;
  uniform float uColorWarmth;
  uniform vec3 uColdColor;
  uniform vec3 uWarmColor;
  uniform vec3 uAccentColor;
  uniform float uAccentStrength;
  uniform float uOceanCoreMix;
  uniform float uUvDrift;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogCut;
  uniform float uFogLightReach;
  uniform float uSwampNarrow;
  uniform float uSwampChop;
  uniform float uMurkFog;
  uniform float uSwampFogFMul;
  uniform float uSwampFogFloor;
  uniform float uSwampDiscardMin;

  varying vec2 vUv;
  varying float vDepth;

  float bell(float d, float s) {
    float sig = max(0.04, s);
    float k = d / sig;
    return exp(-k * k);
  }

  void main() {
    float tSlow = uTime * uShimmerSpeed * (uStyle > 0.5 ? 0.31 : 1.0);
    float drift =
      sin(vUv.y * 2.7 + tSlow * (uStyle > 0.5 ? 0.09 : 0.22)) * uUvDrift
      + sin(vUv.y * 4.1 - tSlow * 0.14) * uUvDrift * (uStyle > 0.5 ? 0.55 : 0.0);
    float dx = abs(vUv.x - 0.5 + drift) * 2.0;
    if (uStyle > 0.5) dx *= uSwampNarrow;

    float halo = bell(dx, uDiffusion);
    float coreRaw = pow(bell(dx, uFalloff), max(0.35, uSoftness));

    float crossSec;
    float swampEnv = 0.0;
    float swampCoreH = 0.0;
    if (uStyle < 0.5) {
      crossSec = mix(halo, coreRaw, uOceanCoreMix);
      crossSec = max(crossSec, halo * 0.62);
    } else {
      // Swamp: wide soft envelope + fragmented pockets (murky water
      // interrupting the shaft — not a narrow cone or ribbon).
      float dxN = dx;
      float envelope = bell(dxN, uDiffusion * 1.72);
      envelope = mix(envelope, bell(dxN * 0.52, uDiffusion * 2.45), 0.58);
      float coreHint =
        pow(bell(dxN, uFalloff * 1.18), max(0.38, uSoftness * 0.88)) * 0.48;
      swampEnv = envelope;
      swampCoreH = coreHint;

      float fy = vUv.y * uNoiseScale * 1.12 + tSlow * 0.095;
      float fx = vUv.x * uNoiseScale * 1.28 - tSlow * 0.082;
      float murkA = sin(fy * 2.35 + sin(fx * 1.85)) * 0.5 + 0.5;
      float murkB = sin(fy * 4.6 - fx * 3.05 + tSlow * 0.11) * 0.5 + 0.5;
      float murkC =
        sin((vUv.y + vUv.x * 0.58) * uNoiseScale * 3.45 + tSlow * 0.088) * 0.5
        + 0.5;
      float pocket = mix(0.48, 1.0, murkA * 0.42 + murkB * 0.34 + murkC * 0.24);

      float streak = sin(vUv.y * uNoiseScale * 6.0 + vUv.x * 7.4 + tSlow * 0.21);
      streak = streak * 0.5 + 0.5;
      streak = mix(0.74, 1.0, streak);

      float chop =
        sin(vUv.y * uNoiseScale * 2.15 + tSlow * 0.26) *
        sin(vUv.x * uNoiseScale * 1.58 - tSlow * 0.23);
      chop = chop * 0.5 + 0.5;
      float chopMix = mix(1.0 - uSwampChop * 0.58, 1.0, chop);

      float limb = 1.0 - smoothstep(0.52, 1.28, dxN);

      crossSec = (envelope * 0.58 + coreHint) * pocket * streak * chopMix * limb;
    }

    // Soft rolloff instead of discard — avoids a popping, aliased cutoff.
    float secSoft = smoothstep(
      0.0,
      uStyle > 0.5 ? max(0.012, uSwampDiscardMin * 8.0) : 0.022,
      crossSec
    );
    crossSec *= secSoft;

    float topFade = smoothstep(1.0, uStyle > 0.5 ? 0.58 : 0.76, vUv.y);
    float botFade = smoothstep(0.0, uStyle > 0.5 ? 0.28 : 0.38, vUv.y);
    float lengthMask = topFade * botFade;

    float nFreq = uNoiseScale * (uStyle > 0.5 ? 1.5 : 0.82);
    float n1 = sin(vUv.y * nFreq * 1.25 - tSlow * 0.41 + vUv.x * 1.55);
    float n2 = sin(vUv.y * nFreq * 0.68 + tSlow * 0.22 - vUv.x * 1.05);
    float n3 = sin((vUv.x + vUv.y) * nFreq * 0.88 + tSlow * 0.3);
    float n4 =
      uStyle > 0.5
        ? sin(vUv.y * nFreq * 2.4 + vUv.x * 1.9 - tSlow * 0.55) * 0.35
        : 0.0;
    float n = (n1 + n2 + n3) / 3.0 + n4;
    float caustic = 1.0 + n * uCausticStrength * (uStyle > 0.5 ? 0.48 : 0.38);

    float warmAmt =
      uStyle > 0.5
        ? clamp(
            (swampEnv * 0.62 + swampCoreH * 1.05 + coreRaw * 0.55) *
              uColorWarmth *
              0.68,
            0.0,
            1.0
          )
        : coreRaw * uColorWarmth;
    vec3 color = mix(uColdColor, uWarmColor, clamp(warmAmt, 0.0, 1.0));

    if (uStyle < 0.5) {
      float acc = clamp((n * 0.5 + 0.5) - 0.28, 0.0, 1.0) * uAccentStrength;
      color = mix(color, uAccentColor, acc);
    } else {
      // Muddy teal fringe — extra cold channel in the penumbra.
      float fringe = 1.0 - bell(dx, uDiffusion * 2.1);
      color = mix(color, uColdColor * 1.08, fringe * 0.28);
    }

    float fogF = clamp(
      (vDepth - uFogNear) / max(0.0001, uFogFar - uFogNear),
      0.0, 1.0
    );
    if (uStyle > 0.5) fogF *= uSwampFogFMul;

    float fogAtten = (1.0 - fogF * uFogCut) * uFogLightReach;
    if (uStyle > 0.5) {
      fogAtten *= mix(1.0, 1.0 - fogF * 0.32, uMurkFog);
      fogAtten = max(fogAtten, uSwampFogFloor * (1.0 - fogF * 0.55));
    }

    float alpha =
      crossSec * lengthMask * caustic * uIntensity * uOpacity * fogAtten;

    // Feather the billboard quad so the layer dissolves before the mesh edge.
    float rimX = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
    float rimY = smoothstep(0.0, 0.11, vUv.y) * smoothstep(1.0, 0.89, vUv.y);
    alpha *= rimX * rimY;

    gl_FragColor = vec4(color * caustic, alpha);
  }
`;

function createBeamMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStyle: { value: 0 },
      uIntensity: { value: 1 },
      uOpacity: { value: 0.5 },
      uSoftness: { value: 1.5 },
      uFalloff: { value: 0.5 },
      uDiffusion: { value: 1.1 },
      uCausticStrength: { value: 0.3 },
      uNoiseScale: { value: 6 },
      uShimmerSpeed: { value: 1 },
      uColorWarmth: { value: 0.5 },
      uColdColor: { value: new THREE.Color('#6fb5cf') },
      uWarmColor: { value: new THREE.Color('#fff1c8') },
      uAccentColor: { value: new THREE.Color('#e5c0dc') },
      uAccentStrength: { value: 0.15 },
      uOceanCoreMix: { value: 0.08 },
      uUvDrift: { value: 0.03 },
      uFogNear: { value: 4 },
      uFogFar: { value: 28 },
      uFogCut: { value: 0.5 },
      uFogLightReach: { value: 1 },
      uSwampNarrow: { value: 1.2 },
      uSwampChop: { value: 0.35 },
      uMurkFog: { value: 0.8 },
      uSwampFogFMul: { value: 1 },
      uSwampFogFloor: { value: 0 },
      uSwampDiscardMin: { value: 0.00035 },
    },
  });
}

function syncMaterialFromProps(mat, props, elapsed, styleFlag) {
  mat.uniforms.uTime.value = elapsed;
  mat.uniforms.uStyle.value = styleFlag;
  mat.uniforms.uIntensity.value = props.intensity;
  mat.uniforms.uOpacity.value = props.opacity;
  mat.uniforms.uSoftness.value = props.softness;
  mat.uniforms.uFalloff.value = props.falloff;
  mat.uniforms.uDiffusion.value = props.diffusion;
  mat.uniforms.uCausticStrength.value = props.causticStrength;
  mat.uniforms.uNoiseScale.value = props.noiseScale;
  mat.uniforms.uShimmerSpeed.value = props.shimmerSpeed;
  mat.uniforms.uColorWarmth.value = props.colorWarmth;
  mat.uniforms.uColdColor.value.set(props.coldColor);
  mat.uniforms.uWarmColor.value.set(props.warmColor);
  mat.uniforms.uAccentColor.value.set(props.accentColor);
  mat.uniforms.uAccentStrength.value = props.accentStrength;
  mat.uniforms.uOceanCoreMix.value = props.oceanCoreMix;
  mat.uniforms.uUvDrift.value = props.uvDrift;
  mat.uniforms.uFogNear.value = props.fogNear;
  mat.uniforms.uFogFar.value = props.fogFar;
  mat.uniforms.uFogCut.value = props.fogCut;
  mat.uniforms.uFogLightReach.value = props.fogLightReach;
  mat.uniforms.uSwampNarrow.value = props.swampNarrow;
  mat.uniforms.uSwampChop.value = props.swampChop;
  mat.uniforms.uMurkFog.value = props.murkFog;
  mat.uniforms.uSwampFogFMul.value = props.swampFogFMul;
  mat.uniforms.uSwampFogFloor.value = props.swampFogFloor;
  mat.uniforms.uSwampDiscardMin.value = props.swampDiscardMin;
}

function placeBillboardMesh({
  mesh,
  camera,
  scratch,
  position,
  angleDegrees,
  width,
  length,
  regionSize,
}) {
  const a = (angleDegrees * Math.PI) / 180;
  scratch.direction.set(Math.sin(a), -Math.cos(a), 0).normalize();

  const halfLen = length * 0.5;
  mesh.position.set(
    position[0] + scratch.direction.x * halfLen,
    position[1] + scratch.direction.y * halfLen,
    position[2] + scratch.direction.z * halfLen,
  );

  camera.getWorldPosition(scratch.camPos);
  mesh.getWorldPosition(scratch.meshPos);
  scratch.toCam.copy(scratch.camPos).sub(scratch.meshPos);

  scratch.right.crossVectors(scratch.direction, scratch.toCam);
  const rLen = scratch.right.length();
  if (rLen < 1e-5) scratch.right.set(1, 0, 0);
  else scratch.right.multiplyScalar(1.0 / rLen);
  scratch.up.copy(scratch.direction);
  scratch.forward.crossVectors(scratch.right, scratch.up).normalize();

  scratch.basis.makeBasis(scratch.right, scratch.up, scratch.forward);
  mesh.quaternion.setFromRotationMatrix(scratch.basis);

  mesh.scale.set(width * regionSize, length, 1);
}

export default function LightBeam({
  style = 'ocean',
  secondLayer = null,
  position = [-5, 8, -6],
  angleDegrees = 18,
  width = 4.5,
  length = 16,
  regionSize = 1.8,
  intensity = 1.0,
  opacity = 0.85,
  softness = 1.5,
  falloff = 0.5,
  diffusion = 1.1,
  causticStrength = 0.35,
  noiseScale = 6.0,
  shimmerSpeed = 1.0,
  colorWarmth = 0.65,
  coldColor = '#6fb5cf',
  warmColor = '#fff1c8',
  accentColor = '#e5c0dc',
  accentStrength = 0.15,
  oceanCoreMix = 0.08,
  uvDrift = 0.03,
  fogCut = 0.55,
  fogLightReach = 1.0,
  swampNarrow = 1.2,
  swampChop = 0.35,
  murkFog = 0.75,
  /** Swamp only: scales view-space fog ramp so shafts survive deeper murk. */
  swampFogFMul = 1,
  swampFogFloor = 0,
  swampDiscardMin = 0.00035,
  fogNear = 4,
  fogFar = 28,
}) {
  const meshA = useRef();
  const meshB = useRef();
  const { camera } = useThree();

  const styleFlag = style === 'swamp' ? 1 : 0;

  const [matA, matB] = useMemo(() => [createBeamMaterial(), createBeamMaterial()], []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const scratch = useMemo(
    () => ({
      camPos: new THREE.Vector3(),
      meshPos: new THREE.Vector3(),
      toCam: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      direction: new THREE.Vector3(),
    }),
    [],
  );

  const propsBundle = {
    intensity,
    opacity,
    softness,
    falloff,
    diffusion,
    causticStrength,
    noiseScale,
    shimmerSpeed,
    colorWarmth,
    coldColor,
    warmColor,
    accentColor,
    accentStrength,
    oceanCoreMix,
    uvDrift,
    fogCut,
    fogLightReach,
    swampNarrow,
    swampChop,
    murkFog,
    swampFogFMul,
    swampFogFloor,
    swampDiscardMin,
    fogNear,
    fogFar,
  };

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    syncMaterialFromProps(matA, propsBundle, t, styleFlag);

    const mA = meshA.current;
    if (mA) {
      placeBillboardMesh({
        mesh: mA,
        camera,
        scratch,
        position,
        angleDegrees,
        width,
        length,
        regionSize,
      });
    }

    if (secondLayer && meshB.current) {
      const sl = secondLayer;
      const pos = [
        position[0] + sl.positionOffset[0],
        position[1] + sl.positionOffset[1],
        position[2] + sl.positionOffset[2],
      ];
      const ang = angleDegrees + (sl.angleDelta ?? 0);
      const w = width * (sl.widthMul ?? 0.5);
      const len = length * (sl.lengthMul ?? 0.9);
      const pb = {
        ...propsBundle,
        intensity: intensity * (sl.intensityMul ?? 0.85),
        opacity: opacity * (sl.opacityMul ?? 0.4),
      };
      syncMaterialFromProps(matB, pb, t + (sl.timePhase ?? 0.18), styleFlag);
      placeBillboardMesh({
        mesh: meshB.current,
        camera,
        scratch,
        position: pos,
        angleDegrees: ang,
        width: w,
        length: len,
        regionSize,
      });
    }
  });

  return (
    <group>
      <mesh
        ref={meshA}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={style === 'swamp' ? -2 : 2}
        geometry={geometry}
        material={matA}
      />
      {secondLayer ? (
        <mesh
          ref={meshB}
          frustumCulled={false}
          raycast={() => null}
          renderOrder={style === 'swamp' ? -2 : 2}
          geometry={geometry}
          material={matB}
        />
      ) : null}
    </group>
  );
}
