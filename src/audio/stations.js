/**
 * Ambient radio station catalog.
 *
 * Each station is a plain JSON object so swapping the source (or adding
 * a station picker UI later) is a one-line config change. The order is
 * the play order; the first entry is the default.
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
export const STATIONS = [
  {
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
    // Direct streams don't ship CORS headers reliably -- we attempt
    // crossOrigin='anonymous' first (so Web Audio's filter graph can
    // tap the source), and fall back to plain playback if that fails.
    supportsCors: 'maybe',
  },
];

export const DEFAULT_STATION = STATIONS[0];
