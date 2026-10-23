/**
 * Run a PHP probe against this repository's real PHP sources, locally.
 *
 * The sandbox has no `php` binary (the PHP suites are CI-only), so this harness
 * boots the wasm PHP runtime from @php-wasm/node (a dev-only dependency, not in
 * package.json), mounts the repository's `api/` and `tests/fixtures/` trees into
 * its virtual filesystem under /repo, and executes the probe file with the
 * repository root as the working directory. It is a development aid only — the
 * committed suites still run under a real PHP in CI.
 *
 * Usage:
 *   npm install --no-save @php-wasm/node
 *   node scripts/php-wasm-check.mjs <probe.php>
 *
 * The probe is usually a small file that `require`s a repo file and prints
 * results (see /tmp probes in the session log); pass `--emit <hostPath>` to
 * also write the probe's `/repo/out.json` back to the host.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';

const [probeArg, ...rest] = process.argv.slice(2);
const mountIndex = rest.indexOf('--mount');
const mountSpec = mountIndex >= 0 ? rest[mountIndex + 1] : null; // hostPath=repoRelativePath
const emitIndex2 = rest.indexOf('--emit');
if (!probeArg) {
  console.error('usage: node scripts/php-wasm-check.mjs <probe.php> [--emit hostPath]');
  process.exit(2);
}
const emitIndex = emitIndex2;
const emitHostPath = emitIndex >= 0 ? rest[emitIndex + 1] : null;

const repoRoot = resolve(import.meta.dirname, '..');
const probePath = resolve(repoRoot, probeArg);

/** Files mounted into the PHP filesystem: everything the report builder loads. */
const MOUNT_FILES = [
  'api/branding.php',
  'api/astrology/muhurtham_report_notes.php',
  'api/astrology/wedding_disclaimer_notes.php',
  'api/astrology/engine.php',
  'api/astrology/report_views.php',
  'tests/fixtures/jathagam-summary-parity.json'
];

/** Whole chapter directories mounted alongside MOUNT_FILES. */
const MOUNT_DIRS = [
  'api/astrology/engine',
  'api/astrology/report_views'
];

// A process id must be assigned before the wasm runtime initialises.
const php = new PHP(await loadNodeRuntime('8.4', { emscriptenOptions: { processId: 42 } }));

const mkdirp = path => {
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

const mountTree = relDir => {
  const hostDir = join(repoRoot, relDir);
  let entries;
  try {
    entries = readdirSync(hostDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const childRel = relDir + '/' + entry.name;
    if (entry.isDirectory()) {
      mountTree(childRel);
    } else if (entry.isFile()) {
      writeInto('/repo/' + childRel, readFileSync(join(repoRoot, childRel)));
    }
  }
};

for (const dir of ['api', 'data', 'src', 'tests', 'public']) {
  mountTree(dir);
}
mkdirp('/tmp');
try {
  php.chdir('/repo');
} catch {
  /* optional */
}

if (mountSpec) {
  const [hostPath, virtualPath] = mountSpec.split('=');
  writeInto('/repo/' + (virtualPath || 'tmp/mount.json'), readFileSync(hostPath));
}
const virtualProbe = '/repo/' + relative(repoRoot, probePath).replaceAll('\\', '/');
writeInto(virtualProbe, readFileSync(probePath));
writeInto(
  '/repo/__wasm_cli_entry.php',
  "<?php\n" +
    "if (!defined('STDIN')) define('STDIN', fopen('php://stdin', 'r'));\n" +
    "if (!defined('STDOUT')) define('STDOUT', fopen('php://stdout', 'w'));\n" +
    "if (!defined('STDERR')) define('STDERR', fopen('php://stderr', 'w'));\n" +
    'chdir(' + JSON.stringify('/repo') + ");\n" +
    'require ' + JSON.stringify(virtualProbe) + ";\n"
);

const result = await php.run({
  scriptPath: '/repo/__wasm_cli_entry.php',
  relativeUri: '/',
  env: { REPO_ROOT: '/repo' }
});

process.stdout.write(result.text ?? '');
if (result.errors) process.stderr.write(result.errors);

if (emitHostPath) {
  writeFileSync(resolve(emitHostPath), php.readFileAsBuffer('/repo/out.json'));
}

process.exit(result.exitCode ?? 0);
