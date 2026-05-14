/**
 * Swamp Molly poem recovery — bypass legacy glyph/line renderer when true.
 * Set to `false` only for emergency rollback to `SwampMollyPoem`.
 */
export const USE_SWAMP_POEM_REBUILD = true;

/**
 * When true: only static canvas planes (no trigger volume or dissipation).
 * False: swim-through AABB triggers letter dissipation only (no pointer/click path).
 */
export const SWAMP_POEM_REBUILD_STATIC_ONLY = false;
