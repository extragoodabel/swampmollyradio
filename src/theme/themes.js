/**
 * Two-mode theme system for the aquarium.
 *
 * The aquarium engine (camera, fish movement, scatter, bubbles, kelp,
 * haze, light beam, surface, seabed, radio, floating letters) is
 * shared between both modes. Each theme below provides only the
 * *identity* of a mode -- the textures, station, copy, water mood,
 * and kelp/moss styling.
 *
 * Components consume the active theme via `useTheme()` (see
 * `src/theme/ThemeContext.jsx`). Scene.jsx pushes the per-theme
 * water defaults into the live Leva store on theme change so the
 * user can still override them with the controls panel.
 *
 * Adding a third mode is intentionally just one more entry below.
 */

export const THEMES = {
  /**
   * Default mode -- swampy catfish run.
   *
   * Visually: murkier green-blue water, cloudier haze, mossy kelp.
   * Audio: SomaFM SF 10-33 (police/EMS scanner radio overlaid with
   * ambient drone), which sells the "strange humid evening" feel.
   */
  swamp: {
    id: 'swamp',
    displayName: 'Swamp Molly Radio',
    /** Short label for the in-world mode switch (keyboard 2). */
    switchLabel: 'Swamp Molly Radio',
    pageTitle: 'Swamp Molly Radio',
    overlayLabel: 'Swamp Molly Radio',
    hint: 'Drag to turn · scroll to drift · find the beacon',

    /**
     * Light beam: localized, murky shafts — southern-gothic / headlights-in-fog.
     * Fundamental shader branch in LightBeam (`style: 'swamp'`).
     */
    beam: {
      style: 'swamp',
      // Offset pocket of murky light — reads as a second submerged source,
      // not a duplicated spotlight (handled in shader + low opacity).
      secondLayer: {
        positionOffset: [-2.2, 0.15, -2.1],
        widthMul: 0.92,
        lengthMul: 0.78,
        opacityMul: 0.32,
        angleDelta: 11,
        intensityMul: 0.72,
        timePhase: 0.35,
      },
      // Deep volume: shaft sits past the hero school like distant headlight haze.
      position: [-6.2, 10.2, -12.5],
      angleDegrees: 12,
      width: 4.6,
      length: 15,
      regionSize: 1.55,
      intensity: 0.95,
      opacity: 0.62,
      softness: 1.45,
      falloff: 0.58,
      diffusion: 1.15,
      causticStrength: 0.38,
      noiseScale: 9.2,
      shimmerSpeed: 0.32,
      colorWarmth: 0.52,
      coldColor: '#2a453e',
      warmColor: '#c9b86e',
      accentColor: '#3d5c52',
      oceanCoreMix: 0.06,
      uvDrift: 0.034,
      fogCut: 0.58,
      fogLightReach: 1.05,
      swampNarrow: 0.92,
      swampChop: 0.32,
      murkFog: 0.72,
      /** See `LightBeam` — keep shafts visible in thick volume fog. */
      swampFogFMul: 0.62,
      swampFogFloor: 0.13,
      swampDiscardMin: 0.00022,
      accentStrength: 0.04,
      fishDepthMargin: 0.85,
      fishBoostInside: 0.22,
      fishBoostBehind: 0.07,
    },

    /**
     * Swamp-only: widen the background field's *shader* depth fade
     * vs. the live volume fog. Without this, the gradient plane uses
     * the same fogNear/fogFar as fish — the distant field collapses to
     * solid murk and reads as "no background".
     */
    atmosphere: {
      backgroundField: {
        fogNear: 5,
        fogFar: 86,
        backgroundOpacity: 0.9,
        gradientIntensity: 1.1,
        pinkAccentStrength: 0.64,
        displacementStrength: 2.62,
        noiseScale: 2.55,
      },
    },

    fish: {
      // Catfish sprite, pixel art, faces left. No rider variant in
      // swamp mode -- the # 99 salmon is a Salmon Days–mode easter egg.
      mainTexture: '/fish/catfish-facing-left.webp',
      riderTexture: null,
      textureFacesLeft: true,
    },

    letters: {
      // Two-line stack reads as a haunted sign through the murk:
      // "swamp molly" above, "radio" beneath — still one character
      // index per slot (including newline) so the beacon slot lines
      // up with `resolveRadioSlotIndex`.
      text: 'swamp molly\nradio',
      // Beacon replaces the o in "molly" on the top line (not the o in "radio").
      radioSlot: { char: 'o', lineIndex: 0, occurrence: 'first' },
      // Tighter horizontal rhythm + calmer vertical scatter than
      // a single long line; Swamp-only (Salmon Days mode omits these keys).
      letterSpacingMul: 0.88,
      rowGapMul: 0.95,
      intraLineYJitterMul: 0.62,
      interRowJitterMul: 0.24,
      lineXJitterMul: 0.78,
      letterMurkinessBoost: 0.08,
      /**
       * Camera distance to world origin → fillOpacity multiplier (not per-glyph distance).
       * Murky when close; clearest when backed up to frame the stack.
       */
      typographyReadability: {
        anchor: [0, 0, 0],
        readStart: 6.8,
        readPeak: 12.5,
        readEnd: 19,
        readFadeStart: 25,
        readFadeEnd: 34,
        closeMul: 0.58,
        peakMul: 1.16,
        farMul: 0.85,
      },
    },

    radio: {
      stationId: 'soma-sf1033',
      /**
       * Swamp-only: stronger submerged-beacon read — proximity brightness,
       * fog penetration, softer embedded haze damp on the glyph.
       */
      beaconAtmosphere: {
        proximityNear: 4.5,
        proximityFar: 26,
        baseVisibilityMul: 1.22,
        proximityBrightMax: 1.38,
        murkLerpInner: 0.09,
        murkLerpHalo: 0.05,
        murkLerpDust: 0.04,
        haloFarSpread: 0.15,
        embeddedHazeFloor: 0.55,
        distanceHazeAtten: 0.032,
        hazeModFloor: 0.5,
        orbitDustBaseScale: 1.22,
        orbitDustProxScale: 0.45,
      },
    },

    // Pushed *into* the Leva store when this theme activates, so
    // the user can still tweak afterward. See Scene.jsx /
    // useApplyThemeDefaults.
    water: {
      backgroundColor: '#0a1c22',
      fogColor: '#234a40',
      fogNear: 7,
      fogFar: 36,
      waterHazeOpacity: 0.1,
      hazeLayerCount: 4,
    },

    kelp: {
      // Fraction of strands rendered as wide, low, moss-coloured
      // growths instead of slim spiraling ribbons.
      // 0 = no moss (open-water / Salmon Days style), ~0.35 = a healthy swamp mat.
      mossRatio: 0.42,
      /** Hanging / trailing masses (non-moss share); ribbon fills the rest. */
      trailerRatio: 0.28,
      innerRadius: 4.6,
      outerRadius: 31,
      mossHeightMul: 2.05,
      mossThicknessMul: 1.58,
      ribbonHeightMul: 1.68,
      ribbonThicknessMul: 1.38,
      /** Pushed into Leva on swamp load — denser rim, taller growth read. */
      levaAnchors: {
        kelpDensity: 186,
        kelpDistanceBias: 2.5,
        kelpOpacity: 0.64,
        kelpSwayStrength: 0.88,
        kelpSwaySpeed: 0.48,
      },
    },
  },

  /**
   * Salmon Days Radio — open-ocean salmon run aesthetic.
   *
   * Visually: blue-black water, lighter haze, no moss.
   * Audio: SomaFM Deep Space One.
   * Beam: broad, airy, dreamlike sunlight (see `beam.style: 'ocean'`).
   */
  salmonDaysRadio: {
    id: 'salmonDaysRadio',
    displayName: 'Salmon Days Radio',
    switchLabel: 'Salmon Days Radio',
    pageTitle: 'Salmon Days Radio',
    overlayLabel: 'Salmon Days Radio',
    hint: 'Drag to turn · scroll to drift · find the beacon',

    /**
     * Light beam: expansive open-water refracted sun — not a recoloured swamp shaft.
     */
    beam: {
      style: 'ocean',
      secondLayer: null,
      position: [-7.5, 12.5, -15.5],
      angleDegrees: 15,
      width: 9.5,
      length: 24,
      regionSize: 2.55,
      intensity: 0.52,
      opacity: 0.38,
      softness: 2.35,
      falloff: 1.35,
      diffusion: 2.25,
      causticStrength: 0.2,
      noiseScale: 4.2,
      shimmerSpeed: 0.48,
      colorWarmth: 0.38,
      coldColor: '#b8daf0',
      warmColor: '#f4f8ff',
      accentColor: '#e5c0dc',
      oceanCoreMix: 0.07,
      uvDrift: 0.042,
      fogCut: 0.42,
      fogLightReach: 1.18,
      swampNarrow: 1,
      swampChop: 0,
      murkFog: 0.5,
      accentStrength: 0.2,
      fishDepthMargin: 1.35,
      fishBoostInside: 0.14,
      fishBoostBehind: 0.05,
    },

    fish: {
      mainTexture: '/fish/salmon-facing-left.webp',
      // Rider variant -- exactly one fish per school gets this skin.
      riderTexture: '/fish/salmon-facing-left-99.webp',
      textureFacesLeft: true,
    },

    letters: {
      text: 'abelcharrow',
      // Beacon is the "o" in "charrow" (only `o` in the string; `last` is explicit).
      radioSlot: { char: 'o', occurrence: 'last' },
      typographyReadability: {
        anchor: [0, 0, 0],
        readStart: 6.2,
        readPeak: 11.5,
        readEnd: 17.5,
        readFadeStart: 23,
        readFadeEnd: 31,
        closeMul: 0.6,
        peakMul: 1.14,
        farMul: 0.87,
      },
    },

    radio: {
      stationId: 'soma-deepspace',
    },

    water: {
      backgroundColor: '#020510',
      fogColor: '#7599c8',
      fogNear: 18,
      fogFar: 120,
      waterHazeOpacity: 0.038,
      hazeLayerCount: 4,
    },

    kelp: {
      mossRatio: 0,
      trailerRatio: 0,
      /** Wider inner ring + far rim: kelp reads as distant columns, center stays open. */
      innerRadius: 6.8,
      outerRadius: 46,
      mossHeightMul: 1,
      mossThicknessMul: 1,
      ribbonHeightMul: 1.08,
      ribbonThicknessMul: 0.88,
      /** Push virtual floor deeper so tall open-ocean columns rise through more water. */
      seabedAnchorExtra: 92,
      /** Full abyss root dissolve + calm vertical drift (see KelpForest). */
      abyssBlend: 1,
      verticalDream: 0.14,
      dreamVerticalSpeed: 0.16,
      levaAnchors: {
        kelpDensity: 72,
        kelpDistanceBias: 2.45,
        kelpOpacity: 0.38,
        kelpSwayStrength: 0.72,
        kelpSwaySpeed: 0.38,
      },
    },

    /**
     * Salmon Days–only overrides layered on shared Leva controls.
     * Swamp uses only `atmosphere.backgroundField` to decouple the
     * distant light-field fade from volume fog.
     */
    atmosphere: {
      // Reset pass: no floor/ceiling planes, no rectangular light beam — open water base only.
      levaAnchors: {
        surfaceEnabled: false,
        seabedEnabled: false,
        lightBeamEnabled: false,
        /** Kelp anchor only (seabed mesh hidden); keep roots far below the school. */
        seabedDepth: 140,
      },
      backgroundField: {
        palette: 'openOcean',
        position: [0, 0, -198],
        size: [415, 238],
        segments: [172, 100],
        displacementStrength: 1.72,
        noiseScale: 1.78,
        animationSpeed: 0.052,
        gradientIntensity: 1.56,
        pinkAccentStrength: 1.34,
        diagonalFlowStrength: 0.5,
        backgroundOpacity: 0.86,
        fogNear: 4,
        fogFar: 248,
      },
      /** Full-sphere abyss + overhead glow; Salmon Days only (see Scene.jsx). */
      salmonOceanVault: {
        deepColor: '#020408',
        midColor: '#102544',
        surfaceTint: '#fff6fc',
        shimmer: 1.2,
      },
      waterHaze: {
        causticColor: '#e2f0ff',
        abyssVertFade: 0.92,
      },
      surfacePlane: {
        opacity: 0.38,
        rippleStrength: 0.28,
        rippleSpeed: 0.36,
        shimmerStrength: 0.68,
        yellowIntensity: 0.32,
        diagonalFlow: 0.58,
        fogBlend: 0.68,
        planeSize: 76,
        baseColor: '#6ca6cc',
        highlightColor: '#d7f0ff',
        yellowColor: '#f8e2f4',
      },
      seabed: {
        opacity: 0.34,
        rippleStrength: 0.3,
        rippleSpeed: 0.3,
        goldIntensity: 0.88,
        fogBlend: 0.58,
        planeSize: 92,
        sandColor: '#f2ede3',
        highlightColor: '#ffffff',
        goldColor: '#edd6a8',
      },
      dustParticles: {
        color: '#f2e8ff',
        opacityMul: 1.15,
        shimmerMul: 1.38,
      },
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME_ID = 'swamp';

/** Safe lookup with fallback to the default theme. */
export function getTheme(id) {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
}

/** Index of the glyph replaced by the radio beacon, or null when no match. */
export function resolveRadioSlotIndex(text, spec) {
  if (!text || !spec || spec.char == null || spec.char === '') return null;
  const c = spec.char;

  // Pin the beacon to one text row (e.g. "swamp molly" line vs "radio" line).
  if (spec.lineIndex != null) {
    const lines = text.split('\n');
    const li = spec.lineIndex;
    if (li < 0 || li >= lines.length) return null;
    const line = lines[li];
    let idxInLine = -1;
    if (spec.occurrence === 'last') {
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === c) idxInLine = i;
      }
    } else {
      idxInLine = line.indexOf(c);
    }
    if (idxInLine < 0) return null;
    let offset = 0;
    for (let i = 0; i < li; i += 1) {
      offset += lines[i].length + 1;
    }
    return offset + idxInLine;
  }

  if (spec.occurrence === 'last') {
    let idx = -1;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === c) idx = i;
    }
    return idx >= 0 ? idx : null;
  }
  const j = text.indexOf(c);
  return j >= 0 ? j : null;
}

/** The "other" theme, for toggle UI labelling. */
export function otherThemeId(id) {
  return id === 'swamp' ? 'salmonDaysRadio' : 'swamp';
}
