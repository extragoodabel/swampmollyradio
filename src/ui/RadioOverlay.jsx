import { useEffect, useState } from 'react';
import { useRadio } from '../audio/RadioContext.jsx';

/**
 * Minimal atmospheric radio readout.
 *
 * Visible when:
 *   - audio is playing or loading (shows station + now-playing track)
 *   - audio has been started at least once and is now paused
 *     (shows a faint "tap the beacon to resume" hint)
 *   - there's an error (shows a single discreet line)
 *
 * Hidden entirely before first interaction so the scene starts clean.
 * The overlay is pointer-events: none so it never intercepts the
 * canvas drag-to-turn.
 */
export default function RadioOverlay() {
  const {
    station,
    isPlaying,
    isLoading,
    hasEverPlayed,
    nowPlaying,
    error,
  } = useRadio();

  // Tiny mount delay so the panel can fade in instead of popping in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(id);
  }, []);

  const showActive = isPlaying || isLoading;
  const showPaused = !showActive && hasEverPlayed;
  const showError = !!error && !showActive;
  const visible = mounted && (showActive || showPaused || showError);

  return (
    <div className={`radio-overlay ${visible ? 'radio-overlay--visible' : ''}`}>
      {showActive && (
        <>
          <div className="radio-overlay__state">
            {isLoading ? 'Tuning in' : 'Now playing'}
          </div>
          <div className="radio-overlay__station">{station.name}</div>
          {nowPlaying?.title && (
            <div className="radio-overlay__track">{nowPlaying.title}</div>
          )}
          {!nowPlaying?.title && station.tagline && (
            <div className="radio-overlay__track radio-overlay__track--soft">
              {station.tagline}
            </div>
          )}
        </>
      )}
      {showPaused && !showError && (
        <div className="radio-overlay__hint">
          Paused · tap the beacon to resume
        </div>
      )}
      {showError && (
        <div className="radio-overlay__hint radio-overlay__hint--error">
          {error}
        </div>
      )}
    </div>
  );
}
