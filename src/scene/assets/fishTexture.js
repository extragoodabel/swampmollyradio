import * as THREE from 'three';

/**
 * Placeholder fish texture generator.
 *
 * Draws a simple, soft-edged fish silhouette onto an offscreen canvas and
 * returns a THREE.CanvasTexture with a transparent background.
 *
 * Later this can be swapped for:
 *   - a static PNG (new THREE.TextureLoader().load('/fish/cod.png'))
 *   - a sprite sheet (THREE.Texture + offset/repeat animated each frame)
 *   - a transparent WebM (HTMLVideoElement + THREE.VideoTexture)
 *
 * The Fish component only cares that it gets back a texture whose alpha
 * channel describes the fish silhouette.
 */

const FISH_PROFILES = [
  { tint: '#c9d8e3', length: 1.0, slimness: 0.32 },
  { tint: '#a8b8c4', length: 1.1, slimness: 0.28 },
  { tint: '#d6dfe5', length: 0.9, slimness: 0.36 },
  { tint: '#b3c0cc', length: 1.15, slimness: 0.26 },
];

function drawFish(ctx, w, h, profile) {
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const bodyLen = w * 0.42 * profile.length;
  const bodyH = h * profile.slimness;

  ctx.save();
  ctx.translate(cx, cy);

  const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
  bodyGrad.addColorStop(0, withAlpha(profile.tint, 0.95));
  bodyGrad.addColorStop(0.5, withAlpha(profile.tint, 0.85));
  bodyGrad.addColorStop(1, withAlpha(profile.tint, 0.55));

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyLen, bodyH, 0, 0, Math.PI * 2);
  ctx.fill();

  const tailLen = bodyLen * 0.55;
  ctx.beginPath();
  ctx.moveTo(-bodyLen * 0.85, 0);
  ctx.lineTo(-bodyLen - tailLen, -bodyH * 1.1);
  ctx.lineTo(-bodyLen - tailLen * 0.85, 0);
  ctx.lineTo(-bodyLen - tailLen, bodyH * 1.1);
  ctx.closePath();
  ctx.fillStyle = withAlpha(profile.tint, 0.7);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyLen * 0.05, -bodyH * 0.95);
  ctx.quadraticCurveTo(bodyLen * 0.25, -bodyH * 1.8, bodyLen * 0.45, -bodyH * 0.95);
  ctx.closePath();
  ctx.fillStyle = withAlpha(profile.tint, 0.5);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyLen * 0.1, bodyH * 0.4);
  ctx.quadraticCurveTo(bodyLen * 0.25, bodyH * 1.2, bodyLen * 0.4, bodyH * 0.4);
  ctx.closePath();
  ctx.fillStyle = withAlpha(profile.tint, 0.45);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bodyLen * 0.7, -bodyH * 0.18, Math.max(1.5, bodyH * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 28, 36, 0.85)';
  ctx.fill();

  ctx.restore();

  softenEdges(ctx, w, h);
}

function softenEdges(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0 && data[i] < 40) data[i] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const textureCache = new Map();

export function getFishTexture(variant = 0) {
  const profileIndex = variant % FISH_PROFILES.length;
  if (textureCache.has(profileIndex)) return textureCache.get(profileIndex);

  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawFish(ctx, w, h, FISH_PROFILES[profileIndex]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  textureCache.set(profileIndex, texture);
  return texture;
}

export const FISH_VARIANT_COUNT = FISH_PROFILES.length;
