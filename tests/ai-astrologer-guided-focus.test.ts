/**
 * Curated life-area options each answer their own question.
 *
 * THE RULE UNDER TEST: inside one chapter (e.g. the four Health options),
 * each option gives its own answer - not the same chapter reading repeated.
 * Options point at the classical rules that answer them through `focus`;
 * an option whose rules do not fire says so instead of repeating the overview.
 *
 * Static checks always run. The PHP-WASM check runs when the dev-only runtime
 * is installed, and reports SKIPPED otherwise rather than claiming execution.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const guided = JSON.parse(read('knowledge/ai-astrologer/rules/guided-questions.json'));
const areas = JSON.parse(read('knowledge/ai-astrologer/rules/life-areas.json'));
const offline = read('api/astrology/ai_astrologer_offline.php');
const endpoint = read('api/ai_astrologer.php');

const ruleIds = new Set<string>();
for (const area of areas.areas ?? []) for (const r of area.rules ?? []) ruleIds.add(r.id);
// Current-guidance focus keys answered by currentGuidanceBubbles, plus the one
// rule it borrows from the health chapter.
const CURRENT_FOCUS = new Set(['current-dasha-explained', 'current-year', 'current-nakshatra']);

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

const areaOptions = guided.categories.flatMap((c: any) =>
  (c.questions ?? []).filter((q: any) => q.kind === 'area').map((q: any) => ({ ...q, chapter: c.id }))
);

check('every chapter has an overview option that keeps the general answer', () => {
  // current-guidance has no separate overview: each of its four options asks one thing.
  for (const c of guided.categories.filter((c: any) => c.id !== 'current-guidance' && (c.questions ?? []).some((q: any) => q.kind === 'area'))) {
    const first = c.questions[0];
    assert.equal(first.focus, undefined, `${first.id} is the overview and must not be focused`);
  }
});

check('every other chapter option names the rules that answer it, and those rules exist', () => {
  for (const q of areaOptions.filter((q: any) => q.focus !== undefined)) {
    assert.ok(Array.isArray(q.focus), `${q.id} focus must be a list`);
    for (const id of q.focus) {
      assert.ok(ruleIds.has(id) || CURRENT_FOCUS.has(id) || id === 'health-sade-sati',
        `${q.id} points at unknown rule ${id}`);
    }
  }
});

check('no two options in a chapter share the same rule set', () => {
  for (const c of guided.categories) {
    const seen = new Map<string, string>();
    for (const q of (c.questions ?? []).filter((q: any) => Array.isArray(q.focus) && q.focus.length > 0)) {
      const key = [...q.focus].sort().join('|');
      assert.ok(!seen.has(key), `${q.id} and ${seen.get(key)} answer from the same rules`);
      seen.set(key, q.id);
    }
  }
});

check('a focused answer leads with the customer question, not the area reading', () => {
  const start = offline.indexOf('if ($focusCatalog !== []) {');
  assert.ok(start > 0, 'the focused-answer branch is missing');
  const bubble = offline.slice(start, offline.indexOf('if ($chart === null) {', start));
  assert.match(bubble, /your question \"/);
});

check('a focused answer whose rule does not fire gives that rule\'s own classical reading, not the overview', () => {
  assert.match(offline, /Your chart does not carry this combination/);
});

check('every rule a focused option points at carries its own learned (general) reading in all three languages', () => {
  const byId = new Map<string, any>();
  for (const a of areas.areas ?? []) for (const r of a.rules ?? []) byId.set(r.id, r);
  for (const q of areaOptions.filter((q: any) => Array.isArray(q.focus))) {
    for (const id of q.focus as string[]) {
      const rule = byId.get(id);
      assert.ok(rule, `${q.id} points at unknown rule ${id}`);
      for (const lang of ['en', 'ta', 'hi']) {
        assert.ok(String(rule.general?.[lang] ?? '').trim() !== '', `${id} is missing its ${lang} general reading`);
      }
      assert.ok((rule.source ?? []).length >= 2, `${id} must cite multiple sources`);
    }
  }
});

check('the guided answer receives the option focus from the endpoint lookup', () => {
  assert.match(offline, /\$focus = is_array\(\$guided\['focus'\] \?\? null\)/);
  assert.match(endpoint, /function astro_ai_guided_find\(string \$questionId\)/);
  assert.match(endpoint, /return \$q;/);
});

check('the api/knowledge copy carries the same focus data', () => {
  assert.equal(read('api/knowledge/ai-astrologer/rules/guided-questions.json'), read('knowledge/ai-astrologer/rules/guided-questions.json'));
});

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] PHP runtime check - @php-wasm/node is not installed');
} else {
  const OUT = path.join(root, 'tests', 'fixtures', 'php-ai-probes', 'out-guided-focus.json');
  fs.rmSync(OUT, { force: true });
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'php-ai-provider-check.mjs'), 'tests/fixtures/php-ai-probes/guided-focus.php', '--emit', OUT],
    { cwd: root, encoding: 'utf8', timeout: 180000 }
  );
  check('the answer builder runs every curated area option under PHP', () => {
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.ok(fs.existsSync(OUT), 'guided-focus.php must write its output file');
    const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    assert.equal(out.chartBuilt, true, 'the probe chart must rebuild');
    const errors = out.replies.filter((r: any) => r.error);
    assert.equal(errors.length, 0, `answers threw: ${JSON.stringify(errors.slice(0, 2))}`);
    assert.equal(out.replies.length, areaOptions.length, 'every curated area option must answer');

    // Within a chapter, every option that has its own focus gives its own text.
    for (const c of guided.categories) {
      const focused = out.replies.filter((r: any) => r.category === c.id && Array.isArray(r.focus) && r.focus.length > 0);
      const texts = focused.map((r: any) => r.content);
      assert.equal(new Set(texts).size, texts.length, `${c.id}: two options gave the same answer`);
    }
  });
  check('the focused options answer with their own question', () => {
    const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    // Current-guidance options answer through their own reading; every other
    // focused option leads with its question, or says plainly that nothing fires.
    for (const r of out.replies.filter((r: any) => r.category !== 'current-guidance' && Array.isArray(r.focus) && r.focus.length > 0)) {
      assert.match(r.content, /on your question|does not carry this combination/, `${r.id} does not lead with its question`);
    }
  });
}

console.log(`\n[OK] ai-astrologer guided focus: ${passed} checks passed`);
