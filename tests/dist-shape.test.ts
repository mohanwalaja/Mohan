/**
 * ASTRO SIVAM — deployment shape contract for the code-split build (audit S1).
 *
 * WHY THIS EXISTS: the site deploys as dist.zip extracted into cPanel's
 * public_html. Two regressions have caused real outages / operator pain there:
 *   1. A white screen: a lazy route chunk the browser requests but that is
 *      missing from the deployment (chunk 404 = blank page).
 *   2. Folder sprawl: build changes that sprout one directory per route or per
 *      asset class, until cPanel's file manager shows 20-30 folders at the
 *      site root. The owner requires the root to stay limited to the folders
 *      listed below — forever.
 * This test pins BOTH: the folder shape and the presence of every lazy route
 * chunk, plus the source-level build configuration that guarantees chunks can
 * only land inside the existing assets/ folder.
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

function read(relative: string): string {
  return fs.readFileSync(path.join(projectRoot, relative), 'utf8');
}

console.log('--- DIST SHAPE CONTRACT (code splitting must not change the deploy root) ---');

// ---------------------------------------------------------------------------
// 1. Source-level guarantees (always run — do not need a build).
// ---------------------------------------------------------------------------

check('vite config emits chunks into the default assets/ folder only', () => {
  const vite = read('vite.config.ts');
  // Custom file-name patterns could nest chunks into new top-level folders;
  // the contract is the Vite default: assetsDir "assets", hashed file names
  // with NO directory components.
  const forbidden = ['output.assetFileNames', 'output.chunkFileNames', 'output.entryFileNames'];
  for (const pattern of forbidden) {
    assert.ok(!vite.includes(pattern), `vite.config.ts must not set ${pattern} (it could create new folders)`);
  }
  const assetsDir = vite.match(/assetsDir\s*:\s*['"]([^'"]+)['"]/);
  assert.ok(!assetsDir || assetsDir[1] === 'assets', "assetsDir must stay 'assets'");
});

check('App.tsx lazy-loads exactly the six heavy routes and keeps home eager', () => {
  const app = read('src/App.tsx');
  for (const page of [
    'AdminPortal',
    'CustomerDashboard',
    'BirthJathagamPage',
    'MarriageCompatibilityPage',
    'BabyNamingPage',
    'MuhurthamPage',
  ]) {
    assert.match(app, new RegExp(`const ${page} = lazy\\(`), `${page} must be lazy-loaded`);
  }
  // HomePage must stay in the main bundle (white-screen safety: if every
  // chunk fetch fails, the site must still render).
  assert.match(app, /import \{ HomePage \} from '\.\/pages\/HomePage';/, 'HomePage must stay eager in the main bundle');
  assert.doesNotMatch(app, /const HomePage = lazy\(/, 'HomePage must not be lazy-loaded');
  // Every lazy route must sit behind Suspense (a lazy render without a
  // fallback is the classic blank tree).
  assert.match(app, /<Suspense fallback=\{<RouteFallback \/>\}>/, 'lazy routes must be wrapped in <Suspense> with a fallback');
});

check('the zip packer asserts the cPanel root folder list', () => {
  const zipBuilder = read('scripts/create_dist_zip.py');
  assert.ok(
    zipBuilder.includes('EXPECTED_DIST_TOP_DIRS') && zipBuilder.includes('EXPECTED_ZIP_TOP_DIRS'),
    'create_dist_zip.py must assert both the dist/ and dist.zip top-level folder lists',
  );
});

// ---------------------------------------------------------------------------
// 2. Built-output guarantees (run when dist/ exists — after `npm run build`).
// ---------------------------------------------------------------------------

const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.log('  [SKIP] dist/ not built — run `npm run build` (or `npm run build:zip`) to verify the built shape.');
  console.log(`\nDist shape contract passed (${passed} checks).`);
  process.exit(0);
}

check('dist/ has exactly the three approved top-level folders', () => {
  const top = fs.readdirSync(distDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(top, ['assets', 'audio', 'video-scenes'], `dist/ top-level folders changed: ${top.join(', ')}`);
});

check('dist/ ships no source maps or server bundles', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.map') || entry.name.endsWith('.cjs')) offenders.push(p);
    }
  };
  walk(distDir);
  assert.deepEqual(offenders, [], `unexpected deploy files: ${offenders.join(', ')}`);
});

check('index.html references only files that exist', () => {
  const html = read('dist/index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'index.html should reference the built bundles');
  for (const ref of refs) {
    const rel = ref.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(distDir, rel)), `index.html references missing file: ${ref}`);
  }
});

check('every lazy route chunk exists inside dist/assets (no chunk 404 = no white screen)', () => {
  const assetsDir = path.join(distDir, 'assets');
  const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  for (const page of [
    'AdminPortal',
    'CustomerDashboard',
    'BirthJathagamPage',
    'MarriageCompatibilityPage',
    'BabyNamingPage',
    'MuhurthamPage',
  ]) {
    const found = files.some((f) => f.startsWith(`${page}-`) || f.startsWith(`${page}.`));
    assert.ok(found, `no chunk emitted for lazy route ${page} (looked for assets/${page}-*.js)`);
  }
});

console.log(`\nDist shape contract passed (${passed} checks).`);
