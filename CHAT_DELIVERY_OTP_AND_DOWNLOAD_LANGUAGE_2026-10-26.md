# WhatsApp/Viber PDF delivery with OTP verification + download-language rule (2026-10-26)

Two customer requests:

1. **Report downloads are only in the ordered language.** The dashboard
   download renders exactly the language chosen when ordering — for
   multi-person orders, each person's report in that item's own ordered
   language — and only when the user clicks Download. It never generates
   all three languages (en/ta/hi), the system never accepts a `language`
   parameter that could switch it (server ignores it, client never
   sends one), and the frozen snapshot keeps this true forever. The
   dashboard now states the language on every download ("Prepared on …
   • Tamil (your order language) • frozen as ordered").

2. **Reports and invoices can also arrive on WhatsApp or Viber.** In
   their profile, the customer saves ONE mobile number and verifies it
   separately on each app (a number may have WhatsApp but not Viber)
   with a one-time code sent inside that app. When an order is
   delivered, the actual report + invoice PDFs are additionally sent to
   every verified app. **Email remains the official delivery** — chat
   delivery is strictly best-effort and can never block or fail an
   approval.

## Verification (OTP)

- `user_chat_contacts` (one row per customer: E.164 number +
  `whatsapp_verified_at` / `viber_verified_at`) and `chat_number_otps`
  (migration `017_chat_delivery_contacts.sql`, also in `schema.sql`,
  also created at runtime per the first-boot CREATE convention).
- Codes are 6 digits, stored only as HMAC hashes (the auth OTP
  construction, scoped by user + channel + number), 10-minute expiry,
  5-attempt burn, 60-second resend cooldown, endpoint rate limits.
  The plain code is never stored, logged, or returned.
- Changing the number clears both verifications and pending codes; a
  new number must be verified again per app.
- Endpoints (`api/services/index.php`, all `requireAuth`):
  `GET /services/chat-delivery` (state, never provider credentials),
  `POST|DELETE /services/chat-delivery-number`,
  `POST /services/chat-delivery-verify-request`,
  `POST /services/chat-delivery-verify-confirm`.
- Providers are the ones the admin already configures (Admin Portal >
  WhatsApp & Viber Alerts). If a channel is off/unconfigured, the
  dashboard says so and the OTP request fails cleanly — no fake "sent".
  WhatsApp codes are always sent as free text (an order-update template
  would replace the code with placeholders); free text needs the
  24-hour customer window or a webhook transport, and a provider
  rejection is surfaced to the customer rather than hidden.

## Document delivery

`AstroChatAlerts::sendOrderDocuments()` runs alongside the existing
`order_completed` text alert in all four completion flows
(`api/admin/index.php`, `approve_order.php`, `family_approval.php`,
`order_items.php`). It sends only for orders in COMPLETED/GENERATED,
only to channels that are both admin-configured AND customer-verified,
and builds the same attachments as the email (per-order/per-item report
PDFs, one invoice — or the consolidated family invoice for bundles).
Everything is wrapped so a chat outage is only ever logged/audited.

Transports:

- **WhatsApp (Meta Cloud API):** real media upload
  (`/{phone-number-id}/media`) followed by a `document` message with
  the returned media id. 16 MB document cap enforced.
- **WhatsApp/Viber (webhook gateway):** JSON `order_documents` event
  carrying the PDF bytes as base64 for the gateway to deliver.
- **Viber (official Bot API):** the PA API cannot accept uploads — a
  `file` message must link a hosted file — so it points at our own
  `GET /api/services/chat-media/:token`: HMAC-signed, scoped to one
  order document, 7-day expiry, rate-limited. Reports served there come
  from the same frozen order-date snapshot as the dashboard download
  (never recalculated) and carry the frozen Prepared-on date. This is
  the one deliberate exception to the "invoice is never served over
  HTTP" rule: an unguessable signed link minted only while delivering
  to the customer's own verified Viber; the dashboard download itself
  stays report-only.

## Verification of this change

- `tests/chat-delivery-and-download-language.test.ts` (registered in
  `scripts/run-tests.mjs`): the ordered-language guarantee (no language
  parameter paths, per-item language), endpoint auth/rate limits, OTP
  storage/expiry/attempt rules, per-provider document transports, all
  four delivery hooks, migration/schema parity, dashboard UI, plus real
  PHP execution under PHP-WASM (phone normalization, OTP hash scoping,
  signed media token round-trip/tamper/expiry).
- `npx tsc --noEmit`, `npm test`, `npm run build` pass.

Deployment: run migration 017 (feature degrades safely without it —
tables are also created on first use). WhatsApp/Viber sending only
activates when the admin enables and configures each channel and the
customer verifies their number on it.
