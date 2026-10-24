// ASTRO SIVAM offline fallback service worker.
//
// CACHE SAFETY: the retired astrosivam-v1 worker cached the application shell
// cache-first, which could serve stale or broken deployments. This worker never
// caches app HTML, JavaScript, API responses, account pages or calculation data.
// It precaches ONLY the self-contained offline page and uses the network first
// for every navigation. A failed navigation therefore cannot resurrect an old
// app shell, and APIs continue straight to the existing local calculation
// fallback in src/services/api.ts without service-worker interference.
const CACHE_PREFIX = 'astrosivam-pwa-';
const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v1`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.addAll([OFFLINE_URL]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove only versions owned by this worker. Never clear caches belonging
      // to another feature on the same origin.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept APIs, including calculate-preview. The application already
  // falls back to its verified browser-side astrology engine when requests fail.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  // Non-navigation assets use their normal browser HTTP cache. In particular,
  // no immutable bundle is copied into a long-lived Cache Storage entry here.
  if (request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      try {
        // Network-first always: successful responses, including deploys and
        // error statuses, are returned untouched and are never stored here.
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(OFFLINE_CACHE);
        const offlinePage = await cache.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;

        // This is needed only if Cache Storage was cleared after installation.
        return new Response(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline | ASTRO SIVAM</title><body><h1>You are offline</h1><p>Reconnect to load your horoscope calculation, then try again.</p></body></html>',
          {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          }
        );
      }
    })()
  );
});
