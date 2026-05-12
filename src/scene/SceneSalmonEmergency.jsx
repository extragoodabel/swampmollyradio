import { useEffect } from 'react';
import CameraRig from './CameraRig.jsx';
import FishSchool from './FishSchool.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { reportSceneMountPhase } from '../debug/sceneMountTrace.js';

const BOUNDS = Object.freeze({ x: 14, y: 5, z: 16 });

/**
 * Minimal Salmon Days baseline for root-cause isolation.
 * `?aqsalmonemergency=1` + Salmon theme only: no vault, typography, Leva, WebP, etc.
 * Atmosphere comes from `CanvasClearToTheme`; this subtree is fish + rig + lights only.
 */
export default function SceneSalmonEmergency() {
  const { theme, themeId } = useTheme();

  useEffect(() => {
    reportSceneMountPhase('SceneSalmonEmergency.mounted');
    return () => reportSceneMountPhase('SceneSalmonEmergency.unmounted');
  }, []);

  const nav = theme.atmosphere?.navigation ?? {
    boundsXMin: -24,
    boundsXMax: 24,
    boundsYMin: -12,
    boundsYMax: 12,
  };

  return (
    <>
      <ambientLight intensity={0.55} color="#90a8c8" />
      <hemisphereLight
        color="#eef4ff"
        groundColor="#020610"
        intensity={0.5}
      />
      <CameraRig
        anchorResetKey={themeId}
        basePosition={[0, 0, 8.5]}
        boundsMin={[nav.boundsXMin, nav.boundsYMin, -8]}
        boundsMax={[nav.boundsXMax, nav.boundsYMax, 24]}
        verticalComfort={theme.atmosphere?.cameraComfort}
      />
      <FishSchool
        count={10}
        clusterCount={2}
        seed={9001}
        bounds={BOUNDS}
        spread={1}
        swimSpeed={1}
        shimmerIntensity={1}
        foregroundCrossingChance={0.12}
        avoidanceRadius={1.2}
        enableRider={false}
        scatterEnabled={false}
        bubbleTrailEnabled={false}
        randomScatterFrequency={0}
        lightBeam={null}
        clusterAnchorY={0}
        heroDepthCue={null}
      />
    </>
  );
}
