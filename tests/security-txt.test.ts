/**
 * ASTRO SIVAM — /.well-known/security.txt (RFC 9116).
 *
 * A security researcher (or an automated scanner) looking for a contact must
 * find one at the standardised path, with the fields the RFC makes mandatory:
 * at least one Contact, and an Expires date in the future so a stale file can
 * never promise a mailbox nobody reads.
 *
 * Pinned here:
 *   1. the file lives at public/.well-known/security.txt, so Vite copies it to
 *      dist/.well-known/security.txt and cPanel serves it at the RFC path;
 *   2. Contact (mailto + web form), Expires, Preferred-Languages and Canonical
 *      are present, and Expires is still in the FUTURE when the suite runs —
 *      renewing it is a one-line change, and a failing check says exactly that;
 *   3. the live server answers with text/plain (the RFC's required media type)
 *      and serves the real file instead of rewriting it into the SPA shell;
 *   4. the deploy zip actually ships the folder — the packer skips dot-dirs by
 *      default, so .well-known is whitelisted there and in its shape contract.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const TXT = 'public/.well-known/security.txt';

console.log('--- SECURITY.TXT (RFC 9116) ---');

check('the file sits at the RFC path inside public/, so the build ships it', () => {
  assert.ok(fs.existsSync(path.join(root, TXT)), `${TXT} must exist`);
  const txt = read(TXT);
  assert.match(txt, /^Contact: mailto:admin@astrosivam\.com$/m, 'a mailbox a researcher can write to');
  assert.match(txt, /^Contact: https:\/\/astrosivam\.com\/contact$/m, 'and a web form as the second channel');
  assert.match(txt, /^Preferred-Languages: en$/m);
  assert.match(txt, /^Canonical: https:\/\/astrosivam\.com\/\.well-known\/security\.txt$/m);
});

check('Expires is a valid RFC 3339 date still in the future', () => {
  const txt = read(TXT);
  const match = /^Expires: (\S+)$/m.exec(txt);
  assert.ok(match, 'RFC 9116 requires an Expires field');
  const expires = Date.parse(match![1]);
  assert.ok(!Number.isNaN(expires), `Expires must parse as ISO 8601, got "${match![1]}"`);
  assert.ok(
    expires > Date.now(),
    'security.txt has EXPIRED — renew the Expires field (RFC 9116 forbids a past date; one-line change in public/.well-known/security.txt)'
  );
  // A file valid for over two years is probably a typo, not a policy.
  assert.ok(expires < Date.now() + 2 * 366 * 24 * 3600 * 1000, 'Expires should be about a year out, not decades');
});

check('the live server serves it as text/plain, unrewritten', () => {
  const htaccess = read('public/.htaccess');
  assert.match(htaccess, /AddType text\/plain \.txt/, 'RFC 9116 requires the text/plain media type');
  assert.match(htaccess, /RewriteCond %\{REQUEST_FILENAME\} -f\s*\n\s*RewriteRule \^ - \[L\]/,
    'existing files are served directly, so the SPA fallback never swallows the path');
  const deny = /<FilesMatch "([^"]+)">/.exec(htaccess);
  assert.ok(deny && !/\btxt\b/.test(deny[1]), 'the sensitive-file deny list must not cover .txt');
});

check('the deploy zip whitelists .well-known and its shape contract knows it', () => {
  const packer = read('scripts/create_dist_zip.py');
  assert.match(packer, /d == '\.well-known' or not d\.startswith\('\.'\)/,
    'the packer walks .well-known/ instead of skipping every dot-dir');
  assert.match(packer, /EXPECTED_ZIP_TOP_DIRS = \{'\.well-known',/,
    'and the deploy-shape contract lists it, so a silent drop fails the build');
});

const distTxt = path.join(root, 'dist/.well-known/security.txt');
if (!fs.existsSync(path.join(root, 'dist'))) {
  console.log('  [SKIP] dist/ not built — run `npm run build` (or `npm run build:zip`) to verify the shipped file.');
} else {
  check('the built site carries the file at the RFC path', () => {
    assert.ok(fs.existsSync(distTxt), 'dist/.well-known/security.txt must exist after a build');
    assert.equal(fs.readFileSync(distTxt, 'utf8'), read(TXT), 'shipped byte-for-byte');
  });
}

console.log(`\nSecurity.txt contract passed (${passed} checks).`);
