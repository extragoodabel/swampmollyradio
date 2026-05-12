import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useControls, folder } from 'leva';
import * as THREE from 'three';
import CameraRig from './CameraRig.jsx';
import FishSchool from './FishSchool.jsx';
import SalmonSchool from './SalmonSchool.jsx';
import DustParticles from './DustParticles.jsx';
import BackgroundField from './BackgroundField.jsx';
import WaterHaze from './WaterHaze.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const BACKGROUND_COLOR = '#04141e';

const VOLUME = { x: 16, y: 5.5, z: 18 };
const DUST_VOLUME = { x: 20, y: 9, z: 24 };
const DUST_BASE_COUNT = 320;

export default function Scene() {
  const { scene } = useThree();

  const {
    fishCount,
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
  } = useControls({
    school: folder({
      fishCount: { value: 90, min: 20, max: 180, step: 5 },
      clusters: { value: 4, min: 2, max: 6, step: 1 },
      schoolSpread: { value: 1.0, min: 0.5, max: 2.0, step: 0.05 },
      swimSpeed: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      shimmerIntensity: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
      foregroundCrossingChance: { value: 0.18, min: 0, max: 0.5, step: 0.01 },
      fishDistanceOpacityStrength: { value: 0.4, min: 0, max: 1, step: 0.05 },
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
      fogNear: { value: 4, min: 0, max: 20, step: 0.5 },
      fogFar: { value: 28, min: 10, max: 60, step: 1 },
      waterHazeOpacity: { value: 0.15, min: 0, max: 0.8, step: 0.01 },
      hazeLayerCount: { value: 4, min: 0, max: 6, step: 1 },
      hazeMovementSpeed: { value: 1.0, min: 0, max: 3, step: 0.05 },
      particleDepthDensity: { value: 1.5, min: 0, max: 3, step: 0.05 },
    }),
  });

  useEffect(() => {
    scene.background = new THREE.Color(BACKGROUND_COLOR);
    scene.fog = new THREE.Fog('#0e3850', 4, 28);
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
        basePosition={[0, 0, 6]}
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
      <ErrorBoundary
        fallback={
          <FishSchool
            count={fishCount}
            clusterCount={clusters}
            seed={1337}
            bounds={VOLUME}
            spread={schoolSpread}
            swimSpeed={swimSpeed}
            shimmerIntensity={shimmerIntensity}
            foregroundCrossingChance={foregroundCrossingChance}
            avoidanceRadius={cameraAvoidanceRadius}
            fishDistanceOpacityStrength={fishDistanceOpacityStrength}
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
        }
      >
        <Suspense fallback={null}>
          <SalmonSchool
            count={fishCount}
            clusterCount={clusters}
            seed={1337}
            bounds={VOLUME}
            spread={schoolSpread}
            swimSpeed={swimSpeed}
            shimmerIntensity={shimmerIntensity}
            foregroundCrossingChance={foregroundCrossingChance}
            avoidanceRadius={cameraAvoidanceRadius}
            fishDistanceOpacityStrength={fishDistanceOpacityStrength}
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
      <DustParticles
        count={Math.max(20, Math.round(DUST_BASE_COUNT * particleDepthDensity))}
        bounds={DUST_VOLUME}
      />
    </>
  );
}
