import { test, expect, type Page } from '@playwright/test';

/**
 * "Rate your report" — the link in every delivery email of a paid order
 * (api/reviews.php): https://astrosivam.com/dashboard?review=<order number>.
 *
 * A customer arrives on a fresh page load, often signed out. The dashboard
 * must keep the invitation across the sign-in detour, open the review form of
 * exactly that order once the server lists it as reviewable, and explain when
 * it is not (another account, not delivered, refunded...).
 */

const USER = { id: 'usr_invite', name: 'Kavita Maharaj', email: 'kavita@example.test', role: 'customer', country: 'Australia' };
const ORDER = {
  id: 'ord_invite_1',
  orderNumber: 'ORD-INV111',
  userId: USER.id,
  userName: USER.name,
  userEmail: USER.email,
  userMobile: '',
  serviceType: 'BIRTH_JATHAGAM',
  language: 'en',
  country: 'Australia',
  currency: 'USD',
  amount: 18,
  serviceMode: 'PAID',
  paymentMethod: 'PAYPAL',
  paymentStatus: 'CAPTURED',
  status: 'COMPLETED',
  emailStatus: 'SENT',
  emailDeliveryAttempts: 1,
  inputPayload: { name: 'Kavita Maharaj', dob: '1990-05-15', tob: '06:30', birthPlace: 'Chennai, India', gender: 'female' },
  hasPdf: true,
  hasInvoice: true,
  refundStatus: 'NONE',
  createdAt: '2026-10-10T10:00:00Z'
};

/** Mocks the API (fetch/xhr only — Vite also serves report data modules from /api/). */
async function mockApi(page: Page, state: { signedIn: boolean; sessionCheckDelayMs?: number }) {
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr') return route.continue();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    let body: Record<string, unknown> = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const signedOut = () => route.fulfill({ status: 401, json: { success: false, message: 'Please sign in.' } });

    if (action === 'me' || url.pathname.endsWith('/auth/me')) {
      if (state.sessionCheckDelayMs) await new Promise(resolve => setTimeout(resolve, state.sessionCheckDelayMs));
      return state.signedIn ? route.fulfill({ json: { success: true, user: USER } }) : signedOut();
    }
    if (request.method() === 'POST' && body.action === 'login') {
      state.signedIn = true;
      return route.fulfill({ json: { success: true, token: 'test-only-token', user: USER } });
    }
    if (url.pathname.includes('/services/my-reviews')) {
      if (!state.signedIn) return signedOut();
      return route.fulfill({
        json: { success: true, reviews: [], eligibleOrders: [{ orderId: ORDER.id, orderNumber: ORDER.orderNumber, services: ['BIRTH_JATHAGAM'] }] }
      });
    }
    if (url.pathname.includes('my-orders') || action === 'my-orders') {
      return state.signedIn ? route.fulfill({ json: { success: true, orders: [ORDER] } }) : signedOut();
    }
    return route.fulfill({ json: { success: true } });
  });
}

const reviewDialog = (page: Page) => page.getByRole('dialog');
// The dashboard is a lazy route chunk; on a cold dev server (CI) its first
// transform can take a few seconds, so the FIRST wait of each test is longer.
const FIRST_PAINT = { timeout: 15_000 };

test('a signed-in customer lands straight in the review form of the emailed order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  // A slow session check (GET /api/auth/me): the dashboard mounts before it
  // knows the customer, so reviews must load when the session resolves.
  await mockApi(page, { signedIn: true, sessionCheckDelayMs: 1500 });
  await page.goto('/dashboard?review=ORD-INV111');

  const dialog = reviewDialog(page);
  await expect(dialog).toBeVisible(FIRST_PAINT);
  await expect(dialog).toContainText('Order #ORD-INV111');
  // The address bar no longer carries the invitation: a reload must not reopen it.
  await expect(page).toHaveURL(/\/dashboard$/);

  await dialog.getByRole('button', { name: 'Close review form' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // Reviews have loaded again (the card offers its review) — and nothing reopens.
  await expect(page.getByRole('button', { name: 'Rate & review' })).toBeVisible();
  await expect(reviewDialog(page)).toHaveCount(0);
});

test('a signed-out customer keeps the invitation through sign-in, then the form opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = { signedIn: false };
  await mockApi(page, state);
  await page.goto('/dashboard?review=ORD-INV111');

  const pending = page.locator('[data-review-invite-pending]');
  await expect(pending).toBeVisible(FIRST_PAINT);
  await expect(pending).toContainText('#ORD-INV111');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('link', { name: 'Log In to Account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('input[type="email"]').fill(USER.email);
  await page.locator('input[type="password"]').fill('correct horse battery staple');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  const dialog = reviewDialog(page);
  await expect(dialog).toBeVisible(FIRST_PAINT);
  await expect(dialog).toContainText('Order #ORD-INV111');
});

test('an order this account cannot review is explained, not silently ignored', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await mockApi(page, { signedIn: true });
  await page.goto('/dashboard?review=ORD-SOMEONE-ELSE');

  const notice = page.locator('[data-review-notice="info"]');
  await expect(notice).toBeVisible(FIRST_PAINT);
  await expect(notice).toContainText('Order #ORD-SOMEONE-ELSE cannot be reviewed from this account');
  await expect(reviewDialog(page)).toHaveCount(0);
  // The customer's own reviewable order is still offered on its card.
  await expect(page.getByRole('button', { name: 'Rate & review' })).toBeVisible();
});
