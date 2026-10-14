<?php
/* ==========================================================================
 * TEST DOUBLE - never deployed, never loaded by production code.
 *
 * scripts/php-admin-api-bridge.mjs appends this block to the REAL api/db.php
 * inside the php-wasm virtual filesystem, after renaming the real
 * getDbConnection() out of the way. Every other db.php function (logAudit,
 * the schema helpers, ...) keeps its real implementation.
 *
 * The admin routes are written for MySQL. This double runs them against a
 * throwaway SQLite file (ASTRO_TEST_SQLITE) and translates only the handful
 * of MySQL-only constructs those routes use. No real database is touched.
 * ======================================================================== */

final class AstroSqliteTestPdo extends PDO
{
    public function __construct(string $file)
    {
        parent::__construct('sqlite:' . $file, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $now = static function () {
            return date('Y-m-d H:i:s');
        };
        $this->sqliteCreateFunction('NOW', $now, 0);
        parent::exec('PRAGMA busy_timeout = 5000');
    }

    /** True when the SQLite file already has the table (MySQL DDL is then a no-op). */
    private function tableExists(string $table): bool
    {
        $stmt = parent::prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1");
        $stmt->execute([$table]);
        return (bool) $stmt->fetchColumn();
    }

    /**
     * MySQL -> SQLite for the statements the admin routes issue.
     * Returns null when the statement is a deliberate no-op under SQLite.
     */
    private function translate(string $sql): ?string
    {
        $trimmed = ltrim($sql);
        if (preg_match('/^SET\s+(NAMES|SESSION|time_zone)\b/i', $trimmed)) {
            return null;
        }
        if (preg_match('/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?/i', $trimmed, $m)) {
            // The bridge pre-creates every table the routes use, so runtime
            // "ensure table" DDL (written in MySQL dialect) is a no-op here.
            if ($this->tableExists($m[1])) {
                return null;
            }
            throw new PDOException('SQLite test double: table ' . $m[1] . ' is not pre-created by the bridge schema.');
        }
        if (preg_match('/^ALTER\s+TABLE\b/i', $trimmed)) {
            // Schema migrations are MySQL-specific; the test schema is final.
            return null;
        }
        if (preg_match('/^SHOW\s+COLUMNS\s+FROM\s+`?([A-Za-z0-9_]+)`?(?:\s+LIKE\s+(.+))?$/is', $trimmed, $m)) {
            $sqlite = "SELECT name AS Field, type AS Type FROM pragma_table_info('" . $m[1] . "')";
            if (!empty($m[2])) {
                $sqlite .= ' WHERE name LIKE ' . trim($m[2]);
            }
            return $sqlite;
        }
        if (preg_match('/^SHOW\s+TABLES\s+LIKE\s+(.+)$/is', $trimmed, $m)) {
            return "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE " . trim($m[1]);
        }

        $sql = preg_replace('/\bINSERT\s+IGNORE\b/i', 'INSERT OR IGNORE', $sql);
        if (preg_match('/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i', $sql)) {
            list($insert, $update) = preg_split('/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i', $sql, 2);
            // MySQL VALUES(col) is SQLite excluded.col inside the upsert clause.
            $update = preg_replace('/\bVALUES\s*\(\s*`?([A-Za-z0-9_]+)`?\s*\)/i', 'excluded.$1', $update);
            $sql = $insert . ' ON CONFLICT DO UPDATE SET ' . $update;
        }
        // MySQL IF(cond, a, b) is SQLite IIF(cond, a, b).
        $sql = preg_replace('/\bIF\s*\(/i', 'IIF(', $sql);
        // Row locks do not exist in SQLite (one writer at a time anyway).
        $sql = preg_replace('/\bFOR\s+UPDATE\b/i', '', $sql);
        return $sql;
    }

    #[\ReturnTypeWillChange]
    public function prepare($query, $options = [])
    {
        $sql = $this->translate((string) $query);
        return parent::prepare($sql === null ? 'SELECT 1 WHERE 0' : $sql, $options);
    }

    #[\ReturnTypeWillChange]
    public function exec($statement)
    {
        $sql = $this->translate((string) $statement);
        return $sql === null ? 0 : parent::exec($sql);
    }

    #[\ReturnTypeWillChange]
    public function query($query, $fetchMode = null, ...$fetchModeArgs)
    {
        $sql = $this->translate((string) $query);
        $sql = $sql === null ? 'SELECT 1 WHERE 0' : $sql;
        if ($fetchMode === null) {
            return parent::query($sql);
        }
        return parent::query($sql, $fetchMode, ...$fetchModeArgs);
    }
}

function getDbConnection()
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $file = getenv('ASTRO_TEST_SQLITE');
    if (!is_string($file) || $file === '') {
        throw new RuntimeException('ASTRO_TEST_SQLITE is not set; the SQLite test double refuses to guess a database.');
    }
    $pdo = new AstroSqliteTestPdo($file);
    return $pdo;
}
