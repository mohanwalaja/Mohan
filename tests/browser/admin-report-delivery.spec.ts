import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Admin single-order delivery with REAL browser rendering against the REAL PHP.
 *
 * Chromium renders the actual report and invoice templates with the production
 * html2canvas + jsPDF pipeline, then the production client code runs exactly
 * the sequence AdminPortal's "Send" button runs for a standalone pending order:
 *   generateOrderPdfsBase64 -> deliverOrderPdfPayload -> api.approveOrder.
 * Every /api request the page makes is handed to the real api/admin/*.php
 * scripts under PHP-WASM (scripts/php-admin-api-bridge.mjs: throwaway SQLite
 * database, recording mailer that never sends).
 *
 * This is the browser half of the regression for "Preview-quality report and
 * invoice PDF did not reach the server": the real approve request is several
 * MB, which config.php's 1 MiB getJsonBody() used to discard. It also proves
 * genuine browser output passes the server's preview-quality validator and is
 * emailed byte-for-byte to the right customer under the right order number.
 *
 * The cases run from a DESKTOP and from a PHONE-sized viewport, because an
 * admin approves orders from both and the delivered document must be the same
 * 300 dpi A4 capture either way: the raster of what was actually emailed is
 * asserted against the print floor (see the mailer double's `raster` field).
 *
 * Requires the dev-only runtime: npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
const sha256 = (base64: string) => createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');

test.skip(!runtimeInstalled, 'php-wasm is not installed (npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54)');

// 300 dpi A4 = 2480 × 3508 px per page. Mirrors PRINT_CAPTURE_SCALE /
// A4_PRINT_MIN_* in src/services/jathagamPdfExporter.ts and the API's floor.
const A4_PRINT_MIN_WIDTH_PX = 2480;
const A4_PRINT_MIN_HEIGHT_PX = 3508;

const approvalCases = [
  { language: 'en' as const, device: 'desktop', viewport: { width: 1280, height: 900 } },
  { language: 'ta' as const, device: 'mobile', viewport: { width: 390, height: 844 } }
];

for (const { language, device, viewport } of approvalCases) {
test(`browser-rendered ${language} report + invoice reach the real approval gate from a ${device} and are emailed at 300 dpi`, async ({ page }) => {
  test.setTimeout(300_000);
  // An admin on a phone must produce the same print-quality document.
  await page.setViewportSize(viewport);
  const { createAdminApiBridge, TEST_ORDERS } = await import('../../scripts/php-admin-api-bridge.mjs');
  const bridge = await createAdminApiBridge();
  const A = TEST_ORDERS.single;

  try {
    // The chart the admin list would carry for this pending order, from the real PHP engine.
    const birth = {
      name: 'Test Devotee', devoteeName: 'Test Devotee', dob: '1990-05-15', tob: '06:30', birthPlace: 'Chennai',
      country: 'India', latitude: 13.0827, longitude: 80.2707, timezoneOffsetHours: 5.5
    };
    const calculatedResult = await bridge.runPhp(`
require_once '/repo/api/astrology/engine.php';
echo json_encode(AstroEngine::calculateHoroscope(json_decode(${JSON.stringify(JSON.stringify(birth))}, true)));
`);

    const order = {
      id: A.id, orderNumber: A.orderNumber, userId: 'usr_test_customer', userName: A.name, userEmail: A.email,
      userMobile: '', serviceType: 'BIRTH_JATHAGAM', language, country: 'India', currency: 'INR', amount: 0,
      serviceMode: 'FREE_BETA', paymentMethod: 'NONE', paymentStatus: 'NOT_REQUIRED', status: 'PENDING',
      emailStatus: 'PENDING', emailDeliveryAttempts: 0, inputPayload: birth, calculatedResult, hasPdf: false,
      createdAt: '2026-10-14T09:00:00Z'
    };

    const requests: Array<{ method: string; path: string; bytes: number; status: number; message?: string }> = [];
    const approveBodies: any[] = [];
    let queue: Promise<unknown> = Promise.resolve();
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      // Vite serves source modules that live under /api (shared astrology data
      // imported by the TS code); only the app's fetch/XHR calls are API traffic.
      if (!['fetch', 'xhr'].includes(request.resourceType())) {
        await route.continue();
        return;
      }
      if (url.pathname.endsWith('/services/client-error')) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const body = request.postDataBuffer();
      // php-wasm runs one request at a time, like a single PHP worker.
      const run = queue.then(() => bridge.request({
        method: request.method(),
        url: url.pathname + url.search,
        body: body ? new Uint8Array(body) : undefined,
        headers: { 'content-type': request.headers()['content-type'] || 'application/json' }
      }));
      queue = run.catch(() => undefined);
      const response = await run;
      requests.push({ method: request.method(), path: url.pathname, bytes: body?.length ?? 0, status: response.status, message: response.json?.message });
      if (url.pathname.endsWith('/approve') && body) approveBodies.push(JSON.parse(body.toString('utf8')));
      const contentType = (response.headers['content-type'] || response.headers['Content-Type'] || ['application/json'])[0];
      await route.fulfill({ status: response.status, contentType, body: Buffer.from(response.bytes) });
    });

    // Mount only the modules under test (no full portal, maps or fonts CDN).
    await page.route('http://127.0.0.1:4173/', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body></body></html>`
    }));
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__vite_plugin_react_preamble_installed__);

    const outcome = await page.evaluate(async ({ order }) => {
      const exporterPath = '/src/services/jathagamPdfExporter.ts';
      const apiPath = '/src/services/api.ts';
      // The admin portal renders inside the SPA, whose global stylesheet
      // (src/index.css) declares the web fonts the templates use.
      const stylesheetPath = '/src/index.css';
      await import(stylesheetPath);
      await document.fonts.ready;
      const exporter = await import(exporterPath);
      const { api } = await import(apiPath);
      // Same steps as AdminPortal.handleDirectSendCustomerEmail for a standalone PENDING order.
      const language = order.language || 'ta';
      const started = performance.now();
      const pdfs = await exporter.generateOrderPdfsBase64(order, language);
      const renderMs = Math.round(performance.now() - started);
      const payload = await exporter.deliverOrderPdfPayload(order, { ...pdfs, language });
      const res = await api.approveOrder(order.id, payload);
      return {
        res,
        renderMs,
        inline: Boolean(payload.reportPdfBase64),
        reportBase64Length: pdfs.reportPdfBase64.length,
        invoiceBase64Length: pdfs.invoicePdfBase64.length
      };
    }, { order });

    console.log(`  [${device}] rendered in ${outcome.renderMs} ms; requests: ${requests.map(r => `${r.method} ${r.path} ${(r.bytes / 1048576).toFixed(2)} MiB -> ${r.status}`).join(', ')}`);

    expect(outcome.res.success, outcome.res.message).toBe(true);
    const approve = requests.find(r => r.path.endsWith(`/admin/orders/${A.id}/approve`));
    expect(approve, 'the approve request reached the real route').toBeTruthy();
    expect(approve!.status).toBe(200);
    // Real-render sizes depend on fonts and content, so they are reported, not
    // asserted; tests/admin-report-delivery.test.ts pins the >1 MiB regression
    // with controlled fixtures.
    const largest = Math.max(...requests.filter(r => r.method === 'POST').map(r => r.bytes));
    console.log(`  ${language}: report ${(outcome.reportBase64Length * 0.75 / 1048576).toFixed(2)} MB, invoice ${(outcome.invoiceBase64Length * 0.75 / 1048576).toFixed(2)} MB; `
      + `largest request ${(largest / 1048576).toFixed(2)} MiB (${largest > 1048576 ? 'ABOVE' : 'below'} the old 1 MiB getJsonBody() cap)`);

    const outbox = bridge.outbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(A.email);
    expect(outbox[0].attachments.map((a: any) => a.name)).toEqual([
      `ASTRO_SIVAM_Report_${A.orderNumber}.pdf`,
      `ASTRO_SIVAM_Invoice_${A.orderNumber}.pdf`
    ]);
    if (outcome.inline) {
      expect(approveBodies).toHaveLength(1);
      expect(outbox[0].attachments[0].sha256).toBe(sha256(approveBodies[0].reportPdfBase64));
      expect(outbox[0].attachments[1].sha256).toBe(sha256(approveBodies[0].invoicePdfBase64));
    }
    // What was EMAILED must be print quality on every device: each A4 page
    // carries a raster of at least 2480 × 3508 px (A4 at 300 dpi).
    for (const attachment of outbox[0].attachments as any[]) {
      expect(attachment.raster?.length, `${attachment.name} embeds one raster per page`).toBeGreaterThan(0);
      for (const pageRaster of attachment.raster as Array<{ width: number; height: number }>) {
        expect(
          pageRaster.width >= A4_PRINT_MIN_WIDTH_PX && pageRaster.height >= A4_PRINT_MIN_HEIGHT_PX,
          `${device} ${language}: ${attachment.name} was emailed at ${pageRaster.width} × ${pageRaster.height} px, ` +
            `below the 300 dpi A4 floor (${A4_PRINT_MIN_WIDTH_PX} × ${A4_PRINT_MIN_HEIGHT_PX} px)`
        ).toBe(true);
      }
    }

    const row = await bridge.order(A.id);
    expect([row.status, row.email_status, Number(row.has_pdf), Number(row.has_invoice)]).toEqual(['COMPLETED', 'SENT', 1, 1]);
  } finally {
    await bridge.close();
  }
});
}
