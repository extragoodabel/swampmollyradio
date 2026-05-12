import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Underwater camera rig.
 *
 * Body model: the viewer's body is anchored at `basePosition`. Drag does
 * NOT translate the body sideways -- it rotates the world around the
 * viewer (yaw + pitch), like grabbing the inside of a sphere. This is
 * the Google Street View interaction model:
 *
 *   drag right -> view rotates LEFT  (yaw +=)
 *   drag down  -> view tilts  UP     (pitch +=, positive = look up)
 *
 * Inputs composed each frame:
 *
 *   1. Pointer drag   -> yaw/pitch state, with inertia after release.
 *                        Yaw is free (360deg), pitch clamped to
 *                        +/- maxPitchDegrees so the user can never flip.
 *   2. Mouse wheel    -> camera Z within [cameraZMin, cameraZMax].
 *                        This is the ONLY translation drag-related code
 *                        touches; XY position stays at base.
 *   3. Hover parallax -> tiny additive XY/Z position bob, heavily
 *                        reduced while a drag is active so it doesn't
 *                        fight the rotation.
 *   4. Idle sway      -> low-frequency sines on position so the camera
 *                        always floats a little.
 *
 * The camera's orientation is written via direct quaternion-from-Euler
 * with YXZ order (FPS-style, no gimbal issues at the configured pitch
 * range). Position is lerp'd toward its target for that underwater
 * easing feel; rotation is set directly so drag feels 1:1 with the
 * pointer -- the smoothness on rotation comes from the velocity
 * integration, not from interpolation.
 */
export default function CameraRig({
  basePosition = [0, 0, 6],
  hoverParallax = { x: 0.6, y: 0.4 },
  hoverParallaxStrength = 1,
  scrollDepthStrength = 1,
  cameraZMin = -6,
  cameraZMax = 8,
  idleSway = 1,
  dragSensitivity = 1,
  dragDamping = 0.7,
  inertiaStrength = 1,
  maxPitchDegrees = 70,
  smoothing = 0.05,
}) {
  const { camera, gl } = useThree();

  const yaw = useRef(0);
  const pitch = useRef(0);
  const yawVelocity = useRef(0);
  const pitchVelocity = useRef(0);

  const scrollZ = useRef(basePosition[2]);
  const targetPosition = useRef(new THREE.Vector3(...basePosition));
  const eulerScratch = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  const dragState = useRef({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    lastVx: 0,
    lastVy: 0,
  });

  const propsRef = useRef({});
  propsRef.current = {
    dragSensitivity,
    dragDamping,
    inertiaStrength,
    maxPitchDegrees,
    hoverParallaxStrength,
    scrollDepthStrength,
    cameraZMin,
    cameraZMax,
  };

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const onWheel = (e) => {
      const p = propsRef.current;
      scrollZ.current = clamp(
        scrollZ.current - e.deltaY * 0.006 * p.scrollDepthStrength,
        p.cameraZMin,
        p.cameraZMax,
      );
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    scrollZ.current = clamp(scrollZ.current, cameraZMin, cameraZMax);
  }, [cameraZMin, cameraZMax]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';

    const radPerPixelBase = Math.PI / 2400;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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
    };

    const onPointerMove = (e) => {
      const d = dragState.current;
      if (!d.active || e.pointerId !== d.pointerId) return;

      const now = performance.now();
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      const dt = now - d.lastTime;

      const p = propsRef.current;
      const radPerPixel = radPerPixelBase * p.dragSensitivity;

      yaw.current += dx * radPerPixel;
      pitch.current += dy * radPerPixel;

      const maxP = (p.maxPitchDegrees * Math.PI) / 180;
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

    const onPointerEnd = (e) => {
      const d = dragState.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      el.style.cursor = 'grab';
      d.active = false;

      const stale = performance.now() - d.lastTime;
      const p = propsRef.current;
      const vx = stale > 100 ? 0 : d.lastVx;
      const vy = stale > 100 ? 0 : d.lastVy;
      yawVelocity.current = vx * p.inertiaStrength;
      pitchVelocity.current = vy * p.inertiaStrength;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);

    return () => {
      el.style.cursor = '';
      el.style.touchAction = '';
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dd = Math.min(delta, 0.05);
    const p = propsRef.current;

    if (!dragState.current.active) {
      yaw.current += yawVelocity.current * dd;
      pitch.current += pitchVelocity.current * dd;

      const retention = Math.max(0.0001, 1 - p.dragDamping);
      const r = Math.pow(retention, dd);
      yawVelocity.current *= r;
      pitchVelocity.current *= r;

      const maxP = (p.maxPitchDegrees * Math.PI) / 180;
      if (pitch.current > maxP) {
        pitch.current = maxP;
        if (pitchVelocity.current > 0) pitchVelocity.current = 0;
      } else if (pitch.current < -maxP) {
        pitch.current = -maxP;
        if (pitchVelocity.current < 0) pitchVelocity.current = 0;
      }
    }

    const hoverMult = dragState.current.active ? 0.2 : 1;
    const hp = p.hoverParallaxStrength;
    const px = hoverParallax.x * hp * hoverMult;
    const py = hoverParallax.y * hp * hoverMult;

    const swayX = Math.sin(t * 0.13) * 0.22 * idleSway;
    const swayY = Math.cos(t * 0.09) * 0.16 * idleSway;
    const swayZ = Math.sin(t * 0.07) * 0.10 * idleSway;
    const mouseZ = state.mouse.y * 0.20 * hp * hoverMult;

    targetPosition.current.set(
      basePosition[0] + state.mouse.x * px + swayX,
      basePosition[1] + state.mouse.y * py + swayY,
      scrollZ.current + swayZ + mouseZ,
    );

    camera.position.lerp(targetPosition.current, smoothing);

    eulerScratch.current.set(pitch.current, yaw.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(eulerScratch.current);
  });

  return null;
}
