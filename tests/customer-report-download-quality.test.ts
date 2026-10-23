/**
 * Customer dashboard download quality (customer request, 2026-10-19).
 *
 * The dashboard download used to be the server-side mPDF render, a visibly
 * thinner, differently paginated document than the emailed PDF. It now renders
 * the FROZEN snapshot in the browser through the SAME HTML builders and the
 * SAME print-density capture profile (`EMAIL_RENDER_OPTIONS`, 300 dpi, JPEG
 * 0.95, 2480 × 3508 px floor) that produced the emailed document and the
 * admin's approved preview. The server renderer was removed entirely (Oct
 * 2026): there is no second, lower-quality PDF path in the codebase.
 *
 * Also pinned here: the profile copy the customer asked to remove
 * ("(your order language)" / "frozen as ordered — this download never updates
 * itself") must not come back.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

const services = read('api/services/index.php');
const api = read('src/services/api.ts');
const exporter = read('src/services/jathagamPdfExporter.ts');
const dashboard = read('src/pages/CustomerDashboard.tsx');

// ------------------------------------------------------- frozen source API ---
check('report-snapshot: owner-only, delivered-only, one report, never recalculates', () => {
  const start = services.indexOf('// 6b2. GET /api/services/orders/:id/report-snapshot');
  const end = services.indexOf('// 6c. (Removed)');
  assert.ok(start > 0 && end > start, 'the frozen report-source route exists');
  const block = services.slice(start, end);
  assert.match(block, /requireAuth\(\$pdo\)/);
  assert.match(block, /WHERE id = \? AND user_id = \?/, 'ownership enforced in the query');
  assert.match(block, /\['COMPLETED', 'GENERATED'\]/, 'only delivered orders expose their snapshot');
  assert.match(block, /report_status'\] \?\? ''\) !== 'SENT'/, 'per-person reports only after delivery');
  assert.match(block, /report_snapshot/, 'the immutable snapshot is the source');
  assert.match(block, /'result' => \$result/, 'the frozen body is returned for the browser render');
  assert.match(block, /result\['generatedAt'\] = date\('Y-m-d H:i:s', \$preparedTs\)/,
    'a legacy snapshot keeps the frozen prepared date');
  assert.match(block, /jsonResponse\(\[/, 'it answers JSON, not a PDF');
  for (const forbidden of [
    'calculateHoroscope(',
    'calculateMatchmaking(',
    'calculateBabyNaming(',
    'calculateMuhurtham(',
    'rebuildReportResultFromSavedInputs(',
    'generateReportPdf(',
    'generateInvoicePdf(',
    'SET calculated_result',
    'astro_write_report_snapshot('
  ]) {
    assert.ok(!block.includes(forbidden), `the snapshot source must never call ${forbidden}`);
  }
});

check('the orders list still carries metadata only, never every snapshot body', () => {
  assert.match(services, /'hasReportSnapshot' => !empty\(\$r\['report_snapshot'\]\) \|\| !empty\(\$r\['calculated_result'\]\)/);
  const mapper = services.slice(
    services.indexOf('function astro_order_to_client_array'),
    services.indexOf('function astro_claim_intent_binding')
  );
  assert.doesNotMatch(mapper, /'reportSnapshot'\s*=>/, 'the list mapper must not embed the snapshot JSON');
});

// --------------------------------------------------------------- API client ---
check('api client fetches exactly one frozen snapshot for the click', () => {
  const start = api.indexOf('async getMyOrderReportSnapshot');
  assert.ok(start > 0, 'getMyOrderReportSnapshot exists');
  const fn = api.slice(start, api.indexOf('\n  },', start) + 4);
  assert.match(fn, /\/services\/orders\/\$\{encodeURIComponent\(orderId\)\}\/report-snapshot/);
  assert.match(fn, /itemId=\$\{encodeURIComponent\(String\(itemId\)\)\}/);
  assert.match(fn, /apiFetch\(/, 'authenticated request');
  assert.match(fn, /data\?\.result/);
});

// ------------------------------------------------------------------ renderer ---
check('the download IS the emailed document: one print profile, no lighter copy', () => {
  const start = exporter.indexOf('export async function downloadPaidReportPdf');
  const end = exporter.indexOf('export async function downloadPreviewPagesPdf');
  assert.ok(start > 0 && end > start, 'downloadPaidReportPdf exists');
  const body = exporter.slice(start, end);
  assert.match(body, /await renderEmailPdfBase64\(htmlContent, 'Report PDF'\)/,
    'print density through the same helper every paid email uses');
  assert.match(body, /savePdfBase64AsFile\(pdfBase64, fileName\)/);
  assert.doesNotMatch(body, /DOWNLOAD_RENDER_OPTIONS_SAFE|downloadHtmlPdf\(/,
    'there is no reduced-density second attempt any more');
  assert.doesNotMatch(body, /'REDUCED'|redus/i, 'the download cannot report a lighter quality');
  assert.match(body, /throw new Error\(PDF_CAPTURE_ERROR\)/,
    'a device that cannot capture at print density is told, and nothing is saved');
  assert.match(exporter, /export function savePdfBase64AsFile/);
  assert.doesNotMatch(body, /SAMPLE_RENDER_OPTIONS/, 'samples have no profile of their own');
});

// ----------------------------------------------------------------- dashboard ---
check('dashboard renders the frozen snapshot at email quality; no server fallback', () => {
  assert.match(dashboard, /api\.getMyOrderReportSnapshot\(order\.id, item\?\.id\)/);
  assert.match(dashboard, /buildOrderReportHtml\(/);
  assert.match(dashboard, /mergeOrderPayloadIntoResult\(chartOrder, result\)/);
  assert.match(dashboard, /downloadPaidReportPdf\(reportHtml, fileName\)/);
  assert.doesNotMatch(dashboard, /api\.downloadMyOrderReport/,
    'the server-rendered fallback must stay deleted');
  assert.match(dashboard, /PDF_CAPTURE_ERROR/,
    'a device that cannot capture the canvas is told, never handed a thinner file');
  assert.match(dashboard, /result\.generatedAt = frozen\.preparedAt/,
    'a legacy snapshot still prints its frozen prepared date');
});

check('the browser is the only PDF renderer left in the tree', () => {
  assert.ok(!fs.existsSync(path.join(root, 'api/astrology/pdf_mpdf_reports.php')),
    'api/astrology/pdf_mpdf_reports.php must stay deleted: server mPDF rendering is removed');
  assert.ok(!fs.existsSync(path.join(root, 'api/astrology/pdf_mpdf_invoice.php')));
  assert.ok(!fs.existsSync(path.join(root, 'api/astrology/mpdf_fontconfig.php')));
  assert.ok(!fs.existsSync(path.join(root, 'api/check_mpdf.php')));
  assert.ok(!exporter.includes('downloadServerMpdf'));
  assert.ok(!exporter.includes('downloadFromServerUrl'));
  assert.ok(!api.includes('/report-pdf'));
  assert.ok(!api.includes('/export-preview-pdf'));
});

check('the removed profile wording stays removed, and so does the prepared-on line', () => {
  assert.doesNotMatch(dashboard, /your order language/);
  assert.doesNotMatch(dashboard, /frozen as ordered/);
  assert.doesNotMatch(dashboard, /never updates itself/);
  // Owner request (2026-10-21): the download row is a name and an icon. The
  // "Prepared on <date> • <language>" line added height to every card and
  // repeated what the language badge above the row already says.
  assert.doesNotMatch(dashboard, /Prepared on \{itemPrepared\}/);
  assert.doesNotMatch(dashboard, />Prepared on \{formatPreparedDate\(order\.reportSnapshotAt/);
  // The language itself is still stated where it decides something: the card's
  // language badge, and each family member's row.
  assert.match(dashboard, /reportLanguageName\(member\.language\)/);
  assert.match(dashboard, /const getLangBadge = \(\) => \{/);
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

// ------------------------------------------------------- PHP-WASM runtime ---
// Execute the REAL route: owner-only, delivered-only, item fencing, the
// snapshot body, the pre-migration calculated_result fallback and the frozen
// prepared date. SKIPs when the optional dev runtime is absent.
const wasmInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!wasmInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the real report-snapshot route did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const { createAdminApiBridge } = await import(
    new URL('../scripts/php-admin-api-bridge.mjs', import.meta.url).href
  );
  const bridge = await createAdminApiBridge();
  try {
    await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("DROP TABLE orders");
$pdo->exec("CREATE TABLE orders (id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, group_id TEXT NULL, group_order_index INTEGER NOT NULL DEFAULT 0, user_id TEXT NOT NULL, user_name TEXT NOT NULL, user_email TEXT NOT NULL, user_mobile TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', service_type TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', service_mode TEXT NOT NULL DEFAULT 'PAID', status TEXT NOT NULL DEFAULT 'PENDING', payment_method TEXT NULL, payment_reference TEXT NULL, payment_intent_id TEXT NULL, payment_status TEXT NOT NULL DEFAULT 'PENDING_ADMIN', payment_confirmed INTEGER NOT NULL DEFAULT 0, email_status TEXT NOT NULL DEFAULT 'PENDING', email_sent_at TEXT NULL, email_last_status_message TEXT NULL, input_payload TEXT NOT NULL, calculated_result TEXT NULL, report_snapshot TEXT NULL, report_snapshot_at TEXT NULL, has_pdf INTEGER NOT NULL DEFAULT 0, has_invoice INTEGER NOT NULL DEFAULT 0, admin_notes TEXT NULL, refund_status TEXT NOT NULL DEFAULT 'NONE', refund_reason TEXT NULL, refund_percent REAL NULL, refund_amount REAL NULL, refund_currency TEXT NULL, refund_processed_at TEXT NULL, refund_deadline TEXT NULL, refund_admin_notes TEXT NULL, refund_method TEXT NULL, refund_reference TEXT NULL, ip_address TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("DROP TABLE order_items");
$pdo->exec("CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, person_id INTEGER NULL, service_code TEXT, language TEXT, unit_price REAL DEFAULT 0, report_status TEXT DEFAULT 'PENDING', input_payload TEXT, calculated_result TEXT, report_snapshot TEXT NULL, report_snapshot_at TEXT NULL, sent_at TEXT NULL)");

$insertUser = $pdo->prepare("INSERT INTO users (id, name, email, role, token_version) VALUES (?, ?, ?, 'customer', 0)");
$insertUser->execute(['usr_snap_cust', 'Snapshot Customer', 'snap@example.test']);
$insertUser->execute(['usr_snap_other', 'Other Customer', 'other@example.test']);

$snapshot = json_encode(['devoteeName' => 'Frozen Devotee', 'note' => 'frozen-body']);
$calculated = json_encode(['devoteeName' => 'Current Cache', 'note' => 'cache-body']);
$payload = json_encode(['name' => 'Frozen Devotee']);
$insertOrder = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, language, amount, currency, service_mode, status, payment_confirmed, email_status, input_payload, calculated_result, report_snapshot, report_snapshot_at, has_pdf) VALUES (?, ?, ?, 'Snapshot Customer', 'snap@example.test', 'BIRTH_JATHAGAM', 'ta', 18, 'USD', 'PAID', ?, 1, 'SENT', ?, ?, ?, ?, ?)");
$insertOrder->execute(['ord_snap_done', 'ORD-SNAP-DONE', 'usr_snap_cust', 'COMPLETED', $payload, $calculated, $snapshot, '2024-02-03 10:00:00', 1]);
$insertOrder->execute(['ord_snap_pending', 'ORD-SNAP-PEND', 'usr_snap_cust', 'PROCESSING', $payload, $calculated, $snapshot, '2024-02-03 10:00:00', 1]);
$insertOrder->execute(['ord_snap_other', 'ORD-SNAP-OTHER', 'usr_snap_cust', 'COMPLETED', $payload, $calculated, $snapshot, '2024-02-03 10:00:00', 1]);
$insertOrder->execute(['ord_snap_cache', 'ORD-SNAP-CACHE', 'usr_snap_cust', 'COMPLETED', $payload, $calculated, NULL, NULL, 1]);
$insertOrder->execute(['ord_snap_legacy', 'ORD-SNAP-LEGACY', 'usr_snap_cust', 'COMPLETED', $payload, $calculated, NULL, NULL, 1]);
$insertItem = $pdo->prepare("INSERT INTO order_items (order_id, person_id, service_code, language, unit_price, report_status, input_payload, calculated_result, report_snapshot, report_snapshot_at) VALUES (?, 0, 'BIRTH_JATHAGAM', 'ta', 18, ?, ?, ?, ?, ?)");
$insertItem->execute(['ord_snap_other', 'SENT', $payload, $calculated, json_encode(['devoteeName' => 'Item Frozen', 'note' => 'item-frozen']), '2024-03-04 11:00:00']);
$insertItem->execute(['ord_snap_cache', 'PENDING', $payload, $calculated, NULL, NULL]);
echo json_encode(['ok' => true]);
`);

    const customer = await bridge.runPhp(
      `echo json_encode(['token' => createBearerToken(['id' => 'usr_snap_cust', 'email' => 'snap@example.test', 'role' => 'customer'], 3600, 0)]);`
    );
    const stranger = await bridge.runPhp(
      `echo json_encode(['token' => createBearerToken(['id' => 'usr_snap_other', 'email' => 'other@example.test', 'role' => 'customer'], 3600, 0)]);`
    );
    const get = (url: string, token: string) =>
      bridge.request({ method: 'GET', url, auth: false, headers: { authorization: `Bearer ${token}` } });

    const runtimeChecks: Array<[string, () => void | Promise<void>]> = [];
    const runtimeAsync = (name: string, fn: () => void | Promise<void>) => runtimeChecks.push([name, fn]);

    runtimeAsync('owner receives the frozen snapshot body', async () => {
      const res = await get('/api/services/orders/ord_snap_done/report-snapshot', customer.token);
      assert.equal(res.status, 200);
      assert.equal(res.json?.result?.note, 'frozen-body', 'the snapshot body, never the calculated_result cache');
      assert.equal(res.json?.result?.generatedAt, '2024-02-03 10:00:00');
      assert.equal(res.json?.preparedAt, '2024-02-03 10:00:00');
      assert.equal(res.json?.language, 'ta');
      assert.equal(res.json?.serviceType, 'BIRTH_JATHAGAM');
    });
    runtimeAsync('another customer cannot read it', async () => {
      const res = await get('/api/services/orders/ord_snap_done/report-snapshot', stranger.token);
      assert.equal(res.status, 404, 'foreign ids must look missing');
    });
    runtimeAsync('an undelivered order has no download source', async () => {
      const res = await get('/api/services/orders/ord_snap_pending/report-snapshot', customer.token);
      assert.equal(res.status, 409);
    });
    runtimeAsync('one item returns its own frozen body and date', async () => {
      const res = await get('/api/services/orders/ord_snap_other/report-snapshot?itemId=1', customer.token);
      assert.equal(res.status, 200);
      assert.equal(res.json?.result?.note, 'item-frozen');
      assert.equal(res.json?.preparedAt, '2024-03-04 11:00:00');
    });
    runtimeAsync('an undelivered item has no download source', async () => {
      const res = await get('/api/services/orders/ord_snap_cache/report-snapshot?itemId=2', customer.token);
      assert.equal(res.status, 409);
    });
    runtimeAsync('a pre-migration row falls back to calculated_result, stamped frozen', async () => {
      const res = await get('/api/services/orders/ord_snap_legacy/report-snapshot', customer.token);
      assert.equal(res.status, 200);
      assert.equal(res.json?.result?.note, 'cache-body');
      assert.equal(res.json?.result?.generatedAt, res.json?.preparedAt, 'the legacy body keeps the order date');
    });
    runtimeAsync('anonymous access is rejected', async () => {
      const res = await bridge.request({ method: 'GET', url: '/api/services/orders/ord_snap_done/report-snapshot', auth: false });
      assert.equal(res.status, 401);
    });

    for (const [name, fn] of runtimeChecks) {
      try {
        await fn();
        console.log(`  [PASS] ${name}`);
      } catch (error) {
        failures += 1;
        console.error(`  [FAIL] ${name}\n         ${(error as Error).message}`);
      }
    }
  } finally {
    await bridge.close();
  }
}


if (failures > 0) {
  console.error(`\ncustomer-report-download-quality: ${failures} failing check(s)`);
  process.exit(1);
}
console.log('\ncustomer-report-download-quality: all checks passed');
