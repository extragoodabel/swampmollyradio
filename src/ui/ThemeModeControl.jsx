import { useEffect } from 'react';
import { AQ_THEME_SWITCH_LOG } from '../debug/aquariumRecovery.js';
import { getTheme, otherThemeId } from '../theme/themes.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import { useAquariumWorldTransition } from './WorldTransitionContext.jsx';

const SWAMP_ID = 'swamp';
const SALMON_DAYS_RADIO_ID = 'salmonDaysRadio';

/**
 * Single portal-style link to the other aquarium (heading already names the active one).
 * Keyboard: 1 = Salmon Days Radio, 2 = Swamp Molly Radio (not shown in UI).
 */
export default function ThemeModeControl() {
  const { themeId } = useTheme();
  const { switchTheme } = useAquariumWorldTransition();

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
        if (AQ_THEME_SWITCH_LOG) {
          let ls = null;
          try {
            ls = window.localStorage.getItem('aquarium-theme');
          } catch {
            /* ignore */
          }
          console.info('[theme-switch] keyboard → Salmon Days', {
            currentThemeId: themeId,
            requestedThemeId: SALMON_DAYS_RADIO_ID,
            localStorageTheme: ls,
          });
        }
        switchTheme(SALMON_DAYS_RADIO_ID);
      } else if (e.key === '2') {
        e.preventDefault();
        if (AQ_THEME_SWITCH_LOG) {
          let ls = null;
          try {
            ls = window.localStorage.getItem('aquarium-theme');
          } catch {
            /* ignore */
          }
          console.info('[theme-switch] keyboard → Swamp Molly', {
            currentThemeId: themeId,
            requestedThemeId: SWAMP_ID,
            localStorageTheme: ls,
          });
        }
        switchTheme(SWAMP_ID);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [switchTheme, themeId]);

  useEffect(() => {
    document.documentElement.dataset.aquariumTheme = themeId;
  }, [themeId]);

  const destinationId = otherThemeId(themeId);
  const destination = getTheme(destinationId);

  return (
    <nav className="theme-mode" aria-label="Visit another aquarium">
      <button
        type="button"
        className="theme-mode__link"
        onClick={() => {
          if (AQ_THEME_SWITCH_LOG) {
            let ls = null;
            try {
              ls = window.localStorage.getItem('aquarium-theme');
            } catch {
              /* ignore */
            }
            console.info('[theme-switch] mode control click', {
              currentThemeId: themeId,
              requestedThemeId: destinationId,
              localStorageTheme: ls,
            });
          }
          switchTheme(destinationId);
        }}
        aria-label={`Go to ${destination.displayName}`}
      >
        <span className="theme-mode__arrow" aria-hidden="true">
          →{' '}
        </span>
        {destination.switchLabel}
      </button>
    </nav>
  );
}
