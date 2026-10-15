# Registered business identity — invoices and website (India / Udyam MSME)

> **What changed (15 Oct 2026):** ASTRO SIVAM now declares its registered business
> identity — an MSME registration in India — on the website and on every tax
> invoice, replacing the stale `Business Reg. No: ASV-FJ-2026` placeholder that
> sat in the invoice header metadata.

**Udyam Registration No.: `UDYAM-TN-35-0058124`**
(registered in India as a *Micro, Small & Medium Enterprise (MSME)* under the
Udyam Registration scheme of the Ministry of Micro, Small & Medium Enterprises,
Government of India; registered office: Chennai, Tamil Nadu, India).

## Why the number lives in two places and nowhere else

The tax invoice is rendered **twice**, by two runtimes that cannot import each
other:

| Renderer | Used by | Source of the number |
| --- | --- | --- |
| `src/services/invoiceHtmlBuilder.ts` | Live PDF preview, customer download (jsPDF capture), the PDF the admin portal attaches to the "Approved" email | `src/data/businessInfo.ts` |
| `api/astrology/pdf_mpdf_invoice.php` (mPDF) | Server-side invoice generation via `AstroEngine` | `ASTRO_BUSINESS_REG_NO` in `api/branding.php` |

Both constants must hold the **same** string. Neither template may retype it:
`tests/business-registration.test.ts` scans the shipped tree and fails if the
number appears anywhere other than the frontend module, the PHP constant and the
static `index.html` document (which cannot import a module and therefore inlines
it in its JSON-LD). The two test files also compare the frontend constant with
the PHP one, so the invoice and the website can never quote different entities.

## Where it is surfaced

**On the invoice (both layouts — single order and consolidated family):**

* header metadata line — `TAX INVOICE • INV-<no> • Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)`;
* the declaration — `ASTRO SIVAM is registered in India as a Micro, Small &
  Medium Enterprise (MSME) under Udyam Registration No. UDYAM-TN-35-0058124,
  with its registered office at Chennai, Tamil Nadu, India.`

The country is stated next to the number because orders are accepted from India
and from the worldwide customer base alike, and the disclosure has to be
unambiguous about where the enterprise is registered.

**On the website:**

* footer (every page) — `Registered MSME in India • Udyam Reg. No. …` plus the
  registered office and business support address;
* About page — badge under the "About ASTRO SIVAM" eyebrow, and in the
  "Chennai, India" mission band;
* Contact page — a *Business Registration* row in the advisory-centre card
  (the same details a billing enquiry needs);
* every policy page (privacy, terms, payment, refund) — a *Registered Business
  Information* block, and the governing-law sentence on the refund policy now
  names the jurisdiction (Chennai, Tamil Nadu, India — with the number);
* `index.html` JSON-LD `Organization` — `legalName`, `address`
  (Chennai / Tamil Nadu / IN) and `identifier`
  (`PropertyValue`: *Udyam Registration Number (MSME, India)*), so the registered
  entity is machine-readable for search engines and payment/gateway reviewers.

## Layout contract

The invoice is a one-A4-sheet document, so the added declaration line had to fit
the existing sheet without breaking
[`REPORT_AND_INVOICE_FULL_PAGE_LAYOUT.md`](REPORT_AND_INVOICE_FULL_PAGE_LAYOUT.md).
Measured with the shipped report faces in headless Chromium:

```
Tax invoice    / invoice-page: height=297.00mm scroll=297.13mm trailing=0.00mm widest gap=0.79mm
Family invoice / invoice-page: height=297.00mm scroll=297.13mm trailing=0.00mm widest gap=0.79mm
```

Nothing was added to fill space and the growing block still absorbs the leftover
millimetres, so the sheet stays full to the footer band.

## Bundle budget

`src/data/businessInfo.ts` is shared by the always-loaded chrome (footer, About,
Contact, policies) **and** the deferred invoice builder. As an unassigned shared
module Rollup hoisted it into the invoice builder's manual chunk, which made that
chunk a static dependency of the entry and re-introduced the audit PERF-1
finding (homepage pulling the report/PDF path). `vite.config.ts` therefore pins
the module to `vendor-core` — the chunk the entry already downloads — and
`tests/initial-js-budget.test.ts` proves no PDF/Leaflet code is reachable from
first paint (initial JS stays at 370 kB).

## Changing the number later

1. Edit `src/data/businessInfo.ts` **and** `ASTRO_BUSINESS_REG_NO` in
   `api/branding.php` — they must match.
2. `index.html` (JSON-LD) carries a literal copy because it is a static
   document: update it too.
3. Run `npm test` (frontend guard) and `bash scripts/run-php-tests.sh`
   (`tests/invoice-business-registration.test.php` renders both mPDF invoices
   and asserts the disclosure) — both fail loudly while the values disagree.
