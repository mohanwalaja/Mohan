import { readRepoSource } from './helpers/module-sources.js';
/**
 * ASTRO SIVAM — Refund & Cancellation Policy contract (static verification).
 *
 * WHY THIS EXISTS: the refund policy is money that leaves the business, and it
 * is quoted to customers in writing. Three places must agree at all times:
 *
 *   1. api/refunds.php           — the numbers and the working-day arithmetic
 *   2. api/admin/index.php       — the ONE-CLICK handler that spends the money
 *   3. src/pages/PoliciesPage.tsx — the page the customer reads
 *
 * plus the admin portal button (only shown while the policy allows a refund)
 * and the API client (which must never send an amount the admin could mistype).
 *
 * The PHP runtime suite cannot reach the refund path (it needs a live MySQL and
 * an AstroMailer), so this test pins the source-level contract. It is
 * deliberately strict:
 *
 *   • 90% pre-approval / 100%-refusal after approval — changing a constant in
 *     one file without the others fails here,
 *   • 3 working days (weekends and holidays skipped) — a "simplification" to
 *     plain +3 days would silently promise customers the wrong date,
 *   • no client-supplied amount anywhere — the amount must stay server-computed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** The slice of a file/text between two markers. */
function region(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end !== -1, `end marker not found: ${endMarker}`);
  return source.slice(start, end);
}

const refunds = read('api/refunds.php');
const adminApi = read('api/admin/index.php');
const adminOrdersApi = read('api/admin/orders.php');
const customerApi = read('api/services/index.php');
const schema = read('api/schema.sql');
const migration = read('api/migrations/009_refund_workflow.sql');
const dbPhp = read('api/db.php');
const policyPage = read('src/pages/PoliciesPage.tsx');
const portal = read('src/pages/AdminPortal.tsx');
const apiClient = read('src/services/api.ts');
const types = read('src/types/index.ts');
const checklist = read('src/components/admin/SetupChecklistPanel.tsx');
const runTests = read('scripts/run-tests.mjs');
const paymentsPhp = read('api/payments.php');
const gatewayMigration = read('api/migrations/010_refund_gateway_settlement.sql');

console.log('--- REFUND POLICY CONTRACT ---');

check('policy engine: 90% pre-approval refund and a 3-working-day settlement', () => {
  assert.match(refunds, /define\('ASTRO_REFUND_PERCENT_PRE_APPROVAL',\s*90\.0\)/, 'the pre-approval percentage must be 90');
  assert.match(refunds, /define\('ASTRO_REFUND_WORKING_DAYS',\s*3\)/, 'the settlement window must be 3 working days');
  assert.match(refunds, /astro_refund_retained_percent/, 'the retained (non-refundable) share must be derived, not typed twice');
});

check('policy engine: every approved/delivered status blocks a refund', () => {
  const statuses = region(refunds, 'function astro_refund_delivered_statuses()', '}');
  for (const status of ['APPROVED', 'GENERATED', 'PROCESSING', 'COMPLETED']) {
    assert.ok(statuses.includes(`'${status}'`), `${status} must count as delivered (approved) and block the refund`);
  }
  assert.match(refunds, /function astro_refund_percent_for_order[\s\S]{0,220}return 0\.0;/, 'a delivered order must refund 0%');
  assert.match(refunds, /function astro_refund_amount_for_order/, 'the refundable amount must be computed server-side');
});

check('policy engine: working days skip weekends and listed holidays', () => {
  const deadline = region(refunds, 'function astro_refund_is_working_day', 'function astro_refund_settle_deadline_sql');
  assert.match(deadline, /format\('N'\)/, 'the weekday must be read from the date');
  assert.match(deadline, /if \(\$dow > 5\)\s*\{\s*return false;/, 'Saturday/Sunday must not count as working days');
  assert.match(deadline, /astro_refund_holiday_map/, 'listed public holidays must not count as working days');
  assert.match(refunds, /function astro_refund_settle_deadline\(/, 'the deadline must be computed, not stored as a raw +3 days');
});

check('one-click handler: exists on the admin route and refuses a delivered order', () => {
  const handler = region(adminApi, '// 3d. POST /api/admin/orders/:id/process-refund', '// ===================================================================\n// FAMILY ORDER GROUP MANAGEMENT');
  assert.match(handler, /preg_match\('\/admin\\\/orders\\\/\(\[\^\\\/\]\+\)\\\/process-refund\/', \$path, \$matches\) && \$method === 'POST'/, 'the route must stay an admin POST route');
  assert.match(handler, /require_once __DIR__ \. '\/\.\.\/refunds\.php';/, 'the handler must use the shared policy engine');
  assert.match(handler, /astro_refund_status_is_delivered\(\$target\['status'\] \?\? ''\)/, 'the policy must be enforced on the real order status');
  assert.match(handler, /REFUND_AFTER_APPROVAL_BLOCKED/, 'an approved order must be refused with an explicit code');
  assert.match(handler, /409/, 'the refusal must be a conflict, not a silent success');
});

check('one-click handler: no client-supplied amount can reach the money path', () => {
  const handler = region(adminApi, '// 3d. POST /api/admin/orders/:id/process-refund', '// ===================================================================\n// FAMILY ORDER GROUP MANAGEMENT');
  assert.doesNotMatch(handler, /\$body\['amount'\]/, 'the request body must never carry the refund amount');
  assert.doesNotMatch(handler, /\$body\['percent'\]/, 'the request body must never carry the refund percentage');
  assert.match(handler, /astro_refund_amount_for_order\(\$target\)/, 'the amount must be computed per order by the policy engine');
  assert.match(handler, /ASTRO_REFUND_PERCENT_PRE_APPROVAL/, 'the percentage must come from the policy engine');
});

check('one-click handler: records the trail, the deadline and the audit entry', () => {
  const handler = region(adminApi, '// 3d. POST /api/admin/orders/:id/process-refund', '// ===================================================================\n// FAMILY ORDER GROUP MANAGEMENT');
  for (const column of ['refund_percent', 'refund_amount', 'refund_currency', 'refund_processed_at', 'refund_deadline']) {
    assert.ok(handler.includes(column), `the refund trail must persist ${column}`);
  }
  assert.match(handler, /status = 'REFUNDED', refund_status = 'REFUNDED'/, 'the order must become REFUNDED');
  assert.match(handler, /'ORDER_REFUNDED'/, 'the refund must be audit-logged');
  assert.match(handler, /astro_refund_settle_deadline_sql\(\)/, 'the settlement deadline must be the working-days deadline');
  assert.match(handler, /alreadyRefunded/, 'a second click must be idempotent, never a second refund');
  assert.match(handler, /astro_refund_customer_email_html/, 'the customer must be told the amount and the settlement date');
  assert.match(handler, /refundGroup/, 'a family bundle must be refundable as one click');
});

check('a paid order cannot be cancelled without the refund (single, bundle and customer paths)', () => {
  const adminCancel = region(adminApi, '// 3b. POST /api/admin/orders/:id/cancel', '// 3c. DELETE /api/admin/orders/:id');
  assert.match(adminCancel, /PAID_ORDER_REQUIRES_REFUND/, 'the admin single-order cancel must refuse a paid order');
  assert.match(adminCancel, /one-click Refund 90% button/, 'the refusal must point the admin at the refund button');
  const familyCancel = region(adminApi, '// 3g. POST /api/admin/family-orders/:groupId/cancel', '// 3h.');
  assert.match(familyCancel, /PAID_ORDER_REQUIRES_REFUND/, 'the family cancel must refuse a paid bundle too');
  const customerCancel = region(customerApi, '// 5a. POST /api/services/orders/:id/cancel', '// 5b-1.');
  assert.match(customerCancel, /PAID_ORDER_REQUIRES_REFUND/, 'a customer self-cancel of a paid order must be refused');
  assert.match(customerCancel, /astro_refund_is_already_refunded/, 'the guard must let an already-refunded order answer normally');
  const portalCancel = region(portal, 'const handleCancelOrder = async', 'const handleBanOrderIp');
  assert.ok(portalCancel.length > 0, 'the portal cancel handler must still exist');
  assert.match(portal, /isPending && !canOneClickRefund\(order\)/, 'the pending Cancel button must hide once the refund action applies');
  assert.match(portal, /isPending && !canOneClickRefundGroup\(unit\.orders\)/, 'the family Cancel button must hide once the bundle refund action applies');
});

check('read models: the refund trail reaches the admin portal and the customer dashboard', () => {
  for (const [file, source] of [['admin list', adminApi], ['grouped admin list', adminOrdersApi]] as Array<[string, string]>) {
    assert.ok(source.includes("'refundAmount'"), `${file} must expose refundAmount`);
    assert.ok(source.includes("'refundDeadline'"), `${file} must expose refundDeadline`);
  }
  assert.ok(customerApi.includes("'refundAmount'"), 'the customer dashboard must see what was refunded');
  assert.ok(customerApi.includes("'refundDeadline'"), 'the customer dashboard must see the settlement date');
  for (const [file, source] of [['admin list', adminApi], ['grouped admin list', adminOrdersApi], ['customer read model', customerApi]] as Array<[string, string]>) {
    assert.ok(source.includes("'refundMethod'"), `${file} must expose how the money was returned`);
    assert.ok(source.includes("'refundReference'"), `${file} must expose the provider refund reference`);
  }
});

check('schema: REFUNDED is a legal order status and the extra trail columns exist', () => {
  assert.match(schema, /`status` ENUM\([^)]*'REFUNDED'[^)]*\)/, 'api/schema.sql must accept the REFUNDED status');
  for (const column of ['refund_percent', 'refund_amount', 'refund_currency', 'refund_processed_at', 'refund_deadline', 'refund_admin_notes']) {
    assert.ok(schema.includes(`\`${column}\``), `api/schema.sql must declare ${column}`);
    assert.ok(migration.includes(`\`${column}\``), `migration 009 must add ${column}`);
  }
  assert.match(migration, /MODIFY COLUMN `status` ENUM\([\s\S]*'REFUNDED'[\s\S]*\) NOT NULL DEFAULT 'PENDING'/, 'the migration must widen the status enum');
  assert.match(dbPhp, /function astro_ensure_refund_schema/, 'runtime self-migration must exist for un-migrated installs');
  assert.match(dbPhp, /astro_ensure_refund_schema\(\$pdo\);/, 'the runtime self-migration must actually run on connect');
});

check('customer page: 90% before approval, non-refundable after, 3 working days', () => {
  const section = region(policyPage, "{type === 'refund' && (", '      </div>\n\n    </div>\n  );\n};');
  assert.match(section, /90%\s*refund/i, 'the page must quote the 90% pre-approval refund');
  assert.match(section, /3 working days/i, 'the page must state the 3-working-day settlement');
  assert.match(section, /non-refundable/i, 'the page must state the post-approval position');
  assert.match(section, /Before Admin Approval/i, 'the page must frame the pre-approval window');
  assert.match(section, /After Admin Approval/i, 'the page must frame the post-approval window');
  assert.match(section, /admin@astrosivam\.com/, 'the customer must be told how to request a refund');
  assert.match(policyPage, /cancel and receive a 90% refund in 3 working days/i, 'the SEO description must match the policy');
});

check('admin portal: one click, server-computed amount, hidden once the policy blocks it', () => {
  assert.match(portal, /const handleProcessRefund = async \(order: Order, refundWholeGroup = false\)/, 'the refund handler must take the order, not a typed amount');
  assert.match(portal, /startProcessing\(`refund-\$\{orderId\}`\)/, 'the refund must show the button-level progress state');
  const handler = region(portal, 'const handleProcessRefund = async', 'const handleUpdateSettingsGeneric');
  assert.doesNotMatch(handler, /window\.confirm/, 'one click means one click: no confirm dialog on the refund path');
  assert.match(portal, /const refundBlockedByPolicy = /, 'the portal must model the policy before rendering the button');
  assert.match(portal, /REFUND_DELIVERED_STATUSES = \['APPROVED', 'GENERATED', 'PROCESSING', 'COMPLETED'\]/, 'the portal must mirror the delivered statuses');
  assert.match(portal, /const canOneClickRefund = /, 'a single order refund button must be policy-gated');
  assert.match(portal, /const canOneClickRefundGroup = /, 'a family bundle refund button must be policy-gated');
  assert.match(portal, /preApprovalRefundAmount/, 'the button label must show the 90% figure');
  assert.ok(portal.includes('ONE-CLICK 90% REFUND'), 'the mobile and desktop action rows must render the refund button');
  assert.equal(
    (portal.match(/handleProcessRefund\(/g) || []).length,
    4,
    'both mobile cards (family bundle + single order) and both desktop rows must call the handler'
  );
  assert.match(portal, /REFUNDED/, 'a refunded order must be visibly distinguishable in the order list');
});

check('api client: sends only the order id (+ bundle flag), never an amount', () => {
  const method = region(apiClient, 'async processRefund(', 'async getAdminFinancialReport');
  assert.match(method, /process-refund/, 'the client must call the process-refund route');
  assert.match(method, /refundGroup: options\.refundGroup === true/, 'the bundle flag is what one click sends');
  assert.doesNotMatch(method, /amount/i, 'the client must never send an amount');
  assert.match(types, /export interface RefundResult/, 'the server answer must be typed');
  for (const field of ['refundAmount', 'refundPercent', 'refundDeadline']) {
    assert.ok(types.includes(field), `Order must type ${field}`);
  }
});

check('admin checklist copy matches the enforced policy (no stale 48-hour/100% claims)', () => {
  assert.match(checklist, /Pre-Approval 90% Refund Engine/, 'the checklist item must be renamed to the enforced policy');
  assert.match(checklist, /3 Working Days/, 'the checklist must state the 3-working-day SLA');
  assert.doesNotMatch(checklist, /48-Hour Refund Engine/, 'the stale 48-hour claim must be gone');
  assert.doesNotMatch(checklist, /100% Refundable/, 'the stale full-refund claim must be gone');
});

check('the contract is wired into the test runner', () => {
  assert.match(runTests, /tests\/refund-policy-contract\.test\.ts/, 'scripts/run-tests.mjs must execute this contract');
});

check('automatic refund: the provider is called BEFORE any order is marked refunded', () => {
  const handler = region(adminApi, '// 3d. POST /api/admin/orders/:id/process-refund', '// ===================================================================\n// FAMILY ORDER GROUP MANAGEMENT');
  const providerCall = handler.indexOf('astro_payment_refund_intent(');
  const markRefunded = handler.indexOf("status = 'REFUNDED', refund_status = 'REFUNDED'");
  assert.ok(providerCall !== -1, 'the one-click handler must call the provider refund API');
  assert.ok(markRefunded !== -1, 'the one-click handler must still mark the orders refunded');
  assert.ok(providerCall < markRefunded, 'the money must be moved before the bookkeeping claims it was');
  assert.match(handler, /astro_payment_intent_for_order\(\$pdo, \$target\)/, 'the handler must resolve the captured payment intent per payable order');
  assert.match(handler, /AUTO_REFUND_FAILED/, 'a provider refusal must be a distinct, reportable outcome');
  assert.match(handler, /502/, 'a provider refusal must answer 502 so the portal shows a retryable error');
  const refusal = region(handler, "code' => 'AUTO_REFUND_FAILED'", '} elseif (count($onlineIntents) > 1)');
  assert.doesNotMatch(refusal, /UPDATE orders SET/, 'a refused automatic refund must not mark anything refunded');
});

check('automatic refund: both provider endpoints, with an idempotent request id', () => {
  assert.match(refunds, /api\.razorpay\.com\/v1\/payments\/.{0,40}\/refund/, 'Razorpay refunds must go to the payments refund endpoint');
  assert.match(refunds, /\/v2\/payments\/captures\/.{0,40}\/refund/, 'PayPal refunds must go to the captures refund endpoint');
  assert.match(refunds, /astro_refund_minor_units/, 'Razorpay amounts must be converted to minor units');
  assert.match(refunds, /PayPal-Request-Id:/, 'PayPal refunds must carry an idempotency request id');
  assert.match(refunds, /'receipt' => \$requestId/, 'Razorpay refunds must carry a deterministic receipt');
  assert.match(refunds, /function astro_refund_intent_is_refundable/, 'the policy module must decide what can be auto-refunded');
  assert.match(paymentsPhp, /function astro_payment_refund_intent/, 'the provider call must live in the payment module');
  assert.match(paymentsPhp, /function astro_payment_intent_for_order/, 'the capture must be resolvable from an order');
});

check('automatic refund: offline payments are recorded as MANUAL and labelled as such', () => {
  const handler = region(adminApi, '// 3d. POST /api/admin/orders/:id/process-refund', '// ===================================================================\n// FAMILY ORDER GROUP MANAGEMENT');
  assert.match(handler, /\$settlementMode = 'MANUAL'/, 'offline payments must fall back to a manual settlement');
  assert.match(handler, /must be settled manually/, 'the manual path must say the administrator has to settle it');
  assert.match(handler, /'settlement' => \$settlementMode/, 'the response must state which settlement path was used');
  assert.match(handler, /'gatewayReference' => \$gatewayReference/, 'the response must carry the provider refund reference');
  assert.match(handler, /refund_reference/, 'a previously issued gateway refund must never be issued twice');
  assert.match(handler, /MULTIPLE_PAYMENTS_REQUIRE_MANUAL_REFUND/, 'two captured payments must never be split by guesswork');
});

check('schema: the gateway settlement trail is declared, migrated and self-migrated', () => {
  for (const column of ['refund_method', 'refund_reference']) {
    assert.ok(schema.includes(`\`${column}\``), `api/schema.sql must declare ${column}`);
    assert.ok(gatewayMigration.includes(`\`${column}\``), `migration 010 must add ${column}`);
    assert.ok(dbPhp.includes(`'${column}'`), `api/db.php must self-migrate ${column}`);
  }
  assert.match(gatewayMigration, /'GATEWAY'/, 'the migration doc must explain the GATEWAY settlement');
  assert.match(gatewayMigration, /'MANUAL'/, 'the migration doc must explain the MANUAL settlement');
});

check('portal and customer see how the money travelled', () => {
  assert.ok(types.includes('settlement?: \'GATEWAY\' | \'MANUAL\' | \'FAILED\''), 'the API types must expose the settlement outcome');
  assert.match(portal, /order\.refundReference/, 'the admin portal must show the provider reference');
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /refundMethod/, 'the customer dashboard must distinguish a gateway refund from a manual one');
  assert.match(dashboard, /order\.refundReference/, 'the customer must be able to see the provider reference');
});

// Owner request (2026-10-21): the refund wording belongs on PENDING orders only.
// A completed order can no longer be refunded, so quoting the 90% pre-approval
// window there tells the customer something they cannot act on - it read as a
// warning on the one banner that should simply confirm delivery.
check('dashboard: the refund window is quoted on pending orders, never on completed ones', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  // Scan rendered JSX only: the source comment above the completed banner
  // explains WHY the wording is not there, and must not fail this check.
  const jsx = (source: string) =>
    source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

  // Limit the check to the delivery banner. The compact admin-style summary
  // also renders a completed badge, before the expandable payment details.
  const deliveryBanner = dashboard.slice(dashboard.indexOf('{/* Bottom Row: Delivery Status & Conditional Email Retry */}'));
  // The banner reads bannerCompleted (the family card reports the member that
  // most needs the customer), but it is still the completed-order banner.
  const completed = jsx(region(deliveryBanner, ') : bannerCompleted ? (', ") : order.status === 'CANCELLED' ? ("));
  assert.doesNotMatch(completed, /refund|90%|Refund & Cancellation Policy/i,
    'a completed order must not quote the refund policy at all');
  assert.match(completed, /emailed to/, 'and must still say what was emailed, and where');

  const pending = jsx(region(dashboard, 'Processing in Vedic Astrology Queue', 'Request Email Resend'));
  assert.match(pending, /90% refund/, 'the pending banner keeps the window the customer can still use');
  assert.match(pending, /before admin approval/i, 'tied to the event that closes it');
  assert.match(pending, /admin@astrosivam\.com/, 'with the address to request it from');
});

console.log(`\n${passed} refund-policy contract checks passed.`);
