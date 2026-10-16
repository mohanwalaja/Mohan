import React from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import type { FaqItem } from '../../data/homeFaq';
import { buildFaqPageJsonLd } from '../../services/structuredData';
import { JsonLd } from './JsonLd';

export interface ServiceFaqSectionProps {
  /** The ONE array that feeds both the visible list and the JSON-LD. */
  items: readonly FaqItem[];
  /** The page's canonical URL — the FAQPage entity names it (and its #faq @id). */
  canonicalUrl: string;
  heading?: string;
  intro?: string;
}

/**
 * The service-page FAQ block (index-coverage audit 2026-10-16).
 *
 * Renders the same visible <details> list the homepage uses — so crawlers that
 * never run JavaScript read the real answers — plus the page's own FAQPage
 * JSON-LD, built from the same array so the markup can never describe text the
 * visitor cannot see. scripts/prerender.mjs fails the build if a question or
 * answer is missing from the rendered page, or if the entity does not name
 * this page's canonical.
 *
 * The JSON-LD is rendered in the page tree (not the head): main.tsx deletes
 * the baked [data-prerender-seo] head tags at boot, but this block survives
 * into the DOM Google renders and leaves with the page on SPA navigation.
 */
export const ServiceFaqSection: React.FC<ServiceFaqSectionProps> = ({
  items,
  canonicalUrl,
  heading = 'Frequently asked questions',
  intro,
}) => {
  const faqJsonLd = buildFaqPageJsonLd(items, canonicalUrl);
  return (
    <section id="faq" className="scroll-mt-24">
      <JsonLd data={faqJsonLd} id="faq" />
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        <div className="eyebrow">Frequently asked questions</div>
        <h2 className="display-serif mt-3 text-3xl font-bold text-ink sm:text-4xl">{heading}</h2>
        {intro && <p className="mt-3 text-[15px] leading-7 text-slate-300 sm:text-base">{intro}</p>}
      </div>

      <div className="mx-auto max-w-3xl space-y-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-amber-500/20 bg-[#181230]/90 px-5 py-1 transition-colors open:border-amber-500/45 sm:px-6"
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-4 text-left text-[15px] font-bold leading-6 text-ink marker:hidden sm:text-base [&::-webkit-details-marker]:hidden">
              <HelpCircle className="h-5 w-5 shrink-0 text-amber-400" />
              <span className="flex-1">{item.question}</span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-5 pl-8 pr-2 text-sm leading-6 text-slate-300 sm:text-[15px] sm:leading-7">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
};
