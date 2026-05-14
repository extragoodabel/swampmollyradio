import * as THREE from 'three';
import {
  SWAMP_POEM_BODY_FONT_PX,
  SWAMP_POEM_DPR,
  SWAMP_POEM_HEADING_FONT_PX,
  SWAMP_POEM_LINE_HEIGHT_MUL,
  SWAMP_POEM_PAD_X,
  SWAMP_POEM_PAD_Y,
  SWAMP_POEM_PIXEL_TO_WORLD,
  SWAMP_POEM_STANZA_STEP_PX,
} from './swampMollyPoemRebuildConstants.js';
import { typographyFillHex } from './typographyPalette.js';

const TAB_STOP_PX = 52;

/**
 * @param {string} raw verbatim `SWAMP_MOLLY_POEM_RAW`
 * @returns {{ headingLines: string[], body: string }}
 */
export function splitHeadingAndBody(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const heading1 = lines[0] ?? '';
  const heading2 = lines[1] ?? '';
  const heading3 = 'Girl Noise Press (c) 2025';
  let i = 2;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const body = lines.slice(i).join('\n');
  return { headingLines: [heading1, heading2, heading3], body };
}

/** @param {string} body */
export function splitStanzas(body) {
  return body
    .split(/\n\s*\n/)
    .map((s) => s.replace(/^\n+|\n+$/g, ''))
    .filter((s) => s.length > 0);
}

/**
 * @typedef {{ char: string, lx: number, ly: number, planeIndex: number }} PoemCharCell
 * @typedef {{
 *   kind: 'heading' | 'stanza';
 *   texture: THREE.CanvasTexture;
 *   canvasW: number;
 *   canvasH: number;
 *   planeW: number;
 *   planeH: number;
 *   planeIndex: number;
 *   stackY?: number;
 *   charCells: PoemCharCell[];
 * }} PoemRebuildPanel
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} line
 * @param {number} startX
 * @param {number} y
 * @param {number} planeIndex
 * @param {PoemCharCell[]} outCells
 * @param {number} tabPx tab stop width in **current** ctx units (CSS px)
 */
function drawLineWithMetrics(ctx, line, startX, y, planeIndex, outCells, tabPx) {
  let x = startX;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\t') {
      x = Math.ceil(x / tabPx) * tabPx;
      continue;
    }
    const w = ctx.measureText(ch).width;
    if (ch !== ' ') {
      outCells.push({ char: ch, lx: x + w * 0.5, ly: y, planeIndex });
    }
    ctx.fillText(ch, x, y);
    x += w;
  }
}

/**
 * Rasterize in **CSS pixel space** (ctx scaled by DPR for sharpness).
 * @param {{
 *   lines: string[];
 *   fontPx: number;
 *   murkiness: number;
 *   typographyTint: object | null;
 *   headingItalicLines?: number[];
 *   kind: 'heading' | 'stanza';
 *   planeIndex: number;
 * }} opts
 */
function rasterizeBlock(opts) {
  const {
    lines,
    fontPx,
    murkiness,
    typographyTint,
    headingItalicLines = [],
    kind,
    planeIndex,
  } = opts;

  const fillHex = typographyFillHex(murkiness, typographyTint);
  const dpr = SWAMP_POEM_DPR;
  const lineH = fontPx * SWAMP_POEM_LINE_HEIGHT_MUL;
  const padX = SWAMP_POEM_PAD_X;
  const padY = SWAMP_POEM_PAD_Y;

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2d context required');
  probe.font = `${fontPx}px Georgia, "Times New Roman", serif`;

  let maxW = padX * 2;
  for (const line of lines) {
    let x = padX;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '\t') {
        x = Math.ceil(x / TAB_STOP_PX) * TAB_STOP_PX;
        continue;
      }
      x += probe.measureText(ch).width;
    }
    maxW = Math.max(maxW, x + padX);
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
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    ctx.shadowColor = 'rgba(8, 32, 28, 0.55)';
    ctx.shadowBlur = 3.5;
    ctx.shadowOffsetX = 0.8;
    ctx.shadowOffsetY = 1.1;
    ctx.fillStyle = fillHex;
    if (kind === 'heading' && headingItalicLines.includes(li)) {
      ctx.font = `italic ${fontPx}px Georgia, "Times New Roman", serif`;
    } else {
      ctx.font = `${fontPx}px Georgia, "Times New Roman", serif`;
    }
    drawLineWithMetrics(ctx, line, padX, ky, planeIndex, charCells, TAB_STOP_PX);
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

  for (const c of charCells) {
    const nx = (c.lx / cssW - 0.5) * planeW;
    const ny = (0.5 - c.ly / cssH) * planeH;
    c.lx = nx;
    c.ly = ny;
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
  };
}

/**
 * @param {string} raw
 * @param {number} murkiness
 * @param {object | null} typographyTint
 * @returns {{ panels: PoemRebuildPanel[], allCharCells: PoemCharCell[], bounds: { halfW: number, halfH: number } }}
 */
export function buildSwampPoemRebuildPanels(raw, murkiness, typographyTint) {
  const { headingLines, body } = splitHeadingAndBody(raw);
  const stanzas = splitStanzas(body);

  /** @type {PoemRebuildPanel[]} */
  const panels = [];
  /** @type {PoemCharCell[]} */
  const allCharCells = [];

  let planeIndex = 0;

  const hRaster = rasterizeBlock({
    lines: headingLines,
    fontPx: SWAMP_POEM_HEADING_FONT_PX,
    murkiness,
    typographyTint,
    headingItalicLines: [0],
    kind: 'heading',
    planeIndex,
  });
  panels.push({
    ...hRaster,
    charCells: hRaster.charCells.map((c) => ({ ...c })),
  });
  allCharCells.push(...hRaster.charCells);
  planeIndex += 1;

  for (const stanza of stanzas) {
    const stanzaLines = stanza.split('\n');
    const sRaster = rasterizeBlock({
      lines: stanzaLines,
      fontPx: SWAMP_POEM_BODY_FONT_PX,
      murkiness,
      typographyTint,
      kind: 'stanza',
      planeIndex,
    });
    panels.push({
      ...sRaster,
      charCells: sRaster.charCells.map((c) => ({ ...c })),
    });
    allCharCells.push(...sRaster.charCells);
    planeIndex += 1;
  }

  const gapWorld =
    (SWAMP_POEM_STANZA_STEP_PX / SWAMP_POEM_BODY_FONT_PX) *
    SWAMP_POEM_LINE_HEIGHT_MUL *
    0.35;

  let maxHalfW = 0;
  let stackH = 0;
  for (let i = 0; i < panels.length; i += 1) {
    const p = panels[i];
    maxHalfW = Math.max(maxHalfW, p.planeW * 0.5);
    stackH += p.planeH;
    if (i < panels.length - 1) stackH += gapWorld;
  }
  const halfH = stackH * 0.5;

  let cursorY = halfH;
  for (let i = 0; i < panels.length; i += 1) {
    const p = panels[i];
    cursorY -= p.planeH * 0.5;
    p.stackY = cursorY;
    cursorY -= p.planeH * 0.5;
    if (i < panels.length - 1) cursorY -= gapWorld;
  }

  for (const p of panels) {
    const sy = p.stackY ?? 0;
    for (const c of p.charCells) {
      c.ly += sy;
    }
  }

  return {
    panels,
    allCharCells,
    bounds: { halfW: maxHalfW + 0.35, halfH: halfH + 0.45 },
  };
}
