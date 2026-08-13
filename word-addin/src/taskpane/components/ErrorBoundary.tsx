import React from "react";

// Catches render-time errors inside a tab so a bad message / stale state
// doesn't unmount the entire task pane and leave the user staring at a
// blank white pane. Each tab in MainLayout is wrapped in its own boundary
// so a crash in (e.g.) ChatPanel still leaves Projects / Workflows usable.

interface Props {
  children: React.ReactNode;
  /** Optional label shown alongside the error message. */
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.label ?? "tab", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full w-full overflow-auto p-4 bg-white">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <div className="font-semibold mb-1">
            {this.props.label ?? "Something went wrong"}
          </div>
          <div className="font-mono text-[11px] whitespace-pre-wrap break-words mb-3">
            {this.state.error.message}
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
