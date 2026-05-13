/** Lightweight bridge: Canvas (CameraRig) → DOM overlay without context refactors. */

let awayListener = /** @type {((away: boolean) => void) | null} */ (null);
let resetImpl = /** @type {(() => void) | null} */ (null);

export function subscribeCameraAway(listener) {
  awayListener = listener;
  return () => {
    awayListener = null;
  };
}

export function emitCameraAway(away) {
  awayListener?.(away);
}

export function registerCameraReset(impl) {
  resetImpl = impl;
  return () => {
    resetImpl = null;
  };
}

export function requestCameraReset() {
  resetImpl?.();
}
