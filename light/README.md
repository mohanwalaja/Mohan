# ASTRO SIVAM — light UI (same site, light surface)

The **same website with a new light surface**. Nothing in the current front-end
changes: this app lives entirely in `light/`, has its own entry point, stylesheet
and dev server, and the shipped dark site keeps working exactly as it does today.

```bash
npm run dev:light      # http://localhost:5200 — this light UI
npm run dev            # the unchanged dark UI (port 5173)
npm run build:light    # static build into light/dist/
npm run lint:light     # type-check this app only
```

## What is the same

| Area | Light UI |
| --- | --- |
| **Brand** | The site's own lock-up: the `astrosivam_logo.png` emblem, **ASTRO SIVAM**, *INDIAN VEDIC ASTROLOGY* — read from the live `BrandLockup` module so the words can never drift. |
| **Navigation** | The live navbar and footer link for link: Home, the four service pages, Astrology Team, How It Works, About Us, Contact, Customer Dashboard, Log In / Sign Up, the payment badges, the four policy pages and the back-to-top control. |
| **Routes** | The live slugs: `#/home`, `#/services`, `#/birth-jathagam`, `#/marriage-compatibility`, `#/baby-naming`, `#/muhurtham`, `#/how-it-works`, `#/team`, `#/about`, `#/contact`, `#/policy-privacy`, `#/policy-terms`, `#/policy-payment`, `#/policy-refund`. |
| **Wording** | Not one sentence is new. Every string is read from `appConfig.ts` / `servicePanels.ts`, which mirror the live pages, the shared data modules and the live pricing. |
| **Calculations** | The same verified engine through the `@shared` alias (see below), shown on each report page as the live *Live PDF Report Preview* computed from the sample report's fixed details (01 Jan 2000, 2:00 AM, Chennai). |

## What is new

| Area | Light UI |
| --- | --- |
| **Colour** | Light-only: paper-ivory surfaces, hairline gold rules, soft sunrise glows — the **Sunrise Ivory** palette (#fffbf3 paper, #d99a2b temple gold, #0e7c7b teal), the opposite of the cosmic dark theme that is still live. |
| **Type** | A new display face, **Fraunces** (variable, self-hosted, SIL OFL 1.1), paired with the existing Plus Jakarta Sans body face. |
| **Interaction** | Hash routing so the preview works from any static host, sub-folder or proxy without server rules, and self-dismissing notices instead of a palette dock. |

## Why it can never contradict the live site

The preview imports the **same modules** the production app uses, through the
`@shared` alias:

- `@shared/lib/astrology/*` and `@shared/lib/muhurtham/scanner` — the verified
  sidereal engine (Lahiri ayanamsa, Drik panchangam, porutham and muhurtham
  rules).
- `@shared/services/pricing` — one price list, USD-based with derived INR.
- `@shared/services/sampleReportInfo` — the fixed sample details every sample
  report uses.
- `@shared/data/homeFaq`, `serviceFaqs`, `testimonials`, `defaultTeamMembers`,
  `businessInfo` — the same copy, reviews, team profiles and business identity,
  including the policy that the office address and the Udyam registration number
  appear on the Contact page only.

Because the light UI is a re-skin, it introduces **no alternate branding, no
alternate page names and no alternate copy**: if the live site's wording changes,
the same string changes here.

## Layout

```
light/
  index.html              entry document (light-only, no dark class)
  vite.config.ts           root = light/, publicDir = ../public
  tsconfig.json            strict, @shared -> ../src, @ -> ./src
  src/
    main.tsx  App.tsx      providers, hash router, route table (live slugs)
    appConfig.ts           the site's own nav, catalogue, fee and page copy
    servicePanels.ts       the four report pages' inclusions, notes and FAQs
    lightContext.tsx       shell notices
    router.ts              hash routing over the live slugs
    styles/app.css         design tokens (one palette) and components
    lib/previewEngine.ts   the report-preview engine wrapper
    components/            shell (navbar, footer, brand mark), ui, report page
    pages/                 the fourteen pages
```

## Notes for review

- The live design is untouched: `src/`, `index.html`, `vite.config.ts` and the
  PHP API are not modified by this app (only `package.json` scripts,
  `.gitignore` and a README section were added).
- `light/dist/` is a separate build output and is never part of the deployed
  `dist.zip`.
- Fonts are self-hosted with their licences beside them
  (`light/src/assets/fonts/`); no Google Fonts request is made.
- Sign-in, orders, sample-PDF downloads and messages are handled by the live site
  at astrosivam.com; the preview links to it and says so plainly instead of
  pretending.
