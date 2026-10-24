# PWA, Offline Fallback and Transport Security

## Installable app

- `public/manifest.json` is the canonical Web App Manifest. It declares the `/` scope and start URL, `standalone` display with a `minimal-ui` override fallback, the current light theme/background colours, and 192/512 px regular and maskable icons.
- `public/site.webmanifest` remains as a byte-identical legacy URL for previously installed versions. New pages link only to `/manifest.json`.
- `index.html` includes Android and iOS Add to Home Screen metadata. Production pages register `/sw.js` only in a secure context; development/HMR never registers the worker.
- The manifest and worker are covered by `Cache-Control: no-cache, must-revalidate`, so they do not inherit the one-year TTL used for hashed bundles.

## Offline calculations and cache boundary

`public/offline.html` is a self-contained, no-script fallback for failed navigations, including the horoscope calculation routes. It tells the visitor to reconnect and retry; it never submits an order or payment.

The service worker deliberately has a narrow cache policy:

1. It precaches **only** `/offline.html`.
2. Every navigation is network-first and successful responses are not copied into Cache Storage.
3. `/api` and `/api/*` are never intercepted, nor are non-navigation bundles or customer/account data.
4. Activation removes only old `astrosivam-pwa-*` versions, never every cache on the origin.

This avoids the retired worker's stale cache-first app-shell behaviour. When an already-loaded calculation cannot reach its API, the existing `api.calculatePreview()` path still falls back to the verified TypeScript `calculateLocalAstrology()` engine. A new page still needs its application tools to have loaded before those client-side calculations can run; the offline document is the navigation fallback, not a claim that every feature works on a first offline visit.

## HTTPS and HSTS

- The root Apache rules redirect `http://astrosivam.com/api...` to HTTPS with **308**, preserving POST/PUT methods and bodies. Ordinary page requests retain their canonical 301 redirect.
- `api/.htaccess` repeats the API 308 guard before legacy aliases and routers, including unknown API routes.
- Both Apache configurations send `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` on all responses. Browsers ignore HSTS on plain HTTP; sending it unconditionally also covers TLS-offloading proxies where the origin does not set its own HTTPS flag.
- `api/config.php` repeats the header for config-backed HTTPS PHP responses on hosts that do not consume `.htaccess`.
- `X-Forwarded-Proto: https` is honoured at the Apache redirect so a TLS-terminating edge does not create a loop.

The domain already carries the `preload` token. Actual inclusion in browser preload lists is a separate, long-term operational commitment: submit the domain to the HSTS preload service only after confirming that **every current and future subdomain supports HTTPS**. Do not treat the response header alone as proof that the domain has been accepted into that list.

## Verification

`tests/pwa-and-https-contract.test.ts` checks the manifest/icons, mobile install metadata, offline document, narrow service-worker cache boundary, API 308 redirects, and HSTS directives. After deployment, also check:

```bash
curl -I https://astrosivam.com/manifest.json
curl -I http://astrosivam.com/api/services/calculate-preview
curl -I https://astrosivam.com/api/services/calculate-preview
```

Expected results: the manifest has a manifest JSON content type; the plain-HTTP API responds 308 to its HTTPS URL; and the HTTPS API response includes the one-year HSTS header. Use an actual POST smoke test for checkout/webhook routing rather than issuing a state-changing curl request against production.
