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

    float n = noise(p) * 0.55
            + noise(p * 2.3) * 0.30
            + noise(p * 5.0) * 0.15;

    // Diagonal caustic streaks, anchored in world coords so they flow
    // across the field rather than scrolling on the plane surface.
    float bandPhase = (vWorldPos.x + vWorldPos.y) * 0.28
                    + uTime * 0.22 * uSpeed;
    float band = sin(bandPhase) * 0.5 + 0.5;
    band = pow(band, 6.0);
    float caustic = band * uCaustic;

    vec3 col = uColor + uCausticColor * caustic * 0.35;
    float alpha = uOpacity * mix(0.45, 1.0, n) + caustic * uOpacity * 0.5;

    gl_FragColor = vec4(col, alpha);
  }
`;

function HazeLayer({
  distance,
  size,
  opacityScale,
  drift,
  noiseScale,
  caustic,
  opacity,
  speed,
  color,
  causticColor,
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
      <planeGeometry args={[size, size * 0.7, 1, 1]} />
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

export default function WaterHaze({
  layerCount = 4,
  opacity = 0.15,
  speed = 1,
  color = '#0e3850',
  causticColor = '#7fb8c8',
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
    const distances = [3.5, 8.5, 15, 24];
    const causticByIndex = [0.05, 0.4, 0.18, 0.05];

    for (let i = 0; i < layerCount; i++) {
      const tt = layerCount > 1 ? i / (layerCount - 1) : 0;
      const distance = distances[i] ?? 4 + i * 6;
      const size = 16 + tt * 70;
      const opacityScale = 0.6 + (1 - Math.abs(tt - 0.5) * 1.4) * 0.7;
      const drift = [
        Math.cos(i * 1.3 + 0.4) * 0.06,
        Math.sin(i * 0.9 + 1.2) * 0.04,
      ];
      const noiseScale = 0.8 + tt * 1.4;
      const caustic = causticByIndex[i] ?? 0.05;

      arr.push({
        id: i,
        distance,
        size,
        opacityScale,
        drift,
        noiseScale,
        caustic,
      });
    }
    return arr;
  }, [layerCount]);

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
          opacityScale={l.opacityScale}
          drift={l.drift}
          noiseScale={l.noiseScale}
          caustic={l.caustic}
          opacity={opacity}
          speed={speed}
          color={color}
          causticColor={causticColor}
        />
      ))}
    </group>
  );
}
