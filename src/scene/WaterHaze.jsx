import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Camera-attached volumetric water haze.
 *
 * Rather than world-locked planes (which go edge-on when the viewer
 * yaws 90deg under the drag-to-turn camera), the haze layers live in a
 * group that tracks `camera.position` and `camera.quaternion` every
 * frame. The planes therefore always sit in front of the view at fixed
 * distances, simulating the water medium being everywhere around the
 * viewer no matter which way they look.
 *
 * To keep the water from feeling "stuck to the lens", the fragment
 * shader samples its noise from WORLD position. When the camera turns
 * or moves, the same plane shows a different slice of the world-space
 * noise field -- so you do see "different water" as you look around.
 *
 * Each layer also carries a soft caustic-band component (diagonal
 * streaks driven by a sine of world position) that's strongest on a
 * single middle layer and faint on the others, giving the impression
 * of refracted light beams without a separate component.
 */

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec2 uDrift;
  uniform float uNoiseScale;
  uniform float uSpeed;
  uniform float uCaustic;
  uniform vec3 uCausticColor;
  uniform float uCausticPower;
  uniform float uAbyssVertFade;
  uniform float uLuminousOcean;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 wp = vWorldPos.xy * 0.10;
    vec2 p  = wp * uNoiseScale + uDrift * uTime * uSpeed;

    float nSharp = noise(p) * 0.55
            + noise(p * 2.3) * 0.30
            + noise(p * 5.0) * 0.15;
    float nSoft = noise(p) * 0.68 + noise(p * 1.35) * 0.32;
    float n = mix(nSharp, nSoft, clamp(uLuminousOcean * 1.15, 0.0, 1.0));

    // Diagonal caustic streaks, anchored in world coords so they flow
    // across the field rather than scrolling on the plane surface.
    float bandPhase = (vWorldPos.x + vWorldPos.y) * 0.28
                    + uTime * 0.22 * uSpeed;
    float band = sin(bandPhase) * 0.5 + 0.5;
    band = pow(band, uCausticPower);
    float caustic = band * uCaustic;

    float band2 = sin((vWorldPos.x * 0.63 - vWorldPos.z * 0.48 + vWorldPos.y * 0.22)
                    + uTime * 0.31 * uSpeed);
    band2 = pow(abs(band2) * 0.5 + 0.5, 4.5);
    caustic += band2 * uCaustic * 0.65 * uLuminousOcean;

    float warmPool = sin(vWorldPos.x * 0.09 + vWorldPos.y * 0.07 + uTime * 0.18);
    warmPool = pow(clamp(warmPool * 0.5 + 0.5, 0.0, 1.0), 3.2);
    caustic += warmPool * uCaustic * 0.55 * uLuminousOcean;

    // --- Salmon Days (uLuminousOcean): hide carrier-quad edges; only soft shafts.
    float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    float edgeFeather = pow(1.0 - smoothstep(0.12, 0.92, edge), 2.35);

    float sp = mix(6.2, 3.25, clamp(uLuminousOcean, 0.0, 1.0));
    float dShaft1 = sin((vWorldPos.x * 0.52 + vWorldPos.y * 0.48 + vWorldPos.z * 0.22) * 0.72
                      + uTime * 0.26 * uSpeed);
    dShaft1 = pow(abs(dShaft1) * 0.5 + 0.5, sp);
    float dShaft2 = sin((vWorldPos.x * -0.38 + vWorldPos.z * 0.44 - vWorldPos.y * 0.16) * 0.88
                      + uTime * 0.21 * uSpeed);
    dShaft2 = pow(abs(dShaft2) * 0.5 + 0.5, sp * 0.92);
    float dShaft3 = sin((vWorldPos.y * 0.61 + vWorldPos.x * -0.29) * 0.65 + uTime * 0.17 * uSpeed);
    dShaft3 = pow(abs(dShaft3) * 0.5 + 0.5, sp * 1.08);
    float shaftField = clamp(
      caustic * 1.08 + dShaft1 * uCaustic * 0.62 + dShaft2 * uCaustic * 0.58 + dShaft3 * uCaustic * 0.42,
      0.0, 2.2);
    float shafts = pow(smoothstep(0.04, 0.82, shaftField), 1.38);

    vec3 col = uColor + uCausticColor * caustic * (0.35 + 0.55 * uLuminousOcean);

    float alphaFill = uOpacity * mix(0.45, 1.0, n) + caustic * uOpacity * (0.5 + 0.55 * uLuminousOcean);
    float alphaOcean = (uOpacity * (0.035 + 0.045 * n)
      + uOpacity * shafts * (0.68 + 0.28 * uCaustic)) * edgeFeather;

    float alpha = mix(alphaFill, alphaOcean, step(0.5, uLuminousOcean));

    vec3 dimFog = uColor * vec3(0.38, 0.5, 0.62);
    float beamVis = clamp(shafts * 1.05 + 0.12, 0.0, 1.0);
    col = mix(col, mix(dimFog, col, beamVis), step(0.5, uLuminousOcean));

    if (uAbyssVertFade > 0.001) {
      float below = smoothstep(2.0, -28.0, vWorldPos.y * uAbyssVertFade);
      alpha *= mix(1.0, 0.42 + n * 0.35, below);
    }

    gl_FragColor = vec4(col, alpha);
  }
`;

function HazeLayer({
  distance,
  size,
  planeHeightFrac = 0.7,
  opacityScale,
  drift,
  noiseScale,
  caustic,
  opacity,
  speed,
  color,
  causticColor,
  causticPower = 6,
  abyssVertFade = 0,
  luminousOcean = 0,
}) {
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: opacity * opacityScale },
      uColor: { value: new THREE.Color(color) },
      uDrift: { value: new THREE.Vector2(drift[0], drift[1]) },
      uNoiseScale: { value: noiseScale },
      uSpeed: { value: speed },
      uCaustic: { value: caustic },
      uCausticColor: { value: new THREE.Color(causticColor) },
      uCausticPower: { value: causticPower },
      uAbyssVertFade: { value: abyssVertFade },
      uLuminousOcean: { value: luminousOcean },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uTime.value += delta;
    u.uOpacity.value = opacity * opacityScale;
    u.uColor.value.set(color);
    u.uSpeed.value = speed;
    u.uCausticPower.value = causticPower;
    u.uAbyssVertFade.value = abyssVertFade;
    u.uLuminousOcean.value = luminousOcean;
  });

  return (
    // raycast disabled -- haze planes sit between the camera and any
    // interactive object (e.g. the ambient radio beacon). They are
    // purely decorative and should never intercept pointer events.
    <mesh
      position={[0, 0, -distance]}
      frustumCulled={false}
      raycast={() => null}
    >
      <planeGeometry args={[size, size * planeHeightFrac, 1, 1]} />
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

/**
 * `hazeProfile` tunes camera-locked sheet distances so the medium
 * reads as volume rather than a flat overlay. `swamp` / `salmon` are
 * theme-mapped from Scene.jsx.
 */
export default function WaterHaze({
  layerCount = 4,
  opacity = 0.15,
  speed = 1,
  color = '#0e3850',
  causticColor = '#7fb8c8',
  hazeProfile = 'default',
  causticPower = 6,
  abyssVertFade = 0,
  /** Salmon Days: stronger warm caustics + secondary beams in the fragment shader. */
  luminousOcean = 0,
}) {
  const groupRef = useRef();

  /**
   * Static per-layer geometry / drift / caustic config.
   * Depends only on layerCount so it doesn't re-allocate when the
   * Leva color or opacity slider moves. Colour and opacity flow
   * through to each HazeLayer as plain props.
   */
  const layers = useMemo(() => {
    if (layerCount <= 0) return [];
    const arr = [];

    const profile =
      hazeProfile === 'salmon'
        ? {
            // Keep sheets well ahead of the camera so they never read as a
            // low “ceiling” of quads (Salmon Days only — swamp unchanged).
            distances: [62, 82, 105, 132, 165, 198],
            distanceMul: 1,
            sizeMul: 1.12,
            /** world-units margin: plane half-extent ≈ distance * mul + bias */
            fovCoverMul: 2.75,
            sizeBias: 140,
            opacityScaleMul: 0.72,
            causticMul: 1.05,
            causticPower: 4.1,
            driftSpeedMul: 1.22,
            planeHeightFrac: 0.92,
          }
        : hazeProfile === 'swamp'
          ? {
              distances: [5.2, 11.5, 19.5, 30],
              distanceMul: 1,
              sizeMul: 0.82,
              opacityScaleMul: 0.88,
              causticMul: 0.88,
            }
          : {
              distances: [3.5, 8.5, 15, 24],
              distanceMul: 1,
              sizeMul: 1,
              opacityScaleMul: 1,
              causticMul: 1,
              causticPower: 6,
            };

    const profileCausticPower = profile.causticPower ?? 6;
    const driftSpeedMul = profile.driftSpeedMul ?? 1;

    const baseCaustic =
      hazeProfile === 'salmon'
        ? [0.48, 0.62, 0.52, 0.42, 0.38, 0.34]
        : [0.05, 0.4, 0.18, 0.05];

    for (let i = 0; i < layerCount; i++) {
      const tt = layerCount > 1 ? i / (layerCount - 1) : 0;
      const distance =
        (profile.distances[i] ?? 4 + i * 6) * profile.distanceMul;
      // Default sizing (swamp / generic): modest planes close to camera.
      let size = (16 + tt * 70) * profile.sizeMul;
      let planeH = 0.7;
      // Salmon Days: carrier quads must cover the full frustum with margin — the
      // shader masks visible contribution to diagonal beams only, but geometry
      // edges must sit far outside the view to avoid rectangular silhouettes.
      if (hazeProfile === 'salmon') {
        const cover = distance * profile.fovCoverMul + profile.sizeBias;
        size = Math.max(cover, (90 + tt * 60) * profile.sizeMul);
        planeH = profile.planeHeightFrac ?? 0.88;
      }
      const opacityScale =
        (0.6 + (1 - Math.abs(tt - 0.5) * 1.4) * 0.7) *
        profile.opacityScaleMul;
      const drift = [
        Math.cos(i * 1.3 + 0.4) * 0.06,
        Math.sin(i * 0.9 + 1.2) * 0.04,
      ];
      const noiseScale = 0.8 + tt * 1.4;
      const caustic =
        (baseCaustic[i] ?? 0.05) * profile.causticMul;

      arr.push({
        id: i,
        distance,
        size,
        planeHeightFrac: planeH,
        opacityScale,
        drift,
        noiseScale,
        caustic,
        causticPower: profileCausticPower,
        speedMul: driftSpeedMul,
      });
    }
    return arr;
  }, [layerCount, hazeProfile]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    g.position.copy(state.camera.position);
    g.quaternion.copy(state.camera.quaternion);
  });

  return (
    <group ref={groupRef}>
      {layers.map((l) => (
        <HazeLayer
          key={l.id}
          distance={l.distance}
          size={l.size}
          planeHeightFrac={l.planeHeightFrac ?? 0.7}
          opacityScale={l.opacityScale}
          drift={l.drift}
          noiseScale={l.noiseScale}
          caustic={l.caustic}
          opacity={opacity}
          speed={speed * (l.speedMul ?? 1)}
          color={color}
          causticColor={causticColor}
          causticPower={l.causticPower}
          abyssVertFade={abyssVertFade}
          luminousOcean={luminousOcean}
        />
      ))}
    </group>
  );
}
