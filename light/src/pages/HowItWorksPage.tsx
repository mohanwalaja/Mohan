import React from 'react';
import { ArrowRight, Check, ShieldCheck, Sparkles, Mail } from 'lucide-react';
import { HOW_IT_WORKS_COPY, HOW_IT_WORKS_STEPS, type PageKey } from '../appConfig';
import { PageBreadcrumb } from '../components/common/PageBreadcrumb';
import { SectionHeading } from '../components/ui/primitives';

/**
 * How It Works — the live page: the same hero ("How ASTRO SIVAM works" /
 * "Your journey, clearly explained."), the same six steps with their taglines,
 * descriptions and feature lists, the same review note and the same closing
 * band.
 */
export const HowItWorksPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <PageBreadcrumb label="How It Works" onNavigate={onNavigate} />

    <section className="relative overflow-hidden border-b border-line bg-page-soft">
      <div className="c-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="c-shell relative py-12 sm:py-16">
        <p className="c-eyebrow">
          <span className="h-px w-6 bg-brand/60" aria-hidden="true" />
          {HOW_IT_WORKS_COPY.heroEyebrow}
        </p>
        <h1 className="c-display mt-4 max-w-3xl text-[2.1rem] leading-[1.1] text-ink sm:text-[2.8rem]">
          {HOW_IT_WORKS_COPY.heroTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-[1rem] leading-8 text-ink-soft">
          {HOW_IT_WORKS_COPY.heroLead}
        </p>
      </div>
    </section>

    <section className="c-shell pt-12">
      <SectionHeading eyebrow={HOW_IT_WORKS_COPY.trustEyebrow} title={HOW_IT_WORKS_COPY.stepsTitle} />

      <ol className="mt-9 space-y-5">
        {HOW_IT_WORKS_STEPS.map((step) => (
          <li key={step.id} className="c-card grid gap-5 p-6 sm:grid-cols-[auto_1fr] sm:p-7">
            <span className="c-display grid h-12 w-12 place-items-center rounded-2xl border border-brand/30 bg-brand-soft text-[1.05rem] font-bold text-brand-ink">
              {String(step.id).padStart(2, '0')}
            </span>
            <div>
              <h3 className="c-display text-[1.25rem] font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-[0.85rem] font-semibold text-brand-ink">{step.tagline}</p>
              <p className="mt-2.5 text-[0.88rem] leading-7 text-ink-soft">{step.description}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {step.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[0.8rem] text-ink-soft"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>

    <section className="c-shell pt-12">
      <div className="c-card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <p className="c-eyebrow">TRADITIONAL REVIEW · CLEAR DELIVERY</p>
          <h2 className="c-display mt-3 text-[1.5rem] leading-tight font-bold text-ink sm:text-[1.8rem]">
            {HOW_IT_WORKS_COPY.trustTitle}
          </h2>
          <p className="mt-3 text-[0.9rem] leading-7 text-ink-soft">{HOW_IT_WORKS_COPY.trustBody}</p>
        </div>
        <ul className="grid gap-3">
          {[
            { Icon: ShieldCheck, text: 'Private birth details' },
            { Icon: Sparkles, text: 'Prepared daily 9–11 AM IST & emailed' },
            { Icon: Mail, text: 'English, Tamil & Hindi' }
          ].map(({ Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span className="text-[0.86rem] leading-6 text-ink-soft">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="c-shell pt-12">
      <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
        <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <p className="c-eyebrow">{HOW_IT_WORKS_COPY.ctaEyebrow}</p>
            <h2 className="c-display mt-3 text-[1.5rem] leading-tight text-ink sm:text-[1.8rem]">
              {HOW_IT_WORKS_COPY.ctaTitle}
            </h2>
            <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">{HOW_IT_WORKS_COPY.ctaBody}</p>
          </div>
          <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary shrink-0">
            <span>View services</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  </div>
);
