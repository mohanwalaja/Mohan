import { test, expect, type Page } from '@playwright/test';

/** Mock only API calls (fetch/xhr); Vite also serves report data modules from /api/. */
async function mockApi(page: Page) {
  await page.route('**/api/**', route => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') return route.continue();
    return route.fulfill({ json: { success: true } });
  });
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`homepage How it works link opens the process page on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockApi(page);
    await page.goto('/');

    const hero = page.locator('#introduction');
    // "View services" scrolls within the page, so it stays a button.
    await expect(hero.getByRole('button', { name: /^view services$/i })).toBeVisible();
    await expect(hero.getByRole('button', { name: 'See sample reports', exact: true })).toHaveCount(0);

    // Navigation is a real link (SEO audit 2026-10-15): crawlable, and it can be
    // opened in a new tab — with the canonical clean URL as its href.
    const howItWorks = hero.getByRole('link', { name: 'How it works', exact: true });
    await expect(howItWorks).toBeVisible();
    await expect(howItWorks).toHaveAttribute('href', '/how-it-works');
    // The home page no longer carries a sample-reports section; samples stay on each service page.
    await expect(page.locator('#sample-reports')).toHaveCount(0);

    await howItWorks.click();
    await expect(page.getByRole('heading', { name: 'How ASTRO SIVAM works', exact: true })).toBeVisible();
    // App.tsx resolves this page from the clean path (/how-it-works) and from
    // the legacy query route (?route=how-it-works); the link uses the clean
    // path. Accept both so a routing change cannot silently break the smoke
    // gate (this assertion was stale and never ran in CI until now).
    await expect(page).toHaveURL(/(?:[?&]route=how-it-works(?:&|$)|\/how-it-works\/?$)/);
  });
}

test('internal navigation is made of real links with canonical hrefs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/');

  // No navigation button survives anywhere on the homepage.
  await expect(page.locator('button[data-route]')).toHaveCount(0);

  const header = page.locator('header');
  for (const [name, href] of [
    ['ASTRO SIVAM home', '/'],
    ['Birth Jathagam', '/birth-jathagam'],
    ['Astrology Team', '/team']
  ] as const) {
    await expect(header.getByRole('link', { name, exact: true }).first()).toHaveAttribute('href', href);
  }

  // Footer policy links point at the canonical, prerendered URLs — not at the
  // /policy-* aliases that only exist to 301.
  const footer = page.locator('footer');
  const policyHrefs = await footer.locator('a[data-route^="policy-"]').evaluateAll(links =>
    links.map(link => link.getAttribute('href'))
  );
  expect(policyHrefs).toEqual(['/privacy-policy', '/terms', '/payment-policy', '/refund-policy']);
  for (const href of ['/services', '/how-it-works', '/about', '/contact', '/dashboard']) {
    await expect(footer.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
});

test('a plain click is an in-app transition: same document, canonical URL, Back works', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/');
  // A marker on window survives an SPA transition but not a document load.
  await page.evaluate(() => { (window as unknown as { __spaMarker: number }).__spaMarker = 42; });

  await page.locator('footer').getByRole('link', { name: 'Privacy Policy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __spaMarker?: number }).__spaMarker)).toBe(42);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#services a[data-route="birth-jathagam"]').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __spaMarker?: number }).__spaMarker)).toBe(42);
});

test('Ctrl/⌘-click and middle-click open the link in a new tab and leave the page alone', async ({ page, context, browser }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  // Watch the browser's own tab targets. Chrome opens the tab every time, but
  // Playwright's `page` event (emitted only once a new tab's first navigation
  // commits) proved timing-dependent for tabs the page did not open itself.
  const cdp = await browser.newBrowserCDPSession();
  // This tab's own target is excluded: an app that hijacked the click would
  // navigate THIS tab to the URL, which must not count as "opened a new tab".
  const pageSession = await context.newCDPSession(page);
  const { targetInfo: own } = await pageSession.send('Target.getTargetInfo');
  const tabUrls: string[] = [];
  const recordTab = ({ targetInfo }: { targetInfo: { targetId: string; type: string; url: string } }) => {
    if (targetInfo.type === 'page' && targetInfo.targetId !== own.targetId) tabUrls.push(targetInfo.url);
  };
  cdp.on('Target.targetCreated', recordTab);
  cdp.on('Target.targetInfoChanged', recordTab);
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  // New tabs get a stub document instead of a second full SPA.
  await context.route('**/birth-jathagam', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Opened in a new tab</title>' })
  );

  await page.goto('/', { waitUntil: 'networkidle' });
  // Record, after React's root listener has run, whether the app swallowed the click.
  await page.evaluate(() => {
    const log: Array<{ type: string; prevented: boolean }> = [];
    (window as unknown as { __linkClicks: typeof log }).__linkClicks = log;
    for (const type of ['click', 'auxclick']) {
      window.addEventListener(type, event => log.push({ type, prevented: event.defaultPrevented }));
    }
  });
  const serviceLink = page.locator('#services a[data-route="birth-jathagam"]').first();
  await expect(serviceLink).toHaveAttribute('href', '/birth-jathagam');

  for (const [label, click, eventType] of [
    ['Ctrl/⌘-click', () => serviceLink.click({ modifiers: ['ControlOrMeta'] }), 'click'],
    ['middle-click', () => serviceLink.click({ button: 'middle' }), 'auxclick']
  ] as const) {
    tabUrls.length = 0;
    await click();
    await expect
      .poll(() => tabUrls.some(url => /\/birth-jathagam$/.test(url)), { message: `${label} must open /birth-jathagam in a new tab` })
      .toBe(true);
    const last = await page.evaluate(() => (window as unknown as { __linkClicks: Array<{ type: string; prevented: boolean }> }).__linkClicks.at(-1));
    expect(last, `${label}: the app must leave the event to the browser`).toEqual({ type: eventType, prevented: false });
    // The original tab stayed where it was — no in-app navigation.
    await expect(page).toHaveURL(/\/$/);
  }
  await pageSession.detach();
  await cdp.detach();
});

test('every review links to the service page it is about, and the homepage ships its JSON-LD', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/');

  const reviews = page.locator('#reviews article');
  await expect(reviews.first()).toBeVisible();
  const count = await reviews.count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i += 1) {
    const href = await reviews.nth(i).locator('a[data-route]').first().getAttribute('href');
    expect(['/birth-jathagam', '/marriage-compatibility', '/baby-naming', '/muhurtham']).toContain(href);
    await expect(reviews.nth(i).locator('time[datetime]')).toBeVisible();
  }

  const types = await page.locator('script[type="application/ld+json"][data-schema]').evaluateAll(scripts =>
    scripts.map(script => {
      const data = JSON.parse(script.textContent || '{}');
      return [data['@type'], ...(data['@graph'] || []).map((node: { '@type': string }) => node['@type'])].filter(Boolean);
    }).flat()
  );
  expect(types).toContain('FAQPage');
  expect(types).toContain('Review');
  expect(types).toContain('Organization');
});

test('each page carries its own WebPage JSON-LD in the live DOM, and it follows SPA navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  // Rendered by <SEO> inside the page (not a baked head tag that main.tsx
  // strips at boot), so Google's rendered DOM has it and SPA navigation
  // swaps it. noindex pages carry none.
  const webPages = () => page.locator('script[type="application/ld+json"][data-schema="webpage"]').evaluateAll(scripts =>
    scripts.map(script => JSON.parse(script.textContent || '{}') as Record<string, unknown>));

  await page.goto('/');
  await expect.poll(webPages).toEqual([expect.objectContaining({ '@type': 'WebPage', '@id': 'https://astrosivam.com/' })]);

  await page.locator('footer a[href="/refund-policy"]').click();
  await expect(page).toHaveURL(/\/refund-policy$/);
  await expect.poll(webPages).toEqual([expect.objectContaining({
    '@id': 'https://astrosivam.com/refund-policy',
    name: 'Refund & Cancellation Policy | ASTRO SIVAM'
  })]);

  await page.locator('header a[href="/login"]').first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(webPages).toEqual([]);
});

test('published customer reviews load first, in view, as verified purchases — markup included', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', route => {
    const request = route.request();
    if (request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr') return route.continue();
    if (request.url().includes('/services/reviews')) {
      return route.fulfill({
        json: {
          success: true,
          reviews: [
            { id: 'rev_t1', serviceCode: 'MUHURTHAM', serviceRoute: 'muhurtham', rating: 4, title: 'Clear dates', body: 'The six-month calendar was easy to follow.', displayName: 'Arun S.', location: 'Toronto, Canada', publishedAt: '2026-10-13', verifiedPurchase: true },
            { id: 'rev_t2', serviceCode: 'BIRTH_JATHAGAM', serviceRoute: 'birth-jathagam', rating: 5, title: null, body: 'Kind and careful explanation of my dasa periods.', displayName: 'Lakshmi P.', location: null, publishedAt: '2026-10-11', verifiedPurchase: true }
          ],
          aggregate: { reviewCount: 2, ratingTotal: 9, ratingValue: 4.5 }
        }
      });
    }
    return route.fulfill({ json: { success: true } });
  });
  await page.goto('/');
  await page.locator('#reviews').scrollIntoViewIfNeeded();

  const first = page.locator('#reviews article').first();
  await expect(first).toContainText('Arun S.');
  await expect(first).toContainText('Verified purchase');
  await expect(first.locator('a[data-route="muhurtham"]')).toHaveAttribute('href', '/muhurtham');
  await expect(first.locator('time')).toHaveAttribute('datetime', '2026-10-13');
  // Prepending the fresh reviews must not leave the carousel re-snapped to an
  // older card with the new ones hidden off-screen to the left.
  await expect.poll(() => page.locator('.testimonial-scroll').evaluate(track => track.scrollLeft)).toBe(0);
  await expect(first).toBeInViewport();

  // 6 curated x 5 stars + the 2 published (9 stars) = 39 / 8.
  await expect(page.locator('#reviews')).toContainText('4.9 out of 5 · 8 reviews');
  const graph = await page.locator('script[data-schema="reviews"]').evaluate(script => JSON.parse(script.textContent || '{}')['@graph']);
  const reviewIds = graph.filter((node: { '@type': string }) => node['@type'] === 'Review').map((node: { '@id': string }) => node['@id']);
  expect(reviewIds.slice(0, 2)).toEqual(['https://astrosivam.com/#review-rev_t1', 'https://astrosivam.com/#review-rev_t2']);
  expect(graph.find((node: { aggregateRating?: unknown }) => node.aggregateRating).aggregateRating).toMatchObject({ ratingValue: 4.9, reviewCount: 8 });
});
