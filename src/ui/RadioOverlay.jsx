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

  const navPrev = (
    <button
      type="button"
      className="radio-overlay__navGlyph"
      aria-label="Previous station"
      onClick={() => previousStation()}
    >
      &lt;
    </button>
  );

  const navNext = (
    <button
      type="button"
      className="radio-overlay__navGlyph"
      aria-label="Next station"
      onClick={() => nextStation()}
    >
      &gt;
    </button>
  );

  const stationLine = (
    <div className="radio-overlay__station">{station.name}</div>
  );

  const tuneRow =
    showStationNav ? (
      <div className="radio-overlay__tuneRow">
        {navPrev}
        {stationLine}
        {navNext}
      </div>
    ) : (
      <div className="radio-overlay__tuneRow radio-overlay__tuneRow--solo">
        {stationLine}
      </div>
    );

  return (
    <div className={`radio-overlay ${visible ? 'radio-overlay--visible' : ''}`}>
      {showActive && (
        <>
          <div className="radio-overlay__meta">
            {isLoading ? 'tuning in - somafm' : 'now playing - somafm'}
          </div>
          {tuneRow}
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
          <div className="radio-overlay__meta">paused - somafm</div>
          {tuneRow}
          <div className="radio-overlay__track radio-overlay__track--soft">
            Paused
          </div>
        </>
      )}
      {showError && (
        <div className="radio-overlay__hint radio-overlay__hint--error">
          {error}
        </div>
      )}
    </div>
  );
}
