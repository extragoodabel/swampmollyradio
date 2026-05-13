/**
 * Swamp Molly — rusty car anchor + poem placement (world space, meters).
 * Car group in Scene: [-4.45, floorY - 0.86, 71], outer rotation Y = π.
 *
 * Poem should appear in open space to the LEFT of the rusty car when facing the front of the car.
 * Positive X = viewer’s left when approaching from smaller world-Z toward the car; negative Z
 * pulls the block out of the “behind the car” (+Z) region into clearer water beside the hood line.
 */
import * as THREE from 'three';

export const RUSTY_CAR_WORLD_X = -4.45;
export const RUSTY_CAR_WORLD_Z = 71;
export const RUSTY_CAR_Y_OFFSET_FROM_FLOOR = -0.86;

export const POEM_OFFSET_FROM_RUSTY_CAR_X = 5.05;
/** Slightly above the car roof line, not floating in the sky. */
export const POEM_OFFSET_FROM_RUSTY_CAR_Y = 0.72;
/** Toward −Z / “forward” open water so text is not tucked behind the vehicle. */
export const POEM_OFFSET_FROM_RUSTY_CAR_Z = -5.85;

/** XZ point the poem’s readable normal aims at — inward toward the main volume / viewing area. */
export const POEM_FACE_TOWARD_X = 0;
export const POEM_FACE_TOWARD_Z = 34;

export const POEM_DISSIPATE_BREAKUP_SPEED = 0.85;
/** Time for breakup phase to complete at default speed (~1 / POEM_DISSIPATE_BREAKUP_SPEED s). */
export const POEM_DISSIPATE_BREAKUP_DURATION_SEC = 1.18;
export const POEM_DISSIPATE_LINGER_SEC = 3.2;
export const POEM_DISSIPATE_LINGER_DURATION_SEC = POEM_DISSIPATE_LINGER_SEC;
export const POEM_DISSIPATE_FADE_SEC = 2.05;
export const POEM_DISSIPATE_FADE_DURATION_SEC = POEM_DISSIPATE_FADE_SEC;

/** Character quad scale for Swamp Molly poem layout (see SwampFloatingWaterWords). */
export const POEM_SCALE = 0.288;

/** Shift anchor along −camera.right so the block reads ~this many pixels left on screen. */
export const POEM_SCREEN_NUDGE_LEFT_PX = 250;

/** Push anchor along +camera world direction (deeper into the frame) by this many CSS pixels. */
export const POEM_SCREEN_NUDGE_BACK_PX = 100;

/** In-world Girl Noise Press copy — offset from rusty car anchor (meters), toward open water / approach side. */
export const HACKLES_SIGN_OFFSET_X = 3.35;
export const HACKLES_SIGN_OFFSET_Y = 2.08;
export const HACKLES_SIGN_OFFSET_Z = -2.45;

/** Ms after car click before Hackles copy materializes (pulse leads). */
export const HACKLES_SIGN_REVEAL_DELAY_MS = 420;

/**
 * Interaction + dissipation trigger — poem **root local space** (generous AABB; reliable swim-through).
 * Covers the full line block; not plane-cross dependent.
 */
export const POEM_TRIGGER_CENTER_OFFSET = [0, 0, 0];
export const POEM_TRIGGER_HALF_WIDTH = 4.85;
export const POEM_TRIGGER_HALF_HEIGHT = 3.75;
export const POEM_TRIGGER_HALF_DEPTH = 2.45;

/** @deprecated Use POEM_TRIGGER_* — kept for grep/debug compatibility */
export const POEM_DISSIPATE_CENTER_OFFSET = POEM_TRIGGER_CENTER_OFFSET;
export const POEM_DISSIPATE_HALF_WIDTH = POEM_TRIGGER_HALF_WIDTH;
export const POEM_DISSIPATE_HALF_HEIGHT = POEM_TRIGGER_HALF_HEIGHT;
export const POEM_DISSIPATE_HALF_DEPTH = POEM_TRIGGER_HALF_DEPTH;
export const POEM_DISSIPATE_PLANE_CROSSING_ENABLED = false;

/** Reserved for debouncing (0 = unused). */
export const POEM_DISSIPATE_TRIGGER_COOLDOWN_MS = 0;

/** 0 = trigger as soon as camera enters volume (no multi-frame streak). */
export const POEM_DISSIPATE_TRIGGER_ENTER_FRAMES = 0;

/**
 * Passed to SwampFloatingWaterWords: explicit box (swim + debug wireframe).
 * @type {{ halfW: number, halfH: number, halfD: number, center: number[], enablePlaneCross: boolean }}
 */
export const POEM_DISSIPATION_EXPLICIT_BOX = {
  halfW: POEM_TRIGGER_HALF_WIDTH,
  halfH: POEM_TRIGGER_HALF_HEIGHT,
  halfD: POEM_TRIGGER_HALF_DEPTH,
  center: POEM_TRIGGER_CENTER_OFFSET,
  enablePlaneCross: POEM_DISSIPATE_PLANE_CROSSING_ENABLED,
};

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _zFwd = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _poemNudgePos = new THREE.Vector3();
const _poemNudgeRight = new THREE.Vector3();
const _poemNudgeForward = new THREE.Vector3();

/**
 * World-space anchor offset: move `baseXyz` “left” on the viewport by `pixelsLeft` (CSS px at the
 * current canvas size), using perspective frustum width at the distance from camera to the point.
 */
export function worldPositionNudgeScreenLeftPx(camera, viewW, viewH, baseXyz, pixelsLeft) {
  const [bx, by, bz] = baseXyz;
  _poemNudgePos.set(bx, by, bz);
  const dist = camera.position.distanceTo(_poemNudgePos);
  const vFovRad = (camera.fov * Math.PI) / 180;
  const aspect = Math.max(0.0001, viewW / Math.max(1, viewH));
  const visW = 2 * dist * Math.tan(vFovRad / 2) * aspect;
  const worldPerPixel = visW / Math.max(1, viewW);
  _poemNudgeRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const w = pixelsLeft * worldPerPixel;
  return [
    bx - _poemNudgeRight.x * w,
    by - _poemNudgeRight.y * w,
    bz - _poemNudgeRight.z * w,
  ];
}

/**
 * Move `baseXyz` along the camera view axis (into the scene) by ~`pixelsBack` CSS pixels.
 */
export function worldPositionNudgeScreenBackPx(camera, viewW, viewH, baseXyz, pixelsBack) {
  const [bx, by, bz] = baseXyz;
  _poemNudgePos.set(bx, by, bz);
  const dist = camera.position.distanceTo(_poemNudgePos);
  const vFovRad = (camera.fov * Math.PI) / 180;
  const aspect = Math.max(0.0001, viewW / Math.max(1, viewH));
  const visW = 2 * dist * Math.tan(vFovRad / 2) * aspect;
  const worldPerPixel = visW / Math.max(1, viewW);
  camera.getWorldDirection(_poemNudgeForward);
  const w = pixelsBack * worldPerPixel;
  return [
    bx + _poemNudgeForward.x * w,
    by + _poemNudgeForward.y * w,
    bz + _poemNudgeForward.z * w,
  ];
}

export function rustyCarFloorY(seabedDepth) {
  return -seabedDepth + 0.22;
}

export function rustyCarWorldPosition(seabedDepth) {
  const floorY = rustyCarFloorY(seabedDepth);
  return [
    RUSTY_CAR_WORLD_X,
    floorY + RUSTY_CAR_Y_OFFSET_FROM_FLOOR,
    RUSTY_CAR_WORLD_Z,
  ];
}

export function swampPoemWorldPositionFromRustyCar(seabedDepth) {
  const [cx, cy, cz] = rustyCarWorldPosition(seabedDepth);
  return [
    cx + POEM_OFFSET_FROM_RUSTY_CAR_X,
    cy + POEM_OFFSET_FROM_RUSTY_CAR_Y,
    cz + POEM_OFFSET_FROM_RUSTY_CAR_Z,
  ];
}

export function swampHacklesSignWorldPosition(seabedDepth) {
  const [cx, cy, cz] = rustyCarWorldPosition(seabedDepth);
  return [
    cx + HACKLES_SIGN_OFFSET_X,
    cy + HACKLES_SIGN_OFFSET_Y,
    cz + HACKLES_SIGN_OFFSET_Z,
  ];
}

/**
 * Face Hackles plaque toward the same readability target as the poem (inward / main volume).
 */
export function hacklesSignEulerRadTowardCenter(seabedDepth) {
  const pos = swampHacklesSignWorldPosition(seabedDepth);
  const px = pos[0];
  const pz = pos[2];
  const dx = POEM_FACE_TOWARD_X - px;
  const dz = POEM_FACE_TOWARD_Z - pz;
  const len = Math.hypot(dx, dz) || 1e-6;
  _dir.set(dx / len, 0, dz / len);
  _quat.setFromUnitVectors(_zFwd, _dir);
  _euler.setFromQuaternion(_quat, 'YXZ');
  return [_euler.x, _euler.y, _euler.z];
}

/**
 * Fixed Euler (radians, YXZ) so local +Z (glyph plane front) points from the poem toward the space center.
 */
export function poemGroupEulerRadTowardCenter(seabedDepth) {
  const pos = swampPoemWorldPositionFromRustyCar(seabedDepth);
  const px = pos[0];
  const pz = pos[2];
  const dx = POEM_FACE_TOWARD_X - px;
  const dz = POEM_FACE_TOWARD_Z - pz;
  const len = Math.hypot(dx, dz) || 1e-6;
  _dir.set(dx / len, 0, dz / len);
  _quat.setFromUnitVectors(_zFwd, _dir);
  _euler.setFromQuaternion(_quat, 'YXZ');
  return [_euler.x, _euler.y, _euler.z];
}

