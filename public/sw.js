// Service worker RETIREMENT NOTICE (2026-10-12).
// The offline service worker was removed: its cache-first strategy served a
// stale app shell (and could cache 404/500 error pages) after each deploy,
// which risks a blank page for returning visitors. New visitors no longer
// register a worker (the registration block in src/main.tsx is gone). This
// file exists only so clients that ALREADY installed astrosivam-v1 clean up:
// on activate it deletes every cache and unregisters itself, then reloads
// open tabs once. It installs no fetch handler, so it stops intercepting
// network traffic immediately.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {
        /* caches unavailable — nothing to clear */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* already unregistered */
      }
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        for (const client of clients) {
          client.navigate(client.url);
        }
      } catch (e) {
        /* no open tabs to refresh */
      }
    })()
  );
});

