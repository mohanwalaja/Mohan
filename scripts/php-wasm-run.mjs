/**
 * Run one PHP test file under PHP-WASM (for machines without a native `php`).
 *
 * CI runs the PHP suites with native PHP 8.1 (scripts/run-php-tests.sh). This
 * runner lets the same files execute locally - and from the Node suite - by
 * mounting the real api/ tree and tests/ PHP files into a php-wasm virtual
 * filesystem. Use `--php 8.1` to match CI's PHP version.
 *
 * Usage (dev-only runtime, not in package.json):
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 *   node scripts/php-wasm-run.mjs [--php 8.1|8.4] tests/admin-report-delivery.test.php
 *
 * Exits with the PHP script's exit code. Nothing outside the virtual
 * filesystem is written and no network service is contacted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PHP, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const phpFlag = args.indexOf('--php');
const version = phpFlag >= 0 ? args[phpFlag + 1] : '8.4';
const script = args.filter((arg, index) => index !== phpFlag && index !== phpFlag + 1)[0];
if (!script) {
  console.error('usage: node scripts/php-wasm-run.mjs [--php 8.1|8.4] <file.php>');
  process.exit(2);
}

const php = new PHP(await loadNodeRuntime(version, { emscriptenOptions: { processId: 4243 } }));
await setPhpIniEntries(php, { memory_limit: '512M', display_errors: '1', error_reporting: String(32767) });

const mkdirp = (dir) => {
  let current = '';
  for (const part of dir.split('/').filter(Boolean)) {
    current += `/${part}`;
    if (!php.fileExists(current)) php.mkdir(current);
  }
};

const mount = (relativeDir, filter = () => true) => {
  const walk = (hostDir) => {
    for (const entry of fs.readdirSync(hostDir, { withFileTypes: true })) {
      const hostPath = path.join(hostDir, entry.name);
      const relative = path.relative(repoRoot, hostPath).split(path.sep).join('/');
      if (relative.startsWith('api/storage/') || relative.startsWith('api/astrology/tmp/') || relative.includes('/node_modules/')) continue;
      if (entry.isDirectory()) walk(hostPath);
      else if (filter(relative)) {
        mkdirp(path.posix.dirname(`/repo/${relative}`));
        php.writeFile(`/repo/${relative}`, fs.readFileSync(hostPath));
      }
    }
  };
  walk(path.join(repoRoot, relativeDir));
};

mount('api');
mount('tests', (relative) => relative.endsWith('.php') || relative.startsWith('tests/fixtures/'));
// Shared data the PHP engine and tests read from the frontend tree and data/.
mount('src/lib');
if (fs.existsSync(path.join(repoRoot, 'data'))) mount('data');
mkdirp('/repo/api/storage/family_docs');
mkdirp('/tmp');

// The CLI SAPI that CI uses defines STDIN/STDOUT/STDERR; php-wasm does not.
php.writeFile('/repo/.php-wasm-cli-constants.php', `<?php
if (!defined('STDIN')) define('STDIN', fopen('php://stdin', 'r'));
if (!defined('STDOUT')) define('STDOUT', fopen('php://stdout', 'w'));
if (!defined('STDERR')) define('STDERR', fopen('php://stderr', 'w'));
`);
await setPhpIniEntries(php, { auto_prepend_file: '/repo/.php-wasm-cli-constants.php' });

const response = await php.run({
  scriptPath: `/repo/${script.replace(/^\.\//, '')}`,
  env: { APP_SECRET_KEY: 'php-wasm-runner-test-only-secret-0123456789abcdef' }
});
process.stdout.write(response.text);
if (response.errors) process.stderr.write(response.errors);
const exitCode = response.exitCode ?? 0;
php.exit();
process.exit(exitCode);
