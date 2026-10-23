import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  POPULAR_QUICK_PLACES,
  findNearestWorldwideLocation,
  parseCoordinatesFromInput,
  searchWorldwideLocations
} from '../src/data/worldwideLocations';
import {
  describeBirthTimePeriod,
  formatBirthWeekday,
  formatTobInputWhileTyping
} from '../src/utils/dateTimeInput';
import { BirthDateField, BirthTimeField } from '../src/components/common/BirthDateTimeFields';
import { BirthDetailsSummaryCard } from '../src/components/common/BirthDetailsSummaryCard';
import { GooglePlacesPicker } from '../src/components/common/GooglePlacesPicker';
import { resolveLocationTimezone } from '../src/lib/timezone';

const ROOT = resolve(import.meta.dirname, '..');

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

console.log('--- BIRTH DETAILS, WORLDWIDE LOCATION PICKER & FULL SYSTEM UPGRADE SUITE ---');

// ---------------------------------------------------------------------------
// 1. Instant Offline Worldwide Location Search & Alias Engine
// ---------------------------------------------------------------------------
{
  const t0 = performance.now();
  const chennai = searchWorldwideLocations('Madras', 8);
  const elapsedMs = performance.now() - t0;
  assert.ok(chennai.length > 0, 'Alias "Madras" must match Chennai instantly offline');
  assert.ok(
    chennai.some(hit => hit.placeName.includes('Chennai')),
    `Expected Chennai in Madras search results, got: ${chennai.map(h => h.placeName).join(' | ')}`
  );
  assert.ok(elapsedMs < 150, `Expected fast offline search, took ${elapsedMs.toFixed(1)}ms`);

  const mylapore = searchWorldwideLocations('Mylapore', 5);
  assert.ok(
    mylapore.some(hit => hit.placeName.includes('Mylapore') && hit.placeName.includes('Chennai')),
    'Temple/area search "Mylapore" must resolve to Mylapore, Chennai with verified coordinates'
  );
  assert.ok(mylapore[0].timeZoneId === 'Asia/Kolkata');

  const bombay = searchWorldwideLocations('Bombay', 5);
  assert.ok(bombay.some(hit => hit.placeName.includes('Mumbai')), 'Alias "Bombay" must match Mumbai');

  const trichy = searchWorldwideLocations('Trichy', 5);
  assert.ok(
    trichy.some(hit => hit.placeName.includes('Tiruchirappalli')),
    'Alias "Trichy" must match Tiruchirappalli'
  );

  const edison = searchWorldwideLocations('Edison', 5);
  assert.ok(
    edison.some(hit => hit.placeName.includes('Edison') && hit.placeName.includes('New Jersey')),
    'NRI hub "Edison" must match Edison, New Jersey, United States'
  );

  assert.ok(POPULAR_QUICK_PLACES.length >= 6, 'Popular 1-tap quick places must be available');
  console.log('  [PASS] offline worldwide search, neighborhood/area matching & historical city aliases');
}

// ---------------------------------------------------------------------------
// 2. Coordinate, Google Maps Link & DMS Parser + Reverse Nearest Lookup
// ---------------------------------------------------------------------------
{
  const plain = parseCoordinatesFromInput('13.0827, 80.2707');
  assert.ok(plain && plain.latitude === 13.0827 && plain.longitude === 80.2707);
  assert.match(plain.placeName, /Chennai/);
  assert.equal(plain.timeZoneId, 'Asia/Kolkata');

  const gmapsAt = parseCoordinatesFromInput('https://www.google.com/maps/@12.9716,77.5946,15z');
  assert.ok(gmapsAt && gmapsAt.latitude === 12.9716 && gmapsAt.longitude === 77.5946);
  assert.match(gmapsAt.placeName, /Bengaluru/);

  const gmapsQuery = parseCoordinatesFromInput('https://maps.google.com/?q=1.3521,103.8198');
  assert.ok(gmapsQuery && gmapsQuery.latitude === 1.3521 && gmapsQuery.longitude === 103.8198);
  assert.match(gmapsQuery.placeName, /Singapore/);

  const gmaps3d4d = parseCoordinatesFromInput(
    'https://www.google.com/maps/place/Temple/@13.0,80.2,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d9.9252!4d78.1198'
  );
  assert.ok(gmaps3d4d && gmaps3d4d.latitude === 9.9252 && gmaps3d4d.longitude === 78.1198);
  assert.match(gmaps3d4d.placeName, /Madurai/);

  const dms = parseCoordinatesFromInput(`13°05'00"N 80°16'12"E`);
  assert.ok(dms && Math.abs(dms.latitude - 13.083333) < 0.001 && Math.abs(dms.longitude - 80.27) < 0.001);

  const nearest = findNearestWorldwideLocation(13.04, 80.26);
  assert.ok(nearest && nearest.placeName.includes('Chennai'), 'Nearest worldwide lookup resolves Chennai');
  console.log('  [PASS] coordinate, Google Maps URL (@lat,lng / ?q= / !3d!4d), DMS & nearest-place lookup');
}

// ---------------------------------------------------------------------------
// 3. Date Weekday & Midnight/Noon Birth Time Disambiguation Helpers
// ---------------------------------------------------------------------------
{
  assert.equal(formatBirthWeekday('1990-08-15'), 'Wednesday');
  assert.equal(formatBirthWeekday('2000-01-01'), 'Saturday');
  assert.equal(formatBirthWeekday('not-a-date'), '');

  assert.equal(describeBirthTimePeriod('00:15'), 'Midnight (12 AM hr)');
  assert.equal(describeBirthTimePeriod('12:15'), 'Noon / Afternoon');
  assert.equal(describeBirthTimePeriod('06:30'), 'Morning');
  assert.equal(describeBirthTimePeriod('21:45'), 'Night');

  assert.equal(formatTobInputWhileTyping('9.30'), '9:30');
  console.log('  [PASS] weekday calculation, midnight/noon disambiguator & dot-time separator');
}

// ---------------------------------------------------------------------------
// 4. Upgraded Shared UI Components SSR Verification
// ---------------------------------------------------------------------------
{
  const dateHtml = renderToStaticMarkup(
    <BirthDateField label="Date of Birth" value="1990-08-15" onChange={() => {}} theme="dark" />
  );
  assert.match(dateHtml, /Wednesday/, 'BirthDateField displays computed day of week to prevent DD/MM swaps');
  assert.match(dateHtml, /Clear Date of Birth/i, 'BirthDateField renders accessible 1-tap clear button');

  const timeHtml = renderToStaticMarkup(
    <BirthTimeField label="Exact Birth Time" value="00:25" onChange={() => {}} theme="dark" />
  );
  assert.match(
    timeHtml,
    /Midnight \(12 AM hr\)/,
    'BirthTimeField explicitly labels 12:xx AM as Midnight (12 AM hr)'
  );
  assert.match(timeHtml, /Clear Exact Birth Time/i, 'BirthTimeField renders accessible 1-tap clear button');

  const sampleLoc = {
    placeName: 'Chennai, Tamil Nadu, India',
    country: 'India',
    latitude: 13.0827,
    longitude: 80.2707,
    timezoneOffsetHours: 5.5,
    timeZoneId: 'Asia/Kolkata'
  };
  const tz = resolveLocationTimezone('1990-08-15', '09:30', 13.0827, 80.2707, 5.5, 'Asia/Kolkata');

  const summaryHtml = renderToStaticMarkup(
    <BirthDetailsSummaryCard
      name="Ramesh Kumar"
      dob="1990-08-15"
      tob="09:30"
      location={sampleLoc}
      timezoneResolution={tz}
      subjectLabel="Birth Chart Readiness"
      theme="dark"
    />
  );
  assert.match(summaryHtml, /Ready for Calculation/);
  assert.match(summaryHtml, /15 Aug 1990 \(Wednesday\)/);
  assert.match(summaryHtml, /09:30 AM · Morning/);
  assert.match(summaryHtml, /Chennai \(UTC\+05:30\)/);

  const emptyPickerHtml = renderToStaticMarkup(
    <GooglePlacesPicker value={null} onChange={() => {}} label="Birth Place" required />
  );
  assert.match(emptyPickerHtml, /role="combobox"/);
  assert.match(emptyPickerHtml, /Browse/);
  assert.match(emptyPickerHtml, /Coords/);

  const verifiedPickerHtml = renderToStaticMarkup(
    <GooglePlacesPicker value={sampleLoc} onChange={() => {}} label="Birth Place" required />
  );
  assert.match(verifiedPickerHtml, /verified-location-card/);
  assert.match(verifiedPickerHtml, /\[overflow-wrap:anywhere\]/);
  console.log('  [PASS] SSR component contracts for BirthDateField, BirthTimeField, BirthDetailsSummaryCard & GooglePlacesPicker');
}

// ---------------------------------------------------------------------------
// 5. All 4 Service Pages, Checkout, Customer Dashboard & Order Editor Contracts
// ---------------------------------------------------------------------------
{
  const jathagam = readRepoFile('src/pages/BirthJathagamPage.tsx');
  const baby = readRepoFile('src/pages/BabyNamingPage.tsx');
  const marriage = readRepoFile('src/pages/MarriageCompatibilityPage.tsx');
  const muhurtham = readRepoFile('src/pages/MuhurthamPage.tsx');
  const multiCheckout = readRepoFile('src/components/cart/MultiPersonCheckout.tsx');
  const dashboard = readRepoFile('src/pages/CustomerDashboard.tsx');
  const orderModal = readRepoFile('src/components/common/OrderReportModal.tsx');
  const servicesPhp = readRepoFile('api/services/index.php');
  const adminPhp = readRepoFile('api/admin/index.php');
  const htaccess = readRepoFile('api/.htaccess');

  assert.match(jathagam, /BirthDetailsSummaryCard/);
  assert.match(baby, /BirthDetailsSummaryCard/);
  assert.match(marriage, /BirthDetailsSummaryCard/);
  assert.match(marriage, /Swap Person 1 &amp; Person 2 Details/);
  assert.match(marriage, /Same Birth Place as/);
  assert.match(muhurtham, /BirthDetailsSummaryCard/);
  assert.match(muhurtham, /Same Birth Place as Person 1/);
  assert.match(multiCheckout, /Same Birth Place as/);
  assert.match(multiCheckout, /Copy Birth Place/);
  assert.match(dashboard, /setFGender\('F'\)/);
  assert.match(dashboard, /setFGender\('M'\)/);
  assert.match(orderModal, /Edit Birth Details/);
  assert.match(orderModal, /OrderBirthDetailsEditorModal/);
  assert.match(servicesPhp, /astro_geocode_search/);
  assert.match(servicesPhp, /astro_reverse_geocode/);
  assert.match(servicesPhp, /astro_update_order_birth_details/);
  assert.match(adminPhp, /astro_update_order_birth_details/);
  assert.match(htaccess, /geocoding_and_birth_details/);
  console.log('  [PASS] all 4 service pages, checkout, customer dashboard, order modal & PHP router wiring verified');
}

// ---------------------------------------------------------------------------
// 6. Live PHP 8.1 Runtime Test of Order Birth-Details Recalculation & Security
// ---------------------------------------------------------------------------
{
  const probeRel = 'tests/fixtures/.tmp-birth-details-upgrade-probe.php';
  const probeFile = resolve(ROOT, probeRel);
  const phpProbe = `<?php
error_reporting(E_ALL);
require_once __DIR__ . '/../../api/geocoding_and_birth_details.php';

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

$pdo->exec("
  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    order_number TEXT,
    user_id TEXT,
    user_email TEXT,
    user_name TEXT,
    service_type TEXT,
    status TEXT,
    email_status TEXT,
    input_payload TEXT,
    calculated_result TEXT,
    updated_at TEXT
  );
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    person_index INTEGER,
    person_name TEXT,
    gender TEXT,
    dob TEXT,
    tob TEXT,
    pob TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    service_type TEXT,
    input_payload TEXT,
    calculated_result TEXT
  );
  CREATE TABLE admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT,
    action_type TEXT,
    target_order_id TEXT,
    details TEXT
  );
");

$initialInput = [
  'name' => 'Arun Kumar',
  'dob' => '1992-05-14',
  'tob' => '06:30',
  'gender' => 'M',
  'birthPlace' => 'Chennai, Tamil Nadu, India',
  'country' => 'India',
  'latitude' => 13.0827,
  'longitude' => 80.2707,
  'timezoneOffsetHours' => 5.5,
  'timeZoneId' => 'Asia/Kolkata'
];

$ins = $pdo->prepare("
  INSERT INTO orders (id, order_number, user_id, user_email, user_name, service_type, status, email_status, input_payload, calculated_result, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
");
$ins->execute([
  'ord-1',
  'AS-90001',
  'user-1',
  'arun@example.com',
  'Arun Kumar',
  'BIRTH_JATHAGAM',
  'PENDING',
  'PENDING',
  json_encode($initialInput),
  '{}'
]);

// Case A: Wrong user cannot edit someone else's order (403)
$forbidden = astro_update_order_birth_details($pdo, 'ord-1', [
  'inputPayload' => $initialInput
], false, 'attacker-user-999');

// Case B: Owner corrects birth time from AM to PM (06:30 -> 18:30) while PENDING (200 + live recalculation)
$correctedInput = $initialInput;
$correctedInput['tob'] = '18:30';
$ownerOk = astro_update_order_birth_details($pdo, 'ord-1', [
  'inputPayload' => $correctedInput
], false, 'user-1');

// Mark order delivered/completed
$pdo->exec("UPDATE orders SET status = 'COMPLETED', email_status = 'SENT' WHERE id = 'ord-1'");

// Case C: Non-admin owner CANNOT overwrite a delivered report (409 ORDER_ALREADY_DELIVERED)
$frozenCheck = astro_update_order_birth_details($pdo, 'ord-1', [
  'inputPayload' => $initialInput
], false, 'user-1');

// Case D: Admin CAN correct & recalculate even after delivery, with audit log written (200)
$adminFixedInput = $correctedInput;
$adminFixedInput['birthPlace'] = 'Madurai, Tamil Nadu, India';
$adminFixedInput['latitude'] = 9.9252;
$adminFixedInput['longitude'] = 78.1198;
$adminOk = astro_update_order_birth_details($pdo, 'ord-1', [
  'inputPayload' => $adminFixedInput
], true, 'admin-1');

$logCount = (int)$pdo->query("SELECT COUNT(*) FROM admin_logs WHERE action_type = 'EDIT_BIRTH_DETAILS'")->fetchColumn();

echo json_encode([
  'forbiddenStatus' => $forbidden['httpStatus'],
  'ownerStatus' => $ownerOk['httpStatus'],
  'ownerHasRasi' => !empty($ownerOk['body']['calculatedResult']['rasi']),
  'ownerSavedTob' => $ownerOk['body']['inputPayload']['tob'] ?? null,
  'frozenStatus' => $frozenCheck['httpStatus'],
  'frozenCode' => $frozenCheck['body']['code'] ?? null,
  'adminStatus' => $adminOk['httpStatus'],
  'adminSavedPlace' => $adminOk['body']['inputPayload']['birthPlace'] ?? null,
  'adminHasLagna' => !empty($adminOk['body']['calculatedResult']['lagna']),
  'adminLogCount' => $logCount
]);
`;
  if (!existsSync(resolve(ROOT, 'node_modules/@php-wasm/universal'))) {
    console.log('  [SKIP] @php-wasm/universal not installed — PHP runtime check skipped');
  } else {
    writeFileSync(probeFile, phpProbe, 'utf8');
    try {
      const raw = execFileSync(
        process.execPath,
        ['scripts/php-wasm-run.mjs', '--php', '8.1', probeRel],
        { cwd: ROOT, encoding: 'utf8' }
      );
      const out = JSON.parse(raw.trim());
      assert.equal(out.forbiddenStatus, 403, 'Non-owner must receive 403 Forbidden');
      assert.equal(out.ownerStatus, 200, 'Owner editing pre-delivery order must succeed with 200');
      assert.equal(out.ownerSavedTob, '18:30', 'Updated birth time must persist in input_payload');
      assert.equal(out.ownerHasRasi, true, 'Updated chart must dynamically compute Vedic Rasi');
      assert.equal(out.frozenStatus, 409, 'Customer editing delivered order must receive 409');
      assert.equal(out.frozenCode, 'ORDER_ALREADY_DELIVERED');
      assert.equal(out.adminStatus, 200, 'Admin must be able to correct & recalculate delivered order');
      assert.equal(out.adminSavedPlace, 'Madurai, Tamil Nadu, India');
      assert.equal(out.adminHasLagna, true);
      assert.equal(out.adminLogCount, 1, 'Admin edit must append audit record to admin_logs');
      console.log('  [PASS] PHP 8.1 runtime verified: 403 auth guard, 200 customer edit + chart recalculation, 409 delivered freeze & 200 admin override + audit log');
    } finally {
      if (existsSync(probeFile)) unlinkSync(probeFile);
    }
  }
}

console.log('\nAll birth-details, worldwide location picker & full-system upgrade checks passed!');
