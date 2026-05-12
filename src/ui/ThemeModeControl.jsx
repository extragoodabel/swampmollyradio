import { useEffect } from 'react';
import { getTheme } from '../theme/themes.js';
import { useTheme } from '../theme/ThemeContext.jsx';

const SWAMP_ID = 'swamp';
const SALMON_DAYS_RADIO_ID = 'salmonDaysRadio';

/**
 * Compact atmosphere switch — single quiet line (two stations).
 * Keyboard: 1 = Salmon Days Radio, 2 = Swamp Molly Radio (not shown in UI).
 */
export default function ThemeModeControl() {
  const { themeId, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      const t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        setTheme(SALMON_DAYS_RADIO_ID);
      } else if (e.key === '2') {
        e.preventDefault();
        setTheme(SWAMP_ID);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.aquariumTheme = themeId;
  }, [themeId]);

  const swamp = getTheme(SWAMP_ID);
  const salmonDays = getTheme(SALMON_DAYS_RADIO_ID);

  return (
    <div
      className="theme-mode"
      role="toolbar"
      aria-label="Aquarium atmosphere"
    >
      <button
        type="button"
        className={`theme-mode__btn${
          themeId === SALMON_DAYS_RADIO_ID ? ' theme-mode__btn--active' : ''
        }`}
        onClick={() => setTheme(SALMON_DAYS_RADIO_ID)}
        aria-pressed={themeId === SALMON_DAYS_RADIO_ID}
        aria-label={salmonDays.displayName}
      >
        {salmonDays.switchLabel}
      </button>
      <span className="theme-mode__sep" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className={`theme-mode__btn${
          themeId === SWAMP_ID ? ' theme-mode__btn--active' : ''
        }`}
        onClick={() => setTheme(SWAMP_ID)}
        aria-pressed={themeId === SWAMP_ID}
        aria-label={swamp.displayName}
      >
        {swamp.switchLabel}
      </button>
    </div>
  );
}
