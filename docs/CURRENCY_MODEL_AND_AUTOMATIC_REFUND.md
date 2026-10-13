# Currency model & automatic one-click refunds

Two product decisions shape every money path in this repository. Both are
enforced by executing tests, not by reading code.

## 1. The currency model — two currencies, no assumed country

| Payment method | Currency | Where it applies |
|---|---|---|
| Google Pay / UPI | **INR** | India |
| PayPal / Card (VISA · Mastercard · Amex · Discover) | **USD** | International |

* **The payment method the customer chooses decides the currency of the whole
  order** — including a family tray whose members were born in different
  countries. A birth place never changes what anything costs.
* The retired regional currency is **gone from the source tree**: no labels, no
  price tier, no `DEFAULT` value, no identifier and no fixture. The admin price
  editors write and read `usd` / `inr` only; a stored legacy price blob is
  ignored and the service is re-priced from the current USD/INR settings.
* **No country is ever assumed.** Every `DEFAULT '<country>'`, `|| '<country>'`
  and `?? '<country>'` default is gone; a country is only ever consulted as the
  *billing* country of the account, and only when there is no real payment
  method (free beta).
* Historical data is untouched: an order that was stored in a retired currency
  keeps its amount and currency, and the financial report counts it in the USD
  bucket (clearly commented) instead of silently dropping it.

### The three approved functional exceptions

These are engineering data, not branding, and they are the *only* accepted
mentions of the region in the tree (the guard test matches them by shape):

1. the **IANA time-zone identifier** in `api/astrology/engine.php`,
   `api/astrology/tz_lookup_data.php` and the timezone tests — removing it would
   compute wrong charts for people born there,
2. the **dial-code map entry** in `api/chat_alerts.php` — needed to normalise
   WhatsApp/Viber phone numbers,
3. the **birthplace rows** in `src/data/worldwideLocations.ts` (plus the
   `includes(...)` latitude heuristic) — customers born there must still be able
   to select their birth place.

`tests/retired-branding-guard.test.ts` scans the whole shipped tree (frontend,
PHP API, fixtures, scripts, CI workflows and docs) and fails with the exact file
and line for anything else. Its search tokens are assembled from character codes
so the guard itself contains no reference.

## 2. One-click refunds — 90% before approval, 3 working days

The policy is unchanged and lives in `api/refunds.php`:

* **Before admin approval** a paid order refunds **90%** of what was paid (the
  remaining 10% is the non-refundable payment-gateway fee).
* **After admin approval** the report and invoice have been generated and
  emailed, so the order is completed and **non-refundable** — the handler
  refuses it with HTTP 409.
* Settlement is promised to the customer as **3 working days** (weekends and the
  published holiday calendar excluded).

### The click now really returns the money

`POST /api/admin/orders/:id/process-refund` performs, in this order:

1. Resolve the payment intent for every payable order of the click
   (`orders.payment_intent_id`, then any intent that recorded the order id).
2. If **exactly one captured online payment** funds the click, call the
   provider's refund API for the 90% amount:

   | Provider | Call |
   |---|---|
   | Razorpay (India GPay/UPI) | `POST /v1/payments/{payment_id}/refund`, amount in minor units, deterministic `receipt` |
   | PayPal (cards/wallet) | `POST /v2/payments/captures/{capture_id}/refund`, `PayPal-Request-Id` derived from the order |

3. Only after the provider acknowledges the refund are the order rows marked
   `REFUNDED` (`refund_method = 'GATEWAY'`, `refund_reference = <provider refund id>`),
   the customer emailed and the audit entry written.
4. If the provider refuses, the request answers **HTTP 502 `AUTO_REFUND_FAILED`**
   and **nothing** is marked refunded, so the administrator can retry instead of
   the portal claiming a refund that never happened.
5. If there is **no online capture** (bank transfer, receipt verified by hand,
   free beta), the refund is recorded as **`refund_method = 'MANUAL'`** and the
   response says so explicitly: the administrator settles it within the 3 working
   days. There is nothing at a provider to reverse.
6. A click that spans **two different captured payments** is refused with 409
   rather than split by guesswork.

Idempotency: an order that already holds a `refund_reference` is never refunded a
second time, and the provider receives a deterministic request id, so a retried
click replays the original refund instead of issuing another one.

The API response keeps its existing shape and adds the settlement facts:

```json
{
  "success": true,
  "oneClick": true,
  "message": "Refund approved for order #AST-1001: USD 90.00 (90% of USD 100.00). Automatic PayPal refund RF-9X… issued; the customer receives it within 3 working days.",
  "refund": {
    "percent": 90, "amount": 90, "amountPaid": 100, "feeRetained": 10,
    "currency": "USD", "workingDays": 3, "deadlineLabel": "19 Oct 2026",
    "settlement": "GATEWAY", "gatewayProvider": "paypal",
    "gatewayReference": "RF-9X…", "emailSent": true
  }
}
```

`settlement` is `GATEWAY` (provider refunded), `MANUAL` (offline payment recorded
for manual settlement) or `FAILED` (provider refused, nothing changed). The admin
portal shows the reference on the refunded order row; the customer dashboard
tells the customer the money was already sent back by the provider.

### Database

`refund_method` and `refund_reference` were added to `orders` by
`api/migrations/010_refund_gateway_settlement.sql`, mirrored in `api/schema.sql`
and self-migrated at runtime by `api/db.php::astro_ensure_refund_schema()`, so an
installation that was never migrated by hand keeps working.

### Tests

* `tests/refund-policy-contract.test.ts` pins the source-level contract: the
  gateway call happens **before** any row is marked refunded, both provider
  endpoints and their idempotency headers exist, the settlement travels to the
  portal and the customer read models, and migration 010 declares the columns.
* `tests/refund-policy-php-runtime.test.ts` executes
  `tests/fixtures/php-refund-probes/refund-policy.php` inside PHP-WASM: it builds
  the real provider requests (PayPal capture endpoint, Razorpay minor units,
  request ids), parses refusals into "nothing was marked as refunded", and proves
  an offline payment produces no provider request at all.
* `tests/retired-branding-guard.test.ts` keeps the retired currency and the
  retired branding out of the tree for good.
