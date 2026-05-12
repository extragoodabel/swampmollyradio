import * as THREE from 'three';

let cached = null;

/**
 * Tiny elongated fish silhouette used by `BackgroundFishClouds`.
 *
 * Rendered as a 64x32 canvas:
 *   - Soft horizontal oval body (radial gradient)
 *   - A small triangular tail hint on the right
 *   - A faint underbelly highlight
 *
 * At the distances where this texture is used (typically z = -22 to
 * -45 world units), individual points are 1-4px on screen. The exact
 * silhouette doesn't matter much; what matters is that the *aggregate*
 * reads as a packed swarm rather than a star field. The tail hint
 * breaks the dot's perfect radial symmetry just enough to suggest
 * direction.
 *
 * Single canvas, cached on module load. Every cloud reuses the same
 * texture so the GPU keeps just one upload.
 */
export function getDistantFishTexture() {
  if (cached) return cached;

  const w = 64;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Soft elliptical body.
  ctx.save();
  ctx.translate(w * 0.46, h * 0.5);
  ctx.scale(1.25, 1.0);
  const body = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.32);
  body.addColorStop(0.0, 'rgba(220, 235, 245, 0.95)');
  body.addColorStop(0.45, 'rgba(180, 210, 225, 0.55)');
  body.addColorStop(0.85, 'rgba(140, 175, 195, 0.12)');
  body.addColorStop(1.0, 'rgba(140, 175, 195, 0.0)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tail wedge.
  ctx.fillStyle = 'rgba(170, 200, 215, 0.55)';
  ctx.beginPath();
  ctx.moveTo(w * 0.78, h * 0.5);
  ctx.lineTo(w * 0.98, h * 0.22);
  ctx.lineTo(w * 0.98, h * 0.78);
  ctx.closePath();
  ctx.fill();

  // Faint underbelly highlight for that "salmon underside" look.
  const belly = ctx.createLinearGradient(0, h * 0.5, 0, h);
  belly.addColorStop(0.0, 'rgba(255, 220, 195, 0.0)');
  belly.addColorStop(1.0, 'rgba(255, 215, 190, 0.35)');
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(w * 0.46, h * 0.62, w * 0.30, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}

let shadowCached = null;

/**
 * Distant shadow sprite for `SalmonShadowFishSilhouettes` — long tapered fusiform
 * (not a fat ellipse), soft feathered alpha, wide transparent margin so quads
 * don’t read as square cards at tiny screen sizes.
 */
export function getShadowSilhouetteFishTexture() {
  if (shadowCached) return shadowCached;

  const w = 132;
  const h = 40;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const cx = w * 0.46;
  const cy = h * 0.5;

  // Directional body mass: several staggered ellipses → reads as fish depth, not a blob.
  const layers = [
    { x: w * 0.2, y: cy, rx: w * 0.11, ry: h * 0.22, rot: -0.06, a0: 0.78 },
    { x: w * 0.42, y: cy - h * 0.02, rx: w * 0.22, ry: h * 0.34, rot: 0.03, a0: 0.98 },
    { x: w * 0.66, y: cy + h * 0.02, rx: w * 0.16, ry: h * 0.26, rot: 0.05, a0: 0.72 },
  ];

  for (const L of layers) {
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.rot);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(L.rx, L.ry) * 1.05);
    g.addColorStop(0.0, `rgba(5, 8, 13, ${0.22 + L.a0 * 0.78})`);
    g.addColorStop(0.35, `rgba(8, 12, 20, ${0.55 + L.a0 * 0.42})`);
    g.addColorStop(0.62, 'rgba(16, 24, 36, 0.38)');
    g.addColorStop(0.82, 'rgba(28, 38, 52, 0.14)');
    g.addColorStop(1.0, 'rgba(20, 28, 40, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, L.rx, L.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Soft tail lobes (low contrast — suggestion, not a solid wedge block).
  ctx.fillStyle = 'rgba(4, 7, 12, 0.45)';
  ctx.beginPath();
  ctx.moveTo(w * 0.82, cy);
  ctx.quadraticCurveTo(w * 0.92, cy - h * 0.34, w * 0.995, cy - h * 0.12);
  ctx.quadraticCurveTo(w * 0.96, cy, w * 0.995, cy + h * 0.12);
  ctx.quadraticCurveTo(w * 0.92, cy + h * 0.34, w * 0.82, cy);
  ctx.closePath();
  ctx.fill();

  // Narrow snout taper (+X forward).
  const sn = ctx.createLinearGradient(w * 0.02, cy, w * 0.26, cy);
  sn.addColorStop(0.0, 'rgba(6, 9, 14, 0.0)');
  sn.addColorStop(0.55, 'rgba(6, 10, 16, 0.55)');
  sn.addColorStop(1.0, 'rgba(6, 10, 16, 0.0)');
  ctx.fillStyle = sn;
  ctx.beginPath();
  ctx.ellipse(w * 0.14, cy, w * 0.1, h * 0.14, 0.02, 0, Math.PI * 2);
  ctx.fill();

  // Subtle flank glint (breaks up uniform dark mass).
  const glint = ctx.createLinearGradient(w * 0.24, cy - h * 0.08, w * 0.62, cy + h * 0.06);
  glint.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
  glint.addColorStop(0.4, 'rgba(200, 220, 240, 0.22)');
  glint.addColorStop(0.65, 'rgba(150, 180, 210, 0.1)');
  glint.addColorStop(1.0, 'rgba(100, 130, 165, 0)');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.04, w * 0.26, h * 0.1, 0.1, 0, Math.PI * 2);
  ctx.fill();

  shadowCached = new THREE.CanvasTexture(canvas);
  shadowCached.colorSpace = THREE.SRGBColorSpace;
  shadowCached.generateMipmaps = false;
  shadowCached.minFilter = THREE.LinearFilter;
  shadowCached.magFilter = THREE.LinearFilter;
  shadowCached.needsUpdate = true;
  return shadowCached;
}

let midShadowCached = null;

/**
 * Mid-distance silhouette — same fusiform language as distant sprites, slightly
 * richer flank read; elongated +X, not a squat card.
 */
export function getMidShadowFishBillboardTexture() {
  if (midShadowCached) return midShadowCached;

  const w = 128;
  const h = 44;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(6, 10, 18, 0.0)';
  ctx.fillRect(0, 0, w, h);

  const cy = h * 0.52;
  const layers = [
    { x: w * 0.22, y: cy, rx: w * 0.12, ry: h * 0.24, rot: -0.07, a0: 0.55 },
    { x: w * 0.46, y: cy - h * 0.03, rx: w * 0.26, ry: h * 0.36, rot: 0.04, a0: 0.88 },
    { x: w * 0.72, y: cy + h * 0.03, rx: w * 0.17, ry: h * 0.27, rot: 0.06, a0: 0.62 },
  ];

  for (const L of layers) {
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.rot);
    const body = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(L.rx, L.ry) * 1.08);
    body.addColorStop(0.0, `rgba(16, 22, 34, ${0.35 + L.a0 * 0.62})`);
    body.addColorStop(0.38, 'rgba(12, 18, 28, 0.94)');
    body.addColorStop(0.64, 'rgba(28, 38, 52, 0.55)');
    body.addColorStop(0.85, 'rgba(42, 56, 72, 0.2)');
    body.addColorStop(1.0, 'rgba(36, 50, 68, 0.0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, L.rx, L.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(8, 12, 20, 0.5)';
  ctx.beginPath();
  ctx.moveTo(w * 0.84, cy);
  ctx.quadraticCurveTo(w * 0.94, cy - h * 0.32, w * 0.995, cy - h * 0.11);
  ctx.quadraticCurveTo(w * 0.965, cy, w * 0.995, cy + h * 0.11);
  ctx.quadraticCurveTo(w * 0.94, cy + h * 0.32, w * 0.84, cy);
  ctx.closePath();
  ctx.fill();

  const sn = ctx.createLinearGradient(w * 0.04, cy, w * 0.28, cy);
  sn.addColorStop(0.0, 'rgba(14, 20, 30, 0.0)');
  sn.addColorStop(0.55, 'rgba(12, 18, 28, 0.55)');
  sn.addColorStop(1.0, 'rgba(12, 18, 28, 0.0)');
  ctx.fillStyle = sn;
  ctx.beginPath();
  ctx.ellipse(w * 0.17, cy, w * 0.11, h * 0.15, 0.02, 0, Math.PI * 2);
  ctx.fill();

  const glint = ctx.createLinearGradient(w * 0.26, cy - h * 0.1, w * 0.68, cy + h * 0.08);
  glint.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
  glint.addColorStop(0.42, 'rgba(210, 228, 245, 0.38)');
  glint.addColorStop(0.64, 'rgba(170, 195, 220, 0.18)');
  glint.addColorStop(1.0, 'rgba(120, 150, 180, 0)');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.ellipse(w * 0.48, cy - h * 0.05, w * 0.3, h * 0.12, 0.11, 0, Math.PI * 2);
  ctx.fill();

  midShadowCached = new THREE.CanvasTexture(canvas);
  midShadowCached.colorSpace = THREE.SRGBColorSpace;
  midShadowCached.generateMipmaps = false;
  midShadowCached.minFilter = THREE.LinearFilter;
  midShadowCached.magFilter = THREE.LinearFilter;
  midShadowCached.needsUpdate = true;
  return midShadowCached;
}
