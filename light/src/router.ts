import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing.
 *
 * The Daylight UI is a preview that ships as a folder of static files, so it
 * cannot assume server rewrites: every route lives behind `#/`, which works
 * from a plain folder, a cPanel path, a file:// open or a proxied live preview
 * without a single server rule. The URL is still shareable and back/forward
 * still work, because the browser's own history drives it.
 */
function readHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return raw === '' ? 'home' : raw;
}

export function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState<string>(() => {
    try {
      return readHash();
    } catch {
      return 'home';
    }
  });

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next || 'home';
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
