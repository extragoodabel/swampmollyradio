import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leva } from 'leva';
import Scene from './scene/Scene.jsx';
import { RadioProvider } from './audio/RadioContext.jsx';
import RadioOverlay from './ui/RadioOverlay.jsx';
import ThemeModeControl from './ui/ThemeModeControl.jsx';
import ThemeCrossfade from './ui/ThemeCrossfade.jsx';
import { ThemeProvider, useTheme } from './theme/ThemeContext.jsx';
import ThemeSceneErrorBoundary from './theme/ThemeSceneErrorBoundary.jsx';
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
 *     <ThemedShell>             -- reads themeId, wires it down
 *       <RadioProvider          -- theme + default station from theme
 *         <Leva ...>            -- shared debug panel
 *         <Canvas>              -- 3D scene
 *           <CanvasClearToTheme />   -- theme bg + fog if Scene throws
 *           <ThemeSceneErrorBoundary>
 *             <Scene />         -- full engine, or `SceneSalmonEmergency` when debugging
 *           </ThemeSceneErrorBoundary>
 *         </Canvas>
 *         <overlay>             -- per-theme title + hint
 *         <RadioOverlay />      -- per-theme station readout
 *         <ThemeModeControl /> -- portal link to the other aquarium (+ keys 1/2)
 *       </RadioProvider>
 *     </ThemedShell>
 *   </ThemeProvider>
 *
 * RadioProvider is *inside* the theme-aware shell so that when the
 * user toggles modes the provider resets the stream (see
 * RadioContext.jsx -> theme change effect).
 */
export default function App() {
  return (
    <ThemeProvider>
      <ThemedShell />
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
      <Leva
        collapsed
        titleBar={{ title: 'Aquarium controls', drag: true }}
        theme={{
          colors: {
            accent1: '#7cc3e8',
            accent2: '#5fa3c8',
            highlight1: '#a8c8d8',
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
              <code>?aqignorestorage=1</code>. Salmon kills:{' '}
              <code>?aqsalmonkill=vault,backdrop,…</code>. Logs:{' '}
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
