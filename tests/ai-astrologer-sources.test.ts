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
 *   3. 100% active citation utilization: every source registered in `sources.json`
 *      is cited by at least one rule or astronomical module, and every cited ID
 *      resolves cleanly in both `knowledge/` and `api/knowledge/`.
 *   4. Strict verification-level citation discipline (`passage` allowed only for
 *      `TA-02` and `TA-07`, `chapter` allowed only for `EN-02`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  assert.equal(sources.length, 39, `expected 39 verified active sources, got ${sources.length}`);

  const ids = new Set<string>();
  for (const s of sources) {
    assert.ok(!ids.has(s.id), `duplicate source id ${s.id}`);
    ids.add(s.id);
    assert.ok(['ta', 'en'].includes(s.language), `unexpected language ${s.language} on ${s.id}`);
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

check('100% of registered sources are actively cited and all 9 Navagraha Sthalams are verified in Tamil', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );

  const cited = new Set<string>();
  for (const rel of [...walk('knowledge/ai-astrologer/rules'), ...walk('api/astrology'), ...walk('src')]) {
    if (!/\.(json|ts|tsx|php)$/.test(rel)) continue;
    const text = readText(rel);
    for (const m of text.matchAll(/\b((?:EN|HI|TA|TP|REF)-\d{2,3})\b/g)) {
      cited.add(m[1]);
    }
  }

  const registeredIds = new Set(sources.map((s) => s.id as string));
  const missingInRegistry = [...cited].filter((id) => !registeredIds.has(id));
  const uncitedBloat = [...registeredIds].filter((id) => !cited.has(id));

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

check('passage and chapter citation policy stays strictly enforced', () => {
  assert.deepEqual(registry._meta.citationPolicy.passageCitationsPermitted, ['TA-02', 'TA-07']);
  assert.deepEqual(registry._meta.citationPolicy.chapterCitationsPermitted, ['EN-02']);

  const counts = new Map<string, number>();
  for (const s of sources) {
    counts.set(s.verification, (counts.get(s.verification) ?? 0) + 1);
  }
  assert.equal(counts.get('content-read'), 11);
  assert.equal(counts.get('metadata-verified'), 27);
  assert.equal(counts.get('catalogue-verified'), 1);
});

console.log(`\n[OK] ai-astrologer verified source registry: ${passed} checks passed`);
