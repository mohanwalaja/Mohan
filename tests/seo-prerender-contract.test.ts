/**
 * ASTRO SIVAM — SEO prerender contract (SEO audit 2026-10-14, findings 1-3).
 *
 * WHY THIS EXISTS: the three critical findings all survived review because
 * nothing pinned the SHAPE of what ships to crawlers:
 *   1. every URL served the identical empty `<div id="root"></div>` shell;
 *   2. every URL shipped the homepage canonical/title/description;
 *   3. the sitemap advertised ?lang=ta / ?lang=hi alternates that served the
 *      same English shell.
 *
 * This test pins the fix from both sides:
 *   SOURCE side (always runs): the build is wired through scripts/prerender.mjs,
 *   the sitemap is the exact output of its route table and carries no hreflang,
 *   .htaccess serves the prerendered flat files, main.tsx removes the baked
 *   head tags on SPA boot, and every page's <SEO> block declares a
 *   self-referencing canonical (and noindex where required).
 *   BUILT side (runs when dist/ exists): every route document exists as a
 *   FLAT file (the cPanel root folder list is frozen), each with a unique
 *   <title>, one self-referencing canonical, real body text, no leftover
 *   /src/ dev URLs, and .br/.gz siblings that decompress to the exact bytes
 *   of the file they accompany.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    throw new Error(`check("${name}") must be synchronous`);
  }
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- SEO PRERENDER CONTRACT (empty shell / homepage canonical / dead hreflang) ---');

// ---------------------------------------------------------------------------
// Load the prerender route table (single source of truth for documents,
// canonicals and the sitemap).
// ---------------------------------------------------------------------------
const prerender = await import(
  new URL('../scripts/prerender.mjs', import.meta.url).href
) as {
  ORIGIN: string;
  ROUTES: Array<{
    path: string;
    file: string;
    module: string;
    component: string;
    noindex?: boolean;
  }>;
  renderSitemap: () => string;
  sitemapLocs: () => string[];
};

const { ROUTES, ORIGIN, renderSitemap } = prerender;

check('prerender.mjs exports a route table covering every public route', () => {
  assert.ok(ROUTES.length >= 16, `expected >= 16 prerender routes, got ${ROUTES.length}`);
  const paths = ROUTES.map((r) => r.path);
  for (const required of [
    '/',
    '/services',
    '/birth-jathagam',
    '/marriage-compatibility',
    '/baby-naming',
    '/muhurtham',
    '/how-it-works',
    '/about',
    '/team',
    '/contact',
    '/privacy-policy',
    '/terms',
    '/payment-policy',
    '/refund-policy',
  ]) {
    assert.ok(paths.includes(required), `route table is missing ${required}`);
  }
  assert.ok(new Set(paths).size === paths.length, 'duplicate paths in route table');
  // FLAT FILES ONLY: one directory per route would break the frozen cPanel
  // root folder list (create_dist_zip.py EXPECTED_DIST_TOP_DIRS).
  for (const route of ROUTES) {
    assert.ok(
      !route.file.includes('/') && route.file.endsWith('.html'),
      `${route.path} must prerender to a flat <route>.html file, got ${route.file}`,
    );
    assert.ok(
      route.path !== '/' ? route.file === `${route.path.slice(1)}.html` : route.file === 'index.html',
      `${route.path} should map to ${route.path === '/' ? 'index.html' : route.path.slice(1) + '.html'}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Finding 3 — hreflang is gone until languages are server-rendered.
// ---------------------------------------------------------------------------

check('public/sitemap.xml is exactly renderSitemap() output (no drift)', () => {
  assert.equal(read('public/sitemap.xml'), renderSitemap());
});

check('sitemap advertises NO hreflang and NO ?lang= language alternates', () => {
  const sitemap = read('public/sitemap.xml');
  assert.doesNotMatch(sitemap, /hreflang/i, 'hreflang must stay out of the sitemap until languages are server-rendered');
  assert.doesNotMatch(sitemap, /\?lang=/, '?lang= URLs serve the same English shell and must not be advertised');
  assert.doesNotMatch(sitemap, /xhtml:link/i, 'xhtml:link alternates exist only to carry hreflang');
});

check('index.html template declares no hreflang / og:locale alternates', () => {
  // Comments may explain WHY the alternates are absent — only real tags count.
  const stripComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '');
  const html = stripComments(read('index.html'));
  assert.doesNotMatch(html, /hreflang/i, 'hreflang must stay out of the shipped tags until languages are server-rendered');
  assert.doesNotMatch(html, /og:locale:alternate/i, 'og:locale:alternate claimed Tamil/Hindi variants that do not exist');
  assert.doesNotMatch(stripComments(read('public/404.html')), /hreflang/i);
});

check('no shipped page source hardcodes hreflang-style language alternates', () => {
  const offenders: string[] = [];
  const stripComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '');
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(projectRoot, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        walk(rel);
      } else if (/\.(ts|tsx|html|xml)$/.test(entry.name)) {
        if (/hreflang/i.test(stripComments(read(rel)))) offenders.push(rel);
      }
    }
  };
  walk('src');
  walk('public');
  if (/hreflang/i.test(stripComments(read('index.html')))) offenders.push('index.html');
  assert.deepEqual(offenders, [], `hreflang must not reappear in shipped sources: ${offenders.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Build wiring (finding 1 — the prerender must actually run).
// ---------------------------------------------------------------------------

check('npm run build runs vite build --manifest AND scripts/prerender.mjs, in that order', () => {
  const pkg = JSON.parse(read('package.json'));
  const build: string = pkg.scripts.build;
  assert.match(build, /vite build --manifest/, 'the build must emit dist/.vite/manifest.json for asset URL mapping');
  assert.match(build, /node scripts\/prerender\.mjs/, 'the build must prerender per-route documents');
  const vitePos = build.indexOf('vite build');
  const prePos = build.indexOf('scripts/prerender.mjs');
  assert.ok(vitePos < prePos, 'prerender must run AFTER vite build');
});

// ---------------------------------------------------------------------------
// Finding 2 — self-referencing canonicals come from the pages themselves.
// ---------------------------------------------------------------------------

const pageSource: Record<string, string> = {};
for (const route of ROUTES) {
  const rel = route.module.replace(/^\//, '');
  if (!pageSource[rel]) pageSource[rel] = read(rel);
}

check('every indexable page passes an explicit self-referencing canonical to <SEO>', () => {
  for (const route of ROUTES) {
    if (route.noindex) continue;
    const source = pageSource[route.module.replace(/^\//, '')];
    const expected = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
    // Pages carry the canonical either inline (canonical="…") or in a metadata
    // table (canonical: '…') — require the exact self URL to appear.
    const present =
      source.includes(`canonical="${expected}"`) ||
      source.includes(`canonical: '${expected}'`) ||
      source.includes(`canonical: "${expected}"`) ||
      source.includes(`canonical='${expected}'`);
    assert.ok(present, `${route.module} must set canonical="${expected}" (self-referencing)`);
  }
});

check('utility routes carry noindex (login/register/dashboard/admin)', () => {
  for (const route of ROUTES) {
    if (!route.noindex) continue;
    const source = pageSource[route.module.replace(/^\//, '')];
    assert.match(source, /noindex/, `${route.module} must set the SEO noindex flag`);
  }
});

check('SEO.tsx derives a self-canonical from the location instead of defaulting to the homepage', () => {
  const seo = read('src/components/common/SEO.tsx');
  assert.match(seo, /function defaultCanonical/, 'missing canonicals must not collapse to the homepage');
  assert.match(seo, /window\.location\.pathname/);
  assert.doesNotMatch(
    seo,
    /canonical = 'https:\/\/astrosivam\.com\/'/,
    'the hardcoded homepage canonical default (audit finding 2) must not return',
  );
});

// ---------------------------------------------------------------------------
// Serving + SPA boot integration.
// ---------------------------------------------------------------------------

check('.htaccess internally rewrites clean URLs to the prerendered flat files', () => {
  const ht = read('public/.htaccess');
  assert.match(
    ht,
    /RewriteCond %\{DOCUMENT_ROOT\}\/\$1\.html -f/,
    'the prerendered-file rule must guard on the file existing',
  );
  assert.match(
    ht,
    /RewriteRule \^\(services\|birth-jathagam\|[^\n]*\)\s*\/\?\$ \/\$1\.html \[L\]/,
    'clean URLs must resolve to their <route>.html document',
  );
  // The old unconditional shell rewrites must be gone for prerendered routes.
  assert.doesNotMatch(
    ht,
    /RewriteRule \^services\$ \/index\.html/,
    '/services must never fall back to the empty shell while services.html exists',
  );
  // Physical .html URLs must 301 to the clean path (one canonical URL per page),
  // tested via THE_REQUEST so the internal rewrite cannot loop.
  assert.match(ht, /RewriteCond %\{THE_REQUEST\}/, '.html -> clean-URL redirects must key off THE_REQUEST');
  assert.match(ht, /R=301/);
});

check('main.tsx removes the baked [data-prerender-seo] head tags when the SPA boots', () => {
  const main = read('src/main.tsx');
  assert.match(main, /data-prerender-seo/);
  assert.match(main, /remove\(\)/, 'stale baked tags would survive SPA navigation without the cleanup');
});

// ---------------------------------------------------------------------------
// Built-output guarantees (run when dist/ exists — after `npm run build`).
// ---------------------------------------------------------------------------

const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to verify the built documents.');
  console.log(`\nSEO prerender contract passed (${passed} checks).`);
  process.exit(0);
}

check('dist/ top-level folders are still exactly the approved three (flat files only)', () => {
  const top = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(top, ['assets', 'audio', 'video-scenes'], `dist/ top-level folders changed: ${top.join(', ')}`);
  assert.ok(!fs.existsSync(path.join(distDir, '.vite')), 'dist/.vite (build manifest) must be deleted after prerendering');
});

check('every route shipped its flat document with unique title + self-canonical', () => {
  const titles = new Map<string, string>();
  for (const route of ROUTES) {
    const file = path.join(distDir, route.file);
    assert.ok(fs.existsSync(file), `missing prerendered document dist/${route.file} — did the build run prerender.mjs?`);
    const html = fs.readFileSync(file, 'utf8');
    // SVG chart fragments legitimately contain their own <title> children —
    // mask them before counting document-level head tags (prerender.mjs does
    // the same when it splits head from body).
    const unmasked = html.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => m.replace(/<title[\s\S]*?<\/title>/gi, ''));

    const titleMatches = unmasked.match(/<title[^>]*>([\s\S]*?)<\/title>/gi) ?? [];
    assert.equal(titleMatches.length, 1, `dist/${route.file} must contain exactly one <title>, found ${titleMatches.length}`);
    const titleText = titleMatches[0].replace(/^<title[^>]*>/i, '').replace(/<\/title>$/i, '');
    assert.ok(titleText.length > 10, `dist/${route.file} title is too short: ${JSON.stringify(titleText)}`);
    assert.ok(!titles.has(titleText), `duplicate title ${JSON.stringify(titleText)} on ${titles.get(titleText)} and ${route.file}`);
    titles.set(titleText, route.file);

    const canonicals = unmasked.match(/<link[^>]*rel="canonical"[^>]*>/gi) ?? [];
    assert.equal(canonicals.length, 1, `dist/${route.file} must contain exactly one canonical, found ${canonicals.length}`);
    const expected = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
    assert.ok(canonicals[0].includes(`href="${expected}"`), `dist/${route.file} canonical must be ${expected}`);

    const robots = unmasked.match(/<meta[^>]*name="robots"[^>]*>/gi) ?? [];
    assert.equal(robots.length, 1, `dist/${route.file} must contain exactly one robots meta`);
    if (route.noindex) {
      assert.match(robots[0], /noindex/, `dist/${route.file} must be noindex`);
    } else {
      assert.doesNotMatch(robots[0], /noindex/, `dist/${route.file} must be indexable`);
    }

    // Finding 1: crawlers must see real content without executing JavaScript.
    // Vite 6 emits the entry module script into <head>; the body tree is full
    // of nested </div>s — grab everything up to the LAST </div> before </body>
    // (i.e. the #root close).
    const bodyMatch = unmasked.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/);
    assert.ok(bodyMatch, `dist/${route.file} lost its #root body`);
    const text = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Indexable pages must carry real no-JS content; noindex utility gates
    // (admin, dashboard) only need a non-empty document.
    const minText = route.noindex ? 50 : 400;
    assert.ok(text.length >= minText, `dist/${route.file} body text is only ${text.length} chars — crawlers would see an empty page`);

    // Finding 2: no homepage og:/twitter bleed-through.
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /hreflang/i);
    assert.ok(
      html.includes(`property="og:url" content="${expected}"`) || !html.includes('property="og:url"'),
      `dist/${route.file} og:url must reference the page itself (${expected})`,
    );

    // Dev-style asset URLs would 404 in production.
    assert.doesNotMatch(html, /["'(]\/src\//, `dist/${route.file} still contains dev-style /src/ asset URLs`);
  }
});

check('prerendered documents carry fresh .br/.gz siblings matching their bytes', () => {
  const checked: string[] = [];
  for (const route of ROUTES) {
    const file = path.join(distDir, route.file);
    const raw = fs.readFileSync(file);
    for (const [ext, decode] of [
      ['.br', brotliDecompressSync],
      ['.gz', gunzipSync],
    ] as const) {
      const sibling = `${file}${ext}`;
      if (raw.length < 1024) {
        assert.ok(!fs.existsSync(sibling), `${route.file}${ext} exists but the file is below the compression threshold`);
        continue;
      }
      assert.ok(fs.existsSync(sibling), `missing pre-compressed sibling ${route.file}${ext}`);
      const decoded = decode(fs.readFileSync(sibling));
      assert.ok(decoded.equals(raw), `${route.file}${ext} does not decompress to ${route.file} — a stale sibling would override it`);
      checked.push(`${route.file}${ext}`);
    }
  }
  assert.ok(checked.length >= ROUTES.length, 'expected compressed siblings for every route');
});

check('dist/sitemap.xml matches renderSitemap() and lists exactly the shipped indexable documents', () => {
  const distSitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
  assert.equal(distSitemap, renderSitemap());
  assert.doesNotMatch(distSitemap, /hreflang/i);
  const locs = [...distSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, prerender.sitemapLocs());
  for (const route of ROUTES) {
    const inSitemap = locs.includes(route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`);
    assert.equal(inSitemap, !route.noindex, `${route.path} sitemap membership must match its noindex flag`);
  }
});

console.log(`\nSEO prerender contract passed (${passed} checks).`);
