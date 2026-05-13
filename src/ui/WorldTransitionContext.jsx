import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { THEME_IDS } from '../theme/themes.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import { AQ_NO_TRANSITION } from '../debug/aquariumRecovery.js';

const WorldTransitionCtx = createContext(null);

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Full-screen murk / detritus (pointer-events none). Strength 0–1 scales visibility.
 */
function WorldAtmosphereOverlay({ strength }) {
  const { themeId, theme } = useTheme();
  if (strength < 0.003) return null;

  const bg = theme.water?.backgroundColor ?? '#04101a';
  const swamp = themeId === 'swamp';

  const body = swamp
    ? `radial-gradient(ellipse 85% 68% at 50% 40%, rgba(72, 88, 52, 0.5) 0%, rgba(28, 38, 22, 0.86) 55%, rgba(12, 18, 10, 0.93) 100%)`
    : `radial-gradient(ellipse 82% 62% at 50% 38%, rgba(36, 72, 108, 0.52) 0%, rgba(10, 28, 48, 0.9) 54%, rgba(4, 14, 28, 0.95) 100%)`;

  const depth = swamp
    ? `linear-gradient(180deg, rgba(20, 32, 18, 0.75) 0%, rgba(14, 22, 12, 0.35) 42%, rgba(10, 16, 9, 0.82) 100%)`
    : `linear-gradient(180deg, rgba(6, 18, 32, 0.82) 0%, rgba(8, 22, 38, 0.4) 45%, rgba(4, 12, 24, 0.88) 100%)`;

  const grit = `repeating-linear-gradient(
    118deg,
    transparent 0px,
    transparent 4px,
    rgba(255, 255, 255, 0.025) 4px,
    rgba(255, 255, 255, 0.025) 5px
  )`;

  const vignette = `radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 36%, rgba(0, 0, 0, 0.78) 100%)`;

  return (
    <div
      className="world-atmosphere"
      style={{
        opacity: strength,
        backgroundColor: bg,
        backgroundImage: `${grit}, ${body}, ${depth}, ${vignette}`,
      }}
      aria-hidden
    />
  );
}

export function WorldTransitionProvider({ children }) {
  const { themeId, setTheme } = useTheme();
  const [murk, setMurk] = useState(() => (AQ_NO_TRANSITION ? 0 : 1));
  const murkRef = useRef(murk);
  murkRef.current = murk;

  const rafRef = useRef(null);
  const transitionLockRef = useRef(false);

  const cancelMurkAnim = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const animateMurkTo = useCallback(
    (target, durationMs) => {
      cancelMurkAnim();
      return new Promise((resolve) => {
        const from = murkRef.current;
        if (durationMs <= 0 || Math.abs(from - target) < 0.001) {
          setMurk(target);
          resolve();
          return;
        }
        const start = performance.now();
        const tick = (now) => {
          const u = Math.min(1, (now - start) / durationMs);
          const eased = smoothstep(u);
          const v = from + (target - from) * eased;
          setMurk(v);
          if (u < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            rafRef.current = null;
            setMurk(target);
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    },
    [cancelMurkAnim],
  );

  useEffect(() => () => cancelMurkAnim(), [cancelMurkAnim]);

  useEffect(() => {
    if (AQ_NO_TRANSITION) return;
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (!alive) return;
      animateMurkTo(0, 2600);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
      cancelMurkAnim();
    };
  }, [animateMurkTo, cancelMurkAnim]);

  const switchTheme = useCallback(
    async (nextId) => {
      if (!THEME_IDS.includes(nextId) || nextId === themeId) return;
      if (transitionLockRef.current) return;
      if (AQ_NO_TRANSITION) {
        setTheme(nextId);
        return;
      }
      transitionLockRef.current = true;
      try {
        await animateMurkTo(1, 420);
        setTheme(nextId);
        await new Promise((r) => {
          window.setTimeout(r, 48);
        });
        await animateMurkTo(0, 1150);
      } finally {
        transitionLockRef.current = false;
      }
    },
    [animateMurkTo, setTheme, themeId],
  );

  /**
   * Same murk in → action → murk out as theme switch (e.g. camera reset).
   */
  const withMurkTransition = useCallback(
    async (fn) => {
      if (typeof fn !== 'function') return;
      if (AQ_NO_TRANSITION) {
        await fn();
        return;
      }
      if (transitionLockRef.current) {
        await fn();
        return;
      }
      transitionLockRef.current = true;
      try {
        await animateMurkTo(1, 420);
        await fn();
        await new Promise((r) => {
          window.setTimeout(r, 48);
        });
        await animateMurkTo(0, 1150);
      } finally {
        transitionLockRef.current = false;
      }
    },
    [animateMurkTo],
  );

  const value = useMemo(
    () => ({ switchTheme, withMurkTransition }),
    [switchTheme, withMurkTransition],
  );

  return (
    <WorldTransitionCtx.Provider value={value}>
      {children}
      <WorldAtmosphereOverlay strength={murk} />
    </WorldTransitionCtx.Provider>
  );
}

export function useAquariumWorldTransition() {
  const ctx = useContext(WorldTransitionCtx);
  if (!ctx) {
    throw new Error(
      'useAquariumWorldTransition must be used inside <WorldTransitionProvider>',
    );
  }
  return ctx;
}
