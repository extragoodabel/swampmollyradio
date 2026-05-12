import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import FishSchool from './FishSchool.jsx';

/**
 * The primary salmon school, using the pixel-art WebP sprites.
 *
 * Two assets, both facing LEFT:
 *   - `/fish/salmon-facing-left.webp`     : the default salmon
 *   - `/fish/salmon-facing-left-99.webp`  : the same salmon, carrying
 *                                           a Seahawks #99 player.
 *                                           Exactly ONE fish at any
 *                                           given moment renders with
 *                                           this skin.
 *
 * The rider-selection logic lives inside `FishSchool` so the school
 * stays in charge of which seed/random source picks the rider. This
 * file's only job is to load the two textures, configure them for
 * pixel-art rendering (nearest filtering, no premultiplied alpha,
 * sRGB), and hand them down.
 *
 * Pixel-art notes:
 *   - `NearestFilter` mag/min keeps the chunky pixel look intact.
 *     LinearFilter blurs neighbouring pixels and softens the art.
 *   - We don't generate mipmaps (`generateMipmaps = false`) because
 *     they would force averaging into adjacent pixels and re-blur
 *     the silhouette at minified sizes.
 *
 * Fallback flow:
 *   - `useTexture` suspends; the parent `<Suspense>` shows nothing.
 *   - If either WebP 404s or decodes incorrectly, `useTexture` throws
 *     and the outer `<ErrorBoundary>` in `Scene.jsx` falls through
 *     to `SalmonSvgFallback`, then to the procedural canvas school
 *     as the ultimate backup.
 */

const FISH_URL = '/fish/salmon-facing-left.webp';
const RIDER_URL = '/fish/salmon-facing-left-99.webp';

function configurePixelArtTexture(tex) {
  if (!tex) return;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  tex.premultiplyAlpha = false;
  tex.needsUpdate = true;
}

export default function SalmonSchool(props) {
  // `useTexture` accepts arrays and returns one texture per URL in
  // the same order, so we destructure here.
  const [fishTexture, riderTexture] = useTexture([FISH_URL, RIDER_URL]);

  useEffect(() => {
    configurePixelArtTexture(fishTexture);
    configurePixelArtTexture(riderTexture);
  }, [fishTexture, riderTexture]);

  return (
    <FishSchool
      {...props}
      texture={fishTexture}
      riderTexture={riderTexture}
      // Both new sprites face left. `Fish.jsx` uses this flag to
      // decide which sign to apply to `scale.x` so the visible
      // silhouette matches the swim direction.
      textureFacesLeft
    />
  );
}
