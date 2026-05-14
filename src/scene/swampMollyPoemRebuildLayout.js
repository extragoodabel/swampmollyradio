import * as THREE from 'three';
import {
  SWAMP_POEM_BODY_FONT_PX,
  SWAMP_POEM_COLUMN_GAP_PX,
  SWAMP_POEM_DPR,
  SWAMP_POEM_FLICKER_ENABLED,
  SWAMP_POEM_FLICKER_PHRASE,
  SWAMP_POEM_LINE_HEIGHT_MUL,
  SWAMP_POEM_PAD_X,
  SWAMP_POEM_PAD_Y,
  SWAMP_POEM_PANEL_DEPTH_STAGGER,
  SWAMP_POEM_PANEL_Y_BIAS,
  SWAMP_POEM_PIXEL_TO_WORLD,
  SWAMP_POEM_REBUILD_FONT_MATCHES,
  swampPoemRebuildCanvasFont,
} from './swampMollyPoemRebuildConstants.js';
import { typographyFillHex } from './typographyPalette.js';

const TAB_STOP_PX = 52;

/**
 * Draw runs for a poem line; only the Hackles attribution uses mixed styles
 * ("from" roman, "Hackles" italic).
 * @returns {{ italic: boolean, text: string }[]}
 */
function lineRebuildDrawRuns(line) {
  const m = line.match(/^(\s*)from(\s+)Hackles(\s*)$/);
  if (m) {
    return [
      { italic: false, text: m[1] + 'from' + m[2] },
      { italic: true, text: 'Hackles' },
      { italic: false, text: m[3] },
    ];
  }
  return [{ italic: false, text: line }];
}

/** @param {string} line @param {string} phrase */
function splitFlickerPhraseLine(line, phrase) {
  if (!SWAMP_POEM_FLICKER_ENABLED) return null;
  const idx = line.indexOf(phrase);
  if (idx < 0) return null;
  return {
    before: line.slice(0, idx),
    phrase,
    after: line.slice(idx + phrase.length),
  };
}

/** @param {CanvasRenderingContext2D} probe */
function measureRunsWidth(probe, fontPx, runs) {
  let x = 0;
  for (const run of runs) {
    probe.font = swampPoemRebuildCanvasFont(fontPx, run.italic);
    for (let i = 0; i < run.text.length; i += 1) {
      const ch = run.text[i];
      if (ch === '\t') {
        x = Math.ceil(x / TAB_STOP_PX) * TAB_STOP_PX;
        continue;
      }
      x += probe.measureText(ch).width;
    }
  }
  return x;
}

/** @param {CanvasRenderingContext2D} probe */
function measureLineWidthWithRuns(probe, fontPx, line) {
  return measureRunsWidth(probe, fontPx, lineRebuildDrawRuns(line));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ italic: boolean, text: string }[]} runs
 * @returns {number} end x
 */
function drawRunsWithMetricsFromX(
  ctx,
  runs,
  fontPx,
  startX,
  y,
  planeIndex,
  lineIndex,
  columnKey,
  headingLineCount,
  outCells,
  tabPx,
) {
  let x = startX;
  for (const run of runs) {
    ctx.font = swampPoemRebuildCanvasFont(fontPx, run.italic);
    for (let i = 0; i < run.text.length; i += 1) {
      const ch = run.text[i];
      if (ch === '\t') {
        x = Math.ceil(x / tabPx) * tabPx;
        continue;
      }
      const w = ctx.measureText(ch).width;
      if (ch !== ' ' && planeIndex >= 0) {
        const cellKind =
          columnKey === 'right'
            ? 'body'
            : lineIndex < headingLineCount
              ? 'heading'
              : 'body';
        outCells.push({
          char: ch,
          lx: x + w * 0.5,
          ly: y,
          lz: 0.02,
          planeIndex,
          lineIndex,
          columnKey,
          cellKind,
          glyphWidthPx: w,
          lineHeightPx: fontPx * SWAMP_POEM_LINE_HEIGHT_MUL,
          fontPx,
          italic: run.italic,
        });
      }
      ctx.fillText(ch, x, y);
      x += w;
    }
  }
  return x;
}

function drawRunsWithMetrics(
  ctx,
  runs,
  fontPx,
  startX,
  y,
  planeIndex,
  lineIndex,
  columnKey,
  headingLineCount,
  outCells,
  tabPx,
) {
  drawRunsWithMetricsFromX(
    ctx,
    runs,
    fontPx,
    startX,
    y,
    planeIndex,
    lineIndex,
    columnKey,
    headingLineCount,
    outCells,
    tabPx,
  );
}

/**
 * Glyph centers for the flicker strip only (overlay-local plane space, centered quad).
 * @param {string} phrase
 * @param {number} fontPx
 * @param {number} stripCssW
 * @param {number} stripCssH
 * @param {number} stripPlaneW
 * @param {number} stripPlaneH
 * @param {number} flickerLineIndex
 * @param {'left' | 'right'} columnKey
 * @returns {{ char: string, lx: number, ly: number, lz: number, planeIndex: number, lineIndex: number, columnKey: string, cellKind: 'flicker' }[]}
 */
function buildFlickerOverlayCharCells(
  phrase,
  fontPx,
  stripCssW,
  stripCssH,
  stripPlaneW,
  stripPlaneH,
  planeIndex,
  flickerLineIndex,
  columnKey,
) {
  const lineH = fontPx * SWAMP_POEM_LINE_HEIGHT_MUL;
  const padX = SWAMP_POEM_PAD_X;
  const padY = SWAMP_POEM_PAD_Y;
  const ky = padY + lineH * 0.5;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2d context required');
  /** @type {{ char: string, lx: number, ly: number, lz: number, planeIndex: number }[]} */
  const out = [];
  let x = padX;
  for (const run of lineRebuildDrawRuns(phrase)) {
    probe.font = swampPoemRebuildCanvasFont(fontPx, run.italic);
    for (let i = 0; i < run.text.length; i += 1) {
      const ch = run.text[i];
      if (ch === '\t') {
        x = Math.ceil(x / TAB_STOP_PX) * TAB_STOP_PX;
        continue;
      }
      const w = probe.measureText(ch).width;
      if (ch !== ' ') {
        const cx = x + w * 0.5;
        const nx = (cx / stripCssW - 0.5) * stripPlaneW;
        const ny = (0.5 - ky / stripCssH) * stripPlaneH;
        out.push({
          char: ch,
          lx: nx,
          ly: ny,
          lz: 0.03,
          planeIndex,
          lineIndex: flickerLineIndex,
          columnKey,
          cellKind: 'flicker',
          glyphWidthPx: w,
          lineHeightPx: lineH,
          fontPx,
          italic: run.italic,
        });
      }
      x += w;
    }
  }
  return out;
}

function rasterizePhraseStripTexture(phrase, fontPx, murkiness, typographyTint) {
  const fillHex = typographyFillHex(murkiness, typographyTint);
  const dpr = SWAMP_POEM_DPR;
  const lineH = fontPx * SWAMP_POEM_LINE_HEIGHT_MUL;
  const padX = SWAMP_POEM_PAD_X;
  const padY = SWAMP_POEM_PAD_Y;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2d context required');
  const innerW = measureRunsWidth(probe, fontPx, lineRebuildDrawRuns(phrase));
  const cssW = Math.ceil(padX * 2 + innerW);
  const cssH = Math.ceil(padY * 2 + Math.max(1, 1) * lineH);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context required');
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';
  const ky = padY + lineH * 0.5;
  ctx.shadowColor = 'rgba(8, 32, 28, 0.55)';
  ctx.shadowBlur = 3.5;
  ctx.shadowOffsetX = 0.8;
  ctx.shadowOffsetY = 1.1;
  ctx.fillStyle = fillHex;
  drawRunsWithMetricsFromX(
    ctx,
    lineRebuildDrawRuns(phrase),
    fontPx,
    padX,
    ky,
    -1,
    0,
    'left',
    0,
    [],
    TAB_STOP_PX,
  );
  ctx.shadowBlur = 0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.anisotropy = 4;
  return {
    texture,
    cssW,
    cssH,
    planeW: cssW * SWAMP_POEM_PIXEL_TO_WORLD,
    planeH: cssH * SWAMP_POEM_PIXEL_TO_WORLD,
  };
}

/**
 * First three lines of the source = in-column heading (same size as body); remainder = poem body.
 * @param {string} raw verbatim `SWAMP_MOLLY_POEM_RAW`
 * @returns {{ headingLines: string[], body: string }}
 */
export function splitRebuildHeadingAndBody(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headingLines = [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
  let i = 3;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const body = lines.slice(i).join('\n');
  return { headingLines, body };
}

/** @param {string} body */
export function splitStanzas(body) {
  return body
    .split(/\n\s*\n/)
    .map((s) => s.replace(/^\n+|\n+$/g, ''))
    .filter((s) => s.length > 0);
}

/**
 * Consecutive split: first k stanzas → left column, rest → right column (preserves poem order).
 * Chooses k ∈ [1, n−1] to minimize |leftLines − rightLines|; ties favor splits closer to half the lines.
 * @param {string[]} stanzas
 * @returns {{ left: string[], right: string[], leftIndices: number[], rightIndices: number[] }}
 */
export function balanceStanzasIntoTwoColumns(stanzas) {
  const n = stanzas.length;
  if (n === 0) {
    return { left: [], right: [], leftIndices: [], rightIndices: [] };
  }
  const lineCounts = stanzas.map((s) => s.split('\n').length);
  if (n === 1) {
    return {
      left: [stanzas[0]],
      right: [],
      leftIndices: [0],
      rightIndices: [],
    };
  }

  const totalLines = lineCounts.reduce((a, b) => a + b, 0);
  const halfTotal = totalLines * 0.5;
  let bestK = 1;
  let bestDiff = Infinity;
  let bestHalfDist = Infinity;

  for (let k = 1; k < n; k += 1) {
    const leftLines = lineCounts.slice(0, k).reduce((a, b) => a + b, 0);
    const rightLines = lineCounts.slice(k).reduce((a, b) => a + b, 0);
    const diff = Math.abs(leftLines - rightLines);
    const halfDist = Math.abs(leftLines - halfTotal);
    if (diff < bestDiff || (diff === bestDiff && halfDist < bestHalfDist)) {
      bestDiff = diff;
      bestHalfDist = halfDist;
      bestK = k;
    }
  }

  const left = stanzas.slice(0, bestK);
  const right = stanzas.slice(bestK);
  const leftIndices = left.map((_, i) => i);
  const rightIndices = right.map((_, i) => i + bestK);
  return { left, right, leftIndices, rightIndices };
}

/**
 * @typedef {{
 *   char: string,
 *   lx: number, ly: number, lz: number, planeIndex: number,
 *   panelLocalX: number, panelLocalY: number, panelLocalZ: number,
 *   lineIndex: number,
 *   columnKey: 'left' | 'right',
 *   cellKind: 'heading' | 'body' | 'flicker',
 *   glyphWidthPx: number,
 *   lineHeightPx: number,
 *   fontPx: number,
 *   italic: boolean,
 *   sourceIndex?: number,
 *   panelId?: number,
 *   columnId?: 'heading' | 'left' | 'right' | 'flicker',
 *   sourceLine?: string,
 *   sourceStanza?: number,
 *   panelPxToWorld: number,
 * }} PoemCharCell
 * @typedef {{
 *   kind: 'columnLeft' | 'columnRight';
 *   texture: THREE.CanvasTexture;
 *   canvasW: number;
 *   canvasH: number;
 *   planeW: number;
 *   planeH: number;
 *   planeIndex: number;
 *   stackY?: number;
 *   offsetX?: number;
 *   charCells: PoemCharCell[];
 *   flickerCharCells: PoemCharCell[];
 *   column?: 'left' | 'right';
 *   flickerOverlay?: {
 *     phrase: string;
 *     texture: THREE.CanvasTexture;
 *     planeW: number;
 *     planeH: number;
 *     localX: number;
 *     localY: number;
 *   } | null;
 * }} PoemRebuildPanel
 */

/** @param {string} line @param {number} fontPx */
export function measureSwampPoemLineWidthPx(line, fontPx) {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return 0;
  return measureLineWidthWithRuns(probe, fontPx, line);
}

function findFlickerLineIndex(lines) {
  if (!SWAMP_POEM_FLICKER_ENABLED) return -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indexOf(SWAMP_POEM_FLICKER_PHRASE) !== -1) return i;
  }
  return -1;
}

function rasterizeBlock(opts) {
  const {
    lines,
    fontPx,
    murkiness,
    typographyTint,
    kind,
    planeIndex,
    flickerLineIndex = -1,
    headingLineCount = 0,
  } = opts;

  const columnKey = kind === 'columnLeft' ? 'left' : 'right';

  const fillHex = typographyFillHex(murkiness, typographyTint);
  const dpr = SWAMP_POEM_DPR;
  const lineH = fontPx * SWAMP_POEM_LINE_HEIGHT_MUL;
  const padX = SWAMP_POEM_PAD_X;
  const padY = SWAMP_POEM_PAD_Y;

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2d context required');

  const flickerSplit =
    flickerLineIndex >= 0 &&
    flickerLineIndex < lines.length &&
    splitFlickerPhraseLine(lines[flickerLineIndex], SWAMP_POEM_FLICKER_PHRASE);

  let maxW = padX * 2;
  for (const line of lines) {
    const innerW = measureLineWidthWithRuns(probe, fontPx, line);
    maxW = Math.max(maxW, padX + innerW + padX);
  }

  const cssW = Math.ceil(maxW);
  const cssH = Math.ceil(padY * 2 + Math.max(1, lines.length) * lineH);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context required');

  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';

  const charCells = [];

  let ky = padY + lineH * 0.5;
  /** @type {{ phraseStartPx: number, phraseW: number, phrase: string, ky: number } | null} */
  let flickerLayout = null;

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    ctx.shadowColor = 'rgba(8, 32, 28, 0.55)';
    ctx.shadowBlur = 3.5;
    ctx.shadowOffsetX = 0.8;
    ctx.shadowOffsetY = 1.1;
    ctx.fillStyle = fillHex;

    if (flickerSplit && li === flickerLineIndex) {
      const { before, phrase, after } = flickerSplit;
      let x = padX;
      x = drawRunsWithMetricsFromX(
        ctx,
        lineRebuildDrawRuns(before),
        fontPx,
        x,
        ky,
        planeIndex,
        li,
        columnKey,
        headingLineCount,
        charCells,
        TAB_STOP_PX,
      );
      const phraseW = measureRunsWidth(probe, fontPx, lineRebuildDrawRuns(phrase));
      const phraseStartPx = x;
      x += phraseW;
      drawRunsWithMetricsFromX(
        ctx,
        lineRebuildDrawRuns(after),
        fontPx,
        x,
        ky,
        planeIndex,
        li,
        columnKey,
        headingLineCount,
        charCells,
        TAB_STOP_PX,
      );
      flickerLayout = { phraseStartPx, phraseW, phrase, ky };
    } else {
      drawRunsWithMetrics(
        ctx,
        lineRebuildDrawRuns(line),
        fontPx,
        padX,
        ky,
        planeIndex,
        li,
        columnKey,
        headingLineCount,
        charCells,
        TAB_STOP_PX,
      );
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ky += lineH;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.anisotropy = 4;

  const planeW = cssW * SWAMP_POEM_PIXEL_TO_WORLD;
  const planeH = cssH * SWAMP_POEM_PIXEL_TO_WORLD;
  const panelPxToWorld = planeW / cssW;

  for (const c of charCells) {
    const nx = (c.lx / cssW - 0.5) * planeW;
    const ny = (0.5 - c.ly / cssH) * planeH;
    c.lx = nx;
    c.ly = ny;
    c.panelLocalX = nx;
    c.panelLocalY = ny;
    c.panelLocalZ = 0.02;
    c.panelPxToWorld = panelPxToWorld;
  }

  let flickerOverlay = null;
  /** @type {PoemCharCell[]} */
  let flickerCharCells = [];
  if (flickerSplit && flickerLayout) {
    const strip = rasterizePhraseStripTexture(
      flickerLayout.phrase,
      fontPx,
      murkiness,
      typographyTint,
    );
    const cx = flickerLayout.phraseStartPx + flickerLayout.phraseW * 0.5;
    const cy = flickerLayout.ky;
    const olx = (cx / cssW - 0.5) * planeW;
    const oly = (0.5 - cy / cssH) * planeH;
    flickerOverlay = {
      phrase: flickerLayout.phrase,
      texture: strip.texture,
      planeW: strip.planeW,
      planeH: strip.planeH,
      localX: olx,
      localY: oly,
    };
    flickerCharCells = buildFlickerOverlayCharCells(
      flickerLayout.phrase,
      fontPx,
      strip.cssW,
      strip.cssH,
      strip.planeW,
      strip.planeH,
      planeIndex,
      flickerLineIndex,
      columnKey,
    );
    for (const fc of flickerCharCells) {
      fc.lx += olx;
      fc.ly += oly;
      fc.panelLocalX = fc.lx;
      fc.panelLocalY = fc.ly;
      fc.panelLocalZ = 0.03;
      fc.panelPxToWorld = strip.planeW / strip.cssW;
    }
  }

  return {
    kind,
    texture,
    canvasW: cssW,
    canvasH: cssH,
    planeW,
    planeH,
    planeIndex,
    charCells,
    flickerOverlay,
    flickerCharCells,
  };
}

export function buildSwampPoemRebuildPanels(raw, murkiness, typographyTint) {
  const { headingLines, body } = splitRebuildHeadingAndBody(raw);
  const stanzas = splitStanzas(body);
  const { left, right, leftIndices, rightIndices } = balanceStanzasIntoTwoColumns(stanzas);

  const leftBody = left.length ? left.join('\n\n') : '';
  const leftColumnParts = [headingLines.join('\n')];
  if (leftBody) leftColumnParts.push(leftBody);
  const leftColumnText = leftColumnParts.join('\n\n');
  const leftLines = leftColumnText.split('\n');

  const rightBody = right.length ? right.join('\n\n') : '';
  const rightLines = rightBody ? rightBody.split('\n') : [' '];

  /** @type {PoemRebuildPanel[]} */
  const panels = [];
  /** @type {PoemCharCell[]} */
  const allCharCells = [];

  let planeIndex = 0;

  const flickLeft = findFlickerLineIndex(leftLines);
  const flickRight = findFlickerLineIndex(rightLines);

  const headingLineCount = headingLines.length;

  const lRaster = rasterizeBlock({
    lines: leftLines,
    fontPx: SWAMP_POEM_BODY_FONT_PX,
    murkiness,
    typographyTint,
    kind: 'columnLeft',
    planeIndex,
    flickerLineIndex: flickLeft,
    headingLineCount,
  });
  const leftPanel = {
    ...lRaster,
    column: 'left',
    charCells: lRaster.charCells.map((c) => ({ ...c })),
    flickerCharCells: lRaster.flickerCharCells.map((c) => ({ ...c })),
  };
  panels.push(leftPanel);
  allCharCells.push(...lRaster.charCells);
  planeIndex += 1;

  const rRaster = rasterizeBlock({
    lines: rightLines,
    fontPx: SWAMP_POEM_BODY_FONT_PX,
    murkiness,
    typographyTint,
    kind: 'columnRight',
    planeIndex,
    flickerLineIndex: flickRight,
    headingLineCount: 0,
  });
  const rightPanel = {
    ...rRaster,
    column: 'right',
    charCells: rRaster.charCells.map((c) => ({ ...c })),
    flickerCharCells: rRaster.flickerCharCells.map((c) => ({ ...c })),
  };
  panels.push(rightPanel);
  allCharCells.push(...rRaster.charCells);

  const gapWorldCol = SWAMP_POEM_COLUMN_GAP_PX * SWAMP_POEM_PIXEL_TO_WORLD;
  const wl = leftPanel.planeW;
  const wr = rightPanel.planeW;
  const hL = leftPanel.planeH;
  const hR = rightPanel.planeH;
  const maxColH = Math.max(hL, hR);

  leftPanel.offsetX = -(gapWorldCol / 2 + wl / 2);
  rightPanel.offsetX = gapWorldCol / 2 + wr / 2;

  const stackH = maxColH;
  const halfH = stackH * 0.5;
  leftPanel.stackY = halfH - hL * 0.5;
  rightPanel.stackY = halfH - hR * 0.5;

  const bodyHalfWidth = (wl + gapWorldCol + wr) * 0.5;
  const maxHalfW = bodyHalfWidth + 0.45;

  /** @type {PoemCharCell[]} */
  const dissipationCharCells = [...allCharCells.map((c) => ({ ...c }))];
  for (const p of panels) {
    dissipationCharCells.push(...p.flickerCharCells.map((c) => ({ ...c })));
  }

  for (let si = 0; si < dissipationCharCells.length; si += 1) {
    const c = dissipationCharCells[si];
    c.sourceIndex = si;
    c.panelId = c.planeIndex;
    const colLines = c.planeIndex === 0 ? leftLines : rightLines;
    c.sourceLine = colLines[c.lineIndex] ?? '';
    c.sourceStanza = -1;
    c.columnId =
      c.cellKind === 'flicker' ? 'flicker' : c.cellKind === 'heading' ? 'heading' : c.columnKey;
  }
  const flickerPhraseParticleCount = panels.reduce((n, p) => n + p.flickerCharCells.length, 0);

  const flickerTargetLine =
    flickLeft >= 0
      ? leftLines[flickLeft]
      : flickRight >= 0
        ? rightLines[flickRight]
        : null;
  const flickerPhraseFound =
    SWAMP_POEM_FLICKER_ENABLED &&
    Boolean(lRaster.flickerOverlay ?? rRaster.flickerOverlay);
  const flickerRenderMode = flickerPhraseFound ? 'overlay' : 'none';

  const layoutMeta = {
    columnCount: 2,
    headingLines: headingLines.slice(),
    leftColumnLineCount: leftLines.length,
    rightColumnLineCount: rightLines.length,
    fontCssSample: swampPoemRebuildCanvasFont(SWAMP_POEM_BODY_FONT_PX, false),
    fontItalicSample: swampPoemRebuildCanvasFont(SWAMP_POEM_BODY_FONT_PX, true),
    fontMatchesLabel: SWAMP_POEM_REBUILD_FONT_MATCHES,
    leftStanzaCount: left.length,
    rightStanzaCount: right.length,
    leftStanzaIndices: leftIndices,
    rightStanzaIndices: rightIndices,
    totalStanzaCount: stanzas.length,
    totalBlockHeightWorld: stackH,
    flickerPhraseFound,
    flickerRenderMode,
    flickerTargetLine,
    flickerLineFallback: false,
    flickerPhraseParticleCount,
    dissipationParticleCount: dissipationCharCells.length,
  };

  return {
    panels,
    allCharCells,
    dissipationCharCells,
    bounds: { halfW: maxHalfW, halfH: halfH + 0.25 },
    layoutMeta,
  };
}
