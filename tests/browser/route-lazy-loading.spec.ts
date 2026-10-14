import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * Route smoke for the code-split build (audit S1, hardened after the
 * 2026-10-13 `__VITE_PRELOAD__` outage).
 *
 * Runs against BOTH the dev server (default playwright.config.ts) and the
 * production preview (playwright.preview.config.ts, `npm run build` output —
 * including the .br/.gz content negotiation public/.htaccess performs on
 * cPanel) — the production run is the white-screen gate: every route must
 * render real content, every lazy chunk must load (no failed JS/CSS requests),
 * and the Suspense fallback must not be what the visitor is left staring at.
 *
 * THREE assertion families, each born from a way this smoke once lied:
 *   1. `#root` > 80 chars — catches blank roots, but the ErrorBoundary page
 *      ("ASTRO SIVAM failed to load…") is ALSO > 80 chars, so 2. exists;
 *   2. the ErrorBoundary text must NEVER appear, and the [role="status"]
 *      spinner must not be stuck;
 *   3. `page.on('console')` misses uncaught synchronous exceptions (they
 *      arrive as `pageerror` — the `__VITE_PRELOAD__` ReferenceError escaped
 *      every console check in the original smoke). Any pageerror fails.
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

/**
 * The ErrorBoundary's rendered text (src/components/common/ErrorBoundary.tsx):
 * the route-level boundary is titled "ASTRO SIVAM failed to load", the global
 * one falls back to "ASTRO SIVAM application error", and both render the same
 * support paragraph. None of it may ever be what a visitor sees.
 */
const ERROR_BOUNDARY_TEXT_RE = /ASTRO SIVAM (?:failed to load|application error)|Please screenshot this page/i;

/** Aggregated across every test in this file — written to the CI step summary. */
const smokeSummary = {
  directLoads: 0,
  navSteps: 0,
  pageErrors: [] as string[],
  boundaryHits: [] as string[],
  consoleErrors: [] as string[],
  failedAssets: [] as string[],
};

interface PageNoise {
  consoleErrors: string[];
  pageErrors: string[];
  failedAssets: string[];
}

function armNoiseCollection(page: Page): PageNoise {
  const noise: PageNoise = { consoleErrors: [], pageErrors: [], failedAssets: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The harness has no PHP backend: /api 404s and their fetch rejections
    // are expected noise. Everything else is a real error.
    if (/\/api\//.test(text) || /Failed to load resource.*\/api\//.test(text)) return;
    if (/Failed to load resource/.test(text) && msg.location().url.includes('/api/')) return;
    noise.consoleErrors.push(text);
  });
  // Uncaught exceptions — including synchronous throws during module/lazy
  // factory evaluation — surface here and ONLY here. The __VITE_PRELOAD__
  // ReferenceError reached production without appearing in any console
  // event, which is why this collector exists.
  page.on('pageerror', (err) => {
    noise.pageErrors.push(String(err?.message ?? err));
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

/**
 * Expected `rel=canonical` href for a route. Direct loads pass paths
 * (/services, /policy-privacy); in-app navigation steps pass App route keys
 * (admin, home). Legacy policy aliases canonicalize to their real path.
 */
function expectedCanonical(route: string): string {
  const aliases: Record<string, string> = {
    '/policy-privacy': '/privacy-policy',
    '/policy-terms': '/terms',
    '/policy-payment': '/payment-policy',
    '/policy-refund': '/refund-policy',
  };
  if (aliases[route]) return `https://astrosivam.com${aliases[route]}`;
  if (route === '/' || route === 'home' || route.startsWith('home ')) return 'https://astrosivam.com/';
  return `https://astrosivam.com${route.startsWith('/') ? route : `/${route}`}`;
}

/**
 * The white-screen contract for a single page state: real content, no
 * ErrorBoundary, no stuck Suspense spinner. The 80-char poll alone is
 * insufficient — the ErrorBoundary renders happily past 80 chars, AND since
 * the SEO prerender (audit 2026-10-14) the static document body is non-empty
 * even when the bundle never boots. The head assertions below close that hole:
 * the baked [data-prerender-seo] tags must be gone (main.tsx ran) and React
 * must have hoisted exactly one <title> and one self-referencing canonical
 * (the SPA actually mounted and Helmet ran).
 */
async function expectHealthyPage(page: Page, route: string): Promise<void> {
  await expect
    .poll(async () => (await page.locator('#root').innerText()).trim().length, { timeout: 15000 })
    .toBeGreaterThan(80);
  const text = await page.locator('#root').innerText();
  if (ERROR_BOUNDARY_TEXT_RE.test(text)) {
    smokeSummary.boundaryHits.push(route);
  }
  expect(
    text,
    `ErrorBoundary rendered on ${route} — the route failed to load and recovery did not kick in`,
  ).not.toMatch(ERROR_BOUNDARY_TEXT_RE);
  await expect(page.locator('[role="status"][aria-label="Loading page"]')).toHaveCount(0);
  await expect(page.locator('[data-prerender-seo]')).toHaveCount(0);
  await expect(page.locator('head > title')).toHaveCount(1);
  await expect(page.locator('head > link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('head > link[rel="canonical"]')).toHaveAttribute(
    'href',
    expectedCanonical(route),
  );
}

function expectNoPageErrors(noise: PageNoise, context: string): void {
  smokeSummary.pageErrors.push(...noise.pageErrors.map((e) => `${context}: ${e}`));
  expect(noise.pageErrors, `uncaught page errors on ${context}`).toEqual([]);
}

test.afterAll(() => {
  // CI proof-of-execution: the 2026-10 incident showed job status APIs can
  // report success while steps sit "pending". This marker can only appear if
  // this spec file ran to completion, so the workflow greps for it.
  const lines = [
    '### Route lazy-loading smoke',
    '',
    `- direct route loads checked: **${smokeSummary.directLoads}**`,
    `- in-app lazy navigation steps checked: **${smokeSummary.navSteps}**`,
    `- uncaught page errors: **${smokeSummary.pageErrors.length}**`,
    `- ErrorBoundary renders: **${smokeSummary.boundaryHits.length}**`,
    `- console errors: **${smokeSummary.consoleErrors.length}**`,
    `- failed static assets: **${smokeSummary.failedAssets.length}**`,
    '',
    'ROUTE-SMOKE-SUMMARY-OK',
    '',
  ];
  if (smokeSummary.pageErrors.length) lines.push(`- page errors: ${smokeSummary.pageErrors.join(' | ')}`, '');
  if (smokeSummary.boundaryHits.length) lines.push(`- boundary hits: ${smokeSummary.boundaryHits.join(', ')}`, '');
  const markdown = lines.join('\n');
  console.log(
    `ROUTE-SMOKE-SUMMARY direct=${smokeSummary.directLoads} nav=${smokeSummary.navSteps} pageerrors=${smokeSummary.pageErrors.length} boundary=${smokeSummary.boundaryHits.length}`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    } catch {
      // A summary write must never fail the suite.
    }
  }
});

test.describe('every route renders content (no white screen)', () => {
  for (const route of ROUTES) {
    test(`direct load: ${route}`, async ({ page }) => {
      const noise = armNoiseCollection(page);
      await page.goto(route, { waitUntil: 'networkidle' });
      // Real content, not a blank root, not a stuck Suspense spinner and — the
      // assertion the original smoke was missing — not the ErrorBoundary.
      await expectHealthyPage(page, route);
      smokeSummary.directLoads += 1;
      smokeSummary.consoleErrors.push(...noise.consoleErrors);
      smokeSummary.failedAssets.push(...noise.failedAssets);
      expect(noise.failedAssets, `failed static assets on ${route}`).toEqual([]);
      expect(noise.consoleErrors, `console errors on ${route}`).toEqual([]);
      expectNoPageErrors(noise, `direct load ${route}`);
    });
  }
});

test.describe('in-app navigation across lazy routes', () => {
  test('navigating from home to every heavy route and back never blanks out', async ({ page }) => {
    const noise = armNoiseCollection(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expectHealthyPage(page, '/');

    for (const route of LAZY_ROUTES) {
      // Drive the app's own router (the same window event the app listens to),
      // so the test does not depend on nav-link labels / translations.
      await page.evaluate((r) => window.dispatchEvent(new CustomEvent('app:navigate', { detail: r })), route);
      await expectHealthyPage(page, route);
      smokeSummary.navSteps += 1;
      // The Suspense fallback must not appear again on already-loaded chunks:
      // return home and come back — content must be instant (still non-empty).
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'home' })));
      await expectHealthyPage(page, 'home (return)');
    }

    smokeSummary.consoleErrors.push(...noise.consoleErrors);
    smokeSummary.failedAssets.push(...noise.failedAssets);
    expect(noise.failedAssets, 'failed static assets during in-app navigation').toEqual([]);
    expect(noise.consoleErrors, 'console errors during in-app navigation').toEqual([]);
    expectNoPageErrors(noise, 'in-app navigation');
  });
});
