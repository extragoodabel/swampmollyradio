/**
 * When a poem line plane wins the raycast but the pick is visually on the rusty car,
 * {@link fireRustyCarClickFromDelegate} runs the same pulse + hackles path as the car hitbox.
 */
export const rustyCarInteractRef = {
  /** @type {null | (() => void)} */
  pulse: null,
  /** @type {null | (() => void)} */
  toggleHackles: null,
};

export function fireRustyCarClickFromDelegate() {
  rustyCarInteractRef.pulse?.();
  rustyCarInteractRef.toggleHackles?.();
}
