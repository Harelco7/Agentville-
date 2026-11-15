import { Component, type ReactNode } from 'react';

/** Shows what went wrong instead of an empty screen when the 3D view fails to start. */
export class ErrorScreen extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen">
        <strong>The town could not load.</strong>
        <p>Your browser may not support WebGL, or a file failed to load. The details below help find the cause.</p>
        <code>{this.state.error}</code>
      </div>
    );
  }
}
