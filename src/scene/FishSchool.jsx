import { useMemo, useRef } from 'react';
import Fish from './Fish.jsx';
import { FISH_VARIANT_COUNT } from './assets/fishTexture.js';
import ScatterManager from './scatter/ScatterManager.jsx';
import BubbleTrails from './scatter/BubbleTrails.jsx';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function layerFromZ(z) {
  if (z > 0) return { layer: 0, extraParallax: 0.4 };
  if (z > -8) return { layer: 1, extraParallax: 0.15 };
  return { layer: 2, extraParallax: 0.04 };
}

/**
 * Per-fish tint biased cool <-> warm.
 *
 * Multiplied onto material.color (which is multiplied with the texture),
 * so all channels stay <= 1.0 to avoid clamping at the framebuffer.
 * Cool-leaning fish get a slight blue bias, warm-leaning ones a slight
 * pink/red bias -- subtle, never garish.
 */
function buildTint(rand) {
  const warmth = rand() * 2 - 1;
  if (warmth >= 0) {
    return [1.0, lerp(1.0, 0.94, warmth), lerp(1.0, 0.86, warmth)];
  }
  const k = -warmth;
  return [lerp(1.0, 0.88, k), lerp(1.0, 0.95, k), 1.0];
}

function buildClusters(rand, clusterCount, bounds, spread) {
  const clusters = [];
  for (let i = 0; i < clusterCount; i++) {
    const cx = (rand() * 2 - 1) * bounds.x * 0.55 * spread;
    const cy = (rand() * 2 - 1) * bounds.y * 0.55 * spread;
    // Slightly forward bias so more fish read in mid / foreground at
    // load (depth hierarchy vs. a uniform sheet at the back plane).
    const depthBias = Math.pow(rand(), 1.38);
    const cz = lerp(2.5, -bounds.z, depthBias);

    const angle = (rand() * 2 - 1) * 0.25;
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle) * 0.55;

    const length = lerp(5, 11, rand()) * spread;
    const width = lerp(1.0, 2.4, rand()) * spread;
    const height = lerp(0.6, 1.4, rand());

    const baseDirection = rand() > 0.18 ? 1 : -1;
    const baseSpeed = lerp(0.32, 0.7, rand());

    clusters.push({
      cx,
      cy,
      cz,
      axisX,
      axisY,
      length,
      width,
      height,
      baseDirection,
      baseSpeed,
    });
  }
  return clusters;
}

export default function FishSchool({
  count = 90,
  seed = 1337,
  bounds = { x: 16, y: 5.5, z: 18 },
  spread = 1,
  swimSpeed = 1,
  shimmerIntensity = 1,
  clusterCount = 4,
  foregroundCrossingChance = 0.15,
  avoidanceRadius = 1.2,
  fishDistanceOpacityStrength = 0.4,
  texture,
  // Optional second texture used for the single "#99 rider" salmon.
  // When present, exactly one fish in the school will use it.
  riderTexture,
  // True when the provided texture's silhouette faces LEFT (the new
  // pixel-art WebP sprites). False for the original SVG / procedural
  // fallback art, which face right.
  textureFacesLeft = false,
  // When false, the rider salmon is not chosen and every fish uses
  // the default texture. Exposed via Leva so the user can disable
  // the easter egg.
  enableRider = true,
  // Width applied to the default-aspect plane. Fish.jsx computes
  // height from its active texture's aspect ratio.
  baseWidth = 2,
  // Per-rider visual tuning. The rider sprite has a taller aspect
  // (a player sits on top of the fish body); these props let us
  // scale it slightly larger / boost its shimmer so it remains
  // legible in the crowd without breaking the "behaves like any
  // other fish" rule.
  riderScaleMultiplier = 1.1,
  riderShimmerBoost = 1.15,
  // Multiplier on the rider's tint, applied once when the rider is
  // chosen so the player sprite has a tiny baseline glow above the
  // school's average colour. Clamped per-channel so it can't go
  // beyond white.
  riderGlowBoost = 1.0,
  riderCanScatter = true,
  scatterEnabled = true,
  randomScatterFrequency = 0.25,
  scatterRadius = 4.0,
  scatterStrength = 1.2,
  scatterDuration = 0.45,
  scatterRecoverySpeed = 1.0,
  chainReactionChance = 0.55,
  bubbleTrailEnabled = true,
  bubbleSpawnRate = 1.0,
  bubbleLifetime = 2.2,
  maxBubbles = 120,
  /** Per-fish volume lighting from the cinematic beam (theme + Leva position). */
  lightBeam = null,
}) {
  // Shared mutable context. Each Fish pushes its registry entry on
  // mount (and writes its world position to it each frame). The
  // BubbleTrails component installs `bubble.spawn` on this same
  // object, which ScatterManager calls when triggering a scatter.
  // Using a mutable ref instead of context avoids re-renders and lets
  // the manager iterate the registry array directly in useFrame.
  const scatterCtx = useRef({
    registry: [],
    bubble: { spawn: null },
  }).current;
  const fish = useMemo(() => {
    const rand = mulberry32(seed);
    const clusters = buildClusters(rand, clusterCount, bounds, spread);

    const arr = [];
    for (let i = 0; i < count; i++) {
      const cluster = clusters[i % clusters.length];

      const along = rand() * 2 - 1;
      const lateral = (rand() * 2 - 1) * 0.6;
      const vert = rand() * 2 - 1;

      const perpX = -cluster.axisY;
      const perpY = cluster.axisX;

      let x =
        cluster.cx +
        cluster.axisX * cluster.length * along +
        perpX * cluster.width * lateral;
      let y =
        cluster.cy +
        cluster.axisY * cluster.length * along +
        perpY * cluster.width * lateral +
        vert * cluster.height * 0.3;
      let z = cluster.cz + vert * cluster.height;

      if (rand() < foregroundCrossingChance) {
        z = lerp(1.5, 5.5, rand());
        y *= 0.8;
      }

      const closeness = clamp((z + bounds.z) / (bounds.z + 6), 0, 1);

      const direction =
        rand() > 0.08 ? cluster.baseDirection : -cluster.baseDirection;

      const scale = lerp(0.4, 1.7, closeness) * lerp(0.9, 1.12, rand());
      const speed =
        cluster.baseSpeed *
        lerp(0.88, 1.15, rand()) *
        lerp(0.65, 1.25, closeness);

      const wiggleSpeed = lerp(2.5, 5.5, rand());
      const wiggleAmount = lerp(0.12, 0.28, rand());
      const phase = rand() * Math.PI * 2;
      const variant = Math.floor(rand() * FISH_VARIANT_COUNT);

      const opacity = lerp(0.3, 1.0, Math.pow(closeness, 0.75));

      const { layer, extraParallax } = layerFromZ(z);

      const tint = buildTint(rand);
      const shimmerScale = lerp(0.55, 1.55, rand());

      arr.push({
        key: i,
        position: [x, y, z],
        scale,
        direction,
        speed,
        wiggleSpeed,
        wiggleAmount,
        phase,
        variant,
        opacity,
        shimmerSeed: rand(),
        canShimmer: rand() > 0.35,
        layer,
        extraParallax,
        tint,
        shimmerScale,
        isRider: false,
      });
    }

    // Pick exactly ONE fish to be the #99 rider. Using Math.random()
    // (not the seeded rand) so each fresh page-load picks a
    // different salmon, while everything else about the school stays
    // deterministic. If the user disables the rider via Leva, no
    // index is picked.
    if (arr.length > 0 && enableRider) {
      const riderIdx = Math.floor(Math.random() * arr.length);
      arr[riderIdx].isRider = true;
      // Apply the glow-boost as a tint multiplier so the rider has a
      // subtle, constant baseline brightness on top of whatever the
      // shimmer envelope is doing. Clamped to <= 1 per channel to
      // avoid framebuffer-clipping artefacts.
      const g = riderGlowBoost;
      arr[riderIdx].tint = [
        Math.min(1, arr[riderIdx].tint[0] * g),
        Math.min(1, arr[riderIdx].tint[1] * g),
        Math.min(1, arr[riderIdx].tint[2] * g),
      ];
    }

    return arr;
  }, [
    count,
    seed,
    bounds.x,
    bounds.y,
    bounds.z,
    spread,
    clusterCount,
    foregroundCrossingChance,
    enableRider,
    riderGlowBoost,
  ]);

  return (
    <group>
      {fish.map((f) => (
        <Fish
          key={f.key}
          fishId={f.key}
          scatterCtx={scatterCtx}
          position={f.position}
          // Apply the rider scale bump here so all of Fish's per-frame
          // scaling math (shimmer growth etc.) just multiplies through.
          scale={f.scale * (f.isRider ? riderScaleMultiplier : 1)}
          direction={f.direction}
          speed={f.speed}
          wiggleSpeed={f.wiggleSpeed}
          wiggleAmount={f.wiggleAmount}
          phase={f.phase}
          variant={f.variant}
          opacity={f.opacity}
          shimmerSeed={f.shimmerSeed}
          // Rider gets its shimmer enabled and amplified slightly so
          // it remains visible in the crowd.
          canShimmer={f.canShimmer || f.isRider}
          shimmerScale={f.shimmerScale * (f.isRider ? riderShimmerBoost : 1)}
          layer={f.layer}
          extraParallax={f.extraParallax}
          tint={f.tint}
          bounds={bounds}
          swimSpeed={swimSpeed}
          shimmerIntensity={shimmerIntensity}
          avoidanceRadius={avoidanceRadius}
          fishDistanceOpacityStrength={fishDistanceOpacityStrength}
          texture={texture}
          riderTexture={riderTexture}
          isRider={f.isRider}
          riderCanScatter={riderCanScatter}
          textureFacesLeft={textureFacesLeft}
          baseWidth={baseWidth}
          lightBeam={lightBeam}
        />
      ))}
      <ScatterManager
        scatterCtx={scatterCtx}
        enabled={scatterEnabled}
        randomScatterFrequency={randomScatterFrequency}
        scatterRadius={scatterRadius}
        scatterStrength={scatterStrength}
        scatterDuration={scatterDuration}
        scatterRecoverySpeed={scatterRecoverySpeed}
        chainReactionChance={chainReactionChance}
      />
      <BubbleTrails
        scatterCtx={scatterCtx}
        enabled={bubbleTrailEnabled}
        maxBubbles={maxBubbles}
        lifetime={bubbleLifetime}
        spawnRate={bubbleSpawnRate}
      />
    </group>
  );
}
