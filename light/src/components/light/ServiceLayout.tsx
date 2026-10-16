import React from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import type { CatalogEntry } from '../../appConfig';
import { Accordion, SectionHeading, DataTile } from '../ui/primitives';
import { Glyph, glyphToneClass } from '../ui/Glyph';
import type { FaqItem } from '@shared/data/homeFaq';
import { getServicePrices, formatMoney } from '@shared/services/pricing';
import { TESTIMONIALS } from '../../appConfig';
import { StarRow } from '../ui/primitives';

export interface ServiceFact {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'brand' | 'accent' | 'leaf' | 'rose';
}

interface ServiceLayoutProps {
  entry: CatalogEntry;
  /** One-line promise under the title. */
  promise: string;
  /** Longer intro paragraphs. */
  intro: string[];
  facts: ServiceFact[];
  /** Where the free Preview Lab helps with this report. */
  labTab: { label: string; blurb: string };
  faqItems: readonly FaqItem[];
  /** Extra blocks rendered between the fact strip and the FAQ. */
  children?: React.ReactNode;
  onNavigate: (route: string) => void;
}

/**
 * Shared shell for the four report pages.
 *
 * The four products differ in content, not in structure, so they share one
 * layout: a paper hero with the report glyph, the fact strip, the “what is in
 * the PDF” list, whatever the page adds in the middle, then the FAQ and the
 * closing strip. Keeping one file in charge of the rhythm is what makes the
 * light theme feel calm when you travel between the reports.
 */
export const ServiceLayout: React.FC<ServiceLayoutProps> = ({
  entry,
  promise,
  intro,
  facts,
  labTab,
  faqItems,
  children,
  onNavigate
}) => {
  const prices = getServicePrices(null, entry.service);
  const review = TESTIMONIALS.find((item) => item.serviceCode === entry.service);

  return (
    <div className="pb-6">
      <section className="relative">
        <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-96" aria-hidden="true" />
        <div className="c-shell relative pt-10 sm:pt-14">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="c-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                {entry.tagline}
              </p>
              <h1 className="c-display mt-4 text-[2.2rem] leading-[1.08] text-ink sm:text-[2.9rem]">
                {entry.title}
              </h1>
              <p className="mt-2 text-[1rem] font-semibold text-brand-ink">{entry.sanskrit}</p>
              <p className="mt-5 max-w-xl text-[1rem] leading-7 text-ink-soft sm:text-[1.05rem] sm:leading-8">
                {promise}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-primary">
                  <Sparkles className="h-4 w-4" />
                  Try it in the Preview Lab
                </button>
                <button type="button" onClick={() => onNavigate('how-it-works')} className="c-btn c-btn-outline">
                  How ordering works
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-6 text-[0.85rem] text-muted">
                Report price{' '}
                <span className="c-display text-[1.1rem] font-semibold text-ink">
                  {formatMoney(prices.USD, 'USD')}
                </span>{' '}
                <span className="text-faint">· {formatMoney(prices.INR, 'INR')} for orders in India</span>
              </p>
            </div>

            <div className="space-y-4">
              <div className="c-card p-6">
                <div className="flex items-start gap-4">
                  <span
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${glyphToneClass(
                      entry.accent,
                    )}`}
                  >
                    <Glyph glyph={entry.glyph} className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="c-eyebrow">In the PDF</p>
                    <p className="mt-1.5 text-[0.9rem] leading-7 text-muted">{entry.description}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {entry.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[0.86rem] leading-6 text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {facts.map((fact) => (
                  <DataTile key={fact.label} label={fact.label} value={fact.value} hint={fact.hint} tone={fact.tone} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="c-shell mt-14">
        <SectionHeading
          eyebrow="Why this report"
          title={`How the ${entry.title} is prepared`}
          lead="Computed by the engine, then read and reviewed by our India-based priest team before it is sent."
        />
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {intro.map((paragraph, index) => (
            <div key={paragraph.slice(0, 24)} className="c-card p-5">
              <span className="c-display text-[1.4rem] font-semibold text-brand-tint">0{index + 1}</span>
              <p className="mt-2 text-[0.88rem] leading-7 text-muted">{paragraph}</p>
            </div>
          ))}
        </div>
      </section>

      {children}

      <section className="c-shell mt-14">
        <div className="c-card grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="c-eyebrow">Preview it first</p>
            <h2 className="c-display mt-3 text-[1.6rem] leading-tight text-ink sm:text-[1.9rem]">
              {labTab.label}
            </h2>
            <p className="mt-3 text-[0.92rem] leading-7 text-muted">{labTab.blurb}</p>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="c-btn c-btn-primary mt-5"
            >
              Open the Free Preview Lab
            </button>
          </div>
          <ul className="grid gap-3">
            {[
              { icon: ShieldCheck, text: 'Private birth details — never published, never shared' },
              { icon: Clock, text: 'Prepared daily between 9:00 AM and 11:00 AM IST' },
              { icon: Mail, text: 'PDF report and tax invoice emailed to your registered address' },
              { icon: Users, text: 'Order for a partner, child or parent in the same flow' }
            ].map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.text} className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span className="text-[0.85rem] leading-6 text-ink-soft">{row.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {review ? (
        <section className="c-shell mt-14">
          <figure className="c-card mx-auto max-w-3xl p-7">
            <StarRow rating={review.rating} />
            <blockquote className="c-display mt-4 text-[1.15rem] leading-8 text-ink">
              “{review.body}”
            </blockquote>
            <figcaption className="mt-4 text-[0.82rem] text-muted">
              {review.authorName} · {review.location}
            </figcaption>
          </figure>
        </section>
      ) : null}

      <section className="c-shell mt-14">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading eyebrow="Questions" title={`${entry.title} FAQs`} />
          <Accordion items={faqItems} />
        </div>
      </section>

      <section className="c-shell mt-14">
        <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
          <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <h2 className="c-display text-[1.55rem] leading-tight text-ink sm:text-[1.85rem]">
                Ready to order the {entry.title}?
              </h2>
              <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">
                Keep the birth particulars handy — name, date, exact time and place. Two minutes is usually
                enough.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
                <CheckCircle2 className="h-4 w-4" />
                Start the order
              </button>
              <button type="button" onClick={() => onNavigate('contact')} className="c-btn c-btn-outline">
                Ask a question
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
