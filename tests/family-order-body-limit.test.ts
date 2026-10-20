/**
 * ASTRO SIVAM — family-order request-body limit contract.
 *
 * THE BUG THIS PINS
 * -----------------
 * A Subha Muhurtham report travels with its panchangam scan inside the order
 * payload: six months of day records, each carrying the English / Tamil / Hindi
 * tithi, nakshatra, yoga, karana, reason and dosha strings. That scan alone is
 * ~1.1 MB (measured below from the shipped scanner).
 *
 * config.php's getJsonBody() silently returns [] for any body above 1 MiB. The
 * family-tray route read its body with it, so a tray holding even ONE Muhurtham
 * report arrived "empty" and the admin/customer saw
 *
 *     "At least one service chart item is required in the family tray."
 *
 * while four charts were visible in the tray. The same cap also broke a single
 * Muhurtham order, which then fell through to the BIRTH_JATHAGAM validation
 * message instead.
 *
 * WHAT MUST STAY TRUE
 * -------------------
 *  1. order routes read their body with an explicit ORDER limit well above
 *     1 MiB and below post_max_size (128M in api/.user.ini);
 *  2. the services router reads the body ONCE (no later getJsonBody() re-read
 *     that would cap it again);
 *  3. an oversized / dropped / malformed body answers its OWN code and message,
 *     so "the tray is empty" can never again describe a body that was thrown
 *     away;
 *  4. a genuinely empty tray still answers FAMILY_TRAY_EMPTY.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanMonthMuhurtham } from '../src/lib/muhurtham/scanner.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** Numeric value of a `define('NAME', <arithmetic>);` in a PHP source file. */
function phpBytesConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`define\\('${name}',\\s*([0-9][0-9\\s*]*)\\);`));
  assert.ok(match, `define('${name}', ...) not found`);
  const expression = match![1].trim();
  assert.match(expression, /^[0-9*\s]+$/, `${name} must be a plain arithmetic expression`);
  // Only digits, spaces and '*' reach here — evaluated as arithmetic, no code.
  const value = expression.split('*').reduce((product, part) => product * Number(part.trim()), 1);
  assert.ok(Number.isFinite(value) && value > 0, `${name} must be a positive number of bytes`);
  return value;
}

const requestBodyPhp = read('api/request_body.php');
const servicesPhp = read('api/services/index.php');

const MIB = 1048576;
const orderLimit = phpBytesConstant(requestBodyPhp, 'ASTRO_ORDER_JSON_MAX_BYTES');
const jsonLimit = phpBytesConstant(requestBodyPhp, 'ASTRO_JSON_BODY_MAX_BYTES');
const documentLimit = phpBytesConstant(requestBodyPhp, 'ASTRO_DOCUMENT_JSON_MAX_BYTES');
const postMaxSize = (/^post_max_size\s*=\s*(\d+)M/m.exec(read('api/.user.ini')) || [])[1];

console.log('--- FAMILY ORDER BODY LIMIT CONTRACT ---');

check('the order limit is well above the 1 MiB ordinary cap and below post_max_size', () => {
  assert.equal(jsonLimit, MIB, 'the ordinary getJsonBody() cap is 1 MiB');
  assert.ok(orderLimit >= 8 * MIB, `ASTRO_ORDER_JSON_MAX_BYTES (${orderLimit}) must hold a full tray`);
  assert.ok(
    documentLimit > orderLimit,
    'the document limit stays the largest of the three (staged PDFs)'
  );
  assert.ok(postMaxSize, 'api/.user.ini must set post_max_size');
  assert.ok(
    orderLimit < Number(postMaxSize) * MIB,
    'the order limit must stay below post_max_size so PHP itself never discards an accepted body'
  );
});

check('the services router reads its body once, with the ORDER limit', () => {
  const readOnce = servicesPhp.match(/^\$jsonBody = astro_order_json_body\('order'\);$/m);
  assert.ok(readOnce, 'api/services/index.php must read $jsonBody through astro_order_json_body()');
  assert.ok(
    !/^\$jsonBody = getJsonBody\(\);$/m.test(servicesPhp),
    'the router must not read its body through the 1 MiB getJsonBody() cap'
  );
  assert.ok(
    /require_once __DIR__ \. '\/\.\.\/request_body\.php';/.test(servicesPhp),
    'the router must include api/request_body.php'
  );
});

check('no order route re-reads the body through getJsonBody()', () => {
  assert.ok(
    !servicesPhp.includes('!empty($jsonBody) ? $jsonBody : getJsonBody()'),
    'a second getJsonBody() read would cap the already-read order body at 1 MiB again'
  );
  const orderRoutes = [
    "astro_create_multi_person_order($pdo, $orderUser, $jsonBody);",
    'astro_replay_consumed_intent($pdo, $capturedIntent'
  ];
  for (const marker of orderRoutes) {
    assert.ok(servicesPhp.includes(marker), `order route marker missing: ${marker}`);
  }
});

check('an unusable order body answers its own code, never the tray message', () => {
  for (const code of [
    'ORDER_BODY_TOO_LARGE',
    'ORDER_BODY_DROPPED',
    'ORDER_BODY_INVALID_JSON',
    'ORDER_BODY_UNREADABLE'
  ]) {
    assert.ok(requestBodyPhp.includes(`'${code}'`), `missing ${code} answer`);
  }
  // The tray message must appear exactly once: the genuinely-empty branch.
  const occurrences = servicesPhp.split('At least one service chart item is required').length - 1;
  assert.equal(
    occurrences,
    1,
    'the family-tray message may only describe a genuinely empty tray, not a dropped body'
  );
  assert.ok(
    servicesPhp.includes("'code' => 'FAMILY_TRAY_EMPTY'"),
    'the empty-tray answer must carry its own code'
  );
  const reader = requestBodyPhp.slice(requestBodyPhp.indexOf('function astro_order_json_body'));
  assert.ok(
    !reader.includes('family tray'),
    'the body reader must never claim the tray is empty'
  );
  assert.ok(
    reader.includes("strpos($contentType, 'json') === false"),
    'form-encoded / multipart requests must keep reading $_POST instead of failing as invalid JSON'
  );
  assert.ok(/jsonResponse\(\$payload, \$status\);/.test(reader), 'body errors must answer with the right HTTP status');
});

check('a realistic Muhurtham scan alone exceeds the old 1 MiB cap', () => {
  const location = {
    placeName: 'Arani, Tamil Nadu, India',
    latitude: 12.6691,
    longitude: 79.3919,
    timezoneOffsetHours: 5.5,
    timeZoneId: 'Asia/Kolkata'
  };
  const months = [];
  for (let offset = -2; offset <= 3; offset += 1) {
    const monthDate = new Date(2027, 0 + offset, 1);
    months.push(
      scanMonthMuhurtham(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        location,
        'education_start',
        {
          persons: [{ role: 'self', nakshatraIndex: 5, rasiNumber: 2 }],
          birthDate: '1991-05-22',
          skipPastDates: true
        }
      )
    );
  }

  const muhurthamScan = {
    muhurthamAlgorithmVersion: 6,
    selectedMonth: '2027-01',
    eventKey: 'education_start',
    months,
    persons: []
  };
  const muhurthamItem = {
    serviceType: 'MUHURTHAM',
    language: 'ta',
    country: 'IN',
    inputPayload: {
      name: 'Saindhavi',
      dob: '1991-05-22',
      tob: '13:40',
      birthPlace: 'Arani',
      latitude: 12.6691,
      longitude: 79.3919,
      timezoneOffsetHours: 5.5,
      timeZoneId: 'Asia/Kolkata',
      eventKey: 'education_start',
      selectedMonth: '2027-01',
      muhurthamScan
    }
  };
  const otherItems = [1, 2, 3].map(index => ({
    serviceType: 'BIRTH_JATHAGAM',
    language: 'ta',
    country: 'IN',
    inputPayload: {
      name: `Family member ${index}`,
      dob: '1991-05-22',
      tob: '13:40',
      birthPlace: 'Arani',
      latitude: 12.6691,
      longitude: 79.3919,
      timezoneOffsetHours: 5.5,
      timeZoneId: 'Asia/Kolkata'
    }
  }));

  const bodyBytes = Buffer.byteLength(
    JSON.stringify({ action: 'multi-order', items: [...otherItems, muhurthamItem] })
  );

  assert.ok(
    bodyBytes > MIB,
    `a 4-report tray with one Muhurtham report is only ${bodyBytes} bytes — the regression this file pins expects it to exceed the old 1 MiB cap`
  );
  assert.ok(
    orderLimit > bodyBytes * 2,
    `the order limit (${orderLimit}) must leave headroom above a ${bodyBytes}-byte tray`
  );

  // Worst case the limit promises to accept: all six tray reports are
  // Muhurtham reports, each with its own scan.
  const worstCaseBytes = Buffer.byteLength(
    JSON.stringify({
      action: 'multi-order',
      items: Array.from({ length: 6 }, (_, index) => ({ ...muhurthamItem, language: index % 2 ? 'en' : 'ta' }))
    })
  );
  assert.ok(
    orderLimit > worstCaseBytes,
    `the order limit (${orderLimit}) must hold a six-report Muhurtham tray (${worstCaseBytes} bytes)`
  );
});

console.log(`\n${passed} family-order body-limit checks passed.`);
