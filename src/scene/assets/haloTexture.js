import * as THREE from 'three';

let cached = null;

/**
 * Soft radial halo sprite used as the bloom-substitute glow around
 * the radio beacon. A two-stop radial gradient with a faint outer
 * tail; additive blending in the consumer mesh handles the actual
 * "glow over water" feel.
 *
 * Drawn at 256px so it stays crisp at the orb's typical 1.5-3 world
 * unit scale.
 */
export function getHaloTexture() {
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.0, 'rgba(200, 245, 255, 0.92)');
  grad.addColorStop(0.18, 'rgba(170, 230, 245, 0.55)');
  grad.addColorStop(0.45, 'rgba(140, 210, 230, 0.18)');
  grad.addColorStop(0.78, 'rgba(120, 190, 215, 0.04)');
  grad.addColorStop(1.0, 'rgba(120, 190, 215, 0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}
