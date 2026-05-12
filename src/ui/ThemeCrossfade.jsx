import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext.jsx';

/**
 * Brief full-screen wash when the atmosphere theme changes — softens
 * the hard cut between fog palettes without blocking interaction.
 */
export default function ThemeCrossfade() {
  const { themeId, theme } = useTheme();
  const [washed, setWashed] = useState(false);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    setWashed(true);
    const id = window.setTimeout(() => setWashed(false), 70);
    return () => clearTimeout(id);
  }, [themeId]);

  return (
    <div
      className={`theme-crossfade${washed ? ' theme-crossfade--on' : ''}`}
      style={{ backgroundColor: theme.water.backgroundColor }}
      aria-hidden
    />
  );
}
