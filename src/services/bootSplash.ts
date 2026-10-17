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
 * Prerendered production pages ship the light default. Customer pages keep the
 * splash until a valid cached admin-selected design or the public settings
 * response is available; the bounded failure path prevents an endless wait.
 * Admin routes remain dark and release immediately. capturePrerenderedPage
 * below preserves the static content as a Suspense fallback during startup.
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
