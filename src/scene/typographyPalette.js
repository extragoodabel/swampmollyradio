import * as THREE from 'three';

const FALLBACK_PEARL = new THREE.Color('#e8f4fc');
const FALLBACK_MURK = new THREE.Color('#335a68');

/**
 * @param {number} murkiness 0…1
 * @param {object | null | undefined} typographyTint — theme `letters.typographyTint`
 * @returns {string} `#rrggbb`
 */
export function typographyFillHex(murkiness, typographyTint) {
  const pearl = typographyTint?.pearl
    ? new THREE.Color(typographyTint.pearl)
    : FALLBACK_PEARL.clone();
  const murk = typographyTint?.murk
    ? new THREE.Color(typographyTint.murk)
    : FALLBACK_MURK.clone();
  const pow = typographyTint?.murkPow ?? 1;
  const m = Math.pow(THREE.MathUtils.clamp(murkiness, 0, 1), pow);
  const c = pearl.clone().lerp(murk, m);

  const aquaMix = typographyTint?.aquaMix ?? 0;
  if (typographyTint?.aqua && aquaMix > 0) {
    const aqua = new THREE.Color(typographyTint.aqua);
    const midBias = 1 - Math.abs(m - 0.5) * 2;
    c.lerp(aqua, aquaMix * midBias);
  }
  const warmMix = typographyTint?.warmMix ?? 0;
  if (typographyTint?.warm && warmMix > 0) {
    c.lerp(new THREE.Color(typographyTint.warm), warmMix);
  }
  return `#${c.getHexString()}`;
}

/** Soft “surface light” tone for glimmer lerp and canvas glyph gradients. */
export function typographyHighlightColor(typographyTint) {
  return new THREE.Color(typographyTint?.highlight ?? '#f2fbff');
}
