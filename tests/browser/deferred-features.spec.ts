import { test, expect, type Page } from '@playwright/test';

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

function trackRequests(page: Page): string[] {
  const requested: string[] = [];
  page.on('request', (request) => {
    try {
      requested.push(new URL(request.url()).pathname);
    } catch {
      requested.push(request.url());
    }
  });
  return requested;
}

test.describe('deferred heavy features', () => {
  test('the homepage never downloads the PDF renderer, Leaflet, or another page chunk', async ({ page }) => {
    const requested = trackRequests(page);
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
    const requested = trackRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const ai = requested.filter((url) => /ai-astrologer|aiAstrologer/i.test(url));
    expect(ai, `a signed-out visit must not download the AI chat: ${ai.join(', ')}`).toEqual([]);
    await expect(page.getByRole('button', { name: /open astro sivam chat/i })).toHaveCount(0);
  });

  test('hovering a link prefetches that route — and only that route', async ({ page }) => {
    const requested = trackRequests(page);
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
    const requested = trackRequests(page);
    await page.goto('/birth-jathagam', { waitUntil: 'networkidle' });

    const sampleButton = page.getByRole('button', { name: /sample report/i }).first();
    await expect(sampleButton).toBeVisible({ timeout: 15000 });
    const beforeOpen = requested.length;
    // noWaitAfter: the handler computes the fixed sample (astronomy engine, on
    // the main thread) and fetches two chunks — see the note on the Download
    // click below for why the post-click hit-target probe must not be awaited.
    await sampleButton.click({ noWaitAfter: true });

    // The preview is ready once the download button is enabled (it is disabled
    // while the report HTML is still being built).
    const downloadButton = page.getByRole('button', { name: /download pdf/i }).first();
    await expect(downloadButton).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('iframe[title="Live PDF Report Preview"]')).toBeVisible();

    const renderer = requested.slice(beforeOpen).filter((url) => PDF_RENDERER_RE.test(url));
    expect(renderer, `opening a sample must not download the PDF engine: ${renderer.join(', ')}`).toEqual([]);

    // Clicking Download is the deferred boundary: the renderer is fetched now.
    //
    // noWaitAfter is REQUIRED here, not a shortcut. After dispatching a click,
    // Playwright evaluates the "did the hit target move?" probe inside the page
    // and waits for it — but everything this handler does next runs on that same
    // main thread: it dynamic-imports the PDF engine (jspdf + html2canvas,
    // ~950 kB) and then rasterises every A4 page. The probe therefore cannot
    // answer until the render finishes, so a plain click() sits there until the
    // test times out and reports a misleading "locator.click: Test timeout"
    // (observed in CI on run 38517294279, 2026-10-14). The assertion that
    // actually matters is the one below: the renderer chunk is fetched only
    // because this click happened.
    await downloadButton.click({ noWaitAfter: true });
    await expect
      .poll(() => requested.filter((url) => PDF_RENDERER_RE.test(url)).length, {
        timeout: 60000,
        message: 'the download must fetch the PDF renderer on demand',
      })
      .toBeGreaterThan(0);
  });

  test('the map picker fetches Leaflet only when it is opened', async ({ page }) => {
    const requested = trackRequests(page);
    await page.goto('/birth-jathagam', { waitUntil: 'networkidle' });

    const before = requested.filter((url) => LEAFLET_RE.test(url));
    expect(before, `Leaflet must not be part of a form page's initial load: ${before.join(', ')}`).toEqual([]);

    // noWaitAfter: this click pulls the Leaflet chunk and mounts the map on the
    // main thread, which stalls Playwright's post-click hit-target probe.
    await page.getByRole('button', { name: /map pinpoint/i }).first().click({ noWaitAfter: true });

    await expect(page.getByText('Pinpoint Exact Birth Village or Area on Map')).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => requested.filter((url) => LEAFLET_RE.test(url)).length, {
        timeout: 30000,
        message: 'opening the map picker must fetch Leaflet',
      })
      .toBeGreaterThan(0);
  });
});
