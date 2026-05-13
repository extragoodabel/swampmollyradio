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
- **Scatter system**: fish occasionally "spook" and dart sideways,
  briefly speeding up and trailing translucent bubbles before easing
  back into the current. Random spooks can chain to nearby fish, and
  pushing the camera into a fish or yawing toward one triggers a local
  scatter wave.
- **Ambient underwater radio**: a small glowing beacon orb sits in the
  mid-distance. Clicking it toggles a SomaFM ambient stream (Deep Space
  One by default), with smooth volume fades and an optional lowpass
  filter that thickens the audio "through water". A discreet bottom-left
  overlay surfaces the station name + now-playing track.
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
| density | `heroFishDominance`       | deepens *silhouette* / fog crush on distant layers (not sprite alpha) |
| water  | `fogColor`                 | tint of `THREE.Fog` AND of the haze layers (linked)          |
| water  | `fogNear`                  | distance at which scene fog starts (replaces `fogDensity`)   |
| water  | `fogFar`                   | distance at which scene fog is opaque                        |
| water  | `waterHazeOpacity`         | per-layer alpha for the camera-attached haze planes          |
| water  | `hazeLayerCount`           | 0-6 haze planes between viewer and BackgroundField           |
| water  | `hazeMovementSpeed`        | time multiplier for noise drift + caustic phase              |
| water  | `particleDepthDensity`     | scales dust count (and dust spans a wider z range)           |
| scatter| `scatterEnabled`           | master toggle for the whole scatter + bubble system          |
| scatter| `randomScatterFrequency`   | expected spontaneous scatters per second                     |
| scatter| `scatterRadius`            | search radius for nearby fish (random + camera scatter)      |
| scatter| `scatterStrength`          | peak displacement multiplier during the scatter burst        |
| scatter| `scatterDuration`          | seconds the "scattering" phase lasts before recovery         |
| scatter| `scatterRecoverySpeed`     | higher = snappier ease-back to the home lane                 |
| scatter| `chainReactionChance`      | probability a triggered scatter wakes its neighbours         |
| scatter| `bubbleTrailEnabled`       | suppress bubble spawning while keeping scatter motion        |
| scatter| `bubbleSpawnRate`          | bubbles emitted per scatter event                            |
| scatter| `bubbleLifetime`           | seconds a bubble lives before fading out                     |
| scatter| `maxBubbles`               | upper bound for pooled bubble draw count                     |
| radio  | `ambientRadioEnabled`      | hide the beacon and stop playback when off                   |
| radio  | `radioVolume`              | master gain (0..1), live-applied to the AudioContext         |
| radio  | `radioGlowIntensity`       | scales the orb opacity + halo strength                       |
| radio  | `radioPosition`            | vec3 location of the beacon in the aquarium                  |
| radio  | `underwaterAudioFilterStrength` | dry/wet crossfade for the 950Hz lowpass (best-effort)   |

## File layout

```
src/
  main.jsx
  App.jsx               # <RadioProvider>, <Canvas>, <Leva>, DOM vignette + overlay
  index.css
  scene/
    Scene.jsx           # Leva controls, background, fog, lights, layer mount order
    CameraRig.jsx       # drag-to-turn yaw/pitch + scroll Z + hover + idle sway
    FishSchool.jsx      # seeded RNG -> ribbon clusters -> N fish (procedural fallback)
    SalmonSchool.jsx    # loads salmon SVG, passes texture into FishSchool
    Fish.jsx            # single plane: drift + current + wag + shimmer + scatter
    AmbientRadio.jsx    # glowing beacon orb + halo + orbit particles + click target
    BackgroundField.jsx # distant displaced shader plane (caustics palette)
    WaterHaze.jsx       # N camera-attached noise+caustic haze planes
    DustParticles.jsx   # THREE.Points dust system
    ErrorBoundary.jsx   # falls back from SalmonSchool -> FishSchool on load failure
    currents.js         # shared current field sampled by every fish
    scatter/
      ScatterManager.jsx # decides when fish spook (random / camera-driven / chain)
      BubbleTrails.jsx   # pooled THREE.Points bubble sprites trailing scatters
    assets/
      fishTexture.js    # canvas-drawn fish silhouette (4 variants, cached)
      dustTexture.js    # soft circular alpha sprite
      bubbleTexture.js  # translucent bubble shell sprite
      haloTexture.js    # radial gradient halo for the radio beacon
  audio/
    stations.js         # SomaFM station catalog (extensible)
    RadioContext.jsx    # HTMLAudio + Web Audio graph (lowpass) + fades + CORS fallback
  ui/
    RadioOverlay.jsx    # bottom-left atmospheric station / now-playing readout
```

## Why it feels coordinated (not screensaver-random)

Three orthogonal pieces:

1. **Shared current field** (`currents.js`): every fish samples the same
   summed-sine field for X / Y / Z drift. Two fish at the same X end up
   with nearly identical Y offsets, so they ripple as a wave.
2. **Cluster-level shared params** (`FishSchool.jsx`): fish in the same
   cluster share a base speed and base direction, so they travel together
   over time instead of slowly diffusing.
3. **Per-fish jitter on top**: scale, wiggle phase, and small speed
   jitter break up any "marching formation" feel. Distant fish stay
   **opaque**; depth reads from colour (desaturation + fog tint + darken),
   not transparency.

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
4. **Hero + midfield depth**: `atmosphere.heroFishAtmosphere` (per theme)
   drives **atmospheric perspective** on the hero school — blend toward
   water tones, crush contrast, occasional silver glints (Salmon Days).
   Midfield instanced fish use the same idea in
   `MidfieldSchool.jsx` (silhouette + fog colour, solid alpha +
   `depthWrite`). The Leva slider `heroFishDominance` scales how strongly
   distant layers go to silhouette, without turning them into glassy
   transparent stacks.

`particleDepthDensity` scales the dust count and `DUST_VOLUME.z` is
widened to 24 so suspended particles populate the entire visible depth.

## Scatter behavior

Each fish carries a tiny scatter state machine: `idle` → `scattering`
→ `recovering` → `idle`. The state advances inside `Fish.jsx`'s
`useFrame`; only the **displacement, rotation tilt, and shimmer spike**
are added on top of the normal current-driven motion, so the underlying
school physics is never replaced.

`ScatterManager.jsx` owns *when* a scatter fires:

- **Spontaneous** — at expected rate `randomScatterFrequency` (per
  second) it picks one fish and rolls a recursive chain: each
  neighbour within `scatterRadius` may also scatter with
  `chainReactionChance` (with weaker intensity / a slight delay).
- **Camera-driven** — every frame it watches the camera's forward
  vector and its rate of change. If the camera pushes hard along its
  forward (scroll-in) or yaws rapidly, fish caught inside a soft cone
  in front of the camera scatter away from the view axis.
- **Cooldowns** are per-fish so a single fish can't be retriggered
  every frame.

`BubbleTrails.jsx` exposes a `spawn(position, direction, intensity)`
function over a small shared ref (`scatterCtx.bubble`). Scattering
fish call it once per event; the manager keeps a fixed-size pool of
`maxBubbles` translucent sprites (one `THREE.Points` draw call) which
rise, wobble, and shrink over `bubbleLifetime` seconds.

The communication between Fish, ScatterManager, BubbleTrails, and
FishSchool happens through one mutable ref (`scatterCtx.registry`)
deliberately — passing fish positions through React state would
re-render the whole tree every frame.

## Ambient radio

A diegetic beacon in the aquarium (visible cyan orb + halo + small
orbit dust) plays an ambient SomaFM stream when clicked.

Audio is owned by **`RadioContext.jsx`** (a React context). The
preferred playback path is:

```
HTMLAudio  →  MediaElementSource
           →  [ dry path ]               →
           →  [ lowpass(950Hz) ]  →  wet  →  master gain  →  destination
```

`dry` / `wet` crossfade via `underwaterAudioFilterStrength`; `master`
handles the volume slider and the play/pause **fades** (linear ramp
over ~0.9s). On `pause()` we ramp `master` to 0, *then* call
`audio.pause()` so the network stream actually stops after the audio
has gone silent.

The Web Audio path requires the stream's HTTP response to advertise
CORS. SomaFM's ice servers don't reliably do so, so on `play()` failure
we recreate the `<audio>` element *without* `crossOrigin` and try again
(plus rotate through the station's `fallbacks`). In that fallback mode
audio still plays, but the filter slider is inert.

`AmbientRadio.jsx` is the 3D piece:

- A small icosahedron lamp + a billboard halo sprite (additive
  blending — fakes bloom without post-processing)
- An invisible larger sphere hitbox sits over the visible orb so the
  click target stays generous despite the orb being small and bobbing
- An orbiting 24-point particle system around it
- Fish meshes use `raycast={() => null}` so they never block clicks
  on the beacon when they swim in front

The DOM **`RadioOverlay.jsx`** renders bottom-left only after first
interaction. While playing it shows the station name and (if SomaFM's
JSON endpoint returns one) the current track title; while paused it
shows a tiny "tap the beacon to resume" hint.

Stations are defined as plain objects in `audio/stations.js`. Adding a
second station is a config-only change.

## 3D assets

- `public/models/blue_whale_skeleton.glb` — blue whale skeleton (**London Natural History Museum Imaging**). Salmon Days: faint abyss layer; progressive restore `?aqsalmonrestore=13` (omit param = full stack). Disable with `?aqsalmonkill=whaleSkeleton` or `?aqsalmonkill=whale`.

## Performance notes

- Single shared `CanvasTexture` per variant (cached by `getFishTexture`)
- `meshBasicMaterial` (no per-fish lighting evaluation), `depthWrite=false`
- Dust uses a single `THREE.Points` draw call
- DPR clamped to `[1, 1.75]`
- `WaterHaze` shader is value-noise (no simplex), three octaves per
  pixel -- ~4 haze planes is comfortable on integrated graphics
- Per-frame work per fish: ~3 sine evaluations + a couple of mat updates;
  90 fish stays comfortably above 60fps on integrated graphics
- Scatter state lives inside per-fish `useRef`s; only fish-position
  mirrors update the shared `scatterCtx.registry` (mutated, never via
  React state), so 90 fish + 120 bubbles still fits inside the same
  frame budget
- Bubbles are a single pooled `THREE.Points` with custom per-bubble
  `aSize` + `aAlpha` attributes — one draw call, even at `maxBubbles`
- Radio audio uses native `<audio>` decoding; the optional Web Audio
  graph is a 4-node chain (source / filter / dry / wet / master) added
  lazily on first play

No post-processing yet -- the only custom shaders are the two
atmosphere layers (`BackgroundField` and `WaterHaze`) and the bubble
points sprite.
