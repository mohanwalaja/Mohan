/**
 * ASTRO SIVAM — boot splash hand-off (mobile white-screen fix, 2026-10-14).
 *
 * THE BUG THIS CLOSES: opening the site on a phone showed a white screen for
 * ~2 s. The document was the whole first paint, but its styles lived in
 * /assets/index-*.css (a second, render-blocking request) and every pixel of
 * the app came from the React bundle. Until those arrived, the browser painted
 * its default white canvas — on mobile, one round trip plus a bundle download.
 *
 * THE FIX: index.html now carries an inline "boot-critical" <style> that paints
 * the brand's dark surface and an ASTRO SIVAM splash from the HTML alone, plus
 * the #boot-splash markup itself. This module is the hand-off back to the app:
 * as soon as a route has actually rendered, the splash fades out and is
 * removed from the DOM.
 *
 * WHO CALLS IT (every JS path — a splash that outlives the page it covers is
 * worse than the white screen it replaced):
 *   - src/App.tsx `RouteLoadedMarker`: the route committed, including the
 *     lazy-chunk routes. This is the normal path and the reason the visitor
 *     never sees the Suspense spinner: the splash covers that moment too.
 *   - src/main.tsx: a one-shot timer, for the case where the app is alive but
 *     never reaches a committed route (a render that throws before the
 *     boundary mounts, a chunk the recovery could not rescue).
 *   - src/components/common/ErrorBoundary.tsx: on a render crash, so the
 *     support screen is visible immediately instead of hiding behind it.
 *
 * Prerendered production pages hide the splash using a build-time HTML
 * attribute: they already have real content and must not wait for this code.
 * capturePrerenderedPage below preserves that content during React startup.
 *
 * The splash ITSELF also has two escape hatches that need no JavaScript at
 * all (they live in index.html): <noscript> hides it for browsers without
 * scripting, and an 8 s CSS animation fades it if this module never runs
 * (stale deploy: entry chunk 404, wrong content-encoding, CSP error).
 *
 * Idempotent and null-safe by design: it is called from a StrictMode
 * double-invoked effect, from a timer, and from three different components,
 * and it must not care whether the document it runs in was prerendered at all
 * (a dev-server document, a unit-test stub, a future render mode).
 */
export const BOOT_SPLASH_ID = 'boot-splash';

/** Class that triggers the fade-out (styles in index.html, .boot-splash-hide). */
export const BOOT_SPLASH_HIDE_CLASS = 'boot-splash-hide';

/** Must be >= the fade transition in index.html: removing a mid-fade node
 *  would flash the splash back to full opacity for one frame. */
const REMOVE_AFTER_MS = 400;

let dismissed = false;

/**
 * Fade the boot splash out and remove it. Safe to call at any time, any number
 * of times, and in documents that never had a splash.
 */
export function dismissBootSplash(): void {
  if (dismissed) return;
  dismissed = true;

  if (typeof document === 'undefined') return;
  const splash = document.getElementById(BOOT_SPLASH_ID);
  if (!splash) return;

  splash.classList.add(BOOT_SPLASH_HIDE_CLASS);
  // pointer-events is set by the class as well; this is belt and braces for
  // engines that skip the transition (prefers-reduced-motion, background tab).
  splash.style.pointerEvents = 'none';
  window.setTimeout(() => {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }, REMOVE_AFTER_MS);
}


// createRoot replaces the static DOM. Keep just its public page content as the
// first Suspense fallback so a direct visit never flashes a loading spinner.
// This is build-produced HTML, not an API response or user-provided markup.
let prerenderedPage = '';
export function capturePrerenderedPage(): void {
  if (document.documentElement.hasAttribute('data-prerendered')) {
    prerenderedPage = document.querySelector('#root main')?.innerHTML || '';
  }
}
export function getPrerenderedPage(): string {
  return prerenderedPage;
}
export function clearPrerenderedPage(): void {
  prerenderedPage = '';
}

/**
 * USER-DESIGN GATE (ivory dark-flash fix).
 *
 * THE BUG THIS CLOSES: with “01 · Ivory & Saffron” selected, every customer
 * page painted the dark design for ~2 s before switching to light. Two causes
 * stacked: the prerendered documents are dark (first paint, before any JS),
 * and App.tsx defaulted to `original` until GET /api/services/settings
 * resolved (settings start as null for first-time visitors with no cache).
 *
 * THE FIX (CSP-safe — no inline script; the shipped policy blocks those):
 *   - index.html hides prerendered #root until <html> carries
 *     `data-design-ready`, with the boot splash shown as the loader and a CSS
 *     fallback that reveals anyway after a few seconds;
 *   - main.tsx calls prepareDesignGate() synchronously before createRoot: when
 *     the prerendered dark document is already correct (admin routes, which
 *     always stay dark, or a cached `original` design) the gate opens at once;
 *   - otherwise App.tsx holds customer content until the saved settings
 *     resolve (or its own timeout fires) and then calls markDesignReady().
 *
 * Admin startup is unaffected: admin routes open the gate synchronously and
 * never wait for settings. A slow or failed settings request cannot trap the
 * page: App’s timeout plus the CSS fallback always reveal something.
 */

/** Attribute on <html> that releases prerendered #root (see index.html). */
export const DESIGN_READY_ATTR = 'data-design-ready';

/**
 * Cache key for the public settings. MUST stay identical to
 * SETTINGS_CACHE_KEY in src/context/AuthContext.tsx (pinned by test).
 */
export const DESIGN_SETTINGS_CACHE_KEY = 'astrosivam_settings';

export type CachedUserDesign = 'original' | 'ivory';

/** Synchronously read the last saved design, if any. Null-safe. */
export function getCachedUserDesign(): CachedUserDesign | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(DESIGN_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userDesign?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed.userDesign === 'ivory' ? 'ivory' : 'original';
  } catch {
    return null;
  }
}

/**
 * Whether the current document is the admin route. Mirrors the admin branch
 * of App.tsx getInitialRoute (clean paths, legacy aliases, ?route=).
 */
export function isAdminRouteLocation(
  pathname = '',
  search = '',
): boolean {
  try {
    const params = new URLSearchParams(search || '');
    const queryRoute = params.get('route');
    if (queryRoute === 'admin' || queryRoute === 'admin-portal') return true;
    const rawPath = pathname.toLowerCase().replace(/\/+$/, '');
    const path = rawPath === '' ? '/' : rawPath;
    return (
      path === '/admin' ||
      path === '/admin-portal' ||
      path === '/admin.php' ||
      path.endsWith('/admin') ||
      path.endsWith('/admin-portal')
    );
  } catch {
    return false;
  }
}

/** Release the prerendered document. Idempotent and null-safe. */
export function markDesignReady(): void {
  try {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute(DESIGN_READY_ATTR, 'true');
  } catch {
    // A document without a root cannot be gated; nothing to release.
  }
}

/**
 * Open the gate synchronously when the dark prerender is already correct.
 * Called once from main.tsx before createRoot. Never throws, never waits.
 */
export function prepareDesignGate(): void {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const root = document.documentElement;
    if (!root || root.hasAttribute(DESIGN_READY_ATTR)) return;
    if (isAdminRouteLocation(window.location.pathname, window.location.search)) {
      root.setAttribute(DESIGN_READY_ATTR, 'true');
      return;
    }
    if (getCachedUserDesign() === 'original') {
      root.setAttribute(DESIGN_READY_ATTR, 'true');
    }
    // Cached ivory and first-time visitors (no cache) stay gated: App.tsx
    // releases the gate once the saved design resolves or its timeout fires.
  } catch {
    // Gating must never break boot; the CSS fallback still reveals #root.
  }
}
