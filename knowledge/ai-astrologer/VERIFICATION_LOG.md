# ASTRO SIVAM — Knowledge-Base Verification & Audit Log

## 1. Current Curated Source State (2026-10-24)

- **Audited registry records**: **47** (`35` Tamil-language records + `8` English-language records + `4` Sanskrit-language records).
- **Active references**: **44** (`32` Tamil works & Sthalam/reference records + `8` English + `4` Sanskrit calculation & structural works).
- **Non-citable audit records**: **3** — `TA-10` is `suppression-only`; `TA-11` and `TA-25` are `background-only`.
- **Actively cited in rules / ephemeris**: **44 / 44 active references (100%)**. Non-active records have no positive rule citations.
- **Hindi book sources**: **0** — legacy `HI-*` records, `excludedSources`, and dead Hindi blog entries (`REF-04`) remain purged.
- **Unverified / dead / scraped entries**: **0** — legacy `tamilnavarasam.in` links, undecoded scraper stubs, and `linked-not-opened` placeholders remain removed.
- **Customer citation filter**: `AstroAiProvider::citableTamilSources()`, `isCitableId()` and `tamilOnlySourceLine()` now require active citation status as well as Tamil language and a recognised verification level. Passage-level suffixes remain restricted to `TA-02` (*Sadhaka Parisatham / Tamil Jataka Parijata*) and `TA-07` (*Abithana Chintamani*).
- **Published-book boundary**: only published books were added in this expansion. Existing temple, collection, API and secondary-web records were retained in separate bibliography sections rather than reclassified as books.
- **Bibliography generation**: `SOURCES.md` is generated from `sources.json` by `scripts/generate-ai-astrologer-sources.mjs`; an exact-generation test prevents title and count drift.

## 2. Verification Breakdown

| Level | Count | Meaning |
| :--- | ---: | :--- |
| `content-read` | 30 | Publication evidence and identified actual full-text passages were opened and read directly; this does not mean cover-to-cover review |
| `metadata-verified` | 16 | Bibliographic or Tamil Nadu Navagraha Sthalam metadata verified without claiming substantive book-content review |
| `catalogue-verified` | 1 | Public academic library record verified at book level |
| **Total** | **47** | **44 active + 2 background-only + 1 suppression-only** |

## 3. TA-26 — குடும்ப ஜோதிடம் (2026-10-24)

- Registered the user-supplied Drive document `1XaSyISRxTzNQ8qauCjqzQ7r0YKSy3hWS` (*Kudumpa Jothidam.pdf*, 3,623,122 bytes; MD5 `1dd2af16adc22f6f8b790b865dfeccef`). Its embedded text extraction contains only a repeated watermark, so no book content was inferred from the filename or watermark.
- Content verification used the publicly accessible same-title scan linked as `secondaryUrl` in `sources.json`. The scan is not byte-identical to the Drive upload. All 129 landscape spreads were split into 258 book pages and OCR-processed; the title page, the authors' 10-3-1978 foreword date, printed pp.125, 131, 138-139 and 242, and the journal form following p.242 were cross-checked visually.
- Added source-attributed rules for a family horoscope journal (printed p.242), reading natal/Dasha-Bhukti and Gochara results together (pp.125, 131), and prioritising mental compatibility and consent alongside Porutham tables (pp.138-139).
- Added the guided-chat option `current-family-journal`, routed to `family-kudumpa-jothidam-method`. Citations remain book-level because the two PDF scans have different pagination and passage-level citation is not claimed.
- Historical fatalistic health, longevity and fixed-outcome passages were not imported. Existing safety guardrails continue to apply to every answer.

## 4. Published-Book Audit and Expansion (2026-10-24)

### Existing-record corrections

- Corrected bibliography title drift by generating `SOURCES.md` directly from the registry.
- Promoted only records with reviewed title/publication material and targeted actual content: `TA-01`, `TA-03`, `TA-04`, `TA-05`, `TA-06`, `TA-08`, `TA-10`, `TA-11`, `TA-12`, `TA-14` and `TA-24`.
- `TA-01`: recorded the 2009 sixth edition, Saraswathi Mahal publication no.164 and editor S. Swaminatha Sastri. The original author/date remain unknown; the title alone is not treated as proof of authorship by Parasara.
- `TA-02`: recorded Vedalingappattar's Tamil work, original Sanskrit author Vaidhyanatha Desikar, editor Dr. Sathyabama Kameswaran, publication no.505 and first edition August 2007.
- `TA-03`: recorded Varahamihira as original author, Vaithiyalinga Bhattar as Tamil translator/commentator, S. P. K. Lal and registered 1934. Reviewed Raja-yoga, Chandra-yoga and Ashtavarga passages; removed unsupported Budhaditya and Pancha-Mahapurusha citations.
- `TA-04`: recorded K. M. Deivasigamani, A. Muthuvadivel Mudaliar, Madras, 1939 and reviewed Dasha/Bhukti method. Deterministic maraka/death content was not imported.
- `TA-05`: recorded Thillai Nayaga Pulavar, editor Dr. Sathyabama Kameswaran and first edition September 2008. Printed pp.130-137 support combined house/lord/occupant/aspect/karaka judgement.
- `TA-06`: recorded Dr. Pulippani Sundaravaradachariar and second edition 2007. Naming is retained only as general custom; no unlocated syllable or Gana table is claimed.
- `TA-08`: limited Ki. Va. Jagannathan's May 1951 *Navagraham* to cultural/devotional context, not calculation evidence.
- `TA-10`: confirmed as Dr. M. Shanmugavelu's 1972 Siddha medical treatment book, not astrology. It is now suppression-only and is never used for spiritual remedies, diagnosis or treatment.
- `TA-11`: confirmed as a historic Ananda-year Navagraha-results booklet; it is background-only, not a current forecast or naming/Gana source.
- `TA-12`: recorded Narasimha Suri, editor Thethiyur S. Krishnamurthi Sastri and sixth edition 2009.
- `TA-13`: recorded Mitta Munisami Chetti and R. G. Press, Madras, but remains `metadata-verified` with `year: null`; unclear OCR is not used to choose between conflicting dates.
- `TA-14`: retained only broad traditional Panchangam/Vakya context because reviewed closing OCR is too noisy for numeric-rule import.
- `TA-24`: limited to Suryanar Kovil history and Sun worship; removed its unsupported Muhurtham-date citation.
- `TA-25`: retained as an existing non-book background record and removed from active rules. Historical calendar claims no longer rely on it.

### New published Tamil books

| ID | Publication evidence | Actual reviewed content and admitted scope |
| --- | --- | --- |
| `TA-27` — *Sadhaka Alankaram / Jataka Alankaram* | Traditional author Keeranur Natarajan; editor C. Govindarasanar; Saraswathi Mahal no.428; third edition July 2007; 648 pages | Printed pp.107-112 (dignity, aspects, karakas) and pp.348-354 (second house and Dhana yoga). Editorial ethical-remedy wording is not automatically attributed to the traditional text. |
| `TA-28` — *Kumaraswamiyam* | Editor Dr. Sathyabama Kameswaran; Saraswathi Mahal no.497; first edition May 2007 | Separate Gochara and Varshaphala chapters plus later Muhurtha material. Porutham rules were not located and are not claimed; deterministic omens/outcomes were excluded. |
| `TA-29` — *Sarvartha Chinthamani* | Source-work author Venkatesa Daivajna; editor Dr. Sathyabama Kameswaran; Saraswathi Mahal no.506; first edition August 2007 | A 333-verse Tamil summary, not claimed as a complete direct translation. Reviewed second-house family, speech, learning, food and resource significations; deterministic medical and fixed-wealth claims were excluded. |

### Curated integration

- Expanded the encyclopedia from **21 to 22 topics** with `transit-varshaphala-method`, cited to `TA-28`, `TA-26` and `TA-04`.
- Enriched the existing `bhavas.houses["2"]`; no duplicate second-house topic was created. Global bhava citations now include the generally applicable `TA-05` and `TA-27` method.
- Added `TA-27` and `TA-29` to `yoga-dhana` with explicit multi-factor, non-fixed-wealth wording.
- Added guided options `bhava-family-resources-guide` and `transit-varshaphala-guide`, bringing the complete guided menu to **95 options** across **20 categories**.
- Removed non-active records from positive rule citations and added registry-status enforcement to customer citation filtering.

This records a verified batch, not universal coverage of all Tamil astrology books. It also records local curated-source work only; commit, deployment, browser testing and production verification remain separate steps.

## 5. Published Sanskrit Book Batch (2026-10-24)

This is a reviewed batch of accessible published Sanskrit or bilingual Sanskrit-English editions, not a claim that every Sanskrit astrology book or manuscript has been loaded. Each promoted record has title/publication evidence and direct review of identified actual text.

| ID | Publication evidence | Actual reviewed content and admitted scope |
| --- | --- | --- |
| `SA-01` — *Brihat Jataka with Bhattotpala Sanskrit commentary* | Title page identifies Varahamihira, Bhattotpala's Sanskrit commentary, Pandit Sitaram Jha's revision/notes and Sri Harikrishna Nibandha Bhavan, Banaras City. The OCR year is unclear, so `year` remains `null`. | Printed Raja-yoga chapter pp.155-160, including stanzas 7-20 and commentary. Only multi-factor structure, strength and Dasha timing context are used; fixed kingship, caste/lineage and status outcomes were excluded. |
| `SA-02` — *Sarvartha Chintamani with English Translation* | First edition, Aryan Press, Bellary, 1899; original Devanagari Sanskrit with English translation by B. Suryanarain Row. | First Adhyaya stanzas 10-12 and notes: Rasi/Navamsa lords and Kalapurusha context. The translator's non-fatalistic note is attributed to the translator, not the original verse. |
| `SA-03` — *Muhurta Chintamani with Piyushadhara Sanskrit commentary* | Fifth edition, 1945, Nirnaya Sagar Press; Sri Ram Daivajna, Govinda Jyotirvid's Sanskrit commentary and Narayan Ram Acharya Kavyatirtha's revision. | Opening Muhurta-prayojana and early tithi sections, printed pp.1-12. Only Muhurta/Panchanga scope and tithi terminology are used; deterministic outcomes and caste/ritual-eligibility restrictions were excluded. |
| `SA-04` — *Jaimini Sutras with English Translation and Full Notes* | Fifth edition, 1955, IBH Prakashana; B. Suryanarain Rao's English translation/full notes with original Devanagari and transliteration, revised and annotated by Bangalore Venkata Raman. | Adhyaya I, Pada I, Sutras 1-9: Jaimini Rasi aspects and Argala/obstruction. These remain explicitly distinct from the report's Parashari planetary-aspect rules. |

### Integration and exclusions

- Added `SA-01` to `yoga-raja`, `SA-02` and `SA-04` to the existing chart-fundamentals topic, and `SA-03` to `panchangam-muhurtham-selection`, all at book level with scoped notes.
- The encyclopedia remains **22 topics** and the guided menu remains **95 options across 20 categories**. No Jaimini Rasi Dasha, Karakamsa or new Muhurta calculation engine was added.
- Sanskrit records are internal structural references. Customer-facing source footers continue to contain active Tamil references only; `SA-*` IDs are not customer-citation eligible.
- The separately reviewed Haridas Sanskrit Series Muhurta Chintamani explicitly has a Hindi commentary and was not used for `SA-03`. B. Row Brihat Jataka/Jataka Chandrika derivatives that failed through server or OCR errors were not used, no Jataka Chandrika record was promoted, and the unresolved 1855 Muhurta candidate remains out of the active registry.

## 6. Local Validation Evidence (2026-10-24)

- Source registry: **7 checks passed**, including exact `SOURCES.md` generation, absence of non-active records from positive rule citations, and active book-scoped integration of all four reviewed Sanskrit editions.
- Provider/static retrieval: **12 provider**, **22 knowledge**, **21 guided**, **10 guided-focus**, **26 report**, and **6 Tamil-only citation** checks passed in the focused/full runs.
- Report/chat consistency: **15 checks passed**, with **120 comparisons and 0 mismatches**.
- PHP-WASM provider: **10 checks passed**; diagnostics report **47 total / 44 active / 3 non-active / 32 citable Tamil**, with language totals **35 Tamil / 8 English / 4 Sanskrit**. `TA-10`, `TA-11`, `TA-25` and all four `SA-*` records are absent from the customer-citation pool.
- PHP-WASM guided runtime: **11 checks passed**, including both new guided routes and their source lines.
- Exhaustive PHP-WASM matrix: **10 checks passed** across **570 guided answers** (`95 × 3 languages × chart/no-chart`) and **119 free-text queries**, with zero guard failures, zero astrology `NO_MATCH`, and zero cross-script leaks.
- Full `npm test`: exited **0**. `npm run lint` (`tsc --noEmit`) and `npm run build` also exited **0**.
- Fresh build shape: **9 checks passed**. Runtime `sources.json` and all rule JSON files are byte-identical between `knowledge/ai-astrologer/` and `api/knowledge/ai-astrologer/`.
- Separate preserved admin follow-up: **8 checks passed**.
- `git diff --check` and the bibliography generation check passed. No browser-level test, deployment, freshly uploaded `dist.zip`, or production verification is claimed.
