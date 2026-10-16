import React from 'react';
import {
  ArrowRight,
  Baby,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Globe2,
  Heart,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { CATALOGUE, type PageKey } from '../appConfig';
import { getServicePrices } from '@shared/services/pricing';

const ICONS = { compass: Compass, hearts: Heart, cradle: Baby, calendar: CalendarDays } as const;

const FEATURE_TONE: Record<string, string> = {
  brand: 'text-brand',
  accent: 'text-accent',
  rose: 'text-rose',
  leaf: 'text-leaf'
};

const CATEGORY_TONE: Record<string, string> = {
  brand: 'border-brand/35 bg-brand-soft text-brand-ink',
  accent: 'border-accent/30 bg-accent-soft text-accent',
  rose: 'border-rose/25 bg-rose-soft text-rose',
  leaf: 'border-leaf/30 bg-leaf-soft text-leaf'
};

/**
 * Services — the live catalogue page: the same eyebrow, h1, trust line, section
 * heading, the same four listings in the same order with the same categories,
 * descriptions, feature lists, fees and CTAs, and the same closing banner.
 */
export const ServicesPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <div className="c-shell space-y-10 pt-12">
      <header className="mx-auto max-w-2xl space-y-2.5 text-center">
        <p className="c-eyebrow justify-center">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          <span>Vedic astrology services</span>
        </p>
        <h1 className="c-display text-[1.9rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.4rem] lg:text-[2.7rem]">
          Authentic Astrological Services &amp; Precision Reports
        </h1>
        <p className="text-[0.88rem] leading-relaxed text-ink-soft sm:text-[0.95rem]">
          Choose a considered Vedic reading for the moment that matters. Each report is calculated
          with the Chitra Paksha Lahiri ephemeris and reviewed by our dedicated priest and astrologer
          team.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1.5 text-[0.82rem] font-medium text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            Reviewed by our Vedic team
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            Prepared daily 9–11 AM IST &amp; emailed upon admin approval
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            For users worldwide
          </span>
        </div>
      </header>

      <section className="space-y-6" aria-labelledby="services-list-title">
        <div className="flex flex-col gap-2 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="c-eyebrow">Choose your reading</p>
            <h2 id="services-list-title" className="c-display mt-2 text-[1.6rem] font-bold text-ink sm:text-[2rem]">
              A little more clarity, when you need it most.
            </h2>
          </div>
          <p className="max-w-xl text-[0.85rem] leading-relaxed text-muted sm:text-right sm:text-[0.9rem]">
            Compare what each consultation includes, then continue to its secure order page.
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          {CATALOGUE.map((entry) => {
            const Icon = ICONS[entry.glyph];
            const prices = getServicePrices(null, entry.service);
            return (
              <article key={entry.route} className="c-card flex h-full flex-col p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${CATEGORY_TONE[entry.accent]}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span
                    className={`max-w-[75%] rounded-full border px-3 py-1 text-right text-[0.68rem] font-bold leading-snug sm:text-[0.72rem] ${CATEGORY_TONE[entry.accent]}`}
                  >
                    {entry.category}
                  </span>
                </div>

                <h3 className="c-display mt-5 text-[1.35rem] font-bold leading-snug text-ink sm:text-[1.55rem]">
                  {entry.title}
                </h3>
                <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">{entry.description}</p>

                <ul className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-line pt-5 text-[0.82rem] leading-relaxed text-ink-soft sm:grid-cols-2">
                  {entry.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${FEATURE_TONE[entry.accent]}`}
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-6">
                  <div className="rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                          Service fee
                        </div>
                        <div className={`c-display mt-1 text-[1.35rem] font-black ${FEATURE_TONE[entry.accent]}`}>
                          US${prices.USD}{' '}
                          <span className="text-[0.75rem] font-semibold text-muted">USD</span>
                        </div>
                        <div className="mt-1 text-[0.8rem] text-ink-soft">
                          India (GPay/UPI): ₹{prices.INR.toLocaleString('en-IN')} INR
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2 text-[0.8rem] font-semibold text-leaf sm:justify-end">
                        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Report + invoice after review
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(entry.route)}
                      className="c-btn c-btn-primary mt-4 w-full justify-center"
                    >
                      <span>{entry.action}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-5 rounded-[1.75rem] border border-brand/30 bg-brand-soft p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <div className="max-w-2xl space-y-2">
          <p className="c-eyebrow">A guided beginning</p>
          <h2 className="c-display text-[1.35rem] font-bold text-ink sm:text-[1.6rem]">
            See how your consultation comes together.
          </h2>
          <p className="text-[0.85rem] leading-relaxed text-ink-soft sm:text-[0.92rem]">
            Follow the six steps from service selection and secure checkout to traditional review and
            delivery of your report and invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('how-it-works')}
          className="c-btn c-btn-primary shrink-0"
        >
          <span>See how it works</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  </div>
);
