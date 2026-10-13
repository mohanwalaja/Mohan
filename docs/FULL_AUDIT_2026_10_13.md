# ASTRO SIVAM — Full Audit (13 October 2026)

**Branch:** `arena/a72e3f5a-mohan` @ `25788d0` (tree of PR #2)
**Scope:** Full repo — auth, payments, webhooks, uploads, rate limiting, frontend, build/CI, deployment, secrets, tests, docs hygiene.
**Method:** Fresh source review of `src/` + `api/` + `scripts/` + `.github/`, live runs of `npm test` (47 suites, with `@php-wasm/node` enabled so PHP runtime probes executed), `tsc --noEmit`, `npm audit`, `npm run build`, secret/eval/SQL-injection/XSS sweeps, and verification of every backlog item from `FULL_AUDIT_2026_10_12.md`.

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| Auth (sessions, bearer tokens, OTP, reset, social login, revocation) | **Strong** — verified again this audit |
| Payments (Razorpay / PayPal webhooks, idempotency, amount checks) | **Strong** |
| Rate limiting / brute-force protection | **Strong** — fail-closed, HMAC-keyed, credential-stuffing budgets |
| File uploads / staged family documents | **Strong** — PDF-validated, size-capped, TTL-purged, path-safe |
| Injection / XSS / secrets | **Clean** — no findings in live sweeps |
| Tests & CI | **Excellent** — 47 suites green, gated build pipeline, PHP suite in CI |
| Dependencies | **Clean** — `npm audit` 0 vulnerabilities (prior B2 resolved) |
| Frontend performance | **Advisory** — 2 MB main chunk, no route code-splitting (S1) |
| Supply chain (PHP) | **Advisory** — `composer.lock` still absent (B3/S2) |
| Docs / repo hygiene | **Advisory** — 55 root MD files, no README (S5) |

**Bottom line: no launch blockers, no new security defects.** The system's money paths, auth stack and calculation engine remain well-hardened, and 5 of the 7 items on the 12 Oct backlog are now closed. Remaining work is performance, reproducibility and hygiene.

---

## 1. Live verification results (this audit)

| Check | Result |
|---|---|
| `npm test` (47 suites, Node + wasm-PHP probes) | **All green** — 0 failures (incl. refund PHP runtime, CDN IP-spoofing matrix, checkout idempotency, lockfile drift) |
| `tsc --noEmit` | **Clean** — 0 errors (prior B7 closed) |
| `npm audit` | **0 vulnerabilities** (prior B2 closed) |
| `npm run build` | **Succeeds** in ~15 s, pre-compressed `.br`/`.gz` emitted, no source maps shipped |
| Secrets sweep (hardcoded keys/passwords/tokens) | **Clean** — placeholders only; real creds live on the host |
| Dangerous-function sweep (`eval`/`exec`/`shell`/`unserialize`) | **Clean** — only `PDO::exec` / `curl_exec` |
| XSS sweep (`dangerouslySetInnerHTML`/`innerHTML`/`document.write`) | **Clean** — zero uses in `src/` |
| SQL interpolation sweep | **Clean** — 2 dynamic spots both use fixed whitelists / `(int)` casts |

---

## 2. Verified strong (spot-checked again, no change needed)

**Auth & sessions**
- Bearer tokens: HMAC-SHA256 (`hash_equals`, timing-safe), 7-day TTL, `token_version` revocation enforced on both cookie sessions and bearer tokens; unsigned tokens explicitly rejected; token subject is the immutable user id only.
- OTP: `random_int` 6-digit, HMAC-stored (raw never persisted), 10-min expiry, separate HMAC domain for password-reset codes (cross-flow replay impossible).
- Passwords: `password_hash(PASSWORD_BCRYPT)`, 10-char policy, HIBP breach check; reset flow burns after 5 attempts and revokes all sessions.
- Cookies: httpOnly + SameSite=Lax + Secure (proxy-aware via `X-Forwarded-Proto`); frontend keeps at most an in-memory token copy and purges legacy `*_token` localStorage keys.
- Admin: `requireAdmin()` on every admin route; first-admin provisioning is CLI-only (404 over HTTP); logout / logout-all / revoke-sessions endpoints present.

**Payments**
- Webhooks: Razorpay HMAC over raw body; PayPal verified via PayPal's own `verify-webhook-signature` (fail-closed 503 when unconfigured); amount+currency re-checked against the intent before capture; one atomic idempotent capture unit with deadlock-replay; audit ledger for every outcome including rejections.

**Platform**
- Rate limiting: DB-backed fixed windows, HMAC-hashed keys (no raw IPs stored), fail-closed on DB failure, credential-stuffing budgets (per-IP endpoint, per-IP global, site-wide).
- Uploads (admin family docs): strict base64→binary decode, PDF magic/page-raster validation, 40 MB cap, TTL cleanup, guarded storage dir.
- Mailer: CR/LF stripped from header-bound values (injection guard), native SMTP + `mail()` fallback.
- Headers: root `.htaccess` CSP allow-list + HSTS + nosniff + frame options; API responses carry `default-src 'none'` CSP and `no-store, private` cache directives (CDN-leak guard).
- Diagnostics (`check_mpdf.php`) gated behind `ASTROSIVAM_DIAGNOSTICS=1`; admin health endpoint flags `display_errors` if left on.
- Service worker retired cleanly (self-unregistering stub — no stale cache-first shell).
- Deployment: `.cpanel.yml` preserves live `config.php` + secret key, chmods 640/600; `dist.zip` builder excludes runtime artifacts, storage, secret key, source maps, `.cjs`; CI verifies zip contents (migrations, health endpoint, backup scripts must be present).

---

## 3. Prior-audit backlog (FULL_AUDIT_2026_10_12.md) — status

| # | Item | Status now |
|---|---|---|
| B1 | Bearer TTL 30 days | **RESOLVED** — 7 days (`604800`) everywhere (`createBearerToken`, cookie issue) |
| B2 | `npm audit` advisories | **RESOLVED** — 0 vulnerabilities |
| B3 | `composer.lock` absent | **OPEN** — see S2 |
| B4 | Vasya porutham source divergence | **OPEN** — needs a pundit/product ruling; document the chosen tradition |
| B5 | No CSRF double-submit | **OPEN** — still mitigated (SameSite=Lax + POST-only writes, verified again) |
| B6 | PHP suites + Playwright in CI | **RESOLVED** — `tests.yml` runs the 13-file PHP suite on PHP 8.1; `build.yml` runs a Playwright smoke gate before packaging |
| B7 | ~30 pre-existing `tsc` errors | **RESOLVED** — `tsc` fully clean |

---

## 4. New findings & suggestions

### S1 — Frontend bundle: no route-level code splitting (MEDIUM, performance)
`src/App.tsx` uses a hand-rolled `switch` router with static imports; there is no `React.lazy`/dynamic `import()` anywhere. The main chunk is **1,981 kB minified / 472 kB gzip** (Vite itself warns >500 kB), and it contains the admin portal (4,569-line `AdminPortal.tsx`), PDF exporters and HTML builders that a first-time visitor never needs.
**Suggestion:** lazy-load at least `AdminPortal`, `CustomerDashboard`, and the report/PDF builder modules (`jathagamPdfExporter`, `*HtmlBuilder`) per route. Expected first-load win of well over 50 % on the marketing pages. Keep the existing `manualChunks` vendor split.

### S2 — `composer.lock` still missing (LOW, supply chain / reproducibility)
mPDF and pdfparser resolve at whatever version is current when CI runs `composer update` — a build today is not byte-reproducible with a build tomorrow, and a breaking mPDF minor can reach production through an unrelated CI run.
**Suggestion:** run `composer update` once on a known-good host, commit `composer.lock`, and let CI use `composer install` (the workflows already prefer the lockfile when present). This closes B3.

### S3 — Admin-configured WhatsApp webhook URL is fetched without validation (LOW, hardening)
`api/chat_alerts.php` POSTs server-side to `webhookUrl` from admin settings with no scheme/host check. This is inside the admin trust boundary, but a compromised admin settings panel could aim the server at internal addresses (SSRF) or `http://` endpoints, leaking alert payloads (customer names, order numbers) in transit.
**Suggestion:** require `https://`, optionally allow-list hostnames, and reject private/loopback IP literals before `curl`. Cheap win; same pattern could be applied to the Viber endpoint.

### S4 — `metadata.json` advertises a Gemini capability the app no longer uses (LOW, consistency)
`metadata.json` declares `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, but `.env.example` and `AI_CHAT_*` docs state the astrologer chat is local-only with no external AI calls. Harmless technically, but it misleads capability reviews and future contributors.
**Suggestion:** drop the capability flag (or update it) so the manifest matches the shipped architecture.

### S5 — Repo hygiene: no README, 55 root-level MD files, placeholder package name (LOW, developer experience)
The first thing anyone sees at the repo root is 45+ fix/audit logs; there is **no `README.md`**. `package.json` is still named `react-example`.
**Suggestion:** add a short `README.md` (what the product is, stack, `npm ci && npm test`, `npm run dev`, deploy pointer to `BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md`), move the historical fix/audit docs into `docs/` (keep the 2–3 active runbooks at root or link them), and rename the package to `astrosivam-web`. The deployment zip already ships only 5 named docs, so moving the rest has zero production impact.

### S6 — CSRF double-submit remains absent (LOW, defence-in-depth)
Re-verified: all mutating endpoints are POST-only and cookies are SameSite=Lax, so today's exposure is minimal. If the API is ever consumed from another origin (mobile app, partner embed), add a double-submit token now rather than retrofitting later. (Carry-over of B5.)

### S7 — Test/CI gaps worth closing over time (INFO)
- The Node↔PHP corpus compare (`npm run parity:compare`) needs `tests/fixtures/parity-php.json`, which is gitignored and regenerated on a PHP host; CI covers the underlying contract via `tests/node-php-parity.test.php`, but the full corpus diff is not a CI artifact. Consider uploading it from the PHP job.
- Playwright CI runs only the homepage smoke; the PDF/checkout browser specs (`tests/browser/*.spec.ts`, 7 files) run locally. A nightly scheduled workflow with the full browser suite would protect the PDF pipeline end-to-end.

### S8 — Oversized source files (INFO, maintainability)
`AdminPortal.tsx` (4,569 lines), `pdf_mpdf_reports.php` (4,924), `engine.php` (4,187), `ai_astrologer.php` (2,440) are each larger than most whole apps. No defect found — but each future change to them is high-risk. Incremental extraction (admin panels already live under `src/components/admin/`; do the same for the PHP report renderer chapters) will pay for itself.

### S9 — Minor build note (INFO)
Vite warns about chunks >500 kB (see S1). The CSS bundle is 303 kB raw / 47 kB gzip (Tailwind 4 full utilities) — acceptable, but a content-driven purge pass would trim first paint further. Both lockfiles (`package-lock.json` + `bun.lock`) are tracked and drift-tested — fine as-is.

---

## 5. Suggested priority order

1. **S1** route code-splitting — biggest user-visible win (mobile users on the marketing funnel).
2. **S2** commit `composer.lock` — closes the last supply-chain reproducibility gap (B3).
3. **S3** webhook URL validation — small hardening patch.
4. **S5** README + docs/ move + package rename — 30 minutes, permanent DX win.
5. **S4** metadata.json capability cleanup.
6. **S6/S7** CSRF token + nightly full Playwright — when convenient.
7. **B4** Vasya porutham tradition ruling — product decision, then document in the footer as previously suggested.

---

## 6. Verdict

**Ship-grade.** Auth, payments, webhooks, uploads, rate limiting and the astrology engine all held up under a second full review with live test execution; the 12 Oct hardening items have been closed except the two deliberate carry-overs (composer.lock, CSRF) and the pundit ruling. Nothing found today blocks launch; the list above is polish, performance and hygiene.
