# PDF delivery quality contract

Paid customers receive the report and invoice rendered from the same browser HTML used by the approved preview. The PHP API does not substitute a server-generated PDF when a browser render is missing, incomplete, or below the minimum capture resolution.

## Customer approval and resend emails

- Single-order and family report/invoice PDFs are rendered in the browser from the shared report and invoice HTML builders with `html2canvas` + `jsPDF`.
- Every document — paid reports, invoices and public **samples** alike — is captured at 3.2× scale (A4 print density) with JPEG quality 0.95. Every A4 page must be at least **2480 × 3508 pixels** (300 dpi); a capture that misses either dimension is retried and then fails before upload/email. The email path never falls back to a lighter download-only capture.
- The PHP API validates each uploaded PDF's header and EOF marker, page count, and embedded raster resolution before staging or mail dispatch. Missing, low-resolution, vector-only, truncated, or oversized documents are rejected.
- Every report and invoice must pass before approval/resend. If a capture or upload fails, the action returns an error and **no email is sent**.

The raster and page checks are a technical floor, not a replacement for visual review. The browser tests also compare captured report text against preview screenshots for English, Tamil, and Hindi.

## Customer dashboard downloads

The dashboard's **Download Report** is the same browser-rendered document as the email and the approved preview. It fetches the immutable snapshot (`GET /api/services/orders/:id/report-snapshot`, owner-only, delivered-only, one report per request), rebuilds the report with the shared HTML builders and captures it with `renderEmailPdfBase64` — the *same* 300 dpi profile (3.2× scale, JPEG 0.95, 2480 × 3508 px floor) used for the emailed PDF and the admin preview. A failed capture is retried at the same density; if the device still cannot manage it the dashboard says so instead of downloading anything, because **there is no server-side PDF renderer any more** and no lighter copy is ever produced. No download path recalculates a report.

## No server-side PDF renderer

The mPDF renderer was removed in October 2026: `AstroMpdfReports`, `AstroMpdfInvoice`, `mpdf_fontconfig.php`, `api/check_mpdf.php` and every route that streamed a server-generated PDF (`/services/orders/:id/report-pdf`, `/services/export-preview-pdf`, `/admin/orders/:id/pdf`, `/admin/family-orders/:groupId/invoice-pdf`) are gone. PHP now produces **HTML only** (`api/astrology/report_views.php`, used by the admin preview routes and the parity tests); every PDF is captured in a browser from that same HTML. `composer.json` therefore requires only `smalot/pdfparser`, which the AI report importer uses to read an uploaded PDF — it never writes one.

Consequences:

- An admin approval/resend without browser-rendered report **and** invoice PDFs fails closed (no email is sent) instead of falling back to a thinner render.
- A customer whose device cannot capture the print canvas gets a clear error, not a different document.
- `api/astrology/fonts/` is kept: the browser capture and the report HTML load those same Tamil/Hindi fonts.

Customer email delivery requires the validated browser-rendered documents described above.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:php # requires a PHP CLI; checks PHP PDF quality gates and fail-closed behavior
npm run test:pdf # browser capture / preview parity; requires Playwright Chromium
```
