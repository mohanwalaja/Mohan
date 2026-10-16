import { useCallback, useEffect, useState } from 'react';
import { routeHref } from '@shared/services/routePaths';
import { isDocumentMode } from './documentMode';
import { PAGE_TITLES, type PageKey } from './appConfig';

/**
 * Routing for the light design.
 *
 * TWO MODES, ONE ROUTE MODEL
 * --------------------------
 * The light interface keeps the live site's own slugs (`/birth-jathagam`,
 * `/privacy-policy`, …) — they are the same pages, so they get the same URLs.
 * How a route is resolved depends on which build the visitor is looking at:
 *
 *  · DOCUMENT mode — the deployed light documents (scripts/prerender-light.mjs
 *    writes pages/<route>-light.html and public/.htaccess serves them at the
 *    canonical clean URL while the operator has the light design selected).
 *    Those documents carry `data-prerendered="true"`, exactly like the classic
 *    ones, and every navigation is a REAL document load of the next canonical
 *    URL — the same URL the classic design serves. That is deliberate: each
 *    light page is a fully prerendered static document with its own <title>,
 *    meta description, canonical and JSON-LD, so following a link must fetch
 *    the next document rather than leave the previous page's head tags (and
 *    canonical) in place. Static-first, and the head is never stale.
 *
 *  · HASH mode — the standalone preview build (`npm run dev:light`, a folder of
 *    static files with no server rewrites, which is what the live preview in
 *    the Arena chat serves). Route = `#/slug`, so back/forward and deep links
 *    work without a single server rule.
 *
 * `readInitialRoute` prefers the pathname in document mode and the hash
 * everywhere else, so a deep link into either build opens the right page.
 */
export const HOME_ROUTE = 'home';

/** Every route the light design serves, in the site's own order. */
export const LIGHT_ROUTE_KEYS = Object.keys(PAGE_TITLES) as PageKey[];

/** The canonical clean URL for a light route key ('/privacy-policy', '/team', '/'). */
export function lightRouteHref(route: string): string {
  return routeHref(route || HOME_ROUTE);
}

/** The route key a canonical clean URL (or a `-light.html` path) belongs to. */
export function routeKeyForPath(pathname: string): string | null {
  const clean = String(pathname || '/').split('?')[0].split('#')[0];
  const trimmed = clean.replace(/\/+$/, '') || '/';
  const file = (trimmed.split('/').pop() || '').toLowerCase();

  // A document opened by its physical path: /pages/services-light.html
  if (/\.html?$/.test(file)) {
    const base = file.replace(/-light\.html$/i, '').replace(/\.html?$/i, '');
    const key = base === '' || base === 'index' ? HOME_ROUTE : base;
    return LIGHT_ROUTE_KEYS.includes(key as PageKey) ? key : null;
  }

  for (const key of LIGHT_ROUTE_KEYS) {
    if (lightRouteHref(key) === trimmed) return key;
  }
  return null;
}

// Re-exported so callers can keep importing it from the router; the
// definition lives in ./documentMode so appConfig can use it without a cycle.
export { isDocumentMode } from './documentMode';

function readHash(): string {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
    return raw === '' ? HOME_ROUTE : raw;
  } catch {
    return HOME_ROUTE;
  }
}

/**
 * The route the current document is showing. Exported because the prerender
 * renders a light page per route through this same resolution path — there is
 * one definition of "which page is /team", and the static documents and the
 * browser both go through it.
 */
export function readInitialRoute(): string {
  try {
    if (isDocumentMode()) {
      const fromPath = routeKeyForPath(window.location.pathname);
      if (fromPath) return fromPath;
    }
  } catch {
    /* fall through to the hash */
  }
  return readHash();
}

export function useLightRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState<string>(() => readInitialRoute());

  useEffect(() => {
    // Only the hash preview navigates without a document load, so it is the
    // only mode that needs a client-side listener (back/forward are browser
    // document navigations in document mode).
    if (isDocumentMode()) return;
    const onHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next || HOME_ROUTE;

    if (isDocumentMode()) {
      const path = lightRouteHref(target);
      if ((window.location.pathname.replace(/\/+$/, '') || '/') === path.replace(/\/+$/, '')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // Load the next light document at the SAME canonical URL the classic
      // design uses for that page (see the mode note at the top of the file).
      window.location.assign(path);
      return;
    }

    if (readHash() === target) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.location.hash = `#/${target}`;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  return [route, navigate];
}

/** The route a link's own href points at, for click interception. */
export function routeForHref(href: string): string | null {
  try {
    return routeKeyForPath(new URL(href, window.location.origin).pathname);
  } catch {
    return null;
  }
}

/** Anchor to a section on the current page, staying inside the design. */
export function scrollToSection(id: string): boolean {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}
