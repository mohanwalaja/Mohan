/**
 * A new customer must never be taken to a payment screen before the birth
 * details are complete.
 *
 * Reported from a live demo: a brand-new user signed in with Google and was
 * shown the checkout with an empty form. The guest "Quick Sign In" banner
 * opened the auth modal, and its onAuthenticated() handler opened the checkout
 * unconditionally. The order then failed at the server, after the customer had
 * already been asked to pay.
 *
 * These checks pin both halves of the fix:
 *   1. checkoutReadiness mirrors the server's birth-detail rules.
 *   2. Every service page validates after sign-in before opening the checkout.
 *   3. The checkout modal itself refuses an incomplete payload.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkoutPayloadProblem,
  isCheckoutPayloadReady,
  birthRecordProblem
} from '../src/services/checkoutReadiness';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const complete = {
  name: 'Ramesh Kumar',
  dob: '1990-05-14',
  tob: '04:35',
  birthPlace: 'Chennai, Tamil Nadu, India',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5,
  timeZoneId: 'Asia/Kolkata'
};

// ── 1. An empty form is not payable ─────────────────────────────────────────
for (const serviceType of ['BIRTH_JATHAGAM', 'BABY_NAMING'] as const) {
  const problem = checkoutPayloadProblem(serviceType, {
    name: '',
    dob: '',
    tob: '',
    birthPlace: undefined,
    latitude: undefined,
    longitude: undefined,
    timezoneOffsetHours: undefined
  });
  assert(problem.includes('date of birth'), `${serviceType}: an empty form asks for the date of birth`);
  assert.equal(isCheckoutPayloadReady(serviceType, {}), false, `${serviceType}: {} is not a payable order`);
  assert.equal(isCheckoutPayloadReady(serviceType, complete), true, `${serviceType}: a complete form may check out`);
  assert.equal(checkoutPayloadProblem(serviceType, complete), '', `${serviceType}: no complaint for a complete form`);
}

// Baby naming legitimately has no name yet — only the ephemeris inputs matter.
assert.equal(
  isCheckoutPayloadReady('BABY_NAMING', { ...complete, name: '' }),
  true,
  'An unnamed baby may still check out; the birth inputs are what the engine needs'
);

// ── 2. Each missing input is named, in the order the customer fills them ────
assert.equal(birthRecordProblem({}), 'missing date of birth');
assert.match(birthRecordProblem({ ...complete, dob: '' }), /missing date of birth/);
assert.match(birthRecordProblem({ ...complete, dob: '2999-01-01' }), /valid date of birth/);
assert.match(birthRecordProblem({ ...complete, tob: '' }), /missing time of birth/);
assert.match(birthRecordProblem({ ...complete, tob: '25:00' }), /valid time of birth/);
assert.match(birthRecordProblem({ ...complete, birthPlace: '  ' }), /missing birth place/);
assert.match(
  birthRecordProblem({ ...complete, latitude: undefined }),
  /coordinates and time zone/
);
assert.equal(birthRecordProblem(complete), '', 'A complete record has no problem');

// ── 3. Marriage needs both people ────────────────────────────────���──────────
const marriageOnlyBride = { bride: complete, groom: { name: 'Priya', dob: '', tob: '', birthPlace: '' } };
const marriageProblem = checkoutPayloadProblem('MARRIAGE_COMPATIBILITY', marriageOnlyBride);
assert.match(marriageProblem, /Groom/, 'A missing groom record is reported');
assert.doesNotMatch(marriageProblem, /Bride:/, 'A complete bride record is not reported');
assert.equal(isCheckoutPayloadReady('MARRIAGE_COMPATIBILITY', { bride: complete, groom: complete }), true);
assert.match(
  checkoutPayloadProblem('MARRIAGE_COMPATIBILITY', {}),
  /Bride.*Groom/s,
  'An empty match form names both partners'
);

// ── 4. Muhurtham needs the ceremony place as well ───────────────────────────
assert.match(
  checkoutPayloadProblem('MUHURTHAM', complete),
  /ceremony place/,
  'A birth record alone cannot order a Muhurtham report'
);
const muhurthamReady = {
  ...complete,
  muhurthamPlace: 'Colombo, Sri Lanka',
  muhurthamLatitude: 6.9271,
  muhurthamLongitude: 79.8612,
  muhurthamTimezoneOffsetHours: 5.5
};
assert.equal(checkoutPayloadProblem('MUHURTHAM', muhurthamReady), '', 'A complete Muhurtham order may check out');
assert.match(
  checkoutPayloadProblem('MUHURTHAM', { ...muhurthamReady, muhurthamLatitude: undefined }),
  /coordinates and a time zone/,
  'The ceremony place must carry coordinates and a time zone'
);

// ── 5. Signing in no longer forces the checkout open ────────────────────────
const validators: Record<string, string> = {
  BabyNamingPage: 'validateBabyBirthDetails',
  BirthJathagamPage: 'validateBirthForm',
  MarriageCompatibilityPage: 'validateMarriageForm',
  MuhurthamPage: 'validate'
};
for (const [page, validator] of Object.entries(validators)) {
  const source = read(`src/pages/${page}.tsx`);
  const handler = /onAuthenticated=\{\(\) => \{([\s\S]*?)\n        \}\}/.exec(source)?.[1] ?? '';
  assert(handler, `${page}: the auth modal has an onAuthenticated handler`);
  assert(
    handler.includes(`const validationMessage = ${validator}()`),
    `${page}: signing in re-checks the form with ${validator}()`
  );
  const guardIndex = handler.search(/if \(validationMessage\) \{/);
  const openIndex = handler.indexOf('setShowCheckoutModal(true)');
  assert(guardIndex !== -1, `${page}: a failed check is handled`);
  assert(openIndex !== -1, `${page}: a complete form still opens the checkout`);
  assert(guardIndex < openIndex, `${page}: the checkout opens only after the form check`);
  assert(
    /if \(validationMessage\) \{[\s\S]*?return;/.test(handler),
    `${page}: an incomplete form returns to the form instead of opening checkout`
  );
}

// ── 6. The checkout modal is the last line of defence ───────────────────────
const checkout = read('src/components/cart/SingleServiceCheckoutModal.tsx');
assert.match(checkout, /import \{ checkoutPayloadProblem \} from '\.\.\/\.\.\/services\/checkoutReadiness'/);
assert.match(
  checkout,
  /const payloadProblem = checkoutPayloadProblem\(serviceType, inputPayload\)/,
  'The checkout evaluates the payload it was handed'
);
assert.match(
  checkout,
  /if \(payloadProblem\) \{\s*setErrorMessage\(payloadProblem\);\s*return;/,
  'Submitting an incomplete payload is refused in the modal itself'
);
assert.match(checkout, /disabled=\{isSubmitting \|\| Boolean\(payloadProblem\)\}/, 'The pay button is disabled until the details are complete');
assert.match(checkout, /data-testid="checkout-missing-details"/, 'The customer is told what is missing, in the checkout');
assert.match(checkout, /nothing has been charged/, 'The notice reassures the customer that no charge happened');

// ── 7. The client rule mirrors the server ───────────────────────────────────
const orderRoute = read('api/services/index.php');
assert.match(
  orderRoute,
  /AstroEngine::hasValidBirthDetails\(\$inputPayload\)/,
  'The order API rejects a birth order with incomplete birth details'
);
assert.match(
  orderRoute,
  /astro_is_valid_marriage_payload\(\$inputPayload\)/,
  'The order API rejects an incomplete marriage payload'
);
assert.match(
  orderRoute,
  /astro_is_valid_muhurtham_payload\(\$inputPayload\)/,
  'The order API rejects an incomplete Muhurtham payload'
);

console.log(
  `Checkout readiness: ${Object.keys(validators).length} service pages validate after sign-in; ` +
  'an empty form can never reach a payment screen.'
);
