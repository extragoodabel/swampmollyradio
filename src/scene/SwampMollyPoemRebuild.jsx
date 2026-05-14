import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SWAMP_MOLLY_POEM_RAW } from '../content/swampMollyPoem.js';
import {
  AQ_POEM_DEBUG,
  AQ_POEM_DEBUG_HELPERS,
  AQ_POEM_FLOAT_TEST,
  AQ_POEM_MOTION_TEST,
  AQ_POEM_FREEZE,
  AQ_POEM_FREEZE_PLAIN,
} from '../debug/aquariumRecovery.js';
import {
  SWAMP_POEM_CONTACT_STAGGER_SCALE,
  SWAMP_POEM_DISCOVERY_FADE_CURVE,
  SWAMP_POEM_DISCOVERY_FADE_SECONDS,
  SWAMP_POEM_DISSIPATE_DETACH_DURATION,
  SWAMP_POEM_DISSIPATE_LINGER_DURATION,
  SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS,
  SWAMP_POEM_FLICKER_ENABLED,
  SWAMP_POEM_FLICKER_PHRASE,
  SWAMP_POEM_FLOAT_BOB_AMOUNT,
  SWAMP_POEM_FLOAT_DRIFT_AMOUNT,
  SWAMP_POEM_FLOAT_ENABLED,
  SWAMP_POEM_FLOAT_PITCH_AMOUNT,
  SWAMP_POEM_FLOAT_ROLL_AMOUNT,
  SWAMP_POEM_FLOAT_SPEED,
  SWAMP_POEM_FLOAT_YAW_AMOUNT,
  SWAMP_POEM_HANDOFF_HOLD_SECONDS,
  SWAMP_POEM_LETTER_DRIFT_AMOUNT,
  SWAMP_POEM_LETTER_EARLY_DRIFT_RAMP_SEC,
  SWAMP_POEM_LETTER_EARLY_SINK_RAMP_SEC,
  SWAMP_POEM_LETTER_ROTATION_AMOUNT,
  SWAMP_POEM_LETTER_SINK_AMOUNT,
  SWAMP_POEM_LETTER_STAGGER_MAX_SEC,
  SWAMP_POEM_LETTER_Z_DRIFT_AMOUNT,
  SWAMP_POEM_LINE_HEIGHT_MUL,
  SWAMP_POEM_BODY_FONT_PX,
  SWAMP_POEM_DPR,
  SWAMP_POEM_ENABLE_FLOAT_SHIMMER,
  SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR,
  SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR,
  SWAMP_POEM_PANEL_DEPTH_STAGGER,
  SWAMP_POEM_PANEL_IDLE_MOTION_ENABLED,
  SWAMP_POEM_PANEL_BOB_Y_AMOUNT,
  SWAMP_POEM_PANEL_DRIFT_X_AMOUNT,
  SWAMP_POEM_PANEL_DRIFT_Z_AMOUNT,
  SWAMP_POEM_PANEL_MOTION_PHASE_LEFT,
  SWAMP_POEM_PANEL_MOTION_PHASE_RIGHT,
  SWAMP_POEM_PANEL_MOTION_SPEED,
  SWAMP_POEM_PANEL_ROT_Z_AMOUNT,
  SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS,
  SWAMP_POEM_PANEL_Y_BIAS,
  SWAMP_POEM_PARTICLE_BASELINE_NUDGE_Y,
  SWAMP_POEM_PARTICLE_FONT_SCALE,
  SWAMP_POEM_PARTICLE_TEXTURE_PAD_X,
  SWAMP_POEM_PARTICLE_TEXTURE_PAD_Y,
  SWAMP_POEM_PARTICLE_X_NUDGE,
  SWAMP_POEM_PARTICLE_Y_NUDGE,
  SWAMP_POEM_PIXEL_TO_WORLD,
  SWAMP_POEM_RANDOM_STAGGER_MAX,
  SWAMP_POEM_MIN_APPROACH_PROGRESS,
  SWAMP_POEM_REVEAL_CURVE_LABEL,
  SWAMP_POEM_REVEAL_CURVE_POW,
  SWAMP_POEM_REVEAL_FULL_DISTANCE,
  SWAMP_POEM_REVEAL_MIN_OPACITY,
  SWAMP_POEM_REVEAL_MAX_OPACITY,
  SWAMP_POEM_REVEAL_SMOOTHING,
  SWAMP_POEM_REVEAL_START_DISTANCE,
  SWAMP_POEM_SHIMMER_AMOUNT,
  SWAMP_POEM_SHIMMER_ENABLED,
  SWAMP_POEM_SHIMMER_OPACITY_FLOOR,
  SWAMP_POEM_SHIMMER_PHASE_LEFT,
  SWAMP_POEM_SHIMMER_PHASE_RIGHT,
  SWAMP_POEM_SHIMMER_SPEED,
  SWAMP_POEM_TRIGGER_CENTER_OFFSET,
  SWAMP_POEM_TRIGGER_HALF_DEPTH,
  SWAMP_POEM_TRIGGER_HALF_HEIGHT,
  SWAMP_POEM_TRIGGER_HALF_WIDTH,
  SWAMP_POEM_VISIBILITY_GATE_DISTANCE,
  SWAMP_POEM_WORLD_POSITION,
  SWAMP_POEM_WORLD_ROTATION,
  SWAMP_POEM_WORLD_SCALE,
  poemFlickerIntervalMs,
  poemFlickerMultiplierSample,
  swampPoemDebugCarAnchors,
  swampPoemFloorReferenceY,
  swampPoemParticleMuckFade,
  swampPoemRevealOpacity,
  swampPoemSmootherstep01,
  swampPoemRebuildCanvasFont,
} from './swampMollyPoemRebuildConstants.js';
import { SWAMP_POEM_REBUILD_STATIC_ONLY } from './swampMollyPoemRebuildFlags.js';
import { buildSwampPoemRebuildPanels, measureSwampPoemLineWidthPx } from './swampMollyPoemRebuildLayout.js';
import { typographyFillHex } from './typographyPalette.js';

const POEM_RENDER_ORDER = 120;
const _wpos = new THREE.Vector3();
const _camLocal = new THREE.Vector3();
const _particleWorld = new THREE.Vector3();
const _homeTmp = new THREE.Vector3();
const _panelCornerA = new THREE.Vector3();
const _panelCornerB = new THREE.Vector3();
const _panelShimmerColor = new THREE.Color(1, 1, 1);
const _flickerShimmerColor = new THREE.Color(1, 1, 1);

/** Panel-local XY on column group's Z=0 plane → Swamp poem float-group local (matches column `<group>` + plane mesh). */
function poemCharHomeInFloatSpace(columnGroup, floatGroup, panelLocalX, panelLocalY, panelLocalZ, target) {
  target.set(panelLocalX, panelLocalY, panelLocalZ);
  target.applyMatrix4(columnGroup.matrixWorld);
  floatGroup.worldToLocal(target);
  return target;
}

function columnPanelXRangeInFloat(columnGroup, floatGroup, planeW, outMinMax) {
  _panelCornerA.set(-planeW * 0.5, 0, 0);
  _panelCornerB.set(planeW * 0.5, 0, 0);
  _panelCornerA.applyMatrix4(columnGroup.matrixWorld);
  _panelCornerB.applyMatrix4(columnGroup.matrixWorld);
  floatGroup.worldToLocal(_panelCornerA);
  floatGroup.worldToLocal(_panelCornerB);
  outMinMax[0] = Math.min(_panelCornerA.x, _panelCornerB.x);
  outMinMax[1] = Math.max(_panelCornerA.x, _panelCornerB.x);
}

const _glyphTexCache = new Map();

/**
 * One dissipation glyph: same canvas font + shadow + DPR as {@link buildSwampPoemRebuildPanels}.
 * Plane world size uses **full atlas** (glyph + padding) × `panelPxToWorld` so UV scale matches
 * the static panel’s px→world mapping — otherwise padded textures shrink the ink on the quad.
 *
 * @param {{ char: string, fillHex: string, fontPx: number, italic: boolean, glyphWidthPx: number, lineHeightPx: number, panelPxToWorld?: number }} opts
 * @returns {{ map: THREE.CanvasTexture, w: number, h: number }}
 */
function letterTextureMatchingPanel(opts) {
  const {
    char,
    fillHex,
    fontPx,
    italic,
    glyphWidthPx,
    lineHeightPx,
    panelPxToWorld = SWAMP_POEM_PIXEL_TO_WORLD,
  } = opts;
  const padX = SWAMP_POEM_PARTICLE_TEXTURE_PAD_X;
  const padY = SWAMP_POEM_PARTICLE_TEXTURE_PAD_Y;
  const texCssW = glyphWidthPx + padX * 2;
  const texCssH = lineHeightPx + padY * 2;
  const wWorld = texCssW * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE;
  const hWorld = texCssH * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE;
  const key = `${fillHex}::${fontPx}::${italic ? 'i' : 'n'}::${char}::${padX}::${padY}`;

  const hit = _glyphTexCache.get(key);
  if (hit) return { map: hit.map.clone(), w: wWorld, h: hWorld };

  const dpr = SWAMP_POEM_DPR;
  const cssW = texCssW;
  const cssH = texCssH;

  const cnv = document.createElement('canvas');
  cnv.width = Math.max(8, Math.floor(cssW * dpr));
  cnv.height = Math.max(8, Math.floor(cssH * dpr));
  const ctx = cnv.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = swampPoemRebuildCanvasFont(fontPx, italic);
  ctx.fillStyle = fillHex;
  ctx.shadowColor = 'rgba(105, 188, 175, 0.48)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0.4;
  ctx.shadowOffsetY = 1.0;
  ctx.fillText(char, padX + glyphWidthPx * 0.5, cssH * 0.5);
  ctx.shadowColor = 'rgba(14, 48, 42, 0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0.95;
  ctx.shadowOffsetY = 1.4;
  ctx.fillText(char, padX + glyphWidthPx * 0.5, cssH * 0.5);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(char, padX + glyphWidthPx * 0.5, cssH * 0.5);

  const map = new THREE.CanvasTexture(cnv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  _glyphTexCache.set(key, { map });
  return { map: map.clone(), w: wWorld, h: hWorld };
}

/**
 * @param {{
 *   seabedDepth: number;
 *   murkiness: number;
 *   typographyTint: object | null;
 *   poemPresent: boolean;
 *   poemGateOn: boolean;
 *   onDissipated?: () => void;
 * }} props
 */
export default function SwampMollyPoemRebuild({
  seabedDepth,
  murkiness,
  typographyTint,
  poemPresent,
  poemGateOn,
  onDissipated,
}) {
  const { camera } = useThree();
  /** Fixed anchor (world position for distance-based reveal — does not bob). */
  const anchorRef = useRef(/** @type {THREE.Group | null} */ (null));
  /** Panels + debug rigging + dissipation particles — swims gently in anchor space. */
  const floatGroupRef = useRef(/** @type {THREE.Group | null} */ (null));
  /** One `<group>` per column — same transform chain as panel meshes; used to place particles. */
  const columnGroupRefs = useRef(/** @type {(THREE.Group | null)[]} */ ([]));
  const freezeAlignmentLoggedRef = useRef(false);
  const dissTRef = useRef(0);
  const triggeredRef = useRef(false);
  const dissipationReasonRef = useRef(/** @type {null | string} */ (null));
  const dissipationContactLocalRef = useRef(new THREE.Vector3());
  const floatFrozenRef = useRef(false);
  const floatSnapPosRef = useRef(new THREE.Vector3());
  const floatSnapRotRef = useRef(new THREE.Euler());
  const panelFloatFrozenRef = useRef(false);
  const panelSnapPosRef = useRef(/** @type {THREE.Vector3[]} */ ([]));
  const panelSnapRotRef = useRef(/** @type {THREE.Euler[]} */ ([]));
  const letterStaggerRangeRef = useRef({ min: 0, max: 0 });
  const dissipationRevealLatchRef = useRef(0);
  /** @type {React.MutableRefObject<{
   *   leftParticleMinX: number;
   *   leftParticleMaxX: number;
   *   rightParticleMinX: number;
   *   rightParticleMaxX: number;
   *   headingParticleMinX: number;
   *   headingParticleMaxX: number;
   *   panelLeftColumnX: [number, number];
   *   panelRightColumnX: [number, number];
   *   particleXRangesMatchPanelsApprox: boolean;
   *   particleLocalBoundsBeforeMotion: { min: number[]; max: number[] };
   *   aqpoemfreezeActive: boolean;
   *   freezePhase: string | null;
   *   particleSpawnSpace: string;
   *   sampleParticleHomes: object[];
   * } | null>} */
  const dissipationColumnDebugRef = useRef(null);
  const particleMuckDebugRef = useRef(
    /** @type {{
     *   minWorldY: number;
     *   maxWorldY: number;
     *   visibleParticleCount: number;
     *   particleOpacityMode: string;
     *   globalFadeActive: boolean;
     *   muckFadeStartY: number;
     *   muckFadeEndY: number;
     *   floorReferenceY: number;
     *   countParticlesAboveMuckFadeStart: number;
     *   countParticlesInMuckFadeBand: number;
     *   countParticlesBelowMuckFadeEnd: number;
     *   cleanupReason: string | null;
     *   handoffU: number;
     *   motionStarted: boolean;
     *   detachUMin: number;
     *   detachUMax: number;
     *   centerAttractionActive: boolean;
     *   motionLeftParticleXMin: number | null;
     *   motionLeftParticleXMax: number | null;
     *   motionRightParticleXMin: number | null;
     *   motionRightParticleXMax: number | null;
     * } | null} */ (null),
  );
  const heartbeatRef = useRef(0);
  const pollAccRef = useRef(0);
  const dissipateMotionLogAccRef = useRef(0);
  const revealSmoothedRef = useRef(0);
  const revealInitSyncedRef = useRef(false);
  const spawnPositionRef = useRef(new THREE.Vector3());
  const hasSpawnSampleRef = useRef(false);
  const initialDistanceToPoemRef = useRef(-1);
  const poemRevealEligibleRef = useRef(false);
  const discoveryElapsedRef = useRef(0);
  const flickPhraseMsAccumRef = useRef(0);
  const flickPhraseNextMsRef = useRef(100);
  const flickPhraseStepRef = useRef(0);
  const flickPhraseMultRef = useRef(1);
  const flickerPhraseMatRef = useRef(/** @type {THREE.MeshBasicMaterial | null} */ (null));
  const panelMatRefs = useRef(/** @type {(THREE.MeshBasicMaterial | undefined)[]} */ ([]));
  const particleStateRef = useRef(
    /** @type {null | {
     *   mesh: THREE.Mesh;
     *   home: THREE.Vector3;
     *   offsetAccum: THREE.Vector3;
     *   vel: THREE.Vector3;
     *   rotVel: THREE.Vector3;
     *   detachDelay: number;
     *   wobblePhase: number;
     *   meta: {
     *     char: string;
     *     sourceIndex: number;
     *     lineIndex: number;
     *     columnId: string;
     *     planeIndex: number;
     *     sourceLine: string;
     *     cellKind: string;
     *   };
     * }[]} */ (null),
  );

  const [lifecycle, setLifecycle] = useState(/** @type {'idle' | 'dissipating' | 'gone'} */ ('idle'));

  const worldPos = useMemo(
    () => SWAMP_POEM_WORLD_POSITION(seabedDepth),
    [seabedDepth],
  );
  const worldRot = useMemo(
    () => SWAMP_POEM_WORLD_ROTATION(seabedDepth),
    [seabedDepth],
  );

  const debugCars = useMemo(
    () => swampPoemDebugCarAnchors(seabedDepth),
    [seabedDepth],
  );

  const fillHex = useMemo(
    () => typographyFillHex(murkiness, typographyTint),
    [murkiness, typographyTint],
  );

  const layout = useMemo(
    () => buildSwampPoemRebuildPanels(SWAMP_MOLLY_POEM_RAW, murkiness, typographyTint),
    [murkiness, typographyTint],
  );

  const { panels, bounds, layoutMeta, dissipationCharCells } = layout;

  const flickerHostPlaneIndex = useMemo(
    () => panels.findIndex((p) => Boolean(p.flickerOverlay)),
    [panels],
  );

  useLayoutEffect(() => {
    panelMatRefs.current = new Array(panels.length);
    panelSnapPosRef.current = Array.from({ length: panels.length }, () => new THREE.Vector3());
    panelSnapRotRef.current = Array.from({ length: panels.length }, () => new THREE.Euler());
  }, [panels.length]);

  useEffect(() => {
    return () => {
      for (const p of panels) {
        p.texture.dispose();
        p.flickerOverlay?.texture.dispose();
      }
      const ps = particleStateRef.current;
      if (ps) {
        for (const x of ps) {
          x.mesh.geometry.dispose();
          const m = x.mesh.material;
          if (m && !Array.isArray(m)) m.dispose();
        }
      }
      for (const [, v] of _glyphTexCache) {
        v.map.dispose();
      }
      _glyphTexCache.clear();
    };
  }, [panels]);

  useEffect(() => {
    revealSmoothedRef.current = 0;
    revealInitSyncedRef.current = false;
    hasSpawnSampleRef.current = false;
    initialDistanceToPoemRef.current = -1;
    poemRevealEligibleRef.current = false;
    discoveryElapsedRef.current = 0;
    flickPhraseMsAccumRef.current = 0;
    flickPhraseNextMsRef.current = 100;
    flickPhraseStepRef.current = 0;
    flickPhraseMultRef.current = 1;
    setLifecycle('idle');
    triggeredRef.current = false;
    dissipationReasonRef.current = null;
    dissTRef.current = 0;
    floatFrozenRef.current = false;
    panelFloatFrozenRef.current = false;
    dissipateMotionLogAccRef.current = 0;
  }, [murkiness, typographyTint, seabedDepth]);

  useEffect(() => {
    if (!AQ_POEM_DEBUG) return;
    console.info('[aqpoemdebug]', {
      oldPoemRendererMounted: false,
      newPoemRendererMounted: true,
      poemPresent,
      poemGateOn,
      componentMounted: true,
      panelCount: panels.length,
      columnCount: layoutMeta.columnCount,
      headingLines: layoutMeta.headingLines,
      leftColumnLineCount: layoutMeta.leftColumnLineCount,
      rightColumnLineCount: layoutMeta.rightColumnLineCount,
      fontCssSample: layoutMeta.fontCssSample,
      fontMatchesLabel: layoutMeta.fontMatchesLabel,
      staticOnly: SWAMP_POEM_REBUILD_STATIC_ONLY,
      dissipationEnabled: !SWAMP_POEM_REBUILD_STATIC_ONLY,
      pointerStartsDissipation: false,
      clickToDissipateEnabled: false,
    });
  }, [
    poemPresent,
    poemGateOn,
    panels.length,
    layoutMeta.columnCount,
    layoutMeta.headingLines,
    layoutMeta.leftColumnLineCount,
    layoutMeta.rightColumnLineCount,
    layoutMeta.fontCssSample,
    layoutMeta.fontMatchesLabel,
  ]);

  const startDissipation = useCallback(() => {
      if (SWAMP_POEM_REBUILD_STATIC_ONLY) return;
      if (triggeredRef.current) return;
      const grp = floatGroupRef.current;
      if (!grp) return;
      const reason = 'physical-volume';
      triggeredRef.current = true;
      dissipationReasonRef.current = reason;
      dissTRef.current = 0;
      floatFrozenRef.current = true;
      floatSnapPosRef.current.copy(grp.position);
      floatSnapRotRef.current.copy(grp.rotation);
      grp.position.copy(floatSnapPosRef.current);
      grp.rotation.copy(floatSnapRotRef.current);
      panelFloatFrozenRef.current = true;
      for (let pi = 0; pi < panels.length; pi += 1) {
        const col = columnGroupRefs.current[pi];
        const sp = panelSnapPosRef.current[pi];
        const sr = panelSnapRotRef.current[pi];
        if (col && sp && sr) {
          sp.copy(col.position);
          sr.copy(col.rotation);
        }
      }
      freezeAlignmentLoggedRef.current = false;
      setLifecycle('dissipating');

      const contact = dissipationContactLocalRef.current;
      const cells = dissipationCharCells;
      grp.updateMatrixWorld(true);
      const colRefs = columnGroupRefs.current;
      let dMin = Infinity;
      let dMax = -Infinity;

      /** @type {THREE.Vector3[]} */
      const homes = [];
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        const col = colRefs[cell.planeIndex];
        const panel = panels[cell.planeIndex];
        if (!col || !panel) {
          console.error('[SwampMollyPoemRebuild] missing columnGroupRef for planeIndex', cell.planeIndex);
          const sy = panel?.stackY ?? 0;
          const ox = panel?.offsetX ?? 0;
          const colBias =
            panel?.column === 'left' ? SWAMP_POEM_PANEL_Y_BIAS : -SWAMP_POEM_PANEL_Y_BIAS;
          const pz =
            panel?.column === 'left' || cell.planeIndex === 0
              ? -SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5
              : SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5;
          homes.push(
            new THREE.Vector3(
              cell.panelLocalX + ox,
              cell.panelLocalY + sy + colBias,
              cell.panelLocalZ + pz,
            ),
          );
          continue;
        }
        poemCharHomeInFloatSpace(col, grp, cell.panelLocalX, cell.panelLocalY, cell.panelLocalZ, _homeTmp);
        homes.push(new THREE.Vector3().copy(_homeTmp));
      }

      const leftPartIdx = cells.map((c, i) => (c.planeIndex === 0 ? i : -1)).filter((i) => i >= 0);
      const rightPartIdx = cells.map((c, i) => (c.planeIndex === 1 ? i : -1)).filter((i) => i >= 0);
      const headingIdx = cells.map((c, i) => (c.columnId === 'heading' ? i : -1)).filter((i) => i >= 0);

      const lxLeft = leftPartIdx.map((i) => homes[i].x);
      const lxRight = rightPartIdx.map((i) => homes[i].x);
      const leftParticleMinX = lxLeft.length ? Math.min(...lxLeft) : 0;
      const leftParticleMaxX = lxLeft.length ? Math.max(...lxLeft) : 0;
      const rightParticleMinX = lxRight.length ? Math.min(...lxRight) : 0;
      const rightParticleMaxX = lxRight.length ? Math.max(...lxRight) : 0;

      const hx = headingIdx.map((i) => homes[i].x);
      const headingParticleMinX = hx.length ? Math.min(...hx) : 0;
      const headingParticleMaxX = hx.length ? Math.max(...hx) : 0;

      const panelL = panels[0];
      const panelR = panels[1];
      const plCol = colRefs[0];
      const prCol = colRefs[1];
      /** @type {[number, number]} */
      const panelLeftColumnX = [0, 0];
      /** @type {[number, number]} */
      const panelRightColumnX = [0, 0];
      if (plCol) columnPanelXRangeInFloat(plCol, grp, panelL.planeW, panelLeftColumnX);
      else {
        const pl0 = (panelL.offsetX ?? 0) - panelL.planeW * 0.5;
        const pl1 = (panelL.offsetX ?? 0) + panelL.planeW * 0.5;
        panelLeftColumnX[0] = pl0;
        panelLeftColumnX[1] = pl1;
      }
      if (prCol) columnPanelXRangeInFloat(prCol, grp, panelR.planeW, panelRightColumnX);
      else {
        const pr0 = (panelR.offsetX ?? 0) - panelR.planeW * 0.5;
        const pr1 = (panelR.offsetX ?? 0) + panelR.planeW * 0.5;
        panelRightColumnX[0] = pr0;
        panelRightColumnX[1] = pr1;
      }
      const [pl0, pl1] = panelLeftColumnX;
      const [pr0, pr1] = panelRightColumnX;

      const eps = 0.35;
      const particleXRangesMatchPanelsApprox =
        leftParticleMinX >= pl0 - eps &&
        leftParticleMaxX <= pl1 + eps &&
        rightParticleMinX >= pr0 - eps &&
        rightParticleMaxX <= pr1 + eps;

      let lXMin = Infinity;
      let lXMax = -Infinity;
      let lYMin = Infinity;
      let lYMax = -Infinity;
      let lZMin = Infinity;
      let lZMax = -Infinity;
      for (const h of homes) {
        if (h.x < lXMin) lXMin = h.x;
        if (h.x > lXMax) lXMax = h.x;
        if (h.y < lYMin) lYMin = h.y;
        if (h.y > lYMax) lYMax = h.y;
        if (h.z < lZMin) lZMin = h.z;
        if (h.z > lZMax) lZMax = h.z;
      }

      const floorRefY = swampPoemFloorReferenceY(seabedDepth);
      const muckFadeStartY = floorRefY + SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR;
      const muckFadeEndY = floorRefY + SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR;

      const sampleParticleHomes = [];
      const sampleCap = 20;
      for (let si = 0; si < cells.length && si < sampleCap; si += 1) {
        const c = cells[si];
        const h = homes[si];
        sampleParticleHomes.push({
          sourceIndex: c.sourceIndex,
          char: c.char,
          lineIndex: c.lineIndex,
          columnId: c.columnId,
          columnKey: c.columnKey,
          cellKind: c.cellKind,
          planeIndex: c.planeIndex,
          sourceLine: (c.sourceLine ?? '').slice(0, 80),
          glyphWidthPx: c.glyphWidthPx,
          lineHeightPx: c.lineHeightPx,
          fontPx: c.fontPx,
          panelPxToWorld: c.panelPxToWorld,
          homeFloatLocal: [h.x, h.y, h.z],
        });
      }

      dissipationColumnDebugRef.current = {
        leftParticleMinX,
        leftParticleMaxX,
        rightParticleMinX,
        rightParticleMaxX,
        headingParticleMinX,
        headingParticleMaxX,
        panelLeftColumnX,
        panelRightColumnX,
        particleXRangesMatchPanelsApprox,
        particleLocalBoundsBeforeMotion: {
          min: [lXMin, lYMin, lZMin],
          max: [lXMax, lYMax, lZMax],
        },
        aqpoemfreezeActive: AQ_POEM_FREEZE,
        freezePhase: AQ_POEM_FREEZE ? 'alignment' : null,
        particleSpawnSpace: 'floatGroupLocalViaColumnMatrixWorld',
        sampleParticleHomes,
      };

      if (AQ_POEM_DEBUG) {
        const sampleLines = ['no, no.', 'who put his hand on my knee to tell me what'];
        const particleScaleLineAudit = [];
        for (const lineText of sampleLines) {
          const lineCells = cells.filter((c) => c.sourceLine === lineText);
          if (!lineCells.length) continue;
          const pi = lineCells[0].planeIndex;
          const panel = panels[pi];
          const effPanel = panel.planeW / panel.canvasW;
          const linePx = measureSwampPoemLineWidthPx(lineText, SWAMP_POEM_BODY_FONT_PX);
          const staticLineWorld = linePx * effPanel;
          let sumGlyphAdvWorld = 0;
          let sumPaddedPlaneW = 0;
          for (const lc of lineCells) {
            const pxt = lc.panelPxToWorld ?? effPanel;
            sumGlyphAdvWorld += lc.glyphWidthPx * pxt * SWAMP_POEM_PARTICLE_FONT_SCALE;
            sumPaddedPlaneW +=
              (lc.glyphWidthPx + SWAMP_POEM_PARTICLE_TEXTURE_PAD_X * 2) *
              pxt *
              SWAMP_POEM_PARTICLE_FONT_SCALE;
          }
          particleScaleLineAudit.push({
            line: lineText,
            panelCanvasWidthPx: panel.canvasW,
            panelPlaneWorldWidth: panel.planeW,
            panelEffectivePxToWorld: effPanel,
            globalSWAMP_POEM_PIXEL_TO_WORLD: SWAMP_POEM_PIXEL_TO_WORLD,
            matchesGlobal: Math.abs(effPanel - SWAMP_POEM_PIXEL_TO_WORLD) < 1e-9,
            lineMeasuredWidthPx: linePx,
            staticLineWorldWidth: staticLineWorld,
            sumParticleGlyphAdvancesWorld: sumGlyphAdvWorld,
            sumParticlePaddedQuadWidthsWorld: sumPaddedPlaneW,
            glyphCellCount: lineCells.length,
            note: 'sumGlyphAdv misses inter-letter pixels that belong to spaces (no cells)',
            ratioGlyphSumToStaticLine:
              staticLineWorld > 0 ? sumGlyphAdvWorld / staticLineWorld : null,
            inkWorldWidthPerGlyph: 'glyphWidthPx * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE',
            quadWorldWidthPerGlyph:
              '(glyphWidthPx + 2*TEXTURE_PAD) * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE',
          });
        }

        console.info('[aqpoemdebug] dissipationStart', {
          dissipationStartReason: reason,
          floatSnapPosition: floatSnapPosRef.current.toArray(),
          floatSnapRotation: [floatSnapRotRef.current.x, floatSnapRotRef.current.y, floatSnapRotRef.current.z],
          panelSnapFloatLocal: panels.map((_, pi) => ({
            planeIndex: pi,
            position: panelSnapPosRef.current[pi]?.toArray() ?? null,
            rotation: panelSnapRotRef.current[pi]
              ? [panelSnapRotRef.current[pi].x, panelSnapRotRef.current[pi].y, panelSnapRotRef.current[pi].z]
              : null,
          })),
          aqpoemfreezeActive: AQ_POEM_FREEZE,
          aqpoemfreezeplainActive: AQ_POEM_FREEZE_PLAIN,
          freezePhase: AQ_POEM_FREEZE ? 'alignment' : null,
          poemTypographyMatch: {
            staticFontCssRoman: swampPoemRebuildCanvasFont(SWAMP_POEM_BODY_FONT_PX, false),
            staticFontCssItalic: swampPoemRebuildCanvasFont(SWAMP_POEM_BODY_FONT_PX, true),
            staticBodyFontPx: SWAMP_POEM_BODY_FONT_PX,
            staticLineHeightPx: SWAMP_POEM_BODY_FONT_PX * SWAMP_POEM_LINE_HEIGHT_MUL,
            particleFontCssSource: 'identical per cell (fontPx, italic from layout)',
            particleGlyphWidthSource: 'ctx.measureText(ch).width from same layout pass as panel',
            particlePlaneWidthWorld:
              '(glyphWidthPx + 2*SWAMP_POEM_PARTICLE_TEXTURE_PAD_X) * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE',
            particlePlaneHeightWorld:
              '(lineHeightPx + 2*SWAMP_POEM_PARTICLE_TEXTURE_PAD_Y) * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE',
            particleInkWidthWorld:
              'glyphWidthPx * panelPxToWorld * SWAMP_POEM_PARTICLE_FONT_SCALE (via padded atlas UVs)',
            panelPxToWorldPerCell: 'panel.planeW / panel.canvasW (strip uses strip.planeW/cssW)',
            SWAMP_POEM_PARTICLE_TEXTURE_PAD_X,
            SWAMP_POEM_PARTICLE_TEXTURE_PAD_Y,
            canvasDpr: SWAMP_POEM_DPR,
            SWAMP_POEM_PIXEL_TO_WORLD,
            SWAMP_POEM_PARTICLE_FONT_SCALE,
          },
          particleScaleLineAudit,
          contactPointLocal: contact.toArray(),
          particleCount: cells.length,
          flickerPhraseParticleCount: layoutMeta.flickerPhraseParticleCount ?? 0,
          handoffHoldSeconds: SWAMP_POEM_HANDOFF_HOLD_SECONDS,
          panelToParticleCrossfadeSeconds: SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS,
          motionStartsAfterSec:
            SWAMP_POEM_HANDOFF_HOLD_SECONDS +
            SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS +
            '(+ perLetterDelay)',
          detachDuration: SWAMP_POEM_DISSIPATE_DETACH_DURATION,
          lingerDuration: SWAMP_POEM_DISSIPATE_LINGER_DURATION,
          particleOpacityMode: AQ_POEM_FREEZE ? 'freeze-debug-fixed' : 'muck-depth',
          globalFadeActive: false,
          muckFadeStartY,
          muckFadeEndY,
          floorReferenceY: floorRefY,
          ...dissipationColumnDebugRef.current,
          dissipationRevealLatched: dissipationRevealLatchRef.current,
          particlesSpawnAtColumnGroupTransform: true,
          panelOpacityCrossfades: true,
        });
      }

      /** @type {NonNullable<typeof particleStateRef.current>} */
      const next = [];
      const rng = (i, k) => {
        const v = Math.sin(i * 12.9898 + k * 78.233 + 99.321) * 43758.5453;
        return v - Math.floor(v);
      };

      const debugTintHex = (cell) => {
        if (AQ_POEM_FREEZE_PLAIN) return 0xffffff;
        if (!(AQ_POEM_DEBUG && AQ_POEM_FREEZE)) return 0xffffff;
        if (cell.columnId === 'heading') return 0xffaa66;
        if (cell.columnId === 'flicker') return 0xee66ff;
        return cell.columnKey === 'left' ? 0x66ff88 : 0x6699ff;
      };

      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        const home = homes[i].clone();
        home.x += SWAMP_POEM_PARTICLE_X_NUDGE;
        home.y += SWAMP_POEM_PARTICLE_Y_NUDGE + SWAMP_POEM_PARTICLE_BASELINE_NUDGE_Y;
        const dx = home.x - contact.x;
        const dy = home.y - contact.y;
        const dz = home.z - contact.z;
        const distContact = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ra = rng(i, 11) * SWAMP_POEM_RANDOM_STAGGER_MAX;
        const detachDelay = THREE.MathUtils.clamp(
          distContact * SWAMP_POEM_CONTACT_STAGGER_SCALE + ra,
          0,
          SWAMP_POEM_LETTER_STAGGER_MAX_SEC,
        );
        if (detachDelay < dMin) dMin = detachDelay;
        if (detachDelay > dMax) dMax = detachDelay;

        const fontPxCell = cell.fontPx ?? SWAMP_POEM_BODY_FONT_PX;
        const lineHeightCell = cell.lineHeightPx ?? fontPxCell * SWAMP_POEM_LINE_HEIGHT_MUL;
        let glyphW = cell.glyphWidthPx;
        if (glyphW == null || !Number.isFinite(glyphW)) {
          glyphW = fontPxCell * 0.55;
        }
        const { map: baseMap, w: planeW, h: planeH } = letterTextureMatchingPanel({
          char: cell.char,
          fillHex,
          fontPx: fontPxCell,
          italic: cell.italic ?? false,
          glyphWidthPx: glyphW,
          lineHeightPx: lineHeightCell,
          panelPxToWorld: cell.panelPxToWorld ?? SWAMP_POEM_PIXEL_TO_WORLD,
        });
        const map = baseMap.clone();
        map.needsUpdate = true;
        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mat = new THREE.MeshBasicMaterial({
          map,
          color: new THREE.Color(debugTintHex(cell)),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = POEM_RENDER_ORDER + 2;
        mesh.position.copy(home);
        grp.add(mesh);

        const vel = new THREE.Vector3(
          (rng(i, 1) - 0.5) * SWAMP_POEM_LETTER_DRIFT_AMOUNT * 0.048,
          -0.09 * SWAMP_POEM_LETTER_SINK_AMOUNT * (0.72 + rng(i, 2) * 0.48),
          (rng(i, 3) - 0.5) * SWAMP_POEM_LETTER_Z_DRIFT_AMOUNT * 0.048,
        );
        const rotVel = new THREE.Vector3(
          (rng(i, 4) - 0.5) * SWAMP_POEM_LETTER_ROTATION_AMOUNT * 0.5,
          (rng(i, 5) - 0.5) * SWAMP_POEM_LETTER_ROTATION_AMOUNT * 0.5,
          (rng(i, 6) - 0.5) * SWAMP_POEM_LETTER_ROTATION_AMOUNT * 0.42,
        );
        next.push({
          mesh,
          home,
          offsetAccum: new THREE.Vector3(),
          vel,
          rotVel,
          detachDelay,
          wobblePhase: rng(i, 7) * Math.PI * 2,
          meta: {
            char: cell.char,
            sourceIndex: cell.sourceIndex ?? i,
            lineIndex: cell.lineIndex,
            columnId: cell.columnId ?? 'body',
            planeIndex: cell.planeIndex,
            sourceLine: cell.sourceLine ?? '',
            cellKind: cell.cellKind,
          },
        });
      }
      letterStaggerRangeRef.current = {
        min: dMin === Infinity ? 0 : dMin,
        max: dMax === -Infinity ? 0 : dMax,
      };
      particleStateRef.current = next;
    },
    [
      dissipationCharCells,
      fillHex,
      layoutMeta.flickerPhraseParticleCount,
      panels,
      seabedDepth,
    ],
  );

  useFrame((state, dt) => {
    const elapsed = state.clock.elapsedTime;
    const motionExperimentActive = SWAMP_POEM_ENABLE_FLOAT_SHIMMER && AQ_POEM_MOTION_TEST;
    const floatExperimentActive = motionExperimentActive && SWAMP_POEM_FLOAT_ENABLED;
    const shimmerExperimentActive = motionExperimentActive && SWAMP_POEM_SHIMMER_ENABLED;
    const floatTestMul = motionExperimentActive && AQ_POEM_FLOAT_TEST ? 4 : 1;
    const shimmerTestMul = motionExperimentActive && AQ_POEM_FLOAT_TEST ? 3 : 1;
    const effShimmerAmount = motionExperimentActive ? SWAMP_POEM_SHIMMER_AMOUNT * shimmerTestMul : 0;
    const floatGrp = floatGroupRef.current;
    if (floatGrp && floatFrozenRef.current) {
      floatGrp.position.copy(floatSnapPosRef.current);
      floatGrp.rotation.copy(floatSnapRotRef.current);
    } else if (floatGrp && motionExperimentActive && SWAMP_POEM_FLOAT_ENABLED) {
      const ft = elapsed * SWAMP_POEM_FLOAT_SPEED;
      const bob = SWAMP_POEM_FLOAT_BOB_AMOUNT * Math.sin(ft * 0.55) * floatTestMul;
      const driftX = SWAMP_POEM_FLOAT_DRIFT_AMOUNT * Math.sin(ft * 0.23 + 0.72) * floatTestMul;
      const driftZ =
        SWAMP_POEM_FLOAT_DRIFT_AMOUNT * 0.64 * Math.cos(ft * 0.19 + 1.85) * floatTestMul;
      const yaw = SWAMP_POEM_FLOAT_YAW_AMOUNT * Math.sin(ft * 0.31 + 0.41) * floatTestMul;
      const pitch = SWAMP_POEM_FLOAT_PITCH_AMOUNT * Math.sin(ft * 0.27 + 2.05) * floatTestMul;
      const roll = SWAMP_POEM_FLOAT_ROLL_AMOUNT * Math.cos(ft * 0.21 + 0.79) * floatTestMul;
      floatGrp.position.set(driftX, bob, driftZ);
      floatGrp.rotation.set(pitch, yaw, roll);
    } else if (floatGrp) {
      floatGrp.position.set(0, 0, 0);
      floatGrp.rotation.set(0, 0, 0);
    }

    if (floatGrp) {
      if (panelFloatFrozenRef.current) {
        for (let pi = 0; pi < panels.length; pi += 1) {
          const col = columnGroupRefs.current[pi];
          const sp = panelSnapPosRef.current[pi];
          const sr = panelSnapRotRef.current[pi];
          if (col && sp && sr) {
            col.position.copy(sp);
            col.rotation.copy(sr);
          }
        }
      } else if (motionExperimentActive && SWAMP_POEM_PANEL_IDLE_MOTION_ENABLED) {
        for (let pi = 0; pi < panels.length; pi += 1) {
          const p = panels[pi];
          const col = columnGroupRefs.current[pi];
          if (!col) continue;
          const colBias = p.column === 'left' ? SWAMP_POEM_PANEL_Y_BIAS : -SWAMP_POEM_PANEL_Y_BIAS;
          const baseZ =
            p.column === 'left' || p.planeIndex === 0
              ? -SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5
              : SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5;
          const baseX = p.offsetX ?? 0;
          const baseY = (p.stackY ?? 0) + colBias;
          const ph = pi === 0 ? SWAMP_POEM_PANEL_MOTION_PHASE_LEFT : SWAMP_POEM_PANEL_MOTION_PHASE_RIGHT;
          const pm = elapsed * SWAMP_POEM_PANEL_MOTION_SPEED + ph;
          const bob = SWAMP_POEM_PANEL_BOB_Y_AMOUNT * Math.sin(pm * 0.41) * floatTestMul;
          const dz = SWAMP_POEM_PANEL_DRIFT_Z_AMOUNT * Math.sin(pm * 0.33 + 1.1) * floatTestMul;
          const dx = SWAMP_POEM_PANEL_DRIFT_X_AMOUNT * Math.sin(pm * 0.29 + 0.55) * floatTestMul;
          const rz = SWAMP_POEM_PANEL_ROT_Z_AMOUNT * Math.sin(pm * 0.37 + 0.2) * floatTestMul;
          col.position.set(baseX + dx, baseY + bob, baseZ + dz);
          col.rotation.set(0, 0, rz);
        }
      } else {
        for (let pi = 0; pi < panels.length; pi += 1) {
          const p = panels[pi];
          const col = columnGroupRefs.current[pi];
          if (!col) continue;
          const colBias = p.column === 'left' ? SWAMP_POEM_PANEL_Y_BIAS : -SWAMP_POEM_PANEL_Y_BIAS;
          const baseZ =
            p.column === 'left' || p.planeIndex === 0
              ? -SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5
              : SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5;
          const baseX = p.offsetX ?? 0;
          const baseY = (p.stackY ?? 0) + colBias;
          col.position.set(baseX, baseY, baseZ);
          col.rotation.set(0, 0, 0);
        }
      }
    }

    if (
      SWAMP_POEM_FLICKER_ENABLED &&
      layoutMeta.flickerPhraseFound &&
      lifecycle === 'idle'
    ) {
      flickPhraseMsAccumRef.current += dt * 1000;
      while (flickPhraseMsAccumRef.current >= flickPhraseNextMsRef.current) {
        flickPhraseMsAccumRef.current -= flickPhraseNextMsRef.current;
        flickPhraseStepRef.current += 1;
        flickPhraseMultRef.current = poemFlickerMultiplierSample(
          elapsed,
          flickPhraseStepRef.current,
        );
        flickPhraseNextMsRef.current = poemFlickerIntervalMs(
          elapsed,
          flickPhraseStepRef.current,
        );
      }
    } else {
      flickPhraseMultRef.current = 1;
    }
    const anchor = anchorRef.current;
    let dist = -1;
    let discoveryFadeOpacity = 0;
    let eligibilityReason = anchor ? 'pending' : 'no_anchor';
    let approachProgress = 0;
    let distanceFromSpawn = 0;
    let gateOk = false;
    let approachOk = false;
    let finalPanelOpacity = 0;
    let revealTargetOpacity = 0;

    if (anchor) {
      anchor.getWorldPosition(_wpos);
      dist = camera.position.distanceTo(_wpos);

      if (!hasSpawnSampleRef.current) {
        spawnPositionRef.current.copy(camera.position);
        initialDistanceToPoemRef.current = dist;
        hasSpawnSampleRef.current = true;
      }

      distanceFromSpawn = camera.position.distanceTo(spawnPositionRef.current);
      approachProgress =
        initialDistanceToPoemRef.current >= 0
          ? initialDistanceToPoemRef.current - dist
          : 0;

      if (!poemRevealEligibleRef.current) {
        gateOk = dist < SWAMP_POEM_VISIBILITY_GATE_DISTANCE;
        approachOk =
          dist < initialDistanceToPoemRef.current - SWAMP_POEM_MIN_APPROACH_PROGRESS;
        if (gateOk && approachOk) {
          poemRevealEligibleRef.current = true;
          discoveryElapsedRef.current = 0;
        }
      }

      if (poemRevealEligibleRef.current) {
        discoveryElapsedRef.current += dt;
        const u = Math.min(1, discoveryElapsedRef.current / SWAMP_POEM_DISCOVERY_FADE_SECONDS);
        discoveryFadeOpacity = swampPoemSmootherstep01(u);
      }

      if (!revealInitSyncedRef.current) {
        revealSmoothedRef.current = swampPoemRevealOpacity(dist);
        revealInitSyncedRef.current = true;
      }
      revealTargetOpacity = swampPoemRevealOpacity(dist);
      const k = 1 - Math.exp(-SWAMP_POEM_REVEAL_SMOOTHING * dt);
      revealSmoothedRef.current += (revealTargetOpacity - revealSmoothedRef.current) * k;

      const eligible = poemRevealEligibleRef.current;
      finalPanelOpacity = eligible ? revealSmoothedRef.current * discoveryFadeOpacity : 0;
      if (lifecycle === 'idle') {
        const panelCount = panelMatRefs.current.length;
        if (motionExperimentActive && SWAMP_POEM_SHIMMER_ENABLED && effShimmerAmount > 0) {
          for (let i = 0; i < panelCount; i += 1) {
            const m = panelMatRefs.current[i];
            if (!m) continue;
            const phaseBase = i === 0 ? SWAMP_POEM_SHIMMER_PHASE_LEFT : SWAMP_POEM_SHIMMER_PHASE_RIGHT;
            const phase = elapsed * SWAMP_POEM_SHIMMER_SPEED + phaseBase;
            let opacityMul = 1;
            let bright = 1;
            let aqua = 0;
            const wBright =
              0.52 * Math.sin(phase * 1.03) +
              0.33 * Math.sin(phase * 0.57 + 1.4) +
              0.15 * Math.sin(phase * 0.33 + 2.1);
            bright = THREE.MathUtils.clamp(
              1 + effShimmerAmount * wBright,
              1 - effShimmerAmount * 0.68,
              1 + effShimmerAmount * 0.68,
            );
            aqua = effShimmerAmount * 0.09 * Math.sin(phase * 0.74 + 0.35);
            const wOp = Math.sin(elapsed * SWAMP_POEM_SHIMMER_SPEED * 0.31 + 0.4 + i * 0.55);
            const breath = (0.5 + 0.5 * wOp) * 0.45;
            opacityMul = SWAMP_POEM_SHIMMER_OPACITY_FLOOR + (1 - SWAMP_POEM_SHIMMER_OPACITY_FLOOR) * breath;
            _panelShimmerColor.setRGB(bright + aqua, bright, bright + aqua * 0.65);
            m.color.copy(_panelShimmerColor);
            m.opacity = finalPanelOpacity * opacityMul;
          }
          const flickMat = flickerPhraseMatRef.current;
          if (flickMat) {
            const host = flickerHostPlaneIndex >= 0 ? flickerHostPlaneIndex : 0;
            const flickPhaseBase =
              host === 0 ? SWAMP_POEM_SHIMMER_PHASE_LEFT : SWAMP_POEM_SHIMMER_PHASE_RIGHT;
            const phase = elapsed * SWAMP_POEM_SHIMMER_SPEED + flickPhaseBase;
            const wBright =
              0.52 * Math.sin(phase * 1.03) +
              0.33 * Math.sin(phase * 0.57 + 1.4) +
              0.15 * Math.sin(phase * 0.33 + 2.1);
            const bright = THREE.MathUtils.clamp(
              1 + effShimmerAmount * wBright,
              1 - effShimmerAmount * 0.68,
              1 + effShimmerAmount * 0.68,
            );
            const aqua = effShimmerAmount * 0.09 * Math.sin(phase * 0.74 + 0.35);
            _flickerShimmerColor.setRGB(bright + aqua, bright, bright + aqua * 0.65);
            flickMat.color.copy(_flickerShimmerColor);
            const fMul =
              SWAMP_POEM_FLICKER_ENABLED && layoutMeta.flickerPhraseFound
                ? flickPhraseMultRef.current
                : 1;
            flickMat.opacity = finalPanelOpacity * fMul;
          }
        } else {
          for (let i = 0; i < panelCount; i += 1) {
            const m = panelMatRefs.current[i];
            if (!m) continue;
            m.color.setRGB(1, 1, 1);
            m.opacity = finalPanelOpacity;
          }
          const flickMat = flickerPhraseMatRef.current;
          if (flickMat) {
            flickMat.color.setRGB(1, 1, 1);
            const fMul =
              SWAMP_POEM_FLICKER_ENABLED && layoutMeta.flickerPhraseFound
                ? flickPhraseMultRef.current
                : 1;
            flickMat.opacity = finalPanelOpacity * fMul;
          }
        }
      }

      if (poemRevealEligibleRef.current) {
        eligibilityReason = 'eligible_session_locked';
      } else if (!gateOk && !approachOk) {
        eligibilityReason = 'need_gate_and_approach';
      } else if (!gateOk) {
        eligibilityReason = 'need_gate_closer';
      } else {
        eligibilityReason = 'need_approach_progress';
      }
    }

    if (AQ_POEM_DEBUG) {
      heartbeatRef.current += dt;
      if (heartbeatRef.current >= 2) {
        heartbeatRef.current = 0;
        const revealSmoothedOpacity = revealSmoothedRef.current;
        const distanceRevealOpacity = revealSmoothedOpacity;
        const m0 = panelMatRefs.current[0];
        const panelMaterial0 = m0
          ? {
              depthTest: m0.depthTest,
              depthWrite: m0.depthWrite,
              side: m0.side,
              opacity: m0.opacity,
              transparent: m0.transparent,
              toneMapped: m0.toneMapped,
              fog: m0.fog,
            }
          : null;
        const sc = SWAMP_POEM_WORLD_SCALE;
        const topWorldY = worldPos[1] + bounds.halfH * sc;
        const bottomWorldY = worldPos[1] - bounds.halfH * sc;
        const floorRefY = swampPoemFloorReferenceY(seabedDepth);
        const carsAnchors = {
          rustyApprox: debugCars.rusty,
          fiatApprox: debugCars.fiat,
          poemWorld: worldPos.slice(),
        };
        console.info('[aqpoemdebug] poemRebuildHeartbeat', {
          oldPoemRendererMounted: false,
          newPoemRendererMounted: true,
          poemPresent,
          poemGateOn,
          componentMounted: true,
          panelCount: panels.length,
          layoutMeta,
          boundsLocalHalfW: bounds.halfW,
          boundsLocalHalfH: bounds.halfH,
          totalBlockHeightWorld: layoutMeta.totalBlockHeightWorld,
          topWorldY,
          bottomWorldY,
          floorReferenceY: floorRefY,
          initialDistanceToPoem: initialDistanceToPoemRef.current,
          currentDistanceToPoem: dist,
          approachProgress,
          distanceFromSpawn,
          poemRevealEligible: poemRevealEligibleRef.current,
          eligibilityReason,
          visibilityGateDistance: SWAMP_POEM_VISIBILITY_GATE_DISTANCE,
          minApproachProgress: SWAMP_POEM_MIN_APPROACH_PROGRESS,
          discoveryFadeOpacity,
          discoveryFadeSeconds: SWAMP_POEM_DISCOVERY_FADE_SECONDS,
          discoveryFadeCurve: SWAMP_POEM_DISCOVERY_FADE_CURVE,
          distanceRevealOpacity,
          revealTargetOpacity,
          finalPanelOpacity,
          finalOpacityFormula:
            'poemRevealEligible ? revealSmoothed(distanceCurve) * discoverySmootherstep(elapsed/discSeconds) : 0',
          hasDiscoveryFadeStarted:
            poemRevealEligibleRef.current && discoveryElapsedRef.current > 0,
          timeSinceDiscovery: poemRevealEligibleRef.current ? discoveryElapsedRef.current : 0,
          revealDistance: dist,
          revealSmoothedOpacity,
          revealOpacity: finalPanelOpacity,
          revealSmoothing: SWAMP_POEM_REVEAL_SMOOTHING,
          revealCurvePow: SWAMP_POEM_REVEAL_CURVE_POW,
          revealCurveLabel: SWAMP_POEM_REVEAL_CURVE_LABEL,
          revealStartDistance: SWAMP_POEM_REVEAL_START_DISTANCE,
          revealFullDistance: SWAMP_POEM_REVEAL_FULL_DISTANCE,
          revealMinOpacity: SWAMP_POEM_REVEAL_MIN_OPACITY,
          revealMaxOpacity: SWAMP_POEM_REVEAL_MAX_OPACITY,
          revealDistanceBasedOnly: true,
          angleBasedReveal: false,
          lifecycle: SWAMP_POEM_REBUILD_STATIC_ONLY ? 'static-only' : lifecycle,
          dissipationStartReason: dissipationReasonRef.current,
          dissipationContactPointLocal: dissipationContactLocalRef.current.toArray(),
          perLetterDelayMinMaxSec: letterStaggerRangeRef.current,
          dissipationTimerSec:
            lifecycle === 'dissipating' ? dissTRef.current : lifecycle === 'gone' ? null : 0,
          dissipationPhase: SWAMP_POEM_REBUILD_STATIC_ONLY ? 'n/a' : lifecycle,
          dissipationTiming: {
            handoffHoldSec: SWAMP_POEM_HANDOFF_HOLD_SECONDS,
            panelToParticleCrossfadeSec: SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS,
            motionStartsAfterHandoffPlusCrossfadePlusStagger: true,
            detachSec: SWAMP_POEM_DISSIPATE_DETACH_DURATION,
            lingerSec: SWAMP_POEM_DISSIPATE_LINGER_DURATION,
            safetyCleanupSec: SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS,
            letterStaggerMinMaxSec: letterStaggerRangeRef.current,
          },
          dissipationColumnDiagnostics: dissipationColumnDebugRef.current,
          particleMuckDiagnostics: particleMuckDebugRef.current,
          particleCount: particleStateRef.current?.length ?? 0,
          pointerStartsDissipation: false,
          clickToDissipateEnabled: false,
          poemMotionExperiment: {
            SWAMP_POEM_ENABLE_FLOAT_SHIMMER,
            aqpoemmotiontest: AQ_POEM_MOTION_TEST,
            motionExperimentActive,
            floatExperimentActive,
            shimmerExperimentActive,
            visualtestActive: false,
            panelOpacitySource:
              motionExperimentActive && SWAMP_POEM_SHIMMER_ENABLED && effShimmerAmount > 0
                ? 'reveal-plus-shimmer'
                : 'reveal-only',
            groupMotionActive:
              motionExperimentActive && SWAMP_POEM_FLOAT_ENABLED && !floatFrozenRef.current,
            panelMotionActive:
              motionExperimentActive &&
              SWAMP_POEM_PANEL_IDLE_MOTION_ENABLED &&
              !panelFloatFrozenRef.current,
            aqpoemfloattest: AQ_POEM_FLOAT_TEST,
            aqpoemfloattestHasEffect: motionExperimentActive && AQ_POEM_FLOAT_TEST,
          },
          poemFloatEnabled: SWAMP_POEM_FLOAT_ENABLED,
          cameraLocalInFloatSpace: (() => {
            if (!floatGrp) return null;
            floatGrp.updateMatrixWorld(true);
            _camLocal.copy(camera.position);
            floatGrp.worldToLocal(_camLocal);
            return _camLocal.toArray();
          })(),
          insideTrigger: (() => {
            if (
              SWAMP_POEM_REBUILD_STATIC_ONLY ||
              !floatGrp ||
              lifecycle !== 'idle' ||
              triggeredRef.current
            ) {
              return false;
            }
            floatGrp.updateMatrixWorld(true);
            _camLocal.copy(camera.position);
            floatGrp.worldToLocal(_camLocal);
            const ox = SWAMP_POEM_TRIGGER_CENTER_OFFSET[0];
            const oy = SWAMP_POEM_TRIGGER_CENTER_OFFSET[1];
            const oz = SWAMP_POEM_TRIGGER_CENTER_OFFSET[2];
            const lx = _camLocal.x - ox;
            const ly = _camLocal.y - oy;
            const lz = _camLocal.z - oz;
            return (
              Math.abs(lx) <= SWAMP_POEM_TRIGGER_HALF_WIDTH &&
              Math.abs(ly) <= SWAMP_POEM_TRIGGER_HALF_HEIGHT &&
              Math.abs(lz) <= SWAMP_POEM_TRIGGER_HALF_DEPTH
            );
          })(),
          groupVisible: anchor?.visible ?? false,
          frustumCulledGroup: anchor?.frustumCulled,
          panelMaterial0,
          panelMeshFrustumCulled: false,
          panelRenderOrder: POEM_RENDER_ORDER,
          cameraDistanceToPoemGroup: dist,
          cameraWorldY: camera.position.y,
          poemPosition: worldPos.slice(),
          poemRotation: worldRot.slice(),
          poemScale: SWAMP_POEM_WORLD_SCALE,
          carsAnchors,
          staticOnly: SWAMP_POEM_REBUILD_STATIC_ONLY,
          dissipationDisabled: SWAMP_POEM_REBUILD_STATIC_ONLY,
          flickerPhrase: SWAMP_POEM_FLICKER_PHRASE,
          flickerPhraseFound: layoutMeta.flickerPhraseFound,
          flickerPhraseParticleCount: layoutMeta.flickerPhraseParticleCount ?? 0,
          particlesSpawnAtColumnGroupMatrix: true,
          panelOpacityCrossfadesNotSnaps: true,
          flickerRenderMode: layoutMeta.flickerRenderMode,
          flickerTargetLine: layoutMeta.flickerTargetLine,
          flickerLineFallback: layoutMeta.flickerLineFallback,
          flickerCurrentMultiplier: flickPhraseMultRef.current,
          flickerPhrasePanelOpacity:
            finalPanelOpacity *
            (SWAMP_POEM_FLICKER_ENABLED && layoutMeta.flickerPhraseFound
              ? flickPhraseMultRef.current
              : 1),
        });
        if (AQ_POEM_DEBUG && floatGrp && motionExperimentActive) {
          floatGrp.updateMatrixWorld(true);
          const phaseProof = elapsed * SWAMP_POEM_SHIMMER_SPEED + SWAMP_POEM_SHIMMER_PHASE_LEFT;
          let wBrightProof = 0;
          let brightProof = 1;
          if (SWAMP_POEM_SHIMMER_ENABLED && effShimmerAmount > 0) {
            wBrightProof =
              0.52 * Math.sin(phaseProof * 1.03) +
              0.33 * Math.sin(phaseProof * 0.57 + 1.4) +
              0.15 * Math.sin(phaseProof * 0.33 + 2.1);
            brightProof = THREE.MathUtils.clamp(
              1 + effShimmerAmount * wBrightProof,
              1 - effShimmerAmount * 0.68,
              1 + effShimmerAmount * 0.68,
            );
          }
          console.info('[aqpoemdebug] poemMotionProof', {
            motionExperimentActive,
            SWAMP_POEM_ENABLE_FLOAT_SHIMMER,
            AQ_POEM_MOTION_TEST,
            SWAMP_POEM_FLOAT_BOB_AMOUNT,
            SWAMP_POEM_FLOAT_DRIFT_AMOUNT,
            SWAMP_POEM_FLOAT_YAW_AMOUNT,
            SWAMP_POEM_FLOAT_PITCH_AMOUNT,
            SWAMP_POEM_FLOAT_ROLL_AMOUNT,
            SWAMP_POEM_FLOAT_SPEED,
            AQ_POEM_FLOAT_TEST,
            floatAmplitudeMultiplier_fromFloattest: floatTestMul,
            shimmerAmountMultiplier_fromFloattest: shimmerTestMul,
            SWAMP_POEM_SHIMMER_AMOUNT,
            effectiveShimmerAmount_runtime: effShimmerAmount,
            SWAMP_POEM_REBUILD_STATIC_ONLY,
            lifecycle,
            floatFrozen: floatFrozenRef.current,
            columnIdleMotionSkippedBecauseFrozen: panelFloatFrozenRef.current,
            columnIdleMotionSkippedBecauseDisabled: !SWAMP_POEM_PANEL_IDLE_MOTION_ENABLED,
            note_staticOnlyDoesNotSkipColumnMotion: true,
            floatGroupLocalPosition: floatGrp.position.toArray(),
            floatGroupLocalRotationEulerRad: [
              floatGrp.rotation.x,
              floatGrp.rotation.y,
              floatGrp.rotation.z,
            ],
            floatDeltaFromRest_positionLength: floatGrp.position.length(),
            floatDeltaFromRest_rotationL2Rad: Math.sqrt(
              floatGrp.rotation.x ** 2 + floatGrp.rotation.y ** 2 + floatGrp.rotation.z ** 2,
            ),
            columnGroupPositionsFloatLocal: panels.map((_, pi) => {
              const c = columnGroupRefs.current[pi];
              return c ? c.position.toArray() : null;
            }),
            columnGroupRotationZ: panels.map((_, pi) => {
              const c = columnGroupRefs.current[pi];
              return c ? c.rotation.z : null;
            }),
            columnParentIsFloatGroup: panels.map((_, pi) => {
              const c = columnGroupRefs.current[pi];
              return c ? c.parent === floatGrp : null;
            }),
            floatGroupParentIsAnchor: floatGrp.parent === anchorRef.current,
            shimmerPanel0ComputedBrightnessSample: brightProof,
            shimmerPanel0WBrightSample: wBrightProof,
            panelMaterials: panelMatRefs.current.map((m, i) =>
              m
                ? {
                    planeIndex: i,
                    color: { r: m.color.r, g: m.color.g, b: m.color.b },
                    opacity: m.opacity,
                  }
                : { planeIndex: i, missing: true },
            ),
            flickerMaterial: flickerPhraseMatRef.current
              ? {
                  color: {
                    r: flickerPhraseMatRef.current.color.r,
                    g: flickerPhraseMatRef.current.color.g,
                    b: flickerPhraseMatRef.current.color.b,
                  },
                  opacity: flickerPhraseMatRef.current.opacity,
                }
              : null,
          });
        }
      }
    }

    if (SWAMP_POEM_REBUILD_STATIC_ONLY || !anchor || !floatGrp) return;

    if (lifecycle === 'gone') return;

    if (lifecycle === 'idle') {
      floatGrp.updateMatrixWorld(true);
      _camLocal.copy(camera.position);
      floatGrp.worldToLocal(_camLocal);
      const ox = SWAMP_POEM_TRIGGER_CENTER_OFFSET[0];
      const oy = SWAMP_POEM_TRIGGER_CENTER_OFFSET[1];
      const oz = SWAMP_POEM_TRIGGER_CENTER_OFFSET[2];
      const lx = _camLocal.x - ox;
      const ly = _camLocal.y - oy;
      const lz = _camLocal.z - oz;
      const inside =
        Math.abs(lx) <= SWAMP_POEM_TRIGGER_HALF_WIDTH &&
        Math.abs(ly) <= SWAMP_POEM_TRIGGER_HALF_HEIGHT &&
        Math.abs(lz) <= SWAMP_POEM_TRIGGER_HALF_DEPTH;
      pollAccRef.current += dt;
      if (AQ_POEM_DEBUG && pollAccRef.current >= 1.2) {
        pollAccRef.current = 0;
        console.info('[aqpoemdebug] triggerPoll', {
          camLocalInPoemSpace: _camLocal.toArray(),
          insideTrigger: inside,
          pointerStartsDissipation: false,
        });
      }
      if (inside && !triggeredRef.current) {
        dissipationRevealLatchRef.current =
          poemRevealEligibleRef.current
            ? revealSmoothedRef.current * discoveryFadeOpacity
            : 0;
        dissipationContactLocalRef.current.copy(_camLocal);
        startDissipation();
      }
      return;
    }

    if (lifecycle === 'dissipating') {
      dissTRef.current += dt;
      const t = dissTRef.current;
      const hold = SWAMP_POEM_HANDOFF_HOLD_SECONDS;
      const cross = SWAMP_POEM_PANEL_TO_PARTICLE_CROSSFADE_SECONDS;
      const detach = SWAMP_POEM_DISSIPATE_DETACH_DURATION;
      const linger = SWAMP_POEM_DISSIPATE_LINGER_DURATION;

      const latch = dissipationRevealLatchRef.current;
      const crossT = Math.max(0, t - hold);
      const uHandoff =
        t < hold ? 0 : swampPoemSmootherstep01(Math.min(1, crossT / Math.max(0.001, cross)));
      const panelFactor = 1 - uHandoff;

      const freezeAlignHold = AQ_POEM_FREEZE && t >= hold + cross;
      if (freezeAlignHold && AQ_POEM_DEBUG && !freezeAlignmentLoggedRef.current) {
        freezeAlignmentLoggedRef.current = true;
        const floorYLog = swampPoemFloorReferenceY(seabedDepth);
        const dbg = dissipationColumnDebugRef.current;
        console.info('[aqpoemfreeze]', {
          active: true,
          freezePhase: 'alignment',
          aqpoemfreeze: true,
          particleLocalBounds: dbg?.particleLocalBoundsBeforeMotion ?? null,
          panelLocalBoundsNote: dbg?.particleLocalBoundsBeforeMotion ?? null,
          panelLeftColumnX: dbg?.panelLeftColumnX ?? null,
          panelRightColumnX: dbg?.panelRightColumnX ?? null,
          leftParticleXRange: dbg
            ? [dbg.leftParticleMinX, dbg.leftParticleMaxX]
            : null,
          rightParticleXRange: dbg
            ? [dbg.rightParticleMinX, dbg.rightParticleMaxX]
            : null,
          headingParticleBoundsX: dbg
            ? [dbg.headingParticleMinX, dbg.headingParticleMaxX]
            : null,
          sampleParticleHomes: dbg?.sampleParticleHomes ?? [],
          floorReferenceY: floorYLog,
          muckFadeStartY: floorYLog + SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR,
          muckFadeEndY: floorYLog + SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR,
        });
      }

      if (freezeAlignHold) {
        const pOp = THREE.MathUtils.clamp(0.45 * latch, 0, 1);
        for (const m of panelMatRefs.current) {
          if (m) {
            m.color.setRGB(1, 1, 1);
            m.opacity = pOp;
          }
        }
        const fm = flickerPhraseMatRef.current;
        if (fm) {
          fm.color.setRGB(1, 1, 1);
          fm.opacity = pOp;
        }
      } else {
        for (const m of panelMatRefs.current) {
          if (m) {
            m.color.setRGB(1, 1, 1);
            m.opacity = THREE.MathUtils.clamp(latch * panelFactor, 0, 1);
          }
        }
        const fm = flickerPhraseMatRef.current;
        if (fm) {
          fm.color.setRGB(1, 1, 1);
          fm.opacity = THREE.MathUtils.clamp(latch * panelFactor, 0, 1);
        }
      }

      const partHandoffAlpha = latch * uHandoff;

      const floorY = swampPoemFloorReferenceY(seabedDepth);
      const muckStartY = floorY + SWAMP_POEM_MUCK_FADE_START_ABOVE_FLOOR;
      const muckEndY = floorY + SWAMP_POEM_MUCK_FADE_END_BELOW_FLOOR;

      const ps = particleStateRef.current;
      floatGrp.updateMatrixWorld(true);

      let minWY = Infinity;
      let maxWY = -Infinity;
      let visibleCnt = 0;
      let cntAboveMuckStart = 0;
      let cntInMuckBand = 0;
      let cntBelowMuckEnd = 0;

      let detachUMin = Infinity;
      let detachUMax = -Infinity;
      let motionStarted = false;
      let motLxMin = Infinity;
      let motLxMax = -Infinity;
      let motRxMin = Infinity;
      let motRxMax = -Infinity;

      if (ps) {
        for (const x of ps) {
          const motionStart = hold + cross + x.detachDelay;
          const motionAge = Math.max(0, t - motionStart);
          const detachU =
            motionAge > 0
              ? swampPoemSmootherstep01(Math.min(1, motionAge / Math.max(0.001, detach)))
              : 0;
          const lingerAge = Math.max(0, motionAge - detach);
          const lingerU = swampPoemSmootherstep01(Math.min(1, lingerAge / Math.max(0.001, linger)));
          /** Buoyancy loss + current: detach eases in, then linger phase dominates. */
          let swim = detachU * (0.2 + 0.8 * lingerU);
          if (freezeAlignHold) swim = 0;

          if (motionAge > 0) {
            motionStarted = true;
            detachUMin = Math.min(detachUMin, detachU);
            detachUMax = Math.max(detachUMax, detachU);
          }

          const driftRamp =
            motionAge > 0
              ? swampPoemSmootherstep01(
                  Math.min(1, motionAge / Math.max(0.001, SWAMP_POEM_LETTER_EARLY_DRIFT_RAMP_SEC)),
                )
              : 0;
          const sinkRamp =
            motionAge > 0
              ? swampPoemSmootherstep01(
                  Math.min(1, motionAge / Math.max(0.001, SWAMP_POEM_LETTER_EARLY_SINK_RAMP_SEC)),
                )
              : 0;
          const lateralSwim = swim * driftRamp;
          const sinkSwim = swim * (0.2 + 0.8 * sinkRamp);

          const wob =
            Math.sin(t * 0.52 + x.wobblePhase) * 0.014 +
            Math.sin(t * 0.27 + x.wobblePhase * 1.6) * 0.01;
          const wobZ =
            Math.cos(t * 0.4 + x.wobblePhase * 0.7) * 0.012 +
            Math.sin(t * 0.19 + 1.3) * 0.008;

          if (!freezeAlignHold) {
            x.offsetAccum.x += x.vel.x * dt * lateralSwim;
            x.offsetAccum.y += x.vel.y * dt * sinkSwim;
            x.offsetAccum.z += x.vel.z * dt * lateralSwim;
            x.offsetAccum.x += wob * dt * lateralSwim;
            x.offsetAccum.y += wobZ * dt * (0.5 * lateralSwim + 0.5 * sinkSwim);
            x.offsetAccum.z += wobZ * dt * lateralSwim * 0.85;
            const rotSwim = lateralSwim * 0.92 + sinkSwim * 0.08;
            x.mesh.rotation.x += x.rotVel.x * dt * rotSwim * 0.58;
            x.mesh.rotation.y += x.rotVel.y * dt * rotSwim * 0.58;
            x.mesh.rotation.z += x.rotVel.z * dt * rotSwim * 0.58;
          }

          x.mesh.position.copy(x.home).add(x.offsetAccum);

          if (AQ_POEM_DEBUG && !freezeAlignHold) {
            const lx = x.mesh.position.x;
            const pi = x.meta.planeIndex;
            if (pi === 0) {
              motLxMin = Math.min(motLxMin, lx);
              motLxMax = Math.max(motLxMax, lx);
            } else if (pi === 1) {
              motRxMin = Math.min(motRxMin, lx);
              motRxMax = Math.max(motRxMax, lx);
            }
          }

          x.mesh.getWorldPosition(_particleWorld);
          const py = _particleWorld.y;
          if (!freezeAlignHold) {
            if (py > muckStartY) cntAboveMuckStart += 1;
            else if (py > muckEndY) cntInMuckBand += 1;
            else cntBelowMuckEnd += 1;
          }

          minWY = Math.min(minWY, py);
          maxWY = Math.max(maxWY, py);

          let op;
          if (freezeAlignHold) {
            op = THREE.MathUtils.clamp(0.75 * latch, 0, 1);
          } else {
            const muckF = swampPoemParticleMuckFade(py, floorY);
            op = THREE.MathUtils.clamp(partHandoffAlpha * muckF, 0, 1);
          }
          x.mesh.material.opacity = op;
          if (op > 0.04) visibleCnt += 1;
        }

        /** @type {string | null} */
        let cleanupReason = null;
        const stragglersAllowed = Math.max(2, Math.ceil(ps.length * 0.02));
        const nearlyAllBelowMuck = cntBelowMuckEnd >= ps.length - stragglersAllowed;
        if (!AQ_POEM_FREEZE) {
          if (nearlyAllBelowMuck) cleanupReason = 'below-muck-end';
          else if (t >= SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS) cleanupReason = 'safety-timeout';
        }

        particleMuckDebugRef.current = {
          minWorldY: minWY,
          maxWorldY: maxWY,
          visibleParticleCount: visibleCnt,
          particleOpacityMode: freezeAlignHold ? 'freeze-alignment-fixed' : 'muck-depth',
          globalFadeActive: false,
          muckFadeStartY: muckStartY,
          muckFadeEndY: muckEndY,
          floorReferenceY: floorY,
          countParticlesAboveMuckFadeStart: freezeAlignHold ? 0 : cntAboveMuckStart,
          countParticlesInMuckFadeBand: freezeAlignHold ? 0 : cntInMuckBand,
          countParticlesBelowMuckFadeEnd: freezeAlignHold ? 0 : cntBelowMuckEnd,
          cleanupReason,
          handoffU: uHandoff,
          motionStarted: motionStarted && !freezeAlignHold,
          detachUMin: Number.isFinite(detachUMin) ? detachUMin : 0,
          detachUMax: Number.isFinite(detachUMax) ? detachUMax : 0,
          centerAttractionActive: false,
          motionLeftParticleXMin: Number.isFinite(motLxMin) ? motLxMin : null,
          motionLeftParticleXMax: Number.isFinite(motLxMax) ? motLxMax : null,
          motionRightParticleXMin: Number.isFinite(motRxMin) ? motRxMin : null,
          motionRightParticleXMax: Number.isFinite(motRxMax) ? motRxMax : null,
        };

        const shouldCleanup =
          !AQ_POEM_FREEZE &&
          (nearlyAllBelowMuck || t >= SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS);
        if (shouldCleanup) {
          if (AQ_POEM_DEBUG) {
            console.info('[aqpoemdebug] dissipateCleanup', {
              cleanupReason,
              cleanupPriorityNote:
                nearlyAllBelowMuck
                  ? 'below-muck-end (preferred when nearly all past muckFadeEnd)'
                  : 'safety-timeout (fallback — long delay)',
              safetyCleanupSeconds: SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS,
              secondsSinceDissipationStart: t,
              visibleParticleCount: visibleCnt,
              countParticlesAboveMuckFadeStart: cntAboveMuckStart,
              countParticlesInMuckFadeBand: cntInMuckBand,
              countParticlesBelowMuckFadeEnd: cntBelowMuckEnd,
              nearlyAllBelowMuck,
              particleCount: ps.length,
              floorReferenceY: floorY,
              muckFadeStartY: muckStartY,
              muckFadeEndY: muckEndY,
            });
          }
          for (const x of ps) {
            floatGrp.remove(x.mesh);
            x.mesh.geometry.dispose();
            const m = x.mesh.material;
            if (m && !Array.isArray(m)) m.dispose();
          }
          particleStateRef.current = null;
          setLifecycle('gone');
          anchor.visible = false;
          onDissipated?.();
        } else if (AQ_POEM_DEBUG && ps && !freezeAlignHold) {
          dissipateMotionLogAccRef.current += dt;
          if (dissipateMotionLogAccRef.current >= 1.5) {
            dissipateMotionLogAccRef.current = 0;
            const md = particleMuckDebugRef.current;
            console.info('[aqpoemdebug] dissipateMotion', {
              dissipationStartReason: dissipationReasonRef.current,
              secondsSinceDissipationStart: t,
              safetyCleanupSeconds: SWAMP_POEM_DISSIPATE_SAFETY_CLEANUP_SECONDS,
              handoffU: uHandoff,
              handoffComplete: uHandoff >= 1,
              motionStarted: md?.motionStarted ?? false,
              detachUMin: md?.detachUMin,
              detachUMax: md?.detachUMax,
              minParticleWorldY: md?.minWorldY,
              maxParticleWorldY: md?.maxWorldY,
              visibleParticleCount: md?.visibleParticleCount,
              countParticlesAboveMuckFadeStart: md?.countParticlesAboveMuckFadeStart,
              countParticlesInMuckFadeBand: md?.countParticlesInMuckFadeBand,
              countParticlesBelowMuckFadeEnd: md?.countParticlesBelowMuckFadeEnd,
              muckFadeStartY: muckStartY,
              muckFadeEndY: muckEndY,
              cleanupReason: md?.cleanupReason,
              columnParticleXFloatLocal: {
                left: [md?.motionLeftParticleXMin, md?.motionLeftParticleXMax],
                right: [md?.motionRightParticleXMin, md?.motionRightParticleXMax],
              },
              spawnColumnDiagnostics: dissipationColumnDebugRef.current,
              centerAttractionActive: false,
              earlyDriftRampSec: SWAMP_POEM_LETTER_EARLY_DRIFT_RAMP_SEC,
              earlySinkRampSec: SWAMP_POEM_LETTER_EARLY_SINK_RAMP_SEC,
            });
          }
        }
      }
    }
  });

  const onPoemPanelPointerDown = useCallback((e) => {
    if (!AQ_POEM_DEBUG) return;
    e.stopPropagation();
    console.info('[aqpoemdebug] poemPointerIgnored', {
      note: 'dissipation is physical-volume only; pointer does not start dissipation',
      pickId: 'poem-rebuild-panel',
    });
  }, []);

  if (!SWAMP_POEM_REBUILD_STATIC_ONLY && lifecycle === 'gone') {
    return null;
  }

  return (
    <group
      ref={anchorRef}
      position={worldPos}
      rotation={worldRot}
      scale={SWAMP_POEM_WORLD_SCALE}
      frustumCulled={false}
    >
      <group ref={floatGroupRef}>
        {AQ_POEM_DEBUG_HELPERS && (
          <group>
            <axesHelper args={[2.4]} raycast={() => null} />
            <mesh raycast={() => null}>
              <planeGeometry args={[bounds.halfW * 2, bounds.halfH * 2]} />
              <meshBasicMaterial
                color="#44ff88"
                wireframe
                transparent
                opacity={0.35}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh
              position={[0, 0, 2.6]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <coneGeometry args={[0.28, 0.85, 16]} />
              <meshBasicMaterial
                color="#66ccff"
                depthTest={false}
                transparent
                opacity={0.88}
                toneMapped={false}
              />
            </mesh>
            {!SWAMP_POEM_REBUILD_STATIC_ONLY && (
              <mesh raycast={() => null} position={SWAMP_POEM_TRIGGER_CENTER_OFFSET}>
                <boxGeometry
                  args={[
                    SWAMP_POEM_TRIGGER_HALF_WIDTH * 2,
                    SWAMP_POEM_TRIGGER_HALF_HEIGHT * 2,
                    SWAMP_POEM_TRIGGER_HALF_DEPTH * 2,
                  ]}
                />
                <meshBasicMaterial
                  color="#ffaa44"
                  wireframe
                  transparent
                  opacity={0.22}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        )}

        {panels.map((p) => {
          const colBias =
            p.column === 'left' ? SWAMP_POEM_PANEL_Y_BIAS : -SWAMP_POEM_PANEL_Y_BIAS;
          const pz =
            p.column === 'left' || p.planeIndex === 0
              ? -SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5
              : SWAMP_POEM_PANEL_DEPTH_STAGGER * 0.5;
          return (
            <group
              key={`poem-col-${p.planeIndex}`}
              ref={(r) => {
                columnGroupRefs.current[p.planeIndex] = r;
              }}
              position={[p.offsetX ?? 0, (p.stackY ?? 0) + colBias, pz]}
            >
              <mesh
                frustumCulled={false}
                renderOrder={POEM_RENDER_ORDER}
                raycast={AQ_POEM_DEBUG ? undefined : () => null}
                onPointerDown={AQ_POEM_DEBUG ? onPoemPanelPointerDown : undefined}
                userData={{ aqPickId: 'poem-rebuild-panel' }}
              >
                <planeGeometry args={[p.planeW, p.planeH]} />
                <meshBasicMaterial
                  ref={(m) => {
                    panelMatRefs.current[p.planeIndex] = m ?? undefined;
                  }}
                  map={p.texture}
                  transparent
                  opacity={0}
                  depthWrite={false}
                  depthTest={false}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              {p.flickerOverlay && SWAMP_POEM_FLICKER_ENABLED && (
                <mesh
                  position={[p.flickerOverlay.localX, p.flickerOverlay.localY, 0.03]}
                  frustumCulled={false}
                  renderOrder={POEM_RENDER_ORDER + 1}
                  raycast={() => null}
                >
                  <planeGeometry args={[p.flickerOverlay.planeW, p.flickerOverlay.planeH]} />
                  <meshBasicMaterial
                    ref={(m) => {
                      flickerPhraseMatRef.current = m ?? null;
                    }}
                    map={p.flickerOverlay.texture}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    depthTest={false}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}
