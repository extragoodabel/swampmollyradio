import * as THREE from 'three';

let cached = null;

/**
 * Soft bubble sprite -- transparent center, faint cyan rim, tiny
 * specular highlight on the upper-left. Drawn to a 64px canvas so it
 * can be sampled cheaply by the bubble trail shader's point sprites.
 *
 * Kept subtle: the bubble reads as a glass shell, not a cartoon dot.
 * Alpha is generally low; per-bubble alpha is multiplied on top in the
 * shader so most bubbles never get bright enough to draw attention
 * away from the fish.
 */
export function getBubbleTexture() {
  if (cached) return cached;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  // Hollow-ish glass shell: transparent core, faint cyan rim.
  const ring = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  ring.addColorStop(0.0, 'rgba(180, 220, 230, 0.00)');
  ring.addColorStop(0.55, 'rgba(195, 230, 240, 0.06)');
  ring.addColorStop(0.86, 'rgba(180, 215, 230, 0.55)');
  ring.addColorStop(0.97, 'rgba(180, 215, 230, 0.18)');
  ring.addColorStop(1.0, 'rgba(180, 215, 230, 0.00)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);

  // Specular highlight (upper-left).
  const hlX = cx - r * 0.32;
  const hlY = cy - r * 0.36;
  const hl = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, r * 0.30);
  hl.addColorStop(0.0, 'rgba(255, 255, 255, 0.85)');
  hl.addColorStop(0.5, 'rgba(255, 255, 255, 0.20)');
  hl.addColorStop(1.0, 'rgba(255, 255, 255, 0.00)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, size, size);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}
