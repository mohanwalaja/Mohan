# AI Astrologer: Unlimited Questions + Learned, Distinct Answers Per Option

> Field feedback:
> 1. *"In AI astrologer chat should be no limit in question."*
> 2. *"Mostly in all topics the 4 option answers are same — check multiple
>    sources and learn all answers."*

## 1. Questions are now unlimited

The 20-per-day allowance (`AI_ASTROLOGER_DAILY_LIMIT`, enforced through
`astro_rate_limit_enforce()` on the `ai_astrologer_ask` bucket) is removed
from `api/ai_astrologer.php`:

* the ask handler no longer counts or refuses questions — `remainingToday`
  is `null` and `unlimited` is `true` for customers and admins alike;
* the `session` and `usage` actions report `dailyLimit: null` /
  `unlimited: true` (usage still returns the report's chat language for the
  launcher);
* `astro_ai_daily_limit()` and `astro_ai_usage_count()` are deleted, and the
  `AI_ASTROLOGER_DAILY_LIMIT` line is gone from `.env.example`;
* the panel header now shows **"Unlimited questions"** (admins:
  "Administrator access · unlimited questions"); the remaining-counter UI is
  removed.

Access is still bounded by the real gates: authentication, the
delivered-report entitlement and the 7-day chat window — so the endpoint
cannot be hammered by visitors without a report.

## 2. Every option now answers from its own learned reading

### Why the four options in a topic used to look the same

`retrieveArea()` only returned rules whose chart condition **fired**. When a
focused option's rules did not fire on the customer's chart (or when no chart
was attached), `areaBubbles()` fell back to the same card-wide summary /
general text for all four options — identical answers.

### What changed

* `knowledge/ai-astrologer/rules/life-areas.json`: every rule that a guided
  option points at (all 32 focus rules) now carries a `general` field — a
  customer-facing classical reading of that combination, written
  conditionally ("when the 4th lord is strong, the classics read…") in
  **en / ta / hi**, drawn from the same verified books each rule already
  cites (Parashara via Poorva Parasariyam, Jataka Parijata via Sadhaka
  Parisatham, Phaladeepika, Sadhaka Parisatham verses 46-51, Uttara
  Kalamrita…). Two new rules were added so no option is left without its own
  reading: `property-loan` (home-loan question, previously an empty focus)
  and `current-year`.
* `api/astrology/ai_astrologer_offline.php`:
  * `retrieveArea()` now returns a `catalog` of **all** rules (fired flag,
    meaning, general, sources), not just the fired ones;
  * `areaBubbles()` answers a focused option from its own rules in three
    modes — fired rule → personal reading; rule absent from this chart →
    "your chart does not carry this combination… the classical reading it
    comes from: {general}"; no chart at all → the classical reading stands
    alone (+ personal hint). The overview option is unchanged;
  * new `focusSourceLine()` cites the sources of the rules that answer THAT
    option (up to four), so each option shows its own classical references;
  * `currentGuidanceBubbles()` gives the same per-option treatment when no
    chart is attached.
* `guided-questions.json`: `property-loan` now focuses `["property-loan"]`.
  The `api/knowledge/…` deployment copies are kept identical.

## Verification

`tests/ai-astrologer-guided-focus.test.ts` runs every curated area option
through the real PHP reply builder under PHP-WASM (`@php-wasm/node`,
installable with `npm i --no-save @php-wasm/node @php-wasm/universal`) and
asserts: within each chapter, focused options give pairwise-different
answers — true with the probe chart, and structurally guaranteed otherwise
by the per-rule `general` readings (a new static check fails the build if
any focus rule loses its trilingual `general` text or its ≥2 sources).
`tests/ai-astrologer-access.test.ts` now pins the unlimited contract (no
enforce, no bucket, `unlimited: true` everywhere).

```bash
npm run lint && npm test && npm run build   # all green
```
