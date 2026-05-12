import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME_ID, getTheme, otherThemeId, THEME_IDS } from './themes.js';

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
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_THEME_ID;
    if (stored === 'credits') return 'salmonDaysRadio';
    if (THEME_IDS.includes(stored)) return stored;
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
    } catch {
      /* ignore */
    }
  }, [themeId]);

  const setTheme = useCallback((next) => {
    if (!THEME_IDS.includes(next)) return;
    setThemeIdState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeIdState((current) => otherThemeId(current));
  }, []);

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
