/**
 * ASTRO SIVAM — checkout idempotency contract (static verification).
 *
 * WHY THIS EXISTS: the money paths are the only place where a duplicate request
 * costs a customer real money. Three checkout endpoints can bind ONE captured
 * payment intent to order rows, and all three must follow the same order of
 * operations:
 *
 *   1. replay a CONSUMED intent instead of answering "payment not completed"
 *      (the customer already paid — they must see their order),
 *   2. CLAIM the intent in the payment idempotency ledger BEFORE the first
 *      INSERT INTO orders, so a double click / retry / parallel request can
 *      only ever produce one set of order rows,
 *   3. answer a claimed duplicate with HTTP 200 + duplicate:true (the existing
 *      order), and a claim in flight with HTTP 409 intent_binding_in_progress,
 *   4. release the claim as FAILED on every path that did not create an order.
 *
 * The PHP runtime suite cannot reach these paths (they need a live MySQL), so
 * this test pins the source-level ordering. It is deliberately strict: moving a
 * claim below the inserts, or dropping the replay, fails the suite.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** The slice of a PHP file between two marker comments. */
function region(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end !== -1, `end marker not found: ${endMarker}`);
  return source.slice(start, end);
}

const services = read('api/services/index.php');
const multiPerson = read('api/services/multi_person_order.php');
const payments = read('api/payments.php');
const webhook = read('api/payment_webhook.php');
const apiClient = read('src/services/api.ts');

const familyBatch = region(services, '// 5c. POST /api/services/multi-order', '// 5b. POST /api/services/order');
const singleOrder = region(services, '// 5b. POST /api/services/order', '// 6. GET /api/services/my-orders');

console.log('--- CHECKOUT IDEMPOTENCY CONTRACT ---');

check('family batch: a CONSUMED intent replays the existing order before anything else', () => {
  const replay = familyBatch.indexOf("astro_replay_consumed_intent($pdo, $capturedIntent, 'multi-order'");
  assert.ok(replay !== -1, 'the family batch path must replay a consumed intent');
  const claim = familyBatch.indexOf('astro_claim_intent_binding');
  assert.ok(claim !== -1, 'the family batch path must claim the intent binding');
  assert.ok(replay < claim, 'the consumed-intent replay must run before the binding claim');
});

check('family batch: the binding claim precedes the first order INSERT', () => {
  const claim = familyBatch.indexOf('astro_claim_intent_binding');
  const insert = familyBatch.indexOf('INSERT INTO orders');
  assert.ok(claim !== -1 && insert !== -1);
  assert.ok(claim < insert, 'the intent must be claimed before any order row is written');
});

check('family batch: duplicates replay with 200 and in-flight claims answer 409', () => {
  assert.match(familyBatch, /'duplicateReason'\s*=>\s*'intent_already_bound'/);
  assert.match(familyBatch, /'duplicateReason'\s*=>\s*'intent_binding_in_progress'/);
  const inProgress = familyBatch.slice(familyBatch.indexOf('intent_binding_in_progress'));
  assert.match(inProgress, /\],\s*409\)/, 'an in-flight binding must answer HTTP 409');
});

check('single order: the binding claim precedes the first order INSERT', () => {
  const claim = singleOrder.indexOf('astro_claim_intent_binding');
  const insert = singleOrder.indexOf('INSERT INTO orders');
  assert.ok(claim !== -1 && insert !== -1);
  assert.ok(claim < insert, 'the intent must be claimed before the order row is written');
});

check('single order: duplicates and consumed intents return the existing order', () => {
  assert.ok(singleOrder.indexOf("astro_replay_consumed_intent($pdo, $capturedIntent, 'single-order'") !== -1);
  assert.match(singleOrder, /'duplicateReason'\s*=>\s*'intent_already_bound'/);
  assert.match(singleOrder, /'duplicateReason'\s*=>\s*'intent_binding_in_progress'/);
});

check('multi-person checkout: the binding claim precedes the order INSERT', () => {
  const claim = multiPerson.indexOf('astro_claim_intent_binding');
  const insert = multiPerson.indexOf('INSERT INTO orders');
  assert.ok(claim !== -1, 'the multi-person path must claim the intent binding');
  assert.ok(insert !== -1);
  assert.ok(claim < insert, 'the intent must be claimed before the header row is written');
});

check('multi-person checkout: a CONSUMED intent replays instead of erroring', () => {
  const replay = multiPerson.indexOf('astro_replay_consumed_intent');
  const notCompleted = multiPerson.indexOf('Payment has not been completed');
  assert.ok(replay !== -1, 'a paid, already-consumed intent must replay the order');
  assert.ok(notCompleted !== -1);
  assert.ok(replay < notCompleted, 'the replay must run before the "not completed" rejection');
  assert.match(multiPerson, /'duplicateReason'\s*=>\s*'intent_already_bound'/);
  assert.match(multiPerson, /'duplicateReason'\s*=>\s*'intent_binding_in_progress'/);
});

check('multi-person checkout: the claim is optional for the non-checkout entry points', () => {
  // api/admin/order_items.php and api/ai_astrologer.php also require this file
  // and do not load the checkout helpers, so the claim must stay guarded.
  assert.match(multiPerson, /if \(\$capturedIntent && function_exists\('astro_claim_intent_binding'\)\)/);
  assert.match(multiPerson, /function_exists\('astro_payment_finish_idempotency'\)/);
});

check('multi-person checkout: a failed attempt releases the claim for retry', () => {
  const failures = multiPerson.match(/astro_payment_finish_idempotency\([^)]*'FAILED'/g) || [];
  assert.ok(failures.length >= 2, 'every non-creating exit path must mark the claim FAILED');
  assert.match(multiPerson, /astro_payment_finish_idempotency\(\$pdo, \$bindKey, 'PROCESSED'/);
});

check('every webhook capture goes through the idempotency ledger wrapper', () => {
  assert.ok(webhook.indexOf('astro_payment_webhook_capture($pdo') !== -1, 'the webhook must use the ledger wrapper');
  assert.doesNotMatch(webhook, /astro_payment_capture_intent\(/, 'the webhook must never capture directly');
});

check('the ledger wrapper claims the key before capturing, inside one retried transaction', () => {
  const wrapper = region(payments, 'function astro_payment_webhook_capture', 'function astro_payment_idempotency_stats');
  const claim = wrapper.indexOf('astro_payment_claim_idempotency');
  const capture = wrapper.indexOf('astro_payment_capture_intent');
  const retry = wrapper.indexOf('astro_payment_db_retry');
  const transaction = wrapper.indexOf('beginTransaction');
  assert.ok(claim !== -1 && capture !== -1, 'the wrapper must claim and then capture');
  assert.ok(claim < capture, 'the key must be stored before the capture commits');
  assert.ok(retry !== -1 && retry < claim, 'the claim + capture unit must run inside the retry helper');
  assert.ok(transaction !== -1 && transaction < claim, 'the claim must be taken inside the transaction');
});

check('the ledger table ships in the schema and in a migration', () => {
  const schema = read('api/schema.sql');
  const table = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS `payment_idempotency_keys`'));
  assert.match(table.slice(0, 400), /`idempotency_key` CHAR\(64\) NOT NULL PRIMARY KEY/);
  assert.match(read('api/migrations/008_payment_idempotency.sql'), /payment_idempotency_keys/);
  assert.match(payments, /CREATE TABLE IF NOT EXISTS payment_idempotency_keys/);
});

check('the browser client understands replayed answers', () => {
  assert.match(apiClient, /duplicate\?: boolean/, 'placeOrder must declare the duplicate flag');
  assert.match(apiClient, /duplicateReason\?:/, 'the duplicate reason must be part of the typed contract');
});

console.log(`\nCheckout idempotency contract passed (${passed} checks).\n`);
