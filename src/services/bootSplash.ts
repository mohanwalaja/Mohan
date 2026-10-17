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

/**
 * Pre-paint website design state (Ivory & Saffron dark-flash fix).
 * assets/boot-design.js writes `data-boot-design` on <html> before the body
 * paints; App.tsx keeps it in sync afterwards via applyBootDesign().
 * Values: 'ivory' | 'original' | 'pending' | 'admin'.
 */
export const BOOT_DESIGN_ATTR = 'data-boot-design';

/** The design skin attribute (matches src/user-designs.css selectors). */
export const USER_DESIGN_ATTR = 'data-user-design';

/** Must be >= the fade transition in index.html: removing a mid-fade node
 *  would flash the splash back to full opacity for one frame. */
const REMOVE_AFTER_MS = 400;

let dismissed = false;
let dismissRequested = false;

/** True while the saved design is still unknown (first visit, no cache). */
function bootDesignPending(): boolean {
  try {
    return (
      typeof document !== 'undefined' &&
      !!document.documentElement &&
      typeof document.documentElement.getAttribute === 'function' &&
      document.documentElement.getAttribute(BOOT_DESIGN_ATTR) === 'pending'
    );
  } catch {
    return false;
  }
}

/**
 * Fade the boot splash out and remove it. Safe to call at any time, any number
 * of times, and in documents that never had a splash.
 *
 * While the design hold is pending (no saved design resolved yet) the request
 * is remembered but NOT executed: customer content must not appear in the
 * wrong design. applyBootDesign() replays it the moment the hold ends.
 */
export function dismissBootSplash(): void {
  if (dismissed) return;
  dismissRequested = true;
  if (bootDesignPending()) return;
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

/**
 * Apply the resolved website design to the document and release any design
 * hold (Ivory & Saffron dark-flash fix). Called by App.tsx once the saved
 * settings are known — or have failed (fail open to the default dark design).
 * `admin` routes never receive a user design: the admin screens stay dark.
 */
export function applyBootDesign(
  design: 'ivory' | 'original',
  options?: { admin?: boolean },
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root || typeof root.setAttribute !== 'function') return;

  if (options?.admin) {
    root.removeAttribute(USER_DESIGN_ATTR);
    root.setAttribute(BOOT_DESIGN_ATTR, 'admin');
  } else if (design === 'ivory') {
    root.setAttribute(USER_DESIGN_ATTR, 'ivory');
    root.setAttribute(BOOT_DESIGN_ATTR, 'ivory');
  } else {
    root.removeAttribute(USER_DESIGN_ATTR);
    root.setAttribute(BOOT_DESIGN_ATTR, 'original');
  }

  // The hold just ended (or never applied): run any remembered dismissal now.
  if (dismissRequested && !dismissed) dismissBootSplash();
}

/**
 * Failure fallback for a slow or hung settings request: end the design hold
 * and reveal the default dark design. src/main.tsx arms this a few seconds
 * after boot so the page can never stay hidden behind the splash.
 */
export function forceReleaseBootDesignHold(): void {
  if (bootDesignPending()) applyBootDesign('original');
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
