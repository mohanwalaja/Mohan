<?php
/**
 * ASTRO SIVAM - Admin Management API Router
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../astrology/engine.php';
require_once __DIR__ . '/../mailer.php';
require_once __DIR__ . '/../branding.php';
require_once __DIR__ . '/../chat_alerts.php';
require_once __DIR__ . '/../birthday_wishes.php';
require_once __DIR__ . '/../rate_limit.php';
// Review moderation + the "Rate your report" block of the delivery emails.
require_once __DIR__ . '/../reviews.php';
require_once __DIR__ . '/family_approval.php';
require_once __DIR__ . '/family_docs.php';
// Uploaded astrology team portraits (no pasted image URL needed).
require_once __DIR__ . '/team_photos.php';
// Document-sized JSON bodies for the delivery routes (see api/request_body.php).
require_once __DIR__ . '/../request_body.php';

$pdo = getDbConnection();
try {
    $pdo->exec("SET NAMES 'utf8mb4'");
} catch (\Throwable $e) {
    // Ignore if already set
}
$admin = requireAdmin($pdo);

/**
 * Admin actions that generate PDFs, send customer email or call a provider API
 * are rate-limited per administrator, so a valid admin token cannot be used as
 * a bulk-mail or provider-quota weapon.
 */
function astro_admin_action_limit($pdo, $admin, $action) {
    $limits = array(
        // Approve / resend: 30 customer emails per 10 minutes per admin.
        'delivery' => array(30, 600, 'Too many approval emails were sent in a short time. Please wait a few minutes before continuing.'),
        // The test mail is sent to an arbitrary address: 5 per 10 minutes.
        'test-mail' => array(5, 600, 'Too many test emails were sent in a short time. Please wait a few minutes.'),
        // Reconciliation sweeps hit provider APIs: 10 per 10 minutes.
        'provider' => array(10, 600, 'Too many reconciliation runs in a short time. Please wait before sweeping again.'),
        // Team portraits: 20 uploads per 10 minutes per admin. Generous for a
        // real team (a handful of photos), useless as a disk-filling weapon.
        'team-photo' => array(20, 600, 'Too many photo uploads in a short time. Please wait a few minutes and try again.'),
        // Bulk review publish: 10 runs per 10 minutes. Each run publishes at
        // most ASTRO_REVIEW_BULK_MAX rows, so 1000 reviews/10 min is plenty for
        // a real queue and useless as an audit-log flood.
        'review-bulk' => array(10, 600, 'Too many bulk review publishes in a short time. Please wait a few minutes.')
    );
    if (!isset($limits[$action])) return;
    list($maxHits, $windowSeconds, $message) = $limits[$action];
    astro_rate_limit_enforce($pdo, 'admin-action-' . $action, (string)($admin['id'] ?? ''), $maxHits, $windowSeconds, $message);
}
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

/** Credential values are never returned to the browser, including to admins. */
function astroAdminSecretConfigured($value) {
    if (!is_string($value)) return false;
    $secret = trim($value);
    if (strlen($secret) < 8 || strpos($secret, '•') !== false || preg_match('/^\*+$/', $secret)) return false;
    if (preg_match('/^(?:astro_sivam_|change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:secret|token|key)|placeholder)/i', $secret)) return false;
    return true;
}

function astroRedactAdminSettings($settings) {
    if (!is_array($settings)) return $settings;
    foreach (['paypalSecret', 'paypalClientSecret', 'indiaGpayKeySecret', 'indiaGpayWebhookSecret', 'razorpayKeySecret', 'razorpayWebhookSecret', 'razorpaySecret', 'vodafoneMPaisaApiSecret', 'facebookAppSecret'] as $field) {
        $settings[$field . 'Configured'] = astroAdminSecretConfigured($settings[$field] ?? null);
        $settings[$field] = '';
    }

    if (!empty($settings['emailSettings']) && is_array($settings['emailSettings'])) {
        $email = $settings['emailSettings'];
        $secret = $email['smtpPassword'] ?? $email['smtpPass'] ?? null;
        $email['smtpUsername'] = $email['smtpUsername'] ?? $email['smtpUser'] ?? '';
        $email['smtpPasswordConfigured'] = astroAdminSecretConfigured($secret);
        $email['smtpPassword'] = '';
        $email['smtpPass'] = '';
        $email['senderName'] = $email['senderName'] ?? $email['fromName'] ?? 'ASTRO SIVAM Desk';
        $email['senderEmail'] = $email['senderEmail'] ?? $email['fromEmail'] ?? '';
        $email['replyTo'] = $email['replyTo'] ?? $email['replyToEmail'] ?? ($email['senderEmail'] ?? '');
        $email['tlsSecure'] = $email['tlsSecure'] ?? (($email['smtpSecure'] ?? '') === 'ssl');
        $settings['emailSettings'] = $email;
    }

    if (isset($settings['chatAlertSettings']) && is_array($settings['chatAlertSettings'])) {
        foreach (['whatsapp' => ['accessToken', 'webhookUrl'], 'viber' => ['authToken', 'webhookUrl']] as $channel => $fields) {
            if (!isset($settings['chatAlertSettings'][$channel]) || !is_array($settings['chatAlertSettings'][$channel])) continue;
            foreach ($fields as $field) {
                $settings['chatAlertSettings'][$channel][$field . 'Configured'] = astroAdminSecretConfigured($settings['chatAlertSettings'][$channel][$field] ?? null);
                $settings['chatAlertSettings'][$channel][$field] = '';
            }
        }
    }

    // Legacy external-model credentials are no longer exposed or used.
    unset($settings['aiAstrologerSettings']);
    return $settings;
}

/** Remove blank/masked form values so partial admin saves retain stored credentials. */
function astroOmitBlankAdminSecrets($body) {
    if (!is_array($body)) return [];
    foreach (['paypalSecret', 'paypalClientSecret', 'indiaGpayKeySecret', 'indiaGpayWebhookSecret', 'razorpayKeySecret', 'razorpayWebhookSecret', 'razorpaySecret', 'vodafoneMPaisaApiSecret', 'facebookAppSecret'] as $field) {
        if (!astroAdminSecretConfigured($body[$field] ?? null)) unset($body[$field]);
        unset($body[$field . 'Configured']);
    }
    if (isset($body['emailSettings']) && is_array($body['emailSettings'])) {
        $mailPassword = $body['emailSettings']['smtpPassword'] ?? $body['emailSettings']['smtpPass'] ?? null;
        if (!astroAdminSecretConfigured($mailPassword)) {
            unset($body['emailSettings']['smtpPassword'], $body['emailSettings']['smtpPass']);
        }
        unset($body['emailSettings']['smtpPasswordConfigured']);
    }
    if (isset($body['chatAlertSettings']) && is_array($body['chatAlertSettings'])) {
        foreach (['whatsapp' => ['accessToken', 'webhookUrl'], 'viber' => ['authToken', 'webhookUrl']] as $channel => $fields) {
            if (!isset($body['chatAlertSettings'][$channel]) || !is_array($body['chatAlertSettings'][$channel])) continue;
            foreach ($fields as $field) {
                if (!astroAdminSecretConfigured($body['chatAlertSettings'][$channel][$field] ?? null)) unset($body['chatAlertSettings'][$channel][$field]);
                unset($body['chatAlertSettings'][$channel][$field . 'Configured']);
            }
        }
    }
    // Ignore legacy external-model settings; the chat is local-only.
    unset($body['aiAstrologerSettings']);
    return $body;
}

/**
 * Fail-loud schema guards for objects that used to be created inline on web
 * requests. The DDL now lives in api/migrations/013 (fresh installs get it
 * from api/schema.sql instead), and the web DB user is granted no ALTER
 * privilege — so these helpers only VERIFY, and answer 503 with a log line
 * naming the migration when a database was never migrated.
 */
function astroAdminRequireTable($pdo, $table, $migrationFile) {
    try {
        $found = $pdo->query("SHOW TABLES LIKE '" . str_replace("'", "", (string)$table) . "'")->fetchColumn();
    } catch (Exception $e) {
        $found = false;
    }
    if (!$found) {
        error_log("ASTRO SIVAM: table {$table} is missing; run {$migrationFile} on this database.");
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
}

function astroAdminRequireColumns($pdo, $table, $columns, $migrationFile) {
    try {
        $existing = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(PDO::FETCH_COLUMN, 0);
    } catch (Exception $e) {
        $existing = [];
    }
    foreach ((array)$columns as $column) {
        if (!in_array($column, $existing, true)) {
            error_log("ASTRO SIVAM: {$table}.{$column} is missing; run {$migrationFile} on this database.");
            jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
        }
    }
}

// 1. GET /api/admin/orders
if (strpos($path, 'admin/orders') !== false && $method === 'GET' && !preg_match('/admin\/orders\/[^\/]+/', $path)) {
    // The family-bundle columns live in api/migrations/013 (fresh installs: api/schema.sql).
    // Verified, never altered, on web requests — see astroAdminRequireColumns.
    astroAdminRequireColumns($pdo, 'orders', ['group_id', 'group_order_index'], 'api/migrations/013_web_request_ddl_consolidation.sql');

    // Surface every fulfilable order: paid orders whose payment was captured
    // (or verified by an admin), PLUS free-beta charts that never required a
    // payment at all (payment_status NOT_REQUIRED with payment_confirmed 0 —
    // the 1-free-per-IP order carries no intent, so it must not be hidden).
    // Rejected/cancelled and not-yet-captured online orders stay hidden.
    $stmt = $pdo->query("SELECT * FROM orders
        WHERE status NOT IN ('REJECTED','CANCELLED')
          AND (payment_confirmed = 1
               OR UPPER(COALESCE(NULLIF(payment_status, ''), 'PENDING_ADMIN')) = 'NOT_REQUIRED')
          AND (payment_status IS NULL OR payment_status IN ('CAPTURED','NOT_REQUIRED','CONSUMED','VERIFIED_MANUAL'))
        ORDER BY created_at DESC, id ASC");
    $rows = $stmt->fetchAll();

    $orders = array_map(function($r) {
        return [
            'id' => $r['id'],
            'orderNumber' => $r['order_number'],
            // groupId is what the admin portal uses to collapse a multi-chart
            // family bundle into ONE approval unit. Without it every chart
            // renders as a separate order and gets approved/emailed separately.
            'groupId' => (!empty($r['group_id']) ? $r['group_id'] : null),
            'groupOrderIndex' => (int)($r['group_order_index'] ?? 0),
            'ipAddress' => $r['ip_address'] ?? null,
            'userId' => $r['user_id'],
            'userName' => $r['user_name'],
            'userEmail' => $r['user_email'],
            'userMobile' => $r['user_mobile'],
            'country' => $r['country'],
            'serviceType' => $r['service_type'],
            'language' => astro_normalize_report_language($r['language'] ?? 'en'),
            'amount' => floatval($r['amount']),
            'currency' => $r['currency'],
            'serviceMode' => $r['service_mode'],
            'status' => $r['status'],
            'paymentMethod' => $r['payment_method'],
            'paymentReference' => $r['payment_reference'],
            'paymentIntentId' => $r['payment_intent_id'] ?? null,
            'paymentStatus' => $r['payment_status'] ?? ((bool)$r['payment_confirmed'] ? 'VERIFIED_MANUAL' : 'PENDING_ADMIN'),
            'paymentConfirmed' => (bool)$r['payment_confirmed'],
            'emailStatus' => $r['email_status'],
            'emailSentAt' => $r['email_sent_at'],
            'emailLastStatusMessage' => $r['email_last_status_message'],
            'inputPayload' => json_decode($r['input_payload'], true) ?: [],
            'calculatedResult' => json_decode($r['calculated_result'], true) ?: null,
            'hasPdf' => (bool)($r['has_pdf'] ?? 0),
            'hasInvoice' => (bool)($r['has_invoice'] ?? 0),
            'adminNotes' => $r['admin_notes'],
            'refundStatus' => $r['refund_status'],
            'refundReason' => $r['refund_reason'],
            // Pre-approval 90% refund trail (one-click refund). The portal shows
            // the amount and the 3-working-day settlement deadline to the admin.
            'refundPercent' => isset($r['refund_percent']) ? floatval($r['refund_percent']) : null,
            'refundAmount' => isset($r['refund_amount']) ? floatval($r['refund_amount']) : null,
            'refundCurrency' => $r['refund_currency'] ?? null,
            'refundProcessedAt' => $r['refund_processed_at'] ?? null,
            'refundDeadline' => $r['refund_deadline'] ?? null,
            'refundAdminNotes' => $r['refund_admin_notes'] ?? null,
            // How the money actually travelled: GATEWAY (the provider was
            // called and acknowledged the refund) or MANUAL (offline payment,
            // settled by hand within the 3-working-day promise).
            'refundMethod' => $r['refund_method'] ?? null,
            'refundReference' => $r['refund_reference'] ?? null,
            'createdAt' => $r['created_at'],
            'updated_at' => $r['updated_at'],
            'updatedAt' => $r['updated_at'] ?? $r['created_at']
        ];
    }, $rows);

    // Multi-person orders: attach the people and their report items, so the
    // admin portal renders ONE row per order that expands into its people and
    // items. Legacy orders were backfilled with one person + one item each by
    // api/migrations/003_multi_person_orders.sql.
    require_once __DIR__ . '/order_items.php';
    $orders = astro_attach_order_items($pdo, $orders);

    jsonResponse(['success' => true, 'orders' => $orders]);
}

// 1a. POST /api/admin/orders/:id/verify-payment
// Manual payment references remain pending until this explicit admin action.
if (preg_match('/admin\/orders\/([^\/]+)\/verify-payment/', $path, $matches) && $method === 'POST') {
    $orderId = $matches[1];
    $body = getJsonBody();
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    if ((float)($order['amount'] ?? 0) <= 0) {
        jsonResponse(['success' => false, 'message' => 'This order does not require payment verification.'], 400);
    }

    // The online-payment columns live in api/migrations/013 — verified, never altered, here.
    astroAdminRequireColumns($pdo, 'orders', ['payment_intent_id', 'payment_status'], 'api/migrations/013_web_request_ddl_consolidation.sql');

    $adminNotes = trim((string)($body['adminNotes'] ?? 'Payment manually verified by administrator.'));
    if (!empty($order['group_id'])) {
        $upd = $pdo->prepare("UPDATE orders SET payment_status = 'VERIFIED_MANUAL', payment_confirmed = 1, admin_notes = ?, updated_at = NOW() WHERE group_id = ? AND status NOT IN ('CANCELLED', 'REJECTED')");
        $upd->execute([$adminNotes, $order['group_id']]);
    } else {
        $upd = $pdo->prepare("UPDATE orders SET payment_status = 'VERIFIED_MANUAL', payment_confirmed = 1, admin_notes = ?, updated_at = NOW() WHERE id = ?");
        $upd->execute([$adminNotes, $orderId]);
    }
    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'PAYMENT_MANUALLY_VERIFIED', "Payment manually verified for order #{$order['order_number']}");

    $autoApprove = array_key_exists('autoApprove', $body) && (bool)$body['autoApprove'];
    if ($autoApprove) {
        $_GET['id'] = $orderId;
        require __DIR__ . '/approve_order.php';
        exit;
    }
    $fresh = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $fresh->execute([$orderId]);
    jsonResponse(['success' => true, 'message' => 'Payment manually verified. The order is ready for approval.', 'order' => $fresh->fetch()]);
}

// 1b. GET /api/admin/orders/:id/preview-html (Returns exact single-source HTML)
if (preg_match('/admin\/orders\/([^\/]+)\/preview-html/', $path, $matches) && $method === 'GET') {
    $orderId = $matches[1];
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    $result = AstroEngine::rebuildReportResultFromSavedInputs($order);
    $refreshResult = $pdo->prepare("UPDATE orders SET calculated_result = ?, updated_at = NOW() WHERE id = ?");
    $refreshResult->execute([json_encode($result, JSON_UNESCAPED_UNICODE), $order['id']]);
    $order['calculated_result'] = json_encode($result, JSON_UNESCAPED_UNICODE);

    $order['language'] = astro_normalize_report_language($order['language'] ?? 'en');
    require_once __DIR__ . '/../astrology/report_views.php';
    $html = AstroReportViews::renderFullReportHtml($order, $result);

    if (isset($_GET['format']) && $_GET['format'] === 'json') {
        jsonResponse(['success' => true, 'html' => $html]);
    } else {
        header('Content-Type: text/html; charset=UTF-8');
        echo $html;
        exit;
    }
}

// 1c. POST /api/admin/preview-html (Returns exact single-source HTML for any live preview)
if (strpos($path, 'admin/preview-html') !== false && $method === 'POST') {
    $body = getJsonBody();
    $serviceType = $body['serviceType'] ?? 'BIRTH_JATHAGAM';
    $lang = astro_normalize_report_language($body['language'] ?? 'ta');
    $result = $body['result'] ?? [];
    $order = $body['order'] ?? [
        'service_type' => $serviceType,
        'order_number' => 'PREVIEW-' . strtoupper(astro_random_hex(6)),
        'language' => $lang,
        'user_name' => $result['nativeName'] ?? ($result['devoteeName'] ?? 'Valued User')
    ];
    if (!is_array($order)) $order = [];
    $order['service_type'] = $order['service_type'] ?? $serviceType;
    $order['language'] = astro_normalize_report_language($order['language'] ?? $lang);

    require_once __DIR__ . '/../astrology/report_views.php';
    $html = AstroReportViews::renderFullReportHtml($order, $result);

    if (isset($_GET['format']) && $_GET['format'] === 'raw') {
        header('Content-Type: text/html; charset=UTF-8');
        echo $html;
        exit;
    } else {
        jsonResponse(['success' => true, 'html' => $html]);
    }
}

// 1d. (Removed) GET /api/admin/orders/:id/pdf & invoice-pdf & invoice
//
//     The server-side mPDF renderer was retired in Oct 2026. The admin panel
//     captures every report and invoice in the browser from the SAME builders
//     and print profile as the live preview, then stages the finished PDF (1e)
//     for the approval/resend email. There is no lower-quality server render
//     left to fall back to, on purpose.

// 1e. POST /api/admin/orders/:id/stage-doc
//     POST /api/admin/family-orders/:groupId/stage-doc
//     DELETE (same paths) - discard staged documents
//
//     The admin panel renders every report / invoice in the browser at the same
//     high resolution as the live preview. A family bundle cannot reliably fit
//     inside ONE JSON body, so each document is uploaded with its OWN request
//     here and picked up from disk by the approve / resend handlers. Those
//     handlers fail closed if any required preview PDF is missing.
if (preg_match('/(?:family-orders|admin\/orders)\/([^\/]+)\/stage-doc/', $path, $matches)
    && in_array($method, ['POST', 'DELETE'], true)) {

    $rawId = $matches[1];
    $isFamilyRoute = strpos($path, 'family-orders') !== false;

    // A single order stages under "order_<id>" unless it belongs to a family
    // bundle, in which case the group id is the staging scope so ONE approve
    // call can collect every member document. The owner is resolved from the
    // database, never from the request body.
    $target = astroFamilyDocsResolveTarget($pdo, $rawId, $isFamilyRoute);

    if ($method === 'DELETE') {
        // Clearing is always safe; an unknown order simply has nothing staged.
        $scope = $target['scope'] ?? ($isFamilyRoute ? $rawId : 'order_' . $rawId);
        jsonResponse([
            'success' => true,
            'removed' => astroClearStagedFamilyDocs($scope),
            'message' => 'Staged preview documents discarded.'
        ]);
    }

    if ($target === null) {
        // 422, not 404: the admin panel treats a 404 from a staging URL as
        // "route not deployed" and would try the next endpoint instead of
        // showing this message.
        jsonResponse([
            'success' => false,
            'message' => ($isFamilyRoute ? 'Family group' : 'Order') . ' not found; nothing was staged.'
        ], 422);
    }

    // One preview-quality PDF is ~2.7 MB as base64 - above getJsonBody()'s
    // 1 MiB cap, which silently returned [] and made every upload look like
    // an empty request. The document reader has a document-sized limit and
    // answers an explicit 413 (with the real cause) when a body is too large
    // or was discarded before PHP could read it.
    $body = astro_document_json_body('document upload');
    if (empty($body)) {
        jsonResponse([
            'success' => false,
            'message' => 'The document upload arrived without a PDF; nothing was staged. Render the document again and retry.'
        ], 400);
    }

    jsonResponse(astroStageFamilyDoc($pdo, $admin, $target['scope'], $body, $target['orders']));
}

// 1g. Multi-person order items
//     GET  /api/admin/orders/:id/items/:itemId/result  -> get-or-calculate the
//          ONE cached result that both Preview and Send use
//     POST /api/admin/orders/:id/items/:itemId/send    -> one email per order,
//          carrying THIS report + the order's tax invoice
//     POST /api/admin/orders/:id/items/send-all        -> every report of the
//          order + one invoice in ONE email
if (preg_match('/admin\/orders\/([^\/]+)\/items\/(\d+)\/result/', $path, $matches) && $method === 'GET') {
    require_once __DIR__ . '/order_items.php';
    astro_admin_order_item_action($pdo, $admin, $matches[1], $matches[2], 'result', []);
}

if (preg_match('/admin\/orders\/([^\/]+)\/items\/(\d+)\/(send|resend)/', $path, $matches) && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'delivery');
    require_once __DIR__ . '/order_items.php';
    astro_admin_order_item_action($pdo, $admin, $matches[1], $matches[2], $matches[3], astro_document_json_body('report delivery'));
}

if (preg_match('/admin\/orders\/([^\/]+)\/items\/send-all/', $path, $matches) && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'delivery');
    require_once __DIR__ . '/order_items.php';
    astro_admin_order_item_action($pdo, $admin, $matches[1], null, 'send-all', astro_document_json_body('report delivery'));
}

// 2. POST /api/admin/orders/:id/approve
if (preg_match('/admin\/orders\/([^\/]+)\/approve/', $path, $matches) && $method === 'POST') {
    $orderId = $matches[1];
    astro_admin_action_limit($pdo, $admin, 'delivery');
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    // The preview-quality report + invoice travel inline in this body (~3 MB)
    // or were staged beforehand. Read it with the document limit: getJsonBody()
    // returned [] for anything over 1 MiB, so the gate below reported "did not
    // reach the server" for PDFs that had in fact arrived. A body that cannot
    // be used is answered explicitly here, before anything is changed.
    $body = astro_document_json_body('approval');

    if ((float)($order['amount'] ?? 0) > 0) {
        $paymentStatus = strtoupper((string)($order['payment_status'] ?? ''));
        if (!in_array($paymentStatus, ['CAPTURED', 'VERIFIED_MANUAL'], true) && (int)($order['payment_confirmed'] ?? 0) !== 1) {
            jsonResponse(['success' => false, 'message' => 'Payment verification is required before approving this paid order.'], 409);
        }
    }

    // FAMILY ORDERS: this row belongs to a multi-chart bundle that was paid
    // for with a single payment, so it must be fulfilled as one delivery
    // carrying every report + ONE consolidated family tax invoice. Approving
    // the single row here would send 1 report + 1 invoice per member.
    // $body may carry preview-exact high-quality PDFs from the admin live
    // preview (reportPdfs + invoicePdfBase64) - forwarded so the customer
    // receives exactly what the admin previewed.
    if (!empty($order['group_id'])) {
        jsonResponse(astroApproveFamilyGroup($pdo, $admin, $order['group_id'], 'approve', $body));
    }

    // MULTI-PERSON ORDERS: ONE header row (`service_type = MULTI_PERSON`) plus
    // order_items. The per-item action rebuilds each result from that item's
    // saved inputs, and the customer receives ONE email with every report + one invoice.
    require_once __DIR__ . '/order_items.php';
    if (astro_order_uses_items($order, astro_order_items_all($pdo, $orderId))) {
        astro_admin_order_item_action($pdo, $admin, $orderId, null, 'approve', $body);
    }
    // Always rebuild and persist from the saved service inputs; the cached
    // calculated_result is never the source of truth for approval.
    $result = AstroEngine::rebuildReportResultFromSavedInputs($order);
    $refreshResult = $pdo->prepare("UPDATE orders SET calculated_result = ?, updated_at = NOW() WHERE id = ?");
    $refreshResult->execute([json_encode($result, JSON_UNESCAPED_UNICODE), $orderId]);
    $order['calculated_result'] = json_encode($result, JSON_UNESCAPED_UNICODE);

    if (!empty($body['language'])) {
        $order['language'] = astro_normalize_report_language($body['language']);
    }

    // Customer email fulfillment requires both browser-rendered PDFs. A missing
    // or oversized payload is a hard failure - there is no server renderer to substitute.
    $stagedScope = 'order_' . $orderId;
    $stagedDocs = astroLoadStagedFamilyDocs($stagedScope);
    $clientDocs = astroSingleOrderClientDocs($body, $stagedDocs, $orderId, $order['order_number']);
    if ($clientDocs['report'] === null || $clientDocs['invoice'] === null) {
        $missing = [];
        if ($clientDocs['report'] === null) $missing[] = 'report';
        if ($clientDocs['invoice'] === null) $missing[] = 'invoice';
        jsonResponse([
            'success' => false,
            'message' => 'Preview-quality ' . implode(' and ', $missing) . ' PDF did not reach the server. No email was sent; render and upload both documents before approving.'
        ], 422);
    }
    $reportPdf = $clientDocs['report'];
    $invoicePdf = $clientDocs['invoice'];

    // Fetch SMTP settings
    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $emailSettings = $sRow ? json_decode($sRow['email_settings'], true) : [];

    // Human-readable service name for the email body
    $serviceDisplayNames = [
        'BIRTH_JATHAGAM' => 'Vedic Birth Jathagam (Horoscope)',
        'MARRIAGE_COMPATIBILITY' => 'Vedic Marriage Compatibility (10 Poruthams)',
        'BABY_NAMING' => 'Vedic Namakaran (Baby Naming)',
        'MUHURTHAM' => 'Subha Muhurtham (6-Month Auspicious Dates)'
    ];
    $serviceDisplayName = $serviceDisplayNames[$order['service_type']] ?? $order['service_type'];
    $orderDateDisplay = date('d M Y', strtotime($order['created_at'] ?? 'now'));
    $orderAmountDisplay = htmlspecialchars($order['currency'] ?? DEFAULT_CURRENCY) . ' $' . number_format(floatval($order['amount'] ?? 0), 2);
    // "Rate your report" - paid orders only ('' otherwise), see api/reviews.php.
    $reviewInviteHtml = astro_review_invite_email_html($order);

    // Email HTML content - maroon/gold temple branding to match the report & invoice PDFs
    $html = "
    <div style='background:#f4ede1; padding:24px 12px; font-family: Georgia, \'Times New Roman\', serif;'>
    <div style='max-width: 600px; margin: 0 auto; background: #fffdf9; border: 1px solid #e8d9b8; border-radius: 10px; overflow: hidden;'>

      <!-- Header -->
      <div style='background: #7a1f1f; padding: 22px 24px; text-align: center;'>
        " . astro_email_logo_tag(56) . "
        <div style='color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;'>ASTRO SIVAM</div>
        <div style='color:#e9c98a; font-size:12px; margin-top:2px; letter-spacing:0.5px;'>AUTHENTIC VEDIC ASTROLOGY & MATCHMAKING SERVICES</div>
      </div>
      <div style='height:4px; background: repeating-linear-gradient(90deg, #c9962c 0 10px, #7a1f1f 10px 20px);'></div>

      <!-- Body -->
      <div style='padding: 26px 26px 8px;'>
        <p style='color:#1e1508; font-size:15px; margin:0 0 12px;'>Namaste <strong>" . htmlspecialchars($order['user_name']) . "</strong>,</p>
        <p style='color:#4b3d28; font-size:13.5px; line-height:1.7; margin:0 0 18px;'>
          We are pleased to inform you that your order has been verified, calculated with precision Nirayana Vedic ephemeris, and approved by the ASTRO SIVAM administration. Your official documents are attached to this email.
        </p>

        <!-- Order Summary -->
        <div style='border:1px solid #e8d9b8; border-left:4px solid #7a1f1f; border-radius:6px; padding:14px 16px; margin-bottom:18px; background:#fbf6ea;'>
          <div style='color:#7a1f1f; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;'>Order Summary</div>
          <table style='width:100%; border-collapse:collapse; font-size:13px; color:#3d3222;'>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Order Number</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($order['order_number']) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Service</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($serviceDisplayName) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Date Approved</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($orderDateDisplay) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Amount Paid</td>
              <td style='padding:3px 0; text-align:right; font-weight:700; color:#166534;'>" . $orderAmountDisplay . "</td>
            </tr>
          </table>
        </div>

        <!-- Attached Documents -->
        <div style='border:1px solid #e8d9b8; border-radius:6px; padding:14px 16px; margin-bottom:18px; background:#ffffff;'>
          <div style='color:#7a1f1f; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;'>Attached Documents</div>
          <div style='font-size:13px; color:#3d3222; line-height:1.8;'>
            <div>&#10003;&nbsp; <strong>ASTRO_SIVAM_Report_" . htmlspecialchars($order['order_number']) . ".pdf</strong> &mdash; Official Astrological Report</div>
            <div>&#10003;&nbsp; <strong>ASTRO_SIVAM_Invoice_" . htmlspecialchars($order['order_number']) . ".pdf</strong> &mdash; Official Tax Invoice & Payment Receipt</div>
          </div>
        </div>

        {$reviewInviteHtml}

        <!-- Spam Folder Notice -->
        <div style='background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px 14px; margin-bottom:18px; font-size:12.5px; color:#92400e; line-height:1.6;'>
          <strong>Delivery Notice:</strong> If this email lands in your <em>Spam / Junk folder</em>, please mark it <strong>'Not Spam'</strong> and add <strong>admin@astrosivam.com</strong> to your contacts so you don't miss future updates.
        </div>

        <p style='color:#6b5c3e; font-size:12px; line-height:1.6; margin:0 0 4px;'>The two attached PDFs are your official records &mdash; please save them securely, as they are generated for you at the time of sending and are not stored on our servers afterward.</p>
      </div>

      <!-- Footer -->
      <div style='background:#faf3e3; border-top:1px solid #e8d9b8; padding:16px 24px; text-align:center;'>
        <div style='color:#7a1f1f; font-weight:700; font-size:13px;'>Blessings & Warm Regards, ASTRO SIVAM Team</div>
        <div style='color:#a67c1f; font-size:11.5px; margin-top:4px;'>astrosivam.com &bull; admin@astrosivam.com</div>
      </div>

    </div>
    </div>";

    $attachments = [
        ['name' => "ASTRO_SIVAM_Report_{$order['order_number']}.pdf", 'content' => $reportPdf],
        ['name' => "ASTRO_SIVAM_Invoice_{$order['order_number']}.pdf", 'content' => $invoicePdf]
    ];

    $mailResult = AstroMailer::sendEmailWithAttachments(
        $order['user_email'],
        $order['user_name'],
        "ASTRO SIVAM: Your Official PDF Report & Tax Invoice (#{$order['order_number']})",
        $html,
        $attachments,
        $emailSettings,
        astro_inline_logo_attachment()
    );

    $emailStatus = $mailResult['success'] ? 'SENT' : 'FAILED';
    $emailMsg = $mailResult['message'] ?? '';

    // Order is only "COMPLETED" once the report + invoice have actually been
    // delivered by email. If sending failed, keep it in PROCESSING (not
    // COMPLETED) so it's clear to the admin that the customer has NOT
    // received their PDFs yet and the approval needs to be retried.
    // No PDF is ever written to disk here or elsewhere - $reportPdf and
    // $invoicePdf exist only in memory for the duration of this request and
    // are attached directly to the outgoing email, never persisted.
    $finalStatus = $mailResult['success'] ? 'COMPLETED' : 'PROCESSING';

    // The staged preview render (if any) has been delivered - remove it.
    if ($mailResult['success']) {
        astroClearStagedFamilyDocs($stagedScope);
    }

    $upd = $pdo->prepare("UPDATE orders SET status = ?, payment_confirmed = 1, email_status = ?, email_sent_at = CASE WHEN ? = 'SENT' THEN NOW() ELSE email_sent_at END, email_last_status_message = ?, calculated_result = ?, has_pdf = 1, has_invoice = 1, updated_at = NOW() WHERE id = ?");
    $upd->execute([$finalStatus, $emailStatus, $emailStatus, $emailMsg, json_encode($result, JSON_UNESCAPED_UNICODE), $orderId]);

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'ORDER_APPROVED', "Approved order #{$order['order_number']} | document quality: {$clientDocs['quality']}" . ($mailResult['success'] ? " and emailed dual PDFs (order marked COMPLETED)" : " but email delivery FAILED - order kept in PROCESSING for retry"));

    // Best-effort WhatsApp/Viber "order complete" alert (never blocks approval).
    if ($finalStatus === 'COMPLETED') {
        $order['status'] = $finalStatus;
        AstroChatAlerts::sendOrderAlerts($pdo, 'order_completed', [$order]);
    }

    jsonResponse([
        'success' => $mailResult['success'],
        'message' => $mailResult['success']
            ? "Order #{$order['order_number']} approved and completed. Report & Invoice PDFs generated and emailed to {$order['user_email']}."
            : "Order #{$order['order_number']} was calculated, but the email to {$order['user_email']} FAILED to send ({$emailMsg}). The order was NOT marked complete - please fix the email issue and approve again.",
        'emailStatus' => $emailStatus,
        'emailMessage' => $emailMsg,
        'orderStatus' => $finalStatus,
        // Both attached PDFs have passed validation as browser-rendered previews.
        'renderQuality' => $clientDocs['quality'],
        'invoiceQuality' => 'PREVIEW_EXACT'
    ], $mailResult['success'] ? 200 : 503);
}

// 2b. POST /api/admin/orders/:id/resend-email
if (preg_match('/admin\/orders\/([^\/]+)\/resend-email/', $path, $matches) && $method === 'POST') {
    $orderId = $matches[1];
    astro_admin_action_limit($pdo, $admin, 'delivery');
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }
    if ((float)($order['amount'] ?? 0) > 0) {
        $paymentStatus = strtoupper((string)($order['payment_status'] ?? ''));
        if (!in_array($paymentStatus, ['CAPTURED', 'VERIFIED_MANUAL'], true) && (int)($order['payment_confirmed'] ?? 0) !== 1) {
            jsonResponse(['success' => false, 'message' => 'Payment verification is required before fulfilling this paid order.'], 409);
        }
    }

    $body = astro_document_json_body('resend');
    if (!empty($order['group_id'])) {
        jsonResponse(astroApproveFamilyGroup($pdo, $admin, $order['group_id'], 'resend', $body));
    }

    // MULTI-PERSON ORDERS: re-deliver every item's report + one invoice.
    require_once __DIR__ . '/order_items.php';
    if (astro_order_uses_items($order, astro_order_items_all($pdo, $orderId))) {
        astro_admin_order_item_action($pdo, $admin, $orderId, null, 'resend', $body);
    }

    $result = AstroEngine::rebuildReportResultFromSavedInputs($order);
    $refreshResult = $pdo->prepare("UPDATE orders SET calculated_result = ?, updated_at = NOW() WHERE id = ?");
    $refreshResult->execute([json_encode($result, JSON_UNESCAPED_UNICODE), $orderId]);
    $order['calculated_result'] = json_encode($result, JSON_UNESCAPED_UNICODE);

    if (!empty($body['language'])) {
        $order['language'] = astro_normalize_report_language($body['language']);
    }

    // Resends follow the same strict preview-quality contract as approvals.
    $stagedScope = 'order_' . $orderId;
    $stagedDocs = astroLoadStagedFamilyDocs($stagedScope);
    $clientDocs = astroSingleOrderClientDocs($body, $stagedDocs, $orderId, $order['order_number']);
    if ($clientDocs['report'] === null || $clientDocs['invoice'] === null) {
        $missing = [];
        if ($clientDocs['report'] === null) $missing[] = 'report';
        if ($clientDocs['invoice'] === null) $missing[] = 'invoice';
        jsonResponse([
            'success' => false,
            'message' => 'Preview-quality ' . implode(' and ', $missing) . ' PDF did not reach the server. No email was sent; render and upload both documents before resending.'
        ], 422);
    }
    $reportPdf = $clientDocs['report'];
    $invoicePdf = $clientDocs['invoice'];

    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $emailSettings = $sRow ? json_decode($sRow['email_settings'], true) : [];

    $serviceDisplayNames = [
        'BIRTH_JATHAGAM' => 'Vedic Birth Jathagam (Horoscope)',
        'MARRIAGE_COMPATIBILITY' => 'Vedic Marriage Compatibility (10 Poruthams)',
        'BABY_NAMING' => 'Vedic Namakaran (Baby Naming)',
        'MUHURTHAM' => 'Subha Muhurtham (6-Month Auspicious Dates)'
    ];
    $serviceDisplayName = $serviceDisplayNames[$order['service_type']] ?? $order['service_type'];
    $orderDateDisplay = date('d M Y', strtotime($order['created_at'] ?? 'now'));
    $orderAmountDisplay = htmlspecialchars($order['currency'] ?? DEFAULT_CURRENCY) . ' $' . number_format(floatval($order['amount'] ?? 0), 2);
    // "Rate your report" - paid orders only ('' otherwise), see api/reviews.php.
    $reviewInviteHtml = astro_review_invite_email_html($order);

    $html = "
    <div style='background:#f4ede1; padding:24px 12px; font-family: Georgia, \'Times New Roman\', serif;'>
    <div style='max-width: 600px; margin: 0 auto; background: #fffdf9; border: 1px solid #e8d9b8; border-radius: 10px; overflow: hidden;'>

      <div style='background: #7a1f1f; padding: 22px 24px; text-align: center;'>
        " . astro_email_logo_tag(56) . "
        <div style='color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;'>ASTRO SIVAM</div>
        <div style='color:#e9c98a; font-size:12px; margin-top:2px; letter-spacing:0.5px;'>AUTHENTIC VEDIC ASTROLOGY & MATCHMAKING SERVICES</div>
      </div>
      <div style='height:4px; background: repeating-linear-gradient(90deg, #c9962c 0 10px, #7a1f1f 10px 20px);'></div>

      <div style='padding: 26px 26px 8px;'>
        <p style='color:#1e1508; font-size:15px; margin:0 0 12px;'>Namaste <strong>" . htmlspecialchars($order['user_name']) . "</strong>,</p>
        <p style='color:#4b3d28; font-size:13.5px; line-height:1.7; margin:0 0 18px;'>
          Here is your requested copy of your official ASTRO SIVAM astrological documents. Your official reports and tax invoice are attached below.
        </p>

        <div style='border:1px solid #e8d9b8; border-left:4px solid #7a1f1f; border-radius:6px; padding:14px 16px; margin-bottom:18px; background:#fbf6ea;'>
          <div style='color:#7a1f1f; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;'>Order Summary</div>
          <table style='width:100%; border-collapse:collapse; font-size:13px; color:#3d3222;'>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Order Number</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($order['order_number']) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Service</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($serviceDisplayName) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Date</td>
              <td style='padding:3px 0; text-align:right; font-weight:700;'>" . htmlspecialchars($orderDateDisplay) . "</td>
            </tr>
            <tr>
              <td style='padding:3px 0; color:#8a7a55;'>Amount Paid</td>
              <td style='padding:3px 0; text-align:right; font-weight:700; color:#166534;'>" . $orderAmountDisplay . "</td>
            </tr>
          </table>
        </div>

        <div style='border:1px solid #e8d9b8; border-radius:6px; padding:14px 16px; margin-bottom:18px; background:#ffffff;'>
          <div style='color:#7a1f1f; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;'>Attached Documents</div>
          <div style='font-size:13px; color:#3d3222; line-height:1.8;'>
            <div>&#10003;&nbsp; <strong>ASTRO_SIVAM_Report_" . htmlspecialchars($order['order_number']) . ".pdf</strong> &mdash; Official Astrological Report</div>
            <div>&#10003;&nbsp; <strong>ASTRO_SIVAM_Invoice_" . htmlspecialchars($order['order_number']) . ".pdf</strong> &mdash; Official Tax Invoice & Payment Receipt</div>
          </div>
        </div>

        {$reviewInviteHtml}

        <div style='background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px 14px; margin-bottom:18px; font-size:12.5px; color:#92400e; line-height:1.6;'>
          <strong>Delivery Notice:</strong> If this email lands in your <em>Spam / Junk folder</em>, please mark it <strong>'Not Spam'</strong> and add <strong>admin@astrosivam.com</strong> to your contacts.
        </div>
      </div>

      <div style='background:#faf3e3; border-top:1px solid #e8d9b8; padding:16px 24px; text-align:center;'>
        <div style='color:#7a1f1f; font-weight:700; font-size:13px;'>Blessings & Warm Regards, ASTRO SIVAM Team</div>
        <div style='color:#a67c1f; font-size:11.5px; margin-top:4px;'>astrosivam.com &bull; admin@astrosivam.com</div>
      </div>

    </div>
    </div>";

    $attachments = [
        ['name' => "ASTRO_SIVAM_Report_{$order['order_number']}.pdf", 'content' => $reportPdf],
        ['name' => "ASTRO_SIVAM_Invoice_{$order['order_number']}.pdf", 'content' => $invoicePdf]
    ];

    $mailResult = AstroMailer::sendEmailWithAttachments(
        $order['user_email'],
        $order['user_name'],
        "ASTRO SIVAM: Official PDF Report & Tax Invoice (#{$order['order_number']})",
        $html,
        $attachments,
        $emailSettings,
        astro_inline_logo_attachment()
    );

    $emailStatus = $mailResult['success'] ? 'SENT' : 'FAILED';
    $emailMsg = $mailResult['message'] ?? '';

    $upd = $pdo->prepare("UPDATE orders SET email_status = ?, email_sent_at = CASE WHEN ? = 'SENT' THEN NOW() ELSE email_sent_at END, email_last_status_message = ?, updated_at = NOW() WHERE id = ?");
    $upd->execute([$emailStatus, $emailStatus, $emailMsg, $orderId]);

    if ($mailResult['success']) {
        astroClearStagedFamilyDocs($stagedScope);
    }

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'EMAIL_RESENT', "Resent PDF report & invoice email to {$order['user_email']} for order #{$order['order_number']} | document quality: {$clientDocs['quality']}");

    jsonResponse([
        'success' => $mailResult['success'],
        'message' => $mailResult['success']
            ? "Report & Invoice PDFs successfully resent to {$order['user_email']}."
            : "Failed to send email to {$order['user_email']} ({$emailMsg}).",
        'emailStatus' => $emailStatus,
        'emailMessage' => $emailMsg,
        'renderQuality' => $clientDocs['quality'],
        'invoiceQuality' => 'PREVIEW_EXACT'
    ], $mailResult['success'] ? 200 : 503);
}

// 3. POST /api/admin/orders/:id/reject
if (preg_match('/admin\/orders\/([^\/]+)\/reject/', $path, $matches) && $method === 'POST') {
    $orderId = $matches[1];
    $body = getJsonBody();
    $reason = trim($body['reason'] ?? 'Payment reference could not be verified');

    $upd = $pdo->prepare("UPDATE orders SET status = 'REJECTED', admin_notes = ?, updated_at = NOW() WHERE id = ?");
    $upd->execute([$reason, $orderId]);

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'ORDER_REJECTED', "Rejected order {$orderId}: {$reason}");

    jsonResponse(['success' => true, 'message' => 'Order rejected successfully']);
}

// 3b. POST /api/admin/orders/:id/cancel
//
// REFUND POLICY GUARD: cancelling is for orders with nothing to return (free
// beta / unverified payment). A PAID order must go through the one-click
// pre-approval refund instead, because a bare cancel would move the money to
// CANCELLED without ever returning the customer's 90% — the order then leaves
// the admin list un-refunded and is easy to forget. Refuse and point at the
// refund action.
if (preg_match('/admin\/orders\/([^\/]+)\/cancel/', $path, $matches) && $method === 'POST') {
    require_once __DIR__ . '/../refunds.php';

    $orderId = $matches[1];
    $body = getJsonBody();
    $reason = trim((string)($body['reason'] ?? 'Cancelled by administrator'));
    $reason = function_exists('mb_substr') ? mb_substr($reason, 0, 500, 'UTF-8') : substr($reason, 0, 500);
    if ($reason === '') {
        $reason = 'Cancelled by administrator';
    }

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    // STATUS GUARD (mirrors the customer cancel): cancelling a delivered order
    // would hide an emailed report behind CANCELLED. Paid-but-delivered is
    // already non-refundable; free-but-delivered simply stays delivered.
    $adminCancelStatus = strtoupper(trim((string)($order['status'] ?? '')));
    if ($adminCancelStatus === 'CANCELLED') {
        jsonResponse(['success' => true, 'message' => "Order #{$order['order_number']} is already cancelled."]);
    }
    if (!in_array($adminCancelStatus, ['PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION'], true)) {
        if (astro_refund_status_is_delivered($adminCancelStatus)) {
            jsonResponse([
                'success' => false,
                'code' => 'ORDER_ALREADY_DELIVERED',
                'message' => "Order #{$order['order_number']} was already approved and delivered, so it cannot be cancelled. Delete it instead if it must disappear entirely."
            ], 409);
        }
        jsonResponse([
            'success' => false,
            'code' => 'ORDER_NOT_CANCELLABLE',
            'message' => "Order #{$order['order_number']} cannot be cancelled in its current state ({$adminCancelStatus})."
        ], 409);
    }

    if ((float) ($order['amount'] ?? 0) > 0 && (int) ($order['payment_confirmed'] ?? 0) === 1 && !astro_refund_is_already_refunded($order)) {
        jsonResponse([
            'success' => false,
            'code' => 'PAID_ORDER_REQUIRES_REFUND',
            'message' => 'Order #' . $order['order_number'] . ' was paid, so cancelling it would keep the customer\'s money without a refund. Use the one-click Refund 90% button instead: it cancels the order, returns 90% (' . astro_refund_money(astro_refund_amount_for_order($order), $order['currency']) . ') and records the 3-working-day settlement date.'
        ], 409);
    }

    // Atomic against a concurrent customer self-cancel or second admin click.
    $upd = $pdo->prepare("UPDATE orders SET status = 'CANCELLED', admin_notes = ?, refund_reason = ?, updated_at = NOW() WHERE id = ? AND status IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION')");
    $upd->execute([$reason, $reason, $orderId]);
    if ($upd->rowCount() !== 1) {
        $adminRefetch = $pdo->prepare("SELECT status FROM orders WHERE id = ? LIMIT 1");
        $adminRefetch->execute([$orderId]);
        $adminNowStatus = strtoupper(trim((string)($adminRefetch->fetchColumn() ?: $adminCancelStatus)));
        if ($adminNowStatus === 'CANCELLED') {
            jsonResponse(['success' => true, 'message' => "Order #{$order['order_number']} is already cancelled."]);
        }
        jsonResponse([
            'success' => false,
            'code' => 'ORDER_STATUS_CHANGED',
            'message' => "Order #{$order['order_number']} changed while the cancellation was processed (now {$adminNowStatus}). Please refresh and try again."
        ], 409);
    }

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'ORDER_CANCELLED', "Cancelled order #{$order['order_number']}: {$reason}");

    jsonResponse(['success' => true, 'message' => "Order #{$order['order_number']} has been cancelled successfully."]);
}

// 3c. DELETE /api/admin/orders/:id
if (preg_match('/admin\/orders\/([^\/]+)$/', $path, $matches) && $method === 'DELETE') {
    $orderId = $matches[1];

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    $del = $pdo->prepare("DELETE FROM orders WHERE id = ?");
    $del->execute([$orderId]);

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'ORDER_DELETED', "Deleted order #{$order['order_number']} ({$orderId})");

    jsonResponse(['success' => true, 'message' => "Order #{$order['order_number']} permanently deleted."]);
}

// 3d. POST /api/admin/orders/:id/process-refund — ONE-CLICK PRE-APPROVAL REFUND (90%).
//
// THE ONE-CLICK CONTRACT: the admin portal sends exactly one request and no
// amount. The percentage, the refundable amount and the 3-working-day
// settlement deadline are computed here by api/refunds.php, because an amount
// typed by hand is an amount that can be typed wrong, and because the policy
// numbers must live in exactly one place.
//
// POLICY ENFORCEMENT (see api/refunds.php):
//   • NOT yet approved (PENDING / PENDING_APPROVAL / PENDING_PAYMENT_
//     VERIFICATION / CANCELLED) and paid  ->  90% refund, 10% gateway fee kept.
//   • Already approved and delivered (APPROVED / GENERATED / PROCESSING /
//     COMPLETED) -> the order IS the delivered personalised product. Refused
//     with HTTP 409: the portal must not offer a refund the policy declines.
//   • Nothing was ever charged (free-beta or unverified manual payment) ->
//     HTTP 400, there is no money to return.
//   • Already refunded -> idempotent 200 so a double click cannot refund twice.
//
// A family/multi-chart bundle lives in ONE group_id with one payment. Passing
// `refundGroup: true` refunds every member of the group in one click, but only
// when every member is still pre-approval — a partially delivered bundle is
// refused rather than half-refunded.
if (preg_match('/admin\/orders\/([^\/]+)\/process-refund/', $path, $matches) && $method === 'POST') {
    require_once __DIR__ . '/../refunds.php';

    $orderId = $matches[1];
    $body = getJsonBody();
    $refundWholeGroup = !empty($body['refundGroup']);
    $notes = isset($body['adminNotes']) ? trim((string) $body['adminNotes']) : astro_refund_one_click_note();
    if ($notes === '') {
        $notes = astro_refund_one_click_note();
    }

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    // Collect every order row this one click is responsible for.
    $targets = array($order);
    $wholeGroupRefund = false;
    if ($refundWholeGroup && !empty($order['group_id'])) {
        $gStmt = $pdo->prepare("SELECT * FROM orders WHERE group_id = ? ORDER BY group_order_index ASC, id ASC");
        $gStmt->execute([$order['group_id']]);
        $groupRows = $gStmt->fetchAll();
        if (count($groupRows) > 1) {
            $targets = $groupRows;
            $wholeGroupRefund = true;
        }
    }

    // Guard 1 — split the bundle into the rows still to refund and the rows
    // that actually hold money. A family bundle may legitimately contain one
    // FREE_BETA chart (the free first report of the bundle): it must be marked
    // refunded with the rest, but it contributes no money.
    $refundTargets = array();
    $payableTargets = array();
    foreach ($targets as $target) {
        if (astro_refund_is_already_refunded($target)) {
            continue;
        }
        $refundTargets[] = $target;
        if ((float) ($target['amount'] ?? 0) > 0) {
            $payableTargets[] = $target;
        }
    }

    if (empty($refundTargets)) {
        $already = $targets[0];
        $alreadyAmount = isset($already['refund_amount']) ? (float) $already['refund_amount'] : 0.0;
        jsonResponse([
            'success' => true,
            'alreadyRefunded' => true,
            'message' => 'Order #' . $already['order_number'] . ' was already refunded.'
                . ($alreadyAmount > 0 ? ' ' . astro_refund_money($alreadyAmount, $already['refund_currency'] ?? $already['currency'] ?? '') . ' was returned to the customer.' : '')
        ]);
    }

    if (empty($payableTargets)) {
        jsonResponse([
            'success' => false,
            'message' => 'Order #' . $refundTargets[0]['order_number'] . ' has no captured payment, so there is nothing to refund.'
        ], 400);
    }

    // Guard 2 — the policy: once approved (report generated + emailed), the
    // order is completed and is NOT refundable. For a bundle this also refuses a
    // half-delivered group instead of partially refunding it, so one click can
    // never leave the group with mixed Refunded/Completed members.
    foreach ($refundTargets as $target) {
        if (!astro_refund_status_is_delivered($target['status'] ?? '')) {
            continue;
        }
        jsonResponse([
            'success' => false,
            'code' => $wholeGroupRefund ? 'REFUND_GROUP_PARTIALLY_DELIVERED' : 'REFUND_AFTER_APPROVAL_BLOCKED',
            'message' => 'Order #' . $target['order_number'] . ' was approved and the PDF report was emailed, so it is completed and non-refundable under the refund policy. Only orders cancelled BEFORE admin approval qualify for the '
                . (int) ASTRO_REFUND_PERCENT_PRE_APPROVAL . '% refund.'
        ], 409);
    }

    // Compute the money, server-side, at the policy percentage.
    $percent = (float) ASTRO_REFUND_PERCENT_PRE_APPROVAL;
    $amountPaid = 0.0;
    $refundAmount = 0.0;
    $refundIds = array();
    $refundNumbers = array();
    foreach ($payableTargets as $target) {
        $amountPaid += (float) ($target['amount'] ?? 0);
        $refundAmount += astro_refund_amount_for_order($target);
    }
    foreach ($refundTargets as $target) {
        $refundIds[] = $target['id'];
        $refundNumbers[] = $target['order_number'];
    }
    $amountPaid = round($amountPaid, 2);
    $refundAmount = round($refundAmount, 2);
    $feeRetained = round($amountPaid - $refundAmount, 2);
    $currency = (string) ($payableTargets[0]['currency'] ?? DEFAULT_CURRENCY);
    $deadline = astro_refund_settle_deadline_sql();
    $deadlineLabel = astro_refund_settle_deadline_label($deadline);
    $processedAt = date('Y-m-d H:i:s');
    $reason = astro_refund_policy_reason($payableTargets[0]);

    // ------------------------------------------------------------------
    // AUTOMATIC REFUND — the click must move the money, not just the bookkeeping.
    //
    // Every payable order of this click is looked up in payment_intents. When
    // ONE captured online payment funds the whole click (the normal case, even
    // for a family bundle: one payment, one intent), the provider refund API is
    // called for the 90% amount BEFORE any order is marked refunded:
    //
    //   Razorpay (India UPI / GPay) -> /v1/payments/{payment_id}/refund
    //   PayPal (cards / wallet)     -> /v2/payments/captures/{capture_id}/refund
    //
    // If the provider refuses, the request fails with 502 and NOTHING is marked
    // refunded, so the administrator can retry instead of the portal claiming a
    // refund that never happened. Offline/bank/manual payments have no capture
    // to reverse: those are recorded as a MANUAL settlement and the response
    // says so explicitly.
    // ------------------------------------------------------------------
    require_once __DIR__ . '/../payments.php';

    $onlineIntents = array();
    foreach ($payableTargets as $target) {
        $intent = astro_payment_intent_for_order($pdo, $target);
        if (astro_payment_intent_is_refundable($intent)) {
            $onlineIntents[(string) $intent['id']] = $intent;
        }
    }

    $settlementMode = 'MANUAL';
    $gatewayProvider = '';
    $gatewayReference = '';
    $gatewayMessage = 'No online capture was recorded for this payment, so the refund is recorded here and must be settled manually by the administrator within ' . (int) ASTRO_REFUND_WORKING_DAYS . ' working days.';
    $alreadyBookedReference = trim((string) ($payableTargets[0]['refund_reference'] ?? ''));

    if ($alreadyBookedReference !== '') {
        // A previous click already reached the provider but could not finish
        // writing the order rows. Never refund the same payment twice.
        $bookedIntent = count($onlineIntents) === 1 ? reset($onlineIntents) : null;
        $settlementMode = 'GATEWAY';
        $gatewayProvider = is_array($bookedIntent) ? strtolower((string) ($bookedIntent['provider'] ?? '')) : 'gateway';
        $gatewayReference = $alreadyBookedReference;
        $gatewayMessage = 'This payment was already refunded at the provider ('
            . trim($gatewayProvider . ' ' . $gatewayReference)
            . '); the order rows were re-marked without sending a second refund.';
    } elseif (count($onlineIntents) === 1) {
        $refundIntent = reset($onlineIntents);
        $refundResult = astro_payment_refund_intent(
            $pdo,
            $refundIntent,
            $refundAmount,
            $currency,
            'refund-' . $refundTargets[0]['id'] . '-' . (string) $refundIntent['id']
        );

        if (empty($refundResult['ok'])) {
            jsonResponse([
                'success' => false,
                'code' => 'AUTO_REFUND_FAILED',
                'message' => 'Automatic refund refused: ' . $refundResult['message'],
                'refund' => [
                    'orderIds' => array_values($refundIds),
                    'orderNumbers' => array_values($refundNumbers),
                    'amount' => $refundAmount,
                    'amountPaid' => $amountPaid,
                    'currency' => $currency,
                    'settlement' => 'FAILED',
                    'gatewayProvider' => $refundResult['provider'],
                    'gatewayStatus' => $refundResult['status']
                ]
            ], 502);
        }

        $settlementMode = 'GATEWAY';
        $gatewayProvider = $refundResult['provider'];
        $gatewayReference = $refundResult['reference'];
        $gatewayMessage = 'Automatic ' . ucfirst($gatewayProvider) . ' refund ' . $gatewayReference
            . ' issued for ' . astro_refund_money($refundAmount, $currency)
            . '; the customer receives it in their account within ' . (int) ASTRO_REFUND_WORKING_DAYS . ' working days.';
    } elseif (count($onlineIntents) > 1) {
        // Two different captured payments funding one click cannot be refunded
        // as a single amount without guessing a split — refuse instead.
        jsonResponse([
            'success' => false,
            'code' => 'MULTIPLE_PAYMENTS_REQUIRE_MANUAL_REFUND',
            'message' => 'This click spans ' . count($onlineIntents) . ' separate online payments, so one automatic refund amount cannot be split safely. Refund each order from its own row, or settle manually.'
        ], 409);
    }

    foreach ($refundTargets as $target) {
        $upd = $pdo->prepare("UPDATE orders SET status = 'REFUNDED', refund_status = 'REFUNDED', refund_percent = ?, refund_amount = ?, refund_currency = ?, refund_reason = ?, refund_processed_at = ?, refund_deadline = ?, refund_admin_notes = ?, refund_method = ?, refund_reference = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?");
        $upd->execute([
            astro_refund_percent_for_order($target),
            astro_refund_amount_for_order($target),
            $target['currency'] ?? $currency,
            $reason,
            $processedAt,
            $deadline,
            $notes,
            $settlementMode,
            $gatewayReference !== '' ? $gatewayReference : null,
            $notes,
            $target['id']
        ]);
    }

    // Tell the customer (best effort: a mail outage must never hide a refund
    // that the money path already committed).
    $emailSent = false;
    $emailMessage = '';
    try {
        $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
        $sRow = $sStmt->fetch();
        $emailSettings = $sRow ? json_decode($sRow['email_settings'], true) : [];
        $refundEmail = array(
            'amount' => $refundAmount,
            'amountPaid' => $amountPaid,
            'feeRetained' => $feeRetained,
            'percent' => $percent,
            'currency' => $currency,
            'workingDays' => (int) ASTRO_REFUND_WORKING_DAYS,
            'deadlineLabel' => $deadlineLabel,
            'bundleSize' => count($refundTargets),
        );
        $mailResult = AstroMailer::sendEmailWithAttachments(
            $refundTargets[0]['user_email'],
            $refundTargets[0]['user_name'],
            'ASTRO SIVAM: Refund approved for order #' . $refundTargets[0]['order_number'] . ' — settles within ' . (int) ASTRO_REFUND_WORKING_DAYS . ' working days',
            astro_refund_customer_email_html($refundTargets[0], $refundEmail),
            [],
            is_array($emailSettings) ? $emailSettings : [],
            astro_inline_logo_attachment()
        );
        $emailSent = !empty($mailResult['success']);
        $emailMessage = (string) ($mailResult['message'] ?? '');
    } catch (\Throwable $mailError) {
        $emailMessage = $mailError->getMessage();
    }

    $summary = 'Refund approved for order #' . $refundTargets[0]['order_number']
        . ($wholeGroupRefund ? ' (all ' . count($refundTargets) . ' charts in the family bundle)' : '')
        . ': ' . astro_refund_money($refundAmount, $currency) . ' (' . rtrim(rtrim(number_format($percent, 2, '.', ''), '0'), '.') . '% of '
        . astro_refund_money($amountPaid, $currency) . '). '
        . ($settlementMode === 'GATEWAY'
            ? $gatewayMessage
            : $gatewayMessage . ' Settles on or before ' . $deadlineLabel . '.');

    logAudit(
        $pdo,
        $admin['id'],
        $admin['name'],
        'admin',
        'ORDER_REFUNDED',
        'One-click pre-approval refund for order #' . implode(', #', $refundNumbers)
            . ' — ' . astro_refund_money($refundAmount, $currency) . ' of ' . astro_refund_money($amountPaid, $currency)
            . ' (' . rtrim(rtrim(number_format($percent, 2, '.', ''), '0'), '.') . '%), ' . $settlementMode . ' settlement'
            . ($gatewayReference !== '' ? ' (' . $gatewayProvider . ' ' . $gatewayReference . ')' : '')
            . ', settles by ' . $deadlineLabel
            . ', customer email ' . ($emailSent ? 'sent' : 'failed')
    );

    jsonResponse([
        'success' => true,
        'oneClick' => true,
        'message' => $summary,
        'refund' => [
            'orderIds' => array_values($refundIds),
            'orderNumbers' => array_values($refundNumbers),
            'wholeGroup' => $wholeGroupRefund,
            'percent' => $percent,
            'amount' => $refundAmount,
            'amountPaid' => $amountPaid,
            'feeRetained' => $feeRetained,
            'currency' => $currency,
            'workingDays' => (int) ASTRO_REFUND_WORKING_DAYS,
            'processedAt' => $processedAt,
            'deadline' => $deadline,
            'deadlineLabel' => $deadlineLabel,
            // GATEWAY = the provider was called and acknowledged the refund;
            // MANUAL = offline/bank payment recorded for manual settlement.
            'settlement' => $settlementMode,
            'gatewayProvider' => $gatewayProvider,
            'gatewayReference' => $gatewayReference,
            'gatewayMessage' => $gatewayMessage,
            'emailSent' => $emailSent,
            'emailMessage' => $emailMessage
        ]
    ]);
}

// ===================================================================
// FAMILY ORDER GROUP MANAGEMENT (multiple charts, one payment, one
// customer, sharing the same orders.group_id from the multi-order
// checkout). These mirror the single-order approve/resend-email/cancel
// routes above, but operate on every order in the group at once and send all
// preview-exact reports + one consolidated invoice as one fulfillment,
// split into size-bounded email parts only when needed.
// ===================================================================

// 3e. POST /api/admin/family-orders/:groupId/approve
//     every devotee's report + ONE consolidated family invoice (split into
//     budget-sized emails when the bundle is too large for one message).
if (preg_match('/family-orders\/([^\/]+)\/approve/', $path, $matches) && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'delivery');
    jsonResponse(astroApproveFamilyGroup($pdo, $admin, $matches[1], 'approve', astro_document_json_body('approval')));
}


// 3f. POST /api/admin/family-orders/:groupId/resend-email
//     Re-delivery of the SAME single consolidated message.
if (preg_match('/family-orders\/([^\/]+)\/resend-email/', $path, $matches) && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'delivery');
    jsonResponse(astroApproveFamilyGroup($pdo, $admin, $matches[1], 'resend', astro_document_json_body('resend')));
}


// 3g. POST /api/admin/family-orders/:groupId/cancel
//
// REFUND POLICY GUARD: same rule as the single-order cancel above — a paid
// bundle must be refunded (one click refunds every chart) rather than cancelled
// with the money left behind.
if (preg_match('/family-orders\/([^\/]+)\/cancel/', $path, $matches) && $method === 'POST') {
    require_once __DIR__ . '/../refunds.php';

    $groupId = $matches[1];
    $body = getJsonBody();
    $reason = trim((string)($body['reason'] ?? 'Cancelled by administrator'));
    $reason = function_exists('mb_substr') ? mb_substr($reason, 0, 500, 'UTF-8') : substr($reason, 0, 500);
    if ($reason === '') {
        $reason = 'Cancelled by administrator';
    }

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE group_id = ?");
    $stmt->execute([$groupId]);
    $groupOrders = $stmt->fetchAll();

    if (empty($groupOrders)) {
        jsonResponse(['success' => false, 'message' => 'Family order group not found'], 404);
    }

    // STATUS GUARD: one click must never half-cancel a bundle. If any chart
    // was already delivered, the whole group stays as it is.
    $pendingMembers = 0;
    foreach ($groupOrders as $member) {
        $memberStatus = strtoupper(trim((string)($member['status'] ?? '')));
        if ($memberStatus === 'CANCELLED') {
            continue;
        }
        if (astro_refund_status_is_delivered($memberStatus)) {
            jsonResponse([
                'success' => false,
                'code' => 'ORDER_ALREADY_DELIVERED',
                'message' => "Chart #{$member['order_number']} in this bundle was already approved and delivered, so the family package cannot be cancelled."
            ], 409);
        }
        if (in_array($memberStatus, ['PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION'], true)) {
            $pendingMembers++;
        }
    }
    if ($pendingMembers === 0) {
        jsonResponse(['success' => true, 'message' => "Family package {$groupId} has no cancellable charts left; nothing was changed."]);
    }

    $paidGroupTotal = 0.0;
    foreach ($groupOrders as $member) {
        if ((float) ($member['amount'] ?? 0) > 0 && (int) ($member['payment_confirmed'] ?? 0) === 1 && !astro_refund_is_already_refunded($member)) {
            $paidGroupTotal += (float) $member['amount'];
        }
    }
    if ($paidGroupTotal > 0) {
        jsonResponse([
            'success' => false,
            'code' => 'PAID_ORDER_REQUIRES_REFUND',
            'message' => 'This family bundle was paid, so cancelling it would keep the customer\'s money without a refund. Use the one-click Refund 90% button instead: it refunds every chart in the bundle at once and records the 3-working-day settlement date.'
        ], 409);
    }

    // Atomic: only still-queued members flip, so a concurrent approval of one
    // chart cannot be overwritten back to CANCELLED by this bundle update.
    $upd = $pdo->prepare("UPDATE orders SET status = 'CANCELLED', admin_notes = ?, refund_reason = ?, updated_at = NOW() WHERE group_id = ? AND status IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION')");
    $upd->execute([$reason, $reason, $groupId]);
    $cancelledMembers = $upd->rowCount();

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'FAMILY_ORDER_CANCELLED', "Cancelled family order group {$groupId} ({$cancelledMembers} of " . count($groupOrders) . " charts): {$reason}");

    jsonResponse(['success' => true, 'message' => "Entire family package ({$cancelledMembers} of " . count($groupOrders) . " charts) has been cancelled successfully."]);
}

// 3h. (Removed) GET /api/admin/family-orders/:groupId/invoice-pdf
//
//     The consolidated family invoice is rendered in the browser and staged
//     with the rest of the bundle (1e); there is no server-side invoice
//     renderer any more.

// 4. GET & PUT /api/admin/settings
if (strpos($path, 'admin/settings') !== false && !strpos($path, 'test-email')) {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
        $row = $stmt->fetch();
        if ($row) {
            $general = json_decode($row['general_settings'] ?? '{}', true) ?: [];
            $email = json_decode($row['email_settings'] ?? '{}', true) ?: [];
            // The admin's USD -> INR rate drives every India price below.
            $inrRate = astro_usd_inr_rate($general);
            $pricing = astro_normalize_service_pricing(json_decode($row['pricing'] ?? '{}', true) ?: [], $inrRate);
            $paymentMethods = json_decode($row['payment_methods'] ?? '{}', true) ?: [];

            // Merge all general settings into a unified full settings object
            $settings = array_merge($general, [
                'serviceMode' => $row['service_mode'] ?? $general['serviceMode'] ?? 'PAID',
                'freeBetaActive' => isset($row['free_beta_active']) ? (bool)$row['free_beta_active'] : ($general['freeBetaActive'] ?? false),
                'currency' => $row['currency'] ?? $general['currency'] ?? DEFAULT_CURRENCY,
                'pricing' => $pricing,
                'paymentMethods' => $paymentMethods,
                'emailSettings' => !empty($email) ? $email : ($general['emailSettings'] ?? [])
            ]);

            // Ensure specific keys exist with sensible defaults if not set
            if (!isset($settings['intlPriceUSD'])) $settings['intlPriceUSD'] = $general['intlPriceUSD'] ?? 5;
            // USD is the base price; India (INR) is always auto-calculated from it
            // at the admin's current rate (never a stored INR value).
            $settings['usdToInrRate'] = $inrRate;
            $settings['servicePricing'] = astro_normalize_service_pricing($general['servicePricing'] ?? $pricing, $inrRate);
            $settings['indiaPriceINR'] = astro_usd_to_inr($settings['intlPriceUSD'], $inrRate);
            if (!isset($settings['googleLoginEnabled'])) $settings['googleLoginEnabled'] = $general['googleLoginEnabled'] ?? true;
            if (!isset($settings['googleClientId'])) $settings['googleClientId'] = $general['googleClientId'] ?? '';
            if (!isset($settings['facebookLoginEnabled'])) $settings['facebookLoginEnabled'] = $general['facebookLoginEnabled'] ?? true;
            if (!isset($settings['facebookAppId'])) $settings['facebookAppId'] = $general['facebookAppId'] ?? '';
            if (!isset($settings['facebookAppSecret'])) $settings['facebookAppSecret'] = $general['facebookAppSecret'] ?? '';
            if (!isset($settings['activeThemeTemplate'])) $settings['activeThemeTemplate'] = $general['activeThemeTemplate'] ?? 'classic-primary';
            if (!isset($settings['userDesign'])) $settings['userDesign'] = $general['userDesign'] ?? 'ivory';
            if (!isset($settings['vodafoneMPaisaNumber'])) $settings['vodafoneMPaisaNumber'] = $general['vodafoneMPaisaNumber'] ?? '+679 999 1234';
            if (!isset($settings['vodafoneMPaisaPaymentMode'])) $settings['vodafoneMPaisaPaymentMode'] = $general['vodafoneMPaisaPaymentMode'] ?? 'offline';
            if (!isset($settings['indiaGpayPaymentMode'])) $settings['indiaGpayPaymentMode'] = $general['indiaGpayPaymentMode'] ?? 'online';
            if (!isset($settings['paypalPaymentMode'])) $settings['paypalPaymentMode'] = $general['paypalPaymentMode'] ?? 'online';
            if (!isset($settings['digicelMyCashNumber'])) $settings['digicelMyCashNumber'] = $general['digicelMyCashNumber'] ?? '+679 777 5678';
            if (!isset($settings['paypalEmail'])) $settings['paypalEmail'] = $general['paypalEmail'] ?? 'payments@astrosivam.com';
            if (!isset($settings['paypalClientId'])) $settings['paypalClientId'] = $general['paypalClientId'] ?? '';
            if (!isset($settings['paypalSecret'])) $settings['paypalSecret'] = $general['paypalSecret'] ?? $general['paypalClientSecret'] ?? '';
            if (!isset($settings['paypalMode'])) $settings['paypalMode'] = $general['paypalMode'] ?? 'sandbox';
            // WhatsApp/Viber order alert configuration (tokens included - admin only).
            if (!isset($settings['chatAlertSettings'])) $settings['chatAlertSettings'] = $general['chatAlertSettings'] ?? [];
        } else {
            $settings = [
                'serviceMode' => 'PAID',
                'freeBetaActive' => false,
                'intlPriceUSD' => 5,
                'currency' => DEFAULT_CURRENCY,
                'googleLoginEnabled' => true,
                'googleClientId' => '',
                'facebookLoginEnabled' => true,
                'facebookAppId' => '',
                'facebookAppSecret' => '',
                'activeThemeTemplate' => 'classic-primary',
                'userDesign' => 'ivory',
                'vodafoneMPaisaNumber' => '+679 999 1234',
                'vodafoneMPaisaPaymentMode' => 'offline',
                'indiaGpayPaymentMode' => 'online',
                'paypalPaymentMode' => 'online',
                'digicelMyCashNumber' => '+679 777 5678',
                'paypalEmail' => 'payments@astrosivam.com',
                'paypalClientId' => '',
                'paypalSecret' => '',
                'paypalMode' => 'sandbox',
                'supportEmail' => 'admin@astrosivam.com',
                'supportPhone' => '+679 999 8888',
                'usdToInrRate' => (float)USD_TO_INR_RATE,
                'servicePricing' => astro_default_pricing(),
                'indiaPriceINR' => astro_usd_to_inr(5),
                'emailSettings' => []
            ];
        }

        // Automated M-PAiSA checkout/capture is not implemented in this API.
        $settings['vodafoneMPaisaPaymentMode'] = 'offline';

        // FREE BETA RULE (1 free report per IP): also tell THIS connection
        // (admins can place customer orders too) whether its own free chart
        // is still unused, so the checkout prices chart 1 correctly.
        $betaModeActive = (($settings['serviceMode'] ?? 'PAID') === 'FREE_BETA') || (bool)($settings['freeBetaActive'] ?? false);
        $settings['betaFreeChartAvailable'] = false;
        if ($betaModeActive) {
            try {
                $betaIp = getClientIpAddress();
                $betaStmt = $pdo->prepare("SELECT COUNT(*) FROM beta_ip_orders WHERE ip_address = ?");
                $betaStmt->execute([$betaIp]);
                $settings['betaFreeChartAvailable'] = ((int)($betaStmt->fetchColumn() ?: 0)) < 1;
            } catch (Exception $e) {
                $settings['betaFreeChartAvailable'] = true;
            }
        }

        jsonResponse(['success' => true, 'settings' => astroRedactAdminSettings($settings)]);
    } elseif ($method === 'PUT') {
        $body = astroOmitBlankAdminSecrets(getJsonBody());
        if (isset($body['userDesign']) && !in_array($body['userDesign'], ['original', 'ivory'], true)) {
            jsonResponse(['success' => false, 'message' => 'Invalid user website design.'], 400);
        }
        // Automated M-PAiSA checkout/capture is not implemented in this API.
        if (($body['vodafoneMPaisaPaymentMode'] ?? null) === 'online') $body['vodafoneMPaisaPaymentMode'] = 'offline';

        // Fail fast on SSRF-unsafe gateway URLs: a stored http/internal webhook
        // would otherwise fail closed at send time with no hint at save time.
        // Only newly provided values are checked (blanks were stripped above
        // and mean "keep the stored value"), so unrelated saves are unaffected.
        foreach (['whatsapp', 'viber'] as $webhookChannel) {
            $webhookCandidate = $body['chatAlertSettings'][$webhookChannel]['webhookUrl'] ?? null;
            if (is_string($webhookCandidate) && trim($webhookCandidate) !== '' && !AstroChatAlerts::isValidWebhookUrl($webhookCandidate)) {
                jsonResponse(['success' => false, 'message' => 'The ' . $webhookChannel . ' webhook URL must be an https URL with a public host. Nothing was saved.'], 400);
            }
        }

        // Fetch current row to merge changes
        $stmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
        $existingRow = $stmt->fetch();
        $existingGeneral = $existingRow ? (json_decode($existingRow['general_settings'] ?? '{}', true) ?: []) : [];
        $existingEmail = $existingRow ? (json_decode($existingRow['email_settings'] ?? '{}', true) ?: []) : [];
        $existingPricing = $existingRow ? (json_decode($existingRow['pricing'] ?? '{}', true) ?: []) : [];
        $existingPayment = $existingRow ? (json_decode($existingRow['payment_methods'] ?? '{}', true) ?: []) : [];

        // USD -> INR rate: the admin may change it. A non-numeric or
        // out-of-band value is rejected rather than silently replaced, so a
        // typo can never be saved as the price everyone is charged.
        $savedInrRate = astro_usd_inr_rate($existingGeneral);
        if (array_key_exists('usdToInrRate', $body)) {
            $rawRate = $body['usdToInrRate'];
            $numericRate = is_numeric($rawRate) ? (float)$rawRate : null;
            if ($numericRate === null || !is_finite($numericRate) || $numericRate < MIN_USD_TO_INR_RATE || $numericRate > MAX_USD_TO_INR_RATE) {
                jsonResponse([
                    'success' => false,
                    'message' => 'The exchange rate must be a number between ₹' . MIN_USD_TO_INR_RATE . ' and ₹' . MAX_USD_TO_INR_RATE . ' per US$. Nothing was saved.'
                ], 400);
            }
            $savedInrRate = round($numericRate, 2);
            $body['usdToInrRate'] = $savedInrRate;
        }

        // USD is the only price the admin sets: re-derive every INR value from
        // it at the saved rate so a client can never store an India price that
        // disagrees with the amount the checkout charges.
        foreach (['pricing', 'servicePricing'] as $pricingKey) {
            if (isset($body[$pricingKey])) $body[$pricingKey] = astro_normalize_service_pricing($body[$pricingKey], $savedInrRate);
        }
        $body['indiaPriceINR'] = astro_usd_to_inr($body['intlPriceUSD'] ?? ($existingGeneral['intlPriceUSD'] ?? 0), $savedInrRate);

        // Deep merge body into general settings. The rate is always written in
        // its normalised form, so a legacy/blank stored value can never linger.
        $mergedGeneral = array_merge($existingGeneral, $body);
        $mergedGeneral['usdToInrRate'] = $savedInrRate;
        // Remove any legacy model credentials the local-only chat no longer uses.
        unset($mergedGeneral['aiAstrologerSettings']);

        $serviceMode = $body['serviceMode'] ?? $mergedGeneral['serviceMode'] ?? ($existingRow['service_mode'] ?? 'PAID');
        $freeBetaActive = isset($body['freeBetaActive']) ? (!empty($body['freeBetaActive']) ? 1 : 0) : ($existingRow['free_beta_active'] ?? 0);
        $currency = $body['currency'] ?? $mergedGeneral['currency'] ?? ($existingRow['currency'] ?? DEFAULT_CURRENCY);
        
        $pricing = astro_normalize_service_pricing(
            isset($body['pricing']) ? $body['pricing'] : ($body['servicePricing'] ?? $existingPricing),
            $savedInrRate
        );
        $paymentMethods = isset($body['paymentMethods']) ? $body['paymentMethods'] : $existingPayment;
        $emailSettings = isset($body['emailSettings']) ? array_merge($existingEmail, $body['emailSettings']) : $existingEmail;

        // Chat alert settings: nested-safe merge so a partial update (e.g. only
        // toggling "enabled") never wipes the stored WhatsApp/Viber credentials.
        if (isset($body['chatAlertSettings']) && is_array($body['chatAlertSettings'])) {
            $existingChat = is_array($existingGeneral['chatAlertSettings'] ?? null) ? $existingGeneral['chatAlertSettings'] : [];
            $mergedChat = array_merge($existingChat, $body['chatAlertSettings']);
            foreach (['whatsapp', 'viber', 'birthdayWishes'] as $chatChannelKey) {
                if (isset($body['chatAlertSettings'][$chatChannelKey]) && is_array($body['chatAlertSettings'][$chatChannelKey])) {
                    $mergedChat[$chatChannelKey] = array_merge(
                        is_array($existingChat[$chatChannelKey] ?? null) ? $existingChat[$chatChannelKey] : [],
                        $body['chatAlertSettings'][$chatChannelKey]
                    );
                }
            }
            $mergedGeneral['chatAlertSettings'] = $mergedChat;
        }


        $pricingJson = json_encode($pricing, JSON_UNESCAPED_UNICODE);
        $paymentJson = json_encode($paymentMethods, JSON_UNESCAPED_UNICODE);
        $emailJson = json_encode($emailSettings, JSON_UNESCAPED_UNICODE);
        $generalJson = json_encode($mergedGeneral, JSON_UNESCAPED_UNICODE);

        if ($existingRow) {
            $pdo->prepare("UPDATE system_settings SET service_mode = ?, free_beta_active = ?, currency = ?, pricing = ?, payment_methods = ?, email_settings = ?, general_settings = ?, updated_at = NOW() WHERE id = ?")->execute([
                $serviceMode, $freeBetaActive, $currency, $pricingJson, $paymentJson, $emailJson, $generalJson, $existingRow['id']
            ]);
        } else {
            $pdo->prepare("INSERT INTO system_settings (service_mode, free_beta_active, currency, pricing, payment_methods, email_settings, general_settings, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())")->execute([
                $serviceMode, $freeBetaActive, $currency, $pricingJson, $paymentJson, $emailJson, $generalJson
            ]);
        }

        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'SETTINGS_UPDATED', 'Updated system settings & integrations');

        // Return updated settings
        $finalSettings = array_merge($mergedGeneral, [
            'serviceMode' => $serviceMode,
            'freeBetaActive' => (bool)$freeBetaActive,
            'currency' => $currency,
            'usdToInrRate' => $savedInrRate,
            'indiaPriceINR' => astro_usd_to_inr($mergedGeneral['intlPriceUSD'] ?? 0, $savedInrRate),
            'servicePricing' => astro_normalize_service_pricing($mergedGeneral['servicePricing'] ?? $pricing, $savedInrRate),
            'pricing' => $pricing,
            'paymentMethods' => $paymentMethods,
            'emailSettings' => $emailSettings
        ]);

        jsonResponse(['success' => true, 'message' => 'Settings saved successfully', 'settings' => astroRedactAdminSettings($finalSettings)]);
    }
}

// 5. POST /api/admin/settings/test-email (also accepts /api/admin/testing/email)
if (($strpos_test_email = (strpos($path, 'admin/settings/test-email') !== false || strpos($path, 'admin/testing/email') !== false)) && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'test-mail');
    $body = getJsonBody();
    $targetEmail = trim((string)($body['email'] ?? $body['testRecipient'] ?? $admin['email']));
    $settingsStmt = $pdo->query("SELECT email_settings, general_settings FROM system_settings ORDER BY id ASC LIMIT 1");
    $settingsRow = $settingsStmt->fetch();
    $storedEmailConfig = $settingsRow ? (json_decode($settingsRow['email_settings'] ?? '{}', true) ?: []) : [];
    if (!$storedEmailConfig && $settingsRow) {
        $storedGeneral = json_decode($settingsRow['general_settings'] ?? '{}', true) ?: [];
        $storedEmailConfig = is_array($storedGeneral['emailSettings'] ?? null) ? $storedGeneral['emailSettings'] : [];
    }
    $providedEmailConfig = is_array($body['emailSettings'] ?? null) ? $body['emailSettings'] : [];
    $emailConfig = array_merge($storedEmailConfig, $providedEmailConfig);
    $smtpUser = $emailConfig['smtpUsername'] ?? $emailConfig['smtpUser'] ?? '';
    $smtpPassword = trim((string)($emailConfig['smtpPassword'] ?? '')) !== ''
        ? $emailConfig['smtpPassword']
        : ($emailConfig['smtpPass'] ?? '');
    if (trim((string)($emailConfig['smtpHost'] ?? '')) === '' || trim((string)$smtpUser) === '' || !astroAdminSecretConfigured($smtpPassword)) {
        jsonResponse(['success' => false, 'message' => 'SMTP is not configured with a host, username and saved app password. No email was sent.'], 400);
    }

    $safeHostDisplay = htmlspecialchars((string)($emailConfig['smtpHost'] ?? ''), ENT_QUOTES, 'UTF-8');
    $safePortDisplay = (int)($emailConfig['smtpPort'] ?? 587);
    $html = astro_wrap_branded_email_html(
        'SMTP Delivery Diagnostic Verification',
        "<p style='margin:0 0 12px;font-size:15px;color:#1e1508;'><strong>SMTP Diagnostic Succeeded</strong></p>"
        . "<p style='margin:0 0 14px;'>This automated test message confirms that your PHP SMTP transport on <strong>{$safeHostDisplay}:{$safePortDisplay}</strong> authenticated cleanly and delivered both plain-text and branded HTML parts with inline emblem embedding.</p>"
        . "<div style='background:#fffbeb;padding:12px 14px;border-left:4px solid #c9962c;border-radius:6px;color:#92400e;font-size:12.5px;margin-bottom:14px;'>"
        . "<strong>Inbox Placement Check:</strong> If this email arrived in Primary Inbox, your SPF, DKIM, and DMARC records are properly aligned. If it landed in Spam, inspect cPanel &rarr; Email Deliverability."
        . "</div>"
        . "<p style='margin:0;color:#6b5c3e;font-size:12px;'>Dispatched at: " . date('Y-m-d H:i:s T') . "</p>",
        'ASTRO SIVAM System Administration Diagnostic'
    );

    $res = AstroMailer::sendEmailWithAttachments(
        $targetEmail,
        $admin['name'],
        "ASTRO SIVAM: PHP SMTP Diagnostic Test Email",
        $html,
        [],
        $emailConfig,
        astro_inline_logo_attachment()
    );

    jsonResponse([
        'success' => $res['success'],
        'message' => $res['success'] ? "Test email accepted by the configured mail transport for {$targetEmail}" : "Email dispatch failed: {$res['message']}"
    ], $res['success'] ? 200 : 502);
}

// 5b. POST /api/admin/settings/test-alert (also accepts /api/admin/testing/chat-alert)
//     Dispatches a diagnostic WhatsApp/Viber message to a mobile number so the
//     operator can verify chat gateway credentials before enabling alerts.
if ((strpos($path, 'admin/settings/test-alert') !== false || strpos($path, 'admin/testing/chat-alert') !== false) && $method === 'POST') {
    $body = getJsonBody();
    $targetPhone = trim($body['phone'] ?? $body['testPhone'] ?? ($admin['mobile'] ?? ''));

    if ($targetPhone === '') {
        jsonResponse(['success' => false, 'message' => 'A destination mobile number is required for the test alert.'], 400);
    }

    // Allow testing with unsaved edits by accepting a settings snapshot.
    $baseSettings = AstroChatAlerts::getAlertSettings($pdo);
    if (isset($body['chatAlertSettings']) && is_array($body['chatAlertSettings'])) {
        $override = $body['chatAlertSettings'];
        foreach (['whatsapp', 'viber'] as $chatChannelKey) {
            if (isset($override[$chatChannelKey]) && is_array($override[$chatChannelKey])) {
                $override[$chatChannelKey] = array_merge(
                    is_array($baseSettings[$chatChannelKey] ?? null) ? $baseSettings[$chatChannelKey] : [],
                    $override[$chatChannelKey]
                );
            }
        }
        $baseSettings = array_merge($baseSettings, $override);
    }

    $channelList = ['whatsapp', 'viber'];
    if (!empty($body['channels']) && is_array($body['channels'])) {
        $filtered = array_values(array_intersect($body['channels'], ['whatsapp', 'viber']));
        if (!empty($filtered)) {
            $channelList = $filtered;
        }
    }

    $results = AstroChatAlerts::sendTestAlert($baseSettings, $targetPhone, $channelList);
    $success = false;
    $parts = [];
    foreach ($results as $r) {
        if ($r['success']) {
            $success = true;
        }
        $parts[] = strtoupper($r['channel']) . ': ' . ($r['success'] ? 'delivered' : 'failed - ' . $r['message']);
    }

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'CHAT_ALERT_TEST', 'Chat alert diagnostic sent to ' . $targetPhone . ': ' . implode(' | ', $parts));

    jsonResponse([
        'success' => $success,
        'message' => implode(' • ', $parts),
        'results' => $results
    ]);
}

// 5b2. Birthday wishes (migration 020). The daily cron
//      (api/cron/birthday_wishes.php) is the normal sender; these two routes let
//      the operator see exactly who would be wished and run the SAME dispatcher
//      on demand. Both are deduped by birthday_wishes_log, so pressing "Send
//      now" after the cron ran cannot message anybody twice in a year.
//   GET  /api/admin/birthday-wishes/preview?date=YYYY-MM-DD  -> decides, sends nothing
//   POST /api/admin/birthday-wishes/run     {date?, limit?}  -> sends today's (or one date's) wishes
// admin/index.php has no $action of its own (services/index.php does), so the
// query-string fallback is read here. Undefined-variable warnings in this file
// are a test failure: tests/customer-reviews.test.ts asserts the error log stays
// empty across a whole admin session.
$birthdayAction = (string)($_GET['action'] ?? $_POST['action'] ?? '');
if (preg_match('#/admin/birthday-wishes/(preview|run)/?$#', $path, $birthdayMatch)
    || in_array($birthdayAction, ['birthday-wishes-preview', 'birthday-wishes-run'], true)) {
    $wantsRun = ($birthdayMatch[1] ?? '') === 'run' || $birthdayAction === 'birthday-wishes-run';
    if ($wantsRun && $method !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    if (!$wantsRun && $method !== 'GET' && $method !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }

    $wishSettings = AstroBirthdayWishes::getWishSettings($pdo);
    if (!AstroBirthdayWishes::tablesReady($pdo)) {
        jsonResponse([
            'success' => false,
            'message' => 'Birthday wish tables are missing. Apply api/migrations/020_birthday_wishes.sql, then reload this panel.',
            'settings' => $wishSettings
        ], 503);
    }

    $body = ($method === 'POST') ? getJsonBody() : [];
    $date = trim((string)($body['date'] ?? ($_GET['date'] ?? '')));
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        jsonResponse(['success' => false, 'message' => 'The date must be in YYYY-MM-DD form.'], 400);
    }

    $options = ['date' => $date !== '' ? $date : AstroBirthdayWishes::todayString($wishSettings)];
    if (!$wantsRun) {
        // Preview == the real decision path with the transport switched off, so
        // what the operator reads is what the cron would send.
        $options['dryRun'] = true;
    } elseif (isset($body['limit'])) {
        $options['limit'] = (int)$body['limit'];
    }

    $summary = AstroBirthdayWishes::sendDueWishes($pdo, $options);

    if ($wantsRun && ($summary['sent'] > 0 || $summary['failed'] > 0)) {
        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'BIRTHDAY_WISH_RUN',
            'Admin ran the birthday wishes for ' . $summary['date'] . ': ' . (string)($summary['message'] ?? ''));
    }

    jsonResponse([
        'success' => (bool)($summary['success'] ?? false),
        'message' => (string)($summary['message'] ?? ''),
        'summary' => $summary,
        'settings' => $wishSettings
    ], empty($summary['success']) ? 500 : 200);
}

// 5c. POST /api/admin/testing/payment
// This checks saved configuration only; it never claims a provider transaction occurred.
if ((strpos($path, 'admin/testing/payment') !== false || strpos($path, 'admin/settings/test-payment') !== false) && $method === 'POST') {
    $body = getJsonBody();
    $pm = strtoupper(trim((string)($body['method'] ?? '')));

    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $general = $sRow ? (json_decode($sRow['general_settings'] ?? '{}', true) ?: []) : [];
    if (!empty($body['settings']) && is_array($body['settings'])) {
        $general = array_merge($general, astroOmitBlankAdminSecrets($body['settings']));
    }

    $success = true;
    $message = '';
    if ($pm === 'GPAY') {
        $mode = strtolower((string)($general['indiaGpayPaymentMode'] ?? 'online'));
        $upiId = trim((string)($general['indiaGpayUpiId'] ?? ''));
        $gpayNum = trim((string)($general['indiaGpayNumber'] ?? ''));
        $provider = strtolower((string)($general['indiaGpayOnlineProvider'] ?? 'razorpay'));
        $keyId = trim((string)($general['indiaGpayKeyId'] ?? ''));
        $hasRazorpaySecret = astroAdminSecretConfigured($general['indiaGpayKeySecret'] ?? null);
        $env = strtoupper((string)($general['indiaGpayEnvironment'] ?? 'sandbox'));
        if ($mode === 'online') {
            if ($provider !== 'razorpay') {
                $success = false;
                $message = "Online {$provider} checkout is not implemented. Only Razorpay has a server-side capture flow.";
            } elseif (strpos($keyId, 'rzp_') !== 0 || !$hasRazorpaySecret) {
                $success = false;
                $message = 'Razorpay online mode needs an rzp_ Key ID and a saved API secret. No checkout is available until both are configured.';
            } else {
                $message = "Razorpay {$env} credentials are present. Configuration check only—no provider request or payment was made. Complete a sandbox checkout before enabling live payments.";
            }
        } elseif ($upiId === '' && !preg_match('/^\+?[0-9 ()-]{7,20}$/', $gpayNum)) {
            $success = false;
            $message = 'Manual Google Pay / UPI mode needs a valid UPI ID or mobile number.';
        } else {
            $message = 'Manual Google Pay / UPI recipient details are configured. UTR references require administrator verification; no payment was tested.';
        }
    } elseif ($pm === 'MPAISA') {
        $mode = strtolower((string)($general['vodafoneMPaisaPaymentMode'] ?? 'offline'));
        $mpNum = trim((string)($general['vodafoneMPaisaNumber'] ?? ''));
        if ($mode === 'online') {
            $success = false;
            $message = 'Automated M-PAiSA checkout/capture is not implemented. Keep this gateway in manual mode and verify receipts with the provider.';
        } elseif (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $mpNum)) {
            $success = false;
            $message = 'Manual M-PAiSA mode needs a valid recipient mobile number.';
        } else {
            $message = 'Manual M-PAiSA recipient details are configured. Receipts require administrator verification; no payment was tested.';
        }
    } elseif ($pm === 'PAYPAL') {
        $mode = strtolower((string)($general['paypalPaymentMode'] ?? 'online'));
        $email = trim((string)($general['paypalEmail'] ?? ''));
        $clientId = trim((string)($general['paypalClientId'] ?? ''));
        $paypalSecret = $general['paypalClientSecret'] ?? $general['paypalSecret'] ?? null;
        $clientIdConfigured = strlen($clientId) >= 8 && !preg_match('/^(?:live_client_id|your[-_ ]|replace[-_ ]|placeholder)/i', $clientId);
        $env = strtoupper((string)($general['paypalMode'] ?? 'sandbox'));
        if ($mode === 'online') {
            if (!$clientIdConfigured || !astroAdminSecretConfigured($paypalSecret)) {
                $success = false;
                $message = 'PayPal online mode needs a real REST Client ID and saved Client Secret. No checkout is available until both are configured.';
            } else {
                $message = "PayPal {$env} credentials are present. Configuration check only—no provider request or payment was made. Complete a sandbox checkout before enabling live payments.";
            }
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $success = false;
            $message = 'Manual PayPal mode needs a valid receiver email address.';
        } else {
            $message = 'Manual PayPal recipient details are configured. Payment receipts require administrator verification; no payment was tested.';
        }
    } else {
        $success = false;
        $message = 'Unknown payment method. Select a specific gateway to check its saved configuration.';
    }

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'PAYMENT_TEST_RUN', "Configuration check for {$pm}: {$message}");
    jsonResponse(['success' => $success, 'message' => $message, 'testedAt' => date('c')]);
}

// 6. GET /api/admin/audit-logs
if (strpos($path, 'admin/audit-logs') !== false && $method === 'GET') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 100)));
    $offset = ($page - 1) * $limit;

    $countStmt = $pdo->query("SELECT COUNT(*) FROM audit_logs");
    $totalCount = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?");
    $stmt->execute([$limit, $offset]);
    $rows = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'logs' => $rows,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $totalCount,
            'totalPages' => max(1, (int)ceil($totalCount / $limit))
        ]
    ]);
}

// 7. GET /api/admin/contact-messages
if (strpos($path, 'admin/contact-messages') !== false && $method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM contact_messages ORDER BY created_at DESC");
    $rows = $stmt->fetchAll();
    jsonResponse(['success' => true, 'messages' => $rows]);
}

// 7b. GET /api/admin/reports/financial
if (strpos($path, 'admin/reports/financial') !== false && $method === 'GET') {
    $startDate = $_GET['startDate'] ?? null;
    $endDate = $_GET['endDate'] ?? null;
    
    $where = [];
    $params = [];
    if ($startDate) {
        $where[] = "created_at >= ?";
        $params[] = $startDate . " 00:00:00";
    }
    if ($endDate) {
        $where[] = "created_at <= ?";
        $params[] = $endDate . " 23:59:59";
    }
    
    $sql = "SELECT * FROM orders
        WHERE status NOT IN ('REJECTED','CANCELLED')
          AND (payment_confirmed = 1
               OR UPPER(COALESCE(NULLIF(payment_status, ''), 'PENDING_ADMIN')) = 'NOT_REQUIRED')
          AND (payment_status IS NULL OR payment_status IN ('CAPTURED','NOT_REQUIRED','CONSUMED','VERIFIED_MANUAL'))";
    if (!empty($where)) {
        $sql .= " AND " . implode(" AND ", $where);
    }
    $sql .= " ORDER BY created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    
    $totalPaymentsCount = 0;
    $totalPaymentsAmountUSD = 0.0;
    $totalPaymentsAmountINR = 0.0;
    $pendingPaymentsCount = 0;
    $approvedPaymentsCount = 0;
    $rejectedPaymentsCount = 0;
    $totalRefundsCount = 0;
    $totalRefundsAmountUSD = 0.0;
    $totalRefundsAmountINR = 0.0;
    $pendingRefundsCount = 0;
    $betaUsageCount = 0;

    // Two supported currencies only: USD (international) and INR (India).
    $revenueByService = [
        'BIRTH_JATHAGAM' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'MARRIAGE_COMPATIBILITY' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'BABY_NAMING' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'MUHURTHAM' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0]
    ];

    $revenueByPaymentMethod = [
        'GPAY' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'UPI' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'PAYPAL' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0],
        'NONE' => ['usd' => 0.0, 'inr' => 0.0, 'count' => 0]
    ];

    foreach ($rows as $r) {
        $mode = $r['service_mode'] ?? 'PAID';
        $status = $r['status'] ?? 'PENDING';
        $curr = strtoupper((string)($r['currency'] ?? DEFAULT_CURRENCY));
        // A historical row stored in a currency this version no longer offers is
        // counted in the USD bucket so old revenue stays visible instead of
        // silently disappearing from the report.
        $bucket = ($curr === 'INR') ? 'inr' : 'usd';
        $amt = floatval($r['amount'] ?? 0);
        $st = $r['service_type'] ?? 'BIRTH_JATHAGAM';
        $pm = strtoupper($r['payment_method'] ?? 'NONE');

        if ($mode === 'FREE_BETA') {
            $betaUsageCount++;
        }

        if ($status === 'PENDING_APPROVAL' || $status === 'PENDING_PAYMENT_VERIFICATION') {
            $pendingPaymentsCount++;
        } elseif ($status === 'APPROVED' || $status === 'COMPLETED' || $status === 'PROCESSING') {
            $approvedPaymentsCount++;
            $totalPaymentsCount++;
            if ($bucket === 'inr') $totalPaymentsAmountINR += $amt; else $totalPaymentsAmountUSD += $amt;

            if (isset($revenueByService[$st])) {
                $revenueByService[$st]['count']++;
                $revenueByService[$st][$bucket] += $amt;
            }

            if (!isset($revenueByPaymentMethod[$pm])) {
                $revenueByPaymentMethod[$pm] = ['usd' => 0.0, 'inr' => 0.0, 'count' => 0];
            }
            $revenueByPaymentMethod[$pm]['count']++;
            $revenueByPaymentMethod[$pm][$bucket] += $amt;
        } elseif ($status === 'REJECTED') {
            $rejectedPaymentsCount++;
        } elseif ($status === 'REFUNDED') {
            $totalRefundsCount++;
            if ($bucket === 'inr') $totalRefundsAmountINR += $amt; else $totalRefundsAmountUSD += $amt;
        } elseif ($status === 'CANCELLED' || $status === 'REFUND_REQUESTED') {
            $pendingRefundsCount++;
        }
    }

    $netRevenueUSD = $totalPaymentsAmountUSD - $totalRefundsAmountUSD;
    $netRevenueINR = $totalPaymentsAmountINR - $totalRefundsAmountINR;

    $gpayCount = ($revenueByPaymentMethod['GPAY']['count'] ?? 0) + ($revenueByPaymentMethod['UPI']['count'] ?? 0);
    $gpayAmountINR = ($revenueByPaymentMethod['GPAY']['inr'] ?? 0.0) + ($revenueByPaymentMethod['UPI']['inr'] ?? 0.0);

    $serviceTypeReport = static function ($revenueByService, $code) {
        $row = $revenueByService[$code] ?? ['usd' => 0.0, 'inr' => 0.0, 'count' => 0];
        return [
            // USD is the primary figure shown to the admin; `inr` carries the
            // India settlement alongside it.
            'amount' => $row['usd'] ?? 0.0,
            'usd' => $row['usd'] ?? 0.0,
            'inr' => $row['inr'] ?? 0.0,
            'count' => $row['count'] ?? 0
        ];
    };

    $report = [
        'generatedAt' => date('c'),
        'dateRange' => ['startDate' => $startDate, 'endDate' => $endDate],
        'totalPaymentsCount' => $totalPaymentsCount,
        'totalPaymentsAmountUSD' => $totalPaymentsAmountUSD,
        'totalPaymentsAmountINR' => $totalPaymentsAmountINR,
        'grossRevenueUSD' => $totalPaymentsAmountUSD,
        'grossRevenueINR' => $totalPaymentsAmountINR,
        'pendingPaymentsCount' => $pendingPaymentsCount,
        'approvedPaymentsCount' => $approvedPaymentsCount,
        'rejectedPaymentsCount' => $rejectedPaymentsCount,
        'totalRefundsCount' => $totalRefundsCount,
        'totalRefundsAmountUSD' => $totalRefundsAmountUSD,
        'totalRefundsAmountINR' => $totalRefundsAmountINR,
        'totalRefundsUSD' => $totalRefundsAmountUSD,
        'totalRefundsINR' => $totalRefundsAmountINR,
        'refundsCount' => $totalRefundsCount,
        'totalOrdersCount' => count($rows),
        'paidOrdersCount' => $totalPaymentsCount,
        'betaOrdersCount' => $betaUsageCount,
        'pendingRefundsCount' => $pendingRefundsCount,
        'netRevenueUSD' => $netRevenueUSD,
        'netRevenueINR' => $netRevenueINR,
        'revenueByService' => $revenueByService,
        'revenueByPaymentMethod' => $revenueByPaymentMethod,
        'byPaymentMethod' => [
            'GPAY' => ['amount' => $gpayAmountINR, 'inrAmount' => $gpayAmountINR, 'count' => $gpayCount],
            'UPI' => ['amount' => $revenueByPaymentMethod['UPI']['inr'] ?? 0.0, 'count' => $revenueByPaymentMethod['UPI']['count'] ?? 0],
            'PAYPAL' => ['amount' => $revenueByPaymentMethod['PAYPAL']['usd'] ?? 0.0, 'count' => $revenueByPaymentMethod['PAYPAL']['count'] ?? 0]
        ],
        'byServiceType' => [
            'BIRTH_JATHAGAM' => $serviceTypeReport($revenueByService, 'BIRTH_JATHAGAM'),
            'MARRIAGE_COMPATIBILITY' => $serviceTypeReport($revenueByService, 'MARRIAGE_COMPATIBILITY'),
            'BABY_NAMING' => $serviceTypeReport($revenueByService, 'BABY_NAMING'),
            'MUHURTHAM' => $serviceTypeReport($revenueByService, 'MUHURTHAM')
        ],
        'betaUsageCount' => $betaUsageCount,
        'orders' => array_map(function($r) {
            return [
                'id' => $r['id'],
                'orderNumber' => $r['order_number'],
                'amount' => floatval($r['amount']),
                'currency' => $r['currency'],
                'serviceType' => $r['service_type'],
                'status' => $r['status'],
                'paymentMethod' => $r['payment_method'],
                'createdAt' => $r['created_at']
            ];
        }, $rows)
    ];
    
    jsonResponse(['success' => true, 'report' => $report]);
}

// 7z. POST /api/admin/team/photo — upload one team portrait.
//
// The admin adds a photo from their phone/computer instead of pasting a public
// image URL. The browser already shrinks it to <=250 KB; the server re-checks
// the real type, the byte budget and the dimensions, stores it under
// api/uploads/team/ and returns the site-relative URL to save on the member.
// This MUST stay above the /admin/team block: that router treats any POST under
// admin/team as "create a member".
if ($method === 'POST' && preg_match('#/admin/team/photo/?$#', $path)) {
    astro_admin_action_limit($pdo, $admin, 'team-photo');
    astro_team_photo_prune($pdo);
    $result = astro_team_photo_store(getJsonBody());
    jsonResponse($result, !empty($result['success']) ? 200 : 400);
}

// 8. GET & POST & PUT & DELETE /api/admin/team
if (strpos($path, 'admin/team') !== false) {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM team_members ORDER BY display_order ASC");
        $rows = $stmt->fetchAll();
        $team = array_map(function($r) {
            return [
                'id' => $r['id'],
                'name' => $r['name'],
                'nameEn' => $r['name'],
                'nameTa' => $r['name_ta'] ?? '',
                'fullName' => $r['name'],
                'title' => $r['title'],
                'titleEn' => $r['title'],
                'titleTa' => $r['title_ta'],
                'titleHi' => $r['title_hi'],
                'bio' => $r['bio'],
                'location' => $r['location'],
                'experienceYears' => intval($r['experience_years']),
                'yearsOfExperience' => intval($r['experience_years']),
                'education' => $r['education'] ?? $r['title'] ?? '',
                'educationEn' => $r['education'] ?? $r['title'] ?? '',
                'educationTa' => $r['education_ta'] ?? '',
                'specialization' => $r['specialization'] ?? '',
                'specializations' => json_decode($r['specializations'], true) ?: [],
                'photoUrl' => $r['photo_url'],
                'isActive' => (bool)$r['is_active'],
                'displayOrder' => intval($r['display_order']),
                'contactPhone' => $r['contact_phone'],
                'contactEmail' => $r['contact_email']
            ];
        }, $rows);
        jsonResponse(['success' => true, 'team' => $team]);
    } elseif ($method === 'POST') {
        $body = getJsonBody();
        $id = (string)($body['id'] ?? astro_random_id('tm_', 8));
        $name = trim((string)($body['fullName'] ?? $body['nameEn'] ?? $body['name'] ?? ''));
        if ($name === '') {
            jsonResponse(['success' => false, 'message' => 'Please enter the team member\'s name.'], 400);
        }
        $title = trim((string)($body['titleEn'] ?? $body['title'] ?? ''));
        if ($title === '') {
            $title = 'Vedic Astrologer';
        }
        $education = trim((string)($body['educationEn'] ?? $body['education'] ?? ''));
        $bio = (string)($body['bioEn'] ?? $body['bio'] ?? '');
        $specs = isset($body['specializations']) && is_array($body['specializations'])
            ? json_encode(array_values($body['specializations']))
            : '[]';
        // No pasted stock photo by default: without an upload (or an explicit
        // link) the public card shows the ASTRO SIVAM emblem, never a stranger.
        $photo = is_string($body['photoUrl'] ?? null) ? trim($body['photoUrl']) : '';
        $is_active = isset($body['isActive']) ? ($body['isActive'] ? 1 : 0) : 1;
        // The panel sends `order`; older clients sent `displayOrder`.
        $order = intval($body['order'] ?? $body['displayOrder'] ?? 1);

        // Write ONLY the columns this database really has.
        //
        // This route used to INSERT `name_ta` and `updated_at` unconditionally,
        // but api/schema.sql never declared them, so on a real MySQL database
        // every "Add Member" click died with "Unknown column 'name_ta' in
        // 'field list'" — a 500 with an empty body, which the panel quietly
        // ignored. The columns now exist (api/migrations/019), but a database
        // that has not run that migration must still accept a new member.
        // Web requests never ALTER TABLE: they adapt to what is there.
        $columns = astro_table_columns($pdo, 'team_members');
        $stamp = date('Y-m-d H:i:s');
        $values = [
            'id' => $id,
            'name' => $name,
            'name_ta' => (string)($body['nameTa'] ?? ''),
            'title' => $title,
            'title_ta' => (string)($body['titleTa'] ?? ''),
            'title_hi' => (string)($body['titleHi'] ?? ''),
            'bio' => $bio,
            'bio_ta' => (string)($body['bioTa'] ?? ''),
            'education' => $education,
            'education_ta' => (string)($body['educationTa'] ?? ''),
            'location' => (string)($body['location'] ?? 'Tamil Nadu, India'),
            'experience_years' => intval($body['experienceYears'] ?? $body['yearsOfExperience'] ?? 10),
            'specializations' => $specs,
            'photo_url' => $photo,
            'is_active' => $is_active,
            'display_order' => $order,
            'created_at' => $stamp,
            'updated_at' => $stamp,
        ];
        if (!empty($columns)) {
            $values = array_intersect_key($values, array_flip(array_map('strval', $columns)));
        }
        $names = array_keys($values);
        $upsert = 'name = VALUES(name), title = VALUES(title)';
        if (in_array('updated_at', $names, true)) {
            $upsert .= ', updated_at = VALUES(updated_at)';
        }
        $sql = 'INSERT INTO team_members (' . implode(', ', $names) . ') VALUES ('
            . implode(', ', array_fill(0, count($names), '?')) . ') ON DUPLICATE KEY UPDATE ' . $upsert;
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($values));
        } catch (Throwable $e) {
            error_log('ASTRO SIVAM: saving team member failed: ' . $e->getMessage());
            jsonResponse([
                'success' => false,
                'message' => 'The team member could not be saved on the server. Please try again — if it keeps happening, the database is missing a column (api/migrations/019).',
            ], 500);
        }
        jsonResponse(['success' => true, 'message' => 'Team member saved successfully', 'member' => array_merge($body, ['id' => $id])]);
    } elseif ($method === 'PUT') {
        $body = getJsonBody();
        $parts = explode('/', trim($path, '/'));
        $id = end($parts);
        if ($id === 'team' || empty($id)) {
            $id = $body['id'] ?? ($_GET['id'] ?? '');
        }
        if ($id) {
            // Same rule as POST: write only the columns this database has, so a
            // database without migration 019 still updates instead of throwing
            // "Unknown column 'updated_at'".
            $existing = array_map('strval', astro_table_columns($pdo, 'team_members'));
            $wants = [];
            if (isset($body['isActive'])) {
                $wants['is_active'] = $body['isActive'] ? 1 : 0;
            }
            if (isset($body['fullName']) || isset($body['nameEn']) || isset($body['name'])) {
                $wants['name'] = $body['fullName'] ?? $body['nameEn'] ?? $body['name'];
            }
            if (isset($body['nameTa'])) {
                $wants['name_ta'] = (string)$body['nameTa'];
            }
            if (isset($body['titleEn']) || isset($body['title'])) {
                $wants['title'] = $body['titleEn'] ?? $body['title'];
            }
            if (isset($body['titleTa'])) {
                $wants['title_ta'] = (string)$body['titleTa'];
            }
            if (isset($body['titleHi'])) {
                $wants['title_hi'] = (string)$body['titleHi'];
            }
            if (isset($body['bioEn']) || isset($body['bio'])) {
                $wants['bio'] = (string)($body['bioEn'] ?? $body['bio']);
            }
            if (isset($body['bioTa'])) {
                $wants['bio_ta'] = (string)$body['bioTa'];
            }
            if (isset($body['educationEn']) || isset($body['education'])) {
                $wants['education'] = (string)($body['educationEn'] ?? $body['education']);
            }
            if (isset($body['educationTa'])) {
                $wants['education_ta'] = (string)$body['educationTa'];
            }
            if (isset($body['location'])) {
                $wants['location'] = (string)$body['location'];
            }
            if (isset($body['experienceYears']) || isset($body['yearsOfExperience'])) {
                $wants['experience_years'] = intval($body['experienceYears'] ?? $body['yearsOfExperience']);
            }
            if (isset($body['specializations']) && is_array($body['specializations'])) {
                $wants['specializations'] = json_encode(array_values($body['specializations']));
            }
            if (isset($body['photoUrl'])) {
                $wants['photo_url'] = trim((string)$body['photoUrl']);
            }
            // The panel sends `order`; older clients sent `displayOrder`.
            if (isset($body['order']) || isset($body['displayOrder'])) {
                $wants['display_order'] = intval($body['order'] ?? $body['displayOrder']);
            }
            $wants['updated_at'] = date('Y-m-d H:i:s');
            if (!empty($existing)) {
                $wants = array_intersect_key($wants, array_flip($existing));
            }

            $previousPhoto = '';
            if (array_key_exists('photo_url', $wants)) {
                // Read the old value first: a replaced upload is deleted from
                // disk once the row points at the new one, so the folder never
                // accumulates orphaned portraits.
                try {
                    $prevStmt = $pdo->prepare("SELECT photo_url FROM team_members WHERE id = ?");
                    $prevStmt->execute([$id]);
                    $previousPhoto = (string)($prevStmt->fetchColumn() ?: '');
                } catch (Throwable $e) {
                    $previousPhoto = '';
                }
            }

            if (!empty($wants)) {
                $sets = [];
                $params = [];
                foreach ($wants as $column => $value) {
                    $sets[] = $column . ' = ?';
                    $params[] = $value;
                }
                $params[] = $id;
                try {
                    $stmt = $pdo->prepare("UPDATE team_members SET " . implode(', ', $sets) . " WHERE id = ?");
                    $stmt->execute($params);
                } catch (Throwable $e) {
                    error_log('ASTRO SIVAM: updating team member failed: ' . $e->getMessage());
                    jsonResponse([
                        'success' => false,
                        'message' => 'The team member could not be updated on the server. Please try again — if it keeps happening, the database is missing a column (api/migrations/019).',
                    ], 500);
                }
                if ($previousPhoto !== '' && $previousPhoto !== trim((string)($body['photoUrl'] ?? ''))) {
                    astro_team_photo_delete($previousPhoto);
                }
            }
            jsonResponse(['success' => true, 'message' => 'Team member updated']);
        }
        jsonResponse(['success' => false, 'message' => 'ID missing for update'], 400);
    } elseif ($method === 'DELETE') {
        $parts = explode('/', trim($path, '/'));
        $id = end($parts);
        if ($id === 'team' || empty($id)) {
            $id = $_GET['id'] ?? '';
        }
        if ($id) {
            $photoToRemove = '';
            try {
                $photoStmt = $pdo->prepare("SELECT photo_url FROM team_members WHERE id = ?");
                $photoStmt->execute([$id]);
                $photoToRemove = (string)($photoStmt->fetchColumn() ?: '');
            } catch (Throwable $e) {
                $photoToRemove = '';
            }
            $stmt = $pdo->prepare("DELETE FROM team_members WHERE id = ?");
            $stmt->execute([$id]);
            // The member is gone, so their uploaded portrait must not linger.
            if ($photoToRemove !== '') {
                astro_team_photo_delete($photoToRemove);
            }
            jsonResponse(['success' => true, 'message' => 'Team member removed']);
        }
        jsonResponse(['success' => false, 'message' => 'ID missing for deletion'], 400);
    }
}

// 9. GET /api/admin/users
if (strpos($path, 'admin/users') !== false && $method === 'GET') {
    $stmt = $pdo->query("SELECT id, name, email, mobile, role, country, created_at, last_login FROM users ORDER BY created_at DESC");
    $rows = $stmt->fetchAll();
    jsonResponse(['success' => true, 'users' => $rows]);
}

// 11. BANNED IPS MANAGEMENT (GET, POST, DELETE /api/admin/banned-ips)
if (strpos($path, 'admin/banned-ips') !== false) {
    // banned_ips lives in api/migrations/013 (fresh installs: api/schema.sql) — verified, never created, here.
    astroAdminRequireTable($pdo, 'banned_ips', 'api/migrations/013_web_request_ddl_consolidation.sql');

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM banned_ips ORDER BY created_at DESC");
        $rows = $stmt->fetchAll();
        $bannedIps = array_map(function($r) {
            return [
                'id' => 'ban_' . $r['id'],
                'ipAddress' => $r['ip_address'],
                'reason' => $r['reason'],
                'bannedBy' => $r['banned_by'],
                'bannedAt' => $r['created_at']
            ];
        }, $rows);
        jsonResponse(['success' => true, 'count' => count($bannedIps), 'bannedIps' => $bannedIps]);
    } elseif ($method === 'POST') {
        $body = getJsonBody();
        $ip = trim($body['ipAddress'] ?? '');
        $reason = trim($body['reason'] ?? 'Repeated fake orders / policy violation');
        if (empty($ip)) {
            jsonResponse(['success' => false, 'message' => 'IP address is required.'], 400);
        }

        $ins = $pdo->prepare("INSERT INTO banned_ips (ip_address, reason, banned_by, created_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), created_at = NOW()");
        $ins->execute([$ip, $reason, $admin['name'] ?? 'Admin']);

        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'IP_BANNED', "Banned IP {$ip}. Reason: {$reason}");

        jsonResponse([
            'success' => true,
            'message' => "IP {$ip} has been blocked. Future orders from this IP will be rejected."
        ]);
    } elseif ($method === 'DELETE') {
        $parts = explode('/', trim($path, '/'));
        $ip = end($parts);
        if ($ip === 'banned-ips' || empty($ip)) {
            $ip = $_GET['ip'] ?? '';
        }
        $ip = urldecode($ip);

        if (empty($ip)) {
            jsonResponse(['success' => false, 'message' => 'IP address missing for unban.'], 400);
        }

        $del = $pdo->prepare("DELETE FROM banned_ips WHERE ip_address = ?");
        $del->execute([$ip]);

        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'IP_UNBANNED', "Unbanned IP {$ip}");

        jsonResponse([
            'success' => true,
            'message' => "IP {$ip} has been unblocked. Orders can now be received."
        ]);
    }
}

// 12. POST /api/admin/orders/:id/ban-ip
if (preg_match('/admin\/orders\/([^\/]+)\/ban-ip/', $path, $matches) && $method === 'POST') {
    $orderId = $matches[1];
    $body = getJsonBody();
    $reason = trim($body['reason'] ?? 'Fake order / fake transaction number');

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    $ip = $order['ip_address'] ?? null;
    if (empty($ip)) {
        jsonResponse(['success' => false, 'message' => 'This order does not contain an IP address.'], 400);
    }

    // banned_ips lives in api/migrations/013 — verified, never created, here.
    astroAdminRequireTable($pdo, 'banned_ips', 'api/migrations/013_web_request_ddl_consolidation.sql');

    $ins = $pdo->prepare("INSERT INTO banned_ips (ip_address, reason, banned_by, created_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), created_at = NOW()");
    $ins->execute([$ip, $reason . " (#" . $order['order_number'] . ")", $admin['name'] ?? 'Admin']);

    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'IP_BANNED', "Banned IP {$ip} from order #{$order['order_number']}. Reason: {$reason}");

    jsonResponse([
        'success' => true,
        'message' => "IP {$ip} for order #{$order['order_number']} ({$order['user_name']}) has been blocked."
    ]);
}

// 12b. CUSTOMER REVIEW MODERATION (SEO audit 2026-10-15) — api/reviews.php.
// Placed before section 13 on purpose: that section runs the payment-table DDL
// at top level, which a review request has no reason to pay for.
//   GET    /api/admin/reviews?status=ALL|PENDING|APPROVED|REJECTED
//   POST   /api/admin/reviews/:id/approve   publish (re-checks the order is still paid + delivered)
//   POST   /api/admin/reviews/:id/reject    hide, with an optional reason the customer sees
//   DELETE /api/admin/reviews/:id
if (preg_match('#/admin/reviews(?:/([^/]+))?(?:/(approve|reject))?/?$#', $path, $reviewRoute)) {
    require_once __DIR__ . '/../reviews.php';
    $reviewId = isset($reviewRoute[1]) ? rawurldecode($reviewRoute[1]) : '';
    // "Publish every waiting review" — one click instead of one per review. The
    // single-review rule still applies to each row (a refunded order is skipped).
    if ($method === 'POST' && $reviewId === 'approve-all') {
        astro_admin_action_limit($pdo, $admin, 'review-bulk');
        astro_reviews_route_admin_approve_all($pdo, $admin);
    }
    $reviewDecision = $reviewRoute[2] ?? '';
    if ($method === 'GET' && $reviewId === '') {
        astro_reviews_route_admin_list($pdo);
    }
    if ($method === 'POST' && $reviewId !== '' && $reviewDecision !== '') {
        astro_reviews_route_admin_moderate($pdo, $admin, $reviewId, $reviewDecision, getJsonBody());
    }
    if ($method === 'DELETE' && $reviewId !== '' && $reviewDecision === '') {
        astro_reviews_route_admin_delete($pdo, $admin, $reviewId);
    }
    jsonResponse(['success' => false, 'message' => 'Unsupported review moderation request.'], 405);
}

// ---------------------------------------------------------------------------
// 13. PAYMENT RECOVERY — webhook audit trail + reconciliation of stale sessions
//
// A customer who pays but never returns to the browser leaves a CREATED intent.
// These endpoints let the operator see that state, and recover the payment from
// the provider instead of asking the customer to pay twice.
// ---------------------------------------------------------------------------
require_once __DIR__ . '/../payments.php';
astro_payment_ensure_tables($pdo);

// GET /api/admin/payments/recovery
if (strpos($path, 'admin/payments/recovery') !== false && $method === 'GET') {
    $minutes = isset($_GET['minutes']) ? (int)$_GET['minutes'] : 30;
    $minutes = max(5, min(24 * 60, $minutes));

    $staleStmt = $pdo->prepare("SELECT pi.*, u.email AS user_email, u.name AS user_name
        FROM payment_intents pi
        LEFT JOIN users u ON u.id = pi.user_id
        WHERE pi.status = 'CREATED' AND pi.created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY pi.created_at ASC
        LIMIT 100");
    $staleStmt->execute([$minutes]);
    $stale = $staleStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $eventStmt = $pdo->query("SELECT * FROM payment_webhook_events ORDER BY received_at DESC, id DESC LIMIT 50");
    $events = $eventStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Idempotency ledger: the counters tell support whether a payment was
    // suppressed as a duplicate or is stuck mid-capture, and `claims` lists the
    // recent rows so a deadlock retry (attempts > 1) is visible instead of
    // hiding in the PHP error log.
    $claimStmt = $pdo->query("SELECT idempotency_key, scope, provider, external_event_id, intent_id, order_id, status, attempts, detail, created_at, updated_at
        FROM payment_idempotency_keys
        WHERE attempts > 1 OR status <> 'PROCESSED'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 25");
    $claims = $claimStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($claims as $index => $claim) {
        // The hash is an internal lock name; show a short fingerprint only.
        $claims[$index]['idempotency_key'] = substr((string)$claim['idempotency_key'], 0, 12);
    }

    $config = astro_payment_provider_config($pdo);
    jsonResponse([
        'success' => true,
        'minutes' => $minutes,
        'staleCount' => count($stale),
        'stale' => $stale,
        'events' => $events,
        'idempotency' => astro_payment_idempotency_stats($pdo),
        'claims' => $claims,
        'providers' => [
            'razorpay' => [
                'checkoutConfigured' => !empty($config['razorpay']['configured']),
                'webhookSecretConfigured' => $config['razorpay']['webhook_secret'] !== ''
            ],
            'paypal' => [
                'checkoutConfigured' => !empty($config['paypal']['configured']),
                'webhookIdConfigured' => $config['paypal']['webhook_id'] !== ''
            ]
        ]
    ]);
}

// POST /api/admin/payments/reconcile  ({intentId} or {sweep:true})
if (strpos($path, 'admin/payments/reconcile') !== false && $method === 'POST') {
    astro_admin_action_limit($pdo, $admin, 'provider');
    $body = getJsonBody();
    $sweep = !empty($body['sweep']) || !empty($body['all']);
    $config = astro_payment_provider_config($pdo);

    if ($sweep) {
        $minutes = isset($body['minutes']) ? (int)$body['minutes'] : 30;
        $minutes = max(5, min(24 * 60, $minutes));
        $limit = 25;

        $staleStmt = $pdo->prepare("SELECT * FROM payment_intents WHERE status = 'CREATED' AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE) ORDER BY created_at ASC LIMIT " . (int)$limit);
        $staleStmt->execute([$minutes]);
        $intents = $staleStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $results = [];
        $captured = 0;
        $failed = 0;
        foreach ($intents as $intent) {
            $outcome = astro_payment_reconcile_intent($pdo, $intent, $config);
            if ($outcome['status'] === 'CAPTURED') {
                $captured++;
                logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'PAYMENT_RECONCILED',
                    'Recovered payment for intent ' . $intent['id'] . ' (' . $intent['provider'] . ', ' . $intent['currency'] . ' ' . $intent['amount'] . ').');
            } elseif (in_array($outcome['status'], ['UNKNOWN', 'FAILED'], true)) {
                $failed++;
            }
            $results[] = $outcome;
        }
        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'PAYMENT_RECONCILIATION_SWEEP',
            'Reconciled ' . count($intents) . ' stale payment intent(s): ' . $captured . ' captured, ' . $failed . ' unresolved.');
        jsonResponse([
            'success' => true,
            'message' => count($intents) . ' stale payment session(s) checked; ' . $captured . ' recovered.',
            'checked' => count($intents),
            'captured' => $captured,
            'failed' => $failed,
            'results' => $results
        ]);
    }

    $intentId = trim((string)($body['intentId'] ?? ''));
    if ($intentId === '') {
        jsonResponse(['success' => false, 'message' => 'Provide an intentId, or {"sweep": true} to check every stale session.'], 400);
    }
    $intent = astro_payment_intent_by_id($pdo, $intentId);
    if (!$intent) {
        jsonResponse(['success' => false, 'message' => 'Payment intent not found.'], 404);
    }
    $outcome = astro_payment_reconcile_intent($pdo, $intent, $config);
    if ($outcome['status'] === 'CAPTURED') {
        logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'PAYMENT_RECONCILED',
            'Recovered payment for intent ' . $intent['id'] . ' (' . $intent['provider'] . ', ' . $intent['currency'] . ' ' . $intent['amount'] . '). Reference ' . ($outcome['paymentReference'] ?? '') . '.');
    }
    jsonResponse([
        'success' => in_array($outcome['status'], ['CAPTURED', 'ALREADY_CAPTURED'], true),
        'outcome' => $outcome
    ]);
}

// =========================================================================
// AI Astrologer escalation queue — customer complaints forwarded from the
// AI chat plus the "Talk to our astrologer" handoffs. The table is owned by
// api/migrations/007_ai_astrologer_chat.sql and bootstrapped here too, so
// the queue works even before the first chat request on a fresh database.
// =========================================================================
function astroAdminEnsureAiChatTables($pdo) {
    static $done = false;
    if ($done) return;
    $file = __DIR__ . '/../migrations/007_ai_astrologer_chat.sql';
    if (is_file($file)) {
        $sql = preg_replace('/^[[:blank:]]*--.*$/m', '', (string) file_get_contents($file));
        foreach (explode(';', (string) $sql) as $statement) {
            $statement = trim($statement);
            if ($statement === '') continue;
            try {
                $pdo->exec($statement);
            } catch (\Throwable $e) {
                // CREATE TABLE IF NOT EXISTS: a real failure is logged here and
                // re-surfaced by the SELECT below — never swallowed silently.
                error_log('ASTRO SIVAM: AI chat table bootstrap statement failed: ' . $e->getMessage());
            }
        }
    }
    $done = true;
}

if (strpos($path, 'admin/ai-handoffs') !== false) {
    astroAdminEnsureAiChatTables($pdo);

    if ($method === 'GET') {
        try {
            $rows = $pdo->query(
                "SELECT id, session_id, user_id, user_name, user_email, user_mobile,
                        language, question, reason, order_number, status, admin_notes,
                        resolved_at, created_at
                   FROM ai_chat_handoffs
                  ORDER BY (status = 'NEW') DESC, created_at DESC
                  LIMIT 200"
            )->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(['success' => true, 'count' => count($rows), 'handoffs' => $rows]);
        } catch (\Throwable $e) {
            error_log('AI handoffs list failed: ' . $e->getMessage());
            jsonResponse(['success' => true, 'count' => 0, 'handoffs' => [],
                'note' => 'The AI chat tables are not available on this database yet.']);
        }
    }

    // POST — update status / admin notes for one escalation.
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        jsonResponse(['success' => false, 'message' => 'Missing handoff id.'], 400);
    }
    $status = strtoupper(trim((string) ($body['status'] ?? '')));
    if (!in_array($status, ['NEW', 'ACKNOWLEDGED', 'RESOLVED'], true)) {
        jsonResponse(['success' => false, 'message' => 'status must be NEW, ACKNOWLEDGED or RESOLVED.'], 400);
    }
    $notes = isset($body['adminNotes']) ? mb_substr((string) $body['adminNotes'], 0, 2000, 'UTF-8') : null;

    $stmt = $pdo->prepare(
        "UPDATE ai_chat_handoffs
            SET status = ?,
                admin_notes = COALESCE(?, admin_notes),
                resolved_at = CASE WHEN ? = 'RESOLVED' THEN NOW() ELSE resolved_at END
          WHERE id = ?"
    );
    $stmt->execute([$status, $notes, $status, $id]);
    if ($stmt->rowCount() === 0) {
        jsonResponse(['success' => false, 'message' => 'Handoff not found.'], 404);
    }
    logAudit($pdo, $admin['id'], $admin['name'], 'admin', 'AI_HANDOFF_UPDATED',
        'AI chat escalation #' . $id . ' set to ' . $status . '.');
    jsonResponse(['success' => true, 'id' => $id, 'status' => $status]);
}

jsonResponse(['success' => false, 'message' => 'Admin endpoint not found'], 404);
