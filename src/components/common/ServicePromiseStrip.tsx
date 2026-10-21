import React from 'react';
import { CheckCircle2, MessageSquareHeart, ShieldCheck, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SERVICE_PROMISES, priceCardPromises, type ServicePromiseId } from '../../services/servicePromise';

const ICONS: Record<ServicePromiseId, LucideIcon> = {
  reviewed: ShieldCheck,
  chat: MessageSquareHeart,
  refund: Star,
  delivery: CheckCircle2
};

export interface ServicePromiseStripProps {
  /** `card` = three tight rows inside a price card; `inline` = one compact row. */
  variant?: 'card' | 'inline';
  /** Extra classes for the wrapper (each page keeps its own palette). */
  className?: string;
  /** Tint for icons and text; defaults suit the dark service pages. */
  tone?: 'dark' | 'light';
}

/**
 * The guarantees that make a fee safe to pay, rendered from the single list in
 * services/servicePromise.ts. Every line is a fact about the shipped delivery
 * flow (see that file) — never a marketing invention.
 */
export const ServicePromiseStrip: React.FC<ServicePromiseStripProps> = ({
  variant = 'card',
  className = '',
  tone = 'dark'
}) => {
  const promises = variant === 'inline' ? SERVICE_PROMISES.slice(0, 2) : priceCardPromises();
  const text = tone === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const icon = tone === 'dark' ? 'text-emerald-300' : 'text-emerald-600';

  return (
    <ul
      data-testid={`service-promises-${variant}`}
      className={`${variant === 'inline' ? 'flex flex-wrap items-center gap-x-4 gap-y-1.5' : 'space-y-1.5'} ${className}`}
    >
      {promises.map(promise => {
        const Icon = ICONS[promise.id];
        return (
          <li
            key={promise.id}
            data-promise={promise.id}
            title={promise.detail}
            className={`flex items-start gap-1.5 text-[11px] font-semibold leading-snug ${text}`}
          >
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${icon}`} aria-hidden="true" />
            <span>{promise.label}</span>
          </li>
        );
      })}
    </ul>
  );
};
