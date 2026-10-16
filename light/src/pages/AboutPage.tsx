import React from 'react';
import { BookOpen, Compass, Eye, Layers, ShieldCheck, Sun } from 'lucide-react';
import { BUSINESS, CATALOG } from '../appConfig';
import { SectionHeading } from '../components/ui/primitives';
import { Glyph, glyphToneClass } from '../components/ui/Glyph';

const PRINCIPLES = [
  {
    icon: BookOpen,
    title: 'The classical method, kept intact',
    body: 'Sidereal zodiac, Chitra Paksha Lahiri ayanamsa, Drik panchangam, the ten poruthams, the Vimshottari dasha. Where a shortcut would change a traditional finding, the traditional finding wins.'
  },
  {
    icon: Eye,
    title: 'Written for the family reading it',
    body: 'A report is read at a kitchen table, often by people who did not order it. Every finding is written in plain language, with the reasoning printed beside the score.'
  },
  {
    icon: Sun,
    title: 'Light on the eyes',
    body: 'Astrology involves long tables and dense pages. This new design uses paper-ivory surfaces, generous spacing and three daytime palettes so reading a chart is comfortable rather than a strain.'
  },
  {
    icon: ShieldCheck,
    title: 'Private by default',
    body: 'Birth particulars are used to prepare your report. They are not published, not sold, and reviews appear only under the display name their author chose.'
  }
];

export const AboutPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <section className="relative">
      <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-96" aria-hidden="true" />
      <div className="c-shell relative pt-10 sm:pt-14">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="About Astro Sivam"
              title="Vedic astrology, delivered with the care a family decision deserves"
              lead="ASTRO SIVAM prepares personal horoscope reports — a birth chart, a marriage match, a child’s naming, an auspicious date — and it has one rule for all of them: the calculation must be traditional and the explanation must be readable."
            />
            <div className="mt-7 flex flex-wrap gap-2">
              <span className="c-pill c-pill-brand">
                <ShieldCheck className="h-3.5 w-3.5" />
                {BUSINESS.registrationStatus}
              </span>
              <span className="c-pill">
                <Layers className="h-3.5 w-3.5" />
                Four report services
              </span>
              <span className="c-pill">
                <Compass className="h-3.5 w-3.5" />
                {BUSINESS.country}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Reports prepared', value: 'One at a time', hint: 'by our priest team' },
              { label: 'Calculation', value: 'Sidereal · Lahiri', hint: 'Drik panchangam' },
              { label: 'Delivery', value: 'Daily 9–11 AM IST', hint: 'PDF + tax invoice' },
              { label: 'Languages', value: 'English · தமிழ் · हिन्दी' }
            ].map((tile) => (
              <div key={tile.label} className="c-card p-4">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-faint">
                  {tile.label}
                </p>
                <p className="c-display mt-1.5 text-[1.05rem] text-ink">{tile.value}</p>
                {tile.hint ? <p className="mt-1 text-[0.74rem] text-muted">{tile.hint}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    <section className="c-shell mt-16">
      <SectionHeading eyebrow="What we stand for" title="Four principles, applied to every order" align="center" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {PRINCIPLES.map((principle) => {
          const Icon = principle.icon;
          return (
            <div key={principle.title} className="c-card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="c-display mt-4 text-[1.1rem] leading-snug text-ink">{principle.title}</h3>
              <p className="mt-2 text-[0.87rem] leading-7 text-muted">{principle.body}</p>
            </div>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-16">
      <SectionHeading
        eyebrow="What we prepare"
        title="Four reports, and the one question each answers"
        lead="We deliberately keep the catalogue small. Every report on this list is one our priest team prepares day after day."
      />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {CATALOG.map((entry) => (
          <li key={entry.route}>
            <button
              type="button"
              onClick={() => onNavigate(entry.route)}
              className="c-card c-lift flex h-full w-full items-start gap-4 p-5 text-left"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${glyphToneClass(entry.accent)}`}>
                <Glyph glyph={entry.glyph} className="h-6 w-6" />
              </span>
              <span>
                <span className="c-display block text-[1.1rem] text-ink">{entry.title}</span>
                <span className="mt-1 block text-[0.84rem] leading-6 text-muted">{entry.tagline}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>

    <section className="c-shell mt-16">
      <div className="c-card grid gap-8 p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="c-eyebrow">This interface</p>
          <h2 className="c-display mt-3 text-[1.6rem] leading-tight text-ink sm:text-[1.9rem]">
            About this daylight design
          </h2>
          <p className="mt-3 text-[0.92rem] leading-7 text-muted">
            What you are looking at is a new, light-first interface for ASTRO SIVAM: paper surfaces,
            hairline gold rules, a serif display face and three daytime palettes. It is a preview — the
            live site keeps its existing design while this one is reviewed.
          </p>
          <p className="mt-3 text-[0.92rem] leading-7 text-muted">
            It reuses the same engine, the same prices, the same delivery promise and the same FAQ answers
            as the live site, so nothing here can contradict what you read there.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Palettes', value: '3 light moods', hint: 'switch from the corner dock' },
            { label: 'Free tool', value: 'Preview Lab', hint: 'runs in your browser' },
            { label: 'Typography', value: 'Fraunces + Jakarta', hint: 'self-hosted, OFL' },
            { label: 'Contrast', value: 'Light-only', hint: 'no dark mode by design' }
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-line bg-surface-2 p-4">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-faint">{tile.label}</p>
              <p className="c-display mt-1.5 text-[1rem] text-ink">{tile.value}</p>
              <p className="mt-1 text-[0.72rem] text-muted">{tile.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="c-shell mt-14">
      <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
        <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="c-display text-[1.55rem] leading-tight text-ink sm:text-[1.85rem]">
              Ready to order a report?
            </h2>
            <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">
              Compare the four options, or open the Preview Lab first and look at your own chart.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
              See all services
            </button>
            <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-outline">
              Open the Preview Lab
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default AboutPage;
