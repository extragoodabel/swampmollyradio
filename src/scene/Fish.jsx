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
 * Texture source priority:
 *   1. If `isRider` and `riderTexture` is provided -> the #99 rider
 *      WebP. Exactly one fish per school carries this.
 *   2. Else if `texture` is provided (the new pixel-art WebP, or
 *      the legacy SVG via SalmonSvgFallback) -> use that.
 *   3. Else -> procedural canvas fallback.
 *
 * The active texture also drives:
 *   - the plane's aspect ratio (so the rider's taller sprite is
 *     never stretched into the default 2:1 box, and the default
 *     sprite is never squashed), and
 *   - the horizontal flip sign: pixels in the new WebP art face
 *     left, so swimming right requires `scale.x = -1`. The legacy
 *     SVG and the procedural fallback face right and use the
 *     opposite convention. `textureFacesLeft` toggles which.
 *
 * The motion / shimmer / current / avoidance / parallax logic is
 * unchanged.
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
  riderTexture,
  isRider = false,
  riderCanScatter = true,
  textureFacesLeft = false,
  baseWidth = 2,
  tint = [1, 1, 1],
  fishId = 0,
  scatterCtx = null,
}) {
  const group = useRef();
  const body = useRef();
  const material = useRef();

  const fallbackTexture = useMemo(() => getFishTexture(variant), [variant]);

  // Resolve which texture to actually render. The rider gets its
  // own; everyone else gets the school's default; if even that
  // failed to load, drop to the procedural canvas.
  const activeTexture =
    (isRider && riderTexture) ? riderTexture : (texture ?? fallbackTexture);

  // The procedural fallback always faces RIGHT. Only honour the
  // `textureFacesLeft` flag when we're actually rendering a real
  // school texture (the WebP or SVG); otherwise the legacy
  // right-facing flip logic must apply.
  const activeFacesLeft =
    activeTexture === riderTexture || activeTexture === texture
      ? textureFacesLeft
      : false;

  // Per-fish plane dimensions derived from whichever texture this
  // particular fish ended up with. The rider sprite is taller than
  // the default sprite, so we cannot share a single `planeSize`
  // across the school.
  const planeSize = useMemo(() => {
    const img = activeTexture?.image;
    if (img && img.width && img.height) {
      const aspect = img.width / img.height;
      return [baseWidth, baseWidth / aspect];
    }
    return [baseWidth, baseWidth / 2];
  }, [activeTexture, baseWidth]);

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
      // The rider can be opted out of scatter via Leva; default true.
      canScatter: !isRider || riderCanScatter,
    }),
    // facing/direction is stable, position object is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fishId, isRider, riderCanScatter],
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
      // `textureSign` encodes whether the source art needs mirroring
      // to align with +X. Art that faces RIGHT (legacy SVG /
      // procedural) uses +1; art that faces LEFT (new pixel-art
      // WebP) uses -1. The direction multiplier then mirrors when
      // the fish swims the opposite way. Net result:
      //   - left-facing art swimming left  -> scale.x = +1 (as-is)
      //   - left-facing art swimming right -> scale.x = -1 (flipped)
      //   - right-facing art swimming left -> scale.x = -1 (flipped)
      //   - right-facing art swimming right -> scale.x = +1 (as-is)
      const textureSign = activeFacesLeft ? -1 : 1;
      body.current.scale.x =
        textureSign * (direction < 0 ? -1 : 1) * stretch;
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
      {/*
        raycast={null} so fish never intercept pointer events from the
        canvas. We want the ambient radio beacon (and any future
        interactive props) to remain clickable even when a fish is
        rendered in front of it.

        frustumCulled={false} because a fish that gets pushed very
        close to the camera by the avoidance offset can drift its
        bounding sphere outside the side frustum during a fast
        drag; default culling then yanks the whole sprite off
        screen for a frame or two, which reads as the fish
        "blinking" out and back in. The mesh is cheap enough to
        unconditionally draw -- ~90 hero fish, each one plane.
      */}
      <mesh ref={body} raycast={() => null} frustumCulled={false}>
        <planeGeometry args={planeSize} />
        <meshBasicMaterial
          ref={material}
          map={activeTexture}
          // alphaTest discards near-transparent pixels at the
          // sprite's silhouette so the pixel-art salmon renders
          // with crisp edges. 0.5 was too aggressive: edge pixels
          // that hover near the threshold flicker on and off as
          // the fish moves sub-pixel amounts close to the camera.
          // 0.2 still hides the soft anti-alias halo of the WebP
          // sprites without pop. `transparent` stays on so the
          // per-fish opacity fade + shimmer envelope still
          // modulate the sprite as a whole.
          transparent
          alphaTest={0.2}
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
