<?php
/**
 * ASTRO SIVAM - Admin health & readiness report
 * ---------------------------------------------------------------------------
 *   GET /api/admin/health.php        (admin bearer token or admin session)
 *
 * WHY THIS EXISTS
 * ---------------
 * The site runs on shared cPanel hosting where "is it up?" has four different
 * answers: is the database reachable, are the payment providers actually
 * configured (a missing webhook secret silently rejects every PayPal
 * delivery), is the error log being written where we think it is, and did last
 * week's backup really run. Answering those from one cheap request beats
 * SSH-ing in or reading through the admin panel.
 *
 * CONTRACT
 * --------
 *  * Admin auth only: getDbConnection() + requireAdmin(); an anonymous caller
 *    gets 401 and learns nothing.
 *  * No secret is ever echoed. Provider keys, webhook secrets and SMTP
 *    passwords are reported as booleans ("configured" / "webhookVerification"),
 *    never as values - same rule as the admin settings endpoint.
 *  * Every probe is isolated: one failing probe reports `failing` for itself
 *    and cannot break the rest of the report.
 *  * HTTP 200 while nothing is failing, 503 as soon as one check fails, so an
 *    uptime monitor can treat the endpoint as a real readiness probe.
 *
 * Runbook (error_log routing, rotation, the backup marker this file reads and
 * the monitoring workflow): docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../payments.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET' && $method !== 'HEAD') {
    jsonResponse(['success' => false, 'message' => 'Health checks are read-only. Use GET.'], 405);
}

header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');

$startedAt = microtime(true);
$pdo = getDbConnection();
$admin = requireAdmin($pdo);

/** Where the backup job writes its completion marker (see scripts/backup/). */
const ASTRO_HEALTH_BACKUP_MARKER = 'storage/backups/last-backup.json';
/** A weekly dump is late once it is older than this many days. */
const ASTRO_HEALTH_BACKUP_OVERDUE_DAYS = 8;
/** A captured intent that is still CREATED after this long was not bound. */
const ASTRO_HEALTH_STALE_INTENT_MINUTES = 60;

/**
 * A probe returns ['status' => ok|degraded|failing, 'detail' => string,
 * 'data' => mixed]. Throwing inside a probe is fine: it becomes a `failing`
 * check instead of a 500 for the whole report.
 */
function astro_health_run($name, callable $probe) {
    try {
        $result = $probe();
        if (!is_array($result) || !isset($result['status'])) {
            return ['name' => $name, 'status' => 'degraded', 'detail' => 'Probe returned no status.'];
        }
        return array_merge(['name' => $name, 'detail' => ''], $result);
    } catch (Throwable $e) {
        return [
            'name' => $name,
            'status' => 'failing',
            'detail' => 'Probe failed: ' . substr($e->getMessage(), 0, 200)
        ];
    }
}

$checks = [];

// ---------------------------------------------------------------------------
// 1. Database connectivity (the cheapest possible round trip).
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('database', function () use ($pdo) {
    $t0 = microtime(true);
    $one = $pdo->query('SELECT 1')->fetchColumn();
    $latencyMs = (int)round((microtime(true) - $t0) * 1000);
    if ((int)$one !== 1) {
        return ['status' => 'failing', 'detail' => 'SELECT 1 did not answer.'];
    }
    $version = 'unknown';
    try {
        $version = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
    } catch (Throwable $e) {
        // Reported as unknown; not worth failing the probe over.
    }
    return [
        'status' => $latencyMs > 2000 ? 'degraded' : 'ok',
        'detail' => 'Query round trip ' . $latencyMs . ' ms.',
        'data' => ['latencyMs' => $latencyMs, 'server' => preg_replace('/[^0-9A-Za-z.\-]/', '', $version)]
    ];
});

// ---------------------------------------------------------------------------
// 2. Edge / CDN: which IP a proxy decision is based on (see api/client_ip.php).
//
//    THE FAILURE THIS CATCHES: when Cloudflare fronts the site, REMOTE_ADDR is
//    an edge IP and the real client arrives in CF-Connecting-IP — but only if
//    that edge IP is on our trusted list. If Cloudflare adds a range we do not
//    know, the header is ignored, EVERY visitor collapses into one client IP,
//    and the Free Beta one-report-per-IP limit starts refusing everyone else
//    while IP rate limits go global. Silent in production, loud here.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('edge', function () {
    $resolution = astro_client_ip_resolution();
    $cfRay = trim((string)($_SERVER['HTTP_CF_RAY'] ?? ''));
    $extraRanges = astro_extra_trusted_proxy_ranges();
    $data = [
        'clientIp' => $resolution['ip'],
        'clientIpSource' => $resolution['source'],
        'remotePeer' => $resolution['remote'],
        'peerTrusted' => $resolution['trustedPeer'],
        'cloudflarePeer' => $resolution['cloudflarePeer'],
        'forwardingHeadersPresent' => $resolution['proxied'],
        'cfRay' => $cfRay !== '' ? substr($cfRay, 0, 40) : null,
        'cdn' => $resolution['cloudflarePeer'] ? 'cloudflare' : ($resolution['proxied'] ? 'other-proxy-or-direct' : 'direct'),
        'trustedRangeCount' => count(astro_cloudflare_ranges()),
        'extraTrustedRanges' => $extraRanges,
        'overrideEnv' => 'TRUSTED_PROXY_RANGES'
    ];

    // A CDN is fronting us but its peer is not trusted: the forwarding header is
    // being discarded and every visitor shares one IP.
    if ($resolution['proxied'] && !$resolution['trustedPeer']) {
        return [
            'status' => 'failing',
            'detail' => 'Forwarding headers arrived from an untrusted peer (' . $resolution['remote']
                . '). The real client IP is NOT being resolved, so IP rate limits and the Free Beta limit are wrong. '
                . 'If this peer belongs to the CDN, add its range to astro_cloudflare_ranges() or TRUSTED_PROXY_RANGES.',
            'data' => $data
        ];
    }

    // Behind Cloudflare but the edge IP was not recognised: stale range list.
    if ($cfRay !== '' && !$resolution['cloudflarePeer']) {
        return [
            'status' => 'failing',
            'detail' => 'Cloudflare is fronting this request (CF-Ray present) but the peer ' . $resolution['remote']
                . ' is not in the trusted range list - refresh it from https://www.cloudflare.com/ips/ or set TRUSTED_PROXY_RANGES.',
            'data' => $data
        ];
    }

    if ($resolution['cloudflarePeer']) {
        return [
            'status' => 'ok',
            'detail' => 'Cloudflare edge detected; the client IP comes from ' . $resolution['source'] . '.',
            'data' => $data
        ];
    }
    if ($resolution['proxied']) {
        return [
            'status' => 'degraded',
            'detail' => 'Forwarding headers are present but the peer is a private/own proxy; verify that is intended.',
            'data' => $data
        ];
    }
    return [
        'status' => 'ok',
        'detail' => 'Direct origin: no CDN proxy in front (the weekly monitor asserts whether Cloudflare is expected).',
        'data' => $data
    ];
});

// ---------------------------------------------------------------------------
// 3. Schema: the tables/columns the payment hardening depends on. A missing
//    one is the difference between "idempotent webhooks" and "double capture".
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('schema', function () use ($pdo) {
    $tables = [];
    try {
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN, 0);
    } catch (Throwable $e) {
        return ['status' => 'failing', 'detail' => 'Could not list tables: ' . substr($e->getMessage(), 0, 120)];
    }
    $tables = array_map('strval', $tables ?: []);
    $required = ['orders', 'users', 'payment_intents', 'payment_webhook_events', 'payment_idempotency_keys', 'beta_ip_claims'];
    $missing = array_values(array_diff($required, $tables));

    $columns = [];
    foreach (['orders' => ['payment_intent_id', 'payment_status', 'group_id'], 'users' => ['token_version']] as $table => $wanted) {
        if (!in_array($table, $tables, true)) continue;
        try {
            $found = $pdo->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll(PDO::FETCH_COLUMN, 0);
            foreach ($wanted as $column) {
                if (!in_array($column, array_map('strval', $found ?: []), true)) {
                    $missing[] = $table . '.' . $column;
                }
            }
        } catch (Throwable $e) {
            $missing[] = $table . '.*';
        }
    }

    if (!empty($missing)) {
        return [
            'status' => 'failing',
            'detail' => 'Missing: ' . implode(', ', $missing) . '. Run api/migrations/ or load api/schema.sql.',
            'data' => ['missing' => $missing, 'tableCount' => count($tables)]
        ];
    }
    return ['status' => 'ok', 'detail' => count($required) . ' required structures present.', 'data' => ['tableCount' => count($tables)]];
});

// ---------------------------------------------------------------------------
// 4. Payment providers: configured + webhook verification wired. Values are
//    never returned - only whether a real (non-placeholder) secret exists.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('payments.providers', function () use ($pdo) {
    $config = astro_payment_provider_config($pdo);
    $razorpayCheckout = !empty($config['razorpay']['configured']);
    $razorpayWebhook = trim((string)($config['razorpay']['webhook_secret'] ?? '')) !== '';
    $paypalCheckout = !empty($config['paypal']['configured']);
    $paypalWebhook = trim((string)($config['paypal']['webhook_id'] ?? '')) !== '';
    $paypalEnvironment = (string)($config['paypal']['environment'] ?? 'sandbox');

    $warnings = [];
    if ($razorpayCheckout && !$razorpayWebhook) $warnings[] = 'Razorpay webhook secret missing - deliveries are rejected.';
    if ($paypalCheckout && !$paypalWebhook) $warnings[] = 'PayPal webhook id missing - deliveries are rejected.';
    if (!$razorpayCheckout && !$paypalCheckout) $warnings[] = 'No online provider is configured.';

    return [
        'status' => empty($warnings) ? 'ok' : 'degraded',
        'detail' => empty($warnings) ? 'Providers configured and webhook verification wired.' : implode(' ', $warnings),
        'data' => [
            'razorpay' => ['checkout' => $razorpayCheckout, 'webhookVerification' => $razorpayWebhook],
            'paypal' => ['checkout' => $paypalCheckout, 'webhookVerification' => $paypalWebhook, 'environment' => $paypalEnvironment]
        ]
    ];
});

// ---------------------------------------------------------------------------
// 5. Capture status: intents that were paid but never bound to an order are a
//    customer waiting for a report they already paid for.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('payments.capture', function () use ($pdo) {
    $byStatus = [];
    $rows = $pdo->query("SELECT status, COUNT(*) AS total FROM payment_intents GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as $row) {
        $byStatus[strtoupper((string)$row['status'])] = (int)$row['total'];
    }
    $staleStmt = $pdo->prepare("SELECT COUNT(*) FROM payment_intents WHERE status = 'CREATED' AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)");
    $staleStmt->execute([ASTRO_HEALTH_STALE_INTENT_MINUTES]);
    $stale = (int)$staleStmt->fetchColumn();

    $captured24h = (int)$pdo->query("SELECT COUNT(*) FROM payment_intents WHERE status IN ('CAPTURED', 'CONSUMED') AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)")->fetchColumn();

    $status = $stale > 0 ? 'degraded' : 'ok';
    return [
        'status' => $status,
        'detail' => $stale > 0
            ? $stale . ' intent(s) still CREATED after ' . ASTRO_HEALTH_STALE_INTENT_MINUTES . ' minutes - check the provider dashboard and /api/admin/payments/recovery.'
            : 'No stale captures.',
        'data' => [
            'byStatus' => $byStatus,
            'staleCreated' => $stale,
            'staleAfterMinutes' => ASTRO_HEALTH_STALE_INTENT_MINUTES,
            'capturedLast24h' => $captured24h
        ]
    ];
});

// ---------------------------------------------------------------------------
// 6. Webhook + idempotency ledger: deliveries must be arriving, and no claim
//    may be stuck IN_PROGRESS (a stuck claim is a capture that was interrupted).
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('payments.webhooks', function () use ($pdo) {
    $byStatus = [];
    $rows = $pdo->query("SELECT status, COUNT(*) AS total FROM payment_webhook_events WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as $row) {
        $byStatus[strtoupper((string)$row['status'])] = (int)$row['total'];
    }
    $lastEventMinutes = null;
    $last = $pdo->query("SELECT TIMESTAMPDIFF(MINUTE, MAX(received_at), NOW()) FROM payment_webhook_events")->fetchColumn();
    if ($last !== null && $last !== false && $last !== '') {
        $lastEventMinutes = (int)$last;
    }

    $idempotency = astro_payment_idempotency_stats($pdo);
    $staleClaims = (int)($idempotency['staleInProgress'] ?? 0);

    if (!empty($idempotency['error'])) {
        return [
            'status' => 'degraded',
            'detail' => 'Idempotency ledger counters are unavailable - the ledger table may be missing.',
            'data' => ['eventsLast24h' => $byStatus, 'idempotency' => ['error' => 'unavailable']]
        ];
    }
    return [
        'status' => $staleClaims > 0 ? 'degraded' : 'ok',
        'detail' => $staleClaims > 0
            ? $staleClaims . ' idempotency claim(s) stuck IN_PROGRESS for over 60s.'
            : 'No stuck claims.',
        'data' => [
            'eventsLast24h' => $byStatus,
            'minutesSinceLastEvent' => $lastEventMinutes,
            'idempotency' => $idempotency
        ]
    ];
});

// ---------------------------------------------------------------------------
// 7. Storage: the API must be able to stage preview PDFs and support docs.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('storage', function () {
    $storageDir = realpath(__DIR__ . '/../storage');
    if ($storageDir === false || !is_dir($storageDir)) {
        return ['status' => 'failing', 'detail' => 'api/storage is missing.'];
    }
    $writable = is_writable($storageDir);
    $docsDir = $storageDir . '/family_docs';
    $files = 0;
    $bytes = 0;
    if (is_dir($docsDir)) {
        foreach (scandir($docsDir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $docsDir . '/' . $entry;
            if (!is_file($path)) continue;
            $files++;
            $bytes += (int)filesize($path);
            if ($files >= 20000) break; // bounded scan; a health probe never walks a huge tree
        }
    }
    return [
        'status' => $writable ? 'ok' : 'failing',
        'detail' => $writable ? 'Storage is writable.' : 'api/storage is NOT writable - preview PDFs and invoices cannot be staged.',
        'data' => ['writable' => $writable, 'supportDocs' => ['files' => $files, 'bytes' => $bytes]]
    ];
});

// ---------------------------------------------------------------------------
// 8. Backups: the marker written by scripts/backup/astro_site_backup.sh. This
//    is what makes "we ran a restore test" auditable instead of assumed.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('backups', function () {
    $marker = __DIR__ . '/../' . ASTRO_HEALTH_BACKUP_MARKER;
    if (!is_file($marker)) {
        return [
            'status' => 'degraded',
            'detail' => 'No backup marker yet. Schedule scripts/backup/astro_site_backup.sh and read docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md.',
            'data' => ['marker' => basename(ASTRO_HEALTH_BACKUP_MARKER), 'present' => false]
        ];
    }
    $raw = (string)@file_get_contents($marker);
    $manifest = json_decode($raw, true);
    if (!is_array($manifest)) {
        return ['status' => 'failing', 'detail' => 'The backup marker is unreadable JSON.', 'data' => ['present' => true]];
    }
    $generatedAt = (string)($manifest['generatedAt'] ?? '');
    $timestamp = strtotime($generatedAt);
    if ($timestamp === false) {
        return ['status' => 'failing', 'detail' => 'The backup marker has no usable generatedAt.', 'data' => ['present' => true]];
    }
    $ageDays = (int)floor((time() - $timestamp) / 86400);
    $storageIncluded = !empty($manifest['storage']['included']);
    $data = [
        'present' => true,
        'generatedAt' => $generatedAt,
        'ageDays' => $ageDays,
        'storageIncluded' => $storageIncluded,
        'databaseDumpBytes' => (int)($manifest['database']['dumpBytes'] ?? 0),
        'storageBytes' => (int)($manifest['storage']['bytes'] ?? 0),
        'storageFiles' => (int)($manifest['storage']['files'] ?? 0),
        'retention' => (int)($manifest['retention']['keep'] ?? 0)
    ];

    if (!$storageIncluded) {
        return ['status' => 'failing', 'detail' => 'The last backup did NOT include api/storage (support PDFs / documents).', 'data' => $data];
    }
    if ($ageDays >= ASTRO_HEALTH_BACKUP_OVERDUE_DAYS) {
        return ['status' => 'failing', 'detail' => 'The last backup is ' . $ageDays . ' days old - the weekly dump is overdue.', 'data' => $data];
    }
    return [
        'status' => $ageDays >= 7 ? 'degraded' : 'ok',
        'detail' => 'Last backup ' . $ageDays . ' day(s) ago, database + storage included.',
        'data' => $data
    ];
});

// ---------------------------------------------------------------------------
// 9. Logging: structured payment logs are useless if error_log goes nowhere.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('logging', function () {
    $logErrors = (bool)ini_get('log_errors');
    $displayErrors = (bool)ini_get('display_errors');
    $errorLog = trim((string)ini_get('error_log'));
    $data = [
        'logErrors' => $logErrors,
        'displayErrors' => $displayErrors,
        'destination' => $errorLog !== '' ? $errorLog : '(SAPI default - cPanel Apache/PHP error log)',
        'errorReporting' => (string)ini_get('error_reporting')
    ];
    if ($errorLog !== '' && is_file($errorLog)) {
        $data['logBytes'] = (int)filesize($errorLog);
        $data['logAgeMinutes'] = (int)floor((time() - (int)filemtime($errorLog)) / 60);
    } elseif ($errorLog !== '') {
        $data['logFilePresent'] = false;
    }

    if (!$logErrors) {
        return ['status' => 'failing', 'detail' => 'log_errors is OFF - payment and webhook failures are invisible.', 'data' => $data];
    }
    if ($displayErrors) {
        return ['status' => 'degraded', 'detail' => 'display_errors is ON - PHP notices could leak paths to customers.', 'data' => $data];
    }
    return ['status' => 'ok', 'detail' => 'Errors are logged to ' . $data['destination'] . '.', 'data' => $data];
});

// ---------------------------------------------------------------------------
// 10. Runtime: report the limits that silently drop preview PDF uploads, and
//    whether the report renderer (vendor/mPDF) is actually installed.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('runtime', function () {
    $vendor = is_dir(__DIR__ . '/../vendor');
    $mpdf = $vendor && (is_dir(__DIR__ . '/../vendor/mpdf') || is_file(__DIR__ . '/../vendor/autoload.php'));
    $postMax = (string)ini_get('post_max_size');
    $uploadMax = (string)ini_get('upload_max_filesize');
    $toBytes = function ($value) {
        $value = trim((string)$value);
        if ($value === '') return 0;
        $unit = strtolower(substr($value, -1));
        $number = (float)$value;
        if ($unit === 'g') return (int)($number * 1073741824);
        if ($unit === 'm') return (int)($number * 1048576);
        if ($unit === 'k') return (int)($number * 1024);
        return (int)$number;
    };
    $postMaxBytes = $toBytes($postMax);
    $data = [
        'phpVersion' => PHP_VERSION,
        'memoryLimit' => (string)ini_get('memory_limit'),
        'postMaxSize' => $postMax,
        'uploadMaxFilesize' => $uploadMax,
        'maxExecutionTime' => (string)ini_get('max_execution_time'),
        'vendorInstalled' => $vendor,
        'mpdfAvailable' => $mpdf,
        'timezone' => date_default_timezone_get()
    ];

    if (!$mpdf) {
        return ['status' => 'degraded', 'detail' => 'vendor/mPDF not detected - server-side report PDFs may fall back or fail.', 'data' => $data];
    }
    if ($postMaxBytes > 0 && $postMaxBytes < 33554432) {
        return ['status' => 'degraded', 'detail' => 'post_max_size is ' . $postMax . ' - admin preview uploads need at least 32M (api/.user.ini sets 128M).', 'data' => $data];
    }
    return ['status' => 'ok', 'detail' => 'PHP ' . PHP_VERSION . ' with the expected limits.', 'data' => $data];
});

// ---------------------------------------------------------------------------
// 11. Disk: shared hosting suspends accounts that fill the quota. Best effort -
//     disk_free_space() is often disabled.
// ---------------------------------------------------------------------------
$checks[] = astro_health_run('disk', function () {
    if (!function_exists('disk_free_space')) {
        return ['status' => 'ok', 'detail' => 'disk_free_space() unavailable - skipped.', 'data' => ['available' => false]];
    }
    try {
        $free = @disk_free_space(__DIR__ . '/..');
    } catch (Throwable $e) {
        $free = false;
    }
    if ($free === false) {
        return ['status' => 'ok', 'detail' => 'Disk figures unavailable on this host.', 'data' => ['available' => false]];
    }
    $free = (float)$free;
    return [
        'status' => $free < 524288000 ? 'degraded' : 'ok',
        'detail' => number_format($free / 1048576, 1) . ' MB free.',
        'data' => ['available' => true, 'freeBytes' => (int)$free]
    ];
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
$summary = ['ok' => 0, 'degraded' => 0, 'failing' => 0];
foreach ($checks as $check) {
    $key = (string)($check['status'] ?? 'degraded');
    if (!isset($summary[$key])) $key = 'degraded';
    $summary[$key]++;
}
$overall = $summary['failing'] > 0 ? 'failing' : ($summary['degraded'] > 0 ? 'degraded' : 'ok');

if ($overall !== 'ok') {
    // One line per probe run, so an intermittent problem leaves a trail in the
    // log that the host rotates (see the runbook).
    astro_payment_log_structured('admin_health_' . $overall, [
        'source' => 'admin/health.php',
        'adminId' => (string)($admin['id'] ?? ''),
        'failed' => array_values(array_map(
            function ($check) { return (string)$check['name']; },
            array_filter($checks, function ($check) { return ($check['status'] ?? '') === 'failing'; })
        ))
    ]);
}

jsonResponse([
    'success' => true,
    'service' => 'ASTRO SIVAM admin health',
    'status' => $overall,
    'generatedAt' => gmdate('c'),
    'durationMs' => (int)round((microtime(true) - $startedAt) * 1000),
    'summary' => $summary,
    'checks' => $checks
], $overall === 'failing' ? 503 : 200);
