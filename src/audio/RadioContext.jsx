import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_STATION_ID, getStation } from './stations.js';

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

export function RadioProvider({ stationId = DEFAULT_STATION_ID, children }) {
  // Resolve the active station from the (theme-driven) stationId
  // prop. Memoised so child memo deps that reference `station` are
  // stable until the prop actually changes.
  const station = useMemo(() => getStation(stationId), [stationId]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [error, setError] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [filterAttached, setFilterAttached] = useState(false);

  // Refs keep latest control values without forcing re-renders into
  // the audio graph each frame.
  const volumeRef = useRef(0.5);
  const filterStrengthRef = useRef(0.55);
  const enabledRef = useRef(true);

  const audioRef = useRef(null);
  const graphRef = useRef(null);
  // Mirror of isPlaying for use inside async callbacks / setTimeout.
  const playingRef = useRef(false);
  playingRef.current = isPlaying;

  const buildAudioElement = useCallback(
    (useCors) => {
      const a = new Audio();
      if (useCors) a.crossOrigin = 'anonymous';
      a.preload = 'none';
      a.src = station.streamUrl;
      // We let the gain node handle volume when the Web Audio graph
      // is in play; otherwise we drive a.volume directly during fades.
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
      lowpass.frequency.value = 950; // muffled, underwater-ish
      lowpass.Q.value = 0.6;

      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const master = ctx.createGain();

      dry.gain.value = clamp01(1 - filterStrengthRef.current);
      wet.gain.value = clamp01(filterStrengthRef.current);
      master.gain.value = 0; // silent until first play()

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
      // Most commonly: MediaElementSource can't be created because the
      // element is already used elsewhere, or the source is tainted.
      // Either way we proceed without a graph.
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
      // No graph -- ramp audio.volume manually.
      const a = audioRef.current;
      const start = a.volume;
      const startedAt = performance.now();
      const tick = () => {
        const t = clamp01((performance.now() - startedAt) / (durationSec * 1000));
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
      // Browsers reject play() if the AudioContext is suspended on a
      // user gesture; resuming a no-op if already running is cheap.
      const g = graphRef.current;
      if (g && g.ctx.state === 'suspended') {
        await g.ctx.resume();
      }
      return audio.play();
    },
    [],
  );

  const play = useCallback(async () => {
    if (!enabledRef.current) return;
    setError(null);
    setIsLoading(true);

    let audio = audioRef.current;
    if (!audio) {
      audio = buildAudioElement(true);
      audioRef.current = audio;
    }

    // First try: with crossOrigin + Web Audio graph attached.
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

    // If the CORS-flavoured element didn't play, rebuild without
    // crossOrigin (tears down the Web Audio graph -- filter will be a
    // no-op for this session).
    if (!played) {
      teardownGraph();
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      audio = buildAudioElement(false);
      audioRef.current = audio;

      // Manual fade-in via audio.volume since there's no master gain.
      audio.volume = 0;
      try {
        await attemptPlay(audio);
        played = true;
      } catch (secondErr) {
        // Try station fallback URLs in plain mode.
        for (const url of station.fallbacks ?? []) {
          try {
            audio.src = url;
            audio.load();
            await attemptPlay(audio);
            played = true;
            break;
          } catch {
            /* try next */
          }
        }
        if (!played) {
          console.warn('[radio] all play attempts failed:', secondErr);
          setError('Stream unreachable. Try again in a moment.');
        }
      }
    }

    setIsLoading(false);
    if (played) {
      setIsPlaying(true);
      setHasEverPlayed(true);
      // Master fade-in (Web Audio path) or audio.volume ramp (fallback).
      fadeMasterTo(volumeRef.current, FADE_SECONDS);
    }
  }, [
    attachGraph,
    attemptPlay,
    buildAudioElement,
    fadeMasterTo,
    station.fallbacks,
    teardownGraph,
  ]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    fadeMasterTo(0, FADE_SECONDS);
    setIsPlaying(false);
    // Actually stop the network stream after the fade so the user
    // doesn't sit on bytes they can't hear.
    const stopAt = setTimeout(() => {
      if (!playingRef.current && audio) {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
      }
    }, FADE_SECONDS * 1000 + 80);
    return () => clearTimeout(stopAt);
  }, [fadeMasterTo]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

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

  // Now-playing polling. Best-effort; CORS or 404 silently no-op.
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

  // Cleanup on unmount.
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

  // Station change (theme toggle). Stop the current stream and reset
  // playback state so the next play() builds a fresh element pointing
  // at the new URL. We deliberately *don't* auto-resume on the new
  // station: switching modes is a deliberate context change, and
  // bridging it with audio would feel jarring.
  const lastStationIdRef = useRef(stationId);
  useEffect(() => {
    if (lastStationIdRef.current === stationId) return;
    lastStationIdRef.current = stationId;

    // Stop playback and discard the current audio element so the
    // next play() sees a clean slate. The Web Audio graph (if any)
    // was hooked to the old element, so it has to go with it.
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
    // hasEverPlayed is intentionally preserved -- the overlay's
    // "tap the beacon to resume" hint is still relevant after a
    // mode switch.
  }, [stationId, teardownGraph]);

  const value = {
    station,
    isPlaying,
    isLoading,
    error,
    nowPlaying,
    filterAttached,
    hasEverPlayed,
    toggle,
    play,
    pause,
    setVolume,
    setFilterStrength,
    setEnabled,
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
