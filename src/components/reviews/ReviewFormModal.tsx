import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X, ShieldCheck, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type { CustomerReview, ReviewServiceCode } from '../../types';
import { api } from '../../services/api';
import { REVIEW_LIMITS, REVIEW_SERVICES, formatReviewDate, textLength, validateReviewDraft } from '../../services/reviews';

interface ReviewFormModalProps {
  orderId: string;
  orderNumber: string;
  /** The order's reviewable services (from GET /services/my-reviews). */
  services: ReviewServiceCode[];
  /** This customer's existing reviews of this order, any status. */
  existing: CustomerReview[];
  /** Prefill for a first review: privacy-friendly name and the account country. */
  defaults: { displayName: string; location: string };
  onClose: () => void;
  onSaved: (review: CustomerReview, message: string) => void;
}

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** A short line describing where an existing review stands. */
function ReviewStatusNote({ review }: { review: CustomerReview }) {
  if (review.status === 'APPROVED') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-[11.5px] text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        <span>
          Published{review.publishedAt ? ` on ${formatReviewDate(review.publishedAt.slice(0, 10))}` : ''}. Editing it sends
          it back for a quick check before it reappears.
        </span>
      </p>
    );
  }
  if (review.status === 'REJECTED') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-[11.5px] text-rose-200">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
        <span>
          Not published{review.rejectionReason ? `: ${review.rejectionReason}` : '.'} You can edit and resubmit it.
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11.5px] text-amber-200">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Received — waiting for a quick check by our team before it appears on the site.</span>
    </p>
  );
}

/**
 * Write or edit the review of one service of one paid, delivered order
 * (SEO audit 2026-10-15, finding 3). The server re-validates everything
 * (api/reviews.php); the checks here only give instant feedback.
 */
export function ReviewFormModal({ orderId, orderNumber, services, existing, defaults, onClose, onSaved }: ReviewFormModalProps) {
  const headingId = useId();
  const fieldId = useId();
  const firstFieldRef = useRef<HTMLDivElement>(null);
  const firstUnreviewed = services.find((code) => !existing.some((review) => review.serviceCode === code));
  const [serviceCode, setServiceCode] = useState<ReviewServiceCode>(firstUnreviewed ?? services[0]);
  const current = useMemo(
    () => existing.find((review) => review.serviceCode === serviceCode) ?? null,
    [existing, serviceCode]
  );

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill from the existing review of the selected service, else the defaults.
  useEffect(() => {
    setRating(current?.rating ?? 0);
    setTitle(current?.title ?? '');
    setBody(current?.body ?? '');
    setDisplayName(current?.displayName ?? defaults.displayName);
    setLocation(current?.location ?? defaults.location);
    setConsent(false);
    setErrors({});
    setServerError('');
  }, [current, defaults.displayName, defaults.location]);

  useEffect(() => {
    firstFieldRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateReviewDraft({ rating, title, body, displayName, location, consent });
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length > 0) return;
    setIsSubmitting(true);
    try {
      const res = await api.submitReview({
        orderId,
        serviceCode,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
        displayName: displayName.trim(),
        location: location.trim() || undefined,
        consent
      });
      if (res.success && res.review) {
        onSaved(res.review, res.message || 'Thank you — your review was received.');
        return;
      }
      if (res.errors) setErrors(res.errors);
      setServerError(res.message || 'Your review could not be saved. Please try again.');
    } catch (error: any) {
      setServerError(error?.message || 'Your review could not be saved. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shownRating = hoverRating || rating;
  const fieldClass = (field: string) =>
    `w-full rounded-xl border bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
      errors[field] ? 'border-rose-500/70' : 'border-slate-700 focus:border-amber-500/60'
    }`;
  const errorText = (field: string) =>
    errors[field] ? (
      <p id={`${fieldId}-${field}-error`} className="mt-1 text-[11px] font-semibold text-rose-300">
        {errors[field]}
      </p>
    ) : null;

  if (typeof document === 'undefined') return null;

  // Portalled to <body>: the page renders inside <main class="relative z-10">,
  // a stacking context the sticky site header (z-40) would otherwise cover —
  // hiding the dialog's title and close button.
  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-slate-950/70 p-0 font-sans antialiased backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-400">Order #{orderNumber}</div>
            <h2 id={headingId} className="mt-1 text-lg font-extrabold">
              {current ? 'Edit your review' : 'Rate & review your report'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            aria-label="Close review form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div ref={firstFieldRef} className="space-y-4">
            {services.length > 1 && (
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-slate-300">Which report are you reviewing?</legend>
                <div className="flex flex-wrap gap-2">
                  {services.map((code) => (
                    <button
                      type="button"
                      key={code}
                      onClick={() => setServiceCode(code)}
                      aria-pressed={serviceCode === code}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                        serviceCode === code
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {REVIEW_SERVICES[code].name}
                      {existing.some((review) => review.serviceCode === code) ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {current && <ReviewStatusNote review={current} />}

            <div>
              <div className="mb-1.5 text-xs font-bold text-slate-300" id={`${fieldId}-rating-label`}>
                Your rating for {REVIEW_SERVICES[serviceCode].name}
              </div>
              <div className="flex items-center gap-3">
                <div
                  role="radiogroup"
                  aria-labelledby={`${fieldId}-rating-label`}
                  className="flex items-center gap-1"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} star${value === 1 ? '' : 's'} — ${RATING_WORDS[value]}`}
                      key={value}
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHoverRating(value)}
                      className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      <Star
                        className={`h-7 w-7 ${value <= shownRating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-300">{RATING_WORDS[shownRating]}</span>
              </div>
              {errorText('rating')}
            </div>
          </div>

          <div>
            <label htmlFor={`${fieldId}-title`} className="mb-1.5 block text-xs font-bold text-slate-300">
              Headline <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id={`${fieldId}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={REVIEW_LIMITS.titleMax}
              placeholder="e.g. Clear and reassuring"
              className={fieldClass('title')}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${fieldId}-title-error` : undefined}
            />
            {errorText('title')}
          </div>

          <div>
            <label htmlFor={`${fieldId}-body`} className="mb-1.5 block text-xs font-bold text-slate-300">
              Your review
            </label>
            <textarea
              id={`${fieldId}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              maxLength={REVIEW_LIMITS.bodyMax + 200}
              placeholder="What did the report help you with? How was the ordering and delivery?"
              className={`${fieldClass('body')} resize-y`}
              aria-invalid={Boolean(errors.body)}
              aria-describedby={`${fieldId}-body-count${errors.body ? ` ${fieldId}-body-error` : ''}`}
            />
            <div className="mt-1 flex justify-between gap-3">
              {errorText('body') ?? <span />}
              <span
                id={`${fieldId}-body-count`}
                className={`shrink-0 text-[11px] ${textLength(body.trim()) > REVIEW_LIMITS.bodyMax ? 'text-rose-300' : 'text-slate-500'}`}
              >
                {textLength(body.trim())} / {REVIEW_LIMITS.bodyMax}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${fieldId}-name`} className="mb-1.5 block text-xs font-bold text-slate-300">
                Display name
              </label>
              <input
                id={`${fieldId}-name`}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={REVIEW_LIMITS.nameMax}
                autoComplete="nickname"
                className={fieldClass('displayName')}
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={`${fieldId}-name-hint${errors.displayName ? ` ${fieldId}-displayName-error` : ''}`}
              />
              <p id={`${fieldId}-name-hint`} className="mt-1 text-[11px] text-slate-500">
                Shown publicly — first name and last initial work well.
              </p>
              {errorText('displayName')}
            </div>
            <div>
              <label htmlFor={`${fieldId}-location`} className="mb-1.5 block text-xs font-bold text-slate-300">
                Location <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id={`${fieldId}-location`}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={REVIEW_LIMITS.locationMax}
                placeholder="e.g. Sydney, Australia"
                className={fieldClass('location')}
                aria-invalid={Boolean(errors.location)}
                aria-describedby={errors.location ? `${fieldId}-location-error` : undefined}
              />
              {errorText('location')}
            </div>
          </div>

          <div>
            <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? `${fieldId}-consent-error` : undefined}
              />
              <span>
                This review describes my own experience with this order, and ASTRO SIVAM may publish it on
                astrosivam.com with my display name and location.
              </span>
            </label>
            {errorText('consent')}
          </div>

          {serverError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-700/70 bg-rose-950/50 px-3 py-2.5 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>
              Shown as a <strong className="text-emerald-300">Verified purchase</strong> once our team has checked it. We
              publish honest reviews, positive or critical; we only remove spam, abuse or personal details.
            </span>
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 disabled:cursor-wait disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isSubmitting ? 'Sending…' : current ? 'Update review' : 'Submit review'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
