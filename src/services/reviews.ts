import type { DisplayReview, PublishedReview, ReviewAggregate, ReviewServiceCode } from '../types';

/**
 * Customer review helpers shared by the homepage, the customer dashboard and
 * the admin moderation panel (SEO audit 2026-10-15, finding 3).
 *
 * Pure functions only (no React, no fetch), so tests/customer-reviews.test.ts
 * can execute them directly. The submission limits mirror api/reviews.php —
 * the server is the authority; this copy only gives the form instant feedback.
 */

/** Every review links to the page of the service it is about. */
export const REVIEW_SERVICES: Readonly<Record<ReviewServiceCode, { name: string; route: string }>> = Object.freeze({
  BIRTH_JATHAGAM: { name: 'Birth Jathagam', route: 'birth-jathagam' },
  MARRIAGE_COMPATIBILITY: { name: 'Marriage Compatibility', route: 'marriage-compatibility' },
  BABY_NAMING: { name: 'Baby Naming', route: 'baby-naming' },
  MUHURTHAM: { name: 'Subha Muhurtham', route: 'muhurtham' },
});

export function isReviewServiceCode(value: unknown): value is ReviewServiceCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REVIEW_SERVICES, value);
}

/** Mirrors the ASTRO_REVIEW_* constants in api/reviews.php. */
export const REVIEW_LIMITS = Object.freeze({
  ratingMin: 1,
  ratingMax: 5,
  titleMax: 100,
  bodyMin: 20,
  bodyMax: 1500,
  nameMin: 2,
  nameMax: 60,
  locationMax: 80,
});

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' -> 'February 2026'; 'YYYY-MM-DD' -> '14 October 2026'. Anything else is returned as-is. */
export function formatReviewDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!match) return String(iso || '');
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return String(iso);
  return match[3] ? `${Number(match[3])} ${month} ${match[1]}` : `${month} ${match[1]}`;
}

/** A published API review in the shape the homepage renders, or null if it is unusable. */
export function publishedToDisplay(review: PublishedReview): DisplayReview | null {
  if (!review || !isReviewServiceCode(review.serviceCode)) return null;
  const rating = Math.round(Number(review.rating));
  if (!Number.isFinite(rating) || rating < REVIEW_LIMITS.ratingMin || rating > REVIEW_LIMITS.ratingMax) return null;
  const body = String(review.body || '').trim();
  const authorName = String(review.displayName || '').trim();
  const datePublished = String(review.publishedAt || '').slice(0, 10);
  if (!body || !authorName || !/^\d{4}-\d{2}-\d{2}$/.test(datePublished)) return null;
  return {
    id: String(review.id),
    authorName,
    location: review.location ? String(review.location) : undefined,
    serviceCode: review.serviceCode,
    rating,
    title: review.title ? String(review.title) : undefined,
    body,
    datePublished,
    verifiedPurchase: review.verifiedPurchase !== false,
  };
}

const byNewest = (a: DisplayReview, b: DisplayReview) =>
  a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0;

/**
 * Verified customer reviews first (newest first), then the curated
 * testimonials (newest first). Duplicate ids keep their first occurrence.
 */
export function mergeReviews(verified: readonly DisplayReview[], curated: readonly DisplayReview[]): DisplayReview[] {
  const seen = new Set<string>();
  const out: DisplayReview[] = [];
  for (const review of [...[...verified].sort(byNewest), ...[...curated].sort(byNewest)]) {
    if (seen.has(review.id)) continue;
    seen.add(review.id);
    out.push(review);
  }
  return out;
}

export interface RatingSummary {
  /** Average, rounded to one decimal place. */
  ratingValue: number;
  reviewCount: number;
}

/**
 * The aggregate the homepage shows (and marks up): every curated testimonial
 * plus EVERY published customer review — the API's totals, not just the page
 * of reviews it returned. Returns null when there is nothing to summarise.
 */
export function summarizeRatings(
  curated: readonly DisplayReview[],
  verifiedTotals?: Pick<ReviewAggregate, 'reviewCount' | 'ratingTotal'> | null,
): RatingSummary | null {
  let count = curated.length;
  let total = curated.reduce((sum, review) => sum + review.rating, 0);
  if (verifiedTotals && verifiedTotals.reviewCount > 0) {
    count += Math.max(0, Math.floor(verifiedTotals.reviewCount));
    total += Math.max(0, Number(verifiedTotals.ratingTotal) || 0);
  }
  if (count <= 0) return null;
  return { ratingValue: Math.round((total / count) * 10) / 10, reviewCount: count };
}

/** 'Kavita Maharaj' -> 'Kavita M.' — the privacy-friendly default a customer can edit. */
export function defaultReviewDisplayName(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, REVIEW_LIMITS.nameMax);
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`.slice(0, REVIEW_LIMITS.nameMax);
}

export interface ReviewDraft {
  rating: number;
  title: string;
  body: string;
  displayName: string;
  location: string;
  consent: boolean;
}

/** Unicode-aware length (Tamil/Hindi text counts characters, not UTF-16 units). */
export function textLength(value: string): number {
  return Array.from(String(value || '')).length;
}

const LINK_PATTERN = /(?:https?:\/\/|www\.)/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/**
 * Client-side mirror of astro_review_validate_submission(): field -> message.
 * An empty object means the draft can be submitted.
 */
export function validateReviewDraft(draft: ReviewDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const rating = Number(draft.rating);
  if (!Number.isInteger(rating) || rating < REVIEW_LIMITS.ratingMin || rating > REVIEW_LIMITS.ratingMax) {
    errors.rating = 'Choose a rating from 1 to 5 stars.';
  }
  const title = draft.title.trim();
  if (textLength(title) > REVIEW_LIMITS.titleMax) errors.title = `Keep the headline under ${REVIEW_LIMITS.titleMax} characters.`;
  const body = draft.body.trim();
  if (textLength(body) < REVIEW_LIMITS.bodyMin) errors.body = `Please write at least ${REVIEW_LIMITS.bodyMin} characters about your experience.`;
  else if (textLength(body) > REVIEW_LIMITS.bodyMax) errors.body = `Please keep your review under ${REVIEW_LIMITS.bodyMax} characters.`;
  const name = draft.displayName.trim();
  if (textLength(name) < REVIEW_LIMITS.nameMin || textLength(name) > REVIEW_LIMITS.nameMax) {
    errors.displayName = `Your display name must be ${REVIEW_LIMITS.nameMin}–${REVIEW_LIMITS.nameMax} characters.`;
  }
  const location = draft.location.trim();
  if (textLength(location) > REVIEW_LIMITS.locationMax) errors.location = `Keep the location under ${REVIEW_LIMITS.locationMax} characters.`;
  for (const [field, value] of [['title', title], ['body', body], ['displayName', name], ['location', location]] as const) {
    if (errors[field]) continue;
    if (LINK_PATTERN.test(value)) errors[field] = 'Please remove links — reviews cannot contain web addresses.';
    else if (EMAIL_PATTERN.test(value)) errors[field] = 'Please remove email addresses — reviews are public.';
  }
  if (!draft.consent) errors.consent = 'Please confirm the review is your own experience and may be published.';
  return errors;
}
