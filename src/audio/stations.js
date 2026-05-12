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
  'soma-deepspace': {
    id: 'soma-deepspace',
    name: 'SomaFM · Deep Space One',
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

  // SomaFM's "SF 10-33" channel -- emergency / police scanner audio
  // layered over ambient drones. Used as the diegetic radio for the
  // Swamp Molly Radio theme: the chatter + drone over our murky
  // water reads as a strange humid evening rather than a peaceful aquarium.
  'soma-sf1033': {
    id: 'soma-sf1033',
    name: 'SomaFM · SF 10-33',
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
};

export const DEFAULT_STATION_ID = 'soma-deepspace';

export function getStation(id) {
  return STATIONS[id] ?? STATIONS[DEFAULT_STATION_ID];
}
