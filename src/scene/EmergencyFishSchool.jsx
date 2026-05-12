import FishSchool from './FishSchool.jsx';

/** Matches `Scene.jsx` VOLUME — literal only, no Leva, cannot throw on modulo / clusters. */
const EMERGENCY_BOUNDS = Object.freeze({ x: 16, y: 5.5, z: 18 });

/**
 * Last-resort hero school: fixed safe props only (no spreads from Leva).
 * Used as ErrorBoundary and Suspense fallbacks so a failed WebP/SVG path
 * cannot recurse into the same broken props.
 */
export default function EmergencyFishSchool() {
  return (
    <FishSchool
      count={90}
      clusterCount={4}
      seed={1337}
      bounds={EMERGENCY_BOUNDS}
      spread={1}
      swimSpeed={1}
      shimmerIntensity={1}
      foregroundCrossingChance={0.15}
      avoidanceRadius={1.2}
      enableRider={false}
      scatterEnabled={false}
      bubbleTrailEnabled={false}
      randomScatterFrequency={0}
      lightBeam={null}
      clusterAnchorY={0}
      heroDepthCue={null}
    />
  );
}
