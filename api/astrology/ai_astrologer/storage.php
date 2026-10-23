<?php
/**
 * ASTRO SIVAM — AI Astrologer Session & Message Persistence
 */

/**
 * Split the small, checked-in chat migration into statements.
 *
 * Strip full-line SQL comments before splitting: the migration's documentation
 * contains semicolons, and splitting first would truncate CREATE TABLE blocks
 * (then silently leave the chat tables missing on a fresh database).
 */
function astro_ai_migration_statements(string $sql): array
{
    $sql = preg_replace('/^[[:blank:]]*--.*$/m', '', $sql);
    if (!is_string($sql)) {
        throw new RuntimeException('AI Astrologer schema comments could not be parsed.');
    }

    $statements = [];
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $statements[] = $statement;
        }
    }
    return $statements;
}

/** Verify chat tables exist (zero-DDL fast path for hardened DB users & SQLite). */
function astro_ai_ensure_tables(PDO $pdo): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    // Fast path: when schema.sql + migrations have already run (and CREATE/ALTER
    // privileges have been revoked per BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md),
    // verify the required tables and person_id column using pure SELECT queries
    // so zero DDL privilege is ever needed at runtime.
    try {
        $pdo->query('SELECT person_id FROM ai_chat_sessions LIMIT 0');
        $pdo->query('SELECT id FROM ai_chat_messages LIMIT 0');
        $pdo->query('SELECT id FROM ai_chat_handoffs LIMIT 0');
        $ready = true;
        return;
    } catch (Throwable $_probeError) {
        // Fall through to bootstrap DDL on fresh databases that still hold CREATE.
    }

    $path = dirname(__DIR__, 2) . '/migrations/007_ai_astrologer_chat.sql';
    $sql = @file_get_contents($path);
    if (!is_string($sql) || trim($sql) === '') {
        throw new RuntimeException('AI Astrologer chat schema migration is missing or empty.');
    }

    foreach (astro_ai_migration_statements($sql) as $statement) {
        $pdo->exec($statement);
    }

    // Databases created before the family person picker predate the person_id
    // column: migration 007 only covers fresh CREATEs, so the ALTER lives in
    // api/migrations/014_ai_chat_person_id.sql. Web requests never ALTER
    // TABLE (the web DB user is granted no ALTER privilege), so verify the
    // column exists and fail loudly when the migration was skipped.
    $cols = $pdo->query("SHOW COLUMNS FROM `ai_chat_sessions` LIKE 'person_id'");
    if (!$cols || !$cols->fetch()) {
        error_log('ASTRO SIVAM: ai_chat_sessions.person_id is missing; run api/migrations/014_ai_chat_person_id.sql on this database.');
        jsonResponse(['success' => false, 'message' => 'Service temporarily unavailable. Please try again shortly.'], 503);
    }
    $ready = true;
}

/** A new conversation id. Prefixed so it is obvious in a log line. */
function astro_ai_new_session_id(): string
{
    return 'AICHAT-' . strtoupper(bin2hex(random_bytes(12)));
}

/**
 * Writes one message row and returns its id.
 *
 * This is called BEFORE the customer sees anything, which is what makes the
 * retry path honest: a failed generation is a FAILED row, not a silent gap.
 */
function astro_ai_save_message(
    PDO $pdo,
    string $sessionId,
    string $userId,
    string $role,
    string $language,
    string $content,
    array $extra = []
): int {
    $stmt = $pdo->prepare(
        "INSERT INTO ai_chat_messages
            (session_id, user_id, role, language, content, area_id, section_id, sources,
             status, attempt, latency_ms, error_message,
             attachment_kind, attachment_filename, attachment_bytes,
             attachment_order_number, attachment_rejection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $sessionId,
        $userId,
        $role,
        $language,
        $content,
        $extra['area_id'] ?? null,
        $extra['section_id'] ?? null,
        $extra['sources'] ?? null,
        $extra['status'] ?? 'SAVED',
        $extra['attempt'] ?? 1,
        $extra['latency_ms'] ?? null,
        $extra['error_message'] ?? null,
        $extra['attachment_kind'] ?? null,
        $extra['attachment_filename'] ?? null,
        $extra['attachment_bytes'] ?? null,
        $extra['attachment_order_number'] ?? null,
        $extra['attachment_rejection'] ?? null,
    ]);

    $id = (int) $pdo->lastInsertId();

    $touch = $pdo->prepare(
        "UPDATE ai_chat_sessions
            SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP
          WHERE id = ?"
    );
    $touch->execute([$sessionId]);

    return $id;
}

/** Loads a session, and refuses if it is not this customer's. */
function astro_ai_load_session(PDO $pdo, string $sessionId, string $userId): ?array
{
    $stmt = $pdo->prepare("SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1");
    $stmt->execute([$sessionId, $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * The recent conversation, oldest first, capped for efficient history paging.
 * The full conversation remains available through history(); customer replies
 * are built from the current question and local chart/source data.
 */
function astro_ai_recent_messages(PDO $pdo, string $sessionId): array
{
    $stmt = $pdo->prepare(
        "SELECT id, role, language, content, area_id, sources, status, created_at
           FROM ai_chat_messages
          WHERE session_id = ? AND status IN ('SENT', 'SAVED')
          ORDER BY id DESC
          LIMIT " . AI_ASTROLOGER_HISTORY_CONTEXT_MESSAGES
    );
    $stmt->execute([$sessionId]);
    return array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC));
}

