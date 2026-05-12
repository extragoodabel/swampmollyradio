import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import FishSchool from './FishSchool.jsx';

/**
 * Wraps FishSchool with a loaded salmon SVG texture.
 *
 * Loading flow:
 *   - useTexture suspends until the SVG decodes; Suspense in App.jsx
 *     covers the briefly empty canvas.
 *   - If the file 404s or fails to parse, useTexture throws -> caught
 *     by the ErrorBoundary in Scene.jsx, which renders FishSchool with
 *     no texture prop, so each Fish falls back to its procedural canvas.
 *
 * The SVG itself is authored at 512x256 (aspect 2:1), matching the
 * default plane geometry, so no aspect-ratio surgery is required for
 * this asset -- but FishSchool still computes planeSize from the
 * loaded image, so dropping in a differently-sized salmon later
 * just works.
 */
const SALMON_URL = '/fish/salmon.svg';

export default function SalmonSchool(props) {
  const texture = useTexture(SALMON_URL);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.anisotropy = 4;
    texture.premultiplyAlpha = false;
    texture.needsUpdate = true;
  }, [texture]);

  return <FishSchool {...props} texture={texture} />;
}
