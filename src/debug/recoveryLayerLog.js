/**
 * Consistent console traces for ?aq*restore / ?aq*kill debugging.
 * Always uses console.info so logs appear without DEV-only gates.
 */

export function logRecoveryLayer(themeId, layerId, detail = {}) {
  try {
    console.info(`[aquarium-recovery] ${themeId} · ${layerId}`, detail);
  } catch {
    /* ignore */
  }
}

/** One structured line per theme when gated mode changes (avoids render spam). */
export function logRecoverySnapshot(themeId, snapshot) {
  try {
    console.info(`[aquarium-recovery] ${themeId} snapshot`, snapshot);
  } catch {
    /* ignore */
  }
}
