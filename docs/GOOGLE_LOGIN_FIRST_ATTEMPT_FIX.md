# Google sign-in / sign-up: the first attempt failed for new visitors

**Reported:** when a new user registers or signs in with Google, the first attempt
does not log them in. After pressing **Try Again** once or twice it works.

**Status:** fixed. The failure was reproduced in a real browser first; the same
browser tests now pass, and fail on the previous code.

## What the visitor saw, and why

A first-time visitor has nothing cached: not the Google Identity Services script
(`accounts.google.com/gsi/client`), and not the public site settings that carry the
Google client id. Everything below was reproduced against the real app with a fake
Google SDK and a fake API whose timing the test controls.

| # | Situation (first-time visitor, one click) | Before | After |
|---|---|---|---|
| 1 | Google script still downloading (slow link, cold DNS/TLS) | Enabled button; the click showed **"Google Sign-In could not be reached"** | Button shows **"Preparing Google sign-in…"** (disabled) and becomes clickable when Google can really open. One click signs in |
| 2 | Public settings still loading (the client id is not known yet) | Enabled button; the click showed **"not configured for this site yet"** | Same waiting state, one click signs in |
| 3 | The first settings request hit the app's 4 s first-paint timeout | **"not configured"** and nothing ever asked again, so Try Again could not succeed until the page was reloaded | The button re-fetches the settings in the background (2 rounds, 12 s patience each) and enables itself. No reload |
| 4 | The Google script download failed once (offline blip, DNS) | Stayed failed | The dead tag is removed and re-requested automatically (after 0.7 s, then 1.8 s) |
| 5 | The visitor closes / blocks the Google window | Button stuck on **"Connecting to Google…"** forever (no `error_callback`) | Closing releases the button silently; a pop-up blocker is explained and Try Again reopens Google |
| 6 | The host answers 502/503/504, a dropped connection, or a refused database connection *after* the Google step | Error dialog; the visitor had to go through Google again. A network error also POSTed the same login twice (to both endpoint URLs) | The **same Google token** is sent again automatically (up to 3 requests, 0.8 s / 2 s apart, 30 s per request). One Google window, one click |
| 7 | Two requests for the **same brand-new account** overlap (double click, a browser re-sending a slow request, the retry above) | The loser got **503 "Service temporarily unavailable"** although the account now existed. Retrying worked because the account was already there | The loser re-reads the account and signs in. Exactly one account row |
| 8 | Our server cannot reach Google for a moment | `401 "Could not verify Google login"` and the attempt was **charged to the visitor's failed-login budget** | `503` with `"retryable": true`; budget untouched; the browser retries |
| 9 | A database error in the middle of a sign-in | `503`, nothing in the PHP error log | `503` + `"retryable": true` + a line in the PHP error log. Unexpected PHP errors now also answer in JSON (they used to escape as a bare HTTP 500) |

Rows 1–3 are what the report describes. Rows 4–9 are the other ways "first attempt
fails, retry works" could happen on shared hosting; each was reproduced or run
against the real PHP router before and after.

## What changed

**Browser (`src/`)**

- `services/googleIdentity.ts` (new): the single owner of the Google script. One tag
  however many buttons mount, an observable status (`idle | loading | ready | failed`),
  automatic re-injection after a hard failure, and a 10 s soft timeout that keeps a
  slow download alive (a late `load` still wins; no duplicate request).
- `components/common/GoogleLoginButton.tsx`: starts the SDK download when the button
  mounts (not when it is clicked) and is only clickable once the client id **and** the
  SDK are there. The Google popup is still opened **synchronously inside the click**
  (browsers only allow `window.open()` from a user gesture, so nothing is awaited
  first). It passes `error_callback`, ignores a second token while one is being
  verified, and its "Try Again" re-prepares the missing piece instead of repeating a
  click that cannot work. The unused One Tap fallback branch (unreachable: the SDK
  always defines `google.accounts.oauth2`) was removed.
- `services/api.ts`: `googleLogin` uses a 30 s per-request timeout and re-sends
  transient failures (no reply, timeout, 408/502/503/504, or an API reply flagged
  `retryable`). A real rejection (401/403/409/429) is final. `getSettings({ timeoutMs })`
  allows a patient retry; the 4 s first-paint bound is unchanged.
- `context/AuthContext.tsx`: `googleLogin` no longer waits for the settings refresh
  before reporting success (that could be 8 s of silence that looked like a failure);
  `refreshSettings` accepts the optional patient timeout.

**Server (`api/`)**

- `google_login.php` (new): `astro_verify_google_login()` reports **why** a verification
  failed (`$failure === 'unavailable'` when the deciding call to Google got no answer:
  network, timeout, 408/429/5xx) through `astro_http_get_json_detailed()`. A definitive 4xx
  from Google (for example `invalid_token`) is final and is no longer requested a second
  time through the stream-wrapper fallback. The older `verifyGoogleLogin()` and
  `httpGetJson()` in `config.php` are untouched (the Facebook verifier still uses
  `httpGetJson()`).
- `auth/index.php`: "could not reach Google" answers `503` + `retryable` **before** the
  failed-login budget is charged (a rejected token still is). New accounts are created by
  `astro_create_social_user()`, which treats a duplicate-key hit as "the account now exists"
  and signs in (or answers the normal 409 if the e-mail now belongs to a different
  identity). Used by both the Google and Facebook routes. Both routes log database errors
  and catch every `Throwable`.
- `db.php`: a refused database connection (shared hosting "too many connections") is
  flagged `retryable`; its HTTP status (500) is unchanged.

**Why the new server code is in its own file.** Both deploy paths (`.cpanel.yml`,
`deploy_cpanel.sh`, and `scripts/sync_public_html_api.sh`) deliberately keep the live
`api/config.php` because it holds the host's database credentials. Anything added to
`config.php` would pass every test here and silently never reach production. So a normal
deploy is all this fix needs: nothing has to be edited by hand on the server, and
`config.php` only gained a comment in the repository copy.

Security properties are unchanged and covered by tests: the identity still comes only
from Google's own endpoints, the token's audience must be this site's client id,
`email_verified` is required, existing e-mail/password accounts are never auto-linked,
administrators are refused on the Google route, and the failed-login budgets still count
every rejected credential.

## How to verify

```bash
npm run lint
npm test                      # includes tests/google-login-first-attempt.test.ts
```

`tests/google-login-first-attempt.test.ts` runs the SDK loader against a fake DOM and
clock, the login retry rules against a fake `fetch`, the button's first render, static
contracts of the PHP routes and — when the optional PHP runtime is installed — the
**real auth router** under PHP 8.1 and 8.4 with SQLite and a scripted Google (no network):

```bash
npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
```

The real-browser reproduction (13 tests: `/login`, `/register` and the sign-in dialog
on a service page; slow SDK, slow settings, a settings timeout, unreachable settings,
failed downloads, closed and blocked windows, 503s) is
`tests/browser/google-first-attempt.spec.ts`. It fails on the previous code and passes now:

```bash
npx playwright test tests/browser/google-first-attempt.spec.ts
# no bundled browser? point it at any Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npx playwright test tests/browser/google-first-attempt.spec.ts
```

## If a visitor still reports a failure

1. The PHP error log now says what happened. Search for `ASTRO SIVAM: google-login`:
   - `Google token verification endpoints were unreachable (transient)` — the host
     cannot reach `oauth2.googleapis.com` / `www.googleapis.com` (outbound HTTPS or DNS
     on the host). The visitor is retried automatically; ask the host if it is frequent.
   - `google-login database error - …` — the database side; the message names the cause.
   - `google-login unexpected …` — a PHP error; the class and message are logged.
   - `outbound HTTPS is impossible on this host` — neither PHP cURL nor `allow_url_fopen`
     is available, so no Google token can ever be verified until the host enables one.
   - `Database connection error: …` — MySQL refused the connection (the sign-in is retried
     automatically; frequent occurrences mean the hosting plan's connection limit is too low).
2. Google Cloud Console → Credentials → the Web client: `https://astrosivam.com` must be
   under **Authorized JavaScript origins** and the consent screen must be **In production**
   (see the deployment guide, Step 9).
3. If the `GOOGLE_CLIENT_ID` environment variable is set on the host it must equal the Client
   ID saved in Admin → Google Setup: the server checks every token against the environment
   value when it is present, while the browser uses the saved one. A mismatch fails every
   attempt with "Could not verify Google login".
4. Google refuses OAuth inside some embedded in-app browsers; a visitor who opened the link
   from a chat or social app may need to open it in Chrome or Safari. Not changed here.

## Not changed

- The Facebook route got only the race-safe account creation and the logging; its token
  verification and the browser side were not touched (there is no Facebook button in this
  build).
- Email/password sign-in and registration (the OTP flow) are untouched.
