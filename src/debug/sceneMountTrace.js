/**
 * Last-known scene subtree phase for crash diagnostics (`window.__AQ_SCENE_MOUNT_PHASE`).
 * Updated from Scene / emergency paths — not a stack, but cheap and survives minified stacks.
 */
export function reportSceneMountPhase(phase) {
  try {
    if (typeof window !== 'undefined') {
      window.__AQ_SCENE_MOUNT_PHASE = String(phase);
    }
  } catch {
    /* ignore */
  }
}
