/**
 * ASTRO SIVAM — birthday wishes on WhatsApp / Viber (owner request, 2026-10-21).
 *
 * "Whoever saves their birth details on the website should get birthday wishes
 * on WhatsApp or Viber on their birthday."
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * This is the first message the site sends that nobody triggered by placing an
 * order, so it carries the whole consent burden of the chat channel with it.
 * Four things must never regress, and each is cheap to break accidentally:
 *
 *   1. CONSENT — default OFF on the server, and the customer must switch it on
 *      themselves. An order alert is announced at checkout; a birthday wish is
 *      not, and WhatsApp's own business policy requires opt-in for it.
 *   2. VERIFIED NUMBERS ONLY — the same rule as order alerts. Never
 *      `users.mobile`, never an order's `user_mobile`, never a number that was
 *      saved but not OTP-verified in that specific app.
 *   3. TEXT ONLY — a wish never carries a report or an invoice. Email stays the
 *      only document channel (tests/chat-alerts-verified-and-download-language).
 *   4. ONCE A YEAR PER PERSON — a cron that fires twice, an admin who presses
 *      "Send Today's Wishes" after the cron ran, or a host clock that drifts
 *      must never message anybody twice.
 *
 * The date rules are executed, not read: matching a birthday is arithmetic on a
 * stored string, and 29 February is where that arithmetic goes wrong (a
 * leap-day baby would be silently skipped three years out of four).
 *
 * Static checks always run. The PHP half EXECUTES the real dispatcher against a
 * SQLite runtime with a recording transport, and SKIPs when the optional dev
 * runtime is absent:
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);

const dispatcher = read('api/birthday_wishes.php');
const cron = read('api/cron/birthday_wishes.php');
const migration = read('api/migrations/020_birthday_wishes.sql');
const schema = read('api/schema.sql');
const services = read('api/services/index.php');
const admin = read('api/admin/index.php');
const api = read('src/services/api.ts');
const dashboard = read('src/pages/CustomerDashboard.tsx');
const adminPanel = read('src/components/admin/ChatAlertConfigPanel.tsx');
const guide = read('BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md');

/**
 * The "must not appear" scans read CODE only. This feature's own doc comment
 * names the columns it must never use (`users.mobile`, an order's
 * `user_mobile`) so the next reader understands the rule, and a scan of the
 * whole file would fail on that sentence.
 */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*) .*$/gm, '');

console.log('--- BIRTHDAY WISHES (WhatsApp / Viber) ---');

// ------------------------------------------------------------- consent & DDL ---
check('consent is a separate table, default OFF, with the language they opted in with', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `birthday_wish_preferences`/);
  assert.match(migration, /`enabled` TINYINT\(1\) NOT NULL DEFAULT 0/, 'off until the customer switches it on');
  assert.match(migration, /`language` VARCHAR\(8\) NOT NULL DEFAULT 'en'/, 'the wish is written in the language they chose');
  assert.match(migration, /FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `birthday_wish_preferences`/, 'a fresh install gets it from schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `birthday_wishes_log`/);
});

check('one wish per person per year per channel is enforced by the database', () => {
  for (const file of [migration, schema]) {
    assert.match(file, /CREATE TABLE IF NOT EXISTS `birthday_wishes_log`/);
    assert.match(file, /UNIQUE KEY `uq_birthday_wish_once_per_year` \(`user_id`, `person_key`, `wish_year`, `channel`\)/);
  }
  assert.match(dispatcher, /public static function alreadyWished\(/);
  assert.match(dispatcher, /'already wished this year'/);
  // A failed send is logged too: retrying hourly would re-message a gateway
  // that already accepted the text.
  assert.match(dispatcher, /\$ok \? 'SENT' : 'FAILED'/);
  // And if the log cannot be read, the safe answer is "do not send".
  const dedupe = dispatcher.slice(
    dispatcher.indexOf('public static function alreadyWished'),
    dispatcher.indexOf('public static function logWish')
  );
  assert.match(dedupe, /return true;/, 'an unreadable dedupe log must block the send, not allow it');
});

check('the feature never issues ALTER, so a web request works after ALTER is revoked', () => {
  assert.doesNotMatch(dispatcher, /\bALTER TABLE\b/i, 'CREATE TABLE IF NOT EXISTS only');
  assert.doesNotMatch(cron, /\bALTER TABLE\b/i);
  assert.doesNotMatch(migration, /\bALTER TABLE\b/i);
  assert.match(dispatcher, /CREATE TABLE IF NOT EXISTS/);
  assert.match(migration, /this migration is CREATE TABLE only/i);
});

// ---------------------------------------------------- verified numbers & text ---
check('wishes go only through the chat dispatcher’s verified-target gate', () => {
  assert.match(dispatcher, /AstroChatAlerts::verifiedChatTargets\(\$pdo, \$userId, \$chatSettings\)/,
    'the ONE source of truth for "may we message this number in this app"');
  assert.match(dispatcher, /AstroChatAlerts::sendWhatsApp\(\$chatSettings, \$phone, \$message/);
  assert.match(dispatcher, /AstroChatAlerts::sendViber\(\$chatSettings, \$phone, \$message/);
  // Never a number that was not verified: not the account mobile, not an order's.
  assert.doesNotMatch(codeOnly(dispatcher), /user_mobile|users\.mobile|\['mobile'\]/);
  // duePeople must not shortcut the gate with its own channel logic.
  const due = dispatcher.slice(
    dispatcher.indexOf('public static function duePeople'),
    dispatcher.indexOf('// ------------------------------------------------------------------\n    // Messages')
  );
  assert.doesNotMatch(due, /whatsapp_verified_at|viber_verified_at/,
    'the sender asks verifiedChatTargets(); the query only finds birthdays');
});

check('a wish is text only — never a report, an invoice or an attachment', () => {
  const messages = codeOnly(dispatcher.slice(
    dispatcher.indexOf('public static function wishMessage'),
    dispatcher.indexOf('// ------------------------------------------------------------------\n    // Customer preference')
  ));
  for (const forbidden of ['PDF', 'invoice', 'Invoice', 'attachment', 'report', 'http', 'www.', 'discount', 'offer', '%']) {
    assert.ok(!messages.includes(forbidden), `the wish text must never mention "${forbidden}"`);
  }
  assert.match(messages, /'en' =>/, 'English');
  assert.match(messages, /'ta' =>/, 'Tamil');
  assert.match(messages, /'hi' =>/, 'Hindi');
  assert.match(dispatcher, /const LANGUAGES = \['en', 'ta', 'hi'\]/);
  assert.match(dispatcher, /no offer, no link, no mention of/i, 'why the text stays a greeting');
});

// --------------------------------------------------------------- the senders ---
check('both switches must be on, and the chat master switch wins', () => {
  const send = dispatcher.slice(
    dispatcher.indexOf('public static function sendDueWishes'),
    dispatcher.lastIndexOf('}')
  );
  assert.match(send, /if \(empty\(\$settings\['chatEnabled'\]\)\)/, 'chat alerts off => no wishes');
  assert.match(send, /if \(empty\(\$settings\['enabled'\]\)\)/, 'the birthday master switch off => no wishes');
  assert.match(send, /'Chat alerts are switched off, so no birthday wishes were sent\.'/);
  assert.ok(dispatcher.includes("'chatEnabled' => !empty($chat['enabled'])"),
    'the chat master switch is read from the same settings');
});

check('opting in requires a number verified in an app that is actually configured', () => {
  const save = dispatcher.slice(
    dispatcher.indexOf('public static function savePreference'),
    dispatcher.indexOf('public static function languageName')
  );
  assert.match(save, /Verify your number on WhatsApp or Viber first/, 'no verified number => the switch refuses');
  assert.match(save, /if \(\$enabled && !\$verifiedAny\)/);
  assert.match(save, /if \(\$enabled && !\(\$settings\['enabled'\] && \$settings\['chatEnabled'\]\)\)/, 'site feature off => refuse');
  assert.match(save, /if \(\$enabled && !\(\$settings\['whatsappConfigured'\] \|\| \$settings\['viberConfigured'\]\)\)/,
    'no configured channel => refuse, instead of accepting a switch that cannot deliver');
  // Turning it OFF is never blocked.
  assert.doesNotMatch(save, /if \(!\$enabled &&/);
  assert.match(save, /self::normalizeLanguage\(\$language\)/);
});

check('the leap-day rule keeps 29 February babies from being skipped', () => {
  assert.match(dispatcher, /public static function isBirthdayOn\(\$dob, int \$year, int \$month, int \$day\): bool/);
  const leap = dispatcher.slice(
    dispatcher.indexOf('public static function isBirthdayOn'),
    dispatcher.indexOf('/** The `SUBSTR(dob, 6, 5)` values')
  );
  assert.match(leap, /\$isLeap29Baby && !\$yearIsLeap && \$month === 2 && \$day === 28/,
    'a common year celebrates them on 28 February');
  assert.match(dispatcher, /\$matches\[\] = '02-29';/, 'and the SQL pre-filter lets those rows through');
  assert.match(dispatcher, /if \(!checkdate\(\$month, \$day, \$year\)\)/, 'an impossible stored date is refused, not guessed');
});

// ------------------------------------------------------------------- cron CLI ---
check('the cron entry point has no HTTP surface and cannot overlap itself', () => {
  assert.match(cron, /if \(PHP_SAPI !== 'cli'\)/, 'CLI only: no token to leak, no burst to trigger');
  assert.match(cron, /http_response_code\(404\)/);
  assert.match(cron, /LOCK_EX \| LOCK_NB/, 'a second cron tick exits instead of sending twice');
  assert.match(cron, /another birthday-wish run is still in progress/);
  assert.match(cron, /--dry-run/, 'the operator can decide without sending');
  assert.match(cron, /--date=/, 'one date can be run by hand');
  assert.match(cron, /fwrite\(STDERR, "Unknown argument/, 'a crontab typo fails loudly');
  assert.match(cron, /exit\(2\)/);
  assert.match(cron, /in_array\(\$value, \['CHANGE_PASSWORD', 'PASTE_NEW_DB_PASSWORD_HERE'\], true\)/,
    'checked before getDbConnection(), which would exit 0 on a bad config and tell cron it succeeded');
  assert.match(cron, /exit\(empty\(\$summary\['success'\]\) \? 1 : 0\)/);
  assert.match(cron, /AstroBirthdayWishes::sendDueWishes\(\$pdo, \$options\)/, 'the same dispatcher the admin button uses');
});

// --------------------------------------------------------------------- routes ---
check('the customer route is owner-only, rate limited, and never sends', () => {
  const start = services.indexOf('// 3d. Birthday wishes');
  assert.ok(start > 0, 'the customer route exists');
  const block = services.slice(start, services.indexOf('// 4. POST /api/services/calculate-preview', start));
  assert.match(block, /requireAuth\(\$pdo\)/);
  assert.match(block, /astro_rate_limit_enforce\(\$pdo, 'birthday-wishes-user'/);
  assert.match(block, /filter_var\(\$body\['enabled'\] \?\? false, FILTER_VALIDATE_BOOLEAN\)/);
  assert.match(block, /AstroBirthdayWishes::savePreference\(\$pdo, \$userId, \$enabled, \$language\)/);
  assert.match(block, /AstroBirthdayWishes::preferenceState\(\$pdo, \$userId\)/);
  assert.doesNotMatch(block, /sendDueWishes/, 'a customer request must never trigger a send');
  assert.match(services, /require_once __DIR__ \. '\/\.\.\/birthday_wishes\.php';/);
});

check('the admin routes preview and run the dispatcher, and audit a real run', () => {
  const start = admin.indexOf('// 5b2. Birthday wishes');
  assert.ok(start > 0, 'the admin routes exist');
  const block = admin.slice(start, admin.indexOf('// 5c. POST /api/admin/testing/payment', start));
  assert.ok(block.includes("preg_match('#/admin/birthday-wishes/(preview|run)/?$#', $path, $birthdayMatch)"),
    'one route pair, matched before the fallback action names');
  assert.match(block, /\$options\['dryRun'\] = true;/, 'preview decides and sends nothing');
  assert.ok(block.includes("preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $date)"), 'a bad date is refused');
  assert.match(block, /logAudit\(\$pdo, \$admin\['id'\], \$admin\['name'\], 'admin', 'BIRTHDAY_WISH_RUN'/);
  assert.match(block, /if \(\$wantsRun && \$method !== 'POST'\)/, 'sending is POST-only');
  assert.match(block, /503/, 'an un-migrated install says so instead of failing quietly');
});

check('the API client tries both URL forms, like every other customer call', () => {
  assert.match(api, /async getBirthdayWishes\(/);
  assert.match(api, /async saveBirthdayWishPreference\(/);
  const save = api.slice(api.indexOf('async saveBirthdayWishPreference'), api.indexOf('// Calculations Preview'));
  assert.match(save, /\/services\/birthday-wishes/);
  assert.match(save, /services\/index\.php\?action=birthday-wishes/);
  assert.match(save, /JSON\.stringify\(\{ enabled, \.\.\.\(language \? \{ language \} : \{\}\) \}\)/);
  assert.match(api, /async previewBirthdayWishes\(date\?: string\)/);
  assert.match(api, /async runBirthdayWishes\(date\?: string, limit\?: number\)/);
  assert.match(api, /\/admin\/birthday-wishes\/run/);
});

check('the customer switches it on themselves, in the language they are reading', () => {
  assert.match(dashboard, /api\.saveBirthdayWishPreference\(next, appLanguage\)/,
    'the stored language is the site language at the moment they opt in');
  assert.match(dashboard, /const \[birthdayWishes, setBirthdayWishes\] = useState<BirthdayWishState \| null>\(null\)/);
  assert.match(dashboard, /loadBirthdayWishes\(\)/);
  assert.match(dashboard, /aria-pressed=\{birthdayWishes\.enabled\}/, 'the toggle reports its state to a screen reader');
  assert.match(dashboard, /disabled=\{chatBusy \|\| !birthdayWishes\.available \|\| !birthdayWishes\.numberVerified\}/,
    'it cannot be switched on before a number is verified');
  assert.match(dashboard, /Verify your number on WhatsApp or Viber above first\./);
  assert.match(dashboard, /Text only; reports and invoices stay on email\./);
  assert.match(dashboard, /loadBirthdayWishes\(\);/, 'verifying a number refreshes what a wish could cover');
  assert.doesNotMatch(dashboard, /birthdayWishes\.enabled \? 'Turn on'/, 'the labels must not be inverted');
});

check('the admin panel exposes the switch, the timezone and both dispatcher buttons', () => {
  assert.match(adminPanel, /Enable Birthday Wishes/);
  assert.match(adminPanel, /Include Saved Family Members/);
  assert.match(adminPanel, /Birthday Timezone/);
  assert.match(adminPanel, /const BIRTHDAY_TIMEZONES = \[/);
  assert.match(adminPanel, /'Asia\/Kolkata'/, 'IST is the default day boundary');
  assert.match(adminPanel, /api\.previewBirthdayWishes\(\)/);
  assert.match(adminPanel, /api\.runBirthdayWishes\(\)/);
  assert.match(adminPanel, /window\.confirm\('Send today/, 'an irreversible send is confirmed first');
  assert.match(adminPanel, /birthdayWishes: \{ \.\.\.base\.birthdayWishes!, \.\.\.\(s\.birthdayWishes \|\| \{\}\) \}/,
    'a stored partial block cannot drop a default');
  assert.match(adminPanel, /enabled: false,\n    timezone: 'Asia\/Kolkata',\n    includeFamilyMembers: true/,
    'the feature starts off');
});

check('the deployment guide carries the exact cron line', () => {
  assert.match(guide, /api\/cron\/birthday_wishes\.php/);
  assert.match(guide, /0 8 \* \* \*/);
  assert.match(guide, /020_birthday_wishes\.sql/);
});

// --------------------------------------------------------------- RUNTIME -------
const wasmInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
/** Set when the PHP runtime started, so it can be closed after the checks run. */
let openBridge: { close: () => Promise<void> } | null = null;
if (!wasmInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the real birthday dispatcher did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const { createAdminApiBridge } = await import(
    new URL('../scripts/php-admin-api-bridge.mjs', import.meta.url).href
  );
  const bridge = await createAdminApiBridge();
  openBridge = bridge;

  /**
   * Run a PHP snippet that echoes one JSON document. `runPhp` already decodes it
   * and throws with the PHP output when the snippet printed something else, so
   * nothing here needs to parse or trim.
   */
  const php = (code: string): Promise<any> => bridge.runPhp(code);

  // The dispatcher's own tables, in SQLite shape (ensureTables writes MySQL DDL,
  // which this runtime rejects and catches - the same contract as migration 017).
  await bridge.runPhp(`
$pdo = getDbConnection();
// IF EXISTS everywhere: this SQLite runtime starts without the feature's
// tables, and ONE failed DDL statement aborts the whole runPhp call as an
// empty 500. birth_profiles / family_members are created here too because the
// bridge's schema stops at orders/reviews/users.
foreach (['birthday_wish_preferences', 'birthday_wishes_log', 'user_chat_contacts', 'birth_profiles', 'family_members'] as $tbl) {
  $pdo->exec("DROP TABLE IF EXISTS $tbl");
}
$pdo->exec("CREATE TABLE birthday_wish_preferences (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, language TEXT NOT NULL DEFAULT 'en', enabled_at TEXT NULL, updated_at TEXT NULL)");
$pdo->exec("CREATE TABLE birthday_wishes_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, person_key TEXT NOT NULL, person_name TEXT NOT NULL DEFAULT '', wish_year INTEGER NOT NULL, wish_date TEXT NOT NULL, channel TEXT NOT NULL, phone_e164 TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'SENT', detail TEXT NOT NULL DEFAULT '', created_at TEXT NULL, UNIQUE (user_id, person_key, wish_year, channel))");
$pdo->exec("CREATE TABLE user_chat_contacts (user_id TEXT PRIMARY KEY, phone_e164 TEXT NOT NULL, whatsapp_verified_at TEXT NULL, viber_verified_at TEXT NULL, created_at TEXT NULL, updated_at TEXT NULL)");
$pdo->exec("CREATE TABLE birth_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', dob TEXT NOT NULL DEFAULT '', tob TEXT NULL, birth_place TEXT NULL, country TEXT NULL, latitude REAL NULL, longitude REAL NULL, timezone_offset_hours REAL NULL, gender TEXT NULL)");
$pdo->exec("CREATE TABLE family_members (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL DEFAULT 'OTHER', dob TEXT NOT NULL DEFAULT '', tob TEXT NULL, birth_place TEXT NULL, country TEXT NULL, latitude REAL NULL, longitude REAL NULL, timezone_offset_hours REAL NULL, gender TEXT NULL)");
echo json_encode(['ok' => true]);
`);

  const runtimeChecks: Array<[string, () => void | Promise<void>]> = [];
  const runtime = (name: string, fn: () => void | Promise<void>) => runtimeChecks.push([name, fn]);

  runtime('the date rules: exact match, leap day, impossible dates', async () => {
    const res = await php(`
require_once '/repo/api/birthday_wishes.php';
echo json_encode([
  'exact' => AstroBirthdayWishes::isBirthdayOn('1990-03-14', 2026, 3, 14),
  'wrongDay' => AstroBirthdayWishes::isBirthdayOn('1990-03-14', 2026, 3, 15),
  'legacySingleDigit' => AstroBirthdayWishes::isBirthdayOn('1990-3-4', 2026, 3, 4),
  'leapBabyOnFeb28CommonYear' => AstroBirthdayWishes::isBirthdayOn('1996-02-29', 2026, 2, 28),
  'leapBabyOnFeb28LeapYear' => AstroBirthdayWishes::isBirthdayOn('1996-02-29', 2028, 2, 28),
  'leapBabyOnFeb29LeapYear' => AstroBirthdayWishes::isBirthdayOn('1996-02-29', 2028, 2, 29),
  'impossibleDate' => AstroBirthdayWishes::isBirthdayOn('1996-02-31', 2026, 2, 28),
  'emptyDob' => AstroBirthdayWishes::isBirthdayOn('', 2026, 3, 14),
  'garbage' => AstroBirthdayWishes::isBirthdayOn('not-a-date', 2026, 3, 14),
  'futureYear' => AstroBirthdayWishes::birthdayParts('2999-01-01'),
  'matchesForFeb28Common' => AstroBirthdayWishes::birthdayMatchStrings(2026, 2, 28),
  'matchesForFeb28Leap' => AstroBirthdayWishes::birthdayMatchStrings(2028, 2, 28),
  'timezoneDefault' => AstroBirthdayWishes::getWishSettings(null, ['enabled' => true])['timezone']
]);
`);
    assert.equal(res.exact, true);
    assert.equal(res.wrongDay, false);
    assert.equal(res.legacySingleDigit, true, 'a legacy 1990-3-4 row is still read correctly');
    assert.equal(res.leapBabyOnFeb28CommonYear, true, '29 February is celebrated on 28 February in a common year');
    assert.equal(res.leapBabyOnFeb28LeapYear, false, 'in a leap year they get their real date, not the 28th');
    assert.equal(res.leapBabyOnFeb29LeapYear, true);
    assert.equal(res.impossibleDate, false, '1996-02-31 is refused, never guessed');
    assert.equal(res.emptyDob, false);
    assert.equal(res.garbage, false);
    assert.equal(res.futureYear, null, 'a birth year in the future is not a birthday');
    assert.deepEqual(res.matchesForFeb28Common, ['02-28', '02-29'], 'the SQL pre-filter admits leap-day rows on 28 Feb');
    assert.deepEqual(res.matchesForFeb28Leap, ['02-28'], 'and does not in a leap year');
    assert.equal(res.timezoneDefault, 'Asia/Kolkata');
  });

  runtime('the wish text: three languages, self vs family, gendered relations', async () => {
    const res = await php(`
require_once '/repo/api/birthday_wishes.php';
$w = function ($lang, $self, $relation = 'OTHER', $gender = 'M') {
  return AstroBirthdayWishes::wishMessage($lang, 'Priya', $self, $relation, $gender);
};
echo json_encode([
  'selfEn' => $w('en', true),
  'selfTa' => $w('ta', true),
  'selfHi' => $w('hi', true),
  'familyEnWife' => $w('en', false, 'SPOUSE', 'F'),
  'familyEnHusband' => $w('en', false, 'SPOUSE', 'M'),
  'familyTaMother' => $w('ta', false, 'MOTHER', 'F'),
  'familyHiSon' => $w('hi', false, 'SON', 'M'),
  'unknownLanguage' => $w('fr', true),
  'unknownRelation' => $w('en', false, 'COSMONAUT', 'M'),
  'blankName' => AstroBirthdayWishes::wishMessage('en', '', true)
]);
`);
    assert.match(res.selfEn, /^Happy Birthday, Priya!/);
    assert.match(res.selfEn, /ASTRO SIVAM Team$/);
    assert.match(res.selfTa, /இனிய பிறந்தநாள் நல்வாழ்த்துகள், Priya!/);
    assert.match(res.selfTa, /ASTRO SIVAM குழு$/);
    assert.match(res.selfHi, /जन्मदिन की हार्दिक शुभकामनाएँ, Priya!/);
    assert.match(res.selfHi, /ASTRO SIVAM टीम$/);
    assert.match(res.familyEnWife, /your wife, Priya/, 'the relation is named, and gendered for a spouse');
    assert.match(res.familyEnHusband, /your husband, Priya/);
    assert.match(res.familyTaMother, /உங்கள் தாய், Priya/);
    assert.match(res.familyHiSon, /आपके बेटा, Priya/);
    assert.equal(res.unknownLanguage, res.selfEn, 'an unlisted language falls back to English');
    assert.match(res.unknownRelation, /your family member, Priya/, 'an unlisted relation falls back safely');
    assert.match(res.blankName, /Happy Birthday, friend!/, 'a nameless row still reads like a greeting');
    for (const message of Object.values(res) as string[]) {
      assert.doesNotMatch(message, /PDF|invoice|report|http|discount/i, 'a wish never sells or attaches anything');
    }
  });

  // One customer: opted in, WhatsApp verified, own profile + one family member.
  // A second: opted in but NOT verified. A third: verified but never opted in.
  await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("INSERT INTO users (id, name, email, role, token_version) VALUES ('usr_bd_on', 'Birthday Opted In', 'bd.on@example.test', 'customer', 0)");
$pdo->exec("INSERT INTO users (id, name, email, role, token_version) VALUES ('usr_bd_unverified', 'Unverified Number', 'bd.unv@example.test', 'customer', 0)");
$pdo->exec("INSERT INTO users (id, name, email, role, token_version) VALUES ('usr_bd_noconsent', 'No Consent', 'bd.no@example.test', 'customer', 0)");
$pdo->exec("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender) VALUES ('bp_on', 'usr_bd_on', 'Priya Opted In', '1990-03-14', '07:30', 'Chennai', 'India', 13.08, 80.27, 5.50, 'F')");
$pdo->exec("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender) VALUES ('bp_unv', 'usr_bd_unverified', 'Unverified Person', '1990-03-14', '07:30', 'Chennai', 'India', 13.08, 80.27, 5.50, 'F')");
$pdo->exec("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender) VALUES ('bp_no', 'usr_bd_noconsent', 'No Consent Person', '1990-03-14', '07:30', 'Chennai', 'India', 13.08, 80.27, 5.50, 'F')");
$pdo->exec("INSERT INTO family_members (id, user_id, name, relation, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender) VALUES ('fm_mother', 'usr_bd_on', 'Lakshmi Mother', 'MOTHER', '1962-03-14', '06:00', 'Madurai', 'India', 9.92, 78.12, 5.50, 'F')");
$pdo->exec("INSERT INTO family_members (id, user_id, name, relation, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender) VALUES ('fm_otherday', 'usr_bd_on', 'Ravi Brother', 'BROTHER', '1988-07-02', '06:00', 'Madurai', 'India', 9.92, 78.12, 5.50, 'M')");
$pdo->exec("INSERT INTO user_chat_contacts (user_id, phone_e164, whatsapp_verified_at, viber_verified_at) VALUES ('usr_bd_on', '+919876500001', '2026-10-01 09:00:00', NULL)");
$pdo->exec("INSERT INTO user_chat_contacts (user_id, phone_e164, whatsapp_verified_at, viber_verified_at) VALUES ('usr_bd_unverified', '+919876500002', NULL, NULL)");
$pdo->exec("INSERT INTO user_chat_contacts (user_id, phone_e164, whatsapp_verified_at, viber_verified_at) VALUES ('usr_bd_noconsent', '+919876500003', '2026-10-01 09:00:00', NULL)");
$pdo->exec("INSERT INTO birthday_wish_preferences (user_id, enabled, language) VALUES ('usr_bd_on', 1, 'ta')");
$pdo->exec("INSERT INTO birthday_wish_preferences (user_id, enabled, language) VALUES ('usr_bd_unverified', 1, 'en')");
echo json_encode(['ok' => true]);
`);

  /** Chat settings with both channels configured; the transport is recorded. */
  const RUN = (extra: string) => `
require_once '/repo/api/birthday_wishes.php';
$chatSettings = [
  'enabled' => true,
  'notifyOrderConfirmed' => true,
  'notifyOrderCompleted' => true,
  'whatsapp' => ['enabled' => true, 'provider' => 'webhook', 'webhookUrl' => 'https://gateway.example.test/send'],
  'viber' => ['enabled' => true, 'provider' => 'webhook', 'webhookUrl' => 'https://gateway.example.test/viber'],
  // getWishSettings() takes the site switch from this block when present, and
  // only reads system_settings when it is not - this runtime has no settings row.
  'birthdayWishes' => ['enabled' => true, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => true],
];
$sent = [];
$transport = function ($channel, $phone, $message, $person) use (&$sent) {
  $sent[] = ['channel' => $channel, 'phone' => $phone, 'message' => $message, 'person' => $person['personName'], 'relation' => $person['relation'], 'language' => $person['language']];
  return ['success' => true, 'message' => 'recorded', 'channel' => $channel];
};
${extra}
`;

  runtime('one run wishes the opted-in customer and their family member, once each', async () => {
    const res = await php(RUN(`
$summary = AstroBirthdayWishes::sendDueWishes($pdo = getDbConnection(), [
  'date' => '2026-03-14', 'settings' => $chatSettings, 'transport' => $transport
]);
$logged = $pdo->query("SELECT person_key, person_name, channel, status, wish_year FROM birthday_wishes_log ORDER BY person_key ASC")->fetchAll();
echo json_encode(['summary' => $summary, 'sent' => $sent, 'logged' => $logged]);
`));
    assert.equal(res.summary.success, true);
    // Three people are DUE on 2026-03-14: the opted-in customer, her saved
    // mother, and the second customer who opted in but never verified a number.
    // Consent decides who is due; verification decides who is messaged - so two
    // are sent and one is skipped, and the skip is reported rather than silent.
    assert.equal(res.summary.due, 3, 'the account holder, her family member, and the unverified opt-in');
    assert.equal(res.summary.sent, 2);
    assert.equal(res.summary.failed, 0);
    assert.equal(res.summary.skipped, 1, 'the opted-in customer with no verified number');
    const people = res.sent.map((row: any) => row.person).sort();
    assert.deepEqual(people, ['Lakshmi Mother', 'Priya Opted In']);
    const self = res.sent.find((row: any) => row.person === 'Priya Opted In');
    const mother = res.sent.find((row: any) => row.person === 'Lakshmi Mother');
    assert.equal(self.channel, 'whatsapp', 'only the app they verified');
    assert.equal(self.phone, '+919876500001', 'the verified number, never users.mobile');
    assert.equal(self.language, 'ta', 'the language they chose when they opted in');
    assert.match(self.message, /இனிய பிறந்தநாள் நல்வாழ்த்துகள், Priya Opted In!/);
    assert.match(mother.message, /உங்கள் தாய், Lakshmi Mother!/, 'a family birthday names the relation');
    assert.equal(res.logged.length, 2);
    assert.deepEqual(res.logged.map((row: any) => row.person_key).sort(), ['fm:fm_mother', 'self']);
    assert.ok(res.logged.every((row: any) => row.status === 'SENT' && row.wish_year === 2026));
  });

  runtime('a second run the same year sends nothing (the dedupe key holds)', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2026-03-14', 'settings' => $chatSettings, 'transport' => $transport]);
echo json_encode(['summary' => $summary, 'sent' => $sent]);
`));
    assert.deepEqual(res.sent, [], 'nothing was messaged a second time');
    assert.equal(res.summary.sent, 0);
    assert.equal(res.summary.skipped, 3, 'two already wished this year, one still unverified');
  });

  runtime('the same birthday next year is wished again', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2027-03-14', 'settings' => $chatSettings, 'transport' => $transport]);
echo json_encode(['summary' => $summary, 'sent' => $sent]);
`));
    assert.equal(res.summary.sent, 2, 'a new year means a new wish');
    assert.equal(res.summary.date, '2027-03-14');
  });

  runtime('an unverified number is never messaged, and no consent means no wish', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$due = AstroBirthdayWishes::duePeople($pdo, '2026-03-14', AstroBirthdayWishes::getWishSettings($pdo, $chatSettings));
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2026-07-02', 'settings' => $chatSettings, 'transport' => $transport]);
echo json_encode(['due' => array_map(function ($p) { return $p['userId'] . '/' . $p['personKey']; }, $due), 'brotherRun' => $summary, 'brotherSent' => $sent]);
`));
    // 2026-03-14 is due only for the opted-in customer: the unverified one is
    // in the due list (they opted in) but must be skipped at send time, and the
    // customer with no consent row is not in it at all.
    assert.deepEqual(res.due.sort(), ['usr_bd_on/fm:fm_mother', 'usr_bd_on/self', 'usr_bd_unverified/self'],
      'consent decides who is due; verification decides who is messaged');
    assert.ok(!res.due.some((key: string) => key.startsWith('usr_bd_noconsent')), 'no consent row => never due');
    // 2026-07-02 is the brother's birthday (also opted-in customer).
    assert.equal(res.brotherRun.sent, 1);
    assert.equal(res.brotherSent[0].relation, 'BROTHER');
    assert.match(res.brotherSent[0].message, /Ravi Brother/, 'the person is named');
    assert.match(res.brotherSent[0].message, /உங்கள் சகோதரன்/,
      'and the relation is in the stored language - this customer opted in as Tamil');
  });

  runtime('an unverified customer is skipped at send time, not messaged', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2028-03-14', 'settings' => $chatSettings, 'transport' => $transport]);
echo json_encode(['summary' => $summary, 'sent' => $sent]);
`));
    const phones = res.sent.map((row: any) => row.phone);
    assert.ok(!phones.includes('+919876500002'), 'the saved-but-unverified number is never messaged');
    assert.ok(res.summary.skipped >= 1, 'and the run reports the skip');
    assert.ok(res.summary.details.some((detail: any) => detail.reason === 'no verified WhatsApp/Viber number'));
  });

  runtime('both switches off means nothing is sent', async () => {
    const featureOff = await php(RUN(`
$off = $chatSettings;
$off['birthdayWishes'] = ['enabled' => false, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => true];
echo json_encode(AstroBirthdayWishes::sendDueWishes(getDbConnection(), ['date' => '2029-03-14', 'settings' => $off, 'transport' => $transport]));
`));
    assert.equal(featureOff.sent, 0);
    assert.match(featureOff.message, /Birthday wishes are switched off in the admin panel/);

    const chatOff = await php(RUN(`
$off = $chatSettings;
$off['enabled'] = false;
$off['birthdayWishes'] = ['enabled' => true, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => true];
echo json_encode(AstroBirthdayWishes::sendDueWishes(getDbConnection(), ['date' => '2029-03-14', 'settings' => $off, 'transport' => $transport]));
`));
    assert.equal(chatOff.sent, 0);
    assert.match(chatOff.message, /Chat alerts are switched off/);
  });

  runtime('family members can be excluded, leaving the account holder only', async () => {
    const res = await php(RUN(`
$self = $chatSettings;
$self['birthdayWishes'] = ['enabled' => true, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => false];
$pdo = getDbConnection();
$due = AstroBirthdayWishes::duePeople($pdo, '2026-03-14', AstroBirthdayWishes::getWishSettings($pdo, $self));
echo json_encode(array_map(function ($p) { return $p['personKey']; }, $due));
`));
    assert.deepEqual(res, ['self', 'self'], 'both opted-in customers are due, and only for themselves');
    assert.ok(!res.includes('fm:fm_mother'), 'the family member is excluded');
  });

  runtime('a dry run decides everything and sends nothing', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$pdo->exec("DELETE FROM birthday_wishes_log");
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2030-03-14', 'settings' => $chatSettings, 'transport' => $transport, 'dryRun' => true]);
$logged = $pdo->query("SELECT COUNT(*) FROM birthday_wishes_log")->fetchColumn();
echo json_encode(['summary' => $summary, 'sent' => $sent, 'logged' => (int)$logged]);
`));
    assert.equal(res.summary.dryRun, true);
    assert.equal(res.sent.length, 0, 'the transport was never called');
    assert.equal(res.logged, 0, 'and nothing was written to the dedupe log');
    assert.ok(res.summary.sent >= 1, 'the preview still counts what the cron would send');
    assert.ok(res.summary.details.some((detail: any) => detail.status === 'DRY_RUN' && detail.message));
    assert.match(res.summary.details.find((detail: any) => detail.status === 'DRY_RUN').message, /ASTRO SIVAM/);
  });

  runtime('the per-run limit caps a burst of gateway messages', async () => {
    const res = await php(RUN(`
$pdo = getDbConnection();
$summary = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2031-03-14', 'settings' => $chatSettings, 'transport' => $transport, 'limit' => 1]);
echo json_encode(['summary' => $summary, 'sent' => $sent]);
`));
    assert.equal(res.sent.length, 1, 'one message only');
    assert.equal(res.summary.sent, 1);
    assert.ok(res.summary.details.some((detail: any) => detail.reason === 'per-run message limit reached'));
  });

  runtime('a failed gateway call is recorded, so it is not retried into a loop', async () => {
    const res = await php(`
require_once '/repo/api/birthday_wishes.php';
$pdo = getDbConnection();
$pdo->exec("DELETE FROM birthday_wishes_log");
$chatSettings = [
  'enabled' => true,
  'whatsapp' => ['enabled' => true, 'provider' => 'webhook', 'webhookUrl' => 'https://gateway.example.test/send'],
  'viber' => ['enabled' => false, 'provider' => 'webhook', 'webhookUrl' => ''],
  'birthdayWishes' => ['enabled' => true, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => true]
];
$calls = 0;
$transport = function ($channel, $phone, $message, $person) use (&$calls) {
  $calls += 1;
  return ['success' => false, 'message' => 'gateway 503', 'channel' => $channel];
};
$first = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2032-03-14', 'settings' => $chatSettings, 'transport' => $transport]);
$second = AstroBirthdayWishes::sendDueWishes($pdo, ['date' => '2032-03-14', 'settings' => $chatSettings, 'transport' => $transport]);
$rows = $pdo->query("SELECT status, detail FROM birthday_wishes_log")->fetchAll();
echo json_encode(['first' => $first, 'second' => $second, 'calls' => $calls, 'rows' => $rows]);
`);
    assert.equal(res.first.failed, 2, 'both reachable people failed at the gateway');
    assert.equal(res.first.sent, 0);
    assert.equal(res.first.skipped, 1, 'the unverified customer is skipped, not counted as a failure');
    assert.equal(res.second.sent, 0);
    assert.equal(res.second.skipped, 3, 'a failure is logged, so the next run does not re-message');
    assert.equal(res.calls, 2, 'the gateway was called once per person, not once per run');
    assert.ok(res.rows.every((row: any) => row.status === 'FAILED' && row.detail === 'gateway 503'));
  });

  runtime('opting in without a verified number is refused; opting out always works', async () => {
    const res = await php(`
require_once '/repo/api/birthday_wishes.php';
$pdo = getDbConnection();
// savePreference() reads the site switch itself (getWishSettings with no
// argument), so the settings row has to exist. Built with json_encode and a
// bound parameter: hand-escaping this JSON inside a JS template literal is how
// the row silently arrives malformed.
$pdo->exec("DELETE FROM system_settings");
$block = json_encode(['chatAlertSettings' => [
  'enabled' => true,
  'birthdayWishes' => ['enabled' => true, 'timezone' => 'Asia/Kolkata', 'includeFamilyMembers' => true],
  'whatsapp' => ['enabled' => true, 'provider' => 'webhook', 'webhookUrl' => 'https://gateway.example.test/send'],
  'viber' => ['enabled' => false]
]]);
$st = $pdo->prepare("INSERT INTO system_settings (id, general_settings) VALUES (1, ?)");
$st->execute([$block]);
$noConsent = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_noconsent', true, 'hi');
$unverified = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_unverified', true, 'en');
$verified = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_on', true, 'ta');
$optOut = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_on', false, 'ta');
$optOutUnverified = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_unverified', false, 'en');
$badLang = AstroBirthdayWishes::savePreference($pdo, 'usr_bd_on', true, 'fr');
echo json_encode([
  'noConsent' => $noConsent, 'unverified' => $unverified, 'verified' => $verified,
  'optOut' => $optOut, 'optOutUnverified' => $optOutUnverified, 'badLang' => $badLang
]);
`);
    assert.equal(res.unverified.success, false, 'a saved but unverified number cannot be switched on');
    assert.match(res.unverified.message, /Verify your number on WhatsApp or Viber first/);
    assert.equal(res.verified.success, true);
    assert.equal(res.verified.birthdayWishes.enabled, true);
    assert.equal(res.verified.birthdayWishes.language, 'ta');
    assert.equal(res.verified.birthdayWishes.savedPeople, 3, 'own profile + two family members');
    assert.match(res.verified.message, /3 saved people/, 'the confirmation says what it covers');
    assert.match(res.verified.message, /Wishes are text only — reports and invoices stay on email/);
    assert.equal(res.optOut.success, true, 'turning it off is never blocked');
    assert.equal(res.optOut.birthdayWishes.enabled, false);
    assert.equal(res.optOutUnverified.success, true, 'and off works even with an unverified number');
    assert.equal(res.badLang.birthdayWishes.language, 'en', 'an unlisted language falls back to English');
    assert.equal(res.noConsent.success, true, 'a verified customer with no consent row can opt in');
    assert.equal(res.noConsent.birthdayWishes.language, 'hi');
  });

  runtime('the customer and admin routes answer over real HTTP', async () => {
    const customer = await bridge.runPhp(
      `echo json_encode(['token' => createBearerToken(['id' => 'usr_bd_on', 'email' => 'bd.on@example.test', 'role' => 'customer'], 3600, 0)]);`
    );
    const asCustomer = (method: string, url: string, json?: unknown) =>
      bridge.request({ method, url, json, auth: false, headers: { authorization: `Bearer ${customer.token}` } });

    const state = await asCustomer('GET', '/api/services/birthday-wishes');
    assert.equal(state.status, 200);
    assert.equal(state.json?.success, true);
    assert.equal(typeof state.json?.birthdayWishes?.enabled, 'boolean');
    assert.ok(Array.isArray(state.json?.birthdayWishes?.channels));

    const optIn = await asCustomer('POST', '/api/services/birthday-wishes', { enabled: true, language: 'hi' });
    assert.equal(optIn.status, 200, optIn.json?.message);
    assert.equal(optIn.json?.birthdayWishes?.enabled, true);
    assert.equal(optIn.json?.birthdayWishes?.language, 'hi');

    const anonymous = await bridge.request({ method: 'GET', url: '/api/services/birthday-wishes', auth: false });
    assert.equal(anonymous.status, 401, 'the consent route is owner-only');

    const preview = await bridge.request({ method: 'GET', url: '/api/admin/birthday-wishes/preview?date=2026-03-14' });
    assert.equal(preview.status, 200, preview.json?.message);
    assert.equal(preview.json?.summary?.dryRun, true, 'preview never sends');
    assert.equal(preview.json?.summary?.date, '2026-03-14');

    const badDate = await bridge.request({ method: 'GET', url: '/api/admin/birthday-wishes/preview?date=yesterday' });
    assert.equal(badDate.status, 400);

    const runGet = await bridge.request({ method: 'GET', url: '/api/admin/birthday-wishes/run' });
    assert.equal(runGet.status, 405, 'sending is POST-only');
  });

  for (const [name, fn] of runtimeChecks) {
    checks.push([name, fn]);
  }
}

let failures = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  [FAIL] ${name}\n         ${(error as Error).message}`);
  }
}

// Without this the PHP worker holds the event loop open and `npm test` waits
// for a process that has already printed its verdict.
if (openBridge) await openBridge.close();

if (failures > 0) {
  console.error(`\nbirthday-wishes: ${failures} failing check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\nbirthday-wishes: all ${checks.length} checks passed`);
}
