# SEO Static Prerender Fix (empty shell / homepage canonicals / dead hreflang)

**Date:** 2026-10-14 · **Severity:** Critical · **Status:** FIXED

## The audit findings

An external SEO audit of astrosivam.com reported three critical, compounding
problems:

1. **Every page served an identical, empty HTML shell.** All 16 sitemap routes
   returned byte-for-byte identical HTML containing only
   `<body><div id="root"></div></body>`. No prerendering, no bot cloaking —
   Googlebot and `facebookexternalhit` received the same empty shell. Google
   indexes raw HTML first, so the entire site (services, prices, copy, trust
   signals) was invisible to crawlers and to social link previews.

2. **Canonical tags pointed every page back to the homepage.** Because the
   shell was static, `/services`, `/about`, `/contact`… all shipped
   `rel=canonical` + `og:url` = `https://astrosivam.com/`, and titles/meta
   descriptions were identical across all URLs. Any rendered interior page
   would be treated as a duplicate of the homepage and consolidated away.

3. **hreflang was declared but pointed to nothing.** The sitemap advertised
   `?lang=ta` / `?lang=hi` alternates that served the identical English shell
   (`<html lang="en">`). Translation is client-side only, so the hreflang was
   meaningless to search engines.

## The fix

No framework migration was needed: the site deploys as static files to cPanel,
so the fix is **build-time prerendering** of per-route documents, wired into
`npm run build`:

```
vite build --manifest && node scripts/prerender.mjs
```

### 1. Real per-route HTML (`scripts/prerender.mjs`)

After the bundle is written, every public route is rendered to a full HTML
document with `react-dom/server` — the same Navbar + page + Footer inside the
same provider stack the SPA uses. React 19 hoists each page's `<title>`,
`<meta>` and `<link>` tags (react-helmet-async v3 relies on that hoisting);
prerender splits those into `<head>` and keeps the rendered body inside
`#root`. Crawlers that never run JS now see the complete page; link
previews (WhatsApp, Facebook, X) show the real title/description/image.

The head tags come **from the pages' own `<SEO>` blocks**, so the static
document and the live SPA can never disagree. `dist/<route>.html` also gets a
`WebPage` JSON-LD entity; the site-wide Organization graph stays in every
document.

### 2. Self-referencing canonicals everywhere

- The prerender **fails the build** if any route's canonical is not
  `https://astrosivam.com<path>` or if two routes share a `<title>`.
- `src/components/common/SEO.tsx` no longer defaults a missing canonical to
  the homepage — it derives the current path (`defaultCanonical()`).
- `MuhurthamPage` (which had forgotten its canonical) now passes one
  explicitly; login/register carry `noindex`.
- Physical `<route>.html` URLs 301 to the clean path via `.htaccess`
  (`%{THE_REQUEST}`-keyed, so the internal rewrite cannot loop). Legacy
  aliases (`/muhurtha`, `/privacy`, `/policy-terms`, `/home`, …) 301 to their
  canonical clean URL.

### 3. hreflang dropped until languages are server-rendered

`public/sitemap.xml` is now generated from the prerender route table
(`renderSitemap()`) and contains **no** `xhtml:link` / `hreflang` / `?lang=`
alternates. `og:locale:alternate` is gone from `index.html`. The contract test
fails if any of them reappear. Reintroduce only when each language has its own
server-rendered document.

## Serving model (important)

The route documents are **flat files** (`dist/services.html`, …), never one
directory per route — `tests/dist-shape.test.ts` / `scripts/create_dist_zip.py`
freeze the cPanel root folder list at `{assets, audio, video-scenes}` forever.

`public/.htaccess` rule (g) internally rewrites the clean URL
(`/services`) to `/services.html` when the file exists; the browser keeps the
clean URL and the document's canonical names it. Each written file gets fresh
`.br`/`.gz` siblings (stale ones are deleted first) because the .htaccess
negotiates text assets to the pre-compressed copies — a stale `index.html.br`
would otherwise keep serving the old empty shell.

When the SPA boots, `src/main.tsx` removes the baked `[data-prerender-seo]`
head tags before `createRoot` mounts. React 19 re-hoists its own identical
tags; leaving both copies would let the first page's stale title/canonical
survive SPA navigation. `vite preview` mirrors the clean-URL mapping
(`previewServePrerendered`), so the Playwright preview smoke exercises the
same routing production uses.

## Guardrails (so this cannot regress silently)

`tests/seo-prerender-contract.test.ts` (runs in `npm test`):

- build script must run `vite build --manifest` **and** `scripts/prerender.mjs`;
- `public/sitemap.xml` must equal `renderSitemap()` output byte-for-byte;
- no hreflang / `?lang=` alternates in sitemap, `index.html`, `404.html` or
  any shipped source (comments excluded);
- every indexable page source must declare its self-canonical; utility routes
  must carry `noindex`;
- `.htaccess` must rewrite clean URLs to `$1.html` (guarded on file existence)
  and must not fall back to the shell for prerendered routes;
- with `dist/` present: every route document exists as a flat file with a
  unique `<title>`, exactly one self-referencing canonical, correct robots
  polarity, ≥400 visible characters of body text (≥50 for noindex gates), no
  leftover `/src/` dev URLs, and `.br`/`.gz` siblings that decompress to the
  exact bytes of the file they accompany.

`tests/browser/route-lazy-loading.spec.ts` (dev + production preview smoke)
now also asserts, per route: exactly one `<title>`, exactly one
self-referencing canonical, and zero `[data-prerender-seo]` nodes after boot —
which doubles as proof that React actually mounted (the static body alone can
no longer fake a healthy page).

## Deliberate follow-ups (not in this change)

- Server-rendered Tamil/Hindi documents (`/ta/…`, `/hi/…`) + hreflang — until
  then the alternates stay out of the sitemap by design.
- Self-hosting the Google Fonts families (pre-existing perf advisory).
- `npm run dev` intentionally serves the SPA shell (no prerender); the
  prerendered documents exist in `dist/` after `npm run build`.
