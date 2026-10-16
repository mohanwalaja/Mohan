import React from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { CATALOG, DELIVERY_STEPS, FAQ_ITEMS } from '../appConfig';
import { SectionHeading, Accordion } from '../components/ui/primitives';
import { Glyph, glyphToneClass } from '../components/ui/Glyph';
import { getServicePrices, formatMoney } from '@shared/services/pricing';

export const ServicesPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <section className="relative">
      <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
      <div className="c-shell relative pt-10 sm:pt-14">
        <SectionHeading
          eyebrow="All services"
          title="Four reports. One flat price each."
          lead="Every report is prepared once, by our priest team, and emailed as a PDF with a tax invoice. No subscriptions, no credit packs, no repeated purchase to re-read a chart you already own."
        />
      </div>
    </section>

    <section className="c-shell mt-10">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto c-scroll">
          <table className="w-full min-w-[46rem] text-left text-[0.86rem]">
            <thead className="bg-page-soft">
              <tr className="text-[0.68rem] uppercase tracking-[0.12em] text-faint">
                <th className="px-5 py-4 font-bold">Report</th>
                <th className="px-5 py-4 font-bold">Best for</th>
                <th className="px-5 py-4 font-bold">What you receive</th>
                <th className="px-5 py-4 font-bold">Price</th>
                <th className="px-5 py-4 font-bold" />
              </tr>
            </thead>
            <tbody>
              {CATALOG.map((entry) => {
                const prices = getServicePrices(null, entry.service);
                return (
                  <tr key={entry.route} className="border-t border-line align-top">
                    <td className="px-5 py-5">
                      <span className={`inline-grid h-11 w-11 place-items-center rounded-2xl border ${glyphToneClass(entry.accent)}`}>
                        <Glyph glyph={entry.glyph} className="h-6 w-6" />
                      </span>
                      <span className="mt-2 block text-[0.95rem] font-bold text-ink">{entry.title}</span>
                      <span className="text-[0.78rem] text-brand-ink">{entry.sanskrit}</span>
                    </td>
                    <td className="px-5 py-5 text-[0.84rem] leading-6 text-muted">{entry.tagline}</td>
                    <td className="px-5 py-5">
                      <ul className="space-y-1.5">
                        {entry.includes.slice(0, 3).map((item) => (
                          <li key={item} className="flex items-start gap-2 text-[0.82rem] leading-6 text-ink-soft">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-5">
                      <span className="c-display block text-[1.1rem] text-ink">
                        {formatMoney(prices.USD, 'USD')}
                      </span>
                      <span className="text-[0.76rem] text-faint">{formatMoney(prices.INR, 'INR')} in India</span>
                    </td>
                    <td className="px-5 py-5">
                      <button
                        type="button"
                        onClick={() => onNavigate(entry.route)}
                        className="c-btn c-btn-soft !min-h-10 !px-4 !text-[0.8rem]"
                      >
                        Details
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[0.74rem] text-faint">
        Prices are the site’s current list prices. The amount charged in your currency is confirmed during
        checkout.
      </p>
    </section>

    <section className="c-shell mt-16">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <SectionHeading
          eyebrow="Not sure which one?"
          title="Start with the free Preview Lab, then decide"
          lead="The lab runs the same engine the reports use. Look at your own Lagna and dasha lord, or score a pair of charts, and the right report usually becomes obvious."
        />
        <div className="grid gap-3">
          {[
            { label: 'Want to understand yourself?', route: 'jathagam', answer: 'Birth Jathagam' },
            { label: 'Matching two families?', route: 'porutham', answer: 'Marriage Porutham' },
            { label: 'Naming a newborn?', route: 'naming', answer: 'Vedic Baby Naming' },
            { label: 'Choosing a date?', route: 'muhurtham', answer: 'Subha Muhurtham' }
          ].map((row) => (
            <button
              key={row.route}
              type="button"
              onClick={() => onNavigate(row.route)}
              className="c-card-flat c-lift flex items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span>
                <span className="block text-[0.86rem] font-semibold text-muted">{row.label}</span>
                <span className="c-display mt-0.5 block text-[1.05rem] text-ink">{row.answer}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
            </button>
          ))}
          <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-primary mt-2">
            <Sparkles className="h-4 w-4" />
            Open the Free Preview Lab
          </button>
        </div>
      </div>
    </section>

    <section className="c-shell mt-16">
      <SectionHeading eyebrow="Ordering" title="What happens after you order" align="center" />
      <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {DELIVERY_STEPS.map((step) => (
          <li key={step.step} className="c-card p-5">
            <span className="c-display text-[1.6rem] font-semibold text-brand-tint">{step.step}</span>
            <h3 className="c-display mt-2 text-[1.05rem] leading-snug text-ink">{step.title}</h3>
            <p className="mt-2 text-[0.84rem] leading-6 text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="c-shell mt-16">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <SectionHeading eyebrow="Questions" title="Ordering, delivery and payment" />
        <Accordion items={FAQ_ITEMS} />
      </div>
    </section>
  </div>
);
