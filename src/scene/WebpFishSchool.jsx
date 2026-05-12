import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import FishSchool from './FishSchool.jsx';

/**
 * Generic pixel-art fish school.
 *
 * Both shipping themes use the same WebP pipeline (NearestFilter +
 * SRGB + no mipmaps); the only thing that varies is which sprite(s)
 * we hand to it. `WebpFishSchool` accepts:
 *
 *   - `mainUrl`        the everyday sprite for the whole school
 *   - `riderUrl`       (optional) sprite for the rider variant. If
 *                      null, no rider is rendered and FishSchool's
 *                      rider system is left untouched (one fish will
 *                      still be flagged `isRider` but Fish.jsx falls
 *                      back to the main texture when riderTexture
 *                      is missing).
 *   - `textureFacesLeft` matches the source asset's facing
 *
 * Replaces the previous `SalmonSchool` for both themes; the salmon
 * sprite paths are now just data passed in from the active theme
 * (see `src/theme/themes.js`).
 *
 * Pixel-art rendering notes:
 *   - `NearestFilter` mag/min keeps the chunky pixel look intact.
 *     LinearFilter blurs neighbouring pixels and softens the art.
 *   - `generateMipmaps = false` so the silhouette doesn't re-blur
 *     at minified sizes from averaging into adjacent pixels.
 *   - `premultiplyAlpha = false` so the WebP alpha edges composite
 *     correctly against the additive shimmer term in Fish.jsx.
 *
 * Fallback flow (unchanged from the previous salmon-only path):
 *   1. `useTexture` suspends; the parent `<Suspense>` shows nothing.
 *   2. If any WebP 404s or decodes incorrectly, `useTexture` throws
 *      and the outer `<ErrorBoundary>` in `Scene.jsx` falls through
 *      to `SalmonSvgFallback`, then to the procedural canvas school
 *      as the ultimate backup.
 */

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

export default function WebpFishSchool({
  mainUrl,
  riderUrl = null,
  textureFacesLeft = true,
  ...props
}) {
  // useTexture's array form returns one texture per URL in the same
  // order. We always pass an array (even of length 1) so the hook
  // shape stays stable across themes -- otherwise switching from
  // "with rider" to "no rider" would break the rules-of-hooks
  // ordering inside drei's loader.
  const urls = useMemo(
    () => (riderUrl ? [mainUrl, riderUrl] : [mainUrl]),
    [mainUrl, riderUrl],
  );
  const textures = useTexture(urls);
  const fishTexture = textures[0];
  const riderTexture = riderUrl ? textures[1] : null;

  useEffect(() => {
    configurePixelArtTexture(fishTexture);
    if (riderTexture) configurePixelArtTexture(riderTexture);
  }, [fishTexture, riderTexture]);

  return (
    <FishSchool
      {...props}
      texture={fishTexture}
      riderTexture={riderTexture}
      textureFacesLeft={textureFacesLeft}
    />
  );
}
