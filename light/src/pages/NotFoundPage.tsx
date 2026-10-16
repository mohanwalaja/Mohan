import React from 'react';
import { Compass, Home, Sparkles } from 'lucide-react';
import { ALL_ROUTES } from '../appConfig';

export const NotFoundPage: React.FC<{ route: string; onNavigate: (route: string) => void }> = ({
  route,
  onNavigate
}) => (
  <div className="pb-6">
    <section className="relative">
      <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
      <div className="c-shell relative pt-16 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-line bg-surface text-brand">
          <Compass className="h-8 w-8" />
        </span>
        <h1 className="c-display mt-6 text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
          That page is not in this preview
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-7 text-muted">
          <code className="rounded-md bg-page-soft px-1.5 py-0.5 text-[0.85rem] text-ink-soft">
            #/{route}
          </code>{' '}
          does not match any page of the daylight interface. Pick a destination below — or open the Free
          Preview Lab and do something more interesting.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => onNavigate('home')} className="c-btn c-btn-primary">
            <Home className="h-4 w-4" />
            Back to the home page
          </button>
          <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-outline">
            <Sparkles className="h-4 w-4" />
            Open the Preview Lab
          </button>
        </div>

        <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2.5">
          {ALL_ROUTES.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => onNavigate(entry.key)}
                className="c-pill !px-3.5 !py-2 !text-[0.78rem] transition-colors hover:border-brand hover:text-brand-ink"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  </div>
);
