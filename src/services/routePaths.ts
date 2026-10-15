/**
 * Route key -> canonical, crawlable URL (SEO audit 2026-10-15, finding 1).
 *
 * WHY THIS EXISTS
 *   Every internal link used to be a `<button data-route="…">` whose click
 *   handler called the SPA router. The prerendered homepage therefore shipped
 *   exactly two anchors (Facebook and a mailto:), so crawlers could not follow
 *   a single internal link, and visitors could not middle-click, copy the
 *   address of, or open any page in a new tab.
 *
 *   Links are now real `<a href>` elements (see components/common/RouteLink).
 *   The href must be the page's CANONICAL clean URL — the exact path
 *   scripts/prerender.mjs writes a document for and public/sitemap.xml lists —
 *   never an alias that only exists to 301 (e.g. /policy-privacy). The router
 *   uses the same map when it pushes history entries, so the address bar after
 *   an in-app transition is the URL that is indexed and shareable.
 *
 * Route keys that are not listed map to `/<key>` (e.g. 'birth-jathagam' ->
 * '/birth-jathagam'). tests/crawlable-links.test.ts pins every key against the
 * prerender route table so a link can never point at a URL with no document.
 */
export const ROUTE_CANONICAL_PATHS: Readonly<Record<string, string>> = Object.freeze({
  home: '/',
  'policy-privacy': '/privacy-policy',
  'policy-terms': '/terms',
  'policy-payment': '/payment-policy',
  'policy-refund': '/refund-policy',
  'admin-portal': '/admin',
});

/** The canonical path for an in-app route key ('home' -> '/', 'policy-terms' -> '/terms'). */
export function routeHref(route: string): string {
  const key = String(route ?? '').trim().toLowerCase();
  if (!key) return '/';
  return ROUTE_CANONICAL_PATHS[key] ?? `/${key}`;
}

/** The fields of a click event that decide who handles it. */
export interface LinkClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * True only for a plain primary-button click on a same-tab link — the one case
 * the SPA router should take over (preventDefault + in-app transition).
 *
 * Everything else is left to the browser, which is the point of using real
 * links: Ctrl/⌘-click and middle-click open a new tab, Shift-click a new
 * window, Alt-click downloads, and a `target` other than _self is honoured.
 */
export function shouldRouteInApp(event: LinkClickLike, target?: string | null): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (target && target.toLowerCase() !== '_self') return false;
  return true;
}
