<?php
/**
 * ASTRO SIVAM — shared payment-provider helpers (webhooks + reconciliation).
 *
 * WHY THIS EXISTS: an online checkout is only finished when the *browser* calls
 * /api/services/payment/verify-session. If the customer closes the tab or the
 * callback is dropped, the provider has the money while the payment intent stays
 * CREATED forever: no order, no report, and support has to sort it out by hand.
 *
 * This module gives both recovery paths the same verified primitives:
 *   1. Signed provider webhooks (api/payment_webhook.php).
 *   2. Admin reconciliation of stale intents (api/admin/index.php).
 *
 * SECURITY RULES
 *   - Authenticity is verified before ANY state change (HMAC for Razorpay, the
 *     signed verification call for PayPal).
 *   - Amount and currency are re-checked against the stored intent, so a webhook
 *     can never change what an order costs.
 *   - Orders are still bound to a captured intent only by the authenticated
 *     order endpoint; a forged callback can never create or fulfil an order.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

/** Same masking rules as the rest of the API: placeholders are not credentials. */
function astro_payment_is_masked_secret($value) {
    $value = trim((string)$value);
    if ($value === '' || strpos($value, '•') !== false || preg_match('/^\*+$/', $value)) return true;
    return (bool)preg_match('/^(?:change[-_ ]?me|replace[-_ ]?me|astro_sivam_|your[-_ ]?(?:secret|token|key)|placeholder)/i', $value);
}

function astro_payment_setting_value($general, $keys, $envKeys = []) {
    foreach ($envKeys as $envKey) {
        $value = getenv($envKey);
        if ($value !== false && !astro_payment_is_masked_secret($value)) return trim((string)$value);
    }
    foreach ($keys as $key) {
        $value = $general[$key] ?? '';
        if (!astro_payment_is_masked_secret($value)) return trim((string)$value);
    }
    return '';
}

/** Ensures the durable payment tables exist even when the webhook arrives first. */
function astro_payment_ensure_tables($pdo) {
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
    $pdo->exec("CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        external_event_id VARCHAR(191) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        intent_id VARCHAR(80) NULL,
        gateway_order_id VARCHAR(191) NULL,
        gateway_payment_id VARCHAR(191) NULL,
        detail VARCHAR(500) NULL,
        payload_digest CHAR(32) NULL,
        ip_address VARCHAR(64) NULL,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payment_webhook_provider_event (provider, external_event_id),
        INDEX idx_payment_webhook_received (received_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // The idempotency ledger. payment_webhook_events is the audit trail; this
    // table is the *lock*: the PRIMARY KEY on the derived idempotency hash is
    // what makes a redelivered capture a no-op instead of a second capture.
    // See astro_payment_claim_idempotency().
    $pdo->exec("CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
        idempotency_key CHAR(64) NOT NULL PRIMARY KEY,
        scope VARCHAR(32) NOT NULL,
        provider VARCHAR(32) NOT NULL,
        external_event_id VARCHAR(191) NULL,
        intent_id VARCHAR(80) NULL,
        order_id VARCHAR(64) NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
        attempts INT UNSIGNED NOT NULL DEFAULT 1,
        detail VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_idempotency_intent (intent_id),
        INDEX idx_payment_idempotency_order (order_id),
        INDEX idx_payment_idempotency_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}

/** Provider credentials resolved from admin settings (env vars win when present). */
function astro_payment_provider_config($pdo) {
    $general = [];
    try {
        $stmt = $pdo->query("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
        $row = $stmt->fetch();
        if ($row) $general = json_decode($row['general_settings'] ?? '{}', true) ?: [];
    } catch (Throwable $e) {
        // Settings unavailable — fall back to environment variables only.
    }

    $rzpKeyId = astro_payment_setting_value($general, ['indiaGpayKeyId', 'razorpayKeyId'], ['RAZORPAY_KEY_ID']);
    $rzpKeySecret = astro_payment_setting_value($general, ['indiaGpayKeySecret', 'razorpayKeySecret'], ['RAZORPAY_KEY_SECRET']);
    $rzpWebhookSecret = astro_payment_setting_value($general, ['indiaGpayWebhookSecret', 'razorpayWebhookSecret'], ['RAZORPAY_WEBHOOK_SECRET']);

    $paypalClientId = astro_payment_setting_value($general, ['paypalClientId'], ['PAYPAL_CLIENT_ID']);
    $paypalClientSecret = astro_payment_setting_value($general, ['paypalClientSecret', 'paypalSecret'], ['PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET']);
    $paypalWebhookId = astro_payment_setting_value($general, ['paypalWebhookId'], ['PAYPAL_WEBHOOK_ID']);
    $paypalEnvironment = strtolower((string)($general['paypalMode'] ?? 'sandbox')) === 'live' ? 'live' : 'sandbox';

    return [
        'razorpay' => [
            'key_id' => $rzpKeyId,
            'key_secret' => $rzpKeySecret,
            'webhook_secret' => $rzpWebhookSecret,
            'configured' => $rzpKeyId !== '' && $rzpKeySecret !== ''
        ],
        'paypal' => [
            'client_id' => $paypalClientId,
            'client_secret' => $paypalClientSecret,
            'webhook_id' => $paypalWebhookId,
            'base_url' => $paypalEnvironment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
            'environment' => $paypalEnvironment,
            'configured' => $paypalClientId !== '' && $paypalClientSecret !== ''
        ]
    ];
}

/** Minimal JSON transport for provider calls (no external dependencies). */
function astro_payment_http_json($url, $method = 'GET', $headers = [], $body = null, $basicUser = null, $basicPassword = null) {
    if (!function_exists('curl_init')) {
        throw new Exception('Server payment transport is unavailable (cURL missing).');
    }
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
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
    if ($raw === false || $error !== '') throw new Exception('Payment provider request failed: ' . $error);
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) throw new Exception('Payment provider returned an invalid response.');
    return ['status' => $status, 'body' => $decoded];
}

function astro_payment_intent_by_gateway_order($pdo, $gatewayOrderId) {
    $gatewayOrderId = trim((string)$gatewayOrderId);
    if ($gatewayOrderId === '') return null;
    $stmt = $pdo->prepare("SELECT * FROM payment_intents WHERE gateway_order_id = ? LIMIT 1");
    $stmt->execute([$gatewayOrderId]);
    $intent = $stmt->fetch(PDO::FETCH_ASSOC);
    return $intent ?: null;
}

function astro_payment_intent_by_id($pdo, $intentId) {
    $stmt = $pdo->prepare("SELECT * FROM payment_intents WHERE id = ? LIMIT 1");
    $stmt->execute([trim((string)$intentId)]);
    $intent = $stmt->fetch(PDO::FETCH_ASSOC);
    return $intent ?: null;
}

function astro_payment_intent_prefix($intent) {
    return strtoupper((string)($intent['payment_method'] ?? '')) === 'PAYPAL' ? 'PAYPAL' : 'GPAY';
}

function astro_payment_reference($prefix, $gatewayPaymentId) {
    $clean = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$gatewayPaymentId);
    return $prefix . '-ONL-' . $clean;
}

/**
 * Verify a Razorpay webhook signature (HMAC-SHA256 of the raw request body).
 * Pure and side-effect free so it can be exercised by tests/selftest scripts.
 */
function astro_payment_verify_razorpay_signature($rawBody, $signature, $webhookSecret) {
    $secret = (string)$webhookSecret;
    $provided = trim((string)$signature);
    if ($secret === '' || $provided === '') return false;
    return hash_equals(hash_hmac('sha256', (string)$rawBody, $secret), $provided);
}

/**
 * Does a provider-reported payment match the stored intent exactly?
 * A provider callback must never be able to change what an order costs.
 */
function astro_payment_amount_matches($intent, $amount, $currency) {
    $expectedAmount = round((float)($intent['amount'] ?? 0), 2);
    $actualAmount = round((float)$amount, 2);
    if (abs($expectedAmount - $actualAmount) > 0.009) return false;
    $expectedCurrency = strtoupper(trim((string)($intent['currency'] ?? '')));
    $actualCurrency = strtoupper(trim((string)$currency));
    if ($actualCurrency === '') return true;
    return $expectedCurrency === $actualCurrency;
}

/** Human-readable mismatch explanation used in webhook audit rows. */
function astro_payment_mismatch_message($intent, $amount, $currency, $providerLabel) {
    return $providerLabel . ' reported ' . strtoupper((string)$currency) . ' ' . number_format((float)$amount, 2)
        . ' but intent ' . (string)($intent['id'] ?? '') . ' is ' . strtoupper((string)($intent['currency'] ?? ''))
        . ' ' . number_format((float)($intent['amount'] ?? 0), 2) . '. Nothing was captured.';
}

/**
 * Record a provider-confirmed capture on a CREATED intent. Idempotent: replaying
 * the same capture keeps the original reference and never double-books a payment.
 *
 * @return array{status:string,message:string,intentId?:string,paymentReference?:string}
 */
function astro_payment_capture_intent($pdo, $intent, $gatewayPaymentId, $gatewaySignature = null, $payerAccount = null) {
    $intentId = (string)$intent['id'];
    $status = strtoupper((string)$intent['status']);
    if ($status === 'CAPTURED') {
        return [
            'status' => 'ALREADY_CAPTURED',
            'message' => 'Payment was already captured.',
            'intentId' => $intentId,
            'paymentReference' => (string)($intent['payment_reference'] ?? '')
        ];
    }
    if ($status !== 'CREATED') {
        return ['status' => 'FAILED', 'message' => "Payment intent is {$status}; nothing was captured.", 'intentId' => $intentId];
    }
    if (trim((string)$gatewayPaymentId) === '') {
        return ['status' => 'FAILED', 'message' => 'Provider returned no payment id.', 'intentId' => $intentId];
    }

    $paymentReference = astro_payment_reference(astro_payment_intent_prefix($intent), $gatewayPaymentId);
    $upd = $pdo->prepare("UPDATE payment_intents SET status = 'CAPTURED', gateway_payment_id = ?, gateway_signature = ?, payment_reference = ?, payer_account = ?, updated_at = NOW() WHERE id = ? AND status = 'CREATED'");
    $upd->execute([
        (string)$gatewayPaymentId,
        $gatewaySignature !== null && $gatewaySignature !== '' ? substr((string)$gatewaySignature, 0, 512) : null,
        $paymentReference,
        $payerAccount !== null && $payerAccount !== '' ? substr((string)$payerAccount, 0, 191) : null,
        $intentId
    ]);
    if ($upd->rowCount() !== 1) {
        // Another verified callback (webhook vs. browser) captured it first.
        $fresh = astro_payment_intent_by_id($pdo, $intentId);
        if ($fresh && strtoupper((string)$fresh['status']) === 'CAPTURED') {
            return [
                'status' => 'ALREADY_CAPTURED',
                'message' => 'Payment was already captured by a concurrent verification.',
                'intentId' => $intentId,
                'paymentReference' => (string)($fresh['payment_reference'] ?? '')
            ];
        }
        return ['status' => 'FAILED', 'message' => 'Payment intent changed while it was being captured.', 'intentId' => $intentId];
    }

    return [
        'status' => 'CAPTURED',
        'message' => 'Provider-confirmed payment captured. The customer can now complete the order.',
        'intentId' => $intentId,
        'paymentReference' => $paymentReference
    ];
}

/** Ask the provider for an intent's live state and capture it when it was paid. */
function astro_payment_reconcile_intent($pdo, $intent, $config = null) {
    $config = $config ?: astro_payment_provider_config($pdo);
    $intentId = (string)$intent['id'];
    $provider = strtolower((string)$intent['provider']);

    try {
        if ($provider === 'razorpay') {
            if (empty($config['razorpay']['configured'])) {
                return ['status' => 'UNCONFIGURED', 'message' => 'Razorpay credentials are not configured on this server.', 'intentId' => $intentId];
            }
            $gatewayOrderId = trim((string)$intent['gateway_order_id']);
            $response = astro_payment_http_json(
                'https://api.razorpay.com/v1/orders/' . rawurlencode($gatewayOrderId) . '/payments',
                'GET',
                ['Accept: application/json'],
                null,
                $config['razorpay']['key_id'],
                $config['razorpay']['key_secret']
            );
            if ($response['status'] < 200 || $response['status'] >= 300) {
                return ['status' => 'UNKNOWN', 'message' => 'Razorpay order status could not be read.', 'intentId' => $intentId];
            }
            $expectedMinor = (int)round(((float)$intent['amount']) * 100);
            $captured = null;
            $anyFailed = false;
            foreach (($response['body']['items'] ?? []) as $payment) {
                $paymentStatus = strtolower((string)($payment['status'] ?? ''));
                if ($paymentStatus === 'captured'
                    && (int)($payment['amount'] ?? -1) === $expectedMinor
                    && strtoupper((string)($payment['currency'] ?? '')) === strtoupper((string)$intent['currency'])) {
                    $captured = $payment;
                    break;
                }
                if ($paymentStatus === 'failed') $anyFailed = true;
            }
            if (!$captured) {
                return [
                    'status' => $anyFailed ? 'FAILED' : 'PENDING',
                    'message' => $anyFailed
                        ? 'Razorpay reports no captured payment for this session (a payment attempt failed).'
                        : 'Razorpay reports no captured payment yet; the customer may still be checking out.',
                    'intentId' => $intentId
                ];
            }
            return astro_payment_capture_intent($pdo, $intent, (string)$captured['id']);
        }

        if ($provider === 'paypal') {
            if (empty($config['paypal']['configured'])) {
                return ['status' => 'UNCONFIGURED', 'message' => 'PayPal credentials are not configured on this server.', 'intentId' => $intentId];
            }
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
            if ($accessToken === '') {
                return ['status' => 'UNKNOWN', 'message' => 'PayPal authentication failed.', 'intentId' => $intentId];
            }
            $gatewayOrderId = trim((string)$intent['gateway_order_id']);
            $detailsResponse = astro_payment_http_json(
                $base . '/v2/checkout/orders/' . rawurlencode($gatewayOrderId),
                'GET',
                ['Accept: application/json', 'Authorization: Bearer ' . $accessToken]
            );
            $order = $detailsResponse['body'] ?? [];
            if ($detailsResponse['status'] < 200 || $detailsResponse['status'] >= 300) {
                return ['status' => 'UNKNOWN', 'message' => 'PayPal order status could not be read.', 'intentId' => $intentId];
            }
            // Recovery: the buyer approved the payment but the browser never
            // returned to capture it. Capture server-side now.
            if (strtoupper((string)($order['status'] ?? '')) === 'APPROVED') {
                $captureResponse = astro_payment_http_json(
                    $base . '/v2/checkout/orders/' . rawurlencode($gatewayOrderId) . '/capture',
                    'POST',
                    ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $accessToken, 'PayPal-Request-Id: recovery-' . $intentId],
                    new stdClass()
                );
                if ($captureResponse['status'] >= 200 && $captureResponse['status'] < 300) {
                    $order = $captureResponse['body'];
                } else {
                    return ['status' => 'PENDING', 'message' => 'PayPal approval exists but the capture could not be completed yet.', 'intentId' => $intentId];
                }
            }
            $purchaseUnit = $order['purchase_units'][0] ?? [];
            $capture = $purchaseUnit['payments']['captures'][0] ?? [];
            $captureStatus = strtoupper((string)($capture['status'] ?? ''));
            $orderStatus = strtoupper((string)($order['status'] ?? ''));
            if ($captureStatus !== 'COMPLETED' && $orderStatus !== 'COMPLETED') {
                return ['status' => 'PENDING', 'message' => 'PayPal reports status ' . ($orderStatus ?: 'UNKNOWN') . '; no capture to record yet.', 'intentId' => $intentId];
            }
            $amountValue = (float)($capture['amount']['value'] ?? ($purchaseUnit['amount']['value'] ?? 0));
            $currencyCode = strtoupper((string)($capture['amount']['currency_code'] ?? ($purchaseUnit['amount']['currency_code'] ?? '')));
            if (abs($amountValue - (float)$intent['amount']) > 0.009
                || ($currencyCode !== '' && $currencyCode !== strtoupper((string)$intent['currency']))) {
                return [
                    'status' => 'MISMATCH',
                    'message' => 'PayPal reported ' . $currencyCode . ' ' . number_format($amountValue, 2) . ' but the intent is '
                        . strtoupper((string)$intent['currency']) . ' ' . number_format((float)$intent['amount'], 2) . '. Nothing was captured.',
                    'intentId' => $intentId
                ];
            }
            $paymentId = (string)($capture['id'] ?? ($order['id'] ?? ''));
            if ($paymentId === '') {
                return ['status' => 'UNKNOWN', 'message' => 'PayPal returned no capture id.', 'intentId' => $intentId];
            }
            return astro_payment_capture_intent($pdo, $intent, $paymentId);
        }

        return ['status' => 'UNKNOWN', 'message' => 'No reconciliation path for provider ' . $provider . '.', 'intentId' => $intentId];
    } catch (Throwable $e) {
        error_log('ASTRO SIVAM payment reconciliation failed for intent ' . $intentId . ': ' . $e->getMessage());
        return ['status' => 'UNKNOWN', 'message' => 'Provider reconciliation failed.', 'intentId' => $intentId];
    }
}

/** Persist a provider callback for audit + idempotency. Returns [record, duplicate]. */
function astro_payment_record_webhook_event($pdo, $event) {
    $externalEventId = (string)($event['externalEventId'] ?? '');
    if ($externalEventId !== '') {
        $stmt = $pdo->prepare("SELECT * FROM payment_webhook_events WHERE provider = ? AND external_event_id = ? LIMIT 1");
        $stmt->execute([(string)$event['provider'], $externalEventId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($existing) return [$existing, true];
    }
    $id = 'pwh_' . bin2hex(random_bytes(8));
    $ins = $pdo->prepare("INSERT INTO payment_webhook_events (id, provider, external_event_id, event_type, status, intent_id, gateway_order_id, gateway_payment_id, detail, payload_digest, ip_address, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
    $ins->execute([
        $id,
        (string)$event['provider'],
        substr($externalEventId, 0, 191),
        substr((string)($event['eventType'] ?? 'unknown'), 0, 64),
        substr((string)($event['status'] ?? 'IGNORED'), 0, 32),
        $event['intentId'] ?? null,
        isset($event['gatewayOrderId']) ? substr((string)$event['gatewayOrderId'], 0, 191) : null,
        isset($event['gatewayPaymentId']) ? substr((string)$event['gatewayPaymentId'], 0, 191) : null,
        substr((string)($event['detail'] ?? ''), 0, 500),
        $event['payloadDigest'] ?? null,
        $event['ip'] ?? null
    ]);
    return [['id' => $id] + $event, false];
}

// ===========================================================================
// WEBHOOK IDEMPOTENCY LEDGER + STRUCTURED RETRY
//
// WHY THIS EXISTS
//   Razorpay retries a failed delivery itself and PayPal webhooks are
//   documented as "at-least-once": the same PAYMENT.CAPTURE.COMPLETED event
//   can arrive two or three times (network blip, our 503, provider retry).
//   Before this ledger the only guard was the status check inside
//   astro_payment_capture_intent(), and the dedupe lookup ran AFTER the
//   capture. That is safe for a *sequential* replay, but two deliveries that
//   arrive at the same instant both saw status='CREATED', both ran the
//   UPDATE, and one of them lost the race silently — with the audit trail
//   recording the capture twice.
//
//   The ledger below is claimed BEFORE the capture and inside the same
//   transaction, so the second delivery sees PROCESSSED and returns without
//   touching payment or order state. Statuses:
//     IN_PROGRESS -> a worker owns this event right now
//     PROCESSED   -> terminal: the capture was committed (or was already there)
//     FAILED      -> the attempt fell over; a later delivery may retry it
//
//   Deadlocks (MySQL 1213) and lock-wait timeouts (1205) are native to
//   InnoDB payment traffic: the webhook capture and the browser's
//   verify-session both write payment_intents, and multi-person checkout
//   writes a whole family of order rows. astro_payment_db_retry() retries the
//   *whole* transaction with capped exponential backoff + jitter instead of
//   letting the provider see a 500 and a lost capture.
// ===========================================================================

/** Structured, secret-free log line for payment operations (grep-able JSON). */
function astro_payment_log_structured($event, array $fields = []) {
    $safe = ['event' => (string)$event, 'component' => 'payment', 'at' => gmdate('c')];
    foreach ($fields as $key => $value) {
        if (is_array($value) || is_object($value)) {
            $value = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } elseif (is_bool($value)) {
            $value = $value ? 'true' : 'false';
        }
        // Payment bodies and signatures must never reach the log file.
        $value = preg_replace('/\s+/', ' ', (string)$value);
        $safe[(string)$key] = substr($value, 0, 500);
    }
    error_log('ASTRO SIVAM ' . json_encode($safe, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

/** MySQL error 1062 / SQLSTATE 23000 — the idempotency key is already claimed. */
function astro_payment_is_duplicate_key_error($error) {
    if ($error instanceof PDOException && is_array($error->errorInfo)) {
        $driverCode = (int)($error->errorInfo[1] ?? 0);
        if ($driverCode === 1062 || $driverCode === 1022) return true;
        if ((string)($error->errorInfo[0] ?? '') === '23000') return true;
    }
    $message = $error instanceof Throwable ? $error->getMessage() : (string)$error;
    return stripos($message, 'duplicate entry') !== false;
}

/**
 * Is this a transient InnoDB conflict worth replaying rather than reporting?
 * 1213 = deadlock, 1205 = lock wait timeout, 40001 = serialization failure.
 */
function astro_payment_is_retryable_db_error($error) {
    if ($error instanceof PDOException && is_array($error->errorInfo)) {
        $sqlState = strtoupper((string)($error->errorInfo[0] ?? ''));
        $driverCode = (int)($error->errorInfo[1] ?? 0);
        if ($sqlState === '40001' || $driverCode === 1213 || $driverCode === 1205) return true;
    }
    $message = $error instanceof Throwable ? $error->getMessage() : (string)$error;
    foreach (['Deadlock found', 'Lock wait timeout', 'try restarting transaction'] as $needle) {
        if (stripos($message, $needle) !== false) return true;
    }
    return false;
}

/**
 * Deterministic idempotency key. Order-independent (keys are sorted) so two
 * deliveries of the same event always hash to the same value even when the
 * provider sends the fields in a different order inside the payload.
 */
function astro_payment_idempotency_key($scope, array $parts) {
    $normalized = [];
    foreach ($parts as $name => $value) {
        if (is_array($value)) {
            $flat = [];
            foreach ($value as $item) {
                if (is_scalar($item)) $flat[] = (string)$item;
            }
            $value = implode('|', $flat);
        }
        $value = trim(strtolower(is_scalar($value) || $value === null ? (string)$value : ''));
        if ($value === '') continue;
        $normalized[] = strtolower((string)$name) . '=' . $value;
    }
    sort($normalized, SORT_STRING);
    return hash('sha256', strtolower(trim((string)$scope)) . '#' . implode('&', $normalized));
}

/**
 * Read the ledger row for a key (null when the key was never claimed).
 *
 * $forUpdate uses a locking read. After a duplicate-key error the plain
 * snapshot read of a REPEATABLE READ transaction may not see the row the
 * competitor just committed, and we would mistakenly start a second capture.
 */
function astro_payment_idempotency_state($pdo, $key, $forUpdate = false) {
    $key = strtolower(trim((string)$key));
    if ($key === '') return null;
    try {
        $stmt = $pdo->prepare("SELECT * FROM payment_idempotency_keys WHERE idempotency_key = ? LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : ''));
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) {
        astro_payment_log_structured('payment_idempotency_read_failed', ['error' => $e->getMessage()]);
        return null;
    }
}

/**
 * Atomically claim an idempotency key.
 *
 * @return array{state:string,record:?array}
 *   CLAIMED    — this request owns the key and must do the work
 *   DUPLICATE  — the work is already committed; skip it entirely
 *   IN_PROGRESS— another delivery of the same event is mid-flight
 *   ERROR      — the ledger could not be written (caller decides)
 */
function astro_payment_claim_idempotency($pdo, $key, array $meta = [], $staleSeconds = 60) {
    $key = strtolower(trim((string)$key));
    if (strlen($key) !== 64 || !ctype_xdigit($key)) {
        return ['state' => 'ERROR', 'record' => null];
    }
    $staleSeconds = max(15, min(600, (int)$staleSeconds));
    $scope = substr((string)($meta['scope'] ?? 'capture'), 0, 32);
    $provider = substr((string)($meta['provider'] ?? ''), 0, 32);
    $externalEventId = substr((string)($meta['externalEventId'] ?? ''), 0, 191);
    $intentId = substr((string)($meta['intentId'] ?? ''), 0, 80);
    $orderId = substr((string)($meta['orderId'] ?? ''), 0, 64);
    $detail = substr((string)($meta['detail'] ?? ''), 0, 500);

    try {
        $ins = $pdo->prepare("INSERT INTO payment_idempotency_keys (idempotency_key, scope, provider, external_event_id, intent_id, order_id, status, attempts, detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 1, ?, NOW(), NOW())");
        $ins->execute([
            $key,
            $scope,
            $provider !== '' ? $provider : 'unknown',
            $externalEventId !== '' ? $externalEventId : null,
            $intentId !== '' ? $intentId : null,
            $orderId !== '' ? $orderId : null,
            $detail !== '' ? $detail : null
        ]);
        return ['state' => 'CLAIMED', 'record' => ['status' => 'IN_PROGRESS', 'attempts' => 1]];
    } catch (Throwable $e) {
        if (!astro_payment_is_duplicate_key_error($e)) {
            astro_payment_log_structured('payment_idempotency_claim_failed', [
                'scope' => $scope,
                'provider' => $provider,
                'error' => $e->getMessage()
            ]);
            return ['state' => 'ERROR', 'record' => null];
        }
    }

    $record = astro_payment_idempotency_state($pdo, $key, true);
    if (!$record) {
        // The competing row disappeared (rolled back); treat this delivery as
        // the owner instead of failing the webhook.
        return ['state' => 'CLAIMED', 'record' => null];
    }
    $status = strtoupper((string)($record['status'] ?? 'IN_PROGRESS'));
    if ($status === 'PROCESSED') {
        return ['state' => 'DUPLICATE', 'record' => $record];
    }

    // A previous attempt died (FAILED) or is stale (crashed worker). Take it
    // over only if it is not fresh IN_PROGRESS work owned by someone else.
    // All clock arithmetic stays in MySQL so PHP and DB time zones cannot differ.
    try {
        $takeover = $pdo->prepare("UPDATE payment_idempotency_keys
            SET status = 'IN_PROGRESS', attempts = attempts + 1, detail = ?, updated_at = NOW()
            WHERE idempotency_key = ?
              AND status <> 'PROCESSED'
              AND (status = 'FAILED' OR updated_at <= DATE_SUB(NOW(), INTERVAL ? SECOND))");
        $takeover->execute([$detail !== '' ? $detail : null, $key, $staleSeconds]);
        if ($takeover->rowCount() === 1) {
            return ['state' => 'CLAIMED', 'record' => $record];
        }
    } catch (Throwable $e) {
        astro_payment_log_structured('payment_idempotency_takeover_failed', [
            'scope' => $scope,
            'provider' => $provider,
            'error' => $e->getMessage()
        ]);
        return ['state' => 'ERROR', 'record' => $record];
    }

    $fresh = astro_payment_idempotency_state($pdo, $key, true);
    $freshStatus = strtoupper((string)($fresh['status'] ?? 'IN_PROGRESS'));
    return [
        'state' => $freshStatus === 'PROCESSED' ? 'DUPLICATE' : 'IN_PROGRESS',
        'record' => $fresh ?: $record
    ];
}

/** Close a claim: PROCESSED (terminal), FAILED (retryable) or IGNORED. */
function astro_payment_finish_idempotency($pdo, $key, $status, $detail = '', $orderId = null, $intentId = null) {
    $key = strtolower(trim((string)$key));
    if ($key === '') return false;
    try {
        $stmt = $pdo->prepare("UPDATE payment_idempotency_keys
            SET status = ?, detail = ?, order_id = COALESCE(?, order_id), intent_id = COALESCE(?, intent_id), updated_at = NOW()
            WHERE idempotency_key = ?");
        $stmt->execute([
            substr(strtoupper((string)$status), 0, 24),
            substr((string)$detail, 0, 500),
            $orderId !== null && $orderId !== '' ? substr((string)$orderId, 0, 64) : null,
            $intentId !== null && $intentId !== '' ? substr((string)$intentId, 0, 80) : null,
            $key
        ]);
        return true;
    } catch (Throwable $e) {
        astro_payment_log_structured('payment_idempotency_finish_failed', ['error' => $e->getMessage()]);
        return false;
    }
}

/**
 * Run a unit of payment work with a bounded, structured retry for InnoDB
 * deadlocks / lock-wait timeouts. The unit MUST be safe to replay (the capture
 * primitives are guarded by their own WHERE clauses, so they are).
 *
 * @return array{ok:bool,result?:mixed,error?:Throwable,attempts:int,retryable:bool}
 */
function astro_payment_db_retry($pdo, $work, array $context = [], $maxAttempts = 3, $delaysMs = null, $jitterMs = 25) {
    $maxAttempts = max(1, min(6, (int)$maxAttempts));
    $delaysMs = is_array($delaysMs) ? array_values($delaysMs) : [40, 120, 300];
    if (empty($delaysMs)) $delaysMs = [0];
    $jitterMs = max(0, (int)$jitterMs);

    $attempts = 0;
    $lastError = null;
    while ($attempts < $maxAttempts) {
        $attempts++;
        try {
            $result = call_user_func($work, $attempts);
            if ($attempts > 1) {
                astro_payment_log_structured('payment_db_retry_recovered', array_merge($context, ['attempts' => $attempts]));
            }
            return ['ok' => true, 'result' => $result, 'attempts' => $attempts, 'retryable' => false];
        } catch (Throwable $e) {
            $lastError = $e;
            $retryable = astro_payment_is_retryable_db_error($e);
            // A retry must start from a clean transaction or the next attempt
            // inherits the deadlocked one.
            if (is_object($pdo) && method_exists($pdo, 'inTransaction') && $pdo->inTransaction()) {
                try { $pdo->rollBack(); } catch (Throwable $rollbackError) { /* already gone */ }
            }
            if (!$retryable || $attempts >= $maxAttempts) {
                astro_payment_log_structured('payment_db_retry_exhausted', array_merge($context, [
                    'attempts' => $attempts,
                    'retryable' => $retryable,
                    'error' => $e->getMessage()
                ]));
                return ['ok' => false, 'error' => $e, 'attempts' => $attempts, 'retryable' => $retryable];
            }
            $delayMs = (int)$delaysMs[min($attempts - 1, count($delaysMs) - 1)];
            if ($jitterMs > 0) {
                try { $delayMs += random_int(0, $jitterMs); } catch (Throwable $ignored) { /* jitter is optional */ }
            }
            astro_payment_log_structured('payment_db_retry_scheduled', array_merge($context, [
                'attempts' => $attempts,
                'delayMs' => $delayMs,
                'error' => $e->getMessage()
            ]));
            usleep($delayMs * 1000);
        }
    }
    return ['ok' => false, 'error' => $lastError, 'attempts' => $attempts, 'retryable' => true];
}

/**
 * The only way a provider webhook is allowed to capture money.
 *
 * One transaction: claim the idempotency key -> capture the intent -> append
 * the audit row -> mark the claim PROCESSED. A redelivery of the same event
 * short-circuits on the claim (DUPLICATE) and never re-runs the capture, and a
 * deadlock replays the whole unit instead of dropping the event.
 *
 * @return array{status:string,duplicate:bool,message:string,httpStatus:int}
 */
function astro_payment_webhook_capture($pdo, array $params) {
    $provider = (string)($params['provider'] ?? '');
    $key = strtolower(trim((string)($params['idempotencyKey'] ?? '')));
    $intent = $params['intent'] ?? null;
    $intentId = is_array($intent) ? (string)($intent['id'] ?? '') : '';
    $gatewayPaymentId = trim((string)($params['gatewayPaymentId'] ?? ''));
    $gatewayOrderId = trim((string)($params['gatewayOrderId'] ?? ''));
    $gatewaySignature = trim((string)($params['gatewaySignature'] ?? ''));
    $eventType = substr((string)($params['eventType'] ?? 'unknown'), 0, 64);
    $externalEventId = substr((string)($params['externalEventId'] ?? ''), 0, 191);
    $payloadDigest = substr((string)($params['payloadDigest'] ?? ''), 0, 32);
    $ip = substr((string)($params['ip'] ?? ''), 0, 64);

    if ($key === '' || !is_array($intent) || $intentId === '') {
        return [
            'status' => 'INVALID',
            'duplicate' => false,
            'message' => 'Webhook capture parameters were incomplete.',
            'httpStatus' => 503
        ];
    }
    if ($gatewayPaymentId === '' && $gatewayOrderId === '') {
        return [
            'status' => 'INVALID',
            'duplicate' => false,
            'message' => 'Provider callback carried no payment reference.',
            'httpStatus' => 200
        ];
    }

    $context = [
        'provider' => $provider,
        'eventType' => $eventType,
        'intentId' => $intentId,
        'gatewayPaymentId' => $gatewayPaymentId,
        'gatewayOrderId' => $gatewayOrderId
    ];

    $attempt = astro_payment_db_retry($pdo, function () use ($pdo, $key, $provider, $intent, $intentId, $gatewayPaymentId, $gatewayOrderId, $gatewaySignature, $eventType, $externalEventId, $payloadDigest, $ip) {
        $pdo->beginTransaction();

        $claim = astro_payment_claim_idempotency($pdo, $key, [
            'scope' => 'webhook-capture',
            'provider' => $provider,
            'externalEventId' => $externalEventId,
            'intentId' => $intentId
        ]);
        if ($claim['state'] === 'DUPLICATE') {
            $pdo->commit();
            $record = $claim['record'] ?? [];
            return [
                'status' => 'DUPLICATE',
                'duplicate' => true,
                'message' => 'This provider event was already processed; no second capture was recorded.',
                'httpStatus' => 200,
                'orderId' => (string)($record['order_id'] ?? '')
            ];
        }
        if ($claim['state'] === 'IN_PROGRESS') {
            $pdo->commit();
            return [
                'status' => 'IN_PROGRESS',
                'duplicate' => true,
                'message' => 'Another delivery of this provider event is being processed right now; nothing was captured twice.',
                'httpStatus' => 200
            ];
        }
        if ($claim['state'] === 'ERROR') {
            // The ledger is unavailable. Fail closed: the provider will retry
            // and the intent is still CREATED, so nothing is lost.
            if ($pdo->inTransaction()) $pdo->rollBack();
            return [
                'status' => 'RETRY',
                'duplicate' => false,
                'message' => 'Payment idempotency ledger unavailable; the event was not processed. The provider will retry.',
                'httpStatus' => 503
            ];
        }

        $outcome = astro_payment_capture_intent(
            $pdo,
            $intent,
            $gatewayPaymentId !== '' ? $gatewayPaymentId : $gatewayOrderId,
            $gatewaySignature !== '' ? $gatewaySignature : null
        );
        $captured = in_array($outcome['status'], ['CAPTURED', 'ALREADY_CAPTURED'], true);
        $claimStatus = $captured ? 'PROCESSED' : ($outcome['status'] === 'FAILED' ? 'FAILED' : 'MISMATCH');
        $message = (string)($outcome['message'] ?? 'Processed.');

        astro_payment_record_webhook_event($pdo, [
            'provider' => $provider,
            'externalEventId' => $externalEventId,
            'eventType' => $eventType,
            'status' => $claimStatus === 'PROCESSED' ? 'PROCESSED' : $claimStatus,
            'intentId' => $intentId,
            'gatewayOrderId' => $gatewayOrderId !== '' ? $gatewayOrderId : null,
            'gatewayPaymentId' => $gatewayPaymentId !== '' ? $gatewayPaymentId : null,
            'detail' => $message,
            'payloadDigest' => $payloadDigest !== '' ? $payloadDigest : null,
            'ip' => $ip
        ]);
        astro_payment_finish_idempotency($pdo, $key, $claimStatus, $message, null, $intentId);
        $pdo->commit();

        return [
            'status' => $claimStatus,
            'duplicate' => ($outcome['status'] === 'ALREADY_CAPTURED'),
            'message' => $message,
            'httpStatus' => 200,
            'paymentReference' => (string)($outcome['paymentReference'] ?? '')
        ];
    }, $context, 3);

    if (!$attempt['ok']) {
        $error = $attempt['error'] ?? null;
        $retryable = !empty($attempt['retryable']);
        astro_payment_log_structured('payment_webhook_capture_failed', array_merge($context, [
            'attempts' => $attempt['attempts'],
            'retryable' => $retryable,
            'error' => $error instanceof Throwable ? $error->getMessage() : 'unknown'
        ]));
        return [
            'status' => 'RETRY',
            'duplicate' => false,
            'message' => $retryable
                ? 'A database conflict prevented the capture; the provider will retry this event.'
                : 'The capture could not be recorded; the provider will retry this event.',
            'httpStatus' => 503
        ];
    }

    $result = is_array($attempt['result']) ? $attempt['result'] : [];
    if (!isset($result['httpStatus'])) $result['httpStatus'] = 200;
    if (!isset($result['duplicate'])) $result['duplicate'] = false;
    if (!isset($result['status'])) $result['status'] = 'IGNORED';
    if (!isset($result['message'])) $result['message'] = 'Processed.';
    // A capture that recovered from a deadlock is still worth a log line.
    if ($attempt['attempts'] > 1) {
        astro_payment_log_structured('payment_webhook_capture_retried', array_merge($context, [
            'attempts' => $attempt['attempts'],
            'status' => $result['status']
        ]));
    }
    return $result;
}

/** Observability counters for the health probe and the admin recovery panel. */
function astro_payment_idempotency_stats($pdo) {
    $stats = [
        'claims' => 0,
        'processed' => 0,
        'inProgress' => 0,
        'failed' => 0,
        'retried' => 0,
        'staleInProgress' => 0
    ];
    try {
        $row = $pdo->query("SELECT
                COUNT(*) AS claims,
                SUM(status = 'PROCESSED') AS processed,
                SUM(status = 'IN_PROGRESS') AS in_progress,
                SUM(status = 'FAILED') AS failed,
                SUM(attempts > 1) AS retried,
                SUM(status = 'IN_PROGRESS' AND updated_at <= DATE_SUB(NOW(), INTERVAL 60 SECOND)) AS stale_in_progress
            FROM payment_idempotency_keys")->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $stats['claims'] = (int)($row['claims'] ?? 0);
            $stats['processed'] = (int)($row['processed'] ?? 0);
            $stats['inProgress'] = (int)($row['in_progress'] ?? 0);
            $stats['failed'] = (int)($row['failed'] ?? 0);
            $stats['retried'] = (int)($row['retried'] ?? 0);
            $stats['staleInProgress'] = (int)($row['stale_in_progress'] ?? 0);
        }
    } catch (Throwable $e) {
        $stats['error'] = 'unavailable';
    }
    return $stats;
}

/**
 * ---------------------------------------------------------------------------
 * AUTOMATIC REFUNDS (one click in the Admin Portal)
 * ---------------------------------------------------------------------------
 *
 * The admin refund button must return REAL money for payments this server
 * captured online, and must say so when it cannot:
 *
 *   • Razorpay (India UPI / GPay) -> POST /v1/payments/{payment_id}/refund
 *   • PayPal (international cards / wallet) -> POST /v2/payments/captures/{id}/refund
 *
 * Anything that was never captured online (bank transfer, manual receipt
 * verification, free beta) has no provider-side payment to reverse, so the
 * caller records the refund in the order trail and tells the administrator to
 * settle it manually. That distinction is returned, never guessed at.
 *
 * Every call is idempotent by construction: the caller stores the provider
 * reference on the order and refuses to issue a second refund for it, and the
 * provider itself receives a deterministic request id derived from the order
 * (PayPal honours `PayPal-Request-Id`; Razorpay receives a `receipt`).
 *
 * `$httpJson` is injectable so the policy can be executed in tests without a
 * network (see tests/fixtures/php-refund-probes/refund-policy.php).
 */

/**
 * The most recent payment intent recorded for an order, if any.
 *
 * The one-click refund needs the CAPTURE (not just the order) to talk to the
 * provider, so the intent is resolved from orders.payment_intent_id and then
 * from any intent that recorded this order id.
 */
function astro_payment_intent_for_order($pdo, $order) {
    $orderId = (string) ($order['id'] ?? '');
    $intentId = trim((string) ($order['payment_intent_id'] ?? ''));
    if ($intentId !== '') {
        try {
            $intent = astro_payment_intent_by_id($pdo, $intentId);
            if ($intent) return $intent;
        } catch (Throwable $e) {
            // Fall through to the order-linked lookup below.
        }
    }
    if ($orderId === '') return null;
    try {
        $stmt = $pdo->prepare("SELECT * FROM payment_intents WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1");
        $stmt->execute([$orderId]);
        $intent = $stmt->fetch(PDO::FETCH_ASSOC);
        return $intent ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/** Thin wrapper over the pure policy predicate in api/refunds.php. */
function astro_payment_intent_is_refundable($intent) {
    require_once __DIR__ . '/refunds.php';
    return astro_refund_intent_is_refundable($intent);
}

/**
 * Refund a captured payment at the provider. This is the ONLY place in the
 * codebase that returns real money, and it is called before anything is marked
 * refunded — a provider refusal must leave the order untouched so the admin can
 * retry.
 *
 * @return array{
 *   attempted:bool, ok:bool, manual:bool, provider:string, reference:string,
 *   status:string, message:string
 * }
 */
function astro_payment_refund_intent($pdo, $intent, $amount, $currency, $idempotencyKey = '', $httpJson = null, $configOverride = null) {
    require_once __DIR__ . '/refunds.php';

    $http = $httpJson === null ? 'astro_payment_http_json' : $httpJson;
    $amount = round((float) $amount, 2);
    $currency = strtoupper(trim((string) $currency));
    $provider = is_array($intent) ? strtolower(trim((string) ($intent['provider'] ?? ''))) : '';

    $manual = array(
        'attempted' => false,
        'ok' => false,
        'manual' => true,
        'provider' => $provider,
        'reference' => '',
        'status' => 'MANUAL',
        'message' => 'No online capture is on record for this payment, so the amount has to be returned manually (bank transfer / receipt). '
            . 'The refund is recorded on the order and must be settled by the administrator.'
    );

    if ($amount <= 0) {
        return array_merge($manual, array('message' => 'There is no captured amount to return.'));
    }

    $config = $configOverride;
    if (!is_array($config)) {
        try {
            $config = astro_payment_provider_config($pdo);
        } catch (Throwable $e) {
            $config = array(
                'razorpay' => array('configured' => false, 'key_id' => '', 'key_secret' => ''),
                'paypal' => array('configured' => false, 'base_url' => 'https://api-m.paypal.com')
            );
        }
    }

    $request = astro_refund_gateway_request(
        $intent,
        $amount,
        $currency,
        $idempotencyKey,
        is_array($config) ? $config : array(),
        (string) ($intent['id'] ?? '')
    );
    if ($request === null) {
        return $manual;
    }

    if (empty($config[$provider]['configured'])) {
        return array(
            'attempted' => true,
            'ok' => false,
            'manual' => false,
            'provider' => $provider,
            'reference' => '',
            'status' => 'UNCONFIGURED',
            'message' => ucfirst($provider) . ' credentials are not configured on this server, so the automatic refund could not be sent. Nothing was changed.'
        );
    }

    try {
        // PayPal needs an OAuth bearer token before the refund call.
        if ($provider === 'paypal') {
            $base = rtrim((string) ($config['paypal']['base_url'] ?? ''), '/');
            $tokenResponse = $http(
                $base . '/v1/oauth2/token',
                'POST',
                array('Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'),
                'grant_type=client_credentials',
                $config['paypal']['client_id'],
                $config['paypal']['client_secret']
            );
            $accessToken = (string) ($tokenResponse['body']['access_token'] ?? '');
            if ($accessToken === '') {
                return array(
                    'attempted' => true,
                    'ok' => false,
                    'manual' => false,
                    'provider' => 'paypal',
                    'reference' => '',
                    'status' => 'FAILED',
                    'message' => 'PayPal authentication failed, so the automatic refund was not sent. Nothing was changed.'
                );
            }
            $request['headers'][] = 'Authorization: Bearer ' . $accessToken;
        }

        $response = $http(
            $request['url'],
            'POST',
            $request['headers'],
            $request['body'],
            $request['basicUser'],
            $request['basicPassword']
        );
        $verdict = astro_refund_gateway_result($provider, $response['status'], $response['body'], $amount, $currency);
        return array(
            'attempted' => true,
            'ok' => (bool) $verdict['ok'],
            'manual' => false,
            'provider' => $provider,
            'reference' => (string) $verdict['reference'],
            'status' => (string) $verdict['status'],
            'message' => (string) $verdict['message']
        );
    } catch (Throwable $e) {
        return array(
            'attempted' => true,
            'ok' => false,
            'manual' => false,
            'provider' => $provider,
            'reference' => '',
            'status' => 'ERROR',
            'message' => 'The automatic refund call failed: ' . $e->getMessage() . ' Nothing was marked as refunded — retry from the portal.'
        );
    }
}
