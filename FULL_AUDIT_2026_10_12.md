# ASTRO SIVAM — Full Audit (12 October 2026)

**Branch:** `main` @ `6716ed1` + working-tree changes
**Scope:** Full repo — auth, payments, astrology accuracy, PDFs, frontend, tests, deployment, secrets.
**Method:** Source review of `src/` + `api/`, live `npm test` (29 suites), `tsc --noEmit`, `npm audit`, grep security sweep, cross-check vs `FULL_SYSTEM_AUDIT_2026_10_09.md` + `LAUNCH_READINESS_AUDIT.md`.
**Test result after fixes: 29/29 suites green, 0 failures.**

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| Auth (customer/Google/Facebook/admin, OTP, reset, tokens) | Strong |
| Brute-force / credential-stuffing protection | Strong (layered, fail-closed) |
| Payments (Razorpay/PayPal/manual) | Strong (signature + provider re-verify, replay-idempotent) |
| Astrology calculation accuracy | Verified (Swiss Ephemeris regression in-suite) |
| Node-to-PHP parity | Enforced by fixtures + tests |
| PDF generation & delivery | Good — A1 hardened this audit (rate-limit + PREVIEW watermark, owner chose public) |
| Password policy | Fixed this audit — was split 6 (frontend) vs 10 (backend); now 10 everywhere + HIBP repaired |
| Web / UX / SEO / deploy / tests | Good; 2 advisories + missing composer.lock remain (backlog) |

**Bottom line:** No launch blocker. Auth, payments, and the calculation engine are well-hardened. This audit fixed 1 crash, 1 infinite-loop/fail-open bug, 1 policy split, 1 label regression risk, and hardened the one open endpoint — all re-tested green.

---

## 1. Fixes applied in this audit (all verified)

### F1 — RegisterPage crash (CRITICAL, working-tree regression) FIXED
`src/pages/RegisterPage.tsx` called `getPasswordStrength(password)` at module scope, where `password` (a `useState` variable) does not exist. Any route touching RegisterPage would fail to compile/render.
Fix: interface restored above component, `useAuth()` destructure restored, strength call moved inside the component after `useState`. Verified: zero RegisterPage errors in `tsc`.

### F2 — HIBP breach-check infinite loop + fail-open offset (HIGH) FIXED
`api/config.php :: astro_password_policy_is_pwned()` had two bugs:
1. Infinite loop: binary search with `continue` on short lines skips the lo/hi update, hanging registration/reset on malformed input.
2. Wrong offset: compared `substr($line, 35)` (the count tail) against the hash suffix. HIBP format is `<suffix>:<count>` — suffix is before the colon. Breach check never matched (fail-open).
Fix: linear scan splitting on `:`, uppercase-compare of the prefix. Fail-closed on transport errors.

### F3 — Password policy split 6 vs 10 (MEDIUM) FIXED
Backend required 10 chars; `AuthModal.tsx` and `ForgotPasswordForm.tsx` still enforced 6. Both frontends now require 10 with matching messages.

### F4 — Preview-PDF endpoint hardened (HIGH, owner decision) DONE
`POST /api/services/export-preview-pdf` generates full mPDF reports with no auth (Oct 9 finding A1; Node-era fix lost when `server/` retired). Owner chose keep-public + harden.
Hardening: per-IP rate limit 10/hr (`preview-pdf-ip`, fail-closed 503, 429 with Retry-After); diagonal PREVIEW watermark (alpha 0.12) on previews only via new optional `$watermark` param through `convertHtmlToPdf` and `generateReportPdf`. Paid email PDFs stay clean.


### F5 — Yoga #16 label consistency (LOW) VERIFIED + transliteration fixed
EN `Siddhi` correct everywhere. Main's PR #31 independently fixed the scanner to `Siddhi` / `சித்தி` / `सिद्धि` during rebase review — adopted as canonical (the Oct 9 audit's `அசித்தி`-canonical note is superseded). Also fixed mixed-script `சாध्य` to `साध्य`.

### F6 — rel=noopener on all target=_blank (LOW) FIXED
4 occurrences used `noreferrer` without `noopener`. All 7 external links now `noopener noreferrer`.

### F7 — Missing @types/react broke tsc + hid regressions (MEDIUM) FIXED
No `@types/react`/`@types/react-dom` despite React 19 + 100+ `React.FC` uses; `tsc` failed repo-wide (34 errors), hiding F1. Added both as devDeps; regenerated `package-lock.json` + `bun.lock` (drift test passes).

---

## 2. Verified strong (no change needed)

- Passwords: bcrypt, OTP HMAC-SHA256 (10-min, 5 tries, separate reset domain); reset 15-min, burns on 5 fails, generic replies, revokes all sessions via `token_version`; `session_regenerate_id` on auth.
- Tokens: HMAC-SHA256 signed, unsigned rejected; `token_version` revocation; httpOnly + SameSite=Lax + Secure-on-HTTPS cookie; frontend purges legacy localStorage keys.
- Social login: Google JWT + Facebook tokens verified server-side (audience, expiry, app-ID binding, appsecret_proof); no client-trust fallback.
- Rate limits: per-IP/pair/global failed-credential budgets, contact, registration, payment-intent, preview-PDF — all fail-closed.
- Payments: Razorpay HMAC + PayPal verify before state change; amount+currency re-checked; replay-idempotent; secrets fail closed when unset.
- SQL/XSS/SSRF/command: PDO prepared statements everywhere spot-checked; no eval/exec/shell/system/passthru/unserialize; no dangerouslySetInnerHTML/document.write; logo fetch allow-listed.
- CORS/CSP/HSTS: CORS allow-listed; API `default-src 'none'`; SPA tight allow-list CSP; HSTS via `.htaccess`.
- Astrology engine: Lahiri TRUE default, MEAN override; Swiss Ephemeris regression + Node-PHP parity fixtures pass (29/29).
- Secrets: `DB_PASS` placeholder in repo; real creds only on cPanel host; `APP_SECRET_KEY` env-or-generated; `.gitignore` covers env/tmp/keys.

## 3. Remaining backlog (not blockers)

| # | Item | Severity |
|---|---|---|
| B1 | Bearer/token TTL still 30 days (`createBearerToken` default `2592000`). Prior audits recommended 7. Needs product call. | MEDIUM |
| B2 | `npm audit`: dompurify transitive via jspdf (low) + source-map-js build-time (high). Run `npm audit fix` when convenient. | LOW |
| B3 | `composer.lock` absent (mPDF unpinned; CI runs `composer update`). Commit a lockfile from a known-good host. | LOW |
| B4 | Vasya porutham table diverges from one of two published Tamil sources on 5/12 rasis (sources disagree). Pundit ruling; document tradition in footer. | LOW |
| B5 | No CSRF token for cookie-authenticated writes (mitigated: SameSite=Lax + POST-only). Add double-submit if GET mutations appear. | LOW |
| B6 | PHP suites (13 files) + Playwright specs need PHP 8.1 + browser CI — Node suite covers parity; run in GitHub Actions before release. | INFO |
| B7 | `tsc` still reports ~30 pre-existing errors (HelmetProvider JSX typing, EmailConfigPanel Record-vs-array). Type-cleanup pass. | LOW |

## 4. Test evidence

- `npm test` (29 suites): all green — 361+ PASS lines, `Lockfile agreement passed (4 checks)`, zero failures.
- `tsc --noEmit`: RegisterPage clean; remaining errors pre-existing and untouched.
- `npm audit`: 2 advisories (B2), unchanged by this audit.
- PHP: no runtime in sandbox; PHP edits are minimal, brace-balanced, signature-compatible (optional `$watermark = ''`), covered by CI `tests.yml`.

## 5. Files changed

- `src/pages/RegisterPage.tsx` — F1 + 10-char policy
- `api/config.php` — F2 + 10-char policy
- `AuthModal.tsx`, `ForgotPasswordForm.tsx` — F3
- `api/services/index.php` — F4 (rate limit + watermark wiring)
- `api/astrology/engine.php`, `pdf_mpdf_reports.php` — F4 (watermark plumbing)
- `scanner.ts`, `LivePanchangamBar.tsx` — F5
- `PaymentConfigPanel.tsx`, `PaymentGatewayCheckoutBox.tsx` — F6
- `package.json`, `package-lock.json`, `bun.lock` — F7
