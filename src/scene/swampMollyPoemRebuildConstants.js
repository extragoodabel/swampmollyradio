import {
  POEM_FACE_TOWARD_X,
  POEM_FACE_TOWARD_Z,
  RUSTY_CAR_WORLD_X,
  RUSTY_CAR_WORLD_Z,
  RUSTY_CAR_Y_OFFSET_FROM_FLOOR,
} from './swampPoemPlacement.js';

/** Fiat outer group XZ from `SwampSunkenFiatPanda.jsx` (Z matches `groupPos`). */
export const FIAT_OUTER_WORLD_X = 42;
export const FIAT_OUTER_WORLD_Z = 63;
export const FIAT_Y_OFFSET_FROM_FLOOR = -0.78;

/**
 * Fixed world anchor between sunken cars (no camera nudge / pitch).
 * @param {number} seabedDepth positive depth (meters below surface reference).
 * @returns {[number, number, number]}
 */
export function SWAMP_POEM_REBUILD_WORLD_POSITION(seabedDepth) {
  const floorY = -seabedDepth + 0.22;
  const rustyY = floorY + RUSTY_CAR_Y_OFFSET_FROM_FLOOR;
  const fiatY = floorY + FIAT_Y_OFFSET_FROM_FLOOR;
  const midX = (RUSTY_CAR_WORLD_X + FIAT_OUTER_WORLD_X) * 0.5;
  const midZ = (RUSTY_CAR_WORLD_Z + FIAT_OUTER_WORLD_Z) * 0.5;
  const midY = (rustyY + fiatY) * 0.5 + 1.28;
  return [midX, midY, midZ];
}

/**
 * Yaw-only rotation (radians): readable face toward main volume center line.
 * @param {number} seabedDepth
 * @returns {[number, number, number]} YXZ euler; pitch/roll zero.
 */
export function SWAMP_POEM_REBUILD_WORLD_ROTATION(seabedDepth) {
  const pos = SWAMP_POEM_REBUILD_WORLD_POSITION(seabedDepth);
  const px = pos[0];
  const pz = pos[2];
  const dx = POEM_FACE_TOWARD_X - px;
  const dz = POEM_FACE_TOWARD_Z - pz;
  const yaw = Math.atan2(dx, dz);
  return [0, yaw, 0];
}

/** Uniform group scale (meshes already sized in meters). */
export const SWAMP_POEM_WORLD_SCALE = 1;

/** Generous swim-through box in poem root local space. */
export const SWAMP_POEM_TRIGGER_HALF_WIDTH = 13.5;
export const SWAMP_POEM_TRIGGER_HALF_HEIGHT = 9.5;
export const SWAMP_POEM_TRIGGER_HALF_DEPTH = 5.5;
export const SWAMP_POEM_TRIGGER_CENTER_OFFSET = [0, 0, 0];

export const SWAMP_POEM_BREAKUP_DURATION = 0.38;
export const SWAMP_POEM_LINGER_DURATION = 3.1;
export const SWAMP_POEM_FADE_DURATION = 2.05;
export const SWAMP_POEM_LETTER_DRIFT = 0.62;
export const SWAMP_POEM_LETTER_FALL = -0.88;

/** Idle panel rendering */
export const SWAMP_POEM_DPR = 2;
export const SWAMP_POEM_HEADING_FONT_PX = 44;
export const SWAMP_POEM_BODY_FONT_PX = 30;
export const SWAMP_POEM_LINE_HEIGHT_MUL = 1.48;
export const SWAMP_POEM_PAD_X = 28;
export const SWAMP_POEM_PAD_Y = 36;
export const SWAMP_POEM_STANZA_STEP_PX = 28;
/** Canvas pixel → world meters (plane width = canvasW * this). */
export const SWAMP_POEM_PIXEL_TO_WORLD = 0.0105;
