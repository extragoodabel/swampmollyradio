import { Component } from 'react';
import { AQ_DEBUG, AQ_THEME_DEBUG } from '../debug/aquariumRecovery.js';

/**
 * Catches render/lifecycle errors inside the R3F Canvas tree. On failure,
 * delegates to `onRecover` so the shell can remount the scene subtree. The
 * active theme is never changed automatically — see the crash overlay after
 * repeated failure.
 */
export default class ThemeSceneErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(
      '[aquarium] ThemeSceneErrorBoundary — selected theme is NOT changed; invoking onRecover',
      error,
      info?.componentStack,
    );
    if (AQ_THEME_DEBUG || AQ_DEBUG) {
      console.warn('[aquarium] ThemeSceneErrorBoundary caught (detail)', {
        message: error?.message,
        stack: error?.stack,
        componentStack: info?.componentStack,
      });
    }
    this.props.onRecover?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
