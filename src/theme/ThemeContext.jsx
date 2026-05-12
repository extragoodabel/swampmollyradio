import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME_ID, getTheme, otherThemeId, THEME_IDS } from './themes.js';
import { THEME_ENGINE_VER, THEME_VER_KEY } from './salmonRecovery.js';
import {
  AQ_IGNORE_THEME_STORAGE,
  AQ_THEME_DEBUG,
  AQ_THEME_SWITCH_LOG,
  readUrlAquariumThemeId,
} from '../debug/aquariumRecovery.js';

/**
 * Active-mode context.
 *
 * Persists the user's selection to localStorage so the toggle is
 * sticky across reloads. The default on first visit is `swamp`
 * (Swamp Molly Radio), per the product brief.
 *
 * Exposes:
 *   - `themeId`   currently active theme id
 *   - `theme`     the theme config object (see themes.js)
 *   - `setTheme`  switch to a given theme id (validated)
 *   - `toggle`    flip between swamp <-> Salmon Days Radio
 *   - `nextThemeId` convenience for "the other" theme id
 */

const STORAGE_KEY = 'aquarium-theme';

const ThemeCtx = createContext(null);

function readInitialThemeId() {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const urlTheme = readUrlAquariumThemeId();
    if (urlTheme) {
      if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
        console.info('[theme-switch] hydrate: aquariumtheme URL wins', {
          theme: urlTheme,
        });
      }
      return urlTheme;
    }

    if (AQ_IGNORE_THEME_STORAGE) {
      if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
        console.info('[theme-switch] hydrate: aqignorestorage — fresh default', {
          theme: DEFAULT_THEME_ID,
        });
      }
      return DEFAULT_THEME_ID;
    }

    const ver = window.localStorage.getItem(THEME_VER_KEY);
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      if (ver !== THEME_ENGINE_VER) {
        window.localStorage.setItem(THEME_VER_KEY, THEME_ENGINE_VER);
      }
      return DEFAULT_THEME_ID;
    }

    const LEGACY_SALMON_IDS = new Set(['credits', 'salmonDays', 'salmon']);
    if (LEGACY_SALMON_IDS.has(stored)) {
      try {
        window.localStorage.setItem(STORAGE_KEY, 'salmonDaysRadio');
        if (ver !== THEME_ENGINE_VER) {
          window.localStorage.setItem(THEME_VER_KEY, THEME_ENGINE_VER);
        }
        if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
          console.info('[theme-switch] hydrate: migrated legacy id → salmonDaysRadio', {
            was: stored,
          });
        }
      } catch {
        /* ignore */
      }
      return 'salmonDaysRadio';
    }

    if (!THEME_IDS.includes(stored)) {
      if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
        console.warn('[theme-switch] hydrate: unknown stored theme, using default', {
          stored,
          allowed: THEME_IDS,
        });
      }
      return DEFAULT_THEME_ID;
    }

    // Salmon + older engine version: sync the version key only — keep the
    // user on Salmon Days (forcing Swamp on every recovery bump looked like a
    // broken toggle / persistence bug).
    if (stored === 'salmonDaysRadio' && ver !== THEME_ENGINE_VER) {
      window.localStorage.setItem(THEME_VER_KEY, THEME_ENGINE_VER);
      if (AQ_THEME_DEBUG) {
        console.info('[theme] hydrate: salmon + stale engine ver — synced key, keeping salmon', {
          stored,
          verWas: ver,
          verNow: THEME_ENGINE_VER,
        });
      }
      return stored;
    }

    if (ver !== THEME_ENGINE_VER) {
      window.localStorage.setItem(THEME_VER_KEY, THEME_ENGINE_VER);
    }

    return stored;
  } catch {
    /* localStorage may be blocked (private mode etc.) -- silently fall back */
  }
  return DEFAULT_THEME_ID;
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(readInitialThemeId);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId);
      if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
        console.info('[theme-switch] persisted activeTheme to localStorage', {
          activeTheme: themeId,
          key: STORAGE_KEY,
          value: window.localStorage.getItem(STORAGE_KEY),
          engineVer: window.localStorage.getItem(THEME_VER_KEY),
        });
      }
    } catch {
      /* ignore */
    }
  }, [themeId]);

  const setTheme = useCallback((next) => {
    let storageBefore = null;
    let engineVerBefore = null;
    try {
      storageBefore = window.localStorage.getItem(STORAGE_KEY);
      engineVerBefore = window.localStorage.getItem(THEME_VER_KEY);
    } catch {
      /* ignore */
    }
    if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
      console.info('[theme-switch] setTheme', {
        requested: next,
        activeBefore: themeId,
        valid: THEME_IDS.includes(next),
        allowedIds: THEME_IDS,
        localStorageTheme: storageBefore,
        engineVer: engineVerBefore,
      });
    }
    if (!THEME_IDS.includes(next)) {
      console.warn('[theme-switch] setTheme rejected — not a valid theme id', {
        requested: next,
        allowedIds: THEME_IDS,
      });
      return;
    }
    setThemeIdState(next);
    queueMicrotask(() => {
      try {
        if (AQ_THEME_SWITCH_LOG || AQ_THEME_DEBUG) {
          console.info('[theme-switch] setTheme applied (microtask)', {
            requested: next,
            localStorageTheme: window.localStorage.getItem(STORAGE_KEY),
          });
        }
      } catch {
        /* ignore */
      }
    });
  }, [themeId]);

  const toggle = useCallback(() => {
    if (AQ_THEME_DEBUG) {
      try {
        console.info('[theme] toggle()', {
          from: themeId,
          to: otherThemeId(themeId),
        });
      } catch {
        /* ignore */
      }
    }
    setThemeIdState((current) => otherThemeId(current));
  }, [themeId]);

  const value = useMemo(
    () => ({
      themeId,
      theme: getTheme(themeId),
      setTheme,
      toggle,
      nextThemeId: otherThemeId(themeId),
    }),
    [themeId, setTheme, toggle],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return ctx;
}
