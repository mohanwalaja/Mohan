/**
 * Saved family members + frozen report download (customer request, 2026-10).
 *
 * The three complaints this pins down:
 *   1. Order forms used to open with the signed-in customer's own birth
 *      details already filled in ("default taking his details"). Forms now
 *      start BLANK; a saved person fills the form only when explicitly
 *      picked (SavedPersonPicker), and an order can never overwrite the
 *      customer's own birth profile unless "Myself" was the pick.
 *   2. Customers can save up to 6 family members' birth details in their
 *      profile and order for them without filling forms.
 *   3. Delivered reports are downloadable from the dashboard, but ONLY as
 *      the exact report prepared on the order date (frozen snapshot,
 *      "Prepared on" printed on the report) — a re-download never
 *      recalculates, so it can never become a free fresh report.
 *
 * Layers: (1) pure client logic, (2) wiring contracts across the frontend
 * and PHP sources, (3) the real PHP renderers under PHP-WASM when the
 * dev-only runtime is installed (SKIPs otherwise, like the refund suite).
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSavedPeople,
  consumePendingOrderFor,
  familyRelationLabel,
  FAMILY_RELATION_OPTIONS,
  locationFromSavedPerson,
  setPendingOrderFor
} from '../src/utils/birthDetails';
import { MAX_FAMILY_MEMBERS } from '../src/types';
import type { BirthProfile, FamilyMember } from '../src/types';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

// ---------------------------------------------------------------- logic ---
const profile: BirthProfile = {
  name: 'Meera Krishnan', dob: '1990-08-15', tob: '09:30', birthPlace: 'Madurai, Tamil Nadu',
  country: 'India', latitude: 9.9252, longitude: 78.1198, timezoneOffsetHours: 5.5, gender: 'F'
};
const spouse: FamilyMember = {
  id: 'fm_1', name: 'Arjun', relation: 'SPOUSE', dob: '1988-03-02', tob: '06:15',
  birthPlace: 'Chennai, Tamil Nadu', country: 'India', latitude: 13.0827, longitude: 80.2707,
  timezoneOffsetHours: 5.5, gender: 'M'
};

check('saved people list: self first, then family, incomplete profiles skipped', () => {
  const people = buildSavedPeople(profile, [spouse]);
  assert.equal(people.length, 2);
  assert.equal(people[0].source, 'self');
  assert.equal(people[0].name, 'Meera Krishnan');
  assert.equal(people[1].source, 'family');
  assert.equal(people[1].key, 'fm_1');
  assert.equal(people[1].relationLabel, 'Spouse');
  // A self profile without a saved birth place must not invent a pickable
  // "Myself" entry (there is nothing verified to fill the form with).
  assert.equal(buildSavedPeople({ ...profile, birthPlace: '' }, []).length, 0);
  assert.equal(buildSavedPeople(undefined, [spouse]).length, 1);
});

check('relation labels and options cover the server enum exactly', () => {
  const sql = read('api/migrations/016_family_members_and_report_snapshot.sql');
  const enumMatch = sql.match(/`relation` ENUM\(([^)]+)\)/);
  assert.ok(enumMatch, 'migration defines the relation enum');
  const serverEnum = [...enumMatch[1].matchAll(/'([A-Z]+)'/g)].map(m => m[1]).sort();
  const clientEnum = FAMILY_RELATION_OPTIONS.map(o => o.value).sort();
  assert.deepEqual(clientEnum, serverEnum);
  assert.equal(familyRelationLabel('SPOUSE'), 'Spouse');
  assert.equal(familyRelationLabel('DAUGHTER'), 'Daughter');
  assert.equal(familyRelationLabel('WHATEVER'), 'Family');
});

check('family size limit is 6 on the client', () => {
  assert.equal(MAX_FAMILY_MEMBERS, 6);
});

check('saved person resolves to a verified picker location only with real coordinates', () => {
  const people = buildSavedPeople(profile, [spouse]);
  const loc = locationFromSavedPerson(people[1]);
  assert.ok(loc);
  assert.equal(loc.placeName, 'Chennai, Tamil Nadu');
  assert.equal(loc.latitude, 13.0827);
  const broken: FamilyMember = { ...spouse, id: 'fm_2', latitude: Number.NaN, longitude: Number.NaN };
  assert.equal(locationFromSavedPerson(buildSavedPeople(undefined, [broken])[0]), null);
});

check('dashboard "Order for" hand-off is one-time and explicit', () => {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); }
  };
  try {
    assert.equal(consumePendingOrderFor(), '');
    setPendingOrderFor('fm_1');
    assert.equal(consumePendingOrderFor(), 'fm_1');
    assert.equal(consumePendingOrderFor(), '', 'selection is consumed exactly once');
  } finally {
    delete (globalThis as any).sessionStorage;
  }
});

// ------------------------------------------------------------- frontend ---
for (const page of ['BirthJathagamPage', 'MarriageCompatibilityPage', 'MuhurthamPage', 'BabyNamingPage']) {
  check(`${page}: blank form + explicit saved-person picker, no silent auto-fill`, () => {
    const src = read(`src/pages/${page}.tsx`);
    assert.match(src, /SavedPersonPicker/, 'page must offer the picker');
    assert.doesNotMatch(src, /Saved Birth Profile loaded/, 'the old silent auto-fill banner must not return');
    assert.doesNotMatch(src, /locationFromBirthProfile/, 'profile must not be copied into the form automatically');
  });
}

check('Birth Jathagam saves the account profile only when "Myself" was picked', () => {
  const src = read('src/pages/BirthJathagamPage.tsx');
  assert.match(src, /saveAsProfile: saveAsProfile && pickedPerson\?\.source === 'self'/);
  assert.match(src, /saveAsProfile=\{saveAsProfile && pickedPerson\?\.source === 'self'\}/);
  assert.match(src, /FAMILY_RELATION_OPTIONS/, 'picked family member or new relation can be saved from the form');
});

check('multi-person checkout cards offer saved people but start blank', () => {
  const src = read('src/components/cart/MultiPersonCheckout.tsx');
  assert.match(src, /buildSavedPeople/);
  assert.match(src, /Fill from saved details/);
  assert.doesNotMatch(src, /savedPeople\[0\]/, 'first saved person must never be preselected');
});

check('dashboard: family tab, frozen download, honest wording', () => {
  const src = read('src/pages/CustomerDashboard.tsx');
  assert.match(src, /Family Members \(\{savedPeopleDisplay\}\/\{MAX_FAMILY_MEMBERS\}\)/);
  assert.match(src, /Download Report/);
  assert.match(src, /getMyOrderReportSnapshot/, 'the download renders the frozen snapshot at email quality');
  assert.match(src, /downloadPaidReportPdf/);
  assert.doesNotMatch(src, /frozen as ordered|your order language|never updates itself/,
    'the customer asked for this profile wording to be removed');
  assert.match(src, /Order for \{member\.name\}/);
  assert.doesNotMatch(src, /Reports are not stored for download/);
  assert.doesNotMatch(src, /automatically reused across all your horoscope calculations/);
});

check('api client: family CRUD + the frozen snapshot source', () => {
  const src = read('src/services/api.ts');
  assert.match(src, /getFamilyMembers/);
  assert.match(src, /saveFamilyMember/);
  assert.match(src, /deleteFamilyMember/);
  assert.match(src, /\/services\/orders\/\$\{encodeURIComponent\(orderId\)\}\/report-snapshot/);
  assert.ok(!src.includes('/report-pdf'), 'no server PDF download may come back');
  assert.ok(!src.includes('export-preview-pdf'), 'no server preview export may come back');
});

check('Saved Birth Profile tab is gone; you are the first of the six saved people', () => {
  const src = read('src/pages/CustomerDashboard.tsx');
  // No separate tab and no separate wording for a saved profile.
  assert.doesNotMatch(src, /<span>Saved Birth Profile<\/span>/, 'the Saved Birth Profile tab must stay removed');
  assert.doesNotMatch(src, /activeTab === 'profile'/, 'there is no profile tab state any more');
  assert.doesNotMatch(src, /My Saved Birth Profile/, 'the removed profile heading must not return');
  // The account holder is a card INSIDE the family tab, and counts toward 6.
  assert.match(src, /data-saved-person="self"/, 'the account holder must be the first saved-person card');
  assert.match(src, /Myself \(you\)/);
  assert.match(src, /const savedPeopleCount = familyMembers\.length \+ \(birthProfile \? 1 : 0\);/,
    'the account holder must count as one of the six');
  assert.match(src, /Math\.min\(savedPeopleCount, MAX_FAMILY_MEMBERS\)/,
    'a legacy 6-members-plus-profile account must display as 6/6, never 7/6');
  assert.match(src, /You plus up to \{MAX_FAMILY_MEMBERS - 1\} family members/,
    'the family copy must state that you are included in the six');
  // The self card can be edited and ordered for, from the family tab.
  assert.match(src, /startEditingSelf/);
  assert.match(src, /Order for Myself/);
});

check('the account-alert settings live in the dashboard header, not a profile tab', () => {
  const src = read('src/pages/CustomerDashboard.tsx');
  const header = src.indexOf('Account alerts — account header area');
  const tabs = src.indexOf('{/* Tabs */}');
  assert.ok(header > 0 && tabs > header, 'the alert settings card must sit above the tab bar');
  const alertBlock = src.slice(header, tabs);
  assert.match(alertBlock, /WhatsApp &amp; Viber Order Alerts/);
  assert.match(alertBlock, /alertsOpen/);
  assert.doesNotMatch(alertBlock, /activeTab ===/, 'the alerts must not be gated behind a tab');
  // The number/OTP handlers are unchanged.
  assert.match(alertBlock, /handleSaveChatNumber/);
  assert.match(alertBlock, /handleConfirmChatOtp/);
});

check('the server counts the account holder toward the same six-person cap', () => {
  const src = read('api/services/index.php');
  // Customer report (Oct 2026): two saved members blocked a third — legacy
  // duplicate birth_profiles rows (one per old order) were counted as extra
  // people. The holder's own profile is a BOOLEAN slot now, never a row
  // count, and duplicates are collapsed before counting.
  assert.match(src, /astro_birth_profiles_dedupe\(\$pdo, \(string\)\$user\['id'\]\)/,
    'legacy duplicate profile rows are collapsed before the budget is checked');
  assert.match(src, /\(astro_birth_profile_exists\(\$pdo, \(string\)\$user\['id'\]\) \? 1 : 0\)/,
    'the account holder counts once, however many legacy rows exist');
  assert.doesNotMatch(src, /\$ownProfile->fetchColumn\(\)/,
    'counting raw birth_profiles rows must never come back');
  assert.match(src, /SELECT COUNT\(\*\) FROM family_members WHERE user_id = \?/);
  assert.match(src, />= 6/);
  assert.match(src, /including yourself/);
});

check('birth profile helpers: boolean slot, self-healing dedupe, one row per user', () => {
  const helpers = read('api/birth_profiles.php');
  assert.match(helpers, /function astro_birth_profile_exists\(\$pdo, string \$userId\): bool/);
  assert.match(helpers, /function astro_birth_profiles_dedupe\(\$pdo, string \$userId\): int/);
  assert.match(helpers, /ORDER BY updated_at DESC, id DESC/, 'the newest row always wins');
  assert.match(helpers, /DELETE FROM birth_profiles WHERE user_id = \? AND id IN/);
  const services = read('api/services/index.php');
  assert.match(services, /require_once __DIR__ \. '[^']*birth_profiles\.php'/, 'the services router loads the helpers');
  // Every LIMIT-1 read names the newest row explicitly - a duplicate-poisoned
  // table can never hydrate a login or profile page from a random row.
  assert.ok(
    (services.match(/FROM birth_profiles WHERE user_id = \? ORDER BY updated_at DESC, id DESC LIMIT 1/g) || []).length >= 4,
    'all services LIMIT-1 reads pick the newest row deterministically'
  );
  const auth = read('api/auth/index.php');
  assert.ok(
    (auth.match(/FROM birth_profiles WHERE user_id = \? ORDER BY updated_at DESC, id DESC LIMIT 1/g) || []).length >= 6,
    'all auth LIMIT-1 reads pick the newest row deterministically'
  );
  assert.doesNotMatch(auth + services, /FROM birth_profiles WHERE user_id = \? LIMIT 1/,
    'no non-deterministic LIMIT-1 read remains');
  const migration = read('api/migrations/018_birth_profiles_one_row_per_user.sql');
  assert.match(migration, /DELETE bp FROM `birth_profiles` bp/, 'production duplicates are removed once');
  assert.match(migration, /ADD UNIQUE KEY `uq_birth_profiles_user_id` \(`user_id`\)/);
  const schema = read('api/schema.sql');
  assert.match(schema, /UNIQUE KEY `uq_birth_profiles_user_id` \(`user_id`\)/,
    'fresh installs are born with the one-row-per-user guarantee');
});

// -------------------------------------------------------------- backend ---
check('family endpoints: owner-scoped CRUD with the 6-member cap', () => {
  const src = read('api/services/index.php');
  assert.match(src, /\/services\/family-members/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS `family_members`/);
  assert.match(src, /SELECT COUNT\(\*\) FROM family_members WHERE user_id = \?/);
  assert.match(src, />= 6/, 'server rejects a 7th family member');
  assert.match(src, /DELETE FROM family_members WHERE id = \? AND user_id = \?/, 'delete is owner-scoped');
  assert.match(src, /UPDATE family_members SET[\s\S]*?WHERE id = \? AND user_id = \?/, 'update is owner-scoped');
});

check('an order can no longer overwrite the account birth profile unasked', () => {
  const src = read('api/services/index.php');
  assert.doesNotMatch(src, /\(\(\$saveAsProfile \|\| true\)/, 'the always-save bug must stay fixed');
  assert.match(src, /if \(\$saveAsProfile && !empty\(\$bpTarget\['dob'\]\)/);
});

check('snapshot is frozen at creation in every order write path', () => {
  const services = read('api/services/index.php');
  const multi = read('api/services/multi_person_order.php');
  assert.ok((services.match(/astro_write_report_snapshot\(\$pdo, 'orders'/g) || []).length >= 2,
    'single + legacy multi order inserts freeze the header snapshot');
  assert.match(multi, /astro_write_report_snapshot\(\$pdo, 'orders', \$orderId/);
  assert.match(multi, /astro_write_report_snapshot\(\$pdo, 'order_items', \$itemId/);
  const config = read('api/config.php');
  assert.match(config, /report_snapshot IS NULL OR report_snapshot = ''/, 'snapshot write is write-once');
});

check('the server PDF route is gone: the dashboard renders the snapshot in the browser', () => {
  const src = read('api/services/index.php');
  // The removal note may name the retired path; what must not come back is the
  // route wiring that streams a PDF (or the preview export that renders one).
  assert.ok(!/preg_match\([^\n]*report-pdf/.test(src), 'no report-pdf route may come back');
  assert.ok(!/preg_match\([^\n]*export-preview-pdf/.test(src), 'no preview export route may come back');
  assert.ok(!src.includes('Content-Type: application/pdf'), 'the API must never stream a PDF');
  assert.ok(!src.includes("'download-order-report'"), 'the legacy PDF download action must stay removed');
  for (const legacy of [
    'AstroEngine::generateReportPdf',
    'AstroEngine::generateInvoicePdf',
    'AstroEngine::generateFamilyInvoicePdf'
  ]) {
    assert.ok(!src.includes(legacy), `services must never call ${legacy}`);
  }
  const engine = read('api/astrology/engine.php');
  for (const method of ['generateReportPdf', 'generateInvoicePdf', 'generateFamilyInvoicePdf', 'assertMpdfPdf']) {
    assert.ok(!engine.includes(`function ${method}`), `engine.${method}() must stay deleted`);
  }
});

check('the report views render HTML only - no PDF renderer, no frozen flag', () => {
  const views = read('api/astrology/report_views.php');
  assert.ok(!views.includes('AstroMpdfReports'), 'the mPDF class must stay deleted');
  assert.ok(!views.includes('frozen_snapshot'), 'the unused frozen flag must stay removed');
  assert.match(views, /class AstroReportViews/);
});

check('every report prints its prepared date (frozen date, never download date)', () => {
  const views = read('api/astrology/report_views.php');
  assert.match(views, /function preparedDateStamp/);
  // Owner request (2026-10-21): inside the reports the stamp is the bare date —
  // no "Prepared on" label in English, Tamil or Hindi.
  assert.doesNotMatch(views, /Prepared on/, 'the English label is gone from the server views');
  assert.doesNotMatch(views, /தயாரிக்கப்பட்ட நாள்/, 'and the Tamil label');
  assert.doesNotMatch(views, /तैयार तिथि/, 'and the Hindi label');
  // Owner request (Oct 2026): the stamp prints on the FIRST page of every
  // report only, on the LEFT of the reference line — never centred with the
  // page numbers.
  assert.ok(
    (views.match(/topHeader\([^;]*\$preparedLabel/g) || []).length >= 3,
    'the Jathagam, Wedding and Muhurtham page-1 headers all carry the stamp'
  );
  assert.doesNotMatch(views, /\$page2Html = self::topHeader\([^;]*\$preparedLabel/,
    'Jathagam page 2 carries no stamp');
  assert.doesNotMatch(views, /\$page3Html = self::topHeader\([^;]*\$preparedLabel/,
    'Jathagam page 3 carries no stamp');
  assert.match(views, /ref-left/, 'the server views put the stamp on the LEFT of the reference line');
  assert.match(views, /bn-prepared/, 'the Baby Naming page-1 footer carries the stamp');
  assert.match(views, /Issued On/, 'wedding/muhurtham/baby keep their issued-on date');
  const ts = read('src/services/jathagamHtmlBuilder.ts');
  assert.match(ts, /footer-prepared/);
  assert.doesNotMatch(ts, /Prepared on/, 'the browser builder prints the bare date too');
  assert.match(ts, /pageNumber === 1/, 'the browser Jathagam builder stamps page 1 only');
  assert.match(ts, /position: absolute;\s*left: 0/, 'the browser stamp is pinned to the left edge');
  assert.match(ts, /\['generatedAt'\]|generatedAt/, 'TS stamp reads the frozen result date');
  for (const builderName of ['weddingHtmlBuilder', 'babyNamingHtmlBuilder']) {
    const builder = read(`src/services/${builderName}.ts`);
    assert.match(builder, /footer-prepared/, `${builderName} stamps its first-page footer`);
    assert.match(builder, /pageNumber === 1|preparedStampHtml/, `${builderName} keeps the stamp off later pages`);
  }
  assert.match(read('src/services/muhurthamHtmlBuilder.ts'), /brand-prepared/,
    'the Muhurtham builder stamps the left of its page-1 brand line');
});

check('migration + schema carry family_members and the snapshot columns', () => {
  const migration = read('api/migrations/016_family_members_and_report_snapshot.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `family_members`/);
  assert.match(migration, /ALTER TABLE `orders`[\s\S]*?`report_snapshot` LONGTEXT/);
  assert.match(migration, /ALTER TABLE `order_items`[\s\S]*?`report_snapshot` LONGTEXT/);
  assert.match(migration, /SET `report_snapshot` = `calculated_result`/, 'history is frozen by copying, never recalculating');
  const schema = read('api/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `family_members`/);
  assert.match(schema, /`report_snapshot` LONGTEXT NULL/);
});

check('my-orders exposes persons/items + snapshot metadata; the body is fetched per download', () => {
  const src = read('api/services/index.php');
  assert.match(src, /astro_attach_order_items\(\$pdo, \$orders\)/);
  assert.match(src, /'hasReportSnapshot' => !empty\(\$r\['report_snapshot'\]\) \|\| !empty\(\$r\['calculated_result'\]\)/);
  assert.match(src, /report-snapshot/, 'the dedicated route returns ONE frozen body on demand');
  const items = read('api/admin/order_items.php');
  assert.match(items, /'hasReportSnapshot' => !empty\(\$row\['report_snapshot'\]\)/);
});

// ------------------------------------------------------- PHP-WASM run ---
let failures = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  [FAIL] ${name}\n         ${(error as Error).message}`);
  }
}

const wasmInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!wasmInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the PHP renderer execution did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const phpFile = path.join(root, 'tests', '_family_frozen_runtime.php');
  fs.writeFileSync(phpFile, `<?php
require_once __DIR__ . '/../api/astrology/engine.php';
require_once __DIR__ . '/../api/astrology/report_views.php';
function ok(bool $c, string $m): void {
    echo ($c ? "[PASS] " : "[FAIL] ") . $m . "\\n";
    if (!$c) { $GLOBALS['fails'] = ($GLOBALS['fails'] ?? 0) + 1; }
}
ok(AstroReportViews::preparedDateStamp(['generatedAt' => '2024-02-03 10:00:00'], 'en') === '03 Feb 2024', 'the stamp is the frozen date alone, no label');
ok(AstroReportViews::preparedDateStamp(['generatedAt' => '2024-02-03 10:00:00'], 'ta') === '03 Feb 2024', 'and the same bare date in every language');
ok(AstroReportViews::preparedDateStamp([], 'en') === '', 'no prepared date in result -> no invented today stamp');
$birth = ['name' => 'Frozen Native', 'gender' => 'M', 'dob' => '1990-08-15', 'tob' => '09:30',
  'birthPlace' => 'Suva', 'country' => '', 'latitude' => -18.1416,
  'longitude' => 178.4419, 'timezoneOffsetHours' => 12, 'timeZoneId' => 'Pacific/Fiji'];
$result = AstroEngine::calculateHoroscope($birth);
$result['generatedAt'] = '2024-02-03 10:00:00';
$order = ['service_type' => 'BIRTH_JATHAGAM', 'language' => 'en', 'order_number' => 'ORD-FROZEN1',
  'user_name' => 'Frozen Native', 'input_payload' => $birth];
$html = AstroReportViews::renderFullReportHtml($order, $result);
ok(strpos($html, 'header-prepared">03 Feb 2024<') !== false, 'Jathagam header prints the frozen date, bare');
ok(substr_count($html, 'header-prepared">03 Feb 2024<') === 1, 'the stamp prints on the first page only, never repeated');
ok(strpos($html, 'Prepared on') === false, 'and the report carries no "Prepared on" wording anywhere');
ok(strpos($html, 'ref-left') !== false, 'the stamp rides the LEFT cell of the reference line');
$babyOrder = ['service_type' => 'BABY_NAMING', 'language' => 'en', 'order_number' => 'ORD-PREVIEW2',
  'user_name' => 'Parent', 'input_payload' => $birth];
try {
  $live = AstroReportViews::renderFullReportHtml($babyOrder, ['babyNamingAlgorithmVersion' => 1, 'generatedAt' => '2023-01-01 00:00:00']);
  ok(strpos($live, 'ORD-PREVIEW2') !== false, 'the preview render still recalculates a legacy baby result');
} catch (Throwable $e) { ok(false, 'the preview render still recalculates a legacy baby result'); }
// Family budget regression (customer report, Oct 2026): legacy duplicate
// birth_profiles rows must never spend the "6 saved people" budget.
require_once __DIR__ . '/../api/birth_profiles.php';
$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("CREATE TABLE birth_profiles (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, dob TEXT, tob TEXT, birth_place TEXT, country TEXT, latitude REAL, longitude REAL, timezone_offset_hours REAL, gender TEXT, updated_at TEXT)");
$ins = $pdo->prepare("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, gender, updated_at) VALUES (?, 'u1', 'Self', '1990-01-01', '10:00', 'Chennai', 'India', 13.08, 80.27, 5.5, 'M', ?)");
foreach (['bp_old1' => '2026-01-01 10:00:00', 'bp_old2' => '2026-02-01 10:00:00', 'bp_old3' => '2026-03-01 10:00:00', 'bp_new' => '2026-04-01 10:00:00'] as $legacyId => $legacyTs) {
    $ins->execute([$legacyId, $legacyTs]);
}
ok(astro_birth_profile_exists($pdo, 'u1') === true, 'holder with four legacy rows still counts as ONE slot');
ok(astro_birth_profiles_dedupe($pdo, 'u1') === 3, 'dedupe removes exactly the legacy duplicate rows');
$left = $pdo->query("SELECT id FROM birth_profiles WHERE user_id = 'u1'")->fetchAll(PDO::FETCH_COLUMN);
ok($left === ['bp_new'], 'the single newest profile row survives the dedupe');
ok(astro_birth_profiles_dedupe($pdo, 'u1') === 0, 'dedupe is a no-op once the row is unique');
ok(astro_birth_profile_exists($pdo, 'u_missing') === false, 'a customer without a profile never spends the slot');
exit(($GLOBALS['fails'] ?? 0) > 0 ? 1 : 0);
`);
  try {
    const run = spawnSync(process.execPath,
      [path.join(root, 'scripts', 'php-wasm-run.mjs'), '--php', '8.4', 'tests/_family_frozen_runtime.php'],
      { cwd: root, encoding: 'utf8', timeout: 240000 });
    process.stdout.write(run.stdout || '');
    if (run.status !== 0) {
      failures += 1;
      console.error(`  [FAIL] PHP-WASM frozen renderer execution exited ${run.status}\n${run.stderr || ''}`);
    }
  } finally {
    fs.rmSync(phpFile, { force: true });
  }
}

if (failures > 0) {
  console.error(`\nfamily-members-and-frozen-download: ${failures} failing check(s)`);
  process.exit(1);
}
console.log('\nfamily-members-and-frozen-download: all checks passed');
