# THIRUKANITHA AUDIT RECORD — items #26 / #27 / #28 (F3–F5)

**Status:** working record, opened 2026-10-12 (owner ruling).
**Governing tradition:** **THIRUKANITHA (Drik Ganita)** — corrected from the
earlier attribution "Pambu Panchangam". Pambu Panchangam is a **Vakya**
panchangam and is explicitly *not* the governing reference for these items.

## Governing reference

*Yalppanam Sri Thirukanitha Karthikeya Aiyar Panchangam* — 138th edition,
**Viswavasu 2025-26** (Gregorian 2025-04-14 → 2026-04-13), calculated for
**Zurich, Switzerland** (Europe/Zurich; printed times are Zurich local time,
+1 h added for summer time 2025-03-30 → 2025-10-25), published by Sri
Sivasubramaniar Temple, Sihlweg 3, 8134 Adliswil, Switzerland.

PDF: <https://www.murugantemple.ch/wp-content/uploads/2025/04/Panchangam_2025-2026.pdf>

Note: the PDF is typeset in a legacy Tamil font; plain text extraction is
garbled. Pages are read as rendered images (visual/OCR), never from garbled
text. Fixture values in this record carry their PDF page number.

## Items covered

| # | Audit finding | Subject | Governing rule source |
|---|---|---|---|
| #26 | F3 — Vasya (Vasiya) porutham table | which rasi pairs carry the special vasiya attraction | printed **வசீயப் பொருத்தம்** table of the reference PDF |
| #27 | F4 — Rasiyadhipathi friendship | planetary-lord friendship table | printed **இராசியதிபதிப் பொருத்தம்** 7×7 உத்தமம்/மத்திமம்/தீது table of the reference PDF |
| #28 | F5 — Rasi porutham same-rasi | rasi-distance scoring incl. same rasi | printed **இராசிப் பொருத்தம்** rule of the reference PDF |

Panchangam day-level values (tithi, nakshatra, yoga, karana, sankranti) are
likewise validated against this almanac's daily tables, because the same
Thirukanitha (Drik Ganita) computation governs them: sunrise-based day
assignment at Zurich, ayanamsa 24°12'37" (Lahiri).

## Rules extracted from the PDF (with page refs)

*(Pages counted from the PDF file. Added as each page is read.)*

1. **Ayanamsa** — peedika states **24 பா. 12 க. 37 வி. = 24°12'37"**
   (peedika page, chunk "Viswavasu varusha panchanga peedika"). Site engines:
   TRUE Lahiri = mean + Δψ → 24°12'37.1" at 2025-04-14T00:00Z. ✔ match (0.1").
2. **Yogam** — sum of nirayana Sun and Moon longitudes, 13°20' (800') per
   segment, 27 yogas Vishkambham → Vaidhriti (explanatory page).
3. **Karanam** — each tithi = two karanas of 6° (purvardha + uttarardha);
   4 sthira karanas complete the 60-cycle (explanatory page). On a day where
   the purvardha karana does not fall, the uttarardha karana's end time is
   printed.
4. **Sankranti / Tamil month start** — if the sankranti occurs during the
   day-part (before sunset), the same day is the first of the Tamil month; if
   at night, the next day is the first (explanatory page).
5. **Nakshatra tyajya** — from the marked time for 4 nazhigai (= 96 minutes)
   the nakshatra is tyajya; auspicious acts are excluded (explanatory page).
6. **Day assignment** — tithi/nakshatra belonging to a date follow the local
   sunrise at Zurich (owner note; cross-checked against the daily tables).
7. **Amirtadi yogas** — apply until the printed time, then the opposite
   (marana etc.) yoga applies (explanatory page).

## Fixtures (from the daily tables of the PDF)

| # | Gregorian date | Element | Printed Zurich time | UTC | PDF page |
|---|---|---|---|---|---|
| — | pending PDF pages | | | | |

Selection rules per the audit brief: 10–15 fixture dates; ≥ 1 sankranti day;
several days where a tithi or nakshatra ends close to midnight or sunrise.
End-time tolerance for regression tests: **±2 minutes**.

## Alignment: TypeScript ↔ PHP

Both stacks must implement the same Thirukanitha rules and produce identical
output for identical input. Functions changed are logged here with the rule
applied and its PDF page.

| Function (file) | Rule applied | PDF page |
|---|---|---|
| — pending — | | |

## Scores

**Unchanged** (owner ruling: scores stay unchanged until the regression tests
pass; re-score only after green tests).

| # | Previous score | Current score | Re-scored |
|---|---|---|---|
| #26 | (as in prior audit) | unchanged | pending tests |
| #27 | (as in prior audit) | unchanged | pending tests |
| #28 | (as in prior audit) | unchanged | pending tests |
