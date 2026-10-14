import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8');

function check(name: string, fn: () => void) {
  fn();
  console.log(`  [PASS] ${name}`);
}

console.log('--- SELF-HOSTED APP-SHELL FONT CONTRACT ---');

check('the initial document has no Google Fonts stylesheet or preconnect', () => {
  assert.doesNotMatch(indexHtml, /fonts\.(?:googleapis|gstatic)\.com/i);
});

check('the app shell declares only the two used variable font families', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.equal(faces.length, 8, 'expected Latin + Latin-ext, upright + italic for two families');
  assert.ok(faces.every(face => /font-display:\s*swap/.test(face)), 'every local face must avoid invisible text');
  assert.ok(faces.every(face => /unicode-range:/.test(face)), 'every face must be subset-scoped');
  assert.ok(faces.every(face => /font-weight:\s*(?:200\s+800|400\s+900)/.test(face)), 'faces should use variable weight ranges');
  assert.ok(faces.every(face => !/Cinzel/.test(face)), 'unused Cinzel must not return to the critical app shell');
});

check('preloads are same-origin and limited to the body + home-hero faces', () => {
  const preloads = [...indexHtml.matchAll(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")([^>]+)>/g)]
    .map(match => match[1]);
  assert.equal(preloads.length, 3, 'avoid preloading optional or unused font faces');
  const hrefs = preloads.map(attributes => {
    assert.match(attributes, /\bcrossorigin\b/, 'font preloads need anonymous CORS mode for cache reuse');
    assert.match(attributes, /\btype="font\/woff2"/, 'preload only WOFF2 assets');
    const href = /\bhref="([^"]+)"/.exec(attributes)?.[1];
    assert.ok(href?.startsWith('/'), `font preload must be same-origin: ${href}`);
    return href!;
  });
  assert.deepEqual(hrefs, [
    '/assets/fonts/plus-jakarta-sans-latin-wght-normal-153fc85b.woff2',
    '/assets/fonts/playfair-display-latin-wght-normal-e0c764a8.woff2',
    '/assets/fonts/playfair-display-latin-wght-italic-54af24bd.woff2',
  ]);
});

check('font URLs resolve to fingerprinted, valid WOFF2 files with license notices', () => {
  const srcs = [...css.matchAll(/src:\s*url\(['"]?([^'")]+)['"]?\)\s*format\(['"]woff2['"]\)/g)]
    .map(match => match[1]);
  assert.equal(srcs.length, 8);
  const paths = new Set<string>();
  for (const src of srcs) {
    assert.match(src, /^\/assets\/fonts\/[a-z0-9-]+-[a-f0-9]{8}\.woff2$/i, `font should have a content-hashed path: ${src}`);
    assert.ok(!paths.has(src), `duplicate face source ${src}`);
    paths.add(src);
    const bytes = fs.readFileSync(path.join(projectRoot, 'public', src.slice(1)));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2', `${src} is not a WOFF2 file`);
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    assert.ok(src.endsWith(`-${digest}.woff2`), `${src} does not match its content hash ${digest}`);
  }

  for (const license of ['font-license-plus-jakarta-sans.txt', 'font-license-playfair-display.txt']) {
    const text = fs.readFileSync(path.join(projectRoot, 'public', 'assets', 'fonts', license), 'utf8');
    assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});

check('preloaded WOFF2 payload stays within the critical-font byte budget', () => {
  const hrefs = [...indexHtml.matchAll(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")([^>]+)>/g)]
    .map(match => /\bhref="\/([^"]+)"/.exec(match[1])?.[1])
    .filter((name): name is string => Boolean(name));
  const bytes = hrefs.reduce((sum, name) => sum + fs.statSync(path.join(projectRoot, 'public', name)).size, 0);
  assert.ok(bytes <= 110_000, `critical font preloads total ${bytes} bytes (budget: 110,000)`);
});

console.log('\nSelf-hosted app-shell font contract passed (5 checks).');
