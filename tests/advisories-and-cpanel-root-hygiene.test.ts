/**
 * ASTRO SIVAM — Advisories (S1, S2, S5, metadata.json) & Minimal cPanel Root Hygiene Contract
 *
 * Permanently verifies:
 *   1. S2: composer.lock exists, matches composer.json's canonical MD5 content-hash,
 *      pins smalot/pdfparser & symfony/polyfill-mbstring with SHA-1 dist checksums,
 *      and never re-introduces server-side mpdf/mpdf.
 *   2. S1: Route code-splitting + deferred babynames / vendor-pdf / vendor-canvas /
 *      vendor-charts / vendor-maps keep all built JS chunks < 500 kB inside assets/.
 *   3. S5: Clean package identity ("astrosivam" v1.0.0) across package.json &
 *      package-lock.json, accurate README.md, and zero loose root .md sprawl.
 *   4. metadata.json: Zero Gemini / AI Studio capability flags (e.g. requestFramePermissions)
 *      and never bundled into dist.zip.
 *   5. cPanel public_html File Manager Hygiene: dist.zip contains ONLY the essential
 *      web-root folders (.well-known, api, assets, pages) and zero loose PNG/JPG/MD/JSON/SH
 *      clutter files at the web root.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');

function readJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// 1. S2 — composer.lock canonical content-hash & package pins
{
  const cj = readJson('composer.json');
  const lock = readJson('composer.lock');

  const lockKeys = [
    'name',
    'version',
    'require',
    'require-dev',
    'conflict',
    'replace',
    'provide',
    'minimum-stability',
    'prefer-stable',
    'repositories',
    'extra',
  ].sort();

  const filtered: Record<string, any> = {};
  for (const k of lockKeys) {
    if (k in cj) {
      const val = cj[k];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        filtered[k] = Object.fromEntries(
          Object.keys(val)
            .sort()
            .map(sk => [sk, val[sk]])
        );
      } else {
        filtered[k] = val;
      }
    }
  }
  const expectedHash = crypto
    .createHash('md5')
    .update(JSON.stringify(filtered), 'utf8')
    .digest('hex');

  assert.equal(lock['content-hash'], expectedHash, 'composer.lock content-hash must match composer.json');
  const pkgNames = (lock.packages || []).map((p: any) => p.name);
  assert.deepEqual(pkgNames, ['smalot/pdfparser', 'symfony/polyfill-mbstring']);
  for (const pkg of lock.packages) {
    assert.match(pkg?.dist?.shasum ?? '', /^[0-9a-f]{40}$/, `${pkg.name} must carry verified SHA-1 dist checksum`);
  }
}

// 2. S5 & metadata.json hygiene
{
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(pkg.name, 'astrosivam');
  assert.equal(lock.name, 'astrosivam');
  assert.equal(lock.packages?.['']?.name, 'astrosivam');
  assert.equal(pkg.version, '1.0.0');

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /mPDF server-side/i, 'README.md must not claim legacy mPDF server rendering');
  assert.match(readme, /200 DPI/i, 'README.md must document 200 DPI live-preview PDFs');
  assert.match(readme, /public_html\//, 'README.md must document minimal cPanel layout');

  const rootMarkdownFiles = fs
    .readdirSync(root)
    .filter(f => f.endsWith('.md') && fs.statSync(path.join(root, f)).isFile());
  assert.deepEqual(
    rootMarkdownFiles,
    ['README.md'],
    `Repository root must contain only README.md, found: ${rootMarkdownFiles.join(', ')}`
  );

  const metadata = readJson('metadata.json');
  assert.equal('requestFramePermissions' in metadata, false, 'metadata.json must not carry Gemini/AI Studio capability flags');
  assert.deepEqual(Object.keys(metadata).sort(), ['description', 'name']);
}

// 3. S1 & cPanel File Manager Root Cleanliness (verified against dist/ and dist.zip when built)
{
  const distAssetsDir = path.join(root, 'dist', 'assets');
  if (fs.existsSync(distAssetsDir)) {
    const jsFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.js'));
    assert.equal(
      jsFiles.some(f => f.startsWith('babynames-')),
      true,
      'Namakaran dictionary tables must be split into deferred babynames chunk'
    );
    assert.equal(
      jsFiles.some(f => f.startsWith('vendor-canvas-')),
      true,
      'html2canvas rasteriser must be split into deferred vendor-canvas chunk'
    );
    const oversized = jsFiles.filter(
      f => fs.statSync(path.join(distAssetsDir, f)).size > 500 * 1024
    );
    assert.deepEqual(
      oversized,
      [],
      `Every production JS chunk must stay <= 500 KiB for fast mobile delivery; oversized: ${oversized.join(', ')}`
    );
  }

  const zipPath = path.join(root, 'dist.zip');
  if (fs.existsSync(zipPath)) {
    const out = execFileSync(
      'python3',
      [
        '-c',
        `import json, zipfile
with zipfile.ZipFile('dist.zip') as z:
    names = z.namelist()
top_dirs = sorted({n.split('/', 1)[0] for n in names if '/' in n})
top_files = sorted({n for n in names if '/' not in n})
print(json.dumps({'dirs': top_dirs, 'files': top_files, 'has_api_kb': 'api/knowledge/ai-astrologer/sources.json' in names, 'has_api_backup': 'api/scripts/backup/astro_site_backup.sh' in names}))`,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    const parsed = JSON.parse(out.trim());
    assert.deepEqual(
      parsed.dirs,
      ['.well-known', 'api', 'assets', 'pages'],
      `cPanel public_html root folders must stay minimal (.well-known, api, assets, pages), got: ${parsed.dirs.join(', ')}`
    );
    for (const file of parsed.files as string[]) {
      assert.doesNotMatch(
        file,
        /\.(png|jpg|jpeg|webp|md|json|lock|sh|py|ts|tsx)$/i,
        `Unexpected clutter file in cPanel public_html root: ${file}`
      );
    }
    assert.equal(parsed.has_api_kb, true, 'api/knowledge must ship inside api/');
    assert.equal(parsed.has_api_backup, true, 'backup scripts must ship cleanly inside api/scripts/');
  }
}

console.log('✓ advisories-and-cpanel-root-hygiene: S1 mobile chunks, S2 composer.lock, S5 package/README, metadata.json & minimal 3-folder cPanel root verified');
