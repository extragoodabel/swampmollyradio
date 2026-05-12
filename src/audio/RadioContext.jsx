import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  dialStationAt,
  getDialStationIndex,
  getStation,
  normalizeDialStationId,
  SOMA_FM_DIAL_STATIONS,
} from './stations.js';

/**
 * Single source of truth for the ambient radio.
 *
 * Audio playback uses an HTMLAudioElement so live shoutcast streams
 * (SomaFM) work without a special decoder. On top of that we *try*
 * to route the element through a Web Audio graph:
 *
 *   <audio> -> MediaElementSource
 *           -> [dry path] -----------> masterGain ->
 *           -> [lowpass] -> wetGain -^
 *                                       \-> destination
 *
 * The dry/wet gains crossfade between unfiltered and lowpassed audio,
 * driven by `underwaterAudioFilterStrength` from Leva. masterGain is
 * used for play/pause fades and the `radioVolume` control.
 *
 * The Web Audio path requires the stream's HTTP response to permit
 * cross-origin reads. SomaFM's ice servers don't reliably advertise
 * CORS, so on failure we silently degrade: recreate the audio element
 * WITHOUT crossOrigin and play it directly. In that mode the filter
 * slider is inert (we can't tap the source), but the radio still works.
 *
 * The Now Playing JSON endpoint is polled best-effort while playback
 * is active. A CORS failure there is also non-fatal: we just leave
 * `nowPlaying` null and the overlay falls back to the station name.
 */

const RadioCtx = createContext(null);

const FADE_SECONDS = 0.9;
const FILTER_RAMP_SECONDS = 0.4;
const NOW_PLAYING_POLL_MS = 30_000;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function RadioProvider({
  themeId,
  themeDefaultStationId,
  children,
}) {
  const normalizedDefault = useMemo(
    () => normalizeDialStationId(themeDefaultStationId),
    [themeDefaultStationId],
  );

  const [activeStationId, setActiveStationId] = useState(normalizedDefault);
  const activeStationIdRef = useRef(activeStationId);
  activeStationIdRef.current = activeStationId;

  const station = useMemo(
    () => getStation(activeStationId),
    [activeStationId],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [error, setError] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [filterAttached, setFilterAttached] = useState(false);

  const volumeRef = useRef(0.5);
  const filterStrengthRef = useRef(0.55);
  const enabledRef = useRef(true);

  const audioRef = useRef(null);
  const graphRef = useRef(null);
  const playingRef = useRef(false);
  playingRef.current = isPlaying;

  const swapLockRef = useRef(false);
  const lastThemeIdRef = useRef(themeId);

  /**
   * Synchronous flag read by `CameraRig` (via microtask-deferred pointerdown)
   * so grabbing the radio beacon never starts a concurrent world-drag on the
   * canvas. Set `true` on beacon pointer down, `false` on up/cancel/lost capture.
   */
  const beaconNavSuspendedRef = useRef(false);

  const buildAudioElement = useCallback(
    (useCors) => {
      const a = new Audio();
      if (useCors) a.crossOrigin = 'anonymous';
      a.preload = 'none';
      a.src = station.streamUrl;
      a.volume = 1;
      return a;
    },
    [station.streamUrl],
  );

  const teardownGraph = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    try {
      g.source.disconnect();
      g.dry.disconnect();
      g.wet.disconnect();
      g.lowpass.disconnect();
      g.master.disconnect();
    } catch {
      /* ignore */
    }
    if (g.ctx.state !== 'closed') {
      g.ctx.close().catch(() => {});
    }
    graphRef.current = null;
    setFilterAttached(false);
  }, []);

  const attachGraph = useCallback((audio) => {
    if (graphRef.current) return graphRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    try {
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 950;
      lowpass.Q.value = 0.6;

      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const master = ctx.createGain();

      dry.gain.value = clamp01(1 - filterStrengthRef.current);
      wet.gain.value = clamp01(filterStrengthRef.current);
      master.gain.value = 0;

      source.connect(dry);
      source.connect(lowpass);
      lowpass.connect(wet);
      dry.connect(master);
      wet.connect(master);
      master.connect(ctx.destination);

      graphRef.current = { ctx, source, lowpass, dry, wet, master };
      setFilterAttached(true);
      return graphRef.current;
    } catch (e) {
      console.warn('[radio] Web Audio graph not available:', e?.message ?? e);
      return null;
    }
  }, []);

  const fadeMasterTo = useCallback((target, durationSec) => {
    const g = graphRef.current;
    if (g) {
      const now = g.ctx.currentTime;
      const current = g.master.gain.value;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setValueAtTime(current, now);
      g.master.gain.linearRampToValueAtTime(target, now + durationSec);
    } else if (audioRef.current) {
      const a = audioRef.current;
      const start = a.volume;
      const startedAt = performance.now();
      const tick = () => {
        const t = clamp01(
          (performance.now() - startedAt) / (durationSec * 1000),
        );
        a.volume = clamp01(start + (target - start) * t);
        if (t < 1 && playingRef.current === (target > 0)) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }
  }, []);

  const attemptPlay = useCallback(
    async (audio) => {
      const g = graphRef.current;
      if (g && g.ctx.state === 'suspended') {
        await g.ctx.resume();
      }
      return audio.play();
    },
    [],
  );

  /** Try stream URL list on an existing element (plain / no-CORS rebuild handled by caller). */
  const playUrlsOnElement = useCallback(
    async (audio, urls) => {
      let lastErr;
      for (const url of urls) {
        try {
          audio.src = url;
          audio.load();
          await attemptPlay(audio);
          return true;
        } catch (err) {
          lastErr = err;
        }
      }
      console.warn('[radio] stream URLs failed:', lastErr);
      return false;
    },
    [attemptPlay],
  );

  const play = useCallback(async () => {
    if (!enabledRef.current) return;
    setError(null);
    setIsLoading(true);

    let audio = audioRef.current;
    if (!audio) {
      audio = buildAudioElement(true);
      audioRef.current = audio;
      audio.dataset.radioStationId = station.id;
    } else if (audio.dataset.radioStationId !== station.id) {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      audio.dataset.radioStationId = station.id;
      audio.src = station.streamUrl;
      audio.load();
    }

    let graph = graphRef.current;
    if (!graph) {
      attachGraph(audio);
      graph = graphRef.current;
    }

    let played = false;
    try {
      await attemptPlay(audio);
      played = true;
    } catch (firstErr) {
      console.warn(
        '[radio] play() failed on primary src, falling back without CORS:',
        firstErr?.message ?? firstErr,
      );
    }

    if (!played) {
      teardownGraph();
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      audio = buildAudioElement(false);
      audioRef.current = audio;
      audio.dataset.radioStationId = station.id;

      audio.volume = 0;
      const urls = [station.streamUrl, ...(station.fallbacks ?? [])];
      played = await playUrlsOnElement(audio, urls);
      if (!played) {
        setError('Stream unreachable. Try again in a moment.');
      }
    }

    setIsLoading(false);
    if (played) {
      setIsPlaying(true);
      setHasEverPlayed(true);
      fadeMasterTo(volumeRef.current, FADE_SECONDS);
    }
  }, [
    attachGraph,
    attemptPlay,
    buildAudioElement,
    fadeMasterTo,
    playUrlsOnElement,
    station.fallbacks,
    station.id,
    station.streamUrl,
    teardownGraph,
  ]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    fadeMasterTo(0, FADE_SECONDS);
    setIsPlaying(false);
    setTimeout(() => {
      if (!playingRef.current && audio) {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
      }
    }, FADE_SECONDS * 1000 + 80);
  }, [fadeMasterTo]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const swapToStationId = useCallback(
    async (newId) => {
      const target = normalizeDialStationId(newId);
      if (target === activeStationIdRef.current) return;
      if (swapLockRef.current) return;
      swapLockRef.current = true;

      try {
        const next = getStation(target);

        if (!playingRef.current) {
          setActiveStationId(target);
          setNowPlaying(null);
          setError(null);
          const audio = audioRef.current;
          if (audio) {
            try {
              audio.pause();
            } catch {
              /* ignore */
            }
            audio.dataset.radioStationId = target;
            audio.src = next.streamUrl;
            audio.load();
          }
          return;
        }

        setIsLoading(true);
        setError(null);
        fadeMasterTo(0, FADE_SECONDS);
        await delay(FADE_SECONDS * 1000 + 70);

        setActiveStationId(target);
        setNowPlaying(null);

        const audio = audioRef.current;
        if (!audio) {
          setIsLoading(false);
          return;
        }

        const urls = [next.streamUrl, ...(next.fallbacks ?? [])];
        const ok = await playUrlsOnElement(audio, urls);

        setIsLoading(false);
        if (ok) {
          playingRef.current = true;
          setIsPlaying(true);
          fadeMasterTo(volumeRef.current, FADE_SECONDS);
        } else {
          setError('Stream unreachable. Try again in a moment.');
          playingRef.current = false;
          setIsPlaying(false);
        }
      } finally {
        swapLockRef.current = false;
      }
    },
    [fadeMasterTo, playUrlsOnElement],
  );

  const nextStation = useCallback(() => {
    const idx = getDialStationIndex(activeStationIdRef.current);
    const nextId = dialStationAt(idx + 1);
    void swapToStationId(nextId);
  }, [swapToStationId]);

  const previousStation = useCallback(() => {
    const idx = getDialStationIndex(activeStationIdRef.current);
    const nextId = dialStationAt(idx - 1);
    void swapToStationId(nextId);
  }, [swapToStationId]);

  const setVolume = useCallback((v) => {
    volumeRef.current = clamp01(v);
    if (!playingRef.current) return;
    const g = graphRef.current;
    if (g) {
      const now = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setValueAtTime(g.master.gain.value, now);
      g.master.gain.linearRampToValueAtTime(volumeRef.current, now + 0.18);
    } else if (audioRef.current) {
      audioRef.current.volume = volumeRef.current;
    }
  }, []);

  const setFilterStrength = useCallback((s) => {
    filterStrengthRef.current = clamp01(s);
    const g = graphRef.current;
    if (!g) return;
    const now = g.ctx.currentTime;
    const t = now + FILTER_RAMP_SECONDS;
    g.dry.gain.cancelScheduledValues(now);
    g.wet.gain.cancelScheduledValues(now);
    g.dry.gain.setValueAtTime(g.dry.gain.value, now);
    g.wet.gain.setValueAtTime(g.wet.gain.value, now);
    g.dry.gain.linearRampToValueAtTime(1 - filterStrengthRef.current, t);
    g.wet.gain.linearRampToValueAtTime(filterStrengthRef.current, t);
  }, []);

  const setEnabled = useCallback(
    (e) => {
      enabledRef.current = e;
      if (!e && playingRef.current) pause();
    },
    [pause],
  );

  useEffect(() => {
    if (!isPlaying || !station.nowPlayingUrl) {
      setNowPlaying(null);
      return undefined;
    }
    let cancelled = false;

    const fetchNP = async () => {
      try {
        const r = await fetch(station.nowPlayingUrl, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const first = data?.songs?.[0];
        if (first?.title) setNowPlaying({ title: first.title });
      } catch {
        /* swallow */
      }
    };
    fetchNP();
    const id = setInterval(fetchNP, NOW_PLAYING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPlaying, station.nowPlayingUrl]);

  useEffect(() => {
    return () => {
      try {
        audioRef.current?.pause();
      } catch {
        /* ignore */
      }
      teardownGraph();
    };
  }, [teardownGraph]);

  /**
   * Theme toggle: reset dial default + hard-stop audio (same as legacy
   * `stationId` change — no crossfade across aquarium modes).
   */
  useEffect(() => {
    if (lastThemeIdRef.current === themeId) return;
    lastThemeIdRef.current = themeId;

    setActiveStationId(normalizeDialStationId(themeDefaultStationId));

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    teardownGraph();
    setIsPlaying(false);
    setIsLoading(false);
    setError(null);
    setNowPlaying(null);
  }, [themeId, themeDefaultStationId, teardownGraph]);

  /**
   * When the default station id string for the *current* theme updates
   * (not a theme switch), keep dial in sync only if user is still on a
   * stale id — normally no-op.
   */
  useEffect(() => {
    setActiveStationId((cur) =>
      cur === normalizedDefault ? cur : cur,
    );
  }, [normalizedDefault]);

  const activeStationIndex = getDialStationIndex(activeStationId);

  const value = {
    station,
    stationsDial: SOMA_FM_DIAL_STATIONS,
    activeStationId,
    activeStationIndex,
    dialStationCount: SOMA_FM_DIAL_STATIONS.length,
    isPlaying,
    isLoading,
    error,
    nowPlaying,
    filterAttached,
    hasEverPlayed,
    toggle,
    play,
    pause,
    nextStation,
    previousStation,
    swapToStationId,
    setVolume,
    setFilterStrength,
    setEnabled,
    beaconNavSuspendedRef,
  };

  return <RadioCtx.Provider value={value}>{children}</RadioCtx.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioCtx);
  if (!ctx) {
    throw new Error('useRadio must be used inside a <RadioProvider>');
  }
  return ctx;
}
