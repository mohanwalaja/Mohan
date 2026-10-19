# WhatsApp/Viber OTP alerts + download-language rule

> **Updated 2026-10-19 (customer requirement):** WhatsApp and Viber are
> **alerts only**. The earlier experiment that additionally pushed report
> and invoice PDFs into chat was removed. Alerts are sent **only** to a
> number the customer verified with an OTP in that same app. Email remains
> the one and only document delivery channel.

Two customer requests, as they now stand:

1. **Report downloads are only in the ordered language.** The dashboard
   download renders exactly the language chosen when ordering — for
   multi-person orders, each person's report in that item's own ordered
   language — and only when the user clicks Download. It never generates
   all three languages (en/ta/hi), the system never accepts a `language`
   parameter that could switch it (server ignores it, client never
   sends one), and the frozen snapshot keeps this true forever. The
   dashboard states the language on every download ("Prepared on …
   • Tamil") and renders the file in the browser at the same print
   density as the emailed copy.

2. **WhatsApp/Viber order alerts go only to OTP-verified numbers.** In
   their profile, the customer saves ONE mobile number and verifies it
   separately on each app (a number may have WhatsApp but not Viber)
   with a one-time code sent inside that app. The two lifecycle alerts —
   *order confirmed* and *order completed* — are sent only to the
   verified app(s). **Reports and invoices never travel over chat**;
   email remains the official delivery. The mobile entered at checkout
   is not used, because it was never verified.

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

## Alert delivery

`AstroChatAlerts::sendOrderAlerts()` is the single customer alert
dispatcher. Before sending it resolves
`AstroChatAlerts::verifiedChatTargets($pdo, $userId, $settings)`:

- no saved contact → no alert;
- saved but not verified on any app → no alert;
- WhatsApp verified and admin-enabled → WhatsApp alert;
- Viber verified and admin-enabled → Viber alert;
- both verified → both alerts;
- the number must be full E.164 (`+`, 7–15 digits).

The existing master switch, per-event switches and channel settings still
apply. The four completion flows (`api/admin/index.php`,
`approve_order.php`, `family_approval.php`, `order_items.php`) call the
same dispatcher and nothing else. The dashboard report download and the
email attachment path are unchanged.

## Removed in this update

- `AstroChatAlerts::sendOrderDocuments()`, `sendWhatsAppDocument()`,
  `sendViberDocument()`, the Meta media-upload multipart transport and
  the signed media-token helpers.
- `GET /api/services/chat-media/:token` (it existed only to host PDFs
  for Viber Bot file messages).
- The checkout "Also send PDF certificate to my WhatsApp" add-on, which
  collected an unverified number and promised a chat PDF.
- Every customer-facing line saying reports/invoices are also sent to
  WhatsApp/Viber.

## Verification of this change

- `tests/chat-alerts-verified-and-download-language.test.ts` (registered
  in `scripts/run-tests.mjs`): ordered-language guarantee, endpoint
  auth/rate limits, OTP storage/expiry/attempt rules, the
  verified-target gate, absence of every chat-document transport/route,
  all four completion hooks, migration/schema parity, dashboard and
  checkout copy, plus real PHP execution under PHP-WASM (phone
  normalization, OTP hash scoping, per-app verified-target selection).
- `npx tsc --noEmit`, `npm test`, `npm run build`.

Deployment: no new migration is required for this change if migration
017 is already applied (it only changed comments). WhatsApp/Viber
sending activates only when the admin enables and configures each
channel **and** the customer verifies their number on it.
