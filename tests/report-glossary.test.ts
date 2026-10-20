/**
 * PLAIN-LANGUAGE GLOSSARY (owner request, Oct 2026)
 *
 * The readability audit found 30+ specialist terms across the four reports and
 * not one explanation. This suite locks the fix:
 *
 *   1. one shared file, `api/astrology/report_glossary.json`, owns the wording;
 *   2. every term exists in English, Tamil AND Hindi, with a one-line meaning
 *      (not a jargon restatement — the meaning may not just repeat the label);
 *   3. every report's term list resolves to real entries;
 *   4. the Birth Jathagam actually prints the glossary sheet, in the language of
 *      the order, with a pointer to it on page 1;
 *   5. the PHP renderer (admin preview / customer preview / emailed PDF) reads
 *      the same file and appends the same sheet, so the PDF cannot drift.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy.js';
import { buildJathagamHtml } from '../src/services/jathagamHtmlBuilder.js';
import { buildWeddingMatchHtml } from '../src/services/weddingHtmlBuilder.js';
import { buildBabyNamingHtml } from '../src/services/babyNamingHtmlBuilder.js';
import { buildMuhurthamHtml } from '../src/services/muhurthamHtmlBuilder.js';
import { calculateSampleResult } from '../src/services/sampleReports.js';
import {
  GLOSSARY_PAGE_TEXT,
  GLOSSARY_TERM_KEYS,
  QUICK_BOX_TEXT,
  REPORT_GLOSSARY_KEYS,
  inlineGloss,
  reportGlossaryEntries,
  reportGlossaryHtml,
  reportGlossaryQuickEntries,
  reportGlossaryQuickHtml
} from '../src/services/reportGlossary.js';
import type { AppLanguage } from '../src/lib/astrology/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const glossaryJson = JSON.parse(read('api/astrology/report_glossary.json'));
const rendererPhp = read('api/astrology/report_views.php');
const LANGS: AppLanguage[] = ['en', 'ta', 'hi'];

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

// The other three reports render from the same committed sample data the site
// shows on its public sample pages.
const weddingResult: any = await calculateSampleResult('MARRIAGE_COMPATIBILITY', { force: true });
const babyResult: any = await calculateSampleResult('BABY_NAMING', { force: true });
const muhurthamResult: any = await calculateSampleResult('MUHURTHAM', { force: true });

console.log('--- PLAIN-LANGUAGE GLOSSARY ---');

check('the glossary is one shared file with at least 30 terms', () => {
  assert.ok(GLOSSARY_TERM_KEYS.length >= 30, `expected 30+ terms, found ${GLOSSARY_TERM_KEYS.length}`);
  assert.deepEqual(Object.keys(glossaryJson.terms).sort(), GLOSSARY_TERM_KEYS.slice().sort());
});

check('every term is explained in all three languages, and the explanation is not the label', () => {
  for (const key of GLOSSARY_TERM_KEYS) {
    const row = glossaryJson.terms[key];
    for (const lang of LANGS) {
      const copy = row[lang];
      assert.ok(copy, `${key}/${lang}: missing translation`);
      assert.ok((copy.label || '').trim().length > 2, `${key}/${lang}: missing label`);
      const meaning = (copy.meaning || '').trim();
      assert.ok(meaning.length > 25, `${key}/${lang}: the meaning is too short to explain anything`);
      assert.ok(meaning.length <= 170, `${key}/${lang}: ${meaning.length} chars — a meaning must stay one line`);
      assert.notEqual(meaning, copy.label.trim(), `${key}/${lang}: the meaning just repeats the label`);
      assert.ok(/[.!।]$/.test(meaning), `${key}/${lang}: the meaning must be a sentence`);
    }
  }
});

check('every report knows which terms it uses, and they all resolve', () => {
  const kinds = ['BIRTH_JATHAGAM', 'MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'] as const;
  for (const kind of kinds) {
    const keys = REPORT_GLOSSARY_KEYS[kind];
    assert.ok(Array.isArray(keys) && keys.length >= 8, `${kind}: too few terms listed`);
    for (const key of keys) {
      assert.ok(glossaryJson.terms[key], `${kind}: '${key}' is not a glossary term`);
    }
    for (const lang of LANGS) {
      assert.equal(reportGlossaryEntries(kind, lang).length, keys.length, `${kind}/${lang}: an entry failed to resolve`);
    }
  }
  // The Jathagam carries the deepest vocabulary.
  assert.ok(REPORT_GLOSSARY_KEYS.BIRTH_JATHAGAM.length >= 20, 'the Jathagam must list its 20+ terms');
});

check('the "5 words you\'ll meet" box is five real terms of that report', () => {
  for (const kind of ['BIRTH_JATHAGAM', 'MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'] as const) {
    const quick = reportGlossaryQuickEntries(kind, 'en');
    assert.equal(quick.length, 5, `${kind}: the box must hold exactly five words`);
    for (const entry of quick) {
      assert.ok(REPORT_GLOSSARY_KEYS[kind].includes(entry.key),
        `${kind}: '${entry.key}' is in the box but not in that report's term list`);
      assert.ok(entry.meaning.length > 25, `${kind}/${entry.key}: the box entry has no usable meaning`);
    }
    for (const lang of LANGS) {
      const box = reportGlossaryQuickHtml(kind, lang);
      assert.ok(box.includes(QUICK_BOX_TEXT[lang].title), `${kind}/${lang}: box title missing`);
      assert.equal((box.match(/glossary-quick-row/g) || []).length, 5, `${kind}/${lang}: box rows`);
      const escMore = QUICK_BOX_TEXT[lang].more.replace(/&/g, '&amp;').replace(/'/g, '&#039;');
      assert.ok(box.includes(escMore), `${kind}/${lang}: the box must point at the full guide`);
    }
  }
});

check('inlineGloss gives a readable parenthesis for running prose', () => {
  const gloss = inlineGloss('neecha', 'en');
  assert.match(gloss, /^Neecha \(debilitated\) — .+\.$/);
  assert.equal(inlineGloss('does-not-exist', 'en'), '');
});

check('the Birth Jathagam prints the glossary sheet in every language, after the summary page', () => {
  const chart = calculatePrecisionHoroscope(
    'Glossary Test', '1990-07-27', '06:30', 'Chennai, Tamil Nadu, India', 13.0827, 80.2707, 5.5, 'India', 'F'
  );
  for (const lang of LANGS) {
    const html = buildJathagamHtml(chart, lang);
    const glossaryStart = html.indexOf('id="jathagam-glossary"');
    const summaryStart = html.indexOf('id="jathagam-page-3"');
    assert.ok(glossaryStart > 0, `${lang}: no glossary sheet`);
    assert.ok(glossaryStart > summaryStart, `${lang}: the glossary must come after the summary page`);
    assert.equal((html.match(/id="jathagam-glossary"/g) || []).length, 1, `${lang}: exactly one glossary sheet`);
    assert.equal((html.match(/<div class="page(?: |")/g) || []).length, 4, `${lang}: the report is four sheets`);
    assert.ok(html.includes(`Page 4 / 4`) || html.includes('பக்கம் 4 / 4') || html.includes('पृष्ठ 4 / 4'),
      `${lang}: the glossary sheet is numbered 4 / 4`);
    const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/'/g, '&#039;');
    assert.ok(html.includes(esc(GLOSSARY_PAGE_TEXT[lang].title)), `${lang}: glossary title missing`);
    for (const entry of reportGlossaryEntries('BIRTH_JATHAGAM', lang)) {
      assert.ok(html.includes(esc(entry.label)), `${lang}: term '${entry.label}' not printed`);
    }
    // The "5 words you'll meet" box lives on the LAST page only (owner request):
    // page 1 keeps a single line pointing at the guide.
    const page1 = html.slice(html.indexOf('id="jathagam-page-1"'), summaryStart);
    assert.ok(!page1.includes(QUICK_BOX_TEXT[lang].title), `${lang}: page 1 must not carry the quick-words box`);
    assert.equal((page1.match(/class="glossary-quick-row"/g) || []).length, 0, `${lang}: page 1 must not list glossary rows`);
    assert.ok(page1.includes(esc(GLOSSARY_PAGE_TEXT[lang].pointer)),
      `${lang}: page 1 has no pointer to the glossary`);
    const guideSheet = html.slice(glossaryStart);
    assert.ok(guideSheet.includes(QUICK_BOX_TEXT[lang].title), `${lang}: the guide sheet has no quick-words box`);
    assert.equal((guideSheet.match(/class="glossary-quick-row"/g) || []).length, 5, `${lang}: guide box rows`);
    for (const entry of reportGlossaryQuickEntries('BIRTH_JATHAGAM', lang)) {
      assert.ok(guideSheet.includes(esc(entry.label)), `${lang}: the guide box is missing '${entry.label}'`);
    }
    // The box appears exactly once in the whole document (the CSS selector in
    // the inline <style> block is not counted).
    assert.equal((html.match(/class="glossary-quick-row"/g) || []).length, 5, `${lang}: the box is printed more than once`);
  }
});

check('the PHP renderer reads the same file and appends the same sheet', () => {
  assert.match(rendererPhp, /report_glossary\.json/, 'PHP does not read the shared glossary');
  assert.match(rendererPhp, /function astro_report_glossary\(\)/);
  assert.match(rendererPhp, /function astro_report_glossary_entries\(string \$reportKind, string \$lang\)/);
  assert.match(rendererPhp, /function astro_report_glossary_html\(\s*string \$reportKind, string \$lang/, 'the PHP guide builder changed shape');
  assert.match(rendererPhp, /astro_report_glossary_html\('BIRTH_JATHAGAM', \$lang/, 'the Jathagam never prints the glossary');
  assert.match(rendererPhp, /public const JATHAGAM_PAGE_TOTAL = 4;/, 'the PHP page total was not updated');
  assert.match(rendererPhp, /id=\"birth-glossary-sheet\"/, 'the PHP glossary sheet has no id');
  // A missing/unreadable JSON must skip the sheet, never print a half-built one.
  assert.match(rendererPhp, /\$glossaryBody === ''/, 'the PHP sheet is not guarded against a missing file');
  // The wording may live in only ONE place.
  assert.doesNotMatch(rendererPhp, /The sign rising on the eastern horizon at your birth/,
    'a meaning was hard-coded instead of read from the shared JSON');
});

// ---------------------------------------------------------------------------
// Every report, not just the Jathagam: same data, same one-line meanings, in
// the language the order was placed in.
// ---------------------------------------------------------------------------
const REPORT_PAGES: Array<{ name: string; id: string; kind: 'MARRIAGE_COMPATIBILITY' | 'BABY_NAMING' | 'MUHURTHAM'; pages: number; html: (lang: AppLanguage) => string }> = [
  { name: 'Marriage Compatibility', id: 'wedding-glossary', kind: 'MARRIAGE_COMPATIBILITY', pages: 3, html: lang => buildWeddingMatchHtml(weddingResult, lang) },
  { name: 'Baby Naming', id: 'namakaran-glossary', kind: 'BABY_NAMING', pages: 3, html: lang => buildBabyNamingHtml(babyResult, lang) },
  { name: 'Subha Muhurtham', id: 'muhurtham-glossary', kind: 'MUHURTHAM', pages: 3, html: lang => buildMuhurthamHtml(muhurthamResult, lang) }
];

check('every report ends with the glossary page, in all three languages', () => {
  for (const report of REPORT_PAGES) {
    for (const lang of LANGS) {
      const html = report.html(lang);
      const start = html.indexOf(`id="${report.id}"`);
      assert.ok(start > 0, `${report.name}/${lang}: no glossary page`);
      assert.equal(html.match(new RegExp(`id="${report.id}"`, 'g'))?.length, 1, `${report.name}/${lang}: duplicate glossary page`);
      assert.equal((html.match(/<div class="page(?: |")/g) || []).length, report.pages,
        `${report.name}/${lang}: expected ${report.pages} sheets`);
      const entries = reportGlossaryEntries(report.kind, lang);
      assert.ok(entries.length >= 8, `${report.name}/${lang}: too few terms`);
      for (const entry of entries) {
        assert.ok(html.includes(entry.label.replace(/&/g, '&amp;').replace(/'/g, '&#039;')),
          `${report.name}/${lang}: '${entry.label}' is missing from the glossary page`);
      }
      // The glossary must be the LAST sheet, never interrupting the report body.
      assert.ok(start > html.indexOf('id="wedding-page-2"') || report.kind !== 'MARRIAGE_COMPATIBILITY',
        `${report.name}/${lang}: the glossary must come after the report pages`);
      // And the first page has to tell the reader it exists.
      const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/'/g, '&#039;');
      assert.ok(html.slice(0, start).includes(esc(GLOSSARY_PAGE_TEXT[lang].pointer)),
        `${report.name}/${lang}: no pointer to the glossary on the report pages`);
      // Same placement as the Jathagam: the box is on the last page only.
      const guide = html.slice(start);
      assert.ok(guide.includes(QUICK_BOX_TEXT[lang].title), `${report.name}/${lang}: the guide has no quick-words box`);
      assert.equal((guide.match(/class="glossary-quick-row"/g) || []).length, 5, `${report.name}/${lang}: guide box rows`);
      assert.equal((html.match(/class="glossary-quick-row"/g) || []).length, 5,
        `${report.name}/${lang}: the box must be printed once, on the last page`);
    }
  }
});

check('the PHP renderer prints the same quick box on the last page only', () => {
  assert.match(rendererPhp, /function astro_report_glossary_quick_html\(string \$reportKind, string \$lang\)/);
  assert.match(rendererPhp, /function astro_report_glossary_quick_entries\(string \$reportKind, string \$lang\)/);
  assert.match(rendererPhp, /'quickTerms' => is_array\(\$decoded\['quickTerms'\]/);
  // The Jathagam guide sheet prints the box like the other three reports, and
  // page 1 never does.
  assert.match(rendererPhp, /astro_report_glossary_html\('BIRTH_JATHAGAM', \$lang\)/);
  assert.doesNotMatch(rendererPhp, /astro_report_glossary_html\('BIRTH_JATHAGAM', \$lang, false\)/,
    'the Jathagam guide still suppresses the box');
  assert.doesNotMatch(rendererPhp, /\$quickGlossaryHtml = astro_report_glossary_quick_html\('BIRTH_JATHAGAM'/,
    'page 1 still renders the quick box');
});

check('the PHP renderer appends the same sheet for all four reports', () => {
  assert.match(rendererPhp, /astro_report_glossary_html\('MARRIAGE_COMPATIBILITY', \$lang\)/);
  assert.match(rendererPhp, /astro_report_glossary_html\('BABY_NAMING', \$lang\)/);
  assert.match(rendererPhp, /astro_report_glossary_html\('MUHURTHAM', \$lang\)/);
  for (const id of ['wedding-glossary-sheet', 'namakaran-glossary-sheet', 'muhurtham-glossary-sheet']) {
    assert.ok(rendererPhp.includes(`id=\\"${id}\\"`) || rendererPhp.includes(id), `${id} missing from the PHP renderer`);
  }
});

console.log(`\n${passed} glossary checks passed.`);
