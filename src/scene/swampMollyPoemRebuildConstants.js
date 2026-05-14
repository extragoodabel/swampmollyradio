import * as THREE from 'three';
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
 * Fixed world anchor between sunken cars (explicit constants; no screen nudge / lookAt).
 * Elevated for readability above floor haze while staying between the cars.
 * @param {number} seabedDepth positive depth (meters below surface reference).
 * @returns {[number, number, number]}
 */
export function SWAMP_POEM_WORLD_POSITION(seabedDepth) {
  const floorY = -seabedDepth + 0.22;
  const rustyY = floorY + RUSTY_CAR_Y_OFFSET_FROM_FLOOR;
  const fiatY = floorY + FIAT_Y_OFFSET_FROM_FLOOR;
  const midX = (RUSTY_CAR_WORLD_X + FIAT_OUTER_WORLD_X) * 0.5;
  const midZ = (RUSTY_CAR_WORLD_Z + FIAT_OUTER_WORLD_Z) * 0.5;
  const midY = (rustyY + fiatY) * 0.5 + 5.95;
  return [midX, midY, midZ];
}

/**
 * Yaw-only rotation (radians): plane +Z faces toward main volume; pitch/roll zero.
 * @param {number} seabedDepth
 * @returns {[number, number, number]} YXZ euler; pitch/roll zero.
 */
export function SWAMP_POEM_WORLD_ROTATION(seabedDepth) {
  const pos = SWAMP_POEM_WORLD_POSITION(seabedDepth);
  const px = pos[0];
  const pz = pos[2];
  const dx = POEM_FACE_TOWARD_X - px;
  const dz = POEM_FACE_TOWARD_Z - pz;
  const yaw = Math.atan2(dx, dz);
  return [0, yaw, 0];
}

/** @deprecated use {@link SWAMP_POEM_WORLD_POSITION} */
export const SWAMP_POEM_REBUILD_WORLD_POSITION = SWAMP_POEM_WORLD_POSITION;
/** @deprecated use {@link SWAMP_POEM_WORLD_ROTATION} */
export const SWAMP_POEM_REBUILD_WORLD_ROTATION = SWAMP_POEM_WORLD_ROTATION;

/** Uniform group scale — tighter vertical band for two-column layout. */
export const SWAMP_POEM_WORLD_SCALE = 1.08;

/** Eligibility: must be closer than this to poem to consider reveal. */
export const SWAMP_POEM_VISIBILITY_GATE_DISTANCE = 58;
/** Eligibility: must be this much closer to poem than at first sampled frame. */
export const SWAMP_POEM_MIN_APPROACH_PROGRESS = 12;

/**
 * Distance-only murk reveal after discovery: smootherstep + pow. Before the user meets
 * discovery gates in SwampMollyPoemRebuild, panel opacity is forced to 0 (this min is unused).
 */
export const SWAMP_POEM_REVEAL_START_DISTANCE = 58;
export const SWAMP_POEM_REVEAL_FULL_DISTANCE = 20;
/** Minimum murk opacity once eligible (before eligibility, panels are forced to 0). */
export const SWAMP_POEM_REVEAL_MIN_OPACITY = 0.04;
export const SWAMP_POEM_REVEAL_MAX_OPACITY = 0.92;
/** Exponential smoothing for chasing {@link swampPoemRevealOpacity}. */
export const SWAMP_POEM_REVEAL_SMOOTHING = 1.4;
/** Applied after smootherstep so the first half of the ramp stays more underwater. */
export const SWAMP_POEM_REVEAL_CURVE_POW = 1.35;
/** After eligibility, multiply distance-reveal by this eased ramp (smootherstep). */
export const SWAMP_POEM_DISCOVERY_FADE_SECONDS = 3;
/** Debug tag for aqpoemdebug. */
export const SWAMP_POEM_DISCOVERY_FADE_CURVE = 'smootherstep01';
/** Debug label for distance murk curve. */
export const SWAMP_POEM_REVEAL_CURVE_LABEL = `smootherstep01 + pow(·, ${SWAMP_POEM_REVEAL_CURVE_POW})`;

export function swampPoemSmootherstep01(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * @param {number} distance camera ↔ poem anchor (meters)
 */
export function swampPoemRevealOpacity(distance) {
  const d0 = SWAMP_POEM_REVEAL_START_DISTANCE;
  const d1 = SWAMP_POEM_REVEAL_FULL_DISTANCE;
  const lo = SWAMP_POEM_REVEAL_MIN_OPACITY;
  const hi = SWAMP_POEM_REVEAL_MAX_OPACITY;
  if (distance >= d0) return lo;
  if (distance <= d1) return hi;
  const tLin = THREE.MathUtils.clamp((d0 - distance) / (d0 - d1), 0, 1);
  const tSmooth = swampPoemSmootherstep01(tLin);
  const tShaped = Math.pow(tSmooth, SWAMP_POEM_REVEAL_CURVE_POW);
  return lo + (hi - lo) * tShaped;
}

/**
 * Canvas font stack aligned with swamp poem / water-words canvas (600-weight ui monospace).
 * @param {number} fontPx
 * @param {boolean} italic
 */
export function swampPoemRebuildCanvasFont(fontPx, italic) {
  const style = italic ? 'italic ' : '';
  return `${style}600 ${fontPx}px ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`;
}

/** Debug label: which in-world text system this matches. */
export const SWAMP_POEM_REBUILD_FONT_MATCHES = 'SwampMollyPoem / SwampFloatingWaterWords (ui-monospace stack)';

/** Dying-bulb flicker for this exact substring (phrase-level overlay). */
export const SWAMP_POEM_FLICKER_PHRASE = 'lights to flick off';
export const SWAMP_POEM_FLICKER_ENABLED = true;
export const SWAMP_POEM_FLICKER_MIN_OPACITY = 0.18;
export const SWAMP_POEM_FLICKER_MAX_OPACITY = 1.15;
export const SWAMP_POEM_FLICKER_UPDATE_MIN_MS = 80;
export const SWAMP_POEM_FLICKER_UPDATE_MAX_MS = 180;

function poemFlickerFract(x) {
  return x - Math.floor(x);
}

/**
 * Deterministic ms until next flicker step (irregular 80–180ms).
 * @param {number} elapsedSec
 * @param {number} step
 */
export function poemFlickerIntervalMs(elapsedSec, step) {
  const w =
    poemFlickerFract(Math.sin(elapsedSec * 6.847 + step * 4.271) * 8931.547) *
    (SWAMP_POEM_FLICKER_UPDATE_MAX_MS - SWAMP_POEM_FLICKER_UPDATE_MIN_MS);
  return SWAMP_POEM_FLICKER_UPDATE_MIN_MS + w;
}

/**
 * Deterministic multiplier for a flicker hold step (bulb sag, brief dim, rare pulse).
 * @param {number} elapsedSec
 * @param {number} step
 */
export function poemFlickerMultiplierSample(elapsedSec, step) {
  const f = poemFlickerFract(Math.sin(elapsedSec * 2.913 + step * 31.4159) * 23421.927);
  let m = 0.82 + 0.18 * Math.pow(f, 0.62);
  if (f < 0.07) {
    m = 0.08 + f * 1.15;
  } else if (f > 0.93) {
    m = 1.02 + (f - 0.93) * 2.2;
  }
  return THREE.MathUtils.clamp(
    m,
    SWAMP_POEM_FLICKER_MIN_OPACITY,
    SWAMP_POEM_FLICKER_MAX_OPACITY,
  );
}

/**
 * @param {number} seabedDepth
 * @returns {{ rusty: [number, number, number], fiat: [number, number, number] }}
 */
export function swampPoemDebugCarAnchors(seabedDepth) {
  const floorY = -seabedDepth + 0.22;
  return {
    rusty: [
      RUSTY_CAR_WORLD_X,
      floorY + RUSTY_CAR_Y_OFFSET_FROM_FLOOR,
      RUSTY_CAR_WORLD_Z,
    ],
    fiat: [FIAT_OUTER_WORLD_X, floorY + FIAT_Y_OFFSET_FROM_FLOOR, FIAT_OUTER_WORLD_Z],
  };
}

/** Seabed / muck reference Y (scene floor line) for debug. */
export function swampPoemFloorReferenceY(seabedDepth) {
  return -seabedDepth + 0.22;
}

/**
 * Letter opacity multiplier vs world Y — 1 above haze start, 0 deep in muck.
 * @param {number} worldY
 * @param {number} floorY from {@link swampPoemFloorReferenceY}
 */
export function swampPoemParticleMuckFade(worldY, floorY) {
  const yHi = floorY + SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR;
  const yLo = floorY + SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR;
  if (worldY >= yHi) return 1;
  if (worldY <= yLo) return 0;
  const u = (worldY - yLo) / (yHi - yLo);
  return swampPoemSmootherstep01(u);
}

/** Generous swim-through box in poem root local space. */
export const SWAMP_POEM_TRIGGER_HALF_WIDTH = 13.5;
export const SWAMP_POEM_TRIGGER_HALF_HEIGHT = 9.5;
export const SWAMP_POEM_TRIGGER_HALF_DEPTH = 5.5;
export const SWAMP_POEM_TRIGGER_CENTER_OFFSET = [0, 0, 0];

/** Legacy fast collapse (no longer drives main dissipation visuals). */
export const SWAMP_POEM_BREAKUP_DURATION = 0.38;
/** @deprecated use {@link SWAMP_POEM_DISSIPATE_LINGER_DURATION} */
export const SWAMP_POEM_LINGER_DURATION = 3.1;
/** @deprecated use {@link SWAMP_POEM_DISSIPATE_FADE_DURATION} */
export const SWAMP_POEM_FADE_DURATION = 2.05;
/** @deprecated use {@link SWAMP_POEM_LETTER_DRIFT_AMOUNT} */
export const SWAMP_POEM_LETTER_DRIFT = 0.62;
/** @deprecated use {@link SWAMP_POEM_LETTER_SINK_AMOUNT} */
export const SWAMP_POEM_LETTER_FALL = -0.88;

/** Full-opacity hold before panel↔particle crossfade (no motion). */
export const SWAMP_POEM_HANDOFF_HOLD_SECONDS = 0.75;
/** Panel texture → letter-particle crossfade (begins after handoff hold). */
export const SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS = 2.5;
/** Ease-in to full drift after motion starts + per-letter delay. */
export const SWAMP_POEM_DISSIPATE_DETACH_DURATION = 7;
/** Slower underwater drift / current after detach ramp (letters stay visible until muck). */
export const SWAMP_POEM_DISSIPATE_LINGER_DURATION = 10;
/**
 * Fallback cleanup if particles never satisfy the muck-depth band test (seconds after dissipation start).
 * Prefer natural below-muck cleanup; keep this long so the timer rarely fires while letters remain visible.
 */
export const SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS = 150;
/** @deprecated mid-water global fade removed — use muck-depth fade */
export const SWAMP_POEM_DISSIPATE_FADE_DURATION = 2.5;
/** Max per-letter delay (seconds) from contact distance + seed (clamped). */
export const SWAMP_POEM_LETTER_STAGGER_MAX_SEC = 2.35;
export const SWAMP_POEM_CONTACT_STAGGER_SCALE = 0.055;
export const SWAMP_POEM_RANDOM_STAGGER_MAX = 0.42;

/** Muck / floor-relative fade band (world Y, uses {@link swampPoemFloorReferenceY}). */
export const SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR = 0.8;
export const SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR = -1.2;

/** Underwater drift: slow current + loss of buoyancy (not gravity / confetti). */
export const SWAMP_POEM_LETTER_SINK_AMOUNT = 1.42;
export const SWAMP_POEM_LETTER_DRIFT_AMOUNT = 2.65;
export const SWAMP_POEM_LETTER_Z_DRIFT_AMOUNT = 0.62;
export const SWAMP_POEM_LETTER_ROTATION_AMOUNT = 0.2;

/**
 * After per-letter motion starts: lateral / Z / rotation ramp up over this window (smootherstep),
 * so columns read as columns for the first seconds. Sink uses {@link SWAMP_POEM_LETTER_EARLY_SINK_RAMP_SEC}.
 */
export const SWAMP_POEM_LETTER_EARLY_DRIFT_RAMP_SEC = 2.75;
/** Vertical motion reaches full strength faster than lateral (still eased). */
export const SWAMP_POEM_LETTER_EARLY_SINK_RAMP_SEC = 1.2;

/**
 * Master gate for poem float / shimmer / per-column idle motion. Ships false: normal builds show a stable poem.
 * With `?aqpoemmotiontest=1` in the URL, set this to true locally to exercise the experiment.
 */
export const SWAMP_POEM_ENABLE_FLOAT_SHIMMER = false;

/**
 * Gentle panel-level motion (anchor world position stays fixed for distance reveal).
 * Inner float group applies bob / drift / euler breathing in {@link SwampMollyPoemRebuild}.
 * Used only when {@link SWAMP_POEM_ENABLE_FLOAT_SHIMMER} and `?aqpoemmotiontest=1`.
 */
export const SWAMP_POEM_FLOAT_ENABLED = true;
/** Vertical bob amplitude (meters, float-local). */
export const SWAMP_POEM_FLOAT_BOB_AMOUNT = 0.16;
/** Horizontal drift amplitude (meters). */
export const SWAMP_POEM_FLOAT_DRIFT_AMOUNT = 0.09;
/** Multiplier on elapsed time inside float sines — lower = slower, dreamier motion. */
export const SWAMP_POEM_FLOAT_SPEED = 0.55;
export const SWAMP_POEM_FLOAT_YAW_AMOUNT = 0.010;
export const SWAMP_POEM_FLOAT_PITCH_AMOUNT = 0.006;
export const SWAMP_POEM_FLOAT_ROLL_AMOUNT = 0.007;
/** Z separation between the two column planes (world units, float-local space). */
export const SWAMP_POEM_PANEL_DEPTH_STAGGER = 0.042;

/** Idle underwater light: color/brightness wobble + mild opacity breathing (high floor). */
export const SWAMP_POEM_SHIMMER_ENABLED = true;
export const SWAMP_POEM_SHIMMER_AMOUNT = 0.14;
export const SWAMP_POEM_SHIMMER_SPEED = 0.65;
export const SWAMP_POEM_SHIMMER_OPACITY_FLOOR = 0.92;
/** Phase offsets (radians) so columns do not pulse in lockstep. */
export const SWAMP_POEM_SHIMMER_PHASE_LEFT = 0;
export const SWAMP_POEM_SHIMMER_PHASE_RIGHT = 1.85;

/**
 * Tiny motion on each column group (phase-shifted) so the poem is not one rigid slab.
 * Latched with float on dissipation start; particles use column matrixWorld at trigger time.
 */
export const SWAMP_POEM_PANEL_IDLE_MOTION_ENABLED = true;
export const SWAMP_POEM_PANEL_BOB_Y_AMOUNT = 0.034;
export const SWAMP_POEM_PANEL_DRIFT_Z_AMOUNT = 0.024;
export const SWAMP_POEM_PANEL_DRIFT_X_AMOUNT = 0.018;
export const SWAMP_POEM_PANEL_ROT_Z_AMOUNT = 0.0024;
export const SWAMP_POEM_PANEL_MOTION_SPEED = 0.5;
export const SWAMP_POEM_PANEL_MOTION_PHASE_LEFT = 0;
export const SWAMP_POEM_PANEL_MOTION_PHASE_RIGHT = 1.73;
/** Tiny static vertical bias: left column slightly up, right slightly down (readability). */
export const SWAMP_POEM_PANEL_Y_BIAS = 0.007;

/** Gap between left and right body columns (CSS px → drives world gap). */
export const SWAMP_POEM_COLUMN_GAP_PX = 52;
export const SWAMP_POEM_BODY_FONT_PX = 30;
export const SWAMP_POEM_LINE_HEIGHT_MUL = 1.48;
export const SWAMP_POEM_PAD_X = 28;
export const SWAMP_POEM_PAD_Y = 36;
export const SWAMP_POEM_STANZA_STEP_PX = 28;
/** Device pixel ratio for poem canvas rasterization (fixed for SSR/build safety). */
export const SWAMP_POEM_DPR = 2;
/** Canvas pixel → world meters (plane width = canvasW * this). */
export const SWAMP_POEM_PIXEL_TO_WORLD = 0.0105;

/**
 * Dissipation letter quads: extra visual calibration after correct padded-plane sizing (`?aqpoem` tuning).
 * Default 1 — with padding-aware plane sizing, this should stay near 1.
 */
export const SWAMP_POEM_PARTICLE_FONT_SCALE = 1;

/** CSS px padding in particle glyph atlas (clears panel-matched shadow); included in plane world size. */
export const SWAMP_POEM_PARTICLE_TEXTURE_PAD_X = 10;
export const SWAMP_POEM_PARTICLE_TEXTURE_PAD_Y = 10;

/** Optional world-space nudges in float-group space after alignment (meters). Prefer correct metrics. */
export const SWAMP_POEM_PARTICLE_X_NUDGE = 0;
export const SWAMP_POEM_PARTICLE_Y_NUDGE = 0;
export const SWAMP_POEM_PARTICLE_BASELINE_NUDGE_Y = 0;
