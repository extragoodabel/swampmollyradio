import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SWAMP_MOLLY_POEM_RAW } from '../content/swampMollyPoem.js';
import { AQ_POEM_DEBUG } from '../debug/aquariumRecovery.js';
import {
  SWAMP_POEM_BREAKUP_DURATION,
  SWAMP_POEM_FADE_DURATION,
  SWAMP_POEM_LETTER_DRIFT,
  SWAMP_POEM_LETTER_FALL,
  SWAMP_POEM_LINGER_DURATION,
  SWAMP_POEM_REBUILD_WORLD_POSITION,
  SWAMP_POEM_REBUILD_WORLD_ROTATION,
  SWAMP_POEM_TRIGGER_CENTER_OFFSET,
  SWAMP_POEM_TRIGGER_HALF_DEPTH,
  SWAMP_POEM_TRIGGER_HALF_HEIGHT,
  SWAMP_POEM_TRIGGER_HALF_WIDTH,
  SWAMP_POEM_WORLD_SCALE,
} from './swampMollyPoemRebuildConstants.js';
import { buildSwampPoemRebuildPanels } from './swampMollyPoemRebuildLayout.js';
import { typographyFillHex } from './typographyPalette.js';

const POEM_RENDER_ORDER = 120;
const _wpos = new THREE.Vector3();
const _camLocal = new THREE.Vector3();

const _texCache = new Map();

/** @param {string} char @param {string} fillHex */
function letterTexture(char, fillHex) {
  const key = `${fillHex}::${char}`;
  let e = _texCache.get(key);
  if (e) return e;
  const cnv = document.createElement('canvas');
  const s = 72;
  cnv.width = s;
  cnv.height = s;
  const ctx = cnv.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.font = `${s * 0.62}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = fillHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(8, 32, 28, 0.45)';
  ctx.shadowBlur = 3;
  ctx.fillText(char, s * 0.5, s * 0.52);
  const map = new THREE.CanvasTexture(cnv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  e = { map, w: s * 0.011 };
  _texCache.set(key, e);
  return e;
}

/**
 * Swamp-only rebuilt poem: idle = few canvas planes; dissipation = per-letter particles only.
 *
 * @param {{
 *   seabedDepth: number;
 *   murkiness: number;
 *   typographyTint: object | null;
 *   onDissipated?: () => void;
 * }} props
 */
export default function SwampMollyPoemRebuild({
  seabedDepth,
  murkiness,
  typographyTint,
  onDissipated,
}) {
  const { camera } = useThree();
  const rootRef = useRef(/** @type {THREE.Group | null} */ (null));
  const dissTRef = useRef(0);
  const triggeredRef = useRef(false);
  const heartbeatRef = useRef(0);
  const pollAccRef = useRef(0);
  const panelMatRefs = useRef(/** @type {(THREE.MeshBasicMaterial | undefined)[]} */ ([]));
  const particleStateRef = useRef(
    /** @type {null | { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3; driftMul: number }[]} */ (
      null
    ),
  );

  const [lifecycle, setLifecycle] = useState(/** @type {'idle' | 'dissipating' | 'gone'} */ ('idle'));

  const worldPos = useMemo(
    () => SWAMP_POEM_REBUILD_WORLD_POSITION(seabedDepth),
    [seabedDepth],
  );
  const worldRot = useMemo(
    () => SWAMP_POEM_REBUILD_WORLD_ROTATION(seabedDepth),
    [seabedDepth],
  );

  const fillHex = useMemo(
    () => typographyFillHex(murkiness, typographyTint),
    [murkiness, typographyTint],
  );

  const layout = useMemo(
    () => buildSwampPoemRebuildPanels(SWAMP_MOLLY_POEM_RAW, murkiness, typographyTint),
    [murkiness, typographyTint],
  );

  const { panels, bounds } = layout;

  useLayoutEffect(() => {
    panelMatRefs.current = new Array(panels.length);
  }, [panels.length]);

  useEffect(() => {
    return () => {
      for (const p of panels) {
        p.texture.dispose();
      }
      const ps = particleStateRef.current;
      if (ps) {
        for (const x of ps) {
          x.mesh.geometry.dispose();
          const m = x.mesh.material;
          if (m && !Array.isArray(m)) m.dispose();
        }
      }
    };
  }, [panels]);

  useEffect(() => {
    if (!AQ_POEM_DEBUG) return;
    console.info('[aqpoemdebug]', {
      oldPoemRendererMounted: false,
      newPoemRendererMounted: true,
      poemRebuild: 'SwampMollyPoemRebuild',
    });
  }, []);

  const startDissipation = useCallback(
    (reason) => {
      if (triggeredRef.current) return;
      const grp = rootRef.current;
      if (!grp) return;
      triggeredRef.current = true;
      dissTRef.current = 0;
      setLifecycle('dissipating');
      if (AQ_POEM_DEBUG) {
        console.info('[aqpoemdebug] dissipationStart', {
          dissipationStartReason: reason,
        });
      }

      /** @type {{ mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3; driftMul: number }[]} */
      const next = [];
      const rng = (i, k) => {
        const v = Math.sin(i * 12.9898 + k * 78.233 + 99.321) * 43758.5453;
        return v - Math.floor(v);
      };

      for (let i = 0; i < layout.allCharCells.length; i += 1) {
        const cell = layout.allCharCells[i];
        const { map: baseMap, w } = letterTexture(cell.char, fillHex);
        const map = baseMap.clone();
        map.needsUpdate = true;
        const geo = new THREE.PlaneGeometry(w, w * 1.05);
        const mat = new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = POEM_RENDER_ORDER + 2;
        mesh.position.set(cell.lx, cell.ly, 0.02);
        grp.add(mesh);
        const vel = new THREE.Vector3(
          (rng(i, 1) - 0.5) * SWAMP_POEM_LETTER_DRIFT * 1.8,
          SWAMP_POEM_LETTER_FALL * (0.55 + rng(i, 2)),
          (rng(i, 3) - 0.5) * SWAMP_POEM_LETTER_DRIFT * 1.4,
        );
        const rotVel = new THREE.Vector3(
          (rng(i, 4) - 0.5) * 1.1,
          (rng(i, 5) - 0.5) * 1.4,
          (rng(i, 6) - 0.5) * 1.0,
        );
        next.push({ mesh, vel, rotVel, driftMul: 0.85 + rng(i, 7) * 0.5 });
      }
      particleStateRef.current = next;
    },
    [layout.allCharCells, fillHex],
  );

  useFrame((_, dt) => {
    const root = rootRef.current;

    if (AQ_POEM_DEBUG) {
      heartbeatRef.current += dt;
      if (heartbeatRef.current >= 2) {
        heartbeatRef.current = 0;
        const dist = root
          ? camera.position.distanceTo(root.getWorldPosition(_wpos))
          : -1;
        const mats = panelMatRefs.current;
        const op0 = mats.find(Boolean)?.opacity;
        console.info('[aqpoemdebug] poemRebuildHeartbeat', {
          newPoemRendererMounted: true,
          oldPoemRendererMounted: false,
          lifecycle,
          panelCount: panels.length,
          groupVisible: root?.visible ?? false,
          frustumCulledGroup: root?.frustumCulled,
          materialOpacity: op0,
          depthTest: false,
          depthWrite: false,
          cameraDistanceToPoemGroup: dist,
          poemPosition: worldPos.slice(),
          poemRotation: worldRot.slice(),
        });
      }
    }

    if (!root || lifecycle === 'gone') return;

    if (lifecycle === 'idle') {
      root.updateMatrixWorld(true);
      _camLocal.copy(camera.position);
      root.worldToLocal(_camLocal);
      const ox = SWAMP_POEM_TRIGGER_CENTER_OFFSET[0];
      const oy = SWAMP_POEM_TRIGGER_CENTER_OFFSET[1];
      const oz = SWAMP_POEM_TRIGGER_CENTER_OFFSET[2];
      const lx = _camLocal.x - ox;
      const ly = _camLocal.y - oy;
      const lz = _camLocal.z - oz;
      const inside =
        Math.abs(lx) <= SWAMP_POEM_TRIGGER_HALF_WIDTH &&
        Math.abs(ly) <= SWAMP_POEM_TRIGGER_HALF_HEIGHT &&
        Math.abs(lz) <= SWAMP_POEM_TRIGGER_HALF_DEPTH;
      pollAccRef.current += dt;
      if (AQ_POEM_DEBUG && pollAccRef.current >= 1.2) {
        pollAccRef.current = 0;
        console.info('[aqpoemdebug] triggerPoll', {
          camLocalInPoemSpace: _camLocal.toArray(),
          insideTrigger: inside,
        });
      }
      if (inside && !triggeredRef.current) {
        startDissipation('volume');
      }
      return;
    }

    if (lifecycle === 'dissipating') {
      dissTRef.current += dt;
      const t = dissTRef.current;
      const br = SWAMP_POEM_BREAKUP_DURATION;
      const ling = SWAMP_POEM_LINGER_DURATION;
      const fd = SWAMP_POEM_FADE_DURATION;

      const pOp = Math.max(0, 1 - t / br);
      for (const m of panelMatRefs.current) {
        if (m) m.opacity = THREE.MathUtils.clamp(pOp, 0, 1);
      }

      const letterIn = Math.min(1, Math.max(0, (t - br * 0.35) / (br * 0.65 + 0.001)));
      const fadeStart = br + ling;
      const letterFade = Math.min(1, Math.max(0, (t - fadeStart) / fd));
      const op = letterIn * (1 - letterFade);

      const ps = particleStateRef.current;
      if (ps) {
        for (const x of ps) {
          x.mesh.material.opacity = THREE.MathUtils.clamp(op, 0, 1);
          x.mesh.position.addScaledVector(x.vel, dt * x.driftMul);
          x.vel.x +=
            (Math.sin(t * 0.7) * 0.06 + Math.sin(t * 0.33 + 1) * 0.04) * dt;
          x.mesh.rotation.x += x.rotVel.x * dt;
          x.mesh.rotation.y += x.rotVel.y * dt;
          x.mesh.rotation.z += x.rotVel.z * dt;
        }
      }

      if (t >= fadeStart + fd) {
        if (ps) {
          for (const x of ps) {
            root.remove(x.mesh);
            x.mesh.geometry.dispose();
            const m = x.mesh.material;
            if (m && !Array.isArray(m)) m.dispose();
          }
          particleStateRef.current = null;
        }
        setLifecycle('gone');
        root.visible = false;
        onDissipated?.();
      }
    }
  });

  const onPoemPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      const b = e.nativeEvent?.button;
      if (b != null && b !== 0) return;
      if (AQ_POEM_DEBUG) {
        console.info('[aqpoemdebug] clickTrigger', { clickTriggerReceived: true });
      }
      startDissipation('click');
    },
    [startDissipation],
  );

  if (lifecycle === 'gone') {
    return null;
  }

  return (
    <group
      ref={rootRef}
      position={worldPos}
      rotation={worldRot}
      scale={SWAMP_POEM_WORLD_SCALE}
      frustumCulled={false}
    >
      {AQ_POEM_DEBUG && (
        <group>
          <axesHelper args={[2.4]} raycast={() => null} />
          <mesh raycast={() => null}>
            <planeGeometry args={[bounds.halfW * 2, bounds.halfH * 2]} />
            <meshBasicMaterial
              color="#44ff88"
              wireframe
              transparent
              opacity={0.35}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh raycast={() => null} position={SWAMP_POEM_TRIGGER_CENTER_OFFSET}>
            <boxGeometry
              args={[
                SWAMP_POEM_TRIGGER_HALF_WIDTH * 2,
                SWAMP_POEM_TRIGGER_HALF_HEIGHT * 2,
                SWAMP_POEM_TRIGGER_HALF_DEPTH * 2,
              ]}
            />
            <meshBasicMaterial
              color="#ffaa44"
              wireframe
              transparent
              opacity={0.22}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {panels.map((p) => (
        <mesh
          key={`poem-panel-${p.planeIndex}`}
          position={[0, p.stackY ?? 0, 0]}
          frustumCulled={false}
          renderOrder={POEM_RENDER_ORDER}
          raycast={() => null}
        >
          <planeGeometry args={[p.planeW, p.planeH]} />
          <meshBasicMaterial
            ref={(m) => {
              panelMatRefs.current[p.planeIndex] = m ?? undefined;
            }}
            map={p.texture}
            transparent
            opacity={1}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      ))}

      <mesh
        position={[0, 0, 0.06]}
        frustumCulled={false}
        renderOrder={POEM_RENDER_ORDER + 1}
        onPointerDown={onPoemPointerDown}
      >
        <planeGeometry args={[bounds.halfW * 2, bounds.halfH * 2]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
