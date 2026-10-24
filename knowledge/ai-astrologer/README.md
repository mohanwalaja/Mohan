# ASTRO SIVAM — Local Source-Based Astrologer Knowledge Base

Deterministic, zero-LLM astrology knowledge base serving `api/ai_astrologer.php`, `api/astrology/ai_astrologer_provider.php`, and `api/astrology/ai_astrologer_offline.php`.

## Architecture Principles

1. **100% Deterministic & Offline**: No external LLM provider, API key, or outbound network call is ever used. Every answer is assembled deterministically from:
   - The customer's own report readings recalculated via `AstroEngine::rebuildReportResultFromSavedInputs()`,
   - Curated chart rules in `rules/life-areas.json`,
   - Classical encyclopedia entries in `rules/astrology-encyclopedia.json`,
   - Affordable traditional remedies & Tamil Nadu Navagraha Sthalams in `rules/remedies.json`,
   - Curated guided menu options in `rules/guided-questions.json`,
   - Strict safety & non-fatalistic guardrails in `rules/guardrails.json`,
   - Ownership-verified report section explanations in `rules/report-sections.json`.
2. **Zero Hindi Book Sources & Explicit Citation Status**: `sources.json` holds **47 audited records**: **44 active references** (`32` Tamil + `8` English + `4` Sanskrit calculation/structural works), **2 background-only** records and **1 suppression-only** record. Only active Tamil references are customer-citation eligible (`AstroAiProvider::citableTamilSources()` / `tamilOnlySourceLine()`). Customer reply languages remain supported in `en`, `ta`, and `hi`. `SOURCES.md` is generated from the registry with `node scripts/generate-ai-astrologer-sources.mjs`; do not hand-edit it.
3. **Dual-Root Mirror Parity**: `knowledge/ai-astrologer/` and `api/knowledge/ai-astrologer/` stay byte-identical so both full `dist.zip` / `deploy_cpanel.sh` deployments and `api/`-only syncs always carry the exact same verified ruleset. Direct public HTTP access to `/knowledge/` and `/api/knowledge/` is denied via `.htaccess`.
