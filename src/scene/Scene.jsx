import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useControls, folder } from 'leva';
import * as THREE from 'three';
import CameraRig from './CameraRig.jsx';
import FishSchool from './FishSchool.jsx';
import SalmonSchool from './SalmonSchool.jsx';
import SalmonSvgFallback from './SalmonSvgFallback.jsx';
import DustParticles from './DustParticles.jsx';
import AmbientBubbles from './AmbientBubbles.jsx';
import BackgroundField from './BackgroundField.jsx';
import WaterHaze from './WaterHaze.jsx';
import AmbientRadio from './AmbientRadio.jsx';
import MidfieldSchool from './MidfieldSchool.jsx';
import BackgroundFishClouds from './BackgroundFishClouds.jsx';
import SurfacePlane from './SurfacePlane.jsx';
import Seabed from './Seabed.jsx';
import KelpForest from './KelpForest.jsx';
import LightBeam from './LightBeam.jsx';
import FloatingLetters from './FloatingLetters.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { useRadio } from '../audio/RadioContext.jsx';

const BACKGROUND_COLOR = '#04141e';

const VOLUME = { x: 16, y: 5.5, z: 18 };
const DUST_VOLUME = { x: 20, y: 9, z: 24 };
// Ambient bubbles travel further up than the dust field; they spawn
// near the seabed and need headroom above the school before they
// recycle. Wider Y than DUST_VOLUME, similar XZ extent.
const BUBBLE_VOLUME = { x: 18, y: 11, z: 22 };

export default function Scene() {
  const { scene } = useThree();

  const {
    heroFishCount,
    midfieldFishCount,
    backgroundCloudDensity,
    verticalSpread,
    worldRadius,
    distantFishOpacity,
    backgroundSwarmSpeed,
    densityLayerEnabled,
    peripheralDensity,
    backgroundMotionStrength,
    atmosphericDensity,
    heroFishDominance,
    clusters,
    schoolSpread,
    swimSpeed,
    shimmerIntensity,
    foregroundCrossingChance,
    fishDistanceOpacityStrength,
    scatterEnabled,
    randomScatterFrequency,
    scatterRadius,
    scatterStrength,
    scatterDuration,
    scatterRecoverySpeed,
    chainReactionChance,
    bubbleTrailEnabled,
    bubbleSpawnRate,
    bubbleLifetime,
    maxBubbles,
    fogColor,
    fogNear,
    fogFar,
    waterHazeOpacity,
    hazeLayerCount,
    hazeMovementSpeed,
    particleDepthDensity,
    particleCount,
    particleOpacity,
    particleShimmerStrength,
    ambientBubbleCount,
    ambientBubbleSpawnRate,
    bubbleOpacity,
    bubbleRiseSpeed,
    bubbleSizeVariation,
    hoverParallaxStrength,
    scrollDepthStrength,
    cameraZMin,
    cameraZMax,
    idleSway,
    cameraAvoidanceRadius,
    dragSensitivity,
    dragDamping,
    inertiaStrength,
    maxPitchDegrees,
    displacementStrength,
    noiseScale,
    animationSpeed,
    gradientIntensity,
    pinkAccentStrength,
    diagonalFlowStrength,
    backgroundOpacity,
    ambientRadioEnabled,
    radioVolume,
    radioGlowIntensity,
    radioPosition,
    underwaterAudioFilterStrength,
    surfaceEnabled,
    surfaceHeight,
    surfaceOpacity,
    surfaceRippleStrength,
    surfaceRippleSpeed,
    surfaceShimmerStrength,
    surfaceYellowIntensity,
    surfaceDiagonalFlow,
    surfaceFogBlend,
    seabedEnabled,
    seabedDepth,
    seabedOpacity,
    seabedRippleStrength,
    seabedRippleSpeed,
    seabedGoldIntensity,
    kelpEnabled,
    kelpDensity,
    kelpDistanceBias,
    kelpSwayStrength,
    kelpSwaySpeed,
    kelpOpacity,
    lightBeamEnabled,
    beamPositionX,
    beamPositionY,
    beamPositionZ,
    beamAngle,
    beamWidth,
    beamLength,
    beamIntensity,
    beamOpacity,
    beamSoftness,
    beamFalloff,
    beamDiffusion,
    beamCausticStrength,
    beamNoiseScale,
    beamRegionSize,
    beamShimmerSpeed,
    beamColorWarmth,
    floatingLettersEnabled,
    letterDepthSpread,
    letterFloatStrength,
    letterShimmerStrength,
    letterOpacity,
    letterScale,
    letterSpacing,
    letterMurkiness,
    useNewSalmonSkins,
    enableRiderSalmon,
    riderSalmonScaleMultiplier,
    riderSalmonGlowBoost,
    riderSalmonShimmerBoost,
    riderSalmonCanScatter,
  } = useControls({
    school: folder({
      // `heroFishCount` controls the close, fully-interactive school
      // (scatter, shimmer, camera avoidance, etc.). For broader
      // density controls see the `density` folder below.
      heroFishCount: { value: 90, min: 20, max: 180, step: 5 },
      clusters: { value: 4, min: 2, max: 6, step: 1 },
      schoolSpread: { value: 1.0, min: 0.5, max: 2.0, step: 0.05 },
      swimSpeed: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      shimmerIntensity: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      foregroundCrossingChance: { value: 0.18, min: 0, max: 0.5, step: 0.01 },
      fishDistanceOpacityStrength: { value: 0.4, min: 0, max: 1, step: 0.05 },
    }),
    density: folder({
      // Master toggle for the surround-density layers (midfield +
      // distant clouds). Disable to inspect the hero school in
      // isolation.
      densityLayerEnabled: { value: true },
      // Mid-distance instanced billboards. 0 disables the layer.
      // Defaults pulled WAY back from the previous 420; the goal of
      // the midfield is now atmospheric presence, not an extra school.
      midfieldFishCount: { value: 110, min: 0, max: 800, step: 10 },
      // Multiplier applied to each background cloud's base count.
      // Pulled back to 0.3 so the deep clouds read as texture, not
      // population.
      backgroundCloudDensity: { value: 0.3, min: 0, max: 3, step: 0.05 },
      // Vertical extent (radius along Y) of the midfield surround
      // volume. Larger = fish further above and below the camera.
      verticalSpread: { value: 10, min: 4, max: 22, step: 0.5 },
      // Horizontal/depth radius of the midfield surround volume.
      // Pushed out from 18 to 24 so the average distant fish is now
      // *further* from the camera, reading as a smaller silhouette.
      worldRadius: { value: 24, min: 8, max: 40, step: 1 },
      // Global opacity multiplier for the midfield instances.
      distantFishOpacity: { value: 0.32, min: 0, max: 1, step: 0.05 },
      // Multiplier applied to background cloud rotation speed.
      backgroundSwarmSpeed: { value: 0.4, min: 0, max: 3, step: 0.05 },
      // Edge falloff: midfield fish at the rim of the world sphere
      // fade toward this opacity multiplier. Keeps the periphery from
      // looking populated and gives a sense of breathing negative
      // space.
      peripheralDensity: { value: 0.25, min: 0, max: 1, step: 0.05 },
      // Master multiplier on all distant motion (cloud rotation,
      // midfield current bias). 1.0 = legacy churn, 0.4 = calm drift.
      backgroundMotionStrength: { value: 0.35, min: 0, max: 2, step: 0.05 },
      // Master multiplier on the *counts* of both midfield + bg
      // layers. Use this to fade the entire density system up or
      // down together without touching individual sliders.
      atmosphericDensity: { value: 0.6, min: 0, max: 2, step: 0.05 },
      // Boosts the hero school's visual dominance by fading distant
      // fish more (lower opacity, smaller scale) as this rises.
      // 1.0 = neutral. The default of 1.4 nudges focus back to the
      // hero layer.
      heroFishDominance: { value: 1.4, min: 0.5, max: 3, step: 0.05 },
    }),
    scatter: folder({
      scatterEnabled: { value: true },
      randomScatterFrequency: { value: 0.30, min: 0, max: 3, step: 0.05 },
      scatterRadius: { value: 4.0, min: 0.5, max: 12, step: 0.1 },
      scatterStrength: { value: 1.2, min: 0, max: 3, step: 0.05 },
      scatterDuration: { value: 0.45, min: 0.1, max: 1.5, step: 0.05 },
      scatterRecoverySpeed: { value: 1.0, min: 0.2, max: 4, step: 0.1 },
      chainReactionChance: { value: 0.55, min: 0, max: 1, step: 0.05 },
      bubbleTrailEnabled: { value: true },
      bubbleSpawnRate: { value: 1.0, min: 0, max: 3, step: 0.05 },
      bubbleLifetime: { value: 2.2, min: 0.3, max: 6, step: 0.1 },
      maxBubbles: { value: 120, min: 0, max: 400, step: 10 },
    }),
    camera: folder({
      hoverParallaxStrength: { value: 1.0, min: 0.0, max: 2.5, step: 0.05 },
      scrollDepthStrength: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      cameraZMin: { value: -6, min: -16, max: 0, step: 0.5 },
      cameraZMax: { value: 8, min: 1, max: 14, step: 0.5 },
      idleSway: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      cameraAvoidanceRadius: { value: 1.2, min: 0.0, max: 4.0, step: 0.1 },
    }),
    drag: folder({
      dragSensitivity: { value: 1.0, min: 0.1, max: 3.0, step: 0.05 },
      dragDamping: { value: 0.7, min: 0.0, max: 1.0, step: 0.01 },
      inertiaStrength: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      maxPitchDegrees: { value: 70, min: 10, max: 89, step: 1 },
    }),
    background: folder({
      displacementStrength: { value: 2.5, min: 0, max: 8, step: 0.1 },
      noiseScale: { value: 2.6, min: 0.5, max: 8, step: 0.1 },
      animationSpeed: { value: 0.18, min: 0, max: 1.0, step: 0.01 },
      gradientIntensity: { value: 1.0, min: 0, max: 2, step: 0.05 },
      pinkAccentStrength: { value: 0.6, min: 0, max: 2, step: 0.05 },
      diagonalFlowStrength: { value: 1.0, min: 0, max: 3, step: 0.05 },
      backgroundOpacity: { value: 0.85, min: 0, max: 1, step: 0.01 },
    }),
    water: folder({
      fogColor: { value: '#0e3850' },
      // The defaults below were pulled back from (4, 28) -- the old
      // values rendered as a wall of haze that swallowed the
      // beacon and the deeper fish before the eye had a chance to
      // read them. Pushing the near plane out to 10 lets the
      // foreground breathe; extending far to 42 gives a gentler
      // gradient instead of a hard fade.
      fogNear: { value: 10, min: 0, max: 20, step: 0.5 },
      fogFar: { value: 42, min: 10, max: 60, step: 1 },
      // Old default of 0.15 stacked with the new particle/bubble
      // layers to produce a smoggy mid-distance. 0.06 keeps the
      // perceived water body without occluding focal objects.
      waterHazeOpacity: { value: 0.06, min: 0, max: 0.8, step: 0.01 },
      hazeLayerCount: { value: 3, min: 0, max: 6, step: 1 },
      hazeMovementSpeed: { value: 1.0, min: 0, max: 3, step: 0.05 },
      // Legacy scalar that multiplies the dust count on top of the
      // explicit `particleCount` below. Left in place for backward
      // compatibility with the water-haze tuning workflow.
      particleDepthDensity: { value: 1.0, min: 0, max: 3, step: 0.05 },
    }),
    particles: folder({
      // ---- Suspended particulate (DustParticles) ----------------
      //
      // `particleCount` is the *base* dust population. Final count
      // also scales by water.particleDepthDensity so tuners can use
      // one slider for "more atmosphere" without re-allocating
      // buffer attributes every time.
      //
      // Defaults intentionally conservative: the layered shader
      // makes each particle more visible than the old uniform
      // PointsMaterial, so 320 reads as roughly the same density
      // as 700 used to. Pushing this slider up is the right knob
      // for users who want a heavier suspended-life feel.
      particleCount: { value: 320, min: 80, max: 2000, step: 20 },
      particleOpacity: { value: 0.40, min: 0, max: 1, step: 0.01 },
      // Multiplier on the per-particle sine pulse amplitude. 0 ==
      // particles hold their base alpha; 1 == default "catch the
      // light" pulse; >1 == more visible twinkle.
      particleShimmerStrength: { value: 0.8, min: 0, max: 2.5, step: 0.05 },

      // ---- Ambient bubbles (AmbientBubbles) ---------------------
      //
      // `ambientBubbleCount` is the pool *capacity*: at most this
      // many bubbles can be on screen at once. Real on-screen count
      // is governed by spawnRate * average-lifetime.
      //
      // Pulled back from 60 / 1.2 so bubbles read as occasional
      // life rather than a steady column. The user can crank both
      // sliders for a "fish farm" vibe.
      ambientBubbleCount: { value: 24, min: 0, max: 240, step: 5 },
      // Bubbles per second. Combined with bubbleRiseSpeed this also
      // sets average bubble lifetime, which feeds back into how
      // dense the column reads.
      ambientBubbleSpawnRate: { value: 0.4, min: 0, max: 6, step: 0.05 },
      bubbleOpacity: { value: 0.40, min: 0, max: 1, step: 0.01 },
      // Multiplier on the per-bubble base rise rate. The base rate
      // is randomised per bubble for variety; this scales the lot.
      bubbleRiseSpeed: { value: 1.0, min: 0.1, max: 3, step: 0.05 },
      // Multiplier on the random portion of bubble base size.
      // 0 == tiny uniform bubbles; 2 == strong size variety.
      bubbleSizeVariation: { value: 1.0, min: 0, max: 2.5, step: 0.05 },
    }),
    radio: folder({
      ambientRadioEnabled: { value: true },
      radioVolume: { value: 0.5, min: 0, max: 1, step: 0.01 },
      // Bumped from 1.0 -- the beacon is the one diegetic
      // interaction in the scene, and the recent water/particle
      // changes were making it disappear into the haze.
      radioGlowIntensity: { value: 1.35, min: 0, max: 3, step: 0.05 },
      // Vec3 input -- the orb lives at this position in world space.
      // Default places it in the mid-volume, slightly right of centre
      // and a touch above the school's home y-band.
      radioPosition: { value: { x: 3, y: 0.6, z: -4.5 }, step: 0.1 },
      underwaterAudioFilterStrength: {
        value: 0.55,
        min: 0,
        max: 1,
        step: 0.01,
      },
    }),
    light: folder({
      // Master toggle for the cinematic sun shaft.
      lightBeamEnabled: { value: true },
      // Source position (top of the visible shaft). Defaults place
      // it in the mid-to-far LEFT of the volume, entering from
      // above the school. The Z default was pulled back from -7 to
      // -9 so the shaft sits clearly *behind* the hero school
      // rather than next to it, per "feels further in the distance".
      beamPositionX: { value: -6, min: -16, max: 16, step: 0.5 },
      beamPositionY: { value: 9, min: 2, max: 20, step: 0.5 },
      beamPositionZ: { value: -9, min: -20, max: 6, step: 0.5 },
      // Tilt from straight-down, around the Z axis. Positive angle
      // tilts the beam toward +X as it descends, so 18deg reads as
      // "sunlight cutting in from above-left".
      beamAngle: { value: 18, min: -60, max: 60, step: 1 },
      // Lateral width of the bright *core* of the beam. The whole
      // illuminated region is wider (width * regionSize). Bumped
      // from 2.8 -- the old default read as a piercing shaft.
      beamWidth: { value: 4.5, min: 0.3, max: 14, step: 0.1 },
      // Vertical length of the shaft.
      beamLength: { value: 16, min: 4, max: 28, step: 0.5 },
      // Master multiplier on the additive brightness consumed by
      // the shader's `alpha` channel. With the wider beam, lower
      // intensity gives the same total energy spread over more
      // pixels -- cathedral light, not flashlight.
      beamIntensity: { value: 1.0, min: 0, max: 3, step: 0.05 },
      // Global opacity multiplier on the whole envelope -- useful
      // for sitting the shaft further back into the haze without
      // changing the warm/cool mix or noise feel.
      beamOpacity: { value: 0.85, min: 0, max: 1, step: 0.01 },
      // Power applied to the Gaussian core; < 1 broadens the
      // plateau, > 1 tightens the centre line back up.
      beamSoftness: { value: 1.5, min: 0.4, max: 6, step: 0.05 },
      // Gaussian sigma for the narrow bright core. Smaller =
      // tighter highlight, larger = looser bright region.
      beamFalloff: { value: 0.5, min: 0.05, max: 1.5, step: 0.01 },
      // Gaussian sigma for the wider diffuse halo. This is the
      // "region of illuminated water" -- the cathedral. Should
      // generally be larger than beamFalloff.
      beamDiffusion: { value: 1.1, min: 0.2, max: 3, step: 0.05 },
      // Amplitude of the slow caustic shimmer baked into the
      // beam. 0 = perfectly smooth beam; ~0.35 = sunlight gently
      // refracted by moving water above.
      beamCausticStrength: { value: 0.35, min: 0, max: 1, step: 0.01 },
      // Spatial frequency of the caustic field. Lower = broader,
      // calmer light blobs; higher = busier shimmer.
      beamNoiseScale: { value: 6, min: 1, max: 24, step: 0.5 },
      // Multiplier on the lateral geometry scale -- this is how
      // far the diffuse halo can reach. With width=4.5 and
      // regionSize=1.8 the geometry is ~8 wide; the bright core
      // still uses `width` worth of UV space.
      beamRegionSize: { value: 1.8, min: 1, max: 4, step: 0.05 },
      beamShimmerSpeed: { value: 1.0, min: 0, max: 3, step: 0.05 },
      // 0 = pure aqua. 1 = strong warm sun. ~0.65 reads as
      // "sunlight diffused through water".
      beamColorWarmth: { value: 0.65, min: 0, max: 1.5, step: 0.05 },
    }),
    salmon: folder({
      // Master switch between the new pixel-art WebP sprites and the
      // legacy SVG art. With the toggle off the school renders via
      // SalmonSvgFallback (and the procedural canvas if that fails).
      useNewSalmonSkins: { value: true },
      // Exactly one fish per school uses the #99 rider sprite when
      // this is true. Switch off to render an all-default school.
      enableRiderSalmon: { value: true },
      // The rider sprite is taller than the default one; a small
      // scale bump keeps it legible without breaking the rule that
      // it behaves like every other fish.
      riderSalmonScaleMultiplier: { value: 1.1, min: 0.5, max: 2.0, step: 0.05 },
      // Multiplier on the rider's color-brightness shimmer (the
      // existing per-fish shimmer envelope is reused). Default 1 ==
      // identical to its non-rider neighbours; >1 makes it pulse
      // slightly brighter so it's easier to spot.
      riderSalmonGlowBoost: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      // Multiplier on shimmer amplitude / frequency scaling. Kept as
      // its own knob in case the user wants to push the rider's
      // visibility up without affecting brightness directly.
      riderSalmonShimmerBoost: { value: 1.15, min: 0.5, max: 3.0, step: 0.05 },
      // Whether the rider can be spooked by the scatter system.
      // Defaults true (rider behaves like everyone else).
      riderSalmonCanScatter: { value: true },
    }),
    letters: folder({
      // Master toggle for the floating "abelcharrow" typography.
      floatingLettersEnabled: { value: true },
      // SDF text fontSize. Default pulled back from 0.62 so the
      // letters read as environmental forms rather than a
      // foreground title.
      letterScale: { value: 0.32, min: 0.08, max: 1.4, step: 0.01 },
      // Base fillOpacity (combined with shimmer pulse + beam catch
      // per frame). Lowered from 0.65 for the ghostly suspended feel.
      letterOpacity: { value: 0.42, min: 0.05, max: 1, step: 0.01 },
      // Per-letter z jitter range. Widened from 0.6 -- letters now
      // span several units in depth so each one can parallax
      // differently and be lit by the sun-shaft individually.
      letterDepthSpread: { value: 3.0, min: 0, max: 8, step: 0.1 },
      // Horizontal step between letter centres. Larger spacing also
      // scales the vertical jitter (see FloatingLetters.jsx).
      // Widened from 0.85 -- the user can drag to discover the
      // full name; only the central few sit comfortably on screen.
      letterSpacing: { value: 1.05, min: 0.3, max: 3.0, step: 0.05 },
      // 0 = pearl-white letters. 1 = letters tinted toward the deep
      // teal of the water medium. Default sits the typography
      // firmly inside the water rather than floating on top.
      letterMurkiness: { value: 0.55, min: 0, max: 1, step: 0.01 },
      // How wide the per-letter shimmer pulse swings.
      letterShimmerStrength: { value: 0.45, min: 0, max: 2, step: 0.05 },
      // Amplitude of the idle bob / drift / wobble. Halved from
      // 0.06 so the letters drift rather than animate.
      letterFloatStrength: { value: 0.035, min: 0, max: 0.4, step: 0.005 },
    }),
    surface: folder({
      // Master toggle for the overhead water-surface layer. The
      // viewer sees the *underside* of the surface from below; the
      // shimmer reads as refracted sunlight.
      surfaceEnabled: { value: true },
      // World-Y of the mean surface level. Camera lives near Y=0, so
      // 14 places it well above the densest part of the school but
      // still inside the fog far-plane so the rim dissolves into the
      // water medium.
      surfaceHeight: { value: 14, min: 6, max: 30, step: 0.5 },
      surfaceOpacity: { value: 0.55, min: 0, max: 1, step: 0.01 },
      // Vertical amplitude of the wave displacement.
      surfaceRippleStrength: { value: 0.45, min: 0, max: 2, step: 0.05 },
      surfaceRippleSpeed: { value: 0.5, min: 0, max: 2, step: 0.05 },
      // How strongly the caustic field is mixed into the base aqua.
      surfaceShimmerStrength: { value: 1.0, min: 0, max: 2.5, step: 0.05 },
      // How much warm yellow is blended into the brightest caustic
      // peaks. 0 = pure aqua highlights; 1 = strongly sun-tinted.
      surfaceYellowIntensity: { value: 0.6, min: 0, max: 1.5, step: 0.05 },
      // Diagonal drift speed of the wave/light field.
      surfaceDiagonalFlow: { value: 1.0, min: 0, max: 3, step: 0.05 },
      // How quickly the rim dissolves into the scene fog colour.
      surfaceFogBlend: { value: 1.0, min: 0, max: 2, step: 0.05 },
    }),
    seabed: folder({
      // Master toggle for the sandy floor. Disabling leaves the
      // empty deep blue below the fish, which can be useful for
      // isolating other layers while tuning.
      seabedEnabled: { value: true },
      // World-Y distance below the camera at which the seabed sits.
      // Sets the visual "bottom" of the world. Also drives where
      // the kelp roots if the kelp layer is enabled below.
      seabedDepth: { value: 12, min: 4, max: 30, step: 0.5 },
      seabedOpacity: { value: 0.85, min: 0, max: 1, step: 0.01 },
      // Amplitude of the broad dune displacement. Kept small so the
      // floor never reads as terrain or mountains.
      seabedRippleStrength: { value: 0.55, min: 0, max: 1.5, step: 0.05 },
      seabedRippleSpeed: { value: 0.4, min: 0, max: 1.5, step: 0.05 },
      // How strongly the warm-gold caustic peaks colour-mix into
      // the base cream sand. 0 = pure white-cream highlights.
      seabedGoldIntensity: { value: 0.55, min: 0, max: 1.5, step: 0.05 },
    }),
    kelp: folder({
      // Master toggle for the kelp/seaweed layer.
      kelpEnabled: { value: true },
      // Strand population. Default lives in the "atmospheric but
      // sparse" zone; pushing toward the upper end gives a denser
      // kelp forest silhouette.
      kelpDensity: { value: 90, min: 0, max: 240, step: 1 },
      // Pushes strands toward the outer rim. 0 = uniform across
      // the annulus around the camera; > 0 keeps the foreground
      // open and stacks more strands in the distance.
      kelpDistanceBias: { value: 1.2, min: 0, max: 3, step: 0.1 },
      kelpSwayStrength: { value: 1.0, min: 0, max: 2.5, step: 0.05 },
      kelpSwaySpeed: { value: 0.6, min: 0, max: 2, step: 0.05 },
      kelpOpacity: { value: 0.55, min: 0, max: 1, step: 0.01 },
    }),
  });

  // Push live Leva values into the radio audio graph. Memoised refs
  // inside RadioContext absorb these without re-creating the graph,
  // so this can fire every render without thrashing AudioContext.
  const radio = useRadio();
  useEffect(() => {
    radio.setEnabled(ambientRadioEnabled);
  }, [radio, ambientRadioEnabled]);
  useEffect(() => {
    radio.setVolume(radioVolume);
  }, [radio, radioVolume]);
  useEffect(() => {
    radio.setFilterStrength(underwaterAudioFilterStrength);
  }, [radio, underwaterAudioFilterStrength]);

  useEffect(() => {
    scene.background = new THREE.Color(BACKGROUND_COLOR);
    // Initial fog must match the Leva defaults above so the first
    // frame doesn't flash with the older heavy haze before the
    // controls push the new values in.
    scene.fog = new THREE.Fog('#0e3850', 10, 42);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => {
    if (!scene.fog) return;
    scene.fog.color.set(fogColor);
    scene.fog.near = fogNear;
    scene.fog.far = Math.max(fogFar, fogNear + 1);
  }, [fogColor, fogNear, fogFar, scene]);

  const lights = useMemo(
    () => (
      <>
        <ambientLight intensity={0.35} color={'#5b7f9c'} />
        <hemisphereLight
          color={'#9fc5e0'}
          groundColor={'#020a12'}
          intensity={0.45}
        />
        <directionalLight
          position={[3, 8, 4]}
          intensity={0.6}
          color={'#bcdcef'}
        />
        <pointLight
          position={[-6, -2, -4]}
          intensity={0.4}
          color={'#3f6f8a'}
          distance={20}
          decay={2}
        />
      </>
    ),
    [],
  );

  return (
    <>
      {lights}
      <CameraRig
        // Move the start position a step deeper into the school so
        // some hero fish are clearly NEAR the viewer on initial
        // load. The cluster centres span +2.5 down to -bounds.z,
        // and with the camera at z=4.5 the closest cluster is now
        // ~2 units in front -- ideal for foreground crossings on
        // refresh without trapping the camera inside dense fish.
        basePosition={[0, 0, 4.5]}
        hoverParallax={{ x: 0.6, y: 0.4 }}
        hoverParallaxStrength={hoverParallaxStrength}
        scrollDepthStrength={scrollDepthStrength}
        cameraZMin={cameraZMin}
        cameraZMax={cameraZMax}
        idleSway={idleSway}
        dragSensitivity={dragSensitivity}
        dragDamping={dragDamping}
        inertiaStrength={inertiaStrength}
        maxPitchDegrees={maxPitchDegrees}
      />
      <BackgroundField
        displacementStrength={displacementStrength}
        noiseScale={noiseScale}
        animationSpeed={animationSpeed}
        gradientIntensity={gradientIntensity}
        pinkAccentStrength={pinkAccentStrength}
        diagonalFlowStrength={diagonalFlowStrength}
        backgroundOpacity={backgroundOpacity}
        fogColor={fogColor}
      />
      <WaterHaze
        layerCount={hazeLayerCount}
        opacity={waterHazeOpacity}
        speed={hazeMovementSpeed}
        color={fogColor}
      />
      {surfaceEnabled && (
        <SurfacePlane
          height={surfaceHeight}
          opacity={surfaceOpacity}
          rippleStrength={surfaceRippleStrength}
          rippleSpeed={surfaceRippleSpeed}
          shimmerStrength={surfaceShimmerStrength}
          yellowIntensity={surfaceYellowIntensity}
          diagonalFlow={surfaceDiagonalFlow}
          fogBlend={surfaceFogBlend}
          fogColor={fogColor}
          fogNear={fogNear}
          fogFar={fogFar}
        />
      )}
      {/*
        Floor of the world. Mounted before the kelp so the kelp
        strands render on top in painter's order; both have
        depthWrite disabled, but a consistent mount order keeps
        the visual stack stable.
      */}
      {seabedEnabled && (
        <Seabed
          depth={seabedDepth}
          opacity={seabedOpacity}
          rippleStrength={seabedRippleStrength}
          rippleSpeed={seabedRippleSpeed}
          goldIntensity={seabedGoldIntensity}
          fogColor={fogColor}
          fogNear={fogNear}
          fogFar={fogFar}
        />
      )}
      {/*
        Kelp forest. Strands root at the seabed Y so flipping the
        seabed depth slider also raises/lowers the kelp anchor.
        When the seabed itself is disabled the kelp still uses the
        same Y as the implicit floor reference.
      */}
      {kelpEnabled && (
        <KelpForest
          count={kelpDensity}
          distanceBias={kelpDistanceBias}
          swayStrength={kelpSwayStrength}
          swaySpeed={kelpSwaySpeed}
          opacity={kelpOpacity}
          seabedY={-seabedDepth}
          fogColor={fogColor}
          fogNear={fogNear}
          fogFar={fogFar}
        />
      )}
      {/*
        Hero school. Three-layer fallback chain:

          1. SalmonSchool  -- new pixel-art WebP sprites + #99 rider.
                              Suspends while textures load.
          2. SalmonSvgFallback -- legacy /fish/salmon.svg art. Used
                              when (a) the user disables the new
                              skins via Leva, or (b) the WebP loads
                              throw at runtime.
          3. FishSchool (no texture prop) -- procedural canvas fish,
                              the ultimate last-resort backup.

        All three accept the same prop surface, so the school's
        movement / shimmer / scatter / bubbles / clustering behaves
        identically regardless of which fallback rung is rendered.
      */}
      {(() => {
        const schoolProps = {
          count: heroFishCount,
          clusterCount: clusters,
          seed: 1337,
          bounds: VOLUME,
          spread: schoolSpread,
          swimSpeed,
          shimmerIntensity,
          foregroundCrossingChance,
          avoidanceRadius: cameraAvoidanceRadius,
          fishDistanceOpacityStrength,
          scatterEnabled,
          randomScatterFrequency,
          scatterRadius,
          scatterStrength,
          scatterDuration,
          scatterRecoverySpeed,
          chainReactionChance,
          bubbleTrailEnabled,
          bubbleSpawnRate,
          bubbleLifetime,
          maxBubbles,
        };
        // Rider-specific props apply to whichever salmon school is
        // currently rendered. The procedural fallback ignores them
        // (no rider texture available), which is fine.
        const riderProps = {
          enableRider: enableRiderSalmon,
          riderScaleMultiplier: riderSalmonScaleMultiplier,
          riderShimmerBoost: riderSalmonShimmerBoost,
          riderGlowBoost: riderSalmonGlowBoost,
          riderCanScatter: riderSalmonCanScatter,
        };
        return (
          <ErrorBoundary
            fallback={<FishSchool {...schoolProps} {...riderProps} />}
          >
            <Suspense fallback={null}>
              {useNewSalmonSkins ? (
                <ErrorBoundary
                  fallback={
                    <Suspense fallback={null}>
                      <SalmonSvgFallback {...schoolProps} {...riderProps} />
                    </Suspense>
                  }
                >
                  <SalmonSchool {...schoolProps} {...riderProps} />
                </ErrorBoundary>
              ) : (
                <SalmonSvgFallback {...schoolProps} {...riderProps} />
              )}
            </Suspense>
          </ErrorBoundary>
        );
      })()}
      {densityLayerEnabled && (
        <>
          {/*
            Distant point-sprite swarms first, so they render under
            the midfield instances and the hero school in painter's
            order. Their material has depthWrite disabled but a
            consistent mount order still helps blending.

            `atmosphericDensity` is a master count multiplier across
            both the midfield and bg layers, so the user can fade the
            whole surround system up/down with a single slider.
            `heroFishDominance` further softens the distant opacities
            so the hero school never has to fight for attention.
          */}
          <BackgroundFishClouds
            density={backgroundCloudDensity * atmosphericDensity}
            speed={backgroundSwarmSpeed * backgroundMotionStrength}
            opacity={
              Math.max(0.04, distantFishOpacity * 0.5) /
              Math.max(0.5, heroFishDominance)
            }
            peripheralDensity={peripheralDensity}
          />
          {/*
            Midfield surround layer. The salmon SVG is shared with the
            hero school; `useTexture` deduplicates so this is free.
            The component remounts when count/radius/spread change so
            the per-instance buffers are correctly sized -- this is
            fine because all of those controls are slow human-driven
            changes, not per-frame.
          */}
          <Suspense fallback={null}>
            <MidfieldSchool
              count={Math.round(midfieldFishCount * atmosphericDensity)}
              worldRadius={worldRadius}
              verticalSpread={verticalSpread}
              swimSpeed={swimSpeed * 0.25 * backgroundMotionStrength}
              distantFishOpacity={
                distantFishOpacity / Math.max(0.5, heroFishDominance)
              }
              peripheralDensity={peripheralDensity}
              heroFishDominance={heroFishDominance}
              fogColor={fogColor}
              fogNear={fogNear}
              fogFar={fogFar}
            />
          </Suspense>
        </>
      )}
      {lightBeamEnabled && (
        <LightBeam
          position={[beamPositionX, beamPositionY, beamPositionZ]}
          angleDegrees={beamAngle}
          width={beamWidth}
          length={beamLength}
          regionSize={beamRegionSize}
          intensity={beamIntensity}
          opacity={beamOpacity}
          softness={beamSoftness}
          falloff={beamFalloff}
          diffusion={beamDiffusion}
          causticStrength={beamCausticStrength}
          noiseScale={beamNoiseScale}
          shimmerSpeed={beamShimmerSpeed}
          colorWarmth={beamColorWarmth}
          fogNear={fogNear}
          fogFar={fogFar}
        />
      )}
      {floatingLettersEnabled && (
        <FloatingLetters
          depthSpread={letterDepthSpread}
          floatStrength={letterFloatStrength}
          shimmerStrength={letterShimmerStrength}
          opacity={letterOpacity}
          scale={letterScale}
          spacing={letterSpacing}
          murkiness={letterMurkiness}
          // Forward the beam's *live* configuration so letters
          // brighten when they drift inside the shaft.
          beam={{
            enabled: lightBeamEnabled,
            position: [beamPositionX, beamPositionY, beamPositionZ],
            angleDegrees: beamAngle,
            width: beamWidth,
            length: beamLength,
          }}
        />
      )}
      <DustParticles
        count={Math.max(20, Math.round(particleCount * particleDepthDensity))}
        bounds={DUST_VOLUME}
        opacity={particleOpacity}
        shimmerStrength={particleShimmerStrength}
      />
      {/*
        Continuous ambient bubble field. Mounted alongside the dust
        so both suspended-life systems share the same render pass
        cluster. BubbleTrails (scatter-only) lives inside FishSchool
        and stays untouched -- the two bubble systems are
        complementary.
      */}
      <AmbientBubbles
        maxCount={ambientBubbleCount}
        spawnRate={ambientBubbleSpawnRate}
        opacity={bubbleOpacity}
        riseSpeed={bubbleRiseSpeed}
        sizeVariation={bubbleSizeVariation}
        bounds={BUBBLE_VOLUME}
      />
      <AmbientRadio
        enabled={ambientRadioEnabled}
        glowIntensity={radioGlowIntensity}
        position={[radioPosition.x, radioPosition.y, radioPosition.z]}
      />
    </>
  );
}
