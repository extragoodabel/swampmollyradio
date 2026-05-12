import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import FishSchool from './FishSchool.jsx';

/**
 * Backup salmon school using the original `/fish/salmon.svg` asset.
 *
 * Lives one layer down in the fallback stack:
 *   1. `SalmonSchool` (new WebP pixel-art sprites + #99 rider variant)
 *   2. `SalmonSvgFallback` (this file -- the original stylised SVG)
 *   3. Procedural canvas fish (FishSchool with no `texture` prop)
 *
 * If the WebP assets ever fail to load (404, decode error, etc.) the
 * outer `<ErrorBoundary>` in `Scene.jsx` swaps to this component so
 * the user still gets a recognisable salmon school, just rendered
 * from the previous-generation SVG.
 *
 * The SVG faces RIGHT by default (same as the procedural fallback),
 * so we pass `textureFacesLeft={false}` -- the direction-flip logic
 * inside `Fish.jsx` will mirror it correctly when a fish swims
 * left-to-right.
 */
const SALMON_URL = '/fish/salmon.svg';

export default function SalmonSvgFallback(props) {
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

  return <FishSchool {...props} texture={texture} textureFacesLeft={false} />;
}
