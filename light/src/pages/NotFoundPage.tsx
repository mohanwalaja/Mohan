import React from 'react';
import { Compass, ArrowRight } from 'lucide-react';
import { NAV_LINKS, type PageKey } from '../appConfig';

/** Not found — same links as the site's navbar, so a stray URL is never a dead end. */
export const NotFoundPage: React.FC<{ route: string; onNavigate: (key: PageKey) => void }> = ({
  route,
  onNavigate
}) => (
  <div className="c-shell py-16">
    <div className="c-card mx-auto max-w-2xl space-y-5 p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-brand/30 bg-brand-soft text-brand-ink">
        <Compass className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="c-display text-[1.8rem] font-bold text-ink">Page not found</h1>
      <p className="text-[0.9rem] leading-7 text-ink-soft">
        No page is published at <span className="font-mono text-ink">#{route}</span> in this preview. Choose one of
        the pages below.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {NAV_LINKS.map((link) => (
          <button
            key={link.key}
            type="button"
            onClick={() => onNavigate(link.key)}
            className="rounded-full border border-line bg-surface-2 px-3.5 py-2 text-[0.8rem] font-semibold text-ink-soft transition hover:border-brand/45 hover:text-brand-ink"
          >
            {link.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onNavigate('services')}
          className="c-btn c-btn-primary"
        >
          <span>Services</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  </div>
);
