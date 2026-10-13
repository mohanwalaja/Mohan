# Refund & Cancellation Policy — 90% pre-approval, one-click admin refund, 3 working days

**Date:** 2026-10-14
**Status:** implemented (customer page + admin portal + API + schema + tests)

## What the policy now says (and what the software does)

| Stage of the order | Refund position | Who acts |
| --- | --- | --- |
| Placed, **before admin approval** (nothing generated or emailed yet) | **90% refund** of the amount paid. The other 10% is the non-refundable payment-gateway / processing fee (PayPal, card, UPI/GPay) that is not returned to us on a refund. | Customer emails `admin@astrosivam.com` with the order number → admin refunds in **one click**. |
| **After admin approval** — report + tax invoice generated and emailed | The order **is** the delivered personalised digital product: **completed and non-refundable**. No refund button is rendered, and the API refuses the request with HTTP 409. | — |
| Settlement of an approved refund | **3 working days** (Monday–Friday; weekends and listed public holidays do not count), back to the **original payment method** in the original currency. | For an online payment the provider refund is **issued by the click itself**; for an offline/bank payment the admin settles it by hand. |

An optional admin **override** no longer exists: the policy is enforced, so a
delivered order cannot be refunded by accident (not even by a stale browser tab).

## The pieces

| File | Role |
| --- | --- |
| `api/refunds.php` | **Single source of truth.** 90% pre-approval percentage, 3-working-day
settlement arithmetic (weekend + holiday aware), delivered-status list, money formatting, the
customer refund email body. |
| `api/admin/index.php` (`3d. process-refund`) | The one-click handler. Computes the amount server-side, refuses a delivered order (409), is
idempotent on a second click, refunds a whole family bundle when asked, records the trail and sends the customer email. It also **performs the automatic refund** (see below). |
| `api/payments.php` (`astro_payment_refund_intent`) | The provider call. Razorpay `/v1/payments/{id}/refund` (minor units, deterministic receipt) and PayPal `/v2/payments/captures/{id}/refund` (`PayPal-Request-Id` idempotency). Never called twice for the same order: the stored `refund_reference` is checked first. |
| `src/pages/AdminPortal.tsx` | One-click **Refund 90%** button on both the mobile card and the desktop row, for single orders and family bundles, with the policy-gated `canOneClickRefund` / `canOneClickRefundGroup` helpers, a `Refunded` status badge, a refunded summary line (amount + settlement date) and a `Refunded` filter tab. |
| `src/pages/PoliciesPage.tsx` | The customer-facing policy: "the short version" callout + 8 numbered sections (pre-approval 90%, post-approval non-refundable, 3 working days, wrong birth details, how to request, free beta, duplicate/failed payments, chargebacks). |
| `src/pages/CustomerDashboard.tsx` | Shows the customer where they stand: 90% eligibility while pending, non-refundable once approved, and the refund amount + settlement date once refunded. |
| `api/schema.sql`, `api/migrations/009_refund_workflow.sql`, `api/migrations/010_refund_gateway_settlement.sql`, `api/db.php` | `status` enum widened to accept `REFUNDED` (on a strict-mode MySQL the old enum would have silently dropped the refund state) and the trail columns added: `refund_percent`, `refund_amount`, `refund_currency`, `refund_processed_at`, `refund_deadline`, `refund_admin_notes`, plus `refund_method` (`GATEWAY`/`MANUAL`) and `refund_reference` (the provider's refund id). `astro_ensure_refund_schema()` applies the same DDL at runtime, so an un-migrated installation keeps working. |
| `tests/refund-policy-contract.test.ts` | Static contract: the numbers and the refusal must agree across the policy engine, the handler, the portal and the customer page. |
| `tests/refund-policy-php-runtime.test.ts` + `scripts/php-refund-policy-check.mjs` + `tests/fixtures/php-refund-probes/refund-policy.php` | Executes the policy in a real PHP runtime (PHP-WASM when installed): 90% split, rounding, the working-day calendar across weekends **and** holidays, the post-approval refusal and the email body. Also `php -l`-parses every PHP file the refund touches. |

## The one click really returns the money

A click on **Refund 90%** now performs the refund instead of only recording it:

1. The payment intent behind every payable order of the click is resolved
   (`orders.payment_intent_id`, then any intent that recorded the order id).
2. If exactly one **captured online** payment funds the click, the provider's
   refund API is called for the 90% amount — Razorpay for India GPay/UPI, PayPal
   for cards/wallet — with a deterministic request id so a retried click replays
   the original refund instead of issuing a second one.
3. Only after the provider acknowledges the refund are the orders marked
   `REFUNDED` (`refund_method = 'GATEWAY'`, `refund_reference = <provider refund
   id>`), the customer emailed and the audit row written.
4. If the provider refuses, the request answers **HTTP 502
   `AUTO_REFUND_FAILED`** and **nothing** is marked refunded — the portal shows
   the provider's reason so the admin can retry rather than believing a refund
   happened.
5. If there is **no online capture** (bank transfer, receipt verified by hand,
   free beta) there is nothing at a provider to reverse: the click records
   `refund_method = 'MANUAL'` and the response says the administrator must settle
   it within the 3 working days. The portal shows the same sentence.
6. A click spanning **two different captured payments** is refused with
   `MULTIPLE_PAYMENTS_REQUIRE_MANUAL_REFUND` (409) instead of splitting the
   amount by guesswork.

The response keeps its existing shape and adds `refund.settlement`
(`GATEWAY`/`MANUAL`/`FAILED`), `refund.gatewayProvider`, `refund.gatewayReference`
and `refund.gatewayMessage`.

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
  the published public-holiday calendar there when it is announced.
* **Existing installations:** no manual migration is required — the column and
  enum changes are applied on the next database connection. To apply them ahead
  of time (or on a large `orders` table where the `ALTER` should run in a
  maintenance window), run `api/migrations/009_refund_workflow.sql` and
  `api/migrations/010_refund_gateway_settlement.sql` by hand first.
* **Money movement:** online-captured payments are refunded by the click itself
  (the portal shows the provider reference). Offline/bank/verified-manual
  payments still need the admin to send the money, and the portal says exactly
  that — the order keeps the amount and the settlement date so the follow-up is
  unambiguous. If the provider refuses, nothing is marked refunded and the error
  is shown in the portal.
* **A few live orders may need attention:** any order that was refunded through
  the old code path already has `refund_status = 'REFUNDED'` but no
  `refund_amount`/`refund_deadline`. The portal shows the badge and the refund
  summary without those figures ("settles within 3 working days") — nothing is
  broken, the historical trail is simply thinner than for new refunds.
