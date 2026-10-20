/**
 * BIRTH JATHAGAM PAGE 1 — requested additions (2026-10-20).
 *
 * Owner request (English report only):
 *   1. the Janma Rasi row shows the sign AND the zodiac sign — "Mesham/Aries"
 *      for every one of the twelve rasis — in BOLD;
 *   2. the Janma Nakshatra row keeps the star name, in BOLD;
 *   3. every Dosha Analysis card explains its dosha in TWO lines: Sani (which
 *      already had an explanation, now shortened), Kala Sarpa, Pitru and Guru
 *      Chandala. The same short wording is used in Tamil and Hindi ("no big").
 *
 * WHY THIS FILE: page 1 is rendered twice — by the browser/PDF builder
 * (src/services/jathagamHtmlBuilder.ts) and by the PHP renderer used for the
 * admin preview and the emailed PDF (api/astrology/report_views.php). The
 * wording and the zodiac names live in api/astrology/jathagam_page1.json so the
 * two cannot drift; Tamil and Hindi must keep their previous single-name markup.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy.js';
import {
  RASI_NAMES_REPORT,
  ZODIAC_SIGN_EN,
  buildJathagamHtml,
  doshaExplainerText,
  rasiWithZodiacEn
} from '../src/services/jathagamHtmlBuilder.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const page1Json = JSON.parse(read('api/astrology/jathagam_page1.json'));
const reportViewsPhp = read('api/astrology/report_views.php');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const DOSHA_KEYS = ['sani', 'kalaSarpa', 'pitru', 'guruChandala'] as const;
const LANGS: AppLanguage[] = ['en', 'ta', 'hi'];

/** A complete chart with every placement the page needs. */
const chart = calculatePrecisionHoroscope(
  'Sample Devotee',
  '2000-01-01',
  '02:00',
  'Chennai, Tamil Nadu, India',
  13.0827,
  80.2707,
  5.5
);

const html = Object.fromEntries(LANGS.map(lang => [lang, buildJathagamHtml(chart, lang)])) as Record<AppLanguage, string>;
const particulars = (lang: AppLanguage) => {
  const start = html[lang].indexOf('class="devotee-panel"');
  const end = html[lang].indexOf('class="chart-section"', start);
  assert.ok(start !== -1 && end > start, `${lang}: page-1 particulars block not found`);
  return html[lang].slice(start, end);
};
const doshaSection = (lang: AppLanguage) => {
  const marker = lang === 'en' ? 'Dosha Analysis' : lang === 'ta' ? 'தோஷ பரிசீலனை' : 'दोष विश्लेषण';
  const start = html[lang].indexOf(marker);
  assert.ok(start !== -1, `${lang}: dosha section not found`);
  const end = html[lang].indexOf('id="jathagam-page-2"', start);
  const raw = html[lang].slice(start, end === -1 ? start + 8000 : end);
  // The report HTML escapes quotes/apostrophes; compare on the readable text.
  return raw.replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
};

console.log('--- BIRTH JATHAGAM PAGE 1: SIGNS & DOSHA EXPLANATIONS ---');

check('every rasi has an English zodiac twin, and the file is the single source', () => {
  assert.deepEqual(
    Object.keys(ZODIAC_SIGN_EN).map(Number).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    'all twelve signs must map to a zodiac name'
  );
  for (let rasi = 1; rasi <= 12; rasi += 1) {
    assert.equal(ZODIAC_SIGN_EN[rasi], ZODIAC[rasi - 1], `rasi ${rasi} zodiac name`);
    assert.equal(
      rasiWithZodiacEn(rasi),
      `${RASI_NAMES_REPORT[rasi].en}/${ZODIAC[rasi - 1]}`,
      `rasi ${rasi} must print as "Mesham/Aries" style`
    );
  }
  assert.equal(rasiWithZodiacEn(null), 'N/A', 'an unknown sign must stay N/A');
  assert.equal(rasiWithZodiacEn(99), 'N/A', 'an out-of-range sign must stay N/A');
  assert.deepEqual(page1Json.zodiacSignEn, ZODIAC_SIGN_EN, 'the JSON and the TS export must be the same data');
});

check('English page 1 prints the rasi as a BOLD "Mesham/Aries" under the zodiac heading', () => {
  const block = particulars('en');
  assert.match(block, /Janma Rasi \/ Zodiac Sign<\/span><span class="value"><strong>[A-Za-z]+\/[A-Za-z]+<\/strong><\/span>/);
  const shown = /Janma Rasi \/ Zodiac Sign<\/span><span class="value"><strong>([^<]+)<\/strong>/.exec(block);
  assert.ok(shown, 'the dual rasi value is missing');
  const expected = rasiWithZodiacEn(Number(chart.chandraRasi));
  assert.equal(shown![1], expected, 'the printed rasi must come from the chart, in Mesham/Aries form');
});

check('English page 1 keeps the nakshatra name, in BOLD', () => {
  const block = particulars('en');
  assert.match(block, /Janma Nakshatra \/ Star Sign<\/span><span class="value"><strong>[^<]+<\/strong> — Pada \d|Janma Nakshatra \/ Star Sign<\/span><span class="value"><strong>[^<]+<\/strong> — N\/A/);
  const shown = /Janma Nakshatra \/ Star Sign<\/span><span class="value"><strong>([^<]+)<\/strong>/.exec(block);
  assert.ok(shown, 'the bold nakshatra value is missing');
  assert.equal(shown![1], chart.janmaNakshatraEn, 'the star name must not be changed, only bolded');
});

check('Tamil and Hindi page 1 keep their previous single-name markup', () => {
  const ta = particulars('ta');
  assert.match(ta, /ராசி<\/span><span class="value">[^<]+<\/span>/, 'Tamil rasi row changed');
  assert.match(ta, /நட்சத்திரம்<\/span><span class="value">[^<]+ — /, 'Tamil nakshatra row changed');
  const hi = particulars('hi');
  assert.match(hi, /राशि \(Moon Sign\)<\/span><span class="value">[^<]+<\/span>/, 'Hindi rasi row changed');
  assert.match(hi, /नक्षत्र \(Nakshatra\)<\/span><span class="value">[^<]+ — /, 'Hindi nakshatra row changed');
  for (const lang of ['ta', 'hi'] as AppLanguage[]) {
    assert.doesNotMatch(particulars(lang), /<strong>/, `${lang} must not gain the new bold markup`);
  }
});

check('all four dosha cards explain the dosha in exactly two sentences, in every language', () => {
  for (const key of DOSHA_KEYS) {
    for (const lang of LANGS) {
      const text = doshaExplainerText(key, lang);
      assert.ok(text.length > 40, `${key}/${lang}: explanation is missing`);
      const sentences = text
        .split(lang === 'hi' ? /[।.]\s+/ : /\.\s+/)
        .map(part => part.trim())
        .filter(Boolean);
      assert.equal(sentences.length, 2, `${key}/${lang}: expected exactly 2 sentences, got ${sentences.length}`);
      assert.ok(text.length < 900, `${key}/${lang}: explanation must stay short ("no big")`);
      assert.equal(page1Json.doshaExplainers[key][lang], text, `${key}/${lang}: JSON and renderer disagree`);
    }
  }
});

check('English page 1 prints those explanations instead of the long paragraphs', () => {
  const section = doshaSection('en');
  for (const key of DOSHA_KEYS) {
    assert.ok(section.includes(doshaExplainerText(key, 'en')), `${key}: explanation not printed on page 1`);
  }
  // The old long remedy paragraphs must be gone from page 1.
  assert.doesNotMatch(section, /Traditionally the 7.5-year Sade Sati/, 'the long Sade Sati paragraph came back');
  assert.doesNotMatch(section, /Give in charity: Black sesame seeds/, 'the long Sani remedy paragraph came back');
  assert.doesNotMatch(section, /Amavasya tarpanam/, 'the long Pitru remedy paragraph came back');
});

check('Tamil and Hindi page 1 print the same short explanations', () => {
  for (const lang of ['ta', 'hi'] as AppLanguage[]) {
    const section = doshaSection(lang);
    for (const key of DOSHA_KEYS) {
      assert.ok(section.includes(doshaExplainerText(key, lang)), `${key}/${lang}: explanation not printed`);
    }
  }
});

check('the PHP renderer reads the same JSON and uses it for every dosha card', () => {
  assert.match(reportViewsPhp, /jathagam_page1\.json/, 'PHP does not read the shared page-1 JSON');
  assert.match(reportViewsPhp, /function astro_jathagam_page1\(\)/, 'missing the page-1 JSON loader');
  assert.match(reportViewsPhp, /function astro_jathagam_dosha_explainer\(/, 'missing the explainer accessor');
  for (const key of DOSHA_KEYS) {
    // Sani is shared by the three Sani cards, the other three by name match in
    // the engine-dosha loop; the key must reach the accessor either literally
    // or through the matched variable.
    if (key === 'sani') {
      assert.ok(
        (reportViewsPhp.match(/astro_jathagam_dosha_explainer\('sani', \$lang\)/g) || []).length >= 4,
        'every Sani card (Ezharai / Ashtama / Kandaka / none) must print the explainer'
      );
    } else {
      assert.ok(reportViewsPhp.includes(`'${key}'`), `PHP never resolves the ${key} explainer key`);
    }
  }
  assert.match(reportViewsPhp, /astro_jathagam_dosha_explainer\(\$explainerKeyForPdf, \$lang\)/, 'the engine-dosha loop does not print the explainer');
  assert.doesNotMatch(reportViewsPhp, /saniRemedyFullForPdf/, 'the long Sani remedy paragraph is still in the renderer');
});

check('the PHP page-1 particulars print the dual bold rasi and the bold star (English only)', () => {
  assert.match(reportViewsPhp, /Janma Rasi \/ Zodiac Sign &amp; Lord:/, 'English rasi heading missing');
  assert.match(reportViewsPhp, /Janma Nakshatra \/ Star Sign:/, 'English nakshatra heading missing');
  assert.match(reportViewsPhp, /\$rasiValueHtml = \(\$isTa \|\| \$isHi\) \? \$rasiName : '<strong>' \. \$rasiDualEn \. '<\/strong>';/, 'rasi bold/dual markup missing');
  assert.match(reportViewsPhp, /\$nakValueHtml = \(\$isTa \|\| \$isHi\) \? \$nakName : '<strong>' \. \$nakName \. '<\/strong>';/, 'nakshatra bold markup missing');
  assert.match(reportViewsPhp, /\{\$rasiValueHtml\} \(\{\$rasiLord\}\)/, 'the rasi cell does not use the new value');
  assert.match(reportViewsPhp, /\{\$nakValueHtml\}, Pada \{\$pada\}/, 'the nakshatra cell does not use the new value');
  assert.match(reportViewsPhp, /\$rasiDualEnRaw = \$zodiacEnForRasi !== '' \? \$rasiBaseEn \. '\/' \. \$zodiacEnForRasi : \$rasiBaseEn;/, 'PHP does not build "Mesham/Aries"');
});

console.log(`\n${passed} Birth Jathagam page-1 checks passed.`);
