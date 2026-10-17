# Independent code re-audit — 2026-10-18

## Scope and limitations

The requested source audit report and the referenced commit `4fdfd23` were not available in the repository or on the remote. The user chose an independent re-audit of the current tree rather than waiting for that material. This document records that independent scope and the evidence obtained; it is **not** a P1-1–P4-12 closure matrix and does not claim a mapping to any unavailable F-01–F-15 list.

The review covered the current changes and their regression contracts for deployment boundaries, admin operations, captured-payment refunds, proxy trust, outbound branding URLs, AI rate limits, public design initialization, release-tree checks, dependency lockfiles, and diagnostic deployment guidance. It did not exercise a live production deployment, production database, real payment-provider transaction, real email delivery, or hosting-control-panel configuration. No secrets or credential values were recorded.

## Reviewed behavior and preserved invariants

- The runtime astrology directory is denied at the web-server boundary.
- Admin features use verified order data, and export behavior remains read-only.
- Refund requests are checked against the captured payment intent before processing. The customer policy remains 90% before approval, 10% retained, and 0% after delivery; working-day counts were not changed.
- Trusted proxy configuration is validated, and implicit trust of CGNAT/link-local peers was removed. Authentication, rate limits, signatures, escaping, CSRF/CORS, and HMAC checks were not intentionally weakened.
- Email logo URLs use a canonical host; AI ask/PDF paths have rate limits.
- Public startup applies the admin-persisted design, uses cached settings when available, has a bounded 4.5-second fallback, and releases admin routes immediately. The visitor-local design toggle remains removed.
- USD remains the only admin-set price; INR is derived as `round(USD × 84)`.
- The mPDF diagnostic endpoint remains opt-in and returns 404 by default. Its documentation now restricts the diagnostic to private local/staging use; production verification is directed to the authenticated admin health check. No deployment default enables it.
- Lockfile project names and dependency ranges are checked for drift. Direct deterministic tests cover five shared TypeScript modules, and `npm run test:all` is contract-tested against the full local gate.

## Change groups in this branch

| Commit | Change group |
| --- | --- |
| `532da2d`, `83c1d5d`, `69d10d8` | Runtime-directory boundary, verified admin features/read-only export, and captured-intent refund validation |
| `dccfb03`, `da2fe2c` | Trusted proxy CIDR validation and removal of implicit CGNAT/link-local trust |
| `8454f2d`, `9c1d4ee` | Canonical email-logo host and AI rate limits |
| `250fedb` | Admin-persisted public design startup gate |
| `7bb4714` | Release-aware retired-branding guard |
| `cff8773` | Bun/npm lockfile synchronization and project-name regression checks |
| `b7de204` | Full local-gate alias contract and direct shared-module tests |
| `4aa5399` | Private-only diagnostic guidance and default-off regression coverage |

## Verification

The full local gate passed in an isolated temporary copy (`npm run test:all`, 114.9 seconds, exit code 0). This included TypeScript lint, a production build, the full Node suite, and all 15 PHP suites under PHP-WASM 8.1. The lockfile check passed, the retired-branding guard scanned 495 files with zero offences, the five direct TS-module checks passed, and the diagnostic gate's five checks—including its default-off PHP-WASM probe—passed. The local-gate alias contract also passed.

Two environment-dependent checks did not run: Playwright browser specs were skipped because Chromium is not installed, and the mPDF-dependent multilingual page-count branch was skipped because mPDF is unavailable in the PHP-WASM runtime. These are not reported as passing. The full gate built `dist/` only in the isolated copy; the live workspace's generated/ignored `dist/` was not touched. `npm run lint` also passed independently.

## Disposition

This is an independent current-tree audit with regression evidence, not proof that every numbered item in the missing source report is closed. GitHub Actions are billing-blocked, so local verification is the available test gate. The requested PR will be opened from the Arena session branch and will not be merged.
