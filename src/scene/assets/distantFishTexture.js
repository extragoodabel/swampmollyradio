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
