/**
 * Installable PWA + transport-security contract.
 *
 * The offline worker intentionally caches ONLY offline.html. This is the
 * regression guard against the retired cache-first app shell, which could
 * serve a stale deployment, and against accidentally caching customer/API
 * data. The same suite pins method-preserving API HTTPS redirects and HSTS.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative: string) => fs.existsSync(path.join(root, relative));

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const manifest = JSON.parse(read('public/manifest.json'));
const index = read('index.html');
const main = read('src/main.tsx');
const worker = read('public/sw.js');
const offline = read('public/offline.html');
const publicApache = read('public/.htaccess');
const apiApache = read('api/.htaccess');
const apiConfig = read('api/config.php');
const apiClient = read('src/services/api.ts');

check('manifest.json is installable, scoped and uses the current light brand surface', () => {
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.display_override.includes('standalone'));
  assert.ok(manifest.display_override.includes('minimal-ui'));
  assert.equal(manifest.theme_color, '#fffaf2');
  assert.equal(manifest.background_color, '#fffaf2');
  assert.match(index, /<meta name="theme-color" content="#fffaf2"/);
  assert.ok(manifest.name && manifest.short_name && manifest.description);
});

check('the manifest ships regular and maskable 192/512 icons that actually exist', () => {
  for (const purpose of ['any', 'maskable']) {
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((entry: any) => entry.purpose === purpose && entry.sizes === size);
      assert.ok(icon, `missing ${purpose} ${size} icon`);
      assert.equal(icon.type, 'image/png');
      assert.ok(exists(`public${icon.src}`), `missing icon file ${icon.src}`);
    }
  }
  assert.equal(read('public/site.webmanifest'), read('public/manifest.json'),
    'the legacy manifest URL must not retain stale PWA metadata');
});

check('mobile Add to Home Screen metadata and secure production registration are wired', () => {
  assert.match(index, /<link rel="manifest" href="\/manifest\.json"/);
  assert.match(index, /<meta name="mobile-web-app-capable" content="yes"/);
  assert.match(index, /<meta name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(index, /<meta name="apple-mobile-web-app-title" content="ASTRO SIVAM"/);
  assert.match(main, /import\.meta\.env\.PROD && 'serviceWorker' in navigator && window\.isSecureContext/);
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/);
});

check('the offline page is self-contained, accessible and explicitly covers horoscope calculations', () => {
  assert.match(offline, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(offline, /Horoscope calculation tools/);
  assert.match(offline, /<a class="primary" href="">Try again<\/a>/);
  assert.match(offline, /<svg[^>]*role="img"/);
  assert.doesNotMatch(offline, /<script\b/i);
  assert.doesNotMatch(offline, /(?:src|href)="https?:\/\//i);
});

check('the service worker is valid and network-first, with no app/API cache revival', () => {
  new Script(worker, { filename: 'public/sw.js' });
  assert.match(worker, /cache\.addAll\(\[OFFLINE_URL\]\)/);
  assert.match(worker, /request\.mode !== 'navigate'\) return/);
  assert.match(worker, /return await fetch\(request\)/);
  assert.match(worker, /url\.pathname === '\/api' \|\| url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== OFFLINE_CACHE/);
  assert.doesNotMatch(worker, /\bcache\.put\s*\(/);
  assert.doesNotMatch(worker, /registration\.unregister\s*\(/);
  assert.doesNotMatch(worker, /Promise\.all\(keys\.map/, 'deletion must be scoped by the prefix filter, not a global clear');
  assert.match(apiClient, /const \{ calculateLocalAstrology \} = await import\('\.\/localAstrology'\)/,
    'the verified browser calculation fallback must remain available when API requests fail');
});

check('PWA files revalidate and manifest.json has the manifest MIME type', () => {
  assert.ok(publicApache.includes('(manifest\\.json|site\\.webmanifest|sw\\.js|offline\\.html)(\\.br|\\.gz)?'));
  assert.match(publicApache, /Header set Cache-Control "no-cache, must-revalidate"/);
  for (const pattern of ['^manifest\\.json$', '^manifest\\.json\\.br$', '^manifest\\.json\\.gz$']) {
    assert.ok(publicApache.includes(`<FilesMatch "${pattern}">`), `missing MIME rule for ${pattern}`);
  }
  assert.match(publicApache, /Header set Content-Type application\/manifest\+json/);
  assert.ok(publicApache.includes('^manifest\\.json\\.br$">\n    Header set Content-Encoding br'));
  assert.ok(publicApache.includes('^manifest\\.json\\.gz$">\n    Header set Content-Encoding gzip'));
});

check('every Apache API request redirects to HTTPS with method-preserving 308', () => {
  for (const [label, source] of [['public', publicApache], ['api', apiApache]] as const) {
    assert.match(source, /RewriteCond %\{HTTPS\} !on/);
    assert.match(source, /RewriteCond %\{HTTP:X-Forwarded-Proto\} !https/);
    assert.match(source, /https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=308,L(?:,NC)?\]/, `${label} API redirect must be 308`);
  }
  assert.match(publicApache, /RewriteRule \^api\(\?:\/\|\$\)/);
  assert.doesNotMatch(apiApache, /RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/);
});

check('HSTS covers the domain, subdomains and preload on site and API responses', () => {
  const directive = 'Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"';
  assert.ok(publicApache.includes(`Header always set ${directive}`));
  assert.ok(apiApache.includes(`Header always set ${directive}`));
  assert.doesNotMatch(publicApache, /Strict-Transport-Security[^\n]*env=HTTPS/);
  assert.match(apiConfig, /if \(astro_request_is_https\(\)\) \{\s*header\('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'\);/);
});

await checkAsync('worker runtime installs one offline file, cleans only its versions, and falls back correctly', async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => {
        for (const url of urls) {
          store.set(url, new Response('<!doctype html><title>Offline</title><h1>Offline fallback</h1>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }));
        }
      },
      match: async (url: string) => store.get(url),
    };
  };
  const cacheStorage = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  let claimed = false;
  const sandbox: any = {
    URL,
    Response,
    caches: cacheStorage,
    self: {
      location: { origin: 'https://astrosivam.com' },
      addEventListener: (type: string, listener: (event: any) => void) => { listeners[type] = listener; },
      skipWaiting: async () => undefined,
      clients: { claim: async () => { claimed = true; } },
    },
  };
  let networkOffline = false;
  let networkCalls = 0;
  sandbox.fetch = async () => {
    networkCalls += 1;
    if (networkOffline) throw new TypeError('offline');
    return new Response('fresh network document', { status: 200 });
  };
  createContext(sandbox);
  new Script(worker, { filename: 'public/sw.js' }).runInContext(sandbox);

  const dispatchLifecycle = async (type: 'install' | 'activate') => {
    let pending: Promise<void> | undefined;
    listeners[type]({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    assert.ok(pending, `${type} must extend the event lifetime`);
    await pending;
  };
  await dispatchLifecycle('install');
  assert.deepEqual([...stores.keys()], ['astrosivam-pwa-offline-v1']);
  assert.deepEqual([...stores.get('astrosivam-pwa-offline-v1')!.keys()], ['/offline.html']);

  stores.set('astrosivam-pwa-offline-v0', new Map());
  stores.set('another-feature-cache', new Map());
  await dispatchLifecycle('activate');
  assert.equal(claimed, true);
  assert.equal(stores.has('astrosivam-pwa-offline-v0'), false);
  assert.equal(stores.has('another-feature-cache'), true, 'an unrelated origin cache must survive');

  const navigate = async () => {
    let pending: Promise<Response> | undefined;
    listeners.fetch({
      request: { method: 'GET', mode: 'navigate', url: 'https://astrosivam.com/birth-jathagam' },
      respondWith: (promise: Promise<Response>) => { pending = promise; },
    });
    assert.ok(pending, 'a same-origin navigation must be handled');
    return pending!;
  };
  const onlineResponse = await navigate();
  assert.equal(await onlineResponse.text(), 'fresh network document');
  assert.equal(stores.get('astrosivam-pwa-offline-v1')!.size, 1, 'network HTML must not be cached');

  networkOffline = true;
  const offlineResponse = await navigate();
  assert.match(await offlineResponse.text(), /Offline fallback/);
  assert.equal(networkCalls, 2, 'both navigations must try the network first');

  for (const request of [
    { method: 'GET', mode: 'navigate', url: 'https://astrosivam.com/api/services/calculate-preview' },
    { method: 'POST', mode: 'navigate', url: 'https://astrosivam.com/birth-jathagam' },
    { method: 'GET', mode: 'cors', url: 'https://astrosivam.com/assets/app.js' },
    { method: 'GET', mode: 'navigate', url: 'https://example.com/' },
  ]) {
    let intercepted = false;
    listeners.fetch({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, `request must bypass the worker: ${request.url}`);
  }
});

console.log(`\n[OK] PWA and HTTPS contract: ${passed} checks passed`);
