<?php
/**
 * Admin report delivery: request-body limits, order association and staging.
 *
 * Regression for "Preview-quality report and invoice PDF did not reach the
 * server" on /admin. Root cause: the delivery routes read their JSON with
 * config.php's getJsonBody(), which silently returns [] above 1 MiB, so the
 * ~3 MB approve body (report + invoice) and every ~2.7 MB staged document
 * arrived "empty" and the approval gate failed closed.
 *
 * Covered here (native PHP in CI, php-wasm locally):
 *   - api/request_body.php reads document-sized bodies in full and reports a
 *     too-large / discarded / malformed body explicitly instead of returning [];
 *   - a staged report is attached only to the order it was recorded for;
 *   - staging refuses a report labelled for another order, records the
 *     database identity, and never reports success for a file it did not
 *     fully record;
 *   - the staging target (scope + owning orders) comes from the database.
 *
 * Test data only: staging goes to a temporary directory and the database is
 * an in-memory SQLite file. No e-mail is sent and no real order is touched.
 */

// Keep staged files out of the repository: family_docs.php only defines
// astroFamilyDocsRoot() when it does not exist yet.
$GLOBALS['astroDeliveryTestRoot'] = rtrim(sys_get_temp_dir(), '/') . '/astro-delivery-test-' . bin2hex(random_bytes(4));
@mkdir($GLOBALS['astroDeliveryTestRoot'], 0700, true);
function astroFamilyDocsRoot(): string
{
    return $GLOBALS['astroDeliveryTestRoot'];
}

require_once __DIR__ . '/../api/admin/family_docs.php';

$passed = 0;
function checkDelivery(bool $condition, string $message): void
{
    global $passed;
    if (!$condition) {
        throw new RuntimeException('FAILED: ' . $message);
    }
    $passed++;
    echo "[PASS] {$message}\n";
}

function removeTree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        is_dir($path) ? removeTree($path) : @unlink($path);
    }
    @rmdir($dir);
}

/**
 * Structural PDF shaped like the browser's jsPDF output: one full-page JPEG
 * XObject per page. $streamBytes pads each image so documents can be made
 * realistically large (a real report is ~2 MB).
 */
function deliveryPdf(int $pages = 1, int $width = 2540, int $height = 3592, int $streamBytes = 2048): string
{
    $pageIds = [];
    for ($i = 0; $i < $pages; $i++) {
        $pageIds[] = 3 + ($i * 2);
    }
    $pdf = "%PDF-1.3\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
    $pdf .= '2 0 obj << /Type /Pages /Kids [' . implode(' ', array_map(static function ($id) {
        return $id . ' 0 R';
    }, $pageIds)) . "] /Count {$pages} >> endobj\n";
    foreach ($pageIds as $i => $pageId) {
        $imageId = $pageId + 1;
        $stream = str_repeat(chr(65 + ($i % 26)), $streamBytes);
        $pdf .= "{$pageId} 0 obj << /Type /Page /Parent 2 0 R /Resources << /XObject << /Im{$i} {$imageId} 0 R >> >> >> endobj\n";
        $pdf .= "{$imageId} 0 obj << /Type /XObject /Subtype /Image /Width {$width} /Height {$height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($stream) . " >>\n";
        $pdf .= "stream\n{$stream}\nendstream\nendobj\n";
    }
    return $pdf . "%%EOF\n";
}

function iniBytes(string $value): int
{
    $value = trim($value);
    $unit = strtoupper(substr($value, -1));
    $number = (int) $value;
    switch ($unit) {
        case 'G':
            return $number * 1024 * 1024 * 1024;
        case 'M':
            return $number * 1024 * 1024;
        case 'K':
            return $number * 1024;
    }
    return $number;
}

try {
    echo "--- request body limits (api/request_body.php) ---\n";

    $report = deliveryPdf(3, 2540, 3592, 600 * 1024);  // ~1.8 MB, like a real 3-page report
    $invoice = deliveryPdf(1, 2540, 3592, 350 * 1024); // ~0.35 MB
    $approveJson = json_encode([
        'reportPdfBase64' => base64_encode($report),
        'invoicePdfBase64' => base64_encode($invoice),
        'language' => 'en',
        'requirePreviewQuality' => true
    ]);
    checkDelivery(strlen($approveJson) > 2 * 1048576, 'a realistic inline approve body is well above 1 MiB (' . round(strlen($approveJson) / 1048576, 2) . ' MiB)');

    $reader = static function (string $raw, ?array &$calls = null): callable {
        return static function (int $limit) use ($raw, &$calls) {
            $calls[] = $limit;
            return substr($raw, 0, $limit);
        };
    };

    $calls = [];
    $read = astro_read_json_request_body(ASTRO_DOCUMENT_JSON_MAX_BYTES, $reader($approveJson, $calls), strlen($approveJson));
    checkDelivery($read['ok'] === true && $read['error'] === null, 'the document reader accepts the full approve body');
    checkDelivery(
        isset($read['body']['reportPdfBase64'], $read['body']['invoicePdfBase64'])
            && base64_decode($read['body']['reportPdfBase64'], true) === $report
            && base64_decode($read['body']['invoicePdfBase64'], true) === $invoice,
        'both PDFs come out of the document reader byte-identical'
    );

    $read = astro_read_json_request_body(ASTRO_JSON_BODY_MAX_BYTES, $reader($approveJson), strlen($approveJson));
    checkDelivery(
        $read['ok'] === false && $read['error'] === 'too_large' && $read['body'] === [],
        'the same body under the ordinary 1 MiB limit is reported as too_large (getJsonBody() returned [] silently)'
    );

    $calls = [];
    $read = astro_read_json_request_body(1024, $reader('{"a":1}', $calls), 70 * 1048576);
    checkDelivery($read['error'] === 'too_large' && $calls === [], 'an announced oversized body is refused before it is read into memory');

    $read = astro_read_json_request_body(1024, $reader(str_repeat(' ', 2048) . '{}'), 0);
    checkDelivery($read['error'] === 'too_large' && $read['bytes'] === 1025, 'a body without Content-Length is still capped (reads at most limit + 1 bytes)');

    $read = astro_read_json_request_body(ASTRO_DOCUMENT_JSON_MAX_BYTES, $reader(''), 3 * 1048576);
    checkDelivery($read['ok'] === false && $read['error'] === 'discarded', 'an announced body that never reached PHP is reported as discarded, not as "no PDFs"');

    $read = astro_read_json_request_body(ASTRO_DOCUMENT_JSON_MAX_BYTES, $reader(''), 0);
    checkDelivery($read['ok'] === true && $read['body'] === [], 'a genuinely empty request is still an empty body (the PDF gate then fails closed)');

    $read = astro_read_json_request_body(ASTRO_DOCUMENT_JSON_MAX_BYTES, $reader('{"reportPdfBase64": "JVBER'), 26);
    checkDelivery($read['ok'] === false && $read['error'] === 'invalid_json', 'a truncated JSON body is reported as invalid_json');

    list($status, $payload) = astro_request_body_error_response(['error' => 'too_large', 'declaredBytes' => 70 * 1048576, 'bytes' => 0, 'maxBytes' => ASTRO_DOCUMENT_JSON_MAX_BYTES], 'approval');
    checkDelivery(
        $status === 413 && $payload['success'] === false && $payload['bodyTooLarge'] === true
            && strpos($payload['message'], '70.0 MB') !== false && strpos($payload['message'], '64.0 MB') !== false
            && strpos($payload['message'], 'Nothing was staged, approved or emailed.') !== false,
        'too_large answers 413 with the real sizes and states that nothing was emailed'
    );
    list($status, $payload) = astro_request_body_error_response(['error' => 'discarded', 'declaredBytes' => 3 * 1048576, 'bytes' => 0, 'maxBytes' => ASTRO_DOCUMENT_JSON_MAX_BYTES], 'approval');
    checkDelivery(
        $status === 413 && !empty($payload['bodyDiscarded']) && strpos($payload['message'], 'post_max_size') !== false,
        'discarded answers 413 and names post_max_size / proxy limits as the cause'
    );
    list($status, $payload) = astro_request_body_error_response(['error' => 'invalid_json', 'declaredBytes' => 10, 'bytes' => 10, 'maxBytes' => ASTRO_DOCUMENT_JSON_MAX_BYTES], 'document upload');
    checkDelivery($status === 400 && $payload['success'] === false, 'invalid_json answers 400');

    $userIni = (string) file_get_contents(__DIR__ . '/../api/.user.ini');
    preg_match('/^\s*post_max_size\s*=\s*(\S+)/m', $userIni, $postMax);
    $oneMaxDocumentAsJson = (int) ceil(ASTRO_FAMILY_DOC_MAX_BYTES * 4 / 3) + 64 * 1024;
    checkDelivery(ASTRO_DOCUMENT_JSON_MAX_BYTES >= $oneMaxDocumentAsJson, 'the document limit fits one maximum-size staged PDF as base64 plus its JSON envelope');
    checkDelivery(
        !empty($postMax[1]) && ASTRO_DOCUMENT_JSON_MAX_BYTES < iniBytes($postMax[1]),
        'the document limit stays below post_max_size in api/.user.ini (' . ($postMax[1] ?? '?') . '), so PHP never discards what the reader accepts'
    );

    echo "--- order association (astroSingleOrderClientDocs) ---\n";

    $orderA = ['id' => 'ord_test_a.1', 'number' => 'ORD-TESTA0001'];
    $orderB = ['id' => 'ord_test_b.2', 'number' => 'ORD-TESTB0002'];
    $reportA = deliveryPdf(2, 2540, 3592, 4096);
    $reportB = deliveryPdf(2, 2540, 3592, 8192);
    $stagedInvoice = ['fileName' => 'invoice.pdf', 'content' => $invoice];

    $docs = astroSingleOrderClientDocs([], [
        'reports' => [['orderId' => $orderB['id'], 'orderNumber' => $orderB['number'], 'fileName' => 'b.pdf', 'content' => $reportB]],
        'invoice' => $stagedInvoice
    ], $orderA['id'], $orderA['number']);
    checkDelivery($docs['report'] === null, "another order's staged report is never attached, even when it is the only one staged");

    $docs = astroSingleOrderClientDocs([], [
        'reports' => [
            ['orderId' => $orderB['id'], 'orderNumber' => $orderB['number'], 'fileName' => 'b.pdf', 'content' => $reportB],
            ['orderId' => $orderA['id'], 'orderNumber' => $orderA['number'], 'fileName' => 'a.pdf', 'content' => $reportA]
        ],
        'invoice' => $stagedInvoice
    ], $orderA['id'], $orderA['number']);
    checkDelivery($docs['report'] === $reportA && $docs['invoice'] === $invoice && $docs['quality'] === 'PREVIEW_EXACT', "the order's own staged report and the invoice are attached (PREVIEW_EXACT)");

    $docs = astroSingleOrderClientDocs([], [
        'reports' => [['orderId' => '', 'orderNumber' => $orderA['number'], 'fileName' => 'a.pdf', 'content' => $reportA]],
        'invoice' => $stagedInvoice
    ], $orderA['id'], $orderA['number']);
    checkDelivery($docs['report'] === $reportA, 'a staged report recorded by order number matches that order');

    $docs = astroSingleOrderClientDocs(['reportPdfBase64' => base64_encode($report)], [
        'reports' => [['orderId' => $orderA['id'], 'orderNumber' => $orderA['number'], 'fileName' => 'a.pdf', 'content' => $reportA]],
        'invoice' => $stagedInvoice
    ], $orderA['id'], $orderA['number']);
    checkDelivery($docs['report'] === $report, 'an inline report in the request takes precedence over a staged one');

    $docs = astroSingleOrderClientDocs([
        'reportPdfBase64' => base64_encode(deliveryPdf(2, 1200, 1700)),
        'invoicePdfBase64' => base64_encode($invoice)
    ], ['reports' => [], 'invoice' => null], $orderA['id'], $orderA['number']);
    checkDelivery($docs['report'] === null, 'a low-resolution inline report is still rejected by the quality validator');

    echo "--- staging (astroStageFamilyDoc / astroFamilyDocsResolveTarget) ---\n";

    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        echo "[SKIP] pdo_sqlite is not available; staging and target checks did not run.\n";
    } else {
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('CREATE TABLE orders (id TEXT PRIMARY KEY, order_number TEXT, group_id TEXT NULL, group_order_index INTEGER DEFAULT 0, created_at TEXT)');
        $insert = $pdo->prepare('INSERT INTO orders (id, order_number, group_id, group_order_index, created_at) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([$orderA['id'], $orderA['number'], null, 0, '2026-10-14 10:00:00']);
        $insert->execute([$orderB['id'], $orderB['number'], null, 0, '2026-10-14 10:01:00']);
        $insert->execute(['ord_test_fam_1', 'ORD-TESTF0001', 'GRP-TEST-1', 0, '2026-10-14 10:02:00']);
        $insert->execute(['ord_test_fam_2', 'ORD-TESTF0002', 'GRP-TEST-1', 1, '2026-10-14 10:02:00']);
        $admin = ['id' => 'usr_test_admin', 'name' => 'Test Admin'];

        $targetA = astroFamilyDocsResolveTarget($pdo, $orderA['id'], false);
        checkDelivery(
            $targetA !== null && $targetA['scope'] === 'order_' . $orderA['id']
                && count($targetA['orders']) === 1 && $targetA['orders'][0]['id'] === $orderA['id'],
            'a standalone order stages under order_<id> and only it owns reports there'
        );
        $targetFamily = astroFamilyDocsResolveTarget($pdo, 'ord_test_fam_2', false);
        checkDelivery(
            $targetFamily !== null && $targetFamily['scope'] === 'GRP-TEST-1' && count($targetFamily['orders']) === 2,
            "a grouped order stages under its family group, shared by every member"
        );
        checkDelivery(astroFamilyDocsResolveTarget($pdo, 'GRP-TEST-1', true)['scope'] === 'GRP-TEST-1', 'a family route resolves its group');
        checkDelivery(astroFamilyDocsResolveTarget($pdo, 'ord_missing', false) === null, 'an unknown order has no staging target (nothing is staged for it)');
        checkDelivery(astroFamilyDocsResolveTarget($pdo, 'GRP-MISSING', true) === null, 'an unknown family group has no staging target');

        $scopeA = $targetA['scope'];
        $result = astroStageFamilyDoc($pdo, $admin, $scopeA, [
            'kind' => 'report', 'orderId' => $orderB['id'], 'orderNumber' => $orderB['number'], 'pdfBase64' => base64_encode($reportB)
        ], $targetA['orders']);
        checkDelivery(
            $result['success'] === false && !empty($result['orderMismatch']) && !is_dir(astroFamilyDocsRoot() . '/' . astroFamilyDocsSanitizeKey($scopeA)) ,
            "a report labelled for another order is refused and nothing is written in this order's scope"
        );

        $result = astroStageFamilyDoc($pdo, $admin, $scopeA, [
            'kind' => 'report', 'orderId' => $orderA['id'], 'orderNumber' => $orderB['number'], 'pdfBase64' => base64_encode($reportA)
        ], $targetA['orders']);
        checkDelivery($result['success'] === false && !empty($result['orderMismatch']), 'a report whose order id and order number disagree is refused');

        $result = astroStageFamilyDoc($pdo, $admin, $scopeA, [
            'kind' => 'report', 'orderNumber' => $orderA['number'], 'fileName' => 'ASTRO_SIVAM_Report_ORD-TESTA0001.pdf', 'pdfBase64' => base64_encode($report)
        ], $targetA['orders']);
        $manifest = astroFamilyDocsReadManifest($scopeA);
        checkDelivery(
            $result['success'] === true && $result['staged'] === true && $result['docKey'] === 'report__' . $orderA['id']
                && ($manifest['report__' . $orderA['id']]['orderId'] ?? '') === $orderA['id']
                && ($manifest['report__' . $orderA['id']]['orderNumber'] ?? '') === $orderA['number'],
            "a report staged by order number is recorded under the database's order id and number"
        );

        $result = astroStageFamilyDoc($pdo, $admin, $scopeA, [
            'kind' => 'invoice', 'fileName' => 'ASTRO_SIVAM_Invoice_ORD-TESTA0001.pdf', 'pdfBase64' => base64_encode($invoice)
        ], $targetA['orders']);
        checkDelivery($result['success'] === true && $result['stagedInvoice'] === true && $result['stagedReports'] === 1, 'the invoice is staged in the same order scope');

        $docs = astroSingleOrderClientDocs([], astroLoadStagedFamilyDocs($scopeA), $orderA['id'], $orderA['number']);
        checkDelivery(
            $docs['report'] === $report && $docs['invoice'] === $invoice && $docs['quality'] === 'PREVIEW_EXACT',
            'approval of order A finds exactly the report and invoice uploaded for order A'
        );
        $docs = astroSingleOrderClientDocs([], astroLoadStagedFamilyDocs('order_' . $orderB['id']), $orderB['id'], $orderB['number']);
        checkDelivery($docs['report'] === null && $docs['invoice'] === null, "order B's approval sees none of order A's documents");

        // A manifest that cannot be written must not leave an "uploaded" PDF behind.
        $brokenScope = 'order_ord_test_broken';
        $brokenDir = astroFamilyDocsGroupDir($brokenScope);
        @mkdir($brokenDir . '/manifest.json', 0700, true); // a directory where the manifest file must go
        $result = astroStageFamilyDoc($pdo, $admin, $brokenScope, [
            'kind' => 'invoice', 'pdfBase64' => base64_encode($invoice)
        ], [['id' => 'ord_test_broken', 'order_number' => 'ORD-TESTX0003']]);
        checkDelivery(
            $result['success'] === false && empty($result['staged']) && !is_file($brokenDir . '/invoice.pdf'),
            'when the manifest cannot be written, staging fails and removes the PDF instead of reporting it uploaded'
        );

        $removed = astroClearStagedFamilyDocs($scopeA);
        checkDelivery($removed >= 2 && astroLoadStagedFamilyDocs($scopeA)['invoice'] === null, 'clearing a scope removes its staged documents');
    }

    echo "\nAdmin report delivery tests passed ({$passed} checks).\n";
} catch (Throwable $e) {
    removeTree($GLOBALS['astroDeliveryTestRoot']);
    file_put_contents('php://stderr', $e->getMessage() . "\n");
    exit(1);
}

removeTree($GLOBALS['astroDeliveryTestRoot']);
