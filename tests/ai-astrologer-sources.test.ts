/**
 * ASTRO SIVAM AI Astrologer — Clean Verified Source Registry Contract.
 *
 * Enforces:
 *   1. ZERO Hindi book sources (`HI-*`, `language === "hi"`, `excludedSources`,
 *      or Gita Press Hindi catalogue links) anywhere in `sources.json`,
 *      `SOURCES.md`, `VERIFICATION_LOG.md`, or `api/knowledge/ai-astrologer/`.
 *   2. ZERO dead URLs, unopened third-party PDF scraper dumps (`tamilnavarasam.in`),
 *      undecoded `tdl...` stubs, `linked-not-opened` items, or forbidden topics
 *      (Numerology / Vaastu / Palmistry).
 *   3. 100% active citation utilization: every active source is cited by at
 *      least one rule or astronomical module; suppression/background records
 *      have no positive rule citations. Every cited ID resolves in both mirrors.
 *   4. Strict verification-level citation discipline (`passage` allowed only for
 *      `TA-02` and `TA-07`, `chapter` allowed only for `EN-02`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSourcesMarkdown } from '../scripts/generate-ai-astrologer-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel: string) => JSON.parse(readText(rel));

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

const registry = readJson('knowledge/ai-astrologer/sources.json');
const mirrorRegistry = readJson('api/knowledge/ai-astrologer/sources.json');
const sources: any[] = registry.sources ?? [];

check('knowledge/ and api/knowledge/ source registries are byte-identical', () => {
  assert.equal(
    readText('knowledge/ai-astrologer/sources.json'),
    readText('api/knowledge/ai-astrologer/sources.json'),
  );
  assert.deepEqual(mirrorRegistry, registry);
});

check('zero Hindi book sources, zero excludedSources, and zero Hindi blog links remain anywhere', () => {
  assert.equal('excludedSources' in registry, false, 'excludedSources block must be completely removed');
  for (const s of sources) {
    assert.ok(!String(s.id).startsWith('HI-'), `Hindi book source ${s.id} must not exist`);
    assert.notEqual(s.language, 'hi', `Hindi language source ${s.id} must not exist`);
    assert.doesNotMatch(JSON.stringify(s), /jyotishbooks\.wordpress\.com|Gita Press/i, `Hindi catalogue reference found in ${s.id}`);
  }
  for (const doc of ['knowledge/ai-astrologer/SOURCES.md', 'knowledge/ai-astrologer/VERIFICATION_LOG.md']) {
    const content = readText(doc);
    assert.doesNotMatch(content, /\bHI-\d{2}\b/, `${doc} still mentions removed HI-* IDs`);
    assert.doesNotMatch(content, /## 2\. हिन्दी|Gita Press/i, `${doc} still contains Hindi book catalogue section`);
  }
});

check('zero dead, linked-not-opened, tamilnavarasam scraper, or undecoded tdl stubs remain', () => {
  const allowedLevels = new Set(['content-read', 'metadata-verified', 'catalogue-verified']);
  assert.equal(sources.length, 47, `expected 47 audited registry records, got ${sources.length}`);

  const ids = new Set<string>();
  for (const s of sources) {
    assert.ok(!ids.has(s.id), `duplicate source id ${s.id}`);
    ids.add(s.id);
    assert.ok(['ta', 'en', 'sa'].includes(s.language), `unexpected language ${s.language} on ${s.id}`);
    assert.ok(allowedLevels.has(s.verification), `${s.id} carries unverified status "${s.verification}"`);
    const blob = JSON.stringify(s);
    assert.doesNotMatch(blob, /tamilnavarasam/i, `${s.id} still points at tamilnavarasam scraper URL`);
    assert.doesNotMatch(blob, /catalogue title not decoded/i, `${s.id} is an undecoded scraper stub`);
    assert.doesNotMatch(blob, /\b(numerology|vaastu|palmistry)\b/i, `${s.id} references forbidden non-horoscope material`);
    assert.ok(String(s.titleEn || s.title || '').trim().length >= 5, `${s.id} lacks a clean English title`);
    if (s.language === 'ta') {
      assert.ok(String(s.titleNative || s.title || '').trim().length >= 3, `${s.id} lacks a Tamil title`);
    }
  }
});

check('100% of active registered sources are cited and all 9 Navagraha Sthalams are verified in Tamil', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );

  const cited = new Set<string>();
  for (const rel of [...walk('knowledge/ai-astrologer/rules'), ...walk('api/astrology'), ...walk('src')]) {
    if (!/\.(json|ts|tsx|php)$/.test(rel)) continue;
    const text = readText(rel);
    for (const m of text.matchAll(/\b((?:EN|SA|HI|TA|TP|REF)-\d{2,3})\b/g)) {
      cited.add(m[1]);
    }
  }

  const registeredIds = new Set(sources.map((s) => s.id as string));
  const activeIds = new Set(sources.filter((s) => (s.citationStatus ?? 'active') === 'active').map((s) => s.id as string));
  const missingInRegistry = [...cited].filter((id) => !registeredIds.has(id));
  const uncitedBloat = [...activeIds].filter((id) => !cited.has(id));

  assert.deepEqual(missingInRegistry, [], `cited IDs missing from sources.json: ${missingInRegistry.join(', ')}`);
  assert.deepEqual(uncitedBloat, [], `uncited bloat entries in sources.json: ${uncitedBloat.join(', ')}`);

  // All 9 Navagraha Sthalams in remedies.json point to verified Tamil temple records
  const remedies = readJson('knowledge/ai-astrologer/rules/remedies.json');
  assert.equal(remedies.grahas.length, 9);
  for (const g of remedies.grahas) {
    const templeEntry = sources.find((s) => s.id === g.temple.id);
    assert.ok(templeEntry, `${g.graha} temple ${g.temple.id} missing from sources.json`);
    assert.equal(templeEntry.language, 'ta', `${g.graha} temple ${g.temple.id} must be Tamil citation-eligible`);
  }
});

check('non-active records stay out of positive rules and SOURCES.md is generated exactly from the registry', () => {
  const positiveCitations = new Set<string>();
  const visit = (node: any, trail: string[] = []) => {
    if (!node || typeof node !== 'object') return;
    if (!trail.includes('suppressedRules') && typeof node.id === 'string' && typeof node.level === 'string') {
      positiveCitations.add(node.id);
    }
    for (const [key, value] of Object.entries(node)) visit(value, [...trail, key]);
  };
  for (const name of fs.readdirSync(path.join(root, 'knowledge/ai-astrologer/rules'))) {
    if (name.endsWith('.json')) visit(readJson(`knowledge/ai-astrologer/rules/${name}`));
  }
  const nonActive = sources.filter((s) => (s.citationStatus ?? 'active') !== 'active');
  assert.deepEqual(nonActive.map((s) => s.id).sort(), ['TA-10', 'TA-11', 'TA-25']);
  assert.equal(sources.filter((s) => (s.citationStatus ?? 'active') === 'active').length, 44);
  assert.equal(sources.filter((s) => (s.citationStatus ?? 'active') === 'active' && s.language === 'ta').length, 32);
  assert.equal(sources.filter((s) => (s.citationStatus ?? 'active') === 'active' && s.language === 'sa').length, 4);
  for (const source of nonActive) {
    assert.equal(positiveCitations.has(source.id), false, `${source.id} remains in a positive rule citation`);
  }
  const ta13 = sources.find((s) => s.id === 'TA-13');
  assert.equal(ta13.verification, 'metadata-verified');
  assert.equal(ta13.year, null);

  const generated = generateSourcesMarkdown(registry);
  assert.equal(readText('knowledge/ai-astrologer/SOURCES.md'), generated);
});

check('passage and chapter citation policy stays strictly enforced', () => {
  assert.deepEqual(registry._meta.citationPolicy.passageCitationsPermitted, ['TA-02', 'TA-07']);
  assert.deepEqual(registry._meta.citationPolicy.chapterCitationsPermitted, ['EN-02']);

  const counts = new Map<string, number>();
  for (const s of sources) {
    counts.set(s.verification, (counts.get(s.verification) ?? 0) + 1);
  }
  assert.equal(counts.get('content-read'), 30);
  assert.equal(counts.get('metadata-verified'), 16);
  assert.equal(counts.get('catalogue-verified'), 1);
});

check('the reviewed Sanskrit batch is active, book-scoped and internally cited', () => {
  const expectedTopics: Record<string, string> = {
    'SA-01': 'yoga-raja',
    'SA-02': 'fundamentals-lagna-rasi-nakshatra-navamsa-dasha',
    'SA-03': 'panchangam-muhurtham-selection',
    'SA-04': 'fundamentals-lagna-rasi-nakshatra-navamsa-dasha',
  };
  const encyclopedia = readJson('knowledge/ai-astrologer/rules/astrology-encyclopedia.json');
  const topics = new Map<string, any>(encyclopedia.topics.map((topic: any) => [topic.id, topic]));
  assert.equal(encyclopedia.topics.length, 22, 'the Sanskrit batch must not add unreviewed topics');
  for (const [id, topicId] of Object.entries(expectedTopics)) {
    const source = sources.find((s) => s.id === id);
    assert.ok(source, `${id} is missing`);
    assert.equal(source.language, 'sa');
    assert.equal(source.group, 'classical-sanskrit');
    assert.equal(source.verification, 'content-read');
    assert.equal(source.citationStatus ?? 'active', 'active');
    const citation = topics.get(topicId)?.source.find((s: any) => s.id === id);
    assert.ok(citation, `${id} is not cited by ${topicId}`);
    assert.equal(citation.level, 'book', `${id} must remain book-scoped`);
    assert.ok(citation.note.length > 40, `${id} needs a substantive scope note`);
  }
  assert.equal(sources.filter((s) => s.language === 'sa').length, 4);
  assert.equal(sources.find((s) => s.id === 'SA-01').year, null, 'unclear Brihat Jataka OCR year must not be guessed');
  assert.equal(sources.find((s) => s.id === 'SA-02').year, 1899);
  assert.equal(sources.find((s) => s.id === 'SA-03').year, 1945);
  assert.equal(sources.find((s) => s.id === 'SA-04').year, 1955);
  const body = topics.get('fundamentals-lagna-rasi-nakshatra-navamsa-dasha').body;
  assert.match(body.en, /Jaimini.*Argala/);
  assert.match(body.ta, /ஜைமினி.*அர்கலா/);
  assert.match(body.hi, /जैमिनी.*अर्गला/);
});

console.log(`\n[OK] ai-astrologer verified source registry: ${passed} checks passed`);
