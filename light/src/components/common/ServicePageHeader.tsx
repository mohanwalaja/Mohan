import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ServicePageHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}

/**
 * The shared title treatment for the four report pages — same contract as the
 * live `src/components/common/ServicePageHeader.tsx` (icon, eyebrow, h1,
 * description) and the same strings, which the light pages pass in unchanged.
 * Only the paint differs: warm paper, ink headline, gold eyebrow.
 */
export const ServicePageHeader: React.FC<ServicePageHeaderProps> = ({
  icon: Icon,
  eyebrow,
  title,
  description
}) => (
  <header className="relative overflow-hidden border-b border-line bg-page-soft">
    <div className="c-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
    <div className="c-shell relative py-12 sm:py-16">
      <p className="inline-flex items-center gap-2 rounded-full border border-brand/35 bg-surface px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
        <Icon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
        <span>{eyebrow}</span>
      </p>
      <h1 className="c-display mt-4 max-w-4xl text-[2.1rem] leading-[1.1] text-ink sm:text-[2.7rem] lg:text-[3rem]">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-[0.98rem] leading-8 text-ink-soft sm:text-[1.05rem]">
        {description}
      </p>
    </div>
  </header>
);
