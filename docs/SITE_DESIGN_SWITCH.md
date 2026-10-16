# Site Design switch — two designs, chosen in the admin panel (2026-10-16)

ASTRO SIVAM ships **two designs** and the operator picks which one visitors
see. Nothing was replaced: the classic dark/indigo design is still the default
and still serves exactly the bytes it served before.

| | Classic (dark) | Sunrise Ivory (light) |
| --- | --- | --- |
| id | `classic-primary` (default) | `sunrise-ivory` |
| source | repo root (`src/`) | `light/` (its own Vite app) |
| assets | `/assets/index-*.{js,css}` | `/assets/light/index-*.{js,css}` |
| documents | `dist/index.html`, `dist/pages/<route>.html` | `dist/pages/index-light.html`, `dist/pages/<route>-light.html` |
| covers | every page | the public pages only (home, the four services, How It Works, About, Astrology Team, Contact, the four policy pages) |

Both designs are the same site: same logo, same brand name and slogan, same
wording, same route slugs, same canonical URLs, same sitemap.

## How the switch works

1. **Admin → Site Design** (`src/components/admin/DesignPanel.tsx`) saves
   `activeThemeTemplate` through `PUT /api/admin/settings`. The settings PUT
   (`api/admin/index.php`) validates the id against the two shipped designs
   (an unknown id is rejected with HTTP 400 and never stored) and then calls
   `astro_sync_design_marker()` (`api/config.php`).
2. That helper **creates or deletes `api/.design-light`** — the activation
   marker. It returns `{ design, markerPath, markerWritten, message }` as
   `designSwitch` on the response, and the panel shows the message (a refused
   write is surfaced, never swallowed).
3. **`public/.htaccess` rule (f2)** — *while that marker exists* — rewrites the
   clean URLs (`/`, `/services`, `/birth-jathagam`, …, `/privacy-policy`) to
   `pages/<route>-light.html`. `login`, `register`, `dashboard` and `admin`
   are not in the list, so the signed-in and operator surfaces keep the classic
   interface under both designs, and the ordering/checkout flow stays classic
   for now. With the marker absent, the classic rules (g) run unchanged — the
   dark design keeps today's static path.

The choice is therefore a **static rewrite**, not a client-side redirect: no
deploy, no PHP in a page view, and a visitor never sees a URL change. If the
host refuses the marker write (read-only `api/`), the site deliberately stays
on the classic design and the panel says so.

4. **Reverse direction.** A light document can outlive the setting that produced
   it (an open tab, a direct `-light.html` link after the operator switched
   back). `light/src/main.tsx` calls `resolveLightDocumentDesign()`
   (`src/services/designSwitch.ts`), which reads the public settings
   (`api/services.php?action=settings`, now also normalising
   `activeThemeTemplate`) and navigates to the classic page for that path when
   the design is no longer light. The fetch is not awaited — the app paints
   immediately — and a network failure or a design-less payload keeps the light
   document, because the rewrite itself already implies the light design was
   selected.

## Building and verifying

`npm run build` = classic build + classic prerender (`scripts/prerender.mjs`) +
light deploy build (`--mode light-deploy`, into `dist/assets/light/`) + light
prerender (`scripts/prerender-light.mjs`, writes the `-light.html` documents
with `.br`/`.gz` siblings). The light documents reuse the classic per-route
head tags, so titles, descriptions, canonicals, OG/Twitter tags and JSON-LD are
identical between the two documents of a route.

`tests/site-design-switch.test.ts` pins the closed set of design ids on both
sides of the wire, the marker name, the four excluded routes, the rewrite
order in `.htaccess`, the build order, the admin panel wiring, the boot gate
(executed, not read) and — when `dist/` exists — the shipped light documents
against the same crawlability/SEO guards the classic ones pass.

Local demo of the server-side switch (the preview server mirrors rule (f2)):

```bash
npm run build && npm run preview     # classic site on :4173
touch api/.design-light              # now every clean URL serves the light design
rm api/.design-light                 # back to the classic design
```

`api/.design-light` is runtime state of a live host and is git-ignored.
