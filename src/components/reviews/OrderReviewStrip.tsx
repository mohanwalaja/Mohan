import React from 'react';
import { Star, PenLine, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { CustomerReview, ReviewEligibleOrder } from '../../types';
import { REVIEW_SERVICES } from '../../services/reviews';

interface OrderReviewStripProps {
  eligibility: ReviewEligibleOrder;
  /** This customer's reviews of this order. */
  reviews: CustomerReview[];
  onOpen: () => void;
}

const STATUS_STYLE: Record<CustomerReview['status'], { label: string; className: string; Icon: typeof Clock }> = {
  PENDING: { label: 'Waiting for a quick check', className: 'border-amber-700/60 bg-amber-950/50 text-amber-200', Icon: Clock },
  APPROVED: { label: 'Published', className: 'border-emerald-700/60 bg-emerald-950/50 text-emerald-200', Icon: CheckCircle2 },
  REJECTED: { label: 'Not published', className: 'border-rose-700/60 bg-rose-950/50 text-rose-200', Icon: AlertCircle },
};

/**
 * The review entry point on a paid, delivered order card in the customer
 * dashboard (SEO audit 2026-10-15, finding 3). Only rendered for orders the
 * server lists as reviewable (GET /api/services/my-reviews).
 */
export function OrderReviewStrip({ eligibility, reviews, onOpen }: OrderReviewStripProps) {
  const remaining = eligibility.services.filter((code) => !reviews.some((review) => review.serviceCode === code));
  const hasReview = reviews.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-700/40 bg-gradient-to-r from-amber-950/40 to-slate-950/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5 text-xs">
        {hasReview ? (
          <>
            <div className="font-bold text-amber-200">Your review{reviews.length > 1 ? 's' : ''}</div>
            <ul className="flex flex-wrap gap-2">
              {reviews.map((review) => {
                const style = STATUS_STYLE[review.status] ?? STATUS_STYLE.PENDING;
                return (
                  <li
                    key={review.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold ${style.className}`}
                  >
                    <style.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {REVIEW_SERVICES[review.serviceCode]?.name ?? review.serviceCode} · {review.rating}★ · {style.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 font-bold text-amber-200">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span>How was your report?</span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-slate-300">
              Your review helps other families choose — it is shown as a verified purchase.
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-sm transition-all hover:bg-amber-400 active:scale-95"
      >
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{!hasReview ? 'Rate & review' : remaining.length > 0 ? 'Review another report' : 'Edit review'}</span>
      </button>
    </div>
  );
}
