import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { Leva } from 'leva';
import Scene from './scene/Scene.jsx';
import { RadioProvider } from './audio/RadioContext.jsx';
import RadioOverlay from './ui/RadioOverlay.jsx';
import ThemeModeControl from './ui/ThemeModeControl.jsx';
import ThemeCrossfade from './ui/ThemeCrossfade.jsx';
import { ThemeProvider, useTheme } from './theme/ThemeContext.jsx';

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
 *       <RadioProvider          -- station id from active theme
 *         <Leva ...>            -- shared debug panel
 *         <Canvas>              -- 3D scene
 *           <Scene />           -- consumes useTheme() internally
 *         </Canvas>
 *         <overlay>             -- per-theme title + hint
 *         <RadioOverlay />      -- per-theme station readout
 *         <ThemeModeControl /> -- in-world atmosphere switch + keys 1/2
 *       </RadioProvider>
 *     </ThemedShell>
 *   </ThemeProvider>
 *
 * RadioProvider is *inside* the theme-aware shell so that when the
 * user toggles modes the station prop updates and the provider can
 * tear down the current stream + queue the new one for the next
 * play() (see RadioContext.jsx -> stationId effect).
 */
export default function App() {
  return (
    <ThemeProvider>
      <ThemedShell />
    </ThemeProvider>
  );
}

function ThemedShell() {
  const { theme } = useTheme();

  // Document title tracks the active mode. The browser tab is the
  // most stable surface for "what am I looking at" -- nice for
  // bookmarks and tab-switchers.
  useEffect(() => {
    document.title = theme.pageTitle;
  }, [theme.pageTitle]);

  return (
    <RadioProvider stationId={theme.radio.stationId}>
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
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 0, 8.5], fov: 55, near: 0.1, far: 80 }}
      >
        <Suspense fallback={null}>
          {/*
            Single Scene mount: theme swaps update fish, typography,
            fog, beam, and radio via context + Leva without remounting
            the camera rig (yaw / scroll depth persist).
          */}
          <Scene />
        </Suspense>
      </Canvas>

      <div className="vignette" />
      <ThemeCrossfade />
      <div className="overlay">
        <div className="overlay__title">{theme.overlayLabel}</div>
        <div className="overlay__hint">{theme.hint}</div>
      </div>
      <RadioOverlay />
      <ThemeModeControl />
    </RadioProvider>
  );
}
