import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getFishTexture } from './assets/fishTexture.js';
import {
  sampleCurrentX,
  sampleCurrentY,
  sampleCurrentZ,
} from './currents.js';

/**
 * Single fish: a textured plane.
 *
 * Texture source:
 *   - If `texture` prop is provided (the loaded salmon SVG), use it.
 *   - Otherwise fall back to the procedural canvas variant.
 * In both cases, `planeSize` controls the geometry dimensions so the
 * aspect ratio of whatever texture is supplied is preserved.
 *
 * The motion / shimmer / current / avoidance / parallax logic is
 * unchanged -- the only thing the asset swap touches is the material
 * map, the plane dimensions, and the per-fish tint color.
 */
export default function Fish({
  position,
  scale = 1,
  speed = 0.4,
  direction = 1,
  wiggleSpeed = 4,
  wiggleAmount = 0.18,
  phase = 0,
  variant = 0,
  bounds,
  opacity = 1,
  swimSpeed = 1,
  shimmerIntensity = 1,
  shimmerScale = 1,
  shimmerSeed = 0,
  canShimmer = true,
  layer = 1,
  extraParallax = 0,
  avoidanceRadius = 1.2,
  fishDistanceOpacityStrength = 1,
  texture,
  planeSize = [2, 1],
  tint = [1, 1, 1],
  fishId = 0,
  scatterCtx = null,
}) {
  const group = useRef();
  const body = useRef();
  const material = useRef();

  const fallbackTexture = useMemo(() => getFishTexture(variant), [variant]);
  const activeTexture = texture ?? fallbackTexture;

  const baseColor = useMemo(
    () => new THREE.Color(tint[0], tint[1], tint[2]),
    [tint[0], tint[1], tint[2]],
  );

  const state = useRef({
    x: position[0],
    y: position[1],
    z: position[2],
    homeY: position[1],
    homeZ: position[2],
    t: 0,
  });

  const shimmer = useRef({
    enabled: canShimmer,
    timer: 4 + shimmerSeed * 22,
    active: false,
    progress: 0,
    duration: 0.6,
  });

  // Scatter state machine. `amplitude` is the eased 0..1 displacement
  // envelope; `intensity` is its world-space magnitude in scatter
  // direction. `cooldown` is a wall-clock timer that blocks retriggers
  // until well after the recovery phase completes.
  const scatter = useRef({
    state: 'idle',
    timer: 0,
    duration: 0.45,
    recoverDuration: 1.5,
    direction: new THREE.Vector3(),
    intensity: 0,
    cooldown: 0,
    amplitude: 0,
  });

  // Registry entry exposed to ScatterManager. Position is overwritten
  // each frame so the manager can query "where is fish N right now"
  // for radius/cone tests.
  const registryEntry = useMemo(
    () => ({
      id: fishId,
      position: new THREE.Vector3(position[0], position[1], position[2]),
      scatter: scatter.current,
      facing: direction,
    }),
    // facing/direction is stable, position object is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fishId],
  );

  useEffect(() => {
    if (!scatterCtx) return undefined;
    scatterCtx.registry.push(registryEntry);
    return () => {
      const idx = scatterCtx.registry.indexOf(registryEntry);
      if (idx >= 0) scatterCtx.registry.splice(idx, 1);
    };
  }, [scatterCtx, registryEntry]);

  useFrame((rootState, delta) => {
    const s = state.current;
    const d = Math.min(delta, 0.05);
    s.t += d;

    // Advance scatter state machine FIRST so the rest of the frame can
    // read the current amplitude / speed boost.
    const sc = scatter.current;
    if (sc.cooldown > 0) sc.cooldown = Math.max(0, sc.cooldown - d);

    if (sc.state === 'scattering') {
      sc.timer += d;
      if (sc.timer >= sc.duration) {
        sc.state = 'recovering';
        sc.timer = 0;
      }
    } else if (sc.state === 'recovering') {
      sc.timer += d;
      if (sc.timer >= sc.recoverDuration) {
        sc.state = 'idle';
        sc.timer = 0;
        sc.amplitude = 0;
      }
    }

    if (sc.state === 'scattering') {
      const u = sc.timer / sc.duration;
      // easeOutCubic, 0 -> 1: sharp acceleration into the peak.
      sc.amplitude = 1 - Math.pow(1 - u, 3);
    } else if (sc.state === 'recovering') {
      const u = sc.timer / sc.recoverDuration;
      // easeInQuad reversed, 1 -> 0: slow, settling return.
      sc.amplitude = (1 - u) * (1 - u);
    }

    const cx = sampleCurrentX(s.x, s.y, s.z, s.t);
    const cy = sampleCurrentY(s.x, s.y, s.z, s.t);
    const cz = sampleCurrentZ(s.x, s.y, s.z, s.t);

    // During scattering the fish also tracks forward through the
    // current faster; this gives the dart its sense of "speed boost"
    // beyond the lateral displacement.
    const swimBoost = 1 + sc.amplitude * 2.2;

    s.x += (direction * speed + cx * 0.35) * d * swimSpeed * swimBoost;
    if (direction > 0 && s.x > bounds.x) s.x = -bounds.x;
    else if (direction < 0 && s.x < -bounds.x) s.x = bounds.x;

    const targetY = s.homeY + cy;
    s.y += (targetY - s.y) * Math.min(1, d * 1.6);

    s.z = s.homeZ + cz * 0.5;

    let displayX = s.x;
    let displayY = s.y;
    let displayZ = s.z;

    // Scatter displacement on top of natural motion. When the recovery
    // phase ends, amplitude == 0 again and the fish has returned to
    // the cluster's current path -- no permanent drift.
    if (sc.amplitude > 0) {
      const o = sc.amplitude * sc.intensity;
      displayX += sc.direction.x * o;
      displayY += sc.direction.y * o;
      displayZ += sc.direction.z * o;
    }

    const cam = rootState.camera.position;
    const mx = rootState.mouse.x;
    const my = rootState.mouse.y;

    displayX += mx * extraParallax * 0.6;
    displayY += my * extraParallax * 0.4;

    if (avoidanceRadius > 0) {
      const ax = displayX - cam.x;
      const ay = displayY - cam.y;
      const az = displayZ - cam.z;
      const dist2 = ax * ax + ay * ay + az * az;
      const R = avoidanceRadius;
      if (dist2 < R * R) {
        const dist = Math.sqrt(dist2) || 0.0001;
        const k = (R - dist) / R;
        const push = k * k * R;
        displayX += (ax / dist) * push;
        displayY += (ay / dist) * push;
        displayZ += (az / dist) * push * 0.5;
      }
    }

    if (group.current) {
      group.current.position.set(displayX, displayY, displayZ);
    }

    // Push the live world position back to the scatter registry so the
    // manager can do radius/cone tests without re-deriving positions.
    if (registryEntry) {
      registryEntry.position.set(displayX, displayY, displayZ);
    }

    if (body.current) {
      // Tail wags faster during a dart -- visual cue that the fish is
      // accelerating, even though the actual lateral motion is driven
      // by the scatter offset above.
      const wagSpeedMult = 1 + sc.amplitude * 1.6;
      const wag = Math.sin(s.t * wiggleSpeed * wagSpeedMult + phase);

      // Small extra rotation toward the dart direction: positive Y in
      // the scatter direction tilts the head up, negative tilts down.
      // Sign is flipped for left-facing fish so they tilt visually,
      // not just in mesh-local space.
      const facingSign = direction < 0 ? -1 : 1;
      const scatterTilt = sc.amplitude * sc.direction.y * facingSign * 0.55;

      body.current.rotation.z = wag * wiggleAmount * 0.25 + scatterTilt;
      const stretch = 1 + Math.sin(s.t * wiggleSpeed * 2 + phase) * 0.04;
      body.current.scale.x = (direction < 0 ? -1 : 1) * stretch;
      body.current.scale.y = 1 + Math.cos(s.t * wiggleSpeed + phase) * 0.02;
    }

    const sh = shimmer.current;
    if (sh.enabled) {
      if (sh.active) {
        sh.progress += d / sh.duration;
        if (sh.progress >= 1) {
          sh.active = false;
          sh.progress = 0;
          sh.timer = 6 + Math.random() * 22;
        }
      } else {
        sh.timer -= d;
        if (sh.timer <= 0) {
          sh.active = true;
          sh.duration = 0.45 + Math.random() * 0.55;
        }
      }
    }
    const env = sh.active ? Math.sin(sh.progress * Math.PI) : 0;
    const boost = env * shimmerIntensity * shimmerScale;

    // Scatter gives a subtle opacity / colour bump on top of the
    // regular shimmer envelope, so the spooked fish catches a little
    // more light during its dart.
    const scatterBoost = sc.amplitude * 0.35;
    const totalBoost = boost + scatterBoost;

    if (material.current) {
      const fadedOpacity =
        1 + (opacity - 1) * fishDistanceOpacityStrength;
      material.current.opacity = Math.min(
        1,
        fadedOpacity + totalBoost * 0.4,
      );
      material.current.color.setRGB(
        Math.min(1, baseColor.r + totalBoost * 0.45),
        Math.min(1, baseColor.g + totalBoost * 0.45),
        Math.min(1, baseColor.b + totalBoost * 0.45),
      );
    }
    if (group.current) {
      const grow = 1 + totalBoost * 0.08;
      group.current.scale.setScalar(scale * grow);
    }
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <mesh ref={body}>
        <planeGeometry args={planeSize} />
        <meshBasicMaterial
          ref={material}
          map={activeTexture}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
