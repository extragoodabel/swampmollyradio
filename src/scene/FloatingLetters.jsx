import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import AmbientRadio from './AmbientRadio.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { resolveRadioSlotIndex } from '../theme/themes.js';
import { computeLetterSlots, FLOAT_LAYOUT_DEFAULT } from './letterLayout.js';
// Pass a real URL string so Troika fetches valid JSON in dev and
// production (plain JSON module imports can stringify to "[object Object]"
// in minified builds).
import floatingLettersFontUrl from 'three/examples/fonts/droid/droid_sans_mono_regular.typeface.json?url';
import { AQ_TYPO_DEBUG_LOG } from '../debug/aquariumRecovery.js';
import {
  typographyFillHex,
  typographyHighlightColor,
} from './typographyPalette.js';

const FLOATING_LETTERS_FONT_URL = floatingLettersFontUrl;

/**
 * `FloatingLetters`
 *
 * Many SDF-text or canvas glyphs scattered through the aquarium
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
const DEFAULT_NAME = 'salmon days radio';

/** Default per-letter layout: ordered Z arc + small jitter keeps L→R legible. */
const DEFAULT_FLOAT_LAYOUT = { ...FLOAT_LAYOUT_DEFAULT };

/** Default camera-distance readability (overridden per theme in themes.js). */
const DEFAULT_TYPO_READABILITY = {
  anchor: [0, 0, 0],
  readStart: 5.0,
  readPeak: 10.2,
  readEnd: 18,
  readFadeStart: 28,
  readFadeEnd: 46,
  /** Never dim opening view too aggressively; still feels murky when very close. */
  closeMul: 0.78,
  peakMul: 1.2,
  /** Very far: gentle fade — letters stay on-screen for reading. */
  farMul: 0.88,
  /** past this camera→anchor dist, lift typography so it clears the hero fish a bit */
  pullbackLiftStart: 6.2,
  pullbackLiftEnd: 14.5,
  pullbackLiftMax: 1.12,
  /** subtle uniform scale as viewer backs off — phrase “gathers” in the frame */
  pullbackScaleStart: 7.5,
  pullbackScaleEnd: 16.5,
  pullbackScaleExtra: 0.058,
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

  let out;
  if (dist <= readStart) {
    const t = THREE.MathUtils.smoothstep(
      dist,
      Math.max(0.35, readStart - 3.8),
      readStart,
    );
    out = THREE.MathUtils.lerp(closeMul, peakMul * 0.94, t);
  } else if (dist <= readPeak) {
    const t = THREE.MathUtils.smoothstep(dist, readStart, readPeak);
    out = THREE.MathUtils.lerp(peakMul * 0.94, peakMul, t);
  } else if (dist <= readEnd)
    out = peakMul;
  else if (dist <= readFadeStart) out = peakMul;
  else if (dist >= readFadeEnd) out = farMul;
  else {
    const t = THREE.MathUtils.smoothstep(dist, readFadeStart, readFadeEnd);
    out = THREE.MathUtils.lerp(peakMul, farMul, t);
  }
  return Math.max(0.74, out);
}

/** Lift + slight scale as camera backs up — phrase clears fish and gathers in frame. */
function TypographyResolveGroup({ typographyReadability, children }) {
  const rootRef = useRef();
  const cfgRef = useRef(typographyReadability);

  useEffect(() => {
    cfgRef.current = typographyReadability;
  }, [typographyReadability]);

  useFrame((s) => {
    const g = rootRef.current;
    if (!g) return;
    const cfg = cfgRef.current;
    const dist = s.camera.position.distanceTo(
      _anchorVec.set(cfg.anchor[0], cfg.anchor[1], cfg.anchor[2]),
    );
    const liftT = THREE.MathUtils.smoothstep(
      dist,
      cfg.pullbackLiftStart,
      cfg.pullbackLiftEnd,
    );
    g.position.y = liftT * (cfg.pullbackLiftMax ?? 0);

    if (
      cfg.pullbackScaleExtra != null &&
      cfg.pullbackScaleStart != null &&
      cfg.pullbackScaleEnd != null
    ) {
      const scT = THREE.MathUtils.smoothstep(
        dist,
        cfg.pullbackScaleStart,
        cfg.pullbackScaleEnd,
      );
      const sMul = 1 + scT * cfg.pullbackScaleExtra;
      g.scale.setScalar(sMul);
    } else {
      g.scale.setScalar(1);
    }
  });

  return <group ref={rootRef}>{children}</group>;
}

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
  highlightColor,
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

  const baseFillColor = useMemo(() => new THREE.Color(color), [color]);

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
    const glintRare =
      Math.pow(Math.max(0, Math.sin(t * 0.86 + phase * 2.45)), 16) * 0.92;
    const sunCatch =
      Math.pow(Math.max(0, Math.sin(t * 0.43 + phase * 1.08)), 5) * 0.4;
    let pulse = 1.0 + wobble * 0.2 * shimmerStrength + glintRare * 0.22;

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

    const mat = txt.material;
    if (mat && mat.color && highlightColor) {
      const sh = shimmerStrength;
      mat.color
        .copy(baseFillColor)
        .lerp(
          highlightColor,
          Math.min(
            1,
            0.14 +
              (0.5 + 0.5 * wobble) * 0.16 * sh +
              glintRare * 1.05 +
              sunCatch * sh * 0.85 +
              inBeam * 0.12,
          ),
        );
    }

    txt.fillOpacity = THREE.MathUtils.clamp(
      opacity * pulse * (1 + sunCatch * 0.12 * shimmerStrength),
      0.2,
      1,
    );
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <Text
        ref={textRef}
        font={FLOATING_LETTERS_FONT_URL}
        characters={char}
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
/** Slightly under 1 keeps the embedded orb discoverable vs glyph cap-height. */
const ORB_VISUAL_SCALE_MUL = 0.94;

export function LetterRadioSlot({
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
    const glintRare =
      Math.pow(Math.max(0, Math.sin(t * 0.9 + phase * 2.2)), 14) * 0.85;
    let pulse = 1.0 + wobble * 0.18 * shimmerStrength + glintRare * 0.18;

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
      haze: THREE.MathUtils.clamp(pulse * 0.94, hazeMin, 1.28),
      shimmer: 1 + wobble * 0.13 * shimmerStrength + glintRare * 0.35,
    };
  });

  const typoScale = (scale / 0.3) * ORB_VISUAL_SCALE_MUL;

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <ErrorBoundary name="FloatingLetters.AmbientRadio.embedded" fallback={null}>
        <AmbientRadio
          embedded
          modRef={modRef}
          typographyScale={typoScale}
          murkTint={murkTint}
          glowIntensity={glowIntensity}
          beaconAtmosphere={beaconAtmosphere}
          enabled
        />
      </ErrorBoundary>
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
  /** Theme tuning for scatter vs readability (see `DEFAULT_FLOAT_LAYOUT`). */
  floatLayout: floatLayoutProp,
  /** Merged theme defaults + `letters.typographyReadability` for camera-distance legibility. */
  typographyReadability: typographyReadabilityProp,
  /** Theme-driven pale silver / pearl / aqua mix (see themes.js). */
  typographyTint: typographyTintProp = null,
  /** Recovery: clamp each glyph |baseZ| so the phrase stays in the frustum. */
  safeClampZ = null,
}) {
  const mergedFloatLayout = useMemo(
    () => ({
      ...DEFAULT_FLOAT_LAYOUT,
      ...(floatLayoutProp ?? {}),
    }),
    [floatLayoutProp],
  );

  const typographyReadability = useMemo(
    () => ({
      ...DEFAULT_TYPO_READABILITY,
      ...(typographyReadabilityProp ?? {}),
    }),
    [typographyReadabilityProp],
  );
  const tintedColor = useMemo(
    () => typographyFillHex(murkiness, typographyTintProp),
    [murkiness, typographyTintProp],
  );
  const highlightColor = useMemo(
    () => typographyHighlightColor(typographyTintProp),
    [typographyTintProp],
  );

  const radioSlotIndex = useMemo(
    () => resolveRadioSlotIndex(text, radioSlot),
    [text, radioSlot],
  );

  const layoutOpts = useMemo(() => {
    if (safeClampZ != null && Number.isFinite(safeClampZ)) {
      return { maxAbsZ: safeClampZ };
    }
    return undefined;
  }, [safeClampZ]);

  const layout = useMemo(
    () =>
      computeLetterSlots(
        text,
        spacing,
        depthSpread,
        rowGapMul,
        intraLineYJitterMul,
        interRowJitterMul,
        lineXJitterMul,
        mergedFloatLayout,
        layoutOpts,
      ),
    [
      spacing,
      depthSpread,
      text,
      rowGapMul,
      intraLineYJitterMul,
      interRowJitterMul,
      lineXJitterMul,
      mergedFloatLayout,
      layoutOpts,
    ],
  );

  useEffect(() => {
    if (!AQ_TYPO_DEBUG_LOG) return;
    const glyphs = layout.filter((s) => !/\s/.test(s.char)).length;
    const samples = layout
      .filter((s) => !/\s/.test(s.char))
      .slice(0, 6)
      .map(({ baseX, baseY, baseZ }) => ({ x: baseX, y: baseY, z: baseZ }));
    console.info('[aquarium] FloatingLetters mounted (Troika)', {
      phrase: text,
      charCount: text.length,
      slotCount: layout.length,
      glyphs,
      radioSlotIndex,
      positionSamples: samples,
    });
  }, [text, layout, radioSlotIndex]);

  if (!enabled) return null;

  return (
    <TypographyResolveGroup typographyReadability={typographyReadability}>
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
            highlightColor={highlightColor}
            beam={beam}
            typographyReadability={typographyReadability}
          />
        );
      })}
    </TypographyResolveGroup>
  );
}
