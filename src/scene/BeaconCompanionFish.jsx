import WebpFishSchool from './WebpFishSchool.jsx';

/**
 * Small satellite `WebpFishSchool` locked to the typography beacon anchor (see
 * `TypographicDistantBeacon` + `companionFollowGroupRef`). Uses the same FishSchool
 * pipeline as the rest of the aquarium — slow drift, clustered headings, depth
 * crossings — not orbital UI particles.
 */

const SCHOOL_DEFAULTS = {
  // Baseline when `config` omits keys; Scene merges Leva scatter/bubble props
  // into `beaconCompanionFish` so the panel matches other schools.
  count: 7,
  clusterCount: 4,
  seed: 7721,
  bounds: { x: 4.4, y: 2.9, z: 5.5 },
  spread: 0.94,
  swimSpeed: 0.39,
  foregroundCrossingChance: 0.36,
  clusterAnchorY: 0,
  baseWidth: 1.08,
  avoidanceRadius: 0,
  scatterEnabled: false,
  randomScatterFrequency: 0.06,
  chainReactionChance: 0,
  bubbleTrailEnabled: false,
  bubbleSpawnRate: 0,
  enableRider: false,
  shimmerIntensity: 0.68,
};

export default function BeaconCompanionFish({ config }) {
  if (!config || config.enabled === false) return null;

  const {
    mainTexture,
    riderTexture,
    textureFacesLeft,
    enabled: _en,
    ...overrides
  } = config;

  if (!mainTexture) return null;

  return (
    <WebpFishSchool
      mainUrl={mainTexture}
      riderUrl={riderTexture ?? null}
      textureFacesLeft={textureFacesLeft ?? true}
      {...SCHOOL_DEFAULTS}
      {...overrides}
      countMode="satellite"
    />
  );
}
