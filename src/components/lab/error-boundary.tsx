"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  constructor(props: { children: React.ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? " " + this.props.label : ""}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-6">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-mono text-sm font-semibold">
              Render error{this.props.label ? ` in ${this.props.label}` : ""}
            </h3>
          </div>
          <pre className="mt-3 max-h-64 overflow-auto scroll-thin rounded bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-rose-300">
            {this.state.error?.message ?? "unknown error"}
            {this.state.error?.stack ? "\n\n" + this.state.error.stack : ""}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 rounded border border-rose-500/40 px-3 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
