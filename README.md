# ASTRO SIVAM

Vedic astrology platform at [astrosivam.com](https://astrosivam.com): Birth Jathagam, Marriage Compatibility (Porutham), Muhurtham, and Baby Naming reports — with a customer portal, admin console, multi-currency payments (Razorpay / PayPal), and a source-based AI astrologer chat (local knowledge base, no external AI calls).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind 4 (static build, no Node on production) |
| Backend | PHP 8 API (`api/`) on cPanel/BigRock shared hosting, MySQL |
| Reports | Browser-rendered HTML → mPDF server-side (three languages: EN / TA / HI) |
| Astrology engine | TypeScript (`src/lib/astrology/`) with a PHP mirror (`api/astrology/engine.php`), kept in sync by parity tests |

## Repository layout

```
api/          PHP API: auth, payments/webhooks, admin, reports (mPDF), astrology engine
src/          React SPA: pages, components, astrology libs, report builders
knowledge/    AI astrologer knowledge base (mirrored in api/knowledge/)
data/         Naming glossary / name-bank source data
tests/        Node + PHP + Playwright suites (see below)
scripts/      Test runner, parity harness, dist.zip packer, backup/ops scripts
docs/         Runbooks, audits and fix records (see "Documentation" below)
```

## Quick start

```bash
npm ci
npm run dev          # Vite dev server on 0.0.0.0
npm test             # full Node contract suite (63 suites)
npm run lint         # tsc --noEmit
npm run build        # production build to dist/
npm run build:zip    # dist/ + api/ packaged for cPanel upload
```

PHP pieces need PHP 8.1+ with `gd, mbstring, intl` and Composer (`composer install`). The
PHP test suites run via `npm run test:php`; when PHP is unavailable locally, the Node suite
executes the important PHP contracts through `@php-wasm/node` (install with
`npm install --no-save @php-wasm/node @php-wasm/universal` to enable those checks).

Node ↔ PHP engine parity:

```bash
npm run parity:seed      # build the corpus and seed expected output
npm run parity:php       # emit from the PHP engine (needs PHP)
npm run parity:compare   # diff Node vs PHP
```

## Testing & CI

- `npm run test:all` — the complete local gate, and the one to run before opening a pull request: TypeScript, production build, the full Node suite (including built-`dist/` checks), all 15 PHP suites, and the Playwright browser specs when a browser is installed. PHP runs natively when available, otherwise through php-wasm at PHP 8.1 (the version CI uses).
- `npm test` — local Node contract suites (63): auth/payment invariants, astrology accuracy regressions, Node↔PHP parity, refund policy, CDN/cache safety, Google sign-in first-attempt regressions, and more.
- `npm run test:php` — 15 PHP suites (mPDF reports, webhook, rate limit, mailer guards). Without native PHP, run a suite with `node scripts/php-wasm-run.mjs --php 8.1 tests/<suite>.test.php` after `npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54`.
- `npm run test:pdf` — local Playwright browser specs (report PDFs, checkout, layout, Google sign-in timing). Install the browser once with `npx playwright install chromium`.
- GitHub Actions runs **only** `.github/workflows/tests.yml`: PHP 8.1 syntax checks and the PHP test suite on pull requests and pushes to main/master. Node, browser, security-audit, build/package, and monitoring workflows are not run on GitHub. If the account's Actions minutes are exhausted the workflow cannot start; `npm run test:all` is then the authoritative pre-PR check.
- Build release archives locally with `npm run build:zip`; arrange external uptime/TLS monitoring separately.

## Deployment

Production is static frontend + PHP API on cPanel. Build `dist.zip` (`npm run build:zip`) and
upload it per **[docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md](docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md)**.
`.cpanel.yml` supports Git-based deploys and preserves live `api/config.php` credentials.

## Documentation

All runbooks and records live in [`docs/`](docs/). Most used:

- [Deployment guide (cPanel/BigRock)](docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md)
- [Auth & security hardening](docs/AUTH_SECURITY_HARDENING.md)
- [Payment webhook idempotency & CI](docs/PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md)
- [Health monitoring & backup verification](docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md)
- [Rate limiting & payment recovery](docs/RATE_LIMITING_AND_PAYMENT_RECOVERY.md)
- [Cloudflare CDN setup](docs/CLOUDFLARE_CDN_SETUP.md)
- [Boot splash — mobile white screen](docs/BOOT_SPLASH_MOBILE_WHITE_SCREEN.md)
- [Crawlable links, homepage structured data & verified customer reviews](docs/SEO_CRAWLABLE_LINKS_STRUCTURED_DATA_AND_REVIEWS.md)
- [Service-page FAQs, breadcrumbs & the GSC/Bing index-coverage runbook](docs/SEARCH_INDEXING_GSC_BING_RUNBOOK.md)
- Latest full audit: [docs/FULL_AUDIT_2026_10_13.md](docs/FULL_AUDIT_2026_10_13.md)

## Secrets

Real credentials live only on the hosting environment (or `api/config.php` on the server) —
never in this repository. See `.env.example` for the full variable list; `APP_SECRET_KEY`
signs auth tokens and is auto-generated to `api/astrology/tmp/` if unset.
