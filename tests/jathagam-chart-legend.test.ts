import { readRepoSource } from './helpers/module-sources.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy.js';
import { Graha } from '../src/lib/astrology/types.js';
import { GRAHA_NAMES_REPORT, buildJathagamHtml } from '../src/services/jathagamHtmlBuilder.js';

/**
 * Chart legend on Birth Jathagam page 1.
 *
 * The Rasi (D1) and Navamsa (D9) cells print short tags — "Su", "Ch", "Gu" —
 * and two planets in one rasi print side by side, which is why the audit saw
 * "GuSa", "LagnaCh", "SuBu" and "Sk". Nothing on the page said what they meant.
 *
 *   1. every tag that can appear in a cell has a legend entry, in en / ta / hi;
 *   2. the tag printed in a cell is the tag the legend explains (one source);
 *   3. the legend is printed once, on page 1, under the two charts;
 *   4. the page count stays 4 — the key may not push a new sheet;
 *   5. the note explains the run-together pairs ("GuSa");
 *   6. api/astrology/report_views.php prints the same tags and the same key.
 */

const birth = {
  name: 'Chart Legend',
  dob: '1990-07-27',
  tob: '06:30',
  birthPlace: 'Chennai, Tamil Nadu, India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5,
  country: 'India',
  gender: 'M'
};
const chart = calculatePrecisionHoroscope(
  birth.name, birth.dob, birth.tob, birth.birthPlace,
  birth.latitude, birth.longitude, birth.timezoneOffsetHours, birth.country, birth.gender
);

const LANG_TAGS = {
  en: { surya: 'Su', chandra: 'Ch', mangal: 'Ma', budha: 'Bu', guru: 'Gu', sukra: 'Sk', sani: 'Sa', rahu: 'Ra', ketu: 'Ke', lagna: 'Lagna' },
  ta: { surya: 'சூ', chandra: 'சந்', mangal: 'செவ்', budha: 'பு', guru: 'குரு', sukra: 'சுக்', sani: 'சனி', rahu: 'ரா', ketu: 'கே', lagna: 'லக்' },
  hi: { surya: 'सू', chandra: 'चं', mangal: 'मं', budha: 'बु', guru: 'गु', sukra: 'शु', sani: 'श', rahu: 'रा', ketu: 'के', lagna: 'लग्न' }
} as const;

const GRahasInOrder: Graha[] = [
  Graha.SURYA, Graha.CHANDRA, Graha.CHEVVAI, Graha.BUDHA, Graha.GURU,
  Graha.SUKRA, Graha.SANI, Graha.RAHU, Graha.KETU
];
const LANG_KEY: Record<string, keyof typeof LANG_TAGS['en']> = {
  [Graha.SURYA]: 'surya', [Graha.CHANDRA]: 'chandra', [Graha.CHEVVAI]: 'mangal',
  [Graha.BUDHA]: 'budha', [Graha.GURU]: 'guru', [Graha.SUKRA]: 'sukra',
  [Graha.SANI]: 'sani', [Graha.RAHU]: 'rahu', [Graha.KETU]: 'ketu'
};

const legendOf = (html: string): string => {
  const start = html.indexOf('<div class="chart-legend"');
  assert.ok(start > 0, 'page 1 must print the chart legend');
  const end = html.indexOf('</div>', start);
  return html.slice(start, end);
};
const visible = (html: string): string =>
  html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
const legendTags = (legend: string): string[] =>
  [...legend.matchAll(/<b>([^<]+)<\/b>/g)].map(match => match[1].trim());

for (const lang of ['en', 'ta', 'hi'] as const) {
  const html = buildJathagamHtml(chart, lang);
  const legend = legendOf(html);
  const tags = legendTags(legend);

  // 1. all ten entries, once each
  assert.equal(tags.length, 10, `${lang}: legend lists 9 grahas + Lagna (got ${tags.length})`);
  assert.equal(new Set(tags).size, tags.length, `${lang}: no duplicate legend tag`);

  // 2. the legend tag for each graha is the tag the cells print
  for (const graha of GRahasInOrder) {
    const expected = LANG_TAGS[lang][LANG_KEY[graha]];
    const fromTable = GRAHA_NAMES_REPORT[graha][lang === 'ta' ? 'tagTa' : lang === 'hi' ? 'tagHi' : 'tagEn'];
    assert.equal(expected, fromTable, `${lang}: ${graha} tag must come from GRAHA_NAMES_REPORT`);
    assert.ok(tags.includes(expected), `${lang}: legend is missing the ${expected} (${graha}) entry`);
    // …and the chart itself must print that same string inside a cell
    assert.ok(
      new RegExp(`<span class="planet-name[^"]*">${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`).test(html),
      `${lang}: the chart draws ${expected} but the legend key must match it exactly`
    );
  }
  assert.ok(tags.includes(LANG_TAGS[lang].lagna), `${lang}: legend is missing the Lagna entry`);

  // 3. printed exactly once, on page 1, between the charts and the doshas
  const occurrences = html.split('<div class="chart-legend"').length - 1;
  assert.equal(occurrences, 1, `${lang}: the chart legend is printed once`);
  const page1Start = html.indexOf('id="jathagam-page-1"');
  const page2Start = html.indexOf('id="jathagam-page-2"');
  const legendAt = html.indexOf('<div class="chart-legend"');
  assert.ok(legendAt > page1Start && legendAt < page2Start, `${lang}: legend belongs on page 1`);
  assert.ok(
    legendAt > html.indexOf('Navamsa Chart'),
    `${lang}: legend sits under both chart squares`
  );
  assert.ok(
    html.indexOf('<div class="section-title">', legendAt) < html.indexOf('id="jathagam-page-2"'),
    `${lang}: legend sits before the dosha section, still on page 1`
  );

  // 3b. every tag actually drawn in the two squares is in the key
  const chartSection = html.slice(html.indexOf('class="chart-section"'), html.indexOf('class="chart-legend"'));
  const drawn = [...chartSection.matchAll(/<span class="planet-name[^"]*">([^<]+)<\/span>/g)]
    .map(match => match[1].trim());
  assert.ok(drawn.length >= 20, `${lang}: both squares draw 9 grahas + Lagna (got ${drawn.length})`);
  for (const tag of drawn) {
    assert.ok(tags.includes(tag), `${lang}: chart cell prints "${tag}" with no legend entry`);
  }

  // 4. no new page
  const pages = (html.match(/id="jathagam-(page-\d|glossary)"/g) || []).length;
  assert.equal(pages, 4, `${lang}: Birth Jathagam stays 4 pages (got ${pages})`);

  // 5. the run-together pairs are explained
  const text = visible(legend);
  if (lang === 'en') assert.match(text, /Su/, 'en: legend keeps the tags visible');
  assert.ok(
    lang === 'en' ? /GuSa|two symbols/i.test(text) : /இரண்டு குறியீடுகள்|दो चिह्न/.test(text),
    `${lang}: the note explains why two tags appear in one cell`
  );
  // plain words, not a second glossary
  assert.ok(text.length < 420, `${lang}: legend stays a compact key (${text.length} chars)`);
}

// 6. PHP parity: same tags, same key, no stale abbreviations
const php = readRepoSource(new URL('../api/astrology/report_views.php', import.meta.url));
for (const lang of ['en', 'ta', 'hi'] as const) {
  for (const graha of GRahasInOrder) {
    const tag = LANG_TAGS[lang][LANG_KEY[graha]];
    assert.ok(
      php.includes(`'${tag}'`),
      `${lang}: report_views.php must print the ${tag} (${graha}) tag`
    );
  }
  assert.ok(php.includes(`'${LANG_TAGS[lang].lagna}'`), `${lang}: report_views.php must print the Lagna tag`);
}
assert.ok(php.includes('$chartLegendHtml'), 'report_views.php builds the chart legend');
assert.ok(php.includes('class="chart-legend"'), 'report_views.php prints the chart legend');
assert.ok(php.includes('{$chartLegendHtml}'), 'report_views.php renders the legend under the charts');
assert.ok(!/=> 'Mo'|=> 'Me'|=> 'Ju'|=> 'Ve'|'Lag'/.test(php), 'no stale short tags (Mo/Me/Ju/Ve/Lag) remain in the PHP renderer');

console.log('PASSED: Birth Jathagam chart legend (en/ta/hi + PHP parity)');
