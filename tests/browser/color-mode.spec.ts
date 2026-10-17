import { test, expect } from '@playwright/test';

test('light is the public default; the icon-only switch remembers a visitor’s choice', async ({ page }) => {
  await page.goto('/');
  const shell = page.locator('#root > div').first();
  const toggle = page.getByRole('switch', { name: 'Dark mode' });

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('');
  await expect(toggle.locator('svg')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(shell).toHaveAttribute('data-user-design', 'ivory');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('astrosivam_color_mode'))).toBeNull();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(shell).not.toHaveAttribute('data-user-design', 'ivory');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('astrosivam_color_mode'))).toBe('dark');

  await page.goto('/services');
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#root > div').first()).not.toHaveAttribute('data-user-design', 'ivory');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('#root > div').first()).toHaveAttribute('data-user-design', 'ivory');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'false');

  // The admin portal remains dark and does not expose the customer control.
  await page.goto('/admin');
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await expect(page.locator('#root > div').first()).not.toHaveAttribute('data-user-design', 'ivory');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
});

test('Services catalogue keeps high-contrast light copy and its original dark banner', async ({ page }) => {
  await page.goto('/services');
  const eyebrow = page.getByText('Vedic astrology services', { exact: true });
  const banner = page.locator('.services-guided-banner');

  await expect(eyebrow).toHaveCSS('color', 'rgb(113, 57, 17)');
  await expect(banner.locator('p')).toHaveCSS('color', 'rgb(88, 70, 56)');
  const lightBackground = await banner.evaluate(element => getComputedStyle(element).backgroundImage);

  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(banner.locator('p')).not.toHaveCSS('color', 'rgb(88, 70, 56)');
  const darkBackground = await banner.evaluate(element => getComputedStyle(element).backgroundImage);
  expect(darkBackground).not.toBe(lightBackground);
});

test('the icon-only switch is visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});
