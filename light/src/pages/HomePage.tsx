import React from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Globe2,
  Lock,
  Mail,
  Quote,
  Sparkles,
  Wand2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  CATALOG,
  DELIVERY_STEPS,
  FAQ_ITEMS,
  TESTIMONIALS,
  TRUST_POINTS
} from '../appConfig';
import { SectionHeading, StarRow, Accordion } from '../components/ui/primitives';
import { Glyph, glyphToneClass } from '../components/ui/Glyph';
import { PanchangamCard } from '../components/light/PanchangamCard';
import { PALETTES, useLightUi } from '../lightContext';
import { getServicePrices, formatMoney } from '@shared/services/pricing';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

/** "from" pricing, read from the repository's single pricing source. */
function priceLabel(service: (typeof CATALOG)[number]['service']) {
  const prices = getServicePrices(null, service);
  return {
    usd: formatMoney(prices.USD, 'USD'),
    inr: formatMoney(prices.INR, 'INR')
  };
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { setPalette, palette } = useLightUi();

  return (
    <div className="overflow-x-clip pb-4">
      {/* ───────────────────────────── hero ───────────────────────────── */}
      <section className="relative">
        <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-[42rem]" aria-hidden="true" />
        <div
          className="c-pattern pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.5] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          aria-hidden="true"
        />
        <div className="c-shell relative pt-10 pb-6 sm:pt-16">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start lg:gap-14">
            <div className="c-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-surface/80 px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Daylight edition · new light interface
              </p>

              <h1 className="c-display mt-5 text-[2.35rem] leading-[1.06] text-ink sm:text-[3.1rem] lg:text-[3.6rem]">
                Vedic astrology you can
                <span className="relative ml-2 inline-block">
                  <span className="relative z-10 italic">read in daylight</span>
                  <span
                    className="absolute inset-x-0 bottom-1 z-0 h-3 rounded-full bg-brand-tint/70"
                    aria-hidden="true"
                  />
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-[1rem] leading-7 text-ink-soft sm:text-[1.06rem] sm:leading-8">
                Birth Jathagam, 10-Porutham marriage matching, Vedic baby naming and Subha Muhurtham —
                computed with Chitra Paksha Lahiri precision, read by our India-based priest team, and
                delivered as a PDF in English, Tamil or Hindi.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-primary">
                  <Wand2 className="h-4 w-4" />
                  Open the Free Preview Lab
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('reports')?.scrollIntoView({ behavior: 'smooth' })}
                  className="c-btn c-btn-outline"
                >
                  Explore the four reports
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-[0.86rem] font-semibold text-ink-soft sm:grid-cols-3">
                <li className="flex items-center gap-2">
                  <Lock className="h-4 w-4 shrink-0 text-brand" />
                  Private birth details
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-brand" />
                  Prepared 9–11 AM IST daily
                </li>
                <li className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4 shrink-0 text-brand" />
                  English · தமிழ் · हिन्दी
                </li>
              </ul>
            </div>

            <div className="c-rise space-y-4 lg:pt-2" style={{ animationDelay: '90ms' }}>
              <PanchangamCard />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="c-card-tint p-4">
                  <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-brand-ink">
                    <BadgeCheck className="h-4 w-4" />
                    Priest-reviewed
                  </p>
                  <p className="mt-2 text-[0.82rem] leading-6 text-muted">
                    Every chart is calculated and then reviewed by hand before delivery.
                  </p>
                </div>
                <div className="c-card-tint p-4">
                  <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-accent">
                    <Users className="h-4 w-4" />
                    Family orders
                  </p>
                  <p className="mt-2 text-[0.82rem] leading-6 text-muted">
                    Order for a partner, a child or your parents in the same flow.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── palette showcase ───────────────────── */}
      <section className="c-shell mt-14">
        <div className="c-card relative overflow-hidden p-6 sm:p-8">
          <div className="c-hairline-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="c-eyebrow">
                <span className="h-px w-6 bg-brand/60" aria-hidden="true" />
                Three light moods, one layout
              </p>
              <h2 className="c-display mt-3 text-[1.7rem] leading-tight text-ink sm:text-[2.05rem]">
                Pick the daylight palette that reads best for you
              </h2>
              <p className="mt-3 text-[0.95rem] leading-7 text-muted">
                Long charts deserve a comfortable page. Switch the whole site between a warm ivory, a
                cool monsoon teal and a soft lotus pink — instantly, from anywhere on the site, using the
                dock in the corner.
              </p>
              <p className="mt-4 inline-flex items-center gap-2 text-[0.78rem] font-bold text-brand-ink">
                <Sparkles className="h-4 w-4" />
                Try it from the dock at the bottom-left of this preview
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-3">
              {PALETTES.map((entry) => {
                const active = entry.id === palette;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setPalette(entry.id)}
                      className={`h-full w-full rounded-3xl border p-4 text-left transition-all c-lift ${
                        active ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
                      }`}
                    >
                      <span className="flex items-center gap-1.5" aria-hidden="true">
                        {entry.swatch.map((color) => (
                          <span
                            key={color}
                            className="h-6 w-6 rounded-full border border-black/10"
                            style={{ background: color }}
                          />
                        ))}
                      </span>
                      <span className="mt-3 block text-[0.86rem] font-bold text-ink">{entry.name}</span>
                      <span className="mt-1 block text-[0.74rem] leading-5 text-muted">
                        {entry.tagline}
                      </span>
                      <span
                        className={`mt-3 inline-flex items-center gap-1 text-[0.7rem] font-bold ${
                          active ? 'text-brand-ink' : 'text-faint'
                        }`}
                      >
                        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                        {active ? 'Applied' : 'Apply palette'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── reports ────────────────────────── */}
      <section id="reports" className="c-shell mt-20 scroll-mt-24">
        <SectionHeading
          eyebrow="The four reports"
          title="Choose the report that answers your question"
          lead="Each is a single, personal PDF — no subscription, no upsell, no repeated purchase to see the same chart twice."
          align="center"
        />

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {CATALOG.map((entry, index) => {
            const price = priceLabel(entry.service);
            return (
              <article
                key={entry.route}
                className="c-card c-lift flex flex-col p-6"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${glyphToneClass(
                      entry.accent,
                    )}`}
                  >
                    <Glyph glyph={entry.glyph} className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-faint">
                      {entry.tagline}
                    </p>
                    <h3 className="c-display mt-1 text-[1.4rem] leading-tight text-ink">{entry.title}</h3>
                    <p className="mt-0.5 text-[0.8rem] font-semibold text-brand-ink">{entry.sanskrit}</p>
                  </div>
                </div>

                <p className="mt-4 text-[0.9rem] leading-7 text-muted">{entry.description}</p>

                <ul className="mt-5 space-y-2">
                  {entry.includes.slice(0, 4).map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[0.85rem] leading-6 text-ink-soft">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <p className="text-[0.78rem] text-muted">
                    From{' '}
                    <span className="c-display text-[1.05rem] font-semibold text-ink">{price.usd}</span>{' '}
                    <span className="text-faint">/ {price.inr} in India</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate(entry.route)}
                    className="c-btn c-btn-soft !min-h-10 !px-4 !text-[0.82rem]"
                  >
                    See what is inside
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ─────────────────────────── preview lab ──────────────────────── */}
      <section className="c-shell mt-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface p-7 sm:p-10">
          <div className="c-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="c-eyebrow">
                <span className="h-px w-6 bg-brand/60" aria-hidden="true" />
                Free Preview Lab
              </p>
              <h2 className="c-display mt-3 text-[1.8rem] leading-tight text-ink sm:text-[2.2rem]">
                Run the real astrology engine before you order anything
              </h2>
              <p className="mt-3.5 text-[0.95rem] leading-7 text-muted">
                The lab opens the very same calculation modules the paid reports use — no account, no
                payment, nothing to install. Enter a birth time and watch the Lagna, the nakshatra, the
                dasha lord and the chart appear in front of you.
              </p>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {[
                  'Live panchangam for any of ten cities',
                  'Rasi and Navamsa chart, drawn properly',
                  'Ten-porutham score for two charts',
                  'Muhurtham calendar for your ceremony'
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.85rem] leading-6 text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="c-btn c-btn-primary mt-6"
              >
                <Wand2 className="h-4 w-4" />
                Open the Preview Lab
              </button>
            </div>

            <div className="grid gap-3">
              {[
                { label: 'Panchangam', value: 'Tithi · Nakshatra · Yoga · Karana', tone: 'brand' as const },
                { label: 'Your chart', value: 'Lagna · Rasi · Dasha lord', tone: 'accent' as const },
                { label: 'Matching', value: '10 poruthams scored 0–10', tone: 'rose' as const }
              ].map((row) => (
                <div key={row.label} className="c-card-tint p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-faint">
                    {row.label}
                  </p>
                  <p
                    className={`c-display mt-1.5 text-[1.05rem] ${
                      row.tone === 'brand'
                        ? 'text-brand-ink'
                        : row.tone === 'accent'
                          ? 'text-accent'
                          : 'text-rose'
                    }`}
                  >
                    {row.value}
                  </p>
                </div>
              ))}
              <p className="rounded-2xl border border-dashed border-line-strong px-4 py-3 text-[0.74rem] leading-6 text-faint">
                The lab is part of this new light interface. The full reports — including the priest
                review, the PDF and the invoice — are ordered on the live site.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── how it works ─────────────────────── */}
      <section className="c-shell mt-20">
        <SectionHeading
          eyebrow="How it works"
          title="From your birth particulars to a report in your inbox"
          lead="Four steps, and you can stop and ask us anything at any point."
        />
        <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DELIVERY_STEPS.map((step) => (
            <li key={step.step} className="c-card relative p-5">
              <span className="c-display text-[1.6rem] font-semibold text-brand-tint">{step.step}</span>
              <h3 className="c-display mt-2 text-[1.05rem] leading-snug text-ink">{step.title}</h3>
              <p className="mt-2 text-[0.84rem] leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─────────────────────────────── why ──────────────────────────── */}
      <section className="c-shell mt-20">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeading
            eyebrow="Why families stay"
            title="Traditional calculation, modern delivery"
            lead="The engine is the classical one — Chitra Paksha Lahiri ayanamsa, Drik panchangam, the ten poruthams. Everything around it is built so a family can actually use the report."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="c-card-flat p-5">
                <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
                  <ShieldCheck className="h-4 w-4" />
                  {point.title.split(' ').slice(0, 2).join(' ')}
                </p>
                <h3 className="c-display mt-2 text-[1.02rem] leading-snug text-ink">{point.title}</h3>
                <p className="mt-2 text-[0.84rem] leading-6 text-muted">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── testimonials ─────────────────────── */}
      <section className="c-shell mt-20">
        <SectionHeading
          eyebrow="What families say"
          title="Prepared carefully, explained clearly"
          align="center"
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.slice(0, 3).map((review) => (
            <figure key={review.id} className="c-card flex h-full flex-col p-6">
              <Quote className="h-6 w-6 text-brand-tint" />
              <blockquote className="mt-3 flex-1 text-[0.9rem] leading-7 text-ink-soft">
                “{review.body}”
              </blockquote>
              <figcaption className="mt-5 border-t border-line pt-4">
                <StarRow rating={review.rating} />
                <p className="mt-2 text-[0.86rem] font-bold text-ink">{review.authorName}</p>
                <p className="text-[0.76rem] text-muted">
                  {review.location} · {review.serviceLabel ?? review.serviceCode}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────── faq ──────────────────────────── */}
      <section className="c-shell mt-20">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading
            eyebrow="Questions"
            title="Before you order"
            lead="The same answers the live site gives — ordering, delivery, calculation and payment."
          />
          <Accordion items={FAQ_ITEMS} />
        </div>
      </section>

      {/* ─────────────────────────────── cta ──────────────────────────── */}
      <section className="c-shell mt-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-10 sm:px-10">
          <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <p className="c-eyebrow">Ready when you are</p>
              <h2 className="c-display mt-3 text-[1.7rem] leading-tight text-ink sm:text-[2.05rem]">
                Order a report, or simply ask us a question first
              </h2>
              <p className="mt-3 text-[0.92rem] leading-7 text-ink-soft">
                Tell us the person, the date, the time and the place — our priest team takes it from
                there. Reports are prepared every morning between 9:00 AM and 11:00 AM IST.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
                <CalendarDays className="h-4 w-4" />
                Start an order
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
