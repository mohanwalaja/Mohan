# PDF delivery quality contract

Paid customers receive the report and invoice rendered from the same browser HTML used by the approved preview. The PHP API does not substitute a server-generated PDF when a browser render is missing, incomplete, or below the minimum capture resolution.

## Customer approval and resend emails

- Single-order and family report/invoice PDFs are rendered in the browser from the shared report and invoice HTML builders with `html2canvas` + `jsPDF`.
- Every **paid** document is captured at 2.2× scale (≈211 dpi) with JPEG quality 0.88. Every A4 page must be at least **1654 × 2339 pixels** (A4 at 200 dpi); a capture that misses either dimension is retried and then fails before upload/email. The email path never falls back to a lighter download-only capture.
- Compression, not resolution, carries the size target: a per-document byte budget (1.8 MB) may step a page's JPEG quality down to **0.80**. The raster is reused — never resized, never re-captured — so the document gets lighter without getting softer.
- Public **sample** reports are one step lighter still: 13% below the paid capture (1.91× ≈ 183 dpi) at the same JPEG quality, reachable only from sample mode.
- The PHP API validates each uploaded PDF's header and EOF marker, page count, and embedded raster resolution before staging or mail dispatch. Missing, low-resolution, vector-only, truncated, or oversized documents are rejected.
- Every report and invoice must pass before approval/resend. If a capture or upload fails, the action returns an error and **no email is sent**.

The raster and page checks are a technical floor, not a replacement for visual review. The browser tests also compare captured report text against preview screenshots for English, Tamil, and Hindi.

## Why the density is 211 dpi and no longer 300

Every report page is a **raster** (html2canvas → JPEG → jsPDF), so a document's weight is `pixels × compression` and nothing about the layout can change it.

| Profile | Capture | Per A4 page | Four-page Birth Jathagam |
| --- | --- | --- | --- |
| before (Oct 2026) | 3.2× ≈ 307 dpi, JPEG 0.95, 2480 × 3508 floor | ~0.77 MB | **~3.0 MB** (report + invoice email ≈ 5 MB) |
| now | 2.2× ≈ 211 dpi, JPEG 0.88 (0.80 floor), 1654 × 2339 floor | ~0.31 MB | **~1.2–1.4 MB** (report + invoice email ≈ 2 MB) |

The owner approves orders from a phone, on mobile data: a 5 MB payload per order meant minutes of upload before the customer's email left the server, and family bundles multiplied it. 211 dpi stays above the 200 dpi floor continuous-tone print needs, and the reports are read on a phone or on A4 paper. The single knob is `PRINT_CAPTURE_SCALE` in `src/services/jathagamPdfExporter.ts`; raising it restores print sharpness and restores the size with it.

There is a second, larger effect than the bytes: a report + invoice that used to sit **at or over** `SINGLE_ORDER_INLINE_LIMIT_BYTES` (5 MB of base64) now fits comfortably, so the common single-order approval is **one inline request** instead of the staged-upload path (one request per document, then approve). On a phone that is the difference between a couple of seconds and a couple of minutes per order.

Guarded by `tests/report-pdf-size.test.ts` (profile, budget ladder, no canvas resize, client/server floor parity) and `tests/pdf-pipeline-integrity.test.ts`.

## Customer dashboard downloads

The dashboard's **Download Report** is the same browser-rendered document as the email and the approved preview. It fetches the immutable snapshot (`GET /api/services/orders/:id/report-snapshot`, owner-only, delivered-only, one report per request), rebuilds the report with the shared HTML builders and captures it with `renderEmailPdfBase64` — the *same* print profile (2.2× scale, JPEG 0.88, 1654 × 2339 px floor) used for the emailed PDF and the admin preview. A failed capture is retried at the same density; if the device still cannot manage it the dashboard says so instead of downloading anything, because **there is no server-side PDF renderer any more** and no lighter copy is ever produced. No download path recalculates a report.

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
