/**
 * A half-filled order form must survive the two routes that used to lose it.
 *
 * Reported by the owner after a live demo: a visitor who filled in the birth
 * details and then signed in was asked whether they had to type everything
 * again. Signing in from the report page itself never lost it (the Google
 * popup does not reload the page), but two routes did:
 *
 *   1. clicking **Login** in the navbar left the page, and a successful sign-in
 *      landed on the Dashboard — the form was gone;
 *   2. a browser refresh dropped the React state.
 *
 * Both are fixed here: the router remembers the page a signed-out visitor was
 * on and the login/register pages return them to it (services/authReturnRoute),
 * and each report form keeps a short-lived draft of the visitor's OWN typing
 * (services/formDraft + components/common/FormDraftNotice).
 *
 * The draft must never become the old silent saved-profile auto-fill, so these
 * checks pin its limits as hard as its behaviour: sessionStorage only, a
 * 30-minute life, consumed once, restored only into an empty form, never over
 * an explicit dashboard "Order for <name>" hand-off, never carrying the consent
 * checkbox or a payment reference, and always announced to the visitor.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORM_DRAFT_TTL_MS,
  clearFormDraft,
  formDraftKey,
  readFormDraft,
  refreshFormDraft,
  restorableChoice,
  restorableLocation,
  restorableText,
  takeFormDraft,
  writeFormDraft
} from '../src/services/formDraft';
import {
  RETURNABLE_AUTH_ROUTES,
  clearAuthReturnRoute,
  consumeAuthReturnRoute,
  isReturnableAuthRoute,
  peekAuthReturnRoute,
  postAuthRoute,
  rememberRouteForAuth
} from '../src/services/authReturnRoute';
import { isVerifiedBirthLocation } from '../src/utils/birthDetails';
import type { LocationData } from '../src/data/worldwideLocations';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

/* ------------------------------------------------------------ test doubles */

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); }
  };
}

function hostileStorage() {
  const boom = () => { throw new Error('storage is disabled'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

const chennai: LocationData = {
  placeName: 'Chennai, Tamil Nadu, India',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5,
  timeZoneId: 'Asia/Kolkata'
};

const T0 = 1_800_000_000_000;

/* ------------------------------------------------------- form draft: store */

check('a draft round-trips, namespaced per page', () => {
  const storage = fakeStorage();
  const wrote = writeFormDraft('baby-naming', { dob: '2024-03-10', tob: '08:45' }, { storage, now: T0 });
  assert.equal(wrote, true, 'the write reports success');
  assert.equal(formDraftKey('baby-naming'), 'astrosivam.formDraft.baby-naming');
  assert.deepEqual(
    [...storage.map.keys()],
    ['astrosivam.formDraft.baby-naming'],
    'one key, prefixed so it cannot collide with anything else'
  );
  assert.deepEqual(readFormDraft('baby-naming', { storage, now: T0 }), { dob: '2024-03-10', tob: '08:45' });
  assert.equal(readFormDraft('muhurtham', { storage, now: T0 }), null, 'another page has its own draft');
});

check('a draft expires after 30 minutes, and the stale key is dropped', () => {
  const storage = fakeStorage();
  writeFormDraft('birth-jathagam', { dob: '1990-05-14' }, { storage, now: T0 });
  assert.deepEqual(readFormDraft('birth-jathagam', { storage, now: T0 + FORM_DRAFT_TTL_MS }), { dob: '1990-05-14' },
    'still readable at exactly 30 minutes');
  assert.equal(readFormDraft('birth-jathagam', { storage, now: T0 + FORM_DRAFT_TTL_MS + 1 }), null,
    'unreadable one millisecond later');
  assert.equal(storage.map.size, 0, 'the expired entry is removed, not left on the device');
  assert.equal(FORM_DRAFT_TTL_MS, 30 * 60 * 1000, 'the lifetime is 30 minutes');
});

check('a small clock step forward is tolerated, a big one is not', () => {
  const storage = fakeStorage();
  writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage, now: T0 });
  assert.deepEqual(readFormDraft('baby-naming', { storage, now: T0 - 30_000 }), { dob: '2024-03-10' },
    'a draft written 30s "in the future" still reads');
  assert.equal(readFormDraft('baby-naming', { storage, now: T0 - 10 * 60_000 }), null,
    'a far-future timestamp is rejected as corrupt');
});

check('corrupt, stale-shaped or foreign content is ignored and removed', () => {
  const key = formDraftKey('muhurtham');
  for (const [label, raw] of [
    ['not JSON', 'this is not json'],
    ['an array', JSON.stringify({ savedAt: T0, data: ['a'] })],
    ['no envelope', JSON.stringify({ dob: '2024-03-10' })],
    ['no savedAt', JSON.stringify({ data: { dob: '2024-03-10' } })],
    ['a string payload', JSON.stringify({ savedAt: T0, data: 'hello' })]
  ] as Array<[string, string]>) {
    const storage = fakeStorage({ [key]: raw });
    assert.equal(readFormDraft('muhurtham', { storage, now: T0 }), null, `${label} → no draft`);
    assert.equal(storage.map.size, 0, `${label} → the unusable entry is removed`);
  }
});

check('no storage, or storage that throws, simply means "no draft"', () => {
  assert.equal(writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage: null }), false);
  assert.equal(readFormDraft('baby-naming', { storage: null }), null);
  assert.doesNotThrow(() => clearFormDraft('baby-naming', { storage: null }));

  const hostile = hostileStorage();
  assert.equal(writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage: hostile }), false);
  assert.equal(readFormDraft('baby-naming', { storage: hostile }), null);
  assert.doesNotThrow(() => clearFormDraft('baby-naming', { storage: hostile }));

  const before = globalThis.sessionStorage;
  delete (globalThis as any).sessionStorage;
  try {
    assert.equal(writeFormDraft('baby-naming', { dob: '2024-03-10' }), false, 'no global sessionStorage → false');
    assert.equal(readFormDraft('baby-naming'), null);
    assert.doesNotThrow(() => clearFormDraft('baby-naming'));
  } finally {
    if (before) (globalThis as any).sessionStorage = before;
  }
});

check('an empty payload is never stored', () => {
  const storage = fakeStorage();
  assert.equal(writeFormDraft('baby-naming', {} as object, { storage, now: T0 }), false);
  assert.equal(storage.map.size, 0);
});

/* ------------------------------------------- form draft: the two decisions */

check('takeFormDraft consumes the draft exactly once', () => {
  const storage = fakeStorage();
  writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage, now: T0 });
  assert.deepEqual(takeFormDraft('baby-naming', true, { storage, now: T0 }), { dob: '2024-03-10' });
  assert.equal(storage.map.size, 0, 'the stored copy is gone as soon as it is read');
  assert.equal(takeFormDraft('baby-naming', true, { storage, now: T0 }), null, 'a second read finds nothing');
});

check('a draft is restored only into an empty form — live typing wins', () => {
  const storage = fakeStorage();
  writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage, now: T0 });
  assert.equal(takeFormDraft('baby-naming', false, { storage, now: T0 }), null,
    'a form the customer is already filling is never overwritten');
  assert.equal(storage.map.size, 0, 'and the stale draft is dropped rather than kept for later');
});

check('an explicit dashboard "Order for <name>" hand-off beats the draft', () => {
  const storage = fakeStorage();
  writeFormDraft('birth-jathagam', { dob: '1990-05-14' }, { storage, now: T0 });
  assert.equal(
    takeFormDraft('birth-jathagam', true, { storage, now: T0, pendingHandOff: 'fm_1' }),
    null,
    'the person the customer chose is filled in, not the half-typed form'
  );
  assert.equal(storage.map.size, 0, 'the draft does not linger to overwrite the pick later');
});

check('refreshFormDraft keeps the stored copy in step with the form', () => {
  const storage = fakeStorage();
  assert.equal(refreshFormDraft('baby-naming', true, () => ({ dob: '' }), { storage, now: T0 }), false);
  assert.equal(storage.map.size, 0, 'an emptied form clears the draft');

  writeFormDraft('baby-naming', { dob: '2024-03-10' }, { storage, now: T0 });
  assert.equal(refreshFormDraft('baby-naming', false, () => ({ dob: '2024-03-11' }), { storage, now: T0 }), true);
  assert.deepEqual(readFormDraft('baby-naming', { storage, now: T0 }), { dob: '2024-03-11' }, 'the edit replaces it');

  assert.equal(refreshFormDraft('baby-naming', true, () => ({ dob: '' }), { storage, now: T0 }), false);
  assert.equal(storage.map.size, 0, 'clearing the form after an order leaves nothing behind');
});

/* ---------------------------------------------------- form draft: sanitize */

check('restorableText trims, collapses and caps; anything else becomes empty', () => {
  assert.equal(restorableText('  Ramesh   Kumar '), 'Ramesh Kumar');
  assert.equal(restorableText('x'.repeat(200), 80).length, 80);
  assert.equal(restorableText(2024), '');
  assert.equal(restorableText(null), '');
  assert.equal(restorableText({ dob: 'x' }), '');
  assert.equal(restorableText('<script>alert(1)</script>', 12).length, 12, 'a draft is data, never markup');
});

check('restorableChoice accepts only a listed value', () => {
  assert.equal(restorableChoice('F', ['M', 'F'] as const, 'M'), 'F');
  assert.equal(restorableChoice('X', ['M', 'F'] as const, 'M'), 'M');
  assert.equal(restorableChoice(undefined, ['en', 'ta', 'hi'] as const, 'en'), 'en');
  assert.equal(restorableChoice(7, ['en', 'ta', 'hi'] as const, 'en'), 'en');
});

check('restorableLocation agrees with the order form\'s own place check', () => {
  const samples: Array<LocationData | null | undefined> = [
    chennai,
    { ...chennai, placeName: '' },
    { ...chennai, placeName: '   ' },
    { ...chennai, latitude: 91 },
    { ...chennai, longitude: -181 },
    { ...chennai, timezoneOffsetHours: 15 },
    { ...chennai, latitude: NaN },
    { ...chennai, timeZoneId: undefined, state: 'Tamil Nadu', city: 'Chennai', area: 'T Nagar' },
    null,
    undefined
  ];
  for (const sample of samples) {
    const restored = restorableLocation<LocationData>(sample);
    assert.equal(
      Boolean(restored),
      isVerifiedBirthLocation(sample),
      `the draft gate matches the order gate for ${JSON.stringify(sample)}`
    );
  }
  // Extra fields a map pick carried survive, so the payload is still complete.
  const withExtras = { ...chennai, state: 'Tamil Nadu', city: 'Chennai', area: 'T Nagar' };
  assert.deepEqual(restorableLocation<LocationData>(withExtras), withExtras);
  assert.equal(restorableLocation('Chennai'), null, 'a bare place name is not a usable location');
});

/* ------------------------------------------------- login: where to return */

check('only real in-app pages can be remembered', () => {
  assert.deepEqual(
    [...RETURNABLE_AUTH_ROUTES].sort(),
    ['about', 'baby-naming', 'birth-jathagam', 'contact', 'how-it-works',
     'marriage-compatibility', 'muhurtham', 'services', 'team'].sort(),
    'the four report pages plus the pages a guest may have been reading'
  );
  for (const route of ['login', 'register', 'dashboard', 'home', 'admin', 'not-found', 'policy-terms']) {
    assert.equal(isReturnableAuthRoute(route), false, `${route} is never a return target`);
  }
  for (const route of ['/baby-naming', 'https://evil.example/x', 'baby-naming?x=1', 'javascript:alert(1)',
    '', '   ', 'BABY NAMING', 42, null, undefined, 'a'.repeat(80)]) {
    assert.equal(isReturnableAuthRoute(route), false, `${String(route)} is rejected`);
  }
  assert.equal(isReturnableAuthRoute('Baby-Naming'), true, 'case and padding are normalized');
});

check('the remembered page is stored, peeked and consumed once', () => {
  const storage = fakeStorage();
  assert.equal(rememberRouteForAuth('baby-naming', { storage }), true);
  assert.equal(peekAuthReturnRoute({ storage }), 'baby-naming');
  assert.equal(peekAuthReturnRoute({ storage }), 'baby-naming', 'peeking does not consume it');
  assert.equal(consumeAuthReturnRoute({ storage }), 'baby-naming');
  assert.equal(consumeAuthReturnRoute({ storage }), '', 'the second sign-in in the tab starts from the default');
  assert.equal(storage.map.size, 0);

  assert.equal(rememberRouteForAuth('dashboard', { storage }), false, 'a non-returnable page is not stored');
  assert.equal(rememberRouteForAuth('/login', { storage }), false);
  clearAuthReturnRoute({ storage });
  assert.equal(peekAuthReturnRoute({ storage }), '');
});

check('the last real page wins, and a stored value cannot be smuggled in', () => {
  const storage = fakeStorage();
  rememberRouteForAuth('services', { storage });
  rememberRouteForAuth('muhurtham', { storage });
  rememberRouteForAuth('login', { storage });
  assert.equal(consumeAuthReturnRoute({ storage }), 'muhurtham', 'the login page itself does not overwrite it');

  const poisoned = fakeStorage({ 'astrosivam.authReturnRoute': 'https://evil.example' });
  assert.equal(consumeAuthReturnRoute({ storage: poisoned }), '', 'a hand-written value is refused');
  const slug = fakeStorage({ 'astrosivam.authReturnRoute': 'admin' });
  assert.equal(consumeAuthReturnRoute({ storage: slug }), '', 'an admin route cannot be requested this way');
});

check('postAuthRoute: admin portal, else the page they left, else dashboard', () => {
  const storage = fakeStorage();
  rememberRouteForAuth('marriage-compatibility', { storage });
  assert.equal(postAuthRoute('admin', { storage }), 'admin', 'an admin still lands in the admin portal');
  assert.equal(peekAuthReturnRoute({ storage }), 'marriage-compatibility', 'the admin path does not consume it');
  assert.equal(postAuthRoute('customer', { storage }), 'marriage-compatibility');
  assert.equal(postAuthRoute('customer', { storage }), 'dashboard', 'and only once');
  assert.equal(postAuthRoute(undefined, { storage }), 'dashboard');
});

/* ------------------------------------------------------------- wiring: SPA */

check('the router remembers the page while nobody is signed in', () => {
  const app = read('src/App.tsx');
  assert.match(app, /import \{ rememberRouteForAuth \} from '\.\/services\/authReturnRoute'/);
  assert.match(app, /if \(user\) return;\s*rememberRouteForAuth\(currentRoute\);/,
    'only a signed-out visitor is tracked, so a signed-in refresh changes nothing');
});

check('both auth pages return the customer to the page they left', () => {
  const login = read('src/pages/LoginPage.tsx');
  const register = read('src/pages/RegisterPage.tsx');
  for (const [name, src, expected] of [['LoginPage', login, 2], ['RegisterPage', register, 3]] as const) {
    assert.match(src, /import \{ postAuthRoute \} from '\.\.\/services\/authReturnRoute'/, `${name} imports it`);
    const uses = src.match(/postAuthRoute\(/g) ?? [];
    assert.equal(uses.length, expected, `${name} routes every success path through postAuthRoute`);
    assert.doesNotMatch(src, /onNavigate\('dashboard'\)/, `${name} no longer hard-codes the dashboard`);
  }
  assert.match(login, /onNavigate\(postAuthRoute\(res\.user\?\.role\)\)/, 'email sign-in');
  assert.match(login, /onSuccess=\{signedIn => onNavigate\(postAuthRoute\(signedIn\?\.role\)\)\}/, 'Google sign-in');
  assert.match(register, /onSuccess=\{signedIn => onNavigate\(postAuthRoute\(signedIn\?\.role\)\)\}/, 'Google registration');
});

check('the Google button hands the signed-in account to the page', () => {
  const button = read('src/components/common/GoogleLoginButton.tsx');
  assert.match(button, /onSuccess\?: \(user\?: User\) => void;/);
  const passed = button.match(/onSuccess\?\.\(res\.user\)/g) ?? [];
  assert.equal(passed.length, 2, 'both the token flow and the ID-token flow pass the account');
});

/* ------------------------------------------------------- wiring: the forms */

const FORM_PAGES = [
  { page: 'BabyNamingPage', route: 'baby-naming', notice: 'babyFormDraft' },
  { page: 'BirthJathagamPage', route: 'birth-jathagam', notice: 'jathagamFormDraft' },
  { page: 'MarriageCompatibilityPage', route: 'marriage-compatibility', notice: 'matchFormDraft' },
  { page: 'MuhurthamPage', route: 'muhurtham', notice: 'muhurthamFormDraft' }
] as const;

for (const { page, route, notice } of FORM_PAGES) {
  check(`${page}: keeps a draft of its own form and nothing sensitive`, () => {
    const src = read(`src/pages/${page}.tsx`);
    assert.match(src, /import \{ FormDraftNotice, useFormDraft \} from '\.\.\/components\/common\/FormDraftNotice'/);

    const block = new RegExp(`const ${notice} = useFormDraft<\\{([\\s\\S]*?)\\n  \\}\\);`).exec(src)?.[1] ?? '';
    assert(block, `${page} declares the draft hook`);
    assert.match(block, new RegExp(`route: '${route}'`), 'namespaced to this page');
    assert.match(block, /snapshot: \(\) => \(/, 'what is kept');
    assert.match(block, /restore: draft => \{/, 'how it comes back');
    assert.match(block, /isEmpty: \(\) =>/, 'only an empty form is refilled');
    assert.match(block, /deps: \[/, 'refreshed as the customer types');

    // The draft is the customer's typing — never a consent flag, a picked saved
    // person, or anything about payment.
    for (const forbidden of ['saveAsProfile', 'pickedKey', 'saveRelation', 'saveMainRelation',
      'savePartnerRelation', 'paymentRef', 'paymentReference', 'paymentIntentId']) {
      assert.doesNotMatch(block, new RegExp(`\\b${forbidden}\\b`), `${forbidden} is never drafted`);
    }

    // Everything restored goes back through a validator.
    assert.match(block, /restorableText\(/, 'names are sanitized');
    assert.match(block, /restorableLocation</, 'places are sanitized');
    assert.match(block, /restorableChoice\(/, 'gender / language / event are sanitized');
    assert.match(block, /isValidIsoBirthDate\(/, 'a restored date is re-checked');
    assert.match(block, /isValidBirthTime\(/, 'a restored time is re-checked');

    // The visitor is told, and an placed order drops the draft.
    assert.match(src, /<FormDraftNotice/, 'the notice is rendered');
    assert.match(src, new RegExp(`shown=\\{${notice}\\.restored\\}`));
    assert.match(src, new RegExp(`onDismiss=\\{${notice}\\.dismiss\\}`));
    assert.match(src, new RegExp(`${notice}\\.discard\\(\\)`), 'the draft is dropped once the order exists');
  });
}

check('the hook applies the rules and the notice explains itself', () => {
  const hook = read('src/components/common/FormDraftNotice.tsx');
  assert.match(hook, /takeFormDraft<T>\(route, emptyRef\.current\(\), \{\s*pendingHandOff: peekPendingOrderFor\(\)/,
    'restore is one-shot, empty-forms-only, and steps aside for a dashboard hand-off');
  assert.match(hook, /refreshFormDraft\(route, emptyRef\.current\(\), snapshotRef\.current\)/,
    'the stored copy follows the form, and is cleared when the form is emptied');
  assert.match(hook, /FORM_DRAFT_WRITE_DELAY_MS/, 'writes are debounced, not per keystroke');
  assert.match(hook, /discard: \(\) => \{\s*clearFormDraft\(route\);/, 'discard really drops it');
  assert.match(hook, /data-testid="form-draft-restored"/);
  assert.match(hook, /We kept the details you entered/, 'plain words, and it says the form filled itself');
  assert.match(hook, /They stay on this device for \{minutes\} minutes/, 'and for how long');
  assert.match(hook, /if \(!shown\) return null;/, 'nothing is rendered until a draft is actually used');
});

check('the draft lives in the tab only, never on the device', () => {
  for (const file of ['src/services/formDraft.ts', 'src/services/authReturnRoute.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, /localStorage/, `${file} must not outlive the tab`);
    assert.match(src, /sessionStorage/, `${file} uses per-tab storage`);
  }
});

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

if (failures > 0) {
  console.error(`\nform-draft-and-login-return: ${failures} failing check(s)`);
  process.exit(1);
}
console.log(
  `\nform-draft-and-login-return: all ${checks.length} checks passed — a half-filled form survives ` +
  'the navbar login and a refresh, and returns to the same page.'
);
