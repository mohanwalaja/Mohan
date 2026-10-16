import React from 'react';
import { ArrowRight } from 'lucide-react';
import { RELATED_REPORTS_EYEBROW } from '../../servicePanels';
import type { PageKey } from '../../appConfig';

/**
 * Cross-links between the four reports — the live <RelatedReports> block,
 * same links (keyword-anchored labels and order come from each page), on paper.
 */
export const RelatedReports: React.FC<{
  links: Array<{ route: PageKey; label: string }>;
  onNavigate: (key: PageKey) => void;
}> = ({ links, onNavigate }) => (
  <section className="c-shell mt-14">
    <div className="c-card p-6 sm:p-7">
      <p className="c-eyebrow">{RELATED_REPORTS_EYEBROW}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {links.map((link) => (
          <button
            key={link.route}
            type="button"
            onClick={() => onNavigate(link.route)}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left transition hover:border-brand/45 hover:bg-brand-soft/60"
          >
            <span className="text-[0.84rem] font-semibold leading-6 text-ink-soft group-hover:text-brand-ink">
              {link.label}
            </span>
            <ArrowRight size={15} className="shrink-0 text-brand transition group-hover:translate-x-0.5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  </section>
);
