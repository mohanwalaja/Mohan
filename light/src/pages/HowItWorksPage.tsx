import React from 'react';
import {
  Calculator,
  CheckCircle2,
  Clock,
  FileText,
  Languages,
  Lock,
  Mail,
  ScrollText,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { DELIVERY_STEPS, FAQ_ITEMS } from '../appConfig';
import { SectionHeading, Accordion } from '../components/ui/primitives';

const REQUIREMENTS = [
  { label: 'Name', detail: 'The name the report should address — the person’s own name, not a nickname.' },
  { label: 'Date of birth', detail: 'Day, month and year, exactly as recorded.' },
  { label: 'Time of birth', detail: 'As exact as the family record allows. The birth time decides the Lagna and the bhavas.' },
  { label: 'Birth place', detail: 'City or town, so coordinates and the historical time-zone offset can be resolved.' },
  { label: 'Second person (matching)', detail: 'Marriage Porutham needs the same four details for both people.' },
  { label: 'Language', detail: 'English, Tamil or Hindi — chosen when the order is placed.' }
];

const QUALITY_POINTS = [
  {
    icon: Calculator,
    title: 'A real ephemeris, not an approximation',
    body: 'Planetary longitudes come from the same astronomical routines the reports have always used, with the Lahiri ayanamsa applied to the sidereal zodiac. The preview you see in the lab is the calculation the report is built from.'
  },
  {
    icon: UserCheck,
    title: 'A priest reads it before you do',
    body: 'Automation produces the tables. The interpretation, the dosha wording and the remedies are written and reviewed by our India-based priest team, then approved by an administrator before the PDF is generated.'
  },
  {
    icon: ScrollText,
    title: 'One PDF, complete',
    body: 'Charts, tables, commentary, remedies and the tax invoice arrive together. Nothing is unlocked later, and no page asks you to pay again.'
  },
  {
    icon: Lock,
    title: 'Your birth details stay private',
    body: 'Birth particulars are used to prepare your report and are not published anywhere on the site. Reviews are shown under a shortened display name.'
  }
];

export const HowItWorksPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <section className="relative">
      <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
      <div className="c-shell relative pt-10 sm:pt-14">
        <SectionHeading
          eyebrow="How it works"
          title="From four birth particulars to a report in your inbox"
          lead="Nothing about this needs to be mysterious. Here is exactly what you provide, what we do with it, and when the PDF arrives."
        />
      </div>
    </section>

    <section className="c-shell mt-10">
      <ol className="relative space-y-4 border-l border-line pl-6 sm:pl-8">
        {DELIVERY_STEPS.map((step) => (
          <li key={step.step} className="relative">
            <span className="absolute -left-[2.05rem] top-4 grid h-8 w-8 place-items-center rounded-full border border-brand/40 bg-brand-soft text-[0.7rem] font-bold text-brand-ink sm:-left-[2.55rem]">
              {step.step}
            </span>
            <div className="c-card p-5 sm:p-6">
              <h2 className="c-display text-[1.15rem] leading-snug text-ink">{step.title}</h2>
              <p className="mt-2 text-[0.9rem] leading-7 text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>

    <section className="c-shell mt-16">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <SectionHeading
          eyebrow="Before you start"
          title="Keep these details ready"
          lead="Most orders take two minutes. The only detail people have to go looking for is the exact time of birth."
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {REQUIREMENTS.map((row) => (
            <li key={row.label} className="c-card-flat p-4">
              <p className="text-[0.76rem] font-bold uppercase tracking-[0.12em] text-brand-ink">
                {row.label}
              </p>
              <p className="mt-1.5 text-[0.84rem] leading-6 text-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="c-shell mt-14">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Clock, label: 'Preparation window', value: 'Daily 9:00–11:00 AM IST' },
          { icon: Mail, label: 'Delivery', value: 'PDF + tax invoice by email' },
          { icon: Languages, label: 'Report languages', value: 'English · தமிழ் · हिन्दी' }
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="c-card flex items-center gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand/30 bg-brand-soft text-brand-ink">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-[0.72rem] font-bold uppercase tracking-[0.12em] text-faint">
                  {tile.label}
                </span>
                <span className="c-display mt-0.5 block text-[1rem] text-ink">{tile.value}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-16">
      <SectionHeading
        eyebrow="Why you can trust the numbers"
        title="Four commitments behind every report"
        align="center"
      />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {QUALITY_POINTS.map((point) => {
          const Icon = point.icon;
          return (
            <div key={point.title} className="c-card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="c-display mt-4 text-[1.1rem] leading-snug text-ink">{point.title}</h3>
              <p className="mt-2 text-[0.87rem] leading-7 text-muted">{point.body}</p>
            </div>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-14">
      <div className="c-card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <p className="c-eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Before you pay
          </p>
          <h2 className="c-display mt-3 text-[1.6rem] leading-tight text-ink sm:text-[1.9rem]">
            Try the engine yourself first
          </h2>
          <p className="mt-3 text-[0.92rem] leading-7 text-muted">
            The Preview Lab runs the same calculations in your browser with no account. If a chart looks
            wrong in the lab, it is worth checking the birth time before ordering.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-primary">
              <Sparkles className="h-4 w-4" />
              Open the Preview Lab
            </button>
            <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-outline">
              <FileText className="h-4 w-4" />
              See the four reports
            </button>
          </div>
        </div>
        <ul className="space-y-3">
          {[
            'No account needed for the lab',
            'No payment to look at your Lagna or dasha',
            'Nothing you type in the lab is stored',
            'The paid report adds priest review, full pages and the invoice'
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[0.86rem] leading-6 text-ink-soft">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="c-shell mt-16">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <SectionHeading eyebrow="Questions" title="Details people ask about" />
        <Accordion items={FAQ_ITEMS} />
      </div>
    </section>
  </div>
);
