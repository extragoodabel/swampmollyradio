import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useRadio } from '../audio/RadioContext.jsx';
import { AQ_TOUCH_DEBUG } from '../debug/aquariumRecovery.js';

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function finiteVec3Components(min, max) {
  const bx = Number.isFinite(min.x) && Number.isFinite(max.x);
  const by = Number.isFinite(min.y) && Number.isFinite(max.y);
  const bz = Number.isFinite(min.z) && Number.isFinite(max.z);
  return bx && by && bz && min.x <= max.x && min.y <= max.y && min.z <= max.z;
}

/** Leva / localStorage can restore numeric sliders as strings — coerce before math. */
function tripletFromBounds(arr, fb0, fb1, fb2) {
  const a0 = Number(arr?.[0]);
  const a1 = Number(arr?.[1]);
  const a2 = Number(arr?.[2]);
  return [
    Number.isFinite(a0) ? a0 : fb0,
    Number.isFinite(a1) ? a1 : fb1,
    Number.isFinite(a2) ? a2 : fb2,
  ];
}

function n(x, fb) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fb;
}

function repairBoundsMinMax(min, max) {
  if (min.x > max.x) {
    const t = min.x;
    min.x = max.x;
    max.x = t;
  }
  if (min.y > max.y) {
    const t = min.y;
    min.y = max.y;
    max.y = t;
  }
  if (min.z > max.z) {
    const t = min.z;
    min.z = max.z;
    max.z = t;
  }
}

function clampPositionWithVelocity(pos, vel, min, max) {
  if (pos.x < min.x) {
    pos.x = min.x;
    vel.x = Math.max(0, vel.x);
  } else if (pos.x > max.x) {
    pos.x = max.x;
    vel.x = Math.min(0, vel.x);
  }
  if (pos.y < min.y) {
    pos.y = min.y;
    vel.y = Math.max(0, vel.y);
  } else if (pos.y > max.y) {
    pos.y = max.y;
    vel.y = Math.min(0, vel.y);
  }
  if (pos.z < min.z) {
    pos.z = min.z;
    vel.z = Math.max(0, vel.z);
  } else if (pos.z > max.z) {
    pos.z = max.z;
    vel.z = Math.min(0, vel.z);
  }
}

/**
 * Underwater camera rig.
 *
 * Body model: the viewer’s body sits at a draggable 3D anchor
 * (`rigPosition`). Pointer drag rotates the view (yaw + pitch) with
 * inertia — not Street-View “rotate world”, but look around from a
 * drifting body. Scroll / trackpad adds **translation impulse** along
 * whatever direction the camera currently faces (true lateral + forward
 * traversal in world space), with heavy water drag and a soft chase
 * lerp so motion feels buoyant rather than FPS-like.
 *
 * Composition layers on top of the anchor:
 *   1. Pointer drag   → yaw/pitch (+ angular inertia).
 *   2. Wheel/trackpad → impulse along −Z_local in camera space
 *                       (into the scene when looking straight ahead),
 *                       matching the legacy “scroll into the school”
 *                       polarity from the old Z-only rail.
 *   3. Hover parallax → tiny additive XY (muted while dragging).
 *   4. Idle sway      → slow position sine bob.
 *
 * Orientation: quaternion from Euler YXZ. Translation clipping uses an
 * axis-aligned volume (`boundsMin` / `boundsMax`) so open-ocean and
 * swamp ranges can differ per theme.
 */
export default function CameraRig({
  basePosition = [0, 0, 6],
  /** When this string changes (e.g. theme id), the rig re-anchors to `basePosition` and velocity clears. */
  anchorResetKey = '',
  boundsMin = [-14, -7, -8],
  boundsMax = [14, 8, 15],
  hoverParallax = { x: 0.6, y: 0.4 },
  hoverParallaxStrength = 1,
  scrollDepthStrength = 1,
  idleSway = 1,
  dragSensitivity = 1,
  dragDamping = 0.7,
  inertiaStrength = 1,
  maxPitchDegrees = 70,
  /** Lerp factor toward the smoothed sway/parallax target each frame (underwater lag). */
  positionSmoothing = 0.095,
  /** Wheel impulse softness — higher resists building speed (water mass). */
  swimImpulseDamp = 0.09,
  /** Exponential velocity damping per second (lower = glidier). */
  swimWaterDrag = 0.78,
  /** Upper bound on drift speed (world units / second). */
  swimMaxSpeed = 5.8,
  /**
   * Soft vertical “midwater” bias: gentle drift toward `comfortY` and
   * extra damping when far — fish layer stays in frame without hard rails.
   * Merged with per-theme defaults from `themes.js`.
   */
  verticalComfort,
}) {
  const { camera, gl } = useThree();
  const { beaconNavSuspendedRef } = useRadio();

  const yaw = useRef(0);
  const pitch = useRef(0);
  const yawVelocity = useRef(0);
  const pitchVelocity = useRef(0);

  const rigPosition = useRef(
    new THREE.Vector3(...tripletFromBounds(basePosition, 0, 0, 6)),
  );
  const driftVelocity = useRef(new THREE.Vector3());
  const targetPosition = useRef(new THREE.Vector3());
  const eulerScratch = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const quatScratch = useRef(new THREE.Quaternion());
  const forwardScratch = useRef(new THREE.Vector3());
  const rightScratch = useRef(new THREE.Vector3());
  const upScratch = useRef(new THREE.Vector3());
  const boundsMinScratch = useRef(new THREE.Vector3());
  const boundsMaxScratch = useRef(new THREE.Vector3());

  const dragState = useRef({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    lastVx: 0,
    lastVy: 0,
  });

  /** Active coarse pointers (touch / pen) on the canvas — mouse uses `dragState` only. */
  const touchPointersRef = useRef(new Map());
  /** Two-finger pinch / pan — integrated in `useFrame` so both touches contribute once per frame. */
  const multiTouchRef = useRef({
    inited: false,
    lastDist: 0,
    lastCx: 0,
    lastCy: 0,
    pinchSm: 0,
    panVx: 0,
    panVy: 0,
    dbgAccum: 0,
    lastRawPinch: 0,
  });
  const windowListenersOnRef = useRef(false);

  const prevAnchorKey = useRef(anchorResetKey);

  const defaultVerticalComfort = useMemo(
    () => ({
      comfortY: 0,
      recenterStrength: 0.2,
      extremeStart: 2.4,
      extremeFull: 7,
      extraVerticalDamp: 1.28,
      exploreVelThreshold: 0.44,
      dragActiveRecenterMul: 0.14,
    }),
    [],
  );

  const propsRef = useRef({});
  propsRef.current = {
    dragSensitivity,
    dragDamping,
    inertiaStrength,
    maxPitchDegrees,
    hoverParallaxStrength,
    scrollDepthStrength,
    swimImpulseDamp,
    swimWaterDrag,
    swimMaxSpeed,
    boundsMin,
    boundsMax,
    verticalComfort: { ...defaultVerticalComfort, ...verticalComfort },
  };

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    if (prevAnchorKey.current === anchorResetKey) return;
    prevAnchorKey.current = anchorResetKey;
    const t = tripletFromBounds(basePosition, 0, 0, 6);
    rigPosition.current.set(...t);
    targetPosition.current.set(...t);
    driftVelocity.current.set(0, 0, 0);
    camera.position.set(...t);
    // Intentionally only `anchorResetKey`: typography / Leva shifts to
    // `basePosition` should not teleport a mid-session swim.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- basePosition is read at theme-switch only
  }, [anchorResetKey]);

  // Align Three camera with rig on first paint so we never start from
  // the Canvas default (z≈8.5) while the rig lives at typography Z.
  const didSyncCamera = useRef(false);
  useLayoutEffect(() => {
    if (didSyncCamera.current) return;
    didSyncCamera.current = true;
    const t = tripletFromBounds(basePosition, 0, 0, 6);
    rigPosition.current.set(...t);
    targetPosition.current.set(...t);
    camera.position.set(...t);
  }, [basePosition, camera]);

  useEffect(() => {
    boundsMinScratch.current.set(
      ...tripletFromBounds(boundsMin, -14, -7, -28),
    );
    boundsMaxScratch.current.set(
      ...tripletFromBounds(boundsMax, 14, 8, 58),
    );
    repairBoundsMinMax(boundsMinScratch.current, boundsMaxScratch.current);
    if (!finiteVec3Components(boundsMinScratch.current, boundsMaxScratch.current)) {
      boundsMinScratch.current.set(-14, -7, -28);
      boundsMaxScratch.current.set(14, 8, 58);
    }
    clampPositionWithVelocity(
      rigPosition.current,
      driftVelocity.current,
      boundsMinScratch.current,
      boundsMaxScratch.current,
    );
  }, [boundsMin, boundsMax]);

  useEffect(() => {
    const onWheel = (e) => {
      if (beaconNavSuspendedRef.current) return;
      const p = propsRef.current;
      eulerScratch.current.set(pitch.current, yaw.current, 0, 'YXZ');
      quatScratch.current.setFromEuler(eulerScratch.current);
      forwardScratch.current.set(0, 0, -1).applyQuaternion(quatScratch.current);

      const baseImpulse = -e.deltaY * 0.006 * p.scrollDepthStrength;
      const velLen = driftVelocity.current.length();
      const resisted =
        baseImpulse / (1 + velLen * p.swimImpulseDamp);
      driftVelocity.current.addScaledVector(forwardScratch.current, resisted);
      const cap = p.swimMaxSpeed;
      if (driftVelocity.current.length() > cap) {
        driftVelocity.current.setLength(cap);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [beaconNavSuspendedRef]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';

    const radPerPixelBase = Math.PI / 2400;

    const removeWindowPointerLayer = () => {
      if (!windowListenersOnRef.current) return;
      windowListenersOnRef.current = false;
      window.removeEventListener('pointermove', onWindowPointerMove, true);
      window.removeEventListener('pointerup', onWindowPointerUp, true);
      window.removeEventListener('pointercancel', onWindowPointerUp, true);
    };

    const addWindowPointerLayer = () => {
      if (windowListenersOnRef.current) return;
      windowListenersOnRef.current = true;
      window.addEventListener('pointermove', onWindowPointerMove, true);
      window.addEventListener('pointerup', onWindowPointerUp, true);
      window.addEventListener('pointercancel', onWindowPointerUp, true);
    };

    const finishMouseDrag = (e) => {
      removeWindowPointerLayer();
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      el.style.cursor = 'grab';
      const d = dragState.current;
      d.active = false;

      const stale = performance.now() - d.lastTime;
      const p = propsRef.current;
      const vx = stale > 100 ? 0 : d.lastVx;
      const vy = stale > 100 ? 0 : d.lastVy;
      yawVelocity.current = vx * p.inertiaStrength;
      pitchVelocity.current = vy * p.inertiaStrength;
    };

    const applyPointerDelta = (e) => {
      const d = dragState.current;
      const now = performance.now();
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      const dt = now - d.lastTime;

      const p = propsRef.current;
      const radPerPixel = radPerPixelBase * clamp(n(p.dragSensitivity, 1), 0.05, 8);

      yaw.current += dx * radPerPixel;
      pitch.current += dy * radPerPixel;

      const maxP = (clamp(n(p.maxPitchDegrees, 70), 10, 89) * Math.PI) / 180;
      pitch.current = clamp(pitch.current, -maxP, maxP);

      if (dt > 0) {
        const newVy = (dy / dt) * 1000 * radPerPixel;
        const newVx = (dx / dt) * 1000 * radPerPixel;
        d.lastVx = 0.5 * d.lastVx + 0.5 * newVx;
        d.lastVy = 0.5 * d.lastVy + 0.5 * newVy;
      }
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.lastTime = now;
    };

    const onWindowPointerMove = (e) => {
      const tp = touchPointersRef.current;
      if (tp.has(e.pointerId)) {
        tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (e.pointerType === 'mouse') {
        const d = dragState.current;
        if (d.active && e.pointerId === d.pointerId) {
          applyPointerDelta(e);
        }
        return;
      }

      if (tp.size >= 2) {
        return;
      }

      const d = dragState.current;
      if (d.active && e.pointerId === d.pointerId && tp.size <= 1) {
        applyPointerDelta(e);
      }
    };

    const onWindowPointerUp = (e) => {
      if (e.pointerType === 'mouse') {
        const d = dragState.current;
        if (d.active && e.pointerId === d.pointerId) {
          finishMouseDrag(e);
        }
        return;
      }

      if (!touchPointersRef.current.has(e.pointerId)) return;

      touchPointersRef.current.delete(e.pointerId);
      multiTouchRef.current.inited = false;

      if (touchPointersRef.current.size === 0) {
        const d = dragState.current;
        const stale = performance.now() - d.lastTime;
        const pr = propsRef.current;
        const vx = stale > 100 ? 0 : d.lastVx;
        const vy = stale > 100 ? 0 : d.lastVy;
        yawVelocity.current = vx * pr.inertiaStrength;
        pitchVelocity.current = vy * pr.inertiaStrength;
        dragState.current.active = false;
        removeWindowPointerLayer();
        el.style.cursor = 'grab';
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (_) {}
        return;
      }

      if (touchPointersRef.current.size === 1) {
        const [pid] = touchPointersRef.current.keys();
        const pt = touchPointersRef.current.get(pid);
        dragState.current.active = true;
        dragState.current.pointerId = pid;
        dragState.current.lastX = pt.x;
        dragState.current.lastY = pt.y;
        dragState.current.lastTime = performance.now();
        dragState.current.lastVx = 0;
        dragState.current.lastVy = 0;
        yawVelocity.current = 0;
        pitchVelocity.current = 0;
        try {
          el.setPointerCapture(pid);
        } catch (_) {}
        el.style.cursor = 'grabbing';
      }
    };

    const onPointerDown = (e) => {
      if (e.target !== el) {
        if (AQ_TOUCH_DEBUG) {
          console.info('[aqtouchdebug] pointerdown ignored (target !== canvas)', {
            ignoredUi: true,
          });
        }
        return;
      }

      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        queueMicrotask(() => {
          if (beaconNavSuspendedRef.current) return;
          try {
            el.setPointerCapture(e.pointerId);
          } catch (_) {}
          el.style.cursor = 'grabbing';
          dragState.current = {
            active: true,
            pointerId: e.pointerId,
            lastX: e.clientX,
            lastY: e.clientY,
            lastTime: performance.now(),
            lastVx: 0,
            lastVy: 0,
          };
          yawVelocity.current = 0;
          pitchVelocity.current = 0;
          addWindowPointerLayer();
        });
        return;
      }

      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

      queueMicrotask(() => {
        if (beaconNavSuspendedRef.current) {
          if (AQ_TOUCH_DEBUG) {
            console.info('[aqtouchdebug] touch ignored (beacon / orb captured first)', {
              ignoredUi: false,
            });
          }
          return;
        }
        touchPointersRef.current.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
        });
        addWindowPointerLayer();

        if (touchPointersRef.current.size === 1) {
          try {
            el.setPointerCapture(e.pointerId);
          } catch (_) {}
          el.style.cursor = 'grabbing';
          dragState.current = {
            active: true,
            pointerId: e.pointerId,
            lastX: e.clientX,
            lastY: e.clientY,
            lastTime: performance.now(),
            lastVx: 0,
            lastVy: 0,
          };
          yawVelocity.current = 0;
          pitchVelocity.current = 0;
        } else if (touchPointersRef.current.size === 2) {
          dragState.current.active = false;
          for (const pid of touchPointersRef.current.keys()) {
            try {
              el.releasePointerCapture(pid);
            } catch (_) {}
          }
          el.style.cursor = 'grab';
          yawVelocity.current = 0;
          pitchVelocity.current = 0;
          multiTouchRef.current.inited = false;
        }
      });
    };

    const onPointerEndLocal = (e) => {
      onWindowPointerUp(e);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerEndLocal);
    el.addEventListener('pointercancel', onPointerEndLocal);

    return () => {
      removeWindowPointerLayer();
      touchPointersRef.current.clear();
      multiTouchRef.current.inited = false;
      dragState.current.active = false;
      el.style.cursor = '';
      el.style.touchAction = '';
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerEndLocal);
      el.removeEventListener('pointercancel', onPointerEndLocal);
    };
  }, [gl, beaconNavSuspendedRef]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dd = Math.min(delta, 0.05);
    const p = propsRef.current;
    const idle = n(idleSway, 1);
    const hoverStr = n(p.hoverParallaxStrength, 1);

    const tp = touchPointersRef.current;
    const mt = multiTouchRef.current;

    if (!beaconNavSuspendedRef.current && tp.size >= 2) {
      const pts = [...tp.values()];
      const a = pts[0];
      const b = pts[1];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) * 0.5;
      const cy = (a.y + b.y) * 0.5;

      if (!mt.inited) {
        mt.lastDist = dist;
        mt.lastCx = cx;
        mt.lastCy = cy;
        mt.inited = true;
        mt.pinchSm = 0;
        mt.panVx = 0;
        mt.panVy = 0;
      } else {
        const rawPinch = dist - mt.lastDist;
        mt.lastDist = dist;
        mt.lastRawPinch = rawPinch;
        const panDx = cx - mt.lastCx;
        const panDy = cy - mt.lastCy;
        mt.lastCx = cx;
        mt.lastCy = cy;

        const pinchK = Math.min(1, dd * 11);
        mt.pinchSm += (rawPinch - mt.pinchSm) * pinchK;
        const panK = Math.min(1, dd * 10);
        const panVxInst = panDx / Math.max(dd, 0.0001);
        const panVyInst = panDy / Math.max(dd, 0.0001);
        mt.panVx += (panVxInst - mt.panVx) * panK;
        mt.panVy += (panVyInst - mt.panVy) * panK;

        eulerScratch.current.set(pitch.current, yaw.current, 0, 'YXZ');
        quatScratch.current.setFromEuler(eulerScratch.current);
        forwardScratch.current.set(0, 0, -1).applyQuaternion(quatScratch.current);
        rightScratch.current.set(1, 0, 0).applyQuaternion(quatScratch.current);
        upScratch.current.set(0, 1, 0).applyQuaternion(quatScratch.current);

        const baseImpulse = -mt.pinchSm * 0.009 * p.scrollDepthStrength;
        const resisted =
          baseImpulse /
          (1 + driftVelocity.current.length() * p.swimImpulseDamp);
        driftVelocity.current.addScaledVector(forwardScratch.current, resisted);

        const panBoost =
          0.00009 * p.scrollDepthStrength * Math.min(1.35, dd * 55);
        driftVelocity.current.addScaledVector(rightScratch.current, mt.panVx * panBoost);
        driftVelocity.current.addScaledVector(upScratch.current, -mt.panVy * panBoost);

        const cap = p.swimMaxSpeed;
        if (driftVelocity.current.length() > cap) {
          driftVelocity.current.setLength(cap);
        }

        if (AQ_TOUCH_DEBUG) {
          mt.dbgAccum += dd;
          if (mt.dbgAccum > 0.4) {
            mt.dbgAccum = 0;
            console.info('[aqtouchdebug]', {
              activeTouches: tp.size,
              gestureMode: 'pinch+twoFingerPan',
              pinchDelta: rawPinch,
              pinchSmoothed: mt.pinchSm,
              panVx: mt.panVx,
              panVy: mt.panVy,
              driftSpeed: driftVelocity.current.length(),
              ignoredUi: false,
            });
          }
        }
      }
    } else if (AQ_TOUCH_DEBUG && tp.size === 1 && dragState.current.active) {
      mt.dbgAccum += dd;
      if (mt.dbgAccum > 0.65) {
        mt.dbgAccum = 0;
        console.info('[aqtouchdebug]', {
          activeTouches: tp.size,
          gestureMode: 'rotate',
          ignoredUi: false,
        });
      }
    }

    if (!dragState.current.active) {
      if (beaconNavSuspendedRef.current) {
        yawVelocity.current = 0;
        pitchVelocity.current = 0;
      }
      yaw.current += yawVelocity.current * dd;
      pitch.current += pitchVelocity.current * dd;

      const dragD = clamp(n(p.dragDamping, 0.7), 0, 1);
      const retention = Math.max(0.0001, 1 - dragD);
      const r = Math.pow(retention, dd);
      yawVelocity.current *= r;
      pitchVelocity.current *= r;

      const maxP = (clamp(n(p.maxPitchDegrees, 70), 10, 89) * Math.PI) / 180;
      if (pitch.current > maxP) {
        pitch.current = maxP;
        if (pitchVelocity.current > 0) pitchVelocity.current = 0;
      } else if (pitch.current < -maxP) {
        pitch.current = -maxP;
        if (pitchVelocity.current < 0) pitchVelocity.current = 0;
      }
    }

    boundsMinScratch.current.set(
      ...tripletFromBounds(p.boundsMin, -14, -7, -28),
    );
    boundsMaxScratch.current.set(
      ...tripletFromBounds(p.boundsMax, 14, 8, 58),
    );
    repairBoundsMinMax(boundsMinScratch.current, boundsMaxScratch.current);
    if (!finiteVec3Components(boundsMinScratch.current, boundsMaxScratch.current)) {
      boundsMinScratch.current.set(-14, -7, -28);
      boundsMaxScratch.current.set(14, 8, 58);
    }

    const dragK = clamp(n(p.swimWaterDrag, 0.78), 0.01, 0.999);
    const velDamp = Math.exp(-dragK * dd);
    driftVelocity.current.multiplyScalar(velDamp);
    if (beaconNavSuspendedRef.current) {
      driftVelocity.current.multiplyScalar(Math.exp(-6.5 * dd));
    }

    const vc = p.verticalComfort;
    const cy = n(vc.comfortY, 0);
    const yErr = cy - rigPosition.current.y;
    const distFromComfort = Math.abs(yErr);

    const e0 = Math.max(0.05, n(vc.extremeStart, 2.4));
    const e1 = Math.max(e0 + 0.01, n(vc.extremeFull, 7));
    const extremeT = clamp((distFromComfort - e0) / (e1 - e0), 0, 1);
    const extraD = n(vc.extraVerticalDamp, 1.28);
    driftVelocity.current.y *= Math.exp(-extraD * extremeT * dd);

    let recenterMul = 1;
    if (dragState.current.active) {
      recenterMul *= clamp(n(vc.dragActiveRecenterMul, 0.14), 0.02, 1);
    }
    const evTh = n(vc.exploreVelThreshold, 0.44);
    const vyAbs = Math.abs(driftVelocity.current.y);
    if (vyAbs > evTh) {
      recenterMul *= clamp(1.15 - (vyAbs - evTh) * 1.1, 0.08, 1);
    }

    const rs = n(vc.recenterStrength, 0.2);
    driftVelocity.current.y += yErr * rs * recenterMul * dd;

    rigPosition.current.addScaledVector(driftVelocity.current, dd);
    clampPositionWithVelocity(
      rigPosition.current,
      driftVelocity.current,
      boundsMinScratch.current,
      boundsMaxScratch.current,
    );

    const touchNavActive = touchPointersRef.current.size > 0;
    const hoverMult =
      dragState.current.active ||
      touchNavActive ||
      beaconNavSuspendedRef.current
        ? 0.2
        : 1;
    const px = hoverParallax.x * hoverStr * hoverMult;
    const py = hoverParallax.y * hoverStr * hoverMult;

    const swayX = Math.sin(t * 0.13) * 0.22 * idle;
    const swayY = Math.cos(t * 0.09) * 0.16 * idle;
    const swayZ = Math.sin(t * 0.07) * 0.1 * idle;
    const mouseZ = state.mouse.y * 0.2 * hoverStr * hoverMult;

    targetPosition.current.set(
      rigPosition.current.x + state.mouse.x * px + swayX,
      rigPosition.current.y + state.mouse.y * py + swayY,
      rigPosition.current.z + swayZ + mouseZ,
    );

    const smooth = clamp(
      n(positionSmoothing, 0.095),
      0.03,
      1,
    );
    camera.position.lerp(targetPosition.current, smooth);
    if (
      !Number.isFinite(camera.position.x) ||
      !Number.isFinite(camera.position.y) ||
      !Number.isFinite(camera.position.z)
    ) {
      rigPosition.current.set(...tripletFromBounds(basePosition, 0, 0, 6));
      driftVelocity.current.set(0, 0, 0);
      camera.position.set(
        ...tripletFromBounds(basePosition, 0, 0, 6),
      );
    }

    eulerScratch.current.set(pitch.current, yaw.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(eulerScratch.current);
  });

  return null;
}
