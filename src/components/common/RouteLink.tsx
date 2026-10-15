import React from 'react';
import { routeHref, shouldRouteInApp } from '../../services/routePaths';

export interface RouteLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** In-app route key, e.g. 'birth-jathagam' or 'policy-privacy'. */
  route: string;
  /** The SPA router. Called for plain left-clicks only. */
  onNavigate: (route: string) => void;
}

/**
 * A crawlable internal link (SEO audit 2026-10-15, finding 1).
 *
 * Renders a real `<a href="/canonical-path">`, so the prerendered HTML carries
 * followable links and the browser's own link behaviour works: middle-click,
 * Ctrl/⌘-click, "Copy link address" and "Open in new tab". A plain left-click
 * is intercepted and handed to the SPA router, keeping the instant in-app
 * transition.
 *
 * `data-route` is kept on purpose: the intent prefetcher in
 * services/routeChunks.ts warms a route's chunk when the visitor hovers,
 * focuses or touches any element carrying it.
 */
export function RouteLink({ route, onNavigate, onClick, children, ...anchorProps }: RouteLinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!shouldRouteInApp(event, anchorProps.target)) return;
    event.preventDefault();
    onNavigate(route);
  };

  return (
    <a {...anchorProps} href={routeHref(route)} data-route={route} onClick={handleClick}>
      {children}
    </a>
  );
}
