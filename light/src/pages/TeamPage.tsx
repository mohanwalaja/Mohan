import React from 'react';
import { Award, GraduationCap, Sparkles, Users } from 'lucide-react';
import { TEAM_MEMBERS } from '../appConfig';
import { SectionHeading } from '../components/ui/primitives';

export const TeamPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <section className="relative">
      <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
      <div className="c-shell relative pt-10 sm:pt-14">
        <SectionHeading
          eyebrow="Our priest team"
          title="The people who read every chart"
          lead="Our Vedic astrologers work from India. Each chart is computed by the engine, then studied, interpreted and checked by hand before it becomes your PDF."
        />
      </div>
    </section>

    <section className="c-shell mt-10 space-y-4">
      {TEAM_MEMBERS.map((member) => (
        <article key={member.id} className="c-card grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <div className="flex items-center gap-4">
              <span className="c-display grid h-16 w-16 shrink-0 place-items-center rounded-3xl border border-brand/30 bg-brand-soft text-[1.4rem] text-brand-ink">
                {(member.nameEn ?? '?').replace(/^(Acharya|Pandit)\s+/, '').charAt(0)}
              </span>
              <div>
                <h2 className="c-display text-[1.25rem] leading-tight text-ink">{member.nameEn}</h2>
                <p className="mt-1 text-[0.82rem] font-semibold text-brand-ink">{member.titleEn}</p>
              </div>
            </div>

            <ul className="mt-5 space-y-2.5 text-[0.84rem] text-ink-soft">
              <li className="flex items-start gap-2.5">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{member.educationEn}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Award className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  {member.experienceYears} years of practice
                  {member.vedicEducation ? ` · ${member.vedicEducation}` : ''}
                </span>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[0.9rem] leading-7 text-muted">{member.bioEn}</p>
            <div className="mt-5">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-faint">
                Specialisations
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {(member.specializations ?? []).map((item) => (
                  <li key={item} className="c-pill c-pill-brand">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ))}
    </section>

    <section className="c-shell mt-14">
      <div className="c-card grid gap-6 p-6 sm:p-8 lg:grid-cols-3">
        {[
          {
            icon: Users,
            title: 'A team, not a single reader',
            body: 'Different reports are reviewed by the specialists who work on them — ephemeris and dasha work, matrimonial matching, namakaranam, and muhurtham scanning.'
          },
          {
            icon: Sparkles,
            title: 'Tradition first',
            body: 'Rules follow the classical texts the team was trained in. Where a modern convenience would change a traditional finding, the traditional finding stays.'
          },
          {
            icon: Award,
            title: 'Accountable to you',
            body: 'Every order can be reviewed after delivery, and reviews from paid, delivered orders are published on the site under the customer’s chosen display name.'
          }
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.title}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface-2 text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="c-display mt-3 text-[1.05rem] text-ink">{tile.title}</h3>
              <p className="mt-2 text-[0.85rem] leading-6 text-muted">{tile.body}</p>
            </div>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-14">
      <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
        <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="c-display text-[1.55rem] leading-tight text-ink sm:text-[1.85rem]">
              Have a question for the team?
            </h2>
            <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">
              Ask before you order — about a birth time that looks uncertain, which report fits your
              situation, or how a finding should be read.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button type="button" onClick={() => onNavigate('contact')} className="c-btn c-btn-primary">
              Contact the team
            </button>
            <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-outline">
              Try the Preview Lab
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
);
