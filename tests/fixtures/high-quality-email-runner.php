<?php
declare(strict_types=1);

/**
 * End-to-end PHP + SQLite runtime verification for ASTRO SIVAM's
 * 100% Live-Preview-Quality Email PDF System (zero server PDF fallback).
 */
error_reporting(E_ALL);

$GLOBALS['astroHqEmailTestRoot'] = rtrim(sys_get_temp_dir(), '/') . '/astro-hq-email-' . bin2hex(random_bytes(4));
@mkdir($GLOBALS['astroHqEmailTestRoot'], 0700, true);
function astroFamilyDocsRoot(): string
{
    return $GLOBALS['astroHqEmailTestRoot'];
}

$payloadPath = __DIR__ . '/.hq-email-payload.json';
$input = json_decode((string) file_get_contents($payloadPath), true);
$hiResReportB64 = (string) ($input['hiResReportB64'] ?? '');
$hiResInvoiceB64 = (string) ($input['hiResInvoiceB64'] ?? '');
$lowResPdfB64 = (string) ($input['lowResPdfB64'] ?? '');

require_once __DIR__ . '/../../api/branding.php';
require_once __DIR__ . '/../../api/mailer.php';
require_once __DIR__ . '/../../api/reviews.php';
require_once __DIR__ . '/../../api/admin/family_docs.php';
require_once __DIR__ . '/../../api/admin/order_items.php';

$capturedEmails = [];
AstroMailer::$testTransport = static function (
    string $toEmail,
    string $toName,
    string $subject,
    string $htmlBody,
    array $attachments = [],
    array $settings = [],
    array $inlineImages = []
) use (&$capturedEmails): array {
    $recordedAttachments = [];
    foreach ($attachments as $att) {
        $recordedAttachments[] = [
            'name' => $att['name'] ?? '',
            'bytes' => strlen((string) ($att['content'] ?? '')),
            'isPreviewQuality' => astroFamilyDocsIsPreviewQualityPdf((string) ($att['content'] ?? '')),
        ];
    }
    $capturedEmails[] = [
        'to' => $toEmail,
        'name' => $toName,
        'subject' => $subject,
        'attachments' => $recordedAttachments,
        'hasTempleHeader' => strpos($htmlBody, 'ASTRO SIVAM') !== false,
        'inlineLogoAttached' => !empty($inlineImages),
    ];
    return ['success' => true, 'message' => 'Captured by test harness'];
};

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->sqliteCreateFunction('NOW', static fn() => '2026-10-23 10:00:00');

$pdo->exec("
    CREATE TABLE system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_settings TEXT
    );
    INSERT INTO system_settings (email_settings) VALUES ('{}');

    CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL,
        group_id TEXT DEFAULT NULL,
        group_order_index INTEGER DEFAULT 0,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        service_type TEXT NOT NULL,
        language TEXT DEFAULT 'ta',
        amount REAL DEFAULT 19.99,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'COMPLETED',
        payment_confirmed INTEGER DEFAULT 1,
        email_status TEXT DEFAULT 'SENT',
        email_sent_at TEXT DEFAULT NULL,
        email_last_status_message TEXT DEFAULT NULL,
        has_pdf INTEGER DEFAULT 1,
        has_invoice INTEGER DEFAULT 1,
        input_payload TEXT DEFAULT '{}',
        calculated_result TEXT DEFAULT '{}',
        report_snapshot TEXT DEFAULT NULL,
        report_snapshot_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT '2026-10-23 09:00:00',
        updated_at TEXT DEFAULT '2026-10-23 09:00:00'
    );

    CREATE TABLE order_persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        person_index INTEGER DEFAULT 0,
        name TEXT DEFAULT '',
        gender TEXT DEFAULT 'M',
        dob TEXT DEFAULT NULL,
        tob TEXT DEFAULT NULL,
        place_of_birth TEXT DEFAULT NULL,
        latitude REAL DEFAULT NULL,
        longitude REAL DEFAULT NULL,
        timezone TEXT DEFAULT NULL,
        created_at TEXT DEFAULT '2026-10-23 09:00:00'
    );

    CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT DEFAULT '',
        actor_name TEXT DEFAULT '',
        actor_role TEXT DEFAULT '',
        action TEXT DEFAULT '',
        details TEXT DEFAULT '',
        ip_address TEXT DEFAULT '',
        created_at TEXT DEFAULT '2026-10-23 09:00:00'
    );

    CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        person_id TEXT DEFAULT NULL,
        service_code TEXT NOT NULL,
        language TEXT DEFAULT 'ta',
        unit_price REAL DEFAULT 9.99,
        input_payload TEXT DEFAULT '{}',
        calculated_result TEXT DEFAULT NULL,
        report_snapshot TEXT DEFAULT NULL,
        report_snapshot_at TEXT DEFAULT NULL,
        report_status TEXT DEFAULT 'CALCULATED',
        sent_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT '2026-10-23 09:00:00',
        updated_at TEXT DEFAULT '2026-10-23 09:00:00'
    );
");

$sampleResult = json_encode(['lagna' => 'Simha', 'rasi' => 'Rishaba', 'nakshatra' => 'Rohini']);
$samplePayload = json_encode([
    'name' => 'Karthik Sivam',
    'gender' => 'M',
    'dob' => '1994-05-12',
    'tob' => '06:30',
    'place' => 'Chennai, Tamil Nadu, India',
    'lat' => 13.0827,
    'lon' => 80.2707,
    'tz' => 5.5,
]);

$pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, language, status, input_payload, calculated_result, report_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute(['ord_single_1', 'AS-2026-9001', 'usr_alice', 'Alice Devi', 'alice@example.com', 'BIRTH_JATHAGAM', 'ta', 'COMPLETED', $samplePayload, $sampleResult, $sampleResult]);

$pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, language, status, input_payload, calculated_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute(['ord_multi_1', 'AS-2026-9002', 'usr_alice', 'Alice Devi', 'alice@example.com', 'BIRTH_JATHAGAM', 'ta', 'PROCESSING', $samplePayload, $sampleResult]);

$pdo->prepare("INSERT INTO order_items (id, order_id, service_code, language, unit_price, input_payload, calculated_result, report_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute([101, 'ord_multi_1', 'BIRTH_JATHAGAM', 'ta', 9.99, json_encode(['name' => 'Person One', 'gender' => 'M', 'dob' => '1994-05-12', 'tob' => '06:30', 'birthPlace' => 'Chennai, Tamil Nadu, India', 'latitude' => 13.0827, 'longitude' => 80.2707, 'timezoneOffsetHours' => 5.5, 'timeZoneId' => 'Asia/Kolkata']), $sampleResult, 'CALCULATED']);
$pdo->prepare("INSERT INTO order_items (id, order_id, service_code, language, unit_price, input_payload, calculated_result, report_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute([102, 'ord_multi_1', 'BABY_NAMING', 'ta', 9.99, json_encode(['name' => 'Baby Two', 'gender' => 'F', 'dob' => '2025-03-18', 'tob' => '09:15', 'birthPlace' => 'Madurai, Tamil Nadu, India', 'latitude' => 9.9252, 'longitude' => 78.1198, 'timezoneOffsetHours' => 5.5, 'timeZoneId' => 'Asia/Kolkata']), $sampleResult, 'CALCULATED']);

$out = [];

// 0. Syntax-parse EVERY PHP file across api/ using PHP's real parser (TOKEN_PARSE)
$syntaxChecked = 0;
$phpIter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__ . '/../../api'));
foreach ($phpIter as $fileInfo) {
    if (!$fileInfo->isFile() || $fileInfo->getExtension() !== 'php') continue;
    $pathStr = $fileInfo->getPathname();
    if (strpos($pathStr, DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR) !== false) continue;
    token_get_all((string) file_get_contents($pathStr), TOKEN_PARSE);
    $syntaxChecked++;
}
$out['phpFilesSyntaxParsed'] = $syntaxChecked;

// 1. Cross-user isolation: usr_mallory CANNOT resolve usr_alice's order
$out['crossUserBlocked'] = astroFamilyDocsResolveTarget($pdo, 'ord_single_1', false, 'usr_mallory') === null;

// 2. Owner target resolution: usr_alice resolves isolated customer scope AND multi-person item slots
$aliceSingleTarget = astroFamilyDocsResolveTarget($pdo, 'ord_single_1', false, 'usr_alice');
$aliceMultiTarget = astroFamilyDocsResolveTarget($pdo, 'ord_multi_1', false, 'usr_alice');
$adminMultiTarget = astroFamilyDocsResolveTarget($pdo, 'ord_multi_1', false);

$out['aliceSingleScope'] = $aliceSingleTarget['scope'] ?? null;
$out['aliceMultiOrderIds'] = array_column($aliceMultiTarget['orders'] ?? [], 'id');
$out['adminMultiScope'] = $adminMultiTarget['scope'] ?? null;

// 3. Low-resolution / blurry server-like PDF MUST be rejected at stage time
$lowStage = astroStageFamilyDoc(
    $pdo,
    ['id' => 'usr_alice', 'name' => 'Alice Devi'],
    $aliceSingleTarget['scope'],
    ['kind' => 'report', 'orderId' => 'ord_single_1', 'orderNumber' => 'AS-2026-9001', 'pdfBase64' => $lowResPdfB64],
    $aliceSingleTarget['orders']
);
$out['lowResStageRejected'] = empty($lowStage['success']);

// 4. Low-resolution PDF in multi-person email MUST fail closed with 422 and ZERO emails sent
$multiOrderRow = $pdo->query("SELECT * FROM orders WHERE id = 'ord_multi_1'")->fetch();
$multiItems = astro_order_items_all($pdo, 'ord_multi_1');
$lowSend = astro_send_order_items_email(
    $pdo,
    ['id' => 'admin_1', 'name' => 'Admin'],
    $multiOrderRow,
    $multiItems,
    'approve',
    [
        'reportPdfs' => [
            ['itemId' => 101, 'pdfBase64' => $lowResPdfB64],
            ['itemId' => 102, 'pdfBase64' => $lowResPdfB64],
        ],
        'invoicePdfBase64' => $lowResPdfB64,
    ]
);
$out['lowResSendStatus'] = $lowSend['httpStatus'] ?? 0;
$out['lowResSendMessage'] = $lowSend['message'] ?? '';
$out['sentCountAfterLowRes'] = count($capturedEmails);

// 5. High-resolution staged delivery for multi-person order (Admin Approve)
astroClearStagedFamilyDocs($adminMultiTarget['scope']);
$s1 = astroStageFamilyDoc($pdo, ['id' => 'admin_1', 'name' => 'Admin'], $adminMultiTarget['scope'], ['kind' => 'report', 'orderId' => 'item_101', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResReportB64], $adminMultiTarget['orders']);
$s2 = astroStageFamilyDoc($pdo, ['id' => 'admin_1', 'name' => 'Admin'], $adminMultiTarget['scope'], ['kind' => 'report', 'orderId' => 'item_102', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResReportB64], $adminMultiTarget['orders']);
$sInv = astroStageFamilyDoc($pdo, ['id' => 'admin_1', 'name' => 'Admin'], $adminMultiTarget['scope'], ['kind' => 'invoice', 'orderId' => 'ord_multi_1', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResInvoiceB64], $adminMultiTarget['orders']);

$adminSend = astro_send_order_items_email(
    $pdo,
    ['id' => 'admin_1', 'name' => 'Admin'],
    $multiOrderRow,
    $multiItems,
    'approve',
    []
);
$out['adminMultiStagedOk'] = !empty($s1['success']) && !empty($s2['success']) && !empty($sInv['success']);
$out['adminMultiDelivered'] = !empty($adminSend['success']) && ($adminSend['orderStatus'] ?? '') === 'COMPLETED';
$out['adminMultiSnapLocked'] = (int) $pdo->query("SELECT COUNT(*) FROM order_items WHERE order_id = 'ord_multi_1' AND report_snapshot IS NOT NULL")->fetchColumn();
$out['adminStageCleaned'] = empty(astroLoadStagedFamilyDocs($adminMultiTarget['scope'])['reports'])
    && astroLoadStagedFamilyDocs($adminMultiTarget['scope'])['invoice'] === null;

// 6. Customer self-service staged re-delivery on multi-person order (isolated cust_usr_alice scope)
$updatedMultiOrder = $pdo->query("SELECT * FROM orders WHERE id = 'ord_multi_1'")->fetch();
$updatedMultiItems = astro_order_items_all($pdo, 'ord_multi_1');
astroStageFamilyDoc($pdo, ['id' => 'usr_alice', 'name' => 'Alice Devi'], $aliceMultiTarget['scope'], ['kind' => 'report', 'orderId' => 'item_101', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResReportB64], $aliceMultiTarget['orders']);
astroStageFamilyDoc($pdo, ['id' => 'usr_alice', 'name' => 'Alice Devi'], $aliceMultiTarget['scope'], ['kind' => 'report', 'orderId' => 'item_102', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResReportB64], $aliceMultiTarget['orders']);
astroStageFamilyDoc($pdo, ['id' => 'usr_alice', 'name' => 'Alice Devi'], $aliceMultiTarget['scope'], ['kind' => 'invoice', 'orderId' => 'ord_multi_1', 'orderNumber' => 'AS-2026-9002', 'pdfBase64' => $hiResInvoiceB64], $aliceMultiTarget['orders']);

$custResend = astro_send_order_items_email(
    $pdo,
    ['id' => 'usr_alice', 'name' => 'Alice Devi'],
    $updatedMultiOrder,
    $updatedMultiItems,
    'resend',
    [],
    $aliceMultiTarget['scope']
);
$out['customerResendDelivered'] = !empty($custResend['success']);
$out['customerStageCleaned'] = empty(astroLoadStagedFamilyDocs($aliceMultiTarget['scope'])['reports'])
    && astroLoadStagedFamilyDocs($aliceMultiTarget['scope'])['invoice'] === null;
$out['sentEmails'] = $capturedEmails;

echo json_encode($out, JSON_PRETTY_PRINT);
