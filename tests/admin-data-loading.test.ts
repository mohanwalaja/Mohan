import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync('src/services/api.ts', 'utf8');
const portalSource = readFileSync('src/pages/AdminPortal.tsx', 'utf8');
const adminLoader = portalSource.slice(
  portalSource.indexOf('  const fetchAdminData = async () => {'),
  portalSource.indexOf('  useEffect(() => {', portalSource.indexOf('  const fetchAdminData = async () => {'))
);

// The admin loader must be resilient: one unavailable section must not discard
// seven other successful responses or expose a browser's raw AbortError text.
assert.match(adminLoader, /Promise\.allSettled\(/);
assert.doesNotMatch(adminLoader, /Promise\.all\(/);
assert.match(adminLoader, /Some admin records could not be loaded/);
assert.match(adminLoader, /Refresh Records/);

// The 4-second controller remains a PUBLIC first-paint optimisation only. The
// authoritative admin settings request must not inherit it on slower mobile
// connections, where its AbortError used to blank the complete admin portal.
const adminSettingsMethod = apiSource.slice(
  apiSource.indexOf('  async getAdminSettings()'),
  apiSource.indexOf('  async updateAdminSettings(', apiSource.indexOf('  async getAdminSettings()'))
);
assert.doesNotMatch(adminSettingsMethod, /fetchSettingsWithTimeout|AbortController|\.abort\(/);

const storage = {
  length: 0,
  key: () => null,
  removeItem: () => {},
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

const { api } = await import('../src/services/api');
const originalFetch = globalThis.fetch;
let adminRequestInit: RequestInit | undefined;

try {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url !== '/api/admin/settings') throw new Error(`Unexpected request: ${url}`);
    adminRequestInit = init;
    return new Response(JSON.stringify({
      success: true,
      settings: { serviceMode: 'PAID' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const response = await api.getAdminSettings();
  assert.equal(response.success, true);
  assert.equal(response.settings.serviceMode, 'PAID');
  assert.equal(
    adminRequestInit?.signal,
    undefined,
    'admin settings must not carry the public first-paint abort signal'
  );
  assert.equal(adminRequestInit?.credentials, 'include');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Admin data loading regression checks passed: no first-paint abort and partial failures preserve loaded sections.');
