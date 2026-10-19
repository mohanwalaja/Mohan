# WhatsApp & Viber: alerts only, OTP-verified numbers only

Customer requirement (2026-10-19):

- **No reports or invoices in WhatsApp/Viber.** Chat is for short order
  status alerts only.
- **Only alerts, and only if the number is verified with an OTP.**
  A number is eligible per app; WhatsApp verification does not verify
  Viber and vice versa.

## What changed

| Area | Before | Now |
|---|---|---|
| Chat payload | Alerts **and** report/invoice PDFs | Text alerts only |
| Recipient | `user_mobile` saved on the order | The customer's saved `user_chat_contacts` number, and only for apps with `whatsapp_verified_at` / `viber_verified_at` set |
| Verification | Optional for PDF delivery | Required before any customer alert |
| Checkout | "Also send PDF certificate to my WhatsApp" collected any number | Removed |
| `sendOrderDocuments()` | Called from four completion flows | Removed, together with the document transports |
| `GET /api/services/chat-media/:token` | Served PDFs linked from Viber file messages | Removed |

## Current flow

1. Customer opens **Dashboard → Profile → WhatsApp & Viber Order Alerts**,
   saves one E.164 mobile number and verifies it per app with a 6-digit
   OTP sent in that app.
2. On order placement, `AstroChatAlerts::sendOrderAlerts($pdo,
   'order_confirmed', $orders)` sends the confirmation alert only to the
   verified channel(s).
3. On approval/delivery, the same dispatcher sends `order_completed`
   only to the verified channel(s). The report and invoice go by email
   as before.
4. If no app is verified, or the admin has that channel off/unconfigured,
   the dispatcher returns without sending — the order flow is unaffected.

`AstroChatAlerts::verifiedChatTargets()` is the single gate:
`user_chat_contacts` row → E.164 check → per-channel `*_verified_at` →
`channelConfigured()`.

## Tests

`tests/chat-alerts-verified-and-download-language.test.ts` pins the rule:
the unverified order mobile can never appear in `sendOrderAlerts()`, no
chat-document function/route exists, all completion hooks call only
`sendOrderAlerts()`, and the checkout no longer promises a WhatsApp PDF.
It also executes `verifiedChatTargets()` under PHP-WASM with a fake
contact store (no contact, unverified, WhatsApp-only, both apps, invalid
number, disabled channel).

Docs updated: `WHATSAPP_VIBER_ALERTS.md` (setup guide),
`CHAT_DELIVERY_OTP_AND_DOWNLOAD_LANGUAGE_2026-10-26.md` (feature record),
`api/migrations/017_chat_delivery_contacts.sql` and `api/schema.sql`
(comments only).
