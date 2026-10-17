<?php
/**
 * ASTRO SIVAM - PDO Database Connector
 */
require_once __DIR__ . '/config.php';

function getDbConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    // Refuse to start (instead of connecting with an empty/placeholder
    // identity) while the password is still the CHANGE_PASSWORD placeholder
    // from config.php or any credential is missing. The caller-facing message stays generic; the log names the
    // missing variable so the operator can fix the server configuration.
    foreach (['DB_NAME' => DB_NAME, 'DB_USER' => DB_USER, 'DB_PASS' => DB_PASS] as $var => $value) {
        if (!is_string($value) || trim($value) === '' || in_array($value, ['PASTE_NEW_DB_PASSWORD_HERE', 'CHANGE_PASSWORD'], true)) {
            error_log("ASTRO SIVAM: database {$var} is not configured (missing or still the CHANGE_PASSWORD placeholder in api/config.php); refusing to connect.");
            jsonResponse([
                'success' => false,
                'message' => 'Database service temporarily unavailable. Please try again later.'
            ], 500);
        }
    }

    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        $pdo->exec("SET NAMES 'utf8mb4'");
        astro_ensure_auth_security_schema($pdo);
        astro_ensure_refund_schema($pdo);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection error: " . $e->getMessage());
        // Return sanitized JSON error without leaking DB credentials, host, or server paths.
        // `retryable`: shared hosting briefly refuses connections ("too many
        // connections", a restarting MySQL). A client that can safely resend
        // (the Google sign-in does) tries again instead of showing the visitor
        // a failure they would only clear by clicking "Try Again" themselves.
        jsonResponse([
            'success' => false,
            'retryable' => true,
            'message' => 'Database service temporarily unavailable. Please try again later.'
        ], 500);
    }
}

/**
 * Verifies the columns used by session revocation and password reset exist on
 * `users` — WITHOUT running DDL.
 *
 * Those columns live in api/migrations/006_password_reset_and_token_revocation.sql
 * (and api/schema.sql for fresh installs). Web requests must never ALTER TABLE:
 * the web DB user is granted no ALTER privilege, so an attempt would only fail —
 * and a swallowed failure would surface later as a confusing "Unknown column"
 * error. This check fails loudly at connect time instead. It runs once per
 * process; the SHOW COLUMNS probe costs the same as the old self-migration.
 */
function astro_ensure_auth_security_schema($pdo) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        $existing = $pdo->query("SHOW COLUMNS FROM `users`")->fetchAll(PDO::FETCH_COLUMN, 0);
    } catch (Exception $e) {
        error_log('ASTRO SIVAM: auth security schema check failed - ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
    foreach (['token_version', 'password_reset_hash', 'password_reset_expires_at', 'password_reset_attempts'] as $column) {
        if (!in_array($column, $existing, true)) {
            error_log("ASTRO SIVAM: users.{$column} is missing; run api/migrations/006_password_reset_and_token_revocation.sql on this database.");
            jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
        }
    }
}

/**
 * Adds the refund-workflow columns and widens the `orders.status` enum so the
 * one-click pre-approval refund can be recorded.
 *
 * WHY THE ENUM CHANGE: api/schema.sql originally declared
 *   status ENUM('PENDING','PROCESSING','COMPLETED','REJECTED','CANCELLED')
 * but the refund path has to store 'REFUNDED'. On a strict-mode MySQL that
 * write fails (or, worse, stores an empty string), which would silently lose
 * the refund state and let the customer's AI-chat entitlement stay alive.
 * Widening the enum is idempotent and safe: existing values keep their index.
 *
 * VERIFY-ONLY: it runs once per process and never issues DDL. The columns and
 * the widened enum live in api/migrations/009_refund_workflow.sql (and
 * api/schema.sql for fresh installs); web requests must never ALTER TABLE
 * because the web DB user is granted no ALTER privilege. A database that has
 * not been migrated fails loudly here (503 + a log line naming the migration)
 * instead of breaking later mid-refund.
 */
function astro_ensure_refund_schema($pdo) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $columns = array(
        'refund_percent', 'refund_amount', 'refund_currency', 'refund_processed_at',
        'refund_deadline', 'refund_admin_notes', 'refund_method', 'refund_reference',
    );

    try {
        $rows = $pdo->query("SHOW COLUMNS FROM `orders`")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        error_log('ASTRO SIVAM: refund schema check failed - ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
    $existing = array();
    $statusType = '';
    foreach ($rows as $row) {
        $existing[] = $row['Field'];
        if ($row['Field'] === 'status') {
            $statusType = (string) $row['Type'];
        }
    }

    foreach ($columns as $name) {
        if (!in_array($name, $existing, true)) {
            error_log("ASTRO SIVAM: orders.{$name} is missing; run api/migrations/009_refund_workflow.sql on this database.");
            jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
        }
    }

    if ($statusType !== '' && stripos($statusType, "'REFUNDED'") === false) {
        error_log('ASTRO SIVAM: orders.status enum lacks REFUNDED; run api/migrations/009_refund_workflow.sql on this database.');
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
}

/**
 * MySQLi Database Connector (UTF-8mb4 guaranteed)
 */
function getMysqliConnection() {
    static $mysqli = null;
    if ($mysqli !== null) {
        return $mysqli;
    }

    if (!is_string(DB_NAME) || trim(DB_NAME) === ''
        || !is_string(DB_USER) || trim(DB_USER) === ''
        || !is_string(DB_PASS) || trim(DB_PASS) === '' || in_array(DB_PASS, ['PASTE_NEW_DB_PASSWORD_HERE', 'CHANGE_PASSWORD'], true)) {
        error_log('ASTRO SIVAM: database credentials are not configured in the server environment; mysqli connection refused.');
        return null;
    }
    $mysqli = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, (int)DB_PORT);
    if ($mysqli->connect_errno) {
        return null;
    }
    $mysqli->set_charset("utf8mb4");
    return $mysqli;
}

/**
 * Log action into audit_logs table
 */
function logAudit($pdo, $userId, $userName, $userRole, $action, $details = '') {
    try {
        $stmt = $pdo->prepare("INSERT INTO audit_logs (id, user_id, user_name, user_role, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
        $id = astro_random_id('aud_', 16);
        // The spoof-resistant resolver, so an audit entry names the real client
        // instead of the CDN/proxy hop. It only trusts forwarding headers from a
        // peer we actually run behind (see api/client_ip.php).
        $ip = function_exists('getClientIpAddress')
            ? (string)getClientIpAddress()
            : (string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $stmt->execute([$id, $userId, $userName, $userRole, $action, $details, $ip]);
    } catch (Exception $e) {
        // Silent catch for audit logs
    }
}
