import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
// Intel One Mono, served from @fontsource. The `?url` suffix tells
// Vite to resolve the asset to a final hashed URL string at build
// time, which troika-three-text can fetch and parse (it accepts
// woff/woff2 as of v0.49+).
import intelOneMonoUrl from '@fontsource/intel-one-mono/files/intel-one-mono-latin-400-normal.woff2?url';

/**
 * `FloatingLetters`
 *
 * Eleven SDF-text glyphs spelling `abelcharrow`, scattered through
 * the aquarium volume as ghostly translucent shapes rather than a
 * foreground title.
 *
 * Visual brief: the letters should feel discovered in the
 * environment, not commanding it -- subtle, semi-transparent,
 * faintly tinted by the water, drifting slowly. They are
 * typographically clean (Intel One Mono, no outline/stroke) but
 * sit in the scene as atmospheric forms.
 *
 * Layout strategy
 * ---------------
 * Each letter has a deterministic per-letter offset from a seeded
 * RNG so the layout is identical across refreshes. The cluster is
 * centred at the origin so the camera (now at z = 4.5) sees the
 * name running roughly across the middle of the screen at start.
 * The X spacing is intentionally wide (letters can drift past the
 * frame edge -- the user discovers them by turning), but the
 * camera-facing few stay readable.
 *
 * Per-letter offsets:
 *   - X: evenly spaced along the line, with a small jitter on top
 *   - Y: spacing-proportional jitter so wider spacing also lifts
 *        some letters above and drops others below
 *   - Z: depthSpread-driven jitter so letters parallax differently
 *        as the camera dollies, and so the sun-shaft can catch
 *        only one or two at a time
 *
 * Motion
 * ------
 * Three slow sines per letter, half the frequencies of the
 * previous pass so the drift reads as suspension rather than
 * animation. Phase varies per letter so the field never breathes
 * in unison.
 *
 * Shimmer + beam catch
 * --------------------
 * fillOpacity is modulated by a slow per-letter pulse (subtle) plus
 * a beam-proximity term that lifts the letter when it sits inside
 * the configured sun-shaft volume. The pulse is gentler than the
 * old version since the outline-glow channel no longer exists.
 *
 * Material
 * --------
 * Drei's Text owns its material (troika derives an SDF shader from
 * a default MeshBasicMaterial). We patch `depthWrite = false` and
 * `side = DoubleSide` on each sync so fish blend correctly with
 * the letters from any z order. No outline; color is a
 * murkiness-controlled tint between pearl-white and deep teal so
 * the letters sit in the water medium instead of floating on top
 * of it.
 */

const NAME = 'abelcharrow';
const NAME_LETTERS = NAME.split('');

// Pearl base. The final color is a lerp toward DEEP_TEAL based on
// the user-configurable murkiness slider.
const PEARL_COLOR = new THREE.Color('#e6f0f5');
const DEEP_TEAL = new THREE.Color('#3a677a');

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
}) {
  const groupRef = useRef();
  const textRef = useRef();

  // Patch the troika SDF material to be transparency-friendly with
  // the fish (depthWrite off, double-sided, no tone mapping). troika
  // can rebuild the derived material on some prop changes, so we
  // defensively re-apply on every sync.
  const handleSync = (mesh) => {
    if (!mesh || !mesh.material) return;
    mesh.material.transparent = true;
    mesh.material.depthWrite = false;
    mesh.material.side = THREE.DoubleSide;
    mesh.material.toneMapped = false;
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

    // Idle motion. Frequencies are roughly half what they used to
    // be so the letters feel suspended rather than animated.
    const bob = Math.sin(t * 0.42 + phase) * floatStrength;
    const drift = Math.sin(t * 0.19 + phase * 1.3) * floatStrength * 0.5;
    const zWobble = Math.sin(t * 0.14 + phase * 1.7) * floatStrength * 0.3;
    g.position.set(baseX + drift, baseY + bob, baseZ + zWobble);

    // Tiny axis rotations so each letter "hangs" in water rather
    // than locking to camera-aligned axes.
    g.rotation.z = Math.sin(t * 0.28 + phase) * 0.025;
    g.rotation.y = Math.sin(t * 0.17 + phase * 0.7) * 0.035;

    // Base shimmer pulse on the fill alpha. The 0.14 keeps the
    // swing subtle even at shimmerStrength = 1.
    let pulse = 1.0 + Math.sin(t * 0.65 + phase) * 0.14 * shimmerStrength;

    // Beam proximity. Same shape as before -- gate along the shaft
    // axis, gate by perpendicular distance, multiply.
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
        1 - THREE.MathUtils.smoothstep(perpDist, 0, beam.width * 0.95);
      inBeam = alongFactor * perpFactor;
    }

    // The in-beam term lifts the letter softly. Without an outline
    // glow channel, this is the *only* way the user perceives the
    // letter "catching" the beam, so it's tuned slightly higher
    // than the old 0.45.
    pulse += inBeam * 0.55;

    txt.fillOpacity = THREE.MathUtils.clamp(opacity * pulse, 0, 1);
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]}>
      <Text
        ref={textRef}
        font={intelOneMonoUrl}
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

export default function FloatingLetters({
  enabled = true,
  // Z range; letters span +/- depthSpread/2 along z.
  depthSpread = 3.0,
  // Amplitude of idle bob/drift/wobble.
  floatStrength = 0.035,
  // Per-letter shimmer pulse amplitude on fillOpacity.
  shimmerStrength = 0.45,
  // Base fillOpacity. Combined with the shimmer pulse + beam catch.
  opacity = 0.42,
  // Font size in world units. Defaults are intentionally small so
  // the letters read as environmental forms, not foreground UI.
  scale = 0.32,
  // Horizontal step between letter centres.
  spacing = 1.05,
  // 0 = pearl-white, 1 = deep teal water. The shipping default
  // sits the letters firmly inside the water medium.
  murkiness = 0.55,
  beam = null,
}) {
  // Derive a single tinted color from PEARL_COLOR / DEEP_TEAL and
  // pass it down to each Letter. Memoised on `murkiness` so the
  // lerp only runs when the slider changes.
  const tintedColor = useMemo(() => {
    const c = PEARL_COLOR.clone().lerp(DEEP_TEAL, THREE.MathUtils.clamp(murkiness, 0, 1));
    return `#${c.getHexString()}`;
  }, [murkiness]);

  // Deterministic layout. Seeded RNG so changing spacing /
  // depthSpread re-derives a stable arrangement rather than
  // re-rolling random positions per render.
  const layout = useMemo(() => {
    const rnd = mulberry32(SEED);
    const total = NAME_LETTERS.length;
    return NAME_LETTERS.map((ch, i) => ({
      char: ch,
      baseX: (i - (total - 1) / 2) * spacing,
      // Y jitter scales with spacing so the user gets vertical
      // variation for free when they spread letters apart.
      baseY: (rnd() - 0.5) * spacing * 1.4,
      // Z jitter is the depth-spread budget. Wide depthSpread
      // means some letters sit well in front of the camera and
      // others well behind the school, giving parallax + selective
      // beam catch.
      baseZ: (rnd() - 0.5) * depthSpread,
      phase: rnd() * Math.PI * 2,
    }));
  }, [spacing, depthSpread]);

  if (!enabled) return null;

  return (
    <group>
      {layout.map((l, i) => (
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
        />
      ))}
    </group>
  );
}
