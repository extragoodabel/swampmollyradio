/**
 * One-shot helper that converted the source PNG fish art to the
 * lossless WebP sprites checked into `public/fish/`.
 *
 * Usage (only when refreshing the assets):
 *   npm install --no-save sharp
 *   node scripts/png2webp.mjs
 *
 * `sharp` is intentionally NOT a project dependency -- this script
 * is rarely re-run, and pulling sharp's native binaries into the app
 * build would bloat install time for no runtime benefit.
 *
 * Each source PNG produces one lossless WebP at the same dimensions.
 * Lossless mode is important: the fish are pixel art, and any
 * compression artefacts (e.g. WebP near-lossless or quality < 100)
 * would soften the silhouettes that the renderer relies on for the
 * crisp `alphaTest` cut-out.
 */
import sharp from 'sharp';

const inputs = [
  [
    '/Users/abelcharrow/.cursor/projects/Users-abelcharrow-Documents-dark-aquarium/assets/salmon_-facing-left-2afe12c3-c188-40b2-8e4b-bdce94ede38f.png',
    'public/fish/salmon-facing-left.webp',
  ],
  [
    '/Users/abelcharrow/.cursor/projects/Users-abelcharrow-Documents-dark-aquarium/assets/salmon-facing-left-99-ee9b0599-bae9-4027-9916-9bc9e2421d35.png',
    'public/fish/salmon-facing-left-99.webp',
  ],
];

for (const [src, dst] of inputs) {
  await sharp(src).webp({ lossless: true }).toFile(dst);
  console.log('wrote', dst);
}
