import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getMidShadowFishBillboardTexture,
  getShadowSilhouetteFishTexture,
} from './assets/distantFishTexture.js';

/**
 * Salmon Days only: distant + mid-distance dark fish silhouettes that read as
 * loose schools (clusters, ribbons, arcs), not static specks — billboards face
 * the camera with directional art; whole schools drift slowly through the volume.
 */

const _v = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _instCol = new THREE.Color();

/** Per-instance depth veil (RGB darkening into water — not transparency). */
const SILO_NEAR = new THREE.Color('#0c1524');
const SILO_MID = new THREE.Color('#081018');
const SILO_FAR = new THREE.Color('#030a14');
const MID_NEAR = new THREE.Color('#0f1828');
const MID_FAR = new THREE.Color('#050a14');

/**
 * @typedef {{ kind: 'cluster' | 'ribbon' | 'arc', center0: [number,number,number], velocity: [number,number,number], radius: number, baseCount: number, vertical: number, rate: number, phase: number, ribbonLen?: number, arcSpan?: number }} SchoolSpec
 */

/** Hand-tuned table: wrap the camera on Y and XZ; mix forward / side / above / behind. */
const SCHOOL_SPECS = /** @type {SchoolSpec[]} */ ([
  { kind: 'cluster', center0: [0, 14, -88], velocity: [0.11, -0.03, -0.19], radius: 26, baseCount: 680, vertical: 1.12, rate: 0.0068, phase: 0.91 },
  { kind: 'ribbon', center0: [-52, 6, -62], velocity: [-0.14, 0.04, -0.11], radius: 14, baseCount: 520, vertical: 0.55, rate: 0.0078, phase: 2.17, ribbonLen: 48 },
  { kind: 'arc', center0: [48, -8, -58], velocity: [0.09, 0.02, -0.16], radius: 20, baseCount: 560, vertical: 0.92, rate: 0.0072, phase: 4.02, arcSpan: 1.35 },
  { kind: 'cluster', center0: [-28, -18, -52], velocity: [-0.06, 0.07, -0.12], radius: 19, baseCount: 540, vertical: 1.08, rate: 0.0081, phase: 1.33 },
  { kind: 'ribbon', center0: [22, 20, -48], velocity: [0.05, -0.05, -0.14], radius: 17, baseCount: 500, vertical: 0.62, rate: 0.0088, phase: 3.55, ribbonLen: 44 },
  { kind: 'cluster', center0: [-38, -6, 48], velocity: [-0.1, 0.02, 0.13], radius: 21, baseCount: 580, vertical: 1.02, rate: 0.0074, phase: 5.1 },
  { kind: 'arc', center0: [42, 10, 42], velocity: [0.12, -0.02, 0.11], radius: 18, baseCount: 510, vertical: 0.98, rate: 0.007, phase: 2.88, arcSpan: 1.22 },
  { kind: 'cluster', center0: [-8, -22, 22], velocity: [0.04, 0.09, 0.08], radius: 16, baseCount: 490, vertical: 1.15, rate: 0.0092, phase: 0.45 },
  { kind: 'ribbon', center0: [58, 2, -28], velocity: [0.08, 0.01, 0.09], radius: 15, baseCount: 480, vertical: 0.58, rate: 0.0076, phase: 4.71, ribbonLen: 52 },
  { kind: 'cluster', center0: [-58, -14, -34], velocity: [-0.09, -0.04, -0.07], radius: 20, baseCount: 620, vertical: 1.06, rate: 0.0084, phase: 1.92 },
  { kind: 'arc', center0: [8, 26, 12], velocity: [0.02, -0.06, 0.15], radius: 17, baseCount: 530, vertical: 0.72, rate: 0.008, phase: 3.08, arcSpan: 1.5 },
  { kind: 'cluster', center0: [32, -20, -72], velocity: [0.06, 0.05, -0.18], radius: 22, baseCount: 600, vertical: 1.1, rate: 0.0065, phase: 5.55 },
  { kind: 'ribbon', center0: [-18, 18, 58], velocity: [-0.05, -0.03, 0.14], radius: 16, baseCount: 470, vertical: 0.7, rate: 0.0086, phase: 2.22, ribbonLen: 40 },
  { kind: 'cluster', center0: [0, -26, -36], velocity: [0.03, 0.08, -0.1], radius: 18, baseCount: 550, vertical: 1.18, rate: 0.009, phase: 0.77 },
  { kind: 'cluster', center0: [64, 8, -8], velocity: [0.07, -0.01, 0.06], radius: 19, baseCount: 590, vertical: 0.95, rate: 0.0071, phase: 4.88 },
  { kind: 'arc', center0: [-46, 12, 8], velocity: [-0.11, -0.02, 0.05], radius: 18, baseCount: 505, vertical: 0.88, rate: 0.0079, phase: 1.55, arcSpan: 1.28 },
  { kind: 'ribbon', center0: [14, -12, 64], velocity: [0.04, 0.06, 0.11], radius: 14, baseCount: 460, vertical: 0.65, rate: 0.0082, phase: 3.91, ribbonLen: 46 },
  { kind: 'cluster', center0: [-24, 0, -78], velocity: [-0.07, 0.03, -0.2], radius: 24, baseCount: 650, vertical: 1.04, rate: 0.0066, phase: 2.66 },
  { kind: 'cluster', center0: [26, 22, -22], velocity: [0.1, -0.04, 0.07], radius: 16, baseCount: 515, vertical: 0.82, rate: 0.0089, phase: 5.33 },
  { kind: 'arc', center0: [-12, -8, 72], velocity: [-0.04, 0.03, 0.16], radius: 21, baseCount: 545, vertical: 1.0, rate: 0.0073, phase: 0.12, arcSpan: 1.4 },
  { kind: 'cluster', center0: [50, -16, 28], velocity: [0.05, 0.04, 0.1], radius: 17, baseCount: 525, vertical: 1.07, rate: 0.0085, phase: 4.44 },
  { kind: 'ribbon', center0: [-36, 20, -18], velocity: [-0.08, -0.05, -0.06], radius: 15, baseCount: 495, vertical: 0.68, rate: 0.0077, phase: 2.01, ribbonLen: 42 },
  { kind: 'cluster', center0: [6, 4, -95], velocity: [0.02, -0.02, -0.21], radius: 25, baseCount: 700, vertical: 1.14, rate: 0.0064, phase: 3.67 },
  { kind: 'cluster', center0: [-54, -20, 18], velocity: [-0.05, 0.06, 0.09], radius: 18, baseCount: 535, vertical: 1.09, rate: 0.0087, phase: 1.18 },
]);

/** Wrap school anchor so schools stay in a soft bounding volume (toroidal revisit). */
function wrapCenter(v) {
  const maxR = 118;
  const maxY = 34;
  if (v.x * v.x + v.z * v.z > maxR * maxR) {
    const il = maxR / Math.hypot(v.x, v.z);
    v.x *= il;
    v.z *= il;
  }
  v.y = THREE.MathUtils.clamp(v.y, -maxY, maxY);
  return v;
}

function buildLocalPositions(spec, count, rnd) {
  const arr = new Float32Array(count * 3);
  const { kind, radius, vertical } = spec;
  const ribbonLen = spec.ribbonLen ?? 36;
  const arcSpan = spec.arcSpan ?? 1.2;

  if (kind === 'ribbon') {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) - 0.5 : 0;
      const along = t * ribbonLen;
      arr[i * 3 + 0] = along + (rnd() - 0.5) * radius * 0.42;
      arr[i * 3 + 1] = (rnd() - 0.5) * radius * vertical * 0.55;
      arr[i * 3 + 2] = (rnd() - 0.5) * radius * 0.48;
    }
    return arr;
  }

  if (kind === 'arc') {
    for (let i = 0; i < count; i++) {
      const u = rnd();
      const theta = -arcSpan * 0.5 + u * arcSpan;
      const rr = radius * (0.38 + rnd() * 0.62);
      arr[i * 3 + 0] = Math.cos(theta) * rr;
      arr[i * 3 + 2] = Math.sin(theta) * rr;
      arr[i * 3 + 1] = (rnd() - 0.5) * radius * vertical;
    }
    return arr;
  }

  // cluster — ellipsoid + mild toward-core bias for school cohesion
  for (let i = 0; i < count; i++) {
    const r = radius * Math.cbrt(rnd() * 0.92 + 0.08);
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.cos(phi) * vertical;
    arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return arr;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ShadowSchool({
  spec,
  count,
  speed,
  opacity,
  texture,
  pointSize,
  driftPhase,
  centerRef,
}) {
  const groupRef = useRef();
  const rnd = useMemo(() => mulberry32((spec.phase * 10007) >>> 0), [spec.phase]);
  const positions = useMemo(
    () => buildLocalPositions(spec, count, rnd),
    [spec, count, rnd],
  );

  const sizes = useMemo(() => {
    const arr = new Float32Array(count);
    const rad = spec.radius;
    for (let i = 0; i < count; i++) {
      const dx = positions[i * 3];
      const dy = positions[i * 3 + 1];
      const dz = positions[i * 3 + 2];
      const distN = Math.hypot(dx, dy, dz) / rad;
      const outer = THREE.MathUtils.smoothstep(0.2, 0.95, distN);
      const speck =
        distN > 0.78 ? THREE.MathUtils.smoothstep(0.78, 1.0, distN) * 0.5 + 0.42 : 1.0;
      const farShrink = 1.0 - outer * 0.58;
      arr[i] = (0.22 + rnd() * 0.36) * farShrink * speck;
    }
    return arr;
  }, [count, rnd, positions, spec.radius]);

  const colors = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const rad = spec.radius;
    for (let i = 0; i < count; i++) {
      const dx = positions[i * 3];
      const dy = positions[i * 3 + 1];
      const dz = positions[i * 3 + 2];
      const distN = Math.hypot(dx, dy, dz) / rad;
      const v = THREE.MathUtils.smoothstep(0.1, 0.9, distN);
      _instCol.copy(SILO_NEAR).lerp(SILO_MID, v * 0.62).lerp(SILO_FAR, v * v * 0.92);
      arr[i * 3] = _instCol.r;
      arr[i * 3 + 1] = _instCol.g;
      arr[i * 3 + 2] = _instCol.b;
    }
    return arr;
  }, [count, positions, spec.radius]);

  const glintPick = useMemo(() => {
    const nGlint = Math.max(18, Math.floor(count * 0.26));
    const idx = new Uint16Array(nGlint);
    const rad = spec.radius;
    const weights = new Float32Array(count);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const d =
        Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) / rad;
      const w = 0.12 + d * d;
      weights[i] = w;
      sum += w;
    }
    for (let g = 0; g < nGlint; g++) {
      let pick = rnd() * sum;
      let chosen = count - 1;
      for (let i = 0; i < count; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          chosen = i;
          break;
        }
      }
      idx[g] = chosen;
    }
    return { idx, nGlint };
  }, [count, rnd, positions, spec.radius]);

  const glintPositions = useMemo(() => {
    const { idx, nGlint } = glintPick;
    const arr = new Float32Array(nGlint * 3);
    for (let g = 0; g < nGlint; g++) {
      const i = idx[g];
      arr[g * 3 + 0] = positions[i * 3 + 0];
      arr[g * 3 + 1] = positions[i * 3 + 1];
      arr[g * 3 + 2] = positions[i * 3 + 2];
    }
    return arr;
  }, [glintPick, positions]);

  const vel = useMemo(
    () =>
      new THREE.Vector3(spec.velocity[0], spec.velocity[1], spec.velocity[2]).multiplyScalar(
        6.2,
      ),
    [spec.velocity],
  );

  const shadowPointMat = useMemo(() => {
    const m = new THREE.PointsMaterial({
      map: texture,
      size: pointSize,
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity,
      alphaTest: 0.035,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      fog: false,
      toneMapped: false,
    });
    m.customProgramCacheKey = () => 'aquarium_salmon_shadow_pts_v1';
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aScale;\nvoid main() {')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aScale;');
    };
    return m;
  }, [texture, pointSize, opacity]);

  useFrame((s, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const t = s.clock.elapsedTime;
    _v.copy(vel).multiplyScalar(dt * speed);
    centerRef.current.add(_v);
    wrapCenter(centerRef.current);
    g.position.copy(centerRef.current);

    const yaw = Math.atan2(vel.x, vel.z) + t * 0.018 * speed + driftPhase * 0.04;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, yaw, 0.06);
    g.rotation.x = Math.sin(t * 0.041 + driftPhase) * 0.022;
    g.rotation.z = Math.sin(t * 0.023 + driftPhase * 1.3) * 0.014;
    g.rotation.y += dt * spec.rate * speed * 0.38;
  });

  const glintRef = useRef();

  useFrame((s) => {
    const gr = glintRef.current;
    if (!gr?.material) return;
    const pulse =
      0.28 +
      0.5 *
        (0.5 +
          0.5 * Math.sin(s.clock.elapsedTime * 1.4 + driftPhase * 2.1));
    gr.material.opacity = THREE.MathUtils.clamp(opacity * pulse, 0.08, 0.52);
  });

  return (
    <group
      ref={groupRef}
      position={[centerRef.current.x, centerRef.current.y, centerRef.current.z]}
      frustumCulled={false}
    >
      <points frustumCulled={false} material={shadowPointMat} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aScale" count={count} array={sizes} itemSize={1} />
          <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
        </bufferGeometry>
      </points>
      <points ref={glintRef} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={glintPick.nGlint}
            array={glintPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={texture}
          size={pointSize * 0.52}
          color="#dce8f5"
          transparent
          opacity={opacity * 0.34}
          alphaTest={0.02}
          depthWrite={false}
          depthTest
          sizeAttenuation
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

function MidSilhouetteLayer({ density, speed, opacity, texture }) {
  const COUNT = Math.max(56, Math.round(268 * density));
  const meshRef = useRef();
  /** Elongated quad: long +X fish silhouette, shallow height — avoids squat “cards”. */
  const geo = useMemo(() => new THREE.PlaneGeometry(1.3, 0.34), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        color: '#ffffff',
        transparent: true,
        opacity: THREE.MathUtils.clamp(opacity * 0.78, 0.2, 0.82),
        alphaTest: 0.06,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [texture, opacity],
  );
  const headings = useMemo(
    () => Float32Array.from({ length: COUNT }, () => Math.random() * Math.PI * 2),
    [COUNT],
  );
  const phase = useMemo(
    () => Float32Array.from({ length: COUNT }, () => Math.random() * Math.PI * 2),
    [COUNT],
  );
  const swim = useMemo(
    () =>
      Float32Array.from({ length: COUNT }, () => (Math.random() - 0.5) * 0.14),
    [COUNT],
  );
  const base = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const shell = Math.random();
      const u = Math.random() * Math.PI * 2;
      if (shell < 0.38) {
        const rr = 14 + Math.random() * 36;
        arr[i * 3 + 0] = Math.cos(u) * rr;
        arr[i * 3 + 1] = -8 + Math.random() * 26;
        arr[i * 3 + 2] = Math.sin(u) * rr + (Math.random() - 0.5) * 14;
      } else {
        const rr = 32 + Math.random() * 62;
        arr[i * 3 + 0] = Math.cos(u) * rr;
        arr[i * 3 + 1] = -18 + Math.random() * 38;
        arr[i * 3 + 2] = -30 - Math.random() * 72;
      }
    }
    return arr;
  }, [COUNT]);

  useLayoutEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    for (let i = 0; i < COUNT; i++) {
      const z = base[i * 3 + 2];
      const depthT = THREE.MathUtils.clamp((-30 - z) / 78, 0, 1);
      _dummy.position.set(base[i * 3], base[i * 3 + 1], z);
      _dummy.rotation.set(0, headings[i], 0);
      const sc = (0.95 + Math.random() * 1.05) * (0.78 + depthT * 0.24);
      _dummy.scale.set(sc * 1.18, sc * 0.34, 1);
      _dummy.updateMatrix();
      m.setMatrixAt(i, _dummy.matrix);
      _instCol.copy(MID_NEAR).lerp(MID_FAR, THREE.MathUtils.smoothstep(0.08, 1.0, depthT));
      m.setColorAt(i, _instCol);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [COUNT, base, headings]);

  useFrame((s, dt) => {
    const m = meshRef.current;
    if (!m) return;
    mat.opacity = THREE.MathUtils.clamp(
      opacity * (0.74 + 0.14 * Math.sin(s.clock.elapsedTime * 0.31)),
      0.18,
      0.82,
    );
    const t = s.clock.elapsedTime;
    const ds = dt * speed;
    for (let i = 0; i < COUNT; i++) {
      const hx = Math.cos(headings[i]);
      const hz = Math.sin(headings[i]);
      base[i * 3 + 0] += hx * 1.45 * ds + swim[i] * Math.sin(t * 0.38 + phase[i]);
      base[i * 3 + 1] += Math.sin(t * 0.26 + phase[i] * 1.3) * 0.42 * ds;
      base[i * 3 + 2] += hz * 1.45 * ds + swim[i] * Math.cos(t * 0.34 + phase[i]);

      if (base[i * 3 + 0] ** 2 + base[i * 3 + 2] ** 2 > 105 ** 2) {
        base[i * 3 + 0] *= 0.72;
        base[i * 3 + 2] *= 0.72;
      }
      base[i * 3 + 1] = THREE.MathUtils.clamp(base[i * 3 + 1], -24, 26);
      base[i * 3 + 2] = THREE.MathUtils.clamp(base[i * 3 + 2], -104, 28);

      const z = base[i * 3 + 2];
      const depthT = THREE.MathUtils.clamp((-30 - z) / 78, 0, 1);

      _dummy.position.set(base[i * 3], base[i * 3 + 1], z);
      _dummy.rotation.set(
        Math.sin(t * 0.16 + phase[i]) * 0.08,
        headings[i] + Math.sin(t * 0.11 + swim[i]) * 0.05,
        Math.cos(t * 0.12 + phase[i]) * 0.04,
      );
      const sc =
        (0.88 + 0.26 * Math.sin(t * 0.7 + phase[i] * 2)) * (0.75 + depthT * 0.28);
      _dummy.scale.set(sc * 1.18, sc * 0.34, 1);
      _dummy.updateMatrix();
      m.setMatrixAt(i, _dummy.matrix);

      _instCol.copy(MID_NEAR).lerp(MID_FAR, THREE.MathUtils.smoothstep(0.08, 1.0, depthT));
      m.setColorAt(i, _instCol);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, COUNT]}
      frustumCulled={false}
      renderOrder={-2}
      raycast={() => null}
    />
  );
}

/**
 * @param {number} density — Leva multiplier (same family as BackgroundFishClouds)
 * @param {number} speed
 * @param {number} opacity — master silhouette opacity (/theme tuned)
 */
export default function SalmonShadowFishSilhouettes({
  density = 1,
  speed = 1,
  opacity = 0.88,
}) {
  const shadowTex = useMemo(() => getShadowSilhouetteFishTexture(), []);
  const midTex = useMemo(() => getMidShadowFishBillboardTexture(), []);
  const groupRef = useRef();

  const schoolCenterRefs = useMemo(
    () =>
      SCHOOL_SPECS.map((s) => ({
        current: new THREE.Vector3(s.center0[0], s.center0[1], s.center0[2]),
      })),
    [],
  );

  useFrame((s, dt) => {
    if (!groupRef.current) return;
    const t = s.clock.elapsedTime;
    groupRef.current.rotation.y += dt * 0.0012 * speed;
    groupRef.current.rotation.x = Math.sin(t * 0.008) * 0.006;
  });

  if (density <= 0) return null;

  const scale = density * 0.95;
  const pointSize = 0.38;

  return (
    <group ref={groupRef}>
      {SCHOOL_SPECS.map((spec, i) => {
        const count = Math.max(96, Math.round(spec.baseCount * scale));
        const o = opacity * (0.98 - (i % 5) * 0.008);
        return (
          <ShadowSchool
            key={i}
            spec={spec}
            count={count}
            speed={speed}
            opacity={THREE.MathUtils.clamp(o, 0.42, 0.96)}
            texture={shadowTex}
            pointSize={pointSize}
            driftPhase={spec.phase ?? i * 1.31}
            centerRef={schoolCenterRefs[i]}
          />
        );
      })}
      <MidSilhouetteLayer density={scale} speed={speed} opacity={opacity} texture={midTex} />
    </group>
  );
}
