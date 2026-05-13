import { useEffect, useState } from 'react';
import { useRadio } from '../audio/RadioContext.jsx';

/**
 * Minimal atmospheric radio readout.
 *
 * Visible when:
 *   - audio is playing or loading (shows station + now-playing track)
 *   - audio has been started at least once and is now paused
 *     (shows a discreet paused state)
 *   - there's an error (shows a single discreet line)
 *
 * Hidden entirely before first interaction so the scene starts clean.
 * The overlay shell is pointer-events: none; prev/next glyphs opt in
 * to pointer events so they don't steal canvas drags elsewhere.
 */
export default function RadioOverlay() {
  const {
    station,
    activeStationIndex,
    dialStationCount,
    isPlaying,
    isLoading,
    hasEverPlayed,
    nowPlaying,
    error,
    nextStation,
    previousStation,
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
  const showStationNav =
    mounted && !showError && dialStationCount > 0 && (showActive || showPaused);

  const stationBlock = (
    <>
      <div className="radio-overlay__brand">SomaFM</div>
      <div className="radio-overlay__station">{station.name}</div>
      <div className="radio-overlay__dial">
        {activeStationIndex + 1} / {dialStationCount}
      </div>
    </>
  );

  return (
    <div className={`radio-overlay ${visible ? 'radio-overlay--visible' : ''}`}>
      {showActive && (
        <>
          <div className="radio-overlay__state">
            {isLoading ? 'Tuning in' : 'Now playing'}
          </div>
          {showStationNav ? (
            <div className="radio-overlay__stationRow">
              <button
                type="button"
                className="radio-overlay__navGlyph"
                aria-label="Previous station"
                onClick={() => previousStation()}
              >
                &lt;
              </button>
              <div className="radio-overlay__stationCol">{stationBlock}</div>
              <button
                type="button"
                className="radio-overlay__navGlyph"
                aria-label="Next station"
                onClick={() => nextStation()}
              >
                &gt;
              </button>
            </div>
          ) : (
            <div className="radio-overlay__stationCol">{stationBlock}</div>
          )}
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
        <>
          {showStationNav ? (
            <div className="radio-overlay__stationRow">
              <button
                type="button"
                className="radio-overlay__navGlyph"
                aria-label="Previous station"
                onClick={() => previousStation()}
              >
                &lt;
              </button>
              <div className="radio-overlay__stationCol">{stationBlock}</div>
              <button
                type="button"
                className="radio-overlay__navGlyph"
                aria-label="Next station"
                onClick={() => nextStation()}
              >
                &gt;
              </button>
            </div>
          ) : (
            <div className="radio-overlay__stationCol">{stationBlock}</div>
          )}
        </>
      )}
      {showPaused && !showError && (
        <div className="radio-overlay__hint">Paused</div>
      )}
      {showError && (
        <div className="radio-overlay__hint radio-overlay__hint--error">
          {error}
        </div>
      )}
    </div>
  );
}
