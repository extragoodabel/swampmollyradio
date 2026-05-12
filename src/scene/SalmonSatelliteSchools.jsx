import { useMemo } from 'react';
import WebpFishSchool from './WebpFishSchool.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';

/**
 * Salmon Days Radio only: extra WebP hero-quality salmon in the upper and lower
 * water column. Renders before the main hero school so the primary band stays
 * visually dominant when schools overlap.
 */

export default function SalmonSatelliteSchools({
  swimSpeed,
  schoolSpread,
  shimmerIntensity,
  avoidanceRadius,
  scatterEnabled,
  randomScatterFrequency,
  scatterRadius,
  scatterStrength,
  scatterDuration,
  scatterRecoverySpeed,
  chainReactionChance,
  bubbleSpawnRate,
  bubbleLifetime,
}) {
  const { theme, themeId } = useTheme();
  const atm = theme.atmosphere;
  const cfg = atm?.satelliteHeroFish;
  const fish = theme.fish;
  const heroCue = atm?.heroFishAtmosphere;

  const mergedDepthCue = useMemo(
    () => (heroCue || cfg?.depthCue ? { ...(heroCue ?? {}), ...(cfg?.depthCue ?? {}) } : null),
    [heroCue, cfg?.depthCue],
  );

  const schools = cfg?.schools;
  const counts = cfg?.counts;

  if (themeId !== 'salmonDaysRadio' || !cfg || cfg.enabled === false || !schools?.length) {
    return null;
  }

  const swimMul = cfg.swimSpeedMul ?? 0.66;
  const bounds = cfg.bounds ?? { x: 15, y: 4.8, z: 17.5 };
  const spread = (schoolSpread ?? 1) * (cfg.spread ?? 1);
  const k = cfg.clusterCount ?? 3;
  const fc = cfg.foregroundCrossingChance ?? 0.09;
  const yBase = Number.isFinite(Number(fish.schoolClusterYOffset))
    ? fish.schoolClusterYOffset
    : 0;

  return (
    <group>
      {schools.map((sch, i) => {
        const count = counts?.[i] ?? 14;
        const [gx = 0, gy = 0, gz = 0] = sch.group ?? [];
        const seed = sch.seed ?? 8100 + i * 17;
        const anchorY = yBase + (sch.anchorY ?? 0);
        return (
          <group key={seed} position={[gx, gy, gz]}>
            <WebpFishSchool
              mainUrl={fish.mainTexture}
              riderUrl={null}
              textureFacesLeft={fish.textureFacesLeft}
              count={count}
              countMode="satellite"
              clusterCount={k}
              seed={seed}
              bounds={bounds}
              spread={spread}
              swimSpeed={swimSpeed * swimMul}
              shimmerIntensity={shimmerIntensity * 0.9}
              foregroundCrossingChance={fc}
              avoidanceRadius={avoidanceRadius}
              scatterEnabled={scatterEnabled}
              randomScatterFrequency={randomScatterFrequency * 0.52}
              scatterRadius={scatterRadius}
              scatterStrength={scatterStrength * 0.78}
              scatterDuration={scatterDuration}
              scatterRecoverySpeed={scatterRecoverySpeed}
              chainReactionChance={chainReactionChance * 0.4}
              bubbleTrailEnabled={false}
              bubbleSpawnRate={bubbleSpawnRate}
              bubbleLifetime={bubbleLifetime}
              maxBubbles={0}
              lightBeam={null}
              clusterAnchorY={anchorY}
              heroDepthCue={mergedDepthCue}
              enableRider={false}
              baseWidth={1.88}
            />
          </group>
        );
      })}
    </group>
  );
}
