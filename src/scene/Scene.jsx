import { useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useControls, folder, button } from 'leva';
import * as THREE from 'three';
import CameraRig from './CameraRig.jsx';
import WebpFishSchool from './WebpFishSchool.jsx';
import SalmonSvgFallback from './SalmonSvgFallback.jsx';
import DustParticles from './DustParticles.jsx';
import AmbientBubbles from './AmbientBubbles.jsx';
import BackgroundField from './BackgroundField.jsx';
import WaterHaze from './WaterHaze.jsx';
import SalmonOceanVault from './SalmonOceanVault.jsx';
import SalmonOceanCanopy from './SalmonOceanCanopy.jsx';
import AmbientCompanionSchools from './AmbientCompanionSchools.jsx';
import MidfieldSchool from './MidfieldSchool.jsx';
import BackgroundFishClouds from './BackgroundFishClouds.jsx';
import SalmonSatelliteSchools from './SalmonSatelliteSchools.jsx';
import SalmonShadowFishSilhouettes from './SalmonShadowFishSilhouettes.jsx';
import SurfacePlane from './SurfacePlane.jsx';
import Seabed from './Seabed.jsx';
import KelpForest from './KelpForest.jsx';
import SwampSunkenCar from './SwampSunkenCar.jsx';
import SwampSunkenFiatPanda from './SwampSunkenFiatPanda.jsx';
import SwampMollyPoem, {
  SwampFloatingWaterWords,
} from './SwampMollyPoem.jsx';
import SwampHacklesHtmlPanel from './SwampHacklesHtmlPanel.jsx';
import { rustyCarInteractRef } from './rustyCarClickBridge.js';
import {
  HACKLES_SIGN_REVEAL_DELAY_MS,
  hacklesSignEulerRadTowardCenter,
  poemGroupEulerRadTowardCenter,
  swampHacklesSignWorldPosition,
  swampPoemWorldPositionFromRustyCar,
} from './swampPoemPlacement.js';
import SalmonWhaleSkeleton from './SalmonWhaleSkeleton.jsx';
import LightBeam from './LightBeam.jsx';
import AmbientRadio from './AmbientRadio.jsx';
import FloatingLetters from './FloatingLetters.jsx';
import CanvasFloatingLetters from './CanvasFloatingLetters.jsx';
import TypoEmergencyTest from './TypoEmergencyTest.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import FloatingCreditsBag from './FloatingCreditsBag.jsx';
import { normalizeFloatingPhrase } from './letterLayout.js';
import { useRadio } from '../audio/RadioContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { getTheme, resolveRadioSlotIndex } from '../theme/themes.js';
import {
  buildSalmonEnvForScene,
  getSalmonEnv,
  getSalmonRestoreStep,
  SALMON_ENV,
  SALMON_RESTORE_FULL,
} from '../theme/salmonRecovery.js';
import { buildSwampSceneGates } from '../theme/swampRecovery.js';
import { STUDIO_CREDIT_LINE_RAW } from '../content/studioCreditLine.js';
import AquariumEngineDebug from '../debug/AquariumEngineDebug.jsx';
import {
  AQ_CAR_DEBUG,
  AQ_CAR_INFO_DEBUG,
  AQ_DEBUG,
  AQ_ENGINE_HUD,
  AQ_LITE_ATMOSPHERE,
  AQ_SKIP_TYPOGRAPHY,
  AQ_TYPO_DEBUG_LOG,
  AQ_TYPO_TEST,
  AQ_TYPO_TROIKA,
  AQ_SCENE_MINIMAL,
} from '../debug/aquariumRecovery.js';
import { logRecoveryLayer } from '../debug/recoveryLayerLog.js';
import { reportSceneMountPhase } from '../debug/sceneMountTrace.js';
import EmergencyFishSchool from './EmergencyFishSchool.jsx';
import {
  buildLevaSanitizePatch,
  guardCameraRails,
  guardClusterCount,
  guardHeroFishCount,
  guardHazeLayerCount,
  guardSchoolSpread,
  guardSwimSpeed,
  guardVolumeFog,
} from './runtimeGuards.js';

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

  return THREE.MathUtils.clamp(distance, 6.25, 16.25);
}

export default function Scene() {
  const { scene, camera, size } = useThree();
  const { theme, themeId } = useTheme();

  const salmonEnv = useMemo(() => buildSalmonEnvForScene(themeId), [themeId]);
  const salmonRestoreStep = useMemo(
    () =>
      themeId === 'salmonDaysRadio'
        ? getSalmonRestoreStep()
        : SALMON_RESTORE_FULL,
    [themeId],
  );
  const swampGates = useMemo(() => buildSwampSceneGates(themeId), [themeId]);
  const [swampPoemPresent, setSwampPoemPresent] = useState(true);
  const [swampFiatCreditOpen, setSwampFiatCreditOpen] = useState(false);
  const [swampHacklesUi, setSwampHacklesUi] = useState(
    /** @type {'hidden' | 'waiting' | 'shown' | 'hiding'} */ ('hidden'),
  );
  const hacklesRevealTimerRef = useRef(0);
  const lastRustyHacklesClickMsRef = useRef(0);

  useEffect(() => {
    if (themeId !== 'swamp') {
      setSwampFiatCreditOpen(false);
      setSwampHacklesUi('hidden');
      if (hacklesRevealTimerRef.current) {
        window.clearTimeout(hacklesRevealTimerRef.current);
        hacklesRevealTimerRef.current = 0;
      }
    }
  }, [themeId]);

  useEffect(() => {
    if (!AQ_CAR_INFO_DEBUG && !AQ_CAR_DEBUG) return;
    console.info('[aqcarinfodebug] swampHacklesUi state', {
      swampHacklesUi,
      hacklesPanelMounted:
        swampHacklesUi === 'shown' || swampHacklesUi === 'hiding',
    });
  }, [swampHacklesUi]);

  useEffect(
    () => () => {
      if (hacklesRevealTimerRef.current) {
        window.clearTimeout(hacklesRevealTimerRef.current);
        hacklesRevealTimerRef.current = 0;
      }
    },
    [],
  );

  const onHacklesFadeOutComplete = useCallback(() => {
    setSwampHacklesUi('hidden');
  }, []);

  const onRustyCarHacklesToggle = useCallback(() => {
    const nowMs = performance.now();
    if (nowMs - lastRustyHacklesClickMsRef.current < 250) {
      if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
        console.info('[aqcarinfodebug] rusty car click ignored (debounce 250ms)');
      }
      return;
    }
    lastRustyHacklesClickMsRef.current = nowMs;

    setSwampHacklesUi((prev) => {
      if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
        console.info('[aqcarinfodebug] rusty car click received', {
          prevSwampHacklesUi: prev,
        });
      }
      if (prev === 'waiting') {
        return prev;
      }
      if (prev === 'hiding') {
        return prev;
      }
      if (prev === 'shown') {
        if (hacklesRevealTimerRef.current) {
          window.clearTimeout(hacklesRevealTimerRef.current);
          hacklesRevealTimerRef.current = 0;
        }
        if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
          console.info('[aqcarinfodebug] hackles state: shown → hiding (fade out)');
        }
        return 'hiding';
      }

      if (hacklesRevealTimerRef.current) {
        window.clearTimeout(hacklesRevealTimerRef.current);
        hacklesRevealTimerRef.current = 0;
      }
      hacklesRevealTimerRef.current = window.setTimeout(() => {
        hacklesRevealTimerRef.current = 0;
        setSwampHacklesUi((p) => {
          const next = p === 'waiting' ? 'shown' : p;
          if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
            console.info('[aqcarinfodebug] hackles reveal timer completed', {
              prior: p,
              next,
            });
          }
          return next;
        });
      }, HACKLES_SIGN_REVEAL_DELAY_MS);
      if (AQ_CAR_INFO_DEBUG || AQ_CAR_DEBUG) {
        console.info('[aqcarinfodebug] hackles reveal timer started', {
          delayMs: HACKLES_SIGN_REVEAL_DELAY_MS,
          nextStateAfterSchedule: 'waiting',
        });
      }
      return 'waiting';
    });
  }, []);

  useLayoutEffect(() => {
    rustyCarInteractRef.toggleHackles = onRustyCarHacklesToggle;
    return () => {
      rustyCarInteractRef.toggleHackles = null;
    };
  }, [onRustyCarHacklesToggle]);

  useEffect(() => {
    if (themeId !== 'salmonDaysRadio' || salmonRestoreStep < 13) return;
    console.info(
      '[aquarium] Salmon restore step ≥13 — SalmonWhaleSkeleton + NHM Imaging (see README)',
    );
  }, [themeId, salmonRestoreStep]);

  useEffect(() => {
    if (themeId !== 'swamp' || swampGates.rs < 13) return;
    logRecoveryLayer('swamp', 'extras-credits', {
      note: 'No credits coin mesh in repo; hook reserved',
    });
  }, [themeId, swampGates.rs]);

  useEffect(() => {
    reportSceneMountPhase(`Scene.full:${themeId}`);
  }, [themeId]);

  useEffect(() => {
    camera.near = 0.05;
    camera.far = 12000;
    camera.updateProjectionMatrix();
  }, [camera]);

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
  }, setLeva] = useControls(() => {
    const levaOf = (off, spec) => (off ? { ...spec, disabled: true } : spec);
    const dDensity =
      !(
        (themeId !== 'salmonDaysRadio' || salmonEnv.densityCloudsMidfield) &&
        (themeId !== 'swamp' || swampGates.density)
      );
    const dLight =
      AQ_LITE_ATMOSPHERE ||
      (themeId === 'salmonDaysRadio' && salmonRestoreStep < 8) ||
      (themeId === 'swamp' && !swampGates.lightBeam);
    const dDust =
      (themeId === 'salmonDaysRadio' && salmonRestoreStep < 4) ||
      (themeId === 'swamp' && !swampGates.particles);
    const dAmbBub =
      (themeId === 'salmonDaysRadio' && salmonRestoreStep < 4) ||
      (themeId === 'swamp' && !swampGates.bubbles);
    const dHaze =
      (themeId === 'salmonDaysRadio' && !salmonEnv.waterHaze) ||
      (themeId === 'swamp' && !swampGates.waterHaze);
    const dBg =
      (themeId === 'swamp' && !swampGates.background) ||
      (themeId === 'salmonDaysRadio' && !salmonEnv.backdrop);
    const dSwampSurface =
      themeId !== 'swamp' || (themeId === 'swamp' && !swampGates.surface);
    const dSwampSeabed =
      themeId !== 'swamp' || (themeId === 'swamp' && !swampGates.seabed);
    const dSwampKelp =
      themeId !== 'swamp' || (themeId === 'swamp' && !swampGates.kelp);
    const phraseGate = normalizeFloatingPhrase(theme.letters.text ?? '');
    const slotGate = resolveRadioSlotIndex(phraseGate, theme.letters.radioSlot);
    const dRadioPos =
      slotGate != null &&
      !AQ_SKIP_TYPOGRAPHY &&
      (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 2) &&
      (themeId !== 'swamp' || swampGates.typography) &&
      (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 3) &&
      (themeId !== 'swamp' || swampGates.orb);
    const dLetters =
      AQ_SKIP_TYPOGRAPHY ||
      (themeId === 'salmonDaysRadio' && salmonRestoreStep < 2) ||
      (themeId === 'swamp' && !swampGates.typography);

    return {
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
    }),
    density: folder({
      // Master toggle for the surround-density layers (midfield,
      // distant clouds, and salmon distant silhouette fish). Disable
      // to inspect the hero school in isolation.
      densityLayerEnabled: levaOf(dDensity, { value: true }),
      // Mid-distance instanced billboards. 0 disables the layer.
      // Defaults pulled WAY back from the previous 420; the goal of
      // the midfield is now atmospheric presence, not an extra school.
      midfieldFishCount: levaOf(dDensity, { value: 110, min: 0, max: 800, step: 10 }),
      // Multiplier applied to each background cloud's base count.
      // Pulled back to 0.3 so the deep clouds read as texture, not
      // population.
      backgroundCloudDensity: levaOf(dDensity, { value: 0.3, min: 0, max: 3, step: 0.05 }),
      // Vertical extent (radius along Y) of the midfield surround
      // volume. Larger = fish further above and below the camera.
      verticalSpread: levaOf(dDensity, { value: 10, min: 4, max: 22, step: 0.5 }),
      // Horizontal/depth radius of the midfield surround volume.
      // Pushed out from 18 to 24 so the average distant fish is now
      // *further* from the camera, reading as a smaller silhouette.
      worldRadius: levaOf(dDensity, { value: 24, min: 8, max: 40, step: 1 }),
      // Global opacity multiplier for the midfield instances.
      distantFishOpacity: levaOf(dDensity, { value: 0.32, min: 0, max: 1, step: 0.05 }),
      // Multiplier applied to background cloud rotation speed.
      backgroundSwarmSpeed: levaOf(dDensity, { value: 0.4, min: 0, max: 3, step: 0.05 }),
      // Edge falloff: midfield fish at the rim of the world sphere
      // fade toward this opacity multiplier. Keeps the periphery from
      // looking populated and gives a sense of breathing negative
      // space.
      peripheralDensity: levaOf(dDensity, { value: 0.25, min: 0, max: 1, step: 0.05 }),
      // Master multiplier on all distant motion (cloud rotation,
      // midfield current bias). 1.0 = legacy churn, 0.4 = calm drift.
      backgroundMotionStrength: levaOf(dDensity, { value: 0.35, min: 0, max: 2, step: 0.05 }),
      // Master multiplier on the *counts* of both midfield + bg
      // layers. Use this to fade the entire density system up or
      // down together without touching individual sliders.
      atmosphericDensity: levaOf(dDensity, { value: 0.6, min: 0, max: 2, step: 0.05 }),
      // Boosts hero visual dominance by strengthening distant *atmospheric*
      // silhouette / fog crush (see MidfieldSchool `uAtmosphereCrush`), not
      // by lowering distant alpha.
      heroFishDominance: levaOf(dDensity, { value: 1.4, min: 0.5, max: 3, step: 0.05 }),
    }),
    scatter: folder({
      // Hero, salmon satellites, ambient companions, typography beacon
      // satellite school (when theme enables it).
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
      // Wider Z rails so open-ocean + sunken-car exploration fit inside Leva.
      cameraZMin: { value: -6, min: -36, max: 2, step: 0.5 },
      // High enough that typography-framed starts stay inside the range.
      cameraZMax: { value: 15, min: 1, max: 96, step: 0.5 },
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
      displacementStrength: levaOf(dBg, { value: 2.5, min: 0, max: 8, step: 0.1 }),
      noiseScale: levaOf(dBg, { value: 2.6, min: 0.5, max: 8, step: 0.1 }),
      animationSpeed: levaOf(dBg, { value: 0.18, min: 0, max: 1.0, step: 0.01 }),
      gradientIntensity: levaOf(dBg, { value: 1.0, min: 0, max: 2, step: 0.05 }),
      pinkAccentStrength: levaOf(dBg, { value: 0.6, min: 0, max: 2, step: 0.05 }),
      diagonalFlowStrength: levaOf(dBg, { value: 1.0, min: 0, max: 3, step: 0.05 }),
      backgroundOpacity: levaOf(dBg, { value: 0.85, min: 0, max: 1, step: 0.01 }),
    }),
    water: folder({
      // Theme defaults are applied on mode switch via `setLeva`
      // (see effect below); the schema captures the first-loaded theme.
      fogColor: { value: theme.water.fogColor },
      // Wide rails: Salmon Days uses fogFar > 120; caps were clamping
      // theme patches and encouraging accidental ultra-tight fog bands.
      fogNear: { value: theme.water.fogNear, min: 0, max: 80, step: 0.5 },
      fogFar: { value: theme.water.fogFar, min: 8, max: 220, step: 1 },
      waterHazeOpacity: levaOf(dHaze, {
        value: theme.water.waterHazeOpacity,
        min: 0,
        max: 0.8,
        step: 0.01,
      }),
      hazeLayerCount: levaOf(dHaze, {
        value: theme.water.hazeLayerCount,
        min: 0,
        max: 6,
        step: 1,
      }),
      hazeMovementSpeed: levaOf(dHaze, { value: 1.0, min: 0, max: 3, step: 0.05 }),
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
      particleCount: levaOf(dDust, { value: 320, min: 80, max: 2000, step: 20 }),
      particleOpacity: levaOf(dDust, { value: 0.40, min: 0, max: 1, step: 0.01 }),
      // Multiplier on the per-particle sine pulse amplitude. 0 ==
      // particles hold their base alpha; 1 == default "catch the
      // light" pulse; >1 == more visible twinkle.
      particleShimmerStrength: levaOf(dDust, { value: 0.8, min: 0, max: 2.5, step: 0.05 }),

      // ---- Ambient bubbles (AmbientBubbles) ---------------------
      //
      // `ambientBubbleCount` is the pool *capacity*: at most this
      // many bubbles can be on screen at once. Real on-screen count
      // is governed by spawnRate * average-lifetime.
      //
      // Pulled back from 60 / 1.2 so bubbles read as occasional
      // life rather than a steady column. The user can crank both
      // sliders for a "fish farm" vibe.
      ambientBubbleCount: levaOf(dAmbBub, { value: 24, min: 0, max: 240, step: 5 }),
      // Bubbles per second. Combined with bubbleRiseSpeed this also
      // sets average bubble lifetime, which feeds back into how
      // dense the column reads.
      ambientBubbleSpawnRate: levaOf(dAmbBub, { value: 0.4, min: 0, max: 6, step: 0.05 }),
      bubbleOpacity: levaOf(dAmbBub, { value: 0.40, min: 0, max: 1, step: 0.01 }),
      // Multiplier on the per-bubble base rise rate. The base rate
      // is randomised per bubble for variety; this scales the lot.
      bubbleRiseSpeed: levaOf(dAmbBub, { value: 1.0, min: 0.1, max: 3, step: 0.05 }),
      // Multiplier on the random portion of bubble base size.
      // 0 == tiny uniform bubbles; 2 == strong size variety.
      bubbleSizeVariation: levaOf(dAmbBub, { value: 1.0, min: 0, max: 2.5, step: 0.05 }),
    }),
    radio: folder({
      ambientRadioEnabled: { value: true },
      radioVolume: { value: 0.5, min: 0, max: 1, step: 0.01 },
      // Bumped from 1.0 -- the beacon is the one diegetic
      // interaction in the scene, and the recent water/particle
      // changes were making it disappear into the haze.
      radioGlowIntensity: { value: 1.35, min: 0, max: 3, step: 0.05 },
      // Embedded typography beacon: position is driven by the slot
      // (this control applies to standalone ambient orb only).
      radioPosition: levaOf(dRadioPos, { value: { x: 3, y: 0.6, z: -4.5 }, step: 0.1 }),
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
      lightBeamEnabled: levaOf(dLight, { value: true }),
      beamPositionX: levaOf(dLight, {
        value: theme.beam.position[0],
        min: -16,
        max: 16,
        step: 0.5,
      }),
      beamPositionY: levaOf(dLight, {
        value: theme.beam.position[1],
        min: 2,
        max: 22,
        step: 0.5,
      }),
      beamPositionZ: levaOf(dLight, {
        value: theme.beam.position[2],
        min: -22,
        max: 6,
        step: 0.5,
      }),
      beamAngle: levaOf(dLight, {
        value: theme.beam.angleDegrees,
        min: -60,
        max: 60,
        step: 1,
      }),
      beamWidth: levaOf(dLight, { value: theme.beam.width, min: 0.3, max: 16, step: 0.1 }),
      beamLength: levaOf(dLight, {
        value: theme.beam.length,
        min: 4,
        max: 32,
        step: 0.5,
      }),
      beamIntensity: levaOf(dLight, {
        value: theme.beam.intensity,
        min: 0,
        max: 3,
        step: 0.05,
      }),
      beamOpacity: levaOf(dLight, {
        value: theme.beam.opacity,
        min: 0,
        max: 1,
        step: 0.01,
      }),
      beamSoftness: levaOf(dLight, {
        value: theme.beam.softness,
        min: 0.35,
        max: 6,
        step: 0.05,
      }),
      beamFalloff: levaOf(dLight, {
        value: theme.beam.falloff,
        min: 0.05,
        max: 2.5,
        step: 0.01,
      }),
      beamDiffusion: levaOf(dLight, {
        value: theme.beam.diffusion,
        min: 0.2,
        max: 3.5,
        step: 0.05,
      }),
      beamCausticStrength: levaOf(dLight, {
        value: theme.beam.causticStrength,
        min: 0,
        max: 1,
        step: 0.01,
      }),
      beamNoiseScale: levaOf(dLight, {
        value: theme.beam.noiseScale,
        min: 1,
        max: 24,
        step: 0.5,
      }),
      beamRegionSize: levaOf(dLight, {
        value: theme.beam.regionSize,
        min: 1,
        max: 4,
        step: 0.05,
      }),
      beamShimmerSpeed: levaOf(dLight, {
        value: theme.beam.shimmerSpeed,
        min: 0,
        max: 3,
        step: 0.05,
      }),
      beamColorWarmth: levaOf(dLight, {
        value: theme.beam.colorWarmth,
        min: 0,
        max: 1.5,
        step: 0.05,
      }),
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
      // Master toggle for floating environmental typography.
      floatingLettersEnabled: levaOf(dLetters, { value: true }),
      // SDF text fontSize. Kept small so even letters that drift
      // close to the camera don't dominate the frame.
      letterScale: levaOf(dLetters, { value: 0.34, min: 0.08, max: 1.4, step: 0.01 }),
      // Base fillOpacity (combined with shimmer pulse + beam catch
      // + haze fade per frame). Default balances murk with readability
      // at the typography-framed opening camera distance.
      letterOpacity: levaOf(dLetters, { value: 0.7, min: 0.05, max: 1, step: 0.01 }),
      // Per-letter z range: theme layout uses a shallow ordered arc +
      // jitter so phrases stay readable; this caps overall depth feel.
      letterDepthSpread: levaOf(dLetters, { value: 4.6, min: 0, max: 14, step: 0.1 }),
      // Horizontal step between letter centres. Also drives the Y
      // jitter (see FloatingLetters.jsx).
      letterSpacing: levaOf(dLetters, { value: 1.2, min: 0.3, max: 3.5, step: 0.05 }),
      // 0 = faded off-white. 1 = deep desaturated teal water tint.
      // Default sits well past the midpoint so the letters look
      // water-stained / sea-worn rather than pearl-bright.
      letterMurkiness: levaOf(dLetters, { value: 0.78, min: 0, max: 1, step: 0.01 }),
      // Multi-sine broken shimmer amplitude on fillOpacity. Drives
      // the "uneven highlight" feel rather than a clean pulse.
      letterShimmerStrength: levaOf(dLetters, { value: 0.64, min: 0, max: 2, step: 0.05 }),
      // Amplitude of the current-driven swish: position drift +
      // X-flap / Y-twist / Z-tilt + tiny vertical flutter all
      // scale with this. Higher = more cloth-like motion.
      letterFloatStrength: levaOf(dLetters, { value: 0.06, min: 0, max: 0.4, step: 0.005 }),
    }),
    surface: folder({
      // Master toggle for the overhead water-surface layer. The
      // viewer sees the *underside* of the surface from below; the
      // shimmer reads as refracted sunlight.
      surfaceEnabled: levaOf(dSwampSurface, { value: true }),
      // World-Y of the mean surface level. Camera lives near Y=0, so
      // 14 places it well above the densest part of the school but
      // still inside the fog far-plane so the rim dissolves into the
      // water medium.
      surfaceHeight: levaOf(dSwampSurface, { value: 14, min: 6, max: 30, step: 0.5 }),
      surfaceOpacity: levaOf(dSwampSurface, { value: 0.55, min: 0, max: 1, step: 0.01 }),
      // Vertical amplitude of the wave displacement.
      surfaceRippleStrength: levaOf(dSwampSurface, { value: 0.45, min: 0, max: 2, step: 0.05 }),
      surfaceRippleSpeed: levaOf(dSwampSurface, { value: 0.5, min: 0, max: 2, step: 0.05 }),
      // How strongly the caustic field is mixed into the base aqua.
      surfaceShimmerStrength: levaOf(dSwampSurface, { value: 1.0, min: 0, max: 2.5, step: 0.05 }),
      // How much warm yellow is blended into the brightest caustic
      // peaks. 0 = pure aqua highlights; 1 = strongly sun-tinted.
      surfaceYellowIntensity: levaOf(dSwampSurface, { value: 0.6, min: 0, max: 1.5, step: 0.05 }),
      // Diagonal drift speed of the wave/light field.
      surfaceDiagonalFlow: levaOf(dSwampSurface, { value: 1.0, min: 0, max: 3, step: 0.05 }),
      // How quickly the rim dissolves into the scene fog colour.
      surfaceFogBlend: levaOf(dSwampSurface, { value: 1.0, min: 0, max: 2, step: 0.05 }),
    }),
    seabed: folder({
      // Master toggle for the sandy floor. Disabling leaves the
      // empty deep blue below the fish, which can be useful for
      // isolating other layers while tuning.
      seabedEnabled: levaOf(dSwampSeabed, { value: true }),
      // World-Y distance below the camera at which the seabed sits.
      // Sets the visual "bottom" of the world. Also drives where
      // the kelp roots if the kelp layer is enabled below.
      seabedDepth: levaOf(dSwampSeabed, { value: 12, min: 4, max: 30, step: 0.5 }),
      seabedOpacity: levaOf(dSwampSeabed, { value: 0.85, min: 0, max: 1, step: 0.01 }),
      // Amplitude of the broad dune displacement. Kept small so the
      // floor never reads as terrain or mountains.
      seabedRippleStrength: levaOf(dSwampSeabed, { value: 0.55, min: 0, max: 1.5, step: 0.05 }),
      seabedRippleSpeed: levaOf(dSwampSeabed, { value: 0.4, min: 0, max: 1.5, step: 0.05 }),
      // How strongly the warm-gold caustic peaks colour-mix into
      // the base cream sand. 0 = pure white-cream highlights.
      seabedGoldIntensity: levaOf(dSwampSeabed, { value: 0.55, min: 0, max: 1.5, step: 0.05 }),
    }),
    kelp: folder({
      // Master toggle for the kelp/seaweed layer.
      kelpEnabled: levaOf(dSwampKelp, { value: true }),
      // Strand population. Default lives in the "atmospheric but
      // sparse" zone; pushing toward the upper end gives a denser
      // kelp forest silhouette.
      kelpDensity: levaOf(dSwampKelp, { value: 90, min: 0, max: 400, step: 1 }),
      // Pushes strands toward the outer rim. 0 = uniform across
      // the annulus around the camera; > 0 keeps the foreground
      // open and stacks more strands in the distance.
      kelpDistanceBias: levaOf(dSwampKelp, { value: 1.2, min: 0, max: 3, step: 0.1 }),
      kelpSwayStrength: levaOf(dSwampKelp, { value: 1.0, min: 0, max: 2.5, step: 0.05 }),
      kelpSwaySpeed: levaOf(dSwampKelp, { value: 0.6, min: 0, max: 2, step: 0.05 }),
      kelpOpacity: levaOf(dSwampKelp, { value: 0.55, min: 0, max: 1, step: 0.01 }),
      // Fraction of kelp strands rendered as broad moss clumps
      // rather than slim spiraling ribbons. Swamp ~0.42; Salmon Days keeps
      // 0 — kelp layer is not mounted in open-water mode.
      kelpMossRatio: levaOf(dSwampKelp, { value: theme.kelp.mossRatio, min: 0, max: 1, step: 0.01 }),
    }),
    recovery: folder({
      '— Reset Leva storage —': button(() => {
        try {
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.toLowerCase().includes('leva')) keys.push(k);
          }
          keys.forEach((key) => localStorage.removeItem(key));
        } catch (_) {
          /* ignore */
        }
        window.location.reload();
      }),
    }),
  };
  }, [
    themeId,
    salmonRestoreStep,
    theme,
    swampGates,
    salmonEnv,
  ]);

  // Default ON when Leva omits the key (`undefined && …` was falsy — hid letters forever).
  const mountFloatingLetters =
    floatingLettersEnabled !== false &&
    floatingLettersEnabled !== 'false' &&
    !AQ_SKIP_TYPOGRAPHY;

  const mountLettersEffective =
    mountFloatingLetters &&
    (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 2) &&
    (themeId !== 'swamp' || swampGates.typography);

  // Initial `value:` defaults above are captured on first Scene mount.
  // Theme switches do NOT remount Scene (camera + schools stay live);
  // instead the effect below pushes fog/haze/beam/kelp moss whenever
  // `themeId` changes, so Leva and shaders track the new atmosphere.

  const floatingLettersPhrase = useMemo(
    () => normalizeFloatingPhrase(theme.letters.text ?? ''),
    [theme.letters.text],
  );

  const radioSlotIndex = useMemo(
    () => resolveRadioSlotIndex(floatingLettersPhrase, theme.letters.radioSlot),
    [floatingLettersPhrase, theme.letters.radioSlot],
  );

  const radioInTypography = useMemo(
    () =>
      ambientRadioEnabled &&
      mountLettersEffective &&
      radioSlotIndex != null &&
      (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 3) &&
      (themeId !== 'swamp' || swampGates.orb),
    [
      ambientRadioEnabled,
      mountLettersEffective,
      radioSlotIndex,
      themeId,
      salmonRestoreStep,
      swampGates.orb,
    ],
  );

  const standaloneAmbientRadioShows = useMemo(
    () =>
      !radioInTypography &&
      ambientRadioEnabled &&
      (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 3) &&
      (themeId !== 'swamp' || swampGates.orb),
    [
      radioInTypography,
      ambientRadioEnabled,
      themeId,
      salmonRestoreStep,
      swampGates.orb,
    ],
  );

  const safeLetterOpacity = useMemo(() => {
    const o = Number(letterOpacity);
    if (!Number.isFinite(o)) return 0.58;
    return THREE.MathUtils.clamp(o, 0.22, 1);
  }, [letterOpacity]);

  const safeRadioGlowIntensity = useMemo(() => {
    const g = Number(radioGlowIntensity);
    if (!Number.isFinite(g)) return 1;
    return THREE.MathUtils.clamp(g, 0.4, 4);
  }, [radioGlowIntensity]);

  const typographyWorldYOffset =
    Number(theme.letters.typographyWorldYOffset) || 0;

  const beaconCompanionFishMerged = useMemo(() => {
    const bc = theme.radio?.beaconCompanionFish;
    if (!bc || bc.enabled === false) return null;
    return {
      ...bc,
      mainTexture: bc.mainTexture ?? theme.fish.mainTexture,
      riderTexture: bc.riderTexture ?? theme.fish.riderTexture,
      textureFacesLeft: bc.textureFacesLeft ?? theme.fish.textureFacesLeft,
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
  }, [
    theme.radio?.beaconCompanionFish,
    theme.fish.mainTexture,
    theme.fish.riderTexture,
    theme.fish.textureFacesLeft,
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
  ]);

  const floatingTypographyProps = useMemo(
    () => {
      const tr = theme.letters.typographyReadability;
      const ax = tr?.anchor?.[0] ?? 0;
      const ay = (tr?.anchor?.[1] ?? 0) + typographyWorldYOffset;
      const az = tr?.anchor?.[2] ?? 0;
      return {
      text: floatingLettersPhrase,
      depthSpread: letterDepthSpread,
      floatStrength: letterFloatStrength,
      shimmerStrength: letterShimmerStrength,
      opacity: safeLetterOpacity,
      scale: letterScale,
      spacing: letterSpacing * (theme.letters.letterSpacingMul ?? 1),
      murkiness: Math.min(
        1,
        letterMurkiness + (theme.letters.letterMurkinessBoost ?? 0),
      ),
      rowGapMul: theme.letters.rowGapMul ?? 1,
      intraLineYJitterMul: theme.letters.intraLineYJitterMul ?? 1,
      interRowJitterMul: theme.letters.interRowJitterMul ?? 0,
      lineXJitterMul: theme.letters.lineXJitterMul ?? 1,
      floatLayout: theme.letters.floatLayout,
      beam: {
        enabled:
          lightBeamEnabled &&
          (themeId === 'salmonDaysRadio'
            ? salmonRestoreStep >= 8
            : themeId === 'swamp' && swampGates.lightBeam),
        position: [beamPositionX, beamPositionY, beamPositionZ],
        angleDegrees: beamAngle,
        width: beamWidth,
        length: beamLength,
        regionSize: beamRegionSize,
      },
      radioSlot: theme.letters.radioSlot,
      radioEmbedded: radioInTypography,
      radioGlowIntensity: safeRadioGlowIntensity,
      beaconAtmosphere: theme.radio?.beaconAtmosphere,
      beaconVisual: theme.radio?.beaconVisual,
      typographyReadability: tr
        ? { ...tr, anchor: [ax, ay, az] }
        : tr,
      typographyTint: theme.letters.typographyTint ?? null,
      safeClampZ: 4.25,
      beaconPlacementResetKey: themeId,
      beaconCompanionFish: beaconCompanionFishMerged,
    };
    },
    [
      floatingLettersPhrase,
      theme.letters.letterSpacingMul,
      theme.letters.rowGapMul,
      theme.letters.intraLineYJitterMul,
      theme.letters.interRowJitterMul,
      theme.letters.lineXJitterMul,
      theme.letters.floatLayout,
      theme.letters.radioSlot,
      theme.letters.typographyReadability,
      theme.letters.typographyTint,
      theme.letters.letterMurkinessBoost,
      theme.radio?.beaconAtmosphere,
      theme.radio?.beaconVisual,
      letterDepthSpread,
      letterFloatStrength,
      letterShimmerStrength,
      safeLetterOpacity,
      letterScale,
      letterSpacing,
      letterMurkiness,
      lightBeamEnabled,
      themeId,
      salmonRestoreStep,
      swampGates.lightBeam,
      beamPositionX,
      beamPositionY,
      beamPositionZ,
      beamAngle,
      beamWidth,
      beamLength,
      beamRegionSize,
      radioInTypography,
      safeRadioGlowIntensity,
      typographyWorldYOffset,
      beaconCompanionFishMerged,
    ],
  );

  useEffect(() => {
    if (!AQ_TYPO_DEBUG_LOG || !mountLettersEffective) return;
    console.info('[aquarium] Scene typography', {
      activeTheme: themeId,
      phrase: floatingLettersPhrase,
      canvasFallbackDefault: !AQ_TYPO_TROIKA,
    });
  }, [themeId, floatingLettersPhrase, mountLettersEffective]);

  const safeRadioPosition = useMemo(() => {
    const x = Number(radioPosition?.x);
    const y = Number(radioPosition?.y);
    const z = Number(radioPosition?.z);
    return [
      Number.isFinite(x) ? x : 3,
      Number.isFinite(y) ? y : 0.6,
      Number.isFinite(z) ? z : -4.5,
    ];
  }, [radioPosition]);

  useEffect(() => {
    const restoreOn =
      (themeId === 'swamp' && swampGates.active) ||
      (themeId === 'salmonDaysRadio' && salmonRestoreStep < SALMON_RESTORE_FULL);
    if (!restoreOn) return;

    let parsedAquariumtheme = null;
    let parsedAqswamprestore = null;
    let parsedAqsalmonrestore = null;
    try {
      const u = new URLSearchParams(window.location.search);
      parsedAquariumtheme = u.get('aquariumtheme');
      parsedAqswamprestore = u.get('aqswamprestore');
      parsedAqsalmonrestore = u.get('aqsalmonrestore');
    } catch {
      /* ignore */
    }

    const salmonEnvAfterKill = getSalmonEnv();

    const SWAMP_LAYER_MIN = {
      background: 1,
      typography: 2,
      orb: 3,
      particles: 4,
      bubbles: 4,
      waterHaze: 5,
      surface: 6,
      seabed: 6,
      kelp: 7,
      lightBeam: 8,
      car1: 9,
      car2: 10,
      companions: 12,
      density: 12,
    };

    const swampLayerGates = {};
    if (themeId === 'swamp') {
      const killMap = [
        ['background', 'backdrop'],
        ['waterHaze', 'haze'],
        ['typography', 'typography'],
        ['orb', 'orb'],
        ['particles', 'particles'],
        ['bubbles', 'bubbles'],
        ['surface', 'surface'],
        ['seabed', 'seabed'],
        ['kelp', 'vegetation'],
        ['lightBeam', 'lightbeam'],
        ['car1', 'car1'],
        ['car2', 'car2'],
        ['companions', 'companions'],
        ['density', 'density'],
      ];
      for (const [layer, killKey] of killMap) {
        const on = swampGates[layer];
        let status;
        if (on) status = 'mount';
        else if (swampGates.kill[killKey]) status = 'killed_by_query';
        else if (
          swampGates.active &&
          swampGates.rs < (SWAMP_LAYER_MIN[layer] ?? 99)
        ) {
          status = 'skipped_low_step';
        } else {
          status = 'skipped_low_step';
        }
        swampLayerGates[layer] = { status, gate: on };
      }
      let hlStatus;
      if (swampGates.car1Headlights) hlStatus = 'mount';
      else if (swampGates.kill.headlights) hlStatus = 'killed_by_query';
      else if (swampGates.active && swampGates.rs < 11) {
        hlStatus = 'skipped_low_step';
      } else if (!swampGates.car1) hlStatus = 'skipped_low_step';
      else hlStatus = 'skipped_low_step';
      swampLayerGates.car1Headlights = {
        status: hlStatus,
        gate: swampGates.car1Headlights,
      };
    }

    const SALMON_LAYER_MIN = {
      vault: 5,
      waterHaze: 6,
      distantSilhouettes: 7,
      backdrop: 9,
      satelliteSchools: 10,
      densityCloudsMidfield: 11,
      canopy: 12,
      whaleSkeleton: 13,
    };

    const salmonLayerGates = {};
    if (themeId === 'salmonDaysRadio') {
      for (const key of Object.keys(salmonEnv)) {
        const on = !!salmonEnv[key];
        let status;
        if (on) status = 'mount';
        else if (!SALMON_ENV[key]) status = 'disabled_by_env';
        else if (!salmonEnvAfterKill[key]) status = 'killed_by_query';
        else if (
          SALMON_LAYER_MIN[key] != null &&
          salmonRestoreStep < SALMON_LAYER_MIN[key]
        ) {
          status = 'skipped_low_step';
        } else {
          status = 'skipped_low_step';
        }
        salmonLayerGates[key] = { status, gate: on };
      }
    }

    const typoEnvOff =
      AQ_SKIP_TYPOGRAPHY ||
      floatingLettersEnabled === false ||
      floatingLettersEnabled === 'false';

    const typographyFinalStatus = (() => {
      if (mountLettersEffective) return 'mount';
      if (typoEnvOff) return 'disabled_by_env';
      if (themeId === 'swamp' && swampGates.kill.typography) {
        return 'killed_by_query';
      }
      if (themeId === 'swamp' && swampGates.active && swampGates.rs < 2) {
        return 'skipped_low_step';
      }
      if (
        themeId === 'salmonDaysRadio' &&
        salmonRestoreStep < SALMON_RESTORE_FULL &&
        salmonRestoreStep < 2
      ) {
        return 'skipped_low_step';
      }
      if (themeId === 'swamp' && !swampGates.typography) {
        return 'skipped_low_step';
      }
      return 'skipped_low_step';
    })();

    const activeRestoreEnv =
      themeId === 'swamp'
        ? {
            mode: 'swamp',
            aqswamprestore: swampGates.rs,
            aqswampkill: swampGates.kill,
            gates: {
              background: swampGates.background,
              waterHaze: swampGates.waterHaze,
              typography: swampGates.typography,
              orb: swampGates.orb,
              particles: swampGates.particles,
              bubbles: swampGates.bubbles,
              surface: swampGates.surface,
              seabed: swampGates.seabed,
              kelp: swampGates.kelp,
              lightBeam: swampGates.lightBeam,
              car1: swampGates.car1,
              poem: swampGates.poem,
              car2: swampGates.car2,
              car1Headlights: swampGates.car1Headlights,
              car2Headlights: swampGates.car2Headlights,
              companions: swampGates.companions,
              density: swampGates.density,
            },
          }
        : {
            mode: 'salmon',
            aqsalmonrestore: salmonRestoreStep,
            salmonEnvLayerGates: salmonEnv,
            salmonEnvAfterAqsalmonkill: salmonEnvAfterKill,
            SALMON_ENV_template: { ...SALMON_ENV },
          };

    console.info('[aquarium-restore] progression', {
      parsedUrlAquariumtheme: parsedAquariumtheme,
      canonicalThemeId: themeId,
      themeResolvesCanonicalMismatch:
        parsedAquariumtheme != null &&
        String(parsedAquariumtheme).trim() !== themeId,
      parsedAqswamprestore,
      parsedAqsalmonrestore,
      effectiveSwampRestoreStep: themeId === 'swamp' ? swampGates.rs : null,
      effectiveSalmonRestoreStep:
        themeId === 'salmonDaysRadio' ? salmonRestoreStep : null,
      activeRestoreEnv,
      swampLayerGates:
        themeId === 'swamp' ? swampLayerGates : null,
      salmonLayerGates:
        themeId === 'salmonDaysRadio' ? salmonLayerGates : null,
      typography: {
        mountFloatingLetters,
        AQ_SKIP_TYPOGRAPHY,
        floatingLettersEnabled,
        gateTypography_swamp:
          themeId === 'swamp' ? swampGates.typography : null,
        gateTypography_salmon_ge2:
          themeId !== 'salmonDaysRadio' ? null : salmonRestoreStep >= 2,
        mountLettersEffective,
        typographyFinalStatus,
      },
      orb: {
        radioInTypography_embeddedPath: radioInTypography,
        standaloneAmbientRadio_shows: standaloneAmbientRadioShows,
        resolvedPath: radioInTypography
          ? 'embedded_in_typography'
          : standaloneAmbientRadioShows
            ? 'standalone_AmbientRadio'
            : 'off',
        ambientRadioEnabled,
        radioSlotIndex,
      },
    });
  }, [
    themeId,
    swampGates,
    salmonRestoreStep,
    salmonEnv,
    mountLettersEffective,
    mountFloatingLetters,
    floatingLettersEnabled,
    radioInTypography,
    standaloneAmbientRadioShows,
    ambientRadioEnabled,
    radioSlotIndex,
  ]);

  const initialTypographyCameraZ = useMemo(() => {
    const effSpacing =
      letterSpacing * (theme.letters.letterSpacingMul ?? 1);
    return typographyFramingCameraZ(
      floatingLettersPhrase,
      effSpacing,
      camera.fov,
      size.width / Math.max(1, size.height),
    );
  }, [
    floatingLettersPhrase,
    theme.letters.letterSpacingMul,
    letterSpacing,
    camera.fov,
    size.width,
    size.height,
  ]);

  const salmonCameraZMul =
    themeId === 'salmonDaysRadio'
      ? Number(theme.atmosphere?.salmonInitialCameraZMul) || 1
      : 1;

  const heroSchoolBounds = useMemo(() => {
    const hb = theme.atmosphere?.heroSchoolBounds;
    if (
      hb &&
      Number.isFinite(hb.x) &&
      Number.isFinite(hb.y) &&
      Number.isFinite(hb.z)
    ) {
      return { x: hb.x, y: hb.y, z: hb.z };
    }
    return VOLUME;
  }, [theme.atmosphere?.heroSchoolBounds]);

  const [cameraZMinLive, cameraZMaxLive] = useMemo(
    () => guardCameraRails(cameraZMin, cameraZMax),
    [cameraZMin, cameraZMax],
  );

  const cameraStartZRaw = THREE.MathUtils.clamp(
    mountLettersEffective
      ? initialTypographyCameraZ * salmonCameraZMul
      : 4.5,
    cameraZMinLive + 0.5,
    cameraZMaxLive,
  );
  const cameraStartZ = Number.isFinite(cameraStartZRaw)
    ? cameraStartZRaw
    : THREE.MathUtils.clamp(
        8.5,
        cameraZMinLive + 0.5,
        cameraZMaxLive,
      );

  const [volumeFogNear, volumeFogFar] = useMemo(
    () =>
      guardVolumeFog(
        fogNear,
        fogFar,
        theme.water.fogNear,
        theme.water.fogFar,
      ),
    [fogNear, fogFar, theme.water.fogNear, theme.water.fogFar],
  );

  /**
   * Salmon incremental rebuild: optional clouds + midfield (`salmonEnv.densityCloudsMidfield`).
   * Shadow-fish silhouettes mount separately (see below).
   */
  const densitySurroundOn =
    densityLayerEnabled &&
    (themeId !== 'salmonDaysRadio' || salmonEnv.densityCloudsMidfield) &&
    (themeId !== 'swamp' || swampGates.density);

  const safeWaterHazeOpacity = THREE.MathUtils.clamp(
    Number(waterHazeOpacity) || theme.water.waterHazeOpacity,
    0,
    0.55,
  );
  /** Stabilization: cap stacked camera haze planes (additive drift can white-out). */
  const stabilityHazeLayerCount = Math.max(
    0,
    Math.min(guardHazeLayerCount(hazeLayerCount, 'Scene.hazeLayerCount'), 5),
  );
  const stabilityHazeOpacity = THREE.MathUtils.clamp(
    safeWaterHazeOpacity * 0.72,
    0,
    0.38,
  );

  const recoveryLite = AQ_LITE_ATMOSPHERE;
  const displayHazeLayerCount = recoveryLite
    ? Math.min(1, stabilityHazeLayerCount)
    : stabilityHazeLayerCount;
  const displayHazeOpacity = recoveryLite
    ? Math.min(0.1, stabilityHazeOpacity)
    : stabilityHazeOpacity;

  useEffect(() => {
    if (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= SALMON_RESTORE_FULL) {
      return;
    }
    const salmonHazeMounted = !!salmonEnv.waterHaze;
    logRecoveryLayer('salmonDaysRadio', 'environment-visibility', {
      vault: salmonEnv.vault,
      backdrop: salmonEnv.backdrop,
      waterHazeFlag: salmonEnv.waterHaze,
      waterHazeMounted: salmonHazeMounted,
      displayHazeLayerCount,
      displayHazeOpacity,
      salmonHazeOpacityCap: Math.min(0.09, displayHazeOpacity * 0.5),
      fogColorLeva: fogColor,
      fogNear: volumeFogNear,
      fogFar: volumeFogFar,
      note:
        salmonHazeMounted && displayHazeOpacity < 0.02
          ? 'haze opacity near zero — may be invisible'
          : null,
    });
  }, [
    themeId,
    salmonRestoreStep,
    salmonEnv,
    displayHazeLayerCount,
    displayHazeOpacity,
    fogColor,
    volumeFogNear,
    volumeFogFar,
  ]);

  const atm = theme.atmosphere;

  const cameraNavBoundsMin = useMemo(() => {
    const x = Number(atm?.navigation?.boundsXMin ?? -14);
    const y = Number(atm?.navigation?.boundsYMin ?? -7);
    const z = cameraZMinLive;
    return [
      Number.isFinite(x) ? x : -14,
      Number.isFinite(y) ? y : -7,
      Number.isFinite(z) ? z : -28,
    ];
  }, [atm?.navigation?.boundsXMin, atm?.navigation?.boundsYMin, cameraZMinLive]);

  const cameraNavBoundsMax = useMemo(() => {
    const x = Number(atm?.navigation?.boundsXMax ?? 14);
    const y = Number(atm?.navigation?.boundsYMax ?? 8);
    const z = cameraZMaxLive;
    return [
      Number.isFinite(x) ? x : 14,
      Number.isFinite(y) ? y : 8,
      Number.isFinite(z) ? z : 58,
    ];
  }, [atm?.navigation?.boundsXMax, atm?.navigation?.boundsYMax, cameraZMaxLive]);

  // Leva/localStorage can restore numeric sliders outside current min/max or
  // as corrupted strings — zero drag sensitivity reads as a "frozen" camera.
  const safeDragSensitivity = THREE.MathUtils.clamp(
    Number(dragSensitivity) || 1,
    0.12,
    3,
  );
  const safeScrollDepthStrength = Math.max(
    0.15,
    THREE.MathUtils.clamp(Number(scrollDepthStrength) || 1, 0, 3),
  );
  const safeHoverParallaxStrength = THREE.MathUtils.clamp(
    Number(hoverParallaxStrength) || 1,
    0,
    3,
  );
  const safeIdleSway = THREE.MathUtils.clamp(Number(idleSway) || 1, 0, 3);
  const safeInertiaStrength = THREE.MathUtils.clamp(
    Number(inertiaStrength) || 1,
    0,
    3,
  );
  const safeHeroFishCount = useMemo(
    () => guardHeroFishCount(heroFishCount, 'Scene.heroFishCount'),
    [heroFishCount],
  );
  const safeClusterCount = useMemo(
    () => guardClusterCount(clusters, 'Scene.clusters'),
    [clusters],
  );
  const safeSchoolSpread = useMemo(
    () => guardSchoolSpread(schoolSpread, 'Scene.schoolSpread'),
    [schoolSpread],
  );
  const safeSwimSpeed = useMemo(
    () => guardSwimSpeed(swimSpeed, 'Scene.swimSpeed'),
    [swimSpeed],
  );
  const safeDragDamping = THREE.MathUtils.clamp(
    Number(dragDamping) || 0.7,
    0.05,
    0.999,
  );
  const safeMaxPitchDegrees = THREE.MathUtils.clamp(
    Number(maxPitchDegrees) || 70,
    10,
    89,
  );
  const safePositionSmoothing = THREE.MathUtils.clamp(0.095, 0.04, 1);
  const safeParticleDepthDensity = Math.max(
    0.22,
    Number(particleDepthDensity) || 1,
  );

  /** After a theme patch, skip one passive fog sync — Leva props can lag one commit. */
  const skipLevaFogSyncRef = useRef(false);

  const levaSanitizeSnapshot = useRef({});
  levaSanitizeSnapshot.current = {
    dragSensitivity,
    scrollDepthStrength,
    heroFishCount,
    swimSpeed,
    cameraZMin,
    cameraZMax,
    dragDamping,
    inertiaStrength,
    maxPitchDegrees,
    clusters,
    schoolSpread,
    floatingLettersEnabled,
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      const patch = buildLevaSanitizePatch(levaSanitizeSnapshot.current);
      if (Object.keys(patch).length) setLeva(patch);
    }, 160);
    return () => clearTimeout(t);
  }, [setLeva]);

  useEffect(() => {
    if (AQ_DEBUG) console.info('[aquarium] Scene mounted');
  }, []);

  const atmBackgroundField = atm?.backgroundField ?? {};
  const backgroundFieldPalette = atmBackgroundField.palette ?? 'default';
  const backgroundFieldProps = {
    displacementStrength,
    noiseScale,
    animationSpeed,
    gradientIntensity,
    pinkAccentStrength,
    diagonalFlowStrength,
    backgroundOpacity,
    fogNear,
    fogFar,
    position: [0, 0, -28],
    size: [110, 60],
    segments: [220, 130],
    palette: 'default',
    ...atmBackgroundField,
    // Open-ocean uses wide manual fog in the shader; colour must track the
    // active theme, not a stale Leva value from the previous mode.
    fogColor:
      backgroundFieldPalette === 'openOcean'
        ? (atmBackgroundField.fogColor ?? theme.water.fogColor)
        : (atmBackgroundField.fogColor ?? fogColor),
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
    fogNear: volumeFogNear,
    fogFar: volumeFogFar,
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
    fogNear: volumeFogNear,
    fogFar: volumeFogFar,
    planeSize: 96,
    sandColor: '#d8c8a4',
    highlightColor: '#f4ecd6',
    goldColor: '#e7c685',
    ...(atm?.seabed ?? {}),
  };

  const swampPoemWorldPosition = useMemo(
    () => swampPoemWorldPositionFromRustyCar(seabedProps.depth),
    [seabedProps.depth],
  );

  const swampPoemRotation = useMemo(
    () => poemGroupEulerRadTowardCenter(seabedProps.depth),
    [seabedProps.depth],
  );

  const swampHacklesSignPosition = useMemo(
    () => swampHacklesSignWorldPosition(seabedProps.depth),
    [seabedProps.depth],
  );

  const swampHacklesSignRotation = useMemo(
    () => hacklesSignEulerRadTowardCenter(seabedProps.depth),
    [seabedProps.depth],
  );

  const swampFiatCreditWorldPosition = useMemo(() => {
    const floorY = -seabedProps.depth + 0.22;
    /* Fiat `groupPos` is [42, floorY - 0.78, 63] — anchor credits above roof, same X/Z. */
    return [42, floorY + 3.45, 63];
  }, [seabedProps.depth]);

  const poemMurkiness = useMemo(
    () =>
      Math.min(1, letterMurkiness + (theme.letters.letterMurkinessBoost ?? 0)),
    [letterMurkiness, theme.letters.letterMurkinessBoost],
  );

  const dustAtm = atm?.dustParticles ?? {};
  const waterHazeAtm = atm?.waterHaze ?? {};
  const salmonVaultMerged = useMemo(() => {
    if (themeId !== 'salmonDaysRadio') return null;
    return {
      ...(atm?.salmonOceanVault ?? {}),
      ...(atm?.salmonRebuildVault ?? {}),
    };
  }, [themeId, atm]);

  // --- Theme atmosphere sync ------------------------------------------------
  //
  // `setLeva` must NOT run inside `useLayoutEffect`. Updating the Leva zustand
  // store during the layout commit (especially from a click-driven theme
  // change) can freeze the tree / block input -- Salmon Days looked black +
  // unresponsive while Swamp kept working.
  //
  // Pattern: layout applies Three.js fog/background from `getTheme(themeId)`
  // only (cheap, synchronous GL state). Leva patch runs in a passive effect.
  useLayoutEffect(() => {
    const t = getTheme(themeId);
    const [tNear, tFar] = guardVolumeFog(
      t.water.fogNear,
      t.water.fogFar,
      t.water.fogNear,
      t.water.fogFar,
    );
    scene.background = new THREE.Color(t.water.backgroundColor);
    if (!scene.fog) {
      scene.fog = new THREE.Fog(t.water.fogColor, tNear, tFar);
    } else {
      scene.fog.color.set(t.water.fogColor);
      scene.fog.near = tNear;
      scene.fog.far = tFar;
    }
    skipLevaFogSyncRef.current = true;
  }, [themeId, scene]);

  useEffect(() => {
    const t = getTheme(themeId);
    const patch = {
      fogColor: t.water.fogColor,
      fogNear: t.water.fogNear,
      fogFar: t.water.fogFar,
      waterHazeOpacity: t.water.waterHazeOpacity,
      hazeLayerCount: t.water.hazeLayerCount,
      kelpMossRatio: t.kelp.mossRatio,
      ...t.kelp.levaAnchors,
      beamPositionX: t.beam.position[0],
      beamPositionY: t.beam.position[1],
      beamPositionZ: t.beam.position[2],
      beamAngle: t.beam.angleDegrees,
      beamWidth: t.beam.width,
      beamLength: t.beam.length,
      beamIntensity: t.beam.intensity,
      beamOpacity: t.beam.opacity,
      beamSoftness: t.beam.softness,
      beamFalloff: t.beam.falloff,
      beamDiffusion: t.beam.diffusion,
      beamCausticStrength: t.beam.causticStrength,
      beamNoiseScale: t.beam.noiseScale,
      beamRegionSize: t.beam.regionSize,
      beamShimmerSpeed: t.beam.shimmerSpeed,
      beamColorWarmth: t.beam.colorWarmth,
      ...t.atmosphere?.levaAnchors,
      ...(themeId === 'salmonDaysRadio' ? { kelpEnabled: false } : {}),
    };
    setLeva(patch);
  }, [themeId, setLeva]);

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

  // Background + volume fog: Leva sliders after the theme is stable.
  // Theme switches set Three fog in `useLayoutEffect` and raise
  // `skipLevaFogSyncRef` so this effect does not re-apply a *stale* fog color
  // from the previous mode (that produced black frames and stuck atmosphere).
  useEffect(() => {
    if (skipLevaFogSyncRef.current) {
      skipLevaFogSyncRef.current = false;
      return;
    }
    scene.background = new THREE.Color(theme.water.backgroundColor);
    if (!scene.fog) {
      scene.fog = new THREE.Fog(fogColor, volumeFogNear, volumeFogFar);
    } else {
      scene.fog.color.set(fogColor);
      scene.fog.near = volumeFogNear;
      scene.fog.far = volumeFogFar;
    }
  }, [scene, theme.water.backgroundColor, fogColor, volumeFogNear, volumeFogFar]);

  const lights = useMemo(() => {
    const swamp = themeId === 'swamp';
    const salmon = themeId === 'salmonDaysRadio';
    return (
      <>
        <ambientLight
          intensity={swamp ? 0.46 : salmon ? 0.38 : 0.35}
          color={swamp ? '#6490a8' : salmon ? '#90a8c8' : '#5b7f9c'}
        />
        <hemisphereLight
          color={swamp ? '#b8d4e8' : salmon ? '#eef4ff' : '#9fc5e0'}
          groundColor={swamp ? '#051015' : salmon ? '#020610' : '#020a12'}
          intensity={swamp ? 0.52 : salmon ? 0.56 : 0.45}
        />
        <directionalLight
          position={salmon ? [3, 14, 5] : [3, 8, 4]}
          intensity={swamp ? 0.72 : salmon ? 0.58 : 0.6}
          color={swamp ? '#d2e8f8' : salmon ? '#fff2e0' : '#bcdcef'}
        />
        <pointLight
          position={[-6, -2, -4]}
          intensity={swamp ? 0.48 : salmon ? 0.36 : 0.4}
          color={swamp ? '#5588a0' : salmon ? '#8caad8' : '#3f6f8a'}
          distance={swamp ? 22 : salmon ? 48 : 22}
          decay={2}
        />
      </>
    );
  }, [themeId]);

  return (
    <>
      <AquariumEngineDebug enabled={AQ_ENGINE_HUD} />
      {lights}
      <CameraRig
        // Z is chosen so the full themed letter string fits in the
        // viewport width at the current aspect + FOV (see
        // `typographyFramingCameraZ`). Scroll / trackpad adds buoyant
        // drift along the current look direction inside the themed nav
        // volume (XY from `theme.atmosphere.navigation`, Z from Leva).
        anchorResetKey={themeId}
        basePosition={[0, 0, cameraStartZ]}
        boundsMin={cameraNavBoundsMin}
        boundsMax={cameraNavBoundsMax}
        hoverParallax={{ x: 0.6, y: 0.4 }}
        hoverParallaxStrength={safeHoverParallaxStrength}
        scrollDepthStrength={safeScrollDepthStrength}
        idleSway={safeIdleSway}
        dragSensitivity={safeDragSensitivity}
        dragDamping={safeDragDamping}
        inertiaStrength={safeInertiaStrength}
        maxPitchDegrees={safeMaxPitchDegrees}
        positionSmoothing={safePositionSmoothing}
        verticalComfort={atm?.cameraComfort}
      />
      {themeId === 'salmonDaysRadio' && salmonEnv.vault && salmonVaultMerged && (
        <ErrorBoundary name="SalmonOceanVault" fallback={null}>
          <SalmonOceanVault
            deepColor={salmonVaultMerged.deepColor ?? '#020408'}
            midColor={salmonVaultMerged.midColor ?? '#102544'}
            surfaceTint={salmonVaultMerged.surfaceTint ?? '#fff6fc'}
            warmPeach={salmonVaultMerged.warmPeach ?? '#ffd8bc'}
            aquaSheen={salmonVaultMerged.aquaSheen ?? '#c8f0ff'}
            shimmer={salmonVaultMerged.shimmer ?? 1.2}
            vaultCaustic={salmonVaultMerged.vaultCaustic ?? 1}
            overheadGlow={salmonVaultMerged.overheadGlow ?? 1}
          />
        </ErrorBoundary>
      )}
      {themeId === 'salmonDaysRadio' && salmonEnv.whaleSkeleton && (
        <SalmonWhaleSkeleton fogColor={fogColor} />
      )}
      {themeId === 'salmonDaysRadio' && salmonEnv.canopy && (
        <SalmonOceanCanopy fogColor={fogColor} {...(atm?.oceanSurfaceCanopy ?? {})} />
      )}
      {themeId !== 'salmonDaysRadio' && (
        <>
          {swampGates.background && (
            <ErrorBoundary name="SwampBackgroundField" fallback={null}>
              <BackgroundField {...backgroundFieldProps} />
            </ErrorBoundary>
          )}
          {swampGates.waterHaze && (
            <ErrorBoundary name="SwampWaterHaze" fallback={null}>
              <WaterHaze
                layerCount={displayHazeLayerCount}
                opacity={displayHazeOpacity}
                speed={hazeMovementSpeed}
                color={fogColor}
                causticColor={waterHazeAtm?.causticColor ?? '#7fb8c8'}
                abyssVertFade={0}
                hazeProfile={themeId === 'swamp' ? 'swamp' : 'default'}
                luminousOcean={0}
              />
            </ErrorBoundary>
          )}
        </>
      )}
      {themeId === 'salmonDaysRadio' && salmonEnv.backdrop && (
        <ErrorBoundary name="SalmonBackgroundField" fallback={null}>
          <BackgroundField
            {...backgroundFieldProps}
            {...(atm?.salmonRebuildBackdrop ?? {})}
          />
        </ErrorBoundary>
      )}
      {themeId === 'salmonDaysRadio' && salmonEnv.waterHaze && (
        <ErrorBoundary fallback={null}>
          <WaterHaze
            layerCount={Math.min(4, displayHazeLayerCount)}
            opacity={Math.min(0.38, displayHazeOpacity * 0.92)}
            speed={hazeMovementSpeed}
            color={fogColor}
            causticColor={waterHazeAtm?.causticColor ?? '#7fb8c8'}
            abyssVertFade={waterHazeAtm?.abyssVertFade ?? 0.92}
            hazeProfile="salmon"
            luminousOcean={0}
          />
        </ErrorBoundary>
      )}
      {surfaceEnabled &&
        themeId !== 'salmonDaysRadio' &&
        swampGates.surface && (
        <SurfacePlane {...surfacePlaneProps} />
      )}
      {/*
        Floor of the world. Mounted before the kelp so the kelp
        strands render on top in painter's order; both have
        depthWrite disabled, but a consistent mount order keeps
        the visual stack stable.
      */}
      {seabedEnabled &&
        themeId !== 'salmonDaysRadio' &&
        swampGates.seabed && (
        <Seabed {...seabedProps} />
      )}
      {/*
        Kelp forest (Swamp Molly only). Salmon Days Radio omits kelp so open
        water stays clean — ribbon columns were reading as vertical line layers.
      */}
      {kelpEnabled && themeId !== 'salmonDaysRadio' && swampGates.kelp && (
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
          fogNear={volumeFogNear}
          fogFar={volumeFogFar}
          mossRatio={kelpMossRatio}
          trailerRatio={theme.kelp.trailerRatio ?? 0}
          mossHeightMul={theme.kelp.mossHeightMul ?? 1}
          mossThicknessMul={theme.kelp.mossThicknessMul ?? 1}
          ribbonHeightMul={theme.kelp.ribbonHeightMul ?? 1}
          ribbonThicknessMul={theme.kelp.ribbonThicknessMul ?? 1}
          abyssBlend={theme.kelp.abyssBlend ?? 0}
          verticalDream={theme.kelp.verticalDream ?? 0.12}
          dreamVerticalSpeed={theme.kelp.dreamVerticalSpeed ?? 0.18}
        />
      )}
      {themeId === 'swamp' && !AQ_SCENE_MINIMAL && swampGates.car1 && (
        <ErrorBoundary fallback={null}>
          <SwampSunkenCar
            headlightsEnabled={swampGates.car1Headlights}
            seabedY={-seabedProps.depth}
            fogNear={volumeFogNear}
            fogFar={volumeFogFar}
            fogColor={fogColor}
            infoBubbleInteractable={swampGates.car1}
            onRustyCarHacklesToggle={onRustyCarHacklesToggle}
          />
        </ErrorBoundary>
      )}
      {themeId === 'swamp' &&
        !AQ_SCENE_MINIMAL &&
        swampGates.car1 &&
        (swampHacklesUi === 'shown' || swampHacklesUi === 'hiding') && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <SwampHacklesHtmlPanel
              position={swampHacklesSignPosition}
              rotation={swampHacklesSignRotation}
              open={swampHacklesUi === 'shown'}
              onFadeOutComplete={onHacklesFadeOutComplete}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {themeId === 'swamp' &&
        !AQ_SCENE_MINIMAL &&
        swampGates.poem &&
        swampPoemPresent && (
        <ErrorBoundary fallback={null}>
          <SwampMollyPoem
            position={swampPoemWorldPosition}
            rotation={swampPoemRotation}
            murkiness={poemMurkiness}
            typographyTint={theme.letters.typographyTint ?? null}
            onDissipated={() => setSwampPoemPresent(false)}
          />
        </ErrorBoundary>
      )}
      {themeId === 'swamp' && !AQ_SCENE_MINIMAL && swampGates.car2 && (
        <ErrorBoundary fallback={null}>
          <SwampSunkenFiatPanda
            headlightsEnabled={swampGates.car2Headlights}
            seabedY={-seabedProps.depth}
            fogNear={volumeFogNear}
            fogFar={volumeFogFar}
            fogColor={fogColor}
            creditInteractable={swampGates.car2}
            onFiatCreditOpenRequest={() => setSwampFiatCreditOpen(true)}
          />
        </ErrorBoundary>
      )}
      {themeId === 'swamp' &&
        !AQ_SCENE_MINIMAL &&
        swampGates.car2 &&
        swampFiatCreditOpen && (
        <ErrorBoundary fallback={null}>
          <SwampFloatingWaterWords
            contentKey="fiat-credit"
            rawText={STUDIO_CREDIT_LINE_RAW}
            position={swampFiatCreditWorldPosition}
            murkiness={poemMurkiness}
            typographyTint={theme.letters.typographyTint ?? null}
            scale={2}
            floatStrength={0.008}
            volumeDepth={3.2}
            introFadeInSec={0.55}
            onDissipated={() => setSwampFiatCreditOpen(false)}
          />
        </ErrorBoundary>
      )}
      {lightBeamEnabled &&
        !recoveryLite &&
        ((themeId === 'salmonDaysRadio' && salmonRestoreStep >= 8) ||
          (themeId === 'swamp' && swampGates.lightBeam)) && (
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
          fogNear={volumeFogNear}
          fogFar={volumeFogFar}
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
      {themeId === 'salmonDaysRadio' &&
        salmonEnv.satelliteSchools &&
        useNewSalmonSkins && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <SalmonSatelliteSchools
              swimSpeed={safeSwimSpeed}
              schoolSpread={safeSchoolSpread}
              shimmerIntensity={shimmerIntensity}
              avoidanceRadius={cameraAvoidanceRadius}
              scatterEnabled={scatterEnabled}
              randomScatterFrequency={randomScatterFrequency}
              scatterRadius={scatterRadius}
              scatterStrength={scatterStrength}
              scatterDuration={scatterDuration}
              scatterRecoverySpeed={scatterRecoverySpeed}
              chainReactionChance={chainReactionChance}
              bubbleTrailEnabled={bubbleTrailEnabled}
              bubbleSpawnRate={bubbleSpawnRate}
              bubbleLifetime={bubbleLifetime}
              maxBubbles={maxBubbles}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {(() => {
        const heroLightBeam = {
          enabled:
            lightBeamEnabled &&
            ((themeId === 'salmonDaysRadio' && salmonRestoreStep >= 8) ||
              (themeId === 'swamp' && swampGates.lightBeam)),
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
          count: safeHeroFishCount,
          clusterCount: safeClusterCount,
          seed: 1337,
          bounds: heroSchoolBounds,
          spread: safeSchoolSpread,
          swimSpeed: safeSwimSpeed,
          shimmerIntensity,
          foregroundCrossingChance,
          avoidanceRadius: cameraAvoidanceRadius,
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
          clusterAnchorY: theme.fish.schoolClusterYOffset ?? 0,
          heroDepthCue: atm?.heroFishAtmosphere ?? null,
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
          <ErrorBoundary fallback={<EmergencyFishSchool />}>
            <Suspense fallback={<EmergencyFishSchool />}>
              {useNewSalmonSkins ? (
                <ErrorBoundary fallback={<EmergencyFishSchool />}>
                  <Suspense fallback={<EmergencyFishSchool />}>
                  <WebpFishSchool
                    key={themeId}
                    mainUrl={theme.fish.mainTexture}
                    riderUrl={theme.fish.riderTexture}
                    textureFacesLeft={theme.fish.textureFacesLeft}
                    {...schoolProps}
                    {...riderProps}
                  />
                </Suspense>
                </ErrorBoundary>
              ) : (
                <SalmonSvgFallback {...schoolProps} {...riderProps} />
              )}
            </Suspense>
          </ErrorBoundary>
        );
      })()}
      {!AQ_SCENE_MINIMAL &&
        (themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 10) &&
        (themeId !== 'swamp' || swampGates.companions) && (
        <ErrorBoundary fallback={null}>
          <AmbientCompanionSchools
            theme={theme}
            themeId={themeId}
            swimSpeed={safeSwimSpeed}
            shimmerIntensity={shimmerIntensity}
            useNewSalmonSkins={useNewSalmonSkins}
            heroDepthCue={atm?.heroFishAtmosphere ?? null}
            scatterEnabled={scatterEnabled}
            bubbleTrailEnabled={bubbleTrailEnabled}
            bubbleSpawnRate={bubbleSpawnRate}
            bubbleLifetime={bubbleLifetime}
            maxBubbles={maxBubbles}
          />
        </ErrorBoundary>
      )}
      {densitySurroundOn && (
        <>
          {/*
            Distant point-sprite swarms first, so they render under
            the midfield instances and the hero school in painter's
            order. Their material has depthWrite disabled but a
            consistent mount order still helps blending.

            `atmosphericDensity` is a master count multiplier across
            both the midfield and bg layers, so the user can fade the
            whole surround system up/down with a single slider.
            `heroFishDominance` deepens distant atmospheric silhouettes
            (colour / contrast), not transparency.
          */}
          <BackgroundFishClouds
            density={backgroundCloudDensity * atmosphericDensity}
            speed={backgroundSwarmSpeed * backgroundMotionStrength}
            opacity={Math.max(
              0.24,
              Math.min(0.98, 0.22 + distantFishOpacity * 0.95),
            )}
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
              swimSpeed={safeSwimSpeed * 0.25 * backgroundMotionStrength}
              distantFishOpacity={distantFishOpacity}
              atmosphereCrush={heroFishDominance}
              peripheralDensity={peripheralDensity}
              fogColor={fogColor}
              fogNear={volumeFogNear}
              fogFar={volumeFogFar}
            />
          </Suspense>
        </>
      )}
      {themeId === 'salmonDaysRadio' &&
        !AQ_SCENE_MINIMAL &&
        salmonEnv.distantSilhouettes &&
        densitySurroundOn && (
        <ErrorBoundary fallback={null}>
          <SalmonShadowFishSilhouettes
            density={
              backgroundCloudDensity *
              atmosphericDensity *
              (atm?.shadowSilhouetteFish?.densityMul ?? 1)
            }
            speed={backgroundSwarmSpeed * backgroundMotionStrength * 0.55}
            opacity={atm?.shadowSilhouetteFish?.opacity ?? 0.94}
          />
        </ErrorBoundary>
      )}
      {AQ_TYPO_TEST && <TypoEmergencyTest />}
      {mountLettersEffective && (
        <group position={[0, typographyWorldYOffset, 0]}>
          <ErrorBoundary
            fallback={<CanvasFloatingLetters {...floatingTypographyProps} />}
          >
            {AQ_TYPO_TROIKA ? (
              <Suspense
                fallback={
                  <CanvasFloatingLetters {...floatingTypographyProps} />
                }
              >
                <FloatingLetters {...floatingTypographyProps} />
              </Suspense>
            ) : (
              <CanvasFloatingLetters {...floatingTypographyProps} />
            )}
          </ErrorBoundary>
        </group>
      )}
      {(themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 4) &&
        (themeId !== 'swamp' || swampGates.particles) && (
        <DustParticles
        count={Math.max(
          20,
          Math.round(particleCount * safeParticleDepthDensity),
        )}
        bounds={DUST_VOLUME}
        opacity={particleOpacity * (dustAtm.opacityMul ?? 1)}
        shimmerStrength={
          particleShimmerStrength * (dustAtm.shimmerMul ?? 1)
        }
        color={dustAtm.color ?? '#bcd5e6'}
      />
      )}
      {/*
        Continuous ambient bubble field. Mounted alongside the dust
        so both suspended-life systems share the same render pass
        cluster. BubbleTrails (scatter-only) lives inside FishSchool
        and stays untouched -- the two bubble systems are
        complementary.
      */}
      {(themeId !== 'salmonDaysRadio' || salmonRestoreStep >= 4) &&
        (themeId !== 'swamp' || swampGates.bubbles) && (
      <AmbientBubbles
        maxCount={ambientBubbleCount}
        spawnRate={ambientBubbleSpawnRate}
        opacity={bubbleOpacity}
        riseSpeed={bubbleRiseSpeed}
        sizeVariation={bubbleSizeVariation}
        bounds={BUBBLE_VOLUME}
      />
      )}
      {!AQ_SCENE_MINIMAL &&
        ((themeId === 'swamp' && swampGates.creditsBag) ||
          (themeId === 'salmonDaysRadio' && salmonEnv.creditsBag)) && (
        <ErrorBoundary name="FloatingCreditsBag" fallback={null}>
          <Suspense fallback={null}>
            <FloatingCreditsBag themeId={themeId} />
          </Suspense>
        </ErrorBoundary>
      )}
      {standaloneAmbientRadioShows ? (
        <ErrorBoundary name="Scene.AmbientRadio.standalone" fallback={null}>
          <AmbientRadio
            enabled={ambientRadioEnabled}
            glowIntensity={safeRadioGlowIntensity}
            position={safeRadioPosition}
            beaconAtmosphere={theme.radio?.beaconAtmosphere}
            beaconVisual={theme.radio?.beaconVisual}
          />
        </ErrorBoundary>
      ) : null}
    </>
  );
}
