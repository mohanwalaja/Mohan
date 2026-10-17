# Source Code Re-Audit & Fiji/M-PAiSA Removal Report
**Date:** 2026-10-12
**Branch:** `arena/60d14f0e-astrosivam`

---

## 1. Audit Findings — Issues Fixed

### A. Fiji Branding / Work-Permit Risk (CRITICAL — Fixed)
All user-facing "Fiji" references and Vodafone M-PAiSA payment branding have been removed. Files changed (35+):

**User-facing pages/components:**
- `src/components/layout/Footer.tsx` — Removed "Serving Fiji", removed Vodafone M-PAiSA pill; added VISA, Mastercard, Amex, Discover pill badges.
- `src/pages/HowItWorksPage.tsx` — Step 4 payment narration/captions/UI demo now says "PayPal for international clients, accepting VISA, Mastercard, Amex, and Discover" (no Fiji, no M-PAiSA); walkthrough demo cards changed from M-PAiSA to Card Payment.
- `src/pages/AboutPage.tsx` — Both instances of "Serving Fiji, Australia, NZ" changed to "Serving Australia, NZ, USA, UK, Canada & worldwide".
- `src/pages/ContactPage.tsx` — Address line updated.
- `src/pages/HomePage.tsx` — FAQ payment answer updated to list PayPal/VISA/MC/Amex/Discover and GPay/UPI.
- `src/pages/PoliciesPage.tsx` — Payment policy rewritten; removed "Fiji Payments: Vodafone M-PAiSA", added Card/VISA/MC/Amex/Discover bullet.
- `src/components/common/LivePanchangamBar.tsx` — Removed "Nadi / Suva, Fiji" clock city (replaced with Singapore/Kuala Lumpur).
- `src/components/common/TestimonialsSection.tsx` — "Suva, Fiji" testimonial location changed to "Kuala Lumpur, Malaysia".
- `src/context/LanguageContext.tsx` — `fiji_fjd` label renamed to "Pacific (FJ$)", paid-mode badge text replaced with "PayPal / Cards: Secure worldwide payment".

**Checkout flow:**
- `src/components/cart/PaymentMethodSelector.tsx` — Removed M-PAiSA option; added a dedicated "Credit / Debit Card (VISA · Mastercard · Amex · Discover)" option alongside PayPal and GPay/UPI.
- `src/components/cart/PaymentGatewayCheckoutBox.tsx` — Removed M-PAiSA offline transfer UI; CARD method now shows card-brand badges (VISA/MC/Amex/Discover) via PayPal; online modal handles PAYPAL+CARD, legacy MPAISA/MYCASH falls back to a PayPal notice.
- `src/components/cart/SingleServiceCheckoutModal.tsx` — Replaced M-PAiSA tab with Card (VISA·MC·Amex) tab; removed M-PAiSA number copy UI; currency switcher now USD/INR only (FJD tab removed); phone placeholder replaced +679 with generic country codes.
- `src/components/cart/UnifiedCheckoutModal.tsx` — Removed mpaisa constants; default country no longer Fiji.
- `src/components/cart/FamilyCartDrawer.tsx` / `FamilyCartFloatingBar.tsx` — Payment label now says "PayPal" / "VISA / Mastercard / Amex" instead of "Vodafone M-PAiSA".

**Defaults / logic:**
- `src/services/pricing.ts` — `DEFAULT_CURRENCY` changed from `FJD` to `USD`; `DEFAULT_PAYMENT_METHOD` changed from `MPAISA` to `PAYPAL`; `PAYMENT_METHOD_CURRENCY.MPAISA/MYCASH` set to `null` (disabled); `defaultPaymentMethodForAccount` / `currencyForCountry` no longer special-case Fiji; currency symbol default changed from `FJ$` to `$`.
- `src/context/CartContext.tsx` — Legacy saved MPAISA/MYCASH selections now auto-migrate to PAYPAL; removed MPAISA comments.
- `src/context/AuthContext.tsx` — Default user `country` changed from `'Fiji'` to `''`; default lat/lon/tz zeroed (geocoder fills them).
- All page/submit payloads changed `user?.country || 'Fiji'` to `user?.country || ''`.

**Admin panels (visible to you, not end-users):**
- `src/components/admin/PaymentConfigPanel.tsx` — M-PAiSA config section hidden with `display:none` (fields retained for DB backward compatibility); hero tagline updated to list cards.
- `src/components/admin/FinancialDashboard.tsx` — M-PAiSA revenue card replaced with "Card Payments (VISA/MC/Amex) via PayPal"; description rewritten.
- `src/components/admin/AdminAnalyticsDashboard.tsx` — "Fiji Dollar (FJD)" chart labels renamed to INR; "Fiji Domestic Share" → "India UPI Share"; "User Geographic Reach: Fiji Islands" → "Global Reach" with worldwide country list.
- `src/components/admin/GoogleSetupPanel.tsx` — Removed Fiji from country list.
- `src/components/admin/SetupChecklistPanel.tsx` / `SecurityBannedIpPanel.tsx` / `src/pages/AdminPortal.tsx` — All visible labels renamed (M-PAiSA → PayPal/Cards, Fiji Resident → FJD Price Tier, etc.); M-PAiSA micro-chip replaced with VISA·MC·Amex indicator; M-PAiSA admin section hidden with inline style.
- Legacy "FIJIASTRO" email subject changed to "ASTROSIVAM".

**Backend PHP:**
- `api/config.php` — `DEFAULT_CURRENCY` changed from `FJD` to `USD`; `astro_currency_for_payment()` routes MPAISA/MYCASH to USD and no longer maps 'fiji' country to FJD (falls back to USD); currency symbol default changed to `$`; comments updated.
- `api/auth/index.php`, `api/provision_admin.php`, `api/services/index.php`, `api/services/multi_person_order.php` — Default user country `'Fiji'` replaced with `''`; default payment method `'MPAISA'` replaced with `'PAYPAL'`; user-facing error text changed from "bank/UPI/M-PAiSA" to "bank/UPI/PayPal".
- `api/astrology/pdf_mpdf_invoice.php` — Invoice payment-method labels updated: PayPal now shows "(VISA / Mastercard / Amex / Discover)", MPAISA/MYCASH labelled "Manual Payment (legacy)", added GPAY/UPI/CARD labels.
- `api/check_mpdf.php` — Sample place of birth changed from "Suva, Fiji" to "Chennai, Tamil Nadu, India".
- Comments in `api/astrology/engine.php`, `src/lib/timezone.ts`, `src/services/jathagamPdfExporter.ts`, `src/services/formatUtils.ts` updated to not name Fiji (replaced with generic "DST-observing southern-hemisphere" examples).

### B. What was KEPT intentionally
- **`Pacific/Fiji` IANA timezone ID** in `engine.php` and `tz_lookup_data.php` — required to correctly compute charts for people born in Fiji (the astrology engine needs accurate timezone offsets). Removing this would produce wrong horoscopes for Fijian-born users; this is a technical reference, not branding.
- **`fijiPriceFJD` / `vodafoneMPaisa*` database fields in types and PHP** — Retained for backward compatibility with existing orders/settings in the database; the UI hides them so they don't resurface.
- **`FJ` dial code `'fiji' => '679'`** in `api/chat_alerts.php` — required to parse WhatsApp/Viber phone numbers correctly (a functional mapping, not branding).
- **`worldwideLocations.ts` Fiji entries** — Needed so users born in Fiji can select their birth place (astrology accuracy); this is functional geographic data, not marketing.

### C. Card Payment Brands Added
Everywhere PayPal appears it now visibly advertises acceptance of:
- VISA
- Mastercard
- American Express (Amex)
- Discover

These are shown as:
- Footer payment badges
- Checkout payment tabs (a dedicated "Cards" tab)
- PayPal instruction panels (both offline manual and online)
- Policies page
- Admin financial dashboard
- How-It-Works video step 4 (captions, narration text, and UI mock)
- Home FAQ

### D. Pre-existing issues noted (not introduced by this change)
1. **Large JS bundle** (~3.5 MB / ~950 KB gzipped) — Vite warns of chunks >500 KB; consider code-splitting admin pages and the PDF exporter later.
2. **`astrofiji_token` / `fijiastro_token`** legacy localStorage keys are purged on load (harmless, kept for backward-compat cleanup).
3. **M-PAiSA admin fields** still exist in DB schema — they are hidden from UI but will gracefully load/save without breaking anything.
4. **2 npm audit warnings** (1 low, 1 high) were present before this change and not addressed here.

---

## 2. Verification
- TypeScript type check (`npx tsc --noEmit`) — **passes with 0 errors**.
- Production build (`npm run build`) — **succeeds**.
- Dev server starts cleanly on port 5173.

## 3. Recommended next steps (manual)
- Log in to the Admin Portal → Payment Settings and verify PayPal client ID/secret are configured so online card checkout works end-to-end.
- If you no longer need the FJD price tier, you can later delete `fijiPriceFJD` and the `vodafoneMPaisa*` columns from the `system_settings` table (only after taking a DB backup).
- Search the production PHP database's `users` table for `country = 'Fiji'` and decide whether to blank those out for privacy (they are not visible on the public site).
