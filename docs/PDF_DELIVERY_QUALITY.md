# PDF delivery quality contract

Paid customers receive the report and invoice rendered from the same browser HTML used by the approved preview. The PHP API does not substitute a server-generated PDF when a browser render is missing, incomplete, or below the minimum capture resolution.

## Print quality: 300 dpi, A4

A report page is a real A4 sheet (210 × 297 mm = 8.2677 × 11.6929 in), and the capture
scale is a direct dpi multiplier because the browser lays that sheet out at 96 dpi:

```
dpi = 96 × scale     →     300 dpi needs scale ≥ 3.1246
A4 at 300 dpi = 2480 × 3508 px
```

| | Value | Rationale |
|---|---|---|
| Capture scale | **3.2** (`PRINT_CAPTURE_SCALE`) | 2540 × 3592 px ≈ **307 dpi**; the 2% margin keeps html2canvas' integer canvas size and whole-pixel page heights from landing one pixel under the floor |
| Minimum per A4 page | **2480 × 3508 px** (`A4_PRINT_MIN_WIDTH_PX` / `_HEIGHT_PX`) | A4 at exactly 300 dpi |
| JPEG quality | 0.95 | compression only — never a resolution knob |

Every **paid** report and invoice is captured at this density on every device: the emailed
document, a document staged for a family bundle, the admin preview download and the
customer's own download. There is no device-specific profile any more — the old
`2.5×` phone/low-memory capture (≈240 dpi) is gone.

## Customer approval and resend emails

- Single-order and family report/invoice PDFs are rendered in the browser from the shared report and invoice HTML builders with `html2canvas` + `jsPDF`.
- Each A4 page must reach **2480 × 3508 px** (300 dpi) at JPEG quality 0.95. A capture that misses either dimension fails before upload/email; the email path never falls back to a smaller capture — a device that cannot allocate the print canvas fails closed instead of sending a lighter report.
- The PHP API validates each uploaded PDF's header and EOF marker, page count, and embedded raster resolution before staging or mail dispatch. Missing, low-resolution (including the old 3× desktop raster, 2382 × 3369 px ≈ 288 dpi), vector-only, truncated, or oversized documents are rejected.
- Every report and invoice must pass before approval/resend. If a capture or upload fails, the action returns an error and **no email is sent**.
- The only reduced-density profile left in the app is `DOWNLOAD_RENDER_OPTIONS_SAFE` (1.8× ≈ 173 dpi). It is a **download-only** last resort for a device that rejects the print canvas twice; it can never reach an email.
- Public **sample** reports keep their own lighter profile (2× ≈ 200 dpi) and must never reach a paid path — see the guard in `tests/pdf-pipeline-integrity.test.ts`.

### Upload size

At 300 dpi a page is ~1.5–3 MB of JPEG, so a 4-page report plus its invoice is routinely **larger than the
5 MB inline limit** (`SINGLE_ORDER_INLINE_LIMIT_BYTES`). Those orders deliver through the staged path —
one document per request, each validated and stored by `api/admin/family_docs.php` (40 MB per document)
before the approval attaches exactly the staged bytes. Both paths are covered end-to-end in
`tests/admin-report-delivery.test.ts`.

The delivery routes read bodies with `astro_document_json_body()` (`api/request_body.php`, 64 MiB limit),
never with `config.php`'s 1 MiB `getJsonBody()`, which silently returned an empty body and caused
"Preview-quality report and invoice PDF did not reach the server". A body that is too large or discarded
is answered with an explicit `413`. See [ADMIN_REPORT_DELIVERY_FIX.md](ADMIN_REPORT_DELIVERY_FIX.md).

The raster and page checks are a technical floor, not a replacement for visual review. The browser tests also compare captured report text against preview screenshots for English, Tamil, and Hindi.

### Deploying a change to the floor

The client floor (`A4_PRINT_MIN_*`) and the server floor (`ASTRO_FAMILY_DOC_MIN_PREVIEW_*`) must move
**together**, in one deployment. A server running the 300 dpi floor with a client that still captures at
3× (2382 × 3369 px) refuses every document and **no report can be emailed**; the reverse combination
silently ships sub-300-dpi reports. Deploy the whole `dist.zip` (frontend + `api/`), then verify with one
real order from `/admin`.

## PHP server-side PDF exports

PHP server-side report and invoice exports use mPDF only. The former plain-PHP writer (`AstroPdfReports` / `AstroPdfWriter`) has been removed. If mPDF is missing or fails, the PHP endpoint returns an error and produces no substitute PDF. The separate jsPDF exporter is browser-side code; there is no Node.js PDF server or Node route in the production application.

Deployments must install `mpdf/mpdf` under `public_html/vendor` before using PHP server-side export endpoints. Customer email delivery continues to require the validated browser-rendered documents described above.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:php # requires a PHP CLI; checks PHP PDF quality gates and fail-closed behavior
npm run test:pdf # browser capture / preview parity; requires Playwright Chromium
```
