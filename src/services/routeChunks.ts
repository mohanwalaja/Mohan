/**
 * ASTRO SIVAM — route-level code splitting registry.
 *
 * WHY THIS EXISTS: the admin portal, customer dashboard and the four report
 * pages pull in the PDF/HTML report builders; statically importing them from
 * App.tsx put ~2 MB of JavaScript into the first-load bundle. Each heavy route
 * is now its own chunk (React.lazy in App.tsx).
 *
 * THE WHITE-SCREEN RULES (a previous split attempt broke production):
 *   1. Never lazy-load the home/shell — if every chunk fetch fails, the site
 *      must still render and navigate.
 *   2. Every lazy route sits behind <Suspense> with a themed fallback.
 *   3. A failed dynamic import means the tab holds an index.html from a
 *      previous deploy: reload ONCE (sessionStorage-guarded) instead of
 *      rendering blank forever.
 *   4. Chunks are prefetched when the browser is idle so navigation feels
 *      exactly as instant as when everything was bundled — but only when the
 *      visitor is not on a metered/2G connection.
 *
 * All chunks are emitted into the existing dist/assets/ folder (default Vite
 * naming) — code splitting must never create new top-level folders in the
 * cPanel deployment (see tests/dist-shape.test.ts).
 */
/** Raw importers — one per heavy route. Rollup emits one chunk per module. */
export const routeChunkImporters: Record<string, () => Promise<unknown>> = {
  admin: () => import('../pages/AdminPortal'),
  dashboard: () => import('../pages/CustomerDashboard'),
  'birth-jathagam': () => import('../pages/BirthJathagamPage'),
  'marriage-compatibility': () => import('../pages/MarriageCompatibilityPage'),
  'baby-naming': () => import('../pages/BabyNamingPage'),
  muhurtham: () => import('../pages/MuhurthamPage'),
};

const CHUNK_RELOAD_KEY = 'astro-chunk-recovered';

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Recovery for failed dynamic imports / preloads: a chunk that 404s almost
 * always means the deployed index.html and assets are out of sync (old tab,
 * new files). Reload once so the browser fetches the fresh shell; the
 * sessionStorage flag stops any reload loop when the chunk is truly gone.
 */
export function recoverFromChunkError(error: unknown): never {
  const session = safeSession();
  if (session && !session.getItem(CHUNK_RELOAD_KEY)) {
    session.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  }
  throw error;
}

/** Called after a route renders successfully so a later failure may recover again. */
export function clearChunkRecoveryFlag(): void {
  safeSession()?.removeItem(CHUNK_RELOAD_KEY);
}

/**
 * Warm a route's chunk ahead of the click. Used by the idle prefetch below and
 * safe to call from hover handlers. Failures are ignored — navigation itself
 * will retry the import.
 */
export function prefetchRoute(route: string): void {
  const load = routeChunkImporters[route];
  if (!load) return;
  void load().catch(() => {});
}

/** True when the visitor is on a metered or very slow connection. */
function shouldSkipPrefetch(): boolean {
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const conn = nav.connection;
    if (!conn) return false;
    return conn.saveData === true || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  } catch {
    return false;
  }
}

/**
 * Prefetch every heavy route chunk once the browser is idle, so clicking a
 * nav link is a render — not a network wait. Skipped on data-saver/2G.
 */
export function prefetchRouteChunksOnIdle(): void {
  if (shouldSkipPrefetch()) return;
  const warm = () => Object.keys(routeChunkImporters).forEach(prefetchRoute);
  try {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => warm(), { timeout: 4000 });
    } else {
      window.setTimeout(warm, 2000);
    }
  } catch {
    // Prefetch is an optimisation only — never let it break the app.
  }
}

/** Register global handlers for Vite's chunk/preload failures. */
export function installChunkErrorRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      event.preventDefault();
    } catch {
      // Older browsers: fall through to the reload path.
    }
    recoverFromChunkError(new Error('vite:preloadError'));
  });
  // Dynamic-import failures (the classic white-screen trigger) share the same
  // recovery: the lazy() factories above route their catch through
  // recoverFromChunkError, this listener covers import() calls elsewhere.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string; message?: string } | undefined;
    const message = String(reason?.message ?? reason ?? '');
    const name = String(reason?.name ?? '');
    if (
      name === 'ChunkLoadError' ||
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
    ) {
      try {
        event.preventDefault(); // no "Uncaught (in promise)" noise while we recover
      } catch {
        // Older browsers: ignore.
      }
      const session = safeSession();
      // Only recover when the one-shot reload budget is unused. If it is
      // already spent the lazy() rejection has reached the ErrorBoundary UI —
      // throwing again here would just add console noise.
      if (!session || !session.getItem(CHUNK_RELOAD_KEY)) {
        recoverFromChunkError(event.reason);
      }
    }
  });
}
