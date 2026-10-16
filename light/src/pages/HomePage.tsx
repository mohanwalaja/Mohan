import React from 'react';
import {
  ArrowRight,
  HelpCircle,
  ShieldCheck,
  Mail,
  Languages,
  Compass,
  Heart,
  Baby,
  CalendarDays,
  Check
} from 'lucide-react';
import { Accordion, SectionHeading, StarRow } from '../components/ui/primitives';
import { Glyph } from '../components/ui/Glyph';
import {
  FAQ_ITEMS,
  HOME_HERO,
  HOME_SECTIONS,
  HOME_SERVICES,
  HOME_STEPS,
  TESTIMONIALS,
  type PageKey
} from '../appConfig';
import emblemImg from '@shared/assets/astrosivam_logo.png';
import { summarizeRatings, mergeReviews } from '@shared/services/reviews';

const SERVICE_ICONS = { compass: Compass, hearts: Heart, cradle: Baby, calendar: CalendarDays } as const;

const ACCENT_CLASS: Record<string, { icon: string; text: string; card: string }> = {
  brand: { icon: 'border-brand/35 bg-brand-soft text-brand-ink', text: 'text-brand-ink', card: 'c-card' },
  accent: { icon: 'border-accent/30 bg-accent-soft text-accent', text: 'text-accent', card: 'c-card' },
  rose: { icon: 'border-rose/25 bg-rose-soft text-rose', text: 'text-rose', card: 'c-card' },
  leaf: { icon: 'border-leaf/30 bg-leaf-soft text-leaf', text: 'text-leaf', card: 'c-card' }
};

/**
 * Home — the live home page's own sections in the live order: hero, the four
 * services, the four-step workflow, the reviews, the FAQ, and the closing band.
 * Not one sentence is new: every string is read from appConfig, which in turn
 * mirrors HomePage.tsx / LanguageContext.tsx / the shared data modules.
 */
export const HomePage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => {
  const reviews = mergeReviews([], TESTIMONIALS);
  const summary = summarizeRatings(TESTIMONIALS);

  const scrollToServices = () =>
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="pb-6">
      {/* 1. INTRODUCTION */}
      <section className="relative overflow-hidden border-b border-line bg-page-soft">
        <div className="c-glow pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
        <div className="c-shell relative py-14 sm:py-20 lg:py-24">
          <div className="max-w-4xl">
            <p className="c-eyebrow">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/50 bg-white p-0.5">
                <img src={emblemImg} alt="" className="h-full w-full rounded-full object-cover" />
              </span>
              <span>{HOME_HERO.eyebrow}</span>
            </p>

            <h1 className="c-display mt-5 max-w-3xl text-[2.4rem] leading-[1.06] text-ink sm:text-[3.2rem] lg:text-[3.8rem]">
              {HOME_HERO.title}{' '}
              <span className="font-normal italic text-brand-ink">{HOME_HERO.titleItalic}</span>
            </h1>

            <p className="mt-5 max-w-2xl text-[0.98rem] leading-8 text-ink-soft sm:text-[1.05rem]">
              {HOME_HERO.body}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={scrollToServices} className="c-btn c-btn-primary justify-center">
                <span>{HOME_HERO.primaryCta}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('how-it-works')}
                className="c-btn c-btn-outline justify-center"
              >
                <HelpCircle className="h-4 w-4" aria-hidden />
                <span>{HOME_HERO.secondaryCta}</span>
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-line pt-5 text-[0.85rem] text-ink-soft sm:flex-row sm:flex-wrap sm:gap-x-7">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                {HOME_HERO.trust[0]}
              </span>
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                {HOME_HERO.trust[1]}
              </span>
              <span className="flex items-center gap-2">
                <Languages className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                {HOME_HERO.trust[2]}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SERVICES */}
      <section id="services" className="c-shell scroll-mt-24 pt-14 sm:pt-16">
        <SectionHeading
          align="center"
          eyebrow={HOME_SECTIONS.servicesEyebrow}
          title={HOME_SECTIONS.servicesTitle}
          lead={HOME_SECTIONS.servicesLead}
        />

        <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {HOME_SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service.glyph];
            const tone = ACCENT_CLASS[service.accent];
            return (
              <article key={service.service} className={`${tone.card} flex flex-col p-6 sm:p-7`}>
                <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${tone.icon}`}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="c-display mt-5 text-[1.45rem] leading-tight text-ink">{service.title}</h3>
                <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">{service.description}</p>
                <p className={`mt-3 flex items-start gap-2 text-[0.82rem] font-semibold ${tone.text}`}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{service.detail}</span>
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => onNavigate(service.route)}
                    className="c-btn c-btn-primary"
                  >
                    <span>Calculate Preview</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate(service.route)}
                    className="text-[0.82rem] font-semibold text-brand-ink underline-offset-4 hover:underline"
                  >
                    Order Report
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section className="c-shell pt-14 sm:pt-16">
        <SectionHeading
          align="center"
          eyebrow={HOME_SECTIONS.workflowEyebrow}
          title={HOME_SECTIONS.workflowTitle}
          lead={HOME_SECTIONS.workflowLead}
        />
        <ol className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_STEPS.map((step) => (
            <li key={step.number} className="c-card flex flex-col p-5">
              <span className="c-display grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-[0.95rem] font-semibold text-brand-ink">
                {step.number}
              </span>
              <h3 className="mt-4 text-[1rem] font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-[0.85rem] leading-6 text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. REVIEWS */}
      <section className="c-shell pt-14 sm:pt-16">
        <SectionHeading
          eyebrow={HOME_SECTIONS.reviewsEyebrow}
          title={HOME_SECTIONS.reviewsTitle}
          lead={HOME_SECTIONS.reviewsLead}
        />
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
          <StarRow rating={summary?.ratingValue ?? 5} size={18} />
          <span className="text-[0.85rem] font-semibold text-ink">
            {(summary?.ratingValue ?? 5).toFixed(1)} / 5
          </span>
          <span className="text-[0.82rem] text-muted">
            {summary?.reviewCount ?? TESTIMONIALS.length}{' '}
            {(summary?.reviewCount ?? TESTIMONIALS.length) === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {reviews.slice(0, 6).map((review) => (
            <figure key={review.id} className="c-card flex flex-col p-6">
              <div className="flex items-center justify-between gap-3">
                <StarRow rating={review.rating} />
                {review.verifiedPurchase ? (
                  <span className="rounded-full border border-leaf/30 bg-leaf-soft px-2.5 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-leaf">
                    Verified purchase
                  </span>
                ) : null}
              </div>
              <blockquote className="mt-4 flex-1 text-[0.88rem] leading-7 text-ink-soft">
                “{review.body}”
              </blockquote>
              <figcaption className="mt-4 text-[0.78rem] text-muted">
                {review.authorName} · {review.location}
                <span className="mt-0.5 block font-semibold text-brand-ink">{review.serviceLabel}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 5. FAQ */}
      <section className="c-shell pt-14 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading
            eyebrow={HOME_SECTIONS.faqEyebrow}
            title={HOME_SECTIONS.faqTitle}
            lead={HOME_SECTIONS.faqLead}
          />
          <Accordion items={FAQ_ITEMS} />
        </div>
      </section>

      {/* 6. CLOSING BAND */}
      <section className="c-shell pt-14 sm:pt-16">
        <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
          <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <span className="c-display text-brand-tint" aria-hidden="true">
                <Glyph glyph="compass" className="h-9 w-9" />
              </span>
              <h2 className="c-display mt-2 text-[1.6rem] leading-tight text-ink sm:text-[2rem]">
                {HOME_SECTIONS.servicesTitle}
              </h2>
              <p className="mt-3 text-[0.92rem] leading-7 text-ink-soft">{HOME_SECTIONS.servicesLead}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
                <span>{HOME_HERO.primaryCta}</span>
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
};
