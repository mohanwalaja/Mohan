import { defineConfig } from '@playwright/test';

/**
 * Production-preview smoke for the code-split build (audit S1).
 *
 * Unlike playwright.config.ts (dev server), this config runs the SAME route
 * specs against `vite preview` serving the real dist/ output — the exact asset
 * layout that ships to cPanel. This is the white-screen gate: chunk 404s and
 * folder-shape problems only exist in the built output.
 *
 * Requires `npm run build` first. Usage:
 *   npx playwright test --config playwright.preview.config.ts
 */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /(route-lazy-loading|deferred-features)\.spec\.ts/,
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'npx vite preview --host 0.0.0.0 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
