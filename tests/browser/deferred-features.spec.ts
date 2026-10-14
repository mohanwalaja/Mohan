import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Deferred-feature network contract (audit PERF-1).
 *
 * The production audit measured ~2.1 MB of JavaScript in the homepage's first
 * paint: the app shell, React, the PDF renderer (jspdf + html2canvas) and
 * Leaflet. This spec observes the ACTUAL requests the browser makes, which is
 * the only way to prove the libraries are gone from the initial load — the
 * bundle graph can look right while a stray static import (or an idle
 * prefetcher) still downloads them.
 *
 * It is written to pass against BOTH servers:
 *   - `playwright.config.ts`      → `vite` dev server (source modules:
 *     /src/pages/X.tsx, /node_modules/.vite/deps/jspdf.js)
 *   - `playwright.preview.config.ts` → the built dist/ chunks
 *     (assets/X-Ab12Cd.js, assets/vendor-pdf-Ab12Cd.js)
 * so every matcher below accepts either naming.
 *
 * WHAT MUST HOLD
 *   1. Loading the homepage downloads no PDF/heavy/Leaflet code — not on first
 *      paint, and not a few seconds later on an idle callback.
 *   2. Hovering a link that carries `data-route` fetches THAT route's chunk
 *      (intent prefetch) and nothing else.
 *   3. Opening a public sample report renders the preview without the PDF
 *      renderer; the Download button is what fetches it.
 *   4. Opening the map picker is what fetches Leaflet.
 */

/** The PDF engine and the module that owns it (jspdf + html2canvas). */
const PDF_RENDERER_RE = /vendor-pdf|jspdf|html2canvas|jathagamPdfExporter/i;
/** Leaflet's JS/CSS (the map modal chunk is named after the library). */
const LEAFLET_RE = /leaflet|vendor-maps/i;
/** The chunk of a lazy page — dev serves it as a source module of the same name. */
const routeChunkRe = (page: string) => new RegExp(`${page}(\\.tsx)?[-.]`, 'i');
/** Every page that must never be fetched without the visitor asking for it. */
const ROUTE_PAGES = [
  'AdminPortal',
  'CustomerDashboard',
  'BirthJathagamPage',
  'MarriageCompatibilityPage',
  'BabyNamingPage',
  'MuhurthamPage',
  'ServicesPage',
  'HowItWorksPage',
  'AboutPage',
  'AstrologyTeamPage',
  'ContactPage',
  'PoliciesPage',
  'LoginPage',
  'RegisterPage',
  'LeafletMapPickerModal',
  'LivePdfPreviewModal',
  'UnifiedCheckoutModal',
  'FamilyCartDrawer',
  'AiAstrologerLauncher',
  'AiAstrologerPanel',
  'aiAstrologerApi',
];

/**
 * Trigger a control the way the UI does, without asking Playwright to place a
 * pointer at coordinates.
 *
 * WHY NOT click(): every control in this spec BOOTS a deferred feature in its
 * own click handler — the PDF engine (~950 kB) plus a three-page A4 raster, the
 * Leaflet chunk, the local astrology calculation. Playwright's click() needs
 * the page's main thread three times around that work: to prove the element is
 * visible/enabled/STABLE (two animation frames), to compute a clickable point,
 * and — after dispatching — to run its hit-target probe inside the page and
 * retry the whole action if the verdict changed. With the handler owning the
 * thread, that loop never gets its frames back and the run dies with a
 * misleading "locator.click: Test timeout of 180000ms exceeded" (CI runs
 * 38517294279 and 38518403692); forcing the click past those checks then
 * dispatches at coordinates nothing verified, and the handler is simply never
 * called (run 38519375452: zero renderer requests).
 *
 * element.click() IS the user's click at the DOM level — same event, same React
 * handler, bubbles the same way — it just does not require the main thread to be
 * free afterwards. The visible/enabled state that click()'s auto-wait would have
 * verified is asserted explicitly before every trigger here, and what these
 * tests pin is the network boundary anyway.
 */
async function trigger(control: Locator, label: string): Promise<void> {
  await expect(control, `${label} must be on screen before it can be triggered`).toBeVisible();
  await control.evaluate((element) => (element as HTMLButtonElement).click());
}

function trackRequests(page: Page, noise: RequestNoise): string[] {
  const requested: string[] = [];
  page.on('request', (request) => {
    try {
      requested.push(new URL(request.url()).pathname);
    } catch {
      requested.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') noise.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => noise.pageErrors.push(String(error.message || error)));
  return requested;
}

interface RequestNoise {
  consoleErrors: string[];
  pageErrors: string[];
}

const newNoise = (): RequestNoise => ({ consoleErrors: [], pageErrors: [] });

test.describe('deferred heavy features', () => {
  test('the homepage never downloads the PDF renderer, Leaflet, or another page chunk', async ({ page }) => {
    const noise = newNoise();
    const requested = trackRequests(page, noise);
    await page.goto('/', { waitUntil: 'networkidle' });

    // The removed prefetcher warmed all six heavy routes on requestIdleCallback.
    // Idle callbacks fire within a couple of seconds — this window is what
    // catches a regression that re-introduces it.
    await page.waitForTimeout(4000);

    const libraries = requested.filter((url) => PDF_RENDERER_RE.test(url) || LEAFLET_RE.test(url));
    expect(
      libraries,
      `the homepage must not download the PDF/map engines (audit PERF-1): ${libraries.join(', ')}`,
    ).toEqual([]);

    const pages = requested.filter((url) => ROUTE_PAGES.some((name) => routeChunkRe(name).test(url)));
    expect(pages, `page chunks were fetched without the visitor asking for them: ${pages.join(', ')}`).toEqual([]);
  });

  test('a signed-out visit downloads none of the AI astrologer', async ({ page }) => {
    // The chat exists for entitled customers (a delivered report) and admins.
    // A normal visit has no entitlement to check, so it must not fetch the
    // launcher, the panel or the chat API client — this is the guard that a
    // future "let's just render it always" change would break.
    const noise = newNoise();
    const requested = trackRequests(page, noise);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const ai = requested.filter((url) => /ai-astrologer|aiAstrologer/i.test(url));
    expect(ai, `a signed-out visit must not download the AI chat: ${ai.join(', ')}`).toEqual([]);
    await expect(page.getByRole('button', { name: /open astro sivam chat/i })).toHaveCount(0);
  });

  test('hovering a link prefetches that route — and only that route', async ({ page }) => {
    const noise = newNoise();
    const requested = trackRequests(page, noise);
    await page.goto('/', { waitUntil: 'networkidle' });
    const before = requested.length;

    // The homepage service card for the Birth Jathagam report ("Choose …").
    const link = page.locator('button[data-route="birth-jathagam"]:visible').first();
    await expect(link).toBeVisible();
    await link.hover();

    await expect
      .poll(() => requested.slice(before).some((url) => /BirthJathagamPage/i.test(url)), {
        timeout: 15000,
        message: 'hovering a data-route link must warm that chunk (intent prefetch)',
      })
      .toBe(true);

    const others = requested
      .slice(before)
      .filter((url) => ROUTE_PAGES.some((name) => routeChunkRe(name).test(url)) && !/BirthJathagamPage/i.test(url));
    expect(others, `intent prefetch must not warm other routes: ${others.join(', ')}`).toEqual([]);

    // The prefetched chunk must turn the click into a render, not a network wait.
    await link.click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
  });

  test('a sample report opens without the PDF renderer; Download fetches it', async ({ page }) => {
    // This is the heaviest flow in the app: open a three-page A4 report preview,
    // then rasterise it. CI containers are slower than any laptop — without the
    // extra budget the assertions below can starve the click of time.
    test.slow();
    const noise = newNoise();
    const requested = trackRequests(page, noise);
    await page.goto('/birth-jathagam', { waitUntil: 'networkidle' });

    const sampleButton = page.getByRole('button', { name: /sample report/i }).first();
    await expect(sampleButton).toBeVisible({ timeout: 15000 });
    const beforeOpen = requested.length;
    await trigger(sampleButton, 'the sample button');

    // The preview is ready once the download button is enabled (it is disabled
    // while the report HTML is still being built).
    const downloadButton = page.getByRole('button', { name: /download pdf/i }).first();
    await expect(downloadButton).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('iframe[title="Live PDF Report Preview"]')).toBeVisible();

    const renderer = requested.slice(beforeOpen).filter((url) => PDF_RENDERER_RE.test(url));
    expect(renderer, `opening a sample must not download the PDF engine: ${renderer.join(', ')}`).toEqual([]);

    // Download is the deferred boundary: the renderer is fetched now, because
    // the visitor asked for it — never while the preview was merely open.
    const beforeDownload = requested.length;
    await trigger(downloadButton, 'the download button');
    try {
      await expect
        .poll(() => requested.filter((url) => PDF_RENDERER_RE.test(url)).length, { timeout: 60000 })
        .toBeGreaterThan(0);
    } catch (error) {
      // Self-documenting failure: the next reader needs the request log and the
      // console/page errors, not just "expected > 0, received 0".
      throw new Error(
        `${(error as Error).message}\n`
          + `the Download click must fetch the PDF renderer on demand.\n`
          + `Requests after the click: ${JSON.stringify(requested.slice(beforeDownload))}\n`
          + `Console errors: ${JSON.stringify(noise.consoleErrors)}\n`
          + `Page errors: ${JSON.stringify(noise.pageErrors)}`,
      );
    }
  });

  test('the map picker fetches Leaflet only when it is opened', async ({ page }) => {
    const noise = newNoise();
    const requested = trackRequests(page, noise);
    await page.goto('/birth-jathagam', { waitUntil: 'networkidle' });

    const before = requested.filter((url) => LEAFLET_RE.test(url));
    expect(before, `Leaflet must not be part of a form page's initial load: ${before.join(', ')}`).toEqual([]);

    await trigger(page.getByRole('button', { name: /map pinpoint/i }).first(), 'the map pinpoint button');

    await expect(page.getByText('Pinpoint Exact Birth Village or Area on Map')).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => requested.filter((url) => LEAFLET_RE.test(url)).length, {
        timeout: 30000,
        message: 'opening the map picker must fetch Leaflet',
      })
      .toBeGreaterThan(0);
  });
});

// Production HTML must be useful even when the entry download is still pending.
// These tests intentionally serve empty JS: asserting DOM text alone would
// miss a full-screen splash hiding otherwise-correct prerendered content.
test.describe('immediate public page display', () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.request.get('/');
    test.skip(!((await response.text()).includes('data-prerendered="true"')), 'production build only');
    await page.route('**/assets/*.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  });

  for (const path of [
    '/', '/services', '/birth-jathagam', '/marriage-compatibility', '/baby-naming',
    '/muhurtham', '/how-it-works', '/about', '/team', '/contact', '/login', '/register',
    '/policy-privacy', '/policy-terms', '/policy-payment', '/policy-refund',
  ]) {
    test(`${path} displays real content without waiting for JavaScript`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#root h1').first()).toBeVisible();
      await expect(page.locator('#boot-splash')).toBeHidden();
      await expect(page.getByRole('status', { name: 'Loading page', exact: true })).toHaveCount(0);
    });
  }
});

test('changing pages keeps the current content visible while the destination downloads', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const heading = await page.locator('h1').first().textContent();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let intercepted!: () => void;
  const requested = new Promise<void>(resolve => { intercepted = resolve; });
  await page.route(/(?:AboutPage-.*\.js|\/src\/pages\/AboutPage\.tsx)/, async route => {
    intercepted();
    await gate;
    await route.continue();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'about' })));
    await requested;
    await expect(page.locator('h1').first()).toHaveText(heading!);
    await expect(page.getByRole('status', { name: 'Loading page', exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('h1').first()).not.toHaveText(heading!);
});

for (const path of ['/birth-jathagam', '/marriage-compatibility', '/baby-naming', '/muhurtham']) {
  test(`${path} leaves sample calculation and report rendering unloaded until requested`, async ({ page }) => {
    const requested: string[] = [];
    page.on('request', request => requested.push(request.url()));
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /sample report/i }).first()).toBeVisible();
    expect(requested.filter(url => /sampleReports[-.]|LivePdfPreviewModal|HtmlBuilder-|vendor-pdf-/.test(url))).toEqual([]);
  });
}

for (const path of ['/marriage-compatibility', '/baby-naming', '/muhurtham']) {
  test(`${path} still opens its sample with the existing report system`, async ({ page }) => {
    test.slow();
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(request.url()));
    await page.goto(path, { waitUntil: 'networkidle' });
    await trigger(page.getByRole('button', { name: /sample report/i }).first(), 'the sample button');
    await expect(page.locator('iframe[title="Live PDF Report Preview"]')).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: /download pdf/i }).first()).toBeEnabled({ timeout: 60000 });
    expect(requested.some(url => /sampleReports[-.]/.test(url))).toBe(true);
    expect(requested.filter(url => PDF_RENDERER_RE.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });
}
