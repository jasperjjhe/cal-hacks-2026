import { Component } from "react";
import type { ReactNode } from "react";
export default class BuyerErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="connection-screen">
        <h1>This workspace could not load</h1>
        <p>
          The request may be unavailable to this buyer session, or the backend
          connection needs to recover.
        </p>
        <a href="/">Return to your workspace</a>
      </div>
    ) : (
      this.props.children
    );
  }
}
