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
 *   4. A route chunk is fetched when the visitor SHOWS INTENT to open it
 *      (hover/focus/touch on its link — see installRouteIntentPrefetch) and
 *      never otherwise, and never on a metered/2G connection.
 *
 * WHY 4 CHANGED (audit PERF-1): the first version of this file warmed all six
 * heavy routes on `requestIdleCallback`. The browser is idle on every page —
 * including the homepage of a visitor who only wants to read the services —
 * so the "code splitting" downloaded the admin portal, the customer dashboard
 * and every report page (which pull in the PDF renderer) within seconds of
 * landing. Idle is not intent: the only signal this app can trust is the
 * visitor reaching for a specific link.
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
  // Every page the homepage links to is lazy too (audit PERF-1): a visitor
  // reading the homepage should not download the policy pages to be able to
  // open them. Keys match the `data-route` attributes on the links.
  services: () => import('../pages/ServicesPage'),
  'how-it-works': () => import('../pages/HowItWorksPage'),
  about: () => import('../pages/AboutPage'),
  team: () => import('../pages/AstrologyTeamPage'),
  contact: () => import('../pages/ContactPage'),
  policies: () => import('../pages/PoliciesPage'),
  'policy-privacy': () => import('../pages/PoliciesPage'),
  'policy-terms': () => import('../pages/PoliciesPage'),
  'policy-payment': () => import('../pages/PoliciesPage'),
  'policy-refund': () => import('../pages/PoliciesPage'),
  login: () => import('../pages/LoginPage'),
  register: () => import('../pages/RegisterPage'),
};

/**
 * Invoke a route loader so a SYNCHRONOUS throw becomes a rejection.
 *
 * Why this exists (the `ReferenceError: __VITE_PRELOAD__ is not defined`
 * incident): Vite compiles `import('./pages/X')` inside a lazy() factory to
 * `__vitePreload(() => import('./pages/X'), <deps>)`. When the deps argument
 * blows up while the factory is being *evaluated*, the throw happens before
 * any promise exists — so `.then(...).catch(recoverFromChunkError)` never runs
 * and the error bypasses the chunk-recovery path straight into the
 * ErrorBoundary. Deferring the loader call behind `Promise.resolve().then(load)`
 * guarantees every failure (sync or async) arrives as a rejection that
 * recoverFromChunkError can handle. The explicit try/catch is belt-and-braces
 * for exotic loaders that throw while merely being readied.
 */
export function safeImport<T>(load: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      Promise.resolve()
        .then(load)
        .then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

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
 * Warm a route's chunk ahead of the click. Used by the intent prefetch below
 * and safe to call from hover handlers. Failures are ignored — navigation
 * itself will retry the import. The loader runs inside
 * `Promise.resolve().then(...)` because a synchronous throw from the import()
 * wrapper (the failure mode that escaped `.catch()` in the __VITE_PRELOAD__
 * incident) would otherwise surface as an uncaught exception instead of a
 * handled rejection.
 */
export function prefetchRoute(route: string): void {
  const load = routeChunkImporters[route];
  if (!load) return;
  void safeImport(load).catch(() => {});
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

/** Routes already warmed this session — intent fires many times per link. */
const preparedRoutes = new Set<string>();

/**
 * Warm ONE route's chunk because the visitor reached for its link. Call from
 * pointerenter/focus handlers; safe to call repeatedly (the chunk import is
 * cached by the browser, the set only avoids re-entering the loader).
 */
export function prefetchRouteOnIntent(route: string): void {
  if (!route || preparedRoutes.has(route)) return;
  if (!(route in routeChunkImporters)) return;
  if (shouldSkipPrefetch()) return;
  preparedRoutes.add(route);
  prefetchRoute(route);
}

/**
 * Fetch a route's code when the visitor shows intent to open it — hovering or
 * focusing a link (and on touchstart, where hover never happens) — instead of
 * on an idle callback that fired for every visitor whether or not they ever
 * meant to leave the homepage (audit PERF-1).
 *
 * The markup side is declarative: any element carrying `data-route="<route>"`
 * (the navbar links, the footer service links) is a trigger. Listeners are
 * attached once, in the capture phase, so they run before React's own handlers
 * and keep working for links rendered later.
 *
 * Returns a cleanup function; callers may ignore it (the app installs this
 * exactly once for the lifetime of the document).
 */
export function installRouteIntentPrefetch(): () => void {
  const INTENT_EVENTS = ['pointerenter', 'focusin', 'touchstart'] as const;

  const handleIntent = (event: Event) => {
    const target = event.target as Element | null;
    if (!target || typeof (target as Element).closest !== 'function') return;
    const trigger = (target as Element).closest('[data-route]');
    const route = trigger?.getAttribute('data-route');
    if (route) prefetchRouteOnIntent(route);
  };

  INTENT_EVENTS.forEach((eventName) => {
    document.addEventListener(eventName, handleIntent, {
      capture: true,
      // Hover/touch are gesture signals only — they must never swallow the
      // click that follows, and they must not be prevented by handlers.
      passive: true,
    });
  });

  return () => {
    INTENT_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, handleIntent, { capture: true });
    });
  };
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
