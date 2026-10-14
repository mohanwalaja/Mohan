/**
 * Admin report delivery: /admin -> render -> upload -> validate -> approve -> email.
 *
 * Regression for "Preview-quality report and invoice PDF did not reach the
 * server. No email was sent; render and upload both documents before
 * approving." Every single-order delivery failed with that message because the
 * delivery routes read their JSON through config.php's getJsonBody(), which
 * silently returns [] above 1 MiB. A preview-quality report alone is ~2 MB
 * (~2.7 MB as base64), so the inline approve body (~3 MB) and every staged
 * document were dropped before the approval gate looked at them.
 *
 * 1. Static contracts (always run): every document route reads its body with
 *    the bounded document reader in api/request_body.php (a file that is
 *    deployed - config.php is preserved by both deploy paths); the client's
 *    inline limit stays below the server's document limit, which stays below
 *    post_max_size; the legacy orders.php approval can no longer complete an
 *    order without PDFs.
 * 2. Real routes under PHP-WASM (when the dev-only runtime is installed): the
 *    actual api/admin/*.php scripts run against a throwaway SQLite database and
 *    a recording mailer that never sends (scripts/php-admin-api-bridge.mjs),
 *    covering the success path, every failure path, and that both PDFs are
 *    tied to the correct order before anything is emailed.
 * 3. The real client code (deliverOrderPdfPayload + api.approveOrder) driven
 *    against those real routes, inline and staged.
 * 4. The PHP unit suite tests/admin-report-delivery.test.php under PHP 8.1
 *    (CI runs it natively via scripts/run-php-tests.sh).
 *
 * Mocks and test data only: no real e-mail, no real database, no production order.
 *   npm install --no-save @php-wasm/node @php-wasm/universal   # enables parts 2-4
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  binaryBytesOfBase64,
  buildPreviewPdfBase64,
  sha256OfBase64
} from './helpers/previewPdfFixtures';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const MiB = 1024 * 1024;
const SCREENSHOT_MESSAGE =
  'Preview-quality report and invoice PDF did not reach the server. No email was sent; render and upload both documents before approving.';

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** Source of one top-level route block in a PHP router, from its marker to the next top-level `if (`. */
function routeBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `route marker not found: ${marker}`);
  const next = source.indexOf('\nif (', start + marker.length);
  return source.slice(start, next < 0 ? undefined : next);
}

/** Drops whole-line PHP comments so assertions look at code, not at the explanations around it. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

/** Evaluates simple PHP/TS size expressions such as `64 * 1048576` or `40 * 1024 * 1024`. */
function sizeExpression(source: string, pattern: RegExp, label: string): number {
  const match = pattern.exec(source);
  assert.ok(match, `${label} not found`);
  const expression = match[1].replace(/\s+/g, '');
  assert.match(expression, /^\d+(\*\d+)*$/, `${label} must be a plain size expression`);
  return expression.split('*').reduce((total, factor) => total * Number(factor), 1);
}

function iniBytes(value: string): number {
  const match = /^(\d+)\s*([KMG]?)$/i.exec(value.trim());
  assert.ok(match, `unparseable ini size ${value}`);
  const unit = { '': 1, K: 1024, M: MiB, G: 1024 * MiB }[match[2].toUpperCase() as '' | 'K' | 'M' | 'G'];
  return Number(match[1]) * unit;
}

console.log('--- ADMIN REPORT DELIVERY: static contracts ---');

const requestBodyPhp = read('api/request_body.php');
const indexPhp = read('api/admin/index.php');
const approveOrderPhp = read('api/admin/approve_order.php');
const ordersPhp = read('api/admin/orders.php');
const familyDocsPhp = read('api/admin/family_docs.php');
const exporterTs = read('src/services/jathagamPdfExporter.ts');

const documentRoutes: Array<[string, string]> = [
  ['stage-doc (one PDF per request)', "if (preg_match('/(?:family-orders|admin\\/orders)\\/([^\\/]+)\\/stage-doc/'"],
  ['multi-person item send/resend', "if (preg_match('/admin\\/orders\\/([^\\/]+)\\/items\\/(\\d+)\\/(send|resend)/'"],
  ['multi-person send-all', "if (preg_match('/admin\\/orders\\/([^\\/]+)\\/items\\/send-all/'"],
  ['single-order approve', "if (preg_match('/admin\\/orders\\/([^\\/]+)\\/approve/'"],
  ['single-order resend-email', "if (preg_match('/admin\\/orders\\/([^\\/]+)\\/resend-email/'"],
  ['family approve', "if (preg_match('/family-orders\\/([^\\/]+)\\/approve/'"],
  ['family resend-email', "if (preg_match('/family-orders\\/([^\\/]+)\\/resend-email/'"]
];

for (const [label, marker] of documentRoutes) {
  await check(`index.php ${label} reads its body with the document reader, never getJsonBody()`, () => {
    const block = codeOnly(routeBlock(indexPhp, marker));
    assert.ok(block.includes('astro_document_json_body('), `${label} must call astro_document_json_body()`);
    assert.ok(!/getJsonBody\(\)\s*[;),]/.test(block), `${label} must not call getJsonBody() (1 MiB cap, silent [])`);
  });
}

await check('the direct endpoints (approve_order.php, orders.php, family_docs.php) use the same reader', () => {
  assert.ok(approveOrderPhp.includes("astro_document_json_body('approval')"));
  assert.ok(!approveOrderPhp.includes("file_get_contents('php://input')"), 'approve_order.php must not read php://input unbounded');
  const approveAction = routeBlock(ordersPhp, "if ($method === 'POST' && $action === 'approve') {");
  assert.ok(approveAction.includes('astro_document_json_body('));
  assert.ok(!/getJsonBody\(\)\s*[;),]/.test(approveAction) && !approveAction.includes("php://input"));
  const directEntry = familyDocsPhp.slice(familyDocsPhp.indexOf("=== 'family_docs.php') {"));
  assert.ok(directEntry.includes("astro_document_json_body('document upload')"));
  assert.ok(!/getJsonBody\(\)\s*[;),:]/.test(directEntry), 'the direct staging entry must not call getJsonBody()');
});

await check('the reader lives in api/request_body.php, which every route requires (config.php is never redeployed)', () => {
  assert.ok(!read('api/config.php').includes('astro_document_json_body'), 'the fix must not depend on the deploy-preserved config.php');
  for (const [file, source] of [
    ['api/admin/index.php', indexPhp],
    ['api/admin/approve_order.php', approveOrderPhp],
    ['api/admin/orders.php', ordersPhp],
    ['api/admin/family_docs.php', familyDocsPhp]
  ]) {
    assert.ok(source.includes("require_once __DIR__ . '/../request_body.php';"), `${file} must require api/request_body.php`);
  }
  const cpanel = read('.cpanel.yml');
  assert.ok(cpanel.includes('/bin/find api -type f') && cpanel.includes('"config.php"'), '.cpanel.yml copies api/ except the live config.php');
  assert.ok(!cpanel.includes('request_body'), '.cpanel.yml must not exclude request_body.php');
  const deployScript = read('deploy_cpanel.sh');
  assert.ok(deployScript.includes('find api -type f -print0') && !deployScript.includes('request_body'), 'deploy_cpanel.sh copies every api/ file');
});

const DOCUMENT_LIMIT = sizeExpression(requestBodyPhp, /define\('ASTRO_DOCUMENT_JSON_MAX_BYTES',\s*([^)]+)\)/, 'ASTRO_DOCUMENT_JSON_MAX_BYTES');
const ORDINARY_LIMIT = sizeExpression(requestBodyPhp, /define\('ASTRO_JSON_BODY_MAX_BYTES',\s*([^)]+)\)/, 'ASTRO_JSON_BODY_MAX_BYTES');
const MAX_DOCUMENT = sizeExpression(familyDocsPhp, /define\('ASTRO_FAMILY_DOC_MAX_BYTES',\s*([^)]+)\)/, 'ASTRO_FAMILY_DOC_MAX_BYTES');
const SINGLE_INLINE = sizeExpression(exporterTs, /export const SINGLE_ORDER_INLINE_LIMIT_BYTES = ([^;]+);/, 'SINGLE_ORDER_INLINE_LIMIT_BYTES');
const FAMILY_INLINE = sizeExpression(exporterTs, /const MAX_FAMILY_INLINE_BYTES = ([^;]+);/, 'MAX_FAMILY_INLINE_BYTES');
const ENVELOPE = 64 * 1024;
const asJsonBody = (pdfBytes: number) => Math.ceil(pdfBytes * 4 / 3) + ENVELOPE;

await check('limits line up: client inline bodies < document limit < post_max_size; one max-size PDF fits', () => {
  const postMax = iniBytes(/^\s*post_max_size\s*=\s*(\S+)/m.exec(read('api/.user.ini'))![1]);
  assert.equal(ORDINARY_LIMIT, MiB, 'ordinary JSON routes keep the 1 MiB limit');
  assert.ok(asJsonBody(SINGLE_INLINE) < DOCUMENT_LIMIT, 'a maximal inline single-order approve body must be accepted');
  assert.ok(asJsonBody(FAMILY_INLINE) < DOCUMENT_LIMIT, 'a maximal inline family body must be accepted');
  assert.ok(asJsonBody(MAX_DOCUMENT) <= DOCUMENT_LIMIT, 'one maximum-size staged PDF must be accepted');
  assert.ok(DOCUMENT_LIMIT < postMax, 'PHP must never discard a body the reader would accept');
  assert.ok(asJsonBody(2 * MiB) > ORDINARY_LIMIT, 'sanity: a ~2 MB report does not fit the ordinary 1 MiB limit (the original bug)');
});

await check('orders.php?action=approve can no longer complete a standalone order without PDFs or e-mail', () => {
  const approveAction = codeOnly(routeBlock(ordersPhp, "if ($method === 'POST' && $action === 'approve') {"));
  assert.ok(!/status = 'COMPLETED'/.test(approveAction), 'no bare COMPLETED update');
  assert.ok(!/has_pdf = 1/.test(approveAction), 'no has_pdf = 1 without a validated PDF');
  assert.ok(approveAction.includes("'requiresPreviewDelivery' => true"));
});

await check("approval only attaches a staged report recorded for the same order (no 'only one staged' fallback)", () => {
  const resolver = familyDocsPhp.slice(familyDocsPhp.indexOf('function astroSingleOrderClientDocs('));
  assert.ok(!/count\(\$stagedReports\)\s*===\s*1/.test(resolver.slice(0, 3000)));
  assert.ok(familyDocsPhp.includes('function astroFamilyDocsResolveTarget('));
  assert.ok(indexPhp.includes("astroStageFamilyDoc($pdo, $admin, $target['scope'], $body, $target['orders'])"));
});

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the real-route, client and PHP 8.1 checks did not run.');
  console.log('         npm install --no-save @php-wasm/node @php-wasm/universal');
  console.log(`\n[OK] admin report delivery: ${passed} static checks passed (runtime skipped)`);
  process.exit(0);
}

console.log('--- ADMIN REPORT DELIVERY: real routes under PHP-WASM (SQLite + recording mailer) ---');

const { createAdminApiBridge, TEST_ORDERS } = await import('../scripts/php-admin-api-bridge.mjs');
const bridge = await createAdminApiBridge();
const A = TEST_ORDERS.single;
const B = TEST_ORDERS.other;

// Browser-shaped jsPDF documents at real sizes: ~1.8 MB report, ~0.35 MB invoice.
const reportA = buildPreviewPdfBase64({ pages: 3, seed: 101 });
const invoiceA = buildPreviewPdfBase64({ pages: 1, scanBytesPerPage: 350 * 1024, seed: 102 });
const reportB = buildPreviewPdfBase64({ pages: 3, seed: 201 });
const invoiceB = buildPreviewPdfBase64({ pages: 1, scanBytesPerPage: 350 * 1024, seed: 202 });
const lowResReport = buildPreviewPdfBase64({ pages: 2, width: 1200, height: 1700, scanBytesPerPage: 200 * 1024, seed: 301 });
const inlineA = { reportPdfBase64: reportA, invoicePdfBase64: invoiceA, language: 'en', requirePreviewQuality: true };

const approve = (orderId: string, json?: unknown, extra: Record<string, unknown> = {}) =>
  bridge.request({ method: 'POST', url: `/api/admin/orders/${orderId}/approve`, json, ...extra });
const stage = (orderId: string, doc: Record<string, unknown>) =>
  bridge.request({ method: 'POST', url: `/api/admin/orders/${orderId}/stage-doc`, json: doc });

async function assertUntouched(orderId: string, why: string) {
  assert.equal(bridge.outbox().length, 0, `${why}: no e-mail may be sent`);
  const row = await bridge.order(orderId);
  assert.equal(row.status, 'PENDING', `${why}: the order must stay PENDING`);
  assert.equal(row.email_status, 'PENDING', `${why}: email_status must not change`);
  assert.equal(Number(row.has_pdf), 0, `${why}: has_pdf must not be set`);
  assert.equal(Number(row.has_invoice), 0, `${why}: has_invoice must not be set`);
}

function assertDeliveredTo(order: { email: string; orderNumber: string }, report: string, invoice: string, message = bridge.outbox().at(-1)) {
  assert.ok(message, 'an e-mail must have been handed to the mailer');
  assert.equal(message.to, order.email, 'the e-mail goes to the order\'s customer');
  assert.equal(message.attachments.length, 2, 'exactly the report and the invoice are attached');
  const [reportAttachment, invoiceAttachment] = message.attachments;
  assert.ok(reportAttachment.name.includes(order.orderNumber) && /Report/i.test(reportAttachment.name), `report attachment named for ${order.orderNumber}`);
  assert.ok(invoiceAttachment.name.includes(order.orderNumber) && /Invoice/i.test(invoiceAttachment.name), `invoice attachment named for ${order.orderNumber}`);
  assert.equal(reportAttachment.sha256, sha256OfBase64(report), 'the report attachment is byte-identical to the uploaded preview PDF');
  assert.equal(invoiceAttachment.sha256, sha256OfBase64(invoice), 'the invoice attachment is byte-identical to the uploaded preview PDF');
}

await check(`regression: the ${(JSON.stringify(inlineA).length / MiB).toFixed(1)} MiB inline approve body the admin panel sends is accepted and emailed`, async () => {
  await bridge.reset();
  assert.ok(JSON.stringify(inlineA).length > 2 * MiB, 'fixture must exceed the old 1 MiB cap');
  const res = await approve(A.id, inlineA);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.success, true);
  assert.notEqual(res.json.message, SCREENSHOT_MESSAGE);
  assert.equal(bridge.outbox().length, 1, 'exactly one e-mail');
  assertDeliveredTo(A, reportA, invoiceA);
  const row = await bridge.order(A.id);
  assert.deepEqual(
    [row.status, row.email_status, Number(row.has_pdf), Number(row.has_invoice)],
    ['COMPLETED', 'SENT', 1, 1],
    'the order is completed only after the e-mail with both PDFs was accepted'
  );
  const audit = await bridge.auditActions();
  assert.ok(audit.some((entry: any) => entry.action === 'ORDER_APPROVED' && entry.details.includes(A.orderNumber) && entry.details.includes('PREVIEW_EXACT')));
});

await check('failure: no PDFs at all -> 422 with the original message, nothing emailed or changed', async () => {
  await bridge.reset();
  const res = await approve(A.id, { requirePreviewQuality: true });
  assert.equal(res.status, 422);
  assert.equal(res.json.message, SCREENSHOT_MESSAGE);
  await assertUntouched(A.id, 'missing PDFs');
});

await check('failure: report without invoice -> 422 naming the invoice, nothing emailed', async () => {
  await bridge.reset();
  const res = await approve(A.id, { reportPdfBase64: reportA, requirePreviewQuality: true });
  assert.equal(res.status, 422);
  assert.match(res.json.message, /^Preview-quality invoice PDF did not reach the server\. No email was sent/);
  await assertUntouched(A.id, 'missing invoice');
});

await check('failure: a low-resolution report is still rejected by the quality gate', async () => {
  await bridge.reset();
  const res = await approve(A.id, { reportPdfBase64: lowResReport, invoicePdfBase64: invoiceA, requirePreviewQuality: true });
  assert.equal(res.status, 422);
  assert.match(res.json.message, /Preview-quality report PDF did not reach the server/);
  await assertUntouched(A.id, 'low-resolution report');
});

await check('failure: an oversized body is refused with an explicit 413 (never treated as "no PDFs")', async () => {
  await bridge.reset();
  const res = await approve(A.id, { requirePreviewQuality: true }, { contentLength: DOCUMENT_LIMIT + 1 });
  assert.equal(res.status, 413);
  assert.equal(res.json.bodyTooLarge, true);
  assert.match(res.json.message, /larger than the 64\.0 MB the server accepts for documents\. Nothing was staged, approved or emailed\./);
  await assertUntouched(A.id, 'oversized body');
});

await check('failure: a body discarded before PHP (post_max_size / proxy) is reported as such, not as missing PDFs', async () => {
  await bridge.reset();
  const res = await approve(A.id, undefined, { body: '', contentLength: 3 * MiB, headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 413);
  assert.equal(res.json.bodyDiscarded, true);
  assert.match(res.json.message, /never reached PHP \(post_max_size is 128M/);
  await assertUntouched(A.id, 'discarded body');
});

await check('failure: malformed JSON -> 400, nothing emailed', async () => {
  await bridge.reset();
  const res = await approve(A.id, undefined, { body: '{"reportPdfBase64": "JVBERi0', headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 400);
  await assertUntouched(A.id, 'malformed JSON');
});

await check('staged path: each >1 MiB document is staged for its order, then approval emails exactly those bytes', async () => {
  await bridge.reset();
  const staged = await stage(A.id, { kind: 'report', orderId: A.id, orderNumber: A.orderNumber, fileName: `ASTRO_SIVAM_Report_${A.orderNumber}.pdf`, pdfBase64: reportA });
  assert.equal(staged.status, 200, staged.text);
  assert.equal(staged.json.staged, true);
  assert.equal(staged.json.sizeBytes, binaryBytesOfBase64(reportA));
  const stagedInvoice = await stage(A.id, { kind: 'invoice', fileName: `ASTRO_SIVAM_Invoice_${A.orderNumber}.pdf`, pdfBase64: invoiceA });
  assert.equal(stagedInvoice.json.staged, true, stagedInvoice.text);
  const manifest = bridge.stagedManifest(`order_${A.id}`);
  assert.equal(manifest[`report__${A.id}`].orderId, A.id);
  assert.equal(manifest[`report__${A.id}`].orderNumber, A.orderNumber);

  const res = await approve(A.id, { useStagedDocs: true, stagedDocs: 2, language: 'en', requirePreviewQuality: true });
  assert.equal(res.status, 200, res.text);
  assertDeliveredTo(A, reportA, invoiceA);
  assert.equal(bridge.stagedFiles()[`order_${A.id}`], undefined, 'staged documents are removed after a successful delivery');
});

await check("association: a report labelled for order B cannot be staged under order A", async () => {
  await bridge.reset();
  const res = await stage(A.id, { kind: 'report', orderId: B.id, orderNumber: B.orderNumber, pdfBase64: reportB });
  assert.equal(res.json.success, false);
  assert.equal(res.json.orderMismatch, true);
  assert.equal(bridge.stagedFiles()[`order_${A.id}`], undefined, "nothing is written in order A's scope");
});

await check("association: order A's approval never picks up order B's staged documents; B's still deliver to B", async () => {
  await bridge.reset();
  assert.equal((await stage(B.id, { kind: 'report', orderId: B.id, orderNumber: B.orderNumber, pdfBase64: reportB })).json.staged, true);
  assert.equal((await stage(B.id, { kind: 'invoice', pdfBase64: invoiceB })).json.staged, true);
  const wrong = await approve(A.id, { useStagedDocs: true, stagedDocs: 2, requirePreviewQuality: true });
  assert.equal(wrong.status, 422);
  assert.equal(wrong.json.message, SCREENSHOT_MESSAGE);
  await assertUntouched(A.id, "approving A with B's staged documents");
  assert.deepEqual(bridge.stagedFiles()[`order_${B.id}`], ['invoice.pdf', 'manifest.json', `report__${B.id}.pdf`], "B's staged documents are untouched");

  const right = await approve(B.id, { useStagedDocs: true, stagedDocs: 2, requirePreviewQuality: true });
  assert.equal(right.status, 200, right.text);
  assertDeliveredTo(B, reportB, invoiceB);
});

await check('association: nothing can be staged for an order that does not exist', async () => {
  await bridge.reset();
  const res = await stage('ord_does_not_exist', { kind: 'invoice', pdfBase64: invoiceA });
  // 422 rather than 404: the client reads a 404 from a staging URL as "route not deployed".
  assert.equal(res.status, 422);
  assert.equal(res.json.success, false);
  assert.match(res.json.message, /^Order not found; nothing was staged\./);
  assert.deepEqual(bridge.stagedFiles(), {});
});

await check('mail failure: the order is not completed, the error is reported, staged PDFs are kept for retry', async () => {
  await bridge.reset();
  await stage(A.id, { kind: 'report', orderId: A.id, orderNumber: A.orderNumber, pdfBase64: reportA });
  await stage(A.id, { kind: 'invoice', pdfBase64: invoiceA });
  bridge.setMailMode('reject');
  const res = await approve(A.id, { useStagedDocs: true, stagedDocs: 2, requirePreviewQuality: true });
  assert.equal(res.status, 503);
  assert.equal(res.json.success, false);
  const row = await bridge.order(A.id);
  assert.equal(row.status, 'PROCESSING');
  assert.equal(row.email_status, 'FAILED');
  assert.ok(bridge.stagedFiles()[`order_${A.id}`]?.includes(`report__${A.id}.pdf`), 'staged report kept for the retry');
  assert.equal(bridge.outbox().filter((message: any) => message.accepted).length, 0, 'nothing was accepted for delivery');
});

await check('resend-email of a completed order also accepts the >1 MiB inline PDFs', async () => {
  await bridge.reset();
  assert.equal((await approve(A.id, inlineA)).status, 200);
  const res = await bridge.request({ method: 'POST', url: `/api/admin/orders/${A.id}/resend-email`, json: inlineA });
  assert.equal(res.status, 200, res.text);
  assert.equal(bridge.outbox().length, 2);
  assertDeliveredTo(A, reportA, invoiceA);
});

await check('fallback endpoint approve_order.php (no URL rewriting) accepts the same >1 MiB body', async () => {
  await bridge.reset();
  const res = await bridge.request({ method: 'POST', url: `/api/admin/approve_order.php?id=${A.id}`, json: inlineA });
  assert.equal(res.status, 200, res.text);
  assertDeliveredTo(A, reportA, invoiceA);
});

await check('fallback endpoint family_docs.php?order_id= (no URL rewriting) stages a >1 MiB document for the order', async () => {
  await bridge.reset();
  const res = await bridge.request({
    method: 'POST',
    url: `/api/admin/family_docs.php?order_id=${A.id}`,
    json: { kind: 'report', orderId: A.id, orderNumber: A.orderNumber, pdfBase64: reportA }
  });
  assert.equal(res.json.staged, true, res.text);
  assert.ok(bridge.stagedFiles()[`order_${A.id}`].includes(`report__${A.id}.pdf`));
});

await check('legacy orders.php?action=approve refuses a standalone order instead of marking it emailed', async () => {
  await bridge.reset();
  const res = await bridge.request({ method: 'POST', url: `/api/admin/orders.php?action=approve&id=${A.id}`, json: {} });
  assert.equal(res.status, 409);
  assert.equal(res.json.requiresPreviewDelivery, true);
  await assertUntouched(A.id, 'legacy approve action');
});

console.log('--- ADMIN REPORT DELIVERY: real client code -> real routes ---');

// Import before any window stub exists: html2canvas inspects `window` at load time.
const { deliverOrderPdfPayload } = await import('../src/services/jathagamPdfExporter');
const { api } = await import('../src/services/api');
type Recorded = { method: string; url: string; bytes: number };
const recorded: Recorded[] = [];
const clientErrorReports: any[] = [];
const originalFetch = globalThis.fetch;
// apiFetch() reports failed responses with window.location.origin, as in the browser.
const hadWindow = 'window' in globalThis;
if (!hadWindow) (globalThis as any).window = { location: { origin: 'https://astrosivam.test' } };
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : undefined;
  if (url.endsWith('/services/client-error')) {
    // Fire-and-forget browser telemetry (the PHP API has no handler for it).
    clientErrorReports.push(JSON.parse(body || '{}'));
    return new Response(null, { status: 204 });
  }
  recorded.push({ method, url, bytes: body ? Buffer.byteLength(body) : 0 });
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(init.headers || {})) headers[key.toLowerCase()] = String(value);
  const res = await bridge.request({ method, url, body, headers });
  return new Response(res.text, { status: res.status, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const clientOrder = (order: typeof A) => ({ id: order.id, orderNumber: order.orderNumber, status: 'PENDING', language: 'en' } as any);

try {
  await check('client inline path: deliverOrderPdfPayload + api.approveOrder succeed end to end', async () => {
    await bridge.reset();
    recorded.length = 0;
    const payload = await deliverOrderPdfPayload(clientOrder(A), { reportPdfBase64: reportA, invoicePdfBase64: invoiceA, language: 'en' });
    assert.equal(payload.reportPdfBase64, reportA, 'typical PDFs travel inline');
    const res = await api.approveOrder(A.id, payload);
    assert.equal(res.success, true, res.message);
    assert.deepEqual(recorded.map(r => `${r.method} ${r.url}`), [`POST /api/admin/orders/${A.id}/approve`]);
    assert.ok(recorded[0].bytes > 2 * MiB, 'the real client request is the >1 MiB body that used to be dropped');
    assertDeliveredTo(A, reportA, invoiceA);
  });

  await check('client staged path (>5 MB of PDFs): clear, stage each document, approve, email those bytes', async () => {
    await bridge.reset();
    recorded.length = 0;
    const bigReport = buildPreviewPdfBase64({ pages: 4, scanBytesPerPage: 1200 * 1024, seed: 401 });
    const bigInvoice = buildPreviewPdfBase64({ pages: 1, scanBytesPerPage: 700 * 1024, seed: 402 });
    assert.ok(binaryBytesOfBase64(bigReport) + binaryBytesOfBase64(bigInvoice) > SINGLE_INLINE, 'fixture must take the staging path');
    const payload = await deliverOrderPdfPayload(clientOrder(A), { reportPdfBase64: bigReport, invoicePdfBase64: bigInvoice, language: 'en' });
    assert.equal(payload.useStagedDocs, true);
    assert.equal(payload.stagedDocs, 2, 'both documents were confirmed staged by the server');
    assert.equal(payload.reportPdfBase64, undefined);
    const res = await api.approveOrder(A.id, payload);
    assert.equal(res.success, true, res.message);
    assert.deepEqual(recorded.map(r => `${r.method} ${r.url}`), [
      `DELETE /api/admin/orders/${A.id}/stage-doc`,
      `POST /api/admin/orders/${A.id}/stage-doc`,
      `POST /api/admin/orders/${A.id}/stage-doc`,
      `POST /api/admin/orders/${A.id}/approve`
    ]);
    assert.ok(recorded[1].bytes > 5 * MiB, 'the staged report request alone is far above the old 1 MiB cap');
    assertDeliveredTo(A, bigReport, bigInvoice);
  });

  await check('client failure path: an approve without documents surfaces the server message and sends nothing', async () => {
    await bridge.reset();
    clientErrorReports.length = 0;
    const res = await api.approveOrder(A.id, { requirePreviewQuality: true } as any);
    assert.equal(res.success, false);
    assert.equal(res.message, SCREENSHOT_MESSAGE, 'the 422 is returned as-is (no silent fallback to another endpoint)');
    assert.deepEqual(clientErrorReports, [{ message: 'HTTP 422 request failure', endpoint: `/api/admin/orders/${A.id}/approve`, status: 422 }]);
    await assertUntouched(A.id, 'client approve without documents');
  });
  await check('client: a host-level HTML 413 (LiteSpeed/ModSecurity) is named, not reported as "not JSON"', async () => {
    const { safeJson } = await import('../src/services/api');
    for (const page of ['<html><body><h1>413 Request Entity Too Large</h1></body></html>', 'Request Entity Too Large']) {
      const parsed: any = await safeJson(new Response(page, { status: 413, headers: { 'content-type': 'text/html' } }));
      assert.equal(parsed.success, false);
      assert.equal(parsed.status, 413);
      assert.match(parsed.message, /rejected the request as too large \(HTTP 413\)/);
      assert.match(parsed.message, /Nothing was saved or emailed/);
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  if (!hadWindow) delete (globalThis as any).window;
}

const phpErrors = bridge.phpErrors().split('\n').filter((line: string) => /PHP (Fatal|Warning|Notice|Deprecated|Parse)/.test(line));
await check('the real routes ran without PHP warnings, notices or fatals', () => {
  assert.deepEqual(phpErrors, []);
});
await bridge.close();

console.log('--- ADMIN REPORT DELIVERY: PHP unit suite under PHP 8.1 (CI version) ---');
await check('tests/admin-report-delivery.test.php passes under PHP 8.1', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/php-wasm-run.mjs'), '--php', '8.1', 'tests/admin-report-delivery.test.php'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /Admin report delivery tests passed \(\d+ checks\)/);
});

console.log(`\n[OK] admin report delivery: ${passed} checks passed`);
process.exit(0);
