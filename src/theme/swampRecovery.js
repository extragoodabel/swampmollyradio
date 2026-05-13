/**
 * Swamp Molly — URL-driven progressive restore + layer kills (debug only).
 *
 * - `?aqswamprestore=N` (N∈1…13): cumulative layers; omit = full stack (999).
 * - `?aqswampkill=car1,car2,headlights,haze,...,poem` — force layers off (see KILL_KEYS).
 */

export const SWAMP_RESTORE_FULL = 999;

const KILL_ALIASES = {
  car1: ['car1', 'vintage', 'vintagecar', 'rustycar'],
  poem: ['poem', 'swampmollypoem', 'mollypoem', 'swampmollytext'],
  car2: ['car2', 'fiat', 'panda', 'fiatpanda'],
  headlights: ['headlights', 'headlight', 'beams'],
  vegetation: ['vegetation', 'kelp', 'seaweed', 'moss'],
  haze: ['haze', 'waterhaze'],
  backdrop: ['backdrop', 'background', 'backgroundfield', 'sky'],
  typography: ['typography', 'letters', 'text', 'troika'],
  orb: ['orb', 'beacon', 'radio'],
  seabed: ['seabed', 'seafloor', 'floor'],
  surface: ['surface'],
  lightbeam: ['lightbeam', 'beam', 'shaft', 'shafts'],
  particles: ['particles', 'dust'],
  bubbles: ['bubbles'],
  companions: ['companions', 'companionschools'],
  density: ['density', 'midfield', 'clouds', 'distantfish'],
  extras: ['extras', 'credits', 'coin'],
};

function normalizeKillTokens() {
  /** token -> canonical kill key (or null) */
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(KILL_ALIASES)) {
    for (const a of aliases) {
      map.set(a.toLowerCase().replace(/\s+/g, ''), canonical);
    }
  }
  return map;
}

const KILL_TOKEN_MAP = normalizeKillTokens();

export function getSwampRestoreStep() {
  if (typeof window === 'undefined') return SWAMP_RESTORE_FULL;
  try {
    const raw = new URLSearchParams(window.location.search).get(
      'aqswamprestore',
    );
    if (raw === null || raw === '') return SWAMP_RESTORE_FULL;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return SWAMP_RESTORE_FULL;
    return Math.min(13, n);
  } catch {
    return SWAMP_RESTORE_FULL;
  }
}

/**
 * @returns {Record<string, boolean>} — `true` means **killed** (layer forced off).
 */
export function getSwampKillMap() {
  const out = {};
  for (const k of Object.keys(KILL_ALIASES)) {
    out[k] = false;
  }
  if (typeof window === 'undefined') return out;
  try {
    const raw = new URLSearchParams(window.location.search).get('aqswampkill');
    if (!raw) return out;
    for (const part of raw.split(',').map((s) => s.trim().toLowerCase())) {
      if (!part) continue;
      const key = KILL_TOKEN_MAP.get(part.replace(/\s+/g, ''));
      if (key) out[key] = true;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Resolved visibility / mount flags for Scene.jsx (Swamp only).
 * For non-swamp themeId, returns a neutral object (all `fullStack: true`).
 */
export function buildSwampSceneGates(themeId) {
  const kill = getSwampKillMap();
  const rs = getSwampRestoreStep();
  const active = themeId === 'swamp' && rs < SWAMP_RESTORE_FULL;

  const stepOk = (n) => !active || rs >= n;
  const alive = (key, n) => !kill[key] && stepOk(n);

  if (themeId !== 'swamp') {
    return {
      active: false,
      rs: SWAMP_RESTORE_FULL,
      kill,
      fullStack: true,
      background: true,
      waterHaze: true,
      surface: true,
      seabed: true,
      kelp: true,
      lightBeam: true,
    car1: true,
    poem: true,
    car2: true,
      car1Headlights: true,
      car2Headlights: true,
      typography: true,
      orb: true,
      particles: true,
      companions: true,
      density: true,
      bubbles: true,
      extrasLog: true,
      creditsBag: true,
    };
  }

  return {
    active,
    rs,
    kill,
    fullStack: !active,
    background: alive('backdrop', 1),
    waterHaze: alive('haze', 5),
    surface: alive('surface', 6) && stepOk(6),
    seabed: alive('seabed', 6) && stepOk(6),
    kelp: alive('vegetation', 7) && stepOk(7),
    lightBeam: alive('lightbeam', 8) && stepOk(8),
    car1: alive('car1', 9) && stepOk(9),
    poem: alive('car1', 9) && alive('poem', 9),
    car2: alive('car2', 10) && stepOk(10),
    car1Headlights:
      !kill.headlights && alive('car1', 9) && (!active || rs >= 11),
    /** Fiat Panda cones — same step as vintage car beams; `aqswampkill=headlights` disables both. */
    car2Headlights:
      !kill.headlights && alive('car2', 10) && (!active || rs >= 11),
    typography: alive('typography', 2) && stepOk(2),
    orb: alive('orb', 3) && stepOk(3),
    particles: alive('particles', 4) && stepOk(4),
    bubbles: alive('bubbles', 4) && stepOk(4),
    companions: alive('companions', 12) && stepOk(12),
    density: alive('density', 12) && stepOk(12),
    extrasLog: stepOk(13),
    /** In-world credits plastic bag — same restore step as extras log; `aqswampkill=credits` kills via extras. */
    creditsBag: alive('extras', 13) && stepOk(13),
  };
}
