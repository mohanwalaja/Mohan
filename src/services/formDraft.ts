/**
 * A short-lived draft of the customer's OWN in-progress order form.
 *
 * WHY THIS EXISTS
 *   The four report forms keep their inputs in React state only. A visitor who
 *   filled in a name, date, time and birth place and then left the page — the
 *   navbar Login link, or a browser refresh — lost everything and had to type
 *   it all again. Signing in from the page itself never lost it (the Google
 *   popup does not reload the page), which is why this only bites on the two
 *   routes above.
 *
 * WHAT THIS IS NOT
 *   It is not the saved-profile auto-fill that was deliberately removed. The
 *   draft holds only what this visitor typed in this browser tab, it expires
 *   after 30 minutes, it is consumed exactly once, and an explicit dashboard
 *   "Order for <name>" hand-off always wins over it. Nothing is ever read from
 *   the account profile, and no draft survives the tab: the store is the
 *   per-tab session one, never the device-wide one, so a shared computer keeps
 *   nothing after the tab closes.
 *
 * Every read is defensive: corrupt JSON, a stale timestamp, a wrong shape or a
 * browser that throws on storage access all fall back to "no draft", so a form
 * simply starts blank.
 */

/** How long a half-filled form is kept. Short on purpose: it is a convenience
 *  for one sitting, not a record of the customer's data. */
export const FORM_DRAFT_TTL_MS = 30 * 60 * 1000;

/** Tolerance for a clock that ticks slightly between the write and the read. */
const CLOCK_SKEW_MS = 60 * 1000;

const DRAFT_KEY_PREFIX = 'astrosivam.formDraft.';

const WRITE_DELAY_MS = 400;

export { WRITE_DELAY_MS as FORM_DRAFT_WRITE_DELAY_MS };

/** The subset of the Web Storage API this module uses. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftOptions {
  /** Explicit storage — tests, or a caller that wants a different store. */
  storage?: DraftStorage | null;
  /** Explicit clock (tests). */
  now?: number;
}

interface StoredDraft<T> {
  savedAt: number;
  data: T;
}

/**
 * The storage to use. Resolved on every call — never captured at import time —
 * so a test can install a fake `globalThis.sessionStorage` and so private-mode
 * browsers (where the getter itself can throw) degrade to "no draft".
 */
function storageFor(options?: DraftOptions): DraftStorage | null {
  if (options && 'storage' in options) return options.storage ?? null;
  try {
    const candidate = (globalThis as any).sessionStorage;
    return candidate && typeof candidate.getItem === 'function' ? (candidate as DraftStorage) : null;
  } catch {
    return null;
  }
}

/** The storage key for one page's draft ('baby-naming' → a namespaced key). */
export const formDraftKey = (route: string): string =>
  `${DRAFT_KEY_PREFIX}${String(route ?? '').trim().toLowerCase()}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Save the current form values. Returns false when there is nothing to keep or
 * no storage to keep it in — the caller never has to care which.
 */
export function writeFormDraft<T extends object>(route: string, data: T, options?: DraftOptions): boolean {
  const storage = storageFor(options);
  if (!storage || !isPlainObject(data) || Object.keys(data).length === 0) return false;
  const savedAt = options?.now ?? Date.now();
  if (!Number.isFinite(savedAt)) return false;
  try {
    const envelope: StoredDraft<T> = { savedAt, data };
    storage.setItem(formDraftKey(route), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/**
 * The draft for one page, or null. A draft is returned at most once per write:
 * callers consume it and the hook clears the stored copy immediately, so a
 * stale draft can never reappear over a form the customer has since edited.
 */
export function readFormDraft<T extends object>(route: string, options?: DraftOptions): T | null {
  const storage = storageFor(options);
  if (!storage) return null;
  const key = formDraftKey(route);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try { storage.removeItem(key); } catch { /* nothing else to do */ }
    return null;
  }

  const now = options?.now ?? Date.now();
  if (!isPlainObject(parsed)) {
    try { storage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
  const savedAt = Number(parsed.savedAt);
  const data = parsed.data;
  const age = now - savedAt;
  if (!Number.isFinite(savedAt) || age > FORM_DRAFT_TTL_MS || age < -CLOCK_SKEW_MS || !isPlainObject(data)) {
    try { storage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
  return data as unknown as T;
}

/** Drop a page's draft (after an order is placed, or when the form is cleared). */
export function clearFormDraft(route: string, options?: DraftOptions): void {
  const storage = storageFor(options);
  if (!storage) return;
  try {
    storage.removeItem(formDraftKey(route));
  } catch {
    /* private mode: there was nothing stored anyway */
  }
}

/* -------------------------------------------------------------------------- */
/*  The two decisions a form makes, kept pure so they can be tested without a  */
/*  DOM: whether a stored draft may be filled back in, and whether the current  */
/*  values are worth keeping.                                                 */
/* -------------------------------------------------------------------------- */

export interface TakeDraftOptions extends DraftOptions {
  /** A dashboard "Order for <name>" hand-off waiting to be applied. */
  pendingHandOff?: string;
}

/**
 * Consume the stored draft for one page and decide whether it may be restored.
 *
 * Returns the draft only when the form is genuinely empty and no explicit
 * saved-person hand-off is waiting; in every case the stored copy is dropped,
 * so a draft is used at most once and can never come back later over a form the
 * customer has since edited.
 */
export function takeFormDraft<T extends object>(
  route: string,
  formIsEmpty: boolean,
  options?: TakeDraftOptions
): T | null {
  const pending = typeof options?.pendingHandOff === 'string' ? options.pendingHandOff.trim() : '';
  if (pending) {
    // The customer chose a saved person; their half-typed form steps aside.
    clearFormDraft(route, options);
    return null;
  }
  const draft = readFormDraft<T>(route, options);
  clearFormDraft(route, options);
  return draft && formIsEmpty ? draft : null;
}

/**
 * Keep the draft in step with the form: empty form → nothing stored, otherwise
 * store the current values. Returns true when something was written.
 */
export function refreshFormDraft<T extends object>(
  route: string,
  formIsEmpty: boolean,
  snapshot: () => T,
  options?: DraftOptions
): boolean {
  if (formIsEmpty) {
    clearFormDraft(route, options);
    return false;
  }
  return writeFormDraft(route, snapshot(), options);
}

/* -------------------------------------------------------------------------- */
/*  Sanitizers — a draft is untrusted input, so every field is checked again   */
/*  before it reaches a form. Dates, times and places are validated by the     */
/*  existing helpers in utils/birthDetails.ts; these cover text and enums.     */
/* -------------------------------------------------------------------------- */

/** A trimmed string no longer than `maxLength`, or '' for anything else. */
export function restorableText(value: unknown, maxLength = 120): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** One of `allowed`, or the fallback — for gender, language, event, month. */
export function restorableChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * A picked place, or null. The whole object is returned untouched when it is
 * sound, so no field a map pick carried (state, city, area, IANA zone) is lost.
 *
 * This is the same shape test the order forms already apply with
 * `isVerifiedBirthLocation()`; tests/form-draft-and-login-return.test.ts checks
 * the two agree, so a place that could not be ordered can never be restored
 * into a form either.
 */
export function restorableLocation<T>(value: unknown): T | null {
  if (!isPlainObject(value)) return null;
  const place = value as Record<string, unknown>;
  if (typeof place.placeName !== 'string' || !place.placeName.trim()) return null;
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  const offset = Number(place.timezoneOffsetHours);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  if (!Number.isFinite(offset) || Math.abs(offset) > 14) return null;
  return value as T;
}
