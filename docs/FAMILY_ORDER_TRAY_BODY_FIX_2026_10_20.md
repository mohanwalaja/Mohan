# Family order failed with “At least one service chart item is required in the family tray.”

**Reported:** 2026-10-20 — the admin panel / admin session filled the family tray
with 4 reports (Birth Jathagam, Marriage Match, Baby Naming, Subha Muhurtham),
pressed **Proceed to Unified Checkout**, and the checkout answered:

> At least one service chart item is required in the family tray.

…even though all 4 reports were visible in the tray, priced **FREE (Admin)**.

---

## 1. What was actually wrong

Nothing was wrong with the tray, the login, the admin role or the pricing. The
request body never reached the route.

Every JSON request in the API was read through `api/config.php` →
`getJsonBody()`, which **silently returns `[]` for any body larger than 1 MiB**:

```php
function getJsonBody() {
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? ...);
    if ($contentLength > 1048576) {
        return [];                 // <-- the whole tray disappears here
    }
    ...
}
```

A **Subha Muhurtham** report carries its six-month panchangam scan inside the
order payload (`inputPayload.muhurthamScan`): every day of six months, each day
holding the English / Tamil / Hindi tithi, nakshatra, yoga, karana, reason,
dosha and personal-note strings exported by `src/lib/muhurtham/scanner.ts`.

Measured from the shipped scanner (see `tests/family-order-body-limit.test.ts`):

| Payload | Bytes |
|---|---|
| Six-month Muhurtham scan alone | **1,116,949** |
| One Muhurtham tray item (`serviceType` + `inputPayload`) | **1,117,258** |
| The 4-report tray from the screenshot | **1,118,040** |
| `getJsonBody()` limit | **1,048,576** |

So a tray holding **one** Muhurtham report — 66 KB over the cap — was thrown
away, `$jsonBody` became `[]`, `$items` became `[]`, and the family-tray route
answered its “no items” validation message. The same cap also silently broke a
**single** Muhurtham order, which then fell through to the Birth Jathagam
validation message instead.

## 2. The fix

### `api/request_body.php`

* New constant **`ASTRO_ORDER_JSON_MAX_BYTES` = 16 MiB** — the limit for service
  order bodies. It holds a full six-report tray even when several reports are
  Muhurtham reports, and stays far below `post_max_size` (128M in
  `api/.user.ini`).
* New **`astro_order_json_body()`** reader: reads the body once, with that limit,
  and never answers “empty” for a body it did not receive. It fails loudly with
  its own code and an explicit message:

  | Code | HTTP | When |
  |---|---|---|
  | `ORDER_BODY_TOO_LARGE` | 413 | body above 16 MiB |
  | `ORDER_BODY_DROPPED` | 413 | `Content-Length` announced but PHP/proxy delivered nothing (`post_max_size`, WAF) |
  | `ORDER_BODY_INVALID_JSON` | 400 | body is not valid JSON |
  | `ORDER_BODY_UNREADABLE` | 400 | anything else |

  Each message states that nothing was charged, saved or emailed.

### `api/services/index.php`

* The router now reads its body **once** through `astro_order_json_body('order')`
  instead of `getJsonBody()`.
* The three order routes (`/multi-order`, `/multi-person-order`, `/order`) no
  longer re-read the body with
  `!empty($jsonBody) ? $jsonBody : getJsonBody()` — that fallback would have
  applied the 1 MiB cap a second time.
* The family-tray “no items” answer carries `code: FAMILY_TRAY_EMPTY`, so a
  genuinely empty tray is now distinguishable from a body that was dropped.
  After this change the message can only appear when the client really sent no
  chart items.

No route, price, permission or report format changed — only the body limit and
the error that describes a rejected body.

## 3. Does it cover customers too?

Yes. The reader is in the **shared services router**, so it applies to:

* the family tray checkout (`POST /api/services/multi-order`, `items[]`),
* the person-card checkout (`POST /api/services/multi-person-order`, `people[]`),
* a single Muhurtham order (`POST /api/services/order`),
* `services.php?action=…` and `index.php?action=…` (all include the same router).

All other API routes keep `getJsonBody()`’s 1 MiB behaviour; the PDF-carrying
admin routes keep their existing 64 MiB document limit.

## 4. Tests

`tests/family-order-body-limit.test.ts` (wired into `npm test`) pins:

1. the order limit is ≥ 8 MiB, above the 1 MiB ordinary cap and below
   `post_max_size`;
2. the services router reads its body exactly once, through
   `astro_order_json_body()`;
3. no order route re-reads it through `getJsonBody()`;
4. the four `ORDER_BODY_*` answers exist and the family-tray message can only be
   produced by a genuinely empty tray;
5. a **real** 4-report tray containing one Muhurtham scan still exceeds the old
   1 MiB cap (so the regression is measurable, not folklore) and a six-report
   Muhurtham tray fits inside the new limit.

The reader itself was also executed under PHP 8.1 (php-wasm) with a 1.2 MB JSON
body: decoded, 4 items, no error.

## 5. Deploying

This is a PHP-only change:

```
api/request_body.php
api/services/index.php
```

Upload those two files (or run the normal `deploy_cpanel.sh` / Git deployment)
and re-open the checkout. The frontend build is unchanged.

## 6. Follow-up (not required for this fix)

A tray of six Muhurtham reports posts ~6.7 MB of panchangam scan data. It is
well inside the new limit and inside `post_max_size`, but it is a lot to upload
from a phone. If checkout ever feels slow, the next step is to send the scan
compacted to the exact day/month fields `AstroEngine::calculateMuhurtham()`
keeps — that must be done at send time (never in the cart) so browser previews
keep the full scan.
