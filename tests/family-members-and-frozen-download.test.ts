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
  assert.match(src, /Family Members \(\{familyMembers\.length\}\/\{MAX_FAMILY_MEMBERS\}\)/);
  assert.match(src, /Download Report/);
  assert.match(src, /frozen as ordered/);
  assert.match(src, /downloadMyOrderReport/);
  assert.match(src, /Order for \{member\.name\}/);
  assert.doesNotMatch(src, /Reports are not stored for download/);
  assert.doesNotMatch(src, /automatically reused across all your horoscope calculations/);
});

check('api client: family CRUD + frozen report download routes', () => {
  const src = read('src/services/api.ts');
  assert.match(src, /getFamilyMembers/);
  assert.match(src, /saveFamilyMember/);
  assert.match(src, /deleteFamilyMember/);
  assert.match(src, /\/services\/orders\/\$\{encodeURIComponent\(orderId\)\}\/report-pdf/);
  assert.match(src, /invoices are[\s\S]{0,40}email-only|invoice[\s\S]{0,60}email-only/i);
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

check('download endpoint: owner-only, delivered-only, report-only, never recalculates', () => {
  const src = read('api/services/index.php');
  const start = src.indexOf('// 6c. GET /api/services/orders/:id/report-pdf');
  const end = src.indexOf('// 6d. GET /api/services/chat-media');
  assert.ok(start > 0 && end > start, 'frozen download block exists');
  const block = src.slice(start, end);
  assert.match(block, /requireAuth\(\$pdo\)/);
  assert.match(block, /WHERE id = \? AND user_id = \?/, 'ownership enforced in the query');
  assert.match(block, /\['COMPLETED', 'GENERATED'\]/, 'only delivered orders download');
  assert.match(block, /report_status'\] \?\? ''\) !== 'SENT'/, 'per-person reports download only after delivery');
  assert.match(block, /frozen_snapshot'\] = true/);
  assert.match(block, /generateReportPdf\(\$orderArray, \$result\)/);
  assert.match(block, /Content-Type: application\/pdf/);
  for (const forbidden of ['calculateHoroscope(', 'calculateMatchmaking(', 'calculateBabyNaming(', 'calculateMuhurtham(', 'rebuildReportResultFromSavedInputs(', 'generateInvoicePdf', 'SET calculated_result']) {
    assert.ok(!block.includes(forbidden), `download must never call ${forbidden}`);
  }
});

check('PDF engine: frozen renders bypass every recalculation path', () => {
  const engine = read('api/astrology/engine.php');
  assert.match(engine, /\$frozenSnapshot = !empty\(\$order\['frozen_snapshot'\]\)/);
  assert.match(engine, /\$needsRebuild =\s*!\$frozenSnapshot &&/);
  const views = read('api/astrology/pdf_mpdf_reports.php');
  assert.match(views, /empty\(\$order\['frozen_snapshot'\]\) && class_exists\('AstroEngine'\) && !AstroEngine::isCurrentBabyNamingResult/,
    'baby renderer recalc is skipped for frozen snapshots');
  assert.match(views, /empty\(\$result\['months'\]\) && empty\(\$order\['frozen_snapshot'\]\)/,
    'muhurtham renderer recalc is skipped for frozen snapshots');
});

check('every report prints its prepared date (frozen date, never download date)', () => {
  const views = read('api/astrology/pdf_mpdf_reports.php');
  assert.match(views, /function preparedOnLabel/);
  assert.match(views, /Prepared on/, 'English prepared-on label');
  assert.match(views, /தயாரிக்கப்பட்ட நாள்/, 'Tamil prepared-on label');
  assert.match(views, /तैयार तिथि/, 'Hindi prepared-on label');
  assert.ok((views.match(/preparedLabel\)/g) || []).length >= 3, 'all three Jathagam pages carry the stamp');
  assert.match(views, /Issued On/, 'wedding/muhurtham/baby keep their issued-on date');
  const ts = read('src/services/jathagamHtmlBuilder.ts');
  assert.match(ts, /footer-prepared/);
  assert.match(ts, /Prepared on/);
  assert.match(ts, /\['generatedAt'\]|generatedAt/, 'TS stamp reads the frozen result date');
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

check('my-orders exposes persons/items + snapshot metadata (never the snapshot JSON)', () => {
  const src = read('api/services/index.php');
  assert.match(src, /astro_attach_order_items\(\$pdo, \$orders\)/);
  assert.match(src, /'hasReportSnapshot' => !empty\(\$r\['report_snapshot'\]\) \|\| !empty\(\$r\['calculated_result'\]\)/);
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
require_once __DIR__ . '/../api/astrology/pdf_mpdf_reports.php';
function ok(bool $c, string $m): void {
    echo ($c ? "[PASS] " : "[FAIL] ") . $m . "\\n";
    if (!$c) { $GLOBALS['fails'] = ($GLOBALS['fails'] ?? 0) + 1; }
}
ok(AstroReportViews::preparedOnLabel(['generatedAt' => '2024-02-03 10:00:00'], 'en') === 'Prepared on: 03 Feb 2024', 'prepared date comes from the frozen result');
ok(AstroReportViews::preparedOnLabel([], 'en') === '', 'no prepared date in result -> no invented today stamp');
$birth = ['name' => 'Frozen Native', 'gender' => 'M', 'dob' => '1990-08-15', 'tob' => '09:30',
  'birthPlace' => 'Suva', 'country' => '', 'latitude' => -18.1416,
  'longitude' => 178.4419, 'timezoneOffsetHours' => 12, 'timeZoneId' => 'Pacific/Fiji'];
$result = AstroEngine::calculateHoroscope($birth);
$result['generatedAt'] = '2024-02-03 10:00:00';
$order = ['service_type' => 'BIRTH_JATHAGAM', 'language' => 'en', 'order_number' => 'ORD-FROZEN1',
  'user_name' => 'Frozen Native', 'input_payload' => $birth, 'frozen_snapshot' => true];
$html = AstroReportViews::renderFullReportHtml($order, $result);
ok(strpos($html, 'Prepared on: 03 Feb 2024') !== false, 'Jathagam header prints the frozen prepared date');
$babyOrder = ['service_type' => 'BABY_NAMING', 'language' => 'en', 'order_number' => 'ORD-FROZEN2',
  'user_name' => 'Parent', 'input_payload' => $birth, 'frozen_snapshot' => true];
$threw = false;
try { AstroReportViews::renderFullReportHtml($babyOrder, ['babyNamingAlgorithmVersion' => 1, 'generatedAt' => '2023-01-01 00:00:00']); }
catch (Throwable $e) { $threw = true; }
ok($threw, 'frozen legacy baby snapshot is rendered as frozen (no silent recalculation/upgrade)');
$babyLive = $babyOrder; unset($babyLive['frozen_snapshot']);
try {
  $live = AstroReportViews::renderFullReportHtml($babyLive, ['babyNamingAlgorithmVersion' => 1, 'generatedAt' => '2023-01-01 00:00:00']);
  ok(strpos($live, 'ORD-FROZEN2') !== false, 'non-frozen fulfilment renders keep recalculating as before');
} catch (Throwable $e) { ok(false, 'non-frozen fulfilment renders keep recalculating as before'); }
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
