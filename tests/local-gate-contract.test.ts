import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const gate = fs.readFileSync(path.join(projectRoot, 'scripts/run-all-tests.sh'), 'utf8');

assert.equal(
  pkg.scripts?.['test:all'],
  'bash scripts/run-all-tests.sh',
  'npm run test:all must invoke the documented full local gate'
);
for (const phase of [
  'npm run lint',
  'npm run build',
  'npm test',
  'scripts/run-php-tests.sh',
  'npm run test:pdf'
]) {
  assert.ok(gate.includes(phase), `the full local gate must include ${phase}`);
}
assert.match(gate, /All locally-runnable tests passed\./);

console.log('Full local gate contract passed: npm run test:all is wired to lint, build, Node, PHP and optional browser checks.');
