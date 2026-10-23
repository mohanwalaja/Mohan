/**
 * THE AI ASTROLOGER ANSWERS THE ORDER-JOURNEY QUESTION — executed, not assumed.
 *
 * Owner request (2026-10-24): the chat must "understand and answer the users
 * questions" about what happens to an order: it goes to the India-based priest
 * team, they calculate and verify it, the administrator approves it, and the
 * report + tax invoice are emailed to the customer with the priest-team
 * verification line.
 *
 * This runs the REAL PHP answer builder (and the real guided menu) under
 * PHP-WASM in English, Tamil and Hindi, for both the guided option and the same
 * question typed as free text. It also proves the new intent does not hijack an
 * ordinary astrology question.
 *
 * Requires the dev-only runtime (not in package.json):
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 * If it is absent, the test reports SKIPPED rather than claiming PHP execution.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'tests', 'fixtures', 'php-ai-probes', 'out-order-journey.json');

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the order-journey PHP runtime check did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
  console.log('\n[OK] ai-astrologer order journey: skipped');
  process.exit(0);
}

fs.rmSync(OUT, { force: true });
const run = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'php-ai-provider-check.mjs'), 'tests/fixtures/php-ai-probes/order-journey.php', '--emit', OUT],
  { cwd: root, encoding: 'utf8', timeout: 180000 }
);
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(run.stderr);
  throw new Error(`order-journey.php exited with status ${run.status}`);
}
assert.ok(fs.existsSync(OUT), 'the probe must write its output file');
const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/** The four facts the answer must carry, per language. */
const FACTS: Record<string, { india: RegExp; priest: RegExp; admin: RegExp; email: RegExp; verify: RegExp }> = {
  en: {
    india: /India/i,
    priest: /priest team/i,
    verify: /verif/i,
    admin: /administrator/i,
    email: /email/i
  },
  ta: {
    india: /இந்தியா/,
    priest: /பூசாரி/,
    verify: /சரிபார்த்த/,
    admin: /நிர்வாகி/,
    email: /மின்னஞ்சல்/
  },
  hi: {
    india: /भारत/,
    priest: /पुजारी/,
    verify: /जाँच|सत्यापन/,
    admin: /प्रशासक/,
    email: /ईमेल/
  }
};

console.log('--- AI ASTROLOGER: ORDER JOURNEY ---');

check('the guided menu offers the option in en, ta and hi', () => {
  assert.ok(out.menu, 'order-process must exist in the guided menu');
  assert.equal(out.menu.kind, 'order');
  assert.equal(out.menu.topic, 'process');
  for (const lang of ['en', 'ta', 'hi']) {
    assert.ok(String(out.menu.text[lang] || '').length > 10, `the ${lang} label must be present`);
  }
});

for (const lang of ['en', 'ta', 'hi']) {
  check(`the guided option answers with the full journey (${lang})`, () => {
    const reply = out.guided.find((r: any) => r.lang === lang);
    assert.ok(reply && !reply.error, `${lang} guided reply failed: ${reply?.error ?? 'missing'}`);
    const content = String(reply.content);
    const facts = FACTS[lang];
    assert.match(content, facts.india, `${lang}: must name India`);
    assert.match(content, facts.priest, `${lang}: must name the priest team`);
    assert.match(content, facts.verify, `${lang}: must say the report is verified`);
    assert.match(content, facts.admin, `${lang}: must name the administrator's approval`);
    assert.match(content, facts.email, `${lang}: must say the report is emailed`);
    assert.match(content, /PDF/, `${lang}: must name the PDF report`);
    assert.match(content, /Tax Invoice|விலைப்பட்டியல|कर चालान/, `${lang}: must name the tax invoice`);
    assert.match(content, /Spam|ஸ்பேம்|स्पैम/, `${lang}: must tell the customer to check spam`);
    assert.equal(reply.handoff, false, `${lang}: this answer needs no human handoff`);
  });
}

for (const lang of ['en', 'ta', 'hi']) {
  check(`the same question TYPED gets the same answer (${lang})`, () => {
    const reply = out.typed.find((r: any) => r.lang === lang);
    assert.ok(reply && !reply.error, `${lang} typed reply failed: ${reply?.error ?? 'missing'}`);
    const content = String(reply.content);
    const facts = FACTS[lang];
    for (const [name, pattern] of Object.entries(facts)) {
      assert.match(content, pattern, `${lang}: typed answer must carry "${name}"`);
    }
  });
}

check('an astrology question is not hijacked by the delivery intent', () => {
  const content = String(out.control.content || '');
  assert.doesNotMatch(content, /India-based Vedic priest team/, 'a marriage question must not get the delivery answer');
  assert.match(content, /marriage|7th house|Marriage/i, 'the marriage question must still get its astrology answer');
});

if (failed > 0) {
  console.error(`\n[FAILED] ai-astrologer order journey: ${failed} check(s) failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n[OK] ai-astrologer order journey: ${passed} checks passed`);
