import React, { Component, ReactNode } from 'react';
import { dismissBootSplash } from '../../services/bootSplash';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Catches React render crashes and displays the error on screen instead of
 * leaving the user with a blank page. This is especially helpful on shared
 * hosting where opening the browser console may be difficult.
 */
export class ErrorBoundary extends Component<Props, State> {
  // NOTE: @types/react is not installed in this project, so the members
  // inherited from Component are untyped. Without these declarations the
  // compiler cannot resolve `this.state` / `this.props` (TS2339). They add
  // no runtime behaviour - the constructor below still initialises state.
  declare state: State;
  declare props: Props;
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ASTRO SIVAM Render Error:', error, errorInfo);
    // Hand the screen over to this screen: the boot splash (index.html) sits
    // ABOVE the app, so without this the support text would stay hidden for
    // as long as the splash's own CSS escape hatch allows (2026-10-14 mobile
    // white-screen fix — see src/services/bootSplash.ts).
    dismissBootSplash();
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center">
          <div className="max-w-2xl w-full bg-red-900/30 border border-red-500/40 rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-bold text-red-200">
              {this.props.title || 'ASTRO SIVAM application error'}
            </h1>
            <p className="text-sm text-red-100/80">
              Please screenshot this page and share it with support. The error details below will help fix it quickly.
            </p>
            <pre className="bg-black/50 rounded-lg p-4 text-xs text-red-100 overflow-auto whitespace-pre-wrap break-words">
              {this.state.error?.toString() || 'Unknown error'}
              {'\n\nStack:\n'}
              {this.state.error?.stack || 'No stack trace available'}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
