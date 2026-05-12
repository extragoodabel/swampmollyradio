import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useControls, folder } from 'leva';
import * as THREE from 'three';
import CameraRig from './CameraRig.jsx';
import FishSchool from './FishSchool.jsx';
import WebpFishSchool from './WebpFishSchool.jsx';
import SalmonSvgFallback from './SalmonSvgFallback.jsx';
import DustParticles from './DustParticles.jsx';
import AmbientBubbles from './AmbientBubbles.jsx';
import BackgroundField from './BackgroundField.jsx';
import WaterHaze from './WaterHaze.jsx';
import SalmonOceanVault from './SalmonOceanVault.jsx';
import AmbientRadio from './AmbientRadio.jsx';
import MidfieldSchool from './MidfieldSchool.jsx';
import BackgroundFishClouds from './BackgroundFishClouds.jsx';
import SurfacePlane from './SurfacePlane.jsx';
import Seabed from './Seabed.jsx';
import KelpForest from './KelpForest.jsx';
import SwampSunkenCar from './SwampSunkenCar.jsx';
import LightBeam from './LightBeam.jsx';
import FloatingLetters from './FloatingLetters.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { useRadio } from '../audio/RadioContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { resolveRadioSlotIndex } from '../theme/themes.js';

const VOLUME = { x: 16, y: 5.5, z: 18 };
const DUST_VOLUME = { x: 20, y: 9, z: 24 };
// Ambient bubbles travel further up than the dust field; they spawn
// near the seabed and need headroom above the school before they
// recycle. Wider Y than DUST_VOLUME, similar XZ extent.
const BUBBLE_VOLUME = { x: 18, y: 11, z: 22 };

/**
 * Camera Z distance so floating letters fit in view. Multi-line copy
 * uses the widest run for width and accounts for vertical span.
 */
function typographyFramingCameraZ(text, letterSpacing, vFovDegrees, aspect) {
  const lines = text.split('\n');
  const maxRun = Math.max(
    2,
    ...lines.map((ln) => Math.max(1, ln.length)),
  );
  const estWidth = (maxRun - 1) * letterSpacing + letterSpacing * 0.45;
  const vFovRad = (vFovDegrees * Math.PI) / 180;
  const tanHalfV = Math.tan(vFovRad / 2);
  const tanHalfH = Math.max(0.28, aspect) * tanHalfV;

  const distW = estWidth / (2 * tanHalfH) + 1.05;

  let distance = distW;
  if (lines.length > 1) {
    const rowGap = letterSpacing * 1.02;
    const vertSpan = (lines.length - 1) * rowGap + letterSpacing * 0.92;
    const distH = vertSpan / (2 * tanHalfV) + 1.02;
    distance = Math.max(distW, distH);
  }

  return THREE.MathUtils.clamp(distance, 6.25, 14.5);
}

export default function Scene() {
  const { scene, camera, size } = useThree();
  const { theme, themeId } = useTheme();

  const [{
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
    kelpMossRatio,
  }, setLeva] = useControls(() => ({
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
      // High enough that typography-framed starts stay inside the range.
      cameraZMax: { value: 15, min: 1, max: 22, step: 0.5 },
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
      // Theme defaults are applied on mode switch via `setLeva`
      // (see effect below); the schema captures the first-loaded theme.
      fogColor: { value: theme.water.fogColor },
      fogNear: { value: theme.water.fogNear, min: 0, max: 20, step: 0.5 },
      fogFar: { value: theme.water.fogFar, min: 10, max: 60, step: 1 },
      waterHazeOpacity: {
        value: theme.water.waterHazeOpacity,
        min: 0,
        max: 0.8,
        step: 0.01,
      },
      hazeLayerCount: {
        value: theme.water.hazeLayerCount,
        min: 0,
        max: 6,
        step: 1,
      },
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
      // Master toggle for the cinematic sun shaft. Shader + layout are
      // theme-specific (`ocean` vs `swamp` in themes.js), not just colours.
      lightBeamEnabled: { value: true },
      beamPositionX: {
        value: theme.beam.position[0],
        min: -16,
        max: 16,
        step: 0.5,
      },
      beamPositionY: {
        value: theme.beam.position[1],
        min: 2,
        max: 22,
        step: 0.5,
      },
      beamPositionZ: {
        value: theme.beam.position[2],
        min: -22,
        max: 6,
        step: 0.5,
      },
      beamAngle: {
        value: theme.beam.angleDegrees,
        min: -60,
        max: 60,
        step: 1,
      },
      beamWidth: { value: theme.beam.width, min: 0.3, max: 16, step: 0.1 },
      beamLength: {
        value: theme.beam.length,
        min: 4,
        max: 32,
        step: 0.5,
      },
      beamIntensity: {
        value: theme.beam.intensity,
        min: 0,
        max: 3,
        step: 0.05,
      },
      beamOpacity: {
        value: theme.beam.opacity,
        min: 0,
        max: 1,
        step: 0.01,
      },
      beamSoftness: {
        value: theme.beam.softness,
        min: 0.35,
        max: 6,
        step: 0.05,
      },
      beamFalloff: {
        value: theme.beam.falloff,
        min: 0.05,
        max: 2.5,
        step: 0.01,
      },
      beamDiffusion: {
        value: theme.beam.diffusion,
        min: 0.2,
        max: 3.5,
        step: 0.05,
      },
      beamCausticStrength: {
        value: theme.beam.causticStrength,
        min: 0,
        max: 1,
        step: 0.01,
      },
      beamNoiseScale: {
        value: theme.beam.noiseScale,
        min: 1,
        max: 24,
        step: 0.5,
      },
      beamRegionSize: {
        value: theme.beam.regionSize,
        min: 1,
        max: 4,
        step: 0.05,
      },
      beamShimmerSpeed: {
        value: theme.beam.shimmerSpeed,
        min: 0,
        max: 3,
        step: 0.05,
      },
      beamColorWarmth: {
        value: theme.beam.colorWarmth,
        min: 0,
        max: 1.5,
        step: 0.05,
      },
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
      // SDF text fontSize. Kept small so even letters that drift
      // close to the camera don't dominate the frame.
      letterScale: { value: 0.3, min: 0.08, max: 1.4, step: 0.01 },
      // Base fillOpacity (combined with shimmer pulse + beam catch
      // + haze fade per frame). Default balances murk with readability
      // at the typography-framed opening camera distance.
      letterOpacity: { value: 0.54, min: 0.05, max: 1, step: 0.01 },
      // Per-letter z jitter range. Pushed to 7.0 -- some letters
      // sit deep in the haze, others drift just in front of the
      // school, separating the name across the water column.
      letterDepthSpread: { value: 7.0, min: 0, max: 14, step: 0.1 },
      // Horizontal step between letter centres. Also drives the Y
      // jitter (see FloatingLetters.jsx).
      letterSpacing: { value: 1.2, min: 0.3, max: 3.5, step: 0.05 },
      // 0 = faded off-white. 1 = deep desaturated teal water tint.
      // Default sits well past the midpoint so the letters look
      // water-stained / sea-worn rather than pearl-bright.
      letterMurkiness: { value: 0.78, min: 0, max: 1, step: 0.01 },
      // Multi-sine broken shimmer amplitude on fillOpacity. Drives
      // the "uneven highlight" feel rather than a clean pulse.
      letterShimmerStrength: { value: 0.55, min: 0, max: 2, step: 0.05 },
      // Amplitude of the current-driven swish: position drift +
      // X-flap / Y-twist / Z-tilt + tiny vertical flutter all
      // scale with this. Higher = more cloth-like motion.
      letterFloatStrength: { value: 0.06, min: 0, max: 0.4, step: 0.005 },
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
      kelpDensity: { value: 90, min: 0, max: 400, step: 1 },
      // Pushes strands toward the outer rim. 0 = uniform across
      // the annulus around the camera; > 0 keeps the foreground
      // open and stacks more strands in the distance.
      kelpDistanceBias: { value: 1.2, min: 0, max: 3, step: 0.1 },
      kelpSwayStrength: { value: 1.0, min: 0, max: 2.5, step: 0.05 },
      kelpSwaySpeed: { value: 0.6, min: 0, max: 2, step: 0.05 },
      kelpOpacity: { value: 0.55, min: 0, max: 1, step: 0.01 },
      // Fraction of kelp strands rendered as broad moss clumps
      // rather than slim spiraling ribbons. Initial value follows
      // the active theme (0.35 in swamp, 0 in Salmon Days Radio); user can
      // still scrub manually after theme load.
      kelpMossRatio: { value: theme.kelp.mossRatio, min: 0, max: 1, step: 0.01 },
    }),
  }), []);

  // Initial `value:` defaults above are captured on first Scene mount.
  // Theme switches do NOT remount Scene (camera + schools stay live);
  // instead the effect below pushes fog/haze/beam/kelp moss whenever
  // `themeId` changes, so Leva and shaders track the new atmosphere.

  const radioInTypography = useMemo(() => {
    const idx = resolveRadioSlotIndex(
      theme.letters.text,
      theme.letters.radioSlot,
    );
    return (
      ambientRadioEnabled && floatingLettersEnabled && idx != null
    );
  }, [
    theme.letters.text,
    theme.letters.radioSlot,
    ambientRadioEnabled,
    floatingLettersEnabled,
  ]);

  const initialTypographyCameraZ = useMemo(() => {
    const effSpacing =
      letterSpacing * (theme.letters.letterSpacingMul ?? 1);
    return typographyFramingCameraZ(
      theme.letters.text,
      effSpacing,
      camera.fov,
      size.width / Math.max(1, size.height),
    );
  }, [
    theme.letters.text,
    theme.letters.letterSpacingMul,
    letterSpacing,
    camera.fov,
    size.width,
    size.height,
  ]);

  const cameraStartZ = THREE.MathUtils.clamp(
    floatingLettersEnabled ? initialTypographyCameraZ : 4.5,
    cameraZMin + 0.5,
    cameraZMax,
  );

  const atm = theme.atmosphere;

  const backgroundFieldProps = {
    displacementStrength,
    noiseScale,
    animationSpeed,
    gradientIntensity,
    pinkAccentStrength,
    diagonalFlowStrength,
    backgroundOpacity,
    fogColor,
    fogNear,
    fogFar,
    position: [0, 0, -28],
    size: [110, 60],
    segments: [220, 130],
    palette: 'default',
    ...(atm?.backgroundField ?? {}),
  };

  const surfacePlaneProps = {
    height: surfaceHeight,
    opacity: surfaceOpacity,
    rippleStrength: surfaceRippleStrength,
    rippleSpeed: surfaceRippleSpeed,
    shimmerStrength: surfaceShimmerStrength,
    yellowIntensity: surfaceYellowIntensity,
    diagonalFlow: surfaceDiagonalFlow,
    fogBlend: surfaceFogBlend,
    fogColor,
    fogNear,
    fogFar,
    planeSize: 80,
    baseColor: '#5a90a8',
    highlightColor: '#a8d7e6',
    yellowColor: '#f6e9b4',
    ...(atm?.surfacePlane ?? {}),
  };

  const seabedProps = {
    depth: seabedDepth,
    opacity: seabedOpacity,
    rippleStrength: seabedRippleStrength,
    rippleSpeed: seabedRippleSpeed,
    goldIntensity: seabedGoldIntensity,
    fogBlend: 1,
    fogColor,
    fogNear,
    fogFar,
    planeSize: 96,
    sandColor: '#d8c8a4',
    highlightColor: '#f4ecd6',
    goldColor: '#e7c685',
    ...(atm?.seabed ?? {}),
  };

  const dustAtm = atm?.dustParticles ?? {};
  const waterHazeAtm = atm?.waterHaze ?? {};
  const salmonOceanVaultAtm = atm?.salmonOceanVault;

  // Force the live Leva store to match the active theme whenever
  // `themeId` changes. The Leva store survives without a Scene
  // remount; schema defaults only apply on first mount, so this
  // effect reapplies waters+beam+moss for each mode.
  useEffect(() => {
    const patch = {
      fogColor: theme.water.fogColor,
      fogNear: theme.water.fogNear,
      fogFar: theme.water.fogFar,
      waterHazeOpacity: theme.water.waterHazeOpacity,
      hazeLayerCount: theme.water.hazeLayerCount,
      kelpMossRatio: theme.kelp.mossRatio,
      ...theme.kelp.levaAnchors,
      beamPositionX: theme.beam.position[0],
      beamPositionY: theme.beam.position[1],
      beamPositionZ: theme.beam.position[2],
      beamAngle: theme.beam.angleDegrees,
      beamWidth: theme.beam.width,
      beamLength: theme.beam.length,
      beamIntensity: theme.beam.intensity,
      beamOpacity: theme.beam.opacity,
      beamSoftness: theme.beam.softness,
      beamFalloff: theme.beam.falloff,
      beamDiffusion: theme.beam.diffusion,
      beamCausticStrength: theme.beam.causticStrength,
      beamNoiseScale: theme.beam.noiseScale,
      beamRegionSize: theme.beam.regionSize,
      beamShimmerSpeed: theme.beam.shimmerSpeed,
      beamColorWarmth: theme.beam.colorWarmth,
      ...theme.atmosphere?.levaAnchors,
    };
    setLeva(patch);
    // setLeva is stable across renders; deps cover every theme
    // field we forward into Leva so a config change in themes.js
    // also re-applies if it happens at runtime.
  }, [
    themeId,
    setLeva,
    theme.water.fogColor,
    theme.water.fogNear,
    theme.water.fogFar,
    theme.water.waterHazeOpacity,
    theme.water.hazeLayerCount,
    theme.kelp.mossRatio,
    theme.kelp.levaAnchors,
    theme.atmosphere?.levaAnchors,
    theme.beam.position,
    theme.beam.angleDegrees,
    theme.beam.width,
    theme.beam.length,
    theme.beam.intensity,
    theme.beam.opacity,
    theme.beam.softness,
    theme.beam.falloff,
    theme.beam.diffusion,
    theme.beam.causticStrength,
    theme.beam.noiseScale,
    theme.beam.regionSize,
    theme.beam.shimmerSpeed,
    theme.beam.colorWarmth,
  ]);

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

  // Background colour + initial fog. Both follow the active theme so
  // toggling modes recolours the void behind the haze in lockstep
  // with the new fog/haze defaults pushed into Leva above. The fog
  // object itself is created once per theme; the next effect below
  // keeps its parameters in sync with the live Leva sliders.
  useEffect(() => {
    scene.background = new THREE.Color(theme.water.backgroundColor);
    scene.fog = new THREE.Fog(
      theme.water.fogColor,
      theme.water.fogNear,
      theme.water.fogFar,
    );
    return () => {
      scene.fog = null;
    };
  }, [
    scene,
    theme.water.backgroundColor,
    theme.water.fogColor,
    theme.water.fogNear,
    theme.water.fogFar,
  ]);

  useEffect(() => {
    if (!scene.fog) return;
    scene.fog.color.set(fogColor);
    scene.fog.near = fogNear;
    scene.fog.far = Math.max(fogFar, fogNear + 1);
  }, [fogColor, fogNear, fogFar, scene]);

  const lights = useMemo(() => {
    const swamp = themeId === 'swamp';
    const salmon = themeId === 'salmonDaysRadio';
    return (
      <>
        <ambientLight
          intensity={swamp ? 0.46 : salmon ? 0.52 : 0.35}
          color={swamp ? '#6490a8' : salmon ? '#c4d7f0' : '#5b7f9c'}
        />
        <hemisphereLight
          color={swamp ? '#b8d4e8' : salmon ? '#eef4ff' : '#9fc5e0'}
          groundColor={swamp ? '#051015' : salmon ? '#081a2c' : '#020a12'}
          intensity={swamp ? 0.52 : salmon ? 0.58 : 0.45}
        />
        <directionalLight
          position={[3, 8, 4]}
          intensity={swamp ? 0.72 : salmon ? 0.68 : 0.6}
          color={swamp ? '#d2e8f8' : salmon ? '#fff3e0' : '#bcdcef'}
        />
        <pointLight
          position={[-6, -2, -4]}
          intensity={swamp ? 0.48 : salmon ? 0.36 : 0.4}
          color={swamp ? '#5588a0' : salmon ? '#7a9cc8' : '#3f6f8a'}
          distance={swamp ? 22 : salmon ? 38 : 22}
          decay={2}
        />
      </>
    );
  }, [themeId]);

  return (
    <>
      {lights}
      <CameraRig
        // Z is chosen so the full themed letter string fits in the
        // viewport width at the current aspect + FOV (see
        // `typographyFramingCameraZ`). Scroll wheel still pushes
        // deeper into the school or pulls back within Leva clamps.
        basePosition={[0, 0, cameraStartZ]}
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
      {themeId === 'salmonDaysRadio' && (
        <SalmonOceanVault
          deepColor={salmonOceanVaultAtm?.deepColor ?? '#020408'}
          midColor={salmonOceanVaultAtm?.midColor ?? '#102544'}
          surfaceTint={salmonOceanVaultAtm?.surfaceTint ?? '#fff6fc'}
          shimmer={salmonOceanVaultAtm?.shimmer ?? 1.2}
        />
      )}
      <BackgroundField {...backgroundFieldProps} />
      <WaterHaze
        layerCount={hazeLayerCount}
        opacity={waterHazeOpacity}
        speed={hazeMovementSpeed}
        color={fogColor}
        causticColor={waterHazeAtm?.causticColor ?? '#7fb8c8'}
        abyssVertFade={
          themeId === 'salmonDaysRadio'
            ? (waterHazeAtm?.abyssVertFade ?? 0.92)
            : 0
        }
        hazeProfile={
          themeId === 'salmonDaysRadio'
            ? 'salmon'
            : themeId === 'swamp'
              ? 'swamp'
              : 'default'
        }
      />
      {surfaceEnabled && themeId !== 'salmonDaysRadio' && (
        <SurfacePlane {...surfacePlaneProps} />
      )}
      {/*
        Floor of the world. Mounted before the kelp so the kelp
        strands render on top in painter's order; both have
        depthWrite disabled, but a consistent mount order keeps
        the visual stack stable.
      */}
      {seabedEnabled && themeId !== 'salmonDaysRadio' && (
        <Seabed {...seabedProps} />
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
          innerRadius={theme.kelp.innerRadius ?? 4}
          outerRadius={theme.kelp.outerRadius ?? 22}
          seabedY={
            -(seabedProps.depth + (theme.kelp.seabedAnchorExtra ?? 0))
          }
          fogColor={fogColor}
          fogNear={fogNear}
          fogFar={fogFar}
          // Theme-driven fraction of strands rendered as broad moss
          // growths. Swamp mode pushes ~0.35; Salmon Days Radio 0.
          mossRatio={kelpMossRatio}
          trailerRatio={theme.kelp.trailerRatio ?? 0}
          mossHeightMul={theme.kelp.mossHeightMul ?? 1}
          mossThicknessMul={theme.kelp.mossThicknessMul ?? 1}
          ribbonHeightMul={theme.kelp.ribbonHeightMul ?? 1}
          ribbonThicknessMul={theme.kelp.ribbonThicknessMul ?? 1}
          visualMode={themeId === 'salmonDaysRadio' ? 'openOcean' : 'default'}
          abyssBlend={theme.kelp.abyssBlend ?? 0}
          verticalDream={theme.kelp.verticalDream ?? 0.12}
          dreamVerticalSpeed={theme.kelp.dreamVerticalSpeed ?? 0.18}
        />
      )}
      {themeId === 'swamp' && (
        <SwampSunkenCar
          seabedY={-seabedProps.depth}
          fogNear={fogNear}
          fogFar={fogFar}
          fogColor={fogColor}
        />
      )}
      {lightBeamEnabled && themeId !== 'salmonDaysRadio' && (
        <LightBeam
          style={theme.beam.style}
          secondLayer={theme.beam.secondLayer}
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
          coldColor={theme.beam.coldColor}
          warmColor={theme.beam.warmColor}
          accentColor={theme.beam.accentColor}
          accentStrength={theme.beam.accentStrength}
          oceanCoreMix={theme.beam.oceanCoreMix}
          uvDrift={theme.beam.uvDrift}
          fogCut={theme.beam.fogCut}
          fogLightReach={theme.beam.fogLightReach}
          swampNarrow={theme.beam.swampNarrow}
          swampChop={theme.beam.swampChop}
          murkFog={theme.beam.murkFog}
          swampFogFMul={theme.beam.swampFogFMul ?? 1}
          swampFogFloor={theme.beam.swampFogFloor ?? 0}
          swampDiscardMin={theme.beam.swampDiscardMin ?? 0.00035}
          fogNear={fogNear}
          fogFar={fogFar}
        />
      )}
      {/*
        Hero school. Three-layer fallback chain shared across themes:

          1. WebpFishSchool -- theme.fish.mainTexture (+ optional
                              riderTexture). Pixel-art WebP sprites,
                              suspends while textures load. The
                              `key={themeId}` forces a remount when
                              the theme toggles so a previously-
                              loaded salmon texture isn't left in
                              place after switching to catfish.
          2. SalmonSvgFallback -- legacy /fish/salmon.svg art. Used
                              when (a) the user disables the new
                              skins via Leva, or (b) the theme's
                              WebPs fail to load at runtime.
          3. FishSchool (no texture prop) -- procedural canvas fish,
                              the ultimate last-resort backup.

        All three accept the same prop surface, so the school's
        movement / shimmer / scatter / bubbles / clustering behaves
        identically regardless of which fallback rung is rendered.
      */}
      {(() => {
        const heroLightBeam = {
          enabled: lightBeamEnabled && themeId !== 'salmonDaysRadio',
          position: [beamPositionX, beamPositionY, beamPositionZ],
          angleDegrees: beamAngle,
          width: beamWidth,
          length: beamLength,
          regionSize: beamRegionSize,
          depthMargin: theme.beam.fishDepthMargin,
          insideBoost: theme.beam.fishBoostInside,
          behindBoost: theme.beam.fishBoostBehind,
        };
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
          lightBeam: heroLightBeam,
        };
        // Rider-specific props apply to whichever school renders.
        // We gate enableRider on whether the active theme actually
        // ships a rider texture -- in swamp mode there's no rider
        // asset, so we don't flag any fish as the rider at all.
        const themeHasRider = !!theme.fish.riderTexture;
        const riderProps = {
          enableRider: enableRiderSalmon && themeHasRider,
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
                  <WebpFishSchool
                    key={themeId}
                    mainUrl={theme.fish.mainTexture}
                    riderUrl={theme.fish.riderTexture}
                    textureFacesLeft={theme.fish.textureFacesLeft}
                    {...schoolProps}
                    {...riderProps}
                  />
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
      {floatingLettersEnabled && (
        <FloatingLetters
          text={theme.letters.text}
          depthSpread={letterDepthSpread}
          floatStrength={letterFloatStrength}
          shimmerStrength={letterShimmerStrength}
          opacity={letterOpacity}
          scale={letterScale}
          spacing={
            letterSpacing * (theme.letters.letterSpacingMul ?? 1)
          }
          murkiness={Math.min(
            1,
            letterMurkiness +
              (theme.letters.letterMurkinessBoost ?? 0),
          )}
          rowGapMul={theme.letters.rowGapMul ?? 1}
          intraLineYJitterMul={
            theme.letters.intraLineYJitterMul ?? 1
          }
          interRowJitterMul={theme.letters.interRowJitterMul ?? 0}
          lineXJitterMul={theme.letters.lineXJitterMul ?? 1}
          beam={{
            enabled: lightBeamEnabled && themeId !== 'salmonDaysRadio',
            position: [beamPositionX, beamPositionY, beamPositionZ],
            angleDegrees: beamAngle,
            width: beamWidth,
            length: beamLength,
            regionSize: beamRegionSize,
          }}
          radioSlot={theme.letters.radioSlot}
          radioEmbedded={radioInTypography}
          radioGlowIntensity={radioGlowIntensity}
          beaconAtmosphere={theme.radio?.beaconAtmosphere}
          typographyReadability={theme.letters.typographyReadability}
        />
      )}
      <DustParticles
        count={Math.max(20, Math.round(particleCount * particleDepthDensity))}
        bounds={DUST_VOLUME}
        opacity={particleOpacity * (dustAtm.opacityMul ?? 1)}
        shimmerStrength={
          particleShimmerStrength * (dustAtm.shimmerMul ?? 1)
        }
        color={dustAtm.color ?? '#bcd5e6'}
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
      {!radioInTypography && (
        <AmbientRadio
          enabled={ambientRadioEnabled}
          glowIntensity={radioGlowIntensity}
          position={[radioPosition.x, radioPosition.y, radioPosition.z]}
          beaconAtmosphere={theme.radio?.beaconAtmosphere}
        />
      )}
    </>
  );
}
