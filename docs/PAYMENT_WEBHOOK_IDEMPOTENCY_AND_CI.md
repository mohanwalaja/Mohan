# Payment webhook idempotency, structured retry & the CI security gate

> **Historical CI record:** The `build.yml` security/build/browser workflow described
> below was retired on 17 October 2026. GitHub Actions now runs only the PHP
> suite in `tests.yml`; build and non-PHP checks are local commands.

**Date:** 12 October 2026
**Scope:** P0 hardening + observability. `api/payments.php`, `api/payment_webhook.php`,
`api/services/index.php`, `api/admin/index.php`, `api/schema.sql`,
`api/migrations/008_payment_idempotency.sql`, `tests/payment-webhook.test.php`,
`.github/workflows/build.yml`.

---

## 1. Why (the PayPal problem)

Razorpay redelivers a webhook only after a failure, and it also has its own
retry UI. PayPal webhooks are **at-least-once**: the same
`PAYMENT.CAPTURE.COMPLETED` event can arrive two or three times (network blip,
our 5xx, provider-side retry). The old handler was *sequential*-safe — the
capture was guarded by `WHERE status = 'CREATED'` — but it recorded the dedupe
row **after** the capture, so two deliveries that arrived at the same instant
both read `status='CREATED'`, both ran the `UPDATE`, and only the accidental
row lock decided the winner. The audit trail could show two captures of one
payment, and a deadlock inside that window was answered with a 5xx (the event
was then simply lost unless the provider retried).

Two things were added:

1. **An idempotency ledger claimed *before* the capture**, inside the same
   transaction that captures and audits.
2. **A bounded, structured retry** for InnoDB deadlocks / lock-wait timeouts,
   so a conflict replays the unit instead of dropping the event.

The same ledger now also protects order creation, because one captured intent
must never produce two orders (or two families of orders).

---

## 2. The ledger

Table `payment_idempotency_keys` (created by `astro_payment_ensure_tables()` at
runtime, and reviewable in `api/schema.sql` + `api/migrations/008_payment_idempotency.sql`):

| column | meaning |
|---|---|
| `idempotency_key` | `CHAR(64)` PRIMARY KEY — sha256 of the event identity |
| `scope` | `webhook-capture` \| `multi-order` \| `single-order` \| `multi-person-order` |
| `provider` | `razorpay` \| `paypal` |
| `external_event_id` | provider event id (audit) |
| `intent_id`, `order_id` | what the claim was bound to |
| `status` | `IN_PROGRESS` → `PROCESSED` \| `FAILED` \| `MISMATCH` |
| `attempts` | incremented every time the claim is taken over |
| `detail` | human-readable outcome (shown in the admin panel) |

**Key derivation** (`astro_payment_idempotency_key()`): a sha256 over the
lower-cased, sorted `name=value` pairs passed in. Sorted = order-independent,
so the same event always hashes identically no matter how the JSON fields were
ordered. Webhook captures hash **provider + event type + gateway payment id +
gateway order id** (falling back to the provider event id or the payload digest
when a provider sends no payment id). Order binding hashes **provider + intent
id + user id + scope**, so the family and single-report paths can never collide.

### Status machine

* `CLAIMED` → the caller owns the key and must do the work.
* `DUPLICATE` → a `PROCESSED` row exists: the webhook answers `200
  {duplicate: true}` **without re-verifying or touching payment state**; the
  checkout answers `200 {duplicate: true, order(s): …}` with the orders already
  created.
* `IN_PROGRESS` → another delivery is mid-flight: the webhook answers `200
  {duplicate: true}` (the other worker commits the result) and the checkout
  answers `409` so the browser retries the *read* instead of the write.
* `FAILED` or a stale `IN_PROGRESS` (default 60 s) → taken over
  (`attempts + 1`). All clock arithmetic happens in MySQL
  (`updated_at <= DATE_SUB(NOW(), INTERVAL ? SECOND)`), never with PHP's
  `time()`, so a PHP/DB time-zone difference cannot change the outcome.

The claim read after a duplicate-key error uses `SELECT … FOR UPDATE`: under
REPEATABLE READ a plain snapshot read could miss the row the competing
transaction just committed and start a second capture.

---

## 3. Structured retry

`astro_payment_db_retry($pdo, $work, $context, $maxAttempts, $delaysMs, $jitterMs)`

* Retries only for genuinely transient conflicts: SQLSTATE `40001`, MySQL
  `1213` (deadlock), `1205` (lock wait timeout), or the matching message text.
* Rolls the aborted transaction back before each retry — otherwise the next
  attempt inherits the deadlocked transaction.
* Capped exponential backoff with jitter: attempts 3, delays 40/120/300 ms
  (+0–25 ms jitter).
* Emits structured JSON log lines (`error_log`), never payment bodies or
  signatures:
  `payment_db_retry_scheduled`, `payment_db_retry_recovered`,
  `payment_db_retry_exhausted`, plus `payment_webhook_capture_result`,
  `order_bind_replayed` and `payment_webhook_capture_failed`.
* Returns `['ok' => bool, 'attempts' => n, 'retryable' => bool, …]` instead of
  throwing, so the caller chooses the HTTP contract.

`astro_payment_webhook_capture()` is the only path a provider webhook may use to
capture money. One transaction: **claim → capture → audit row → mark claim**.
If it exhausts its retries it returns `RETRY` and the handler answers **503**,
which tells the provider to redeliver — nothing was captured, the intent is
still `CREATED`, so nothing is lost. Ignored/rejected events keep the existing
audit path, now also wrapped in the retry helper (the response stays `200`, and
the payload reports `audited: false` if even the log write failed).

### Fail-open vs fail-closed

| situation | behaviour |
|---|---|
| Webhook capture cannot write the ledger | **fail closed** → `503`, provider retries, no state change |
| Order binding cannot write the ledger | **fail open** → proceed and log loudly; the conditional `UPDATE payment_intents … WHERE status='CAPTURED' AND order_id IS NULL` is still the authoritative guard against double-binding, and a ledger outage must not block paying customers |
| Same event replayed | `200 duplicate: true`, no capture, no order |

---

## 4. Order binding (all three checkout paths)

`astro_claim_intent_binding()` is called **before** any order row is inserted in
**all three** write paths — the legacy family batch
(`POST /api/services/multi-order`), the single report (`POST /api/services/order`)
and the person-card checkout (`api/services/multi_person_order.php`). A double
click, a refresh at the wrong moment, or two parallel submissions of the same
captured intent now replay the first answer instead of creating a second set of
orders that the intent-consume would have to mark `REJECTED` a moment later.
Successful binds are marked `PROCESSED` with the group/order id, failed binds are
marked `FAILED` so a legitimate retry can take the claim over.

The person-card path was the last gap: it bound the intent only at the end of its
transaction, so a repeated submission answered `409 Payment could not be bound to
this order. No report will be delivered.` even though the customer's order
already existed. It now claims before the header row, replays a bound intent with
`200 { duplicate: true, duplicateReason: 'intent_already_bound', orders }`, and
replays a `CONSUMED` intent with the order list instead of the misleading
"Payment has not been completed" rejection. The claim helpers are guarded with
`function_exists()` because `api/admin/order_items.php` and `api/ai_astrologer.php`
also `require` that file outside a checkout request.

`astro_order_to_client_array()` is the single mapper for a client-facing order;
the checkout response, the replay response and `GET /api/services/my-orders`
all use it, so a replayed answer cannot drift from the order list.

---

## 5. Observability

* **Health probe** — `GET /api/payment/webhook/health` now also returns
  `idempotency: { claims, processed, inProgress, failed, retried,
  staleInProgress }`. Counters only; no event contents, no secrets.
* **Admin recovery panel** — `GET /api/admin/payments/recovery` returns the same
  counters plus `claims`: the 25 most recent ledger rows where `attempts > 1` or
  `status <> 'PROCESSED'` (idempotency hash truncated to 12 chars). A capture
  that survived a deadlock, a mismatched amount, or a claim stuck mid-capture is
  visible here without reading the PHP error log.
* **Log lines** — grep-able JSON on one line via `astro_payment_log_structured()`,
  e.g. `ASTRO SIVAM {"event":"payment_db_retry_recovered", …}`.

Useful SQL while triaging:

```sql
-- captures that needed a retry
SELECT intent_id, provider, attempts, status, detail, updated_at
FROM payment_idempotency_keys WHERE attempts > 1 ORDER BY updated_at DESC LIMIT 50;

-- claims stuck mid-flight (a worker died before committing)
SELECT * FROM payment_idempotency_keys
WHERE status = 'IN_PROGRESS' AND updated_at <= DATE_SUB(NOW(), INTERVAL 5 MINUTE);
```

---

## 6. Deployment

* **No configuration is required.** `astro_payment_ensure_tables()` creates
  `payment_idempotency_keys` on the first payment webhook / checkout on an
  installation that has not been migrated yet.
* To apply it explicitly (recommended, and it is included in `dist.zip`):

  ```bash
  mysql -u<user> -p <database> < api/migrations/008_payment_idempotency.sql
  ```

  The statement is `CREATE TABLE IF NOT EXISTS`, so it is safe to re-run.
* Rollback is additive-safe: the ledger is a guard, not a source of truth. If
  the table is dropped the code logs
  `payment_idempotency_claim_failed` and the webhook fails closed while
  checkout fails open — i.e. the previous behaviour, minus the concurrency fix.

---

## 7. CI gate

`build.yml` now runs on **pull requests** too, and the packaging job waits for
three gates:

| job | what it enforces | blocking? |
|---|---|---|
| `security` | `npm ci` (strict lockfile), `npm audit --omit=dev --audit-level=high`, `composer audit --no-dev`, `php -l` on **every** file in `api/**` | **yes** |
| `security` | full-tree `npm audit` (build-time deps), PHPStan level 0 on the payment modules, PHP-CS-Fixer dry-run on changed PHP files | advisory (`continue-on-error`) |
| `tests` | `npm test` (Node suites incl. lockfile drift, the CI-gate contract and the checkout idempotency contract) | **yes** |
| `playwright-smoke` | Chromium smoke test of the homepage on desktop + mobile (`tests/browser/homepage-navigation.spec.ts`) | its own PR check |
| `build` | the existing `dist.zip` build; now also asserts that `api/migrations/008_payment_idempotency.sql` ships in the archive | **yes** |

The Node suite used to be advisory because it was red on main: the orphaned
`src/components/common/LiveChatWidget.tsx` had been superseded by the AI
astrologer chat, but the file was still in the tree while
`tests/ai-astrologer-access.test.ts` asserted its removal (nothing imported it —
a dead 628-line component). It is deleted and the job is a real gate again, so
the two contract tests below now block a regression instead of reporting one.

The Playwright job is a real gate, not a report. It failed on its first CI run
(the browser specs had never been executed before — backlog B6) on a stale
assertion in `tests/browser/homepage-navigation.spec.ts`: the spec expected the
legacy `?route=how-it-works` query form while the button now navigates to the
clean path `/how-it-works`. The spec was fixed to accept both forms, and the job
now passes and is a `needs:` entry of the packaging job. Because job logs sit
behind a storage redirect, the step re-emits the first failing assertions as
`::error` annotations, which is where the diagnosis belongs.

**Lockfile repair that the gate depends on:** `package-lock.json` and `bun.lock`
had drifted from `package.json` (`npm ci` failed outright: `@types/react` and
`@types/react-dom` were missing from the lock). Both were regenerated
(`npm install --package-lock-only`, `bun install --lockfile-only`) and
`npm audit fix` bumped `source-map-js` 1.2.1 → 1.2.2 and `dompurify` 3.4.14 →
3.4.17, which is what takes the production audit from 1 high + 1 low to **0
vulnerabilities**. `tests/lockfile-drift.test.ts` passes again.

**Known gap:** there is still no committed `composer.lock`, so the gate runs
`composer update` first and audits the freshly resolved set (backlog item B3).
Commit a lockfile from a known-good host and the gate becomes fully
reproducible.

**Known gap — the rest of the browser suite has drifted.** The smoke job runs
`homepage-navigation.spec.ts` only, and that is deliberate: the other specs in
`tests/browser/` were never re-run against the current UI, and reading them
shows at least one is stale — `repeat-family-checkout.spec.ts` waits for
`Payment Receipt Submitted!` and `Single payment for all 4 family charts`, but
`UnifiedCheckoutModal` renders `Payment Receipt Submitted & Orders Placed!` and
"we have received your payment reference of … for all N report(s)". Repair those
specs (with a browser available), then widen the smoke job to
`npx playwright test tests/browser/`.

---

## 8. Verification

Ran locally in the sandbox (no PHP runtime available):

* `php-parser` (npm) syntax check of every file under `api/` → 41/41 parsed,
  plus the modified `tests/payment-webhook.test.php`.
* `npm ci` (strict) → 176 packages, `npm audit --omit=dev --audit-level=high`
  → 0 vulnerabilities, `npm audit` (full) → 0 vulnerabilities.
* `npx tsx tests/lockfile-drift.test.ts` → lockfile agreement passed (4 checks).
* `npm run build:zip` → 169 files, and the new migration is present in
  `dist.zip`.
* Both workflow files were schema-validated with `action-validator` (the
  SchemaStore GitHub Actions schema) — this is the only part of the CI change
  that can be checked without a runner.
* `tests/ci-security-gate.test.ts` (new, runs early in `scripts/run-tests.mjs`)
  asserts the gate itself: pull-request trigger, `npm audit
  --omit=dev --audit-level=high`, `composer audit`, `php -l` over `api/**`,
  the Playwright smoke step, the packaging job's `needs:`, that only the
  dev-only audits stay advisory, and that the migration is asserted inside
  `dist.zip`. It passes locally (10 checks).
* `tests/checkout-idempotency-contract.test.ts` (new) pins the ordering of
  operations on the money paths, which no PHP test in this sandbox can reach:
  the binding claim must precede the first `INSERT INTO orders` in all three
  checkout paths, a `CONSUMED` intent must replay before any rejection, the
  webhook must capture only through `astro_payment_webhook_capture()` (claim
  inside the transaction and inside the retry helper), and the ledger table must
  ship in `api/schema.sql` + `api/migrations/008_payment_idempotency.sql`. 13
  checks, all passing.
* `npm test` → the full 41-file Node suite passes (`exit 0`), which is what
  allows the job to be a gate.

**CI status on this branch:** `Security gate` ✅, `PHP test suite` ✅ (so the new
payment checks pass on a real PHP 8.1), `Build production dist.zip` ✅,
`Playwright smoke` ✅ after the stale routing assertion was fixed, `Node test
suite` ✅ (LiveChatWidget removed, so it now runs as a gate).

Must be verified in CI (this sandbox has no PHP runtime and no Chromium):

* `bash scripts/run-php-tests.sh` — the payment suite gained ~20 checks for key
  derivation, retry classification, the retry loop (attempt counting, rollback
  before retry, non-retryable short-circuit) and structured logging; it does not
  need a database.
* The Playwright smoke job runs only `homepage-navigation.spec.ts`; widen it to
  the rest of `tests/browser/` (PDF rendering specs, checkout harness) once
  their runtime in CI is known.
* `composer audit` against the freshly resolved dependency set.
