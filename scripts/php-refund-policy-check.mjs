/**
 * Execute ASTRO SIVAM's refund policy engine under PHP-WASM.
 *
 * The sandbox has no native `php` binary, so the whole policy is executed in a
 * real PHP runtime here instead of being read as text:
 *
 *   • api/refunds.php is loaded and its arithmetic evaluated — 90% of the paid
 *     amount, 3 WORKING days (weekends and listed holidays skipped), the
 *     post-approval refusal, the money formatting and the customer email body;
 *   • every PHP file the refund touches is parsed with token_get_all(TOKEN_PARSE),
 *     which is a real syntax check (`php -l` equivalent) for files that cannot be
 *     included standalone (they open a database connection on load).
 *
 * Usage:
 *   npm install --no-save @php-wasm/node @php-wasm/universal
 *   node scripts/php-refund-policy-check.mjs [--emit out.json]
 *
 * No external service is contacted: the probe only runs api/refunds.php.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';

const repoRoot = resolve(import.meta.dirname, '..');
const PROBE = 'tests/fixtures/php-refund-probes/refund-policy.php';

/** Files the probe includes or syntax-checks. */
const MOUNT_FILES = [
  'api/refunds.php',
  // Parsed, not executed (each one opens a DB connection on load).
  'api/admin/index.php',
  'api/admin/orders.php',
  'api/db.php',
  'api/services/index.php',
  'api/schema.sql',
  'api/migrations/009_refund_workflow.sql',
  'api/migrations/010_refund_gateway_settlement.sql',
  'api/payments.php',
];

const emitIndex = process.argv.indexOf('--emit');
const emitHostPath = emitIndex >= 0 ? process.argv[emitIndex + 1] : null;

const php = new PHP(await loadNodeRuntime('8.4', { emscriptenOptions: { processId: 42 } }));

const mkdirp = (path) => {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      php.mkdir(current);
    } catch {
      /* already exists */
    }
  }
};

const writeInto = (virtualPath, contents) => {
  mkdirp(virtualPath.slice(0, virtualPath.lastIndexOf('/')));
  php.writeFile(virtualPath, contents);
};

for (const rel of MOUNT_FILES) {
  writeInto('/repo/' + rel, readFileSync(join(repoRoot, rel)));
}

const probeRelative = relative(repoRoot, resolve(repoRoot, PROBE)).replaceAll('\\', '/');
writeInto('/repo/' + probeRelative, readFileSync(resolve(repoRoot, PROBE)));

const result = await php.run({
  scriptPath: '/repo/' + probeRelative,
  relativeUri: '/',
  env: { REPO_ROOT: '/repo' },
});

process.stdout.write(result.text ?? '');
if (result.errors) process.stderr.write(result.errors);

if (emitHostPath) {
  const out = php.readFileAsBuffer('/repo/out.json');
  mkdirSync(dirname(resolve(emitHostPath)), { recursive: true });
  writeFileSync(resolve(emitHostPath), out);
}

process.exit(result.exitCode ?? 0);
