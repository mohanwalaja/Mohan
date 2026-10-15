import type { ReviewEligibleOrder } from '../types';

/**
 * "Rate your report" — the link in every delivery email of a paid order
 * (api/reviews.php, astro_review_invite_url):
 *
 *   https://astrosivam.com/dashboard?review=<order number>
 *
 * The customer dashboard opens the review form for that order. The order
 * number is remembered for the browser tab (sessionStorage), so the link still
 * works when the customer has to sign in first: dashboard → login → dashboard.
 * Whether the order can actually be reviewed is decided by the server
 * (GET /api/services/my-reviews); this file only carries the order number.
 */
export const REVIEW_INVITE_PARAM = 'review';
export const REVIEW_INVITE_STORAGE_KEY = 'astro:review-invite';

// Order numbers look like ORD-65A1B2. Anything else is ignored, never echoed.
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function normalizeInviteOrderNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ORDER_NUMBER_PATTERN.test(trimmed) ? trimmed : null;
}

function readStored(): string | null {
  try {
    return normalizeInviteOrderNumber(window.sessionStorage.getItem(REVIEW_INVITE_STORAGE_KEY));
  } catch {
    return null; // storage blocked: the link still works for a signed-in visitor
  }
}

/**
 * Takes `?review=` off the address bar (a reload or a copied URL must not
 * reopen the form), remembers it for this tab and returns the pending
 * invitation: the one in the URL, else the one remembered before sign-in.
 */
export function captureReviewInvite(): string | null {
  if (typeof window === 'undefined') return null;
  let fromUrl: string | null = null;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(REVIEW_INVITE_PARAM)) {
      fromUrl = normalizeInviteOrderNumber(url.searchParams.get(REVIEW_INVITE_PARAM));
      url.searchParams.delete(REVIEW_INVITE_PARAM);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // No URL / History API: nothing to capture.
  }
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(REVIEW_INVITE_STORAGE_KEY, fromUrl);
    } catch {
      // Storage blocked: the invitation still opens if the visitor is signed in.
    }
    return fromUrl;
  }
  return readStored();
}

export function clearReviewInvite(): void {
  try {
    window.sessionStorage.removeItem(REVIEW_INVITE_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** The reviewable order the invitation names, or null when this account cannot review it. */
export function resolveReviewInvite(
  orderNumber: string,
  eligibleOrders: readonly ReviewEligibleOrder[],
): ReviewEligibleOrder | null {
  const wanted = orderNumber.trim().toUpperCase();
  return eligibleOrders.find((entry) => String(entry.orderNumber).toUpperCase() === wanted) ?? null;
}
