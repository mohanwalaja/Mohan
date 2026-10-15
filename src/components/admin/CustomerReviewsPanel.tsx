import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Star, CheckCircle2, XCircle, Trash2, RefreshCw, MessageSquareQuote, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import type { AdminReview, ReviewStatus } from '../../types';
import { api } from '../../services/api';
import { REVIEW_SERVICES } from '../../services/reviews';

interface CustomerReviewsPanelProps {
  onSetSuccess: (msg: string) => void;
  onSetError: (msg: string) => void;
}

type Filter = ReviewStatus | 'ALL';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'PENDING', label: 'Waiting for review' },
  { id: 'APPROVED', label: 'Published' },
  { id: 'REJECTED', label: 'Not published' },
  { id: 'ALL', label: 'All' },
];

const STATUS_BADGE: Record<ReviewStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Published',
  REJECTED: 'Not published',
};

/**
 * Moderation queue for verified customer reviews (SEO audit 2026-10-15,
 * finding 3). Every review here was written by the owner of a paid, delivered
 * order; publishing re-checks that the order is still paid and not refunded.
 */
export const CustomerReviewsPanel: React.FC<CustomerReviewsPanelProps> = ({ onSetSuccess, onSetError }) => {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The portal passes fresh inline callbacks on every render; keeping them in a
  // ref stops `load` from changing identity (which would re-fetch on every
  // parent render — and loop forever when a failed load reports an error).
  const notify = useRef({ onSetSuccess, onSetError });
  notify.current = { onSetSuccess, onSetError };

  const load = useCallback(async (status: Filter) => {
    setIsLoading(true);
    try {
      const res = await api.getAdminReviews(status);
      if (res.success) {
        setReviews(res.reviews);
        setCounts(res.counts || {});
      } else {
        notify.current.onSetError(res.message || 'Could not load customer reviews.');
      }
    } catch (err: any) {
      notify.current.onSetError(err?.message || 'Could not load customer reviews.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const moderate = async (review: AdminReview, decision: 'approve' | 'reject') => {
    let reason: string | undefined;
    if (decision === 'reject') {
      const answer = window.prompt(
        'Optional: tell the customer why it was not published (they see this in their dashboard). Leave empty for no reason.',
        ''
      );
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setBusyId(review.id);
    try {
      const res = await api.moderateReview(review.id, decision, reason);
      if (res.success) {
        onSetSuccess(res.message || (decision === 'approve' ? 'Review published.' : 'Review hidden.'));
        await load(filter);
      } else {
        onSetError(res.message || 'The review could not be updated.');
      }
    } catch (err: any) {
      onSetError(err?.message || 'The review could not be updated.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (review: AdminReview) => {
    if (!window.confirm(`Delete the review by "${review.displayName}" for order #${review.orderNumber || review.orderId}? This cannot be undone.`)) {
      return;
    }
    setBusyId(review.id);
    try {
      const res = await api.deleteReview(review.id);
      if (res.success) {
        onSetSuccess(res.message || 'Review deleted.');
        await load(filter);
      } else {
        onSetError(res.message || 'The review could not be deleted.');
      }
    } catch (err: any) {
      onSetError(err?.message || 'The review could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquareQuote className="w-4 h-4 text-amber-500" />
            <span>Customer Reviews</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Written by customers from their own paid, delivered orders. Published reviews appear on the homepage as
            "Verified purchase" and link to the service page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(filter)}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <span>
          Publish genuine reviews whether they are positive or critical — selectively hiding low ratings misleads
          customers and breaks consumer-protection rules on reviews. Hide only spam, abuse, personal details or text
          unrelated to the order.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            type="button"
            key={option.id}
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filter === option.id
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {option.label} ({counts[option.id] ?? 0})
          </button>
        ))}
      </div>

      {isLoading && reviews.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="py-12 text-center text-slate-400 space-y-2">
          <MessageSquareQuote className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-semibold">No reviews in this list</p>
          <p className="text-xs text-slate-500">Customers can review a report once it has been delivered.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => {
            const service = REVIEW_SERVICES[review.serviceCode];
            const isBusy = busyId === review.id;
            const orderRefunded = (review.orderStatus || '').toUpperCase() === 'REFUNDED';
            return (
              <li
                key={review.id}
                className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-0.5" aria-label={`Rated ${review.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${i <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${STATUS_BADGE[review.status]}`}>
                        {STATUS_LABEL[review.status]}
                      </span>
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-300">
                        {service?.name ?? review.serviceCode}
                      </span>
                    </div>
                    {review.title && <div className="text-sm font-bold text-slate-900 dark:text-white">{review.title}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {review.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={isBusy || orderRefunded}
                        onClick={() => void moderate(review, 'approve')}
                        title={orderRefunded ? 'The order was refunded, so this review cannot be published.' : 'Publish on the homepage'}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Publish</span>
                      </button>
                    )}
                    {review.status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void moderate(review, 'reject')}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{review.status === 'APPROVED' ? 'Unpublish' : 'Don’t publish'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void remove(review)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg disabled:opacity-50"
                      title="Delete review"
                      aria-label="Delete review"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  {review.body}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <div>
                    Shown as <strong className="text-slate-700 dark:text-slate-200">{review.displayName}</strong>
                    {review.location ? ` · ${review.location}` : ''}
                  </div>
                  <div>
                    Order <strong className="font-mono text-slate-700 dark:text-slate-200">#{review.orderNumber || review.orderId}</strong>
                    {review.orderAmount != null ? ` · ${review.orderCurrency || ''} ${review.orderAmount.toFixed(2)}` : ''}
                    {review.orderStatus ? ` · ${review.orderStatus}` : ''}
                  </div>
                  <div>
                    Customer: {review.customerName || '—'}
                    {review.customerEmail ? <span className="font-mono"> ({review.customerEmail})</span> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      Written {new Date(review.createdAt.replace(' ', 'T')).toLocaleString()}
                      {review.publishedAt ? ` · published ${new Date(review.publishedAt.replace(' ', 'T')).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                  {review.rejectionReason && (
                    <div className="sm:col-span-2 text-rose-500">Reason shown to the customer: {review.rejectionReason}</div>
                  )}
                  {orderRefunded && (
                    <div className="sm:col-span-2 flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      <span>The order was refunded — the review is hidden from the site and cannot be published.</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
