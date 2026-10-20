/**
 * ONE NUMBER ON PAGE 1 (owner request, Oct 2026)
 *
 * The Marriage report's compatibility panel printed three different measures
 * side by side — "7.5 / 10", "75%" and "8 / 10 Poruthams matched" — with nothing
 * saying what any of them measured, so they read as a contradiction. Only the
 * porutham count survives: the panel now says one thing, "8 / 10 Poruthams
 * matched", and the meter fills from that same number.
 *
 * This suite locks it on both renderers:
 *
 *   1. no point score and no percentage anywhere in the panel;
 *   2. the count is printed once, with its own label, in all three languages;
 *   3. the bar length, aria-valuenow and aria-valuetext all derive from it;
 *   4. a result with no porutham rows prints "N/A / 10", never a fake score;
 *   5. PHP prints the same single number.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWeddingMatchHtml } from '../src/services/weddingHtmlBuilder.js';
import { calculateSampleResult } from '../src/services/sampleReports.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererPhp = fs.readFileSync(path.join(root, 'api/astrology/report_views.php'), 'utf8');
const LANGS: AppLanguage[] = ['en', 'ta', 'hi'];
const MATCHED_LABEL: Record<AppLanguage, string> = {
  en: 'Poruthams matched',
  ta: 'பொருத்தங்கள் பொருந்தின',
  hi: 'गुण मेल खाते हैं'
};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const weddingResult: any = await calculateSampleResult('MARRIAGE_COMPATIBILITY', { force: true });

/** The page-1 compatibility panel of a rendered report. */
function scorePanel(html: string): string {
  const start = html.indexOf('<section class="score-panel"');
  assert.ok(start >= 0, 'the score panel is missing');
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}

/** The words a reader actually sees: tags and inline styles removed. */
function visibleText(html: string): string {
  return html.replace(/\sstyle="[^"]*"/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

console.log('--- ONE NUMBER ON PAGE 1 ---');

check('the panel prints the porutham count and nothing else numeric', () => {
  for (const lang of LANGS) {
    const panel = scorePanel(buildWeddingMatchHtml(weddingResult, lang));
    const count = String(weddingResult.totalPoruthamsMatched);
    assert.ok(panel.includes(`<strong class="score-value">${count} / 10</strong>`),
      `${lang}: the headline is not "N / 10"`);
    assert.ok(panel.includes(`<span class="score-percent">${MATCHED_LABEL[lang]}</span>`),
      `${lang}: the headline has no label saying what N / 10 counts`);
    // The retired numbers: the point score ("7.5 / 35") and the percentage.
    assert.doesNotMatch(panel, /\/ 35|\/ 36|Points|पுள்ளிகள்|புள்ளிகள்|अंक/,
      `${lang}: a point score survived in the panel`);
    assert.doesNotMatch(visibleText(panel), /\d+(\.\d+)?%/, `${lang}: a percentage survived in the panel`);
    // Once as the headline (the aria-valuetext repeat is screen-reader only).
    assert.equal((visibleText(panel).match(/\d+ \/ 10/g) || []).length, 1,
      `${lang}: N / 10 is printed more than once`);
  }
});

check('the meter is driven by the same number it is labelled with', () => {
  for (const lang of LANGS) {
    const panel = scorePanel(buildWeddingMatchHtml(weddingResult, lang));
    const count = Number(weddingResult.totalPoruthamsMatched);
    assert.ok(panel.includes(`aria-valuemax="10"`), `${lang}: the meter still measures 0-100`);
    assert.ok(panel.includes(`aria-valuenow="${count}"`), `${lang}: aria-valuenow is not the count`);
    assert.ok(panel.includes(`aria-valuetext="${count} / 10 ${MATCHED_LABEL[lang]}"`),
      `${lang}: aria-valuetext does not describe the count`);
    assert.ok(panel.includes(`style="width:${count * 10}%"`),
      `${lang}: the bar is not ${count * 10}% for ${count} of 10`);
  }
});

check('a result with no porutham rows says N/A / 10, never a score', () => {
  const empty = buildWeddingMatchHtml({ poruthams: [] } as any, 'en');
  const panel = scorePanel(empty);
  assert.ok(panel.includes('<strong class="score-value">N/A / 10</strong>'),
    'an unknown count must print N/A / 10');
  assert.ok(panel.includes('style="width:0%"'), 'an unknown count must leave the bar empty');
  assert.ok(panel.includes('aria-valuenow="N/A"'), 'an unknown count must not invent a meter value');
  assert.doesNotMatch(visibleText(panel), /\d+(\.\d+)?%/, 'an empty result must not invent a percentage');
});

check('a legacy result carrying only a point score still prints the count', () => {
  // Old saved orders have score + maxScore but no matched count. The report must
  // fall back to counting the rows, not resurrect "7.5 / 35".
  const legacy = {
    ...weddingResult,
    totalPoruthamsMatched: undefined,
    matchedCount: undefined
  };
  const html = buildWeddingMatchHtml(legacy as any, 'en');
  const panel = scorePanel(html);
  assert.doesNotMatch(panel, /\/ 35|\/ 36/, 'the point score came back for a legacy row set');
  assert.match(panel, /<strong class="score-value">\d+ \/ 10<\/strong>/);
});

check('the PHP panel prints the same single number', () => {
  assert.match(rendererPhp, /\$matchedMeterWidth = \$matchedCountValue === null \? '0%' : \(\(\$matchedCountValue \* 10\)\) \. '%';/);
  assert.match(rendererPhp, /\{\$matchedCountDisplay\} \/ 10<span/);
  assert.match(rendererPhp, /aria-valuemax="10" aria-valuenow="\{\$matchedCountDisplay\}"/);
  assert.match(rendererPhp, /aria-valuetext="\{\$matchedCountDisplay\} \/ 10 \{\$lblPoruthamsMatched\}"/);
  // The retired measures must be gone, not merely hidden.
  assert.doesNotMatch(rendererPhp, /\$scoreMeterPercent/, 'the percentage survived in report_views.php');
  assert.doesNotMatch(rendererPhp, /\$scoreMeterValue/, 'the 0-100 meter value survived in report_views.php');
  assert.doesNotMatch(rendererPhp, /\$lblMeterPoints/, 'the "Points" label survived in report_views.php');
  assert.doesNotMatch(rendererPhp, /\{\$score\} \/ \{\$maxScore\}/, 'the point score is still printed');
});

console.log(`\n${passed} single-score checks passed.`);
