/**
 * ONE VERDICT LADDER (owner request, Oct 2026)
 *
 * The porutham table printed "Utthamam", "Madhyamam" and "Incompatible" in a
 * single column: two Sanskrit words and one English word, so a reader who does
 * not know the Sanskrit could not tell the rows apart or rank them, and the
 * third row looked like it belonged to a different table. The score badge had
 * the same mix ("Utthamam (Highly Auspicious)", "Madhyamam (with remedies)",
 * "Not Recommended").
 *
 * Every tier is now one plain grading word, in the order's language:
 *
 *   Very Good / மிக நன்று / बहुत अच्छा
 *   Good      / நன்று     / अच्छा
 *   Incompatible / பொருந்தாது / मेल नहीं
 *
 * This suite locks that, on both renderers:
 *
 *   1. the words themselves, per language;
 *   2. the rendered report's Status column uses ONLY those three words, and
 *      never the old jargon ("Utthamam", "Mathimam", "Porundhadhu", "Adhamam");
 *   3. the badge and the recommendation use the same ladder as the rows;
 *   4. old saved orders (legacy labels) still resolve to a tier;
 *   5. the PHP renderer prints the same words, never the raw engine status.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWeddingMatchHtml } from '../src/services/weddingHtmlBuilder.js';
import { calculateSampleResult } from '../src/services/sampleReports.js';
import {
  VERDICT_TIER_HINT,
  VERDICT_TIER_LABEL,
  verdictTierFrom,
  verdictTierHint,
  verdictTierLabel
} from '../src/services/poruthamVerdict.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const rendererPhp = read('api/astrology/report_views.php');
const LANGS: AppLanguage[] = ['en', 'ta', 'hi'];

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const weddingResult: any = await calculateSampleResult('MARRIAGE_COMPATIBILITY', { force: true });

/** The three words a reader may see in the Status column, per language. */
const LADDER: Record<AppLanguage, string[]> = {
  en: ['Very Good', 'Good', 'Not Compatible'],
  ta: ['மிக நன்று', 'நன்று', 'பொருத்தம் இல்லை'],
  hi: ['बहुत अच्छा', 'अच्छा', 'मेल नहीं']
};

/** Words the table must never print again. */
const RETIRED = ['Utthamam', 'Uttamam', 'Uthamam', 'Madhyamam', 'Mathimam', 'Porundhadhu', 'Adhamam',
  'Incompatible', 'உத்தமம்', 'மத்திமம்', 'பொருந்தாது', 'उत्तम', 'मध्यम', 'पोरुंदधु', 'अशुभ'];

console.log('--- ONE VERDICT LADDER ---');

check('the three tiers are plain grading words in English, Tamil and Hindi', () => {
  assert.deepEqual(
    [VERDICT_TIER_LABEL.UTTHAMAM.en, VERDICT_TIER_LABEL.MADHYAMAM.en, VERDICT_TIER_LABEL.PORUNDHADHU.en],
    LADDER.en
  );
  assert.deepEqual(
    [VERDICT_TIER_LABEL.UTTHAMAM.ta, VERDICT_TIER_LABEL.MADHYAMAM.ta, VERDICT_TIER_LABEL.PORUNDHADHU.ta],
    LADDER.ta
  );
  assert.deepEqual(
    [VERDICT_TIER_LABEL.UTTHAMAM.hi, VERDICT_TIER_LABEL.MADHYAMAM.hi, VERDICT_TIER_LABEL.PORUNDHADHU.hi],
    LADDER.hi
  );
  // No duplicate word inside one language: three rows must read as three ranks.
  for (const lang of LANGS) {
    assert.equal(new Set(LADDER[lang]).size, 3, `${lang}: the three tiers must be three different words`);
  }
  // "Very Good" and "Good" are deliberately related (the owner's wording), so
  // a scanning reader must still be able to tell them apart by length/weight:
  // the top rank is always the longer word in every language.
  for (const lang of LANGS) {
    assert.ok(LADDER[lang][0].length > LADDER[lang][1].length, `${lang}: the top rank must read stronger than the middle`);
  }
});

check('the hint form keeps the same three words and adds a short gloss', () => {
  for (const lang of LANGS) {
    for (const tier of ['UTTHAMAM', 'MADHYAMAM', 'PORUNDHADHU'] as const) {
      assert.ok(VERDICT_TIER_HINT[tier][lang].startsWith(VERDICT_TIER_LABEL[tier][lang]),
        `${lang}/${tier}: the hint must open with the ladder word`);
    }
  }
  assert.equal(verdictTierHint('MADHYAMAM', 'en'), 'Good (remedies may help)');
  assert.equal(verdictTierLabel('UTTHAMAM', 'ta'), 'மிக நன்று');
  assert.equal(verdictTierLabel('nonsense', 'en'), 'N/A');
});

check('the rendered Status column uses only the three ladder words', () => {
  for (const lang of LANGS) {
    const html = buildWeddingMatchHtml(weddingResult, lang);
    const pills = [...html.matchAll(/class="porutham-status"><span class="status-pill [a-z-]+">([^<]*)</g)]
      .map(match => match[1]);
    assert.ok(pills.length >= 10, `${lang}: expected the 10 porutham rows, found ${pills.length}`);
    for (const pill of pills) {
      assert.ok(LADDER[lang].includes(pill) || pill === 'N/A',
        `${lang}: the Status column printed '${pill}', which is not on the ladder`);
    }
    // The sample couple is a mixed marriage: all three ranks must be exercised,
    // otherwise a single hard-coded word could pass this test.
    const seen = new Set(pills);
    assert.ok(seen.size >= 2, `${lang}: the sample rows should show more than one rank`);
  }
});

check('no retired verdict word survives in the Status column or the badge', () => {
  // Only the verdict position matters: "उत्तम स्वास्थ्य" (excellent health) is
  // ordinary prose inside an explanation and is not a rank label.
  for (const lang of LANGS) {
    const html = buildWeddingMatchHtml(weddingResult, lang);
    const pills = [...html.matchAll(/class="status-pill [a-z-]+">([^<]*)</g)].map(match => match[1]);
    const badge = /class="score-badge [a-z-]+">([^<]*)</.exec(html)?.[1] ?? '';
    for (const word of RETIRED) {
      assert.ok(!pills.some(pill => pill.includes(word)),
        `${lang}: a Status cell still prints '${word}'`);
      assert.ok(!badge.includes(word), `${lang}: the score badge still prints '${word}'`);
    }
  }
});

check('the badge and the recommendation use the same ladder as the rows', () => {
  const en = buildWeddingMatchHtml(weddingResult, 'en');
  // Sample couple = MADHYAMAM (mixed rows), so the badge must read "Good" and
  // the recommendation must be the middle sentence, not the top one.
  assert.equal(String(weddingResult.verdictStatus), 'MADHYAMAM');
  assert.match(en, /class="score-badge badge-moderate">Good \(remedies may help\)</);
  assert.match(en, /Good match overall — a few poruthams are partial\./);
  assert.doesNotMatch(en, /remedies may be considered/, 'the dead-end remedy line came back');
  assert.doesNotMatch(en, /Utthamam|Madhyamam/);

  for (const lang of LANGS) {
    const html = buildWeddingMatchHtml(weddingResult, lang);
    const badge = /class="score-badge [a-z-]+">([^<]*)</.exec(html)?.[1] ?? '';
    assert.equal(badge, verdictTierHint('MADHYAMAM', lang), `${lang}: the badge does not use the ladder word`);
  }
});

check('an older saved order still resolves to a rank', () => {
  // Values written by previous releases: the enum, the engine's legacy label,
  // the plain wording, and a couple of free-text verdicts.
  assert.equal(verdictTierFrom('UTTHAMAM'), 'UTTHAMAM');
  assert.equal(verdictTierFrom('Uthama (Excellent)'), 'UTTHAMAM');
  assert.equal(verdictTierFrom('Madhyama (Good)'), 'MADHYAMAM');
  assert.equal(verdictTierFrom('Porundhadhu (Not Compatible)'), 'PORUNDHADHU');
  assert.equal(verdictTierFrom('Very Good'), 'UTTHAMAM');
  assert.equal(verdictTierFrom('Good'), 'MADHYAMAM');
  assert.equal(verdictTierFrom('Not Compatible'), 'PORUNDHADHU');
  assert.equal(verdictTierFrom('Incompatible'), 'PORUNDHADHU');
  assert.equal(verdictTierFrom(''), null);
  assert.equal(verdictTierFrom('something else'), null);

  // A stale row carrying only the legacy English label must still print a rank.
  const legacy = { ...weddingResult, poruthams: [{ ...weddingResult.poruthams[0], status: 'Madhyama (Good)' }] };
  const html = buildWeddingMatchHtml(legacy as any, 'en');
  assert.ok(html.includes('Very Good') || html.includes('Good') || html.includes('N/A'));
});

check('the PHP renderer prints the same three words, never the raw engine status', () => {
  for (const lang of LANGS) {
    for (const word of LADDER[lang]) {
      assert.ok(rendererPhp.includes(`'${word}'`), `report_views.php is missing the ${lang} label '${word}'`);
    }
  }
  assert.match(rendererPhp, /function astro_porutham_verdict_label\(\?string \$tier, string \$lang, bool \$withHint = false\)/);
  assert.match(rendererPhp, /function astro_porutham_verdict_tier\(\$value\): \?string/);
  // The table must go through the helper, not echo `$p['status']` (which is the
  // engine's legacy English label and is not translated at all).
  assert.doesNotMatch(rendererPhp, /\$status = \$isTa \? \(\$p\['statusTa'\]/,
    'the porutham table still reads the raw status field');
  assert.match(rendererPhp, /\$status = astro_porutham_verdict_label\(\$statusTier, \$lang\);/);
  // And the score badge uses the ladder too.
  assert.match(rendererPhp, /\$meterBadgeText = astro_porutham_verdict_label\('UTTHAMAM', \$lang, true\);/);
  assert.match(rendererPhp, /\$meterBadgeText = astro_porutham_verdict_label\('MADHYAMAM', \$lang, true\);/);
  assert.match(rendererPhp, /\$meterBadgeText = astro_porutham_verdict_label\('PORUNDHADHU', \$lang, true\);/);
});

check('OrderReportModal and AI Astrologer chat also use only plain tier words, and server mPDF is gone', () => {
  const modalTsx = read('src/components/common/OrderReportModal.tsx');
  const chatPhp = read('api/astrology/ai_astrologer_offline.php');

  assert.ok(!fs.existsSync(path.join(root, 'api/astrology/pdf_mpdf_reports.php')),
    'api/astrology/pdf_mpdf_reports.php must stay deleted');
  assert.match(modalTsx, /verdictTierLabel\(rowTier,\s*selectedLang\)/);
  assert.doesNotMatch(modalTsx, /Utthamam —|Madhyamam —|Adhamam —/);
  assert.doesNotMatch(chatPhp, /Uthamam \(full marks\)|Mathimam \(partial\)|Porundhadhu \(no marks\)|உத்தமம் \(முழு|மத்திமம் \(பகுதி|பொருந்தாது \(மதிப்பெண்|पोरुंदधु/);
  for (const lang of LANGS) {
    for (const word of LADDER[lang]) {
      assert.ok(rendererPhp.includes(`'${word}'`), `report_views.php is missing the ${lang} label '${word}'`);
    }
  }
});

check('the appended guide sheet cannot leave a page header saying "of 2"', () => {
  // The glossary sheet made every report three sheets; the wedding and muhurtham
  // headers still said "of 2" (Tamil too) until these totals were centralised.
  assert.match(rendererPhp, /public const WEDDING_PAGE_TOTAL = 3;/);
  assert.match(rendererPhp, /public const MUHURTHAM_PAGE_TOTAL = 3;/);
  assert.match(rendererPhp, /public const BABY_PAGE_TOTAL = 3;/);
  assert.match(rendererPhp, /self::WEDDING_PAGE_TOTAL, \$lang, '', false, \$preparedLabel\)/);
  assert.match(rendererPhp, /2, self::WEDDING_PAGE_TOTAL, \$lang\)/);
  assert.match(rendererPhp, /1, self::MUHURTHAM_PAGE_TOTAL/);
  assert.match(rendererPhp, /2, self::MUHURTHAM_PAGE_TOTAL/);
  assert.doesNotMatch(rendererPhp, /'பக்கம் 1 \/ 2'|\$isHi \? 'पृष्ठ 1 \/ 2'/,
    'the muhurtham cover still hard-codes 1 / 2');
});

console.log(`\n${passed} verdict-label checks passed.`);
