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

**6. Verdict words are in Sanskrit, half-translated. ✅ FIXED (20 Oct 2026)**
The Marriage porutham table printed **Utthamam**, **Madhyamam** and
**Incompatible** in the same column. The overall score used
"Madhyamam (with remedies)" but table rows used bare "Madhyamam". A customer
could not rank these.

One ladder now, in the order's language, on both renderers:

| Tier (stored) | English | Tamil | Hindi |
|---|---|---|---|
| UTTHAMAM | **Very Good** | **மிக நன்று** | **बहुत अच्छा** |
| MADHYAMAM | **Good** | **நன்று** | **अच्छा** |
| PORUNDHADHU | **Incompatible** | **பொருந்தாது** | **मेल नहीं** |

- TypeScript: `src/services/poruthamVerdict.ts` (`verdictTierLabel`,
  `verdictTierHint`, `verdictTierFrom`) — used by the porutham Status column,
  the score badge and the recommendation.
- PHP: `astro_porutham_verdict_label()` / `astro_porutham_verdict_tier()` in
  `api/astrology/report_views.php`. The table used to echo the engine's raw
  English `status` field, so Tamil and Hindi orders saw English words; it now
  resolves `status2`/legacy labels to a tier and prints the local word.
- The redundant Sanskrit prefix inside the explanations ("உத்தமம்!",
  "उत्तम!") is gone — the Status column already carries the rank.
- Old saved orders still resolve: `verdictTierFrom('Madhyama (Good)')` → Good.
- Guarded by `tests/wedding-verdict-labels.test.ts` (8 checks).

**7. Three different numbers for one score. ✅ FIXED (20 Oct 2026)**
Page 1 of the Marriage report showed **7.5 / 10**, **75%** and **8 / 10 Poruthams
matched** side by side. They are three different measures, but nothing said so,
so it read as contradictory.

**Decision (owner):** keep only the porutham count and drop the other two.

```
┌────────────────────────────────────────────┐
│ Visual Compatibility Meter      [ Good ]   │
│                                            │
│ 8 / 10   Poruthams matched                 │
│ ████████████████████████░░░░               │  ← bar fills 8 × 10%
│ Rajju Status: Auspicious Match             │
└────────────────────────────────────────────┘
```

- The headline is **`N / 10` + "Poruthams matched"** in the order's language
  (Tamil "பொருத்தங்கள் பொருந்தின", Hindi "गुण मेल खाते हैं").
- The point score (`7.5 / 10`), the percentage (`75%`) and the "Points" label are
  gone from the panel, in both renderers.
- The meter now fills from the **count** (`N × 10 %`) and its
  `aria-valuenow`/`aria-valuetext` say the same thing, so the bar can never
  disagree with the only number beside it.
- Missing data still fails honestly: an unknown count prints **`N/A / 10`** with
  an empty bar — never a manufactured score.
- Guarded by `tests/wedding-single-score.test.ts` (5 checks).

**8. The chart on page 1 is unreadable without a legend.** — *✅ FIXED (20 Oct 2026)*
Cells contain strings like **"GuSa"**, **"LagnaCh"**, **"SuBu"**, **"Sk"** with no
key. The rasi names are transliterated Tamil ("Mesham") even in English — while
the particulars two centimetres above now say "Thulam/Libra".
- **Fixed:** one compact **Chart Symbols** key (`div.chart-legend`) now sits
  directly under the paired Rasi (D1) and Navamsa (D9) squares on page 1, in
  English, Tamil and Hindi: `Su Surya (Sun) … Ke Ketu (S. Node) Lagna
  Ascendant (rising sign)`, plus the note *"Two symbols in one sign (for example
  GuSa) mean both planets sit in that rasi."*
- The key is generated from the same `GRAHA_NAMES_REPORT` tags the cells print,
  so an entry can never drift from a chart label; `api/astrology/report_views.php`
  now prints the **same** tags (`Su/Ch/Ma/Bu/Gu/Sk/Sa/Ra/Ke`, `Lagna`) — it had
  been drawing `Mo/Me/Ju/Ve/Lag`, a second set of abbreviations the customer
  would have had to learn.
- The key is 7.6px, two lines high, and the Jathagam stays 4 pages.
- Guarded by `tests/jathagam-chart-legend.test.ts` (en/ta/hi, every drawn tag
  covered, printed once, page 1, 4 pages, PHP tag parity). Rasi names in English
  are still transliterated ("Mesham") — that remains open (finding 8b).

**9. The plain-language summary is on the last page.**
The best-written page of the Jathagam (page 3) is the one customers reach last.
In the other three reports there is no summary page at all.

**10. "What do I do now?" is missing or vague.** — *Marriage + Baby Naming ✅ FIXED (20 Oct 2026)*
- Marriage: "Acceptable match; remedies may be considered." — which remedies?
  **Fixed:** that sentence is gone. Every marriage report now ends its verdict
  with a **NEXT STEP** line, inside the same block on page 1:
  - **Very Good / Good** → *"Choose the wedding date with our Subha Muhurtham
    report — it checks Tara Bala, Chandrashtama and Nalla Neram for both of you
    and lists the auspicious dates: astrosivam.com/subha-muhurtham"*
    (Tamil "தாரா பலம், சந்திராஷ்டமம், நல்ல நேரம்", Hindi "तारा बल, चंद्राष्टम
    और नल्ला नेरम").
  - **Incompatible** → **no NEXT STEP line at all.** The verdict stands on its
    own: no upsell and no promised review line for a couple whose charts do not
    match (owner's call, 20 Oct 2026).
  - The verdict sentence itself now reads *"Good match overall — a few poruthams
    are partial."* for the middle tier.
- Kuja: "A mild imbalance is indicated; ask an astrologer about simple remedies."
- Baby namaking: three numbered virtues and no instruction on choosing a name.
  **Partly fixed:** page 1 now carries a **"Why the First Sound Matters"** panel
  under the four pada syllables — tradition fixes the first sound from the birth
  star and pada, any name starting with one of the four syllables is correct,
  and every list on page 2 starts with those sounds. (The 4-step "how to
  choose" walkthrough is still open.)
- Muhurtham: no next step after the date table. **Closed as "won't fix" (owner,
  20 Oct 2026):** a "What do I do next?" paragraph was drafted on page 2 and the
  owner asked for it to be removed — the report explains how its dates were
  chosen and stops there. The selection guide stays.
- Jathagam: remedies exist on page 3, but page 2's cautions never point to them.

**11. Baby Naming is the thinnest report.** *✅ The central idea is now stated (20 Oct 2026)*
444 words for two pages, and the central idea — *why* the first sound matters —
was never stated. It said "The supplied name is for identification only, not a
certified birth-pada name match", which raised a doubt without answering it.

The **"Why the First Sound Matters"** panel (EN / ஏன் முதல் ஒலி முக்கியம் /
पहली ध्वनि क्यों महत्वपूर्ण है) now answers it on page 1, in one short paragraph
next to the syllables it describes: the first sound is fixed by the birth star
and pada, the family may choose any name that starts with one of the four
printed syllables, the meaning is their choice and the first sound is the
blessing. Page count stays at three, and the note is printed once, so it cannot
drift onto a second sheet. Guarded by `tests/report-next-steps.test.ts`.

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

### Phase 2 — One shared glossary, used everywhere ✅ **DONE (20 Oct 2026)**
Delivered in `docs/REPORT_GLOSSARY_2026-10-20.md`:
1. `api/astrology/report_glossary.json` — **34 terms**, each with an
   `en` / `ta` / `hi` one-line meaning and a plain alias
   ("Lagna (Ascendant) — the sign rising on the eastern horizon at your birth").
2. Both renderers read it: `src/services/reportGlossary.ts` and
   `astro_report_glossary()` / `astro_report_glossary_html()` in PHP. One file,
   so the preview and the printed PDF cannot drift.
3. Every report now ends with a **Report Guide & Glossary** sheet
   (Jathagam 4 sheets, the other three 3 sheets), in the order's language.
4. Page 1 of every report carries a one-line **pointer** to it.
5. Inline glosses on first use in running prose:
   "debilitated (Neecha)", "retrograde (Vakri)", "combust (Astangata)".

**Acceptance:** `tests/report-glossary.test.ts` (in `npm test`) fails the build
if a term lacks a language, if a meaning is missing/too long/not a sentence, if
a report stops printing its sheet or loses the pointer, or if PHP stops reading
the shared file.

**Still open from this phase:** the *"How to read this report"* box listing the
five most-used terms **on page 1** — the full glossary is on the last page and
page 1 points to it.

### Phase 3 — "What this means and what to do"
1. Every caution line gets one **action** sentence (max 12 words) — the life
   cards already have this shape, the dosha cards and porutham rows do not.
2. Marriage: ~~explain the three numbers (score / percentage / poruthams
   matched) in one line each~~ **Done differently (owner, 20 Oct 2026): only
   "8 / 10 Poruthams matched" is printed; the score and percentage are
   removed.** ~~Rename the verdicts to Best / Moderate / Not met.~~
   **Done differently (owner's wording, 20 Oct 2026):** the ladder is
   **Very Good / Good / Incompatible** in English, **மிக நன்று / நன்று /
   பொருந்தாது** in Tamil and **बहुत अच्छा / अच्छा / मेल नहीं** in Hindi, with the
   Sanskrit only on the glossary page. See finding 6.
3. Marriage: per-porutham remedy line when a porutham scores 0 — replacing
   "ask an astrologer".
4. ~~Muhurtham: next step after the date table~~ **REMOVED (owner, 20 Oct 2026)**
   — a *"What do I do next?"* paragraph (confirm a date, email the order number,
   get a written confirmation) was shipped on page 2 and then removed at the
   owner's request. The page-2 selection guide still explains what was checked
   and why only a few dates are listed, and the report ends there. Copy deleted
   from `api/astrology/muhurtham_report_notes.json` and both renderers;
   `tests/report-next-steps.test.ts` now guards that it cannot come back.
5. Muhurtham: explain the one-line Tara Bala note ("Groom: Vadha Tara — avoid
   this date for him") or suppress it when the date is still GOOD for the couple.
6. Baby naming: add a "How to choose the name" block (4 steps), and explain why
   the pada sound matters.
7. Jathagam: move the plain-language summary to **page 2, top** (page 3 stays as
   remedies + glossary).
8. ~~Chart legend: add a compact key under the Rasi/Navamsa charts~~
   **✅ DONE (20 Oct 2026)** — key added in all three languages under both
   squares; the English chart tags were also aligned with the PHP renderer
   (`Su/Ch/Ma/Bu/Gu/Sk/Sa/Ra/Ke/Lagna`). Still open: show "Thulam (Libra)"
   instead of the transliteration in English.

**Fixed while doing this:** the Report Guide sheet made every report three
sheets, but the PHP marriage and Muhurtham headers still printed "of 2" (Tamil
"1 / 2" too). `WEDDING_PAGE_TOTAL`, `MUHURTHAM_PAGE_TOTAL` and
`BABY_PAGE_TOTAL` now own those numbers in `report_views.php`, exactly like
`JATHAGAM_PAGE_TOTAL`, so appending a sheet can no longer leave a header wrong.

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
