/**
 * Shared letter-slot layout for troika (`FloatingLetters`) and canvas fallback
 * (`CanvasFloatingLetters`) so radio slot indices stay identical.
 */

export const FLOAT_LAYOUT_DEFAULT = {
  sequentialDepthShare: 0.52,
  randomZAsFracOfSpread: 0.22,
  xJitterAsFracOfSpacing: 0.14,
  yJitterAsFracOfSpacing: 0.46,
};

export const LETTER_LAYOUT_SEED = 24601;

/** Ensures floating environmental copy renders lowercase (theme + Troika/canvas paths). */
export function normalizeFloatingPhrase(text) {
  if (typeof text !== 'string') return text;
  return text.toLocaleLowerCase('en-US');
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function countReadableGlyphs(fullText) {
  let c = 0;
  for (const line of fullText.split('\n')) {
    for (const ch of line) {
      if (!/\s/.test(ch)) c += 1;
    }
  }
  return Math.max(1, c);
}

/**
 * @param {{ maxAbsZ?: number }} [opts] — recovery: clamp each slot |baseZ| <= maxAbsZ
 */
export function computeLetterSlots(
  text,
  spacing,
  depthSpread,
  rowGapMul,
  intraLineYJitterMul,
  interRowJitterMul,
  lineXJitterMul,
  floatLayout,
  opts,
) {
  const fl = { ...FLOAT_LAYOUT_DEFAULT, ...floatLayout };
  const rnd = mulberry32(LETTER_LAYOUT_SEED);
  const zOrderAmp = depthSpread * fl.sequentialDepthShare * 0.5;
  const zRandAmp = depthSpread * fl.randomZAsFracOfSpread;
  const maxAbsZ = opts?.maxAbsZ;

  const glyphJitterZ = () => (rnd() - 0.5) * depthSpread * 0.11;

  const clampZ = (z) => {
    if (maxAbsZ == null || !Number.isFinite(maxAbsZ)) return z;
    return Math.max(-maxAbsZ, Math.min(maxAbsZ, z));
  };

  if (!text.includes('\n')) {
    const letters = text.split('');
    const total = letters.length;
    const G = countReadableGlyphs(text);

    let gi = 0;
    return letters.map((ch, i) => {
      const xJitter =
        (rnd() - 0.5) * spacing * fl.xJitterAsFracOfSpacing * lineXJitterMul;
      const yJitter =
        (rnd() - 0.5) * spacing * fl.yJitterAsFracOfSpacing * intraLineYJitterMul;
      let baseZ;
      if (/\s/.test(ch)) {
        baseZ = glyphJitterZ();
      } else {
        const idx = gi;
        gi += 1;
        const seq = G <= 1 ? 0 : (idx / (G - 1) - 0.5) * 2;
        const orderZ = seq * zOrderAmp;
        const zJit = (rnd() - 0.5) * zRandAmp * 2;
        baseZ = orderZ + zJit;
      }
      return {
        char: ch,
        baseX: (i - (total - 1) / 2) * spacing + xJitter,
        baseY: yJitter,
        baseZ: clampZ(baseZ),
        phase: rnd() * Math.PI * 2,
      };
    });
  }

  const lines = text.split('\n');
  const rowGap = spacing * rowGapMul;
  const slots = [];
  const G = countReadableGlyphs(text);
  let gi = 0;

  lines.forEach((lineStr, lineIdx) => {
    const chars = [...lineStr];
    const n = chars.length;
    const rowBase =
      lines.length > 1 ? (lines.length - 1) / 2 - lineIdx : 0;
    const rowY =
      rowBase * rowGap + (rnd() - 0.5) * spacing * interRowJitterMul;

    chars.forEach((ch, j) => {
      const xJitter =
        (rnd() - 0.5) * spacing * fl.xJitterAsFracOfSpacing * lineXJitterMul;
      const yJitter =
        (rnd() - 0.5) * spacing * fl.yJitterAsFracOfSpacing * intraLineYJitterMul;
      let baseZ;
      if (/\s/.test(ch)) {
        baseZ = glyphJitterZ();
      } else {
        const idx = gi;
        gi += 1;
        const seq = G <= 1 ? 0 : (idx / (G - 1) - 0.5) * 2;
        const orderZ = seq * zOrderAmp;
        const zJit = (rnd() - 0.5) * zRandAmp * 2;
        baseZ = orderZ + zJit;
      }
      slots.push({
        char: ch,
        baseX: (j - (n - 1) / 2) * spacing + xJitter,
        baseY: rowY + yJitter,
        baseZ: clampZ(baseZ),
        phase: rnd() * Math.PI * 2,
      });
    });

    if (lineIdx < lines.length - 1) {
      slots.push({
        char: '\n',
        baseX: 0,
        baseY: 0,
        baseZ: 0,
        phase: 0,
      });
    }
  });

  return slots;
}
