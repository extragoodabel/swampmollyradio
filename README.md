# Dark Aquarium

A Vite + React + React Three Fiber proof of concept that places the
viewer inside a calm, cinematic underwater volume surrounded by a slow-
moving school of ~90 fish, organized into a few ribbon-like clusters
that all drift on the same invisible current.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints. Move the mouse for camera parallax. Click the
"Aquarium controls" panel (top-right) to tune the scene live.

## What it does

- Dark teal-blue background tied to a visibly teal-blue linear fog
- **Volumetric water haze** (`WaterHaze.jsx`): N camera-attached planes
  with world-coord noise + diagonal caustic streaks. Because the planes
  ride with `camera.quaternion`, they stay in view no matter how the
  viewer drags. Because the noise is sampled from world position, the
  same plane shows a different slice of "water" as the camera moves
  and turns -- so the haze still feels world-locked even though the
  geometry isn't.
- **Distant volumetric light-field** behind the school (`BackgroundField.jsx`)
  -- subdivided plane driven by a 3D simplex displacement + palette
  shader (deep blue / teal / aqua / sea-green / yellow w/ pink accents),
  with its own depth fade tied to the same fog color
- Soft hemisphere + ambient + directional + cool point fill lighting
- **~90 fish** distributed across **3-5 ribbon clusters**:
  - Each cluster has a shared base speed and direction so members travel together
  - ~92% of fish follow their cluster's direction, ~8% rebel
  - ~85% of clusters flow rightward, ~15% leftward (gentle global bias)
  - Within a cluster, fish are placed along a ribbon axis with lateral / vertical jitter
- **Shared current field** sampled per-frame by every fish:
  - A wave-like Y undulation that travels along X
  - A pulsing X push that varies with Y / Z
  - A subtle Z breath
  - Same scalar field for every fish -> neighbours undulate together
- **Depth-driven traits** (closer fish are larger / crisper / faster, farther fish smaller / dimmer)
- **Shimmer events**: per-fish randomly-timed pulses of opacity, scale, and brightness so the school catches light intermittently
- ~400 additive dust particles drifting upward
- Camera parallax that eases toward the normalized cursor position
- Subtle radial vignette (CSS overlay)
- **Leva control panel** for live tuning

## Navigation

The viewer's body is anchored at the centre of the scene. Drag does
**not** translate the body -- it rotates the world around the viewer,
like grabbing the inside of a sphere (Google Street View model).

- **Drag** (left click / touch + drag) -- grab the surrounding water
  and turn your view:
  - drag right -> head turns LEFT (yaw +=)
  - drag left  -> head turns RIGHT (yaw -=)
  - drag down  -> tilt UP (pitch +=)
  - drag up    -> tilt DOWN (pitch -=)
  Pitch is clamped to `+/- maxPitchDegrees` so the viewer can't flip.
  Inertia carries the rotation briefly after release, then settles.
- **Scroll wheel** -- only translation. Moves the camera forward /
  backward through the fish volume on Z, clamped between `cameraZMin`
  and `cameraZMax`.
- **Hover** -- the mouse position drives a small head-bob (XY/Z
  position offset only -- no rotation). Reduced ~80% while a drag is
  active so it doesn't fight the turn.
- **Idle** -- with no input the camera keeps a slow floating sway on
  all three position axes.

## Leva controls

| Group  | Control                    | Effect                                                       |
| ------ | -------------------------- | ------------------------------------------------------------ |
| school | `fishCount`                | 20-180 fish                                                  |
| school | `clusters`                 | 2-6 ribbon clusters                                          |
| school | `schoolSpread`             | scales cluster size + spacing                                |
| school | `swimSpeed`                | global multiplier on per-fish swim speed                     |
| school | `shimmerIntensity`         | amplitude of opacity/scale/brightness pulses                 |
| school | `foregroundCrossingChance` | fraction of fish forced into near-camera band                |
| camera | `hoverParallaxStrength`    | how much the camera sways with the hovered cursor            |
| camera | `scrollDepthStrength`      | wheel sensitivity for camera Z travel                        |
| camera | `cameraZMin/Max`           | hard clamp on scroll-driven camera Z                         |
| camera | `idleSway`                 | low-frequency floating motion when no input                  |
| camera | `cameraAvoidanceRadius`    | soft "lens dodge" radius around the camera                   |
| drag   | `dragSensitivity`          | radians-per-pixel scaling for yaw/pitch                      |
| drag   | `dragDamping`              | 0 = infinite glide, 1 = instant stop. Default 0.7            |
| drag   | `inertiaStrength`          | scaling on release velocity (0 = no inertia, 3 = long glide) |
| drag   | `maxPitchDegrees`          | clamp pitch (default 70deg) so the view can't flip           |
| school | `fishDistanceOpacityStrength` | 0 = distant fish stay full alpha, 1 = old "fade with z" |
| water  | `fogColor`                 | tint of `THREE.Fog` AND of the haze layers (linked)          |
| water  | `fogNear`                  | distance at which scene fog starts (replaces `fogDensity`)   |
| water  | `fogFar`                   | distance at which scene fog is opaque                        |
| water  | `waterHazeOpacity`         | per-layer alpha for the camera-attached haze planes          |
| water  | `hazeLayerCount`           | 0-6 haze planes between viewer and BackgroundField           |
| water  | `hazeMovementSpeed`        | time multiplier for noise drift + caustic phase              |
| water  | `particleDepthDensity`     | scales dust count (and dust spans a wider z range)           |

## File layout

```
src/
  main.jsx
  App.jsx               # <Canvas>, <Leva>, DOM vignette + overlay
  index.css
  scene/
    Scene.jsx           # Leva controls, background, fog, lights, layer mount order
    CameraRig.jsx       # drag-to-turn yaw/pitch + scroll Z + hover + idle sway
    FishSchool.jsx      # seeded RNG -> ribbon clusters -> N fish (procedural fallback)
    SalmonSchool.jsx    # loads salmon SVG, passes texture into FishSchool
    Fish.jsx            # single plane: drift + current + wag + shimmer + camera avoidance
    BackgroundField.jsx # distant displaced shader plane (caustics palette)
    WaterHaze.jsx       # N camera-attached noise+caustic haze planes
    DustParticles.jsx   # THREE.Points dust system
    ErrorBoundary.jsx   # falls back from SalmonSchool -> FishSchool on load failure
    currents.js         # shared current field sampled by every fish
    assets/
      fishTexture.js    # canvas-drawn fish silhouette (4 variants, cached)
      dustTexture.js    # soft circular alpha sprite
```

## Why it feels coordinated (not screensaver-random)

Three orthogonal pieces:

1. **Shared current field** (`currents.js`): every fish samples the same
   summed-sine field for X / Y / Z drift. Two fish at the same X end up
   with nearly identical Y offsets, so they ripple as a wave.
2. **Cluster-level shared params** (`FishSchool.jsx`): fish in the same
   cluster share a base speed and base direction, so they travel together
   over time instead of slowly diffusing.
3. **Per-fish jitter on top**: scale, opacity, wiggle phase, and small
   speed jitter break up any "marching formation" feel.

## Fish art

The default asset is `public/fish/salmon.svg` -- a hand-authored stylized
salmon with transparent background, 512x256 viewBox (2:1). It's loaded
via `useTexture('/fish/salmon.svg')` inside `SalmonSchool.jsx`, wrapped
in `Suspense` (covers the load) and `ErrorBoundary` (covers load
failure, e.g. file missing). On failure the school falls back to the
procedural canvas texture in `assets/fishTexture.js` -- no visible
crash, just the placeholder art.

`FishSchool.jsx` derives `planeSize = [2, 2/aspect]` from the loaded
texture's image dimensions, so dropping in any side-view fish PNG/SVG
(skinny, square, whatever) just works without stretching.

Further upgrades from here:

- **PNG / different SVG**: just drop a file at `public/fish/salmon.svg`.
- **Sprite sheet**: keep the same plane, set
  `texture.repeat.set(1 / cols, 1 / rows)` and update `texture.offset`
  inside `Fish.jsx`'s `useFrame` based on a frame index derived from
  `wiggleSpeed`.
- **Transparent WebM**: create an `HTMLVideoElement` (muted, looping),
  wrap it in `THREE.VideoTexture`, and pass that as the `texture` prop
  from `SalmonSchool` (or a new `WebMSchool` sibling).

Plane geometry, transparency setup, drift, current sampling, shimmer,
avoidance, parallax, and scroll-depth logic all stay unchanged for any
asset swap.

## Atmosphere (visible water medium)

The original scene relied entirely on `THREE.Fog` to obscure distant
fish, which read as "fish fading into invisible empty space" rather than
"fish being swallowed by water". The current atmosphere layers four
distinct effects:

1. **`THREE.Fog`** with a *visibly* teal-blue color (`fogColor`, default
   `#0e3850`) and direct `fogNear` / `fogFar` controls -- so fading
   objects pick up a water tint instead of going to near-black.
2. **`WaterHaze.jsx`** -- camera-attached planes at four fixed distances
   in front of the view. A cheap value-noise fragment shader sampled
   from *world* position gives a body-of-water feel that still shifts
   slightly as you turn / move. One of the middle layers also carries
   a stronger diagonal caustic streak so light beams are visible.
3. **`BackgroundField.jsx`** sits even further back with its own
   subdivided displacement shader. It picks up the same `fogColor`
   so the deep distance dissolves into the same medium.
4. **`fishDistanceOpacityStrength`** decouples fish opacity from depth.
   At its default `0.4`, distant fish stay around 70-80% opacity instead
   of dropping to 30%. They no longer "vanish" -- the haze + fog
   obscures them visually while they remain materially present.

`particleDepthDensity` scales the dust count and `DUST_VOLUME.z` is
widened to 24 so suspended particles populate the entire visible depth.

## Performance notes

- Single shared `CanvasTexture` per variant (cached by `getFishTexture`)
- `meshBasicMaterial` (no per-fish lighting evaluation), `depthWrite=false`
- Dust uses a single `THREE.Points` draw call
- DPR clamped to `[1, 1.75]`
- `WaterHaze` shader is value-noise (no simplex), three octaves per
  pixel -- ~4 haze planes is comfortable on integrated graphics
- Per-frame work per fish: ~3 sine evaluations + a couple of mat updates;
  90 fish stays comfortably above 60fps on integrated graphics

No post-processing yet -- the only custom shaders are the two
atmosphere layers (`BackgroundField` and `WaterHaze`).
