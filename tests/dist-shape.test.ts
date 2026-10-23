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
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
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

check('App.tsx lazy-loads every non-home route and keeps home eager', () => {
  const app = read('src/App.tsx');
  for (const page of [
    // The six heavy routes (report builders / admin / dashboard) …
    'AdminPortal',
    'CustomerDashboard',
    'BirthJathagamPage',
    'MarriageCompatibilityPage',
    'BabyNamingPage',
    'MuhurthamPage',
    // … plus every other page: the homepage only needs the shell (PERF-1).
    'ServicesPage',
    'HowItWorksPage',
    'AboutPage',
    'AstrologyTeamPage',
    'ContactPage',
    'PoliciesPage',
    'LoginPage',
    'RegisterPage',
    'NotFoundPage',
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

check('the pre-compress plugin compresses final bytes in writeBundle, never in generateBundle', () => {
  // The 2026-10-13 astrosivam.com outage: compressing inside generateBundle ran
  // before vite:build-import-analysis replaced the `__VITE_PRELOAD__` dynamic
  // import placeholder, so the .br/.gz siblings shipped a free `__VITE_PRELOAD__`
  // identifier. Production .htaccess negotiates every .js request to those
  // siblings → ReferenceError on every lazy route, while
  // `grep __VITE_PRELOAD__ dist/assets/*.js` on the clean raw files found nothing.
  const compress = read('vite-plugin-compress.ts');
  assert.match(
    compress,
    /writeBundle\s*\(/,
    'compression must run in writeBundle (after every generateBundle hook has run and Rollup wrote the final files)',
  );
  assert.doesNotMatch(
    compress,
    /\bgenerateBundle\s*\(/,
    'compressing inside generateBundle re-opens the __VITE_PRELOAD__ leak into the .br/.gz siblings',
  );
  assert.match(
    compress,
    /readFileSync/,
    'the compression input must be the bytes on disk, not in-memory chunk objects another plugin may still mutate',
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

check('dist/ has only the minimal approved top-level folders (assets, pages)', () => {
  // Vite 6+ creates a .vite/ cache directory inside dist/ — filter it out
  // since it is a build artifact, not a deployment folder.
  const top = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name).sort();
  assert.deepEqual(top, ['assets', 'pages'], `dist/ top-level folders changed: ${top.join(', ')}`);
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
  const lazyRoutes = [
    'AdminPortal',
    'CustomerDashboard',
    'BirthJathagamPage',
    'MarriageCompatibilityPage',
    'BabyNamingPage',
    'MuhurthamPage',
    'ServicesPage',
    'HowItWorksPage',
    'AboutPage',
    'AstrologyTeamPage',
    'ContactPage',
    'PoliciesPage',
    'LoginPage',
    'RegisterPage',
    'NotFoundPage',
    // Deferred features that are not routes: a chunk that 404s is just as
    // fatal for the visitor who clicked the sample/map button.
    'LeafletMapPickerModal',
  ];
  for (const page of lazyRoutes) {
    const found = files.some((f) => f.startsWith(`${page}-`) || f.startsWith(`${page}.`));
    assert.ok(found, `no chunk emitted for lazy route ${page} (looked for assets/${page}-*.js)`);
  }
});

check('no shipped JS contains a free __VITE_PRELOAD__ identifier (raw files AND .br/.gz siblings)', () => {
  // Regression gate for the 2026-10-13 production outage. The identifier never
  // exists in the raw .js files — it is frozen into the pre-compressed
  // siblings, which is exactly what cPanel's .htaccess serves. grep(1) over
  // dist/ cannot see it (brotli/gzip are binary), so decompress every sibling
  // and scan that too.
  const offenders: string[] = [];
  const scan = (label: string, text: string) => {
    if (text.includes('__VITE_PRELOAD__')) offenders.push(label);
  };
  const TEXTY = /\.(js|mjs|cjs|css|html|json|svg|txt|xml|webmanifest)$/;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      try {
        if (entry.name.endsWith('.br')) {
          scan(`${p} (decompressed .br)`, brotliDecompressSync(fs.readFileSync(p)).toString('utf8'));
        } else if (entry.name.endsWith('.gz')) {
          scan(`${p} (decompressed .gz)`, gunzipSync(fs.readFileSync(p)).toString('utf8'));
        } else if (TEXTY.test(entry.name)) {
          scan(p, fs.readFileSync(p, 'utf8'));
        }
      } catch (err) {
        offenders.push(`${p} (could not be scanned: ${String(err)})`);
      }
    }
  };
  walk(distDir);
  assert.deepEqual(
    offenders,
    [],
    `free __VITE_PRELOAD__ placeholder found in shipped output — the browser would throw ReferenceError on every lazy route (cPanel serves the .br/.gz siblings): ${offenders.join(', ')}`,
  );
});

console.log(`\nDist shape contract passed (${passed} checks).`);
