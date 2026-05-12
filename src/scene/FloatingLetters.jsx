import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import AmbientRadio from './AmbientRadio.jsx';
import { resolveRadioSlotIndex } from '../theme/themes.js';

// Intel One Mono Regular, served as a static asset from /public.
// troika-three-text only accepts .ttf (it rejects .woff/.woff2 at
// runtime), so we decompress the @fontsource woff2 once at build
// setup via scripts/woff2-to-ttf.mjs and check the resulting TTF
// into /public/fonts/.
const INTEL_ONE_MONO_URL = '/fonts/IntelOneMono-Regular.ttf';

/**
 * `FloatingLetters`
 *
 * Eleven SDF-text glyphs spelling `abelcharrow`, scattered through
 * the aquarium volume as murky, sea-worn forms drifting in
 * currents -- closer to floating fabric scraps than to clean
 * floating text.
 *
 * Visual brief
 * ------------
 * Darker, softer, more dissolved into the water than the previous
 * "pearl glyph" pass. The letters should be:
 *   - spread *very* widely in z so some sit deep in the haze and
 *     others drift just in front of the school,
 *   - tinted toward the water medium (deep teal/charcoal) so they
 *     read as part of the scene rather than UI on top of it,
 *   - moved by overlapping currents (multi-frequency rotations on
 *     X/Y/Z + a subtle vertical flutter) so they feel like fabric
 *     caught in a slow current rather than rigid text.
 *
 * Motion model: "currents", not "bobbing"
 * ---------------------------------------
 * Each axis is the sum of two incommensurate sines so no two
 * letters ever swish in unison and the loop never visibly
 * repeats inside a session.
 *
 *   - X-flap   (mesh rotation.x)  cloth flapping toward/away
 *   - Y-twist  (mesh rotation.y)  edge-on rotation
 *   - Z-tilt   (mesh rotation.z)  hanging slack
 *   - Y-scale  (mesh.scale.y)     tiny vertical flutter
 *   - position drift in all three axes
 *
 * Haze integration
 * ----------------
 *   Typography ignores THREE.Fog on the troika material so scene
 *   fog does not dissolve glyphs before the composition is readable.
 *   Legibility is driven by a shared camera→anchor distance curve
 *   (theme-tuned): murky when the viewer is close, clearest when
 *   backed up to frame the full line, gentle taper only when very far.
 *
 * Shimmer
 * -------
 * The opacity pulse is now a sum of three sines at incommensurate
 * frequencies so highlights feel broken and uneven rather than a
 * clean breathing rhythm. The sun-beam catch term is still
 * applied on top for the moment-of-illumination effect.
 *
 * Material
 * --------
 * Drei's Text owns its material (troika derives an SDF shader
 * from a default MeshBasicMaterial). We patch:
 *   - `transparent = true`
 *   - `depthWrite = false` so fish blend with letters in any z
 *      order
 *   - `side = DoubleSide` so X-flap rotations don't reveal hollow
 *     back faces
 *   - `toneMapped = false` to avoid the renderer boosting them
 *     into "bright UI text" territory
 *   - `fog = false` so volumetric scene fog does not flatten the
 *     composition before the readability curve can resolve it; the
 *     look stays underwater via murk tint + opacity + motion.
 *
 * Color is a murkiness-controlled lerp between an off-white and a
 * deep desaturated teal. The shipping default sits well past the
 * midpoint so the letters read as water-stained, not pearl-bright.
 */

// Default name -- used when no `text` prop is passed. Themes provide
// their own copy (see src/theme/themes.js -> letters.text).
const DEFAULT_NAME = 'abelcharrow';

// Faded off-white at murkiness=0. Not pure white; already slightly
// blue-grey so a low-murkiness reading still feels underwater.
const PEARL_COLOR = new THREE.Color('#dfe7ec');
// Deep desaturated teal at murkiness=1. Picked so that letters at
// max murkiness read as silhouette / rag-cloth rather than text.
const DEEP_MURK = new THREE.Color('#1d2e38');

/** Default camera-distance readability (overridden per theme in themes.js). */
const DEFAULT_TYPO_READABILITY = {
  anchor: [0, 0, 0],
  readStart: 6.5,
  readPeak: 12,
  readEnd: 18,
  readFadeStart: 24,
  readFadeEnd: 32,
  closeMul: 0.6,
  peakMul: 1.12,
  farMul: 0.86,
};

const _anchorVec = new THREE.Vector3();

/**
 * Fill-opacity multiplier from camera → composition anchor distance (shared by all glyphs).
 * Close = murky; backed-up framing band = clearest; very far = gentle falloff.
 */
function typographyClarityFromCamera(camPos, cfg) {
  const dist = camPos.distanceTo(
    _anchorVec.set(cfg.anchor[0], cfg.anchor[1], cfg.anchor[2]),
  );
  const {
    readStart,
    readPeak,
    readEnd,
    readFadeStart,
    readFadeEnd,
    closeMul,
    peakMul,
    farMul,
  } = cfg;

  if (dist <= readStart) {
    const t = THREE.MathUtils.smoothstep(
      dist,
      Math.max(0.5, readStart - 4.5),
      readStart,
    );
    return THREE.MathUtils.lerp(closeMul, peakMul * 0.93, t);
  }
  if (dist <= readPeak) {
    const t = THREE.MathUtils.smoothstep(dist, readStart, readPeak);
    return THREE.MathUtils.lerp(peakMul * 0.93, peakMul, t);
  }
  if (dist <= readEnd) return peakMul;
  if (dist <= readFadeStart) return peakMul;
  if (dist >= readFadeEnd) return farMul;
  const t = THREE.MathUtils.smoothstep(dist, readFadeStart, readFadeEnd);
  return THREE.MathUtils.lerp(peakMul, farMul, t);
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
const SEED = 24601;

function Letter({
  char,
  baseX,
  baseY,
  baseZ,
  phase,
  scale,
  opacity,
  floatStrength,
  shimmerStrength,
  color,
  beam,
  typographyReadability,
}) {
  const groupRef = useRef();
  const textRef = useRef();

  // troika can rebuild the derived material on some prop changes,
  // so we defensively re-apply our flags on every sync. `fog` is
  // the critical addition vs. the previous revision -- it lets
  // scene fog naturally dissolve deep letters into the murk.
  const handleSync = (mesh) => {
    if (!mesh || !mesh.material) return;
    mesh.material.transparent = true;
    mesh.material.depthWrite = false;
    mesh.material.side = THREE.DoubleSide;
    mesh.material.toneMapped = false;
    mesh.material.fog = false;
  };

  // Scratch vectors reused each frame so the hot loop allocates
  // nothing.
  const scratch = useMemo(
    () => ({
      letterPos: new THREE.Vector3(),
      beamPos: new THREE.Vector3(),
      beamDir: new THREE.Vector3(),
      rel: new THREE.Vector3(),
      axisProj: new THREE.Vector3(),
    }),
    [],
  );

  useEffect(() => {
    if (textRef.current) handleSync(textRef.current);
  }, []);

  useFrame((s) => {
    const g = groupRef.current;
    const txt = textRef.current;
    if (!g || !txt) return;
    const t = s.clock.elapsedTime;

    // === Current-driven motion ===
    // Position drift: two-sine sum per axis so the motion feels
    // organic rather than circular.
    const driftX =
      (Math.sin(t * 0.31 + phase) * 0.6 +
        Math.sin(t * 0.53 + phase * 1.7) * 0.3) *
      floatStrength;
    const driftY =
      (Math.sin(t * 0.27 + phase * 1.3) * 0.7 +
        Math.sin(t * 0.46 + phase * 2.1) * 0.25) *
      floatStrength;
    const driftZ =
      (Math.sin(t * 0.22 + phase * 1.9) * 0.5 +
        Math.sin(t * 0.39 + phase * 2.7) * 0.18) *
      floatStrength *
      0.6;
    g.position.set(baseX + driftX, baseY + driftY, baseZ + driftZ);

    // Cloth-like rotation: X-flap is the most prominent (toward /
    // away from the viewer, like fabric catching a slow current),
    // Y-twist gives edge-on glints, Z-tilt makes the letter hang
    // slack. Amplitudes scaled by floatStrength so the user's
    // Leva slider also dials motion intensity.
    const flapX =
      (Math.sin(t * 0.45 + phase * 1.1) * 0.12 +
        Math.sin(t * 0.83 + phase * 2.3) * 0.06) *
      (0.6 + floatStrength * 6);
    const twistY =
      (Math.sin(t * 0.37 + phase * 0.8) * 0.14 +
        Math.sin(t * 0.71 + phase * 1.9) * 0.06) *
      (0.6 + floatStrength * 6);
    const tiltZ =
      (Math.sin(t * 0.29 + phase) * 0.08 +
        Math.sin(t * 0.57 + phase * 1.4) * 0.03) *
      (0.6 + floatStrength * 6);
    g.rotation.x = flapX;
    g.rotation.y = twistY;
    g.rotation.z = tiltZ;

    // Subtle vertical flutter -- the letter momentarily
    // compresses / stretches as the "current" passes, like a
    // length of cloth bowing.
    const flutter =
      1 + Math.sin(t * 0.62 + phase * 1.3) * 0.04 * (0.4 + floatStrength * 8);
    g.scale.set(1, flutter, 1);

    // === Broken shimmer ===
    // Three incommensurate sines so the per-letter alpha pulse
    // never settles into a clean rhythm.
    const wobble =
      Math.sin(t * 0.62 + phase) * 0.6 +
      Math.sin(t * 1.27 + phase * 2.3) * 0.25 +
      Math.sin(t * 2.05 + phase * 4.1) * 0.15;
    let pulse = 1.0 + wobble * 0.16 * shimmerStrength;

    // === Beam proximity ===
    let inBeam = 0;
    if (beam && beam.enabled) {
      scratch.beamPos.set(beam.position[0], beam.position[1], beam.position[2]);
      const a = (beam.angleDegrees * Math.PI) / 180;
      scratch.beamDir.set(Math.sin(a), -Math.cos(a), 0);

      g.getWorldPosition(scratch.letterPos);
      scratch.rel.copy(scratch.letterPos).sub(scratch.beamPos);

      const along = scratch.rel.dot(scratch.beamDir);
      scratch.axisProj.copy(scratch.beamDir).multiplyScalar(along);
      const perpDist = scratch.rel.clone().sub(scratch.axisProj).length();

      const headroom = 0.6;
      const tailroom = 0.8;
      const alongFactor =
        THREE.MathUtils.smoothstep(along, -headroom, headroom) *
        (1 -
          THREE.MathUtils.smoothstep(along, beam.length - tailroom, beam.length));
      const perpFactor =
        1 -
        THREE.MathUtils.smoothstep(
          perpDist,
          0,
          beam.width * (beam.regionSize ?? 1) * 0.95,
        );
      inBeam = alongFactor * perpFactor;
    }

    // Softer in-beam lift than before -- the user asked for
    // "broken and uneven" highlights rather than a polished glow,
    // so we cap how much the beam can lift a letter and let the
    // wobble term still ride on top of it.
    pulse += inBeam * 0.35;

    const clarityMul = typographyClarityFromCamera(
      s.camera.position,
      typographyReadability,
    );
    pulse *= clarityMul;

    txt.fillOpacity = THREE.MathUtils.clamp(opacity * pulse, 0, 1);
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <Text
        ref={textRef}
        font={INTEL_ONE_MONO_URL}
        fontSize={scale}
        color={color}
        fillOpacity={opacity}
        anchorX="center"
        anchorY="middle"
        onSync={handleSync}
      >
        {char}
      </Text>
    </group>
  );
}

/** Drift + beam / haze language matches `Letter`, gentler so the beacon stays findable. */
const ORB_FLOAT_SCALE = 0.52;
const ORB_ROT_SCALE = 0.42;

function LetterRadioSlot({
  baseX,
  baseY,
  baseZ,
  phase,
  scale,
  opacity,
  floatStrength,
  shimmerStrength,
  murkTint,
  glowIntensity,
  beam,
  beaconAtmosphere = null,
  typographyReadability,
}) {
  const groupRef = useRef();
  const modRef = useRef({ beam: 1, haze: 1, shimmer: 1 });

  const scratch = useMemo(
    () => ({
      letterPos: new THREE.Vector3(),
      beamPos: new THREE.Vector3(),
      beamDir: new THREE.Vector3(),
      rel: new THREE.Vector3(),
      axisProj: new THREE.Vector3(),
    }),
    [],
  );

  const fs = floatStrength * ORB_FLOAT_SCALE;

  useFrame((s) => {
    const g = groupRef.current;
    if (!g) return;
    const t = s.clock.elapsedTime;

    const driftX =
      (Math.sin(t * 0.31 + phase) * 0.6 +
        Math.sin(t * 0.53 + phase * 1.7) * 0.3) *
      fs;
    const driftY =
      (Math.sin(t * 0.27 + phase * 1.3) * 0.7 +
        Math.sin(t * 0.46 + phase * 2.1) * 0.25) *
      fs;
    const driftZ =
      (Math.sin(t * 0.22 + phase * 1.9) * 0.5 +
        Math.sin(t * 0.39 + phase * 2.7) * 0.18) *
      fs *
      0.6;
    g.position.set(baseX + driftX, baseY + driftY, baseZ + driftZ);

    const rot = ORB_ROT_SCALE * (0.6 + floatStrength * 6);
    const flapX =
      (Math.sin(t * 0.45 + phase * 1.1) * 0.12 +
        Math.sin(t * 0.83 + phase * 2.3) * 0.06) *
      rot;
    const twistY =
      (Math.sin(t * 0.37 + phase * 0.8) * 0.14 +
        Math.sin(t * 0.71 + phase * 1.9) * 0.06) *
      rot;
    const tiltZ =
      (Math.sin(t * 0.29 + phase) * 0.08 +
        Math.sin(t * 0.57 + phase * 1.4) * 0.03) *
      rot;
    g.rotation.x = flapX;
    g.rotation.y = twistY;
    g.rotation.z = tiltZ;

    const flutter =
      1 +
      Math.sin(t * 0.62 + phase * 1.3) *
        0.028 *
        (0.4 + floatStrength * 8);
    g.scale.set(1, flutter, 1);

    const wobble =
      Math.sin(t * 0.62 + phase) * 0.6 +
      Math.sin(t * 1.27 + phase * 2.3) * 0.25 +
      Math.sin(t * 2.05 + phase * 4.1) * 0.15;
    let pulse = 1.0 + wobble * 0.16 * shimmerStrength;

    let inBeam = 0;
    if (beam && beam.enabled) {
      scratch.beamPos.set(beam.position[0], beam.position[1], beam.position[2]);
      const a = (beam.angleDegrees * Math.PI) / 180;
      scratch.beamDir.set(Math.sin(a), -Math.cos(a), 0);

      g.getWorldPosition(scratch.letterPos);
      scratch.rel.copy(scratch.letterPos).sub(scratch.beamPos);

      const along = scratch.rel.dot(scratch.beamDir);
      scratch.axisProj.copy(scratch.beamDir).multiplyScalar(along);
      const perpDist = scratch.rel.clone().sub(scratch.axisProj).length();

      const headroom = 0.6;
      const tailroom = 0.8;
      const alongFactor =
        THREE.MathUtils.smoothstep(along, -headroom, headroom) *
        (1 -
          THREE.MathUtils.smoothstep(along, beam.length - tailroom, beam.length));
      const perpFactor =
        1 -
        THREE.MathUtils.smoothstep(
          perpDist,
          0,
          beam.width * (beam.regionSize ?? 1) * 0.95,
        );
      inBeam = alongFactor * perpFactor;
    }

    pulse += inBeam * (beaconAtmosphere ? 0.52 : 0.42);

    const clarityMul = typographyClarityFromCamera(
      s.camera.position,
      typographyReadability,
    );
    pulse *=
      clarityMul *
      THREE.MathUtils.clamp(0.52 + opacity * 1.05, 0.45, 1.2);

    const hazeMin = beaconAtmosphere?.hazeModFloor ?? 0.22;
    modRef.current = {
      beam: 1 + inBeam * 0.5,
      haze: THREE.MathUtils.clamp(pulse * 0.92, hazeMin, 1.25),
      shimmer: 1 + wobble * 0.11 * shimmerStrength,
    };
  });

  const typoScale = scale / 0.3;

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <AmbientRadio
        embedded
        modRef={modRef}
        typographyScale={typoScale}
        murkTint={murkTint}
        glowIntensity={glowIntensity}
        beaconAtmosphere={beaconAtmosphere}
        enabled
      />
    </group>
  );
}

export default function FloatingLetters({
  enabled = true,
  // The string to scatter through the volume. One glyph per
  // character including spaces -- whitespace becomes invisible
  // "skip" glyphs. Use `\\n` in the theme string for a multi-line
  // stack (Swamp: "swamp molly" over "radio"); newline slots are
  // skipped but preserve indices for the radio beacon slot.
  text = DEFAULT_NAME,
  // Z range; letters span +/- depthSpread/2 along z. Pushed much
  // wider for the "drifting through the water column" feel.
  depthSpread = 7.0,
  // Amplitude of the idle current motion. Higher = more visible
  // swish/flap.
  floatStrength = 0.06,
  // Per-letter broken-shimmer amplitude on fillOpacity.
  shimmerStrength = 0.55,
  // Base fillOpacity. Combined with shimmer pulse + beam catch +
  // haze fade per frame.
  opacity = 0.54,
  // Font size in world units. Default kept small so even letters
  // that drift close to the camera don't dominate.
  scale = 0.3,
  // Horizontal step between letter centres. Also drives the Y
  // jitter (see layout, below).
  spacing = 1.2,
  // 0 = faded off-white, 1 = deep desaturated teal. Default sits
  // well past the midpoint so the letters read as water-stained.
  murkiness = 0.78,
  /** Only used when `text` contains `\\n`: vertical gap between row centres = spacing * rowGapMul. */
  rowGapMul = 1,
  /** Scales per-letter vertical jitter within a row (also applies to single-line). */
  intraLineYJitterMul = 1,
  /** Random vertical nudge of each row centre (multi-line); keeps stacks organic. */
  interRowJitterMul = 0,
  /** Scales horizontal jitter amplitude; <1 tightens lateral scatter. */
  lineXJitterMul = 1,
  beam = null,
  /** Theme spec for which glyph the radio replaces; see `resolveRadioSlotIndex`. */
  radioSlot = null,
  /** Beacon is parented into the typography slot (no standalone world orb). */
  radioEmbedded = false,
  radioGlowIntensity = 1,
  /** Swamp Molly: `theme.radio.beaconAtmosphere` for submerged beacon presence. */
  beaconAtmosphere = null,
  /** Merged theme defaults + `letters.typographyReadability` for camera-distance legibility. */
  typographyReadability: typographyReadabilityProp,
}) {
  const typographyReadability = useMemo(
    () => ({
      ...DEFAULT_TYPO_READABILITY,
      ...(typographyReadabilityProp ?? {}),
    }),
    [typographyReadabilityProp],
  );
  // Derive a single tinted color from PEARL_COLOR / DEEP_MURK and
  // pass it down to each Letter. Memoised on `murkiness` so the
  // lerp only runs when the slider changes.
  const tintedColor = useMemo(() => {
    const c = PEARL_COLOR.clone().lerp(
      DEEP_MURK,
      THREE.MathUtils.clamp(murkiness, 0, 1),
    );
    return `#${c.getHexString()}`;
  }, [murkiness]);

  const radioSlotIndex = useMemo(
    () => resolveRadioSlotIndex(text, radioSlot),
    [text, radioSlot],
  );

  const layout = useMemo(() => {
    const rnd = mulberry32(SEED);

    if (!text.includes('\n')) {
      const letters = text.split('');
      const total = letters.length;
      return letters.map((ch, i) => {
        const xJitter =
          (rnd() - 0.5) * spacing * 0.35 * lineXJitterMul;
        const yJitter =
          (rnd() - 0.5) *
          spacing *
          1.6 *
          intraLineYJitterMul;
        const zJitter = (rnd() - 0.6) * depthSpread;
        return {
          char: ch,
          baseX: (i - (total - 1) / 2) * spacing + xJitter,
          baseY: yJitter,
          baseZ: zJitter,
          phase: rnd() * Math.PI * 2,
        };
      });
    }

    const lines = text.split('\n');
    const rowGap = spacing * rowGapMul;
    const slots = [];

    lines.forEach((lineStr, lineIdx) => {
      const chars = [...lineStr];
      const n = chars.length;
      const rowBase =
        lines.length > 1
          ? (lines.length - 1) / 2 - lineIdx
          : 0;
      const rowY =
        rowBase * rowGap +
        (rnd() - 0.5) * spacing * interRowJitterMul;

      chars.forEach((ch, j) => {
        const xJitter =
          (rnd() - 0.5) * spacing * 0.35 * lineXJitterMul;
        const yJitter =
          (rnd() - 0.5) *
          spacing *
          1.45 *
          intraLineYJitterMul;
        const zJitter = (rnd() - 0.6) * depthSpread;
        slots.push({
          char: ch,
          baseX: (j - (n - 1) / 2) * spacing + xJitter,
          baseY: rowY + yJitter,
          baseZ: zJitter,
          phase: rnd() * Math.PI * 2,
        });
      });

      if (lineIdx < lines.length - 1) {
        slots.push({
          char: '\n',
          baseX: 0,
          baseY: 0,
          baseZ: 0,
          phase: 0,
        });
      }
    });

    return slots;
  }, [
    spacing,
    depthSpread,
    text,
    rowGapMul,
    intraLineYJitterMul,
    interRowJitterMul,
    lineXJitterMul,
  ]);

  if (!enabled) return null;

  return (
    <group>
      {layout.map((l, i) => {
        if (/\s/.test(l.char)) return null;

        const useRadioGlyph =
          radioEmbedded &&
          radioSlotIndex != null &&
          i === radioSlotIndex;

        if (useRadioGlyph) {
          return (
            <LetterRadioSlot
              key={i}
              baseX={l.baseX}
              baseY={l.baseY}
              baseZ={l.baseZ}
              phase={l.phase}
              scale={scale}
              opacity={opacity}
              floatStrength={floatStrength}
              shimmerStrength={shimmerStrength}
              murkTint={tintedColor}
              glowIntensity={radioGlowIntensity}
              beam={beam}
              beaconAtmosphere={beaconAtmosphere}
              typographyReadability={typographyReadability}
            />
          );
        }

        return (
          <Letter
            key={i}
            char={l.char}
            baseX={l.baseX}
            baseY={l.baseY}
            baseZ={l.baseZ}
            phase={l.phase}
            scale={scale}
            opacity={opacity}
            floatStrength={floatStrength}
            shimmerStrength={shimmerStrength}
            color={tintedColor}
            beam={beam}
            typographyReadability={typographyReadability}
          />
        );
      })}
    </group>
  );
}
