import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import ErrorBoundary from './ErrorBoundary.jsx';

/**
 * Blue whale skeleton GLB — **London Natural History Museum Imaging** (see README).
 */
export const SALMON_WHALE_SKELETON_URL = '/models/blue_whale_skeleton.glb';

/**
 * Deep abyss — below swim band; scene fog + subtle tilted murk sheets (no camera-facing rings).
 */
export const SALMON_WHALE_POSITION = [4.2, -106, 16];

/** Yaw / pitch / roll in radians after model is centered (tune GLB orientation). */
export const SALMON_WHALE_ROTATION = [0.12, -1.05, 0.04];

/** Uniform scale multiplier applied after bounding-box fit. */
export const SALMON_WHALE_SCALE_MUL = 1.26;

/** Target max dimension in world units once bbox-normalized. */
export const SALMON_WHALE_TARGET_LEN = 52;

/** Muted bone — murk billboards do the depth read; keep albedo modest. */
const WHALE_BONE_COLOR = /* @__PURE__ */ new THREE.Color('#858d98');

/** Scales bone albedo after the tint above (0.25 = quarter of base brightness). */
const WHALE_DIM_MUL = 0.25;

const _whaleWorld = /* @__PURE__ */ new THREE.Vector3();
const _camDir = /* @__PURE__ */ new THREE.Vector3();

let _murkIrregularAlphaTex = null;

/**
 * Non-radial alpha: several soft, off-center smudges so stacked planes never read
 * as concentric rings or a spotlight disk.
 */
function getWhaleMurkIrregularAlphaTexture() {
  if (_murkIrregularAlphaTex) return _murkIrregularAlphaTex;
  const s = 192;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const smudges = [
    { cx: 0.31, cy: 0.22, rx: 0.38, ry: 0.5, rot: 0.35, a: 0.45 },
    { cx: 0.72, cy: 0.58, rx: 0.48, ry: 0.33, rot: -0.62, a: 0.38 },
    { cx: 0.48, cy: 0.78, rx: 0.42, ry: 0.44, rot: 1.1, a: 0.32 },
    { cx: 0.18, cy: 0.65, rx: 0.35, ry: 0.4, rot: 0.18, a: 0.28 },
    { cx: 0.62, cy: 0.28, rx: 0.33, ry: 0.36, rot: 2.0, a: 0.26 },
    { cx: 0.42, cy: 0.45, rx: 0.55, ry: 0.25, rot: -0.25, a: 0.22 },
  ];
  for (const sm of smudges) {
    const gx = sm.cx * s;
    const gy = sm.cy * s;
    const rx = sm.rx * s;
    const ry = sm.ry * s;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(rx, ry));
    g.addColorStop(0, `rgba(255,255,255,${sm.a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${sm.a * 0.35})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(sm.rot);
    ctx.translate(-gx, -gy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  _murkIrregularAlphaTex = tex;
  return tex;
}

/**
 * Irregular abyss murk: few tilted, offset planes (not camera-facing circles)
 * so nothing forms concentric ring artifacts around the whale.
 */
export function buildSalmonWhaleMurkSoftLayers(boxSize) {
  if (!boxSize) return null;
  const { x, y, z } = boxSize;
  const mx = Math.max(x, y, z, 1);
  const op = [0.022, 0.026, 0.02];
  return [
    {
      key: 'murk-a',
      position: [mx * 0.05, y * 0.08, mx * 0.04],
      rotation: [0.52, -0.38, 0.15],
      size: [mx * 1.45, mx * 1.1],
      opacity: op[0],
      color: '#020308',
    },
    {
      key: 'murk-b',
      position: [-mx * 0.07, -y * 0.04, -mx * 0.02],
      rotation: [-0.31, 0.44, -0.22],
      size: [mx * 1.35, mx * 1.25],
      opacity: op[1],
      color: '#010206',
    },
    {
      key: 'murk-c',
      position: [mx * 0.02, -y * 0.18, mx * 0.06],
      rotation: [0.2, 0.6, 0.41],
      size: [mx * 1.2, mx * 0.95],
      opacity: op[2],
      color: '#010205',
    },
  ];
}

/** @deprecated Replaced by `buildSalmonWhaleMurkSoftLayers`; kept name for shallow export compat. */
export function buildSalmonWhaleMurkDescriptors(boxSize) {
  const layers = buildSalmonWhaleMurkSoftLayers(boxSize);
  return layers ? { softLayers: layers } : null;
}

function readAqWhaleDebug() {
  try {
    const v = new URLSearchParams(window.location.search).get('aqwhaledebug');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/**
 * Solid bone: opaque, depth write, fog; no per-distance alpha tricks on the mesh.
 */
function buildWhaleMaterials(root) {
  const materials = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      if (!m) return m;
      const mat = m.clone();
      mat.fog = true;
      mat.toneMapped = true;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.metalness = Math.min(mat.metalness ?? 0, 0.03);
        mat.roughness = Math.min(1, (mat.roughness ?? 0.55) + 0.3);
        mat.envMapIntensity = 0;
        if (mat.color) {
          mat.color.copy(WHALE_BONE_COLOR).multiplyScalar(WHALE_DIM_MUL);
        }
        if (mat.emissive) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
      } else if (mat.isMeshBasicMaterial) {
        if (mat.color)
          mat.color.copy(WHALE_BONE_COLOR).multiplyScalar(WHALE_DIM_MUL);
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
      } else {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
      }
      mat.needsUpdate = true;
      materials.push(mat);
      return mat;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  return materials;
}

/**
 * Dark veils: tilted planes + irregular alpha — avoids billboard circles stacking as concentric rings.
 */
function WhaleAbyssMurkSoft({ layers }) {
  const alphaMap = useMemo(() => getWhaleMurkIrregularAlphaTexture(), []);
  if (!layers?.length) return null;
  return (
    <group>
      {layers.map((L) => {
        const w = L.size?.[0] ?? 1;
        const h = L.size?.[1] ?? 1;
        const rot = L.rotation ?? [0, 0, 0];
        return (
          <mesh
            key={L.key}
            position={L.position}
            rotation={rot}
            scale={[w, h, 1]}
            renderOrder={4}
            raycast={() => null}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              color={L.color}
              alphaMap={alphaMap}
              transparent
              opacity={L.opacity}
              depthWrite={false}
              depthTest
              side={THREE.DoubleSide}
              fog
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function WhaleDebugOverlay({ boxSize, groupRef, whaleWorldPos, murkMeta }) {
  const { camera } = useThree();
  const accLog = useRef(0);
  const s = boxSize ?? { x: 1, y: 1, z: 1 };

  useFrame((_, delta) => {
    accLog.current += delta;
    if (accLog.current < 1.25) return;
    accLog.current = 0;
    const g = groupRef.current;
    let avgOp = null;
    if (g) {
      const mats = [];
      g.traverse((o) => {
        if (!o.isMesh) return;
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of arr) if (m) mats.push(m);
      });
      if (mats.length) {
        let t = 0;
        for (const m of mats) t += m.opacity ?? 1;
        avgOp = t / mats.length;
      }
      g.getWorldPosition(_whaleWorld);
    }
    const dist = g ? camera.position.distanceTo(_whaleWorld) : null;
    camera.getWorldDirection(_camDir);
    const lookDown = THREE.MathUtils.smoothstep(0.04, -0.46, _camDir.y);
    console.info('[aqwhaledebug]', {
      whaleWorld: _whaleWorld.toArray(),
      whaleGroupExport: whaleWorldPos,
      bboxSize: { x: s.x, y: s.y, z: s.z },
      targetLen: SALMON_WHALE_TARGET_LEN,
      scaleMul: SALMON_WHALE_SCALE_MUL,
      cameraDistance: dist,
      avgMaterialOpacity: avgOp,
      boneAlbedo: `#${WHALE_BONE_COLOR.getHex().toString(16).padStart(6, '0')}`,
      cameraLookY: _camDir.y,
      lookDownSmooth: lookDown,
      pitchDistanceOpacityModifiersActive: false,
      murk: murkMeta,
      note: 'Murk: 3 tilted planes + irregular alphaMap (no billboard circles).',
    });
  });

  return (
    <mesh raycast={() => null}>
      <boxGeometry args={[s.x * 1.04, s.y * 1.04, s.z * 1.04]} />
      <meshBasicMaterial
        color="#6a9fa8"
        wireframe
        transparent
        opacity={0.32}
        depthTest={false}
      />
    </mesh>
  );
}

function SalmonWhaleSkeletonLoaded({ showDebug }) {
  const { scene } = useGLTF(SALMON_WHALE_SKELETON_URL);
  const [root, setRoot] = useState(null);
  const [boxSize, setBoxSize] = useState(null);
  const groupRef = useRef(null);

  const murkLayers = useMemo(
    () => buildSalmonWhaleMurkSoftLayers(boxSize),
    [boxSize],
  );

  useLayoutEffect(() => {
    const cloned = scene.clone(true);
    buildWhaleMaterials(cloned);

    const box0 = new THREE.Box3().setFromObject(cloned);
    const size0 = box0.getSize(new THREE.Vector3());
    const maxDim = Math.max(size0.x, size0.y, size0.z, 0.001);
    const sc =
      (SALMON_WHALE_TARGET_LEN / maxDim) * (SALMON_WHALE_SCALE_MUL || 1);
    cloned.scale.multiplyScalar(sc);
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const c = box.getCenter(new THREE.Vector3());
    cloned.position.sub(c);
    const sz = box.getSize(new THREE.Vector3());
    setBoxSize({ x: sz.x, y: sz.y, z: sz.z });
    setRoot(cloned);
  }, [scene]);

  if (!root) return null;

  return (
    <group
      ref={groupRef}
      position={SALMON_WHALE_POSITION}
      rotation={SALMON_WHALE_ROTATION}
    >
      <primitive object={root} />
      <WhaleAbyssMurkSoft layers={murkLayers} />
      {showDebug && boxSize && (
        <WhaleDebugOverlay
          boxSize={boxSize}
          groupRef={groupRef}
          whaleWorldPos={SALMON_WHALE_POSITION}
          murkMeta={{ softLayerCount: murkLayers?.length ?? 0 }}
        />
      )}
    </group>
  );
}

/**
 * Distant abyss whale — opaque bone + scene fog + irregular murk sheets (no ring stack).
 *
 * `?aqwhaledebug=1` — wireframe bbox fit + `[aqwhaledebug]` logs only (no cage in normal play).
 */
export default function SalmonWhaleSkeleton({ fogColor }) {
  void fogColor;
  const showDebug = useMemo(() => readAqWhaleDebug(), []);
  return (
    <ErrorBoundary name="SalmonWhaleSkeleton" fallback={null}>
      <Suspense fallback={null}>
        <SalmonWhaleSkeletonLoaded showDebug={showDebug} />
      </Suspense>
    </ErrorBoundary>
  );
}

useGLTF.preload(SALMON_WHALE_SKELETON_URL);
