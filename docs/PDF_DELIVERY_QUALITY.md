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
- **The approving device does not change the document.** An admin who approves from a phone gets the same 300 dpi A4 capture as one who approves from a desktop — every paid render goes through `renderEmailPdfBase64()` (one helper, one profile), which retries the *same* density once and then fails closed. There is no `deviceMemory`/user-agent branch left in the exporter.
- **Paid PDFs have exactly one quality on the whole site.** The emailed report/invoice, the admin preview download, the family bundle and the customer dashboard download all use `PDF_RENDER_OPTIONS` (= `EMAIL_RENDER_OPTIONS`: 3.2× ≈ 307 dpi, JPEG 0.95, 2480 × 3508 px floor). There is no reduced-density download retry; a failed capture is retried at the *same* density and then reported.
- **Public sample reports are the one allowed exception:** they capture at 40% below print density — `SAMPLE_RENDER_OPTIONS` = 3.2 × 0.6 = 1.92× (≈ 184 dpi, A4 ≈ 1524 × 2155 px) with the same JPEG 0.95. The sample profile is reachable only from sample mode in `LivePdfPreviewModal`; every paid, admin and email path is clamped to the print profile. `tests/pdf-pipeline-integrity.test.ts` fails if any other lighter profile appears.

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

### When a device cannot capture at 300 dpi

A phone that cannot allocate the 2540 × 3592 px canvas cannot approve an order — by design. Instead of a
raw canvas error the operator sees an actionable message (`emailPrintDensityFailureMessage()`):

> Report PDF could not be rendered at print quality (300 dpi: 2480 × 3508 px per A4 page) on this device.
> Nothing was emailed and the order is still pending — ASTRO SIVAM never sends a report below 300 dpi.
> Close other tabs to free memory and retry, or approve this order from a desktop browser.

The order stays `PENDING`, so the same order can be approved later from any device without double-sending.
Reports for delivery are captured one page at a time (36 MB per page canvas, released immediately), which is
what keeps the print density viable on a phone at all.

### Deploying a change to the floor

The client floor (`A4_PRINT_MIN_*`) and the server floor (`ASTRO_FAMILY_DOC_MIN_PREVIEW_*`) must move
**together**, in one deployment. A server running the 300 dpi floor with a client that still captures at
3× (2382 × 3369 px) refuses every document and **no report can be emailed**; the reverse combination
silently ships sub-300-dpi reports. Deploy the whole `dist.zip` (frontend + `api/`), then verify with one
real order from `/admin`.

## No server-side PDF renderer

The mPDF renderer was removed in October 2026. `AstroMpdfReports`, `AstroMpdfInvoice`, `mpdf_fontconfig.php`, `api/check_mpdf.php` and every route that streamed a server-generated PDF (`/services/orders/:id/report-pdf`, `/services/export-preview-pdf`, `/admin/orders/:id/pdf`, `/admin/family-orders/:groupId/invoice-pdf`) are gone. PHP now produces **HTML only** (`api/astrology/report_views.php`, used by the admin preview routes and the parity tests); every PDF is captured in a browser from that same HTML. `composer.json` requires only `smalot/pdfparser`, a read-only parser used by the AI report importer.

An admin approval/resend without browser-rendered report and invoice PDFs fails closed (no email is sent). A customer whose device cannot capture the print canvas is told, never handed a different document. `api/astrology/fonts/` is kept: the browser capture and the report HTML load those same Tamil/Hindi fonts.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:php # requires a PHP CLI; checks PHP PDF quality gates and fail-closed behavior
npm run test:pdf # browser capture / preview parity; requires Playwright Chromium
```

Where each level of the 300 dpi contract is proven:

| Claim | Evidence |
|---|---|
| the profile, the ladder and the failure text | `tests/pdf-pipeline-integrity.test.ts` (static, always runs) |
| client and server floors agree (2480 × 3508, scale 3.2 ≥ 300 dpi) | `tests/admin-report-delivery.test.ts` |
| the **emailed bytes** are print quality | the mailer double records each attachment's embedded rasters; every delivery assertion checks them |
| a phone-sized viewport really produces a 300 dpi approval | `tests/browser/admin-report-delivery.spec.ts` (desktop and 390 × 844 cases, real Chromium → real PHP gate) |
