import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing over the live site's own slugs.
 *
 * The light UI is the same site with a different skin, so every route keeps its
 * real name — `#/birth-jathagam` is the Birth Jathagam page, `#/policy-refund`
 * is the Refund & Cancellation Policy, exactly as the live paths read. The hash
 * only exists because this preview ships as a folder of static files and cannot
 * assume server rewrites: it works from a plain folder, a cPanel path, a file://
 * open or a proxied live preview without a single server rule, and the browser's
 * own history still drives back/forward.
 */
export const HOME_ROUTE = 'home';

function readHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  return raw === '' ? HOME_ROUTE : raw;
}

export function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState<string>(() => {
    try {
      return readHash();
    } catch {
      return HOME_ROUTE;
    }
  });

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next || HOME_ROUTE;
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

/** Anchor to a section on the current page, staying inside the preview. */
export function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}
