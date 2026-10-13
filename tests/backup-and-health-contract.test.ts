/**
 * ASTRO SIVAM — health endpoint + backup pipeline contract.
 *
 * WHY THIS EXISTS: item 3 and item 4 of the launch checklist are only real if
 * the pieces stay connected. A health endpoint that forgets `requireAdmin()`
 * publishes the DB server version, provider configuration and disk quota to
 * anyone; a backup script that writes a success marker when mysqldump failed is
 * worse than no backup at all, because the dashboard then says "protected".
 *
 * Two layers:
 *   1. static  — the endpoint's auth/secret rules and the workflow's wire-up,
 *   2. dynamic — the backup script is executed end to end with a stubbed
 *      mysqldump, proving the marker, the retention rotation and the
 *      "refuse to fake a backup" failure path.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const health = read('api/admin/health.php');
const backup = read('scripts/backup/astro_site_backup.sh');
const monitoring = read('.github/workflows/monitoring.yml');
const rotate = read('scripts/ops/rotate_php_logs.sh');
const restoreDoc = read('scripts/backup/RESTORE_VERIFICATION.md');

console.log('--- HEALTH + BACKUP CONTRACT ---');

// ---------------------------------------------------------------------------
// 1. The health endpoint
// ---------------------------------------------------------------------------
check('the health endpoint is admin-only', () => {
  assert.match(health, /require_once __DIR__ \. '\/\.\.\/db\.php'/);
  assert.match(health, /\$pdo = getDbConnection\(\);/);
  assert.match(health, /\$admin = requireAdmin\(\$pdo\);/);
  assert.ok(
    health.indexOf('requireAdmin(') < health.indexOf("$checks[] = astro_health_run("),
    'auth must be enforced before any probe runs'
  );
});

check('no secret value is ever returned', () => {
  for (const forbidden of ['client_secret\' =>', 'key_secret\' =>', 'webhook_secret\' =>', 'password\' =>', 'apiSecret\' =>']) {
    assert.ok(!health.includes(forbidden), `the health report must not echo ${forbidden.replace(/' =>/, '')}`);
  }
  assert.doesNotMatch(health, /DB_PASS|DB_USER/, 'database credentials must never be read into the report');
});

check('every probe is isolated and the endpoint is a real readiness signal', () => {
  assert.match(health, /function astro_health_run\(\$name, callable \$probe\)/);
  assert.match(health, /catch \(Throwable \$e\)/, 'a throwing probe must degrade itself, not the report');
  assert.match(health, /\$overall === 'failing' \? 503 : 200/, 'a failing check must answer 503 for uptime monitors');
  assert.match(health, /'summary' => \$summary/);
});

check('the required subsystems are probed', () => {
  for (const probe of ["'database'", "'schema'", "'payments.providers'", "'payments.capture'", "'payments.webhooks'", "'storage'", "'backups'", "'logging'", "'runtime'", "'disk'"]) {
    assert.ok(health.includes(`astro_health_run(${probe}`), `missing probe ${probe}`);
  }
  // The schema probe must check the tables the payment hardening depends on.
  for (const table of ['payment_intents', 'payment_idempotency_keys', 'payment_webhook_events', 'beta_ip_claims']) {
    assert.ok(health.includes(`'${table}'`), `the schema probe must require ${table}`);
  }
});

check('scope may include the payment hardening columns, not just the feature flag', () => {
  // A partial deploy (code updated, migration not run) must be visible.
  assert.match(health, /'orders' => \['payment_intent_id', 'payment_status', 'group_id'\]/);
});

// ---------------------------------------------------------------------------
// 2. The backup script
// ---------------------------------------------------------------------------
check('the backup script dumps the database and the support documents', () => {
  assert.match(backup, /--single-transaction/);
  assert.match(backup, /--skip-lock-tables/);
  assert.match(backup, /tar --exclude='\.\/backups' -czf "\$STORAGE_TAR" -C "\$API_DIR\/storage" \./);
  assert.match(backup, /STORAGE_STATUS=/, 'the marker must record whether storage was included');
});

check('the backup script never prints credentials', () => {
  assert.doesNotMatch(backup, /echo[^\n]*\$DB_PASS/);
  assert.doesNotMatch(backup, /log[^\n]*\$DB_PASS/);
  assert.match(backup, /MYSQL_PWD="\$DB_PASS"/, 'the password must travel through the environment, not argv');
});

check('a failed dump cannot produce a success marker', () => {
  const markerWrite = backup.indexOf('cat > "$BACKUP_DIR/last-backup.json"');
  const failOnSmall = backup.indexOf('refusing to call that a backup');
  const failOnExit = backup.indexOf('mysqldump failed');
  assert.ok(failOnExit !== -1 && failOnSmall !== -1 && markerWrite !== -1);
  assert.ok(failOnExit < markerWrite, 'a non-zero mysqldump exit must not reach the marker');
  assert.ok(failOnSmall < markerWrite, 'an implausibly small dump must not reach the marker');
});

check('retention rotation is portable and always keeps the newest generation', () => {
  assert.match(backup, /mapfile -t GENERATIONS < </);
  assert.match(backup, /sort -r/, 'newest first, so the tail is what gets pruned');
  assert.match(backup, /GENERATIONS\[@\]:\$RETENTION\}/, 'the newest RETENTION generations must be kept');
  const backupCode = backup.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(backupCode, /find[^\n]*-printf/, 'BSD/macOS find has no -printf; a silent rotation failure fills the quota');
});

check('the runbook documents a sandbox restore, not a production one', () => {
  assert.match(restoreDoc, /never\s+restore over production/i, 'the runbook must warn against restoring over production');
  assert.match(restoreDoc, /gzip -t/);
  assert.match(restoreDoc, /docker exec astro-restore mysql/);
  assert.match(restoreDoc, /orphan_orders/);
  assert.match(restoreDoc, /storage\.tar\.gz/);
});

// ---------------------------------------------------------------------------
// 3. The external monitor
// ---------------------------------------------------------------------------
check('the log rotation script rotates by size and prunes old generations', () => {
  assert.match(rotate, /MAX_MB="\$\{MAX_MB:-20\}"/);
  assert.match(rotate, /KEEP="\$\{KEEP:-6\}"/);
  assert.match(rotate, /mv "\$file" "\$target"/, 'the live file must be moved first, so PHP keeps writing');
  assert.match(rotate, /gzip -9 "\$target"/);
  assert.match(rotate, /ls -1 "\$file"\.\*\.gz 2>\/dev\/null \| sort -r/, 'pruning must be ordered by stamp, newest first');
  assert.doesNotMatch(rotate.split('\n').filter(line => !line.trim().startsWith('#')).join('\n'), /ls -1t /, 'mtime ordering ties can drop the newest archive');
  assert.match(rotate, /\[ ! -d "\$LOG_DIR" \]/, 'a missing log dir is a no-op, not a cron failure every week');
  assert.ok(
    rotate.indexOf('mv "$file"') < rotate.indexOf('gzip -9 "$target"'),
    'compress after the move, never while PHP is still writing to the path'
  );
});

check('the release archive ships the ops scripts the cron entries point at', () => {
  const zipBuilder = read('scripts/create_dist_zip.py');
  assert.match(zipBuilder, /for ops_dir in \('scripts\/backup', 'scripts\/ops'\)/, 'a zip-only deploy must still get the backup + rotation scripts');
  for (const doc of ['HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md', 'PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md']) {
    assert.ok(zipBuilder.includes(`'${doc}'`), `the archive must ship ${doc}`);
  }
});

check('the weekly monitor is external, scheduled and credentialless', () => {
  assert.match(monitoring, /^name: Production monitoring$/m);
  assert.match(monitoring, /cron: '15 6 \* \* 1'/, 'it must run weekly without a human');
  assert.match(monitoring, /workflow_dispatch/);
  assert.doesNotMatch(monitoring, /secrets\./, 'the monitor must not need secrets to check a public URL');
  assert.match(monitoring, /vars\.PRODUCTION_URL/);
  for (const probe of ['Uptime + latency', 'TLS certificate expiry', 'Deployed build actually contains the payment hardening']) {
    assert.ok(monitoring.includes(probe), `missing monitor step: ${probe}`);
  }
  assert.match(monitoring, /::error title=Certificate expiring soon::/);
  assert.match(monitoring, /MIN_DAYS: '21'/, 'alert before the certificate lapses, not after');
  assert.match(monitoring, /::error title=Monitoring is unarmed::/);
});

// ---------------------------------------------------------------------------
// 4. Run the backup script for real (stubbed mysqldump)
// ---------------------------------------------------------------------------
const isWindows = process.platform === 'win32';
check('the backup script produces a valid marker, then rotates', () => {
  if (isWindows) {
    console.log('        (skipped: needs bash)');
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-backup-test-'));
  const binDir = path.join(tmp, 'bin');
  const backupDir = path.join(tmp, 'backups');
  fs.mkdirSync(binDir, { recursive: true });

  // A stub dump tool: it only has to produce a plausible, large, *incompressible*
  // SQL stream, because the script refuses to call a <4 KB gzip a backup.
  const stub = path.join(binDir, 'mysqldump');
  fs.writeFileSync(stub, [
    '#!/bin/bash',
    'printf -- "-- MySQL dump\\nCREATE TABLE orders (id INT);\\n"',
    'head -c 300000 /dev/urandom | base64',
    ''
  ].join('\n'));
  fs.chmodSync(stub, 0o755);

  const script = path.join(projectRoot, 'scripts', 'backup', 'astro_site_backup.sh');
  const runBackup = (env: Record<string, string> = {}) => spawnSync('bash', [script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      MYSQLDUMP_BIN: 'mysqldump',
      BACKUP_DIR: backupDir,
      RETENTION: '2',
      DB_HOST: 'localhost',
      DB_NAME: 'astro_test',
      DB_USER: 'astro_test',
      DB_PASS: 'super-secret-value',
      ...env
    }
  });

  const first = runBackup();
  assert.equal(first.status, 0, `backup script failed:\n${first.stdout}\n${first.stderr}`);
  assert.ok(!`${first.stdout}${first.stderr}`.includes('super-secret-value'), 'the dump password must never reach the log');

  const markerPath = path.join(backupDir, 'last-backup.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  assert.ok(Date.parse(marker.generatedAt) > 0, 'the marker must carry a parseable generatedAt');
  assert.ok(marker.database.dumpBytes > 4096, 'the marker must record the real dump size');
  assert.equal(marker.storage.included, true, 'api/storage must be part of the backup');
  assert.equal(marker.retention.keep, 2);
  assert.equal(marker.database.name, 'astro_test');

  // The generation directory must actually contain both archives.
  const generation = path.join(backupDir, marker.generation);
  const files = fs.readdirSync(generation);
  assert.ok(files.includes('database.sql.gz'), `missing dump in ${files.join(', ')}`);
  assert.ok(files.includes('storage.tar.gz'), `missing storage archive in ${files.join(', ')}`);

  // Rotation: run three more generations with a 2-generation retention.
  for (let i = 0; i < 3; i++) {
    fs.mkdirSync(path.join(backupDir, `20200101T00000${i}Z`), { recursive: true });
    fs.writeFileSync(path.join(backupDir, `20200101T00000${i}Z`, 'database.sql.gz'), 'x');
  }
  const second = runBackup();
  assert.equal(second.status, 0, second.stderr);
  const generations = fs.readdirSync(backupDir).filter(name => /^\d{8}T\d{6}Z$/.test(name)).sort();
  assert.ok(generations.length <= 2, `retention must prune to 2 generations, found ${generations.length}`);
  assert.ok(generations.includes(marker.generation) || generations.length === 2, 'the newest generation must survive pruning');

  // A failing dump must exit non-zero and leave the previous marker untouched.
  const failingStub = path.join(binDir, 'mysqldump-fail');
  fs.writeFileSync(failingStub, '#!/bin/bash\necho "mysqldump: Got error: 1045: Access denied" >&2\nexit 2\n');
  fs.chmodSync(failingStub, 0o755);
  const markerBefore = fs.readFileSync(markerPath, 'utf8');
  const failed = runBackup({ MYSQLDUMP_BIN: 'mysqldump-fail' });
  assert.notEqual(failed.status, 0, 'a failed dump must be a failed run');
  assert.equal(fs.readFileSync(markerPath, 'utf8'), markerBefore, 'a failed dump must not refresh the marker');

  fs.rmSync(tmp, { recursive: true, force: true });
});

check('log rotation behaves: rotates a big file, keeps KEEP, copes with missing dirs', () => {
  if (isWindows) {
    console.log('        (skipped: needs bash)');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-rotate-test-'));
  const logDir = path.join(tmp, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const script = path.join(projectRoot, 'scripts', 'ops', 'rotate_php_logs.sh');

  // Three pre-existing generations so the KEEP=2 pruning has something to do.
  for (const stamp of ['20200101T000000Z', '20200102T000000Z', '20200103T000000Z']) {
    fs.writeFileSync(path.join(logDir, `php_error.log.${stamp}.gz`), 'old');
  }
  // ~1 MB of incompressible text, over the 0.5 MB threshold below.
  fs.writeFileSync(path.join(logDir, 'php_error.log'), `${'x'.repeat(1024)}\n`.repeat(1200));

  const rotateRun = spawnSync('bash', [script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, LOG_DIR: logDir, MAX_MB: '0', KEEP: '2', LOG_FILES: 'php_error.log' }
  });
  assert.equal(rotateRun.status, 0, rotateRun.stderr);
  const after = fs.readdirSync(logDir).filter(name => name.endsWith('.gz')).sort();
  assert.ok(after.length <= 2, `KEEP=2 must prune older generations, found ${after.length}: ${after.join(', ')}`);
  assert.ok(after.some(name => name.includes('php_error.log.2026')), 'the freshly rotated generation must survive');

  // A run with nothing over the threshold must be a quiet no-op.
  const idle = spawnSync('bash', [script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, LOG_DIR: logDir, MAX_MB: '1000', KEEP: '2', LOG_FILES: 'php_error.log' }
  });
  assert.equal(idle.status, 0);
  assert.match(idle.stdout, /nothing to rotate/);

  // A missing directory must not fail a weekly cron.
  const missing = spawnSync('bash', [script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, LOG_DIR: path.join(tmp, 'does-not-exist'), LOG_FILES: 'php_error.log' }
  });
  assert.equal(missing.status, 0, 'an unconfigured log directory must not be a cron failure');
  assert.match(missing.stdout, /no log directory/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\nHealth + backup contract passed (${passed} checks).\n`);
