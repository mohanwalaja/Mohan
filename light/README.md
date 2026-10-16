# ASTRO SIVAM — “Daylight” light UI (preview)

A **brand-new, light-first interface** for ASTRO SIVAM, built beside the existing
site. Nothing in the current front-end changes: this app lives entirely in
`light/`, has its own entry point, its own stylesheet and its own dev server, and
the shipped site keeps working exactly as it does today.

```bash
npm run dev:light      # http://localhost:5200 — this light UI
npm run dev            # the unchanged dark UI (port 5173)
npm run build:light    # static build into light/dist/
npm run lint:light     # type-check this app only
```

## What is new

| Area | Daylight UI |
| --- | --- |
| **Colour** | Light-only. Paper-ivory surfaces, hairline gold rules, soft sunrise glows. Three palettes — *Sunrise Ivory*, *Monsoon Mist*, *Lotus Blush* — switchable at runtime from the dock in the bottom-left corner. |
| **Type** | A new display face, **Fraunces** (variable, self-hosted, SIL OFL 1.1), paired with the existing Plus Jakarta Sans body face. |
| **Structure** | Hash-routed pages (`#/jathagam`, `#/studio`…) so the preview works from any static host, sub-folder or proxy without server rules. |
| **Signature feature** | A **Free Preview Lab** that runs the site’s real astrology engine in the browser. |
| **Pages** | Home, All services, Birth Jathagam, Marriage Porutham, Baby Naming, Subha Muhurtham, Preview Lab, How it works, Priest team, About, Contact, 404. |

## The Free Preview Lab

Five live tools, all computed client-side with no account, no payment and no
network round-trip:

1. **Panchangam** — tithi, nakshatra, yoga, karana, vara, sunrise/sunset and the
   Rahu / Yamagandam / Gulikai / Abhijit windows for ten cities.
2. **Your chart** — Lagna, rasi, nakshatra and pada, a drawn South Indian rasi
   chart, the Navagraha table (retrograde, combust, exaltation), the Vimshottari
   dasha timeline and the dosha findings.
3. **Porutham match** — both charts, all ten poruthams scored with reasoning,
   Rajju / Vedha findings and the Kuja Dosha reading.
4. **Muhurtham month** — a graded month scan for any of the eighteen ceremonies,
   with Nalla Neram and Rahu Kalam windows. When a month is traditionally
   avoided (Sukra asta, Adhika Masa, Pitru period) it says so and looks ahead
   instead of showing an empty page.
5. **Baby name letters** — the nakshatra, the pada, the auspicious syllable for
   every pada, and the curated South / North Indian names for the baby’s pada
   with meanings.

## Why it can never contradict the live site

The preview imports the **same modules** the production app uses, through the
`@shared` alias:

- `@shared/lib/astrology/*` and `@shared/lib/muhurtham/scanner` — the verified
  sidereal engine (Lahiri ayanamsa, Drik panchangam, porutham and muhurtham
  rules).
- `@shared/services/pricing` — one price list, USD-based with derived INR.
- `@shared/data/homeFaq`, `serviceFaqs`, `testimonials`, `defaultTeamMembers`,
  `businessInfo` — the same copy, reviews, team profiles and business identity,
  including the policy that the office address and the Udyam registration number
  appear on the Contact page only.

## Layout

```
light/
  index.html              entry document (light-only, no dark class)
  vite.config.ts           root = light/, publicDir = ../public
  tsconfig.json            strict, @shared -> ../src, @ -> ./src
  src/
    main.tsx  App.tsx      providers, hash router, route table
    appConfig.ts           navigation, catalogue, copy (reads shared data)
    lightContext.tsx       palette + toast state
    router.ts              hash routing
    styles/app.css         design tokens, three palettes, components
    lib/previewEngine.ts   the Free Preview Lab engine
    components/            shell (navbar, footer, palette dock), ui, chart
    pages/                 the twelve pages
```

## Notes for review

- The live design is untouched: `src/`, `index.html`, `vite.config.ts` and the
  PHP API are not modified by this app (only `package.json` scripts,
  `.gitignore` and a README section were added).
- `light/dist/` is a separate build output and is never part of the deployed
  `dist.zip`.
- Fonts are self-hosted with their licences beside them
  (`light/src/assets/fonts/`); no Google Fonts request is made.
