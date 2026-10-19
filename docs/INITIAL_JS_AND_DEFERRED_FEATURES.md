# Initial JavaScript & Deferred Features (audit PERF-1)

**What changed:** the homepage used to download the whole application — the PDF
renderer, the map library, the astronomy engine, the admin portal, the report
pages and the cart/checkout code — because every one of those was reachable
through a *static* import from the app shell. They are now fetched when the
visitor actually uses the feature, and nothing is warmed "just in case".

Measured on the production build (`npm run build`, `dist/index.html`).

## Initial request set

| | Before | After |
|---|---|---|
| App entry `index-*.js` | 680.90 kB | 113.01 kB |
| `vendor-core-*.js` (React, helmet) | 628.41 kB | 255.30 kB |
| `vendor-pdf-*.js` (jspdf + html2canvas + raster helpers) | 545.64 kB | — deferred |
| `vendor-astrology-*.js` (astronomy engine, tz-lookup) | 130.35 kB | — deferred |
| `vendor-maps-*.js` (Leaflet) | 149.66 kB | — deferred |
| **Initial JavaScript** | **2 134.96 kB** (gzip ≈ 646 kB) | **377.15 kB / 368 kB** (gzip **108 kB**) |
| Stylesheet `index-*.css` | 239.27 kB | 233.70 kB (Leaflet's 15.6 kB left the global sheet) |
| `modulepreload` links in `index.html` | 4 (entry + React + PDF + astrology + maps) | **1** (vendor-core) |
| On `requestIdleCallback`, the browser also fetched | all 6 heavy route chunks (AdminPortal, dashboard, 4 report pages) | **nothing** |

Grep-verified: no `jsPDF`, `html2canvas` or `leaflet-container` byte is present
in the initial request set, and no route chunk is requested during idle.

## What now loads on demand

| Visitor action | Chunks fetched (raw) |
|---|---|
| Open a report page (e.g. `/birth-jathagam`) | page chunk 22 kB + `jathagamHtmlBuilder` 185 kB (its chart data) |
| Open a public sample report | `LivePdfPreviewModal` 18 kB + that report's builder only (+ `sampleReports`, `vendor-astrology` when the report needs an ephemeris) — the PDF engine is **not** touched |
| Click **Download** / **Send** | `pdfEngine` 1 kB (the shared cached loader) → `jathagamPdfExporter` 25 kB + the other builders + `vendor-pdf` 765 kB (cached for the tab) |
| Open the map picker | `LeafletMapPickerModal` 7 kB + `vendor-maps` 150 kB + Leaflet CSS 15.6 kB |
| Open the family tray / checkout | `FamilyCartDrawer` 14 kB / `UnifiedCheckoutModal` 40 kB + `BirthDateTimeFields` 42 kB + `multiPersonOrder` 12 kB |
| Open the AI astrologer (entitled customer or admin only) | `AiAstrologerLauncher` 2.7 kB + `aiAstrologerApi` 2.1 kB when a visitor signs in, then `AiAstrologerPanel` 54 kB on click |
| Open the admin portal | `AdminPortal` 391 kB + `vendor-charts` 419 kB — **no PDF engine**; it arrives only when Approve / Send / Download is clicked |
| Open the customer dashboard | `CustomerDashboard` 72 kB + `timezone` — **no PDF engine**; the download click fetches it |

A short loading state on the first use of each deferred feature is expected and
intentional (the sample viewer, the map modal and the AI panel each render a
themed spinner; the cart surfaces render nothing because they cover the page
anyway).

## How it was done (import paths, not route components alone)

1. **`vite.config.ts` — package-based `manualChunks`.** The old rules matched
   the module *path*, so every transitive dependency of jspdf/recharts
   (`canvg` 169 kB, `pako` 109 kB, `dompurify` 84 kB, redux/immer/d3 …) landed
   in `vendor-core`, the chunk the entry always imports. Chunking is now by
   package (`VENDOR_CHUNK_GROUPS` + `nodePackageName`), and the Vite
   **preload helper** is pinned to `vendor-core`: it is statically imported by
   every chunk that uses a dynamic import, and when Rollup parked it inside
   `vendor-pdf` the whole PDF chunk became a static dependency of the homepage
   (Vite even emitted a `modulepreload` for it).
2. **Leaflet out of `GooglePlacesPicker`** → new
   `src/components/common/LeafletMapPickerModal.tsx`, the only module that
   imports Leaflet and its CSS, mounted through `React.lazy` only while the map
   is open.
3. **The sample viewer** (`SampleReportButton`) lazy-loads
   `LivePdfPreviewModal` and mounts it only when open; the modal builds the
   preview from HTML and fetches the PDF engine only on Download/Send; the
   per-report HTML builders are *named chunks* so the preview's `import()`
   resolves to a builder instead of to the exporter chunk
   (`REPORT_BUILDER_CHUNKS` in `vite.config.ts`, pinned by tests).
   Since the dashboard/admin fix there is **one** dynamic boundary:
   `src/services/pdfEngine.ts` (`loadPdfEngine()`, promise cached for the tab)
   owns the only `import('./jathagamPdfExporter')`. The dashboard, the admin
   portal, the order modal, the order-items sender and the preview modal all
   import that loader statically (~1 kB) and `await` it inside the click
   handler that produces a PDF. A static `import … from 'jathagamPdfExporter'`
   anywhere in `src/` is a test failure — it used to attach the 765 kB
   `vendor-pdf` chunk to the dashboard and the admin portal on page load.
4. **Intent prefetch instead of idle prefetch** (`src/services/routeChunks.ts`):
   the idle warm-all is gone; links carrying `data-route` warm *their* chunk on
   `pointerenter`/`focusin`/`touchstart`, skipped on Save-Data / 2G. All
   navigation links in Navbar, Footer, HomePage and ServicesPage carry it.
5. **Remaining pages and the cart layer are lazy** (`App.tsx`): everything
   except the home/shell is a chunk, and the cart surfaces mount only while
   they are open.
6. **The AI astrologer is an entitlement, not the shell** (`App.tsx` +
   `AiAstrologerLauncher.tsx`): the chat serves entitled customers (a report the
   server confirmed as delivered) and admins, and a normal visit is neither — so
   the launcher is lazy AND gated on a signed-in `user`, and the panel is a
   second, click-time fetch inside it. A signed-out visit downloads **zero**
   AI bytes (previously the entry carried the launcher and the chat API client,
   ~4 kB); the sign-out path renders nothing and fetches nothing, exactly as
   before. "Paid users only" is enforced by the API (`aiAstrologer.usage()` on
   the server gate), which is why the browser still never decides access.

## Verification

- `tests/initial-js-budget.test.ts` (registered in `scripts/run-tests.mjs`,
  21 checks) — source contracts + built-output contracts: the initial request
  set is entry + `vendor-core` only, no deferred chunk is in it, `index.html`
  preloads nothing heavy, every deferred feature is still emitted and wired
  through dynamic imports, only `services/pdfEngine.ts` may import the
  exporter, only the exporter chunk may statically import `vendor-pdf`, every
  builder is its own chunk outside the PDF engine's chunk, and the initial JS
  stays under a 650 kB ceiling (it was 2.1 MB when the audit started).
- `tests/browser/deferred-features.spec.ts` — browser-level request assertions
  for the same rules (homepage, hover prefetch, sample open vs download, map
  open) plus "a signed-out visit downloads none of the AI astrologer". Runs against the dev server and the production preview.
- `tests/dist-shape.test.ts`, `tests/route-chunk-exports.test.ts` — widened to
  every lazy route, plus the map modal chunk.
- `npm test` (all node contracts) and `npm run lint` (`tsc --noEmit`) pass;
  `npm run build` succeeds.
