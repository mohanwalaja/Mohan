# Business registration number & office address — where each one appears

> **Policy (owner's instruction, 15 Oct 2026):**
>
> | Detail | Tax invoice | Contact page | Everything else |
> | --- | --- | --- | --- |
> | **Udyam/MSME registration number** (`UDYAM-TN-35-0058124`, India) | ✅ printed (both layouts) | ✅ shown | ❌ |
> | **Office address** (Walajapet, Ranipet District 632513) | ❌ never | ✅ shown | ❌ |
>
> The stale placeholder `Business Reg. No: ASV-FJ-2026` — a regional number for an
> entity that is registered in India — is gone from the invoice for good.

## On the invoice

Both layouts (single order and consolidated family) print, in the header metadata
line:

```
TAX INVOICE • INV-<number> • Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)
```

and the declaration closes with:

> ASTRO SIVAM is registered in India as a Micro, Small & Medium Enterprise
> (MSME) under Udyam Registration No. UDYAM-TN-35-0058124.

The country is stated next to the number because the invoice is issued to
customers in India and worldwide alike. No street address appears anywhere on the
document.

## On the Contact page

Contact page → "Astrological Advisory Centre" card:

```
Office Address
ASTROSIVAM
No 4 Thiruttani Thettu Street
Kamakshi Puram
Walajapet
Ranipet District, PIN 632513
Tamil Nadu, INDIA

Business Registration
Udyam Reg. No. UDYAM-TN-35-0058124
Registered MSME in India • Udyam Registration, Ministry of Micro, Small &
Medium Enterprises, Government of India
```

The `Office Address` block replaced the previous vague "Chennai, India" line on
that card. (Other pages still describe the priest team as Chennai-based; that copy
was left untouched — say the word if it should change.)

## Where the strings live

`src/data/businessInfo.ts` is the frontend source of truth: the registration
number and its labels, plus `officeAddressLines` (one entry per printed line,
postal order preserved) and `officeAddressOneLine`.

The invoice is rendered **twice** by runtimes that cannot import each other, so
the PHP side mirrors the number in `ASTRO_BUSINESS_REG_NO` (`api/branding.php`),
which `api/astrology/pdf_mpdf_invoice.php` (mPDF) reads. The address has no PHP
mirror at all — the server never prints it.

| Renderer | Used by | Reads |
| --- | --- | --- |
| `src/services/invoiceHtmlBuilder.ts` | live PDF preview, customer download, admin "Approved" email attachment | `src/data/businessInfo.ts` |
| `api/astrology/pdf_mpdf_invoice.php` | server-side invoice generation | `api/branding.php` |

## Guards

* `tests/business-registration.test.ts` (→ `scripts/run-tests.mjs`) executes **both**
  invoice layouts and asserts the number is present, the address is absent, the
  Contact page renders both from the module, no other page repeats either, and
  repo scans prove nothing retypes the number or leaks the street address (the
  two functional `Walajapet` occurrences — the birthplace picker's place data and
  the ayanamsa verification note — are exempt by shape).
* `tests/invoice-business-registration.test.php` (→ `scripts/run-php-tests.sh`, CI)
  renders the real mPDF HTML for both layouts and asserts the same.

## Changing either value later

Edit `src/data/businessInfo.ts` and, when the **number** changes, also
`ASTRO_BUSINESS_REG_NO` in `api/branding.php` (plus `index.html` if it is ever
referenced there — it currently is not). Run `npm test` and
`bash scripts/run-php-tests.sh`; both fail loudly while the values disagree or
the disclosure appears in the wrong place.
