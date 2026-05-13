/**
 * URL / env toggles for emergency stabilization (no artistic tuning).
 *
 * - `?aqrecover=1` — lighter atmosphere / stabilization only (typography + beacon stay on)
 * - `?aqdebug=1` — on-screen engine HUD (frame tick, camera, deltas); not on by DEV alone
 * - `?noletters=1` — skip FloatingLetters only (beacon falls back to standalone orb)
 * - `VITE_AQ_SKIP_TYPOGRAPHY=1` — build-time: never mount troika text
 * - `?aqtypetest=1` — huge TEST TYPOGRAPHY plane in front of camera (proves canvas mesh path)
 * - `?aqtypodebug=1` — console logs for typography mount / layout
 * - `?aqsceneminimal=1` — skip companion schools, sunken GLBs, salmon shadow silhouettes
 * - `?aqthemeswitchlog=1` — log theme clicks + localStorage (production-friendly)
 * - `?aqsalmonkill=vault,backdrop,...` — disable Salmon Days layers (see salmonRecovery.js)
 * - `?aqsalmonemergency=1` — Salmon Days only: minimal scene (CameraRig + 10 procedural fish; no Leva stack)
 * - `?aquariumtheme=swamp|salmonDaysRadio` — first-paint theme; aliases: swampMollyRadio→swamp; legacy `salmon` / `salmondays`→salmonDaysRadio (warns)
 * - `?aqignorestorage=1` — skip reading `aquarium-theme` from localStorage on first load (URL/default only)
 * - `?aqclearsaved=1` — before React mounts: drop `aquarium-theme`, engine ver key, and Leva localStorage keys
 * - `?aqsalmonrestore=1..13` — Salmon Days only: gate visual subsystems (see salmonRecovery `buildSalmonEnvForScene` + Scene). Omit = full stack.
 * - `?aqswamprestore=1..13` — Swamp Molly only: cumulative layers (see `theme/swampRecovery.js` + Scene). Omit = full stack.
 * - `?aqswampkill=car1,car2,headlights,haze,typography,...` — force Swamp layers off (aliases in `swampRecovery.js`).
 * - `?aqorbdebug=1` — orb/beacon mount + tap diagnostics (console).
 * - `?aqcardebug=1` — Swamp submerged cars: distance + headlight anchor logs; optional marker dots.
 * - `?aqcompaniondebug=1` — companion schools: mount diagnostics + slightly boosted visibility.
 * - `?aqtouchdebug=1` — CameraRig: touch pinch/pan / rotate gesture diagnostics (console).
 */

import { THEME_VER_KEY } from '../theme/salmonRecovery.js';
import { THEME_IDS } from '../theme/themes.js';

const params =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

export const AQ_DEBUG =
  import.meta.env.DEV ||
  import.meta.env.VITE_AQ_DEBUG === '1' ||
  params.has('aqdebug');

/** Fixed DOM engine HUD (`AquariumEngineDebug`) — explicit only; never implied by DEV. */
export const AQ_ENGINE_HUD =
  import.meta.env.VITE_AQ_DEBUG === '1' || params.has('aqdebug');

export const AQ_RECOVER =
  import.meta.env.VITE_AQ_RECOVER === '1' || params.has('aqrecover');

/** Typography off only when explicitly requested — not tied to `aqrecover`. */
export const AQ_SKIP_TYPOGRAPHY =
  import.meta.env.VITE_AQ_SKIP_TYPOGRAPHY === '1' ||
  params.has('noletters');

export const AQ_LITE_ATMOSPHERE =
  import.meta.env.VITE_AQ_LITE === '1' || AQ_RECOVER || params.has('aqlite');

/** Bright diagnostic banner (`TypoEmergencyTest`). */
export const AQ_TYPO_TEST =
  params.has('aqtypetest') || import.meta.env.VITE_AQ_TYPO_TEST === '1';

/** Opt in to Troika/async font path; default is non-suspending canvas typography. */
export const AQ_TYPO_TROIKA =
  params.has('troikaletters') || import.meta.env.VITE_AQ_TYPO_TROIKA === '1';

export const AQ_TYPO_DEBUG_LOG =
  params.has('aqtypodebug') || import.meta.env.VITE_AQ_TYPO_DEBUG === '1';

/** Theme persistence / toggle tracing (`?aqthemedebug=1` or VITE_AQ_THEME_DEBUG=1). */
export const AQ_THEME_DEBUG =
  import.meta.env.DEV ||
  import.meta.env.VITE_AQ_THEME_DEBUG === '1' ||
  params.has('aqthemedebug');

/**
 * Emergency: drop recent optional scene layers (`?aqsceneminimal=1`).
 * Skips ambient companion schools, sunken GLB cars, salmon shadow silhouettes.
 */
export const AQ_SCENE_MINIMAL =
  params.has('aqsceneminimal') ||
  import.meta.env.VITE_AQ_SCENE_MINIMAL === '1';

/** Orb / beacon: mount + click logging (`?aqorbdebug=1`). */
export const AQ_ORB_DEBUG =
  params.has('aqorbdebug') ||
  import.meta.env.VITE_AQ_ORB_DEBUG === '1';

/** Swamp sunken cars: console + optional headlight helper dots (`?aqcardebug=1`). */
export const AQ_CAR_DEBUG =
  params.has('aqcardebug') ||
  import.meta.env.VITE_AQ_CAR_DEBUG === '1';

/** Ambient companion schools: logging + temporary visibility boost (`?aqcompaniondebug=1`). */
export const AQ_COMPANION_DEBUG =
  params.has('aqcompaniondebug') ||
  import.meta.env.VITE_AQ_COMPANION_DEBUG === '1';

/** Mobile / touch: pinch-to-drift + gesture mode logging (`?aqtouchdebug=1`). */
export const AQ_TOUCH_DEBUG =
  params.has('aqtouchdebug') ||
  import.meta.env.VITE_AQ_TOUCH_DEBUG === '1';

/**
 * Verbose theme click / persistence logging (also enabled whenever AQ_THEME_DEBUG is on).
 * `?aqthemeswitchlog=1` forces logs in production builds.
 */
export const AQ_THEME_SWITCH_LOG =
  AQ_THEME_DEBUG ||
  import.meta.env.VITE_AQ_THEME_SWITCH_LOG === '1' ||
  params.has('aqthemeswitchlog');

/**
 * Debug: Salmon Days loads `SceneSalmonEmergency` instead of full `Scene` (no heavy layers, no Leva).
 */
export const AQ_SALMON_EMERGENCY =
  params.has('aqsalmonemergency') ||
  import.meta.env.VITE_AQ_SALMON_EMERGENCY === '1';

/** Skip localStorage theme read on hydrate — use `?aquariumtheme=` or default Swamp only. */
export const AQ_IGNORE_THEME_STORAGE =
  params.has('aqignorestorage') ||
  import.meta.env.VITE_AQ_IGNORE_THEME_STORAGE === '1';

/**
 * Call from `main.jsx` before `createRoot` so purged keys do not replay into the first render.
 */
export function clearAquariumDebugStorageIfRequested() {
  if (typeof window === 'undefined') return;
  const want =
    params.has('aqclearsaved') ||
    import.meta.env.VITE_AQ_CLEAR_SAVED === '1';
  if (!want) return;
  try {
    const drop = new Set(['aquarium-theme', THEME_VER_KEY]);
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (drop.has(k) || k.toLowerCase().includes('leva')) {
        window.localStorage.removeItem(k);
      }
    }
    console.warn(
      '[aquarium] aqclearsaved: removed theme, engine ver, and Leva-related localStorage keys',
    );
  } catch (e) {
    console.warn('[aquarium] aqclearsaved failed', e);
  }
}

/** Validated / aliased URL theme id for ThemeContext (`aquariumtheme` query). */
export function readUrlAquariumThemeId() {
  try {
    const raw = params.get('aquariumtheme');
    if (!raw) return null;
    const normalized = String(raw).trim();
    if (THEME_IDS.includes(normalized)) return normalized;

    const lower = normalized.toLowerCase();
    if (lower === 'swampmollyradio' || lower === 'swampmolly') {
      console.info('[theme-switch] aquariumtheme alias resolved → swamp', {
        parsed: normalized,
      });
      return 'swamp';
    }
    if (lower === 'salmon' || lower === 'salmondays') {
      console.warn(
        '[theme-switch] aquariumtheme legacy/invalid value — resolving to salmonDaysRadio (use aquariumtheme=salmonDaysRadio)',
        { parsed: normalized },
      );
      return 'salmonDaysRadio';
    }

    console.warn('[theme-switch] aquariumtheme not recognized — ignoring', {
      parsed: normalized,
      allowed: THEME_IDS,
    });
    return null;
  } catch {
    return null;
  }
}
