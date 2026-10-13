<?php
/**
 * ASTRO SIVAM — payment provider webhooks (PHP / cPanel deployment).
 *
 * Endpoints (rewritten to this file by api/.htaccess):
 *   GET  /api/payment/webhook/health      readiness probe (no secrets disclosed)
 *   POST /api/payment/webhook/razorpay    payment.captured / order.paid
 *   POST /api/payment/webhook/paypal      PAYMENT.CAPTURE.COMPLETED
 *
 * Responses are 2xx whenever the event has been accepted (processed, ignored or
 * already seen) so the provider stops retrying. A signature that cannot be
 * verified is rejected and never changes payment state.
 *
 * PAYPAL IS AT-LEAST-ONCE. Every capture therefore goes through ONE atomic
 * unit — astro_payment_webhook_capture() — which claims a deterministic
 * idempotency key (provider + event type + gateway payment id + gateway order
 * id) inside the same transaction that captures the intent and appends the
 * audit row. A redelivered capture short-circuits on the ledger and can never
 * double-record a payment or an order; deadlocks are replayed with capped
 * backoff instead of being answered with a 5xx that loses the event.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/payments.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
$action = $_GET['action'] ?? $_GET['provider'] ?? '';
$rawBody = file_get_contents('php://input');
if ($rawBody === false) $rawBody = '';

function astroWebhookRespond($payload, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function astroWebhookProvider($path, $action) {
    $haystack = strtolower($path . ' ' . $action);
    if (strpos($haystack, 'razorpay') !== false) return 'razorpay';
    if (strpos($haystack, 'paypal') !== false) return 'paypal';
    return '';
}

function astroWebhookClientIp() {
    if (function_exists('getClientIpAddress')) {
        try { return (string)getClientIpAddress(); } catch (Throwable $e) { /* fall through */ }
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

try {
    $pdo = getDbConnection();
    astro_payment_ensure_tables($pdo);
} catch (Throwable $e) {
    error_log('ASTRO SIVAM payment webhook could not reach the database: ' . $e->getMessage());
    astroWebhookRespond(['success' => false, 'message' => 'Payment webhook storage is unavailable.'], 503);
}

if ($method === 'GET') {
    $config = astro_payment_provider_config($pdo);
    astroWebhookRespond([
        'success' => true,
        'service' => 'ASTRO SIVAM payment webhooks',
        'providers' => [
            'razorpay' => [
                'checkout' => !empty($config['razorpay']['configured']),
                'webhookVerification' => $config['razorpay']['webhook_secret'] !== ''
            ],
            'paypal' => [
                'checkout' => !empty($config['paypal']['configured']),
                'webhookVerification' => $config['paypal']['webhook_id'] !== ''
            ]
        ],
        // Observability only: aggregate counters, never event contents.
        'idempotency' => astro_payment_idempotency_stats($pdo)
    ]);
}

if ($method !== 'POST') {
    astroWebhookRespond(['success' => false, 'message' => 'Use POST to deliver a provider webhook.'], 405);
}

$provider = astroWebhookProvider($path, $action);
if ($provider === '') {
    astroWebhookRespond(['success' => false, 'message' => 'Unknown webhook provider.'], 404);
}

$config = astro_payment_provider_config($pdo);
$payloadDigest = substr(hash('sha256', $rawBody), 0, 32);
$clientIp = substr(astroWebhookClientIp(), 0, 64);
$event = json_decode($rawBody, true);
$event = is_array($event) ? $event : [];

/**
 * Records the outcome of an event that does NOT change payment state (ignored,
 * rejected, unknown intent...) and answers the provider.
 *
 * The audit write itself is retried on InnoDB deadlocks: losing the row would
 * lose the only trace of a rejected signature. If the write ultimately fails we
 * still answer 200 — no payment state was touched, and making PayPal redeliver a
 * rejected event forever would be worse than a missing audit line (which is
 * logged to the PHP error log).
 */
$finish = function ($status, $detail, $eventType, $externalEventId, $gatewayOrderId = '', $gatewayPaymentId = '', $intentId = null) use ($pdo, $provider, $payloadDigest, $clientIp) {
    $duplicate = false;
    $stored = true;
    $write = astro_payment_db_retry($pdo, function () use ($pdo, $provider, $status, $detail, $eventType, $externalEventId, $gatewayOrderId, $gatewayPaymentId, $intentId, $payloadDigest, $clientIp) {
        return astro_payment_record_webhook_event($pdo, [
            'provider' => $provider,
            'externalEventId' => (string)$externalEventId,
            'eventType' => (string)$eventType,
            'status' => $status,
            'intentId' => $intentId,
            'gatewayOrderId' => $gatewayOrderId !== '' ? $gatewayOrderId : null,
            'gatewayPaymentId' => $gatewayPaymentId !== '' ? $gatewayPaymentId : null,
            'detail' => $detail,
            'payloadDigest' => $payloadDigest,
            'ip' => $clientIp
        ]);
    }, ['scope' => 'webhook-audit', 'provider' => $provider, 'status' => $status], 3);
    if ($write['ok']) {
        $record = $write['result'];
        $duplicate = (bool)($record[1] ?? false);
    } else {
        $stored = false;
        error_log('ASTRO SIVAM payment webhook audit write failed: ' . (($write['error'] ?? null) instanceof Throwable ? $write['error']->getMessage() : 'unknown error'));
    }
    astroWebhookRespond([
        'success' => true,
        'processed' => $status === 'PROCESSED',
        'duplicate' => (bool)$duplicate,
        'status' => $status,
        'audited' => $stored,
        'message' => $detail
    ]);
};

/** Answers the provider for a capture attempt that ran through the ledger. */
$finishCapture = function (array $result) use ($provider) {
    $status = (string)($result['status'] ?? 'IGNORED');
    $captured = $status === 'PROCESSED';
    astro_payment_log_structured('payment_webhook_capture_result', [
        'provider' => $provider,
        'status' => $status,
        'duplicate' => !empty($result['duplicate'])
    ]);
    astroWebhookRespond([
        'success' => $status !== 'RETRY',
        'processed' => $captured && empty($result['duplicate']),
        'duplicate' => !empty($result['duplicate']),
        'status' => $status,
        'message' => (string)($result['message'] ?? 'Processed.'),
        'paymentReference' => (string)($result['paymentReference'] ?? '')
    ], (int)($result['httpStatus'] ?? 200));
};

// ---------------------------------------------------------------------------
// Razorpay: HMAC-SHA256 of the raw request body with the webhook secret.
// ---------------------------------------------------------------------------
if ($provider === 'razorpay') {
    $signature = (string)($_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '');
    $eventId = (string)($_SERVER['HTTP_X_RAZORPAY_EVENT_ID'] ?? '');
    $webhookSecret = (string)($config['razorpay']['webhook_secret'] ?? '');

    if ($webhookSecret === '') {
        error_log('ASTRO SIVAM: Razorpay webhook secret is not configured; event rejected.');
        astroWebhookRespond(['success' => false, 'message' => 'Razorpay webhook verification is not configured on this server.'], 503);
    }

    if (!astro_payment_verify_razorpay_signature($rawBody, $signature, $webhookSecret)) {
        error_log('ASTRO SIVAM: rejected Razorpay webhook with an invalid signature.');
        $finish('REJECTED', 'Signature verification failed for the Razorpay webhook.', 'signature.invalid', $eventId !== '' ? $eventId : 'invalid-' . $payloadDigest);
    }

    $eventType = (string)($event['event'] ?? 'unknown');
    $payment = $event['payload']['payment']['entity'] ?? [];
    $order = $event['payload']['order']['entity'] ?? [];
    $gatewayOrderId = trim((string)($payment['order_id'] ?? ($order['id'] ?? '')));
    $gatewayPaymentId = trim((string)($payment['id'] ?? ''));
    $dedupeId = $eventId !== '' ? $eventId : ($eventType . ':' . ($gatewayPaymentId !== '' ? $gatewayPaymentId : ($gatewayOrderId !== '' ? $gatewayOrderId : $payloadDigest)));

    if ($eventType !== 'payment.captured' && $eventType !== 'order.paid') {
        $finish('IGNORED', "Event {$eventType} does not change payment state.", $eventType, $dedupeId, $gatewayOrderId, $gatewayPaymentId);
    }
    if ($gatewayOrderId === '') {
        $finish('IGNORED', 'Event carried no gateway order reference.', $eventType, $dedupeId, '', $gatewayPaymentId);
    }

    $intent = astro_payment_intent_by_gateway_order($pdo, $gatewayOrderId);
    if (!$intent) {
        $finish('UNKNOWN_INTENT', "No payment intent matches Razorpay order {$gatewayOrderId}.", $eventType, $dedupeId, $gatewayOrderId, $gatewayPaymentId);
    }

    if (strtolower((string)($payment['status'] ?? '')) !== 'captured') {
        $finish('IGNORED', 'Razorpay payment status is ' . (string)($payment['status'] ?? 'unknown') . '; not captured.', $eventType, $dedupeId, $gatewayOrderId, $gatewayPaymentId, $intent['id']);
    }

    $paidAmount = ((float)($payment['amount'] ?? 0)) / 100;
    $paidCurrency = strtoupper((string)($payment['currency'] ?? ''));
    if (!astro_payment_amount_matches($intent, $paidAmount, $paidCurrency)) {
        $finish(
            'MISMATCH',
            astro_payment_mismatch_message($intent, $paidAmount, $paidCurrency, 'Razorpay'),
            $eventType,
            $dedupeId,
            $gatewayOrderId,
            $gatewayPaymentId,
            $intent['id']
        );
    }

    // One atomic unit: claim the idempotency key -> capture -> audit -> commit.
    // Redeliveries of the same captured payment stop at the ledger claim.
    $captureResult = astro_payment_webhook_capture($pdo, [
        'provider' => $provider,
        'eventType' => $eventType,
        'externalEventId' => $dedupeId,
        'idempotencyKey' => astro_payment_idempotency_key('webhook-capture', [
            'provider' => $provider,
            'eventType' => $eventType,
            'gatewayPaymentId' => $gatewayPaymentId,
            'gatewayOrderId' => $gatewayOrderId,
            'externalEventId' => $gatewayPaymentId === '' ? $dedupeId : '',
            'payloadDigest' => ($gatewayPaymentId === '' && $dedupeId === '') ? $payloadDigest : ''
        ]),
        'intent' => $intent,
        'gatewayPaymentId' => $gatewayPaymentId,
        'gatewayOrderId' => $gatewayOrderId,
        'gatewaySignature' => '',
        'payloadDigest' => $payloadDigest,
        'ip' => $clientIp
    ]);
    if ($captureResult['status'] === 'PROCESSED' && empty($captureResult['duplicate'])) {
        try {
            logAudit($pdo, 'system', 'Razorpay Webhook', 'admin', 'PAYMENT_WEBHOOK_CAPTURED',
                'Razorpay webhook ' . $eventType . ' captured intent ' . $intent['id'] . ' (reference ' . ($captureResult['paymentReference'] ?? '') . ').');
        } catch (Throwable $e) {
            error_log('ASTRO SIVAM: Razorpay webhook audit log failed: ' . $e->getMessage());
        }
    }
    $finishCapture($captureResult);
}

// ---------------------------------------------------------------------------
// PayPal: verified by PayPal itself (only PayPal can validate its certificate).
// ---------------------------------------------------------------------------
$eventId = (string)($_SERVER['HTTP_PAYPAL_TRANSMISSION_ID'] ?? '');
$webhookId = (string)($config['paypal']['webhook_id'] ?? '');

if ($webhookId === '') {
    error_log('ASTRO SIVAM: PayPal webhook id is not configured; event rejected so PayPal retries later.');
    astroWebhookRespond(['success' => false, 'message' => 'PayPal webhook verification is not configured on this server.'], 503);
}
if (empty($config['paypal']['configured'])) {
    astroWebhookRespond(['success' => false, 'message' => 'PayPal credentials are not configured on this server.'], 503);
}

try {
    $base = $config['paypal']['base_url'];
    $tokenResponse = astro_payment_http_json(
        $base . '/v1/oauth2/token',
        'POST',
        ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        'grant_type=client_credentials',
        $config['paypal']['client_id'],
        $config['paypal']['client_secret']
    );
    $accessToken = (string)($tokenResponse['body']['access_token'] ?? '');
    if ($accessToken === '') throw new Exception('PayPal authentication failed.');

    $verification = astro_payment_http_json(
        $base . '/v1/notifications/verify-webhook-signature',
        'POST',
        ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $accessToken],
        [
            'auth_algo' => (string)($_SERVER['HTTP_PAYPAL_AUTH_ALGO'] ?? ''),
            'cert_url' => (string)($_SERVER['HTTP_PAYPAL_CERT_URL'] ?? ''),
            'transmission_id' => $eventId,
            'transmission_sig' => (string)($_SERVER['HTTP_PAYPAL_TRANSMISSION_SIG'] ?? ''),
            'transmission_time' => (string)($_SERVER['HTTP_PAYPAL_TRANSMISSION_TIME'] ?? ''),
            'webhook_id' => $webhookId,
            'webhook_event' => $event
        ]
    );
    $verificationStatus = strtoupper((string)($verification['body']['verification_status'] ?? ''));
} catch (Throwable $e) {
    error_log('ASTRO SIVAM: PayPal webhook verification failed: ' . $e->getMessage());
    astroWebhookRespond(['success' => false, 'message' => 'PayPal signature verification could not be completed.'], 503);
}

if ($verificationStatus !== 'SUCCESS') {
    error_log('ASTRO SIVAM: rejected PayPal webhook with an invalid signature.');
    $finish('REJECTED', 'Invalid PayPal webhook signature.', 'signature.invalid', $eventId !== '' ? $eventId : 'paypal-' . $payloadDigest);
}

$eventType = (string)($event['event_type'] ?? 'unknown');
$resource = $event['resource'] ?? [];
$gatewayOrderId = trim((string)($resource['supplementary_data']['related_ids']['order_id'] ?? ''));
$gatewayPaymentId = trim((string)($resource['id'] ?? ''));
$dedupeId = $eventId !== '' ? $eventId : ($eventType . ':' . ($gatewayPaymentId !== '' ? $gatewayPaymentId : $payloadDigest));

if ($eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
    $finish('IGNORED', "Event {$eventType} does not change payment state.", $eventType, $dedupeId, $gatewayOrderId, $gatewayPaymentId);
}
if ($gatewayOrderId === '') {
    $finish('UNKNOWN_INTENT', 'PayPal capture carried no related order id.', $eventType, $dedupeId, '', $gatewayPaymentId);
}

$intent = astro_payment_intent_by_gateway_order($pdo, $gatewayOrderId);
if (!$intent) {
    $finish('UNKNOWN_INTENT', "No payment intent matches PayPal order {$gatewayOrderId}.", $eventType, $dedupeId, $gatewayOrderId, $gatewayPaymentId);
}

$paidAmount = (float)($resource['amount']['value'] ?? 0);
$paidCurrency = strtoupper((string)($resource['amount']['currency_code'] ?? ''));
if (!astro_payment_amount_matches($intent, $paidAmount, $paidCurrency)) {
    $finish(
        'MISMATCH',
        astro_payment_mismatch_message($intent, $paidAmount, $paidCurrency, 'PayPal capture'),
        $eventType,
        $dedupeId,
        $gatewayOrderId,
        $gatewayPaymentId,
        $intent['id']
    );
}

$captureResult = astro_payment_webhook_capture($pdo, [
    'provider' => $provider,
    'eventType' => $eventType,
    'externalEventId' => $dedupeId,
    'idempotencyKey' => astro_payment_idempotency_key('webhook-capture', [
        'provider' => $provider,
        'eventType' => $eventType,
        'gatewayPaymentId' => $gatewayPaymentId,
        'gatewayOrderId' => $gatewayOrderId,
        'externalEventId' => $gatewayPaymentId === '' ? $dedupeId : '',
        'payloadDigest' => ($gatewayPaymentId === '' && $dedupeId === '') ? $payloadDigest : ''
    ]),
    'intent' => $intent,
    'gatewayPaymentId' => $gatewayPaymentId,
    'gatewayOrderId' => $gatewayOrderId,
    // The PayPal-Transmission-Id is deliberately NOT part of the idempotency
    // key: it identifies a delivery, not the payment. The capture id does,
    // and it is identical on every redelivery of the same event.
    'gatewaySignature' => $eventId,
    'payloadDigest' => $payloadDigest,
    'ip' => $clientIp
]);
if ($captureResult['status'] === 'PROCESSED' && empty($captureResult['duplicate'])) {
    try {
        logAudit($pdo, 'system', 'PayPal Webhook', 'admin', 'PAYMENT_WEBHOOK_CAPTURED',
            'PayPal webhook ' . $eventType . ' captured intent ' . $intent['id'] . ' (reference ' . ($captureResult['paymentReference'] ?? '') . ').');
    } catch (Throwable $e) {
        error_log('ASTRO SIVAM: PayPal webhook audit log failed: ' . $e->getMessage());
    }
}
$finishCapture($captureResult);
