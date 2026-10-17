import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const diagnostic = read('api/check_mpdf.php');
const envExample = read('.env.example');
const deploymentGuide = read('docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md');
const health = read('api/admin/health.php');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- mPDF DIAGNOSTIC ENDPOINT GATE ---');

check('the endpoint returns 404 before loading code that exposes paths or font inventory', () => {
  const gateAt = diagnostic.indexOf("if (trim((string)getenv('ASTROSIVAM_DIAGNOSTICS')) !== '1')");
  const firstRequireAt = diagnostic.indexOf('require_once');
  assert.ok(gateAt >= 0, 'the explicit opt-in gate must exist');
  assert.ok(firstRequireAt > gateAt, 'the gate must run before mPDF/config includes');

  const gate = diagnostic.slice(gateAt, firstRequireAt);
  assert.match(gate, /http_response_code\(404\)/);
  assert.match(gate, /Content-Type: application\/json/);
  assert.match(gate, /exit;/);
});

check('the example environment leaves diagnostics blank and clearly forbids production enablement', () => {
  assert.match(envExample, /^ASTROSIVAM_DIAGNOSTICS=\s*$/m);
  assert.match(envExample, /Leave blank in production/i);
  assert.match(envExample, /private local\/staging copy/i);
});

check('deployment defaults never set the diagnostic gate to 1', () => {
  const deploymentDefaults = [
    '.env.example',
    '.cpanel.yml',
    'api/.htaccess',
    'public/.htaccess',
    '.github/workflows/tests.yml',
    'scripts/create_dist_zip.py',
    'scripts/run-all-tests.sh'
  ];
  const enablesDiagnostic = /(?:^|\s)(?:SetEnv\s+)?ASTROSIVAM_DIAGNOSTICS(?:\s*=\s*|\s+)['"]?1(?:['"]?\s|$)/im;
  for (const file of deploymentDefaults) {
    assert.doesNotMatch(read(file), enablesDiagnostic, `${file} must not enable diagnostics by default`);
  }
});

check('the operator guide directs production checks to authenticated health and staging-only diagnostics', () => {
  assert.match(deploymentGuide, /authenticated Admin → Health Monitor/);
  assert.match(deploymentGuide, /Never set `ASTROSIVAM_DIAGNOSTICS=1` on production/i);
  assert.match(deploymentGuide, /private local\/staging copy only/i);
  assert.match(health, /\$admin = requireAdmin\(\$pdo\)/);
  assert.match(health, /'mpdfAvailable'\s*=>\s*\$mpdf/);
});

check('an unconfigured PHP runtime returns only the not-found JSON response', () => {
  const phpWasmRunner = path.join(projectRoot, 'scripts/php-wasm-run.mjs');
  const hasPhpWasm = fs.existsSync(path.join(projectRoot, 'node_modules/@php-wasm/node')) &&
    fs.existsSync(path.join(projectRoot, 'node_modules/@php-wasm/universal'));
  let result;

  if (process.platform !== 'win32' && spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0) {
    result = spawnSync('php', ['api/check_mpdf.php'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ASTROSIVAM_DIAGNOSTICS: '' }
    });
  } else if (hasPhpWasm) {
    result = spawnSync(process.execPath, [phpWasmRunner, '--php', '8.1', 'api/check_mpdf.php'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ASTROSIVAM_DIAGNOSTICS: '' }
    });
  } else {
    console.log('        (skipped: neither native PHP nor the optional PHP-WASM runtime is installed)');
    return;
  }

  assert.equal(result.status, 0, `diagnostic probe exited unexpectedly:\n${result.stderr}`);
  const body = JSON.parse(result.stdout.trim());
  assert.equal(body.success, false);
  assert.match(body.message, /Not found/);
  assert.doesNotMatch(result.stdout, /Active Font Path|NotoSans|\.ttf|Server Diagnostic Check/i);
});

console.log(`\nDiagnostic gate contract passed (${passed} checks).`);
