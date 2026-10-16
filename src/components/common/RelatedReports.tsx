import React from 'react';
import { ArrowRight } from 'lucide-react';
import { RouteLink } from './RouteLink';

export interface RelatedReportLink {
  /** The in-app route key, e.g. 'birth-jathagam' — must be a prerendered route. */
  route: string;
  /** A keyword-rich, human anchor naming the report, e.g. "10 Porutham marriage compatibility". */
  label: string;
}

export interface RelatedReportsProps {
  links: readonly RelatedReportLink[];
  onNavigate: (route: string) => void;
  eyebrow?: string;
}

/**
 * Keyword-anchored cross-links from one service page to the other reports
 * (index-coverage audit 2026-10-16). The header/footer chrome already links
 * every page, but with generic labels; these give each money page real
 * internal links whose anchor text says what the destination report is, so a
 * crawler reaching /marriage-compatibility finds "baby naming by nakshatra"
 * and "Subha Muhurtham" as first-party, topically-matched links.
 *
 * RouteLink renders a real <a href="/canonical-path"> (SEO audit 2026-10-15,
 * finding 1), so the links are crawlable in the prerendered HTML.
 */
export const RelatedReports: React.FC<RelatedReportsProps> = ({ links, onNavigate, eyebrow = 'Complete your reading' }) => (
  <section aria-label="Related astrology reports" className="scroll-mt-24">
    <div className="rounded-3xl border border-amber-500/20 bg-[#181230]/60 px-5 py-5 sm:px-8 sm:py-6">
      <div className="mb-4">
        <div className="eyebrow">{eyebrow}</div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {links.map((link) => (
          <RouteLink
            key={link.route}
            route={link.route}
            onNavigate={onNavigate}
            className="group inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs font-bold leading-5 text-amber-200/90 transition-colors hover:border-amber-400/60 hover:bg-amber-500/15 hover:text-amber-100"
          >
            {link.label}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-400/70 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </RouteLink>
        ))}
      </div>
    </div>
  </section>
);
