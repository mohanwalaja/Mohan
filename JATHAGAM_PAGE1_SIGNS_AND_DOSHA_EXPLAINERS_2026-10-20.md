# Birth Jathagam page 1 — Mesham/Aries + two-line dosha explanations

**Requested:** 2026-10-20 — from the admin panel. The new wording is English
layout; Tamil and Hindi keep their single-name rows (and, per the follow-up
request, now print those rows **bold** as well). The dosha text is short in all
three languages.

| # | Request | Where it now lives |
|---|---|---|
| 1 | Janma Rasi row shows the sign **and** the zodiac — `Mesham/Aries` for all twelve rasis — in **bold** (English; Tamil/Hindi keep the single name, bold) | page-1 User Particulars |
| 2 | Janma Nakshatra row keeps the star name, in **bold** in every language | page-1 User Particulars |
| 3 | Dosha Analysis: Sani, Kala Sarpa, Pitru and Guru Chandala each **explain the dosha in two lines** ("no big" in Tamil and Hindi too) | every dosha card, all three languages |

## What changed

### 1. Page-1 particulars

| Language | Rasi row | Nakshatra row |
|---|---|---|
| English | `Janma Rasi / Zodiac Sign` → **Thulam/Libra** | `Janma Nakshatra / Star Sign` → **Swati** — Pada 2 |
| Tamil | `ராசி` → **துலாம்** | `நட்சத்திரம்` → **சுவாதி** — 2-ஆம் பாதம் |
| Hindi | `राशि (Moon Sign)` → **तुला** | `नक्षत्र (Nakshatra)` → **स्वाति** — पाद 2 |

* The English row prints the zodiac twin (`Mesham/Aries` … `Meenam/Pisces`);
  Tamil and Hindi keep the single rasi name they always printed. Nothing else in
  those two reports changes.
* The star name is **bold in all three languages**; the pada wording stays as it
  was.
* Hindi PDFs used to print `N/A` for the star: `api/astrology/engine.php` had no
  Hindi nakshatra list, so `generateBirthJathagamHtml()` fell through to `N/A`
  even though the browser engine knew the name. `$NAKSHATRAS_HI` (same 27 names
  as `NAKSHATRAM_NAMES_HI`) now feeds `janmaNakshatraHi` and
  `nakshatram.nameHi`, so the Hindi preview and the Hindi PDF agree.

### 2. Dosha cards — two-line explanations

Every card is now: **title → status badge → two-line explanation**. The long
"phase + intensity + full remedy" paragraphs are gone from page 1 (the remedies
still live on page 3, Short Summary).

| Dosha | English explanation |
|---|---|
| Sani | Sani dosha is read from Saturn's transit over the 12th, 1st, 2nd, 8th, 4th, 7th or 10th sign from your Janma Rasi. It brings delays and hard lessons, eased by patience and service to elders. |
| Kala Sarpa | Kala Sarpa dosha forms when all seven planets lie within the Rahu–Ketu axis. It is read as delays and repeated obstacles, eased by steady effort and Rahu–Ketu remedies. |
| Pitru | Pitru dosha is indicated when the Sun is afflicted by Rahu/Ketu, or Saturn sits in the 9th house. It is read as ancestral debt that delays family matters, eased by honouring ancestors. |
| Guru Chandala | Guru Chandala dosha forms when Guru (Jupiter) conjoins or is aspected by Rahu/Ketu. It is read as clouded judgement and interrupted fortune, eased by Guru worship and honest conduct. |

The Tamil and Hindi versions are the same two sentences in those languages
(shorter than the paragraphs they replace), so the card stays compact in every
report.

## One file feeds both renderers

Page 1 is rendered twice — by the browser/PDF builder
(`src/services/jathagamHtmlBuilder.ts`) and by the PHP renderer used for the
admin preview, the customer-preview iframe and the emailed PDF
(`api/astrology/report_views.php`).

The zodiac names and the four explanations therefore live in **one** file:

```
api/astrology/jathagam_page1.json
```

* the TypeScript builder imports it (`ZODIAC_SIGN_EN`, `rasiWithZodiacEn()`,
  `doshaExplainerText()`);
* PHP reads it through `astro_jathagam_page1()` /
  `astro_jathagam_dosha_explainer()`.

Changing a wording in that JSON changes the browser preview, the customer PDF
and the emailed PDF together — impossible to drift.

## Tests

`tests/jathagam-page1-signs-and-doshas.test.ts` (wired into `npm test`) checks:

1. all twelve rasis map to a zodiac name and print as `Mesham/Aries`, with
   unknown signs still `N/A`;
2. the English page prints the bold dual rasi under `Janma Rasi / Zodiac Sign`
   and the bold star under `Janma Nakshatra / Star Sign`;
3. Tamil and Hindi print the same single rasi name, bold, without the English
   zodiac twin, and the bold star;
4. each of the four explanations is **exactly two sentences**, under 900
   characters, in `en` / `ta` / `hi`, and the JSON and renderers agree;
5. the old long Sade Sati / remedy paragraphs never return to page 1;
6. the PHP renderer reads the same JSON, prints the explainer in every Sani card
   (Ezharai / Ashtama / Kandaka / none) and in the engine-dosha loop, and builds
   `Mesham/Aries` for the rasi cell.

`tests/astrology-integrity-regression.test.tsx` was updated for the new
particulars markup (a missing chart still prints `N/A`).

Both stacks were executed during development: the TS builder and the PHP
`AstroReportViews::generateBirthJathagamHtml()` were rendered for the same chart
in all three languages and checked for the four explanations and the bold
`Thulam/Libra` / `Swati` values.

## Deploying

PHP + a rebuilt frontend:

```
api/astrology/jathagam_page1.json      (new — must be uploaded)
api/astrology/report_views.php
dist/*                                 (rebuilt)
```

`api/.htaccess` already denies direct web access to `*.json`, so the shared
wording file is server-readable but not downloadable.
