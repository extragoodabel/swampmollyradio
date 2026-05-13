import { useMemo, useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SWAMP_MOLLY_POEM_RAW } from '../content/swampMollyPoem.js';
import {
  typographyFillHex,
  typographyHighlightColor,
} from './typographyPalette.js';

const TAB_COL_WIDTH = 4;
const _camLocal = new THREE.Vector3();

function splitItalicRuns(line) {
  if (!line.includes('*')) {
    return [{ italic: false, text: line }];
  }
  const out = [];
  let italic = false;
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '*') {
      if (buf) {
        out.push({ italic, text: buf });
        buf = '';
      }
      italic = !italic;
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ italic, text: buf });
  return out.length ? out : [{ italic: false, text: line }];
}

function tabAdvanceCol(col) {
  const next = (Math.floor(col / TAB_COL_WIDTH) + 1) * TAB_COL_WIDTH;
  return next;
}

function makePoemGlyphTexture(char, italic, fillHex, crestHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const fontStyle = italic ? 'italic ' : '';
  ctx.font = `${fontStyle}600 56px ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(64, 36, 64, 96);
  g.addColorStop(0, crestHex);
  g.addColorStop(0.45, fillHex);
  g.addColorStop(1, fillHex);
  ctx.fillStyle = g;
  ctx.fillText(char === ' ' ? '' : char, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _scratchHi = new THREE.Color();

function PoemGlyph({
  char,
  italic,
  baseX,
  baseY,
  baseZ,
  phase,
  wordPhase,
  scale,
  floatStrength,
  fillHex,
  crestHex,
  highlight,
  baseOpacity,
  shimmerStrength,
  brightnessMul = 1,
  dissipateTRef,
  dissipateVec,
}) {
  const groupRef = useRef();
  const matRef = useRef();
  const baseRgb = useMemo(() => new THREE.Color(fillHex), [fillHex]);

  const map = useMemo(
    () => makePoemGlyphTexture(char, italic, fillHex, crestHex),
    [char, italic, fillHex, crestHex],
  );

  useFrame((s) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    const dispSeed = dissipateVec.current;
    const t = s.clock.elapsedTime;
    const dt = dissipateTRef.current;
    const fs = floatStrength * (1 + dt * 5.5);

    const wordPull =
      Math.sin(t * 0.22 + wordPhase) * 0.35 + Math.sin(t * 0.17 + wordPhase * 1.4) * 0.18;
    const letterPull =
      Math.sin(t * 0.31 + phase) * 0.22 + Math.sin(t * 0.49 + phase * 1.9) * 0.11;

    const driftX = (wordPull * 0.55 + letterPull * 0.35) * fs;
    const driftY =
      (Math.sin(t * 0.24 + wordPhase * 1.1) * 0.42 +
        Math.sin(t * 0.4 + phase * 2) * 0.16) *
      fs;
    const driftZ =
      (Math.sin(t * 0.19 + wordPhase) * 0.32 + Math.sin(t * 0.33 + phase * 1.7) * 0.12) *
      fs *
      0.45;

    const dispMul = dt * (1.05 + dispSeed.w * 0.6);
    const dispOffX = dispSeed.x * dispMul * 2.1;
    const dispOffY = dispSeed.y * dispMul * 1.55 - dt * dispSeed.z * 0.85;
    const dispOffZ = dispSeed.z * dispMul * 1.1 * dt;

    g.position.set(
      baseX + driftX + dispOffX,
      baseY + driftY + dispOffY,
      baseZ + driftZ + dispOffZ,
    );

    const flapX =
      (Math.sin(t * 0.38 + phase) * 0.05 + Math.sin(t * 0.62 + phase * 1.5) * 0.028) *
      (0.55 + floatStrength * 12);
    const twistY =
      (Math.sin(t * 0.3 + phase * 0.9) * 0.06 + Math.sin(t * 0.55 + phase * 1.7) * 0.03) *
      (0.55 + floatStrength * 12);
    const tiltZ =
      (Math.sin(t * 0.24 + phase) * 0.04 + Math.sin(t * 0.41 + phase * 1.3) * 0.022) *
      (0.55 + floatStrength * 12);
    g.rotation.set(
      flapX + dt * dispSeed.x * 0.35,
      twistY + dt * 0.2,
      tiltZ + dt * dispSeed.y * 0.25,
    );

    const flutter = 1 + Math.sin(t * 0.48 + phase) * 0.025 * (0.45 + floatStrength * 10);
    const sc = (1 - dt * 0.35) * flutter;
    g.scale.set(sc, sc, sc);

    const wobble =
      Math.sin(t * 0.52 + phase) * 0.42 +
      Math.sin(t * 0.95 + phase * 2) * 0.2 +
      Math.sin(t * 1.55 + phase * 3.6) * 0.12;
    const glintRare = Math.pow(Math.max(0, Math.sin(t * 0.72 + phase * 2)), 14) * 0.72;
    const sh = shimmerStrength;
    const lift = (0.42 + 0.58 * (0.5 + 0.5 * wobble)) * sh * 0.08 + glintRare;
    const bm = THREE.MathUtils.clamp(brightnessMul, 0.25, 4);
    _scratchHi.copy(baseRgb).lerp(
      highlight,
      Math.min(1, (0.18 + lift * 1.15) * Math.sqrt(bm)),
    );
    m.color.copy(_scratchHi);
    const fade =
      baseOpacity *
      (1 - dt * 0.92) *
      (0.78 + wobble * 0.1 * sh + glintRare * 0.35);
    m.opacity = THREE.MathUtils.clamp(
      Math.max(0, fade) * bm,
      0,
      0.99,
    );
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <mesh renderOrder={36}>
        <planeGeometry args={[scale * 0.92, scale * 0.92]} />
        <meshBasicMaterial
          ref={matRef}
          map={map}
          transparent
          opacity={baseOpacity}
          alphaTest={0.05}
          fog={false}
          toneMapped={false}
          depthWrite={false}
          depthTest
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function buildPoemLayout(raw, cellW, rowH, stanzaGap, volumeDepth = 1.65) {
  const lines = raw.split('\n');
  const slots = [];
  let wordIndex = 0;
  let lineIdx = 0;
  let maxX = 0;
  let minY = 0;
  let y = 0;
  let prevWasWordChar = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line === '') {
      y -= stanzaGap;
      lineIdx++;
      prevWasWordChar = false;
      continue;
    }

    let col = 0;
    const runs = splitItalicRuns(line);
    for (const run of runs) {
      for (let i = 0; i < run.text.length; i++) {
        const ch = run.text[i];
        if (ch === '\t') {
          const nextCol = tabAdvanceCol(col);
          col = nextCol;
          prevWasWordChar = false;
          continue;
        }
        const isSpace = ch === ' ' || ch === '\u00a0';
        if (isSpace) {
          col += 1;
          prevWasWordChar = false;
          continue;
        }

        if (!prevWasWordChar) {
          wordIndex += 1;
          prevWasWordChar = true;
        }

        const baseX = col * cellW;
        const phase = lineIdx * 1.07 + col * 0.23;
        const wordPhase = wordIndex * 0.61;
        const baseZ = (Math.sin(lineIdx * 0.41 + col * 0.09) * 0.045) * cellW * 8;

        slots.push({
          char: ch,
          italic: run.italic,
          baseX,
          baseY: y,
          baseZ,
          phase,
          wordPhase,
          lineIdx,
          col,
        });
        maxX = Math.max(maxX, baseX + cellW);
        minY = Math.min(minY, y);
        col += 1;
      }
    }
    lineIdx++;
    y -= rowH;
    prevWasWordChar = false;
  }

  const totalH = Math.abs(minY) + rowH;
  const cx = maxX * 0.5;
  const cy = minY + totalH * 0.5;

  const normalized = slots.map((s) => ({
    ...s,
    baseX: s.baseX - cx,
    baseY: s.baseY - cy,
    baseZ: s.baseZ,
  }));

  return {
    slots: normalized,
    halfW: maxX * 0.5 + cellW * 1.2,
    halfH: totalH * 0.5 + rowH * 0.35,
    depth: volumeDepth,
  };
}

const randomVec = (out, seed) => {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const r = a - Math.floor(a);
  out.x = (r * 2 - 1) * 0.92;
  out.y = (Math.cos(seed * 78.233) * 0.5 + 0.5) * 1.1;
  out.z = (Math.sin(seed * 19.137) * 0.5 + 0.5) * 0.75 + 0.2;
  return out;
};

/**
 * World-anchored floating text (poem-style layout); dissipates when the camera passes through its volume.
 *
 * @param {{
 *   rawText: string;
 *   position: [number, number, number];
 *   murkiness?: number;
 *   typographyTint?: object | null;
 *   onDissipated?: () => void;
 *   scale?: number;
 *   floatStrength?: number;
 *   volumeDepth?: number;
 *   contentKey?: string;
 *   brightnessMul?: number;
 *   glyphBaseOpacity?: number;
 * }} props
 */
export function SwampFloatingWaterWords({
  contentKey = 'waterwords',
  rawText,
  position,
  murkiness = 0.78,
  typographyTint = null,
  onDissipated,
  scale = 0.22,
  floatStrength = 0.016,
  volumeDepth = 1.65,
  brightnessMul = 1,
  glyphBaseOpacity = 0.74,
}) {
  const rootRef = useRef();
  const dissipateTRef = useRef(0);
  const dissipatingRef = useRef(false);
  const doneRef = useRef(false);
  const cellW = scale * 0.95;
  const rowH = scale * 1.45;
  const stanzaGap = scale * 0.85;
  const { camera } = useThree();

  const fillHex = useMemo(
    () => typographyFillHex(murkiness, typographyTint),
    [murkiness, typographyTint],
  );
  const highlight = useMemo(
    () => typographyHighlightColor(typographyTint),
    [typographyTint],
  );
  const crestHex = useMemo(() => {
    const c = new THREE.Color(fillHex);
    c.lerp(highlight, 0.38);
    return `#${c.getHexString()}`;
  }, [fillHex, highlight]);

  const layout = useMemo(
    () => buildPoemLayout(rawText, cellW, rowH, stanzaGap, volumeDepth),
    [rawText, cellW, rowH, stanzaGap, volumeDepth],
  );

  const dissipateVecs = useMemo(() => {
    return layout.slots.map((_, i) => {
      const v = new THREE.Vector4();
      const t = randomVec(v, i + 0.37);
      v.w = Math.abs(t.x) + 0.2;
      return v;
    });
  }, [layout.slots]);

  const onDissipatedStable = useCallback(() => {
    onDissipated?.();
  }, [onDissipated]);

  useFrame((s) => {
    const root = rootRef.current;
    if (!root) return;

    const cam = camera.position;
    root.lookAt(cam.x, root.position.y, cam.z);

    if (doneRef.current) return;

    _camLocal.copy(cam);
    root.worldToLocal(_camLocal);

    const { halfW, halfH, depth } = layout;
    const pad = 0.45;
    const inside =
      Math.abs(_camLocal.x) < halfW + pad &&
      Math.abs(_camLocal.y) < halfH + pad &&
      Math.abs(_camLocal.z) < depth + pad;

    if (!dissipatingRef.current) {
      if (inside) {
        dissipatingRef.current = true;
        dissipateTRef.current = 0;
      }
    } else {
      dissipateTRef.current = Math.min(1, dissipateTRef.current + s.clock.getDelta() * 0.85);
      if (dissipateTRef.current >= 1 && !doneRef.current) {
        doneRef.current = true;
        onDissipatedStable();
      }
    }
  });

  return (
    <group ref={rootRef} position={position}>
      {layout.slots.map((slot, i) => (
        <PoemGlyph
          key={`${contentKey}-g-${i}-${slot.lineIdx}-${slot.col}-${slot.char}`}
          char={slot.char}
          italic={slot.italic}
          baseX={slot.baseX}
          baseY={slot.baseY}
          baseZ={slot.baseZ}
          phase={slot.phase}
          wordPhase={slot.wordPhase}
          scale={scale}
          floatStrength={floatStrength}
          fillHex={fillHex}
          crestHex={crestHex}
          highlight={highlight}
          baseOpacity={glyphBaseOpacity}
          shimmerStrength={0.38}
          brightnessMul={brightnessMul}
          dissipateTRef={dissipateTRef}
          dissipateVec={{
            current: dissipateVecs[i],
          }}
        />
      ))}
    </group>
  );
}

/**
 * Swamp Molly poem source — thin wrapper around {@link SwampFloatingWaterWords}.
 */
export default function SwampMollyPoem(props) {
  return (
    <SwampFloatingWaterWords
      rawText={SWAMP_MOLLY_POEM_RAW}
      scale={0.44}
      brightnessMul={2}
      glyphBaseOpacity={0.82}
      volumeDepth={3.5}
      floatStrength={0.014}
      {...props}
    />
  );
}
