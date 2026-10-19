# Server-side mPDF renderer removed (19 Oct 2026)

Owner instruction: *"server-side mPDF renderer remove it"*. The browser render is
now the ONLY PDF renderer. No PHP endpoint produces, stores or streams a PDF.

## What was deleted

| Path | What it was |
| --- | --- |
| `class AstroMpdfReports` (was in `pdf_mpdf_reports.php`) | `isAvailable()`, `pdfFontStack()`, `convertHtmlToPdf()`, `generate{BirthJathagam,WeddingMatching,BabyNaming}Pdf()`, temp-file cleanup |
| `api/astrology/pdf_mpdf_invoice.php` | `AstroMpdfInvoice`: single + consolidated invoice HTML *and* mPDF generation |
| `api/astrology/mpdf_fontconfig.php` | mPDF autoload, font dir/data, temp dir |
| `api/check_mpdf.php` | diagnostics page behind `ASTROSIVAM_DIAGNOSTICS` |
| `api/astrology/pdf_mpdf_reports.php` | renamed to `api/astrology/report_views.php`; ONLY `AstroReportViews` (HTML) remains |

Routes removed (they streamed a server-rendered PDF):

- `GET /api/services/orders/:id/report-pdf`
- `POST /api/services/export-preview-pdf`
- `GET /api/admin/orders/:id/pdf`, `/invoice-pdf`, `/invoice`
- `GET /api/admin/family-orders/:groupId/invoice-pdf`

Client helpers removed with them: `downloadMyOrderReport`, `downloadPreviewPdf`,
`getAdminOrderPdfUrl`, `getAdminOrderInvoicePdfUrl`, `getAdminFamilyInvoicePdfUrl`,
`downloadAdminOrderPdf`, `downloadAdminOrderInvoicePdf`,
`downloadAdminFamilyInvoicePdf`, `downloadServerMpdf`, `downloadFromServerUrl`.

## What replaced them

- **Customer download:** `GET /api/services/orders/:id/report-snapshot` returns the
  frozen snapshot body; the dashboard renders it with the shared HTML builders and
  captures it at the email profile (`renderEmailPdfBase64`, 300 dpi, JPEG 0.95,
  2480 × 3508 px floor). The file is the emailed file.
- **Admin report / invoice / family invoice:** the admin panel renders in the
  browser and uploads each document to `/stage-doc` (or the inline payload). The
  server validates it, stores it for that order/group, and attaches it to the mail.
- **Failure policy:** missing or invalid documents fail the send closed —
  `422` with "open the preview and send again" — never a lower-quality substitute.
  A customer device that cannot capture the canvas is told, not handed a thinner file.

## Verification

- `composer.json` requires only `smalot/pdfparser` (read-only, used by the AI
  report importer); the workflow installs that and nothing else.
- `api/astrology/fonts/` stays: the report HTML loads those TTFs in the browser.
- Tests pin the removals: `tests/preview-pdf-quality.test.php`,
  `tests/invoice-business-registration.test.php`,
  `tests/family-members-and-frozen-download.test.ts`,
  `tests/customer-report-download-quality.test.ts`,
  `tests/business-registration.test.ts`, `tests/lockfile-drift.test.ts`,
  `tests/ci-security-gate.test.ts`.
- `api/astrology/report_views.php` keeps the HTML parity tests
  (`jathagam-*`, `remedies`, `report-dob-format`, `muhurtham`,
  `wedding-matching`, `namakaran`) green.

## Deployment notes

- Re-upload `api/` and the rebuilt frontend bundle. There is no new migration.
- `vendor/` may still contain mPDF from an earlier install; nothing loads it, and
  it can be deleted to free quota.
- No environment variable is needed for PDFs any more. `ASTROSIVAM_DIAGNOSTICS`
  no longer exposes any PDF page.
