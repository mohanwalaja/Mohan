import { readRepoSource } from './helpers/module-sources.js';
/**
 * Verified customer reviews (SEO audit 2026-10-15, finding 3).
 *
 * The homepage testimonials were hand-entered, the newest eight months old,
 * and tied to no order. Paid customers can now review what they bought; an
 * administrator publishes each review; the homepage lists published reviews
 * first, each linked to its service page.
 *
 *   1. Client logic (always runs): curated testimonials are kept verbatim
 *      (never re-dated, never labelled verified), merge order, the aggregate
 *      over every published review, the form validation mirror.
 *   2. Wiring contracts (always run): routes, migration == schema == runtime
 *      DDL, client limits == server limits, dashboard + admin entry points.
 *   3. The REAL PHP routes under PHP-WASM (dev-only runtime; SKIPs when absent,
 *      FAILS when ASTRO_REQUIRE_PHP_WASM_TESTS=1): api/services/index.php and
 *      api/admin/index.php against a throwaway SQLite database via
 *      scripts/php-admin-api-bridge.mjs — eligibility (paid + delivered + not
 *      refunded + own order), validation and sanitising, moderation, the
 *      public field set, refund-after-publish, edit-goes-back-to-moderation,
 *      the audit trail.
 *   4. "Rate your report" (same three layers): every delivery email of a paid
 *      order links to /dashboard?review=<order number>; free, unpaid, refunded
 *      and partially delivered orders get no invitation; the dashboard keeps
 *      the invitation across sign-in and opens that order's review form.
 *
 * Test data only: clearly fake identities; no real database or e-mail.
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_TESTIMONIALS } from '../src/data/testimonials';
import {
  REVIEW_LIMITS,
  REVIEW_SERVICES,
  defaultReviewDisplayName,
  formatReviewDate,
  mergeReviews,
  publishedToDisplay,
  summarizeRatings,
  textLength,
  validateReviewDraft
} from '../src/services/reviews';
import {
  REVIEW_INVITE_PARAM,
  REVIEW_INVITE_STORAGE_KEY,
  captureReviewInvite,
  clearReviewInvite,
  normalizeInviteOrderNumber,
  resolveReviewInvite
} from '../src/services/reviewInvite';
import type { DisplayReview, PublishedReview } from '../src/types';
import { buildPreviewPdfBase64 } from './helpers/previewPdfFixtures';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const prerender = await import(new URL('../scripts/prerender.mjs', import.meta.url).href);
const ROUTES: Array<{ path: string; routeKey: string }> = prerender.ROUTES;

console.log('--- CUSTOMER REVIEWS (SEO audit 2026-10-15, finding 3) ---');

// ---------------------------------------------------------------------------
// 1. Client logic
// ---------------------------------------------------------------------------

await check('the six curated testimonials are kept verbatim: original month, never "verified"', () => {
  assert.equal(CURATED_TESTIMONIALS.length, 6);
  // Re-dating a testimonial would misrepresent it; freshness comes from real reviews.
  assert.deepEqual(
    CURATED_TESTIMONIALS.map((t) => [t.authorName, t.datePublished]),
    [
      ['Rajesh & Priya Sharma', '2026-02'],
      ['Kavita Maharaj', '2026-01'],
      ['Amit & Deepa Prasad', '2026-02'],
      ['Ganesh Iyer', '2026-02'],
      ['Sunil Kumar', '2026-01'],
      ['Meena Pillay', '2025-12']
    ]
  );
  for (const testimonial of CURATED_TESTIMONIALS) {
    assert.equal(testimonial.verifiedPurchase, false, `${testimonial.authorName} was not submitted through an order`);
    assert.ok(testimonial.serviceCode in REVIEW_SERVICES, `${testimonial.authorName} must name a real service`);
    assert.ok(testimonial.rating >= 1 && testimonial.rating <= 5);
  }
});

await check('every review links to a prerendered service page', () => {
  const keys = new Set(ROUTES.map((route) => route.routeKey));
  for (const [code, service] of Object.entries(REVIEW_SERVICES)) {
    assert.ok(keys.has(service.route), `${code} -> ${service.route} has no prerendered page`);
  }
  const section = read('src/components/common/TestimonialsSection.tsx');
  assert.match(section, /<RouteLink\s+route=\{service\.route\}/, 'each review card must link its service page');
  assert.match(section, /<time dateTime=\{review\.datePublished\}/, 'the date must be machine-readable');
  assert.doesNotMatch(section, /hidden shrink-0 text-xs font-medium text-slate-400 sm:inline/, 'the date must be visible on phones too');
});

const verified = (id: string, datePublished: string, rating = 5): DisplayReview => ({
  id, authorName: `Customer ${id}`, serviceCode: 'BIRTH_JATHAGAM', rating, body: 'A clear and careful report.', datePublished, verifiedPurchase: true
});

await check('verified reviews come first, newest first; curated follow newest first; duplicates dropped', () => {
  const merged = mergeReviews([verified('v1', '2026-09-01'), verified('v2', '2026-10-14'), verified('v1', '2026-09-01')], CURATED_TESTIMONIALS);
  assert.deepEqual(merged.slice(0, 2).map((r) => r.id), ['v2', 'v1']);
  assert.equal(merged.length, 2 + CURATED_TESTIMONIALS.length);
  const curatedDates = merged.slice(2).map((r) => r.datePublished);
  assert.deepEqual(curatedDates, [...curatedDates].sort().reverse());
});

await check('the rating summary counts every published review, not just the page returned', () => {
  assert.deepEqual(summarizeRatings(CURATED_TESTIMONIALS, null), { ratingValue: 5, reviewCount: 6 });
  assert.deepEqual(summarizeRatings(CURATED_TESTIMONIALS, { reviewCount: 4, ratingTotal: 12 }), { ratingValue: 4.2, reviewCount: 10 });
  assert.deepEqual(summarizeRatings([], { reviewCount: 3, ratingTotal: 11 }), { ratingValue: 3.7, reviewCount: 3 });
  assert.equal(summarizeRatings([], null), null);
});

await check('malformed API rows are dropped before they reach the page or the markup', () => {
  const good: PublishedReview = {
    id: 'rev_1', serviceCode: 'MUHURTHAM', rating: 4, title: 'On time', body: 'Dates were clear.', displayName: 'Vel K.',
    location: null, publishedAt: '2026-10-14', verifiedPurchase: true
  };
  assert.deepEqual(publishedToDisplay(good), {
    id: 'rev_1', authorName: 'Vel K.', location: undefined, serviceCode: 'MUHURTHAM', rating: 4, title: 'On time',
    body: 'Dates were clear.', datePublished: '2026-10-14', verifiedPurchase: true
  });
  for (const bad of [
    { ...good, serviceCode: 'MULTI_PERSON' },
    { ...good, rating: 0 },
    { ...good, rating: 9 },
    { ...good, body: '  ' },
    { ...good, displayName: '' },
    { ...good, publishedAt: 'yesterday' }
  ]) {
    assert.equal(publishedToDisplay(bad as PublishedReview), null, JSON.stringify(bad));
  }
});

await check('the form validation catches what the server rejects', () => {
  const ok = { rating: 5, title: '', body: 'A clear, careful and kind report.', displayName: 'Kavita M.', location: '', consent: true };
  assert.deepEqual(validateReviewDraft(ok), {});
  assert.deepEqual(Object.keys(validateReviewDraft({ ...ok, rating: 0, body: 'short', displayName: 'K', consent: false })).sort(),
    ['body', 'consent', 'displayName', 'rating']);
  assert.ok(validateReviewDraft({ ...ok, body: 'Great report, see www.spam.example for more' }).body.includes('links'));
  assert.ok(validateReviewDraft({ ...ok, location: 'write me at me@example.com' }).location.includes('email'));
  assert.ok(validateReviewDraft({ ...ok, body: 'x'.repeat(REVIEW_LIMITS.bodyMax + 1) }).body);
  // Tamil counts characters, not UTF-16 units: 20 Tamil letters are enough.
  assert.equal(textLength('தமிழ்'), 5);
  assert.deepEqual(validateReviewDraft({ ...ok, body: 'அறிக்கை மிகவும் தெளிவாக இருந்தது' }), {});
});

await check('the default public name is first name + last initial; dates read naturally', () => {
  assert.equal(defaultReviewDisplayName('Kavita Maharaj'), 'Kavita M.');
  assert.equal(defaultReviewDisplayName('  Ganesh  Subramanian Iyer '), 'Ganesh I.');
  assert.equal(defaultReviewDisplayName('Meena'), 'Meena');
  assert.equal(defaultReviewDisplayName(''), '');
  assert.equal(formatReviewDate('2026-02'), 'February 2026');
  assert.equal(formatReviewDate('2026-10-14'), '14 October 2026');
});

/** A minimal browser for services/reviewInvite.ts: address bar, history and sessionStorage. */
function fakeBrowser(href: string, { storageBlocked = false } = {}) {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  const location = new URL(href);
  const storage = {
    getItem: (key: string) => { if (storageBlocked) throw new Error('blocked'); return store.has(key) ? store.get(key)! : null; },
    setItem: (key: string, value: string) => { if (storageBlocked) throw new Error('blocked'); store.set(key, String(value)); },
    removeItem: (key: string) => { if (storageBlocked) throw new Error('blocked'); store.delete(key); }
  };
  const win = {
    location: { get href() { return location.href; } },
    history: {
      state: { kept: true },
      replaceState: (_state: unknown, _title: string, url: string) => {
        replaced.push(url);
        const next = new URL(url, location.href);
        location.search = next.search;
        location.hash = next.hash;
      }
    },
    sessionStorage: storage
  };
  (globalThis as any).window = win;
  return { store, replaced, done: () => { delete (globalThis as any).window; } };
}

await check('the "Rate your report" link carries only a well-formed order number', () => {
  assert.equal(REVIEW_INVITE_PARAM, 'review');
  assert.equal(normalizeInviteOrderNumber(' ORD-65A1B2 '), 'ORD-65A1B2');
  assert.equal(normalizeInviteOrderNumber('ORD_TEST_1'), 'ORD_TEST_1');
  for (const bad of ['', '   ', '-ORD', 'ORD 1', '<img src=x>', 'ORD-1"', 'x'.repeat(65), null, undefined, 42]) {
    assert.equal(normalizeInviteOrderNumber(bad), null, `${String(bad)} must be ignored`);
  }
});

await check('the dashboard keeps the invitation across sign-in and takes it off the address bar', () => {
  const browser = fakeBrowser('https://astrosivam.com/dashboard?review=ORD-65A1B2&utm_source=email#orders');
  try {
    assert.equal(captureReviewInvite(), 'ORD-65A1B2');
    assert.deepEqual(browser.replaced, ['/dashboard?utm_source=email#orders'], 'only ?review= is removed');
    assert.equal(browser.store.get(REVIEW_INVITE_STORAGE_KEY), 'ORD-65A1B2');
    // Dashboard -> login -> dashboard: the address bar no longer has it.
    assert.equal(captureReviewInvite(), 'ORD-65A1B2', 'the remembered invitation survives the sign-in detour');
    clearReviewInvite();
    assert.equal(captureReviewInvite(), null, 'once handled, it never reopens');
  } finally {
    browser.done();
  }

  const hostile = fakeBrowser('https://astrosivam.com/dashboard?review=%3Cscript%3E');
  try {
    assert.equal(captureReviewInvite(), null, 'a malformed value is dropped');
    assert.deepEqual(hostile.replaced, ['/dashboard']);
    assert.equal(hostile.store.size, 0, 'and never stored');
  } finally {
    hostile.done();
  }

  const blocked = fakeBrowser('https://astrosivam.com/dashboard?review=ORD-77', { storageBlocked: true });
  try {
    assert.equal(captureReviewInvite(), 'ORD-77', 'blocked storage still opens the form for a signed-in visitor');
    assert.doesNotThrow(() => clearReviewInvite());
  } finally {
    blocked.done();
  }
  assert.equal(captureReviewInvite(), null, 'no window (prerender) -> no invitation');
});

await check('the invitation opens only an order this account may review', () => {
  const eligible = [
    { orderId: 'ord_1', orderNumber: 'ORD-AAA111', services: ['BIRTH_JATHAGAM' as const] },
    { orderId: 'ord_2', orderNumber: 'ORD-BBB222', services: ['BABY_NAMING' as const, 'MUHURTHAM' as const] }
  ];
  assert.equal(resolveReviewInvite('ORD-BBB222', eligible)?.orderId, 'ord_2');
  assert.equal(resolveReviewInvite('ord-bbb222', eligible)?.orderId, 'ord_2', 'case does not matter');
  assert.equal(resolveReviewInvite('ORD-CCC333', eligible), null, "someone else's or an ineligible order opens nothing");
  assert.equal(resolveReviewInvite('ORD-AAA111', []), null);
});

// ---------------------------------------------------------------------------
// 2. Wiring contracts
// ---------------------------------------------------------------------------

const reviewsPhp = read('api/reviews.php');
const phpConst = (name: string) => {
  const match = reviewsPhp.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `api/reviews.php must declare ${name}`);
  return Number(match[1]);
};

await check('client limits mirror the server constants exactly', () => {
  assert.deepEqual(
    {
      ratingMin: phpConst('ASTRO_REVIEW_RATING_MIN'),
      ratingMax: phpConst('ASTRO_REVIEW_RATING_MAX'),
      titleMax: phpConst('ASTRO_REVIEW_TITLE_MAX'),
      bodyMin: phpConst('ASTRO_REVIEW_BODY_MIN'),
      bodyMax: phpConst('ASTRO_REVIEW_BODY_MAX'),
      nameMin: phpConst('ASTRO_REVIEW_NAME_MIN'),
      nameMax: phpConst('ASTRO_REVIEW_NAME_MAX'),
      locationMax: phpConst('ASTRO_REVIEW_LOCATION_MAX')
    },
    { ...REVIEW_LIMITS }
  );
  for (const [code, service] of Object.entries(REVIEW_SERVICES)) {
    assert.ok(reviewsPhp.includes(`'${code}' => '${service.route}'`), `api/reviews.php must route ${code} to ${service.route}`);
  }
});

await check('the routers wire every review route to api/reviews.php (anchored, before unrelated DDL)', () => {
  const services = read('api/services/index.php');
  assert.match(services, /preg_match\('#\/services\/my-reviews\/\?\$#', \$path\)/);
  assert.match(services, /preg_match\('#\/services\/reviews\/\?\$#', \$path\)/);
  assert.match(services, /astro_reviews_route_mine\(\$pdo, requireAuth\(\$pdo\)\)/);
  assert.match(services, /\$reviewUser = requireAuth\(\$pdo\);\s+astro_reviews_route_submit\(\$pdo, \$reviewUser, \$jsonBody\);/);
  assert.match(services, /astro_reviews_route_public_list\(\$pdo\);/);

  const admin = read('api/admin/index.php');
  const route = admin.indexOf("preg_match('#/admin/reviews");
  assert.ok(route > admin.indexOf('$admin = requireAdmin($pdo);'), 'moderation must sit behind requireAdmin');
  assert.ok(route < admin.indexOf('astro_payment_ensure_tables($pdo);'), 'moderation must not pay for the payment DDL');
  for (const handler of ['astro_reviews_route_admin_list', 'astro_reviews_route_admin_moderate', 'astro_reviews_route_admin_delete']) {
    assert.ok(admin.includes(handler), `admin router must call ${handler}`);
  }
  const submit = reviewsPhp.slice(reviewsPhp.indexOf('function astro_reviews_route_submit'));
  assert.ok(submit.indexOf('astro_rate_limit_enforce(') < submit.indexOf('INSERT INTO customer_reviews'), 'submissions are rate limited');
});

/** Column names of `CREATE TABLE ... customer_reviews (...)` in a DDL text. */
function reviewColumns(ddl: string): string[] {
  const start = ddl.indexOf('customer_reviews');
  assert.ok(start >= 0, 'customer_reviews DDL not found');
  const body = ddl.slice(start, ddl.indexOf(') ENGINE', start));
  return [...body.matchAll(/^\s*`([a-z_]+)`\s+[A-Z]/gm)].map((m) => m[1]);
}

await check('migration 011, schema.sql and the runtime guard declare the same table', () => {
  const migration = reviewColumns(read('api/migrations/011_customer_reviews.sql'));
  const schema = reviewColumns(read('api/schema.sql'));
  // The runtime guard assembles its DDL from a $columns string.
  const guard = reviewsPhp.slice(reviewsPhp.indexOf('function astro_reviews_ensure_table'));
  const runtime = [...guard.slice(guard.indexOf('$columns = "'), guard.indexOf('$foreignKeys')).matchAll(/^\s*`([a-z_]+)`\s+[A-Z]/gm)].map((m) => m[1]);
  assert.match(guard, /CREATE TABLE IF NOT EXISTS `customer_reviews` \(' \. \$columns/);
  assert.ok(migration.length >= 16, `migration declares only ${migration.length} columns`);
  assert.deepEqual(schema, migration);
  assert.deepEqual(runtime, migration);
  for (const ddl of [read('api/migrations/011_customer_reviews.sql'), read('api/schema.sql'), reviewsPhp]) {
    assert.match(ddl, /UNIQUE KEY `uq_customer_reviews_order_service` \(`order_id`, `service_code`\)/);
  }
});

await check('the dashboard offers reviews only for server-approved orders; admins moderate them', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /api\.getMyReviews\(\)/);
  assert.match(dashboard, /reviewableOrders\.find\(entry => entry\.orderId === order\.id\)/);
  assert.match(dashboard, /\{reviewEligibility && \(\s*<OrderReviewStrip/);
  assert.match(dashboard, /<ReviewFormModal/);
  const portal = read('src/pages/AdminPortal.tsx');
  assert.match(portal, /activeSection === 'reviews' && \(\s*<CustomerReviewsPanel/);
  const api = read('src/services/api.ts');
  for (const url of ['/services/reviews?limit=', '/services/my-reviews', '/admin/reviews?status=', '/admin/reviews/${encodeURIComponent(id)}/${decision}']) {
    assert.ok(api.includes(url), `api.ts must call ${url}`);
  }
  // The homepage call must never be reported as a client error or send cookies.
  const publicCall = api.slice(api.indexOf('async getPublishedReviews'), api.indexOf('async getMyReviews'));
  assert.doesNotMatch(publicCall, /apiFetch\(/);
  assert.match(publicCall, /credentials: 'omit'/);
});

await check('every delivery email carries the invitation, built in one place (api/reviews.php)', () => {
  const templates: Array<[string, number]> = [
    ['api/admin/index.php', 2], // single order: approve + resend
    ['api/admin/family_approval.php', 1],
    ['api/admin/order_items.php', 1],
    ['api/admin/approve_order.php', 1]
  ];
  for (const [file, calls] of templates) {
    const source = read(file);
    assert.match(source, /require_once __DIR__ \. '\/\.\.\/reviews\.php';/, `${file} must load api/reviews.php`);
    assert.equal(source.split('astro_review_invite_email_html(').length - 1, calls, `${file} must build ${calls} invitation(s)`);
    assert.ok(/\{\$reviewInvite(Html)?\}/.test(source), `${file} must place the invitation in the email body`);
    assert.doesNotMatch(source, /dashboard\?review=/, `${file} must not hand-build the link`);
  }
  const items = read('api/admin/order_items.php');
  assert.match(items, /astro_order_items_send_completes_order\(\$pdo, \$order, \$sendingItemIds\)\s*\?\s*astro_review_invite_email_html/,
    'a multi-person order is invited only by the email that completes it');
  assert.match(items, /\$reviewInvite = \$partIndex === 0 \? \$reviewInviteHtml : '';/, 'only the first part of a split delivery carries it');
  // The link points at the canonical host and at the parameter the dashboard reads.
  assert.match(reviewsPhp, /const ASTRO_REVIEW_PUBLIC_ORIGIN = 'https:\/\/astrosivam\.com';/);
  assert.ok(reviewsPhp.includes(`'/dashboard?${REVIEW_INVITE_PARAM}=' . rawurlencode($orderNumber)`));
  assert.ok(ROUTES.some((route) => route.path === '/dashboard'), '/dashboard must be a prerendered route');
});

await check('the dashboard opens the invited review once the session and the eligible orders are known', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /setReviewInvite\(captureReviewInvite\(\)\)/);
  assert.match(dashboard, /useEffect\(\(\) => \{\s*if \(user\?\.id\) fetchMyReviews\(\);\s*\}, \[user\?\.id\]\);/,
    'reviews must load when the session check resolves, not only on mount');
  assert.match(dashboard, /if \(!user \|\| !reviewInvite \|\| !reviewsLoaded\) return;/);
  assert.match(dashboard, /resolveReviewInvite\(reviewInvite, reviewableOrders\)/);
  assert.match(dashboard, /clearReviewInvite\(\);/);
  assert.match(dashboard, /data-review-invite-pending/, 'a signed-out visitor is told why to sign in');
  assert.match(read('tests/browser/review-invite.spec.ts'), /a signed-out customer keeps the invitation through sign-in/,
    'the invitation flow should remain available as a local browser regression');
});

// ---------------------------------------------------------------------------
// 3. The real PHP routes (PHP-WASM)
// ---------------------------------------------------------------------------

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  if (process.env.ASTRO_REQUIRE_PHP_WASM_TESTS === '1') {
    throw new Error('ASTRO_REQUIRE_PHP_WASM_TESTS=1 but @php-wasm/node is not installed: the review routes did not run.');
  }
  console.log('  [SKIP] @php-wasm/node is not installed - the real review routes did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
  console.log(`\nCustomer reviews contract passed (${passed} checks).`);
  process.exit(0);
}

const { createAdminApiBridge, TEST_ORDERS } = await import(new URL('../scripts/php-admin-api-bridge.mjs', import.meta.url).href);
const bridge = await createAdminApiBridge();
const q = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("CREATE TABLE IF NOT EXISTS customer_reviews (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, user_id TEXT NOT NULL,
  service_code TEXT NOT NULL, rating INTEGER NOT NULL, title TEXT NULL, body TEXT NOT NULL, display_name TEXT NOT NULL,
  location TEXT NULL, status TEXT NOT NULL DEFAULT 'PENDING', rejection_reason TEXT NULL, moderated_by TEXT NULL,
  moderated_at TEXT NULL, published_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (order_id, service_code))");
$user = $pdo->prepare("INSERT INTO users (id, name, email, role, country, token_version) VALUES (?, ?, ?, 'customer', ?, 0)");
$user->execute(['usr_rev_a', 'Kavita Maharaj', 'kavita@example.test', 'Australia']);
$user->execute(['usr_rev_b', 'Other Customer', 'other@example.test', 'India']);
$order = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, amount, currency,
  service_mode, status, payment_confirmed, refund_status, input_payload, created_at) VALUES (?, ?, ?, 'Test', 'test@example.test', ?, ?, 'USD', ?, ?, ?, ?, '{}', ?)");
foreach ([
  ['ord_rev_done', 'ORD-REV-DONE', 'usr_rev_a', 'BIRTH_JATHAGAM', 18, 'PAID', 'COMPLETED', 1, 'NONE', '2026-10-01 10:00:00'],
  ['ord_rev_processing', 'ORD-REV-PROC', 'usr_rev_a', 'MARRIAGE_COMPATIBILITY', 22, 'PAID', 'PROCESSING', 1, 'NONE', '2026-10-02 10:00:00'],
  ['ord_rev_unconfirmed', 'ORD-REV-UNCF', 'usr_rev_a', 'MUHURTHAM', 20, 'PAID', 'COMPLETED', 0, 'NONE', '2026-10-03 10:00:00'],
  ['ord_rev_free', 'ORD-REV-FREE', 'usr_rev_a', 'BABY_NAMING', 0, 'FREE_BETA', 'COMPLETED', 1, 'NONE', '2026-10-04 10:00:00'],
  ['ord_rev_refunded', 'ORD-REV-RFND', 'usr_rev_a', 'MUHURTHAM', 20, 'PAID', 'REFUNDED', 1, 'REFUNDED', '2026-10-05 10:00:00'],
  ['ord_rev_family', 'ORD-REV-FAM', 'usr_rev_a', 'MULTI_PERSON', 40, 'PAID', 'COMPLETED', 1, 'NONE', '2026-10-06 10:00:00'],
  ['ord_rev_legacy', 'ORD-REV-LEG', 'usr_rev_a', 'BIRTH_JATHAGAM', 18, 'PAID', 'GENERATED', 1, 'NONE', '2026-10-07 10:00:00'],
  ['ord_rev_b', 'ORD-REV-B', 'usr_rev_b', 'BIRTH_JATHAGAM', 18, 'PAID', 'COMPLETED', 1, 'NONE', '2026-10-08 10:00:00'],
] as $row) { $order->execute($row); }
$item = $pdo->prepare("INSERT INTO order_items (order_id, person_id, service_code) VALUES ('ord_rev_family', 1, ?)");
foreach (['BABY_NAMING', 'BIRTH_JATHAGAM', 'BIRTH_JATHAGAM'] as $code) { $item->execute([$code]); }
echo json_encode(['ok' => true]);
`);

const token = async (id: string, email: string) =>
  (await bridge.runPhp(`echo json_encode(['token' => createBearerToken(['id' => ${q(id)}, 'email' => ${q(email)}, 'role' => 'customer'], 3600, 0)]);`)).token as string;
const as = (bearer: string) => ({ auth: false, headers: { authorization: `Bearer ${bearer}` } });
const tokenA = await token('usr_rev_a', 'kavita@example.test');
const tokenB = await token('usr_rev_b', 'other@example.test');
const valid = { rating: 5, body: 'A clear, careful and kind report — thank you.', displayName: 'Kavita M.', location: 'Sydney, Australia', consent: true };
const submit = (bearer: string, json: Record<string, unknown>) => bridge.request({ method: 'POST', url: '/api/services/reviews', json, ...as(bearer) });
const publicList = async () => {
  const res = await bridge.request({ url: '/api/services/reviews', auth: false });
  assert.equal(res.status, 200, res.text);
  return res;
};
const PUBLIC_KEYS = ['body', 'displayName', 'id', 'location', 'publishedAt', 'rating', 'serviceCode', 'serviceRoute', 'title', 'verifiedPurchase'];
let doneReviewId = '';
let familyReviewId = '';
let legacyReviewId = '';

try {
  await check('PHP: nothing is public before moderation; anonymous visitors cannot submit', async () => {
    const empty = await publicList();
    assert.deepEqual(empty.json, { success: true, reviews: [], aggregate: { reviewCount: 0, ratingTotal: 0, ratingValue: null } });
    const anonymous = await bridge.request({ method: 'POST', url: '/api/services/reviews', json: { orderId: 'ord_rev_done', ...valid }, auth: false });
    assert.equal(anonymous.status, 401, anonymous.text);
  });

  await check('PHP: only a paid, payment-confirmed, delivered, non-refunded order of your own can be reviewed', async () => {
    for (const [orderId, status, code] of [
      ['ord_rev_processing', 403, 'NOT_DELIVERED'],
      ['ord_rev_unconfirmed', 403, 'PAYMENT_NOT_CONFIRMED'],
      ['ord_rev_free', 403, 'NOT_A_PAID_ORDER'],
      ['ord_rev_refunded', 403, 'ORDER_REFUNDED'],
      ['ord_rev_b', 404, 'ORDER_NOT_FOUND'],
      ['ord_does_not_exist', 404, 'ORDER_NOT_FOUND']
    ] as const) {
      const res = await submit(tokenA, { orderId, ...valid });
      assert.equal(res.status, status, `${orderId}: ${res.text}`);
      assert.equal(res.json?.code, code, `${orderId}: ${res.text}`);
    }
  });

  await check('PHP: invalid reviews are rejected field by field (rating, length, links, email, consent)', async () => {
    const res = await submit(tokenA, {
      orderId: 'ord_rev_done', rating: 6, title: 'Visit https://spam.example now', body: 'too short',
      displayName: 'K', location: 'me@example.com', consent: false
    });
    assert.equal(res.status, 422, res.text);
    assert.deepEqual(Object.keys(res.json.errors).sort(), ['body', 'consent', 'displayName', 'location', 'rating', 'title']);
    const stringConsent = await submit(tokenA, { orderId: 'ord_rev_done', ...valid, consent: 'yes' });
    assert.equal(stringConsent.status, 422, 'consent must be the boolean true');
  });

  await check('PHP: a valid review is stored PENDING with clean text (Tamil kept, controls and bidi overrides gone)', async () => {
    const res = await submit(tokenA, {
      orderId: 'ord_rev_done', ...valid,
      title: '  Clear   and kind  ',
      body: 'Clear and kind report.\r\n\r\n\r\n\u0007மிகவும் தெளிவான அறிக்கை\u202E — நன்றி\u200D!'
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.review.status, 'PENDING');
    assert.equal(res.json.review.serviceCode, 'BIRTH_JATHAGAM', 'a single-service order defaults its service');
    assert.equal(res.json.review.title, 'Clear and kind');
    assert.equal(res.json.review.body, 'Clear and kind report.\n\nமிகவும் தெளிவான அறிக்கை — நன்றி\u200D!');
    doneReviewId = res.json.review.id;
    assert.match(doneReviewId, /^rev_[0-9a-f]{20}$/);
    assert.equal((await publicList()).json.reviews.length, 0, 'pending reviews are not public');
  });

  await check('PHP: a family order reviews each of its services; the service must belong to the order', async () => {
    const missing = await submit(tokenA, { orderId: 'ord_rev_family', ...valid });
    assert.equal(missing.status, 422);
    assert.ok(missing.json.errors.serviceCode);
    const foreign = await submit(tokenA, { orderId: 'ord_rev_family', ...valid, serviceCode: 'MUHURTHAM' });
    assert.equal(foreign.status, 422);
    const ok = await submit(tokenA, { orderId: 'ord_rev_family', ...valid, serviceCode: 'BABY_NAMING', rating: 3 });
    assert.equal(ok.status, 201, ok.text);
    familyReviewId = ok.json.review.id;
    const legacy = await submit(tokenA, { orderId: 'ord_rev_legacy', ...valid, rating: 4 });
    assert.equal(legacy.status, 201, `a legacy GENERATED (delivered) order is reviewable: ${legacy.text}`);
    legacyReviewId = legacy.json.review.id;
  });

  await check('PHP: my-reviews lists the reviewable orders (services de-duplicated) and the customer\'s own reviews', async () => {
    const mine = await bridge.request({ url: '/api/services/my-reviews', ...as(tokenA) });
    assert.equal(mine.status, 200, mine.text);
    const eligible = Object.fromEntries(mine.json.eligibleOrders.map((o: any) => [o.orderId, o.services]));
    assert.deepEqual(eligible, {
      ord_rev_legacy: ['BIRTH_JATHAGAM'],
      ord_rev_family: ['BIRTH_JATHAGAM', 'BABY_NAMING'],
      ord_rev_done: ['BIRTH_JATHAGAM']
    });
    assert.equal(mine.json.reviews.length, 3);
    assert.ok(mine.json.reviews.every((r: any) => r.status === 'PENDING' && r.orderNumber));
    const other = await bridge.request({ url: '/api/services/my-reviews', ...as(tokenB) });
    assert.deepEqual(other.json.reviews, [], 'customers never see each other\'s reviews');
    assert.deepEqual(other.json.eligibleOrders.map((o: any) => o.orderId), ['ord_rev_b']);
  });

  await check('PHP: moderation is admin-only and shows the order + customer it is verified against', async () => {
    const forbidden = await bridge.request({ url: '/api/admin/reviews', ...as(tokenA) });
    assert.equal(forbidden.status, 403, forbidden.text);
    const queue = await bridge.request({ url: '/api/admin/reviews?status=PENDING' });
    assert.equal(queue.status, 200, queue.text);
    assert.deepEqual(queue.json.counts, { PENDING: 3, APPROVED: 0, REJECTED: 0, ALL: 3 });
    const done = queue.json.reviews.find((r: any) => r.id === doneReviewId);
    assert.equal(done.orderNumber, 'ORD-REV-DONE');
    assert.equal(done.customerEmail, 'kavita@example.test');
    assert.equal(done.orderAmount, 18);
  });

  await check('PHP: a published review exposes public fields only, and the totals cover it', async () => {
    const approved = await bridge.request({ method: 'POST', url: `/api/admin/reviews/${doneReviewId}/approve`, json: {} });
    assert.equal(approved.status, 200, approved.text);
    assert.equal(approved.json.review.status, 'APPROVED');
    assert.ok(approved.json.review.publishedAt);
    await bridge.request({ method: 'POST', url: `/api/admin/reviews/${familyReviewId}/approve`, json: {} });

    const list = await publicList();
    assert.equal(list.json.reviews.length, 2);
    for (const review of list.json.reviews) {
      assert.deepEqual(Object.keys(review).sort(), PUBLIC_KEYS);
      assert.equal(review.verifiedPurchase, true);
      assert.match(review.publishedAt, /^\d{4}-\d{2}-\d{2}$/, 'only the date is public');
    }
    for (const secret of ['kavita@example.test', 'ord_rev_done', 'ORD-REV-DONE', 'usr_rev_a']) {
      assert.ok(!list.text.includes(secret), `the public list leaked ${secret}`);
    }
    assert.deepEqual(list.json.aggregate, { reviewCount: 2, ratingTotal: 8, ratingValue: 4 });
    const done = list.json.reviews.find((r: any) => r.id === doneReviewId);
    assert.equal(done.serviceRoute, 'birth-jathagam');
    assert.equal(done.displayName, 'Kavita M.');
  });

  await check('PHP: editing a published review takes it off the site until it is re-approved; re-approval keeps the date', async () => {
    const edit = await submit(tokenA, { orderId: 'ord_rev_done', ...valid, rating: 4, body: 'Still a clear and careful report, updated.' });
    assert.equal(edit.status, 200, edit.text);
    assert.equal(edit.json.review.id, doneReviewId, 'an edit updates the same review');
    assert.equal(edit.json.review.status, 'PENDING');
    assert.match(edit.json.message, /reappear/);
    assert.deepEqual((await publicList()).json.reviews.map((r: any) => r.id), [familyReviewId]);

    await bridge.request({ method: 'POST', url: `/api/admin/reviews/${doneReviewId}/approve`, json: {} });
    await bridge.runPhp(`getDbConnection()->exec("UPDATE customer_reviews SET published_at = '2026-01-02 03:04:05' WHERE id = ${q(doneReviewId)}"); echo json_encode(['ok' => true]);`);
    const again = await bridge.request({ method: 'POST', url: `/api/admin/reviews/${doneReviewId}/approve`, json: {} });
    assert.equal(again.json.review.publishedAt, '2026-01-02 03:04:05', 'approving an approved review must not fake freshness');
  });

  await check('PHP: a rejected review stays private and the customer sees why', async () => {
    const rejected = await bridge.request({ method: 'POST', url: `/api/admin/reviews/${legacyReviewId}/reject`, json: { reason: 'Please remove the phone number.' } });
    assert.equal(rejected.status, 200, rejected.text);
    assert.equal(rejected.json.review.status, 'REJECTED');
    const mine = await bridge.request({ url: '/api/services/my-reviews', ...as(tokenA) });
    const legacy = mine.json.reviews.find((r: any) => r.id === legacyReviewId);
    assert.equal(legacy.rejectionReason, 'Please remove the phone number.');
    assert.ok(!(await publicList()).json.reviews.some((r: any) => r.id === legacyReviewId));
  });

  await check('PHP: refunding an order hides its review and blocks publishing it again', async () => {
    await bridge.runPhp(`getDbConnection()->exec("UPDATE orders SET status = 'REFUNDED', refund_status = 'REFUNDED' WHERE id = 'ord_rev_family'"); echo json_encode(['ok' => true]);`);
    const list = await publicList();
    assert.deepEqual(list.json.reviews.map((r: any) => r.id), [doneReviewId]);
    assert.deepEqual(list.json.aggregate, { reviewCount: 1, ratingTotal: 4, ratingValue: 4 });
    const blocked = await bridge.request({ method: 'POST', url: `/api/admin/reviews/${familyReviewId}/approve`, json: {} });
    assert.equal(blocked.status, 409, blocked.text);
    assert.equal(blocked.json.code, 'ORDER_REFUNDED');
  });

  await check('PHP: the invitation goes to exactly the orders that will be reviewable once delivered', async () => {
    const result = await bridge.runPhp(`
require_once '/repo/api/reviews.php';
$base = ['order_number' => 'ORD-INV001', 'service_mode' => 'PAID', 'amount' => 18, 'payment_confirmed' => 0,
  'status' => 'PENDING_APPROVAL', 'refund_status' => 'NONE'];
$cases = [
  'paid, being approved' => $base,
  'paid, resent after delivery' => array_merge($base, ['status' => 'COMPLETED', 'payment_confirmed' => 1]),
  'paid, legacy generated' => array_merge($base, ['status' => 'GENERATED']),
  'free beta' => array_merge($base, ['service_mode' => 'FREE_BETA', 'amount' => 0]),
  'paid mode, zero amount' => array_merge($base, ['amount' => 0]),
  'refunded' => array_merge($base, ['status' => 'REFUNDED']),
  'refund settled, status kept' => array_merge($base, ['status' => 'COMPLETED', 'refund_status' => 'REFUNDED']),
  'cancelled' => array_merge($base, ['status' => 'CANCELLED']),
  'rejected' => array_merge($base, ['status' => 'REJECTED']),
];
$applies = [];
foreach ($cases as $name => $order) {
  $applies[$name] = astro_review_invite_applies($order);
}
echo json_encode([
  'applies' => $applies,
  'html' => astro_review_invite_email_html($base),
  'plural' => astro_review_invite_email_html($base, true),
  'free' => astro_review_invite_email_html($cases['free beta']),
  'noNumber' => astro_review_invite_email_html(array_merge($base, ['order_number' => ' '])),
  'escaped' => astro_review_invite_email_html(array_merge($base, ['order_number' => "ORD-1&2'\\"<x>"])),
]);
`);
    assert.deepEqual(result.applies, {
      'paid, being approved': true,
      'paid, resent after delivery': true,
      'paid, legacy generated': true,
      'free beta': false,
      'paid mode, zero amount': false,
      refunded: false,
      'refund settled, status kept': false,
      cancelled: false,
      rejected: false
    });
    assert.ok(result.html.includes("href='https://astrosivam.com/dashboard?review=ORD-INV001'"), result.html);
    assert.match(result.html, /How was your report\?/);
    assert.match(result.html, />Rate your report</);
    assert.match(result.html, /tell us honestly/, 'the invitation asks for an honest review, not a good one');
    assert.match(result.plural, /How were your reports\?/);
    assert.match(result.plural, />Rate your reports</);
    assert.equal(result.free, '');
    assert.equal(result.noNumber, '');
    assert.ok(result.escaped.includes("review=ORD-1%262%27%22%3Cx%3E'"), result.escaped);
    assert.doesNotMatch(result.escaped, /<x>/);
  });

  await check('PHP: a multi-person order is invited only by the email that completes it', async () => {
    const result = await bridge.runPhp(`
require_once '/repo/api/admin/order_items.php';
$pdo = getDbConnection();
$pdo->exec("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, amount, currency, service_mode,
  status, payment_confirmed, refund_status, input_payload, created_at) VALUES ('ord_inv_multi', 'ORD-INV-MULTI', 'usr_rev_a', 'Test',
  'test@example.test', 'MULTI_PERSON', 40, 'USD', 'PAID', 'PROCESSING', 1, 'NONE', '{}', '2026-10-09 10:00:00')");
$item = $pdo->prepare("INSERT INTO order_items (order_id, person_id, service_code, report_status) VALUES ('ord_inv_multi', ?, ?, 'PENDING')");
$item->execute([1, 'BIRTH_JATHAGAM']);
$first = (int) $pdo->lastInsertId();
$item->execute([2, 'BABY_NAMING']);
$second = (int) $pdo->lastInsertId();
$order = $pdo->query("SELECT * FROM orders WHERE id = 'ord_inv_multi'")->fetch(PDO::FETCH_ASSOC);
$out = [
  'firstOfTwo' => astro_order_items_send_completes_order($pdo, $order, [$first]),
  'bothAtOnce' => astro_order_items_send_completes_order($pdo, $order, [$first, $second]),
];
$pdo->exec("UPDATE order_items SET report_status = 'SENT' WHERE id = " . $first);
$out['lastRemaining'] = astro_order_items_send_completes_order($pdo, $order, [$second]);
$out['resendOfCompleted'] = astro_order_items_send_completes_order($pdo, array_merge($order, ['status' => 'COMPLETED']), [$first]);
$out['noItems'] = astro_order_items_send_completes_order($pdo, array_merge($order, ['id' => 'ord_missing']), []);
$out['inFirstPart'] = strpos(astro_order_items_email_html($order, [], ['a.pdf'], 0, 2, '<div>INVITE</div>'), '<div>INVITE</div>') !== false;
$out['inSecondPart'] = strpos(astro_order_items_email_html($order, [], ['b.pdf'], 1, 2, '<div>INVITE</div>'), '<div>INVITE</div>') !== false;
echo json_encode($out);
`);
    assert.deepEqual(result, {
      firstOfTwo: false,
      bothAtOnce: true,
      lastRemaining: true,
      resendOfCompleted: true,
      noItems: false,
      inFirstPart: true,
      inSecondPart: false
    });
  });

  await check('PHP: approving a paid order emails the invitation; a free-beta delivery carries none', async () => {
    const docs = {
      reportPdfBase64: buildPreviewPdfBase64({ pages: 1, scanBytesPerPage: 160 * 1024, seed: 811 }),
      invoicePdfBase64: buildPreviewPdfBase64({ pages: 1, scanBytesPerPage: 160 * 1024, seed: 812 }),
      language: 'en',
      requirePreviewQuality: true
    };
    const single = TEST_ORDERS.single;
    await bridge.runPhp(`getDbConnection()->exec("UPDATE orders SET service_mode = 'PAID', amount = 18, payment_status = 'CAPTURED', payment_confirmed = 1 WHERE id = ${q(single.id)}"); echo json_encode(['ok' => true]);`);
    const paid = await bridge.request({ method: 'POST', url: `/api/admin/orders/${single.id}/approve`, json: docs });
    assert.equal(paid.status, 200, paid.text);
    const paidMail = bridge.outbox().at(-1);
    assert.equal(paidMail.to, single.email);
    assert.ok(paidMail.html.includes(`href='https://astrosivam.com/dashboard?review=${single.orderNumber}'`), 'the paid delivery invites a review');
    assert.equal((await bridge.order(single.id)).status, 'COMPLETED', 'the order the link opens is reviewable');

    const free = await bridge.request({ method: 'POST', url: `/api/admin/orders/${TEST_ORDERS.other.id}/approve`, json: docs });
    assert.equal(free.status, 200, free.text);
    assert.doesNotMatch(bridge.outbox().at(-1).html, /dashboard\?review=|Rate your report/, 'a free-beta delivery carries no invitation');
  });

  await check('PHP: deletion, method guards, the legacy ?action= entry point and the audit trail', async () => {
    const deleted = await bridge.request({ method: 'DELETE', url: `/api/admin/reviews/${legacyReviewId}` });
    assert.equal(deleted.status, 200, deleted.text);
    assert.equal((await bridge.request({ method: 'DELETE', url: `/api/admin/reviews/${legacyReviewId}` })).status, 404);
    assert.equal((await bridge.request({ url: '/api/admin/reviews' })).json.counts.ALL, 2);

    assert.equal((await bridge.request({ method: 'PUT', url: '/api/services/reviews', json: {}, ...as(tokenA) })).status, 405);
    assert.equal((await bridge.request({ method: 'POST', url: '/api/services/my-reviews', json: {}, ...as(tokenA) })).status, 405);
    const legacyEntry = await bridge.request({ url: '/api/services.php?action=reviews', auth: false });
    assert.equal(legacyEntry.status, 200, legacyEntry.text);
    assert.equal(legacyEntry.json.reviews.length, 1);

    const actions = new Set((await bridge.auditActions()).map((entry: { action: string }) => entry.action));
    for (const action of ['REVIEW_SUBMITTED', 'REVIEW_UPDATED', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_DELETED']) {
      assert.ok(actions.has(action), `audit log is missing ${action}`);
    }
    // Same filter as tests/admin-report-delivery.test.ts: the approve route's
    // astrology engine writes informational lines (ayanamsa used) to the log.
    const phpProblems = bridge.phpErrors().split('\n').filter((line: string) => /PHP (Fatal|Warning|Notice|Deprecated|Parse)/.test(line));
    assert.deepEqual(phpProblems, [], 'the review and delivery routes must not log PHP warnings, notices or fatals');
    assert.doesNotMatch(bridge.phpErrors(), /reviews\.php|customer_reviews/, 'nothing from api/reviews.php or its table may reach the error log');
  });
} finally {
  await bridge.close();
}

console.log(`\nCustomer reviews contract passed (${passed} checks).`);
