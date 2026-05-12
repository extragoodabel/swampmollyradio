import { Component } from 'react';

/**
 * Catches render errors in the hero fish pipeline. The `fallback`
 * subtree must never re-use the same props that threw — use
 * `EmergencyFishSchool` (literal safe props only) so the boundary
 * cannot recurse into a second failure.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const label = this.props.name ?? 'Scene.ErrorBoundary';
    console.warn(
      `[aquarium] ${label} — subtree error (using fallback if any)`,
      error?.message ?? error,
      info?.componentStack ?? '',
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
