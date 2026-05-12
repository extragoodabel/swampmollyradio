/**
 * Ambient radio station catalog.
 *
 * Each station is a plain JSON object so swapping the source (or
 * adding a station picker UI later) is a one-line config change.
 * Stations are looked up by `id` from the active theme config (see
 * `src/theme/themes.js`).
 *
 * `streamUrl` is the primary endpoint that we hand to `<audio src=…>`.
 * `fallbacks` is tried in order if the primary errors during play()
 * (SomaFM's edge nodes can be flaky; rotating through ice1/ice2/ice4
 * gives us a much higher success rate). The HTML5 audio element will
 * also error on CORS failure -- we don't try a different host in that
 * case, just retry the same primary URL without crossOrigin so the
 * stream still plays (sans Web Audio filter).
 *
 * `nowPlayingUrl` is best-effort. If CORS blocks the JSON fetch we
 * silently fall back to displaying the station name only.
 */

export const STATIONS = {
  'soma-sf1033': {
    id: 'soma-sf1033',
    name: 'SF 10-33',
    tagline:
      'Ambient music mixed with the sounds of San Francisco public safety radio.',
    streamUrl: 'https://ice1.somafm.com/sf1033-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/sf1033-128-mp3',
      'https://ice4.somafm.com/sf1033-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/sf1033.json',
    supportsCors: 'maybe',
  },

  'soma-dronezone': {
    id: 'soma-dronezone',
    name: 'Drone Zone',
    tagline: 'Served best chilled, safe with most medications.',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/dronezone-128-mp3',
      'https://ice4.somafm.com/dronezone-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/dronezone.json',
    supportsCors: 'maybe',
  },

  'soma-deepspace': {
    id: 'soma-deepspace',
    name: 'Deep Space One',
    tagline:
      'Deep ambient electronic and space music for the deep listener.',
    streamUrl: 'https://ice1.somafm.com/deepspaceone-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/deepspaceone-128-mp3',
      'https://ice4.somafm.com/deepspaceone-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/deepspaceone.json',
    supportsCors: 'maybe',
  },

  'soma-spacestation': {
    id: 'soma-spacestation',
    name: 'Space Station Soma',
    tagline:
      'Deep space ambient music for exploring inner worlds and outer space.',
    streamUrl: 'https://ice1.somafm.com/spacestation-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/spacestation-128-mp3',
      'https://ice4.somafm.com/spacestation-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/spacestation.json',
    supportsCors: 'maybe',
  },

  'soma-fluid': {
    id: 'soma-fluid',
    name: 'Fluid',
    tagline: 'Electronic music with a brain and a heart.',
    streamUrl: 'https://ice1.somafm.com/fluid-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/fluid-128-mp3',
      'https://ice4.somafm.com/fluid-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/fluid.json',
    supportsCors: 'maybe',
  },

  'soma-groovesalad': {
    id: 'soma-groovesalad',
    name: 'Groove Salad',
    tagline: 'A soothingly groovy ensemble.',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/groovesalad-128-mp3',
      'https://ice4.somafm.com/groovesalad-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/groovesalad.json',
    supportsCors: 'maybe',
  },

  'soma-lush': {
    id: 'soma-lush',
    name: 'LUSH',
    tagline: 'Sensuous and mellow vocals, with an electronic inclination.',
    streamUrl: 'https://ice1.somafm.com/lush-128-mp3',
    fallbacks: [
      'https://ice2.somafm.com/lush-128-mp3',
      'https://ice4.somafm.com/lush-128-mp3',
    ],
    nowPlayingUrl: 'https://somafm.com/songs/lush.json',
    supportsCors: 'maybe',
  },
};

/** Dial order: drag/spin cycles this list (SomaFM). */
export const SOMA_FM_DIAL_STATIONS = [
  'soma-sf1033',
  'soma-dronezone',
  'soma-deepspace',
  'soma-spacestation',
  'soma-fluid',
  'soma-groovesalad',
  'soma-lush',
];

export const DEFAULT_STATION_ID = 'soma-deepspace';

export function getStation(id) {
  return STATIONS[id] ?? STATIONS[DEFAULT_STATION_ID];
}

/** If `id` is not on the dial, fall back to the first slot. */
export function normalizeDialStationId(id) {
  if (SOMA_FM_DIAL_STATIONS.includes(id)) return id;
  return SOMA_FM_DIAL_STATIONS[0];
}

export function getDialStationIndex(id) {
  const i = SOMA_FM_DIAL_STATIONS.indexOf(id);
  return i >= 0 ? i : 0;
}

export function dialStationAt(offsetIndex) {
  const len = SOMA_FM_DIAL_STATIONS.length;
  const i = ((offsetIndex % len) + len) % len;
  return SOMA_FM_DIAL_STATIONS[i];
}
