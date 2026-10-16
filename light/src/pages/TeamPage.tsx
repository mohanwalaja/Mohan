import React from 'react';
import { ArrowRight, Clock, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';
import { TEAM_MEMBERS, TEAM_PAGE_COPY, BRAND, type PageKey } from '../appConfig';
import { PageBreadcrumb } from '../components/common/PageBreadcrumb';
import emblemImg from '@shared/assets/astrosivam_logo.png';

/**
 * Astrology Team — the live page: the council banner, the team cards from the
 * same DEFAULT_TEAM_MEMBERS data with the same credential lines ("… Years
 * Traditional Vedic Experience", education, specialisation tags), the
 * three-step collaboration explainer and the closing CTA.
 */
export const TeamPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <div className="pb-6">
    <PageBreadcrumb label="Our Vedic Scholars & Astrologers" onNavigate={onNavigate} />

    <div className="c-shell mt-6">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-page-deep p-8 sm:p-12">
        <div className="c-glow pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="c-rise relative max-w-3xl space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/35 bg-surface px-3.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
            <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />
            <span>{TEAM_PAGE_COPY.eyebrow}</span>
          </p>

          <h1 className="c-display text-[2rem] font-extrabold tracking-tight text-ink sm:text-[2.6rem] lg:text-[3rem]">
            {TEAM_PAGE_COPY.title}
          </h1>

          <p className="text-[0.92rem] leading-8 text-ink-soft sm:text-[0.98rem]">{TEAM_PAGE_COPY.lead}</p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-[0.82rem] font-medium text-ink-soft">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brand" aria-hidden />
              {TEAM_PAGE_COPY.badgePrimary}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-leaf" aria-hidden />
              {TEAM_PAGE_COPY.badgeSecondary}
            </span>
          </div>
        </div>
      </div>
    </div>

    <section className="c-shell mt-12">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_MEMBERS.map((member) => {
          const years = member.experienceYears ?? member.yearsOfExperience ?? 15;
          return (
            <article key={member.id} className="c-card flex flex-col p-6">
              <div className="flex items-start gap-4">
                <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-brand/35 bg-white p-0.5">
                  <img
                    src={member.photoUrl || emblemImg}
                    alt={`${member.nameEn} — ${BRAND.name}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full rounded-full object-cover"
                  />
                </span>
                <span className="rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-[0.68rem] font-bold text-brand-ink">
                  {years}+ YRS
                </span>
              </div>

              <h2 className="c-display mt-4 text-[1.15rem] font-bold leading-snug text-ink">{member.nameEn}</h2>
              <p className="mt-1 text-[0.84rem] font-semibold text-brand-ink">
                {member.titleEn || member.vedicEducation || 'Senior Astrologer'}
              </p>

              <p className="mt-3 flex items-start gap-2 text-[0.8rem] leading-6 text-muted">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span>
                  {member.educationEn || member.education || member.vedicEducation || 'Vedic Astrology Scholar'}
                </span>
              </p>

              <p className="mt-3 flex items-start gap-2 text-[0.78rem] font-semibold text-ink-soft">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                <span>{years} Years Traditional Vedic Experience</span>
              </p>

              {member.bioEn || member.biography ? (
                <p className="mt-3 text-[0.8rem] leading-6 text-muted">{member.bioEn || member.biography}</p>
              ) : null}

              {(member.specializations ?? []).length ? (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {(member.specializations ?? []).map((tag) => (
                    <li
                      key={tag}
                      className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>

    <section className="c-shell mt-12">
      <div className="c-card space-y-6 p-7 sm:p-8">
        <h2 className="c-display text-[1.4rem] font-bold text-ink">{TEAM_PAGE_COPY.workflowTitle}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TEAM_PAGE_COPY.workflow.map((step, index) => (
            <div
              key={step.step}
              className={`space-y-2 rounded-2xl border p-5 ${
                index === 0
                  ? 'border-brand/30 bg-brand-soft'
                  : index === 1
                    ? 'border-accent/25 bg-accent-soft'
                    : 'border-leaf/25 bg-leaf-soft'
              }`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-[0.72rem] font-bold text-ink">
                {step.step}
              </span>
              <h3 className="text-[0.92rem] font-bold text-ink">{step.title}</h3>
              <p className="text-[0.82rem] leading-6 text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => onNavigate('birth-jathagam')} className="c-btn c-btn-primary">
            <span>{TEAM_PAGE_COPY.action}</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  </div>
);
