/**
 * GitHub Actions intentionally runs ONLY the native PHP test suite. Frontend
 * builds, Node/browser tests, security audits and production monitoring remain
 * available locally, but must not create additional GitHub workflow checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(projectRoot, '.github', 'workflows');
const workflowFiles = fs.readdirSync(workflowDir).filter(file => /\.ya?ml$/.test(file)).sort();
const workflow = fs.readFileSync(path.join(workflowDir, 'tests.yml'), 'utf8');

assert.deepEqual(workflowFiles, ['tests.yml'], 'PHP Test Suite must be the only GitHub Actions workflow');
assert.match(workflow, /^name: PHP Test Suite$/m);
assert.match(workflow, /^  workflow_dispatch:$/m);
assert.doesNotMatch(workflow, /^  pull_request:$/m);
assert.doesNotMatch(workflow, /^  push:$/m);
assert.ok(workflow.includes('\njobs:\n'), 'PHP workflow must define jobs');
const jobs = workflow.slice(workflow.indexOf('\njobs:\n') + '\njobs:\n'.length);
assert.deepEqual([...jobs.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map(match => match[1]), ['php'],
  'the workflow must have a single PHP job');
assert.match(workflow, /php-version: '8\.1'/);
assert.match(workflow, /composer install --no-interaction --prefer-dist --no-progress/);
assert.match(workflow, /find api tests -name '\*\.php'[\s\S]*?php -l/);
assert.match(workflow, /ASTRO_REQUIRE_MPDF_TESTS: '1'/);
assert.match(workflow, /run: bash scripts\/run-php-tests\.sh/);
assert.doesNotMatch(workflow, /\bnpm\b|\bnpx\b|playwright|vite build|dist\.zip/i);
console.log('GitHub Actions contract passed: only the PHP test suite is configured.');
