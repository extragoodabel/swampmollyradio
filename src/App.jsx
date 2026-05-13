import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { Leva } from 'leva';
import Scene from './scene/Scene.jsx';
import { RadioProvider } from './audio/RadioContext.jsx';
import RadioOverlay from './ui/RadioOverlay.jsx';
import ThemeModeControl from './ui/ThemeModeControl.jsx';
import ThemeCrossfade from './ui/ThemeCrossfade.jsx';
import { ThemeProvider, useTheme } from './theme/ThemeContext.jsx';
import ThemeSceneErrorBoundary from './theme/ThemeSceneErrorBoundary.jsx';
import { WorldTransitionProvider } from './ui/WorldTransitionContext.jsx';
import { THEME_VER_KEY } from './theme/salmonRecovery.js';
import {
  AQ_DEBUG,
  AQ_SALMON_EMERGENCY,
  AQ_THEME_DEBUG,
  AQ_THEME_SWITCH_LOG,
} from './debug/aquariumRecovery.js';
import CanvasClearToTheme from './scene/CanvasClearToTheme.jsx';
import SceneSalmonEmergency from './scene/SceneSalmonEmergency.jsx';

/**
 * Top-level shell.
 *
 * The aquarium is a single engine running in two identities (themes):
 * Swamp Molly Radio (default) and Salmon Days Radio. The active theme decides
 * the fish sprite, floating-letter text, radio station, water palette,
 * kelp moss ratio, page title and overlay label; everything else
 * (movement, scatter, bubbles, camera, etc.) is shared between modes.
 *
 * Component tree:
 *
 *   <ThemeProvider>             -- holds active themeId + setter
 *     <WorldTransitionProvider> -- murk reveal + wraps mode switches
 *       <ThemedShell>             -- reads themeId, wires it down
 *         <RadioProvider          -- theme + default station from theme
 *           ...
 *         </RadioProvider>
 *       </ThemedShell>
 *     </WorldTransitionProvider>
 *   </ThemeProvider>
 *
 * RadioProvider follows the active theme for default station metadata.
 * Playback and dial position persist across aquarium mode switches once
 * the listener has started playback at least once (see RadioContext.jsx).
 */
export default function App() {
  return (
    <ThemeProvider>
      <WorldTransitionProvider>
        <ThemedShell />
      </WorldTransitionProvider>
    </ThemeProvider>
  );
}

/** R3F subtree: themed clear color lives outside the scene error boundary. */
function AquariumCanvasTree({ sceneGeneration, onSceneFatal }) {
  const { themeId } = useTheme();
  return (
    <>
      <CanvasClearToTheme />
      <ThemeSceneErrorBoundary key={sceneGeneration} onRecover={onSceneFatal}>
        {AQ_SALMON_EMERGENCY && themeId === 'salmonDaysRadio' ? (
          <SceneSalmonEmergency />
        ) : (
          <Scene />
        )}
      </ThemeSceneErrorBoundary>
    </>
  );
}

function ThemedShell() {
  const { theme, themeId } = useTheme();
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const sceneFailureAttemptsRef = useRef(0);
  const [sceneCrashReport, setSceneCrashReport] = useState(null);
  /** Discreet tuning panel (Leva): both desktop + mobile default to closed. */
  const [levaOpen, setLevaOpen] = useState(false);
  const levaToggleRef = useRef(null);
  const [levaTitlePos, setLevaTitlePos] = useState({ x: 0, y: 54 });

  const syncLevaPanelDock = useCallback(() => {
    if (typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const panelW = Math.min(292, vw - 20);
    /** Matches Leva `StyledRoot` when `fill` is false: `top` / `right` on the panel root. */
    const levaDefaultTop = 10;
    const levaDefaultRightInset = 10;
    const gapBelowToggle = 8;
    const minLeftEdge = 10;

    const el = levaToggleRef.current;
    if (!el) {
      setLevaTitlePos({ x: 0, y: 64 - levaDefaultTop });
      return;
    }
    const rect = el.getBoundingClientRect();
    /** Horizontal: `titleBar.position` is applied as `translate3d(x,y,0)` on top of fixed `right: 10px`. */
    let x = Math.round(rect.right - (vw - levaDefaultRightInset));
    const y = Math.round(rect.bottom + gapBelowToggle - levaDefaultTop);

    const leftEdge =
      vw - levaDefaultRightInset - panelW + x;
    if (leftEdge < minLeftEdge) {
      x += Math.round(minLeftEdge - leftEdge);
    }

    setLevaTitlePos({ x, y });
  }, []);

  useLayoutEffect(() => {
    syncLevaPanelDock();
  }, [syncLevaPanelDock, levaOpen]);

  useEffect(() => {
    syncLevaPanelDock();
    window.addEventListener('resize', syncLevaPanelDock);
    return () => window.removeEventListener('resize', syncLevaPanelDock);
  }, [syncLevaPanelDock]);

  useEffect(() => {
    sceneFailureAttemptsRef.current = 0;
    setSceneCrashReport(null);
    if (AQ_THEME_DEBUG || AQ_THEME_SWITCH_LOG) {
      console.info('[theme-switch] activeTheme changed — reset scene error counter', {
        activeTheme: themeId,
      });
    }
  }, [themeId]);

  const handleSceneFatal = useCallback(
    (err, info) => {
      let lsBefore = null;
      let lsEngine = null;
      try {
        lsBefore = window.localStorage.getItem('aquarium-theme');
        lsEngine = window.localStorage.getItem(THEME_VER_KEY);
      } catch {
        /* ignore */
      }

      const attempt = sceneFailureAttemptsRef.current + 1;
      sceneFailureAttemptsRef.current = attempt;

      let mountPhase = 'n/a';
      try {
        mountPhase = window.__AQ_SCENE_MOUNT_PHASE ?? 'n/a';
      } catch {
        /* ignore */
      }

      console.error('[theme-switch] ThemeSceneErrorBoundary / scene failure', {
        attempt,
        activeTheme: themeId,
        localStorageTheme: lsBefore,
        engineVer: lsEngine,
        message: err?.message,
        stack: err?.stack,
        componentStack: info?.componentStack,
        sceneMountPhase: mountPhase,
      });

      if (attempt === 1) {
        if (AQ_THEME_DEBUG || AQ_THEME_SWITCH_LOG) {
          console.info(
            '[theme-switch] soft recover: remount scene subtree (theme unchanged)',
            { activeTheme: themeId },
          );
        }
        setSceneGeneration((g) => g + 1);
        return;
      }

      setSceneCrashReport({
        attempt,
        themeId,
        message: err?.message ?? String(err),
        stack: err?.stack ?? '',
        componentStack: info?.componentStack ?? '',
        sceneMountPhase: mountPhase,
        localStorageTheme: lsBefore,
        engineVer: lsEngine,
        at: Date.now(),
      });
    },
    [themeId],
  );

  const retrySceneMount = useCallback(() => {
    sceneFailureAttemptsRef.current = 0;
    setSceneCrashReport(null);
    setSceneGeneration((g) => g + 1);
  }, []);

  // Document title tracks the active mode. The browser tab is the
  // most stable surface for "what am I looking at" -- nice for
  // bookmarks and tab-switchers.
  useEffect(() => {
    document.title = theme.pageTitle;
  }, [theme.pageTitle]);

  return (
    <RadioProvider
      themeId={themeId}
      themeDefaultStationId={theme.radio.stationId}
    >
      <Canvas
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            zIndex: 0,
            touchAction: 'none',
            overscrollBehavior: 'none',
          }}
          dpr={[1, 1.75]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          // `far` must exceed the largest world radii (ocean vault sphere,
          // distant background planes, sunken car) or the frustum clips
          // almost everything and the canvas reads as blank.
          camera={{ position: [0, 0, 8.5], fov: 55, near: 0.05, far: 12000 }}
          onCreated={() => {
            if (AQ_DEBUG) console.info('[aquarium] R3F Canvas onCreated');
          }}
        >
          {/*
          Do not wrap `<Scene />` in `<Suspense>`. Async work (textures,
          troika fonts) is isolated in inner boundaries. A top-level
          fallback would omit `CameraRig` and brick drag / navigation.
        */}
          <AquariumCanvasTree
            sceneGeneration={sceneGeneration}
            onSceneFatal={handleSceneFatal}
          />
        </Canvas>
      <button
        ref={levaToggleRef}
        type="button"
        className="aquarium-leva-toggle"
        onClick={() => setLevaOpen((v) => !v)}
        aria-expanded={levaOpen}
        aria-label={
          levaOpen ? 'Hide tuning controls' : 'Open tuning controls'
        }
      >
        <span className="aquarium-leva-toggle__glyph" aria-hidden>
          {levaOpen ? '×' : '≋'}
        </span>
      </button>
      <Leva
        hidden={!levaOpen}
        /** LevaCore hides the root with `display:none` until store paths exist unless this is set. */
        neverHide
        flat
        hideCopyButton
        collapsed={false}
        oneLineLabels={false}
        titleBar={{
          title: 'Tuning',
          drag: true,
          filter: true,
          position: levaTitlePos,
        }}
        theme={{
          colors: {
            elevation1: 'rgba(4, 14, 26, 0.9)',
            elevation2: 'rgba(8, 24, 40, 0.92)',
            elevation3: 'rgba(12, 32, 50, 0.95)',
            accent1: '#7ec8ec',
            accent2: '#5fa3c8',
            accent3: '#4a88b0',
            highlight1: '#aacfe2',
            highlight2: '#8ab8d4',
            highlight3: '#6a9cb8',
            vivid1: '#9fd4ff',
            folderWidgetColor: 'rgba(120, 185, 220, 0.42)',
            folderTextColor: 'rgba(195, 228, 245, 0.78)',
            toolTipBackground: 'rgba(5, 16, 28, 0.96)',
            toolTipText: 'rgba(230, 245, 255, 0.92)',
          },
          radii: {
            xs: '3px',
            sm: '8px',
            lg: '11px',
          },
          space: {
            xs: '2px',
            sm: '4px',
            md: '6px',
            rowGap: '4px',
            colGap: '6px',
          },
          fontSizes: {
            root: '10px',
            toolTip: '10px',
          },
          sizes: {
            rootWidth: 'min(292px, calc(100vw - 20px))',
            titleBarHeight: '26px',
            rowHeight: '22px',
            controlWidth: 'min(132px, 42vw)',
            numberInputMinWidth: '36px',
            scrubberWidth: '56px',
            scrubberHeight: '10px',
          },
          shadows: {
            level1: '0 2px 14px rgba(0, 0, 0, 0.28)',
            level2: '0 4px 22px rgba(0, 0, 0, 0.38)',
          },
          borderWidths: {
            root: '1px',
            input: '1px',
            focus: '1px',
            hover: '1px',
            active: '1px',
            folder: '1px',
          },
        }}
      />

      {AQ_SALMON_EMERGENCY && themeId === 'salmonDaysRadio' && (
        <div className="salmon-emergency-banner" role="status">
          Emergency Salmon Days baseline — procedural fish only. Remove{' '}
          <code>?aqsalmonemergency=1</code> to restore full scene.
        </div>
      )}
      <div className="vignette" />
      <ThemeCrossfade />
      <div className="overlay">
        <div className="overlay__title">{theme.overlayLabel}</div>
        <div className="overlay__bottom">
          <ThemeModeControl />
          <div className="overlay__hint">{theme.hint}</div>
        </div>
      </div>
      <RadioOverlay />
      {sceneCrashReport && (
        <div
          className="scene-crash-overlay"
          role="alert"
          aria-live="assertive"
        >
          <div className="scene-crash-overlay__panel">
            <h2 className="scene-crash-overlay__title">Scene could not render</h2>
            <p className="scene-crash-overlay__meta">
              Active theme stays <strong>{sceneCrashReport.themeId}</strong>.
              localStorage <code>aquarium-theme</code>:{' '}
              <code>{sceneCrashReport.localStorageTheme ?? '—'}</code>
              <br />
              Engine key: <code>{sceneCrashReport.engineVer ?? '—'}</code>
              <br />
              Last scene phase:{' '}
              <code>{sceneCrashReport.sceneMountPhase ?? '—'}</code>
            </p>
            <pre className="scene-crash-overlay__err">
              {sceneCrashReport.message}
              {'\n\n'}
              {sceneCrashReport.stack}
            </pre>
            <pre className="scene-crash-overlay__stack">
              {sceneCrashReport.componentStack || '(no component stack)'}
            </pre>
            <p className="scene-crash-overlay__hint">
              Debug: <code>?aqsalmonemergency=1</code>,{' '}
              <code>?aqsalmonrestore=1..13</code> (Salmon),{' '}
              <code>?aqswamprestore=1..13</code> (Swamp),{' '}
              <code>?aqswampkill=car1,haze,…</code>,{' '}
              <code>?aquariumtheme=…</code>, <code>?aqclearsaved=1</code>,{' '}
              <code>?aqignorestorage=1</code>, <code>?aqnotransition=1</code>. Salmon kills:{' '}
              <code>?aqsalmonkill=vault,backdrop,whaleSkeleton,whale,…</code>,{' '}
              <code>?aqwhaledebug=1</code>. Logs:{' '}
              <code>?aqthemeswitchlog=1</code>.
            </p>
            <button
              type="button"
              className="scene-crash-overlay__retry"
              onClick={retrySceneMount}
            >
              Remount scene
            </button>
          </div>
        </div>
      )}
    </RadioProvider>
  );
}
