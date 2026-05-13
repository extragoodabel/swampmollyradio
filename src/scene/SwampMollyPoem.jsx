import { useMemo, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SWAMP_MOLLY_POEM_RAW } from '../content/swampMollyPoem.js';
import {
  POEM_DISSIPATE_BREAKUP_SPEED,
  POEM_DISSIPATE_FADE_SEC,
  POEM_DISSIPATE_LINGER_SEC,
  POEM_DISSIPATION_EXPLICIT_BOX,
  POEM_DISSIPATE_TRIGGER_ENTER_FRAMES,
  POEM_SCALE,
  POEM_SCREEN_NUDGE_BACK_PX,
  POEM_SCREEN_NUDGE_LEFT_PX,
  worldPositionNudgeScreenBackPx,
  worldPositionNudgeScreenLeftPx,
} from './swampPoemPlacement.js';
import {
  typographyFillHex,
  typographyHighlightColor,
} from './typographyPalette.js';
import { AQ_POEM_DEBUG, AQ_CAR_INFO_DEBUG } from '../debug/aquariumRecovery.js';
import { fireRustyCarClickFromDelegate } from './rustyCarClickBridge.js';

const TAB_COL_WIDTH = 4;
const POEM_LINE_PAD_X = 20;
const POEM_LINE_PAD_Y = 6;
const _camLocal = new THREE.Vector3();
const _poemDbgWorld = new THREE.Vector3();
/** If poem wins the ray but the rusty car is in the pick list nearby in screen px, delegate. */
const RUSTY_POEM_DELEGATE_SCREEN_PX = 56;

function screenDistPxWorldPoints(a, b, camera, w, h) {
  const va = a.clone().project(camera);
  const vb = b.clone().project(camera);
  const xa = (va.x * 0.5 + 0.5) * w;
  const ya = (-va.y * 0.5 + 0.5) * h;
  const xb = (vb.x * 0.5 + 0.5) * w;
  const yb = (-vb.y * 0.5 + 0.5) * h;
  return Math.hypot(xa - xb, ya - yb);
}

function splitItalicRuns(line) {
  if (!line.includes('*')) {
    return [{ italic: false, text: line }];
  }
  const out = [];
  let italic = false;
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '*') {
      if (buf) {
        out.push({ italic, text: buf });
        buf = '';
      }
      italic = !italic;
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ italic, text: buf });
  return out.length ? out : [{ italic: false, text: line }];
}

function* iterLineChars(line) {
  const runs = splitItalicRuns(line);
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      yield { ch: run.text[i], italic: run.italic };
    }
  }
}

function measurePoemLineDrawWidth(line, fontPx) {
  const ctx = document.createElement('canvas').getContext('2d');
  const tabStopPx = fontPx * TAB_COL_WIDTH * 0.55;
  let x = POEM_LINE_PAD_X;
  for (const { ch, italic } of iterLineChars(line)) {
    ctx.font = `${italic ? 'italic ' : ''}600 ${fontPx}px ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`;
    if (ch === '\t') {
      x = Math.ceil(x / tabStopPx) * tabStopPx;
      continue;
    }
    if (ch === '\n') continue;
    x += ctx.measureText(ch).width;
  }
  return Math.max(48, x + POEM_LINE_PAD_X);
}

function makePoemLineCanvasTexture(line, fillHex, crestHex, fontPx) {
  const drawW = Math.min(4090, measurePoemLineDrawWidth(line, fontPx));
  const cssH = Math.ceil(fontPx * 1.52) + POEM_LINE_PAD_Y * 2;
  const cssW = drawW;
  const c = document.createElement('canvas');
  c.width = cssW;
  c.height = cssH;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, cssW, cssH);
  const tabStopPx = fontPx * TAB_COL_WIDTH * 0.55;
  let x = POEM_LINE_PAD_X;
  const baseline = POEM_LINE_PAD_Y + fontPx * 1.12;
  for (const { ch, italic } of iterLineChars(line)) {
    const fontStyle = italic ? 'italic ' : '';
    ctx.font = `${fontStyle}600 ${fontPx}px ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`;
    if (ch === '\t') {
      x = Math.ceil(x / tabStopPx) * tabStopPx;
      continue;
    }
    const g = ctx.createLinearGradient(x, baseline - fontPx, x, baseline + fontPx * 0.25);
    g.addColorStop(0, crestHex);
    g.addColorStop(0.45, fillHex);
    g.addColorStop(1, fillHex);
    ctx.fillStyle = g;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, x, baseline);
    x += ctx.measureText(ch).width;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { map: t, cssW, cssH };
}

function buildPoemLineMeta(raw, scale, rowH, stanzaGap) {
  let fontPx = Math.max(16, Math.round(44 * (scale / 0.288)));
  const nonEmptyLines = raw.split('\n').filter((l) => l !== '');
  let maxW = 0;
  for (const line of nonEmptyLines) {
    maxW = Math.max(maxW, measurePoemLineDrawWidth(line, fontPx));
  }
  while (maxW > 4080 && fontPx > 11) {
    fontPx -= 1;
    maxW = 0;
    for (const line of nonEmptyLines) {
      maxW = Math.max(maxW, measurePoemLineDrawWidth(line, fontPx));
    }
  }

  const lines = raw.split('\n');
  const items = [];
  let y = 0;
  let lineIdx = 0;
  let minY = 0;

  for (const line of lines) {
    if (line === '') {
      y -= stanzaGap;
      lineIdx += 1;
      continue;
    }
    items.push({ rawLine: line, y, lineIdx, fontPx });
    minY = Math.min(minY, y);
    lineIdx += 1;
    y -= rowH;
  }

  const totalH = Math.abs(minY) + rowH;
  const cy = minY + totalH * 0.5;
  const normalized = items.map((it) => ({
    ...it,
    y: it.y - cy,
    zLayer: it.lineIdx * 0.014,
  }));

  return { items: normalized, totalH, minY };
}

function tabAdvanceCol(col) {
  const next = (Math.floor(col / TAB_COL_WIDTH) + 1) * TAB_COL_WIDTH;
  return next;
}

function makePoemGlyphTexture(char, italic, fillHex, crestHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const fontStyle = italic ? 'italic ' : '';
  ctx.font = `${fontStyle}600 56px ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(64, 36, 64, 96);
  g.addColorStop(0, crestHex);
  g.addColorStop(0.45, fillHex);
  g.addColorStop(1, fillHex);
  ctx.fillStyle = g;
  ctx.fillText(char === ' ' ? '' : char, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _scratchHi = new THREE.Color();

function PoemGlyph({
  char,
  italic,
  baseX,
  baseY,
  baseZ,
  phase,
  wordPhase,
  scale,
  floatStrength,
  fillHex,
  crestHex,
  highlight,
  baseOpacity,
  shimmerStrength,
  brightnessMul = 1,
  dissipateTRef,
  dissipatePhasesRef,
  dissipateVec,
  depthTest = true,
  dissipatingRef,
  introFadeMulRef = null,
}) {
  const groupRef = useRef();
  const matRef = useRef();
  const baseRgb = useMemo(() => new THREE.Color(fillHex), [fillHex]);

  const map = useMemo(
    () => makePoemGlyphTexture(char, italic, fillHex, crestHex),
    [char, italic, fillHex, crestHex],
  );

  useFrame((s) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    const dispSeed = dissipateVec.current;
    const t = s.clock.elapsedTime;
    let b;
    let l;
    let f;
    if (dissipatePhasesRef) {
      ({ b, l, f } = dissipatePhasesRef.current);
    } else {
      const t = dissipateTRef?.current ?? 0;
      b = t;
      l = 0;
      f = t;
    }

    const driftPhase = dissipatePhasesRef
      ? Math.min(1, b + l * 0.58)
      : b;
    const fs = floatStrength * (1 + driftPhase * 5.5);

    const wordPull =
      Math.sin(t * 0.22 + wordPhase) * 0.35 + Math.sin(t * 0.17 + wordPhase * 1.4) * 0.18;
    const letterPull =
      Math.sin(t * 0.31 + phase) * 0.22 + Math.sin(t * 0.49 + phase * 1.9) * 0.11;

    const driftX = (wordPull * 0.55 + letterPull * 0.35) * fs;
    const driftY =
      (Math.sin(t * 0.24 + wordPhase * 1.1) * 0.42 +
        Math.sin(t * 0.4 + phase * 2) * 0.16) *
      fs;
    const driftZ =
      (Math.sin(t * 0.19 + wordPhase) * 0.32 + Math.sin(t * 0.33 + phase * 1.7) * 0.12) *
      fs *
      0.45;

    const dispMul =
      driftPhase *
      (1.05 + dispSeed.w * 0.6) *
      (1 + driftPhase * 0.45);
    const dispOffX = dispSeed.x * dispMul * 2.1;
    const dispOffY =
      dispSeed.y * dispMul * 1.55 - driftPhase * dispSeed.z * 0.85;
    const dispOffZ = dispSeed.z * dispMul * 1.1 * driftPhase;

    g.position.set(
      baseX + driftX + dispOffX,
      baseY + driftY + dispOffY,
      baseZ + driftZ + dispOffZ,
    );

    const flapX =
      (Math.sin(t * 0.38 + phase) * 0.05 + Math.sin(t * 0.62 + phase * 1.5) * 0.028) *
      (0.55 + floatStrength * 12);
    const twistY =
      (Math.sin(t * 0.3 + phase * 0.9) * 0.06 + Math.sin(t * 0.55 + phase * 1.7) * 0.03) *
      (0.55 + floatStrength * 12);
    const tiltZ =
      (Math.sin(t * 0.24 + phase) * 0.04 + Math.sin(t * 0.41 + phase * 1.3) * 0.022) *
      (0.55 + floatStrength * 12);
    g.rotation.set(
      flapX + b * dispSeed.x * 0.35,
      twistY + b * 0.2,
      tiltZ + b * dispSeed.y * 0.25,
    );

    const flutter = 1 + Math.sin(t * 0.48 + phase) * 0.025 * (0.45 + floatStrength * 10);
    const sc = (1 - f * 0.38) * flutter;
    g.scale.set(sc, sc, sc);

    const wobble =
      Math.sin(t * 0.52 + phase) * 0.42 +
      Math.sin(t * 0.95 + phase * 2) * 0.2 +
      Math.sin(t * 1.55 + phase * 3.6) * 0.12;
    const glintRare = Math.pow(Math.max(0, Math.sin(t * 0.72 + phase * 2)), 14) * 0.72;
    const sunCatch =
      Math.pow(Math.max(0, Math.sin(t * 0.44 + phase * 1.1)), 6) * 0.42;

    const sh = shimmerStrength;
    /* Color lift aligned with CanvasFloatingLetters `CanvasGlyph` (typography stays out of fog). */
    const lift =
      (0.42 + 0.58 * (0.5 + 0.5 * wobble)) * sh * 0.14 + glintRare + sunCatch * sh;
    const bm = THREE.MathUtils.clamp(brightnessMul, 0.25, 4);
    _scratchHi.copy(baseRgb).lerp(
      highlight,
      Math.min(1, (0.22 + lift * 1.35) * Math.min(1.15, Math.sqrt(bm))),
    );
    m.color.copy(_scratchHi);
    /**
     * Opacity uses the same shimmer multiplier + clamp band as stable canvas title glyphs.
     * Poem-only bug was: no floor (sorting/alphaTest interacted with near-zero opacity),
     * `brightnessMul` on opacity, and no `sunCatch` term — plus dense coplanar quads + depth sort
     * caused flicker; Swamp Molly sets `glyphDepthTest={false}` on this shared component.
     */
    const shimmerOpacityMul =
      0.74 + wobble * 0.11 * sh + glintRare * 0.45 + sunCatch * 0.28;
    const dissipateMul = 1 - f * 0.98;
    const intro = introFadeMulRef?.current ?? 1;
    const idleLocked = dissipatingRef && !dissipatingRef.current;
    if (idleLocked) {
      m.opacity =
        THREE.MathUtils.clamp(baseOpacity, 0.78, 0.98) * intro;
    } else {
      m.opacity = THREE.MathUtils.clamp(
        baseOpacity * shimmerOpacityMul * dissipateMul,
        0.52 * dissipateMul,
        0.98,
      ) * intro;
    }
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]} frustumCulled={false}>
      <mesh renderOrder={40} frustumCulled={false}>
        <planeGeometry args={[scale * 0.92, scale * 0.92]} />
        <meshBasicMaterial
          ref={matRef}
          map={map}
          transparent
          opacity={baseOpacity}
          alphaTest={0.06}
          fog={false}
          toneMapped={false}
          depthWrite={false}
          depthTest={depthTest}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * One transparent plane per poem line (canvas texture). Avoids hundreds of glyph quads → stable sorting.
 */
function PoemLinePlane({
  map,
  baseX,
  baseY,
  baseZ,
  planeW,
  planeH,
  phase,
  lineIdx,
  floatStrength,
  fillHex,
  highlight,
  baseOpacity,
  shimmerStrength,
  brightnessMul = 1,
  dissipateTRef,
  dissipatePhasesRef,
  dissipateVec,
  dissipatingRef,
  introFadeMulRef = null,
  onLinePointerDown,
}) {
  const groupRef = useRef();
  const matRef = useRef();
  const baseRgb = useMemo(() => new THREE.Color(fillHex), [fillHex]);

  useFrame((s) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    const dispSeed = dissipateVec.current;
    const t = s.clock.elapsedTime;
    let b;
    let l;
    let f;
    if (dissipatePhasesRef) {
      ({ b, l, f } = dissipatePhasesRef.current);
    } else {
      const tt = dissipateTRef?.current ?? 0;
      b = tt;
      l = 0;
      f = tt;
    }

    const driftPhase = dissipatePhasesRef
      ? Math.min(1, b + l * 0.58)
      : b;
    const fs = floatStrength * (1 + driftPhase * 5.5);

    const driftX =
      (Math.sin(t * 0.28 + phase) * 0.65 + Math.sin(t * 0.47 + phase * 1.5) * 0.32) * fs;
    const driftY =
      (Math.sin(t * 0.24 + phase * 1.2) * 0.55 + Math.sin(t * 0.39 + phase * 2) * 0.22) * fs;
    const driftZ =
      (Math.sin(t * 0.21 + phase) * 0.38 + Math.sin(t * 0.35 + phase * 1.8) * 0.14) * fs * 0.5;

    const dispMul =
      driftPhase * (1.15 + dispSeed.w * 0.75) * (1 + driftPhase * 0.55);
    const dispOffX = dispSeed.x * dispMul * 2.55;
    const dispOffY = dispSeed.y * dispMul * 1.95 - driftPhase * dispSeed.z * 1.05;
    const dispOffZ = dispSeed.z * dispMul * 1.35 * driftPhase;

    g.position.set(
      baseX + driftX + dispOffX,
      baseY + driftY + dispOffY,
      baseZ + driftZ + dispOffZ,
    );

    const flapX =
      (Math.sin(t * 0.34 + phase) * 0.06 + Math.sin(t * 0.58 + phase * 1.4) * 0.032) *
      (0.55 + floatStrength * 11);
    const twistY =
      (Math.sin(t * 0.28 + phase * 0.85) * 0.07 + Math.sin(t * 0.5 + phase * 1.6) * 0.034) *
      (0.55 + floatStrength * 11);
    const tiltZ =
      (Math.sin(t * 0.22 + phase) * 0.045 + Math.sin(t * 0.38 + phase * 1.25) * 0.024) *
      (0.55 + floatStrength * 11);
    g.rotation.set(
      flapX + b * dispSeed.x * 0.42,
      twistY + b * 0.24,
      tiltZ + b * dispSeed.y * 0.3,
    );

    const flutter = 1 + Math.sin(t * 0.44 + phase) * 0.03 * (0.45 + floatStrength * 9);
    const sc = (1 - f * 0.42) * flutter;
    g.scale.set(sc, sc, sc);

    const wobble =
      Math.sin(t * 0.54 + phase) * 0.42 +
      Math.sin(t * 0.92 + phase * 1.9) * 0.2 +
      Math.sin(t * 1.5 + phase * 3.2) * 0.12;
    const glintRare = Math.pow(Math.max(0, Math.sin(t * 0.69 + phase * 2)), 14) * 0.72;
    const sunCatch =
      Math.pow(Math.max(0, Math.sin(t * 0.42 + phase * 1.05)), 6) * 0.42;

    const sh = shimmerStrength;
    const lift =
      (0.42 + 0.58 * (0.5 + 0.5 * wobble)) * sh * 0.14 + glintRare + sunCatch * sh;
    const bm = THREE.MathUtils.clamp(brightnessMul, 0.25, 4);
    _scratchHi.copy(baseRgb).lerp(
      highlight,
      Math.min(1, (0.22 + lift * 1.35) * Math.min(1.15, Math.sqrt(bm))),
    );
    m.color.copy(_scratchHi);

    const shimmerOpacityMul =
      0.74 + wobble * 0.11 * sh + glintRare * 0.45 + sunCatch * 0.28;
    const dissipateMul = 1 - f * 0.98;
    const intro = introFadeMulRef?.current ?? 1;
    const idleLocked = dissipatingRef && !dissipatingRef.current;
    if (idleLocked) {
      m.opacity =
        THREE.MathUtils.clamp(baseOpacity, 0.78, 0.98) * intro;
    } else {
      m.opacity = THREE.MathUtils.clamp(
        baseOpacity * shimmerOpacityMul * dissipateMul,
        0.52 * dissipateMul,
        0.98,
      ) * intro;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[baseX, baseY, baseZ]}
      frustumCulled={false}
    >
      <mesh
        renderOrder={110}
        frustumCulled={false}
        userData={{ aqPickId: 'poem-line' }}
        onPointerDown={onLinePointerDown}
      >
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial
          ref={matRef}
          map={map}
          transparent
          opacity={baseOpacity}
          alphaTest={0.02}
          fog={false}
          toneMapped={false}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function buildPoemLayout(raw, cellW, rowH, stanzaGap, volumeDepth = 1.65) {
  const lines = raw.split('\n');
  const slots = [];
  let wordIndex = 0;
  let lineIdx = 0;
  let maxX = 0;
  let minY = 0;
  let y = 0;
  let prevWasWordChar = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line === '') {
      y -= stanzaGap;
      lineIdx++;
      prevWasWordChar = false;
      continue;
    }

    let col = 0;
    const runs = splitItalicRuns(line);
    for (const run of runs) {
      for (let i = 0; i < run.text.length; i++) {
        const ch = run.text[i];
        if (ch === '\t') {
          const nextCol = tabAdvanceCol(col);
          col = nextCol;
          prevWasWordChar = false;
          continue;
        }
        const isSpace = ch === ' ' || ch === '\u00a0';
        if (isSpace) {
          col += 1;
          prevWasWordChar = false;
          continue;
        }

        if (!prevWasWordChar) {
          wordIndex += 1;
          prevWasWordChar = true;
        }

        const baseX = col * cellW;
        const phase = lineIdx * 1.07 + col * 0.23;
        const wordPhase = wordIndex * 0.61;
        const baseZ = (Math.sin(lineIdx * 0.41 + col * 0.09) * 0.045) * cellW * 8;

        slots.push({
          char: ch,
          italic: run.italic,
          baseX,
          baseY: y,
          baseZ,
          phase,
          wordPhase,
          lineIdx,
          col,
        });
        maxX = Math.max(maxX, baseX + cellW);
        minY = Math.min(minY, y);
        col += 1;
      }
    }
    lineIdx++;
    y -= rowH;
    prevWasWordChar = false;
  }

  const totalH = Math.abs(minY) + rowH;
  const cx = maxX * 0.5;
  const cy = minY + totalH * 0.5;

  const normalized = slots.map((s) => ({
    ...s,
    baseX: s.baseX - cx,
    baseY: s.baseY - cy,
    baseZ: s.baseZ,
  }));

  return {
    slots: normalized,
    halfW: maxX * 0.5 + cellW * 1.2,
    halfH: totalH * 0.5 + rowH * 0.35,
    depth: volumeDepth,
  };
}

const randomVec = (out, seed) => {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const r = a - Math.floor(a);
  out.x = (r * 2 - 1) * 0.92;
  out.y = (Math.cos(seed * 78.233) * 0.5 + 0.5) * 1.1;
  out.z = (Math.sin(seed * 19.137) * 0.5 + 0.5) * 0.75 + 0.2;
  return out;
};

/**
 * World-anchored floating text (poem-style layout); dissipates when the camera passes through its volume.
 *
 * @param {{
 *   rawText: string;
 *   position: [number, number, number];
 *   murkiness?: number;
 *   typographyTint?: object | null;
 *   onDissipated?: () => void;
 *   scale?: number;
 *   floatStrength?: number;
 *   volumeDepth?: number;
 *   contentKey?: string;
 *   brightnessMul?: number;
 *   glyphBaseOpacity?: number;
 *   dissipateDurationSec?: number;
 *   billboard?: boolean;
 *   rotation?: [number, number, number];
 *   dissipationPhased?: boolean;
 *   dissipateBreakupSpeed?: number;
 *   poemLingerSec?: number;
 *   poemFadeSec?: number;
 *   dissipationTriggerHalfScale?: number;
 *   dissipationTriggerDepth?: number;
 *   dissipationTriggerMaxHalfW?: number | null;
 *   dissipationTriggerMaxHalfH?: number | null;
 *   dissipationTriggerMaxDepth?: number | null;
 *   dissipationTriggerEnterFrames?: number;
 *   glyphDepthTest?: boolean;
 *   dissipationExplicitBox?: {
 *     halfW: number;
 *     halfH: number;
 *     halfD: number;
 *     center?: [number, number, number];
 *     enablePlaneCross?: boolean;
 *   } | null;
 *   renderMode?: 'glyphs' | 'lineCanvas';
 *   introFadeInSec?: number;
 * }} props
 */
export function SwampFloatingWaterWords({
  contentKey = 'waterwords',
  rawText,
  position,
  murkiness = 0.78,
  typographyTint = null,
  onDissipated,
  scale = 0.22,
  floatStrength = 0.016,
  volumeDepth = 1.65,
  brightnessMul = 1,
  glyphBaseOpacity = 0.74,
  dissipateDurationSec = 5.75,
  billboard = true,
  rotation = [0, 0, 0],
  dissipationPhased = false,
  dissipateBreakupSpeed = 0.85,
  poemLingerSec = 3.2,
  poemFadeSec = 2.05,
  dissipationTriggerHalfScale = 0.52,
  dissipationTriggerDepth = 1.02,
  dissipationTriggerMaxHalfW = null,
  dissipationTriggerMaxHalfH = null,
  dissipationTriggerMaxDepth = null,
  dissipationTriggerEnterFrames = 0,
  /** Poem: hundreds of coplanar transparent quads — false avoids depth-sort flicker. Fiat keeps true. */
  glyphDepthTest = true,
  dissipationExplicitBox = null,
  renderMode = 'glyphs',
  /** 0 = full opacity immediately; otherwise root opacity eases in over this many seconds. */
  introFadeInSec = 0,
}) {
  const rootRef = useRef();
  const dissipateTRef = useRef(0);
  const dissipatePhasesRef = useRef({ b: 0, l: 0, f: 0 });
  const dissipatingRef = useRef(false);
  const doneRef = useRef(false);
  const triggerInsideStreakRef = useRef(0);
  const poemDbgLastMsRef = useRef(0);
  const triggerLastRelZRef = useRef(null);
  const dissipationStartReasonRef = useRef(/** @type {null | string} */ (null));
  const introFadeMulRef = useRef(introFadeInSec <= 0 ? 1 : 0);
  const cellW = scale * 0.95;
  const rowH = scale * 1.45;
  const stanzaGap = scale * 0.85;
  const { camera, size } = useThree();

  const fillHex = useMemo(
    () => typographyFillHex(murkiness, typographyTint),
    [murkiness, typographyTint],
  );
  const highlight = useMemo(
    () => typographyHighlightColor(typographyTint),
    [typographyTint],
  );
  const crestHex = useMemo(() => {
    const c = new THREE.Color(fillHex);
    c.lerp(highlight, 0.38);
    return `#${c.getHexString()}`;
  }, [fillHex, highlight]);

  const layout = useMemo(
    () =>
      renderMode === 'glyphs'
        ? buildPoemLayout(rawText, cellW, rowH, stanzaGap, volumeDepth)
        : null,
    [rawText, cellW, rowH, stanzaGap, volumeDepth, renderMode],
  );

  const lineMeta = useMemo(
    () =>
      renderMode === 'lineCanvas'
        ? buildPoemLineMeta(rawText, scale, rowH, stanzaGap)
        : null,
    [rawText, scale, rowH, stanzaGap, renderMode],
  );

  const lineTexInfos = useMemo(() => {
    if (renderMode !== 'lineCanvas' || !lineMeta) return null;
    return lineMeta.items.map((it) =>
      makePoemLineCanvasTexture(it.rawLine, fillHex, crestHex, it.fontPx),
    );
  }, [renderMode, lineMeta, fillHex, crestHex]);

  const lineMaxPlaneW = useMemo(() => {
    if (!lineTexInfos) return 0;
    let m = 0;
    for (const info of lineTexInfos) {
      m = Math.max(m, (info.cssW / info.cssH) * rowH);
    }
    return m;
  }, [lineTexInfos, rowH]);

  useEffect(() => {
    if (renderMode !== 'lineCanvas' || !lineTexInfos) return undefined;
    const infos = lineTexInfos;
    return () => {
      for (const info of infos) {
        info.map.dispose();
      }
    };
  }, [renderMode, lineTexInfos]);

  const dissipateVecs = useMemo(() => {
    if (renderMode === 'lineCanvas' && lineMeta) {
      return lineMeta.items.map((_, i) => {
        const v = new THREE.Vector4();
        randomVec(v, i + 1.03);
        v.w = Math.abs(v.x) + 0.2;
        return v;
      });
    }
    if (!layout) return [];
    return layout.slots.map((_, i) => {
      const v = new THREE.Vector4();
      const t = randomVec(v, i + 0.37);
      v.w = Math.abs(t.x) + 0.2;
      return v;
    });
  }, [renderMode, lineMeta, layout]);

  const onDissipatedStable = useCallback(() => {
    onDissipated?.();
  }, [onDissipated]);

  const tryBeginDissipation = useCallback((reason) => {
    if (dissipatingRef.current || doneRef.current) return false;
    dissipatingRef.current = true;
    dissipationStartReasonRef.current = reason;
    dissipateTRef.current = 0;
    dissipatePhasesRef.current = { b: 0, l: 0, f: 0 };
    if (AQ_POEM_DEBUG) {
      console.info('[aqpoemdebug] dissipation started', {
        contentKey,
        dissipationStartReason: reason,
        renderMode,
      });
    }
    return true;
  }, [contentKey, renderMode]);

  const onPoemBlockPointerDown = useCallback(
    (e) => {
      const b = e.nativeEvent?.button;
      if (b != null && b !== 0) return;

      const rustyHit = e.intersections?.find(
        (h) => h.object?.userData?.aqPickId === 'rusty-car-hit',
      );
      if (rustyHit) {
        const d = screenDistPxWorldPoints(
          rustyHit.point,
          e.point,
          camera,
          size.width,
          size.height,
        );
        if (d <= RUSTY_POEM_DELEGATE_SCREEN_PX) {
          if (AQ_CAR_INFO_DEBUG || AQ_POEM_DEBUG) {
            console.info(
              '[aqcarinfodebug] poem line got first hit; delegating to rusty car (screen proximity)',
              {
                screenDistPx: d,
                thresholdPx: RUSTY_POEM_DELEGATE_SCREEN_PX,
              },
            );
          }
          e.stopPropagation();
          fireRustyCarClickFromDelegate();
          return;
        }
      }

      if (AQ_CAR_INFO_DEBUG && AQ_POEM_DEBUG) {
        console.info(
          '[aqcarinfodebug][aqpoemdebug] poem line click — dissipate',
          {
            intersectionCount: e.intersections?.length ?? 0,
            pickIds:
              e.intersections?.map((h) => h.object?.userData?.aqPickId) ?? [],
          },
        );
      }
      e.stopPropagation();
      tryBeginDissipation('click');
    },
    [tryBeginDissipation, camera, size.width, size.height],
  );

  useLayoutEffect(() => {
    introFadeMulRef.current = introFadeInSec <= 0 ? 1 : 0;
  }, [contentKey, introFadeInSec]);

  useFrame((s) => {
    const root = rootRef.current;
    if (!root) return;

    const d0 = s.clock.getDelta();
    if (introFadeInSec > 0 && introFadeMulRef.current < 1) {
      introFadeMulRef.current = Math.min(
        1,
        introFadeMulRef.current + d0 / introFadeInSec,
      );
    }

    const cam = camera.position;
    if (billboard && !doneRef.current) {
      root.lookAt(cam.x, root.position.y, cam.z);
    }

    if (doneRef.current) {
      if (AQ_POEM_DEBUG) {
        const now = performance.now();
        if (now - poemDbgLastMsRef.current > 1600) {
          poemDbgLastMsRef.current = now;
        console.info('[aqpoemdebug]', {
          contentKey,
          poemVisible: false,
          poemDissipating: false,
          poemDissipated: true,
          renderMode,
          note: 'doneRef set; expect unmount',
        });
        }
      }
      return;
    }

    root.updateMatrixWorld(true);
    _camLocal.copy(cam);
    root.worldToLocal(_camLocal);

    const pad = 0.42;
    const needFrames = Math.max(0, dissipationTriggerEnterFrames | 0);

    let boxHalfW;
    let boxHalfH;
    let boxHalfD;
    let boxCx = 0;
    let boxCy = 0;
    let boxCz = 0;
    let planeCross = false;

    if (dissipationExplicitBox) {
      boxHalfW = dissipationExplicitBox.halfW;
      boxHalfH = dissipationExplicitBox.halfH;
      boxHalfD = dissipationExplicitBox.halfD;
      const cen = dissipationExplicitBox.center;
      if (cen) {
        boxCx = cen[0];
        boxCy = cen[1];
        boxCz = cen[2];
      }
      planeCross = Boolean(dissipationExplicitBox.enablePlaneCross);
    } else {
      const { halfW, halfH } = layout;
      boxHalfW = halfW * dissipationTriggerHalfScale;
      boxHalfH = halfH * dissipationTriggerHalfScale;
      boxHalfD = dissipationTriggerDepth;
      if (typeof dissipationTriggerMaxHalfW === 'number') {
        boxHalfW = Math.min(boxHalfW, dissipationTriggerMaxHalfW);
      }
      if (typeof dissipationTriggerMaxHalfH === 'number') {
        boxHalfH = Math.min(boxHalfH, dissipationTriggerMaxHalfH);
      }
      if (typeof dissipationTriggerMaxDepth === 'number') {
        boxHalfD = Math.min(boxHalfD, dissipationTriggerMaxDepth);
      }
    }

    const relX = _camLocal.x - boxCx;
    const relY = _camLocal.y - boxCy;
    const relZ = _camLocal.z - boxCz;

    const inXY =
      Math.abs(relX) < boxHalfW + pad && Math.abs(relY) < boxHalfH + pad;
    const inVol = inXY && Math.abs(relZ) < boxHalfD + pad;

    let crossedPlane = false;
    if (planeCross && inXY && triggerLastRelZRef.current != null) {
      const prevZ = triggerLastRelZRef.current;
      if (
        Math.sign(prevZ) !== Math.sign(relZ) &&
        Math.abs(prevZ) > 0.07 &&
        Math.abs(relZ) > 0.07
      ) {
        crossedPlane = true;
      }
    }
    if (inXY) {
      triggerLastRelZRef.current = relZ;
    } else {
      triggerLastRelZRef.current = null;
    }

    if (!inVol) {
      triggerInsideStreakRef.current = 0;
    } else {
      triggerInsideStreakRef.current += 1;
    }
    const triggerSolid =
      needFrames === 0 || triggerInsideStreakRef.current >= needFrames;

    if (!dissipatingRef.current) {
      if (crossedPlane || (inVol && triggerSolid)) {
        tryBeginDissipation(
          crossedPlane ? 'physical-volume-plane' : 'physical-volume',
        );
      }
    } else if (dissipationPhased) {
      const p = dissipatePhasesRef.current;
      const d = d0;
      if (p.b < 1) {
        p.b = Math.min(1, p.b + d * dissipateBreakupSpeed);
      } else if (p.l < 1) {
        p.l = Math.min(1, p.l + d / poemLingerSec);
      } else {
        p.f = Math.min(1, p.f + d / poemFadeSec);
        if (p.f >= 1 && !doneRef.current) {
          doneRef.current = true;
          if (AQ_POEM_DEBUG) {
            console.info('[aqpoemdebug] dissipation completed', { contentKey });
          }
          onDissipatedStable();
        }
      }
    } else {
      dissipateTRef.current = Math.min(
        1,
        dissipateTRef.current + d0 / dissipateDurationSec,
      );
      if (dissipateTRef.current >= 1 && !doneRef.current) {
        doneRef.current = true;
        onDissipatedStable();
      }
    }

    if (AQ_POEM_DEBUG) {
      const now = performance.now();
      if (now - poemDbgLastMsRef.current > 1600) {
        poemDbgLastMsRef.current = now;
        root.getWorldPosition(_poemDbgWorld);
        const renderObjectCount =
          renderMode === 'lineCanvas'
            ? lineMeta?.items?.length ?? 0
            : layout?.slots?.length ?? 0;
        console.info('[aqpoemdebug]', {
          contentKey,
          renderMode,
          poemMounted: true,
          renderObjectCount,
          lineMaterialSummary:
            renderMode === 'lineCanvas'
              ? 'lineCanvas meshBasic depthTest:false depthWrite:false DoubleSide alphaTest:0.02 renderOrder:110 idleOpacityLock'
              : 'glyph meshBasic (glyphDepthTest prop)',
          glyphBaseOpacity,
          poemVisible: !doneRef.current,
          poemDissipating: dissipatingRef.current,
          poemDissipated: doneRef.current,
          dissipationStartReason: dissipationStartReasonRef.current,
          dissipatePhases: dissipationPhased
            ? { ...dissipatePhasesRef.current }
            : { t: dissipateTRef.current },
          triggerInsideStreak: triggerInsideStreakRef.current,
          insideTriggerVolume: inVol,
          crossedPlaneThisFrame: crossedPlane,
          camLocalInPoemRoot: [_camLocal.x, _camLocal.y, _camLocal.z],
          relInTriggerBox: [relX, relY, relZ],
          boxHalf: [boxHalfW, boxHalfH, boxHalfD],
          explicitTriggerBox: Boolean(dissipationExplicitBox),
          poemWorld: _poemDbgWorld.toArray(),
          camDistanceToPoem: camera.position.distanceTo(_poemDbgWorld),
          rootFrustumCulled: root.frustumCulled,
          rootVisible: root.visible,
          billboard,
        });
      }
    }
  });

  return (
    <group
      ref={rootRef}
      position={position}
      rotation={rotation}
      frustumCulled={false}
    >
      {AQ_POEM_DEBUG && dissipationExplicitBox ? (
        <mesh
          position={[
            dissipationExplicitBox.center?.[0] ?? 0,
            dissipationExplicitBox.center?.[1] ?? 0,
            dissipationExplicitBox.center?.[2] ?? 0,
          ]}
          raycast={() => null}
        >
          <boxGeometry
            args={[
              dissipationExplicitBox.halfW * 2,
              dissipationExplicitBox.halfH * 2,
              dissipationExplicitBox.halfD * 2,
            ]}
          />
          <meshBasicMaterial
            color="#55cc99"
            wireframe
            transparent
            opacity={0.28}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ) : null}
      {renderMode === 'lineCanvas' && lineMeta && lineTexInfos
        ? lineMeta.items.map((it, i) => {
            const info = lineTexInfos[i];
            const planeH = rowH;
            const planeW = (info.cssW / info.cssH) * planeH;
            const baseX = (planeW - lineMaxPlaneW) * 0.5;
            const phase = it.lineIdx * 1.09 + i * 0.17;
            return (
              <PoemLinePlane
                key={`${contentKey}-line-${it.lineIdx}-${i}`}
                map={info.map}
                baseX={baseX}
                baseY={it.y}
                baseZ={it.zLayer ?? 0}
                planeW={planeW}
                planeH={planeH}
                phase={phase}
                lineIdx={it.lineIdx}
                floatStrength={floatStrength}
                fillHex={fillHex}
                highlight={highlight}
                baseOpacity={glyphBaseOpacity}
                shimmerStrength={0.38}
                brightnessMul={brightnessMul}
                dissipateTRef={dissipationPhased ? undefined : dissipateTRef}
                dissipatePhasesRef={dissipationPhased ? dissipatePhasesRef : undefined}
                dissipateVec={{
                  current: dissipateVecs[i],
                }}
                dissipatingRef={dissipatingRef}
                introFadeMulRef={introFadeMulRef}
                onLinePointerDown={onPoemBlockPointerDown}
              />
            );
          })
        : layout?.slots.map((slot, i) => (
            <PoemGlyph
              key={`${contentKey}-g-${i}-${slot.lineIdx}-${slot.col}-${slot.char}`}
              char={slot.char}
              italic={slot.italic}
              baseX={slot.baseX}
              baseY={slot.baseY}
              baseZ={slot.baseZ}
              phase={slot.phase}
              wordPhase={slot.wordPhase}
              scale={scale}
              floatStrength={floatStrength}
              fillHex={fillHex}
              crestHex={crestHex}
              highlight={highlight}
              baseOpacity={glyphBaseOpacity}
              shimmerStrength={0.38}
              brightnessMul={brightnessMul}
              dissipateTRef={dissipationPhased ? undefined : dissipateTRef}
              dissipatePhasesRef={dissipationPhased ? dissipatePhasesRef : undefined}
              dissipateVec={{
                current: dissipateVecs[i],
              }}
              depthTest={glyphDepthTest}
              dissipatingRef={dissipatingRef}
              introFadeMulRef={introFadeMulRef}
            />
          ))}
    </group>
  );
}

/**
 * Swamp Molly poem source — thin wrapper around {@link SwampFloatingWaterWords}.
 */
export default function SwampMollyPoem({ position, rotation, ...rest }) {
  const wrapRef = useRef(null);
  const { camera, size } = useThree();

  const syncWrapPosition = useCallback(() => {
    const g = wrapRef.current;
    if (!g || !position) return;
    const p0 = worldPositionNudgeScreenLeftPx(
      camera,
      size.width,
      size.height,
      position,
      POEM_SCREEN_NUDGE_LEFT_PX,
    );
    const p = worldPositionNudgeScreenBackPx(
      camera,
      size.width,
      size.height,
      p0,
      POEM_SCREEN_NUDGE_BACK_PX,
    );
    g.position.set(p[0], p[1], p[2]);
  }, [camera, position, size.height, size.width]);

  useLayoutEffect(() => {
    syncWrapPosition();
  }, [syncWrapPosition]);

  useEffect(() => {
    const onResize = () => syncWrapPosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncWrapPosition]);

  return (
    <group ref={wrapRef} frustumCulled={false}>
      <SwampFloatingWaterWords
        contentKey="swamp-molly-poem"
        rawText={SWAMP_MOLLY_POEM_RAW}
        renderMode="lineCanvas"
        scale={POEM_SCALE}
        brightnessMul={2}
        glyphBaseOpacity={0.82}
        volumeDepth={2.35}
        floatStrength={0.014}
        billboard={false}
        dissipationPhased
        dissipateBreakupSpeed={POEM_DISSIPATE_BREAKUP_SPEED}
        poemLingerSec={POEM_DISSIPATE_LINGER_SEC}
        poemFadeSec={POEM_DISSIPATE_FADE_SEC}
        dissipationExplicitBox={POEM_DISSIPATION_EXPLICIT_BOX}
        dissipationTriggerEnterFrames={POEM_DISSIPATE_TRIGGER_ENTER_FRAMES}
        glyphDepthTest={false}
        position={[0, 0, 0]}
        rotation={rotation}
        {...rest}
      />
    </group>
  );
}
