import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _top = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _axisProj = new THREE.Vector3();
const _perp = new THREE.Vector3();

/** Writes beam unit direction (X–Y plane) into `out`. */
export function setBeamDirection(angleDegrees, out) {
  const a = (angleDegrees * Math.PI) / 180;
  out.set(Math.sin(a), -Math.cos(a), 0);
}

/** Beam shaft midpoint in world space (centre of the billboard plane). */
export function setBeamMidpoint(position, angleDegrees, length, out) {
  setBeamDirection(angleDegrees, _dir);
  const half = length * 0.5;
  out.set(
    position[0] + _dir.x * half,
    position[1] + _dir.y * half,
    position[2] + _dir.z * half,
  );
}

/**
 * 0..1 — inside the lit shaft (along + lateral). Uses module scratch
 * vectors; safe for one rAF consumer (hero fish school only).
 */
export function sampleBeamVolumeFactorMutable(worldPos, beam) {
  if (!beam?.enabled) return 0;
  const { position, angleDegrees, width, length, regionSize = 1 } = beam;
  setBeamDirection(angleDegrees, _dir);
  _top.set(position[0], position[1], position[2]);
  _rel.subVectors(worldPos, _top);
  const along = _rel.dot(_dir);
  _axisProj.copy(_dir).multiplyScalar(along);
  _perp.subVectors(_rel, _axisProj);
  const perpDist = _perp.length();
  const lateralHalf = width * regionSize * 0.95;
  const headroom = 0.65;
  const tailroom = 0.85;
  const alongFactor =
    THREE.MathUtils.smoothstep(along, -headroom, headroom) *
    (1 -
      THREE.MathUtils.smoothstep(along, length - tailroom, length));
  const perpFactor =
    1 - THREE.MathUtils.smoothstep(perpDist, 0, Math.max(0.01, lateralHalf));
  return THREE.MathUtils.clamp(alongFactor * perpFactor, 0, 1);
}
