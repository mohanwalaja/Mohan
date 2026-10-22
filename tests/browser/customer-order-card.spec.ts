import { test, expect, type Page } from '@playwright/test';

/** An actual dashboard render: no PHP server or customer data is needed. */
const USER = { id: 'customer_1', name: 'Asha Gupta', email: 'asha@example.test', mobile: '', role: 'customer', country: 'India' };
const base = {
  userId: USER.id, userEmail: USER.email, userMobile: '', country: 'India',
  currency: 'USD', serviceMode: 'PAID', paymentMethod: 'PAYPAL', paymentStatus: 'CAPTURED',
  emailDeliveryAttempts: 1, hasInvoice: true, refundStatus: 'NONE'
};
const orders = [
  {
    ...base, id: 'single', orderNumber: 'ORD-101', userName: USER.name, serviceType: 'BIRTH_JATHAGAM',
    language: 'en', amount: 18, status: 'COMPLETED', emailStatus: 'SENT',
    emailSentAt: '2026-10-20T11:00:00Z', hasPdf: true, hasReportSnapshot: true,
    inputPayload: { name: USER.name, dob: '1990-05-15', tob: '06:30', birthPlace: 'Chennai, India' },
    createdAt: '2026-10-20T10:00:00Z'
  },
  {
    ...base, id: 'family-one', groupId: 'FAM-201', groupOrderIndex: 0, orderNumber: 'ORD-201',
    userName: 'Riya Gupta', serviceType: 'BIRTH_JATHAGAM', language: 'ta', amount: 0, serviceMode: 'FREE_BETA',
    status: 'COMPLETED', emailStatus: 'SENT', hasPdf: true, hasReportSnapshot: true,
    inputPayload: { name: 'Riya Gupta', dob: '2014-06-01', tob: '07:00', birthPlace: 'Delhi, India' },
    createdAt: '2026-10-19T10:00:00Z'
  },
  {
    ...base, id: 'family-two', groupId: 'FAM-201', groupOrderIndex: 1, orderNumber: 'ORD-202',
    userName: 'Dev Gupta', serviceType: 'MUHURTHAM', language: 'hi', amount: 18,
    status: 'COMPLETED', emailStatus: 'SENT', hasPdf: true, hasReportSnapshot: true,
    inputPayload: { name: 'Dev Gupta', dob: '1989-08-12', tob: '11:30', birthPlace: 'Delhi, India' },
    createdAt: '2026-10-19T10:00:00Z'
  },
  {
    ...base, id: 'multi', orderNumber: 'ORD-301', userName: USER.name, serviceType: 'MULTI_PERSON',
    language: 'en', amount: 36, status: 'COMPLETED', emailStatus: 'SENT', hasPdf: true,
    persons: [], items: [
      { id: 301, personName: 'Priya Gupta', serviceCode: 'BABY_NAMING', reportStatus: 'SENT', hasReportSnapshot: true, language: 'en' },
      { id: 302, personName: 'Arun Gupta', serviceCode: 'BIRTH_JATHAGAM', reportStatus: 'SENT', hasReportSnapshot: true, language: 'ta' }
    ],
    createdAt: '2026-10-18T10:00:00Z'
  },
  {
    ...base, id: 'pending', orderNumber: 'ORD-401', userName: 'Kiran Gupta', serviceType: 'BABY_NAMING',
    language: 'en', amount: 18, status: 'PENDING', emailStatus: 'FAILED', hasPdf: false,
    inputPayload: { name: 'Kiran Gupta', dob: '2025-03-04', tob: '12:00', birthPlace: 'Delhi, India' },
    createdAt: '2026-10-17T10:00:00Z'
  }
];

async function mockDashboard(page: Page) {
  await page.route('**/api/**', async route => {
    if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.continue();
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    if (action === 'me' || url.pathname.endsWith('/auth/me')) {
      return route.fulfill({ json: { success: true, user: USER } });
    }
    if (url.pathname.includes('my-orders') || action === 'my-orders') {
      return route.fulfill({ json: { success: true, orders } });
    }
    if (url.pathname.includes('my-reviews')) {
      return route.fulfill({ json: { success: true, reviews: [], eligibleOrders: [] } });
    }
    return route.fulfill({ json: { success: true } });
  });
}

test('profile order cards match the admin layout, keep expansion, and put only download icons beside names', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockDashboard(page);
  await page.goto('/dashboard');

  const single = page.locator('[data-profile-order-card="single"]');
  const family = page.locator('[data-profile-order-card="family-one"]');
  const multi = page.locator('[data-profile-order-card="multi"]');
  const pending = page.locator('[data-profile-order-card="pending"]');
  await expect(page.locator('[data-profile-order-card]')).toHaveCount(4, { timeout: 20_000 });
  await expect(single.getByText('#ORD-101')).toBeVisible();
  await expect(single.getByText('Birth Jathagam', { exact: true })).toBeVisible();
  await expect(single.getByText('Order & Payment Information')).toHaveCount(0);
  const singleIcon = single.getByRole('button', { name: 'Download Report — Asha Gupta' });
  await expect(singleIcon).toBeVisible();
  await expect(singleIcon).toHaveText('');
  await expect(single.locator('[data-frozen-download]')).toHaveCount(0);
  await single.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(single.getByText('Order & Payment Information')).toBeVisible();
  await expect(family.getByText('Family Members (2)')).toHaveCount(0);
  await single.getByRole('button', { name: 'Hide details' }).click();
  await expect(single.getByText('Order & Payment Information')).toHaveCount(0);
  await single.getByRole('button', { name: 'View details for Asha Gupta' }).click();
  await expect(single.getByText('Order & Payment Information')).toBeVisible();
  await single.getByRole('button', { name: 'Hide details' }).click();

  await expect(family).toContainText('$18.00 USD'); // bundle, not the first free chart
  await family.getByRole('button', { name: 'View details for Riya Gupta + 1 more' }).click();
  await expect(family.getByText('Family Members (2)')).toBeVisible();
  await family.getByRole('button', { name: 'Hide details' }).click();
  await family.getByRole('button', { name: '2 Charts' }).click();
  const riya = family.getByRole('button', { name: 'Download Report — Riya Gupta' });
  const dev = family.getByRole('button', { name: 'Download Report — Dev Gupta' });
  await expect(riya).toBeVisible();
  await expect(dev).toBeVisible();
  await expect(riya).toHaveText('');
  await expect(dev).toHaveText('');
  await family.locator('button[aria-controls="person-details-family-two"]').click();
  await expect(family.locator('#person-details-family-two')).toContainText('1989-08-12');
  await expect(family.locator('#person-details-family-one')).toHaveCount(0);

  await expect(multi.getByRole('button', { name: 'Download Report — Asha Gupta' })).toHaveCount(0);
  await multi.getByRole('button', { name: '2 Reports' }).click();
  await expect(multi.getByRole('button', { name: 'Download Report — Priya Gupta' })).toHaveText('');
  await expect(multi.getByRole('button', { name: 'Download Report — Arun Gupta' })).toHaveText('');
  await expect(pending.getByText('Email Delivery Failed / Bounced')).toBeVisible();
  await expect(pending.getByRole('button', { name: 'Update Email & Retry Delivery' })).toBeVisible();
  await expect(pending.getByRole('button', { name: /^Download Report/ })).toHaveCount(0);

  // Responsive layout: the name and its icon remain in the same inset panel.
  await page.setViewportSize({ width: 375, height: 812 });
  const nameBox = await single.getByText('Asha Gupta', { exact: true }).boundingBox();
  const iconBox = await singleIcon.boundingBox();
  expect(nameBox && iconBox).toBeTruthy();
  expect(iconBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width - 1);
  expect(iconBox!.x + iconBox!.width).toBeLessThan(375);
  const memberBox = await family.getByText('Dev Gupta', { exact: true }).boundingBox();
  const memberIconBox = await dev.boundingBox();
  expect(memberBox && memberIconBox).toBeTruthy();
  expect(memberIconBox!.x).toBeGreaterThan(memberBox!.x + memberBox!.width - 1);
  await expect(dev).toBeVisible();
  const itemBox = await multi.getByText('Priya Gupta', { exact: true }).boundingBox();
  const itemIconBox = await multi.getByRole('button', { name: 'Download Report — Priya Gupta' }).boundingBox();
  expect(itemBox && itemIconBox).toBeTruthy();
  expect(itemIconBox!.x).toBeGreaterThan(itemBox!.x + itemBox!.width - 1);

  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(singleIcon).toBeVisible();
  await expect(single).toHaveCSS('background-color', /oklch\(0\.208\b/);
});
