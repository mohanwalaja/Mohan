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
        // Return sanitized JSON error without leaking DB credentials, host, or server paths
        jsonResponse([
            'success' => false,
            'message' => 'Database service temporarily unavailable. Please try again later.'
        ], 500);
    }
}

/**
 * Adds the columns used by session revocation and password reset to `users`.
 * Idempotent: it runs once per process and only issues ALTER TABLE for columns
 * that are missing. See api/migrations/006_password_reset_and_token_revocation.sql.
 */
function astro_ensure_auth_security_schema($pdo) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $columns = [
        'token_version' => "ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0",
        'password_reset_hash' => "ALTER TABLE users ADD COLUMN password_reset_hash VARCHAR(255) NULL",
        'password_reset_expires_at' => "ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL",
        'password_reset_attempts' => "ALTER TABLE users ADD COLUMN password_reset_attempts INT UNSIGNED NOT NULL DEFAULT 0",
    ];
    try {
        $existing = $pdo->query("SHOW COLUMNS FROM `users`")->fetchAll(PDO::FETCH_COLUMN, 0);
        foreach ($columns as $name => $sql) {
            if (!in_array($name, $existing, true)) {
                $pdo->exec($sql);
            }
        }
    } catch (Exception $e) {
        error_log('ASTRO SIVAM: auth security schema check failed - ' . $e->getMessage());
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
 * Idempotent: it runs once per process and only issues DDL that is missing.
 * Mirrors api/migrations/009_refund_workflow.sql, so an installation that has
 * not been migrated by hand still works.
 */
function astro_ensure_refund_schema($pdo) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $columns = array(
        'refund_percent' => "ALTER TABLE orders ADD COLUMN refund_percent DECIMAL(5,2) NULL AFTER refund_reason",
        'refund_amount' => "ALTER TABLE orders ADD COLUMN refund_amount DECIMAL(10,2) NULL AFTER refund_percent",
        'refund_currency' => "ALTER TABLE orders ADD COLUMN refund_currency VARCHAR(8) NULL AFTER refund_amount",
        'refund_processed_at' => "ALTER TABLE orders ADD COLUMN refund_processed_at DATETIME NULL AFTER refund_currency",
        'refund_deadline' => "ALTER TABLE orders ADD COLUMN refund_deadline DATETIME NULL AFTER refund_processed_at",
        'refund_admin_notes' => "ALTER TABLE orders ADD COLUMN refund_admin_notes TEXT NULL AFTER refund_deadline",
    );

    try {
        $rows = $pdo->query("SHOW COLUMNS FROM `orders`")->fetchAll(PDO::FETCH_ASSOC);
        $existing = array();
        $statusType = '';
        foreach ($rows as $row) {
            $existing[] = $row['Field'];
            if ($row['Field'] === 'status') {
                $statusType = (string) $row['Type'];
            }
        }

        foreach ($columns as $name => $sql) {
            if (!in_array($name, $existing, true)) {
                $pdo->exec($sql);
            }
        }

        if ($statusType !== '' && stripos($statusType, "'REFUNDED'") === false) {
            $pdo->exec("ALTER TABLE `orders` MODIFY COLUMN `status` ENUM("
                . "'PENDING','PENDING_APPROVAL','PENDING_PAYMENT_VERIFICATION','PROCESSING',"
                . "'COMPLETED','GENERATED','REJECTED','CANCELLED','REFUNDED'"
                . ") NOT NULL DEFAULT 'PENDING'");
        }
    } catch (Exception $e) {
        error_log('ASTRO SIVAM: refund schema check failed - ' . $e->getMessage());
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
        $id = uniqid('aud_', true);
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
