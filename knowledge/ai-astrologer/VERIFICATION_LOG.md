# ASTRO SIVAM — Knowledge-Base Verification & Audit Log

## 1. Current Production State (2026-10-23)

- **Active verified sources**: **39** (`31` Tamil works & Sthalam records + `8` foundational English/Sanskrit calculation & structural works).
- **Actively cited in rules / ephemeris**: **39 / 39 (100%)** — zero unused or orphan catalogue records.
- **Hindi book sources**: **0** — all legacy `HI-*` records, `excludedSources`, and dead Hindi blog entries (`REF-04`) have been permanently purged.
- **Unverified / dead / scraped entries**: **0** — all `tamilnavarasam.in` links (`TA-33`, `TA-140`..`TA-195`), undecoded scraper stubs (`TA-34`..`TA-139`), and `linked-not-opened` placeholders have been permanently removed.
- **Customer citation filter**: Enforced in `AstroAiProvider::isCitableId()` and `AstroAiProvider::tamilOnlySourceLine()` — only verified Tamil sources (`language: "ta"`) appear in customer-facing `Source:` footers; passage-level suffixes are restricted to `TA-02` (*Jataka Alankaram*) and `TA-07` (*Abithana Chintamani*).

## 2. Verification Breakdown

| Level | Count | Meaning |
| :--- | ---: | :--- |
| `content-read` | 11 | Full text or verified translation read and cross-checked directly |
| `metadata-verified` | 27 | Authoritative Tamil classical bibliographic or Tamil Nadu HR&CE Navagraha Sthalam record verified |
| `catalogue-verified` | 1 | Public academic library record verified at book level |
| **Total** | **39** | **100% verified, 0 dead, 0 unverified** |
