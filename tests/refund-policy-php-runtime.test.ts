/**
 * Executes the refund policy engine under PHP-WASM.
 *
 * Native PHP is not installed in the sandbox. When the optional wasm runtime is
 * present, this test really runs api/refunds.php: the 90% arithmetic, the
 * 3-working-day settlement (weekends AND listed holidays skipped), the refusal
 * to refund an approved order, the money formatting and the customer email
 * body. It also parses every PHP file the refund path touches with
 * token_get_all(TOKEN_PARSE), which is the `php -l` check for the files that
 * cannot be included standalone (they open a database connection on load).
 *
 * Requires the dev-only runtime (not in package.json):
 *   npm install --no-save @php-wasm/node @php-wasm/universal
 * If it is absent, the test reports SKIPPED rather than claiming PHP execution.
 *
 * Why this matters: the settlement date is a promise printed to customers. A
 * plain "+3 days" would land on a Sunday and still look plausible in a code
 * review, so the arithmetic is executed instead of read.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = 'scripts/php-refund-policy-check.mjs';
const OUT = path.join(root, 'tests', 'fixtures', 'php-refund-probes', 'out.json');

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the refund PHP runtime check did not run.');
  console.log('         npm install --no-save @php-wasm/node @php-wasm/universal');
  console.log('\n[OK] refund policy php runtime: skipped');
  process.exit(0);
}

fs.rmSync(OUT, { force: true });
const run = spawnSync(process.execPath, [path.join(root, RUNNER), '--emit', OUT], {
  cwd: root,
  encoding: 'utf8',
  timeout: 180000
});
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(run.stderr);
  throw new Error(`${RUNNER} exited with status ${run.status}`);
}
assert.ok(fs.existsSync(OUT), 'the refund probe must write its result file');

const result = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- REFUND POLICY PHP RUNTIME ---');

check('every PHP file the refund touches parses (php -l equivalent)', () => {
  for (const [file, info] of Object.entries(result.syntax as Record<string, { ok: boolean; message: string }>)) {
    assert.ok(info.ok, `${file} failed to parse: ${info.message}`);
  }
  assert.ok(Object.keys(result.syntax).length >= 5, 'the probe must parse the refund engine, the admin router and the read models');
});

check('the executed policy engine reported zero failures', () => {
  assert.equal(result.failed, 0, `${result.failed} refund policy assertion(s) failed inside PHP`);
  assert.ok(Array.isArray(result.checks) && result.checks.length >= 25, 'the probe must execute a meaningful number of assertions');
});

check('the executed assertions cover the money, the calendar and the refusal', () => {
  const names: string[] = result.checks.map((c: { name: string }) => c.name);
  const mustCover = [
    'a $100.00 pre-approval order refunds $90.00',
    'a $100.00 approved order refunds $0.00',
    'Wed 14 Oct 2026 + 3 working days = Mon 19 Oct 2026',
    'Wed 23 Dec 2026 + 3 working days skips the 25 Dec holiday = Tue 29 Dec 2026',
    'refund email promises 3 working days'
  ];
  for (const name of mustCover) {
    assert.ok(names.includes(name), `the PHP runtime must assert: ${name}`);
  }
});

console.log(`\n[OK] refund policy php runtime: ${passed} checks passed (${result.checks.length} executed inside PHP)`);
