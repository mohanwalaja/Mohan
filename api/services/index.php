<?php
/**
 * ASTRO SIVAM - Customer Services API Router
 */
require_once __DIR__ . '/../config.php';
// Client IP helpers live in api/client_ip.php (required by config.php); shared
// fixed-window rate limiting lives in api/rate_limit.php.
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../astrology/engine.php';
require_once __DIR__ . '/../mailer.php';
require_once __DIR__ . '/../chat_alerts.php';
// Payment primitives: the idempotency ledger + structured DB retry that make
// a repeated checkout submission replay instead of duplicating an order.
require_once __DIR__ . '/../payments.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
$jsonBody = getJsonBody();
$action = $_GET['action'] ?? $jsonBody['action'] ?? $_POST['action'] ?? '';

/**
 * Customer-facing order shape. One place that turns a `orders` row into the
 * JSON the app renders, so a replayed (duplicate-safe) checkout answer and the
 * my-orders list can never drift apart.
 */
function astro_order_to_client_array($r) {
    return [
        'id' => $r['id'],
        'orderNumber' => $r['order_number'],
        'groupId' => $r['group_id'] ?? ((!empty($r['input_payload']) ? (json_decode($r['input_payload'], true)['groupId'] ?? null) : null)),
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
        'paymentStatus' => $r['payment_status'] ?? null,
        'paymentConfirmed' => (bool)($r['payment_confirmed'] ?? false),
        'emailStatus' => $r['email_status'],
        'emailSentAt' => $r['email_sent_at'] ?? null,
        'inputPayload' => json_decode((string)($r['input_payload'] ?? ''), true) ?: [],
        'calculatedResult' => json_decode((string)($r['calculated_result'] ?? ''), true) ?: null,
        'hasPdf' => (bool)($r['has_pdf'] ?? 0),
        'hasInvoice' => (bool)($r['has_invoice'] ?? 0),
        'adminNotes' => $r['admin_notes'] ?? null,
        'refundStatus' => $r['refund_status'] ?? null,
        'refundReason' => $r['refund_reason'] ?? null,
        // Pre-approval 90% refund trail: the customer dashboard shows the amount
        // and the 3-working-day settlement date once the admin has approved it.
        'refundPercent' => isset($r['refund_percent']) ? floatval($r['refund_percent']) : null,
        'refundAmount' => isset($r['refund_amount']) ? floatval($r['refund_amount']) : null,
        'refundCurrency' => $r['refund_currency'] ?? null,
        'refundProcessedAt' => $r['refund_processed_at'] ?? null,
        'refundDeadline' => $r['refund_deadline'] ?? null,
        // GATEWAY = the provider already returned the money; MANUAL = the
        // administrator settles it by hand within the 3-working-day promise.
        'refundMethod' => $r['refund_method'] ?? null,
        'refundReference' => $r['refund_reference'] ?? null,
        'createdAt' => $r['created_at'],
        'updated_at' => $r['updated_at']
    ];
}

/**
 * Idempotent binding of ONE captured payment intent to an order submission.
 *
 * WHY: the family checkout inserts one order row per person and only afterwards
 * consumes the intent with a conditional UPDATE. A double click, an impatient
 * retry after a dropped response, or two parallel requests therefore used to
 * create two full sets of order rows where only one could win — leaving a
 * rejected ghost family behind. Claiming a deterministic key derived from the
 * intent BEFORE the inserts makes the second submission replay the first answer.
 *
 * @return array{state:string,key:string,record:?array} state: CLAIMED|DUPLICATE|IN_PROGRESS|ERROR
 */
function astro_claim_intent_binding($pdo, $intent, $userId, $scope) {
    $key = astro_payment_idempotency_key('order-bind', [
        'provider' => (string)($intent['provider'] ?? ''),
        'intentId' => (string)($intent['id'] ?? ''),
        'userId' => (string)$userId,
        'scope' => (string)$scope
    ]);
    astro_payment_ensure_tables($pdo);
    $claim = astro_payment_claim_idempotency($pdo, $key, [
        'scope' => (string)$scope,
        'provider' => (string)($intent['provider'] ?? ''),
        'intentId' => (string)($intent['id'] ?? ''),
        'detail' => 'Captured intent ' . (string)($intent['id'] ?? '') . ' is being bound to an order.'
    ]);
    $state = (string)($claim['state'] ?? 'ERROR');
    if ($state === 'ERROR') {
        // Fail OPEN here: the conditional UPDATE that consumes the intent is
        // still the authoritative guard against double-binding, so a ledger
        // outage must not block paying customers. It is logged loudly instead.
        astro_payment_log_structured('order_bind_claim_unavailable', [
            'intentId' => (string)($intent['id'] ?? ''),
            'scope' => (string)$scope
        ]);
    }
    return ['state' => $state, 'key' => $key, 'record' => $claim['record'] ?? null];
}

/**
 * A CONSUMED payment intent is not an error — the order it paid for already
 * exists. Return it with HTTP 200 so a retry after a dropped response, or a
 * crash between the capture and the ledger write, shows the customer their
 * order instead of "payment has not been completed".
 */
function astro_replay_consumed_intent($pdo, $intent, $scope, array $extra = []) {
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE payment_intent_id = ? AND status NOT IN ('REJECTED') ORDER BY group_order_index ASC, created_at ASC");
    $stmt->execute([(string)($intent['id'] ?? '')]);
    $rows = $stmt->fetchAll() ?: [];
    $orders = array_map('astro_order_to_client_array', $rows);
    astro_payment_log_structured('consumed_intent_replayed', [
        'scope' => (string)$scope,
        'intentId' => (string)($intent['id'] ?? ''),
        'orders' => count($orders)
    ]);
    if ($scope === 'single-order') {
        jsonResponse(array_merge([
            'success' => true,
            'duplicate' => true,
            'duplicateReason' => 'intent_already_consumed',
            'message' => 'This payment was already applied to an order. The existing order is shown below instead of a second one.',
            'order' => $orders[0] ?? null
        ], $extra), 200);
    }
    $groupId = (string)($rows[0]['group_id'] ?? '');
    jsonResponse(array_merge([
        'success' => true,
        'duplicate' => true,
        'duplicateReason' => 'intent_already_consumed',
        'message' => $groupId !== ''
            ? 'This payment was already applied to family order ' . $groupId . '. The existing order is shown below instead of a second one.'
            : 'This payment was already applied to a family order. The existing order is shown below instead of a second one.',
        'orders' => $orders,
        'groupId' => $groupId !== '' ? $groupId : null
    ], $extra), 200);
}

/** Fetch the orders already bound to a replayed intent (may be empty). */
function astro_orders_for_replay($pdo, $record) {
    $ids = [];
    if (!empty($record['order_id'])) $ids[] = (string)$record['order_id'];
    if (!empty($record['intent_id'])) {
        $stmt = $pdo->prepare("SELECT * FROM orders WHERE payment_intent_id = ? ORDER BY group_order_index ASC, created_at ASC");
        $stmt->execute([(string)$record['intent_id']]);
        $rows = $stmt->fetchAll() ?: [];
        if (!empty($rows)) return $rows;
    }
    if (empty($ids)) return [];
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? OR group_id = ? ORDER BY group_order_index ASC, created_at ASC");
    $stmt->execute([$ids[0], $ids[0]]);
    return $stmt->fetchAll() ?: [];
}

function astro_is_valid_marriage_payload($payload): bool {
    return is_array($payload)
        && AstroEngine::hasValidBirthDetails($payload['bride'] ?? null)
        && AstroEngine::hasValidBirthDetails($payload['groom'] ?? null);
}

function astro_is_valid_muhurtham_payload($payload): bool {
    if (!is_array($payload) || empty($payload['muhurthamPlace']) || !AstroEngine::hasValidBirthDetails($payload)) {
        return false;
    }
    $validCoordinates = function ($latitude, $longitude, $offset) {
        return is_numeric($latitude) && (float)$latitude >= -90 && (float)$latitude <= 90
            && is_numeric($longitude) && (float)$longitude >= -180 && (float)$longitude <= 180
            && is_numeric($offset) && (float)$offset >= -14 && (float)$offset <= 14;
    };
    return $validCoordinates($payload['muhurthamLatitude'] ?? null, $payload['muhurthamLongitude'] ?? null, $payload['muhurthamTimezoneOffsetHours'] ?? null);
}

/**
 * Online payment intents are deliberately kept in SQL rather than in a
 * browser/session token. The order endpoint later binds one captured intent
 * to the server-calculated amount and the authenticated owner.
 */
function astro_ensure_payment_intents_table($pdo) {
    static $ready = false;
    if ($ready) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS payment_intents (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        provider VARCHAR(32) NOT NULL,
        payment_method VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(8) NOT NULL,
        gateway_order_id VARCHAR(191) NOT NULL,
        gateway_payment_id VARCHAR(191) NULL,
        gateway_signature VARCHAR(512) NULL,
        payment_reference VARCHAR(191) NULL,
        payer_account VARCHAR(191) NULL,
        order_id VARCHAR(64) NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_intents_user_status (user_id, status),
        INDEX idx_payment_intents_reference (payment_reference),
        INDEX idx_payment_intents_gateway_order (gateway_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}

/**
 * Atomic one-free-report-per-IP ledger. The primary key serializes concurrent
 * claims; beta_ip_orders remains the human-readable audit/history table.
 */
function astro_ensure_beta_ip_claims_table($pdo) {
    static $ready = false;
    if ($ready) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS beta_ip_claims (
        ip_address VARCHAR(64) NOT NULL PRIMARY KEY,
        claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // One-time backfill for existing installations. INSERT IGNORE plus the
    // primary key safely collapses any legacy duplicate IP rows.
    $count = (int)$pdo->query("SELECT COUNT(*) FROM beta_ip_claims")->fetchColumn();
    if ($count === 0) {
        try {
            $pdo->exec("INSERT IGNORE INTO beta_ip_claims (ip_address, claimed_at)
                SELECT ip_address, MIN(created_at) FROM beta_ip_orders
                WHERE ip_address <> '' GROUP BY ip_address");
        } catch (Exception $e) {
            // A missing legacy history table is safe: new claims still use this ledger.
        }
    }
    $ready = true;
}

/**
 * Verifies the family-bundle and online-payment columns exist on `orders` —
 * WITHOUT running DDL.
 *
 * Those columns live in api/migrations/013_web_request_ddl_consolidation.sql
 * (and api/schema.sql for fresh installs). Web requests must never ALTER
 * TABLE: the web DB user is granted no ALTER privilege. This check fails
 * loudly at the point of use instead. It runs once per process.
 */
function astro_ensure_order_limit_columns($pdo) {
    static $ready = false;
    if ($ready) return;

    try {
        $existing = $pdo->query("SHOW COLUMNS FROM `orders`")->fetchAll(PDO::FETCH_COLUMN, 0);
    } catch (Exception $e) {
        error_log('ASTRO SIVAM: order schema check failed - ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
    foreach (['group_id', 'group_order_index', 'payment_intent_id', 'payment_status'] as $column) {
        if (!in_array($column, $existing, true)) {
            error_log("ASTRO SIVAM: orders.{$column} is missing; run api/migrations/013_web_request_ddl_consolidation.sql on this database.");
            jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
        }
    }
    $ready = true;
}

/** Number of distinct open checkouts with payment still awaiting verification. */
function astro_count_pending_order_groups_by_ip($pdo, $ipAddress) {
    astro_ensure_order_limit_columns($pdo);
    $stmt = $pdo->prepare("SELECT COUNT(DISTINCT COALESCE(NULLIF(group_id, ''), id))
        FROM orders
        WHERE ip_address = ?
          AND status IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION')
          AND COALESCE(payment_confirmed, 0) = 0
          AND UPPER(COALESCE(NULLIF(payment_status, ''), 'PENDING_ADMIN')) NOT IN ('CAPTURED', 'VERIFIED_MANUAL', 'NOT_REQUIRED')");
    $stmt->execute([$ipAddress]);
    return (int)($stmt->fetchColumn() ?: 0);
}

function astro_is_masked_secret($value) {
    $value = trim((string)$value);
    if ($value === '' || strpos($value, '•') !== false || preg_match('/^\\*+$/', $value)) return true;
    return (bool)preg_match('/^(?:change[-_ ]?me|replace[-_ ]?me|astro_sivam_|your[-_ ]?(?:secret|token|key)|placeholder)/i', $value);
}

function astro_http_json($url, $method = 'GET', $headers = [], $body = null, $basicUser = null, $basicPassword = null) {
    if (!function_exists('curl_init')) {
        throw new Exception('Server payment transport is unavailable.');
    }
    $ch = curl_init($url);
    $method = strtoupper($method);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2
    ];
    if ($basicUser !== null) $options[CURLOPT_USERPWD] = $basicUser . ':' . ($basicPassword ?? '');
    if ($body !== null) $options[CURLOPT_POSTFIELDS] = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_SLASHES);
    curl_setopt_array($ch, $options);
    $raw = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $error !== '') throw new Exception('Payment provider request failed.');
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new Exception('Payment provider returned an invalid response.');
    return ['status' => $status, 'body' => $decoded];
}

function astro_setting_value($general, $keys, $envKeys = []) {
    foreach ($envKeys as $envKey) {
        $value = getenv($envKey);
        if ($value !== false && !astro_is_masked_secret($value)) return trim($value);
    }
    foreach ($keys as $key) {
        $value = $general[$key] ?? '';
        if (!astro_is_masked_secret($value)) return trim((string)$value);
    }
    return '';
}

function astro_new_payment_intent_id() {
    try { return 'pi_' . bin2hex(random_bytes(16)); }
    catch (Exception $e) { throw new Exception('Could not create a secure payment session. Please try again.'); }
}

/**
 * Contact submissions: 4 per network per 10 minutes.
 *
 * Counters now live in the shared api_rate_limits table (see api/rate_limit.php)
 * keyed by an HMAC of the client IP, so the old contact_rate_limits table is no
 * longer written to.
 */
function astro_enforce_contact_rate_limit($pdo) {
    astro_rate_limit_enforce(
        $pdo,
        'contact-ip',
        getClientIpAddress(),
        4,
        600,
        'Too many contact submissions. Please retry after the rate limit expires.'
    );
}

// 1. GET /api/services/settings
// Anchored match: the old bare-substring checks (notably strpos($fullUri,
// 'settings')) would also catch any future route whose name merely contains
// "settings". Every route in this file is matched the same anchored way.
if (($method === 'GET' || $method === 'HEAD') && (
    preg_match('#/services/settings/?$#', $path) ||
    $action === 'settings'
)) {
    $stmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $row = $stmt->fetch();
    if ($row) {
        $general = json_decode($row['general_settings'] ?? '{}', true) ?: [];
        $email = json_decode($row['email_settings'] ?? '{}', true) ?: [];
        $pricing = json_decode($row['pricing'] ?? '{}', true) ?: [];
        $paymentMethods = json_decode($row['payment_methods'] ?? '{}', true) ?: [];

        // Safe public email subset
        $safeEmail = [
            'senderName' => $email['senderName'] ?? $email['fromName'] ?? ($general['senderName'] ?? 'ASTRO SIVAM'),
            'senderEmail' => $email['senderEmail'] ?? $email['fromEmail'] ?? ($general['senderEmail'] ?? 'admin@astrosivam.com'),
            'replyTo' => $email['replyTo'] ?? $email['replyToEmail'] ?? ($general['replyTo'] ?? 'admin@astrosivam.com')
        ];

        // Merge all general settings into a unified full settings object (stripping sensitive secrets for public endpoint)
        $settings = array_merge($general, [
            'serviceMode' => $row['service_mode'] ?? $general['serviceMode'] ?? 'PAID',
            'freeBetaActive' => isset($row['free_beta_active']) ? (bool)$row['free_beta_active'] : ($general['freeBetaActive'] ?? false),
            'currency' => $row['currency'] ?? $general['currency'] ?? DEFAULT_CURRENCY,
            'pricing' => $pricing,
            'paymentMethods' => $paymentMethods,
            'emailSettings' => $safeEmail
        ]);

        // FREE BETA RULE — exactly ONE free report per IP address:
        // tell THIS client whether its free chart is still unused, so the
        // family tray can price the FIRST chart free and every additional
        // chart at full price (and collect payment for the rest of the family).
        $betaModeActive = (($settings['serviceMode'] ?? 'PAID') === 'FREE_BETA') || (bool)($settings['freeBetaActive'] ?? false);
        $settings['betaFreeChartAvailable'] = false;
        if ($betaModeActive) {
            try {
                astro_ensure_beta_ip_claims_table($pdo);
                $betaIp = getClientIpAddress();
                $betaStmt = $pdo->prepare("SELECT COUNT(*) FROM beta_ip_claims WHERE ip_address = ?");
                $betaStmt->execute([$betaIp]);
                $settings['betaFreeChartAvailable'] = ((int)($betaStmt->fetchColumn() ?: 0)) < 1;
            } catch (Exception $e) {
                // Fail closed if the atomic free-report ledger is unavailable.
                $settings['betaFreeChartAvailable'] = false;
            }
        }

        if (!isset($settings['intlPriceUSD'])) $settings['intlPriceUSD'] = $general['intlPriceUSD'] ?? 5;
        if (!isset($settings['googleLoginEnabled'])) $settings['googleLoginEnabled'] = $general['googleLoginEnabled'] ?? true;
        if (!isset($settings['googleClientId'])) $settings['googleClientId'] = $general['googleClientId'] ?? '';
        if (!isset($settings['facebookLoginEnabled'])) $settings['facebookLoginEnabled'] = $general['facebookLoginEnabled'] ?? true;
        if (!isset($settings['facebookAppId'])) $settings['facebookAppId'] = $general['facebookAppId'] ?? '';
        if (!isset($settings['activeThemeTemplate'])) $settings['activeThemeTemplate'] = $general['activeThemeTemplate'] ?? 'classic-primary';
        if (!isset($settings['vodafoneMPaisaNumber'])) $settings['vodafoneMPaisaNumber'] = $general['vodafoneMPaisaNumber'] ?? '+679 999 1234';
        if (!isset($settings['vodafoneMPaisaPaymentMode'])) $settings['vodafoneMPaisaPaymentMode'] = $general['vodafoneMPaisaPaymentMode'] ?? 'offline';
        if (!isset($settings['indiaGpayPaymentMode'])) $settings['indiaGpayPaymentMode'] = $general['indiaGpayPaymentMode'] ?? 'online';
        if (!isset($settings['paypalPaymentMode'])) $settings['paypalPaymentMode'] = $general['paypalPaymentMode'] ?? 'online';
        if (!isset($settings['digicelMyCashNumber'])) $settings['digicelMyCashNumber'] = $general['digicelMyCashNumber'] ?? '+679 777 5678';
        if (!isset($settings['paypalEmail'])) $settings['paypalEmail'] = $general['paypalEmail'] ?? 'payments@astrosivam.com';
        if (!isset($settings['paypalClientId'])) $settings['paypalClientId'] = $general['paypalClientId'] ?? '';
        if (!isset($settings['paypalMode'])) $settings['paypalMode'] = $general['paypalMode'] ?? 'sandbox';

        // Never advertise an online provider unless the server has the
        // credentials required to create and verify provider orders.
        $razorpayProvider = strtolower((string)($general['indiaGpayOnlineProvider'] ?? 'razorpay'));
        $razorpayKeyId = astro_setting_value($general, ['indiaGpayKeyId', 'razorpayKeyId'], ['RAZORPAY_KEY_ID']);
        $razorpaySecret = astro_setting_value($general, ['indiaGpayKeySecret', 'razorpayKeySecret'], ['RAZORPAY_KEY_SECRET']);
        $paypalClientId = astro_setting_value($general, ['paypalClientId'], ['PAYPAL_CLIENT_ID']);
        $paypalClientSecret = astro_setting_value($general, ['paypalClientSecret', 'paypalSecret'], ['PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET']);
        $settings['indiaGpayPaymentMode'] = ($razorpayProvider === 'razorpay' && $razorpayKeyId !== '' && $razorpaySecret !== '' && strtolower((string)($settings['indiaGpayPaymentMode'] ?? 'online')) !== 'offline') ? 'online' : 'online';
        $settings['paypalPaymentMode'] = ($paypalClientId !== '' && $paypalClientSecret !== '' && strtolower((string)($settings['paypalPaymentMode'] ?? 'online')) !== 'offline') ? 'online' : 'online';
        $settings['vodafoneMPaisaPaymentMode'] = 'offline';
        $settings['indiaGpayOnlineConfigured'] = $razorpayProvider === 'razorpay' && $razorpayKeyId !== '' && $razorpaySecret !== '';
        $settings['paypalOnlineConfigured'] = $paypalClientId !== '' && $paypalClientSecret !== '';
        $settings['vodafoneMPaisaOnlineConfigured'] = false;
        $settings['onlineGatewayAvailability'] = [
            'razorpay' => $settings['indiaGpayPaymentMode'] === 'online',
            'paypal' => $settings['paypalPaymentMode'] === 'online',
            'mpaisa' => false
        ];

        // Remove secrets from public endpoint
        unset($settings['facebookAppSecret']);
        unset($settings['paypalSecret']);
        unset($settings['paypalClientSecret']);
        unset($settings['indiaGpayKeySecret']);
        unset($settings['indiaGpayWebhookSecret']);
        unset($settings['razorpayKeySecret']);
        unset($settings['razorpayWebhookSecret']);
        unset($settings['razorpaySecret']);
        unset($settings['vodafoneMPaisaApiSecret']);
        // Legacy external-model settings are never exposed publicly.
        unset($settings['aiAstrologerSettings']);
        // Chat alert tokens must never be public - expose only the on/off flags.
        $chatPublic = is_array($settings['chatAlertSettings'] ?? null) ? $settings['chatAlertSettings'] : [];
        $settings['chatAlertSettings'] = [
            'enabled' => (bool)($chatPublic['enabled'] ?? true),
            'notifyOrderConfirmed' => (bool)($chatPublic['notifyOrderConfirmed'] ?? true),
            'notifyOrderCompleted' => (bool)($chatPublic['notifyOrderCompleted'] ?? true),
            'whatsapp' => ['enabled' => (bool)($chatPublic['whatsapp']['enabled'] ?? false)],
            'viber' => ['enabled' => (bool)($chatPublic['viber']['enabled'] ?? false)]
        ];
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
            'activeThemeTemplate' => 'classic-primary',
            'vodafoneMPaisaNumber' => '+679 999 1234',
            'vodafoneMPaisaPaymentMode' => 'offline',
            'indiaGpayPaymentMode' => 'online',
            'paypalPaymentMode' => 'online',
            'digicelMyCashNumber' => '+679 777 5678',
            'paypalEmail' => 'payments@astrosivam.com',
            'paypalClientId' => '',
            'paypalMode' => 'sandbox',
            'supportEmail' => 'admin@astrosivam.com',
            'supportPhone' => '+679 999 8888',
            'pricing' => ['BIRTH_JATHAGAM' => ['usd' => 18, 'inr' => (int)round(18 * USD_TO_INR_RATE)], 'MARRIAGE_COMPATIBILITY' => ['usd' => 22, 'inr' => (int)round(22 * USD_TO_INR_RATE)], 'BABY_NAMING' => ['usd' => 15, 'inr' => (int)round(15 * USD_TO_INR_RATE)], 'MUHURTHAM' => ['usd' => 20, 'inr' => (int)round(20 * USD_TO_INR_RATE)]],
            'paymentMethods' => ['mpaisa' => ['enabled' => true, 'accountName' => 'ASTRO SIVAM CONSULTING', 'mobileNumber' => '9998888']],
            'emailSettings' => ['fromEmail' => 'admin@astrosivam.com', 'fromName' => 'ASTRO SIVAM'],
            'generalSettings' => ['siteName' => 'ASTRO SIVAM', 'turnaroundHours' => 12],
            // No settings row = PAID mode: no free beta chart available.
            'betaFreeChartAvailable' => false,
            'indiaGpayOnlineConfigured' => false,
            'paypalOnlineConfigured' => false,
            'vodafoneMPaisaOnlineConfigured' => false,
            'onlineGatewayAvailability' => ['razorpay' => false, 'paypal' => false, 'mpaisa' => false]
        ];
    }
    jsonResponse(['success' => true, 'settings' => $settings]);
}

// 2. GET /api/services/team
if ((preg_match('#/services/team/?$#', $path) || $action === 'team') && $method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM team_members WHERE is_active = 1 ORDER BY display_order ASC, created_at ASC");
    $rows = $stmt->fetchAll();
    $team = array_map(function($r) {
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'title' => $r['title'],
            'titleTa' => $r['title_ta'],
            'titleHi' => $r['title_hi'],
            'bio' => $r['bio'],
            'location' => $r['location'],
            'experienceYears' => intval($r['experience_years']),
            'specializations' => json_decode($r['specializations'], true) ?: [],
            'photoUrl' => $r['photo_url'],
            'isActive' => (bool)$r['is_active'],
            'displayOrder' => intval($r['display_order']),
            'contactPhone' => $r['contact_phone'],
            'contactEmail' => $r['contact_email']
        ];
    }, $rows);
    jsonResponse(['success' => true, 'count' => count($team), 'team' => $team]);
}

// 3. GET & POST /api/services/profile
if (preg_match('#/services/profile/?$#', $path) || $action === 'profile' || $action === 'get-profile' || $action === 'save-profile') {
    $user = requireAuth($pdo);
    if ($method === 'GET' || $action === 'get-profile') {
        $stmt = $pdo->prepare("SELECT * FROM birth_profiles WHERE user_id = ? LIMIT 1");
        $stmt->execute([$user['id']]);
        $bp = $stmt->fetch();
        jsonResponse(['success' => true, 'profile' => $bp ?: null]);
    } elseif ($method === 'POST' || $action === 'save-profile') {
        $body = getJsonBody();
        $birthProblem = AstroEngine::describeBirthDetailsProblem($body);
        if ($birthProblem !== null) {
            jsonResponse(['success' => false, 'message' => 'A valid past birth date, birth time, birth place, coordinates and time zone are required to save a birth profile. ' . $birthProblem], 400);
        }
        $body['tob'] = AstroEngine::normalizeBirthTime($body['tob']);
        $stmt = $pdo->prepare("SELECT id FROM birth_profiles WHERE user_id = ? LIMIT 1");
        $stmt->execute([$user['id']]);
        $existing = $stmt->fetch();

        if ($existing) {
            $upd = $pdo->prepare("UPDATE birth_profiles SET name = ?, dob = ?, tob = ?, birth_place = ?, country = ?, latitude = ?, longitude = ?, timezone_offset_hours = ?, gender = ?, updated_at = NOW() WHERE user_id = ?");
            $upd->execute([
                $body['name'] ?? $user['name'],
                $body['dob'],
                $body['tob'],
                trim((string) $body['birthPlace']),
                trim((string) ($body['country'] ?? '')),
                (float) $body['latitude'],
                (float) $body['longitude'],
                (float) $body['timezoneOffsetHours'],
                $body['gender'] ?? 'M',
                $user['id']
            ]);
        } else {
            $bpId = astro_random_id('bp_', 16);
            $ins = $pdo->prepare("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            $ins->execute([
                $bpId,
                $user['id'],
                $body['name'] ?? $user['name'],
                $body['dob'],
                $body['tob'],
                trim((string) $body['birthPlace']),
                trim((string) ($body['country'] ?? '')),
                (float) $body['latitude'],
                (float) $body['longitude'],
                (float) $body['timezoneOffsetHours'],
                $body['gender'] ?? 'M'
            ]);
        }

        $stmt = $pdo->prepare("SELECT * FROM birth_profiles WHERE user_id = ? LIMIT 1");
        $stmt->execute([$user['id']]);
        $profile = $stmt->fetch();

        // The name saved in the website profile is the devotee's real name:
        // mirror it onto the account so the welcome message, navbar and
        // dashboard all show the edited name — and never a stale one.
        $savedName = cleanDisplayName($body['name'] ?? $user['name']);
        if ($savedName === '') $savedName = providerFallbackName($user['email']);
        try {
            $pdo->prepare("UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?")->execute([$savedName, $user['id']]);
            if ($profile) $profile['name'] = $savedName;
        } catch (Exception $e) {}

        jsonResponse(['success' => true, 'message' => 'Profile saved successfully', 'profile' => $profile]);
    }
}

// 4. POST /api/services/calculate-preview
if ((preg_match('#/services/calculate-preview/?$#', $path) || $action === 'calculate-preview') && $method === 'POST') {
    // The calculator runs the full ephemeris; keep it to 20/minute per network.
    astro_rate_limit_enforce($pdo, 'calculate-preview-ip', getClientIpAddress(), 20, 60,
        'Too many calculation requests. Please wait a moment and try again.');

    $body = getJsonBody();
    $serviceType = $body['serviceType'] ?? 'BIRTH_JATHAGAM';
    $payload = $body['payload'] ?? [];
    if (!in_array($serviceType, ['BIRTH_JATHAGAM', 'MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'], true)) {
        jsonResponse(['success' => false, 'message' => 'Unsupported astrology service type.'], 400);
    }

    if ($serviceType === 'BIRTH_JATHAGAM' || $serviceType === 'BABY_NAMING') {
        $birthProblem = AstroEngine::describeBirthDetailsProblem($payload);
        if ($birthProblem !== null) {
            jsonResponse(['success' => false, 'message' => 'A valid past birth date, 24-hour birth time, birth place, coordinates and time zone are required for an accurate preview. ' . $birthProblem], 400);
        }
    }
    if ($serviceType === 'MARRIAGE_COMPATIBILITY' && !astro_is_valid_marriage_payload($payload)) {
        $brideProblem = AstroEngine::describeBirthDetailsProblem(is_array($payload) ? ($payload['bride'] ?? null) : null);
        $groomProblem = AstroEngine::describeBirthDetailsProblem(is_array($payload) ? ($payload['groom'] ?? null) : null);
        $detail = trim(($brideProblem !== null ? ' Bride: ' . $brideProblem : '') . ($groomProblem !== null ? ' Groom: ' . $groomProblem : ''));
        jsonResponse(['success' => false, 'message' => trim('Both bride and groom need valid past birth dates, birth times, birth places, coordinates and time zones. ' . $detail)], 400);
    }

    if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
        $result = AstroEngine::calculateMatchmaking($payload);
    } elseif ($serviceType === 'BABY_NAMING') {
        $result = AstroEngine::calculateBabyNaming($payload);
    } elseif ($serviceType === 'MUHURTHAM') {
        if (!astro_is_valid_muhurtham_payload($payload)) {
            jsonResponse(['success' => false, 'message' => 'Muhurtham preview needs valid birth details and a separate event location with coordinates and time zone.'], 400);
        }
        $result = AstroEngine::calculateMuhurtham($payload);
    } else {
        $result = AstroEngine::calculateHoroscope($payload);
    }

    // nodeType declares the Rahu/Ketu convention (ASTRO_RAHU_NODE_TYPE in
    // config.php): 'TRUE' = osculating node, 'MEAN' = mean node.
    jsonResponse(['success' => true, 'nodeType' => AstroEngine::nodeType(), 'result' => $result]);
}

// 4b. POST /api/services/payment/create-session (durable provider order)
if ((preg_match('#/services/payment/create-session/?$#', $path) || $action === 'create-payment-session') && $method === 'POST') {
    $user = requireAuth($pdo);
    // 8 sessions/10 min per user and 20/10 min per network.
    astro_rate_limit_enforce($pdo, 'payment-create-user', $user['id'], 8, 600,
        'Too many payment sessions were started. Please wait before trying again.');
    astro_rate_limit_enforce($pdo, 'payment-create-ip', getClientIpAddress(), 20, 600,
        'Too many payment sessions were started from this network. Please wait before trying again.');

    $body = getJsonBody();
    $pm = strtoupper(trim((string)($body['paymentMethod'] ?? '')));
    $amount = round((float)($body['amount'] ?? 0), 2);
    $desc = trim((string)($body['description'] ?? 'ASTRO SIVAM Vedic Astrology Consultation'));

    if ($amount <= 0 || !is_finite($amount)) {
        jsonResponse(['success' => false, 'message' => 'A positive payment amount is required to start an online payment session.'], 400);
    }
    if (!in_array($pm, ['GPAY', 'UPI', 'PAYPAL', 'CARD'], true)) {
        jsonResponse(['success' => false, 'message' => 'This payment method does not support a verified online checkout.'], 400);
    }
    // Client amount is display-only: the gateway intent is re-validated at
    // order bind + webhook against server pricing. Reject implausible values
    // here so a tampered amount can never reach a provider order.
    if ($amount > 1000) {
        jsonResponse(['success' => false, 'message' => 'Payment amount looks incorrect. Please refresh pricing and try again.'], 400);
    }

    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $general = $sRow ? (json_decode($sRow['general_settings'] ?? '{}', true) ?: []) : [];
    try {
        $intentId = astro_new_payment_intent_id();
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 502);
    }
    $expiresAt = date('Y-m-d H:i:s', time() + 1800);
    $gatewayOrderId = '';
    $provider = '';
    $currency = '';
    $session = [
        'sessionId' => $intentId,
        'paymentIntentId' => $intentId,
        'amount' => $amount,
        'description' => $desc
    ];

    try {
        if ($pm === 'GPAY' || $pm === 'UPI') {
            $provider = strtolower((string)($general['indiaGpayOnlineProvider'] ?? 'razorpay'));
            $keyId = astro_setting_value($general, ['indiaGpayKeyId', 'razorpayKeyId'], ['RAZORPAY_KEY_ID']);
            $keySecret = astro_setting_value($general, ['indiaGpayKeySecret', 'razorpayKeySecret'], ['RAZORPAY_KEY_SECRET']);
            $mode = strtolower((string)($general['indiaGpayPaymentMode'] ?? 'online'));
            if ($mode !== 'online' || $provider !== 'razorpay' || $keyId === '' || $keySecret === '') {
                jsonResponse(['success' => false, 'message' => 'Razorpay online checkout is not configured.'], 503);
            }
            $receipt = 'ASTRO-' . strtoupper(astro_random_hex(18));
            $providerResponse = astro_http_json(
                'https://api.razorpay.com/v1/orders',
                'POST',
                ['Content-Type: application/json', 'Accept: application/json'],
                ['amount' => (int)round($amount * 100), 'currency' => 'INR', 'receipt' => $receipt, 'notes' => ['user_id' => $user['id']]],
                $keyId,
                $keySecret
            );
            $providerOrder = $providerResponse['body'] ?? [];
            if ($providerResponse['status'] < 200 || $providerResponse['status'] >= 300 || empty($providerOrder['id'])) {
                throw new Exception('Razorpay did not create a payment order.');
            }
            $gatewayOrderId = trim((string)$providerOrder['id']);
            $provider = 'razorpay';
            $currency = 'INR';
            $session += [
                'paymentMethod' => 'GPAY',
                'provider' => 'razorpay',
                'environment' => strtolower((string)($general['indiaGpayEnvironment'] ?? 'sandbox')) === 'live' ? 'live' : 'sandbox',
                'currency' => 'INR',
                'gatewayOrderId' => $gatewayOrderId,
                'keyId' => $keyId,
                'merchantName' => $general['indiaGpayName'] ?? 'ASTRO SIVAM'
            ];
        } else {
            $clientId = astro_setting_value($general, ['paypalClientId'], ['PAYPAL_CLIENT_ID']);
            $clientSecret = astro_setting_value($general, ['paypalClientSecret', 'paypalSecret'], ['PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET']);
            $mode = strtolower((string)($general['paypalPaymentMode'] ?? 'online'));
            if ($mode !== 'online' || $clientId === '' || $clientSecret === '') {
                jsonResponse(['success' => false, 'message' => 'PayPal online checkout is not configured.'], 503);
            }
            $environment = strtolower((string)($general['paypalMode'] ?? 'sandbox')) === 'live' ? 'live' : 'sandbox';
            $base = $environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
            $tokenResponse = astro_http_json(
                $base . '/v1/oauth2/token',
                'POST',
                ['Accept: application/json', 'Accept-Language: en_US', 'Content-Type: application/x-www-form-urlencoded'],
                'grant_type=client_credentials',
                $clientId,
                $clientSecret
            );
            $accessToken = (string)($tokenResponse['body']['access_token'] ?? '');
            if ($tokenResponse['status'] < 200 || $tokenResponse['status'] >= 300 || $accessToken === '') {
                throw new Exception('PayPal authentication failed.');
            }
            $providerResponse = astro_http_json(
                $base . '/v2/checkout/orders',
                'POST',
                ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $accessToken],
                [
                    'intent' => 'CAPTURE',
                    'purchase_units' => [['reference_id' => $intentId, 'description' => substr($desc, 0, 127), 'amount' => ['currency_code' => 'USD', 'value' => number_format($amount, 2, '.', '')]]]
                ]
            );
            $providerOrder = $providerResponse['body'] ?? [];
            if ($providerResponse['status'] < 200 || $providerResponse['status'] >= 300 || empty($providerOrder['id'])) {
                throw new Exception('PayPal did not create a payment order.');
            }
            $gatewayOrderId = trim((string)$providerOrder['id']);
            $provider = 'paypal';
            $currency = 'USD';
            $approvalUrl = null;
            foreach (($providerOrder['links'] ?? []) as $link) {
                if (($link['rel'] ?? '') === 'approve') { $approvalUrl = $link['href'] ?? null; break; }
            }
            $session += [
                'paymentMethod' => 'PAYPAL',
                'provider' => 'paypal_rest',
                'environment' => $environment,
                'currency' => 'USD',
                'gatewayOrderId' => $gatewayOrderId,
                'clientId' => $clientId,
                'paypalEmail' => $general['paypalEmail'] ?? 'payments@astrosivam.com',
                'businessName' => $general['paypalBusinessName'] ?? 'ASTRO SIVAM',
                'approvalUrl' => $approvalUrl
            ];
        }

        $ins = $pdo->prepare("INSERT INTO payment_intents (id, user_id, provider, payment_method, status, amount, currency, gateway_order_id, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, NOW(), NOW())");
        $ins->execute([$intentId, $user['id'], $provider, $session['paymentMethod'], $amount, $currency, $gatewayOrderId, $expiresAt]);
        jsonResponse(['success' => true, 'session' => $session]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage() ?: 'Unable to initialize verified online payment.'], 502);
    }
}

// 4c. POST /api/services/payment/verify-session (provider verification)
if ((preg_match('#/services/payment/verify-session/?$#', $path) || $action === 'verify-payment-session') && $method === 'POST') {
    $user = requireAuth($pdo);
    // 20 verifications/10 min per user and 40/10 min per network.
    astro_rate_limit_enforce($pdo, 'payment-verify-user', $user['id'], 20, 600,
        'Too many payment verification attempts. Please wait before trying again.');
    astro_rate_limit_enforce($pdo, 'payment-verify-ip', getClientIpAddress(), 40, 600,
        'Too many payment verification attempts from this network. Please wait before trying again.');

    $body = getJsonBody();
    $intentId = trim((string)($body['paymentIntentId'] ?? $body['sessionId'] ?? ''));
    $requestedMethod = strtoupper(trim((string)($body['paymentMethod'] ?? '')));
    $gatewayOrderId = trim((string)($body['gatewayOrderId'] ?? ''));
    $gatewayPaymentId = trim((string)($body['gatewayPaymentId'] ?? ''));
    $gatewaySignature = trim((string)($body['gatewaySignature'] ?? ''));
    $payerAccount = trim((string)($body['payerAccount'] ?? ''));

    if ($intentId === '') {
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'A payment intent is required.'], 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM payment_intents WHERE id = ? AND user_id = ? LIMIT 1");
    $stmt->execute([$intentId, $user['id']]);
    $intent = $stmt->fetch();
    if (!$intent) {
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'Payment intent not found or not owned by this account.'], 404);
    }
    if ($intent['status'] !== 'CAPTURED' && strtotime((string)$intent['expires_at']) <= time()) {
        $pdo->prepare("UPDATE payment_intents SET status = 'EXPIRED', updated_at = NOW() WHERE id = ? AND status IN ('CREATED', 'PENDING_MANUAL')")->execute([$intentId]);
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'Payment session has expired. Start a new checkout.'], 410);
    }
    if ($intent['status'] === 'CONSUMED') {
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'Payment session has already been bound to an order.'], 409);
    }

    $pm = strtoupper((string)$intent['payment_method']);
    if ($requestedMethod !== '' && $requestedMethod !== $pm && !($pm === 'GPAY' && $requestedMethod === 'UPI')) {
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'Payment method does not match the payment intent.'], 400);
    }
    if ($intent['status'] === 'CAPTURED') {
        if ($gatewayOrderId === '' || $gatewayOrderId !== $intent['gateway_order_id']) {
            jsonResponse(['success' => false, 'verified' => false, 'message' => 'Gateway order proof does not match the payment intent.'], 400);
        }
        jsonResponse([
            'success' => true,
            'verified' => true,
            'paymentIntentId' => $intent['id'],
            'paymentReference' => $intent['payment_reference'],
            'gatewayOrderId' => $intent['gateway_order_id'],
            'verifiedAt' => $intent['updated_at'],
            'message' => 'Payment was already captured and verified.'
        ]);
    }
    if ($gatewayOrderId === '' || $gatewayOrderId !== $intent['gateway_order_id']) {
        jsonResponse(['success' => false, 'verified' => false, 'message' => 'Gateway order proof does not match the payment intent.'], 400);
    }

    try {
        $verifiedGatewayPaymentId = $gatewayPaymentId;
        $provider = strtolower((string)$intent['provider']);
        if ($provider === 'razorpay' && $pm === 'GPAY') {
            if ($gatewayPaymentId === '' || $gatewaySignature === '') {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'Razorpay payment ID and signature are required.'], 400);
            }
            $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
            $sRow = $sStmt->fetch();
            $general = $sRow ? (json_decode($sRow['general_settings'] ?? '{}', true) ?: []) : [];
            $keyId = astro_setting_value($general, ['indiaGpayKeyId', 'razorpayKeyId'], ['RAZORPAY_KEY_ID']);
            $keySecret = astro_setting_value($general, ['indiaGpayKeySecret', 'razorpayKeySecret'], ['RAZORPAY_KEY_SECRET']);
            if ($keyId === '' || $keySecret === '') {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'Razorpay verification is not configured on the server.'], 503);
            }
            $expectedSignature = hash_hmac('sha256', $gatewayOrderId . '|' . $gatewayPaymentId, $keySecret);
            if (!hash_equals($expectedSignature, $gatewaySignature)) {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'Razorpay payment signature verification failed.'], 400);
            }
            $providerResponse = astro_http_json('https://api.razorpay.com/v1/payments/' . rawurlencode($gatewayPaymentId), 'GET', ['Accept: application/json'], null, $keyId, $keySecret);
            $payment = $providerResponse['body'] ?? [];
            $providerAmount = round(((float)($payment['amount'] ?? 0)) / 100, 2);
            if ($providerResponse['status'] < 200 || $providerResponse['status'] >= 300 || ($payment['order_id'] ?? '') !== $gatewayOrderId || ($payment['status'] ?? '') !== 'captured' || $providerAmount !== round((float)$intent['amount'], 2) || strtoupper((string)($payment['currency'] ?? '')) !== 'INR') {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'Razorpay payment is not captured for the expected amount and currency.'], 400);
            }
        } elseif ($provider === 'paypal' && $pm === 'PAYPAL') {
            $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
            $sRow = $sStmt->fetch();
            $general = $sRow ? (json_decode($sRow['general_settings'] ?? '{}', true) ?: []) : [];
            $clientId = astro_setting_value($general, ['paypalClientId'], ['PAYPAL_CLIENT_ID']);
            $clientSecret = astro_setting_value($general, ['paypalClientSecret', 'paypalSecret'], ['PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET']);
            if ($clientId === '' || $clientSecret === '') {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'PayPal verification is not configured on the server.'], 503);
            }
            $environment = strtolower((string)($general['paypalMode'] ?? 'sandbox')) === 'live' ? 'live' : 'sandbox';
            $base = $environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
            $tokenResponse = astro_http_json($base . '/v1/oauth2/token', 'POST', ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'], 'grant_type=client_credentials', $clientId, $clientSecret);
            $accessToken = (string)($tokenResponse['body']['access_token'] ?? '');
            if ($tokenResponse['status'] < 200 || $tokenResponse['status'] >= 300 || $accessToken === '') throw new Exception('PayPal authentication failed.');
            $detailsResponse = astro_http_json($base . '/v2/checkout/orders/' . rawurlencode($gatewayOrderId), 'GET', ['Accept: application/json', 'Authorization: Bearer ' . $accessToken]);
            $details = $detailsResponse['body'] ?? [];
            if (($details['status'] ?? '') === 'COMPLETED') {
                $captureResponse = $detailsResponse;
            } else {
                $captureResponse = astro_http_json($base . '/v2/checkout/orders/' . rawurlencode($gatewayOrderId) . '/capture', 'POST', ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $accessToken], new stdClass());
            }
            $captured = $captureResponse['body'] ?? [];
            $purchaseUnit = $captured['purchase_units'][0] ?? ($details['purchase_units'][0] ?? []);
            $capture = $purchaseUnit['payments']['captures'][0] ?? [];
            $providerAmount = (float)($capture['amount']['value'] ?? ($purchaseUnit['amount']['value'] ?? 0));
            $providerCurrency = strtoupper((string)($capture['amount']['currency_code'] ?? ($purchaseUnit['amount']['currency_code'] ?? '')));
            if ($captureResponse['status'] < 200 || $captureResponse['status'] >= 300 || ($captured['status'] ?? '') !== 'COMPLETED' || round($providerAmount, 2) !== round((float)$intent['amount'], 2) || $providerCurrency !== 'USD') {
                jsonResponse(['success' => false, 'verified' => false, 'message' => 'PayPal payment is not captured for the expected amount and currency.'], 400);
            }
            $verifiedGatewayPaymentId = (string)($capture['id'] ?? $gatewayPaymentId);
        } else {
            jsonResponse(['success' => false, 'verified' => false, 'message' => 'Unsupported online payment provider.'], 400);
        }

        $prefix = $pm === 'GPAY' ? 'GPAY' : 'PAYPAL';
        $cleanPayId = preg_replace('/[^a-zA-Z0-9_-]/', '', $verifiedGatewayPaymentId);
        if (strlen($cleanPayId) < 8) {
            jsonResponse(['success' => false, 'verified' => false, 'message' => 'Provider payment proof is malformed.'], 400);
        }
        $paymentReference = $prefix . '-ONL-' . $cleanPayId;
        $upd = $pdo->prepare("UPDATE payment_intents SET status = 'CAPTURED', gateway_payment_id = ?, gateway_signature = ?, payment_reference = ?, payer_account = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND status = 'CREATED'");
        $upd->execute([$verifiedGatewayPaymentId, $gatewaySignature !== '' ? $gatewaySignature : null, $paymentReference, $payerAccount !== '' ? substr($payerAccount, 0, 191) : null, $intentId, $user['id']]);
        if ($upd->rowCount() !== 1) {
            jsonResponse(['success' => false, 'verified' => false, 'message' => 'Payment intent changed while verification was in progress. Retry with a new session.'], 409);
        }
        jsonResponse([
            'success' => true,
            'verified' => true,
            'paymentIntentId' => $intentId,
            'paymentMethod' => $pm,
            'gatewayOrderId' => $gatewayOrderId,
            'paymentReference' => $paymentReference,
            'payerAccount' => $payerAccount !== '' ? $payerAccount : null,
            'verifiedAt' => date('c'),
            'message' => 'Online payment captured and verified by the provider.'
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'verified' => false, 'message' => $e->getMessage() ?: 'Online payment verification failed.'], 502);
    }
}

// 5a. POST /api/services/orders/:id/cancel (User or Admin cancels order)
//
// REFUND POLICY GUARD: a PAID order is not cancelled here, because cancelling
// would leave the customer's 90% pre-approval refund unrecorded. The customer
// is told to write to admin@astrosivam.com so the administrator can approve the
// refund with one click. Unpaid (free beta / unverified) orders cancel freely.
if ((preg_match('#/services/orders/([^/]+)/cancel/?$#', $path, $matches) || $action === 'cancel-order') && $method === 'POST') {
    $body = getJsonBody();
    $orderId = !empty($matches[1]) ? $matches[1] : ($body['orderId'] ?? $_GET['id'] ?? '');
    $user = requireAuth($pdo);
    // The reason is persisted to admin_notes + refund_reason and echoed into
    // the audit trail: cap it so a hostile client cannot stuff kilobytes of
    // text into those columns and the admin list rendering.
    $reason = trim((string)($body['reason'] ?? 'Cancelled by user'));
    $reason = function_exists('mb_substr') ? mb_substr($reason, 0, 500, 'UTF-8') : substr($reason, 0, 500);
    if ($reason === '') {
        $reason = 'Cancelled by user';
    }

    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        jsonResponse(['success' => false, 'message' => 'Order not found'], 404);
    }

    if ($order['user_id'] !== $user['id'] && ($user['role'] ?? '') !== 'admin') {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }

    require_once __DIR__ . '/../refunds.php';

    // STATUS GUARD: only a still-queued order can be cancelled. Without this,
    // an unpaid or free order could be cancelled AFTER the admin approved and
    // emailed it — the customer would keep the delivered PDFs while the order
    // disappears from the fulfilment list as CANCELLED.
    $cancelStatus = strtoupper(trim((string)($order['status'] ?? '')));
    if ($cancelStatus === 'CANCELLED') {
        jsonResponse([
            'success' => true,
            'message' => "Order #{$order['order_number']} is already cancelled.",
            'order' => array_merge($order, ['status' => 'CANCELLED'])
        ]);
    }
    $cancellableStatuses = ['PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION'];
    if (!in_array($cancelStatus, $cancellableStatuses, true)) {
        if (astro_refund_status_is_delivered($cancelStatus)) {
            jsonResponse([
                'success' => false,
                'code' => 'ORDER_ALREADY_DELIVERED',
                'message' => "Order #{$order['order_number']} has already been approved and delivered, so it can no longer be cancelled. If something is wrong with the report, please email admin@astrosivam.com."
            ], 409);
        }
        jsonResponse([
            'success' => false,
            'code' => 'ORDER_NOT_CANCELLABLE',
            'message' => "Order #{$order['order_number']} cannot be cancelled in its current state ({$cancelStatus})."
        ], 409);
    }

    if ((float) ($order['amount'] ?? 0) > 0
        && (int) ($order['payment_confirmed'] ?? 0) === 1
        && !astro_refund_is_already_refunded($order)) {
        jsonResponse([
            'success' => false,
            'code' => 'PAID_ORDER_REQUIRES_REFUND',
            'message' => 'Order #' . $order['order_number'] . ' has been paid, so it cannot be cancelled here. Email admin@astrosivam.com with this order number to cancel before approval: a paid order cancelled before approval is refunded at 90% of the amount paid, and the refund is settled within 3 working days.'
        ], 409);
    }

    // ATOMIC UPDATE: the status predicate makes this single statement the
    // guard, so an admin approval committing between the SELECT above and this
    // UPDATE wins the race instead of being silently overwritten to CANCELLED.
    $upd = $pdo->prepare("UPDATE orders SET status = 'CANCELLED', admin_notes = ?, refund_reason = ?, updated_at = NOW() WHERE id = ? AND status IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION')");
    $upd->execute(["Cancelled: {$reason}", $reason, $orderId]);

    if ($upd->rowCount() !== 1) {
        // Lost the race (or a double submit): re-read the truth and answer it.
        $refetchStmt = $pdo->prepare("SELECT status FROM orders WHERE id = ? LIMIT 1");
        $refetchStmt->execute([$orderId]);
        $nowStatus = strtoupper(trim((string)($refetchStmt->fetchColumn() ?: $cancelStatus)));
        if ($nowStatus === 'CANCELLED') {
            jsonResponse([
                'success' => true,
                'message' => "Order #{$order['order_number']} is already cancelled.",
                'order' => array_merge($order, ['status' => 'CANCELLED'])
            ]);
        }
        jsonResponse([
            'success' => false,
            'code' => 'ORDER_STATUS_CHANGED',
            'message' => "Order #{$order['order_number']} changed while the cancellation was processed (now {$nowStatus}). Please refresh and try again."
        ], 409);
    }

    logAudit($pdo, $user['id'], $user['name'], $user['role'] ?? 'user', 'ORDER_CANCELLED', "Order #{$order['order_number']} cancelled: {$reason}");

    jsonResponse([
        'success' => true,
        'message' => "Order #{$order['order_number']} has been cancelled.",
        'order' => array_merge($order, ['status' => 'CANCELLED', 'admin_notes' => "Cancelled: {$reason}"])
    ]);
}

// 5b-1. POST /api/services/order | /multi-order with a `people` array.
//
// MULTI-PERSON CHECKOUT: one order = up to 6 people, each person with one or
// more services, one server-computed total. This is the write path behind the
// person-card checkout; it writes ONE `orders` header row plus `order_persons`
// and `order_items` in a single transaction. The legacy `items[]` shape below
// (one orders row per chart, grouped by group_id) is untouched for old clients
// and for carts saved before this change.
if ($method === 'POST' && (
    (preg_match('#/services/(order|orders|multi-order|multiOrder)/?$#', $path)
        || in_array($action, ['order', 'orders', 'place-order', 'multi-order', 'multiOrder', 'multi-person-order'], true))
    && isset($jsonBody['people']) && is_array($jsonBody['people']) && count($jsonBody['people']) > 0
)) {
    require_once __DIR__ . '/multi_person_order.php';
    $orderUser = requireAuth($pdo);
    astro_create_multi_person_order($pdo, $orderUser, !empty($jsonBody) ? $jsonBody : getJsonBody());
}

// 5c. POST /api/services/multi-order or services.php?action=multi-order (Unified batch family checkout)
if ($method === 'POST' && (
    preg_match('#/services/(multi-order|multiOrder)/?$#', $path) ||
    $action === 'multi-order' ||
    $action === 'multiOrder' ||
    // Legacy fallback: very old clients POST the tray to the bare endpoint
    // with no path or action. Scoped to exactly that shape so a future route
    // that merely carries an `items` array can never land here by accident.
    ((isset($jsonBody['items']) && is_array($jsonBody['items']) && count($jsonBody['items']) > 0)
        && $action === '' && preg_match('#/services(\.php)?/?$#', $path))
)) {
    $user = requireAuth($pdo);
    $isAdmin = strtolower((string)($user['role'] ?? 'customer')) === 'admin';
    $body = !empty($jsonBody) ? $jsonBody : getJsonBody();

    $items = $body['items'] ?? [];
    if (!is_array($items) || empty($items)) {
        jsonResponse(['success' => false, 'message' => 'At least one service chart item is required in the family tray.'], 400);
    }
    if (count($items) > 6) {
        jsonResponse(['success' => false, 'message' => 'A family order can contain at most 6 reports.'], 400);
    }
    $supportedFamilyServices = ['BIRTH_JATHAGAM', 'MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'];
    foreach ($items as $index => $item) {
        if (!is_array($item) || !in_array($item['serviceType'] ?? '', $supportedFamilyServices, true)
            || !is_array($item['inputPayload'] ?? null)) {
            jsonResponse(['success' => false, 'message' => 'Family item #' . ($index + 1) . ' has invalid or missing service details.'], 400);
        }
        $itemService = $item['serviceType'] ?? '';
        $itemPayload = $item['inputPayload'] ?? null;
        if (($itemService === 'BIRTH_JATHAGAM' || $itemService === 'BABY_NAMING')
            && !AstroEngine::hasValidBirthDetails($itemPayload)) {
            jsonResponse([
                'success' => false,
                'message' => 'Family item #' . ($index + 1) . ' needs a valid past birth date, birth time, birth place, coordinates and time zone.'
            ], 400);
        }
        if ($itemService === 'MARRIAGE_COMPATIBILITY' && !astro_is_valid_marriage_payload($itemPayload)) {
            jsonResponse([
                'success' => false,
                'message' => 'Family item #' . ($index + 1) . ' needs valid birth particulars for both bride and groom.'
            ], 400);
        }
        if ($itemService === 'MUHURTHAM' && !astro_is_valid_muhurtham_payload($itemPayload)) {
            jsonResponse([
                'success' => false,
                'message' => 'Family item #' . ($index + 1) . ' needs a valid birth profile and separate Muhurtham location, each with valid coordinates and time zone.'
            ], 400);
        }
    }

    $country = $body['country'] ?? ($user['country'] ?? '');
    $paymentMethod = strtoupper(trim((string)($isAdmin ? 'NONE' : ($body['paymentMethod'] ?? 'PAYPAL'))));
    if (!in_array($paymentMethod, ['NONE', 'MPAISA', 'MYCASH', 'GPAY', 'UPI', 'PAYPAL', 'CARD'], true)) {
        jsonResponse(['success' => false, 'message' => 'Unsupported payment method.'], 400);
    }
    // Admin reports are always no-charge. Discard saved/stale payment data
    // so no receipt or paid intent can be attached to an admin order.
    $paymentReference = !$isAdmin && is_string($body['paymentReference'] ?? null) ? trim($body['paymentReference']) : '';
    $paymentIntentId = !$isAdmin && is_string($body['paymentIntentId'] ?? null) ? trim($body['paymentIntentId']) : '';

    // Check system settings for mode & pricing
    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $isFreeBeta = $sRow ? ((bool)$sRow['free_beta_active'] || $sRow['service_mode'] === 'FREE_BETA') : false;
    $serviceMode = $isFreeBeta ? 'FREE_BETA' : 'PAID';

    // CURRENCY RULE: the payment method the customer picked at checkout decides
    // the currency of the WHOLE family order. Birth places across countries
    // never change it. The billing country of the account is only a fallback for
    // FREE_BETA orders where no payment method exists.
    $billingCountry = $body['billingCountry'] ?? ($user['country'] ?? $country);
    $requestedCurrency = $body['currency'] ?? null;
    $currency = astro_currency_for_payment($paymentMethod, $billingCountry, $requestedCurrency);
    if (!$isAdmin && is_string($requestedCurrency) && trim($requestedCurrency) !== '' && strtoupper(trim($requestedCurrency)) !== $currency) {
        jsonResponse(['success' => false, 'message' => 'Payment currency does not match the selected payment method.'], 400);
    }

    $clientIp = getClientIpAddress();

    // 1. IP BLACKLIST CHECK
    try {
        $bannedCheck = $pdo->prepare("SELECT * FROM banned_ips WHERE ip_address = ? LIMIT 1");
        $bannedCheck->execute([$clientIp]);
        $bannedRow = $bannedCheck->fetch();
        if ($bannedRow && !$isAdmin) {
            jsonResponse([
                'success' => false,
                'message' => 'ACCESS RESTRICTED: Your IP address (' . htmlspecialchars($clientIp) . ') has been blocked due to policy violations (repeated fake orders / spam). Reason: ' . ($bannedRow['reason'] ?? 'Fraud prevention') . '. Please contact admin@astrosivam.com if you believe this is an error.'
            ], 403);
        }
    } catch (Exception $e) {}

    // 2. UNVERIFIED CHECKOUT LIMIT: max 3 open manual/unverified checkout groups per IP.
    // A family bundle counts once; captured/no-charge orders do not block paid reorders.
    $pendingCount = astro_count_pending_order_groups_by_ip($pdo, $clientIp);
    if (!$isAdmin && $pendingCount >= 3) {
        jsonResponse([
            'success' => false,
            'message' => 'PENDING ORDERS LIMIT: You currently have ' . $pendingCount . ' unpaid checkout groups awaiting payment verification. Please wait for them to be verified or contact admin before creating additional orders.',
            'pendingCount' => $pendingCount
        ], 429);
    }

    // 3. PAYMENT & FREE BETA HANDLING
    // FREE BETA RULE — exactly ONE free report per IP address:
    //   * This IP still has its free chart  -> the FIRST chart of the family
    //     order is FREE, every additional family member pays the normal price.
    //   * The free chart was already used   -> the whole bundle is a paid order.
    // There is no rejection: later orders from the same IP simply become paid
    // orders (single or family), exactly like the single-order endpoint.
    astro_ensure_beta_ip_claims_table($pdo);
    $ipCheckStmt = $pdo->prepare("SELECT COUNT(*) FROM beta_ip_claims WHERE ip_address = ?");
    $ipCheckStmt->execute([$clientIp]);
    $ipOrderCount = (int)($ipCheckStmt->fetchColumn() ?: 0);

    $isFreeBetaMode = ($isFreeBeta || $serviceMode === 'FREE_BETA');
    // Admin-created family orders are always free. Customers retain the
    // existing one-free-chart-per-IP rule unchanged.
    $freeChartAvailable = $isFreeBetaMode && $ipOrderCount < 1;
    if ($isAdmin) {
        $freeChartAvailable = false;
    }
    $paidChartCount = max(0, count($items) - ($freeChartAvailable ? 1 : 0));
    $chargeableChartCount = $isAdmin ? 0 : $paidChartCount;
    $requiresGroupPayment = $paidChartCount > 0;
    if ($isAdmin) {
        $requiresGroupPayment = false;
    }

    $pricing = $sRow ? json_decode($sRow['pricing'] ?? '{}', true) : [];
    $priceMap = [
        'BIRTH_JATHAGAM' => ($currency === 'INR' ? (int)round(18 * USD_TO_INR_RATE) : 18),
        'MARRIAGE_COMPATIBILITY' => ($currency === 'INR' ? (int)round(22 * USD_TO_INR_RATE) : 22),
        'BABY_NAMING' => ($currency === 'INR' ? (int)round(15 * USD_TO_INR_RATE) : 15),
        'MUHURTHAM' => ($currency === 'INR' ? (int)round(20 * USD_TO_INR_RATE) : 20)
    ];
    $currKey = strtolower($currency);
    $expectedAmount = 0.0;
    foreach ($items as $idx => $item) {
        $itemService = $item['serviceType'] ?? 'BIRTH_JATHAGAM';
        $itemFree = $isAdmin || ($freeChartAvailable && $idx === 0);
        $expectedAmount += $itemFree ? 0 : (float)($pricing[$itemService][$currKey] ?? $priceMap[$itemService] ?? 35);
    }
    // ----------------------------------------------------------------
    // ONLINE-ONLY PAYMENT ENFORCEMENT
    // Manual / offline transfers are NOT accepted. A paid order is only
    // created when a CAPTURED online payment intent is attached.
    // ----------------------------------------------------------------
    $capturedIntent = null;
    $paymentStatus = $chargeableChartCount === 0 ? 'NOT_REQUIRED' : 'PENDING';
    if (!$requiresGroupPayment && $paymentIntentId !== '') {
        jsonResponse(['success' => false, 'message' => 'A no-charge family order cannot be bound to a paid payment intent.'], 400);
    }
    if ($requiresGroupPayment) {
        // Require a payment intent ID (no manual references allowed).
        if ($paymentIntentId === '') {
            jsonResponse(['success' => false, 'message' => 'ONLINE PAYMENT REQUIRED: Please complete payment via the online checkout (PayPal/Card or Google Pay/UPI) before placing your order. Manual bank transfers are not accepted.'], 400);
        }
        $intentStmt = $pdo->prepare("SELECT * FROM payment_intents WHERE id = ? AND user_id = ? LIMIT 1");
        $intentStmt->execute([$paymentIntentId, $user['id']]);
        $capturedIntent = $intentStmt->fetch();
        if (!$capturedIntent) {
            jsonResponse(['success' => false, 'message' => 'Payment session not found. Please restart checkout.'], 400);
        }
        if (strtoupper((string)$capturedIntent['status']) === 'CONSUMED') {
            // Already paid and already ordered: show that family, do not build a
            // second one.
            astro_replay_consumed_intent($pdo, $capturedIntent, 'multi-order', [
                'currency' => $currency,
                'totalAmount' => round($expectedAmount, 2),
                'paymentMethod' => $paymentMethod
            ]);
        }
        if ($capturedIntent['status'] !== 'CAPTURED') {
            // Mark failed/expired intents so they won't appear in admin.
            if (in_array(strtoupper((string)$capturedIntent['status']), ['FAILED','EXPIRED','REJECTED'], true)) {
                // already failed
            }
            jsonResponse(['success' => false, 'message' => 'Payment has not been completed yet. Please complete the online payment before placing your order.'], 400);
        }
        $intentMethod = strtoupper((string)($capturedIntent['payment_method'] ?? ''));
        $methodMatches = $intentMethod === $paymentMethod || ($intentMethod === 'GPAY' && $paymentMethod === 'UPI')
                        || ($intentMethod === 'PAYPAL' && $paymentMethod === 'CARD');
        if (!$methodMatches || round((float)$capturedIntent['amount'], 2) !== round($expectedAmount, 2) || strtoupper((string)$capturedIntent['currency']) !== strtoupper((string)$currency)) {
            jsonResponse(['success' => false, 'message' => 'The captured payment does not match this order method, amount, or currency.'], 400);
        }
        $paymentReference = (string)$capturedIntent['payment_reference'];
        $paymentStatus = 'CAPTURED';
    }

    // IDEMPOTENT INTENT BINDING (family checkout): claim the captured intent
    // before any order row is inserted, so a repeated submission replays the
    // first answer instead of creating a second family of orders.
    $bindKey = '';
    if ($capturedIntent) {
        $bind = astro_claim_intent_binding($pdo, $capturedIntent, $user['id'], 'multi-order');
        $bindKey = $bind['key'];
        if ($bind['state'] === 'DUPLICATE') {
            $existing = astro_orders_for_replay($pdo, $bind['record']);
            $existingGroup = (string)(($bind['record'] ?? [])['order_id'] ?? '');
            if ($existingGroup === '' && !empty($existing)) $existingGroup = (string)($existing[0]['group_id'] ?? '');
            astro_payment_log_structured('order_bind_replayed', [
                'scope' => 'multi-order',
                'intentId' => (string)$capturedIntent['id'],
                'groupId' => $existingGroup
            ]);
            jsonResponse([
                'success' => true,
                'duplicate' => true,
                'message' => $existingGroup !== ''
                    ? 'This payment was already applied to family order ' . $existingGroup . '. The existing order was returned instead of creating a duplicate.'
                    : 'This payment was already applied to a family order. The existing order was returned instead of creating a duplicate.',
                'orders' => array_map('astro_order_to_client_array', $existing),
                'groupId' => $existingGroup !== '' ? $existingGroup : null,
                'currency' => $currency,
                'totalAmount' => round($expectedAmount, 2),
                'freeCharts' => $isAdmin ? count($items) : ($freeChartAvailable ? 1 : 0),
                'paidCharts' => $chargeableChartCount,
                'paymentMethod' => $paymentMethod,
                'duplicateReason' => 'intent_already_bound'
            ], 200);
        }
        if ($bind['state'] === 'IN_PROGRESS') {
            jsonResponse([
                'success' => false,
                'duplicate' => true,
                'message' => 'This payment is already being applied to a family order. Please wait a moment and refresh your orders instead of paying or submitting again.',
                'duplicateReason' => 'intent_binding_in_progress'
            ], 409);
        }
    }

    // FAKE & DUPLICATE PAYMENT REFERENCE VALIDATION (paid charts only — under
    // FREE_BETA only the FIRST chart of the bundle is free, the rest of the
    // family pays for their reports).
    if ($requiresGroupPayment) {
        $cleanRef = $paymentReference;
        if (empty($paymentMethod) || strtoupper($paymentMethod) === 'NONE') {
            jsonResponse([
                'success' => false,
                'message' => 'PAYMENT REQUIRED: ' . $paidChartCount . ' of ' . count($items) . ' charts in this family order are chargeable (only the first report is free during the Free Beta). Please select a payment method to place the order.'
            ], 400);
        }

        if (empty($cleanRef)) {
            jsonResponse([
                'success' => false,
                'message' => 'Payment reference number / transaction ID is required to place a paid order.'
            ], 400);
        }

        $lowerRef = strtolower($cleanRef);
        $isRepeated = preg_match('/^(.)\1+$/', $cleanRef);
        $isBogus = in_array($lowerRef, [
            '123456', '12345678', '1234567890', '000000', '111111', '999999',
            'test', 'tester', 'fake', 'none', 'nil', 'asdf', 'sample', 'payment',
            'reference', 'upi', 'gpay', 'mpaisa', 'mycash', '000000000000', '111111111111'
        ]);

        if (strlen($cleanRef) < 6 || $isRepeated || $isBogus) {
            jsonResponse([
                'success' => false,
                'message' => 'INVALID TRANSACTION ID: Please enter a genuine, unique bank/UPI/PayPal transaction reference number. Random or placeholder numbers are strictly prohibited.'
            ], 400);
        }

        $dupCheck = $pdo->prepare("SELECT id, order_number FROM orders WHERE payment_reference = ? AND status NOT IN ('CANCELLED', 'REJECTED') LIMIT 1");
        $dupCheck->execute([$cleanRef]);
        $dupOrder = $dupCheck->fetch();
        if ($dupOrder) {
            jsonResponse([
                'success' => false,
                'message' => 'DUPLICATE TRANSACTION ID: The payment reference "' . htmlspecialchars($cleanRef) . '" has already been used for order #' . $dupOrder['order_number'] . '. Each payment receipt must be unique.'
            ], 400);
        }
    }

    // The family-bundle and payment columns must already exist (migration 013);
    // web requests never ALTER TABLE, so verify instead of self-migrating.
    astro_ensure_order_limit_columns($pdo);

    $groupId = 'GRP-' . date('Y') . '-' . strtoupper(astro_random_hex(5));
    $createdOrders = [];

    // Reserve the Free Beta slot inside the same transaction as order creation.
    // The unique IP key serializes concurrent requests; a loser must retry as a
    // paid order instead of creating a second free chart.
    $betaClaimTransactionStarted = false;
    if (!$isAdmin && $freeChartAvailable) {
        try {
            $pdo->beginTransaction();
            $betaClaim = $pdo->prepare("INSERT IGNORE INTO beta_ip_claims (ip_address, claimed_at) VALUES (?, NOW())");
            $betaClaim->execute([$clientIp]);
            if ($betaClaim->rowCount() !== 1) {
                $pdo->rollBack();
                if ($bindKey !== '') {
                    astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Free Beta claim lost; the order was not created.', null, (string)$capturedIntent['id']);
                }
                jsonResponse(['success' => false, 'message' => 'The Free Beta report was claimed by another request. Refresh checkout and submit again.'], 409);
            }
            $betaClaimTransactionStarted = true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('ASTRO SIVAM: could not reserve Free Beta claim.');
            if ($bindKey !== '') {
                astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Free Beta claim could not be reserved; the order was not created.', null, (string)$capturedIntent['id']);
            }
            jsonResponse(['success' => false, 'message' => 'Free Beta availability could not be confirmed. Please retry shortly.'], 503);
        }
    }

    $pricing = $sRow ? json_decode($sRow['pricing'] ?? '{}', true) : [];
    $priceMap = [
        'BIRTH_JATHAGAM' => ($currency === 'INR' ? (int)round(18 * USD_TO_INR_RATE) : 18),
        'MARRIAGE_COMPATIBILITY' => ($currency === 'INR' ? (int)round(22 * USD_TO_INR_RATE) : 22),
        'BABY_NAMING' => ($currency === 'INR' ? (int)round(15 * USD_TO_INR_RATE) : 15),
        'MUHURTHAM' => ($currency === 'INR' ? (int)round(20 * USD_TO_INR_RATE) : 20)
    ];
    $currKey = strtolower($currency);
    $groupTotal = 0;

    foreach ($items as $idx => $it) {
        $st = $it['serviceType'] ?? 'BIRTH_JATHAGAM';
        $lang = astro_normalize_report_language($it['language'] ?? 'en');
        $itemCountry = is_string($it['country'] ?? null) ? trim($it['country']) : '';
        $inputPayload = $it['inputPayload'] ?? [];

        // Customer-only baseline: $isThisItemFree = $freeChartAvailable && $idx === 0;
        // Admins override every family line to free.
        $isThisItemFree = $isAdmin || ($freeChartAvailable && $idx === 0);
        $itemAmount = $isThisItemFree ? 0 : ($pricing[$st][$currKey] ?? $priceMap[$st] ?? 35);
        $itemServiceMode = $isThisItemFree ? 'FREE_BETA' : 'PAID';
        // Every chart of the family is priced in the SAME currency, so these add up.
        $groupTotal += (float)$itemAmount;

        $orderId = astro_random_id('ord_', 16) . '_' . ($idx + 1);
        $orderNumber = 'ORD-' . strtoupper(astro_random_hex(6));

        // Pre-calculate Vedic astrological result
        $calculatedResult = null;
        if ($st === 'MARRIAGE_COMPATIBILITY') {
            $calculatedResult = AstroEngine::calculateMatchmaking($inputPayload);
        } elseif ($st === 'BABY_NAMING') {
            $calculatedResult = AstroEngine::calculateBabyNaming($inputPayload);
        } elseif ($st === 'MUHURTHAM') {
            $calculatedResult = AstroEngine::calculateMuhurtham($inputPayload);
        } else {
            $calculatedResult = AstroEngine::calculateHoroscope($inputPayload);
        }

        $inputPayloadWithGroup = array_merge($inputPayload, ['groupId' => $groupId]);

        // Attempt insert with group_id, fallback if column missing
        try {
            $ins = $pdo->prepare("INSERT INTO orders (id, order_number, group_id, user_id, user_name, user_email, user_mobile, country, service_type, language, amount, currency, service_mode, status, payment_method, payment_reference, payment_intent_id, payment_status, payment_confirmed, email_status, input_payload, calculated_result, has_pdf, has_invoice, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'PENDING', ?, ?, 1, 1, ?, NOW(), NOW())");
            $ins->execute([
                $orderId,
                $orderNumber,
                $groupId,
                $user['id'],
                $user['name'],
                $user['email'],
                $user['mobile'],
                $itemCountry,
                $st,
                $lang,
                $itemAmount,
                $currency,
                $itemServiceMode,
                $paymentMethod,
                $paymentReference !== '' ? $paymentReference : null,
                $capturedIntent['id'] ?? null,
                $paymentStatus,
                ($capturedIntent || $paymentStatus === 'NOT_REQUIRED') ? 1 : 0,
                json_encode($inputPayloadWithGroup, JSON_UNESCAPED_UNICODE),
                json_encode($calculatedResult, JSON_UNESCAPED_UNICODE),
                $clientIp
            ]);
        } catch (Exception $exIns) {
            $ins = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, user_mobile, country, service_type, language, amount, currency, service_mode, status, payment_method, payment_reference, payment_intent_id, payment_status, payment_confirmed, email_status, input_payload, calculated_result, has_pdf, has_invoice, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'PENDING', ?, ?, 1, 1, ?, NOW(), NOW())");
            $ins->execute([
                $orderId,
                $orderNumber,
                $user['id'],
                $user['name'],
                $user['email'],
                $user['mobile'],
                $itemCountry,
                $st,
                $lang,
                $itemAmount,
                $currency,
                $itemServiceMode,
                $paymentMethod,
                $paymentReference !== '' ? $paymentReference : null,
                $capturedIntent['id'] ?? null,
                $paymentStatus,
                ($capturedIntent || $paymentStatus === 'NOT_REQUIRED') ? 1 : 0,
                json_encode($inputPayloadWithGroup, JSON_UNESCAPED_UNICODE),
                json_encode($calculatedResult, JSON_UNESCAPED_UNICODE),
                $clientIp
            ]);
        }

        // Keep the family bundle ordered (chart 1, 2, 3...) for the admin panel
        try {
            $ordUpd = $pdo->prepare("UPDATE orders SET group_order_index = ? WHERE id = ?");
            $ordUpd->execute([$idx + 1, $orderId]);
        } catch (Exception $e) {}

        // Record in beta_ip_orders table — ONE row for the ONE free chart of
        // this IP (the first chart of the bundle). Paid charts never consume
        // the free beta slot.
        if ($isThisItemFree) {
            if (!$isAdmin) {
                try {
                    $insBeta = $pdo->prepare("INSERT INTO beta_ip_orders (ip_address, order_id, order_number, user_id, user_email, service_type, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
                    $insBeta->execute([
                        $clientIp,
                        $orderId,
                        $orderNumber,
                        $user['id'],
                        $user['email'],
                        $st
                    ]);
                } catch (Exception $e) {}
            }
        }

        $createdOrders[] = [
            'id' => $orderId,
            'orderNumber' => $orderNumber,
            'groupId' => $groupId,
            'groupOrderIndex' => $idx + 1,
            'userId' => $user['id'],
            'userName' => $user['name'],
            'userEmail' => $user['email'],
            'userMobile' => $user['mobile'],
            'country' => $itemCountry,
            'serviceType' => $st,
            'language' => $lang,
            'amount' => $itemAmount,
            'currency' => $currency,
            'serviceMode' => $itemServiceMode,
            'status' => 'PENDING',
            'paymentMethod' => $paymentMethod,
            'paymentReference' => $paymentReference !== '' ? $paymentReference : null,
            'paymentIntentId' => $capturedIntent['id'] ?? null,
            'paymentStatus' => $paymentStatus,
            'paymentConfirmed' => (bool)$capturedIntent,
            'emailStatus' => 'PENDING',
            'hasPdf' => false,
            'hasInvoice' => false,
            'inputPayload' => $inputPayloadWithGroup,
            'createdAt' => date('Y-m-d H:i:s')
        ];
    }

    if ($capturedIntent && !empty($createdOrders)) {
        $consume = $pdo->prepare("UPDATE payment_intents SET status = 'CONSUMED', order_id = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND status = 'CAPTURED' AND amount = ? AND currency = ? AND order_id IS NULL");
        $consume->execute([$createdOrders[0]['id'], $capturedIntent['id'], $user['id'], $expectedAmount, $currency]);
        if ($consume->rowCount() !== 1) {
            foreach ($createdOrders as $created) {
                $pdo->prepare("UPDATE orders SET status = 'REJECTED', admin_notes = ?, updated_at = NOW() WHERE id = ?")->execute(['Payment intent could not be consumed safely.', $created['id']]);
            }
            if ($bindKey !== '') {
                astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Payment intent could not be consumed safely.', null, (string)$capturedIntent['id']);
            }
            jsonResponse(['success' => false, 'message' => 'Payment could not be bound to this family order. No report will be delivered.'], 409);
        }
        if ($bindKey !== '') {
            astro_payment_finish_idempotency($pdo, $bindKey, 'PROCESSED', 'Family order ' . $groupId . ' bound to intent ' . $capturedIntent['id'] . '.', $groupId, (string)$capturedIntent['id']);
        }
    }

    if ($betaClaimTransactionStarted && $pdo->inTransaction()) {
        $pdo->commit();
    }

    logAudit($pdo, $user['id'], $user['name'], $user['role'], 'MULTI_ORDER_PLACED', "Unified family order {$groupId} placed with " . count($createdOrders) . " charts (" . ($isAdmin ? "all free — admin" : ($freeChartAvailable ? "1 free beta chart + " . $paidChartCount . " paid" : "all paid")) . "), charged " . number_format($groupTotal, 2) . " {$currency} via {$paymentMethod}, from IP: {$clientIp}");

    // Best-effort WhatsApp/Viber order-confirmation alert for the family bundle.
    if (!empty($createdOrders)) {
        AstroChatAlerts::sendOrderAlerts($pdo, 'order_confirmed', $createdOrders);
    }

    if ($isAdmin) {
        $message = "Admin family order (" . count($createdOrders) . " charts) placed successfully at no charge. Awaiting Admin verification.";
    } elseif ($groupTotal <= 0) {
        $message = "Order placed successfully in FREE BETA! Your first report is free (1 free report per customer during the Free Beta). Awaiting Admin verification.";
    } elseif ($freeChartAvailable) {
        $message = "Family bundle (" . count($createdOrders) . " charts) submitted! Chart 1 is FREE (Free Beta — 1 free report per customer); the remaining " . $paidChartCount . " charts total " . number_format($groupTotal, 2) . " " . $currency . ". Payment will be verified by Admin.";
    } else {
        $message = "Family bundle (" . count($createdOrders) . " charts) submitted! The free beta report for this connection has already been used, so all charts are charged " . number_format($groupTotal, 2) . " " . $currency . ". Payment will be verified by Admin.";
    }

    jsonResponse([
        'success' => true,
        'message' => $message,
        'orders' => $createdOrders,
        'groupId' => $groupId,
        // Authoritative money: one currency for the whole family bundle.
        'currency' => $currency,
        // FREE_BETA: only the FIRST chart is free — the rest of the family pays.
        'totalAmount' => round($groupTotal, 2),
        'freeCharts' => $isAdmin ? count($items) : ($freeChartAvailable ? 1 : 0),
        'paidCharts' => $chargeableChartCount,
        'paymentMethod' => $paymentMethod
    ], 201);
}

// 5b. POST /api/services/order or /api/services/orders
if ($method === 'POST' && (
    preg_match('#/services/orders?/?$#', $path) ||
    $action === 'order' ||
    $action === 'orders' ||
    $action === 'place-order' ||
    // Legacy fallback, scoped like the multi-order one above: only the bare
    // endpoint with no action may be routed by body shape alone.
    ((isset($jsonBody['serviceType']) && isset($jsonBody['inputPayload']))
        && $action === '' && preg_match('#/services(\.php)?/?$#', $path))
)) {
    $user = requireAuth($pdo);
    $isAdmin = strtolower((string)($user['role'] ?? 'customer')) === 'admin';
    $body = !empty($jsonBody) ? $jsonBody : getJsonBody();

    $serviceType = $body['serviceType'] ?? 'BIRTH_JATHAGAM';
    if (!in_array($serviceType, ['BIRTH_JATHAGAM', 'MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'], true)) {
        jsonResponse(['success' => false, 'message' => 'Unsupported astrology service type.'], 400);
    }
    $language = astro_normalize_report_language($body['language'] ?? 'en');
    $country = $body['country'] ?? ($user['country'] ?? '');
    $paymentMethod = strtoupper(trim((string)($isAdmin ? 'NONE' : ($body['paymentMethod'] ?? 'PAYPAL'))));
    if (!in_array($paymentMethod, ['NONE', 'MPAISA', 'MYCASH', 'GPAY', 'UPI', 'PAYPAL', 'CARD'], true)) {
        jsonResponse(['success' => false, 'message' => 'Unsupported payment method.'], 400);
    }
    // Admin reports are always no-charge. Discard saved/stale payment data
    // so no receipt or paid intent can be attached to an admin order.
    $paymentReference = !$isAdmin && is_string($body['paymentReference'] ?? null) ? trim($body['paymentReference']) : '';
    $paymentIntentId = !$isAdmin && is_string($body['paymentIntentId'] ?? null) ? trim($body['paymentIntentId']) : '';
    $inputPayload = $body['inputPayload'] ?? [];
    $saveAsProfile = !empty($body['saveAsProfile']);
    if (($serviceType === 'BIRTH_JATHAGAM' || $serviceType === 'BABY_NAMING')
        && !AstroEngine::hasValidBirthDetails($inputPayload)) {
        jsonResponse([
            'success' => false,
            'message' => 'A valid past birth date, 24-hour birth time, birth place, coordinates and time zone are required. Please verify the birth details before ordering.'
        ], 400);
    }
    if ($serviceType === 'MARRIAGE_COMPATIBILITY' && !astro_is_valid_marriage_payload($inputPayload)) {
        jsonResponse([
            'success' => false,
            'message' => 'Both bride and groom need valid past birth dates, birth times, birth places, coordinates and time zones. Please verify both sets of details before ordering.'
        ], 400);
    }
    if ($serviceType === 'MUHURTHAM' && !astro_is_valid_muhurtham_payload($inputPayload)) {
        jsonResponse([
            'success' => false,
            'message' => 'The Muhurtham report needs a valid birth date, birth time and birth place, plus a separate Muhurtham location, each with valid coordinates and time zone.'
        ], 400);
    }

    // Check system settings for mode & pricing
    $sStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    $sRow = $sStmt->fetch();
    $isFreeBeta = $sRow ? ((bool)$sRow['free_beta_active'] || $sRow['service_mode'] === 'FREE_BETA') : false;
    $serviceMode = $isFreeBeta ? 'FREE_BETA' : 'PAID';
    
    // CURRENCY RULE: the payment method the customer picked at checkout decides
    // the currency of the WHOLE family order. Birth places across countries
    // never change it. The billing country of the account is only a fallback for
    // FREE_BETA orders where no payment method exists.
    $billingCountry = $body['billingCountry'] ?? ($user['country'] ?? $country);
    $requestedCurrency = $body['currency'] ?? null;
    $currency = astro_currency_for_payment($paymentMethod, $billingCountry, $requestedCurrency);
    if (!$isAdmin && is_string($requestedCurrency) && trim($requestedCurrency) !== '' && strtoupper(trim($requestedCurrency)) !== $currency) {
        jsonResponse(['success' => false, 'message' => 'Payment currency does not match the selected payment method.'], 400);
    }

    $clientIp = getClientIpAddress();

    // 1. IP BLACKLIST CHECK: Block banned IPs from placing any orders
    try {
        $bannedCheck = $pdo->prepare("SELECT * FROM banned_ips WHERE ip_address = ? LIMIT 1");
        $bannedCheck->execute([$clientIp]);
        $bannedRow = $bannedCheck->fetch();
        if ($bannedRow && !$isAdmin) {
            jsonResponse([
                'success' => false,
                'message' => 'ACCESS RESTRICTED: Your IP address (' . htmlspecialchars($clientIp) . ') has been blocked due to policy violations (repeated fake orders / spam). Reason: ' . ($bannedRow['reason'] ?? 'Fraud prevention') . '. Please contact admin@astrosivam.com if you believe this is an error.'
            ], 403);
        }
    } catch (Exception $e) {
        // Fallthrough if table doesn't exist yet
    }

    // 2. UNVERIFIED CHECKOUT LIMIT: max 3 open manual/unverified checkout groups per IP.
    // A family bundle counts once; captured/no-charge orders do not block paid reorders.
    $pendingCount = astro_count_pending_order_groups_by_ip($pdo, $clientIp);
    if (!$isAdmin && $pendingCount >= 3) {
        jsonResponse([
            'success' => false,
            'message' => 'PENDING ORDERS LIMIT: You currently have ' . $pendingCount . ' unpaid checkout groups awaiting payment verification. Please wait for them to be verified or contact admin before creating additional orders.',
            'pendingCount' => $pendingCount
        ], 429);
    }

    // 3. FREE BETA HANDLING — exactly ONE free report per IP address.
    // The FIRST single order from an IP is free; once that free chart has
    // been used, every following order (single or family) from the same IP is
    // a normal paid order. There is no rejection — the order simply becomes
    // a paid order that requires a payment method and transaction reference.
    astro_ensure_beta_ip_claims_table($pdo);
    $ipCheckStmt = $pdo->prepare("SELECT COUNT(*) FROM beta_ip_claims WHERE ip_address = ?");
    $ipCheckStmt->execute([$clientIp]);
    $ipOrderCount = (int)($ipCheckStmt->fetchColumn() ?: 0);
    // Customers keep the original one-free-report-per-IP behavior. Admins
    // get a separate no-charge path and never consume that customer slot.
    $isFreeOrder = ($isFreeBeta || $serviceMode === 'FREE_BETA') && $ipOrderCount < 1;
    if ($isAdmin) {
        $isFreeOrder = true;
    }
    $effectiveServiceMode = $isFreeOrder ? 'FREE_BETA' : 'PAID';

    // Server pricing for this currency. Computed HERE because the captured
    // intent below is verified against the server price: reading $pricing only
    // after that check silently compared every service against the 18-unit
    // fallback and rejected correctly-priced orders.
    $pricing = $sRow ? json_decode($sRow['pricing'] ?? '{}', true) : [];
    $priceMap = [
        'BIRTH_JATHAGAM' => ($currency === 'INR' ? (int)round(18 * USD_TO_INR_RATE) : 18),
        'MARRIAGE_COMPATIBILITY' => ($currency === 'INR' ? (int)round(22 * USD_TO_INR_RATE) : 22),
        'BABY_NAMING' => ($currency === 'INR' ? (int)round(15 * USD_TO_INR_RATE) : 15),
        'MUHURTHAM' => ($currency === 'INR' ? (int)round(20 * USD_TO_INR_RATE) : 20)
    ];
    $currKey = strtolower($currency);

    // 4. ONLINE-ONLY PAYMENT ENFORCEMENT (paid orders only —
    // under FREE_BETA only the first report of this IP is free).
    $capturedIntent = null;
    if (!$isFreeOrder) {
        if (empty($paymentMethod) || strtoupper($paymentMethod) === 'NONE') {
            jsonResponse([
                'success' => false,
                'message' => 'PAYMENT REQUIRED: The 1 free beta report for this connection has already been used. Please complete online payment (PayPal/Card or Google Pay/UPI) to place this order.'
            ], 400);
        }
        // Online payment only — require a captured payment intent.
        if ($paymentIntentId === '') {
            jsonResponse([
                'success' => false,
                'message' => 'ONLINE PAYMENT REQUIRED: Please complete payment via the online checkout before placing your order. Manual transfers are not accepted.'
            ], 400);
        }
        $intentStmt = $pdo->prepare("SELECT * FROM payment_intents WHERE id = ? AND user_id = ? LIMIT 1");
        $intentStmt->execute([$paymentIntentId, $user['id']]);
        $capturedIntent = $intentStmt->fetch();
        if ($capturedIntent && strtoupper((string)$capturedIntent['status']) === 'CONSUMED') {
            // Already paid and already ordered: replay that order instead of
            // failing with "payment has not been completed".
            astro_replay_consumed_intent($pdo, $capturedIntent, 'single-order', [
                'currency' => $currency,
                'paymentMethod' => $paymentMethod
            ]);
        }
        if (!$capturedIntent || $capturedIntent['status'] !== 'CAPTURED') {
            jsonResponse(['success' => false, 'message' => 'Payment has not been completed. Please finish online checkout.'], 400);
        }
        $intentMethod = strtoupper((string)($capturedIntent['payment_method'] ?? ''));
        $methodMatches = $intentMethod === $paymentMethod || ($intentMethod === 'GPAY' && $paymentMethod === 'UPI')
                        || ($intentMethod === 'PAYPAL' && $paymentMethod === 'CARD');
        if (!$methodMatches || round((float)$capturedIntent['amount'], 2) !== round(($pricing[$serviceType][$currKey] ?? $priceMap[$serviceType] ?? 18), 2) || strtoupper((string)$capturedIntent['currency']) !== strtoupper((string)$currency)) {
            jsonResponse(['success' => false, 'message' => 'The captured payment does not match this order.'], 400);
        }
        $paymentReference = (string)$capturedIntent['payment_reference'];
    }
    $paymentStatus = $isFreeOrder ? 'NOT_REQUIRED' : 'CAPTURED';

    // IDEMPOTENT INTENT BINDING (single report): claim the captured intent
    // before the order row is written, so a repeated submission returns the
    // order that was already created instead of creating a twin.
    $bindKey = '';
    if ($capturedIntent) {
        $bind = astro_claim_intent_binding($pdo, $capturedIntent, $user['id'], 'single-order');
        $bindKey = $bind['key'];
        if ($bind['state'] === 'DUPLICATE') {
            $existing = astro_orders_for_replay($pdo, $bind['record']);
            astro_payment_log_structured('order_bind_replayed', [
                'scope' => 'single-order',
                'intentId' => (string)$capturedIntent['id'],
                'orderId' => (string)(($bind['record'] ?? [])['order_id'] ?? '')
            ]);
            jsonResponse([
                'success' => true,
                'duplicate' => true,
                'duplicateReason' => 'intent_already_bound',
                'message' => 'This payment was already applied to an order. The existing order was returned instead of creating a duplicate.',
                'order' => !empty($existing) ? astro_order_to_client_array($existing[0]) : null
            ], 200);
        }
        if ($bind['state'] === 'IN_PROGRESS') {
            jsonResponse([
                'success' => false,
                'duplicate' => true,
                'duplicateReason' => 'intent_binding_in_progress',
                'message' => 'This payment is already being applied to an order. Please wait a moment and check your orders instead of submitting again.'
            ], 409);
        }
    }

    // FREE_BETA: the first report of this IP is free — later orders pay.
    $amount = $isFreeOrder ? 0 : ($pricing[$serviceType][$currKey] ?? $priceMap[$serviceType] ?? 35);
    if ($isFreeOrder && $paymentIntentId !== '') {
        jsonResponse(['success' => false, 'message' => 'A free order cannot be bound to a paid payment intent.'], 400);
    }
    // Online-only payment enforced above; $paymentStatus is already set to CAPTURED / NOT_REQUIRED.
    if (!$isFreeOrder && (!$capturedIntent || $capturedIntent['status'] !== 'CAPTURED')) {
        jsonResponse(['success' => false, 'message' => 'Online payment verification failed. Please complete checkout again.'], 400);
    }

    // Save as birth profile if requested or if user has no birth profile yet
    $bpTarget = $inputPayload;
    if (!empty($inputPayload['bride']) && is_array($inputPayload['bride'])) {
        $bpTarget = ($user['gender'] ?? 'M') === 'F' ? $inputPayload['bride'] : ($inputPayload['groom'] ?? $inputPayload['bride']);
    }
    if (($saveAsProfile || true) && !empty($bpTarget['dob']) && !empty($bpTarget['birthPlace'])) {
        $bpCheck = $pdo->prepare("SELECT id FROM birth_profiles WHERE user_id = ? LIMIT 1");
        $bpCheck->execute([$user['id']]);
        $hasExistingBp = (bool)$bpCheck->fetch();

        if ($saveAsProfile || !$hasExistingBp) {
            if ($hasExistingBp) {
                $bpUpd = $pdo->prepare("UPDATE birth_profiles SET name=?, dob=?, tob=?, birth_place=?, country=?, latitude=?, longitude=?, timezone_offset_hours=?, gender=?, updated_at=NOW() WHERE user_id=?");
                $bpUpd->execute([
                    $bpTarget['name'] ?? $user['name'],
                    $bpTarget['dob'],
                    $bpTarget['tob'],
                    $bpTarget['birthPlace'],
                    $bpTarget['country'] ?? '',
                    (float) $bpTarget['latitude'],
                    (float) $bpTarget['longitude'],
                    (float) $bpTarget['timezoneOffsetHours'],
                    $bpTarget['gender'] ?? 'M',
                    $user['id']
                ]);
            } else {
                $bpIns = $pdo->prepare("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
                $bpIns->execute([
                    astro_random_id('bp_', 16),
                    $user['id'],
                    $bpTarget['name'] ?? $user['name'],
                    $bpTarget['dob'],
                    $bpTarget['tob'],
                    $bpTarget['birthPlace'],
                    $bpTarget['country'] ?? '',
                    (float) $bpTarget['latitude'],
                    (float) $bpTarget['longitude'],
                    (float) $bpTarget['timezoneOffsetHours'],
                    $bpTarget['gender'] ?? 'M'
                ]);
            }
        }
    }

    $orderId = astro_random_id('ord_', 16);
    $orderNumber = 'ORD-' . strtoupper(astro_random_hex(6));

    // Pre-calculate Vedic astrological result
    $calculatedResult = null;
    if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
        $calculatedResult = AstroEngine::calculateMatchmaking($inputPayload);
    } elseif ($serviceType === 'BABY_NAMING') {
        $calculatedResult = AstroEngine::calculateBabyNaming($inputPayload);
    } elseif ($serviceType === 'MUHURTHAM') {
        $calculatedResult = AstroEngine::calculateMuhurtham($inputPayload);
    } else {
        $calculatedResult = AstroEngine::calculateHoroscope($inputPayload);
    }

    // Existing shared-hosting installations predate the payment columns until
    // migration 013 is applied; verify instead of ALTERing on a web request.
    astro_ensure_order_limit_columns($pdo);

    // Reserve the free slot and create the order in one InnoDB transaction.
    $betaClaimTransactionStarted = false;
    if ($isFreeOrder && !$isAdmin) {
        try {
            $pdo->beginTransaction();
            $betaClaim = $pdo->prepare("INSERT IGNORE INTO beta_ip_claims (ip_address, claimed_at) VALUES (?, NOW())");
            $betaClaim->execute([$clientIp]);
            if ($betaClaim->rowCount() !== 1) {
                $pdo->rollBack();
                if ($bindKey !== '') {
                    astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Free Beta claim lost; the order was not created.', null, (string)$capturedIntent['id']);
                }
                jsonResponse(['success' => false, 'message' => 'The Free Beta report was claimed by another request. Refresh checkout and submit again.'], 409);
            }
            $betaClaimTransactionStarted = true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('ASTRO SIVAM: could not reserve Free Beta claim.');
            if ($bindKey !== '') {
                astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Free Beta claim could not be reserved; the order was not created.', null, (string)$capturedIntent['id']);
            }
            jsonResponse(['success' => false, 'message' => 'Free Beta availability could not be confirmed. Please retry shortly.'], 503);
        }
    }

    $ins = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, user_mobile, country, service_type, language, amount, currency, service_mode, status, payment_method, payment_reference, payment_intent_id, payment_status, payment_confirmed, email_status, input_payload, calculated_result, has_pdf, has_invoice, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'PENDING', ?, ?, 1, 1, ?, NOW(), NOW())");
    $ins->execute([
        $orderId,
        $orderNumber,
        $user['id'],
        $user['name'],
        $user['email'],
        $user['mobile'],
        $country,
        $serviceType,
        $language,
        $amount,
        $currency,
        $effectiveServiceMode,
        $paymentMethod,
        $paymentReference !== '' ? $paymentReference : null,
        $capturedIntent['id'] ?? null,
        $paymentStatus,
        ($capturedIntent || $paymentStatus === 'NOT_REQUIRED') ? 1 : 0,
        json_encode($inputPayload, JSON_UNESCAPED_UNICODE),
        json_encode($calculatedResult, JSON_UNESCAPED_UNICODE),
        $clientIp
    ]);

    if ($capturedIntent) {
        $consume = $pdo->prepare("UPDATE payment_intents SET status = 'CONSUMED', order_id = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND status = 'CAPTURED' AND amount = ? AND currency = ? AND order_id IS NULL");
        $consume->execute([$orderId, $capturedIntent['id'], $user['id'], $amount, $currency]);
        if ($consume->rowCount() !== 1) {
            $pdo->prepare("UPDATE orders SET status = 'REJECTED', admin_notes = ?, updated_at = NOW() WHERE id = ?")->execute(['Payment intent could not be consumed safely.', $orderId]);
            if ($bindKey !== '') {
                astro_payment_finish_idempotency($pdo, $bindKey, 'FAILED', 'Payment intent could not be consumed safely.', null, (string)$capturedIntent['id']);
            }
            jsonResponse(['success' => false, 'message' => 'Payment could not be bound to this order. No report will be delivered.'], 409);
        }
        if ($bindKey !== '') {
            astro_payment_finish_idempotency($pdo, $bindKey, 'PROCESSED', 'Order #' . $orderNumber . ' bound to intent ' . $capturedIntent['id'] . '.', $orderId, (string)$capturedIntent['id']);
        }
    }

    // Record in beta_ip_orders table — ONLY for the one free report this IP
    // is entitled to during the Free Beta. Paid orders never consume it.
    if ($isFreeOrder) {
        if (!$isAdmin) {
            try {
                $insBeta = $pdo->prepare("INSERT INTO beta_ip_orders (ip_address, order_id, order_number, user_id, user_email, service_type, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
                $insBeta->execute([
                    $clientIp,
                    $orderId,
                    $orderNumber,
                    $user['id'],
                    $user['email'],
                    $serviceType
                ]);
            } catch (Exception $e) {
                // The unique claim ledger is authoritative; legacy history is best effort.
            }
        }
    }

    if ($betaClaimTransactionStarted && $pdo->inTransaction()) {
        $pdo->commit();
    }

    logAudit($pdo, $user['id'], $user['name'], $user['role'], 'ORDER_PLACED', "Order #{$orderNumber} placed ({$serviceType}, {$effectiveServiceMode}" . ($isAdmin ? " — admin no-charge report" : ($isFreeOrder ? " — free beta report of this IP" : "")) . ") from IP: {$clientIp}");

    $order = [
        'id' => $orderId,
        'orderNumber' => $orderNumber,
        'userId' => $user['id'],
        'userName' => $user['name'],
        'userEmail' => $user['email'],
        'userMobile' => $user['mobile'],
        'country' => $country,
        'serviceType' => $serviceType,
        'language' => $language,
        'amount' => $amount,
        'currency' => $currency,
        'serviceMode' => $effectiveServiceMode,
        'status' => 'PENDING',
        'paymentMethod' => $paymentMethod,
        'paymentReference' => $paymentReference !== '' ? $paymentReference : null,
        'paymentIntentId' => $capturedIntent['id'] ?? null,
        'paymentStatus' => $paymentStatus,
        'paymentConfirmed' => (bool)$capturedIntent,
        'emailStatus' => 'PENDING',
        'hasPdf' => false,
        'hasInvoice' => false,
        'createdAt' => date('Y-m-d H:i:s')
    ];

    // Best-effort WhatsApp/Viber order-confirmation alert (never blocks checkout).
    AstroChatAlerts::sendOrderAlerts($pdo, 'order_confirmed', [$order]);

    jsonResponse([
        'success' => true,
        'message' => $isAdmin
            ? 'Admin order placed at no charge. It is pending Admin verification and approval.'
            : ($isFreeOrder
                ? 'Order placed successfully in FREE BETA! Your first report is free (1 free report per customer during the Free Beta). It is pending Admin verification and approval.'
                : 'Paid order placed! Once payment is verified by Admin, your report and PDF certificate will be generated and emailed.'),
        'order' => $order
    ], 201);
}

// 6. GET /api/services/my-orders
if ((preg_match('#/services/my-orders/?$#', $path) || $action === 'my-orders' || $action === 'myOrders') && $method === 'GET') {
    $user = requireAuth($pdo);
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC");
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll();

    // Shared mapper: the checkout response and this list must describe an
    // order identically, or a replayed (duplicate-safe) checkout answer would
    // look different from the same order fetched a moment later.
    $orders = array_map('astro_order_to_client_array', $rows);

    jsonResponse(['success' => true, 'orders' => $orders]);
}

// 6b. Verified customer reviews (SEO audit 2026-10-15) — rules and handlers in
// api/reviews.php. Only the owner of a paid, delivered order may write one, and
// nothing is public until an administrator approves it.
//   GET  /api/services/my-reviews   customer: own reviews + reviewable orders
//   GET  /api/services/reviews      public: published reviews + rating totals
//   POST /api/services/reviews      customer: create or edit a review
// Anchored patterns, so neither path can be confused with another route.
if (preg_match('#/services/my-reviews/?$#', $path) || $action === 'my-reviews') {
    require_once __DIR__ . '/../reviews.php';
    if ($method !== 'GET') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    astro_reviews_route_mine($pdo, requireAuth($pdo));
}
if (preg_match('#/services/reviews/?$#', $path) || in_array($action, ['reviews', 'submit-review'], true)) {
    require_once __DIR__ . '/../reviews.php';
    if ($method === 'GET' || $method === 'HEAD') {
        astro_reviews_route_public_list($pdo);
    }
    if ($method === 'POST') {
        $reviewUser = requireAuth($pdo);
        astro_reviews_route_submit($pdo, $reviewUser, $jsonBody);
    }
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

// 7. (Removed) Customer-facing GET /api/services/orders/:id/pdf & invoice-pdf endpoint.
// Report/invoice PDFs are only generated server-side when emailing the customer
// (see the resend-email / order-approval flow) and are never served directly over HTTP
// to the customer-facing app. Do not re-add a public route that streams these PDFs.

// 7b. POST /api/services/export-preview-pdf (Direct instant export of calculated preview results to official PDF via mPDF)
// Kept public by owner decision (Oct 2026 audit): anonymous visitors must be
// able to preview before paying. Hardened instead with a strict per-IP rate
// limit and a diagonal PREVIEW watermark on every page (paid order PDFs sent
// by email carry no watermark).
if ((preg_match('#/services/export-preview-pdf/?$#', $path) || $action === 'export-preview-pdf') && $method === 'POST') {
    // 10 exports / IP / hour: generous for genuine previews, tight for scraping.
    astro_rate_limit_enforce(
        $pdo,
        'preview-pdf-ip',
        getClientIpAddress(),
        10,
        3600,
        'Too many preview exports. Please wait a while and try again.'
    );
    $body = getJsonBody();
    $serviceType = $body['serviceType'] ?? 'BIRTH_JATHAGAM';
    $result = $body['result'] ?? [];
    $lang = astro_normalize_report_language($body['language'] ?? 'en');

    if (empty($result)) {
        jsonResponse(['success' => false, 'message' => 'Result payload is required.'], 400);
    }

    $dateStr = date('d M Y');
    $fakeOrder = [
        'service_type' => $serviceType,
        'language' => $lang,
        'order_number' => 'PREVIEW-' . strtoupper(astro_random_hex(6)),
        'user_name' => $result['nativeName'] ?? ($result['devoteeName'] ?? ($body['inputPayload']['name'] ?? 'Valued User')),
        'currency' => DEFAULT_CURRENCY,
        'amount' => 0,
        'input_payload' => $body['inputPayload'] ?? ($result['inputPayload'] ?? [])
    ];

    try {
        if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
            $pdfContent = AstroEngine::generateReportPdf($fakeOrder, $result, 'PREVIEW');
            $filename = "ASTRO_SIVAM_Matchmaking_Preview_{$lang}.pdf";
        } elseif ($serviceType === 'BABY_NAMING') {
            $pdfContent = AstroEngine::generateReportPdf($fakeOrder, $result, 'PREVIEW');
            $filename = "ASTRO_SIVAM_BabyNaming_Preview_{$lang}.pdf";
        } elseif ($serviceType === 'MUHURTHAM') {
            $pdfContent = AstroEngine::generateReportPdf($fakeOrder, $result, 'PREVIEW');
            $filename = "ASTRO_SIVAM_Muhurtham_Preview_{$lang}.pdf";
        } else {
            $pdfContent = AstroEngine::generateReportPdf($fakeOrder, $result, 'PREVIEW');
            $filename = "ASTRO_SIVAM_Jathagam_3Page_Report_{$lang}.pdf";
        }
    } catch (\Throwable $e) {
        // AstroEngine wraps renderer exceptions; retain the actual font/layout
        // failure in server logs without exposing it or the result payload.
        $cause = $e;
        while ($cause->getPrevious() !== null) {
            $cause = $cause->getPrevious();
        }
        error_log('Preview PDF generation failed [' . $lang . ']; no fallback PDF was produced: ' . $cause->getMessage());
        jsonResponse([
            'success' => false,
            'message' => 'High-quality PDF generation is unavailable right now. No lower-quality PDF was produced; please retry later.'
        ], 503);
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($pdfContent));
    echo $pdfContent;
    exit;
}

// 8. POST /api/services/contact
if ((preg_match('#/services/contact/?$#', $path) || $action === 'contact') && $method === 'POST') {
    astro_enforce_contact_rate_limit($pdo);
    $body = getJsonBody();
    $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
    $email = is_string($body['email'] ?? null) ? trim($body['email']) : '';
    $mobile = is_string($body['mobile'] ?? null) ? trim($body['mobile']) : '';
    $subject = is_string($body['subject'] ?? null) ? trim($body['subject']) : 'Website Inquiry';
    $message = is_string($body['message'] ?? null) ? trim($body['message']) : '';

    if ($name === '' || $email === '' || $message === '') {
        jsonResponse(['success' => false, 'message' => 'Name, email, and message are required.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Please provide a valid email address.'], 400);
    }
    if (strlen($name) > 160 || strlen($email) > 254 || strlen($mobile) > 64 || strlen($subject) > 200 || strlen($message) > 10000) {
        jsonResponse(['success' => false, 'message' => 'One or more fields exceed the supported length.'], 400);
    }

    $id = astro_random_id('msg_', 16);
    $stmt = $pdo->prepare("INSERT INTO contact_messages (id, name, email, mobile, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'UNREAD', NOW())");
    $stmt->execute([$id, $name, $email, $mobile, $subject, $message]);

    // Deliver the inquiry to the administrator mailbox as well as storing it in
    // the Admin Inbox. The message is already persisted, so a transport failure
    // never loses the customer's enquiry; it is reported truthfully instead.
    $emailDispatched = false;
    $emailRecipient = '';
    $emailMessage = '';
    try {
        $settingsStmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
        $settingsRow = $settingsStmt->fetch();
        $emailSettings = $settingsRow ? (json_decode($settingsRow['email_settings'] ?? '{}', true) ?: []) : [];
        $generalSettings = $settingsRow ? (json_decode($settingsRow['general_settings'] ?? '{}', true) ?: []) : [];

        $emailRecipient = astro_resolve_contact_recipient(
            getenv('CONTACT_INQUIRY_TO'),
            $emailSettings['adminNotificationEmail'] ?? '',
            $generalSettings['contactEmail'] ?? '',
            defined('ADMIN_EMAIL') ? ADMIN_EMAIL : ''
        );

        // Reply-To is the visitor so the admin can answer the inquiry directly.
        $inquiryMailConfig = array_merge($emailSettings, ['replyToEmail' => $email]);
        $inquiryHtml = "<div style='font-family:Georgia,serif;background:#f4ede1;padding:20px;'>"
            . "<div style='max-width:600px;margin:0 auto;background:#fffdf9;border:1px solid #e8d9b8;border-radius:10px;overflow:hidden;'>"
            . "<div style='background:#7a1f1f;padding:16px 22px;color:#ffffff;font-size:19px;font-weight:700;'>ASTRO SIVAM &mdash; Website Inquiry</div>"
            . "<div style='padding:20px 22px;color:#3d3222;font-size:13.5px;line-height:1.7;'>"
            . "<p style='margin:0 0 10px;'><strong>Name:</strong> " . htmlspecialchars($name) . "</p>"
            . "<p style='margin:0 0 10px;'><strong>Email:</strong> " . htmlspecialchars($email) . "</p>"
            . ($mobile !== '' ? "<p style='margin:0 0 10px;'><strong>Mobile:</strong> " . htmlspecialchars($mobile) . "</p>" : '')
            . "<p style='margin:0 0 10px;'><strong>Subject:</strong> " . htmlspecialchars($subject) . "</p>"
            . "<p style='margin:0 0 6px;'><strong>Message:</strong></p>"
            . "<div style='white-space:pre-wrap;background:#ffffff;border:1px solid #e8d9b8;border-radius:6px;padding:12px 14px;'>" . nl2br(htmlspecialchars($message)) . "</div>"
            . "<p style='margin:14px 0 0;color:#8a7a55;font-size:12px;'>Saved in the Admin Inbox as <code>" . htmlspecialchars($id) . "</code> at " . date('Y-m-d H:i:s') . ".</p>"
            . "</div></div></div>";

        if ($emailRecipient === '') {
            $emailMessage = 'No valid contact notification address is configured; the inquiry is stored in the Admin Inbox only.';
            error_log('ASTRO SIVAM contact inquiry email skipped: ' . $emailMessage);
        } else {
            $mailResult = AstroMailer::sendEmailWithAttachments(
                $emailRecipient,
                'ASTRO SIVAM Admin',
                '[ASTRO SIVAM Contact] ' . ($subject !== '' ? $subject : 'Website Inquiry'),
                $inquiryHtml,
                [],
                $inquiryMailConfig,
                astro_inline_logo_attachment()
            );
            $emailDispatched = !empty($mailResult['success']);
            $emailMessage = (string)($mailResult['message'] ?? '');
            if (!$emailDispatched) {
                error_log('ASTRO SIVAM contact inquiry email failed: ' . $emailMessage);
            }
        }

        // Record the delivery outcome for the Admin Inbox listing (best effort).
        try {
            static $contactEmailColumnsReady = false;
            if (!$contactEmailColumnsReady) {
                // Web requests never ALTER TABLE: these columns live in
                // api/migrations/015_contact_email_columns.sql (and api/schema.sql
                // for fresh installs). A database that predates them only skips
                // this UPDATE — the inquiry itself is already stored above.
                $contactCols = $pdo->query("SHOW COLUMNS FROM `contact_messages`")->fetchAll(PDO::FETCH_COLUMN, 0);
                $contactColsMissing = false;
                foreach (['email_status', 'email_recipient', 'email_dispatched_at', 'email_last_status_message'] as $contactCol) {
                    if (!in_array($contactCol, $contactCols, true)) {
                        error_log("ASTRO SIVAM: contact_messages.{$contactCol} is missing; run api/migrations/015_contact_email_columns.sql on this database.");
                        $contactColsMissing = true;
                        break;
                    }
                }
                if ($contactColsMissing) {
                    throw new RuntimeException('contact email outcome columns are not migrated; outcome not stored.');
                }
                $contactEmailColumnsReady = true;
            }
            $pdo->prepare("UPDATE contact_messages SET email_status = ?, email_recipient = ?, email_dispatched_at = ?, email_last_status_message = ? WHERE id = ?")
                ->execute([
                    $emailDispatched ? 'SENT' : 'FAILED',
                    $emailRecipient !== '' ? $emailRecipient : null,
                    $emailDispatched ? date('Y-m-d H:i:s') : null,
                    $emailMessage !== '' ? substr($emailMessage, 0, 255) : null,
                    $id
                ]);
        } catch (Throwable $persistError) {
            error_log('ASTRO SIVAM contact email status could not be stored: ' . $persistError->getMessage());
        }
    } catch (Throwable $mailError) {
        error_log('ASTRO SIVAM contact inquiry email could not be attempted: ' . $mailError->getMessage());
    }

    jsonResponse([
        'success' => true,
        'emailDispatched' => $emailDispatched,
        'message' => $emailDispatched
            ? 'Your message was saved and accepted by our administrator email system. Final inbox delivery is handled by the mail provider.'
            : 'Your message was safely saved in the ASTRO SIVAM admin inbox. Email notification is unavailable right now, but our team can review it in the portal.',
        'messageId' => $id
    ]);
}

jsonResponse(['success' => false, 'message' => 'Services endpoint not found'], 404);
