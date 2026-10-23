import React from 'react';
import { CheckCircle2, Mail, ScrollText, ShieldCheck, UserCheck } from 'lucide-react';
import {
  ORDER_JOURNEY_HEADING,
  ORDER_JOURNEY_INTRO,
  ORDER_JOURNEY_LINE,
  ORDER_JOURNEY_STEPS
} from '../../data/orderJourney';

/** One icon per step, in the same order as ORDER_JOURNEY_STEPS. */
const STEP_ICONS = [ScrollText, UserCheck, ShieldCheck, Mail];

export interface OrderJourneyNoticeProps {
  /**
   * `panel` — the full four-step block used on the main pages.
   * `line`  — the one-sentence version, for pages that already explain a lot.
   */
  variant?: 'panel' | 'line';
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Section id, when a page needs to link to it. */
  id?: string;
}

/**
 * "What happens after you order" — the ONE rendering of src/data/orderJourney.ts.
 *
 * Every public page that sells a report shows this, so the promise a visitor
 * reads on the homepage, the Services catalogue, a service page, How It Works,
 * About and the Astrology Team page is identical: the order goes to the
 * India-based priest team, they calculate and verify it, the administrator
 * approves it, and the PDF report + tax invoice are emailed to the registered
 * address with the priest-team verification line.
 */
export const OrderJourneyNotice: React.FC<OrderJourneyNoticeProps> = ({
  variant = 'panel',
  className = '',
  id
}) => {
  if (variant === 'line') {
    return (
      <p
        id={id}
        className={`flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 ${className}`}
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <span>{ORDER_JOURNEY_LINE}</span>
      </p>
    );
  }

  return (
    <section id={id} className={`scroll-mt-24 ${className}`} aria-labelledby="order-journey-heading">
      <div className="mx-auto mb-6 max-w-2xl text-center sm:mb-8">
        <div className="eyebrow justify-center text-[#f3ba70]">From our priest team to your inbox</div>
        <h2
          id="order-journey-heading"
          className="display-serif mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl"
        >
          {ORDER_JOURNEY_HEADING}
        </h2>
        <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">{ORDER_JOURNEY_INTRO}</p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {ORDER_JOURNEY_STEPS.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? CheckCircle2;
          return (
            <li
              key={step.title}
              className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-white p-4 shadow-sm dark:bg-[#181230]/90 dark:shadow-none sm:p-5"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
                <Icon className="h-4 w-4 text-amber-300" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">{step.title}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[13px]">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default OrderJourneyNotice;
