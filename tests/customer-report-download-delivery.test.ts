/**
 * ASTRO SIVAM — the customer's paid report download must actually DELIVER.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Customer bug, 2026-10-21: "download the report from user profile can't
 * download" — on iPhone/iPad Safari the button said "Downloading…" and then
 * nothing happened. No file, and no error message either.
 *
 * A silent spinner is never one bug, it is a class of them, and four real
 * defects produced exactly that symptom on a phone:
 *
 *   1. `getMyOrderReportSnapshot` was the ONLY customer API call with a single
 *      URL. Every other one tries three URL forms, because the pretty
 *      `/api/services/...` route depends on the host applying /api/.htaccess.
 *      Without the rewrite the server answers an HTML 404 and the download died
 *      with "Server response was not in JSON format.".
 *
 *   2. The capture waits on bare `requestAnimationFrame` callbacks. iOS Safari
 *      stops rAF when the tab is backgrounded or the screen locks, so the
 *      render never settled — and because every render is serialised through
 *      one queue, that stuck task also blocked EVERY later download in the tab.
 *
 *   3. The rendered blob URL was revoked 1.5 s after the scripted click. Safari
 *      starts the transfer asynchronously, so the bytes were pulled out from
 *      under it: the UI reported success and no file ever arrived.
 *
 *   4. A scripted `anchor.click()` is only honoured as a download while the
 *      gesture that started it is still alive. A print-density capture takes
 *      tens of seconds, so on iOS the click is dropped silently — there was no
 *      way for the customer to take the file they had paid for.
 *
 * What is pinned here is the fix for each of those, EXECUTED where it can be
 * (a never-firing rAF, a fake browser handing over a file, the API fallbacks
 * against a stub server) and read from source where it cannot (the dashboard's
 * stall guard and save link).
 *
 * And the one thing that must NOT change while fixing it: the downloaded file
 * is still the emailed document at print density. tests/pdf-pipeline-integrity
 * and tests/customer-report-download-quality own that contract; this file
 * re-asserts the numbers so a "make it work on phones" commit cannot quietly
 * lower the capture to get there.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);

const api = read('src/services/api.ts');
const exporter = read('src/services/jathagamPdfExporter.ts');
const dashboard = read('src/pages/CustomerDashboard.tsx');

console.log('--- CUSTOMER REPORT DOWNLOAD DELIVERY ---');

// ------------------------------------------------- 1. the API call resilient ---
check('the frozen-snapshot call tries every URL form, like every other customer call', () => {
  const start = api.indexOf('async getMyOrderReportSnapshot');
  assert.ok(start > 0, 'getMyOrderReportSnapshot exists');
  const fn = api.slice(start, api.indexOf('\n  },', start) + 4);
  assert.match(fn, /\/services\/orders\/\$\{encodeURIComponent\(orderId\)\}\/report-snapshot/,
    'the pretty route is still tried first');
  assert.match(fn, /services\.php\?action=download-order-report-source&id=/,
    'the flat action route is the second URL form');
  assert.match(fn, /services\/index\.php\?action=download-order-report-source&id=/,
    'the direct script route is the third URL form');
  assert.match(fn, /itemId=\$\{encodeURIComponent\(String\(itemId\)\)\}/,
    'the per-person item is still fenced on every URL form');
  assert.match(fn, /isUnavailableApiEndpoint\(res, data\)/,
    'only a genuinely missing route falls through to the next URL');
});

check('an unreachable route is never reported as "not available yet"', () => {
  const start = api.indexOf('async getMyOrderReportSnapshot');
  const fn = api.slice(start, api.indexOf('\n  },', start) + 4);
  assert.match(api, /export const REPORT_SOURCE_ROUTE_UNAVAILABLE_MESSAGE/);
  assert.match(fn, /throw new Error\(REPORT_SOURCE_ROUTE_UNAVAILABLE_MESSAGE\)/,
    'when every URL form answered HTML the customer is told the route is unreachable');
  assert.match(api, /The report download route is not reachable on this server right now/,
    'and the message says the emailed PDF is still valid');
  assert.match(fn, /throw new Error\(message \|\| REPORT_SOURCE_NOT_AVAILABLE_MESSAGE\)/,
    "a real answer from the route (409 not delivered, 429, 404 not yours) reaches the customer verbatim");
});

// --------------------------------------------- 2. no wait may hang a capture ---
check('every paint wait inside the capture is bounded', () => {
  assert.match(exporter, /export function waitForPaint\(timeoutMs = \d+\)/);
  const wait = exporter.slice(
    exporter.indexOf('export function waitForPaint'),
    exporter.indexOf('export function waitForPaint') + 900
  );
  assert.match(wait, /const timer = setTimeout\(finish, timeoutMs\)/, 'a timer races the frames');
  assert.match(wait, /requestAnimationFrame\(\(\) => requestAnimationFrame\(finish\)\)/);
  // The unbounded form is what hung a locked iPhone: an await on rAF with no
  // timer anywhere in the promise.
  assert.doesNotMatch(
    exporter,
    /await new Promise<void>\(resolve => \{\s*requestAnimationFrame/,
    'no capture step may await an unbounded requestAnimationFrame'
  );
  assert.match(exporter, /const RENDER_TASK_DEADLOCK_MS = /,
    'the serialised render queue has a deadlock breaker');
  assert.match(exporter, /Promise\.race\(\[[\s\S]{0,200}RENDER_TASK_DEADLOCK_MS/,
    'a task that never settles cannot own the queue forever');
});

// --------------------------------------- 3./4. the file survives to the tap ---
check('the rendered blob URL outlives the scripted click', () => {
  assert.match(exporter, /const BLOB_URL_RELEASE_DELAY_MS = 10 \* 60_000/,
    'the URL stays alive long enough for Safari to take the bytes');
  assert.doesNotMatch(exporter, /revokeObjectURL\(url\), 1500\)/,
    'the 1.5 s revoke that cancelled iOS downloads is gone');
  assert.match(exporter, /export function savePdfBase64AsFile\(pdfBase64: string, fileName: string\): string/,
    'the saver hands the URL back to the caller');
  assert.match(exporter, /window\.addEventListener\('pagehide', releaseAllBlobUrls\)/,
    'untaken URLs are released when the page goes away');
  assert.match(exporter, /export function releaseSavedPdfUrls/);
  assert.match(exporter, /return \{ objectUrl, fileName \}/,
    'the paid download returns the saved file, not void');
});

check('the dashboard offers the rendered file as a real link the customer taps', () => {
  assert.match(dashboard, /const saved = await downloadPaidReportPdf\(reportHtml, fileName\)/);
  assert.match(dashboard, /setSavedReport\(\{ orderId: order\.id, url: saved\.objectUrl, fileName: saved\.fileName \}\)/);
  assert.match(dashboard, /data-saved-report=\{order\.id\}/);
  assert.match(dashboard, /href=\{savedReport\.url\}/);
  assert.match(dashboard, /download=\{savedReport\.fileName\}/);
  assert.match(dashboard, /<span>Save the PDF<\/span>/);
  assert.match(dashboard, /Save to Files/, 'iPhone users are told how to keep the opened PDF');
  assert.match(dashboard, /releaseSavedPdfRef\.current = engine\.releaseSavedPdfUrls/,
    'the page still never imports the PDF engine statically');
  assert.doesNotMatch(dashboard, /from '\.\.\/services\/jathagamPdfExporter'/,
    'the exporter stays behind loadPdfEngine() (initial JS budget)');
});

check('a stalled download frees the button and says what to do', () => {
  const start = dashboard.indexOf('const handleDownloadReport = async');
  assert.ok(start > 0);
  const handler = dashboard.slice(start, dashboard.indexOf('const handleOpenResendModal', start));
  assert.match(dashboard, /const DOWNLOAD_STALL_GUARD_MS = 150_000/);
  assert.match(handler, /Promise\.race\(\[renderWork, stalled\]\)/,
    'the wait is capped, so the spinner cannot outlive the work silently');
  assert.match(handler, /if \(stallTimer\) clearTimeout\(stallTimer\)/);
  assert.match(handler, /setDownloadingKey\(''\);\n    if \(outcome === 'stalled'\)/,
    'the button is freed and the stall is reported after EITHER outcome');
  assert.match(dashboard, /This download did not finish on this device, so the button was freed instead of spinning forever/);
  assert.match(dashboard, /Nothing was charged and the PDF in your email is still valid/,
    'the stall message states that no money moved and the emailed copy stands');
  assert.match(dashboard, /const deviceCaptureFailureMessage = \(\): string =>/,
    'a capture failure is worded for the device that hit it');
  assert.match(dashboard, /iP\(hone\|ad\|od\)/);
  assert.match(dashboard, /navigator\.maxTouchPoints > 1/, 'iPadOS 13+ masquerades as a Mac');
  assert.match(handler, /message === PDF_CAPTURE_ERROR\n            \? deviceCaptureFailureMessage\(\)/);
});

check('the fix did not touch print quality', () => {
  assert.match(exporter, /export const PRINT_CAPTURE_SCALE = 2\.2;/);
  assert.match(exporter, /export const A4_PRINT_MIN_WIDTH_PX = 1654;/);
  assert.match(exporter, /export const A4_PRINT_MIN_HEIGHT_PX = 2339;/);
  assert.match(exporter, /export const PRINT_JPEG_QUALITY = 0\.88;/);
  assert.match(exporter, /export const JPEG_QUALITY_FLOOR = 0\.8;/);
  const body = exporter.slice(
    exporter.indexOf('export async function downloadPaidReportPdf'),
    exporter.indexOf('export async function downloadPreviewPagesPdf')
  );
  assert.match(body, /await renderEmailPdfBase64\(htmlContent, 'Report PDF'\)/,
    'still the exact helper, profile and gate every paid email uses');
  assert.match(body, /throw new Error\(PDF_CAPTURE_ERROR\)/,
    'a device that cannot capture at print density is told; nothing lighter is saved');
  assert.doesNotMatch(dashboard, /SAMPLE_RENDER_OPTIONS|DOWNLOAD_RENDER_OPTIONS/,
    'the dashboard still asks for no profile of its own');
});

// --------------------------------------------------------------- RUNTIME -------
// The modules are imported BEFORE the fake browser is installed: jspdf binds
// its own btoa/atob at import time, so a stub window would break the import.
// Everything the stubs must intercept (window.URL, document.body, fetch) is
// read at CALL time by the code under test, which is exactly what a browser
// does too.
const { waitForPaint, savePdfBase64AsFile, releaseSavedPdfUrls } = await import(
  '../src/services/jathagamPdfExporter'
);
const { api: apiClient, REPORT_SOURCE_ROUTE_UNAVAILABLE_MESSAGE } = await import('../src/services/api');

// A minimal browser: enough of window/document for the file handoff, and a
// recording fetch for the API fallbacks.
const revokedUrls: string[] = [];
let blobUrlSeq = 0;
const windowListeners: Array<[string, () => void]> = [];
const clickedAnchors: Array<{ href: string; download: string; rel: string; attached: boolean }> = [];
const attachedNodes: unknown[] = [];

const fakeWindow: any = {
  location: { origin: 'https://shop.example' },
  atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
  btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
  setTimeout: (fn: () => void, ms: number) => {
    // The saver schedules a 10-minute blob-URL release. unref() keeps that real
    // timer from holding the Node event loop open after the checks finish.
    const timer = setTimeout(fn, ms);
    (timer as { unref?: () => void }).unref?.();
    return timer;
  },
  addEventListener: (type: string, fn: () => void) => { windowListeners.push([type, fn]); },
  URL: {
    createObjectURL: () => `blob:https://shop.example/report-${(blobUrlSeq += 1)}`,
    revokeObjectURL: (url: string) => { revokedUrls.push(url); }
  }
};
const fakeDocument: any = {
  createElement: () => {
    const anchor: any = { style: {}, attached: false, click() { clickedAnchors.push({ href: anchor.href, download: anchor.download, rel: anchor.rel, attached: anchor.attached }); } };
    return anchor;
  },
  body: {
    appendChild: (node: any) => { node.attached = true; attachedNodes.push(node); },
    removeChild: (node: any) => { node.attached = false; }
  }
};
(globalThis as any).window = fakeWindow;
(globalThis as any).document = fakeDocument;


/** A PDF-ish base64 payload (the saver only decodes, it never parses). */
const PDF_BASE64 = Buffer.from('%PDF-1.4 fake report bytes for the delivery test', 'binary').toString('base64');

check('RUNTIME: a capture wait resolves even when rAF never fires (a locked iPhone)', async () => {
  const neverFires = () => 0; // iOS suspends rAF in a hidden/locked tab
  (globalThis as any).requestAnimationFrame = neverFires;
  const started = Date.now();
  await waitForPaint(80);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 70 && elapsed < 2000, `the bounded wait resolved on its timer (${elapsed}ms)`);
  delete (globalThis as any).requestAnimationFrame;

  // And it still yields to real frames when the browser provides them.
  let frames = 0;
  (globalThis as any).requestAnimationFrame = (cb: () => void) => { frames += 1; setTimeout(cb, 0); return frames; };
  await waitForPaint(5000);
  assert.equal(frames, 2, 'two animation frames when the browser can paint');
  delete (globalThis as any).requestAnimationFrame;
});

check('RUNTIME: the saved PDF is clickable, attached, and its URL stays alive', async () => {
  clickedAnchors.length = 0;
  revokedUrls.length = 0;
  const url = savePdfBase64AsFile(PDF_BASE64, 'ASTRO_SIVAM_Report_ORD-1_Devotee.pdf');
  assert.match(url, /^blob:/, 'the caller gets the blob URL back');
  assert.equal(clickedAnchors.length, 1, 'the scripted download is still attempted first');
  assert.equal(clickedAnchors[0].href, url);
  assert.equal(clickedAnchors[0].download, 'ASTRO_SIVAM_Report_ORD-1_Devotee.pdf');
  assert.equal(clickedAnchors[0].attached, true, 'iOS Safari ignores a click on a detached anchor');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(revokedUrls, [], 'the URL is NOT revoked moments after the click');
  assert.ok(windowListeners.some(([type]) => type === 'pagehide'), 'page teardown releases it');
  releaseSavedPdfUrls();
  assert.deepEqual(revokedUrls, [url], 'an explicit release revokes exactly that URL');
  releaseSavedPdfUrls();
  assert.deepEqual(revokedUrls, [url], 'releasing twice is harmless');
});

check('RUNTIME: an empty payload is refused instead of saving a 0-byte file', () => {
  assert.throws(() => savePdfBase64AsFile('', 'x.pdf'), /empty/);
});

/** Records every URL the client asks for and answers from a table. */
type StubRoute = { status: number; body: string; contentType?: string } | { throw: string };
function stubFetch(routes: Record<string, StubRoute>) {
  const requested: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    // apiFetch reports every non-OK response to /services/client-error
    // (fire-and-forget telemetry). That is not one of the URL forms under test.
    if (!path.includes('/client-error')) requested.push(path);
    const route = routes[path];
    if (!route) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'text/html' },
        text: async () => '<!DOCTYPE html><html><body>404 Not Found</body></html>'
      };
    }
    if ('throw' in route) throw new Error(route.throw);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? route.contentType || 'application/json' : null) },
      text: async () => route.body
    };
  };
  return requested;
}

const HTML_404 = '<!DOCTYPE html><html><head><title>404</title></head><body>Not Found</body></html>';
const PRETTY = '/api/services/orders/ord_1/report-snapshot?itemId=7';
const FLAT = '/api/services.php?action=download-order-report-source&id=ord_1&itemId=7';
const DIRECT = '/api/services/index.php?action=download-order-report-source&id=ord_1&itemId=7';
const SNAPSHOT_JSON = JSON.stringify({
  success: true,
  result: { devoteeName: 'Frozen Devotee', note: 'frozen-body' },
  preparedAt: '2024-02-03 10:00:00',
  language: 'ta',
  serviceType: 'BIRTH_JATHAGAM',
  itemId: 7
});

check('RUNTIME: the pretty route answering HTML falls through to the flat action route', async () => {
  const requested = stubFetch({
    [PRETTY]: { status: 404, body: HTML_404, contentType: 'text/html' },
    [FLAT]: { status: 200, body: SNAPSHOT_JSON }
  });
  const data = await apiClient.getMyOrderReportSnapshot('ord_1', 7);
  assert.equal(data.success, true);
  assert.equal(data.result?.note, 'frozen-body', 'the frozen body reached the renderer');
  assert.equal(data.language, 'ta');
  assert.deepEqual(requested, [PRETTY, FLAT], 'it stopped as soon as a URL form answered JSON');
});

check('RUNTIME: a server answer is final — 409 is never retried against another URL', async () => {
  const requested = stubFetch({
    [PRETTY]: {
      status: 409,
      body: JSON.stringify({ success: false, message: 'This report will be available for download once it is delivered.' })
    },
    [FLAT]: { status: 200, body: SNAPSHOT_JSON },
    [DIRECT]: { status: 200, body: SNAPSHOT_JSON }
  });
  await assert.rejects(
    () => apiClient.getMyOrderReportSnapshot('ord_1', 7),
    /This report will be available for download once it is delivered\./,
    "the route's own reason reaches the customer"
  );
  assert.deepEqual(requested, [PRETTY], 'one request: the route answered, so nothing else is tried');
});

check('RUNTIME: every URL form missing says the route is unreachable, not "not ready"', async () => {
  const requested = stubFetch({});
  await assert.rejects(
    () => apiClient.getMyOrderReportSnapshot('ord_1', 7),
    (error: Error) => {
      assert.equal(error.message, REPORT_SOURCE_ROUTE_UNAVAILABLE_MESSAGE);
      assert.match(error.message, /not reachable on this server/);
      assert.doesNotMatch(error.message, /not available for download yet/);
      return true;
    }
  );
  assert.deepEqual(requested, [PRETTY, FLAT, DIRECT], 'all three URL forms were tried');
});

check('RUNTIME: a single-order download omits itemId on every URL form', async () => {
  const requested = stubFetch({
    '/api/services/orders/ord_2/report-snapshot': { status: 200, body: SNAPSHOT_JSON }
  });
  const data = await apiClient.getMyOrderReportSnapshot('ord_2');
  assert.equal(data.success, true);
  assert.deepEqual(requested, ['/api/services/orders/ord_2/report-snapshot']);
  stubFetch({});
  await assert.rejects(() => apiClient.getMyOrderReportSnapshot('ord_2'), /not reachable/);
  assert.ok(
    !requested.some(url => url.includes('itemId')),
    'no itemId is invented for a single-report order'
  );
});

check('RUNTIME: an offline device is told, instead of spinning', async () => {
  stubFetch({ [PRETTY]: { throw: 'Failed to fetch' } });
  await assert.rejects(() => apiClient.getMyOrderReportSnapshot('ord_1', 7), /Failed to fetch/);
});

let failures = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  [FAIL] ${name}\n         ${(error as Error).message}`);
  }
}

if (failures > 0) {
  console.error(`\ncustomer-report-download-delivery: ${failures} failing check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\ncustomer-report-download-delivery: all ${checks.length} checks passed`);
}
