<?php
require_once __DIR__ . '/../api/admin/family_docs.php';

function checkPreviewPdfQuality(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "[PASS] {$message}\n";
}

/** Small structural fixture shaped like the browser jsPDF output. */
function previewPdfFixture(array $images, ?int $pageCount = null, bool $includeEof = true): string {
    $pageCount = $pageCount ?? count($images);
    $pageIds = [];
    for ($i = 0; $i < $pageCount; $i++) {
        $pageIds[] = 3 + ($i * 2);
    }

    $pdf = "%PDF-1.7\n";
    $pdf .= "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
    $pdf .= "2 0 obj << /Type /Pages /Kids [" . implode(' ', array_map(fn($id) => $id . ' 0 R', $pageIds)) . "] /Count {$pageCount} >> endobj\n";

    for ($i = 0; $i < $pageCount; $i++) {
        $pageId = $pageIds[$i];
        $imageId = $pageId + 1;
        $image = $images[$i] ?? null;
        $resources = $image
            ? "/Resources << /XObject << /Im{$i} {$imageId} 0 R >> >>"
            : '';
        $pdf .= "{$pageId} 0 obj << /Type /Page /Parent 2 0 R {$resources} >> endobj\n";
        if ($image) {
            $stream = str_repeat('A', 1024);
            $pdf .= "{$imageId} 0 obj << /Type /XObject /Subtype /Image /Width {$image['width']} /Height {$image['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($stream) . " >>\n";
            $pdf .= "stream\n{$stream}\nendstream\nendobj\n";
        }
    }

    return $pdf . ($includeEof ? "%%EOF\n" : '');
}

$high = previewPdfFixture([
    ['width' => 2540, 'height' => 3592]
]);
checkPreviewPdfQuality(astroFamilyDocsIsPreviewQualityPdf($high), 'A high-resolution A4 browser capture passes the PDF quality gate');
checkPreviewPdfQuality(astroFamilyDocsDecodePdf(base64_encode($high)) === $high, 'The base64 decoder accepts the validated preview PDF');
checkPreviewPdfQuality(
    astroFamilyDocsDecodePdf('data:application/pdf;base64,' . base64_encode($high)) === $high,
    'The decoder accepts a PDF data URI without weakening the quality check'
);

$low = previewPdfFixture([
    ['width' => 1800, 'height' => 2700]
]);
checkPreviewPdfQuality(!astroFamilyDocsIsPreviewQualityPdf($low), 'A low-resolution PDF is rejected');

// The old desktop raster (3x on A4 = 2382 x 3369 px, ~288 dpi) is no longer
// enough: the floor is A4 at 300 dpi (2480 x 3508 px).
$subThreeHundredDpi = previewPdfFixture([
    ['width' => 2382, 'height' => 3369]
]);
checkPreviewPdfQuality(
    !astroFamilyDocsIsPreviewQualityPdf($subThreeHundredDpi),
    'A PDF just below the 300 dpi floor (the old 3x desktop raster) is rejected'
);
checkPreviewPdfQuality(astroFamilyDocsDecodePdf(base64_encode($low)) === null, 'A low-resolution PDF cannot be staged for customer email');

$noPageImage = previewPdfFixture([]);
checkPreviewPdfQuality(!astroFamilyDocsIsPreviewQualityPdf($noPageImage), 'A vector-only or image-missing PDF is rejected');

$partialBundle = previewPdfFixture([
    ['width' => 2540, 'height' => 3592]
], 2);
checkPreviewPdfQuality(!astroFamilyDocsIsPreviewQualityPdf($partialBundle), 'Every page in a multi-page PDF must have a high-resolution raster');

$twoPages = previewPdfFixture([
    ['width' => 2480, 'height' => 3508],
    ['width' => 2540, 'height' => 3592]
]);
checkPreviewPdfQuality(astroFamilyDocsIsPreviewQualityPdf($twoPages), 'A multi-page PDF passes when every page meets the minimum resolution');

$truncated = previewPdfFixture([
    ['width' => 2540, 'height' => 3592]
], 1, false);
checkPreviewPdfQuality(!astroFamilyDocsIsPreviewQualityPdf($truncated), 'A truncated PDF without an EOF marker fails closed');
checkPreviewPdfQuality(astroFamilyDocsDecodePdf('not base64') === null, 'Malformed base64 is rejected');

// There is no server-side PDF renderer any more: the PHP views produce HTML
// only, and every PDF is captured in the browser from that same HTML. A
// server renderer reappearing here would be a second, lower-quality engine.
require_once __DIR__ . '/../api/astrology/engine.php';
checkPreviewPdfQuality(
    !class_exists('AstroMpdfReports') && !class_exists('AstroMpdfInvoice'),
    'no server-side mPDF renderer class is loaded'
);
checkPreviewPdfQuality(
    !function_exists('astroEnsureMpdfAutoload') && !function_exists('astroMpdfFontDir'),
    'the mPDF font/autoload configuration is gone'
);
checkPreviewPdfQuality(
    !method_exists('AstroEngine', 'generateReportPdf')
        && !method_exists('AstroEngine', 'generateInvoicePdf')
        && !method_exists('AstroEngine', 'generateFamilyInvoicePdf'),
    'the engine exposes no server PDF generator'
);
checkPreviewPdfQuality(
    strpos(AstroReportViews::sharedCss('ta'), 'notosanstamil') !== false
        && strpos(AstroReportViews::sharedCss('hi'), 'notosansdevanagari') !== false,
    'Browser HTML retains its original Noto Indic fonts'
);

echo "\nAll preview PDF quality checks passed.\n";
