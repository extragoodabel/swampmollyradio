/**
 * Salmon Days Radio — recovery baseline + incremental safe rebuild.
 *
 * Swamp Molly is untouched. `SALMON_ENV` + URL flags tune layers.
 *
 * **Controlled reintroduction** (`?aqsalmonrestore=N`, N=1…13, Salmon only;
 * omit param = full stack). Swamp ignores. Layer thresholds:
 * 1 textured hero · 2 typography · 3 orb · 4 dust+bubbles · 5 vault · 6 haze
 * · 7 shadow fish · 8 light beam · 9 backdrop field · 10 companions + satellites
 * · 11 density/midfield/clouds · 12 (reserved; canopy stays off in `SALMON_ENV`)
 * · 13 abyss whale skeleton (`SalmonWhaleSkeleton`) + attribution (README).
 */

/** Legacy flag: kept for docs; Scene uses `SALMON_ENV` instead. */
export const SALMON_SAFE_BASELINE = true;

/** No `?aqsalmonrestore=` gating — full Salmon Days stack (default). */
export const SALMON_RESTORE_FULL = 999;

/**
 * Salmon Days only: `?aqsalmonrestore=N` (N∈1..13). Swamp ignores.
 * Layers mapped in `buildSalmonEnvForScene` + `Scene.jsx`.
 */
export function getSalmonRestoreStep() {
  if (typeof window === 'undefined') return SALMON_RESTORE_FULL;
  try {
    const raw = new URLSearchParams(window.location.search).get(
      'aqsalmonrestore',
    );
    if (raw === null || raw === '') return SALMON_RESTORE_FULL;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return SALMON_RESTORE_FULL;
    return Math.min(13, n);
  } catch {
    return SALMON_RESTORE_FULL;
  }
}

/**
 * Incremental Salmon Days atmosphere. Only read when `themeId === 'salmonDaysRadio'`.
 * Swamp and other themes ignore this object.
 */
export const SALMON_ENV = {
  /** Far luminous cloth plane (`BackgroundField` + `salmonRebuildBackdrop` tuning). */
  backdrop: true,
  /** Full-sphere vault: soft light pocket + zenith glow; no rectangular ceiling. */
  vault: true,
  /** `SalmonOceanCanopy` mesh — stays off (reads as a hard ceiling / risky plane). */
  canopy: false,
  /** Camera-facing haze quads — can stack-additive white-out; keep off until re-tuned. */
  waterHaze: false,
  /** Point-cloud + midfield instanced layer (shared with Swamp density controls). */
  densityCloudsMidfield: false,
  /** `SalmonShadowFishSilhouettes` — distant clustered silhouettes. */
  distantSilhouettes: true,
  /** Extra hero-tier `SalmonSatelliteSchools`; heavier, enable only when stable. */
  satelliteSchools: false,
  /**
   * `SalmonWhaleSkeleton` — faint GLB below the hero volume; gated to restore ≥13.
   * Kill: `?aqsalmonkill=whaleSkeleton` or `whale` (alias).
   */
  whaleSkeleton: true,
};

/**
 * Bumped whenever we need a one-time localStorage migration (e.g. users
 * stuck on a broken persisted `salmonDaysRadio`). When the stored engine
 * version is behind, we **only sync the version key** and keep the user’s
 * theme — we no longer force Swamp Molly on upgrade (that made Salmon Days
 * appear “broken” after every recovery bump).
 */
export const THEME_ENGINE_VER = 'salmon-recovery-v5';
export const THEME_VER_KEY = 'aquarium-theme-engine-ver';

/** @deprecated Prefer `SALMON_ENV` per-layer flags in Scene.jsx */
export function isSalmonSafeBaseline(themeId) {
  return themeId === 'salmonDaysRadio' && SALMON_SAFE_BASELINE;
}

/**
 * Mutable copy of `SALMON_ENV` so URL debug flags can disable layers without
 * rebuilding. Example: `?aqsalmonkill=vault,backdrop,distantSilhouettes`
 * (comma-separated keys must match fields on `SALMON_ENV`).
 */
export function getSalmonEnv() {
  const env = { ...SALMON_ENV };
  if (typeof window === 'undefined') return env;
  try {
    const raw = new URLSearchParams(window.location.search).get(
      'aqsalmonkill',
    );
    if (!raw) return env;
    const killAliases = { whale: 'whaleSkeleton' };
    for (const key of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const k = killAliases[key] ?? key;
      if (Object.prototype.hasOwnProperty.call(env, k)) {
        env[k] = false;
      }
    }
  } catch {
    /* ignore */
  }
  return env;
}

/**
 * Merge `aqsalmonkill` + optional `?aqsalmonrestore=` progressive gates for Salmon Days.
 * Swamp Molly: returns `getSalmonEnv()` (Scene only consults this for salmon).
 *
 * Reintroduction steps (need N ≥ threshold; omit param = full stack):
 * 5 vault · 6 waterHaze · 7 distantSilhouettes · 9 backdrop · 10 satelliteSchools
 * · 11 densityCloudsMidfield · 12 canopy (only if `SALMON_ENV.canopy` is true)
 * · 13 whaleSkeleton
 *
 * (Steps 1–4, 8, and partial 13 UI are handled in `Scene.jsx`.)
 */
export function buildSalmonEnvForScene(themeId) {
  const base = getSalmonEnv();
  if (themeId !== 'salmonDaysRadio') return base;
  const rs = getSalmonRestoreStep();
  if (rs >= SALMON_RESTORE_FULL) return base;

  /** `aqsalmonkill` forced this layer false while `SALMON_ENV` had it true. */
  const wasKilled = (k) =>
    Object.prototype.hasOwnProperty.call(SALMON_ENV, k) &&
    !!SALMON_ENV[k] &&
    !base[k];

  const gatedOn = (k, step) =>
    SALMON_ENV[k] ? base[k] && rs >= step : !wasKilled(k) && rs >= step;

  return {
    ...base,
    vault: base.vault && rs >= 5,
    backdrop: base.backdrop && rs >= 9,
    waterHaze: gatedOn('waterHaze', 6),
    distantSilhouettes: base.distantSilhouettes && rs >= 7,
    // Canopy defaults false (`SALMON_ENV`) because the ocean-surface sheet reads as a
    // hard horizontal band. Do not use `gatedOn`'s "!wasKilled && rs>=step" path here —
    // that accidentally turned the canopy on at restore step 12.
    canopy: !!SALMON_ENV.canopy && base.canopy && rs >= 12,
    densityCloudsMidfield: gatedOn('densityCloudsMidfield', 11),
    satelliteSchools: gatedOn('satelliteSchools', 10),
    whaleSkeleton: base.whaleSkeleton && rs >= 13,
  };
}
