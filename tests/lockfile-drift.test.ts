/**
 * ASTRO SIVAM — lockfiles must agree with package.json.
 *
 * WHY THIS EXISTS: npm and Bun lockfiles can drift from package.json, leaving
 * frontend builds dependent on whichever installer happens to be used. This
 * test checks that both lockfiles pin the same declared version ranges.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** bun.lock is JSONC: valid JSON apart from trailing commas. */
function parseJsonc(text: string): any {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
}

function readJson(relative: string): any {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relative), 'utf8'));
}

console.log('--- LOCKFILE / package.json AGREEMENT ---');

const pkg = readJson('package.json');
const declared: Record<string, string> = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {})
};

check('package.json declares dependencies', () => {
  assert.ok(Object.keys(declared).length > 0, 'no dependencies found in package.json');
});

check('bun.lock records the same version range as package.json for every package', () => {
  const lockPath = path.join(projectRoot, 'bun.lock');
  if (!fs.existsSync(lockPath)) {
    // The project installs with npm (package-lock.json is the maintained
    // lockfile; the deployment guide runs `npm ci && npm run build:zip`).
    // The committed bun.lock was a REWOUND copy from the pre-Vite/Express
    // era of this project — its root package was still named "react-example"
    // and it still pinned express, nodemailer, @google/genai, bcryptjs and
    // dotenv, dependencies this application does not have. A lockfile that
    // describes a different application is a trap: installing from it pulls
    // a dependency tree nobody chose. If bun is ever adopted, regenerate it
    // with `bun install --lockfile-only` and this check comes back to life.
    console.log('    (bun.lock absent — the project installs with npm; skipped)');
    return;
  }
  const lock = parseJsonc(fs.readFileSync(lockPath, 'utf8'));
  const root = lock?.workspaces?.[''];
  assert.ok(root, 'bun.lock has no root workspace entry');

  const locked: Record<string, string> = {
    ...(root.dependencies ?? {}),
    ...(root.devDependencies ?? {}),
    ...(root.optionalDependencies ?? {}),
    ...(root.peerDependencies ?? {})
  };

  const drift: string[] = [];
  for (const [name, range] of Object.entries(declared)) {
    const lockedRange = locked[name];
    if (lockedRange === undefined) {
      drift.push(`${name}: package.json "${range}", MISSING from bun.lock`);
    } else if (lockedRange !== range) {
      drift.push(`${name}: package.json "${range}", bun.lock "${lockedRange}"`);
    }
  }
  for (const name of Object.keys(locked)) {
    if (!(name in declared)) {
      drift.push(`${name}: in bun.lock but not in package.json`);
    }
  }

  assert.deepEqual(
    drift,
    [],
    `bun.lock is out of sync with package.json (${drift.length} package(s)):\n  ` +
      drift.join('\n  ') +
      '\n\nRegenerate it with `bun install`, or restore it from the commit that matched.'
  );
});

check('package-lock.json describes this project and the same declared ranges', () => {
  const lockPath = path.join(projectRoot, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    console.log('    (package-lock.json absent — skipped)');
    return;
  }
  const lock = readJson('package-lock.json');
  const root = lock?.packages?.[''];
  assert.ok(root, 'package-lock.json has no root package entry');

  const locked: Record<string, string> = {
    ...(root.dependencies ?? {}),
    ...(root.devDependencies ?? {})
  };

  const drift: string[] = [];
  for (const [name, range] of Object.entries(declared)) {
    const lockedRange = locked[name];
    if (lockedRange === undefined) {
      drift.push(`${name}: package.json "${range}", MISSING from package-lock.json`);
    } else if (lockedRange !== range) {
      drift.push(`${name}: package.json "${range}", package-lock.json "${lockedRange}"`);
    }
  }

  assert.deepEqual(
    drift,
    [],
    `package-lock.json is out of sync with package.json (${drift.length} package(s)):\n  ` +
      drift.join('\n  ') +
      '\n\nRegenerate it with `npm install`.'
  );
});

check('composer.json carries no PDF renderer; composer.lock matches it', () => {
  const composerJson = path.join(projectRoot, 'composer.json');
  if (!fs.existsSync(composerJson)) {
    console.log('    (composer.json absent — skipped)');
    return;
  }
  const manifest = readJson('composer.json');
  const required = Object.keys(manifest.require ?? {});
  assert.ok(!required.includes('mpdf/mpdf'),
    'mpdf/mpdf must stay out of composer.json: PDFs are rendered in the browser');
  assert.ok(required.includes('smalot/pdfparser'), 'the AI report importer still parses uploaded PDFs');

  // A lockfile that still pins the deleted renderer would install it again.
  const lockPath = path.join(projectRoot, 'composer.lock');
  if (!fs.existsSync(lockPath)) {
    console.log('    (composer.lock absent — nothing to compare)');
    return;
  }
  const lock = readJson('composer.lock');
  const names = (lock.packages ?? []).map((p: any) => p.name);
  assert.ok(!names.includes('mpdf/mpdf'), 'composer.lock must not pin the removed mpdf/mpdf');
  for (const name of required.filter((r: string) => r !== 'php')) {
    assert.ok(names.includes(name), `composer.lock does not pin ${name}`);
  }
});

console.log(`\nLockfile agreement passed (${passed} checks).`);
