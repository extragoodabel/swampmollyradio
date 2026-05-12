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
    displayName: 'swamp molly radio',
    /** Short label for the in-world mode switch (keyboard 2). */
    switchLabel: 'swamp molly radio',
    pageTitle: 'swamp molly radio',
    overlayLabel: 'swamp molly radio',
    hint: 'drag to turn\nscroll to drift',

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
      /**
       * Pushed into Leva on swamp load. Must re-enable every environmental layer
       * Salmon Days turns off — otherwise toggles + seabedDepth stick in the store
       * when switching themes or restoring from localStorage.
       */
      levaAnchors: {
        surfaceEnabled: true,
        seabedEnabled: true,
        lightBeamEnabled: true,
        seabedDepth: 12,
        cameraZMin: -11,
        cameraZMax: 90,
        hazeMovementSpeed: 1.0,
      },
      /**
       * Lateral bounds for CameraRig (Z still uses Leva `cameraZMin` / `cameraZMax`).
       * Wide +Z rail reaches the submerged car past the default hero volume.
       */
      navigation: {
        boundsXMin: -19,
        boundsXMax: 19,
        boundsYMin: -9,
        boundsYMax: 10,
      },
      /**
       * Camera Y: soft return toward midwater (fish layer) + damping when
       * far — heavier / sooner in swamp; lighter in salmon (see salmon theme).
       */
      cameraComfort: {
        comfortY: 0,
        recenterStrength: 0.27,
        extremeStart: 1.85,
        extremeFull: 6,
        extraVerticalDamp: 1.58,
        exploreVelThreshold: 0.36,
        dragActiveRecenterMul: 0.09,
      },
      /**
       * Atmospheric distant fish: murk, shadow silhouettes, low readability.
       * See `mergeDistantFishEnv` defaults in this file.
       */
      distantFishAtmosphere: {
        cloudPaletteA: '#141f24',
        cloudPaletteB: '#2a3d45',
        cloudCountScale: 0.42,
        cloudPointSize: 0.084,
        cloudOpacityMul: 0.94,
        cloudRotationMul: 0.56,
        cloudGlobalYawMul: 0.7,
        midfieldSaturation: 0.26,
        midfieldFlickerAmp: 0.032,
        midfieldFogLerp: 0.97,
        midfieldVelMul: 0.4,
        midfieldWagMul: 0.24,
        midfieldOpacityMul: 0.55,
        midfieldScaleMin: 0.14,
        midfieldScaleRange: 0.32,
        midfieldSwimSpeedMul: 0.44,
      },
      /**
       * Hero fish: atmospheric perspective via colour (opaque bodies).
       */
      heroFishAtmosphere: {
        nearDist: 4.2,
        farDist: 18.5,
        fogColor: '#1c322c',
        fogBlend: 0.86,
        darken: 0.68,
        desaturate: 0.8,
        shimmerAtten: 0.62,
        silverGlint: 0,
      },
    },

    fish: {
      // Catfish sprite, pixel art, faces left. No rider variant in
      // swamp mode -- the # 99 salmon is a Salmon Days–mode easter egg.
      mainTexture: '/fish/catfish-facing-left.webp',
      riderTexture: null,
      textureFacesLeft: true,
      /** Nudges hero school slightly below the typography line (both themes). */
      schoolClusterYOffset: -1.05,
    },

    /**
     * Loose companion schools that drift in the viewer’s volume — murky,
     * smaller, slower than Salmon Days; fills peripheral space when the
     * camera leaves the hero band.
     */
    ambientCompanionSchools: {
      enabled: true,
      wanderSpeed: 0.095,
      lagBreathe: 1.15,
      minShellRadius: 6.5,
      shimmerMul: 0.76,
      entries: [
        {
          count: 22,
          seed: 5101,
          lagBack: 8.5,
          sideAmp: 6.3,
          vertAmp: 2.05,
          followSharpness: 0.62,
          bounds: { x: 14, y: 4.5, z: 15 },
          spread: 1.02,
          swimMul: 0.66,
          clusterCount: 3,
          avoidance: 2.75,
          baseWidth: 1.58,
          foregroundCrossingChance: 0.048,
          wanderPhase: 0,
        },
        {
          count: 15,
          seed: 5202,
          lagBack: 7.8,
          sideAmp: 6.6,
          vertAmp: 1.55,
          followSharpness: 0.58,
          bounds: { x: 13, y: 4, z: 14 },
          spread: 0.94,
          swimMul: 0.6,
          clusterCount: 3,
          avoidance: 2.5,
          baseWidth: 1.48,
          foregroundCrossingChance: 0.042,
          wanderPhase: 2.19,
        },
      ],
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
      intraLineYJitterMul: 0.48,
      interRowJitterMul: 0.16,
      lineXJitterMul: 0.55,
      letterMurkinessBoost: 0.06,
      /**
       * Ethereal pale/silver read + murk curve (canvas + Troika). Keeps letters
       * luminous underwater without UI-neon saturation.
       */
      typographyTint: {
        pearl: '#eaf6f2',
        murk: '#2f4d45',
        murkPow: 0.84,
        aqua: '#7ec4b8',
        aquaMix: 0.1,
        highlight: '#f5fffb',
        warm: '#e8f0d8',
        warmMix: 0.055,
      },
      /**
       * World-space Y lift for the whole phrase (letters + embedded orb).
       * Swamp: clears densest hero fish band while staying underwater.
       */
      typographyWorldYOffset: 1.12,
      floatLayout: {
        sequentialDepthShare: 0.5,
        randomZAsFracOfSpread: 0.2,
        xJitterAsFracOfSpacing: 0.12,
        yJitterAsFracOfSpacing: 0.44,
      },
      /**
       * Camera distance to world origin → fillOpacity multiplier (not per-glyph distance).
       * Murky when close; clearest when backed up to frame the stack.
       */
      typographyReadability: {
        anchor: [0, 0, 0],
        readStart: 4.8,
        readPeak: 10.5,
        readEnd: 20,
        readFadeStart: 30,
        readFadeEnd: 50,
        closeMul: 0.8,
        peakMul: 1.22,
        farMul: 0.9,
        pullbackLiftStart: 6,
        pullbackLiftEnd: 13.5,
        pullbackLiftMax: 1.15,
        pullbackScaleStart: 7.8,
        pullbackScaleEnd: 16.5,
        pullbackScaleExtra: 0.055,
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
      // 0 = no moss (ribbon-only swamp stands or when moss ratio is 0).
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
        kelpEnabled: true,
        kelpDensity: 186,
        kelpDistanceBias: 2.5,
        kelpOpacity: 0.74,
        kelpSwayStrength: 0.88,
        kelpSwaySpeed: 0.48,
      },
    },
  },

  /**
   * Salmon Days Radio — open-ocean salmon run aesthetic.
   *
   * Visually: blue-black water, lighter haze, no seabed kelp forest.
   * Audio: SomaFM Deep Space One.
   * Beam: broad, airy, dreamlike sunlight (see `beam.style: 'ocean'`).
   */
  salmonDaysRadio: {
    id: 'salmonDaysRadio',
    displayName: 'salmon days radio',
    switchLabel: 'salmon days radio',
    pageTitle: 'salmon days radio',
    overlayLabel: 'salmon days radio',
    hint: 'drag to turn\nscroll to drift',

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
      /** Nudge school slightly below typography; Y lift on letters clears overlap. */
      schoolClusterYOffset: -1.12,
    },

    /**
     * Open-water companions: wider spacing, slightly brighter shimmer,
     * graceful lag so life stays in the mid-field while drifting.
     */
    ambientCompanionSchools: {
      enabled: true,
      wanderSpeed: 0.118,
      lagBreathe: 1.75,
      minShellRadius: 8,
      shimmerMul: 1.04,
      entries: [
        {
          count: 26,
          seed: 5101,
          lagBack: 15,
          sideAmp: 8.4,
          vertAmp: 2.75,
          followSharpness: 0.86,
          bounds: { x: 16, y: 5.5, z: 18 },
          spread: 1.12,
          swimMul: 0.88,
          clusterCount: 4,
          avoidance: 3.15,
          baseWidth: 1.74,
          foregroundCrossingChance: 0.072,
          wanderPhase: 0,
        },
        {
          count: 18,
          seed: 5202,
          lagBack: 14,
          sideAmp: 8.8,
          vertAmp: 2.2,
          followSharpness: 0.8,
          bounds: { x: 15, y: 5, z: 17 },
          spread: 1.06,
          swimMul: 0.82,
          clusterCount: 3,
          avoidance: 2.95,
          baseWidth: 1.64,
          foregroundCrossingChance: 0.062,
          wanderPhase: 2.37,
        },
      ],
    },

    letters: {
      text: 'salmon days\nradio',
      // Beacon replaces the first `o` — first line only ("salmon").
      radioSlot: { char: 'o', lineIndex: 0, occurrence: 'first' },
      letterSpacingMul: 0.9,
      intraLineYJitterMul: 0.36,
      lineXJitterMul: 0.42,
      /** Tighter stack: title above, "radio" below the hero band. */
      rowGapMul: 0.66,
      interRowJitterMul: 0.09,
      letterMurkinessBoost: 0.05,
      typographyTint: {
        pearl: '#f6faff',
        murk: '#3a5a72',
        murkPow: 0.72,
        aqua: '#8ed0ee',
        aquaMix: 0.14,
        highlight: '#f2fbff',
        warm: '#fde8dc',
        warmMix: 0.065,
      },
      /**
       * Lift phrase above densest hero salmon band (multi-line keeps radio lower).
       */
      typographyWorldYOffset: 1.22,
      floatLayout: {
        sequentialDepthShare: 0.34,
        randomZAsFracOfSpread: 0.11,
        xJitterAsFracOfSpacing: 0.085,
        yJitterAsFracOfSpacing: 0.32,
      },
      typographyReadability: {
        anchor: [0, 0, 0],
        readStart: 4.6,
        readPeak: 10.8,
        readEnd: 19,
        readFadeStart: 28,
        readFadeEnd: 48,
        closeMul: 0.82,
        peakMul: 1.22,
        farMul: 0.91,
        pullbackLiftStart: 6,
        pullbackLiftEnd: 14,
        pullbackLiftMax: 1.2,
        pullbackScaleStart: 8,
        pullbackScaleEnd: 17,
        pullbackScaleExtra: 0.058,
      },
    },

    radio: {
      stationId: 'soma-deepspace',
    },

    water: {
      backgroundColor: '#081220',
      fogColor: '#7a94c4',
      fogNear: 15,
      fogFar: 168,
      waterHazeOpacity: 0.088,
      hazeLayerCount: 5,
    },

    /**
     * Kelp is a swamp-only read. Salmon Days stays open-water: instanced ribbon
     * columns were reading as vertical line layers / depth seams, so the forest
     * is not mounted in `Scene.jsx` for this theme (see `kelp.levaAnchors`).
     */
    kelp: {
      mossRatio: 0,
      trailerRatio: 0,
      levaAnchors: {
        kelpEnabled: false,
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
        /** Deep implicit floor reference when toggling seabed in dev; seabed mesh stays off. */
        seabedDepth: 140,
        cameraZMin: -28,
        cameraZMax: 58,
        hazeMovementSpeed: 1.18,
      },
      backgroundField: {
        palette: 'openOcean',
        position: [0, 0, -455],
        size: [2680, 1480],
        segments: [168, 98],
        displacementStrength: 5.2,
        noiseScale: 1.22,
        animationSpeed: 0.22,
        gradientIntensity: 2.85,
        pinkAccentStrength: 2.0,
        diagonalFlowStrength: 1.85,
        backgroundOpacity: 1.0,
        fogNear: 2,
        fogFar: 5200,
        openOceanMotionBoost: 1.22,
        /** Recovery: was folding the megaplane into view at scale 255×; keep off until re-tuned. */
        openOceanTopCurl: 0,
      },
      /** Distant open-water “underside of the surface” cloth above the viewer. */
      oceanSurfaceCanopy: {
        heightAboveCamera: 455,
        planeSize: [5600, 3000],
        segments: [128, 128],
        waveStrength: 16,
        animationSpeed: 0.165,
        baseColor: '#5ca0d4',
        highlightColor: '#e2f4ff',
        yellowColor: '#ffecc4',
        opacity: 0.34,
        fogNear: 195,
        fogFar: 1280,
      },
      /** Full-sphere abyss + rich overhead caustics; Salmon Days only. */
      salmonOceanVault: {
        deepColor: '#00040a',
        midColor: '#0c1f3d',
        surfaceTint: '#fff2e8',
        warmPeach: '#ffc8a8',
        aquaSheen: '#a8dcff',
        shimmer: 1.38,
        vaultCaustic: 1.12,
        overheadGlow: 0.98,
      },
      /**
       * Recovery rebuild: merge on top of `salmonOceanVault` for a softer pocket +
       * slightly brighter zenith (surface suggestion only — still shader on the sphere).
       */
      salmonRebuildVault: {
        deepColor: '#020510',
        midColor: '#0e2542',
        overheadGlow: 1.18,
        vaultCaustic: 0.9,
        shimmer: 1.05,
      },
      /**
       * Recovery rebuild: overrides `backgroundField` when Salmon `SALMON_ENV.backdrop`
       * is on — lower displacement/opacity, fewer segments, calmer motion.
       */
      salmonRebuildBackdrop: {
        position: [0, 0, -438],
        size: [2520, 1320],
        segments: [96, 56],
        displacementStrength: 2.45,
        noiseScale: 1.12,
        animationSpeed: 0.1,
        gradientIntensity: 1.82,
        pinkAccentStrength: 1.12,
        diagonalFlowStrength: 0.95,
        backgroundOpacity: 0.44,
        fogNear: 12,
        fogFar: 3600,
        openOceanMotionBoost: 0.78,
        openOceanTopCurl: 0,
        cycloramaBend: 56,
        openOceanAlphaEdgeWidth: 0.058,
        openOceanTopSoft: 0.13,
      },
      waterHaze: {
        causticColor: '#ffe8d0',
        abyssVertFade: 0.94,
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
        color: '#fff2ff',
        opacityMul: 1.58,
        shimmerMul: 1.55,
      },
      /** Softer vertical guardrails than swamp — more open midwater drift. */
      cameraComfort: {
        comfortY: 0,
        recenterStrength: 0.17,
        extremeStart: 2.75,
        extremeFull: 8.5,
        extraVerticalDamp: 1.12,
        exploreVelThreshold: 0.52,
        dragActiveRecenterMul: 0.2,
      },
      /**
       * Atmospheric distant fish: pale silver; keep subtle vs shadow layer.
       */
      distantFishAtmosphere: {
        cloudPaletteA: '#070d14',
        cloudPaletteB: '#1a2a3a',
        cloudCountScale: 0.9,
        cloudPointSize: 0.156,
        cloudOpacityMul: 1.18,
        cloudRotationMul: 0.3,
        cloudGlobalYawMul: 0.48,
        midfieldWorldRadiusMul: 1.24,
        midfieldVerticalSpreadMul: 1.42,
        midfieldSaturation: 0.28,
        midfieldFlickerAmp: 0.04,
        midfieldFogLerp: 0.94,
        midfieldVelMul: 0.42,
        midfieldWagMul: 0.28,
        midfieldOpacityMul: 0.46,
        midfieldScaleMin: 0.13,
        midfieldScaleRange: 0.3,
        midfieldSwimSpeedMul: 0.36,
      },
      /** Hero salmon: silhouette + fog colour at distance; bodies stay opaque. */
      heroFishAtmosphere: {
        nearDist: 5.2,
        farDist: 21,
        fogColor: '#3d5168',
        fogBlend: 0.88,
        darken: 0.56,
        desaturate: 0.74,
        shimmerAtten: 0.72,
        silverGlint: 0.13,
      },
      /**
       * Secondary hero-quality WebP salmon above/below the central band (`SalmonSatelliteSchools`).
       * Small schools, no rider, no bubble trails — keeps perf and hierarchy vs main school.
       */
      satelliteHeroFish: {
        enabled: true,
        counts: [15, 14, 12],
        swimSpeedMul: 0.64,
        clusterCount: 3,
        bounds: { x: 15, y: 4.9, z: 18 },
        spread: 1.04,
        foregroundCrossingChance: 0.085,
        schools: [
          { anchorY: 8.35, group: [3.2, 0.55, -2.5], seed: 8841 },
          { anchorY: -9.25, group: [-3.5, -0.45, 1.7], seed: 9029 },
          { anchorY: 5.85, group: [-4.3, 0.5, -6.4], seed: 9177 },
        ],
        depthCue: {
          nearDist: 5.0,
          farDist: 22.5,
          fogBlend: 0.9,
          darken: 0.59,
          desaturate: 0.76,
          shimmerAtten: 0.74,
          silverGlint: 0.1,
        },
      },
      /** Extra distant opaque shadow schools (`SalmonShadowFishSilhouettes`). */
      shadowSilhouetteFish: {
        densityMul: 0.54,
        opacity: 0.8,
      },
      /** Wide XY volume: open-ocean swim space (Z from Leva anchors above). */
      navigation: {
        boundsXMin: -44,
        boundsXMax: 44,
        boundsYMin: -18,
        boundsYMax: 20,
      },
    },
  },
};

/**
 * Shared defaults for distant fish layers (`BackgroundFishClouds`, `MidfieldSchool`).
 * Each theme shallow-merges overrides via `atmosphere.distantFishAtmosphere`.
 */
export const DISTANT_FISH_ENV_BASE = {
  cloudPointSize: 0.09,
  cloudCountScale: 0.46,
  cloudOpacityMul: 0.86,
  cloudRotationMul: 0.62,
  cloudGlobalYawMul: 0.82,
  cloudPaletteA: '#2a4050',
  cloudPaletteB: '#507088',
  midfieldWorldRadiusMul: 1.12,
  midfieldVerticalSpreadMul: 1.18,
  midfieldCountMul: 0.88,
  midfieldSwimSpeedMul: 0.48,
  midfieldOpacityMul: 0.58,
  midfieldScaleMin: 0.15,
  midfieldScaleRange: 0.34,
  midfieldOpacityAttrMin: 0.16,
  midfieldOpacityAttrRange: 0.3,
  midfieldSaturation: 0.4,
  midfieldWagMul: 0.3,
  midfieldFlickerAmp: 0.052,
  midfieldFogLerp: 0.93,
  midfieldVelMul: 0.46,
};

export function mergeDistantFishEnv(theme) {
  const partial = theme?.atmosphere?.distantFishAtmosphere;
  return { ...DISTANT_FISH_ENV_BASE, ...(partial ?? {}) };
}

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

/** The "other" theme id (for portal-style switch UI). */
export function otherThemeId(id) {
  return id === 'swamp' ? 'salmonDaysRadio' : 'swamp';
}
