import React from 'react';
import { ArrowRight, MapPin, ScrollText, ShieldCheck, Languages } from 'lucide-react';
import { ABOUT_PAGE_COPY, type PageKey } from '../appConfig';
import { PageBreadcrumb } from '../components/common/PageBreadcrumb';
import { BrandFullLogo } from '../components/shell/BrandMark';

const PILLAR_ICONS = [ScrollText, ShieldCheck, Languages] as const;

/**
 * About Us — the live About page: the same headline, the same three pillars
 * (Chitra Paksha Lahiri Ephemeris, Absolute Privacy & Dignity, Multilingual PDF
 * Export), the same mission block and the same Chennai location line, with the
 * brand's own full logo.
 */
export const AboutPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <PageBreadcrumb label="About Us" onNavigate={onNavigate} />

    <div className="c-shell mt-6 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
      <div className="c-rise">
        <p className="c-eyebrow">{ABOUT_PAGE_COPY.eyebrow}</p>
        <h1 className="c-display mt-3 max-w-3xl text-[2rem] leading-[1.15] font-bold text-ink sm:text-[2.5rem]">
          {ABOUT_PAGE_COPY.title}
        </h1>
        <p className="mt-5 max-w-2xl text-[0.92rem] leading-8 text-ink-soft">{ABOUT_PAGE_COPY.lead}</p>

        <p className="mt-5 inline-flex items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[0.84rem] font-semibold text-ink-soft">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>{ABOUT_PAGE_COPY.location}</span>
        </p>
      </div>

      <div className="c-card p-6">
        <BrandFullLogo />
      </div>
    </div>

    <section className="c-shell mt-12">
      <div className="grid gap-5 lg:grid-cols-3">
        {ABOUT_PAGE_COPY.pillars.map((pillar, index) => {
          const Icon = PILLAR_ICONS[index] ?? ScrollText;
          return (
            <article key={pillar.title} className="c-card space-y-3 p-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-brand/30 bg-brand-soft text-brand-ink">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="c-display text-[1.15rem] font-bold leading-snug text-ink">{pillar.title}</h2>
              <p className="text-[0.86rem] leading-7 text-ink-soft">{pillar.body}</p>
            </article>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-12">
      <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
        <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative max-w-3xl space-y-3">
          <h2 className="c-display text-[1.5rem] leading-tight font-bold text-ink sm:text-[1.9rem]">
            {ABOUT_PAGE_COPY.missionTitle}
          </h2>
          <p className="text-[0.92rem] leading-8 text-ink-soft">{ABOUT_PAGE_COPY.missionBody}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
              <span>Services</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => onNavigate('contact')} className="c-btn c-btn-outline">
              <span>Contact</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
);
