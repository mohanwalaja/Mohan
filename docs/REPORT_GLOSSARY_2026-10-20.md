# Plain-language glossary — every report now explains its own words

**Date:** 20 October 2026
**Fixes:** the first finding of `docs/REPORTS_READABILITY_AUDIT_2026-10-20.md` —
*"No glossary anywhere — 30 terms used, none explained."*

---

## What a customer sees now

Every report ends with one extra sheet, **Report Guide & Glossary**, in the
language the order was placed in:

```
┌────────────────────────────────────────────────────────────┐
│  ASTRO SIVAM - OFFICIAL VEDIC REPORT                      │
│  Plain-language guide to this report                       │
│                                                            │
│  Report Guide & Glossary                                   │
│  Every technical word used in this report, explained in    │
│  one line. Read this page once and the whole report        │
│  becomes clear.                                            │
│                                                            │
│  Lagna (Ascendant)          │  Neecha (debilitated)        │
│  The sign rising on the     │  A planet sitting in its     │
│  eastern horizon at your    │  weakest sign. Results need  │
│  birth. Read for your body  │  extra effort and patience.  │
│  and personality.           │                              │
│  …                          │  …                           │
│ ─────────────────────────────────────────────────────────  │
│  Nothing here is a prediction of doom. …                   │
└────────────────────────────────────────────────────────────┘
```

### The "5 words you'll meet" box

A reader should not have to reach the last page to understand the first page, so
each report also carries a compact box with the **five words that stop a
first-time reader fastest** — the term in bold with its one-line meaning, closed
by the line that points at the full guide.

| Report | The five words |
|---|---|
| Birth Jathagam | Lagna · Rasi · Nakshatra · Bhava · Neecha |
| Marriage | Porutham · Rajju · Gana · Kuja dosha · Yoni |
| Baby Naming | Namakaran · Nakshatra · Pada · Gunam · Rasi |
| Muhurtham | Muhurtham · Tara Bala · Chandrashtama · Nalla Neram · Nakshatra |

**Where it sits — the last page only**

| Report | Box position |
|---|---|
| Birth Jathagam | top of the Report Guide sheet (page 4) |
| Marriage Compatibility | top of the Report Guide sheet (page 3) |
| Baby Naming | top of the Report Guide sheet (page 3) |
| Subha Muhurtham | top of the Report Guide sheet (page 3) |

The box is part of the guide, never of the report body: it is printed **once**,
on the last sheet, in every report. Page 1 of each report keeps a single line
pointing there —

*"New to these words? Every term is explained in one line on the last page
(Report Guide & Glossary)."*

so the reader knows help exists without page 1 growing any taller.

The five words are listed as `quickTerms` per report in
`api/astrology/report_glossary.json`, and they must be a subset of that report's
`reportTerms` — the test enforces it.

| Report | Sheets before | Sheets now | Terms explained |
|---|---|---|---|
| Birth Jathagam | 3 | **4** | 23 |
| Marriage Compatibility | 2 | **3** | 12 |
| Baby Naming | 2 | **3** | 10 |
| Subha Muhurtham | 2 | **3** | 8 |

---

## One file, two renderers

```
api/astrology/report_glossary.json      ← the only place a definition lives
        │
        ├── src/services/reportGlossary.ts       browser preview + jsPDF
        └── api/astrology/report_views.php       admin preview, customer
                                                 preview, emailed PDF
```

`report_glossary.json` holds 34 terms. Each has a `label` (the word as the
report prints it, with its plain alias) and a `meaning` (one line), in
`en` / `ta` / `hi`. It also lists which terms each report uses:

```json
"reportTerms": {
  "BIRTH_JATHAGAM": ["lagna", "rasi", "nakshatra", "pada", "bhava", "lord", …],
  "MARRIAGE_COMPATIBILITY": ["porutham", "rajju", "gana", "yoni", "kuja-dosha", …],
  "BABY_NAMING": ["namakaran", "nakshatra", "pada", "rasi", "lagna", "gunam", …],
  "MUHURTHAM": ["muhurtham", "tara-bala", "chandrashtama", "nalla-neram", …]
}
```

TypeScript reads it through `src/services/reportGlossary.ts`
(`reportGlossaryEntries`, `reportGlossaryHtml`, `inlineGloss`,
`REPORT_GLOSSARY_CSS`). PHP reads the same file through
`astro_report_glossary()`, `astro_report_glossary_entries()` and
`astro_report_glossary_html()` — nothing is copy-pasted between the two stacks,
so the browser preview and the printed PDF can never explain a term differently.

---

## The 34 terms

**Chart terms** — Graha, Lagna, Rasi, Nakshatra, Pada, Bhava, Lord, Mahadasha,
Bhukti, Dasha, Karaka, Neecha, Vakri, Astangata, Navamsa, Ayanamsa, Rasi chart,
Chart letters (Su, Ch, Ma…), Dosha.
**Doshas** — Sani dosha / Sade Sati, Kala Sarpa, Pitru, Guru Chandala.
**Marriage** — Porutham, Rajju, Gana, Yoni, Kuja dosha (Sevvay).
**Muhurtham** — Muhurtham, Tara Bala, Chandrashtama, Nalla Neram.
**Baby naming** — Namakaran, Gunam.

Example, the highest-value entries:

| Term | English one-liner |
|---|---|
| Lagna (Ascendant) | The sign rising on the eastern horizon at your birth. Read for your body and personality. |
| Nakshatra (birth star) | One of 27 star groups. Your star sets the first sound of your name and your personal good dates. |
| Bhava (house) | One of twelve life areas. For example the 2nd is money, the 7th is marriage. |
| Lord (house ruler) | The planet that rules a house. '5th lord' means the planet ruling the 5th house. |
| Neecha (debilitated) | A planet sitting in its weakest sign. Results need extra effort and patience. |
| Rajju | The critical longevity check. Tradition avoids matching the same Rajju. |
| Tara Bala | The strength of a date for YOU, counted from your own birth star. |
| Chandrashtama | Days when the Moon is eighth from your Moon sign. Traditionally avoided. |

Every meaning follows the same rules: one sentence, everyday language, no
second jargon word, and never a restatement of the label.

---

## How to add or change a term

1. Edit `api/astrology/report_glossary.json`:
   ```json
   "vakri": {
     "en": { "label": "Vakri (retrograde)", "meaning": "…one line…" },
     "ta": { … }, "hi": { … }
   }
   ```
2. Add its key to every report in `reportTerms` that prints the word.
3. Nothing else — both renderers pick it up on the next build/deploy.

**To change which five words the box shows**, edit only the `quickTerms` block:

```json
"quickTerms": {
  "BIRTH_JATHAGAM": ["lagna", "rasi", "nakshatra", "bhava", "neecha"]
}
```

Use keys that are already in that report's `reportTerms`. The box is printed
from the same entries as the full guide, so the two can never disagree, and the
test fails if a key is unknown, if a report stops showing five words, or if the
rows ever appear anywhere except the last page.

`tests/report-glossary.test.ts` (in `npm test`) fails the build if:

- a term is missing any of the three languages;
- a meaning is empty, longer than 170 characters, not a sentence, or just
  repeats its label;
- a report lists a key that does not exist;
- a report stops printing its glossary sheet or loses the page-1 pointer;
- the PHP renderer stops reading the shared file, or the page totals drift.

---

## Layout safety

The glossary is a **new last sheet**, so it cannot push content out of an
existing page. On the browser/PDF side every `.page` still goes through the
existing `fitPageToA4` pass, which scales a sheet that would ever exceed one
A4 — so a future language with longer words degrades gracefully instead of
splitting. The PHP renderer has no flexbox, so its glossary uses a two-cell
table (`table.glossary-columns`) with the entries split down the middle;
`page-break-inside: avoid` keeps a term and its meaning together.

---

## Deploy

| File | Why |
|---|---|
| `api/astrology/report_glossary.json` | **new** — the wording |
| `api/astrology/report_views.php` | glossary sheet for all four reports |
| `dist/` | rebuilt frontend (all four builders) |

Page totals changed (`3 → 4` for the Jathagam, `2 → 3` for the other three);
the "Page x / y" labels are generated from those constants, so they stay
correct automatically.
