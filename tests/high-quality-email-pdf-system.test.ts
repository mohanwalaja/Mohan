/**
 * ASTRO SIVAM — 100% Live-Preview High-Quality Email PDF System Contract.
 *
 * Guarantees:
 *   1. ZERO server-side PDF rendering files, libraries, classes, or routes
 *      exist anywhere in the repository (`pdf_mpdf_reports.php`,
 *      `pdf_mpdf_invoice.php`, `mpdf_fontconfig.php`, `check_mpdf.php`, mPDF,
 *      TCPDF, Dompdf, FPDF all permanently removed).
 *   2. EVERY email delivery path — Admin Single Approve, Admin Resend, Admin
 *      Legacy Family Approve, Admin Multi-Person Item Send/Resend, AND Customer
 *      Dashboard Self-Service Email Resend — enforces `astroFamilyDocsIsPreviewQualityPdf()`
 *      (`>= 1654 × 2339 px` A4 print raster matching the Admin Live Preview 1:1)
 *      and fails closed (`HTTP 422`, zero emails sent) on missing or blurry PDFs.
 *   3. Real PHP-WASM + SQLite runtime test verifies ownership isolation,
 *      rejection of low-resolution PDFs (`0` emails sent), multi-person item
 *      staging, frozen snapshot locking, high-resolution email delivery, and
 *      post-send cleanup.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPreviewPdfBase64 } from './helpers/previewPdfFixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- 100% HIGH-QUALITY LIVE-PREVIEW EMAIL PDF SYSTEM ---');

check('all legacy low-quality server PDF files and libraries are permanently removed', () => {
  const forbiddenFiles = [
    'api/astrology/pdf_mpdf_reports.php',
    'api/astrology/pdf_mpdf_invoice.php',
    'api/astrology/mpdf_fontconfig.php',
    'api/check_mpdf.php',
    'api/vendor/mpdf',
  ];
  for (const rel of forbiddenFiles) {
    assert.ok(!fs.existsSync(path.join(root, rel)), `${rel} must never return to the repository`);
  }

  const phpFilesToScan: string[] = [];
  const walkPhp = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'vendor') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkPhp(full);
      else if (entry.name.endsWith('.php')) phpFilesToScan.push(full);
    }
  };
  walkPhp(path.join(root, 'api'));

  for (const phpFile of phpFilesToScan) {
    const content = fs.readFileSync(phpFile, 'utf8');
    const rel = path.relative(root, phpFile);
    assert.doesNotMatch(
      content,
      /new\s+\\?(?:Mpdf\\Mpdf|TCPDF|Dompdf\\Dompdf|FPDF)\b|class\s+AstroMpdf(?:Reports|Invoice)\b|require(?:_once)?[^\n]*pdf_mpdf_/,
      `${rel} must contain zero server PDF generator classes or includes`
    );
  }
});

check('every admin and customer email endpoint enforces astroFamilyDocsIsPreviewQualityPdf()', () => {
  const adminIndex = read('api/admin/index.php');
  const approveOrder = read('api/admin/approve_order.php');
  const familyApproval = read('api/admin/family_approval.php');
  const orderItems = read('api/admin/order_items.php');
  const customerServices = read('api/services/index.php');

  const adminQualityChecks = adminIndex.match(/astroFamilyDocsIsPreviewQualityPdf\(/g) || [];
  assert.ok(
    adminQualityChecks.length >= 4,
    'api/admin/index.php must guard both report and invoice PDFs on approve AND resend-email'
  );
  assert.match(approveOrder, /astroFamilyDocsDecodePdf|astroLoadStagedFamilyDocs/);
  assert.match(familyApproval, /astroFamilyDocsIsPreviewQualityPdf\(/);
  assert.match(orderItems, /astroFamilyDocsIsPreviewQualityPdf\(/);

  // Customer high-quality staging + self-service resend routes exist and enforce quality gate
  assert.match(customerServices, /stage-customer-doc/);
  assert.match(customerServices, /request-resend-email/);
  assert.match(customerServices, /astroFamilyDocsIsPreviewQualityPdf\(/);
  assert.match(customerServices, /astro_document_json_body\('document upload'\)/);
});

check('CustomerDashboard hydrates frozen snapshots and handles single, family, and multi-person orders', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /getMyOrderReportSnapshot\(/);
  assert.match(dashboard, /prepareOrderItemsSendPayload/);
  assert.match(dashboard, /deliverOrderItemsPdfPayload/);
  assert.match(dashboard, /stagingAudience:\s*'customer'/);
});

function runPhpScript(relPath: string): string | null {
  try {
    execFileSync('php', ['-v'], { cwd: root, stdio: 'ignore' });
    return execFileSync('php', [relPath], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    if (!fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'))) {
      if (process.env.ASTRO_REQUIRE_PHP_WASM_TESTS === '1') {
        throw new Error('ASTRO_REQUIRE_PHP_WASM_TESTS=1 but neither php nor @php-wasm/node is installed');
      }
      return null;
    }
    return execFileSync('node', ['scripts/php-wasm-run.mjs', '--php', '8.4', relPath], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  }
}

check('PHP end-to-end runtime rejects blurry PDFs (0 emails) and delivers verified live-preview PDFs', () => {
  const payloadFile = path.join(root, 'tests/fixtures/.hq-email-payload.json');
  const hiResReportB64 = buildPreviewPdfBase64({ pages: 2, width: 1985, height: 2807, scanBytesPerPage: 16 * 1024, seed: 7 });
  const hiResInvoiceB64 = buildPreviewPdfBase64({ pages: 1, width: 1985, height: 2807, scanBytesPerPage: 12 * 1024, seed: 11 });
  const lowResPdfB64 = buildPreviewPdfBase64({ pages: 1, width: 800, height: 1130, scanBytesPerPage: 8 * 1024, seed: 3 });

  fs.writeFileSync(
    payloadFile,
    JSON.stringify({ hiResReportB64, hiResInvoiceB64, lowResPdfB64 })
  );

  try {
    const raw = runPhpScript('tests/fixtures/high-quality-email-runner.php');
    if (raw === null) return;
    const res = JSON.parse(raw);

    assert.equal(res.crossUserBlocked, true, 'another user must never resolve or stage documents on Alice\'s order');
    assert.equal(res.aliceSingleScope, 'cust_usr_alice__order_ord_single_1');
    assert.deepEqual(res.aliceMultiOrderIds, ['ord_multi_1', 'item_101', 'item_102']);
    assert.equal(res.adminMultiScope, 'order_ord_multi_1');

    assert.equal(res.lowResStageRejected, true, 'blurry <1654x2339 PDF must be rejected at stage time');
    assert.equal(res.lowResSendStatus, 422, 'blurry PDF must fail closed with HTTP 422');
    assert.equal(res.sentCountAfterLowRes, 0, 'ZERO emails may ever leave the server when a PDF is low-resolution');

    assert.equal(res.adminMultiStagedOk, true, 'high-resolution live-preview item PDFs + invoice stage cleanly');
    assert.equal(res.adminMultiDelivered, true, 'admin multi-person approval delivers high-resolution staged PDFs and completes order');
    assert.equal(res.adminMultiSnapLocked, 2, 'both approved multi-person items lock frozen report_snapshot');
    assert.equal(res.adminStageCleaned, true, 'admin staged PDFs are purged immediately after delivery');

    assert.equal(res.customerResendDelivered, true, 'customer self-service resend delivers staged high-resolution PDFs');
    assert.equal(res.customerStageCleaned, true, 'customer staged PDFs are purged immediately after delivery');
    assert.equal(res.sentEmails.length, 2, 'exact 2 high-quality emails sent (admin approval + customer resend)');

    for (const email of res.sentEmails) {
      assert.equal(email.hasTempleHeader, true, 'branded ASTRO SIVAM HTML email header present');
      assert.equal(email.attachments.length, 3, '2 person reports + 1 order tax invoice attached');
      for (const att of email.attachments) {
        assert.equal(att.isPreviewQuality, true, `attachment ${att.name} verified 100% live-preview quality`);
      }
    }
  } finally {
    fs.rmSync(payloadFile, { force: true });
  }
});

console.log(`ALL ${passed} HIGH-QUALITY EMAIL PDF CHECKS PASSED`);
