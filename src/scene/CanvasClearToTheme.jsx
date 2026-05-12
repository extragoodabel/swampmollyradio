import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext.jsx';
import { getTheme } from '../theme/themes.js';
import { guardVolumeFog } from './runtimeGuards.js';

/**
 * Always mounted under `<Canvas>` but *outside* the scene error boundary.
 * Keeps `scene.background` + fog in sync with the active theme even when
 * `<Scene />` throws, so the GL surface never reads as a dead black plane.
 */
export default function CanvasClearToTheme() {
  const { scene } = useThree();
  const { themeId, theme } = useTheme();

  useLayoutEffect(() => {
    const t = getTheme(themeId);
    const [n, f] = guardVolumeFog(
      t.water.fogNear,
      t.water.fogFar,
      t.water.fogNear,
      t.water.fogFar,
      'CanvasClearToTheme',
    );
    scene.background = new THREE.Color(t.water.backgroundColor);
    if (!scene.fog) {
      scene.fog = new THREE.Fog(t.water.fogColor, n, f);
    } else {
      scene.fog.color.set(t.water.fogColor);
      scene.fog.near = n;
      scene.fog.far = f;
    }
  }, [
    scene,
    themeId,
    theme.water.backgroundColor,
    theme.water.fogColor,
    theme.water.fogNear,
    theme.water.fogFar,
  ]);

  return null;
}
