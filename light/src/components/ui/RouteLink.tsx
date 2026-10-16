import React from 'react';
import { shouldRouteInApp } from '@shared/services/routePaths';
import { lightRouteHref } from '../../router';
import type { PageKey } from '../../appConfig';

interface RouteLinkProps {
  /** The route key this link opens ('services', 'policy-refund', …). */
  route: PageKey | string;
  onNavigate: (key: PageKey) => void;
  className?: string;
  children: React.ReactNode;
  title?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  /** Runs before the in-app transition — closes an open menu, for example. */
  onBeforeNavigate?: () => void;
}

/**
 * A light-design internal link that is a REAL anchor.
 *
 * The classic site converted every internal `<button data-route>` into an
 * `<a href>` (SEO audit 2026-10-15, finding 1) so crawlers could follow the
 * navigation and visitors could middle-click, copy the address of, or open a
 * page in a new tab. The light design ships the same contract: the href is the
 * page's CANONICAL clean URL — identical under both designs, because the two
 * designs are the same site — and only a plain primary-button click is taken
 * over by the router (`shouldRouteInApp`, shared with the classic UI), so
 * Ctrl/⌘-click, middle-click and `target` keep working as the browser intends.
 */
export const RouteLink: React.FC<RouteLinkProps> = ({
  route,
  onNavigate,
  className,
  children,
  title,
  ariaLabel,
  ariaExpanded,
  onBeforeNavigate,
}) => {
  const href = lightRouteHref(route);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!shouldRouteInApp(event, event.currentTarget.getAttribute('target'))) return;
    event.preventDefault();
    onBeforeNavigate?.();
    onNavigate(route as PageKey);
  };

  return (
    <a
      href={href}
      data-route={route}
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </a>
  );
};
