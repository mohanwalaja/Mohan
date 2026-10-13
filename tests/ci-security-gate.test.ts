/**
 * ASTRO SIVAM — the CI security gate must stay a gate.
 *
 * WHY THIS EXISTS: the PR gate added for the payment-hardening audit is only
 * worth anything while it is still wired up. Workflow edits are easy to make
 * and invisible in review, so this test asserts the exact commands that must
 * run before a build can be packaged: the production dependency audit, the
 * composer audit, php -l over every API file, and a Playwright smoke test —
 * plus that the packaging job still waits for them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(projectRoot, '.github', 'workflows', 'build.yml');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');

console.log('--- CI SECURITY GATE ---');

check('the build workflow runs on pull requests', () => {
  assert.match(workflow, /^\s{2}pull_request:\s*$/m, 'build.yml must be triggered by pull_request');
});

check('production npm advisories fail the gate at high severity', () => {
  assert.match(
    workflow,
    /npm audit --omit=dev --audit-level=high/,
    'the gate must run npm audit against production dependencies with --audit-level=high'
  );
  assert.match(workflow, /npm ci/, 'the gate must install from the lockfile with npm ci');
});

check('composer advisories fail the gate', () => {
  assert.match(workflow, /composer audit/, 'the gate must run composer audit');
});

check('every API PHP file is syntax-checked', () => {
  assert.match(workflow, /find api -name '\*\.php'/, 'the gate must enumerate api/**/*.php');
  assert.match(workflow, /php -l/, 'the gate must run php -l on those files');
});

check('a Playwright smoke test runs in the gate', () => {
  assert.match(workflow, /npx playwright test tests\/browser\//, 'a browser smoke spec must run');
  assert.match(workflow, /playwright install --with-deps chromium/, 'CI must install its own browser');
});

check('packaging waits for every gate, including the browser smoke test', () => {
  const needsLine = workflow.split('\n').find(line => line.includes('needs:'));
  assert.ok(needsLine, 'the build job must declare needs:');
  assert.match(needsLine!, /security/, 'packaging must depend on the security job');
  assert.match(needsLine!, /tests/, 'packaging must depend on the Node contract suite');
  assert.match(needsLine!, /playwright-smoke/, 'packaging must depend on the browser smoke test');
});

check('the browser smoke test is its own job, not a step that can be dropped', () => {
  assert.match(workflow, /^\s{2}playwright-smoke:\s*$/m, 'the smoke test must stay a first-class job');
  assert.match(workflow, /playwright install --with-deps chromium/, 'the smoke job must install a real browser');
});

check('the deployable archive is asserted to contain the payment migration', () => {
  assert.match(
    workflow,
    /api\/migrations\/008_payment_idempotency\.sql/,
    'the dist.zip verification must fail if the idempotency migration is missing'
  );
  for (const shipped of ['api/admin/health.php', 'scripts/backup/astro_site_backup.sh', 'scripts/ops/rotate_php_logs.sh']) {
    assert.ok(workflow.includes(`'${shipped}'`), `the dist.zip verification must require ${shipped}`);
  }
});

check('only the dev-only audits are advisory; the Node suite is a real gate', () => {
  const jobSlice = (name: string) => {
    const start = workflow.indexOf(`\n  ${name}:`);
    assert.ok(start !== -1, `job ${name} not found`);
    const rest = workflow.slice(start + 1);
    const nextJob = rest.slice(1).search(/\n  [a-z][a-z0-9-]*:\n/);
    return nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
  };
  const advisories = (jobSlice('security').match(/continue-on-error: true/g) ?? []).length;
  assert.equal(advisories, 3, 'the dev-only full-tree audit, PHPStan and php-cs-fixer stay advisory');
  const testsJob = jobSlice('tests');
  assert.doesNotMatch(testsJob, /continue-on-error/, 'the Node suite must block the gate it protects');
  assert.match(testsJob, /run: npm test/);
});

check('PHPStan configuration exists for the advisory static analysis step', () => {
  assert.ok(
    fs.existsSync(path.join(projectRoot, '.github', 'phpstan.neon')),
    '.github/phpstan.neon must exist for the PHPStan step to be meaningful'
  );
});

console.log(`\nCI security gate passed (${passed} checks).`);
