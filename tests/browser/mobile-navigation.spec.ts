import { test, expect, type Page } from '@playwright/test';

/** Mock only API calls (fetch/xhr); Vite still serves report data from /api/. */
async function mockApi(page: Page) {
  await page.route('**/api/**', route => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') return route.continue();
    return route.fulfill({ json: { success: true } });
  });
}

/**
 * Report (2026-10-21): "In mobile navbar add astrology team page — in desktop
 * already there". The Astrology Team page was filtered out of the phone menu, so
 * on a phone /team could not be reached from the navigation at all.
 *
 * This is the phone-only check: the desktop row is CSS-hidden below lg, so the
 * link a visitor actually taps is the one inside the opened menu.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('the phone menu offers the Astrology Team page and opens it', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByText('About Us', { exact: true })).toBeVisible();

  const teamLink = page.getByTestId('mobile-nav-team');
  await expect(teamLink).toBeVisible();
  await expect(teamLink).toHaveText(/Astrology Team/);
  await expect(teamLink).toHaveAttribute('href', '/team');

  await teamLink.click();
  await expect(page).toHaveURL(/\/team\/?$/);
  // The menu must close behind the visitor.
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
});

test('the phone menu still lists every service, and only once', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });

  for (const [testId, href] of [
    ['mobile-nav-home', '/'],
    ['mobile-nav-birth_jathagam', '/birth-jathagam'],
    ['mobile-nav-marriage_compatibility', '/marriage-compatibility'],
    ['mobile-nav-baby_naming', '/baby-naming'],
    ['mobile-nav-muhurtham', '/muhurtham'],
    ['mobile-nav-team', '/team'],
    ['mobile-nav-how_it_works', '/how-it-works']
  ]) {
    await expect(page.getByTestId(testId)).toHaveCount(1);
    await expect(page.getByTestId(testId)).toHaveAttribute('href', href);
  }

  await expect(mobileNav.getByRole('link', { name: /Astrology Team/ })).toHaveCount(1);
});
