/**
 * Swamp Molly poem recovery — bypass legacy glyph/line renderer when true.
 * Set to `false` only for emergency rollback to `SwampMollyPoem`.
 */
export const USE_SWAMP_POEM_REBUILD = true;

/**
 * When true: only static canvas planes (no trigger volume or dissipation).
 * Visual float / shimmer / column idle motion still run; dissipation and swim-through stay disabled.
 */
export const SWAMP_POEM_REBUILD_STATIC_ONLY = false;
