import React from 'react';
import { Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CHAT_INCLUDED_LINE } from '../../services/servicePromise';

export interface ServicePageHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  /**
   * Advertise the personal astrologer chat that comes with a delivered report.
   * On for the four paid services; off for pages like Contact that sell nothing.
   */
  showChatBenefit?: boolean;
}

/** Shared title treatment keeps the main service pages visually related. */
export const ServicePageHeader: React.FC<ServicePageHeaderProps> = ({
  icon: Icon,
  eyebrow,
  title,
  description,
  showChatBenefit = false
}) => (
  <header className="service-page-hero">
    <div className="service-page-hero__orbit" aria-hidden="true" />
    <div className="service-page-hero__content">
      <div className="service-page-hero__eyebrow">
        <span className="service-page-hero__icon"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
        <span>{eyebrow}</span>
      </div>
      <h1 className="service-page-hero__title">{title}</h1>
      <p className="service-page-hero__description">{description}</p>
      {showChatBenefit && (
        <p
          data-testid="service-page-chat-benefit"
          className="mt-3 inline-flex items-start gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold leading-snug text-amber-100"
        >
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <span>{CHAT_INCLUDED_LINE}</span>
        </p>
      )}
    </div>
  </header>
);
