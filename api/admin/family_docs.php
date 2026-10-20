<?php
/**
 * ASTRO SIVAM - Staged "preview-exact" family documents
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The admin panel renders every report / invoice in the browser with the
 * same responsive high-resolution html2canvas + jsPDF pipeline as the live
 * preview. A family bundle of N devotees therefore produces N PDFs.
 *
 * Sending all of that inside ONE JSON body (the old behaviour) breaks on real
 * hosting:
 *
 *   - PHP's default `post_max_size` is 8M. When a request body is larger than
 *     that, PHP silently discards it: `php://input` comes back EMPTY, no error
 *     is raised, and the approve handler simply does not see `reportPdfs`.
 *   - The approval handler now fails closed when any staged document is
 *     missing; it never substitutes a server-side renderer for customer email.
 *   - ModSecurity / LiteSpeed request-body limits on shared hosting reject the
 *     same oversized POST even earlier (HTTP 403/413).
 *
 * A single order (1 report + 1 invoice ≈ 3 MB base64) stays under the limit,
 * which is why single orders always looked perfect while family bundles did
 * not.
 *
 * THE FIX
 * -------
 * The admin panel now uploads ONE document per request (≈2.7 MB base64 each,
 * comfortably inside any limit) to a staging area, exactly like the single
 * order flow renders one report at a time. `astroApproveFamilyGroup()` then
 * picks the staged files up from disk and attaches them to the email parts.
 * If any required report or invoice never arrives, approval stops without
 * sending; nothing is replaced by a lower-quality server-rendered PDF.
 *
 * THE APPLICATION-LEVEL LIMIT
 * ---------------------------
 * Raising post_max_size was not enough: config.php's getJsonBody() also caps
 * JSON bodies at 1 MiB and silently returns [] above it, which dropped every
 * staged document AND every inline single-order approval (both ~2-3 MB). The
 * document routes therefore read their bodies through api/request_body.php
 * (astro_document_json_body), which has its own document-sized limit and
 * reports a too-large or discarded body explicitly instead of hiding it.
 *
 * ORDER ASSOCIATION
 * -----------------
 * The server, not the request, decides who owns a staged document: the scope
 * comes from the order / group in the URL (astroFamilyDocsResolveTarget), a
 * report must name an order that belongs to that scope, and approval only
 * attaches a staged report whose recorded order matches exactly.
 *
 * Entry points:
 *   POST /api/admin/family-orders/:groupId/stage-doc      (api/admin/index.php)
 *   POST /api/admin/family_docs.php?group_id=...          (direct, no rewrite)
 *   POST /api/admin/orders/:id/stage-doc                  (single order parity)
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../request_body.php';

if (!defined('ASTRO_FAMILY_DOC_MAX_BYTES')) {
    // 40 MB per document - far above a multi-page print-quality report (the
    // browser capture is ~0.3-0.6 MB per A4 page at the current profile),
    // small enough to keep a hostile admin request from filling the disk.
    define('ASTRO_FAMILY_DOC_MAX_BYTES', 40 * 1024 * 1024);
}
if (!defined('ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX')) {
    // A4 at 200 dpi = 1654 x 2339 px (8.2677in x 11.6929in @ 200 dpi). This is
    // the print-quality floor for a PAID report: the browser captures at
    // 2.2x = 1746 x 2470 px (~211 dpi), so the floor has headroom but never
    // admits a sub-200-dpi document. The capture used to run at 300 dpi, which
    // made a four-page report ~3 MB and a report + invoice email ~5 MB; the
    // owner asked for half that on mobile data, so the density came down to
    // the 200 dpi print floor while the JPEG quality stays at 0.88 (the byte
    // budget may step compression down to 0.80, never the resolution).
    // Mirrored client-side by A4_PRINT_MIN_* in
    // src/services/jathagamPdfExporter.ts.
    define('ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX', 1654);
}
if (!defined('ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX')) {
    define('ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX', 2339);
}
if (!defined('ASTRO_FAMILY_DOC_TTL')) {
    // Staged documents are transient: they only need to survive the few
    // minutes between "admin clicked Approve" and "the email left the server".
    define('ASTRO_FAMILY_DOC_TTL', 6 * 3600);
}

if (!function_exists('astroFamilyDocsSanitizeKey')) {
    /** Filesystem-safe key (no traversal, no shell metacharacters). */
    function astroFamilyDocsSanitizeKey($value): string
    {
        $clean = preg_replace('/[^A-Za-z0-9_\-.]/', '_', (string) $value);
        $clean = trim((string) $clean, '_-.');
        return substr($clean, 0, 80);
    }
}

if (!function_exists('astroFamilyDocsRoot')) {
    /**
     * Root staging directory. Prefers api/storage/family_docs (deployed with
     * the API folder) and transparently falls back to the system temp dir when
     * the hosting account does not allow writes inside public_html.
     */
    function astroFamilyDocsRoot(): string
    {
        static $resolved = null;
        if ($resolved !== null) {
            return $resolved;
        }

        $candidates = [
            __DIR__ . '/../storage/family_docs',
            sys_get_temp_dir() . '/astrosivam_family_docs'
        ];

        foreach ($candidates as $dir) {
            if (!is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
            if (is_dir($dir) && is_writable($dir)) {
                $probe = $dir . '/.write_probe_' . getmypid();
                if (@file_put_contents($probe, 'ok') !== false) {
                    @unlink($probe);
                    $resolved = rtrim($dir, '/');
                    return $resolved;
                }
            }
        }

        // Keep all fallback writes/pruning in our own subdirectory; never use
        // the shared system temp root itself.
        $resolved = rtrim(sys_get_temp_dir(), '/') . '/astrosivam_family_docs';
        if (!is_dir($resolved)) {
            @mkdir($resolved, 0700, true);
        }
        if (is_dir($resolved)) {
            @chmod($resolved, 0700);
        }
        return $resolved;
    }
}

if (!function_exists('astroFamilyDocsGroupDir')) {
    /**
     * Directory holding one scope's staged documents. Read paths pass
     * $create = false so they never resurrect a folder that was just cleaned up.
     */
    function astroFamilyDocsGroupDir($scope, bool $create = true): string
    {
        $key = astroFamilyDocsSanitizeKey($scope);
        if ($key === '') {
            $key = 'unknown';
        }
        $dir = astroFamilyDocsRoot() . '/' . $key;
        if ($create && !is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        if ($create && is_dir($dir)) {
            @chmod($dir, 0700);
        }
        return $dir;
    }
}

if (!function_exists('astroFamilyDocsManifestPath')) {
    function astroFamilyDocsManifestPath($scope, bool $create = true): string
    {
        return astroFamilyDocsGroupDir($scope, $create) . '/manifest.json';
    }
}

if (!function_exists('astroFamilyDocsReadManifest')) {
    function astroFamilyDocsReadManifest($scope): array
    {
        $path = astroFamilyDocsManifestPath($scope, false);
        if (!is_file($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if (empty($raw)) {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('astroFamilyDocsWriteManifest')) {
    function astroFamilyDocsWriteManifest($scope, array $manifest): bool
    {
        $path = astroFamilyDocsManifestPath($scope);
        $tmp = $path . '.' . getmypid() . '.tmp';
        $json = json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            return false;
        }
        @chmod($tmp, 0600);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        @chmod($path, 0600);
        return true;
    }
}

if (!function_exists('astroFamilyDocsPrune')) {
    /**
     * Remove staged documents older than the TTL. Called opportunistically so
     * a crashed/abandoned admin session can never leave PDFs on the server.
     */
    function astroFamilyDocsPrune($maxAgeSeconds = null): int
    {
        $maxAge = $maxAgeSeconds === null ? ASTRO_FAMILY_DOC_TTL : (int) $maxAgeSeconds;
        $root = astroFamilyDocsRoot();
        $removed = 0;

        $groups = @glob($root . '/*', GLOB_ONLYDIR);
        if (!is_array($groups)) {
            return 0;
        }

        $cutoff = time() - $maxAge;
        foreach ($groups as $groupDir) {
            $manifestPath = $groupDir . '/manifest.json';
            $touched = is_file($manifestPath) ? (int) filemtime($manifestPath) : (int) @filemtime($groupDir);
            $files = @glob($groupDir . '/*');
            $newest = $touched;
            if (is_array($files)) {
                foreach ($files as $file) {
                    $mtime = (int) @filemtime($file);
                    if ($mtime > $newest) {
                        $newest = $mtime;
                    }
                }
            }
            if ($newest > 0 && $newest < $cutoff) {
                if (is_array($files)) {
                    foreach ($files as $file) {
                        if (@is_file($file)) {
                            @unlink($file);
                            $removed++;
                        }
                    }
                }
                @rmdir($groupDir);
            }
        }

        return $removed;
    }
}

if (!function_exists('astroFamilyDocsIsPreviewQualityPdf')) {
    /**
     * Accept only the browser's print-density A4 captures used for customer
     * email. Each page must be represented by exactly one embedded raster at
     * least 1654 × 2339 px (A4 at 200 dpi); server-generated/vector or
     * reduced-resolution PDFs do not satisfy this email contract.
     */
    function astroFamilyDocsIsPreviewQualityPdf($binary): bool
    {
        if (!is_string($binary) || strlen($binary) <= 512 || strlen($binary) > ASTRO_FAMILY_DOC_MAX_BYTES) {
            return false;
        }
        if (strpos(substr($binary, 0, 1024), '%PDF-') === false
            || strpos(substr($binary, -2048), '%%EOF') === false) {
            return false;
        }

        $pageCount = preg_match_all('/\/Type\s*\/Page\b/', $binary);
        if ($pageCount === false || $pageCount < 1 || $pageCount > 100) {
            return false;
        }

        $imageCount = 0;
        $cursor = 0;
        while (preg_match('/\/Subtype\s*\/Image\b/', $binary, $imageMatch, PREG_OFFSET_CAPTURE, $cursor) === 1) {
            $imageOffset = (int) $imageMatch[0][1];
            $objectEnd = strpos($binary, 'endobj', $imageOffset);
            if ($objectEnd === false) {
                return false;
            }
            $streamStart = strpos($binary, 'stream', $imageOffset);
            $dictionaryEnd = ($streamStart !== false && $streamStart < $objectEnd) ? $streamStart : $objectEnd;
            $dictionary = substr($binary, $imageOffset, $dictionaryEnd - $imageOffset);

            if (!preg_match('/\/Width\s+(\d+)\b/', $dictionary, $widthMatch)
                || !preg_match('/\/Height\s+(\d+)\b/', $dictionary, $heightMatch)
                || (int) $widthMatch[1] < ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX
                || (int) $heightMatch[1] < ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX) {
                return false;
            }

            $imageCount++;
            if ($imageCount > $pageCount) {
                return false;
            }
            $cursor = $objectEnd + strlen('endobj');
        }

        return $imageCount === $pageCount;
    }
}

if (!function_exists('astroFamilyDocsDecodePdf')) {
    /**
     * Decode + enforce the high-resolution browser-preview PDF contract.
     * Returns the binary string, or null when a payload is missing, malformed,
     * too large, incomplete, or below the minimum per-page raster resolution.
     */
    function astroFamilyDocsDecodePdf($pdfBase64)
    {
        if (!is_string($pdfBase64) || $pdfBase64 === '') {
            return null;
        }
        // Tolerate data-URI prefixes ("data:application/pdf;base64,....").
        if (stripos(substr($pdfBase64, 0, 64), 'base64,') !== false) {
            $comma = strpos($pdfBase64, ',');
            if ($comma !== false) {
                $pdfBase64 = substr($pdfBase64, $comma + 1);
            }
        }
        // Whitespace/newlines inside base64 are legal but break strict decode.
        $pdfBase64 = preg_replace('/\s+/', '', $pdfBase64);

        $binary = base64_decode((string) $pdfBase64, true);
        if ($binary === false || !astroFamilyDocsIsPreviewQualityPdf($binary)) {
            return null;
        }
        return $binary;
    }
}

if (!function_exists('astroFamilyDocsResolveTarget')) {
    /**
     * Server-side owner of a staging request: the scope the documents are
     * stored under and the orders that may own a report in it. The scope comes
     * from the database, never from the request body, so a document cannot be
     * filed under another customer's order.
     *
     *   - a standalone order stages under "order_<id>" and only it owns reports;
     *   - a grouped order (or a family route) stages under its group_id and any
     *     member of that group owns its own report.
     *
     * @return array{scope:string,orders:array<int,array{id:string,order_number:string}>}|null
     *         null when the order / family group does not exist.
     */
    function astroFamilyDocsResolveTarget(PDO $pdo, $id, bool $isGroup): ?array
    {
        $id = trim((string) $id);
        if ($id === '') {
            return null;
        }

        if ($isGroup) {
            $stmt = $pdo->prepare('SELECT id, order_number FROM orders WHERE group_id = ? ORDER BY group_order_index ASC, created_at ASC');
            $stmt->execute([$id]);
            $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (empty($members)) {
                return null;
            }
            return ['scope' => $id, 'orders' => array_map(static function ($row) {
                return ['id' => (string) $row['id'], 'order_number' => (string) $row['order_number']];
            }, $members)];
        }

        $stmt = $pdo->prepare('SELECT id, order_number, group_id FROM orders WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        if (!empty($row['group_id'])) {
            return astroFamilyDocsResolveTarget($pdo, (string) $row['group_id'], true);
        }
        return [
            'scope' => 'order_' . $row['id'],
            'orders' => [['id' => (string) $row['id'], 'order_number' => (string) $row['order_number']]]
        ];
    }
}

if (!function_exists('astroStageFamilyDoc')) {
    /**
     * Store ONE preview-rendered document (a member report or the consolidated
     * family invoice) for later attachment by astroApproveFamilyGroup().
     *
     * Accepted body:
     *   kind          'report' (default) | 'invoice'
     *   orderId       orders.id            (report)
     *   orderNumber   orders.order_number  (report, fallback match)
     *   fileName      attachment filename
     *   pdfBase64     the rendered PDF
     *
     * @param array|null $scopeOrders orders that may own a report in this scope
     *        (astroFamilyDocsResolveTarget()['orders']). When given, a report
     *        naming any other order is refused, and the recorded identity is
     *        the database's, so approval can match it exactly.
     *
     * @return array{success:bool,message:string,staged?:bool,docKey?:string,kind?:string,sizeBytes?:int,stagedReports?:int,stagedInvoice?:bool,orderMismatch?:bool}
     */
    function astroStageFamilyDoc(PDO $pdo, array $admin, $scope, array $body, ?array $scopeOrders = null): array
    {
        $scope = astroFamilyDocsSanitizeKey($scope);
        if ($scope === '') {
            return ['success' => false, 'message' => 'Missing family group id / order id.'];
        }

        // One 2 MB PDF is cheap, but keep the same headroom the mailers use.
        if (function_exists('set_time_limit')) {
            @set_time_limit(120);
        }
        @ini_set('memory_limit', '512M');

        astroFamilyDocsPrune();

        $kind = strtolower(trim((string) ($body['kind'] ?? 'report')));
        if (!in_array($kind, ['report', 'invoice'], true)) {
            $kind = 'report';
        }

        $orderId = astroFamilyDocsSanitizeKey($body['orderId'] ?? ($body['order_id'] ?? ''));
        $orderNumber = astroFamilyDocsSanitizeKey($body['orderNumber'] ?? ($body['order_number'] ?? ''));
        $fileName = trim((string) ($body['fileName'] ?? ($body['file_name'] ?? '')));

        if ($kind === 'report' && $orderId === '' && $orderNumber === '') {
            return ['success' => false, 'message' => 'A staged report needs orderId or orderNumber.'];
        }

        if ($kind === 'report' && is_array($scopeOrders)) {
            // Every identifier the request gives must point at the SAME order,
            // and that order must own documents in this scope.
            $owner = null;
            foreach ($scopeOrders as $candidate) {
                $candidateId = astroFamilyDocsSanitizeKey($candidate['id'] ?? '');
                $candidateNumber = astroFamilyDocsSanitizeKey($candidate['order_number'] ?? ($candidate['orderNumber'] ?? ''));
                if (($orderId === '' || $orderId === $candidateId)
                    && ($orderNumber === '' || $orderNumber === $candidateNumber)) {
                    $owner = ['id' => $candidateId, 'orderNumber' => $candidateNumber];
                    break;
                }
            }
            if ($owner === null) {
                return [
                    'success' => false,
                    'orderMismatch' => true,
                    'message' => 'This report is labelled for order ' . ($orderNumber !== '' ? $orderNumber : $orderId)
                        . ', which is not the order being delivered, so it was not staged. Re-render the report from the correct order and retry.'
                ];
            }
            $orderId = $owner['id'];
            $orderNumber = $owner['orderNumber'];
        }

        $binary = astroFamilyDocsDecodePdf($body['pdfBase64'] ?? ($body['pdf_base64'] ?? ''));
        if ($binary === null) {
            return [
                'success' => false,
                'message' => 'The uploaded document is not a valid print-quality PDF (each A4 page must contain a raster of at least '
                    . ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX . ' × ' . ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX . ' pixels), or it exceeds the '
                    . round(ASTRO_FAMILY_DOC_MAX_BYTES / 1048576) . ' MB per-document limit.'
            ];
        }

        $docKey = $kind === 'invoice'
            ? 'invoice'
            : 'report__' . ($orderId !== '' ? $orderId : 'num_' . $orderNumber);

        $dir = astroFamilyDocsGroupDir($scope);
        $target = $dir . '/' . $docKey . '.pdf';

        $written = @file_put_contents($target, $binary, LOCK_EX);
        clearstatcache(true, $target);
        if ($written !== strlen($binary) || @filesize($target) !== strlen($binary)) {
            @unlink($target);
            error_log("ASTRO SIVAM: could not stage family document {$docKey} for {$scope} in {$dir}");
            return [
                'success' => false,
                'message' => 'Server staging area is not writable, so the preview-quality PDF could not be stored.'
            ];
        }
        @chmod($target, 0600);

        if ($fileName === '') {
            $fileName = $kind === 'invoice'
                ? "ASTRO_SIVAM_Family_Invoice_{$scope}.pdf"
                : "ASTRO_SIVAM_Report_{$orderNumber}.pdf";
        }
        $fileName = substr(preg_replace('/[^A-Za-z0-9_\-.() ]/', '_', $fileName), 0, 150);
        if (substr(strtolower($fileName), -4) !== '.pdf') {
            $fileName .= '.pdf';
        }

        $manifest = astroFamilyDocsReadManifest($scope);
        $manifest[$docKey] = [
            'kind' => $kind,
            'orderId' => $orderId,
            'orderNumber' => $orderNumber,
            'fileName' => $fileName,
            'sizeBytes' => strlen($binary),
            'stagedAt' => date('c'),
            'stagedBy' => (string) ($admin['name'] ?? 'Administrator')
        ];
        if (!astroFamilyDocsWriteManifest($scope, $manifest)) {
            // Without its manifest entry the approval would never find this PDF;
            // never report it as uploaded.
            @unlink($target);
            error_log("ASTRO SIVAM: could not record staged document {$docKey} for {$scope} in its manifest");
            return [
                'success' => false,
                'message' => 'The preview-quality PDF reached the server but could not be recorded in the staging manifest, so it was discarded. Retry the upload.'
            ];
        }

        $reportCount = 0;
        $hasInvoice = false;
        foreach ($manifest as $entry) {
            if (($entry['kind'] ?? 'report') === 'invoice') {
                $hasInvoice = true;
            } else {
                $reportCount++;
            }
        }

        if (function_exists('logAudit')) {
            // Staging happens once per document; keep it out of the audit trail
            // to avoid noise (the approval itself is audited).
        }

        unset($binary);

        return [
            'success' => true,
            'staged' => true,
            'docKey' => $docKey,
            'kind' => $kind,
            'fileName' => $fileName,
            'sizeBytes' => (int) ($manifest[$docKey]['sizeBytes'] ?? 0),
            'stagedReports' => $reportCount,
            'stagedInvoice' => $hasInvoice,
            'message' => "Preview-quality {$kind} staged for {$scope} ({$reportCount} report(s)"
                . ($hasInvoice ? ' + invoice' : '') . ').'
        ];
    }
}

if (!function_exists('astroLoadStagedFamilyDocs')) {
    /**
     * Read every staged document for a scope back into memory.
     *
     * @return array{reports:array<int,array{orderId:string,orderNumber:string,fileName:string,content:string}>,invoice:array{fileName:string,content:string}|null}
     */
    function astroLoadStagedFamilyDocs($scope): array
    {
        $scope = astroFamilyDocsSanitizeKey($scope);
        if ($scope === '') {
            return ['reports' => [], 'invoice' => null];
        }

        $manifest = astroFamilyDocsReadManifest($scope);
        if (empty($manifest)) {
            return ['reports' => [], 'invoice' => null];
        }

        $dir = astroFamilyDocsGroupDir($scope, false);
        $reports = [];
        $invoice = null;

        foreach ($manifest as $docKey => $entry) {
            $safeKey = astroFamilyDocsSanitizeKey($docKey);
            $path = $dir . '/' . $safeKey . '.pdf';
            if (!is_file($path)) {
                continue;
            }
            $content = @file_get_contents($path);
            if (!astroFamilyDocsIsPreviewQualityPdf($content)) {
                continue;
            }

            if (($entry['kind'] ?? 'report') === 'invoice') {
                $invoice = [
                    'fileName' => (string) ($entry['fileName'] ?? "ASTRO_SIVAM_Family_Invoice_{$scope}.pdf"),
                    'content' => $content
                ];
            } else {
                $reports[] = [
                    'orderId' => (string) ($entry['orderId'] ?? ''),
                    'orderNumber' => (string) ($entry['orderNumber'] ?? ''),
                    'fileName' => (string) ($entry['fileName'] ?? ''),
                    'content' => $content
                ];
            }
        }

        return ['reports' => $reports, 'invoice' => $invoice];
    }
}

if (!function_exists('astroClearStagedFamilyDocs')) {
    /** Delete every staged document for a scope (called after the email is sent). */
    function astroClearStagedFamilyDocs($scope): int
    {
        $scope = astroFamilyDocsSanitizeKey($scope);
        if ($scope === '') {
            return 0;
        }
        $dir = astroFamilyDocsGroupDir($scope, false);
        $files = @glob($dir . '/*');
        $removed = 0;
        if (is_array($files)) {
            foreach ($files as $file) {
                if (@is_file($file)) {
                    @unlink($file);
                    $removed++;
                }
            }
        }
        @rmdir($dir);
        return $removed;
    }
}

if (!function_exists('astroSingleOrderClientDocs')) {
    /**
     * Resolve the preview-exact documents a browser rendered for ONE order.
     *
     * The admin panel and the customer's order modal capture the report and the
     * tax invoice with the same html2canvas + jsPDF pipeline the live preview
     * uses, so the emailed PDFs match what was previewed. They arrive either
     * inline in the approve / resend body or staged one document per request
     * (route 1e in admin/index.php) when the payload would be too large for
     * post_max_size. Anything missing stays null so the caller can fail closed.
     *
     * @param array  $body        decoded JSON body of the approve / resend call
     * @param array  $stagedDocs  result of astroLoadStagedFamilyDocs($scope)
     * @param string $orderId
     * @param string $orderNumber
     * @return array{report:string|null,invoice:string|null,quality:string}
     */
    function astroSingleOrderClientDocs(array $body, array $stagedDocs, $orderId, $orderNumber): array
    {
        $stagedReports = (array) ($stagedDocs['reports'] ?? []);
        $report = astroFamilyDocsDecodePdf($body['reportPdfBase64'] ?? ($body['report_pdf_base64'] ?? ''));
        // Staging records sanitised identifiers; compare like with like.
        $orderId = astroFamilyDocsSanitizeKey($orderId);
        $orderNumber = astroFamilyDocsSanitizeKey($orderNumber);

        if ($report === null) {
            foreach ($stagedReports as $staged) {
                // Only a report recorded for THIS order may be attached. (A
                // lone staged report used to be accepted whatever order it
                // named; staging now records the database identity, so an
                // exact match is always available for a legitimate upload.)
                $matchesOrder =
                    ((string) $orderId !== '' && (string) ($staged['orderId'] ?? '') === (string) $orderId) ||
                    ((string) $orderNumber !== '' && (string) ($staged['orderNumber'] ?? '') === (string) $orderNumber);
                if ($matchesOrder) {
                    $report = (string) ($staged['content'] ?? '');
                    break;
                }
            }
        }

        $invoice = astroFamilyDocsDecodePdf($body['invoicePdfBase64'] ?? ($body['invoice_pdf_base64'] ?? ''));
        if ($invoice === null && !empty($stagedDocs['invoice']['content'])) {
            $invoice = (string) $stagedDocs['invoice']['content'];
        }

        // `quality` describes how complete this staging call is. PREVIEW_EXACT
        // is the only value that can be emailed: the browser-rendered upload IS
        // the document, and a server-side renderer no longer exists to fill a
        // gap (approval fails closed instead).
        $quality = 'INCOMPLETE';
        if (is_string($report) && $report !== '' && is_string($invoice) && $invoice !== '') {
            $quality = 'PREVIEW_EXACT';
        } elseif ((is_string($report) && $report !== '') || (is_string($invoice) && $invoice !== '')) {
            $quality = 'MIXED';
        } else {
            $report = null;
            $invoice = null;
        }

        return ['report' => $report, 'invoice' => $invoice, 'quality' => $quality];
    }
}

/* -------------------------------------------------------------------------
 * Direct entry point: POST /api/admin/family_docs.php?group_id=XXX
 * (used when the host does not apply the api/.htaccess rewrite rules)
 * ---------------------------------------------------------------------- */
if (basename((string) ($_SERVER['SCRIPT_NAME'] ?? '')) === 'family_docs.php') {
    $pdo = getDbConnection();
    $admin = requireAdmin($pdo);

    $method = $_SERVER['REQUEST_METHOD'];
    // Document-sized limit with explicit errors (see api/request_body.php);
    // getJsonBody() would silently drop any PDF larger than 1 MiB.
    $body = astro_document_json_body('document upload');
    $requestedGroupId = trim((string) ($_GET['group_id'] ?? ($_GET['groupId'] ?? ($body['group_id'] ?? ($body['groupId'] ?? '')))));
    $requestedOrderId = trim((string) ($_GET['order_id'] ?? ($body['orderId'] ?? ($body['order_id'] ?? ''))));

    if ($requestedGroupId === '' && $requestedOrderId === '') {
        jsonResponse(['success' => false, 'message' => 'Missing group_id / order_id'], 400);
    }

    // Match the rewritten /admin/orders/:id/stage-doc route when this direct
    // PHP endpoint is used without URL rewriting. Standalone documents live in
    // order_<id>; grouped members share their actual group_id scope.
    $target = $requestedGroupId !== ''
        ? astroFamilyDocsResolveTarget($pdo, $requestedGroupId, true)
        : astroFamilyDocsResolveTarget($pdo, $requestedOrderId, false);

    if ($method === 'DELETE') {
        // Clearing is always safe; an unknown order simply has nothing staged.
        $scope = $target['scope'] ?? ($requestedGroupId !== '' ? $requestedGroupId : 'order_' . $requestedOrderId);
        jsonResponse([
            'success' => true,
            'removed' => astroClearStagedFamilyDocs($scope),
            'message' => 'Staged documents cleared.'
        ]);
    }

    if ($method !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Only POST/DELETE are allowed'], 405);
    }

    if ($target === null) {
        // 422, not 404: a 404 from a staging URL means "route not deployed" to the admin panel.
        jsonResponse(['success' => false, 'message' => 'Order or family group not found; nothing was staged.'], 422);
    }

    jsonResponse(astroStageFamilyDoc($pdo, $admin, $target['scope'], $body, $target['orders']));
}
