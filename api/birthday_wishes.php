<?php
/**
 * ASTRO SIVAM - Birthday Wish Dispatcher (WhatsApp / Viber)
 * --------------------------------------------------------
 * Owner request (2026-10-21): "whoever saves their birth details on the website
 * should get birthday wishes on WhatsApp or Viber on their birthday."
 *
 * WHO IS WATCHED
 *   The account holder's own saved birth profile AND every family member they
 *   saved (up to six people per account, migration 016). Both tables already
 *   hold a canonical `dob` (YYYY-MM-DD), so no new birth data is collected for
 *   this feature — it reuses what the customer chose to save.
 *
 * WHO RECEIVES
 *   The account holder's ONE saved mobile number, and only in an app they
 *   verified with an OTP (AstroChatAlerts::verifiedChatTargets). A birthday for
 *   a saved family member is delivered to the account holder as a greeting +
 *   reminder, because the site holds no verified number for the family member
 *   and never asks for one.
 *
 * THE SAME RULES AS ORDER ALERTS (tests/chat-alerts-verified-and-download-language)
 *   * verified numbers only — never `users.mobile`, never an order's
 *     `user_mobile`, never a number saved but not yet verified;
 *   * TEXT ONLY — a report PDF, invoice PDF or any attachment is NEVER sent over
 *     chat. Email stays the only document channel, so a wish never carries one;
 *   * best-effort — a gateway outage must never break anything else, so every
 *     network call is wrapped and failures only reach the log + audit trail.
 *
 * CONSENT (this is the part that differs from order alerts)
 *   An order alert is transactional: the customer is told at checkout that it
 *   may arrive by chat. A birthday wish is not, and WhatsApp's own business
 *   policy requires opt-in for it, so NOTHING is sent until the customer
 *   switches "Birthday wishes" on themselves in their profile
 *   (`birthday_wish_preferences`, default OFF). The switch is stored with the
 *   language the site was in when they turned it on, which is the language the
 *   wish is written in (English / Tamil / Hindi).
 *
 * RUNS FROM
 *   1. cron — api/cron/birthday_wishes.php (CLI, daily, idempotent);
 *   2. Admin Portal > WhatsApp & Viber Alerts > Birthday wishes ("Preview
 *      today" / "Send now"), which calls the same dispatcher for one date.
 *   Both are deduped by birthday_wishes_log's UNIQUE (user, person, year,
 *   channel) key, so a re-run — or a cron that fires twice — can never wish the
 *   same person twice in the same year.
 *
 * CONFIGURATION
 *   system_settings.general_settings.chatAlertSettings.birthdayWishes:
 *     enabled             master switch (default false — the operator turns it on)
 *     timezone            the day boundaries wishes are matched in (default Asia/Kolkata)
 *     includeFamilyMembers also wish saved family members (default true)
 *   The WhatsApp/Viber transports, credentials and the chat master switch are
 *   the existing chatAlertSettings — this file adds no second gateway.
 */

require_once __DIR__ . '/chat_alerts.php';

class AstroBirthdayWishes
{
    /** The business is in India; birthday boundaries follow Indian Standard Time. */
    const DEFAULT_TIMEZONE = 'Asia/Kolkata';

    /** The three languages the site itself is available in. */
    const LANGUAGES = ['en', 'ta', 'hi'];

    /**
     * Safety valve for one run. A daily cron normally sends a handful of
     * wishes; this stops a mis-set clock or a backfilled date from firing an
     * unbounded burst of paid gateway messages in one go.
     */
    const MAX_MESSAGES_PER_RUN = 500;

    // ------------------------------------------------------------------
    // Schema
    // ------------------------------------------------------------------

    /**
     * Create this feature's tables on first use.
     *
     * CREATE TABLE IF NOT EXISTS only — never ALTER. The deployment guide asks
     * the operator to revoke ALTER from the web database user, so a web request
     * must not need it; api/migrations/020_birthday_wishes.sql is the file to
     * apply on an existing production database.
     */
    public static function ensureTables($pdo): void
    {
        static $ready = false;
        if ($ready || !$pdo) {
            return;
        }
        $ready = true;
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `birthday_wish_preferences` (
                `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
                `enabled` TINYINT(1) NOT NULL DEFAULT 0,
                `language` VARCHAR(8) NOT NULL DEFAULT 'en',
                `enabled_at` DATETIME NULL,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $pdo->exec("CREATE TABLE IF NOT EXISTS `birthday_wishes_log` (
                `id` VARCHAR(64) NOT NULL PRIMARY KEY,
                `user_id` VARCHAR(64) NOT NULL,
                `person_key` VARCHAR(96) NOT NULL,
                `person_name` VARCHAR(191) NOT NULL DEFAULT '',
                `wish_year` INT NOT NULL,
                `wish_date` VARCHAR(16) NOT NULL,
                `channel` VARCHAR(16) NOT NULL,
                `phone_e164` VARCHAR(32) NOT NULL DEFAULT '',
                `status` VARCHAR(16) NOT NULL DEFAULT 'SENT',
                `detail` VARCHAR(255) NOT NULL DEFAULT '',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_birthday_wish_once_per_year` (`user_id`, `person_key`, `wish_year`, `channel`),
                INDEX `idx_birthday_wishes_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $pdo->exec("CREATE TABLE IF NOT EXISTS `birthday_email_preferences` (
                `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
                `enabled` TINYINT(1) NOT NULL DEFAULT 0,
                `language` VARCHAR(8) NOT NULL DEFAULT 'en',
                `enabled_at` DATETIME NULL,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (\Throwable $e) {
            error_log('AstroBirthdayWishes: tables could not be ensured (run api/migrations/020_birthday_wishes.sql): ' . $e->getMessage());
        }
    }

    /** True once this feature's tables exist (an un-migrated install must say so). */
    public static function tablesReady($pdo): bool
    {
        if (!$pdo) {
            return false;
        }
        self::ensureTables($pdo);
        try {
            $pdo->query("SELECT user_id FROM birthday_wish_preferences LIMIT 1");
            $pdo->query("SELECT id FROM birthday_wishes_log LIMIT 1");
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    /**
     * Birthday-wish settings, folded over the existing chat alert settings.
     * The chat master switch still wins: switching chat alerts off switches
     * birthday wishes off with them, because both use the same gateway.
     */
    public static function getWishSettings($pdo = null, ?array $chatSettings = null): array
    {
        $chat = is_array($chatSettings) ? $chatSettings : AstroChatAlerts::getAlertSettings($pdo);
        $stored = is_array($chat['birthdayWishes'] ?? null) ? $chat['birthdayWishes'] : [];

        $timezone = trim((string)($stored['timezone'] ?? self::DEFAULT_TIMEZONE));
        if ($timezone === '' || !in_array($timezone, self::knownTimezones(), true)) {
            $timezone = self::DEFAULT_TIMEZONE;
        }

        return [
            'enabled' => !empty($stored['enabled']),
            'emailEnabled' => !empty($stored['emailEnabled']),
            'chatEnabled' => !empty($chat['enabled']),
            'timezone' => $timezone,
            'includeFamilyMembers' => !array_key_exists('includeFamilyMembers', $stored)
                || !empty($stored['includeFamilyMembers']),
            'whatsappConfigured' => AstroChatAlerts::channelConfigured($chat, 'whatsapp'),
            'viberConfigured' => AstroChatAlerts::channelConfigured($chat, 'viber'),
        ];
    }

    /** The zones an operator may pick (kept short and unambiguous). */
    public static function knownTimezones(): array
    {
        return ['Asia/Kolkata', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
    }

    /** 'today' where the business counts days — not where the server happens to be. */
    public static function todayString(?array $wishSettings = null): string
    {
        $timezone = $wishSettings['timezone'] ?? self::DEFAULT_TIMEZONE;
        try {
            $tz = new \DateTimeZone($timezone);
        } catch (\Throwable $e) {
            $tz = new \DateTimeZone(self::DEFAULT_TIMEZONE);
        }
        return (new \DateTimeImmutable('now', $tz))->format('Y-m-d');
    }

    // ------------------------------------------------------------------
    // Dates
    // ------------------------------------------------------------------

    /**
     * The month/day of a saved birth date, or null when it cannot be read.
     *
     * Rows are written canonical (YYYY-MM-DD) by the profile forms, but this is
     * tolerant of a legacy `YYYY-M-D` and refuses anything else rather than
     * wishing somebody on the wrong day.
     */
    public static function birthdayParts($dob): ?array
    {
        $value = trim((string)$dob);
        if ($value === '') {
            return null;
        }
        if (!preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $value, $m)) {
            return null;
        }
        $year = (int)$m[1];
        $month = (int)$m[2];
        $day = (int)$m[3];
        if ($year < 1900 || $year > (int)date('Y') || $month < 1 || $month > 12 || $day < 1 || $day > 31) {
            return null;
        }
        // A real calendar date only: 1996-02-31 must not become a birthday.
        if (!checkdate($month, $day, $year)) {
            return null;
        }
        return ['year' => $year, 'month' => $month, 'day' => $day];
    }

    /**
     * Is this birth date celebrated on the given day?
     *
     * 29 February needs a rule: somebody born on a leap day has no 29th in a
     * common year, and staying silent would quietly drop them for three years
     * out of four. They are wished on 28 February in a common year (the last
     * day of February) and on their real date in a leap year.
     */
    public static function isBirthdayOn($dob, int $year, int $month, int $day): bool
    {
        $parts = self::birthdayParts($dob);
        if (!$parts) {
            return false;
        }
        if ($parts['month'] === $month && $parts['day'] === $day) {
            return true;
        }
        $isLeap29Baby = $parts['month'] === 2 && $parts['day'] === 29;
        $yearIsLeap = ($year % 4 === 0 && $year % 100 !== 0) || ($year % 400 === 0);
        return $isLeap29Baby && !$yearIsLeap && $month === 2 && $day === 28;
    }

    /** The `SUBSTR(dob, 6, 5)` values a SQL pre-filter must match for one day. */
    public static function birthdayMatchStrings(int $year, int $month, int $day): array
    {
        $matches = [sprintf('%02d-%02d', $month, $day)];
        $yearIsLeap = ($year % 4 === 0 && $year % 100 !== 0) || ($year % 400 === 0);
        if (!$yearIsLeap && $month === 2 && $day === 28) {
            // Leap-day babies are celebrated today instead (see isBirthdayOn).
            $matches[] = '02-29';
        }
        return $matches;
    }

    // ------------------------------------------------------------------
    // People
    // ------------------------------------------------------------------

    /**
     * Everyone whose birthday falls on `$date` AND who is opted in AND who has a
     * saved number. Channels are deliberately NOT resolved here: the sender asks
     * AstroChatAlerts::verifiedChatTargets(), the one source of truth for "may we
     * message this number in this app".
     */
    public static function duePeople($pdo, string $date, ?array $wishSettings = null): array
    {
        if (!$pdo) {
            return [];
        }
        $settings = $wishSettings ?: self::getWishSettings($pdo);
        if (!self::tablesReady($pdo)) {
            return [];
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
            return [];
        }
        $year = (int)$m[1];
        $month = (int)$m[2];
        $day = (int)$m[3];
        if (!checkdate($month, $day, $year)) {
            return [];
        }

        self::ensureTables($pdo);

        // The SQL only narrows by month/day (portable SUBSTR — MySQL and the
        // SQLite test runtime alike); isBirthdayOn() makes the real decision,
        // including the leap-day rule, so a malformed row can never slip in.
        $matches = self::birthdayMatchStrings($year, $month, $day);
        $placeholders = implode(',', array_fill(0, count($matches), '?'));

        // person_key is assembled in PHP, not in SQL: the portable way to build
        // 'fm:<id>' differs per engine (`||` concatenates in SQLite but is a
        // logical OR in MySQL), and a wrong key would break the once-a-year
        // dedupe. `SUBSTR(dob, 6, 5)` is portable and matches the canonical
        // YYYY-MM-DD the profile forms write.
        $sql = "SELECT p.user_id AS user_id,
                       p.language AS pref_language,
                       'self' AS person_source,
                       bp.id AS person_id,
                       bp.name AS person_name,
                       bp.dob AS dob,
                       'SELF' AS relation,
                       bp.gender AS gender
                FROM birthday_wish_preferences p
                JOIN birth_profiles bp ON bp.user_id = p.user_id
                WHERE p.enabled = 1 AND SUBSTR(bp.dob, 6, 5) IN ($placeholders)";

        $params = $matches;
        if (!empty($settings['includeFamilyMembers'])) {
            $sql .= " UNION ALL
                SELECT p.user_id AS user_id,
                       p.language AS pref_language,
                       'family' AS person_source,
                       fm.id AS person_id,
                       fm.name AS person_name,
                       fm.dob AS dob,
                       fm.relation AS relation,
                       fm.gender AS gender
                FROM birthday_wish_preferences p
                JOIN family_members fm ON fm.user_id = p.user_id
                WHERE p.enabled = 1 AND SUBSTR(fm.dob, 6, 5) IN ($placeholders)";
            $params = array_merge($matches, $matches);
        }
        $sql .= " ORDER BY user_id ASC";

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
        } catch (\Throwable $e) {
            error_log('AstroBirthdayWishes: duePeople query failed: ' . $e->getMessage());
            return [];
        }

        $people = [];
        foreach ($rows as $row) {
            $isSelf = ((string)($row['person_source'] ?? '')) === 'self';
            if ($isSelf) {
                $personKey = 'self';
            } else {
                $memberId = trim((string)($row['person_id'] ?? ''));
                if ($memberId === '') {
                    continue; // no stable key means no safe dedupe: skip
                }
                $personKey = 'fm:' . $memberId;
            }
            if (!self::isBirthdayOn($row['dob'] ?? '', $year, $month, $day)) {
                continue;
            }
            $people[] = [
                'userId' => (string)$row['user_id'],
                'language' => self::normalizeLanguage($row['pref_language'] ?? 'en'),
                'personKey' => $personKey,
                'personName' => trim((string)($row['person_name'] ?? '')),
                'relation' => $isSelf ? 'SELF' : strtoupper((string)$row['relation']),
                'gender' => strtoupper((string)($row['gender'] ?? '')),
                'dob' => (string)($row['dob'] ?? ''),
                'isSelf' => $isSelf,
            ];
        }
        return $people;
    }

    // ------------------------------------------------------------------
    // Messages
    // ------------------------------------------------------------------

    public static function normalizeLanguage($value): string
    {
        $lang = strtolower(trim((string)$value));
        return in_array($lang, self::LANGUAGES, true) ? $lang : 'en';
    }

    /** The relation named the way the customer's own language names it. */
    public static function relationLabel(string $relation, string $gender, string $language): string
    {
        $gender = strtoupper($gender) === 'F' ? 'F' : 'M';
        $labels = [
            'en' => [
                'SPOUSE' => $gender === 'F' ? 'wife' : 'husband',
                'SON' => 'son', 'DAUGHTER' => 'daughter', 'FATHER' => 'father',
                'MOTHER' => 'mother', 'BROTHER' => 'brother', 'SISTER' => 'sister',
                'CHILD' => 'child', 'RELATIVE' => 'relative', 'FRIEND' => 'friend',
                'OTHER' => 'family member',
            ],
            'ta' => [
                'SPOUSE' => $gender === 'F' ? 'மனைவி' : 'கணவர்',
                'SON' => 'மகன்', 'DAUGHTER' => 'மகள்', 'FATHER' => 'தந்தை',
                'MOTHER' => 'தாய்', 'BROTHER' => 'சகோதரன்', 'SISTER' => 'சகோதரி',
                'CHILD' => 'குழந்தை', 'RELATIVE' => 'உறவினர்', 'FRIEND' => 'நண்பர்',
                'OTHER' => 'குடும்பத்தினர்',
            ],
            'hi' => [
                'SPOUSE' => $gender === 'F' ? 'पत्नी' : 'पति',
                'SON' => 'बेटा', 'DAUGHTER' => 'बेटी', 'FATHER' => 'पिता',
                'MOTHER' => 'माता', 'BROTHER' => 'भाई', 'SISTER' => 'बहन',
                'CHILD' => 'बच्चा', 'RELATIVE' => 'रिश्तेदार', 'FRIEND' => 'मित्र',
                'OTHER' => 'परिवार के सदस्य',
            ],
        ];
        $set = $labels[$language] ?? $labels['en'];
        return $set[$relation] ?? $set['OTHER'];
    }

    /**
     * The wish itself, in the language the customer chose when they opted in.
     *
     * Deliberately a greeting and nothing else: no offer, no link, no mention of
     * a report or an invoice — chat is never a document channel here, and a
     * birthday message that sells something is how a number gets blocked.
     */
    public static function wishMessage(string $language, string $personName, bool $isSelf, string $relation = 'OTHER', string $gender = 'M'): string
    {
        $language = self::normalizeLanguage($language);
        $name = $personName !== '' ? $personName : ($language === 'en' ? 'friend' : ($language === 'ta' ? 'நண்பரே' : 'मित्र'));

        if ($isSelf) {
            $templates = [
                'en' => "Happy Birthday, {name}! \xF0\x9F\x8E\x89\n\nMay this year bring you good health, peace and prosperity.\n\nWarm wishes,\nASTRO SIVAM Team",
                'ta' => "இனிய பிறந்தநாள் நல்வாழ்த்துகள், {name}! \xF0\x9F\x8E\x89\n\nஇந்த ஆண்டு உங்களுக்கு நல்ல ஆரோக்கியத்தையும், அமைதியையும், செழிப்பையும் தரட்டும்.\n\nஅன்புடன்,\nASTRO SIVAM குழு",
                'hi' => "जन्मदिन की हार्दिक शुभकामनाएँ, {name}! \xF0\x9F\x8E\x89\n\nयह वर्ष आपको अच्छा स्वास्थ्य, शांति और समृद्धि दे।\n\nसादर,\nASTRO SIVAM टीम",
            ];
        } else {
            $relationLabel = self::relationLabel($relation, $gender, $language);
            $templates = [
                'en' => "Birthday today: your {relation}, {name}! \xF0\x9F\x8E\x89\n\nASTRO SIVAM sends {name} our warmest birthday wishes — good health, peace and prosperity in the year ahead.\n\nWarm regards,\nASTRO SIVAM Team",
                'ta' => "இன்று பிறந்தநாள்: உங்கள் {relation}, {name}! \xF0\x9F\x8E\x89\n\nASTRO SIVAM சார்பாக {name}-க்கு இனிய பிறந்தநாள் நல்வாழ்த்துகள் — நல்ல ஆரோக்கியமும், அமைதியும், செழிப்பும் உண்டாகட்டும்.\n\nஅன்புடன்,\nASTRO SIVAM குழு",
                'hi' => "आज जन्मदिन है: आपके {relation}, {name}! \xF0\x9F\x8E\x89\n\nASTRO SIVAM की ओर से {name} को जन्मदिन की हार्दिक शुभकामनाएँ — अच्छा स्वास्थ्य, शांति और समृद्धि।\n\nसादर,\nASTRO SIVAM टीम",
            ];
            return trim(strtr($templates[$language] ?? $templates['en'], [
                '{name}' => $name,
                '{relation}' => $relationLabel,
            ]));
        }

        return trim(strtr($templates[$language] ?? $templates['en'], ['{name}' => $name]));
    }

    // ------------------------------------------------------------------
    // Customer preference (opt-in)
    // ------------------------------------------------------------------

    /** Profile-facing state. No credentials, no other customer's data. */
    public static function preferenceState($pdo, string $userId): array
    {
        $settings = self::getWishSettings($pdo);
        $row = null;
        if ($pdo && $userId !== '' && self::tablesReady($pdo)) {
            try {
                $stmt = $pdo->prepare("SELECT enabled, language, enabled_at FROM birthday_wish_preferences WHERE user_id = ? LIMIT 1");
                $stmt->execute([$userId]);
                $fetched = $stmt->fetch();
                $row = $fetched ?: null;
            } catch (\Throwable $e) {
                error_log('AstroBirthdayWishes: could not read preference: ' . $e->getMessage());
            }
        }

        $contact = $pdo && $userId !== '' ? AstroChatAlerts::getChatContact($pdo, $userId) : null;
        $verifiedAny = !empty($contact['whatsapp_verified_at']) || !empty($contact['viber_verified_at']);

        $emailRow = null;
        $userEmail = '';
        if ($pdo && $userId !== '' && self::tablesReady($pdo)) {
            try {
                $eStmt = $pdo->prepare("SELECT enabled, language, enabled_at FROM birthday_email_preferences WHERE user_id = ? LIMIT 1");
                $eStmt->execute([$userId]);
                $emailRow = $eStmt->fetch() ?: null;
            } catch (\Throwable $e) {
                $emailRow = null;
            }
            try {
                $uStmt = $pdo->prepare("SELECT email FROM users WHERE id = ? LIMIT 1");
                $uStmt->execute([$userId]);
                $candidateEmail = trim((string)($uStmt->fetchColumn() ?: ''));
                if ($candidateEmail !== '' && filter_var($candidateEmail, FILTER_VALIDATE_EMAIL)) {
                    $userEmail = $candidateEmail;
                }
            } catch (\Throwable $e) {
                $userEmail = '';
            }
        }

        return [
            'enabled' => $row ? (bool)$row['enabled'] : false,
            'language' => self::normalizeLanguage($row['language'] ?? 'en'),
            'enabledAt' => $row['enabled_at'] ?? null,
            // What the customer needs in place before a wish can reach them.
            'available' => (bool)($settings['enabled'] && $settings['chatEnabled']),
            'numberVerified' => (bool)$verifiedAny,
            'channels' => array_values(array_filter([
                $settings['whatsappConfigured'] && !empty($contact['whatsapp_verified_at']) ? 'whatsapp' : null,
                $settings['viberConfigured'] && !empty($contact['viber_verified_at']) ? 'viber' : null,
            ])),
            'savedPeople' => $pdo && $userId !== '' ? self::savedPeopleCount($pdo, $userId, $settings) : 0,
            'featureEnabled' => (bool)$settings['enabled'],
            // Effortless 1-click Email Birthday Wishes (works out-of-the-box with cPanel SMTP).
            'emailEnabled' => $emailRow ? (bool)$emailRow['enabled'] : false,
            'emailLanguage' => self::normalizeLanguage($emailRow['language'] ?? ($row['language'] ?? 'en')),
            'emailEnabledAt' => $emailRow['enabled_at'] ?? null,
            'emailAvailable' => (bool)(!empty($settings['emailEnabled']) && $userEmail !== ''),
            'userEmail' => $userEmail,
            'upcomingBirthdays' => $pdo && $userId !== '' ? self::upcomingSavedBirthdays($pdo, $userId, null, $settings) : [],
        ];
    }

    /**
     * Upcoming saved birthdays for this customer (self + saved family members),
     * sorted soonest-first with exact day countdowns and Feb-29 -> Feb-28 handling.
     */
    public static function upcomingSavedBirthdays($pdo, string $userId, ?string $fromDate = null, ?array $wishSettings = null): array
    {
        if (!$pdo || $userId === '') {
            return [];
        }
        $settings = $wishSettings ?: self::getWishSettings($pdo);
        $baseStr = trim((string)$fromDate);
        if ($baseStr === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $baseStr)) {
            $baseStr = self::todayString($settings);
        }
        $baseDate = \DateTimeImmutable::createFromFormat('!Y-m-d', $baseStr) ?: new \DateTimeImmutable('today');
        $baseYear = (int)$baseDate->format('Y');

        $candidates = [];
        try {
            $bpStmt = $pdo->prepare("SELECT name, dob, gender FROM birth_profiles WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1");
            $bpStmt->execute([$userId]);
            $bp = $bpStmt->fetch();
            if ($bp && !empty($bp['dob'])) {
                $candidates[] = [
                    'personKey' => 'self',
                    'name' => trim((string)($bp['name'] ?? '')),
                    'relation' => 'SELF',
                    'dob' => (string)$bp['dob'],
                ];
            }
        } catch (\Throwable $e) {
            // Best-effort profile lookup.
        }

        if (!empty($settings['includeFamilyMembers'])) {
            try {
                $fmStmt = $pdo->prepare("SELECT id, name, relation, dob FROM family_members WHERE user_id = ? ORDER BY created_at ASC");
                $fmStmt->execute([$userId]);
                foreach ($fmStmt->fetchAll() as $fm) {
                    if (empty($fm['id']) || empty($fm['dob'])) continue;
                    $candidates[] = [
                        'personKey' => 'fm:' . trim((string)$fm['id']),
                        'name' => trim((string)($fm['name'] ?? '')),
                        'relation' => strtoupper(trim((string)($fm['relation'] ?? 'OTHER'))),
                        'dob' => (string)$fm['dob'],
                    ];
                }
            } catch (\Throwable $e) {
                // Best-effort family lookup.
            }
        }

        $items = [];
        foreach ($candidates as $cand) {
            $parts = self::birthdayParts($cand['dob']);
            if (!$parts) continue;
            $nextDate = null;
            for ($offset = 0; $offset <= 1; $offset++) {
                $yr = $baseYear + $offset;
                $month = $parts['month'];
                $day = $parts['day'];
                $isLeap = ($yr % 4 === 0 && $yr % 100 !== 0) || ($yr % 400 === 0);
                if ($month === 2 && $day === 29 && !$isLeap) {
                    $day = 28;
                }
                $probe = \DateTimeImmutable::createFromFormat('!Y-m-d', sprintf('%04d-%02d-%02d', $yr, $month, $day));
                if ($probe && $probe >= $baseDate) {
                    $nextDate = $probe;
                    break;
                }
            }
            if (!$nextDate) continue;
            $daysUntil = (int)$baseDate->diff($nextDate)->days;
            $items[] = [
                'personKey' => $cand['personKey'],
                'name' => $cand['name'],
                'relation' => $cand['relation'],
                'dob' => $cand['dob'],
                'nextDate' => $nextDate->format('Y-m-d'),
                'daysUntil' => $daysUntil,
            ];
        }

        usort($items, static function ($a, $b) {
            return ($a['daysUntil'] <=> $b['daysUntil']) ?: strcmp((string)$a['name'], (string)$b['name']);
        });
        return $items;
    }

    /**
     * One-click opt-in / opt-out for Email Birthday Wishes.
     * Requires only a valid account email address — no phone number or chat API needed.
     */
    public static function saveEmailPreference($pdo, string $userId, bool $enabled, ?string $language = null): array
    {
        if (!$pdo || $userId === '') {
            return ['success' => false, 'message' => 'Sign in to change your birthday wishes.'];
        }
        if (!self::tablesReady($pdo)) {
            return [
                'success' => false,
                'message' => 'Birthday wishes are not set up on this server yet. Please apply api/migrations/020_birthday_wishes.sql.',
            ];
        }
        $settings = self::getWishSettings($pdo);
        if ($enabled && empty($settings['emailEnabled'])) {
            return [
                'success' => false,
                'message' => 'Email birthday wishes are not switched on for this site yet.',
            ];
        }

        $uStmt = $pdo->prepare("SELECT email FROM users WHERE id = ? LIMIT 1");
        $uStmt->execute([$userId]);
        $userEmail = trim((string)($uStmt->fetchColumn() ?: ''));
        if ($enabled && ($userEmail === '' || !filter_var($userEmail, FILTER_VALIDATE_EMAIL))) {
            return [
                'success' => false,
                'message' => 'A valid account email address is required to receive birthday greeting emails.',
            ];
        }

        $lang = self::normalizeLanguage($language);
        self::ensureTables($pdo);
        try {
            $stmt = $pdo->prepare("SELECT user_id FROM birthday_email_preferences WHERE user_id = ? LIMIT 1");
            $stmt->execute([$userId]);
            if ($stmt->fetch()) {
                $pdo->prepare("UPDATE birthday_email_preferences SET enabled = ?, language = ?, enabled_at = ? WHERE user_id = ?")
                    ->execute([$enabled ? 1 : 0, $lang, $enabled ? date('Y-m-d H:i:s') : null, $userId]);
            } else {
                $pdo->prepare("INSERT INTO birthday_email_preferences (user_id, enabled, language, enabled_at) VALUES (?, ?, ?, ?)")
                    ->execute([$userId, $enabled ? 1 : 0, $lang, $enabled ? date('Y-m-d H:i:s') : null]);
            }
        } catch (\Throwable $e) {
            error_log('AstroBirthdayWishes: saveEmailPreference failed: ' . $e->getMessage());
            return ['success' => false, 'message' => 'Your email birthday wish setting could not be saved. Please try again.'];
        }

        $state = self::preferenceState($pdo, $userId);
        $people = (int)$state['savedPeople'];
        return [
            'success' => true,
            'message' => $enabled
                ? ($people > 0
                    ? 'Email birthday wishes are on! We will send a warm greeting card in '
                        . self::languageName($lang) . ' to ' . $userEmail . ' on each birthday ('
                        . $people . ' saved ' . ($people === 1 ? 'person' : 'people') . ').'
                    : 'Email birthday wishes are on! Save your birth details or a family member and we will email a birthday greeting on their special day.')
                : 'Email birthday wishes are off.',
            'birthdayWishes' => $state,
        ];
    }

    /** Pure non-promotional birthday email subject in English / Tamil / Hindi. */
    public static function wishEmailSubject(string $language, string $personName, bool $isSelf): string
    {
        $language = self::normalizeLanguage($language);
        $name = $personName !== '' ? $personName : ($language === 'en' ? 'Friend' : ($language === 'ta' ? 'நண்பரே' : 'मित्र'));
        if ($language === 'ta') {
            return $isSelf
                ? "இனிய பிறந்தநாள் நல்வாழ்த்துகள், {$name} — ASTRO SIVAM"
                : "இன்று பிறந்தநாள்: {$name} — இனிய வாழ்த்துகள் (ASTRO SIVAM)";
        }
        if ($language === 'hi') {
            return $isSelf
                ? "जन्मदिन की हार्दिक शुभकामनाएँ, {$name} — ASTRO SIVAM"
                : "आज जन्मदिन है: {$name} — हार्दिक शुभकामनाएँ (ASTRO SIVAM)";
        }
        return $isSelf
            ? "Happy Birthday, {$name} — Warm Wishes from ASTRO SIVAM"
            : "Birthday Today: {$name} — Warm Wishes from ASTRO SIVAM";
    }

    /** Pure non-promotional Royal Maroon & Gold HTML greeting card (no offers, links, or attachments). */
    public static function wishEmailHtml(string $language, string $personName, bool $isSelf, string $relation = 'OTHER', string $gender = 'M'): string
    {
        $text = self::wishMessage($language, $personName, $isSelf, $relation, $gender);
        $safeLines = nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $subtitleMap = [
            'en' => 'Warm Birthday Blessings',
            'ta' => 'இனிய பிறந்தநாள் நல்வாழ்த்துகள்',
            'hi' => 'जन्मदिन की मंगलकामनाएँ',
        ];
        $subtitle = $subtitleMap[self::normalizeLanguage($language)] ?? $subtitleMap['en'];
        $inner = "<div style='background:#fbf6ea;border:1px solid #e8d9b8;border-radius:10px;padding:20px 22px;text-align:center;font-size:15px;line-height:1.8;color:#2b1d12;'>"
            . $safeLines
            . "</div>";
        if (function_exists('astro_wrap_branded_email_html')) {
            return astro_wrap_branded_email_html($subtitle, $inner);
        }
        return "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#fffdf9;border:2px solid #c9962c;border-radius:12px;'>{$inner}</div>";
    }

    /** Find opted-in Email Birthday Wishes due on $date (YYYY-MM-DD). */
    public static function dueEmailPeople($pdo, string $date, ?array $wishSettings = null): array
    {
        if (!$pdo || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
            return [];
        }
        $settings = $wishSettings ?: self::getWishSettings($pdo);
        $year = (int)$m[1];
        $month = (int)$m[2];
        $day = (int)$m[3];
        $patterns = self::birthdayMatchStrings($year, $month, $day);
        if (!$patterns) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($patterns), '?'));

        $unions = [
            "SELECT ep.user_id, ep.language AS pref_language, u.email AS account_email, 'self' AS person_source,
                    bp.id AS person_id, bp.name AS person_name, 'SELF' AS relation, bp.gender, bp.dob
             FROM birthday_email_preferences ep
             INNER JOIN users u ON u.id = ep.user_id
             INNER JOIN birth_profiles bp ON bp.user_id = ep.user_id
             WHERE ep.enabled = 1 AND SUBSTR(bp.dob, 6, 5) IN ({$placeholders})"
        ];
        $params = $patterns;

        if (!empty($settings['includeFamilyMembers'])) {
            $unions[] =
                "SELECT ep.user_id, ep.language AS pref_language, u.email AS account_email, 'family' AS person_source,
                        fm.id AS person_id, fm.name AS person_name, fm.relation, fm.gender, fm.dob
                 FROM birthday_email_preferences ep
                 INNER JOIN users u ON u.id = ep.user_id
                 INNER JOIN family_members fm ON fm.user_id = ep.user_id
                 WHERE ep.enabled = 1 AND SUBSTR(fm.dob, 6, 5) IN ({$placeholders})";
            $params = array_merge($params, $patterns);
        }

        try {
            $stmt = $pdo->prepare(implode(' UNION ALL ', $unions));
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
        } catch (\Throwable $e) {
            error_log('AstroBirthdayWishes: dueEmailPeople query failed: ' . $e->getMessage());
            return [];
        }

        $people = [];
        foreach ($rows as $row) {
            $email = trim((string)($row['account_email'] ?? ''));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            $isSelf = ((string)($row['person_source'] ?? '')) === 'self';
            $memberId = trim((string)($row['person_id'] ?? ''));
            if (!$isSelf && $memberId === '') {
                continue;
            }
            if (!self::isBirthdayOn($row['dob'] ?? '', $year, $month, $day)) {
                continue;
            }
            $people[] = [
                'userId' => (string)$row['user_id'],
                'email' => $email,
                'language' => self::normalizeLanguage($row['pref_language'] ?? 'en'),
                'personKey' => $isSelf ? 'self' : ('fm:' . $memberId),
                'personName' => trim((string)($row['person_name'] ?? '')),
                'relation' => $isSelf ? 'SELF' : strtoupper((string)$row['relation']),
                'gender' => strtoupper((string)($row['gender'] ?? '')),
                'dob' => (string)($row['dob'] ?? ''),
                'isSelf' => $isSelf,
            ];
        }
        return $people;
    }

    /** How many saved people a wish could cover (the profile holder + family). */
    public static function savedPeopleCount($pdo, string $userId, ?array $wishSettings = null): int
    {
        if (!$pdo || $userId === '') {
            return 0;
        }
        $settings = $wishSettings ?: self::getWishSettings($pdo);
        $count = 0;
        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM birth_profiles WHERE user_id = ?");
            $stmt->execute([$userId]);
            $count += (int)$stmt->fetchColumn();
        } catch (\Throwable $e) {
            $count += 0;
        }
        if (!empty($settings['includeFamilyMembers'])) {
            try {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM family_members WHERE user_id = ?");
                $stmt->execute([$userId]);
                $count += (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {
                $count += 0;
            }
        }
        return $count;
    }

    /**
     * Turn birthday wishes on or off for this account.
     *
     * Opting IN requires a number verified in at least one app: a wish that
     * cannot be delivered is a switch that lies to the customer. Opting OUT is
     * always allowed and takes effect immediately (already-sent wishes are not
     * recalled, and the log keeps the year's dedupe entry).
     */
    public static function savePreference($pdo, string $userId, bool $enabled, ?string $language = null): array
    {
        if (!$pdo || $userId === '') {
            return ['success' => false, 'message' => 'Sign in to change your birthday wishes.'];
        }
        if (!self::tablesReady($pdo)) {
            return [
                'success' => false,
                'message' => 'Birthday wishes are not set up on this server yet. Please apply api/migrations/020_birthday_wishes.sql.',
            ];
        }
        $settings = self::getWishSettings($pdo);
        if ($enabled && !($settings['enabled'] && $settings['chatEnabled'])) {
            return [
                'success' => false,
                'message' => 'Birthday wishes are not switched on for this site yet. Order alerts on WhatsApp/Viber keep working.',
            ];
        }
        if ($enabled && !($settings['whatsappConfigured'] || $settings['viberConfigured'])) {
            return [
                'success' => false,
                'message' => 'No chat channel is configured on this site yet, so a birthday wish could not be delivered.',
            ];
        }

        $lang = self::normalizeLanguage($language);
        $contact = AstroChatAlerts::getChatContact($pdo, $userId);
        $verifiedAny = !empty($contact['whatsapp_verified_at']) || !empty($contact['viber_verified_at']);
        if ($enabled && !$verifiedAny) {
            return [
                'success' => false,
                'message' => 'Verify your number on WhatsApp or Viber first — birthday wishes are sent only to a verified number.',
            ];
        }

        self::ensureTables($pdo);
        try {
            $stmt = $pdo->prepare("SELECT user_id FROM birthday_wish_preferences WHERE user_id = ? LIMIT 1");
            $stmt->execute([$userId]);
            $exists = (bool)$stmt->fetch();
            if ($exists) {
                $pdo->prepare("UPDATE birthday_wish_preferences SET enabled = ?, language = ?, enabled_at = ? WHERE user_id = ?")
                    ->execute([$enabled ? 1 : 0, $lang, $enabled ? date('Y-m-d H:i:s') : null, $userId]);
            } else {
                $pdo->prepare("INSERT INTO birthday_wish_preferences (user_id, enabled, language, enabled_at) VALUES (?, ?, ?, ?)")
                    ->execute([$userId, $enabled ? 1 : 0, $lang, $enabled ? date('Y-m-d H:i:s') : null]);
            }
        } catch (\Throwable $e) {
            error_log('AstroBirthdayWishes: savePreference failed: ' . $e->getMessage());
            return ['success' => false, 'message' => 'Your birthday wish setting could not be saved. Please try again.'];
        }

        $state = self::preferenceState($pdo, $userId);
        $people = (int)$state['savedPeople'];
        return [
            'success' => true,
            'message' => $enabled
                ? ($people > 0
                    ? 'Birthday wishes are on. On each birthday we will message your verified number'
                        . (count($state['channels']) > 1 ? 's' : '') . ' ('
                        . implode(' and ', array_map('ucfirst', $state['channels'])) . ') in '
                        . self::languageName($lang) . ' for ' . $people . ' saved '
                        . ($people === 1 ? 'person' : 'people') . '. Wishes are text only — reports and invoices stay on email.'
                    : 'Birthday wishes are on. Save your own birth details or a family member and we will wish them on their birthday.')
                : 'Birthday wishes are off. You will not receive any birthday message from us.',
            'birthdayWishes' => $state,
        ];
    }

    public static function languageName(string $language): string
    {
        $names = ['en' => 'English', 'ta' => 'Tamil', 'hi' => 'Hindi'];
        return $names[self::normalizeLanguage($language)];
    }

    // ------------------------------------------------------------------
    // Sending
    // ------------------------------------------------------------------

    /** Has this person already been wished this year on this channel? */
    public static function alreadyWished($pdo, string $userId, string $personKey, int $year, string $channel): bool
    {
        if (!$pdo) {
            return false;
        }
        try {
            $stmt = $pdo->prepare("SELECT id FROM birthday_wishes_log WHERE user_id = ? AND person_key = ? AND wish_year = ? AND channel = ? LIMIT 1");
            $stmt->execute([$userId, $personKey, $year, $channel]);
            return (bool)$stmt->fetch();
        } catch (\Throwable $e) {
            // If the log cannot be read, do not send: a duplicate wish is worse
            // than a missed one.
            error_log('AstroBirthdayWishes: dedupe read failed, skipping send: ' . $e->getMessage());
            return true;
        }
    }

    /**
     * Record one wish attempt. Returns false when the UNIQUE key rejected it,
     * which is the race-proof half of the dedupe (two overlapping runs cannot
     * both message the same person).
     */
    public static function logWish($pdo, array $person, int $year, string $date, string $channel, string $phone, string $status, string $detail = ''): bool
    {
        if (!$pdo) {
            return false;
        }
        self::ensureTables($pdo);
        $id = function_exists('astro_random_id') ? astro_random_id('bwish_', 16) : ('bwish_' . bin2hex(random_bytes(8)));
        try {
            $pdo->prepare(
                "INSERT INTO birthday_wishes_log
                    (id, user_id, person_key, person_name, wish_year, wish_date, channel, phone_e164, status, detail)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $id,
                (string)$person['userId'],
                (string)$person['personKey'],
                (string)$person['personName'],
                $year,
                $date,
                $channel,
                $phone,
                $status,
                substr($detail, 0, 250),
            ]);
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Send every birthday wish due on one date. THE entry point: the cron script
     * and the admin "Send now" button both call this, so the rules below cannot
     * drift between them.
     *
     * $options:
     *   date      'YYYY-MM-DD' (default: today in the configured timezone)
     *   dryRun    bool — decide everything, send nothing (the admin preview)
     *   limit     int  — cap messages this run (default MAX_MESSAGES_PER_RUN)
     *   settings  array — chat alert settings to use instead of reading them
     *   transport callable($channel, $phone, $message, $person) => ['success'=>bool,'message'=>string]
     *             — injectable for tests; the default is the real WhatsApp/Viber
     *             senders from AstroChatAlerts.
     */
    public static function sendDueWishes($pdo, array $options = []): array
    {
        $summary = [
            'success' => true,
            'date' => '',
            'timezone' => self::DEFAULT_TIMEZONE,
            'due' => 0,
            'sent' => 0,
            'failed' => 0,
            'skipped' => 0,
            'dryRun' => !empty($options['dryRun']),
            'details' => [],
        ];

        try {
            if (!$pdo) {
                $summary['success'] = false;
                $summary['message'] = 'No database connection.';
                return $summary;
            }

            $chatSettings = is_array($options['settings'] ?? null)
                ? $options['settings']
                : AstroChatAlerts::getAlertSettings($pdo);
            $settings = self::getWishSettings($pdo, $chatSettings);
            $summary['timezone'] = $settings['timezone'];

            $date = trim((string)($options['date'] ?? ''));
            if ($date === '') {
                $date = self::todayString($settings);
            }
            if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
                $summary['success'] = false;
                $summary['message'] = 'A date in YYYY-MM-DD form is required.';
                return $summary;
            }
            $summary['date'] = $date;
            $year = (int)$m[1];

            $chatActive = !empty($settings['chatEnabled']) && !empty($settings['enabled']);
            $emailActive = !empty($settings['emailEnabled']);

            if (empty($settings['emailEnabled'])) {
                if (empty($settings['chatEnabled'])) {
                    $summary['message'] = 'Chat alerts are switched off, so no birthday wishes were sent.';
                    return $summary;
                }
                if (empty($settings['enabled'])) {
                    $summary['message'] = 'Birthday wishes are switched off in the admin panel.';
                    return $summary;
                }
            }
            if (!self::tablesReady($pdo)) {
                $summary['success'] = false;
                $summary['message'] = 'Birthday wish tables are missing. Apply api/migrations/020_birthday_wishes.sql.';
                return $summary;
            }

            $people = $chatActive ? self::duePeople($pdo, $date, $settings) : [];
            $emailPeople = $emailActive ? self::dueEmailPeople($pdo, $date, $settings) : [];
            $summary['due'] = count($people) + count($emailPeople);
            if (!$people && !$emailPeople) {
                $summary['message'] = 'No opted-in birthdays on ' . $date . '.';
                return $summary;
            }

            $limit = isset($options['limit']) ? max(0, (int)$options['limit']) : self::MAX_MESSAGES_PER_RUN;
            $transport = isset($options['transport']) && is_callable($options['transport']) ? $options['transport'] : null;
            $emailTransport = isset($options['emailTransport']) && is_callable($options['emailTransport']) ? $options['emailTransport'] : null;
            $targetCache = [];

            foreach ($people as $person) {
                $userId = (string)$person['userId'];
                if (!array_key_exists($userId, $targetCache)) {
                    $targetCache[$userId] = AstroChatAlerts::verifiedChatTargets($pdo, $userId, $chatSettings);
                }
                $target = $targetCache[$userId];
                if (empty($target) || empty($target['channels'])) {
                    $summary['skipped'] += 1;
                    $summary['details'][] = [
                        'person' => $person['personName'],
                        'status' => 'SKIPPED',
                        'reason' => 'no verified WhatsApp/Viber number',
                    ];
                    continue;
                }
                $phone = (string)$target['phone'];
                $message = self::wishMessage(
                    (string)$person['language'],
                    (string)$person['personName'],
                    (bool)$person['isSelf'],
                    (string)$person['relation'],
                    (string)$person['gender']
                );

                foreach ((array)$target['channels'] as $channel) {
                    if ($limit > 0 && ($summary['sent'] + $summary['failed']) >= $limit) {
                        $summary['skipped'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'channel' => $channel,
                            'status' => 'SKIPPED',
                            'reason' => 'per-run message limit reached',
                        ];
                        continue 2;
                    }
                    if (self::alreadyWished($pdo, $userId, (string)$person['personKey'], $year, (string)$channel)) {
                        $summary['skipped'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'channel' => $channel,
                            'status' => 'SKIPPED',
                            'reason' => 'already wished this year',
                        ];
                        continue;
                    }
                    if (!empty($options['dryRun'])) {
                        $summary['sent'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'relation' => $person['relation'],
                            'channel' => $channel,
                            'status' => 'DRY_RUN',
                            'message' => $message,
                        ];
                        continue;
                    }

                    if ($transport) {
                        $result = (array)call_user_func($transport, (string)$channel, $phone, $message, $person);
                    } elseif ($channel === 'whatsapp') {
                        $result = (array)AstroChatAlerts::sendWhatsApp($chatSettings, $phone, $message, [
                            'customer_name' => $person['personName'],
                            'event' => 'birthday_wish',
                        ]);
                    } else {
                        $result = (array)AstroChatAlerts::sendViber($chatSettings, $phone, $message, [
                            'customer_name' => $person['personName'],
                            'event' => 'birthday_wish',
                        ]);
                    }

                    $ok = !empty($result['success']);
                    $detail = (string)($result['message'] ?? '');
                    // The log row is what makes a re-run safe, so a FAILED send is
                    // recorded too: retrying every hour would otherwise re-message
                    // a gateway that already accepted the text.
                    $logged = self::logWish($pdo, $person, $year, $date, (string)$channel, $phone, $ok ? 'SENT' : 'FAILED', $detail);
                    if (!$logged) {
                        // Another run won the race and already logged it.
                        $summary['skipped'] += 1;
                        continue;
                    }
                    if ($ok) {
                        $summary['sent'] += 1;
                    } else {
                        $summary['failed'] += 1;
                        error_log("AstroBirthdayWishes {$channel} -> {$phone} ({$person['personName']}): {$detail}");
                    }
                    $summary['details'][] = [
                        'person' => $person['personName'],
                        'relation' => $person['relation'],
                        'channel' => $channel,
                        'status' => $ok ? 'SENT' : 'FAILED',
                        'reason' => $ok ? '' : $detail,
                    ];
                }
            }

            if ($emailPeople) {
                if (!class_exists('AstroMailer')) {
                    require_once __DIR__ . '/mailer.php';
                }
                $emailSettings = [];
                try {
                    $esStmt = $pdo->query("SELECT email_settings FROM system_settings ORDER BY id ASC LIMIT 1");
                    $esRow = $esStmt ? $esStmt->fetch() : false;
                    $emailSettings = $esRow ? (json_decode($esRow['email_settings'] ?? '{}', true) ?: []) : [];
                } catch (\Throwable $e) {
                    $emailSettings = [];
                }

                foreach ($emailPeople as $person) {
                    $userId = (string)$person['userId'];
                    $recipientEmail = (string)$person['email'];
                    if ($limit > 0 && ($summary['sent'] + $summary['failed']) >= $limit) {
                        $summary['skipped'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'channel' => 'email',
                            'status' => 'SKIPPED',
                            'reason' => 'per-run message limit reached',
                        ];
                        continue;
                    }
                    if (self::alreadyWished($pdo, $userId, (string)$person['personKey'], $year, 'email')) {
                        $summary['skipped'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'channel' => 'email',
                            'status' => 'SKIPPED',
                            'reason' => 'already wished this year',
                        ];
                        continue;
                    }

                    $subject = self::wishEmailSubject((string)$person['language'], (string)$person['personName'], (bool)$person['isSelf']);
                    $plainWish = self::wishMessage(
                        (string)$person['language'],
                        (string)$person['personName'],
                        (bool)$person['isSelf'],
                        (string)$person['relation'],
                        (string)$person['gender']
                    );
                    $htmlCard = self::wishEmailHtml(
                        (string)$person['language'],
                        (string)$person['personName'],
                        (bool)$person['isSelf'],
                        (string)$person['relation'],
                        (string)$person['gender']
                    );

                    if (!empty($options['dryRun'])) {
                        $summary['sent'] += 1;
                        $summary['details'][] = [
                            'person' => $person['personName'],
                            'relation' => $person['relation'],
                            'channel' => 'email',
                            'status' => 'DRY_RUN',
                            'message' => $plainWish,
                        ];
                        continue;
                    }

                    if ($emailTransport) {
                        $mailResult = (array)call_user_func($emailTransport, $recipientEmail, $subject, $htmlCard, $person);
                    } else {
                        $mailResult = (array)AstroMailer::sendEmailWithAttachments(
                            $recipientEmail,
                            (string)$person['personName'],
                            $subject,
                            $htmlCard,
                            [],
                            $emailSettings,
                            function_exists('astro_inline_logo_attachment') ? astro_inline_logo_attachment() : []
                        );
                    }

                    $ok = !empty($mailResult['success']);
                    $detail = (string)($mailResult['message'] ?? '');
                    $logged = self::logWish($pdo, $person, $year, $date, 'email', $recipientEmail, $ok ? 'SENT' : 'FAILED', $detail);
                    if (!$logged) {
                        $summary['skipped'] += 1;
                        continue;
                    }
                    if ($ok) {
                        $summary['sent'] += 1;
                    } else {
                        $summary['failed'] += 1;
                        error_log("AstroBirthdayWishes email -> {$recipientEmail} ({$person['personName']}): {$detail}");
                    }
                    $summary['details'][] = [
                        'person' => $person['personName'],
                        'relation' => $person['relation'],
                        'channel' => 'email',
                        'status' => $ok ? 'SENT' : 'FAILED',
                        'reason' => $ok ? '' : $detail,
                    ];
                }
            }

            $summary['message'] = sprintf(
                '%s: %d birthday%s due, %d message%s sent, %d failed, %d skipped.',
                $date,
                $summary['due'],
                $summary['due'] === 1 ? '' : 's',
                $summary['sent'],
                $summary['sent'] === 1 ? '' : 's',
                $summary['failed'],
                $summary['skipped']
            );
            if ($summary['sent'] > 0 || $summary['failed'] > 0) {
                try {
                    if (function_exists('logAudit')) {
                        logAudit($pdo, 'system', 'Birthday Wishes', 'system', 'BIRTHDAY_WISH_SENT', $summary['message']);
                    }
                } catch (\Throwable $e) {
                    error_log('AstroBirthdayWishes: audit logging failed: ' . $e->getMessage());
                }
            }
            return $summary;
        } catch (\Throwable $e) {
            // Best-effort like every other chat alert: never throw at a caller.
            error_log('AstroBirthdayWishes fatal: ' . $e->getMessage());
            $summary['success'] = false;
            $summary['message'] = 'Birthday wishes could not be sent: ' . $e->getMessage();
            return $summary;
        }
    }
}
