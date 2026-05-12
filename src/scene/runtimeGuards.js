/**
 * Central runtime sanitization for Leva / localStorage / URL-injected garbage.
 * All hero-school and navigation inputs must pass through these guards
 * so the R3F tree cannot hard-crash (e.g. clusterCount=0 → modulo-by-zero).
 */

export const CLUSTER_MIN = 2;
export const CLUSTER_MAX = 12;

export function warnRuntimeCorrected(system, original, corrected) {
  console.warn(
    `[aquarium] invalid ${system}=${JSON.stringify(original)} → corrected to ${JSON.stringify(corrected)}`,
  );
}

/** Integer in [CLUSTER_MIN, CLUSTER_MAX]; never NaN / 0 / negative. */
export function guardClusterCount(raw, system = 'clusterCount') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < CLUSTER_MIN) {
    warnRuntimeCorrected(system, raw, 4);
    return 4;
  }
  const f = Math.floor(n);
  if (f > CLUSTER_MAX) {
    warnRuntimeCorrected(system, raw, CLUSTER_MAX);
    return CLUSTER_MAX;
  }
  return f;
}

/** Hero school population — must stay within shader / perf rails. */
export function guardHeroFishCount(raw, system = 'heroFishCount') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    warnRuntimeCorrected(system, raw, 90);
    return 90;
  }
  const r = Math.round(n);
  const c = Math.max(20, Math.min(180, r));
  if (c !== r) warnRuntimeCorrected(system, raw, c);
  return c;
}

/** Secondary / satellite hero-quality schools — smaller allowed population. */
export function guardSatelliteFishCount(raw, system = 'satelliteFishCount') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    warnRuntimeCorrected(system, raw, 14);
    return 14;
  }
  const r = Math.round(n);
  const c = Math.max(6, Math.min(40, r));
  if (c !== r) warnRuntimeCorrected(system, raw, c);
  return c;
}

export function guardSwimSpeed(raw, system = 'swimSpeed') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.05) {
    warnRuntimeCorrected(system, raw, 1);
    return 1;
  }
  return Math.min(3, n);
}

export function guardSchoolSpread(raw, system = 'schoolSpread') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.25) {
    warnRuntimeCorrected(system, raw, 1);
    return 1;
  }
  return Math.min(2.5, n);
}

export function guardHazeLayerCount(raw, system = 'hazeLayerCount') {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    warnRuntimeCorrected(system, raw, 0);
    return 0;
  }
  const f = Math.floor(n);
  if (f > 12) {
    warnRuntimeCorrected(system, raw, 12);
    return 12;
  }
  return f;
}

/**
 * @returns {[number, number]} sanitized [near, far]
 */
export function guardVolumeFog(
  nearRaw,
  farRaw,
  themeNear,
  themeFar,
  system = 'volumeFog',
) {
  let near = Number(nearRaw);
  let far = Number(farRaw);
  const tN = Number(themeNear);
  const tF = Number(themeFar);
  const fbN = Number.isFinite(tN) ? tN : 8;
  const fbF = Number.isFinite(tF) ? tF : Math.max(fbN + 12, 36);
  if (!Number.isFinite(near)) near = fbN;
  if (!Number.isFinite(far)) far = fbF;
  near = Math.min(250, Math.max(0.05, near));
  far = Math.min(500, Math.max(far, near + 1.5));
  const themeSpan = Math.max(4, fbF - fbN);
  const minSpan = Math.min(120, Math.max(8, themeSpan * 0.22));
  if (far - near < minSpan) {
    far = Math.min(500, near + minSpan);
  }
  if (far - near < 6) {
    far = Math.min(500, near + Math.max(12, minSpan));
  }
  if (!Number.isFinite(near) || !Number.isFinite(far) || near >= far) {
    const out = [fbN, Math.min(500, fbN + Math.max(18, themeSpan * 0.35))];
    warnRuntimeCorrected(system, [nearRaw, farRaw], out);
    return out;
  }
  return [near, far];
}

/**
 * @returns {[number, number]} [zMin, zMax] camera Z rails
 */
export function guardCameraRails(zMinRaw, zMaxRaw, system = 'cameraRails') {
  let zmin = Number(zMinRaw);
  let zmax = Number(zMaxRaw);
  if (!Number.isFinite(zmin)) zmin = -6;
  if (!Number.isFinite(zmax)) zmax = 15;
  if (zmin >= zmax - 0.5) {
    warnRuntimeCorrected(system, [zMinRaw, zMaxRaw], [-6, 15]);
    return [-6, 15];
  }
  return [zmin, zmax];
}

export function guardSchoolBounds(raw, system = 'FishSchool.bounds') {
  const o = raw ?? {};
  const bx = Number(o.x);
  const by = Number(o.y);
  const bz = Number(o.z);
  const x = Number.isFinite(bx) && bx > 0.1 ? bx : 16;
  const y = Number.isFinite(by) && by > 0.1 ? by : 5.5;
  const z = Number.isFinite(bz) && bz > 0.1 ? bz : 18;
  const dirty =
    !Number.isFinite(bx) ||
    !Number.isFinite(by) ||
    !Number.isFinite(bz) ||
    bx <= 0.1 ||
    by <= 0.1 ||
    bz <= 0.1;
  if (dirty) warnRuntimeCorrected(system, raw, { x, y, z });
  return { x, y, z };
}

/**
 * One-shot Leva patch from persisted store. Logs each corrected key.
 * @param {Record<string, unknown>} s snapshot from refs
 */
export function buildLevaSanitizePatch(s) {
  const patch = {};
  const ds = Number(s.dragSensitivity);
  if (!Number.isFinite(ds) || ds < 0.12) {
    warnRuntimeCorrected('Leva.dragSensitivity', s.dragSensitivity, 1);
    patch.dragSensitivity = 1;
  }
  const sc = Number(s.scrollDepthStrength);
  if (!Number.isFinite(sc) || sc < 0.12) {
    warnRuntimeCorrected('Leva.scrollDepthStrength', s.scrollDepthStrength, 1);
    patch.scrollDepthStrength = 1;
  }
  const hc = Number(s.heroFishCount);
  if (!Number.isFinite(hc) || hc < 15) {
    warnRuntimeCorrected('Leva.heroFishCount', s.heroFishCount, 90);
    patch.heroFishCount = 90;
  }
  const spd = Number(s.swimSpeed);
  if (!Number.isFinite(spd) || spd < 0.05) {
    warnRuntimeCorrected('Leva.swimSpeed', s.swimSpeed, 1);
    patch.swimSpeed = 1;
  }
  const zmin = Number(s.cameraZMin);
  const zmax = Number(s.cameraZMax);
  if (
    !Number.isFinite(zmin) ||
    !Number.isFinite(zmax) ||
    zmin >= zmax - 0.5
  ) {
    warnRuntimeCorrected('Leva.cameraZ', [s.cameraZMin, s.cameraZMax], [-6, 15]);
    patch.cameraZMin = -6;
    patch.cameraZMax = 15;
  }
  const dd = Number(s.dragDamping);
  if (!Number.isFinite(dd) || dd <= 0 || dd > 1) {
    warnRuntimeCorrected('Leva.dragDamping', s.dragDamping, 0.7);
    patch.dragDamping = 0.7;
  }
  const inert = Number(s.inertiaStrength);
  if (!Number.isFinite(inert) || inert < 0) {
    warnRuntimeCorrected('Leva.inertiaStrength', s.inertiaStrength, 1);
    patch.inertiaStrength = 1;
  }
  const mp = Number(s.maxPitchDegrees);
  if (!Number.isFinite(mp) || mp < 10) {
    warnRuntimeCorrected('Leva.maxPitchDegrees', s.maxPitchDegrees, 70);
    patch.maxPitchDegrees = 70;
  }
  const cl = Number(s.clusters);
  if (!Number.isFinite(cl) || cl < CLUSTER_MIN) {
    warnRuntimeCorrected('Leva.clusters', s.clusters, 4);
    patch.clusters = 4;
  }
  const spr = Number(s.schoolSpread);
  if (!Number.isFinite(spr) || spr < 0.25) {
    warnRuntimeCorrected('Leva.schoolSpread', s.schoolSpread, 1);
    patch.schoolSpread = 1;
  }
  const lo = Number(s.letterOpacity);
  if (!Number.isFinite(lo) || lo < 0.12) {
    warnRuntimeCorrected('Leva.letterOpacity', s.letterOpacity, 0.52);
    patch.letterOpacity = 0.52;
  }
  if (
    s.floatingLettersEnabled === undefined ||
    s.floatingLettersEnabled === null
  ) {
    warnRuntimeCorrected('Leva.floatingLettersEnabled', s.floatingLettersEnabled, true);
    patch.floatingLettersEnabled = true;
  }
  const rg = Number(s.radioGlowIntensity);
  if (!Number.isFinite(rg) || rg < 0.15) {
    warnRuntimeCorrected('Leva.radioGlowIntensity', s.radioGlowIntensity, 1);
    patch.radioGlowIntensity = 1;
  }
  return patch;
}
