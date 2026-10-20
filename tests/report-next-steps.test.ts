/**
 * NO DEAD ENDS (owner request, Oct 2026)
 *
 * Two reports told the customer what was wrong and then stopped:
 *
 *   • Marriage: "Acceptable match; remedies may be considered." — which
 *     remedies? Where? And "seek expert review" with nothing to click.
 *   • Baby Naming: four sacred syllables, name lists, and never one line
 *     saying WHY the first sound has to be one of them — the whole point of
 *     the service.
 *
 * This suite locks both fixes on both renderers:
 *
 *   1. a matching couple (Very Good / Good) is pointed at the Subha Muhurtham
 *      report to pick the wedding date, with the URL printed;
 *   2. a non-matching couple is pointed at a human review, not a vague
 *      "ask an astrologer";
 *   3. the dead-end remedy sentence never returns;
 *   4. Baby Naming explains the first sound on page 1, in en/ta/hi;
 *   5. neither change adds a sheet or moves content across sheets.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWeddingMatchHtml } from '../src/services/weddingHtmlBuilder.js';
import { buildBabyNamingHtml } from '../src/services/babyNamingHtmlBuilder.js';
import { calculateSampleResult } from '../src/services/sampleReports.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererPhp = fs.readFileSync(path.join(root, 'api/astrology/report_views.php'), 'utf8');
const LANGS: AppLanguage[] = ['en', 'ta', 'hi'];

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const wedding: any = await calculateSampleResult('MARRIAGE_COMPATIBILITY', { force: true });
const baby: any = await calculateSampleResult('BABY_NAMING', { force: true });

const NEXT_STEP_LABEL: Record<AppLanguage, string> = {
  en: 'NEXT STEP',
  ta: 'அடுத்த படி',
  hi: 'अगला कदम'
};

/** The final-verdict area of a rendered marriage report (page 1 only). */
function verdictBlock(html: string): string {
  const start = html.indexOf('class="final-verdict ');
  assert.ok(start >= 0, 'the final verdict block is missing');
  const end = html.indexOf('class="glossary-pointer"', start);
  return html.slice(start, end > start ? end : html.indexOf('id="wedding-page-2"', start));
}

console.log('--- NO DEAD ENDS ---');

check('a matching couple is sent to the Subha Muhurtham service', () => {
  for (const tier of ['UTTHAMAM', 'MADHYAMAM'] as const) {
    for (const lang of LANGS) {
      const html = buildWeddingMatchHtml({ ...wedding, verdictStatus: tier } as any, lang);
      const block = verdictBlock(html);
      assert.ok(block.includes(NEXT_STEP_LABEL[lang]), `${tier}/${lang}: no next-step label`);
      assert.ok(block.includes('astrosivam.com/subha-muhurtham'),
        `${tier}/${lang}: the next step does not name the Subha Muhurtham service`);
      // The reason to use it: it checks the couple's own star strength.
      const starBala = lang === 'en' ? 'Tara Bala' : lang === 'ta' ? 'தாரா பலம்' : 'तारा बल';
      assert.ok(block.includes(starBala), `${tier}/${lang}: the next step never says what Muhurtham checks`);
      assert.ok(!block.includes('astrosivam.com/contact'),
        `${tier}/${lang}: a matching couple is still being sent to support instead of the date service`);
    }
  }
});

check('a non-matching couple gets the verdict alone — no next step, no upsell', () => {
  for (const lang of LANGS) {
    const html = buildWeddingMatchHtml({ ...wedding, verdictStatus: 'PORUNDHADHU' } as any, lang);
    const block = verdictBlock(html);
    assert.ok(!block.includes(NEXT_STEP_LABEL[lang]), `${lang}: an incompatible verdict still carries a next step`);
    assert.ok(!block.includes('final-verdict-next'), `${lang}: the next-step block is still rendered`);
    assert.ok(!block.includes('subha-muhurtham'),
      `${lang}: a couple who do not match must not be pushed to booking a date`);
    assert.ok(!block.includes('astrosivam.com/contact'), `${lang}: no referral line either`);
  }
});

check('the dead-end remedy sentence is gone from both renderers', () => {
  for (const lang of LANGS) {
    const html = buildWeddingMatchHtml({ ...wedding, verdictStatus: 'MADHYAMAM' } as any, lang);
    assert.doesNotMatch(html, /remedies may be considered/i, `${lang}: "remedies may be considered" came back`);
  }
  assert.doesNotMatch(rendererPhp, /remedies may be considered/i,
    'report_views.php still prints "remedies may be considered"');
});

check('the next step lives inside the verdict on page 1, not on a new sheet', () => {
  const html = buildWeddingMatchHtml(wedding, 'en');
  const pageOneEnd = html.indexOf('id="wedding-page-2"');
  const block = html.indexOf('final-verdict-next');
  assert.ok(block > 0 && block < pageOneEnd, 'the next step is not on page 1');
  assert.equal((html.match(/class="final-verdict-next-label"/g) || []).length, 1,
    'the next step is printed more than once');
  assert.equal((html.match(/<div class="page"/g) || []).length, 3, 'the marriage report changed sheet count');
});

check('Baby Naming explains why the first sound matters, on page 1', () => {
  const titles: Record<AppLanguage, string> = {
    en: 'Why the First Sound Matters',
    ta: 'ஏன் முதல் ஒலி முக்கியம்',
    hi: 'पहली ध्वनि क्यों महत्वपूर्ण है'
  };
  for (const lang of LANGS) {
    const html = buildBabyNamingHtml(baby, lang);
    const pageOne = html.slice(html.indexOf('id="namakaran-page-1"'), html.indexOf('id="namakaran-page-2"'));
    assert.ok(pageOne.includes(titles[lang]), `${lang}: the explainer is missing from page 1`);
    // It must say WHY: the sound comes from the birth star and pada.
    const star = lang === 'en' ? 'birth star' : lang === 'ta' ? 'பிறந்த நட்சத்திரம்' : 'जन्म नक्षत्र';
    const pada = lang === 'en' ? 'pada' : lang === 'ta' ? 'பாத' : 'पाद';
    assert.ok(pageOne.includes(star), `${lang}: the explainer never mentions the birth star`);
    assert.ok(pageOne.includes(pada), `${lang}: the explainer never mentions the pada`);
    assert.equal((html.match(/<div class="page /g) || []).length, 3, `${lang}: Baby Naming changed sheet count`);
    assert.equal((pageOne.match(/why-sound-panel/g) || []).length, 1,
      `${lang}: the explainer is printed more than once`);
  }
});

check('the PHP renderer carries the same copy', () => {
  assert.match(rendererPhp, /astrosivam\.com\/subha-muhurtham/, 'no Muhurtham URL in the PHP verdict');
  assert.doesNotMatch(rendererPhp, /astrosivam\.com\/contact/, 'the retired contact line is still in the PHP verdict');
  assert.match(rendererPhp, /\$nextStepLabel = \$isTa \? 'அடுத்த படி' : \(\$isHi \? 'अगला कदम' : 'NEXT STEP'\);/);
  assert.match(rendererPhp, /\$nextStepText = \$isTa/);
  assert.match(rendererPhp, /class="bn-why"/);
  assert.match(rendererPhp, /\$whySoundTitle = \$isTa \? 'ஏன் முதல் ஒலி முக்கியம்'/);
});

console.log(`\n${passed} no-dead-end checks passed.`);
