import { Component } from 'react';

/**
 * Minimal error boundary used to fall back to the procedural fish
 * texture if the SVG asset fails to load (404, parse error, etc).
 *
 * Suspense handles the "still loading" state; this handles the
 * "load failed" state, which Suspense alone cannot.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.warn('[aquarium] texture load failed, falling back', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
