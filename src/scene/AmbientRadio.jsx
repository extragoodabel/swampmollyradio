import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadio } from '../audio/RadioContext.jsx';
import { getHaloTexture } from './assets/haloTexture.js';
import { getDustTexture } from './assets/dustTexture.js';

/**
 * Diegetic underwater radio beacon.
 *
 * Visual structure:
 *   - inner icosahedron (the "lamp"): solid emissive-looking
 *     basic-material orb.
 *   - billboard halo sprite: camera-facing additive radial gradient
 *     that fakes bloom without needing post-processing.
 *   - orbiting particle ring: a single Points draw call with ~24
 *     points moving on biased Lissajous-ish paths around the orb.
 *
 * Interaction:
 *   - The whole group has an onPointerDown listener that calls
 *     `useRadio().toggle()`. R3F's raycaster handles the click test
 *     against the inner mesh; the halo sprite and particles have
 *     pointer events disabled so they don't block clicks on the orb
 *     and don't fight the camera drag handler on the canvas.
 *
 * Motion:
 *   - Slow positional bob (sine waves on each axis at different rates)
 *   - Lazy yaw spin
 *   - Pulse: stronger sinusoid while `isPlaying`, gentle "breathing"
 *     while idle. Pulse drives both inner-orb scale and halo opacity.
 *
 * The orb cursors to pointer hover via the `hovered` ref so the user
 * gets a small visual hint that the object is interactive.
 */

function makeOrbitPositions(count, seed = 0) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3 + 0] = 0;
    arr[i * 3 + 1] = 0;
    arr[i * 3 + 2] = 0;
  }
  return arr;
}

function makeOrbitSeeds(count) {
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4 + 0] = 0.45 + Math.random() * 0.45; // base orbit radius
    arr[i * 4 + 1] = Math.random() * Math.PI * 2; // azimuth phase
    arr[i * 4 + 2] = 0.15 + Math.random() * 0.45; // angular speed
    arr[i * 4 + 3] = 0.3 + Math.random() * 0.7; // vertical amplitude
  }
  return arr;
}

const ORBIT_COUNT = 24;

export default function AmbientRadio({
  position = [3, 0.5, -5],
  glowIntensity = 1,
  enabled = true,
}) {
  const groupRef = useRef();
  const innerRef = useRef();
  const haloRef = useRef();
  const innerMat = useRef();
  const haloMat = useRef();
  const orbitRef = useRef();
  const hovered = useRef(false);

  const { isPlaying, isLoading, toggle } = useRadio();

  const haloTexture = useMemo(() => getHaloTexture(), []);
  const dustTexture = useMemo(() => getDustTexture(), []);
  const orbitPositions = useMemo(() => makeOrbitPositions(ORBIT_COUNT), []);
  const orbitSeeds = useMemo(() => makeOrbitSeeds(ORBIT_COUNT), []);

  useFrame((state, delta) => {
    if (!enabled) return;
    const t = state.clock.elapsedTime;

    // Whole-group bob + slow yaw.
    if (groupRef.current) {
      groupRef.current.position.set(
        position[0] + Math.sin(t * 0.32) * 0.10,
        position[1] + Math.cos(t * 0.41) * 0.08,
        position[2] + Math.sin(t * 0.27) * 0.06,
      );
      groupRef.current.rotation.y = t * 0.18;
    }

    // Pulse envelope: louder beat when playing, gentle breath when idle.
    const beat = Math.sin(t * 3.0) * 0.5 + Math.sin(t * 5.3) * 0.35;
    const playMix = isPlaying ? 1 : 0;
    const pulse = 1 + (isPlaying ? beat * 0.18 : Math.sin(t * 1.0) * 0.04);
    const hoverBoost = hovered.current ? 1.2 : 1.0;

    if (innerRef.current) {
      innerRef.current.scale.setScalar(pulse);
    }
    if (haloRef.current) {
      // Halo scale also tracks beat plus a small base size so the orb
      // always has visible glow even when paused.
      const haloScale = 1.6 + pulse * 0.45 + playMix * 0.25;
      haloRef.current.scale.set(haloScale, haloScale, haloScale);
    }

    // Materials: opacity / colour shift between idle and playing.
    if (innerMat.current) {
      const baseAlpha = isPlaying ? 0.95 : 0.65;
      const loadFlicker = isLoading ? 0.85 + Math.sin(t * 9) * 0.15 : 1.0;
      innerMat.current.opacity =
        baseAlpha * glowIntensity * hoverBoost * loadFlicker;
      // Subtle warm-up when playing, cooler & dimmer when paused.
      const target = isPlaying ? warm : cool;
      innerMat.current.color.lerp(target, 0.05);
    }
    if (haloMat.current) {
      const baseAlpha = isPlaying ? 0.85 : 0.45;
      haloMat.current.opacity = baseAlpha * glowIntensity * hoverBoost;
    }

    // Orbiting particles: per-particle Lissajous-style path. Speeds and
    // radii vary per particle so they don't form a ring.
    const op = orbitRef.current?.geometry?.attributes?.position;
    if (op) {
      const arr = op.array;
      const tEff = t * (isPlaying ? 1.0 : 0.35);
      for (let i = 0; i < ORBIT_COUNT; i++) {
        const radius = orbitSeeds[i * 4 + 0];
        const phase = orbitSeeds[i * 4 + 1];
        const omega = orbitSeeds[i * 4 + 2];
        const vAmp = orbitSeeds[i * 4 + 3];
        const a = phase + tEff * omega;
        arr[i * 3 + 0] = Math.cos(a) * radius;
        arr[i * 3 + 1] = Math.sin(tEff * omega * 1.3 + phase) * vAmp * 0.5;
        arr[i * 3 + 2] = Math.sin(a) * radius;
      }
      op.needsUpdate = true;
    }
  });

  if (!enabled) return null;

  return (
    <group
      ref={groupRef}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        hovered.current = false;
        document.body.style.cursor = '';
      }}
      onPointerDown={(e) => {
        // stopPropagation so the canvas drag-to-turn handler doesn't
        // start a yaw drag when the user clicks the beacon.
        e.stopPropagation();
        toggle();
      }}
    >
      {/* Inner lamp -- visually small. */}
      <mesh ref={innerRef} raycast={() => null}>
        <icosahedronGeometry args={[0.22, 1]} />
        <meshBasicMaterial
          ref={innerMat}
          color={'#9be7f2'}
          transparent
          opacity={0.8}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/*
        Invisible click hitbox: significantly larger than the visible
        orb so the user can hit it through the halo, and so the small
        orb staying in focus while bobbing doesn't make clicks fiddly.
        `colorWrite={false}` + `opacity={0}` is the standard "ghost
        mesh" pattern -- not drawn, but the raycaster still picks it.
        Radius is generous (~1.0 world units) so the visible halo at
        the orb's distance translates to a comfortable ~50px target.
      */}
      <mesh>
        <sphereGeometry args={[1.0, 16, 12]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>

      {/* Halo billboard. Click-through so the inner orb stays clickable. */}
      <sprite ref={haloRef} raycast={() => null}>
        <spriteMaterial
          ref={haloMat}
          map={haloTexture}
          transparent
          depthWrite={false}
          toneMapped={false}
          color={'#bef3fb'}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* Orbiting particle dust around the beacon. */}
      <points ref={orbitRef} raycast={() => null} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={ORBIT_COUNT}
            array={orbitPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={dustTexture}
          size={0.1}
          color={'#bdeaf2'}
          transparent
          depthWrite={false}
          opacity={0.85}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

const warm = new THREE.Color('#cdeff5');
const cool = new THREE.Color('#79b6c0');
