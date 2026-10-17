/**
 * Google Identity Services (GSI) script loader.
 *
 * WHY THIS EXISTS (first-attempt Google sign-in failure)
 * ------------------------------------------------------
 * The "Continue with Google" button used to inject
 * https://accounts.google.com/gsi/client when it mounted and then *assumed* the
 * SDK was there at click time. A first-time visitor has nothing cached — not
 * the GSI script, not the public settings that carry the Google client id — so
 * the very first click regularly landed before either had arrived and showed
 * "Google Sign-In could not be reached" / "is not configured". "Try Again"
 * worked a moment later, once the script had finished downloading. Nothing
 * tracked whether the script had loaded, failed or was still on its way, and a
 * blocked/failed download was never retried.
 *
 * This module is the single owner of that script:
 *   - one <script> tag no matter how many buttons mount (page + modal);
 *   - an observable status (`idle | loading | ready | failed`) so the button
 *     can stay in a "Preparing…" state instead of failing a click;
 *   - automatic re-injection when the download hard-fails (offline blip,
 *     DNS, HTTP error) — a failed tag is removed so a retry is a *new*
 *     request, not a no-op on a dead element;
 *   - a soft timeout for slow links that keeps the tag alive: a late `load`
 *     still flips the status to `ready` without a duplicate download.
 *
 * Nothing here touches `window`/`document` at import time (the pages are
 * prerendered in Node), and the environment is injectable so the behaviour is
 * unit-tested with a fake DOM (tests/google-login-first-attempt.test.ts).
 */

declare global {
  interface Window {
    google?: any;
  }
}

export const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_GSI_SCRIPT_ID = 'google-gsi-client';

export type GoogleIdentityStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The slice of the browser the loader needs; faked in tests. */
export interface GoogleIdentityEnvironment {
  win(): { google?: any } | undefined;
  doc(): Pick<Document, 'getElementById' | 'createElement' | 'head' | 'body' | 'documentElement'> | undefined;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface GoogleIdentityLoaderOptions {
  /**
   * How long one download may take before the status reports `failed`. The tag
   * is kept, so a slow download that finishes later still wins.
   */
  attemptTimeoutMs?: number;
  /** Delays before each automatic re-injection after a hard failure. */
  retryDelaysMs?: readonly number[];
}

export interface GoogleIdentityLoader {
  getStatus(): GoogleIdentityStatus;
  /** True once `google.accounts.oauth2.initTokenClient` can be called. */
  isReady(): boolean;
  /** Starts loading; idempotent while loading/ready, restarts after a failure. */
  start(): void;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [700, 1800];

export function createGoogleIdentityLoader(
  env: GoogleIdentityEnvironment,
  options: GoogleIdentityLoaderOptions = {}
): GoogleIdentityLoader {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  let status: GoogleIdentityStatus = 'idle';
  let script: HTMLScriptElement | null = null;
  let attempts = 0;
  let attemptTimer: unknown = null;
  let retryTimer: unknown = null;
  const listeners = new Set<() => void>();

  const isReady = () => Boolean(env.win()?.google?.accounts?.oauth2?.initTokenClient);

  const setStatus = (next: GoogleIdentityStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach(listener => listener());
  };

  const clearTimers = () => {
    if (attemptTimer !== null) env.clearTimeout(attemptTimer);
    if (retryTimer !== null) env.clearTimeout(retryTimer);
    attemptTimer = null;
    retryTimer = null;
  };

  const markReady = () => {
    clearTimers();
    setStatus('ready');
  };

  const removeScript = () => {
    try {
      script?.remove();
    } catch {
      // Detached already; nothing to clean.
    }
    script = null;
  };

  /** Slow, not dead: report `failed` but keep the tag so a late load still wins. */
  const armSoftTimeout = () => {
    if (attemptTimer !== null) env.clearTimeout(attemptTimer);
    attemptTimer = env.setTimeout(() => {
      attemptTimer = null;
      if (status === 'loading') setStatus('failed');
    }, attemptTimeoutMs);
  };

  /** The download hard-failed (or ran without defining the SDK): re-inject, then give up. */
  const hardFail = () => {
    removeScript();
    if (attemptTimer !== null) env.clearTimeout(attemptTimer);
    attemptTimer = null;
    const delay = retryDelaysMs[attempts - 1];
    if (delay === undefined) {
      setStatus('failed');
      return;
    }
    setStatus('loading');
    retryTimer = env.setTimeout(() => {
      retryTimer = null;
      inject();
    }, delay);
  };

  const inject = () => {
    const doc = env.doc();
    if (!doc) return;
    // A tag we did not create (stale from an earlier page state) cannot be
    // trusted to ever fire `load`; replace it with a fresh request.
    const stale = doc.getElementById(GOOGLE_GSI_SCRIPT_ID);
    if (stale && stale !== script) stale.remove();

    attempts += 1;
    setStatus('loading');

    const element = doc.createElement('script');
    element.id = GOOGLE_GSI_SCRIPT_ID;
    element.src = GOOGLE_GSI_SRC;
    element.async = true;
    element.defer = true;
    element.addEventListener('load', () => {
      if (element !== script) return;
      if (isReady()) markReady();
      else hardFail();
    });
    element.addEventListener('error', () => {
      if (element !== script) return;
      hardFail();
    });
    script = element;
    (doc.head || doc.body || doc.documentElement).appendChild(element);
    armSoftTimeout();
  };

  const start = () => {
    if (!env.win() || !env.doc()) return; // server render / prerender
    if (isReady()) {
      markReady();
      return;
    }
    if (status === 'loading') return;
    if (status === 'failed' && script) {
      // Timed out while the download was still running: wait for it again
      // instead of starting a second request for the same file.
      setStatus('loading');
      armSoftTimeout();
      return;
    }
    clearTimers();
    attempts = 0;
    inject();
  };

  return {
    getStatus: () => status,
    isReady,
    start,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

/** The app-wide loader, bound to the real browser. */
export const googleIdentity: GoogleIdentityLoader = createGoogleIdentityLoader({
  win: () => (typeof window === 'undefined' ? undefined : window),
  doc: () => (typeof document === 'undefined' ? undefined : document),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: handle => window.clearTimeout(handle as number)
});
