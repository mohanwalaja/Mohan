/**
 * ASTRO SIVAM — the PDF render pipeline's quality profile is a contract.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The emailed report is the BYTES the admin panel rendered in a browser at
 * print density (~300 dpi). Nothing re-renders it server-side, so the only
 * thing standing between a paying customer and a blurry PDF is the pair of
 * numbers in `src/services/jathagamPdfExporter.ts` — capture `scale` and
 * `jpegQuality` — plus the guards that refuse to send a document that failed
 * them.
 *
 * That makes those numbers a contract, not a tuning knob. A bundler change
 * (chunking, code splitting, minification) must never be able to move them, and
 * neither should a future "performance" commit that lowers capture density to
 * shave a few hundred kilobytes — which is exactly the failure this file pins
 * down:
 *
 *   * the four render profiles and their exact values,
 *   * the email path picking the HIGH-quality profile (never a lighter one),
 *   * the byte-level quality gate running before anything is staged or mailed,
 *   * the server refusing to substitute a server-rendered PDF,
 *   * the admin panel rendering through the same exporter as everything else.
 *
 * If a change here is intentional, it needs to be a deliberate edit to this
 * test with the new DPI agreed in review — that is the point.
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

const exporter = read('src/services/jathagamPdfExporter.ts');
const approveOrder = read('api/admin/approve_order.php');
const familyDocs = read('api/admin/family_docs.php');
const livePdfPreview = read('src/components/common/LivePdfPreviewModal.tsx');
const adminPortal = read('src/pages/AdminPortal.tsx');
const customerDashboard = read('src/pages/CustomerDashboard.tsx');
const orderItems = read('src/services/orderItems.ts');

/** The literal body of an exported constant object. */
function objectLiteral(name: string): string {
  const match = exporter.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([^}]*)\\}`));
  assert.ok(match, `could not find ${name} in the exporter`);
  return match[1].replace(/\s+/g, ' ').trim();
}

console.log('--- PDF PIPELINE INTEGRITY ---');

check('the print contract is 300 dpi: A4 = 2480 x 3508 px at scale 3.2', () => {
  assert.match(exporter, /export const REPORT_PRINT_DPI = 300;/, 'the paid-report print density must stay 300 dpi');
  assert.match(exporter, /export const A4_PRINT_MIN_WIDTH_PX = 2480;/, 'A4 at 300 dpi is 2480 px wide');
  assert.match(exporter, /export const A4_PRINT_MIN_HEIGHT_PX = 3508;/, 'A4 at 300 dpi is 3508 px tall');
  // dpi = 96 × scale, so 300 dpi needs ≥ 3.1246; 3.2 keeps a margin for
  // html2canvas' integer canvas size (2540 × 3592 px ≈ 307 dpi).
  assert.match(exporter, /export const PRINT_CAPTURE_SCALE = 3\.2;/, 'the print capture scale must stay 3.2');
});

check('the email profile renders at the print density and enforces the 300 dpi floor', () => {
  const body = objectLiteral('EMAIL_RENDER_OPTIONS');
  assert.match(body, /scale:\s*PRINT_CAPTURE_SCALE/, 'email capture density must be the print profile');
  assert.match(body, /jpegQuality:\s*0\.95/, 'the email JPEG quality must stay at 0.95');
  assert.match(body, /minimumCaptureWidthPx:\s*A4_PRINT_MIN_WIDTH_PX/, 'the A4 width floor must be the 300 dpi raster');
  assert.match(body, /minimumCaptureHeightPx:\s*A4_PRINT_MIN_HEIGHT_PX/, 'the A4 height floor must be the 300 dpi raster');
});

check('the desktop download profile matches the email profile', () => {
  const body = objectLiteral('DOWNLOAD_RENDER_OPTIONS');
  assert.match(body, /scale:\s*PRINT_CAPTURE_SCALE/, 'a download is a paid report: same 300 dpi capture');
  assert.match(body, /jpegQuality:\s*0\.95/);
});

check('no device gets a lighter paid profile any more', () => {
  // The old mobile/低-memory branch (2.5× ≈ 240 dpi) is gone: a phone that
  // cannot allocate the print canvas fails closed instead of silently
  // delivering a sub-300-dpi email.
  assert.doesNotMatch(exporter, /DOWNLOAD_RENDER_OPTIONS_MOBILE/, 'no reduced mobile profile may come back');
  assert.doesNotMatch(exporter, /deviceMemory|navigator\.userAgent/, 'a device sniff must not lower report quality');

  const safe = objectLiteral('DOWNLOAD_RENDER_OPTIONS_SAFE');
  assert.match(safe, /scale:\s*1\.8/, 'the last-resort density is 1.8, not lower');
  assert.match(safe, /jpegQuality:\s*0\.92/, 'even the last-resort JPEG quality stays at 0.92');
  assert.match(exporter, /DOWNLOADS ONLY\. The email path has no last-resort step/,
    'the last-resort profile must stay documented as download-only');
});

check('the API enforces the same 300 dpi floor, independently of the client', () => {
  assert.match(familyDocs, /define\('ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX', 2480\);/,
    'the server width floor must be A4 at 300 dpi');
  assert.match(familyDocs, /define\('ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX', 3508\);/,
    'the server height floor must be A4 at 300 dpi');
  assert.match(familyDocs, /ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX \. ' × ' \. ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX/,
    'the rejection message must quote the enforced floor, not a stale number');
});

check('the last-resort profile is documented as a renderer-internal retry, not a substitution', () => {
  // The rule: drop the raster, never switch engines. Switching engines is what
  // made a download look different from the approved preview.
  assert.match(exporter, /Switching engines is what made a download look different from the preview/);
  assert.match(livePdfPreview, /await downloadHtmlPdf\(/, 'the download button must go through the retry ladder, not a single hard-coded capture');
  const ladderUser = exporter.slice(exporter.indexOf('export async function downloadHtmlPdf'));
  assert.match(ladderUser.slice(0, 900), /const attempts = downloadAttemptOptions\(options\);/);
});

check('a download ladder always tries a preview-exact capture first', () => {
  const ladder = exporter.slice(exporter.indexOf('export function downloadAttemptOptions'));
  assert.match(ladder, /\[first, EMAIL_RENDER_OPTIONS, DOWNLOAD_RENDER_OPTIONS_SAFE\]/);
  assert.match(exporter, /Guarantees at least one preview-exact attempt on every device/);
  assert.match(exporter, /capture densities a download may try, best first/);
});

check('the email path renders with the HIGH-quality profile', () => {
  const highQuality = exporter.slice(exporter.indexOf('function highQualityEmailRenderOptions'));
  assert.match(highQuality, /\.\.\.DOWNLOAD_RENDER_OPTIONS/, 'the email capture spreads the print profile');
  assert.match(highQuality, /minimumCaptureWidthPx: EMAIL_RENDER_OPTIONS\.minimumCaptureWidthPx/);
  assert.match(highQuality, /minimumCaptureHeightPx: EMAIL_RENDER_OPTIONS\.minimumCaptureHeightPx/);

  const generator = exporter.slice(
    exporter.indexOf('export async function generateOrderPdfsBase64'),
    exporter.indexOf('export function safeFilePart')
  );
  assert.match(generator, /const renderOptions = highQualityEmailRenderOptions\(\);/,
    'the emailed report and its invoice must both use the high-quality profile');

  const staging = exporter.slice(exporter.indexOf('export async function stageFamilyOrderPdfs'));
  assert.match(staging.slice(0, 4000), /const renderOptions = highQualityEmailRenderOptions\(\);/,
    'staged family documents must use the high-quality profile');
});

check('every PAID render goes through the one print-density email render', () => {
  // One helper owns the email capture: it retries the SAME density and fails
  // closed. Nothing else may call the raw renderer with the print profile, or a
  // future edit could quietly reintroduce a lighter capture on one path.
  const helper = exporter.slice(exporter.indexOf('export async function renderEmailPdfBase64'));
  const helperBody = helper.slice(0, helper.indexOf('\n}' ));
  assert.match(helperBody, /const renderOptions = options \|\| highQualityEmailRenderOptions\(\);/,
    'the helper must default to the print profile');
  assert.match(helperBody, /await generatePdfBase64FromHtml\(htmlContent, renderOptions\)/,
    'the helper must render at that same profile on every attempt');
  assert.doesNotMatch(helperBody, /DOWNLOAD_RENDER_OPTIONS_SAFE|SAMPLE_RENDER_OPTIONS|2\.5|1\.8/,
    'the email retry must never drop to a lighter density');
  assert.match(helperBody, /throw new Error\(emailPrintDensityFailureMessage\(label, lastError\)\)/);

  // Raw call sites: only the helper itself, and the two non-paid sample paths.
  const rawCalls = (exporter.match(/generatePdfBase64FromHtml\(/g) || []).length;
  assert.equal(rawCalls, 2,
    `only the helper and its declaration may call the raw renderer (found ${rawCalls})`);
});

check('the deviceless rule holds: admin approval is 300 dpi from mobile and desktop alike', () => {
  // The exporter must not sniff the device to pick a profile any more.
  assert.doesNotMatch(exporter, /deviceMemory|userAgent|isPhone/,
    'no device sniff may choose a report profile');

  // Every admin-side send path renders through the print-density helper:
  // generateOrderPdfsBase64 (approve / resend / send-to-user / batch) and the
  // multi-person item path.
  const generator = exporter.slice(
    exporter.indexOf('export async function generateOrderPdfsBase64'),
    exporter.indexOf('export function safeFilePart')
  );
  assert.match(generator, /await renderEmailPdfBase64\(reportHtml, 'Report PDF', renderOptions\)/);
  assert.match(generator, /await renderEmailPdfBase64\(invoiceHtml, 'Invoice PDF', renderOptions\)/);

  const itemRenders = orderItems.match(/renderEmailPdfBase64\(/g) || [];
  assert.ok(itemRenders.length >= 4,
    `every multi-person item render must use the print-density helper (found ${itemRenders.length})`);
  assert.doesNotMatch(orderItems, /generatePdfBase64FromHtml/,
    'the item path must not call the raw renderer directly');

  // The admin panel itself must not branch on the device around approval.
  assert.doesNotMatch(adminPortal, /deviceMemory|window\.innerWidth < \d+ \?/,
    'the admin approval flow must not change profile by viewport');
  assert.match(adminPortal, /generateOrderPdfsBase64\(/);
  assert.match(customerDashboard, /generateOrderPdfsBase64\(/);
});

check('a device that cannot capture at print density fails loudly, never lighter', () => {
  const message = exporter.slice(exporter.indexOf('export function emailPrintDensityFailureMessage'));
  const body = message.slice(0, message.indexOf('\n}'));
  assert.match(body, /300 dpi/, 'the failure must name the density');
  assert.match(body, /A4_PRINT_MIN_WIDTH_PX/, 'the failure must quote the pixel floor');
  assert.match(body, /A4_PRINT_MIN_HEIGHT_PX/);
  assert.match(body, /Nothing was emailed and the order/, 'the operator must know nothing shipped');
  assert.match(body, /is still pending/, 'the order must be described as still pending');
  assert.match(body, /desktop browser/, 'the failure must say what to do next');
  assert.match(exporter, /const maxAttempts = 2;/,
    'exactly one same-density retry: enough for transient canvas pressure, not a quality ladder');
});

check('every document is byte-checked before it can be staged or emailed', () => {
  const gate = exporter.slice(exporter.indexOf('export function assertPreviewQualityPdfBase64'));
  assert.match(gate, /JVBERi0/, 'the gate must prove the payload is a real PDF');
  assert.match(gate, /if \(byteLength < minimumBytes\)/, 'the gate must enforce a minimum size');
  assert.match(gate, /Nothing was emailed/, 'a rejected document must say so explicitly');

  const deliver = exporter.slice(exporter.indexOf('export async function deliverOrderPdfPayload'));
  assert.match(deliver.slice(0, 1200), /assertPreviewQualityPdfBase64\(\s*payload\.reportPdfBase64/);
  assert.match(deliver.slice(0, 1200), /assertPreviewQualityPdfBase64\(\s*payload\.invoicePdfBase64/);
  assert.match(deliver.slice(0, 1200), /requirePreviewQuality: true/);
});

check('the low-quality detector still retries a capture instead of shipping it', () => {
  assert.match(exporter, /looks low-quality/);
  assert.match(exporter, /Low-quality capture detected for/);
  assert.match(exporter, /rendered PDF failed the high-quality check/);
  assert.match(exporter, /Preview-exact PDF render failed at scale/);
});

check('the server never substitutes a server-rendered PDF', () => {
  assert.match(approveOrder, /there is no server-render fallback/);
  assert.match(approveOrder, /Never substitutes a server-rendered PDF when a preview render is missing/);
  assert.match(approveOrder, /Preview-quality report PDF is missing or invalid\. No email was sent\./);
  assert.match(approveOrder, /Preview-quality invoice PDF is missing or invalid\. No email was sent\./);
  assert.match(approveOrder, /astroFamilyDocsIsPreviewQualityPdf/, 'the server must validate the bytes it attaches');
  assert.match(approveOrder, /\], 422\)/, 'a missing or invalid preview document must fail the approval');
});

check('the staging API also validates quality server-side', () => {
  assert.match(familyDocs, /astroFamilyDocsIsPreviewQualityPdf/);
});

check('public samples render at their own lighter profile (~200 dpi, JPEG 0.9)', () => {
  const body = objectLiteral('SAMPLE_RENDER_OPTIONS');
  assert.match(body, /scale:\s*2(?!\.?\d)/, 'samples capture at scale 2');
  assert.match(body, /jpegQuality:\s*0\.9(?!\d)/, 'samples use JPEG 0.9');
});

check('the sample profile is reachable ONLY from sample mode', () => {
  // One call site, gated on the prop that only SampleReportButton sets.
  const sampleReferences = (exporter.match(/SAMPLE_RENDER_OPTIONS/g) || []).length;
  assert.equal(sampleReferences, 2, `the exporter must only declare and document the profile (found ${sampleReferences} references)`);

  assert.match(livePdfPreview, /const downloadProfile = sampleMode \? SAMPLE_RENDER_OPTIONS : undefined;/);
  assert.match(livePdfPreview, /downloadPreviewPagesPdf\(livePages, previewFileName\(\), downloadProfile\)/);
  assert.match(livePdfPreview, /downloadHtmlPdf\(previewHtml, previewFileName\(\), downloadProfile\)/);
  // No other consumer may ask for the sample profile.
  for (const consumer of ['src/pages/AdminPortal.tsx', 'src/pages/CustomerDashboard.tsx', 'src/components/common/OrderReportModal.tsx']) {
    assert.doesNotMatch(read(consumer), /SAMPLE_RENDER_OPTIONS/, `${consumer} must never use the sample profile`);
  }
});

check('a sample can never reach the email pipeline', () => {
  // The send-to-user action is bound to an order; samples carry none.
  assert.match(livePdfPreview, /\{order && \(order\.status !== 'COMPLETED'/);
  assert.match(read('src/components/common/SampleReportButton.tsx'), /sampleMode\s*$/m, 'the public sample button must set sampleMode');
  assert.doesNotMatch(read('src/components/common/SampleReportButton.tsx'), /order=/, 'a sample button must never pass an order');
  // And the sample profile is not referenced by any staging/email helper.
  for (const fn of ['generateOrderPdfsBase64', 'stageFamilyOrderPdfs', 'deliverOrderPdfPayload', 'highQualityEmailRenderOptions']) {
    const body = exporter.slice(exporter.indexOf(`function ${fn}`));
    assert.doesNotMatch(body.slice(0, 600), /SAMPLE_RENDER_OPTIONS/, `${fn} must not use the sample profile`);
  }
});

check('an explicit render profile is a ceiling, so a sample cannot escalate to 300 dpi', () => {
  const ladder = exporter.slice(exporter.indexOf('export function downloadAttemptOptions'));
  const body = ladder.slice(0, 1400);
  assert.match(body, /const pool = preferred\s*\? candidates\.filter\(option => \(option\.scale \?\? 0\) <= \(first\.scale \?\? 0\)\)\s*: candidates;/,
    'a preferred profile must filter out heavier attempts');
  assert.match(exporter, /Escalating is the wrong reaction/, 'the reason must stay documented');
  // Every paid caller passes no profile at all, so its ladder is unchanged.
  assert.match(livePdfPreview, /downloadProfile = sampleMode \? SAMPLE_RENDER_OPTIONS : undefined/);
  assert.match(read('src/pages/AdminPortal.tsx'), /await downloadHtmlPdf\(buildOrderInvoiceHtmlForItems\(order, items\), orderInvoiceFileName\(order\)\);/,
    'the admin invoice download must keep its default (print) ladder');
});

check('the admin panel and the customer previews draw from the SAME renderer', () => {
  // One exporter, one set of builders: a sample, a customer download and the
  // admin approval render can never drift apart in layout or density.
  for (const consumer of [
    'src/pages/AdminPortal.tsx',
    'src/pages/CustomerDashboard.tsx',
    'src/components/common/OrderReportModal.tsx'
  ]) {
    assert.match(read(consumer), /from '(\.\.\/)+services\/jathagamPdfExporter'/, `${consumer} must use the shared exporter`);
  }
  // The live preview still uses the SAME exporter — but through a dynamic
  // import at the download click (audit PERF-1), so that opening a report, and
  // in particular a public sample, no longer downloads jspdf + html2canvas.
  // What must never change is WHERE the bytes come from: one exporter, so a
  // preview download and the admin approval render stay pixel-identical.
  assert.match(
    livePdfPreview,
    /import\('\.\.\/\.\.\/services\/jathagamPdfExporter'\)/,
    'the live preview must load the shared exporter on demand'
  );
  assert.doesNotMatch(
    livePdfPreview,
    /import[\s\S]{0,200}from '\.\.\/\.\.\/services\/jathagamPdfExporter'/,
    'a STATIC exporter import in the preview modal would fetch the PDF engine for every preview'
  );
  assert.match(livePdfPreview, /buildJathagamHtml|buildWeddingMatchHtml|buildBabyNamingHtml|buildMuhurthamHtml|buildInvoiceHtml/,
    'the preview must render through the shared HTML builders');
});

console.log(`\nPDF pipeline integrity passed (${passed} checks).\n`);
