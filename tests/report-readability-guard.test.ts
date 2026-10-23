import { readRepoSource } from './helpers/module-sources.js';
/**
 * REPORT READABILITY GUARD (owner request, Oct 2026)
 *
 * "All our users have to understand easily." These checks lock the plain-language
 * rules that the customer-facing reports must keep, so a future copy edit cannot
 * quietly reintroduce the defects found in the readability audit
 * (docs/REPORTS_READABILITY_AUDIT_2026-10-20.md):
 *
 *   1. No sentence repeats the same condition twice in one card. The old life
 *      card printed "debilitated, retrograde, requiring review and patience,
 *      Debilitated (Neecha), Retrograde (Vakri)" — the Sanskrit gloss is now
 *      carried inline and the duplicate tag line is gone.
 *   2. Technical words that a layperson cannot know are always glossed on first
 *      use: "debilitated (Neecha)", "retrograde (Vakri)", "combust (Astangata)".
 *   3. A Tamil or Hindi report must not contain hard-coded English fragments
 *      (" at ", "Pada 2") in its particulars.
 *   4. Plain-English verdicts. "There is no active any of Sani Dosha" was
 *      ungrammatical and is now "No Sani dosha is active in your chart".
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy.js';
import { buildJathagamHtml } from '../src/services/jathagamHtmlBuilder.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);
const builderTs = read('src/services/jathagamHtmlBuilder.ts');
const rendererPhp = read('api/astrology/report_views.php');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const plain = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#0?39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

const chart = calculatePrecisionHoroscope(
  'Priya Devi', '1990-07-27', '06:30', 'Chennai, Tamil Nadu, India', 13.0827, 80.2707, 5.5, 'India', 'F'
);
const report: Record<AppLanguage, string> = {
  en: plain(buildJathagamHtml(chart, 'en')),
  ta: plain(buildJathagamHtml(chart, 'ta')),
  hi: plain(buildJathagamHtml(chart, 'hi'))
};
const cardTexts = (text: string) => {
  const start = text.indexOf('Caution:');
  return text;
};

console.log('--- REPORT READABILITY GUARD ---');

check('a life card never says the same thing twice', () => {
  for (const lang of ['en', 'ta', 'hi'] as AppLanguage[]) {
    // The duplicated tag line that used to be appended after the reasons.
    const duplicates = [
      /debilitated[^.;]*Debilitated \(Neecha\)/i,
      /retrograde[^.;]*Retrograde \(Vakri\)/i
    ];
    for (const pattern of duplicates) {
      assert.doesNotMatch(report[lang], pattern, `${lang}: the dignity tag line is printed after the same word`);
    }
  }
  assert.doesNotMatch(builderTs, /if \(dignityNote\) reasons\.push\(dignityNote\)/, 'the duplicate tag append came back');
  assert.match(builderTs, /if \(neechaBhangaNote\) reasons\.push\(neechaBhangaNote\)/, 'the Neecha Bhanga explanation must still be added');
});

check('every technical dignity word carries its Sanskrit glossary inline', () => {
  assert.match(builderTs, /'debilitated \(Neecha\)'/);
  assert.match(builderTs, /'retrograde \(Vakri\), so results need patience'/);
  assert.match(builderTs, /'combust \(Astangata\), too close to the Sun'/);
  assert.match(builderTs, /'நீச நிலையில் \(நீசம்\)'/);
  assert.match(builderTs, /'नीच राशि में \(नीच\)'/);
});

check('the Sani "no dosha" verdict is a plain English sentence', () => {
  assert.match(builderTs, /'No Sani dosha is active in your chart'/);
  assert.doesNotMatch(builderTs, /There is no active any of Sani Dosha/);
  assert.match(rendererPhp, /'No Sani dosha is active in your chart'/);
  assert.doesNotMatch(rendererPhp, /There is no active any of Sani Dosha/);
  // The N/A path keeps its own wording, so a missing chart still fails closed.
  assert.match(builderTs, /unavailableDosha/);
});

check('Tamil and Hindi particulars print no hard-coded English fragments', () => {
  // The PHP renderer used to print "27/07/1990 at 06:30" and "சுவாதி, Pada 2".
  assert.doesNotMatch(rendererPhp, /\{\$dob\} at \{\$tob\}/, 'the "at" connector is hard-coded again');
  assert.match(rendererPhp, /\$dobAtJoiner = \$isTa \? ' அன்று ' : \(\$isHi \? ' को ' : ' at '\);/);
  assert.match(rendererPhp, /\$padaTextForPdf = /, 'the page-1 pada text is not localised');
  assert.match(rendererPhp, /\$padaValue = /, 'the baby-naming pada text is not localised');
  assert.doesNotMatch(rendererPhp, /, Pada ' \. \$pada/, 'the baby-naming header prints an English Pada');
  assert.doesNotMatch(rendererPhp, /<td class="bn-val">Pada \{\$pada\}<\/td>/, 'the baby-naming detail row prints an English Pada');
});

check('the readable wording survives a full render in all three languages', () => {
  assert.ok(report.en.includes('No Sani dosha is active in your chart') || report.en.includes('Sani dosha'), 'English render lost the dosha block');
  assert.doesNotMatch(report.ta, /Pada \d/, 'Tamil render still prints "Pada 2"');
  assert.doesNotMatch(report.hi, /Pada \d/, 'Hindi render still prints "Pada 2"');
  assert.doesNotMatch(report.en, /There is no active any/, 'English render still prints the broken verdict');
});

console.log(`\n${passed} report readability checks passed.`);
