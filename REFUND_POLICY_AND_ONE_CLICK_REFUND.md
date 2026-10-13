# Refund & Cancellation Policy — 90% pre-approval, one-click admin refund, 3 working days

**Date:** 2026-10-14
**Status:** implemented (customer page + admin portal + API + schema + tests)

## What the policy now says (and what the software does)

| Stage of the order | Refund position | Who acts |
| --- | --- | --- |
| Placed, **before admin approval** (nothing generated or emailed yet) | **90% refund** of the amount paid. The other 10% is the non-refundable payment-gateway / processing fee (PayPal, card, UPI/GPay) that is not returned to us on a refund. | Customer emails `admin@astrosivam.com` with the order number → admin refunds in **one click**. |
| **After admin approval** — report + tax invoice generated and emailed | The order **is** the delivered personalised digital product: **completed and non-refundable**. No refund button is rendered, and the API refuses the request with HTTP 409. | — |
| Settlement of an approved refund | **3 working days** (Monday–Friday; weekends and listed public holidays do not count), back to the **original payment method** in the original currency. | Automatic message in the refund email. |

An optional admin **override** no longer exists: the policy is enforced, so a
delivered order cannot be refunded by accident (not even by a stale browser tab).

## The pieces

| File | Role |
| --- | --- |
| `api/refunds.php` | **Single source of truth.** 90% pre-approval percentage, 3-working-day
settlement arithmetic (weekend + holiday aware), delivered-status list, money formatting, the
customer refund email body. |
| `api/admin/index.php` (`3d. process-refund`) | The one-click handler. Computes the amount server-side, refuses a delivered order (409), is
idempotent on a second click, refunds a whole family bundle when asked, records the trail and sends the customer email. |
| `src/pages/AdminPortal.tsx` | One-click **Refund 90%** button on both the mobile card and the desktop row, for single orders and family bundles, with the policy-gated `canOneClickRefund` / `canOneClickRefundGroup` helpers, a `Refunded` status badge, a refunded summary line (amount + settlement date) and a `Refunded` filter tab. |
| `src/pages/PoliciesPage.tsx` | The customer-facing policy: "the short version" callout + 8 numbered sections (pre-approval 90%, post-approval non-refundable, 3 working days, wrong birth details, how to request, free beta, duplicate/failed payments, chargebacks). |
| `src/pages/CustomerDashboard.tsx` | Shows the customer where they stand: 90% eligibility while pending, non-refundable once approved, and the refund amount + settlement date once refunded. |
| `api/schema.sql`, `api/migrations/009_refund_workflow.sql`, `api/db.php` | `status` enum widened to accept `REFUNDED` (on a strict-mode MySQL the old enum would have silently dropped the refund state) and the trail columns added: `refund_percent`, `refund_amount`, `refund_currency`, `refund_processed_at`, `refund_deadline`, `refund_admin_notes`. `astro_ensure_refund_schema()` applies the same DDL at runtime, so an un-migrated installation keeps working. |
| `tests/refund-policy-contract.test.ts` | Static contract: the numbers and the refusal must agree across the policy engine, the handler, the portal and the customer page. |
| `tests/refund-policy-php-runtime.test.ts` + `scripts/php-refund-policy-check.mjs` + `tests/fixtures/php-refund-probes/refund-policy.php` | Executes the policy in a real PHP runtime (PHP-WASM when installed): 90% split, rounding, the working-day calendar across weekends **and** holidays, the post-approval refusal and the email body. Also `php -l`-parses every PHP file the refund touches. |

## The policy cannot be bypassed by cancelling

"Cancel" and "refund" are not the same thing, and cancelling a paid order used to
keep the customer's money while removing the order from the admin list. All three
cancel paths now refuse a **paid** order with `PAID_ORDER_REQUIRES_REFUND` (409)
and point at the one-click refund:

* `POST /api/admin/orders/:id/cancel` — single order;
* `POST /api/admin/family-orders/:groupId/cancel` — bundle;
* `POST /api/services/orders/:id/cancel` — customer self-cancel (the customer is
  told to email `admin@astrosivam.com`, because refunds are admin-approved).

Unpaid orders (free beta, unverified manual payment) still cancel freely, and
the portal hides the Cancel button as soon as the refund action applies.

## One click means one click

The admin button sends `POST /api/admin/orders/:id/process-refund` with only
`{ refundGroup?: boolean }` — **no amount and no percentage**. Typing a refund
amount by hand is the classic way to refund the wrong figure, so the server
computes it. A confirmation dialog is deliberately absent; the order list shows
the amount that will be refunded before the click (`Refund 90% (USD 9.00)`).

## Verification performed

* `npm run lint` (`tsc --noEmit`) — clean.
* `npm test` — full suite green, including the two new refund tests.
* Refund policy executed under PHP-WASM: 32 assertions inside PHP
  (see the two examples below) + `token_get_all(TOKEN_PARSE)` syntax verification of
  `api/refunds.php`, `api/admin/index.php`, `api/admin/orders.php`, `api/db.php`, `api/services/index.php`.
  * `Wed 14 Oct 2026 + 3 working days = Mon 19 Oct 2026` (the weekend is skipped;
    a naive `+3 days` would have promised Saturday 17 Oct).
  * `Wed 23 Dec 2026 + 3 working days`, with 25 Dec listed as a holiday, `= Tue 29 Dec 2026`.
* CI (`tests.yml`) runs `php -l` over every PHP file, which now includes
  `api/refunds.php` and the probe.

## Operational notes

* **Nothing to configure.** The percentage (90) and the working-day count (3)
  live in the two `define()`s at the top of `api/refunds.php`; the customer page
  and the portal copy must be updated alongside them — the contract test fails
  if they drift apart.
* **Public holidays:** `ASTRO_REFUND_HOLIDAYS` (same file) takes a comma-separated
  `YYYY-MM-DD` list. It is empty by default (weekends only). Add the year's
  Fiji/India public holidays there when the calendar is published.
* **Existing installations:** no manual migration is required — the column and
  enum changes are applied on the next database connection. To apply them ahead
  of time (or on a large `orders` table where the `ALTER` should run in a
  maintenance window), run `api/migrations/009_refund_workflow.sql` by hand first.
* **Money still moves manually.** The refund is a *record*: after one click, the
  admin still issues the refund in the PayPal/card/UPI dashboard within the
  3-working-day promise. The order shows the amount and the settlement date so
  the follow-up is unambiguous.
* **A few live orders may need attention:** any order that was refunded through
  the old code path already has `refund_status = 'REFUNDED'` but no
  `refund_amount`/`refund_deadline`. The portal shows the badge and the refund
  summary without those figures ("settles within 3 working days") — nothing is
  broken, the historical trail is simply thinner than for new refunds.
