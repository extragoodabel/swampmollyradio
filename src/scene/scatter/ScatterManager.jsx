import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Decides when fish scatter.
 *
 * Two trigger sources are evaluated each frame:
 *
 *   1. RANDOM scatter -- on average every 1/randomScatterFrequency
 *      seconds, an idle fish is picked at random and pushed in a random
 *      direction. With probability `chainReactionChance` some of its
 *      nearest neighbours scatter in the same direction with a small
 *      stagger, simulating a tiny school reaction.
 *
 *   2. CAMERA-DRIVEN scatter -- when the camera moves or rotates
 *      meaningfully on this frame, any idle fish inside a forward cone
 *      and within `scatterRadius` is pushed AWAY from the camera with a
 *      small sideways jitter. Distance-weighted so fish very close to
 *      the camera have higher probability.
 *
 * The actual mutation of fish state lives in `triggerFishScatter()`;
 * this component just decides who, when, and which direction.
 *
 * Per-fish cooldown lives on the fish's own scatter record so an
 * already-spooked fish can't be retriggered until well after it has
 * recovered. This prevents the "constant retrigger" failure mode the
 * brief calls out.
 */

const TMP_TO = new THREE.Vector3();
const TMP_FWD = new THREE.Vector3();
const TMP_AWAY = new THREE.Vector3();
const TMP_SIDE = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function randomScatterDir(out) {
  const angle = Math.random() * Math.PI * 2;
  // Mostly horizontal, slight vertical jitter.
  out.set(
    Math.cos(angle),
    (Math.random() - 0.5) * 0.45,
    Math.sin(angle) * 0.85,
  );
  return out.normalize();
}

function pickNearby(origin, radius, registry, max, exclude) {
  const out = [];
  const r2 = radius * radius;
  for (const r of registry) {
    if (r === exclude) continue;
    const dx = r.position.x - origin.x;
    const dy = r.position.y - origin.y;
    const dz = r.position.z - origin.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < r2) out.push({ fish: r, d2 });
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out.slice(0, max).map((e) => e.fish);
}

export function triggerFishScatter(fish, direction, intensity, ctx) {
  const sc = fish.scatter;
  if (sc.state !== 'idle' || sc.cooldown > 0) return false;

  sc.direction.copy(direction);
  sc.intensity = intensity;
  sc.duration = ctx.duration;
  sc.recoverDuration = (ctx.duration * 2.6) / Math.max(0.1, ctx.recoverySpeed);
  sc.timer = 0;
  sc.state = 'scattering';
  // Cooldown runs from now until well after natural recovery so the
  // same fish can't be retriggered while still resettling.
  sc.cooldown = sc.duration + sc.recoverDuration + 0.6;

  if (ctx.spawnBubble) {
    ctx.spawnBubble(fish.position, direction, intensity);
  }
  return true;
}

export default function ScatterManager({
  scatterCtx,
  enabled = true,
  randomScatterFrequency = 0.25,
  scatterRadius = 4.0,
  scatterStrength = 1.2,
  scatterDuration = 0.45,
  scatterRecoverySpeed = 1.0,
  chainReactionChance = 0.55,
}) {
  const lastCamPos = useRef(new THREE.Vector3());
  const lastCamFwd = useRef(new THREE.Vector3(0, 0, -1));
  const inited = useRef(false);

  // Queued chain reactions: scatter X is staggered after the trigger so
  // it reads as a wave of reactions, not a simultaneous flinch.
  const pendingChains = useRef([]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);

    const cam = state.camera;
    TMP_FWD.set(0, 0, -1).applyQuaternion(cam.quaternion);

    if (!inited.current) {
      lastCamPos.current.copy(cam.position);
      lastCamFwd.current.copy(TMP_FWD);
      inited.current = true;
      return;
    }

    if (!enabled) {
      // Even when disabled we keep tracking camera state so re-enabling
      // mid-session doesn't pop with a stale baseline.
      lastCamPos.current.copy(cam.position);
      lastCamFwd.current.copy(TMP_FWD);
      pendingChains.current.length = 0;
      return;
    }

    // Camera deltas for this frame.
    const camLinearDelta = cam.position.distanceTo(lastCamPos.current);
    const camDot = Math.max(
      -1,
      Math.min(1, TMP_FWD.dot(lastCamFwd.current)),
    );
    const camTurnDelta = Math.acos(camDot); // radians

    const triggerCtx = {
      duration: scatterDuration,
      recoverySpeed: scatterRecoverySpeed,
      spawnBubble: scatterCtx?.bubble?.spawn ?? null,
    };

    const registry = scatterCtx?.registry ?? [];
    if (registry.length === 0) {
      lastCamPos.current.copy(cam.position);
      lastCamFwd.current.copy(TMP_FWD);
      return;
    }

    // 1. RANDOM scatter
    if (Math.random() < randomScatterFrequency * d) {
      // Try a few times in case the first pick is already scattering.
      let picked = null;
      for (let attempt = 0; attempt < 6 && !picked; attempt++) {
        const candidate =
          registry[Math.floor(Math.random() * registry.length)];
        if (
          candidate &&
          candidate.scatter.state === 'idle' &&
          candidate.scatter.cooldown <= 0
        ) {
          picked = candidate;
        }
      }
      if (picked) {
        const dir = randomScatterDir(new THREE.Vector3());
        const strength = scatterStrength * (0.9 + Math.random() * 0.5);
        triggerFishScatter(picked, dir, strength, triggerCtx);

        if (Math.random() < chainReactionChance) {
          const neighbors = pickNearby(
            picked.position,
            scatterRadius * 1.1,
            registry,
            6,
            picked,
          );
          // 2-4 of them get pulled into the reaction.
          const chainCount = 2 + Math.floor(Math.random() * 3);
          for (let n = 0; n < Math.min(chainCount, neighbors.length); n++) {
            pendingChains.current.push({
              fish: neighbors[n],
              delay: 0.05 + n * 0.06 + Math.random() * 0.10,
              direction: dir
                .clone()
                .multiplyScalar(0.65 + Math.random() * 0.45),
              intensity: strength * 0.45,
            });
          }
        }
      }
    }

    // 2. CAMERA-DRIVEN scatter
    // moveImpact rolls camera linear + angular motion into a single
    // scalar; threshold gates out idle micro-shake.
    const moveImpact = camLinearDelta * 5 + camTurnDelta * 5;
    if (moveImpact > 0.04) {
      // Cap how many camera-driven scatters can fire in one frame so a
      // big sudden turn doesn't spook the whole school.
      const cameraScattersThisFrame = { count: 0 };
      const cameraScatterCap = 2;

      for (const fish of registry) {
        if (cameraScattersThisFrame.count >= cameraScatterCap) break;
        const sc = fish.scatter;
        if (sc.state !== 'idle' || sc.cooldown > 0) continue;

        TMP_TO.subVectors(fish.position, cam.position);
        const dist = TMP_TO.length();
        if (dist > scatterRadius || dist < 0.35) continue;

        TMP_TO.multiplyScalar(1 / dist);
        const dotForward = TMP_TO.dot(TMP_FWD);
        if (dotForward < 0.45) continue; // not in forward ~63deg cone

        const distFactor = 1 - dist / scatterRadius; // 0..1
        const probability =
          moveImpact * distFactor * dotForward * 0.6;
        if (Math.random() > probability) continue;

        // Direction = away from camera, with sideways and slight
        // up/down jitter so chain reactions don't all line up.
        TMP_AWAY.copy(TMP_TO);
        TMP_SIDE.crossVectors(TMP_AWAY, UP);
        if (TMP_SIDE.lengthSq() < 1e-4) TMP_SIDE.set(1, 0, 0);
        TMP_SIDE.normalize();

        TMP_AWAY.addScaledVector(TMP_SIDE, (Math.random() - 0.5) * 0.5);
        TMP_AWAY.y += (Math.random() - 0.5) * 0.25;
        TMP_AWAY.normalize();

        const strength = scatterStrength * (0.7 + Math.random() * 0.4);
        if (triggerFishScatter(fish, TMP_AWAY, strength, triggerCtx)) {
          cameraScattersThisFrame.count += 1;

          // Mild chain reaction off the camera trigger (one extra).
          if (Math.random() < chainReactionChance * 0.5) {
            const neighbors = pickNearby(
              fish.position,
              scatterRadius * 0.8,
              registry,
              3,
              fish,
            );
            if (neighbors.length > 0) {
              pendingChains.current.push({
                fish: neighbors[0],
                delay: 0.08 + Math.random() * 0.18,
                direction: TMP_AWAY.clone(),
                intensity: strength * 0.5,
              });
            }
          }
        }
      }
    }

    // 3. Drain pending chain reactions.
    for (let i = pendingChains.current.length - 1; i >= 0; i--) {
      const c = pendingChains.current[i];
      c.delay -= d;
      if (c.delay <= 0) {
        triggerFishScatter(c.fish, c.direction, c.intensity, triggerCtx);
        pendingChains.current.splice(i, 1);
      }
    }

    lastCamPos.current.copy(cam.position);
    lastCamFwd.current.copy(TMP_FWD);
  });

  return null;
}
