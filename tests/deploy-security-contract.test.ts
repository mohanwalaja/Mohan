/**
 * Deployment security contracts for protected runtime data and staged files.
 *
 * These checks intentionally inspect the cPanel copy script itself: a source
 * file being protected in Git is not enough if deployment silently omits its
 * deny rule or packages locally staged customer data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploy = fs.readFileSync(path.join(root, 'deploy_cpanel.sh'), 'utf8');
const runtimeHtaccessPath = path.join(root, 'api/astrology/tmp/.htaccess');

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- CPANEL DEPLOYMENT SECURITY CONTRACT ---');

check('the astrology runtime directory has a tracked HTTP deny rule', () => {
  assert.ok(fs.existsSync(runtimeHtaccessPath), 'api/astrology/tmp/.htaccess must exist');
  const htaccess = fs.readFileSync(runtimeHtaccessPath, 'utf8');
  assert.match(htaccess, /Require all denied/);
  assert.match(htaccess, /Deny from all/);
  assert.match(htaccess, /Options -Indexes -ExecCGI/);
  assert.match(htaccess, /RemoveHandler \.php \.phtml \.php3 \.php4 \.php5 \.php7 \.php8/);
});

check('deploy fails clearly when the required runtime deny file is missing and copies it explicitly', () => {
  assert.match(deploy, /if \[ ! -f "api\/astrology\/tmp\/\.htaccess" \]; then[\s\S]*?refusing to deploy[\s\S]*?exit 1/);
  assert.match(deploy, /cp -f "api\/astrology\/tmp\/\.htaccess" "\$TARGET_DIR\/api\/astrology\/tmp\/\.htaccess"/);
  assert.ok(
    deploy.indexOf('refusing to deploy') < deploy.indexOf('mkdir -p "$TARGET_DIR"'),
    'the guard must run before creating/copying deployment files'
  );
});

console.log(`\n${passed} deployment security checks passed.`);
