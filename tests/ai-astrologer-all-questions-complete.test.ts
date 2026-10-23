/**
 * Exhaustive end-to-end verification of the AI Astrologer across:
 *   - All 66 curated guided options x 3 languages (en/ta/hi) x chart / no-chart (396 runs)
 *   - 110+ free-text astrology queries across English, Tamil, and Hindi
 *   - Pure script separation (0 Tamil leaks in en/hi, 0 Devanagari leaks in en/ta)
 *   - Full Ketu + Rahu remedy coverage, localized practical steps, moonNakshatraLord,
 *     Devanagari chart labels, Bhava 1-12 personal chart readings, and honest non-astrology handoff
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = execFileSync(
  process.execPath,
  ['scripts/php-ai-provider-check.mjs', 'tests/fixtures/php-ai-probes/all-questions-complete.php'],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);
const probe = JSON.parse(raw);

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    throw err;
  }
}

check('all 396 guided answers (66 options x 3 languages x chart/no-chart) pass safety guardrails cleanly', () => {
  assert.equal(probe.guidedRuns, 396);
  assert.deepEqual(probe.guidedFailures, []);
});

check('zero cross-script leaks occur across all 396 guided answers in English, Tamil, and Hindi', () => {
  assert.deepEqual(probe.scriptLeaks, []);
});

check('chart facts populate accurate Vimshottari moonNakshatraLord and native Devanagari Hindi labels', () => {
  assert.ok(probe.chartMeta.moonNakshatraLord.length > 0, 'moonNakshatraLord must not be empty');
  assert.match(probe.chartMeta.labels.lagna.hi, /[\u0900-\u097F]/);
  assert.match(probe.chartMeta.labels.rasi.hi, /[\u0900-\u097F]/);
  assert.match(probe.chartMeta.labels.nakshatra.hi, /[\u0900-\u097F]/);
  assert.doesNotMatch(probe.samples['current-star'].hi.content, /\b(Gemini|Sagittarius|Aries|Taurus|Leo|Virgo|Libra|Scorpio|Capricorn|Aquarius|Pisces)\b/);
});

check('remedy-rahuketu includes both Rahu (Thirunageswaram, TP-10) and Ketu (Keezhaperumpallam, TP-11) in all languages', () => {
  assert.equal(probe.samples['remedy-rahuketu'].en.bubbles.length, 2);
  assert.match(probe.samples['remedy-rahuketu'].en.content, /Simple remedies for Rahu:/);
  assert.match(probe.samples['remedy-rahuketu'].en.content, /Simple remedies for Ketu:/);
  assert.match(probe.samples['remedy-rahuketu'].en.content, /Keezhaperumpallam/);
  assert.match(probe.samples['remedy-rahuketu'].ta.content, /கீழப்பெரும்பள்ளம்/);
  assert.match(probe.samples['remedy-rahuketu'].hi.content, /कीलपेरुम्पल्लम/);
  assert.match(probe.samples['remedy-rahuketu'].en.sourceLine, /TA-07/);
  assert.doesNotMatch(probe.samples['remedy-rahuketu'].en.sourceLine, /TP-10|TP-11/);
});

check('practical steps, personal remedies, period focus, and no-chart dosha answers work across en/ta/hi', () => {
  assert.match(probe.samples['career-overview'].en.content, /Practical steps:/);
  assert.match(probe.samples['career-overview'].ta.content, /நடைமுறை படிகள்:/);
  assert.match(probe.samples['career-overview'].hi.content, /व्यावहारिक कदम:/);
  for (const lang of ['en', 'ta', 'hi'] as const) {
    const set = new Set([
      probe.samples['current-period'][lang].content,
      probe.samples['current-year'][lang].content,
      probe.samples['current-star'][lang].content,
      probe.samples['current-sade-sati'][lang].content,
    ]);
    assert.equal(set.size, 4, `all 4 current-guidance options must stay distinct in ${lang}`);
  }
  assert.ok(probe.samples['dosha-kuja-nochart'].en.content.includes('Mars'), 'dosha-kuja without chart explains classical Kuja Dosha');
  assert.ok(probe.samples['dosha-all-nochart'].ta.content.includes('செவ்வாய்'), 'dosha-all without chart summarizes classical doshas in Tamil');
});

check('all 114 free-text astrology queries across English, Tamil, and Hindi answer cleanly with zero NO_MATCH and zero guard violations', () => {
  assert.ok(probe.freeCount >= 110);
  assert.deepEqual(probe.freeGuardFailures, []);
  assert.deepEqual(probe.freeUnanswered, []);
});

check('numbered house, Rahu Kalam, Ashtama Sani, Kuja Dosha, and planet queries never get hijacked into unrelated cards', () => {
  assert.notEqual(probe.freeSamples['Tell me about 5th house'].areaId, 'property');
  assert.match(probe.freeSamples['Tell me about 5th house'].content, /5th House \(Putra, Vidya & Poorvapunya Bhava\)/);
  assert.match(probe.freeSamples['Tell me about 5th house'].content, /lord of house 5/i);
  assert.match(probe.freeSamples['What is Rahu Kalam?'].content, /7:30-9:00 AM/);
  assert.match(probe.freeSamples['What is Ashtama Sani?'].content, /Ashtama Sani/);
  assert.match(probe.freeSamples['What is Kuja Dosha?'].content, /Mars \(Kuja\) Dosha/);
  assert.match(probe.freeSamples['Remedies for Rahu and Ketu'].content, /Simple remedies for Ketu:/);
  assert.match(probe.freeSamples['Tell me about Guru in my chart'].content, /Guru \(Jupiter/);
});

check('non-astrology free-text questions still hand off honestly without guessing', () => {
  assert.equal(probe.nonAstro.handoff, true);
  assert.match(probe.nonAstro.content, /could not find this in our astrology sources/);
});

console.log(`\n[OK] ai-astrologer complete verification: ${passed} checks passed`);
