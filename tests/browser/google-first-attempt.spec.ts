import { test, expect, Page } from '@playwright/test';

/**
 * First-attempt Google sign-in / sign-up in a REAL browser.
 *
 * Reported: "when a new user registers or signs in with Google, the first
 * attempt does not log them in; after clicking Try Again once or twice it
 * works."
 *
 * A first-time visitor has nothing cached - not the Google Identity Services
 * script, not the public settings that carry the Google client id - so their
 * first click used to land before either had arrived and answered "Google
 * Sign-In could not be reached" / "is not configured for this site yet". These
 * tests drive the real app (/login and /register) with a fake Google SDK and a
 * fake API whose timing is under the test's control, and assert that ONE
 * click is enough in every one of those situations.
 *
 * Nothing here talks to Google or to a real backend:
 *   - https://accounts.google.com/gsi/client is answered by FAKE_SDK below;
 *   - /api/... is answered per test (settings, session lookup, Google login).
 *
 * The state machine, the retry rules and the PHP side have their own fast,
 * always-on suite: tests/google-login-first-attempt.test.ts.
 */

const CLIENT_ID = 'browser-test-client.apps.googleusercontent.com';

/** A stand-in for https://accounts.google.com/gsi/client with the token-client surface the app uses. */
const FAKE_SDK = `
(function () {
  window.google = {
    accounts: {
      id: {},
      oauth2: {
        initTokenClient: function (config) {
          return {
            requestAccessToken: function () {
              window.__recordPopup && window.__recordPopup();
              var mode = window.__gsiMode || 'success';
              setTimeout(function () {
                if (mode === 'success') {
                  config.callback({ access_token: 'fake-access-token', token_type: 'Bearer', expires_in: 3599 });
                } else if (mode === 'popup_closed') {
                  config.error_callback({ type: 'popup_closed' });
                } else if (mode === 'popup_blocked') {
                  config.error_callback({ type: 'popup_failed_to_open' });
                }
              }, 150);
            }
          };
        }
      }
    }
  };
})();
`;

interface Scenario {
  /** Delay before the fake SDK script is served. */
  sdkDelayMs?: number;
  /** The first N SDK downloads fail at the network level. */
  sdkFailures?: number;
  /** Delay before the public settings are answered. */
  settingsDelayMs?: number;
  /** Settings requests arriving before this many ms after navigation hang (the app aborts them at 4 s). */
  settingsHangForMs?: number;
  /** Every settings request fails at the network level until the test calls spy.setSettingsDown(false). */
  settingsDown?: boolean;
  /** The first N Google login POSTs answer HTTP 503. */
  loginFailures?: number;
  /** What the fake Google window does when opened. */
  popup?: 'success' | 'popup_closed' | 'popup_blocked';
}

interface Spy {
  popups: () => number;
  loginPosts: () => number;
  sdkRequests: () => number;
  setSettingsDown: (down: boolean) => void;
}

async function mockGoogleEnvironment(page: Page, scenario: Scenario = {}): Promise<Spy> {
  const { sdkDelayMs = 0, sdkFailures = 0, settingsDelayMs = 0, settingsHangForMs = 0, loginFailures = 0, popup = 'success' } = scenario;
  let settingsDown = scenario.settingsDown ?? false;
  let popups = 0;
  let loginPosts = 0;
  let sdkRequests = 0;
  let startedAt = 0;

  await page.exposeFunction('__recordPopup', () => {
    popups += 1;
  });
  await page.addInitScript(mode => {
    (window as any).__gsiMode = mode;
  }, popup);

  // Everything else under /api is irrelevant to this flow. Registered first so the specific routes below win.
  await page.route(/\/api\//, route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'not mocked' }) })
  );

  await page.route('https://accounts.google.com/gsi/client', async route => {
    sdkRequests += 1;
    if (sdkRequests <= sdkFailures) return route.abort('failed');
    if (sdkDelayMs) await new Promise(resolve => setTimeout(resolve, sdkDelayMs));
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK });
  });

  await page.route(/\/api\/services(\.php\?action=settings|\/settings)/, async route => {
    if (settingsDown) return route.abort('failed');
    const sinceStart = Date.now() - startedAt;
    if (settingsHangForMs && sinceStart < settingsHangForMs) {
      await new Promise(resolve => setTimeout(resolve, settingsHangForMs - sinceStart));
    } else if (settingsDelayMs) {
      await new Promise(resolve => setTimeout(resolve, settingsDelayMs));
    }
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, settings: { googleLoginEnabled: true, googleClientId: CLIENT_ID, activeThemeTemplate: 'classic-primary' } })
      })
      .catch(() => {});
  });

  await page.route(/\/api\/auth\/index\.php\?action=me/, route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Not authenticated' }) })
  );

  await page.route(/\/api\/auth\/(index\.php\?action=google|google)/, route => {
    loginPosts += 1;
    if (loginPosts <= loginFailures) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Service temporarily unavailable. Please try again shortly.' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        token: 'signed.test.token',
        user: { id: 'usr_new', name: 'New Person', email: 'new.person@example.test', mobile: '', role: 'customer', country: 'India' },
        birthProfile: null
      })
    });
  });

  // Called by the test right before navigation so "since start" timers begin there.
  (page as any).__markStart = () => {
    startedAt = Date.now();
  };

  return {
    popups: () => popups,
    loginPosts: () => loginPosts,
    sdkRequests: () => sdkRequests,
    setSettingsDown: down => {
      settingsDown = down;
    }
  };
}

async function open(page: Page, route: string) {
  (page as any).__markStart?.();
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  const button = page.locator('#google-login-btn');
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  return button;
}

const googleDialog = (page: Page) => page.getByRole('alertdialog', { name: /sign in with google/i });

for (const [route, label] of [
  ['/login', 'Continue with Google'],
  ['/register', 'Sign Up with Google']
] as const) {
  test.describe(`${route}: a first-time visitor's FIRST click`, () => {
    test('works while the Google SDK is still downloading (the button waits instead of failing)', async ({ page }) => {
      const spy = await mockGoogleEnvironment(page, { sdkDelayMs: 2500 });
      const button = await open(page, route);

      // Before the fix this was an enabled button that answered an early click with an error dialog.
      await expect(button).toBeDisabled();
      await expect(button).toContainText('Preparing Google sign-in');

      await expect(button).toBeEnabled({ timeout: 15_000 });
      await expect(button).toContainText(label);
      await button.click();

      await expect(page).toHaveURL(/\/dashboard/);
      expect(spy.popups()).toBe(1);
      expect(spy.loginPosts()).toBe(1);
      await expect(googleDialog(page)).toHaveCount(0);
    });

    test('works while the public settings (which carry the client id) are still loading', async ({ page }) => {
      const spy = await mockGoogleEnvironment(page, { settingsDelayMs: 2500 });
      const button = await open(page, route);
      await expect(button).toBeDisabled();
      await expect(button).toBeEnabled({ timeout: 15_000 });
      await button.click();
      await expect(page).toHaveURL(/\/dashboard/);
      expect(spy.popups()).toBe(1);
      await expect(googleDialog(page)).toHaveCount(0);
    });
  });
}

test.describe('registering from a service page (the sign-in dialog)', () => {
  test('"Quick Sign In" -> Google works on the first click even though the SDK has only just started downloading', async ({ page }) => {
    // The dialog mounts the button, so this is the first moment the SDK download can start.
    const spy = await mockGoogleEnvironment(page, { sdkDelayMs: 2000 });
    (page as any).__markStart?.();
    await page.goto('/birth-jathagam', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Quick Sign In' }).click();

    const authDialog = page.getByRole('dialog', { name: /sign in to continue your order/i });
    await expect(authDialog).toBeVisible();
    const button = authDialog.locator('#google-login-btn');
    await expect(button).toBeDisabled();
    await expect(button).toContainText('Preparing Google sign-in');
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();

    await expect(authDialog).toHaveCount(0, { timeout: 15_000 });
    expect(spy.popups()).toBe(1);
    expect(spy.loginPosts()).toBe(1);
    await expect(googleDialog(page)).toHaveCount(0);
  });
});

test.describe('/login: recovering without a page reload', () => {
  test('a settings request that times out (4 s) is retried in the background until the client id arrives', async ({ page }) => {
    // Every settings request in the first 5.5 s hangs. The app aborts its own at 4 s and used to
    // never ask again: "Try Again" could not succeed until the visitor reloaded the page.
    const spy = await mockGoogleEnvironment(page, { settingsHangForMs: 5500 });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.popups()).toBe(1);
    await expect(googleDialog(page)).toHaveCount(0);
  });

  test('when the settings stay unreachable the dialog says so, and "Try Again" fetches them again (no reload)', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { settingsDown: true });
    const button = await open(page, '/login');
    // Two quick background retries fail, then the button stops waiting and explains.
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await button.click();
    await expect(googleDialog(page)).toContainText('could not load the Google sign-in settings');

    spy.setSettingsDown(false); // connectivity is back
    await googleDialog(page).getByRole('button', { name: 'Try Again' }).click();
    await expect(googleDialog(page)).toHaveCount(0);
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await expect(button).toContainText('Continue with Google');
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.popups()).toBe(1);
  });

  test('a failed SDK download (offline blip) is retried automatically', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { sdkFailures: 1 });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.sdkRequests()).toBe(2);
    expect(spy.popups()).toBe(1);
  });

  test('when the SDK cannot be downloaded at all, the dialog explains it and "Try Again" downloads it again', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { sdkFailures: 3 });
    const button = await open(page, '/login');
    // 3 attempts (0 s, +0.7 s, +1.8 s) and then the button stops waiting.
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await expect(button).toContainText('Continue with Google');
    await button.click();
    await expect(googleDialog(page)).toContainText('could not be reached');
    await googleDialog(page).getByRole('button', { name: 'Try Again' }).click();
    await expect(googleDialog(page)).toHaveCount(0);
    expect(spy.sdkRequests()).toBeGreaterThanOrEqual(4);
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.popups()).toBe(1);
  });
});

test.describe('/login: the Google window', () => {
  test('closing it releases the button (it used to stay on "Connecting to Google..." forever) without a scary error', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { popup: 'popup_closed' });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toBeEnabled({ timeout: 5_000 });
    await expect(button).toContainText('Continue with Google');
    await expect(googleDialog(page)).toHaveCount(0);
    expect(spy.popups()).toBe(1);

    // And it can be used again straight away.
    await page.evaluate(() => {
      (window as any).__gsiMode = 'success';
    });
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.popups()).toBe(2);
  });

  test('a pop-up blocker is explained, and "Try Again" reopens Google', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { popup: 'popup_blocked' });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(googleDialog(page)).toContainText('blocked the Google sign-in window');
    await expect(button).toBeEnabled();

    await page.evaluate(() => {
      (window as any).__gsiMode = 'success';
    });
    await googleDialog(page).getByRole('button', { name: 'Try Again' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(spy.popups()).toBe(2);
  });
});

test.describe('/login: after the Google step', () => {
  test('a transient 503 is retried automatically with the same token - one Google window, one click', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { loginFailures: 1 });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    expect(spy.popups()).toBe(1);
    expect(spy.loginPosts()).toBe(2);
    await expect(googleDialog(page)).toHaveCount(0);
  });

  test('a lasting server failure is reported once, with the server message and a working "Try Again"', async ({ page }) => {
    const spy = await mockGoogleEnvironment(page, { loginFailures: 3 });
    const button = await open(page, '/login');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(googleDialog(page)).toContainText('Service temporarily unavailable', { timeout: 15_000 });
    expect(spy.loginPosts()).toBe(3);
    await expect(button).toBeEnabled();

    await googleDialog(page).getByRole('button', { name: 'Try Again' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    expect(spy.popups()).toBe(2);
  });
});
