/**
 * Shared "current field" sampled by every fish each frame.
 *
 * Because every fish reads the same scalar field, neighbours pick up
 * almost identical Y offsets and small X pushes -- which is what makes
 * the school feel like it's being carried by an invisible current rather
 * than 90 sprites doing their own thing.
 *
 * The math is intentionally cheap: a few summed sines per axis. No noise
 * libraries, no shaders. If we ever want richer turbulence later we can
 * swap these out for simplex / curl noise without touching the call sites.
 */

const TWO_PI = Math.PI * 2;

/** Wave-like vertical undulation that travels along X. */
export function sampleCurrentY(x, y, z, t) {
  return (
    Math.sin(x * 0.16 + t * 0.35) * 0.55 +
    Math.cos(z * 0.22 + t * 0.18) * 0.22 +
    Math.sin(x * 0.06 - y * 0.18 + t * 0.22) * 0.14
  );
}

/** Gentle pulsing horizontal push, layered on top of each fish's own swim. */
export function sampleCurrentX(x, y, z, t) {
  return (
    Math.sin(y * 0.22 + t * 0.18) * 0.10 +
    Math.cos(z * 0.10 + t * 0.12) * 0.06
  );
}

/** Subtle depth breathing so the school is never perfectly planar. */
export function sampleCurrentZ(x, y, z, t) {
  return (
    Math.sin(t * 0.18 + x * 0.08) * 0.06 +
    Math.cos(t * 0.11 + y * 0.12) * 0.04
  );
}

/** Convenience: stable per-fish phase from any seed scalar in [0, 1). */
export function phaseFromSeed(seed) {
  return (seed * TWO_PI) % TWO_PI;
}
