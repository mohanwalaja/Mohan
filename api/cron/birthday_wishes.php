<?php
/**
 * ASTRO SIVAM - daily birthday wishes (cron entry point)
 * ------------------------------------------------------
 * Sends the birthday wishes that are due TODAY to customers who opted in, on
 * the WhatsApp/Viber number they verified. All the rules live in
 * api/birthday_wishes.php; this file is only the scheduler's handle on them:
 * CLI-only, one run at a time, idempotent, loud in the log, honest in its exit
 * code.
 *
 * SCHEDULE (cPanel > Cron Jobs, daily at 08:00 IST):
 *   0 8 * * *  /usr/local/bin/php /home/<account>/public_html/api/cron/birthday_wishes.php >> /home/<account>/logs/birthday_wishes.log 2>&1
 *
 * Run it by hand any time — it is safe to repeat:
 *   php api/cron/birthday_wishes.php                 # send today's wishes
 *   php api/cron/birthday_wishes.php --dry-run       # decide, send nothing
 *   php api/cron/birthday_wishes.php --date=2026-03-14
 *   php api/cron/birthday_wishes.php --limit=25
 *
 * WHY CLI-ONLY
 *   There is no HTTP surface here at all: no token to leak, no rate limit to
 *   exhaust, no way for a stranger to trigger a burst of paid gateway messages.
 *   The Admin Portal has its own authenticated "Preview today" / "Send now"
 *   routes for the same dispatcher.
 *
 * IDEMPOTENT BY DESIGN
 *   birthday_wishes_log's UNIQUE (user_id, person_key, wish_year, channel) key
 *   means a second run the same day — or a cron that fires twice because the
 *   host clock drifted — logs "already wished this year" and sends nothing. A
 *   flock stops two runs overlapping in the first place.
 */

if (PHP_SAPI !== 'cli') {
    // Never reachable over HTTP: see WHY CLI-ONLY above.
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Not Found\n";
    exit;
}

$startedAt = microtime(true);

/** One line to stdout (cron redirects it to the log) with a timestamp. */
function birthday_cron_log($message)
{
    echo '[' . date('Y-m-d H:i:s') . "] {$message}\n";
}

/**
 * Parse the small argument set. Unknown flags are a hard error: a typo in a
 * crontab should fail loudly, not quietly send the wrong day's wishes.
 */
function birthday_cron_args(array $argv): array
{
    $args = ['date' => '', 'dryRun' => false, 'limit' => null, 'help' => false];
    foreach (array_slice($argv, 1) as $arg) {
        if ($arg === '--dry-run') {
            $args['dryRun'] = true;
        } elseif ($arg === '--help' || $arg === '-h') {
            $args['help'] = true;
        } elseif (strpos($arg, '--date=') === 0) {
            $args['date'] = trim(substr($arg, 7));
        } elseif (strpos($arg, '--limit=') === 0) {
            $args['limit'] = (int)substr($arg, 8);
        } else {
            fwrite(STDERR, "Unknown argument: {$arg}\n");
            exit(2);
        }
    }
    return $args;
}

$args = birthday_cron_args($argv);

if ($args['help']) {
    echo "Usage: php api/cron/birthday_wishes.php [--date=YYYY-MM-DD] [--dry-run] [--limit=N]\n";
    exit(0);
}

// ---------------------------------------------------------------------------
// One run at a time. A slow gateway plus a second cron tick must not produce two
// overlapping sends; the log's unique key would catch the duplicate, but the
// lock keeps the run (and the log) clean.
// ---------------------------------------------------------------------------
$lockDir = __DIR__ . '/../storage';
if (!is_dir($lockDir)) {
    @mkdir($lockDir, 0755, true);
}
$lockFile = $lockDir . '/birthday_wishes.lock';
$lock = @fopen($lockFile, 'c');
if ($lock === false) {
    birthday_cron_log("could not open the lock file ({$lockFile}); running without a lock");
} else {
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        birthday_cron_log('another birthday-wish run is still in progress; this run exits without sending.');
        exit(0);
    }
}

// ---------------------------------------------------------------------------
// Bootstrap. config.php/db.php are the same entry points every web request uses,
// so credentials resolve exactly as they do for the site (env > api/.env >
// config.php). The placeholder check runs BEFORE getDbConnection(), because that
// function answers a failed configuration with jsonResponse() + exit(0) — which
// would tell cron the run succeeded.
// ---------------------------------------------------------------------------
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../birthday_wishes.php';

foreach (['DB_NAME' => DB_NAME, 'DB_USER' => DB_USER, 'DB_PASS' => DB_PASS] as $name => $value) {
    if (!is_string($value) || trim($value) === '' || in_array($value, ['CHANGE_PASSWORD', 'PASTE_NEW_DB_PASSWORD_HERE'], true)) {
        birthday_cron_log("database {$name} is not configured (api/config.php); nothing was sent.");
        exit(1);
    }
}

try {
    $pdo = getDbConnection();
} catch (\Throwable $e) {
    birthday_cron_log('database connection failed: ' . $e->getMessage());
    exit(1);
}

// CREATE TABLE IF NOT EXISTS only — this script is the one place the feature may
// touch DDL, so an un-migrated install still works (migration 020 is the
// supported route on production).
AstroBirthdayWishes::ensureTables($pdo);

$settings = AstroBirthdayWishes::getWishSettings($pdo);
birthday_cron_log(sprintf(
    'starting (date=%s, timezone=%s, dry-run=%s, feature=%s, chat=%s, whatsapp=%s, viber=%s)',
    $args['date'] !== '' ? $args['date'] : 'today',
    $settings['timezone'],
    $args['dryRun'] ? 'yes' : 'no',
    $settings['enabled'] ? 'on' : 'off',
    $settings['chatEnabled'] ? 'on' : 'off',
    $settings['whatsappConfigured'] ? 'configured' : 'not configured',
    $settings['viberConfigured'] ? 'configured' : 'not configured'
));

$options = ['dryRun' => $args['dryRun']];
if ($args['date'] !== '') {
    $options['date'] = $args['date'];
}
if ($args['limit'] !== null) {
    $options['limit'] = $args['limit'];
}

$summary = AstroBirthdayWishes::sendDueWishes($pdo, $options);

birthday_cron_log((string)($summary['message'] ?? 'no summary'));
foreach ((array)($summary['details'] ?? []) as $detail) {
    birthday_cron_log(sprintf(
        '  - %s [%s%s] %s%s',
        (string)($detail['person'] ?? '?'),
        (string)($detail['channel'] ?? '-'),
        isset($detail['relation']) ? ':' . $detail['relation'] : '',
        (string)($detail['status'] ?? '?'),
        !empty($detail['reason']) ? ' (' . $detail['reason'] . ')' : ''
    ));
}

if ($lock !== false && $lock !== null) {
    flock($lock, LOCK_UN);
    fclose($lock);
}

$elapsed = round(microtime(true) - $startedAt, 2);
birthday_cron_log("finished in {$elapsed}s: due={$summary['due']} sent={$summary['sent']} failed={$summary['failed']} skipped={$summary['skipped']}");

// A failed gateway call is not a failed cron run (the wish is logged and will not
// be retried into a loop); only a run that could not do its job exits non-zero.
exit(empty($summary['success']) ? 1 : 0);
