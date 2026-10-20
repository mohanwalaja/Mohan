# Report readability audit — can a first-time customer understand our reports?

**Prepared:** 20 October 2026
**Scope:** all four astrology reports that customers receive, in English, Tamil
and Hindi. Two other customer-facing documents were checked only for term
consistency and are noted in §9 (tax invoice, AI astrologer answers).

| Report | Builder (browser preview + PDF) | Builder (server / emailed PDF) | Pages |
|---|---|---|---|
| Birth Jathagam | `src/services/jathagamHtmlBuilder.ts` | `api/astrology/report_views.php` | 3 |
| Marriage Compatibility | `src/services/weddingHtmlBuilder.ts` | `api/astrology/report_views.php` | 2 |
| Baby Naming (Namakaran) | `src/services/babyNamingHtmlBuilder.ts` | `api/astrology/report_views.php` | 2 |
| Subha Muhurtham | `src/services/muhurthamHtmlBuilder.ts` | `api/astrology/report_views.php` | 2 |

**How it was checked:** all four reports were rendered from the live sample data
(12 documents: 4 reports × 3 languages) with the same builders that produce the
PDF. Each was then read top-to-bottom as a customer who knows nothing about
Vedic astrology, looking for four things:

1. **Can I understand every word?** — are specialist terms explained anywhere?
2. **Do I know what it means for me?** — verdict → meaning → what to do.
3. **Is it consistent?** — one word for one idea, one number for one score.
4. **Is my language really my language?** — no English fragments inside a Tamil/Hindi report.

---

## 1. The result in one table

| Report | Easy to understand | Detail | Consistency | Language completeness | Actionability |
|---|---|---|---|---|---|
| **Birth Jathagam** | ⚠ 2/5 | ✅ 5/5 | ⚠ 3/5 | ✅ 4/5 | ⚠ 2/5 |
| **Marriage Compatibility** | ⚠ 3/5 | ✅ 4/5 | ⚠ 2/5 | ✅ 4/5 | ⚠ 3/5 |
| **Baby Naming** | ⚠ 3/5 | ⚠ 2/5 | ✅ 4/5 | ✅ 4/5 | ⚠ 2/5 |
| **Subha Muhurtham** | ✅ 4/5 | ✅ 4/5 | ✅ 4/5 | ✅ 4/5 | ⚠ 3/5 |

**Headline:** the reports are *detailed enough* — the problem is almost never
missing information, it is **missing translation of that information into plain
language**, plus a handful of defects. None of the four reports defines a single
astrological term: searching all four English reports for "means", "refers to",
"stands for" or "in simple words" returns **0 hits**, while the Birth Jathagam
alone uses **20 specialist terms** (Lagna, Rasi, Nakshatra, Pada, Bhava,
Mahadasha, Bhukti, karaka, Neecha, Vakri, Astangata, Navamsa, and the nine graha
names).

A customer who does not already know astrology has to guess what
"5th lord Sani in the 7th house, debilitated" means about their own life.

---

## 2. What is already good (keep it, copy it)

These sections prove the house style works, and every upgrade should look like them:

| Where | Why it works |
|---|---|
| Jathagam **page 3 "Birth Chart Summary — Simple Explanation"** | "Sukra: Comfort, good relationships, art and beauty", "No planet is 'bad'. This is guidance, not a reason for fear." — plain, warm, no jargon. |
| Jathagam page 3 **"Planets Needing Extra Care"** table | Difficulty → remedy in three columns. This is the model for every dosha card. |
| Muhurtham **"WHY THESE DATES WERE SELECTED"** | Answers the exact question a customer asks ("why this date and not another?"), including "Why are some weekdays not listed?" |
| Marriage **"Significance & Influence"** column | Each porutham says what it does for the couple, not just a score. |
| Every report's **verdict badges** (Strength / Caution / BEST / GOOD / AVOID) | A customer can scan the page and get the answer. |
| Baby naming **name meanings** ("Rethik — Full of love") | Detail that the customer actually wants. |

**The pattern:** *verdict → one line of meaning → one line of action.* The best
sections follow it; the weak sections stop at the verdict.

---

## 3. Findings, most important first

### P0 — defects (a customer reads them as errors)

| # | Report | Finding | Evidence (rendered text) |
|---|---|---|---|
| 1 | Jathagam | The same condition was printed twice in one sentence. | "Caution: **debilitated, retrograde, requiring review and patience, Debilitated (Neecha), Retrograde (Vakri)**; concentration breaks…" — same for "Property & Real Estate" |
| 2 | Jathagam | Ungrammatical verdict | "**There is no active any of Sani Dosha**" |
| 3 | Jathagam (PHP/PDF) | English fragments inside Tamil and Hindi reports | Tamil: "15/06/1998 **at** 06:30", "அவிட்டம், **Pada** 2". Same pattern in Baby Naming. |
| 4 | Jathagam | Two different date formats in one report | "Prepared on: 20 Oct 2026" but "Saturn (Shani) Mahadasa begins on **2027-03-30**" |

**All four are fixed in this change** (see §7), and a guard test now fails the
build if any of them returns.

### P1 — the understanding gap (the real reason customers ask for help)

**5. No glossary, anywhere.**
Terms are used as if the customer already knows them. The inventory:

| Term | Used in | What the customer needs to read |
|---|---|---|
| Lagna / Ascendant | all four | The rising sign at birth — the "front door" of the chart, read for your body and personality. |
| Rasi / Moon sign | all four | The sign the Moon was in — read for your mind and emotions. |
| Nakshatra / star | all four | One of 27 star groups; the Moon's position inside it sets your naming syllable and your personal good/bad dates. |
| Pada | all four | Quarter of a nakshatra (4 per star). It decides the first sound of a baby's name. |
| Bhava / house | Jathagam | One of 12 life areas (2nd = money, 7th = marriage…). |
| Mahadasha / Bhukti | Jathagam | The planet "in charge" of a period — the chapter you are living through. |
| karaka | Jathagam | The natural signifier of a topic (Venus for marriage, Jupiter for wealth). |
| Neecha (debilitated) | Jathagam | The planet is in its weakest sign — results need extra effort. |
| Vakri (retrograde) | Jathagam | The planet appears to move backwards — matters get reviewed and delayed. |
| Astangata (combust) | Jathagam | The planet is too close to the Sun — its voice is dimmed. |
| Navamsa (D9) | Jathagam | A second chart read for marriage and inner strength. |
| Porutham / Kuta | Marriage | One of the ten traditional checks between two charts. |
| Rajju | Marriage | The "cord" test — a critical longevity check. |
| Gana, Yoni | Marriage | Temperament and instinctive-harmony tests. |
| Kuja / Sevvay Dosha | Marriage | Mars affliction — read for friction in marriage. |
| Tara Bala | Muhurtham | The star-strength of a date *for you personally*. |
| Chandrashtama | Muhurtham | A period when the Moon is 8th from your Rasi — traditionally avoided. |
| Nalla Neram | Muhurtham | The day's auspicious hours. |
| Gunam | Baby naming | The traditional virtues read from the birth star. |

**6. Verdict words are in Sanskrit, half-translated.**
The Marriage porutham table prints **Utthamam**, **Madhyamam** and
**Incompatible** in the same column. The overall score uses
"Madhyamam (with remedies)" but table rows use bare "Madhyamam". A customer
cannot rank these.

**7. Three different numbers for one score.**
Page 1 of the Marriage report shows **7.5 / 10**, **75%** and **8 / 10 Poruthams
matched** side by side. They are three different measures, but nothing says so —
so it reads as contradictory.

**8. The chart on page 1 is unreadable without a legend.**
Cells contain strings like **"GuSa"**, **"LagnaCh"**, **"SuBu"**, **"Sk"** with no
key. The rasi names are transliterated Tamil ("Mesham") even in English — while
the particulars two centimetres above now say "Thulam/Libra".

**9. The plain-language summary is on the last page.**
The best-written page of the Jathagam (page 3) is the one customers reach last.
In the other three reports there is no summary page at all.

**10. "What do I do now?" is missing or vague.**
- Marriage: "Acceptable match; remedies may be considered." — which remedies?
- Kuja: "A mild imbalance is indicated; ask an astrologer about simple remedies."
- Baby namaking: three numbered virtues and no instruction on choosing a name.
- Muhurtham: no next step after the date table (nothing about booking/confirming).
- Jathagam: remedies exist on page 3, but page 2's cautions never point to them.

**11. Baby Naming is the thinnest report.**
444 words for two pages, and the central idea — *why* the first sound matters —
is never stated. It says "The supplied name is for identification only, not a
certified birth-pada name match", which raises a doubt without answering it.

**12. Negative conditions appear on "good" dates without explanation.**
Muhurtham prints "03 Thursday | Uttara Phalguni | **Groom: Vadha Tara** | ✓ GOOD".
"Vadha" is the *worst* of the nine Taras, yet the date is graded GOOD. Either
the grade or the note needs a half-line of explanation.

**13. Type is small for print.**
The PHP/PDF report sets body text at 9.5px and thirteen rules at 8.5px — roughly
7pt and 6.4pt on an A4 sheet, below the 9pt usually recommended for print. Many
customers are 50+; this matters more than any wording change.

### P2 — polish

- ISO dates inside prose ("2027-03-30", "about 5.3 months from now").
- "Sevvay Dosha" and "Kuja Dosha" used for the same thing in one report.
- Jathagam page 1 prints "0 BEST / GOOD dates"-style empty month blocks (Muhurtham), and months with nothing found still take a row.
- Tamil letters (ரூ, ரே, ரோ) appear in the English Baby Naming sound column with no note that they are the Tamil form of the sound.
- `&mdash;` / `&bull;` / `&#9792;` style entities are correct in the source (they render), but the report templates mix HTML entities with literal characters — worth normalising when the copy is edited.

---

## 4. What "understandable and detailed" should look like

Target shape for **every** report (this is the upgrade specification):

```
PAGE 1  ── Who / what / verdict
          • Particulars (as today)
          • NEW  "Your report in 5 lines"  ← plain summary, no jargon
          • The main verdict (score / dates / chart)
          • NEW  "How to read this report" (5 bullet glossary of the terms used)

PAGE 2  ── The detail
          • Tables and charts as today, but every specialist term glossed
            the first time it appears:  "debilitated (Neecha)"
          • Every caution ends with one action line

PAGE 3  ── What to do
          • Remedies / next steps, per finding
          • NEW  Full glossary (A–Z, one line each)
          • Disclaimer (as today)
```

Worked example — the same finding, before and after:

> **Today (Jathagam, Education card):**
> "Good: 5th lord Sani in the 7th house can help memory… Caution: debilitated, retrograde, requiring review and patience, Debilitated (Neecha), Retrograde (Vakri); concentration breaks, forgetfulness, or study gaps may occur. Use a daily study plan."

> **Target:**
> **Education — needs care.**
> Your study planet (5th lord) is Saturn, sitting in the 7th house. Saturn is in
> its weakest sign (**debilitated / Neecha**) and moving backwards
> (**retrograde / Vakri**), so progress comes in waves rather than in a straight line.
> *What to do:* one fixed study hour a day, revise before starting something new,
> and avoid last-minute exam preparation.

---

## 5. Upgrade plan

Four phases. Each phase is independently shippable and testable.

### Phase 1 — Fix what reads as a mistake *(done in this change)*
| Item | Status |
|---|---|
| Duplicated "debilitated… Debilitated (Neecha)" clause | ✅ fixed — one mention, glossary inline |
| "There is no active any of Sani Dosha" | ✅ fixed — "No Sani dosha is active in your chart" |
| English "at" / "Pada" inside Tamil + Hindi PDFs | ✅ fixed in both page-1 particulars and Baby Naming |
| Guard test (`tests/report-readability-guard.test.ts`) | ✅ added to `npm test` |

**Effort:** done. **Risk:** none — no layout change.

### Phase 2 — One shared glossary, used everywhere
1. New file `api/astrology/report_glossary.json` — ~30 terms, each with
   `en` / `ta` / `hi` one-line meaning and one plain alias
   ("Lagna (Ascendant) — the rising sign at birth").
2. Both renderers read it exactly like `jathagam_page1.json` already does:
   TypeScript imports it; PHP loads it through one cached helper.
3. Add a **"How to read this report"** box on page 1 (5 terms that report uses).
4. Add the **full glossary** as the last page (or a two-column block on the
   remedies page if it fits).
5. Add **inline glosses** on first use: "debilitated (Neecha)".

**Effort:** medium (one JSON + two renderers + 3 languages of copy).
**Acceptance:** no term from the glossary appears on any page without either an
inline gloss or a pointer to the glossary; a test asserts every term in the JSON
has all three languages.

### Phase 3 — "What this means and what to do"
1. Every caution line gets one **action** sentence (max 12 words) — the life
   cards already have this shape, the dosha cards and porutham rows do not.
2. Marriage: explain the three numbers (score / percentage / poruthams matched)
   in one line each, and rename the verdicts to **Best / Moderate / Not met**
   with the Sanskrit in brackets.
3. Marriage: per-porutham remedy line when a porutham scores 0 — replacing
   "ask an astrologer".
4. Muhurtham: explain the one-line Tara Bala note ("Groom: Vadha Tara — avoid
   this date for him") or suppress it when the date is still GOOD for the couple.
5. Baby naming: add a "How to choose the name" block (4 steps), and explain why
   the pada sound matters.
6. Jathagam: move the plain-language summary to **page 2, top** (page 3 stays as
   remedies + glossary).
7. Chart legend: add a compact key under the Rasi/Navamsa charts
   (Su=Sun, Ch=Moon, Ma=Mars, Bu=Mercury, Gu=Jupiter, Sk=Venus, Sa=Saturn,
   Ra=Rahu, Ke=Ketu) and show "Thulam (Libra)" in English.

**Effort:** large (mostly copy, 3 languages).
**Acceptance:** every page that states a difficulty also states an action.

### Phase 4 — Legibility and consistency
1. Raise body type to at least 10pt (≈13.3px) everywhere in the PHP/PDF report;
   re-flow the page budgets afterwards (Muhurtham and Baby Naming have fixed
   page-count tests that will need their budgets revisited).
2. One date format (`DD/MM/YYYY`) in prose, including the dasha start date.
3. One number format for scores.
4. Normalise "Sevvay" → "Kuja (Sevvay)" on first use.
5. Optional accessibility pass: minimum 8.5pt for secondary text, colour contrast
   check for the gold/maroon palette.

**Effort:** medium; risk = page overflow, so do it with the existing PDF
screenshot tests (`npm run test:pdf`).

### Phase 5 — Keep it from drifting
- **Copy style guide** in `docs/`: one idea per sentence, ≤ 20 words, active
  voice, no Sanskrit term without a gloss, every caution ends with an action.
- **Automatic checks** (extend `tests/report-readability-guard.test.ts`):
  - max sentence length in each report;
  - no duplicated condition inside a card;
  - no English fragment in `ta`/`hi` output (regex for " at ", "Pada ", "Report Date");
  - every glossary key present in all three languages;
  - every caution card contains an action phrase.
- **Review step:** any new report string is reviewed in all three languages at
  once, in the shared JSON, not in the renderers.

---

## 6. How to measure that it worked

| Signal | Today | Target |
|---|---|---|
| Support messages asking "what does X mean?" | unmeasured | track from launch |
| Reports downloaded per order | baseline | +10% (more value felt) |
| Repeat purchases per customer | baseline | +10% |
| Glossary page is printed (last page) | n/a | stable across releases (page-count tests) |
| Copy defects found by the guard test | 4 classes | 0 |

A quick qualitative test that costs nothing: give the sample report to someone
who does not practise astrology and ask them to explain three lines back to you.
If they cannot, the line is not finished.

---

## 7. What changed in the code today

| File | Change |
|---|---|
| `src/services/jathagamHtmlBuilder.ts` | Duplicate dignity clause removed; glossary inline ("debilitated (Neecha)", "retrograde (Vakri), so results need patience", "combust (Astangata), too close to the Sun") in English, Tamil and Hindi; Neecha Bhanga explanation still appended when it applies; Sani verdict rewritten |
| `api/astrology/report_views.php` | Same Sani verdict; " at " → " அன்று " / " को "; "Pada 2" → "2-ஆம் பாதம்" / "पाद 2" in the Jathagam particulars and in Baby Naming |
| `tests/report-readability-guard.test.ts` | New guard (5 checks) wired into `npm test` |
| `tests/jathagam-page1-signs-and-doshas.test.ts` | Updated for the localised pada text |

`npm test` green, `npx tsc --noEmit` clean.

---

## 8. Out of scope for this pass

- **Tax invoice** (`src/services/invoiceHtmlBuilder.ts`) — a financial document,
  not an interpretation. It reads correctly; the only shared item is the
  "Porutham / Jathagam" service names, which the glossary will also cover.
- **AI astrologer answers** (`src/services/aiReportSections.ts` and the chat
  provider) — prose generated at request time. It should reuse the same glossary
  so the chat and the PDF speak one language; worth a separate review once
  Phase 2 exists.
- **Website pages** (service pages, "How it works") — they describe the product,
  not a customer's chart. A public glossary page would help sales as well as
  support, and can be generated from the same JSON.

## 9. Recommendation

Do **Phase 2 + Phase 3** next, in that order, and ship them report-by-report
starting with **Birth Jathagam** (highest volume, most jargon) and **Marriage**
(most misinterpretation risk). Phase 4 is worth doing before the next print
season because small type affects every page of every report — but it must be
done together with the PDF screenshot tests, since it changes how much fits on a
page.
