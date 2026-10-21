/**
 * What a customer gets for their money — one source of truth.
 *
 * Two owner requests (2026-10-21) drive this file:
 *  1. "Advertise the chat" — the source-based personal astrologer chat is live
 *     and included, but no price card mentioned it, so customers were paying
 *     for a benefit they never knew about.
 *  2. "Add the promise line to price cards" — every service fee now states the
 *     guarantees that make the fee safe to pay.
 *
 * EVERY line here must be TRUE of the shipped code, because a promise the site
 * cannot keep is worse than no promise:
 *   - "Reviewed by our Vedic team"  = an admin approves every order before the
 *     report is emailed (api/admin/index.php delivery route).
 *   - "90% refund before approval"  = ASTRO_REFUND_PERCENT_PRE_APPROVAL in
 *     api/refunds.php (3 working days settlement).
 *   - "PDF + tax invoice by email"  = the same delivery route attaches both.
 *   - "Personal astrologer chat"    = api/ai_astrologer.php: unlimited guided
 *     questions for ASTRO_AI_CHAT_WINDOW_DAYS after the report is delivered.
 *     The day count below MUST match that PHP constant; a test asserts it.
 *
 * Framework-free so the UI and the test suite read the same strings.
 */

/**
 * Days of personal-astrologer chat included with a delivered report.
 * Mirrors `ASTRO_AI_CHAT_WINDOW_DAYS` in api/ai_astrologer.php.
 */
export const ASTRO_CHAT_WINDOW_DAYS = 7;

/** Percentage refunded when the customer cancels before approval. */
export const PRE_APPROVAL_REFUND_PERCENT = 90;

export type ServicePromiseId = 'reviewed' | 'chat' | 'refund' | 'delivery';

export interface ServicePromise {
  id: ServicePromiseId;
  /** Short line for a price card. */
  label: string;
  /** One sentence of detail, used where there is room. */
  detail: string;
}

/** The guarantees printed on every price card. Order = reading order. */
export const SERVICE_PROMISES: ServicePromise[] = [
  {
    id: 'reviewed',
    label: 'Reviewed by our Vedic team',
    detail: 'A Sivachariyar checks your chart and timings before the PDF is emailed — no machine-only report is ever sent.'
  },
  {
    id: 'chat',
    label: `Personal astrologer chat included · ${ASTRO_CHAT_WINDOW_DAYS} days`,
    detail: `Ask unlimited guided questions for ${ASTRO_CHAT_WINDOW_DAYS} days after delivery; answers are built from your own chart and our verified classical sources.`
  },
  {
    id: 'refund',
    label: `${PRE_APPROVAL_REFUND_PERCENT}% refund before approval`,
    detail: `Cancel before we approve the report and ${PRE_APPROVAL_REFUND_PERCENT}% is refunded to your payment method within 3 working days.`
  },
  {
    id: 'delivery',
    label: 'PDF report + tax invoice by email',
    detail: 'The finished report and a tax invoice are attached to one email — nothing to download from a link that expires.'
  }
];

/** The one-line chat benefit, for tight spaces (checkout, headers). */
export const CHAT_INCLUDED_LINE = `Personal astrologer chat included — ${ASTRO_CHAT_WINDOW_DAYS} days of free questions after delivery`;

/** How many promises a compact card can show before it becomes noise. */
export const PRICE_CARD_PROMISE_LIMIT = 3;

/** The promises a price card shows (reviewed, chat, refund). */
export function priceCardPromises(): ServicePromise[] {
  return SERVICE_PROMISES.filter(promise => promise.id !== 'delivery').slice(0, PRICE_CARD_PROMISE_LIMIT);
}
