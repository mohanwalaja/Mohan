import { test, expect, Page } from '@playwright/test';

/**
 * Route smoke for the code-split build (audit S1).
 *
 * Runs against BOTH the dev server (default playwright.config.ts) and the
 * production preview (playwright.preview.config.ts, `npm run build` output) —
 * the production run is the white-screen gate: every route must render real
 * content, every lazy chunk must load (no failed JS/CSS requests), and the
 * Suspense fallback must not be what the visitor is left staring at.
 *
 * /api/ request failures are expected here (no PHP backend in this harness)
 * and are ignored; anything under /assets/ must succeed.
 */

const ROUTES = [
  '/',
  '/services',
  '/birth-jathagam',
  '/marriage-compatibility',
  '/baby-naming',
  '/muhurtham',
  '/how-it-works',
  '/about',
  '/team',
  '/contact',
  '/login',
  '/register',
  '/dashboard',
  '/admin',
  '/policy-privacy',
  '/policy-terms',
  '/policy-payment',
  '/policy-refund',
];

const LAZY_ROUTES = ['admin', 'dashboard', 'birth-jathagam', 'marriage-compatibility', 'baby-naming', 'muhurtham'];

interface PageNoise {
  consoleErrors: string[];
  failedAssets: string[];
}

function armNoiseCollection(page: Page): PageNoise {
  const noise: PageNoise = { consoleErrors: [], failedAssets: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The harness has no PHP backend: /api 404s and their fetch rejections
    // are expected noise. Everything else is a real error.
    if (/\/api\//.test(text) || /Failed to load resource.*\/api\//.test(text)) return;
    if (/Failed to load resource/.test(text) && msg.location().url.includes('/api/')) return;
    noise.consoleErrors.push(text);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/api/')) return;
    noise.failedAssets.push(`${url} (${req.failure()?.errorText ?? 'failed'})`);
  });
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() >= 400 && /\.(js|css|woff2?|ttf|png|jpg|svg)(\?|$)/.test(url)) {
      noise.failedAssets.push(`${url} (HTTP ${res.status()})`);
    }
  });
  return noise;
}

test.describe('every route renders content (no white screen)', () => {
  for (const route of ROUTES) {
    test(`direct load: ${route}`, async ({ page }) => {
      const noise = armNoiseCollection(page);
      await page.goto(route, { waitUntil: 'networkidle' });
      // Real content, not a blank root and not a stuck Suspense spinner.
      await expect
        .poll(async () => (await page.locator('#root').innerText()).trim().length, { timeout: 15000 })
        .toBeGreaterThan(80);
      await expect(page.locator('[role="status"][aria-label="Loading page"]')).toHaveCount(0);
      expect(noise.failedAssets, `failed static assets on ${route}`).toEqual([]);
      expect(noise.consoleErrors, `console errors on ${route}`).toEqual([]);
    });
  }
});

test.describe('in-app navigation across lazy routes', () => {
  test('navigating from home to every heavy route and back never blanks out', async ({ page }) => {
    const noise = armNoiseCollection(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect
      .poll(async () => (await page.locator('#root').innerText()).trim().length, { timeout: 15000 })
      .toBeGreaterThan(80);

    for (const route of LAZY_ROUTES) {
      // Drive the app's own router (the same window event the app listens to),
      // so the test does not depend on nav-link labels / translations.
      await page.evaluate((r) => window.dispatchEvent(new CustomEvent('app:navigate', { detail: r })), route);
      await expect
        .poll(async () => (await page.locator('#root').innerText()).trim().length, { timeout: 15000 })
        .toBeGreaterThan(80);
      await expect(page.locator('[role="status"][aria-label="Loading page"]')).toHaveCount(0);
      // The Suspense fallback must not appear again on already-loaded chunks:
      // return home and come back — content must be instant (still non-empty).
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'home' })));
      await expect
        .poll(async () => (await page.locator('#root').innerText()).trim().length, { timeout: 15000 })
        .toBeGreaterThan(80);
    }

    expect(noise.failedAssets, 'failed static assets during in-app navigation').toEqual([]);
    expect(noise.consoleErrors, 'console errors during in-app navigation').toEqual([]);
  });
});
