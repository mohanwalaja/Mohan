# Boot Splash — the mobile white screen (2026-10-14)

**Reported:** "I checked with 3 different mobile browsers. When opening
astrosivam.com, a white screen comes for ~2 seconds. After that the site works
fine. Can you remove the white screen?"

**Cause:** nothing was broken. The first paint of a cold visit is a sequence of
requests, and the *page had no styling of its own until the last one:*

| # | Request | Why it delays the first paint |
|---|---|---|
| 1 | `/` (`index.html`, prerendered, ~15 kB brotli) | the document itself — parseable immediately |
| 2 | `/assets/index-*.css` (~22 kB brotli) | **render-blocking**: the browser will not paint the document until it has the CSSOM. Every colour in the app — including the dark `#0b0718` canvas — lived here |
| 3 | `/assets/index-*.js` + `vendor-core-*.js` (~110 kB brotli) | the React bundle; until it runs, the page is the *prerendered* markup only |
| 4 | 3 preloaded WOFF2 faces (~104 kB) | competing for the same mobile link |

So on a phone the screen went: **white** (browser default canvas while the HTML
and its stylesheet are in flight) → *sometimes* the unstyled prerendered
markup → app. On a 3G/4G connection the whole window is ~2 s, which is exactly
what was reported.

## The fix

Paint the brand surface **from the HTML document alone**, before any request
completes, and hand the screen over to the app when the app is ready.

### 1. `index.html` — inline boot-critical surface

* `<html … style="background-color: #0b0718; color-scheme: dark">` — the
  earliest signal a browser can honour (it is known at tag-parse time).
* An inline `<style id="boot-critical">` straight after `<meta charset>` that
  paints `html, body` in the brand dark and defines the splash overlay.
  Inline because a `<link>` would be another render-blocking request; CSS
  because the CSP (`script-src 'self'`, no `'unsafe-inline'`) forbids an inline
  script and the splash must survive one.
* The splash markup itself (`#boot-splash`: rotating gold ring + dot + the
  ASTRO SIVAM wordmark) **before `#root`** — `scripts/prerender.mjs` fills
  `#root` with the route's content and the SEO body contract reads everything
  up to the last `</div>` before `</body>`, so nothing may follow it.
* No image and no font: a logo fetch would compete with the bundle on the same
  mobile connection and could arrive *after* the app — the splash would look
  broken precisely when it is finally visible. It uses the system serif stack.

Cost: **~5.1 kB raw / ~1.6 kB brotli** per document (it is inlined into all 18
prerendered documents, so it is budgeted and pinned by
`tests/boot-splash-contract.test.ts`).

### 2. `src/services/bootSplash.ts` — the hand-off

`dismissBootSplash()` fades the splash out and removes it from the DOM. It is
idempotent and null-safe, and it is called from every path that can own the
screen:

| Caller | When | Why there |
|---|---|---|
| `src/App.tsx` `RouteLoadedMarker` | the route actually rendered | normal path. It sits **inside** the `<Suspense>` boundary, so a lazy route's chunk is already resolved — the splash covers the chunk load instead of the visitor seeing the spinner |
| `src/main.tsx` (6 s timer) | app alive but no route ever committed | a render that throws outside the boundary, a chunk the recovery could not rescue: better to reveal the (by now fully styled) prerendered document than to spin forever |
| `ErrorBoundary.componentDidCatch` | a render crash | the support screen must not hide behind the splash |

### 3. Escape hatches — the splash can never trap a visitor

1. `<noscript><style>#boot-splash{display:none!important}</style></noscript>` —
   a browser without scripting goes straight to the prerendered document.
2. `@keyframes boot-splash-escape … 8s forwards` (sets `opacity: 0;
   visibility: hidden`) — covers a document where `main.tsx` never runs at all:
   a stale deploy whose entry chunk 404s, a wrong content-encoding, an
   extension blocking the bundle.
3. The JS give-up timer (6 s), cross-checked in the test to fire *before* the
   CSS fallback.

`prefers-reduced-motion` drops the ring rotation; the splash itself (a fade)
stays, because it is a state change, not decoration.

## What did NOT change

* The prerendered documents, the SEO head tags and `data-prerender-seo`
  removal are untouched.
* The app stylesheet is still a normal render-blocking `<link>`. Making it
  asynchronous would need an inline `onload` script (blocked by the CSP) and
  would trade a white flash for a flash of unstyled prerendered markup — worse
  on a content site. The splash covers the wait instead.
* No font, icon or image was added to the critical path.

## Verification

```bash
npm run build     # 18 documents, .br/.gz siblings refreshed
npm test          # includes tests/boot-splash-contract.test.ts (18 checks)
```

On a phone (or DevTools → Network → Slow 4G + throttled CPU):

* The first frame after the tap is the dark splash with the gold ring — never
  white, in any browser.
* The splash fades into the finished page; the prerendered content is never
  visible as raw markup.

## Follow-ups that would shorten the wait itself (not the white screen)

1. **Cloudflare edge cache for the HTML** — `docs/CLOUDFLARE_CDN_SETUP.md`
   § Cache Rule 3 (Edge TTL 1 hour + purge on deploy). `public/.htaccess` sends
   `ExpiresByType text/html "access plus 0 seconds"`, so every visit re-fetches
   the document from the cPanel origin: that TTFB is the single biggest
   remaining part of the ~2 s. Purge after each deploy or skip it entirely.
2. **Trim the font preloads** — the three preloaded faces are ~104 kB on the
   same initial connection as the bundle. Dropping the two Playfair faces (the
   hero would swap fonts a beat later) frees that bandwidth for the bundle.
   Deliberately left alone here: `tests/self-hosted-fonts.test.ts` pins the
   current three, and font swapping is visible.
