/**
 * "Publish every waiting review, today."
 *
 * The review system was live but every review sat in the admin queue until
 * somebody clicked Approve once per row — so the public site showed no stars.
 * This covers the bulk action end-to-end against the REAL admin route (PHP-WASM,
 * throwaway SQLite) plus the wording promises that ride on the price cards.
 *
 * What must stay true:
 *  1. One request publishes every PENDING review whose order is still paid and
 *     delivered.
 *  2. A review whose order was refunded is SKIPPED, never published, and the
 *     reason comes back to the panel.
 *  3. Publishing stamps published_at and the public list shows the review.
 *  4. The action is admin-only and rate-limited.
 *  5. Every price-card promise matches the shipped code (chat window days,
 *     refund percent) — a promise the site cannot keep is a lie.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASTRO_CHAT_WINDOW_DAYS,
  CHAT_INCLUDED_LINE,
  PRE_APPROVAL_REFUND_PERCENT,
  SERVICE_PROMISES,
  priceCardPromises
} from '../src/services/servicePromise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- REVIEWS: PUBLISH ALL WAITING ---');

// ---------------------------------------------------------------------------
// 1. The promises are facts about the shipped code, not marketing.
// ---------------------------------------------------------------------------
await check('the advertised chat window matches the server entitlement', () => {
  const php = read('api/ai_astrologer.php');
  const match = /define\('ASTRO_AI_CHAT_WINDOW_DAYS',\s*(\d+)\)/.exec(php);
  assert.ok(match, 'api/ai_astrologer.php must still define ASTRO_AI_CHAT_WINDOW_DAYS');
  assert.equal(
    ASTRO_CHAT_WINDOW_DAYS,
    Number(match![1]),
    'the price card promises a window the server does not honour'
  );
  assert.match(CHAT_INCLUDED_LINE, new RegExp(`${ASTRO_CHAT_WINDOW_DAYS} days`));
});

await check('the advertised refund percentage matches the refund engine', () => {
  const php = read('api/refunds.php');
  const match = /define\('ASTRO_REFUND_PERCENT_PRE_APPROVAL',\s*([\d.]+)\)/.exec(php);
  assert.ok(match, 'api/refunds.php must still define the pre-approval refund percent');
  assert.equal(PRE_APPROVAL_REFUND_PERCENT, Number(match![1]));
});

await check('every promise is a capability the site really has', () => {
  const ids = SERVICE_PROMISES.map(promise => promise.id).sort();
  assert.deepEqual(ids, ['chat', 'delivery', 'refund', 'reviewed']);
  // No promise may claim something no code path implements.
  const text = SERVICE_PROMISES.map(promise => `${promise.label} ${promise.detail}`).join(' ').toLowerCase();
  for (const forbidden of ['24/7', 'lifetime', 'instant', 'guaranteed results', '100% accurate', 'no questions asked']) {
    assert.ok(!text.includes(forbidden), `the promise text must not claim "${forbidden}"`);
  }
  // A price card shows three, and always includes the chat.
  const card = priceCardPromises();
  assert.equal(card.length, 3);
  assert.ok(card.some(promise => promise.id === 'chat'), 'the chat must be on the price card');
});

await check('the chat is advertised on the home page, services, checkout and every service page', () => {
  assert.match(read('src/pages/HomePage.tsx'), /CHAT_INCLUDED_LINE/, 'home page');
  assert.match(read('src/pages/ServicesPage.tsx'), /CHAT_INCLUDED_LINE/, 'services price cards');
  assert.match(read('src/pages/ServicesPage.tsx'), /ServicePromiseStrip/, 'services cards carry the promises');
  assert.match(read('src/components/cart/SingleServiceCheckoutModal.tsx'), /CHAT_INCLUDED_LINE/, 'checkout');
  assert.match(read('src/components/cart/SingleServiceCheckoutModal.tsx'), /ServicePromiseStrip/);
  assert.match(read('src/components/common/ServicePageHeader.tsx'), /showChatBenefit/);
  for (const page of ['BirthJathagamPage', 'MarriageCompatibilityPage', 'BabyNamingPage', 'MuhurthamPage']) {
    assert.match(read(`src/pages/${page}.tsx`), /showChatBenefit/, `${page} must advertise the chat`);
  }
  // Contact sells nothing: it must not claim a chat benefit.
  assert.doesNotMatch(read('src/pages/ContactPage.tsx'), /showChatBenefit/);
});

// ---------------------------------------------------------------------------
// 2. The bulk route exists, is guarded, and reuses the single-review rule.
// ---------------------------------------------------------------------------
await check('the bulk route is wired, rate-limited and shared with single approval', () => {
  const admin = read('api/admin/index.php');
  assert.match(admin, /astro_reviews_route_admin_approve_all\(\$pdo, \$admin\)/);
  assert.match(admin, /astro_admin_action_limit\(\$pdo, \$admin, 'review-bulk'\)/);
  assert.match(admin, /'review-bulk' => array\(\d+, \d+,/);

  const reviews = read('api/reviews.php');
  assert.match(reviews, /function astro_review_publish_one\(/, 'one definition of "may be published"');
  assert.equal(
    (reviews.match(/function astro_review_publish_one\(/g) || []).length,
    1,
    'one definition of the publish rule'
  );
  assert.equal(
    (reviews.match(/astro_review_publish_one\(\$pdo/g) || []).length,
    2,
    'both the single-review and the bulk route must go through it'
  );
  assert.match(reviews, /LIMIT " \. \(int\) ASTRO_REVIEW_BULK_MAX/, 'the sweep is bounded');
  assert.match(reviews, /function astro_reviews_route_admin_approve_all\(/);
});

// ---------------------------------------------------------------------------
// 3. End to end on the real route.
// ---------------------------------------------------------------------------
const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the live publish-all flow did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const { createAdminApiBridge } = await import('../scripts/php-admin-api-bridge.mjs');
  const bridge = await createAdminApiBridge();

  const json = (res: any) => JSON.parse(String(res.text));

  /** A paid, delivered order plus a refunded one, and one pending review each. */
  async function seed() {
    await bridge.reset();
    await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("DELETE FROM customer_reviews");
$pdo->exec("DELETE FROM orders");
$insert = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, language, amount, currency,
    service_mode, status, payment_method, payment_status, payment_confirmed, email_status, input_payload, refund_status)
    VALUES (?, ?, 'usr_test_customer', ?, ?, 'BIRTH_JATHAGAM', 'en', ?, 'INR', ?, ?, 'GPAY', ?, ?, 'SENT', '{}', ?)");
$insert->execute(['ord_good', 'AS-1001', 'Meena R', 'meena@example.test', 1512, 'PAID', 'COMPLETED', 'CAPTURED', 1, 'NONE']);
$insert->execute(['ord_refunded', 'AS-1002', 'Karthik S', 'karthik@example.test', 1512, 'PAID', 'REFUNDED', 'CAPTURED', 1, 'REFUNDED']);
$review = $pdo->prepare("INSERT INTO customer_reviews (id, order_id, user_id, service_code, rating, title, body, display_name, location, status, created_at)
    VALUES (?, ?, 'usr_test_customer', 'BIRTH_JATHAGAM', ?, 'Honest title', ?, ?, 'Chennai', 'PENDING', '2026-10-01 09:00:00')");
$review->execute(['rev_good', 'ord_good', 5, 'The dasha timeline matched what actually happened this year, and the Tamil page was easy to read for my mother.', 'Meena R']);
$review->execute(['rev_refunded', 'ord_refunded', 4, 'I cancelled before approval and received the refund, so this text should never be published anywhere on the site.', 'Karthik S']);
echo json_encode(['ok' => true]);
`);

    return bridge;
  }

  await check('one request publishes the waiting review and skips the refunded one', async () => {
    await seed();
    const res = await bridge.request({ method: 'POST', url: '/api/admin/reviews/approve-all', json: {} });
    assert.equal(res.status, 200, `HTTP ${res.status}: ${String(res.text).slice(0, 300)}`);
    const body = json(res);
    assert.equal(body.success, true, body.message);
    assert.equal(body.published, 1, 'exactly the eligible review goes live');
    assert.equal(body.skipped.length, 1, 'the refunded order is reported, not published');
    assert.equal(body.skipped[0].code, 'ORDER_REFUNDED');
    assert.match(body.skipped[0].reason, /Refunded orders cannot be reviewed/i);
    assert.equal(body.counts.PENDING, 1, 'the skipped one stays waiting for a human decision');
    assert.equal(body.counts.APPROVED, 1);
  });

  await check('the published review is live on the public list, with a publication date', async () => {
    const res = await bridge.request({ method: 'GET', url: '/api/services/reviews', auth: false });
    assert.equal(res.status, 200);
    const body = json(res);
    const ids = (body.reviews || []).map((review: any) => review.id);
    assert.ok(ids.includes('rev_good'), `published review missing from ${ids.join(', ')}`);
    assert.ok(!ids.includes('rev_refunded'), 'a refunded order must never reach the public list');
    const published = (body.reviews || []).find((review: any) => review.id === 'rev_good');
    assert.ok(published.publishedAt, 'the public card shows a publication date');
    assert.equal(published.rating, 5);
    assert.equal(published.displayName, 'Meena R');
  });

  await check('running it again is harmless and says so', async () => {
    const body = json(await bridge.request({ method: 'POST', url: '/api/admin/reviews/approve-all', json: {} }));
    assert.equal(body.success, true, 'the second run must not fail');
    assert.equal(body.published, 0, 'an already-published review is not re-published');
    assert.match(body.message, /No review could be published|skipped/);
  });

  await check('only an admin can publish in bulk', async () => {
    const res = await bridge.request({ method: 'POST', url: '/api/admin/reviews/approve-all', json: {}, auth: false });
    assert.notEqual(res.status, 200, 'an anonymous request must be refused');
    assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`);
  });

  await check('the admin listing shows the new counts to the panel', async () => {
    const body = json(await bridge.request({ method: 'GET', url: '/api/admin/reviews?status=ALL' }));
    assert.equal(body.success, true);
    assert.equal(body.counts.APPROVED, 1);
    assert.equal(body.counts.PENDING, 1);
    assert.equal(body.counts.ALL, 2);
  });

  await bridge.close();
}

await check('the admin panel offers the one-click publish and reports what was skipped', () => {
  const panel = read('src/components/admin/CustomerReviewsPanel.tsx');
  assert.match(panel, /data-testid="reviews-publish-all"/, 'the button is addressable');
  assert.match(panel, /Publish all \$\{counts\.PENDING\} waiting/, 'it states how many are waiting');
  assert.match(panel, /api\.approveAllPendingReviews\(\)/);
  assert.match(panel, /data-testid="reviews-bulk-result"/, 'the outcome is shown in the panel');
  assert.match(panel, /item\.reason/, 'a skipped review explains why');
  assert.match(panel, /setFilter\('APPROVED'\)/, 'the panel jumps to what just went live');
  assert.match(read('src/services/api.ts'), /admin\/reviews\/approve-all/);
});

console.log(`\nReviews publish-all contract passed (${passed} checks).`);
