import { Suspense, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import WebpFishSchool from './WebpFishSchool.jsx';
import SalmonSvgFallback from './SalmonSvgFallback.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { AQ_COMPANION_DEBUG } from '../debug/aquariumRecovery.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();
const _scratch = new THREE.Vector3();

/**
 * Soft world-space anchor that lags the camera with a wandering peripheral
 * bias — schools feel like shared water volume, not parented escorts.
 */
function CompanionAnchor({
  global: g,
  entry: e,
  children,
  /** Salmon-only: max world-units/s the anchor may close toward its target (reduces visible backward sprints). */
  catchUpMaxPerSec = Number.POSITIVE_INFINITY,
}) {
  const groupRef = useRef(null);
  const smoothPos = useRef(new THREE.Vector3());
  const flowT = useRef(0);
  const inited = useRef(false);
  const dbgAcc = useRef(0);
  const { camera } = useThree();

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const cam = camera;

    cam.getWorldDirection(_fwd);
    _scratch.set(0, 1, 0);
    _right.crossVectors(_fwd, _scratch);
    if (_right.lengthSq() < 1e-8) {
      _right.set(1, 0, 0);
    } else {
      _right.normalize();
    }
    _up.crossVectors(_right, _fwd).normalize();

    flowT.current += dt * g.wanderSpeed;

    const side =
      Math.sin(flowT.current + e.wanderPhase) * e.sideAmp +
      Math.sin(flowT.current * 0.61 + e.wanderPhase * 1.7) *
        e.sideAmp *
        0.33;
    const vertW =
      Math.sin(flowT.current * 0.83 + 1.05 + e.wanderPhase) * e.vertAmp;
    const back =
      e.lagBack +
      Math.sin(flowT.current * 0.29 + e.wanderPhase) * g.lagBreathe;

    _target.copy(cam.position);
    _target.addScaledVector(_fwd, -back);
    _target.addScaledVector(_right, side);
    _target.addScaledVector(_up, vertW);

    _scratch.subVectors(_target, cam.position);
    const dist = _scratch.length();
    const minR = g.minShellRadius;
    if (dist < minR) {
      if (dist < 1e-4) {
        _scratch.copy(_right).multiplyScalar(minR);
      } else {
        _scratch.multiplyScalar(minR / dist);
      }
      _target.copy(cam.position).add(_scratch);
    }

    if (!inited.current) {
      smoothPos.current.copy(_target);
      inited.current = true;
    }
    const a = 1 - Math.exp(-e.follow * dt);
    const px = smoothPos.current.x;
    const py = smoothPos.current.y;
    const pz = smoothPos.current.z;
    smoothPos.current.lerp(_target, a);
    let dx = smoothPos.current.x - px;
    let dy = smoothPos.current.y - py;
    let dz = smoothPos.current.z - pz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const cap = catchUpMaxPerSec;
    if (Number.isFinite(cap)) {
      const maxStep = cap * dt;
      if (len > maxStep) {
        const s = maxStep / len;
        dx *= s;
        dy *= s;
        dz *= s;
        smoothPos.current.set(px + dx, py + dy, pz + dz);
      }
    }

    if (groupRef.current) {
      groupRef.current.position.copy(smoothPos.current);
    }

    if (AQ_COMPANION_DEBUG && groupRef.current && e.debugSeed != null) {
      dbgAcc.current += dt;
      if (dbgAcc.current >= 1.2) {
        dbgAcc.current = 0;
        const w = new THREE.Vector3();
        groupRef.current.getWorldPosition(w);
        console.info('[aqcompaniondebug] companion anchor world', {
          seed: e.debugSeed,
          anchorWorld: w.toArray(),
        });
      }
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

/**
 * Ambient companion schools: loose, laggy presence around the drift path so
 * open water never reads empty. Theme tuning lives in `themes.js` under
 * `ambientCompanionSchools`.
 */
export default function AmbientCompanionSchools({
  theme,
  themeId,
  swimSpeed,
  shimmerIntensity,
  useNewSalmonSkins,
  heroDepthCue,
}) {
  const cfg = theme.ambientCompanionSchools;
  if (!cfg?.enabled || !cfg.entries?.length) return null;

  const companionUseWebpFish =
    useNewSalmonSkins || themeId === 'swamp';

  const debugBoost = AQ_COMPANION_DEBUG ? 1.22 : 1;
  const debugShimmerMul = (cfg.shimmerMul ?? 1) * (AQ_COMPANION_DEBUG ? 1.18 : 1);

  const g = {
    wanderSpeed: (cfg.wanderSpeed ?? 0.11) * (AQ_COMPANION_DEBUG ? 1.05 : 1),
    lagBreathe: cfg.lagBreathe ?? 1.4,
    minShellRadius: Math.max(5.2, (cfg.minShellRadius ?? 7) * (AQ_COMPANION_DEBUG ? 0.92 : 1)),
  };

  const shimMul = debugShimmerMul;

  useEffect(() => {
    if (!AQ_COMPANION_DEBUG) return;
    console.info('[aqcompaniondebug] AmbientCompanionSchools mount', {
      themeId,
      entryCount: cfg.entries?.length ?? 0,
      useWebp: companionUseWebpFish,
      wanderSpeed: g.wanderSpeed,
      minShellRadius: g.minShellRadius,
    });
  }, [themeId, cfg.entries?.length, companionUseWebpFish, g.wanderSpeed, g.minShellRadius]);

  return (
    <>
      {cfg.entries.map((e) => {
        const schoolCore = {
          count: Math.round((e.count * debugBoost)),
          clusterCount: e.clusterCount ?? 3,
          seed: e.seed,
          bounds: e.bounds,
          spread: e.spread ?? 1,
          swimSpeed: swimSpeed * (e.swimMul ?? 0.75),
          shimmerIntensity: shimmerIntensity * shimMul,
          foregroundCrossingChance: e.foregroundCrossingChance ?? 0.06,
          avoidanceRadius: e.avoidance ?? 2.6,
          scatterEnabled: true,
          randomScatterFrequency: 0.09,
          scatterRadius: 3.2,
          scatterStrength: 0.85,
          scatterDuration: 0.4,
          scatterRecoverySpeed: 1,
          chainReactionChance: 0.35,
          bubbleTrailEnabled: false,
          bubbleSpawnRate: 0,
          maxBubbles: 0,
          lightBeam: null,
          clusterAnchorY: 0,
          heroDepthCue,
          countMode: 'satellite',
          baseWidth: e.baseWidth ?? 1.65,
        };

        const entryTuning = {
          lagBack: e.lagBack,
          sideAmp: e.sideAmp,
          vertAmp: e.vertAmp,
          follow: e.followSharpness ?? 0.75,
          wanderPhase: e.wanderPhase ?? 0,
          debugSeed: e.seed,
        };

        return (
          <CompanionAnchor
            key={`${themeId}-ac-${e.seed}`}
            global={g}
            entry={entryTuning}
            catchUpMaxPerSec={
              themeId === 'salmonDaysRadio' ? 5.4 : Number.POSITIVE_INFINITY
            }
          >
            <ErrorBoundary fallback={null}>
              {companionUseWebpFish ? (
                <Suspense fallback={null}>
                  <WebpFishSchool
                    mainUrl={theme.fish.mainTexture}
                    riderUrl={null}
                    textureFacesLeft={theme.fish.textureFacesLeft}
                    {...schoolCore}
                    enableRider={false}
                    riderScaleMultiplier={1}
                    riderShimmerBoost={1}
                    riderGlowBoost={1}
                    riderCanScatter={false}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={null}>
                  <SalmonSvgFallback
                    {...schoolCore}
                    enableRider={false}
                    riderScaleMultiplier={1}
                    riderShimmerBoost={1}
                    riderGlowBoost={1}
                    riderCanScatter={false}
                  />
                </Suspense>
              )}
            </ErrorBoundary>
          </CompanionAnchor>
        );
      })}
    </>
  );
}
