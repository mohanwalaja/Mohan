# How-It-Works Voice-Over: PayPal Narration Replaces the Retired Local-Wallet Script

> Field feedback: *"In how it works the voice still says local clients pay with a
> mobile wallet. Just mention all over website with pay PayPal — can pay with
> VISA and Mastercard which is supported by PayPal."*

## What was wrong

The on-screen captions, checkout, footer, home-page FAQ and policies already
say **PayPal (VISA · Mastercard · Amex · Discover)**, but the six narrated
voice-over clips in `public/audio/step-*.mp3` were still generated from the
**old script** that told listeners to pay with a retired mobile wallet. So the
*voice* contradicted the rest of the site.

## What changed

* All six narration clips were re-recorded (same male Indian-English
  narration voice, `voice-00`) from the **current** caption scripts:
  *Step four: Make a secure payment. Use Google Pay or UPI for India, PayPal
  for international clients, accepting VISA, Mastercard, Amex, and
  Discover.* — and equivalent current wording for the other five steps.
* `src/pages/HowItWorksPage.tsx`: `narrationDuration` and every caption
  `start`/`end` were re-measured from the new clips (MPEG frame walk) and
  re-scaled per step, so captions stay in sync with the voice:
  12.17 / 12.41 / 12.48 / 11.59 / 14.57 / 14.57 s (all inside their existing
  17/20/19/14/19/19 s timeline windows).

## Site-wide payment wording (verified consistent)

| Surface | Wording |
|---|---|
| How-It-Works step 4 (text + voice) | Google Pay / UPI · India; PayPal · Worldwide; VISA · Mastercard · Amex · Discover |
| Checkout (`PaymentGatewayCheckoutBox`) | "PayPal (VISA · Mastercard · Amex · Discover)"; "PayPal accepts all major cards… A PayPal account is not required" |
| Home page FAQ | PayPal (VISA, Mastercard, Amex, Discover and more), Cards, Google Pay / UPI |
| Footer | PayPal under Payments & Security |
| Policies page | PayPal worldwide + cards via PayPal |
| Cart logic | legacy wallet selections are mapped to `PAYPAL` (`CartContext`); `pricing.ts` no longer offers them |

No customer-facing surface mentions the retired wallet any more, and the admin
payment panel no longer renders its configuration section.

## Verification

`npm run lint` clean, `npm run build` clean (new clips shipped in
`dist/audio/`), full `npm test` suite passes.
