/**
 * First-attempt Google sign-in / sign-up (new visitors).
 *
 * REPORTED: "when a new user registers or signs in with Google, the first
 * attempt does not log them in; after clicking Try Again once or twice it
 * works."
 *
 * ROOT CAUSES (all reproduced in a real browser before the fix, see
 * docs/GOOGLE_LOGIN_FIRST_ATTEMPT_FIX.md):
 *   1. The button was clickable before it could work. A first-time visitor has
 *      neither the Google SDK nor the public settings (which carry the Google
 *      client id) cached, so an early click answered "could not be reached" /
 *      "not configured". "Try Again" worked a moment later.
 *   2. If the first settings request hit the app's 4 s first-paint timeout
 *      nothing ever asked again, so "Try Again" could never succeed until a
 *      full page reload.
 *   3. No error_callback: closing/blocking the Google window left the button on
 *      "Connecting to Google..." forever.
 *   4. A transient failure after the Google step (cold host, proxy 502/503,
 *      a dropped connection) forced the visitor through Google again, and the
 *      server counted "could not reach Google" as the visitor's failed login.
 *   5. Two overlapping requests for the same brand-new account raced on the
 *      INSERT; the loser answered 503 although the account now existed.
 *
 * WHAT RUNS HERE
 *   1. The GSI loader state machine, executed against a fake DOM + fake clock.
 *   2. api.googleLogin's retry/timeout behaviour, executed against a fake fetch.
 *   3. The button's first render (what a first-time visitor starts in) and the
 *      source contracts that keep the popup synchronous with the click.
 *   4. Static contracts of the PHP routes (always).
 *   5. The REAL auth router under PHP-WASM (SQLite + scripted Google, no
 *      network) when the dev-only runtime is installed:
 *        npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 *      (SKIPPED otherwise, like the other php-wasm suites.)
 *
 * The real-browser reproduction (slow SDK, slow settings, popup closed, 503)
 * lives in tests/browser/google-first-attempt.spec.ts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider } from '../src/context/AuthContext';
import { GoogleLoginButton } from '../src/components/common/GoogleLoginButton';
import { api } from '../src/services/api';
import {
  createGoogleIdentityLoader,
  GOOGLE_GSI_SCRIPT_ID,
  GOOGLE_GSI_SRC,
  type GoogleIdentityStatus
} from '../src/services/googleIdentity';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** Source without comments: "this must not exist any more" checks must not trip on the explanation. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

// ---------------------------------------------------------------------------
// 1. The Google SDK loader, against a fake DOM and a fake clock
// ---------------------------------------------------------------------------

class FakeScript {
  id = '';
  src = '';
  async = false;
  defer = false;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(private readonly dom: FakeBrowser) {}
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ||= []).push(listener);
  }
  remove() {
    const index = this.dom.attached.indexOf(this);
    if (index >= 0) this.dom.attached.splice(index, 1);
  }
  fire(type: 'load' | 'error') {
    (this.listeners[type] || []).slice().forEach(listener => listener());
  }
}

class FakeBrowser {
  attached: FakeScript[] = [];
  /** Every <script> ever created, in order (a removed tag stays listed). */
  created: FakeScript[] = [];
  win: { google?: any } = {};
  private now = 0;
  private nextTimer = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  readonly env = {
    win: () => this.win,
    doc: () => ({
      getElementById: (id: string) => this.attached.find(script => script.id === id) ?? null,
      createElement: (_tag: string) => {
        const script = new FakeScript(this);
        this.created.push(script);
        return script;
      },
      head: { appendChild: (script: FakeScript) => void this.attached.push(script) },
      body: null,
      documentElement: { appendChild: (script: FakeScript) => void this.attached.push(script) }
    }) as any,
    setTimeout: (fn: () => void, ms: number) => {
      const id = this.nextTimer++;
      this.timers.set(id, { at: this.now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => void this.timers.delete(id as number)
  };

  /** Moves the fake clock forward, running every timer that falls due. */
  advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Infinity;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at;
          nextId = id;
        }
      }
      if (nextId < 0) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.now = timer.at;
      timer.fn();
    }
    this.now = target;
  }

  /** The browser finished downloading the SDK: it defines google.accounts and fires `load`. */
  deliverSdk(script: FakeScript) {
    this.win.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } };
    script.fire('load');
  }
}

console.log('--- GOOGLE SIGN-IN, FIRST ATTEMPT: SDK loader ---');

await check('one <script> no matter how many buttons ask for it, with the right attributes', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  loader.start();
  loader.start();
  assert.equal(browser.created.length, 1, 'concurrent starts must share one download');
  const [script] = browser.created;
  assert.equal(script.id, GOOGLE_GSI_SCRIPT_ID);
  assert.equal(script.src, GOOGLE_GSI_SRC);
  assert.equal(GOOGLE_GSI_SRC, 'https://accounts.google.com/gsi/client');
  assert.ok(script.async && script.defer);
  assert.equal(loader.getStatus(), 'loading');
  assert.equal(loader.isReady(), false);
});

await check('the status goes loading -> ready only when the SDK really exists, and subscribers hear about it', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  const seen: GoogleIdentityStatus[] = [];
  const unsubscribe = loader.subscribe(() => seen.push(loader.getStatus()));
  loader.start();
  browser.deliverSdk(browser.created[0]);
  assert.deepEqual(seen, ['loading', 'ready']);
  assert.equal(loader.isReady(), true);
  loader.start();
  assert.equal(browser.created.length, 1, 'a ready SDK is never downloaded again');
  unsubscribe();
  loader.start();
  assert.deepEqual(seen, ['loading', 'ready'], 'an unsubscribed listener hears nothing more');
});

await check('an SDK that is already on the page is used as-is (no download)', () => {
  const browser = new FakeBrowser();
  browser.win.google = { accounts: { oauth2: { initTokenClient() {} } } };
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  assert.equal(loader.getStatus(), 'ready');
  assert.equal(browser.created.length, 0);
});

await check('a failed download is removed and re-requested automatically (offline blip, DNS, HTTP error)', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  browser.created[0].fire('error');
  assert.equal(browser.attached.length, 0, 'the dead tag must be removed, or a retry would be a no-op');
  assert.equal(loader.getStatus(), 'loading', 'the visitor still sees "preparing", not an error, during the automatic retry');
  browser.advance(700);
  assert.equal(browser.created.length, 2, 'first retry after 700 ms');
  browser.deliverSdk(browser.created[1]);
  assert.equal(loader.getStatus(), 'ready');
});

await check('after the automatic retries are used up the status is "failed", and a later start() tries again', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  browser.created[0].fire('error');
  browser.advance(700);
  browser.created[1].fire('error');
  assert.equal(loader.getStatus(), 'loading');
  browser.advance(1800);
  browser.created[2].fire('error');
  assert.equal(loader.getStatus(), 'failed');
  browser.advance(60_000);
  assert.equal(browser.created.length, 3, 'three attempts in total, then it stops');

  loader.start(); // "Try Again" / the next time a button mounts
  assert.equal(loader.getStatus(), 'loading');
  assert.equal(browser.created.length, 4);
  browser.deliverSdk(browser.created[3]);
  assert.equal(loader.getStatus(), 'ready');
});

await check('a script that loads WITHOUT defining the SDK (blocked / blank response) counts as a failure', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  browser.created[0].fire('load'); // no browser.win.google
  assert.equal(browser.attached.length, 0);
  assert.equal(loader.getStatus(), 'loading');
  browser.advance(700);
  assert.equal(browser.created.length, 2);
});

await check('a slow download reports "failed" after 10 s but is NOT duplicated, and a late load still wins', () => {
  const browser = new FakeBrowser();
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  browser.advance(9_999);
  assert.equal(loader.getStatus(), 'loading');
  browser.advance(1);
  assert.equal(loader.getStatus(), 'failed');
  assert.equal(browser.attached.length, 1, 'the slow tag stays: removing it would throw the download away');

  loader.start(); // "Try Again" while the original request is still running
  assert.equal(browser.created.length, 1, 'must not start a second request for the same file');
  assert.equal(loader.getStatus(), 'loading');

  browser.deliverSdk(browser.created[0]);
  assert.equal(loader.getStatus(), 'ready');
  browser.advance(120_000);
  assert.equal(loader.getStatus(), 'ready', 'the soft timeout must be cancelled once the SDK arrived');
});

await check('a stale tag with the same id (not ours) is replaced instead of trusted', () => {
  const browser = new FakeBrowser();
  const stale = new FakeScript(browser);
  stale.id = GOOGLE_GSI_SCRIPT_ID;
  browser.attached.push(stale);
  const loader = createGoogleIdentityLoader(browser.env);
  loader.start();
  assert.equal(browser.attached.includes(stale), false);
  assert.equal(browser.attached.length, 1);
  assert.equal(browser.created.length, 1);
});

await check('server rendering / prerendering is safe: no window or document, no throw, status stays idle', () => {
  const loader = createGoogleIdentityLoader({
    win: () => undefined,
    doc: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined
  });
  loader.start();
  assert.equal(loader.getStatus(), 'idle');
  assert.equal(loader.isReady(), false);
});

await check('the module touches neither window nor document at import time (pages are prerendered in Node)', () => {
  const source = code(read('src/services/googleIdentity.ts'));
  const topLevel = source.split('\n').filter(line => !/^\s/.test(line)).join('\n');
  assert.doesNotMatch(topLevel.replace(/typeof (window|document)/g, ''), /\b(window|document)\./);
});

// ---------------------------------------------------------------------------
// 2. api.googleLogin: transient failures are re-sent, real rejections are not
// ---------------------------------------------------------------------------

console.log('--- GOOGLE SIGN-IN, FIRST ATTEMPT: login request resilience ---');

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;

/** Collapses the retry back-off (800 / 2000 ms) and the 30 s request timeout so the suite stays fast. */
function fastTimers() {
  (globalThis as any).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) =>
    realSetTimeout(fn, ms === 800 || ms === 2000 ? 0 : ms === 30_000 ? 25 : ms, ...args);
  return () => {
    (globalThis as any).setTimeout = realSetTimeout;
  };
}

const sessionBody = {
  success: true,
  token: 'signed.test.token',
  user: { id: 'usr_test', name: 'New Person', email: 'new.person@example.test', mobile: '', role: 'customer', country: '' },
  birthProfile: null
};
const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json' }
  });

type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Runs api.googleLogin against a scripted fetch; returns the outcome and every request seen. */
async function googleLoginWith(responders: Responder[]) {
  const calls: string[] = [];
  let index = 0;
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    calls.push(String(url));
    const responder = responders[Math.min(index++, responders.length - 1)];
    return responder(String(url), init);
  };
  const restore = fastTimers();
  try {
    const result: any = await api.googleLogin({ accessToken: 'test-access-token' });
    return { result, calls };
  } finally {
    restore();
    (globalThis as any).fetch = realFetch;
  }
}

const networkDown: Responder = () => {
  throw new TypeError('Failed to fetch');
};
const GOOGLE_ENDPOINT = '/api/auth/index.php?action=google';
const GOOGLE_FALLBACK_ENDPOINT = '/api/auth/google';

await check('a 503 from the host is re-sent with the SAME token and signs the visitor in (no second Google window)', async () => {
  const { result, calls } = await googleLoginWith([() => reply(503, { success: false, message: 'Service temporarily unavailable.' }), () => reply(200, sessionBody)]);
  assert.equal(result.success, true);
  assert.equal(result.user.id, 'usr_test');
  assert.deepEqual(calls, [GOOGLE_ENDPOINT, GOOGLE_ENDPOINT]);
});

await check('a dropped connection is retried, and the same request is NOT also posted to the alias endpoint', async () => {
  const { result, calls } = await googleLoginWith([networkDown, () => reply(200, sessionBody)]);
  assert.equal(result.success, true);
  assert.deepEqual(calls, [GOOGLE_ENDPOINT, GOOGLE_ENDPOINT], 'a network error must not silently duplicate the login on /auth/google');
});

await check('a request that hangs is abandoned (aborted) and sent again', async () => {
  const hangs: Responder = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const { result, calls } = await googleLoginWith([hangs, () => reply(200, sessionBody)]);
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
});

await check('an API reply flagged retryable is retried even on HTTP 500 (database connection refused)', async () => {
  const { result, calls } = await googleLoginWith([
    () => reply(500, { success: false, retryable: true, message: 'Database service temporarily unavailable. Please try again later.' }),
    () => reply(200, sessionBody)
  ]);
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
});

await check('a proxy error page (HTML 502) is retried', async () => {
  const { result, calls } = await googleLoginWith([() => reply(502, '<html><body>Bad gateway</body></html>'), () => reply(200, sessionBody)]);
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
});

await check('a REAL rejection (401) is final: one request, the server message is kept, nothing is retried', async () => {
  const { result, calls } = await googleLoginWith([() => reply(401, { success: false, message: 'Could not verify Google login. Please try again.' })]);
  assert.equal(result.success, false);
  assert.equal(result.message, 'Could not verify Google login. Please try again.');
  assert.equal(calls.length, 1);
});

await check('conflicts and disabled sign-in are final too (409 / 403)', async () => {
  for (const status of [409, 403, 429]) {
    const { result, calls } = await googleLoginWith([() => reply(status, { success: false, message: `refused ${status}` })]);
    assert.equal(result.success, false);
    assert.equal(calls.length, 1, `HTTP ${status} must not be retried`);
  }
});

await check('it gives up after three attempts in total and reports the last server message', async () => {
  const { result, calls } = await googleLoginWith([() => reply(503, { success: false, message: 'Service temporarily unavailable. Please try again shortly.' })]);
  assert.equal(result.success, false);
  assert.equal(result.message, 'Service temporarily unavailable. Please try again shortly.');
  assert.equal(calls.length, 3);
});

await check('persistent network failure ends with a plain-language message, not "Failed to fetch"', async () => {
  const { result, calls } = await googleLoginWith([networkDown]);
  assert.equal(result.success, false);
  assert.match(result.message, /could not reach the sign-in service/i);
  assert.equal(calls.length, 3);
});

await check('a missing primary route (404) still falls through to the alias endpoint, as before', async () => {
  const { result, calls } = await googleLoginWith([() => reply(404, { success: false, message: 'API endpoint not found' }), () => reply(200, sessionBody)]);
  assert.equal(result.success, true);
  assert.deepEqual(calls, [GOOGLE_ENDPOINT, GOOGLE_FALLBACK_ENDPOINT]);
});

await check('a 200 without a verified user/token is still refused (no fabricated session)', async () => {
  const { result } = await googleLoginWith([() => reply(200, { success: true })]);
  assert.equal(result.success, false);
});

await check('getSettings keeps the 4 s first-paint bound and only a retry is patient', () => {
  const source = read('src/services/api.ts');
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 4000\)/, 'the first-paint bound is part of the boot contract');
  assert.match(source, /patientMs \? fetchSettingsPatiently\(url, patientMs\) : fetchSettingsWithTimeout\(url\)/);
});

// ---------------------------------------------------------------------------
// 3. The button: what a first-time visitor starts in, and the click contract
// ---------------------------------------------------------------------------

console.log('--- GOOGLE SIGN-IN, FIRST ATTEMPT: the button ---');

const buttonSource = read('src/components/common/GoogleLoginButton.tsx');
const buttonCode = code(buttonSource);

await check('a first-time visitor (no cached settings, SDK not loaded) gets a disabled "Preparing" button — never a clickable one that fails', () => {
  const html = renderToStaticMarkup(
    React.createElement(AuthProvider, null, React.createElement(GoogleLoginButton, { mode: 'register' }))
  );
  assert.match(html, /id="google-login-btn"/);
  assert.match(html, /disabled=""/, 'the button must not be clickable before Google can really open');
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Preparing Google sign-in/);
  assert.doesNotMatch(html, /Sign Up with Google|Continue with Google/, 'the normal label only appears once the click can work');
});

await check('the shared loader owns the <script>; the button no longer injects one at mount', () => {
  assert.doesNotMatch(buttonCode, /createElement\(['"]script['"]\)/);
  assert.doesNotMatch(buttonCode, /google-gsi-client/);
  assert.match(buttonCode, /googleIdentity\.start\(\)/);
  assert.match(buttonCode, /useSyncExternalStore/);
});

await check('the popup still opens synchronously inside the click (no await before requestAccessToken)', () => {
  const start = buttonCode.indexOf('const startGoogleFlow = () => {');
  assert.ok(start > 0, 'startGoogleFlow must exist');
  const end = buttonCode.indexOf('\n  };\n', start);
  const body = buttonCode.slice(start, end);
  assert.doesNotMatch(body, /\bawait\b/, 'browsers only allow window.open() from the user gesture; awaiting first gets the popup blocked');
  assert.match(body, /tokenClient\.requestAccessToken\(\)/);
  const clickHandler = buttonCode.slice(buttonCode.indexOf('const handleGoogleClick = () => {'), buttonCode.indexOf('const handleRetry'));
  assert.doesNotMatch(clickHandler, /\bawait\b/);
  assert.match(clickHandler, /case 'ready':\s*startGoogleFlow\(\)/);
});

await check('a closed or blocked Google window releases the button (error_callback), and "closed" is not shown as an error', () => {
  assert.match(buttonCode, /error_callback:\s*handleTokenError/);
  const handler = buttonCode.slice(buttonCode.indexOf('const handleTokenError'), buttonCode.indexOf('// Everything from the click'));
  assert.match(handler, /finishFlow\(\)/);
  assert.match(handler, /popup_closed/);
  assert.match(handler, /popup_failed_to_open/);
});

await check('the button is disabled while preparing and its failure states re-prepare instead of repeating a doomed click', () => {
  assert.match(buttonCode, /disabled=\{isBusy\}/);
  assert.match(buttonCode, /const isBusy = isLoading \|\| phase === 'preparing'/);
  const retry = buttonCode.slice(buttonCode.indexOf('const handleRetry'), buttonCode.indexOf('const isBusy'));
  assert.match(retry, /prepareAgain\(\)/);
  assert.match(buttonCode, /refreshSettings\(\{ timeoutMs: SETTINGS_HEAL_TIMEOUT_MS \}\)/, 'a missing client id is re-fetched with a patient timeout');
});

await check('two verifications can never run at once from one page (the second token is ignored)', () => {
  assert.match(buttonCode, /if \(loginInFlight\.current\) return;/);
});

await check('signing in no longer waits on the settings refresh (that silence looked like a failed attempt)', () => {
  const auth = code(read('src/context/AuthContext.tsx'));
  const googleLogin = auth.slice(auth.indexOf('const googleLogin = async'), auth.indexOf('const logout = () =>'));
  assert.doesNotMatch(googleLogin, /await refreshSettings\(\)/);
  assert.match(googleLogin, /void refreshSettings\(\)/);
  assert.match(auth, /const settingsRequest = refreshSettings\(\)/, 'the startup contract is untouched');
});

// ---------------------------------------------------------------------------
// 4. PHP: static contracts (always run)
// ---------------------------------------------------------------------------

console.log('--- GOOGLE SIGN-IN, FIRST ATTEMPT: PHP routes (static contracts) ---');

const authPhp = read('api/auth/index.php');
const configPhp = read('api/config.php');
const googleLoginPhp = read('api/google_login.php');

/** Source of one top-level route block in the router. */
function routeBlock(marker: string): string {
  const start = authPhp.indexOf(marker);
  assert.ok(start >= 0, `route marker not found: ${marker}`);
  const next = authPhp.indexOf('\nif (', start + marker.length);
  return authPhp.slice(start, next < 0 ? undefined : next);
}
const googleRoute = routeBlock('if ($isGoogleRoute) {');
const facebookRoute = routeBlock('if ($isFacebookRoute) {');

await check('"Google could not be reached" is answered before (and never counts as) a failed credential', () => {
  const unavailable = googleRoute.indexOf("$googleFailure === 'unavailable'");
  const record = googleRoute.indexOf("astro_auth_failure_record($pdo, $googleClientIp, 'google-login')");
  assert.ok(unavailable > 0 && record > 0 && unavailable < record, 'the transient branch must return before the failure is recorded');
  const branch = googleRoute.slice(unavailable, record);
  assert.match(branch, /'retryable' => true/);
  assert.match(branch, /503/);
  assert.doesNotMatch(branch, /astro_auth_failure_record/);
});

await check('the verifier reports WHY it failed and talks to Google through the detailed transport', () => {
  const start = googleLoginPhp.indexOf('function astro_verify_google_login(');
  assert.ok(start > 0, 'astro_verify_google_login must exist in api/google_login.php');
  const body = googleLoginPhp.slice(start);
  assert.match(body, /&\$failure = null/);
  assert.doesNotMatch(body, /httpGetJson\(/, 'the Google verifier must not use the legacy transport that hides the failure reason');
  assert.match(body, /astro_http_get_json_detailed/);
  assert.match(configPhp, /function httpGetJson\(\$url, \$timeoutSeconds = 8\)/, 'the legacy helper is kept for the Facebook verifier');
  assert.match(googleRoute, /astro_verify_google_login\(\$credential, \$clientAccessToken, \$expectedGoogleClientId, \$googleFailure\)/);
  assert.doesNotMatch(googleRoute, /\bverifyGoogleLogin\(/, 'the route must use the new verifier');
});

await check('the fix lives in a deployed file: both deploy paths KEEP the live config.php, so nothing new may depend on it', () => {
  // This is the reason api/google_login.php exists. A fix placed in config.php would pass every test
  // here and silently never reach production (the same lesson as api/request_body.php).
  assert.match(read('.cpanel.yml'), /\[ "\$relative" = "config\.php" \] && \[ -f "\$target" \]; then continue/);
  assert.match(read('deploy_cpanel.sh'), /CONFIG_BACKUP/);
  assert.doesNotMatch(configPhp, /function astro_http_get_json_detailed\(|function astro_verify_google_login\(/);
  assert.match(authPhp, /require_once __DIR__ \. '\/\.\.\/google_login\.php';/);
  assert.match(googleLoginPhp, /require_once __DIR__ \. '\/config\.php';/);
  // Only helpers config.php has always defined may be relied on from the deployed file.
  for (const helper of ['googleTokenAudienceMatches', 'googleEmailIsVerified', 'cleanDisplayName']) {
    assert.match(configPhp, new RegExp(`function ${helper}\\(`), `${helper} must stay defined in config.php`);
  }
});

await check('both social routes create users through one race-safe helper (no bare INSERT in the routes)', () => {
  for (const [name, route] of [['google', googleRoute], ['facebook', facebookRoute]] as const) {
    assert.match(route, new RegExp(`astro_create_social_user\\(\\$pdo, '${name}'`), `${name} must use the helper`);
    assert.doesNotMatch(route, /INSERT INTO users/, `${name} must not INSERT directly any more`);
  }
  const helper = authPhp.slice(authPhp.indexOf('function astro_create_social_user('), authPhp.indexOf('// Password reset and session revocation'));
  assert.match(helper, /'23000'/, 'a duplicate-key hit is the lost race, not a failure');
  assert.match(helper, /auth_provider = \? AND provider_subject = \?/);
});

await check('the social routes answer in JSON for every failure and log the cause', () => {
  for (const [name, route] of [['google', googleRoute], ['facebook', facebookRoute]] as const) {
    assert.match(route, /catch \(PDOException \$e\)/);
    assert.match(route, /catch \(Throwable \$e\)/, `${name}: an unexpected error must not escape as a bare HTTP 500`);
    assert.match(route, new RegExp(`error_log\\('ASTRO SIVAM: ${name}-login`), `${name}: failures must reach the PHP error log`);
  }
  assert.match(googleRoute, /'retryable' => true, 'message' => 'Service temporarily unavailable/);
});

await check('a refused database connection is flagged retryable (shared hosting "too many connections")', () => {
  const db = read('api/db.php');
  const catchBlock = db.slice(db.indexOf('} catch (PDOException $e) {'), db.indexOf('function astro_ensure_auth_security_schema'));
  assert.match(catchBlock, /'retryable' => true/);
  assert.match(catchBlock, /\], 500\)/, 'the HTTP status of the existing contract is unchanged');
});

// ---------------------------------------------------------------------------
// 5. PHP: the REAL auth router under PHP-WASM
// ---------------------------------------------------------------------------

const PHP_WASM_INSTALL = 'npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54';
const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  if (process.env.ASTRO_REQUIRE_PHP_WASM_TESTS === '1') {
    throw new Error(`ASTRO_REQUIRE_PHP_WASM_TESTS=1 but @php-wasm/node is not installed. Install it with: ${PHP_WASM_INSTALL}`);
  }
  console.log('  [SKIP] @php-wasm/node is not installed - the real auth router checks did not run.');
  console.log(`         ${PHP_WASM_INSTALL}`);
  console.log(`\n[OK] google login first attempt: ${passed} checks passed (PHP runtime skipped)`);
  process.exit(0);
}

const { createAuthApiBridge, TEST_GOOGLE_CLIENT_ID } = await import('../scripts/php-auth-api-bridge.mjs');
const aud = TEST_GOOGLE_CLIENT_ID;
const tokenInfo = (sub: string, email: string) => [{ data: { aud, azp: aud, sub, email, email_verified: 'true' }, status: 200 }];
const userInfo = (sub: string, email: string, name = 'Test Person') => [{ data: { sub, email, email_verified: true, name }, status: 200 }];
const googleSays = (sub: string, email: string, name?: string) => ({ tokeninfo: tokenInfo(sub, email), userinfo: userInfo(sub, email, name) });
const unreachable = { data: null, status: 0, transient: true };

for (const phpVersion of ['8.1', '8.4']) {
  console.log(`--- GOOGLE SIGN-IN, FIRST ATTEMPT: real auth router under PHP ${phpVersion} (SQLite + scripted Google) ---`);
  const bridge = await createAuthApiBridge({ phpVersion });
  const tag = `PHP ${phpVersion}:`;

  await check(`${tag} a brand-new Google account is created and signed in on the FIRST request`, async () => {
    await bridge.reset();
    bridge.scriptGoogle(googleSays('sub-new', 'new.person@example.test', 'New Person'));
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.success, true);
    assert.match(res.json.token, /\S{20,}/);
    assert.equal(res.json.user.email, 'new.person@example.test');
    assert.equal(res.json.user.name, 'New Person');
    assert.equal(res.json.birthProfile, null);
    const users = await bridge.users();
    assert.equal(users.length, 1);
    assert.equal(users[0].auth_provider, 'google');
    assert.equal(users[0].provider_subject, 'sub-new');
    assert.equal(await bridge.failureHits(), 0, 'a successful sign-in must not touch the failed-login budget');
    assert.match(String(res.headers['set-cookie'] || ''), /./, 'the session/auth cookie is issued');
  });

  await check(`${tag} the same account again is the same user, not a second row`, async () => {
    const first = await bridge.googleLogin({ accessToken: 'tok' });
    const again = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(again.status, 200);
    assert.equal(again.json.user.id, first.json.user.id);
    assert.equal((await bridge.users()).length, 1);
  });

  await check(`${tag} Google briefly unreachable -> 503 retryable, the failed-login budget is NOT charged, and the same token then works`, async () => {
    await bridge.reset();
    bridge.scriptGoogle({
      tokeninfo: [unreachable, ...tokenInfo('sub-retry', 'retry@example.test')],
      userinfo: userInfo('sub-retry', 'retry@example.test')
    });
    const blip = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(blip.status, 503);
    assert.equal(blip.json.success, false);
    assert.equal(blip.json.retryable, true);
    assert.equal(await bridge.failureHits(), 0, 'not being able to reach Google is not the visitor failing to log in');
    assert.match(bridge.phpErrors(), /unreachable \(transient\)/, 'the operator can see it in the PHP error log');
    const retry = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(retry.status, 200, retry.text);
    assert.equal(retry.json.user.email, 'retry@example.test');
  });

  await check(`${tag} the userinfo step failing with a 5xx is treated the same way`, async () => {
    await bridge.reset();
    bridge.scriptGoogle({ tokeninfo: tokenInfo('sub-ui', 'ui@example.test'), userinfo: [{ data: null, status: 503, transient: true }] });
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 503);
    assert.equal(res.json.retryable, true);
    assert.equal(await bridge.failureHits(), 0);
  });

  await check(`${tag} a token Google REJECTS is still a 401, is not retryable, and still counts against the budget`, async () => {
    await bridge.reset();
    bridge.scriptGoogle({ tokeninfo: [{ data: null, status: 400, transient: false }] });
    const res = await bridge.googleLogin({ accessToken: 'forged' });
    assert.equal(res.status, 401);
    assert.equal(res.json.success, false);
    assert.equal(res.json.retryable, undefined);
    assert.ok((await bridge.failureHits()) > 0, 'a rejected credential is a real failed attempt');
    assert.equal((await bridge.users()).length, 0);
  });

  await check(`${tag} a token issued to a DIFFERENT app is rejected (audience binding unchanged)`, async () => {
    await bridge.reset();
    bridge.scriptGoogle({
      tokeninfo: [{ data: { aud: 'someone-else.apps.googleusercontent.com', azp: 'someone-else.apps.googleusercontent.com', sub: 's', email: 'x@example.test', email_verified: 'true' }, status: 200 }]
    });
    const res = await bridge.googleLogin({ accessToken: 'other-app' });
    assert.equal(res.status, 401);
    assert.ok((await bridge.failureHits()) > 0);
    assert.equal((await bridge.users()).length, 0);
  });

  await check(`${tag} an unverified Google e-mail is rejected (email_verified unchanged)`, async () => {
    await bridge.reset();
    bridge.scriptGoogle({
      tokeninfo: tokenInfo('sub-unv', 'unv@example.test'),
      userinfo: [{ data: { sub: 'sub-unv', email: 'unv@example.test', email_verified: false, name: 'Unverified' }, status: 200 }]
    });
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 401);
    assert.equal((await bridge.users()).length, 0);
  });

  await check(`${tag} two requests racing to create the SAME new account: the loser signs in as that account instead of failing`, async () => {
    await bridge.reset();
    bridge.scriptGoogle(googleSays('sub-race', 'race@example.test'));
    bridge.raceBeforeUserInsert(
      "INSERT INTO users (id, name, email, role, auth_provider, provider_subject) VALUES ('usr_winner', 'Racer', 'race@example.test', 'customer', 'google', 'sub-race')"
    );
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.success, true);
    assert.equal(res.json.user.id, 'usr_winner', 'the account the other request created');
    assert.equal((await bridge.users()).length, 1, 'exactly one account');
    bridge.raceBeforeUserInsert('');
  });

  await check(`${tag} the e-mail being taken by a DIFFERENT account in that window is the usual 409, not a 503`, async () => {
    await bridge.reset();
    bridge.scriptGoogle(googleSays('sub-late', 'taken@example.test'));
    bridge.raceBeforeUserInsert(
      "INSERT INTO users (id, name, email, role, auth_provider, provider_subject) VALUES ('usr_other', 'Other', 'taken@example.test', 'customer', 'local', NULL)"
    );
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 409);
    assert.match(res.json.message, /already belongs to an account/);
    bridge.raceBeforeUserInsert('');
  });

  await check(`${tag} an existing e-mail/password account is still never auto-linked or taken over`, async () => {
    await bridge.reset();
    await bridge.exec("INSERT INTO users (id, name, email, role, auth_provider, provider_subject) VALUES ('usr_local', 'Local', 'local@example.test', 'customer', 'local', NULL)");
    bridge.scriptGoogle(googleSays('sub-link', 'local@example.test'));
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 409);
    assert.equal((await bridge.users()).length, 1);
  });

  await check(`${tag} administrators are still refused on the Google route`, async () => {
    await bridge.reset();
    await bridge.exec("INSERT INTO users (id, name, email, role, auth_provider, provider_subject) VALUES ('usr_admin', 'Admin', 'admin@example.test', 'admin', 'google', 'sub-admin')");
    bridge.scriptGoogle(googleSays('sub-admin', 'admin@example.test'));
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 403);
  });

  await check(`${tag} a database failure after verification is JSON 503 + retryable + logged (it used to be silent)`, async () => {
    await bridge.reset();
    bridge.scriptGoogle(googleSays('sub-db', 'db@example.test'));
    await bridge.exec('DROP TABLE birth_profiles');
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 503);
    assert.equal(res.json.success, false);
    assert.equal(res.json.retryable, true);
    assert.match(bridge.phpErrors(), /google-login database error/);
  });

  await check(`${tag} Google sign-in switched off in the admin settings is still honoured`, async () => {
    await bridge.reset({ googleLoginEnabled: false });
    bridge.scriptGoogle(googleSays('sub-off', 'off@example.test'));
    const res = await bridge.googleLogin({ accessToken: 'tok' });
    assert.equal(res.status, 403);
    assert.equal(bridge.googleCalls().length, 0, 'a disabled sign-in must not even call Google');
  });

  await bridge.close();
}

// ---------------------------------------------------------------------------
// 6. PHP: the REAL outbound transport, against a local HTTP server
// ---------------------------------------------------------------------------

console.log('--- GOOGLE SIGN-IN, FIRST ATTEMPT: real HTTP transport under PHP (local server, no internet) ---');
{
  const http = await import('node:http');
  const { PHP } = await import('@php-wasm/universal');
  const { loadNodeRuntime } = await import('@php-wasm/node');

  const requestsSeen: string[] = [];
  const server = http.createServer((req, res) => {
    requestsSeen.push(req.url || '');
    const url = req.url || '';
    if (url.startsWith('/ok')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"hello":"world"}');
    } else if (url.startsWith('/rejected')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"error":"invalid_token"}');
    } else if (url.startsWith('/unavailable')) {
      res.writeHead(503);
      res.end('unavailable');
    } else if (url.startsWith('/notjson')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>not json</html>');
    } else if (url.startsWith('/redirect')) {
      res.writeHead(302, { location: '/ok' });
      res.end();
    } else if (url.startsWith('/slow')) {
      setTimeout(() => {
        res.writeHead(200);
        res.end('{"late":true}');
      }, 3500);
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"missing"}');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  const php = new PHP(await loadNodeRuntime('8.4', { emscriptenOptions: { processId: 4251 } }));
  const mkdir = (dir: string) => {
    let current = '';
    for (const part of dir.split('/').filter(Boolean)) {
      current += `/${part}`;
      if (!php.fileExists(current)) php.mkdir(current);
    }
  };
  mkdir('/repo/api');
  mkdir('/tmp');
  for (const file of ['config.php', 'client_ip.php', 'google_login.php']) php.writeFile(`/repo/api/${file}`, fs.readFileSync(path.join(root, 'api', file)));
  const ran = await php.run({
    env: { APP_SECRET_KEY: 'php-wasm-transport-test-only-secret-0123456789abcdef' },
    code: `<?php
$_SERVER['SCRIPT_NAME'] = '/probe.php';
require_once '/repo/api/google_login.php';
$cases = [
  'ok' => 'http://127.0.0.1:${port}/ok',
  'rejected' => 'http://127.0.0.1:${port}/rejected',
  'unavailable' => 'http://127.0.0.1:${port}/unavailable',
  'notjson' => 'http://127.0.0.1:${port}/notjson',
  'redirect' => 'http://127.0.0.1:${port}/redirect',
  'missing' => 'http://127.0.0.1:${port}/missing',
  'refused' => 'http://127.0.0.1:1/never',
  'slow' => 'http://127.0.0.1:${port}/slow',
];
$out = [];
foreach ($cases as $name => $url) {
    $out[$name] = astro_http_get_json_detailed($url, $name === 'slow' ? 1 : 3);
}
echo json_encode($out);
`
  });
  const transport = JSON.parse(ran.text);
  php.exit();
  server.close();

  await check('a 2xx JSON answer (and a redirect to one) is data, not transient', () => {
    assert.deepEqual(transport.ok, { data: { hello: 'world' }, status: 200, transient: false });
    assert.deepEqual(transport.redirect.data, { hello: 'world' });
  });

  await check('a definitive 4xx (Google\'s invalid_token) is final and is asked only ONCE, not again through the fallback transport', () => {
    assert.deepEqual(transport.rejected, { data: null, status: 400, transient: false });
    assert.equal(requestsSeen.filter(url => url.startsWith('/rejected')).length, 1);
    assert.deepEqual(transport.missing, { data: null, status: 404, transient: false });
  });

  await check('a 5xx, a refused connection and a timeout are transient (the visitor is not at fault)', () => {
    assert.deepEqual(transport.unavailable, { data: null, status: 503, transient: true });
    assert.deepEqual(transport.refused, { data: null, status: 0, transient: true });
    assert.deepEqual(transport.slow, { data: null, status: 0, transient: true });
  });

  await check('a 200 that is not JSON is a final answer, never "retry"', () => {
    assert.deepEqual(transport.notjson, { data: null, status: 200, transient: false });
  });
}

console.log(`\n[OK] google login first attempt: ${passed} checks passed`);
process.exit(0);
