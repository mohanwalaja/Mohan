/**
 * Where a signed-out visitor was before they went to the login / register page.
 *
 * WHY THIS EXISTS
 *   The report forms used to be reachable only by staying on the page: the
 *   "Quick Sign In" strip opens a popup and the form survives it. But a visitor
 *   who instead clicked **Login** in the navbar left the page, and after a
 *   successful sign-in landed on the Dashboard — the half-filled order they had
 *   just typed was gone. Together with the form draft
 *   (services/formDraft.ts) this puts them back on the same page with the same
 *   details in the fields.
 *
 * The value lives in sessionStorage, so it is per tab and disappears with it.
 * It is also strictly whitelisted: only real in-app route keys can be stored or
 * returned, so nothing outside the app can be reached through it.
 */

const AUTH_RETURN_STORAGE_KEY = 'astrosivam.authReturnRoute';

/**
 * Routes worth returning to after a sign-in. Deliberately excludes the auth
 * pages themselves, the dashboard (already the default destination), home,
 * the admin portal and the 404 page.
 */
export const RETURNABLE_AUTH_ROUTES: readonly string[] = Object.freeze([
  'birth-jathagam',
  'marriage-compatibility',
  'baby-naming',
  'muhurtham',
  'services',
  'how-it-works',
  'about',
  'team',
  'contact'
]);

/** The subset of the Web Storage API used here. */
export interface ReturnRouteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ReturnRouteOptions {
  storage?: ReturnRouteStorage | null;
}

function storageFor(options?: ReturnRouteOptions): ReturnRouteStorage | null {
  if (options && 'storage' in options) return options.storage ?? null;
  try {
    const candidate = (globalThis as any).sessionStorage;
    return candidate && typeof candidate.getItem === 'function' ? (candidate as ReturnRouteStorage) : null;
  } catch {
    return null;
  }
}

/** Normalize a route key the way the router stores it. */
function normalizeRoute(route: unknown): string {
  if (typeof route !== 'string') return '';
  const key = route.trim().toLowerCase();
  if (!key || key.length > 64) return '';
  // A route key is a slug: letters, digits and hyphens. Anything else (a path,
  // a URL, a query string) is rejected rather than stored.
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ? key : '';
}

/** True when a sign-in should send the customer back to this route. */
export function isReturnableAuthRoute(route: unknown): boolean {
  const key = normalizeRoute(route);
  return key !== '' && RETURNABLE_AUTH_ROUTES.includes(key);
}

/**
 * Remember the page a signed-out visitor is on. Called on every route change
 * while nobody is signed in; non-returnable routes are ignored, so the last
 * real page they were on is the one they come back to.
 */
export function rememberRouteForAuth(route: unknown, options?: ReturnRouteOptions): boolean {
  if (!isReturnableAuthRoute(route)) return false;
  const storage = storageFor(options);
  if (!storage) return false;
  try {
    storage.setItem(AUTH_RETURN_STORAGE_KEY, normalizeRoute(route));
    return true;
  } catch {
    return false;
  }
}

/** The remembered route without consuming it ('' when there is none). */
export function peekAuthReturnRoute(options?: ReturnRouteOptions): string {
  const storage = storageFor(options);
  if (!storage) return '';
  try {
    const stored = normalizeRoute(storage.getItem(AUTH_RETURN_STORAGE_KEY));
    return isReturnableAuthRoute(stored) ? stored : '';
  } catch {
    return '';
  }
}

/**
 * The remembered route, consumed exactly once. After a sign-in the customer is
 * sent back to the page they left; a second sign-in in the same tab starts from
 * the default destination again.
 */
export function consumeAuthReturnRoute(options?: ReturnRouteOptions): string {
  const storage = storageFor(options);
  if (!storage) return '';
  let stored = '';
  try {
    stored = normalizeRoute(storage.getItem(AUTH_RETURN_STORAGE_KEY));
    storage.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch {
    return '';
  }
  return isReturnableAuthRoute(stored) ? stored : '';
}

/** Forget the remembered page (e.g. when the visitor cancels the sign-in). */
export function clearAuthReturnRoute(options?: ReturnRouteOptions): void {
  const storage = storageFor(options);
  if (!storage) return;
  try {
    storage.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch {
    /* nothing stored, nothing to do */
  }
}

/**
 * Where a successful sign-in should go: the admin portal for an admin account,
 * otherwise the page the visitor left, otherwise their dashboard.
 */
export function postAuthRoute(role?: string | null, options?: ReturnRouteOptions): string {
  if (String(role ?? '').trim().toLowerCase() === 'admin') return 'admin';
  return consumeAuthReturnRoute(options) || 'dashboard';
}
