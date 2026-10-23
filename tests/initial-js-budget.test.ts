/**
 * ASTRO SIVAM — initial-JavaScript budget & deferred-feature boundaries.
 *
 * WHY THIS TEST EXISTS (audit PERF-1)
 * -----------------------------------
 * The production audit found ~2.1 MB of JavaScript in the first paint of the
 * homepage: the app shell, React, the PDF renderer (jspdf + html2canvas and
 * their transitive helpers) and Leaflet — for a visitor who may have only
 * wanted to read the services page. Three separate mechanisms caused it, and
 * each one is pinned here so it cannot come back:
 *
 *   1. `manualChunks` matched on the module PATH, so every transitive
 *      dependency of jspdf/recharts fell into `vendor-core` — the chunk the
 *      entry always imports. Fixing that is not visible in any behaviour test.
 *   2. The Vite preload helper is statically imported by every chunk that uses
 *      a dynamic import, including the entry. Rollup parked it inside
 *      `vendor-pdf`, which made the entire PDF chunk a static dependency of the
 *      homepage.
 *   3. `prefetchRouteChunksOnIdle()` warmed all six heavy routes on
 *      requestIdleCallback — i.e. on every page, for every visitor.
 *
 * The checks below are deliberately split: the SOURCE checks run everywhere,
 * and the BUILT-OUTPUT checks run whenever dist/ exists (i.e. after
 * `npm run build`, which is what CI and the preview smoke do).
 *
 * A NOTE ON THE BUDGET: the number is a ceiling, not a target. It is set
 * comfortably above today's bytes so that ordinary feature work does not trip
 * it, but far below the "defer a heavy library again" failure it exists to
 * catch. Raising it needs a deliberate edit here with a reason.
 *
 * After the cart layer, the AI panel and the remaining pages were deferred,
 * the homepage downloads the app entry + one vendor chunk and nothing else
 * (~370 kB raw / ~200 kB gzip). The ceiling was lowered from 1.1 MB to 460 kB
 * so that re-attaching ANY of the deferred chunks — the smallest of them,
 * vendor-astrology, is 127 kB — fails here instead of shipping.
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

const abs = (relative: string) => path.join(projectRoot, relative);
const read = (relative: string) => fs.readFileSync(abs(relative), 'utf8');
const exists = (relative: string) => fs.existsSync(abs(relative));

/**
 * Source with comments removed. Several contracts below are "this call must not
 * exist any more" assertions, and the files deliberately DOCUMENT the removed
 * mechanism — matching bare text would flag the explanation as the bug.
 */
function code(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

/** Bytes the browser has to download before the app can render its first page (React 19 + vendor-core + entry). */
const INITIAL_JS_BUDGET_BYTES = 650_000;

/** Code markers that only exist inside a heavy library's implementation. */
const PDF_CODE_MARKERS = ['jsPDF', 'html2canvas'];
const LEAFLET_CODE_MARKER = 'leaflet-container';

/**
 * Chunks a homepage visit must never download. Each one is a deferred feature:
 * the PDF renderer, the charts, the astronomy engine, Leaflet, the report
 * builders, the report pages, the cart layer and the AI panel.
 */
const DEFERRED_CHUNK_NAMES = [
  'vendor-pdf',
  'vendor-svg',
  'vendor-canvas',
  'vendor-maps',
  'vendor-astrology',
  'vendor-timezone',
  'astrology-core',
  'vendor-charts',
  'scanner',
  'babynames',
  'invoiceHtmlBuilder',
  'jathagamPdfExporter',
  'LivePdfPreviewModal',
  'sampleReports',
  'AdminPortal',
  'CustomerDashboard',
  'UnifiedCheckoutModal',
  'FamilyCartDrawer',
  'AiAstrologerLauncher',
  'AiAstrologerPanel',
  'LeafletMapPickerModal',
];

console.log('--- INITIAL JS BUDGET (deferred heavy features) ---');

// ---------------------------------------------------------------------------
// 1. Source contracts — no build required.
// ---------------------------------------------------------------------------

check('nothing warms every route chunk on idle any more', () => {
  const routeChunks = code('src/services/routeChunks.ts');
  const app = code('src/App.tsx');
  assert.doesNotMatch(
    routeChunks,
    /requestIdleCallback/,
    'routeChunks.ts must not warm chunks on an idle callback: idle fires for every visitor on every page',
  );
  assert.doesNotMatch(routeChunks, /prefetchRouteChunksOnIdle/);
  assert.doesNotMatch(
    app,
    /prefetchRouteChunksOnIdle/,
    'App.tsx must not call the removed idle prefetcher',
  );
});

check('route chunks are prefetched from visitor intent (hover/focus/touch), Save-Data aware', () => {
  const routeChunks = code('src/services/routeChunks.ts');
  const app = code('src/App.tsx');
  assert.match(routeChunks, /export function installRouteIntentPrefetch\(\): \(\) => void/);
  assert.match(routeChunks, /export function prefetchRouteOnIntent\(route: string\): void/);
  assert.match(app, /installRouteIntentPrefetch\(\)/, 'App.tsx must install the intent prefetcher');
  const intent = routeChunks.slice(routeChunks.indexOf('export function prefetchRouteOnIntent'));
  assert.match(
    intent.slice(0, 700),
    /shouldSkipPrefetch\(\)/,
    'intent prefetch must still respect Save-Data / slow connections',
  );
  // The trigger is declarative markup: a link that navigates to a route marks
  // itself with data-route, and the prefetcher listens for intent on it.
  assert.match(routeChunks, /\[data-route\]/);
  for (const evt of ['pointerenter', 'focusin', 'touchstart']) {
    assert.ok(routeChunks.includes(evt), `intent prefetch must handle ${evt}`);
  }
  // Internal links are real <a href> elements rendered by RouteLink (SEO audit
  // 2026-10-15), which stamps data-route on every one of them.
  assert.match(
    read('src/components/common/RouteLink.tsx'),
    /data-route=\{route\}/,
    'RouteLink must render data-route so hovering any internal link warms the target chunk',
  );
  assert.match(
    read('src/components/layout/Navbar.tsx'),
    /<RouteLink[^>]*?route=\{link\.route\}/,
    'the navbar links must be RouteLinks (data-route) so hovering them warms the target chunk',
  );
});

check('the links the visitor actually hovers carry data-route', () => {
  // Without the attribute the intent prefetcher has nothing to listen to, so
  // every page that links to a lazy route must mark its links — the footer and
  // the two pages that sell the report pages above all.
  // RouteLink renders the attribute, so a RouteLink to the route counts.
  const expectations: Array<[string, RegExp, string]> = [
    ['src/components/layout/Footer.tsx', /<RouteLink\s+route="birth-jathagam"/, 'footer service links'],
    ['src/pages/HomePage.tsx', /<RouteLink\s+route=\{service\.route\}/, 'the homepage service cards'],
    ['src/pages/ServicesPage.tsx', /<RouteLink\s+route=\{route\}/, 'the services page cards'],
  ];
  for (const [file, pattern, label] of expectations) {
    assert.match(read(file), pattern, `${label} must carry data-route so hovering them warms the target chunk`);
  }
});

check('every navigational data-route key maps to a prefetchable chunk', () => {
  // A data-route value with no loader is a silent no-op — the intent
  // prefetcher resolves the key in this registry and returns early otherwise.
  const routeChunks = read('src/services/routeChunks.ts');
  const start = routeChunks.indexOf('routeChunkImporters');
  const registry = routeChunks.slice(start, routeChunks.indexOf('\n};', start));
  const keys = new Set([...registry.matchAll(/^\s*'?([\w-]+)'?:\s*\(\s*\)\s*=>/gm)].map((m) => m[1]));
  assert.ok(keys.size >= 15, `the route registry looks truncated (${keys.size} keys)`);

  const declared = new Set<string>();
  for (const file of [
    'src/components/layout/Navbar.tsx',
    'src/components/layout/Footer.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/ServicesPage.tsx',
  ]) {
    // Literal keys on raw elements (data-route="x") and on RouteLinks (route="x").
    for (const match of read(file).matchAll(/\b(?:data-)?route="([\w-]+)"/g)) declared.add(match[1]);
  }
  // 'home' is the eager shell — it is meant to have no chunk.
  const dead = [...declared].filter((key) => key !== 'home' && !keys.has(key));
  assert.deepEqual(dead, [], `data-route keys with no chunk loader (hover would do nothing): ${dead.join(', ')}`);
  assert.ok(!keys.has('home'), 'the homepage must stay eager — it is the white-screen fallback');
});

check('the cart layer and the AI panel are fetched on first open, not on first paint', () => {
  const app = code('src/App.tsx');
  for (const component of ['FamilyCartDrawer', 'UnifiedCheckoutModal']) {
    assert.doesNotMatch(
      app,
      new RegExp('import \\{ ' + component + ' \\} from'),
      component + ' must not be statically imported by the app shell',
    );
    assert.match(
      app,
      new RegExp('const ' + component + ' = lazy\\('),
      component + ' must be a lazy chunk',
    );
    assert.ok(
      app.includes("import('./components/cart/" + component + "')"),
      component + ' must be fetched on first open',
    );
  }
  // The mount is gated on the cart state, so the fetch happens on the click.
  assert.match(app, /isCartOpen && \(/);
  assert.match(app, /isCheckoutOpen && \(/);

  // The AI astrologer is an entitlement: a normal visit has nothing to check,
  // so it downloads neither the launcher nor the chat API client. Only a
  // signed-in visitor (a possibly-entitled customer, or an admin) fetches it.
  assert.doesNotMatch(
    app,
    /import \{ AiAstrologerLauncher \} from/,
    'the launcher must not be statically imported by the app shell',
  );
  assert.match(app, /const AiAstrologerLauncher = lazy\(\(\) =>/);
  assert.match(
    app,
    /function DeferredAiAstrologer\(\) \{\s*const \{ user \} = useAuth\(\);\s*if \(!user\?\.id\) return null;/,
    'the launcher must stay unmounted (and unfetched) for signed-out visitors',
  );
  assert.match(app, /<DeferredAiAstrologer \/>/);

  const launcher = code('src/components/ai-astrologer/AiAstrologerLauncher.tsx');
  assert.doesNotMatch(
    launcher,
    /import AiAstrologerPanel from '\.\/AiAstrologerPanel'/,
    'the launcher must not drag the panel into its own chunk',
  );
  assert.match(
    launcher,
    /lazy\(\(\) =>\s*safeImport\(\(\) => import\('\.\/AiAstrologerPanel'\)\)/,
    'the panel must be fetched through a dynamic import',
  );
});

check('Leaflet is imported only by the on-demand map modal', () => {
  const picker = code('src/components/common/GooglePlacesPicker.tsx');
  assert.doesNotMatch(
    picker,
    /from 'leaflet'/,
    "GooglePlacesPicker must not import Leaflet: it renders inside the app shell on every page",
  );
  assert.match(
    picker,
    /lazy\(\(\) =>\s*import\('\.\/LeafletMapPickerModal'\)/,
    'GooglePlacesPicker must load the map modal as a lazy chunk',
  );
  assert.match(
    read('src/components/common/LeafletMapPickerModal.tsx'),
    /from 'leaflet'/,
    'the map modal is the module that owns the Leaflet import',
  );
  // ...and nothing else may import Leaflet directly.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const relative = path.relative(projectRoot, full);
      if (relative === 'src/components/common/LeafletMapPickerModal.tsx') continue;
      if (/from 'leaflet/.test(fs.readFileSync(full, 'utf8'))) offenders.push(relative);
    }
  };
  walk(abs('src'));
  assert.deepEqual(offenders, [], `Leaflet must only be reachable from the map modal: ${offenders.join(', ')}`);
});

check("Leaflet's stylesheet is not part of the global stylesheet", () => {
  const indexCss = code('src/index.css');
  assert.doesNotMatch(
    indexCss,
    /@import\s+["']leaflet\/dist\/leaflet\.css["']/,
    "leaflet.css must not be imported globally — it belongs to the lazy map modal",
  );
  assert.match(
    read('src/components/common/LeafletMapPickerModal.tsx'),
    /import 'leaflet\/dist\/leaflet\.css'/,
    'the map modal must import the Leaflet stylesheet so it arrives with the map',
  );
});

check('the sample viewer is fetched when the visitor opens a sample', () => {
  const button = code('src/components/common/SampleReportButton.tsx');
  assert.doesNotMatch(
    button,
    /import \{ LivePdfPreviewModal \} from '\.\/LivePdfPreviewModal'/,
    'SampleReportButton must not statically import the viewer',
  );
  assert.match(button, /lazy\(\(\) =>\s*import\('\.\/LivePdfPreviewModal'\)/);
  assert.match(
    button,
    /\{isOpen && \(/,
    'the viewer must only be mounted (and therefore fetched) while it is open',
  );
});

check('sample calculation is a click-time import, separate from lightweight sample copy', () => {
  const button = code('src/components/common/SampleReportButton.tsx');
  assert.doesNotMatch(button, /from ['"][^'"]*\/sampleReports['"]/);
  const handler = button.slice(button.indexOf('const openSample'));
  assert.match(handler, /await import\('\.\.\/\.\.\/services\/sampleReports'\)/);
  const info = code('src/services/sampleReportInfo.ts');
  assert.doesNotMatch(info, /from ['"][^'"]*(scanner|api|astrology|HtmlBuilder)['"]/);
});

check('the PDF renderer is reached through one dynamic boundary', () => {
  const modal = code('src/components/common/LivePdfPreviewModal.tsx');
  assert.doesNotMatch(
    modal,
    /^\s*import[\s\S]{0,200}from '\.\.\/\.\.\/services\/jathagamPdfExporter'/m,
    'the preview modal must not statically import the exporter — that would fetch jspdf for every preview',
  );
  assert.match(
    modal,
    /loadPdfEngine\(\)/,
    'the exporter must be reached through the deferred loader at the download click',
  );

  // ONE deferred boundary for every consumer: page code imports
  // `services/pdfEngine`, which owns the only import() of the exporter. A
  // static value import anywhere outside the loader is what put the PDF engine
  // on the dashboard / admin portal before the user clicked anything.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const relative = path.relative(projectRoot, full);
      if (relative === 'src/services/pdfEngine.ts' || relative === 'src/services/jathagamPdfExporter.ts') continue;
      const source = fs.readFileSync(full, 'utf8');
      // `import type` is erased at build time; a value import is not.
      if (/^\s*import\s+(?!type\b)[\s\S]{0,400}?from '[^']*jathagamPdfExporter';?$/m.test(source)) {
        offenders.push(relative);
      }
    }
  };
  walk(abs('src'));
  assert.deepEqual(
    offenders,
    [],
    `only services/pdfEngine.ts may import the PDF exporter (it must be a dynamic import there): ${offenders.join(', ')}`,
  );
  assert.match(
    read('src/services/pdfEngine.ts'),
    /=\s*import\('\.\/jathagamPdfExporter'\)/,
    'pdfEngine.ts must be the single dynamic entry point to the PDF engine',
  );
  // The render profiles and the pure payload rules the preview needs while
  // RENDERING live in a module that does not pull the renderer in.
  const payload = code('src/services/orderPayload.ts');
  assert.doesNotMatch(payload, /from 'jspdf'|from 'html2canvas'/);
  assert.doesNotMatch(
    payload,
    /from '\.\.\/lib\/muhurtham\/scanner'/,
    'the payload rules must not import the astronomy engine (use lib/muhurtham/algorithmVersion)',
  );
  assert.match(
    modal,
    /from '\.\.\/\.\.\/services\/orderPayload'/,
    'the preview must take its render-time rules from the light module',
  );
});

check('jspdf and html2canvas are imported by exactly one module', () => {
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/from 'jspdf'|from 'html2canvas'/.test(source)) {
        importers.push(path.relative(projectRoot, full));
      }
    }
  };
  walk(abs('src'));
  assert.deepEqual(
    importers,
    ['src/services/jathagamPdfExporter.ts'],
    'the PDF libraries must stay behind the single lazy exporter module',
  );
});

check('the Vite preload helper is pinned to a chunk the entry already downloads', () => {
  const vite = read('vite.config.ts');
  const helperCheck = vite.indexOf("id.includes('vite/preload-helper')");
  const nodeModulesCheck = vite.indexOf("id.includes('node_modules')");
  assert.ok(helperCheck !== -1, 'vite.config.ts must place the preload helper explicitly');
  assert.ok(
    helperCheck < nodeModulesCheck,
    'the preload-helper rule must run BEFORE the node_modules guard: the helper is a virtual module '
      + "id ('\\0vite/preload-helper.js'), and when Rollup parked it in vendor-pdf the whole PDF chunk "
      + 'became a static import of the entry (modulepreloaded on first paint)',
  );
  assert.match(vite, /VENDOR_CHUNK_GROUPS/);
  // The groups are package-based: a substring rule cannot see that `canvg` is
  // part of jspdf, which is how those bytes ended up in React's chunk.
  for (const pkg of ['canvg', 'dompurify', 'pako', 'victory-vendor', 'es-toolkit']) {
    assert.ok(
      vite.includes(`'${pkg}'`),
      `${pkg} must be assigned to the chunk of the library that needs it`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Built output — the contract the browser actually experiences.
// ---------------------------------------------------------------------------

if (!exists('dist/index.html')) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to verify the shipped bytes.');
  console.log(`\nInitial JS budget contract passed (${passed} checks).`);
  process.exit(0);
}

const distIndex = read('dist/index.html');

/** Every /assets/*.js the document loads without being asked. */
function initialScriptUrls(): string[] {
  const urls = new Set<string>();
  for (const match of distIndex.matchAll(/<(?:script|link)[^>]*?(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
    urls.add(match[1]);
  }
  return [...urls];
}

function chunkText(url: string): string {
  return fs.readFileSync(path.join(projectRoot, 'dist', url.replace(/^\//, '')), 'utf8');
}

/** Static `import ... from "./x.js"` edges of a built chunk (dynamic imports excluded). */
function staticImportsOf(url: string): string[] {
  const directory = path.posix.dirname(url);
  const edges = new Set<string>();
  const pattern = /import\s*(?:\{[^}]*\}|\*\s*as\s*[\w$]+|[\w$]+)?\s*from\s*"\.\/([^"]+)"/g;
  for (const match of chunkText(url).matchAll(pattern)) {
    edges.add(path.posix.join(directory, match[1]));
  }
  return [...edges];
}

/** The entry plus everything it statically pulls in, transitively. */
function initialRequestSet(): string[] {
  const seen = new Set<string>();
  const queue = initialScriptUrls();
  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    for (const edge of staticImportsOf(url)) {
      if (exists(path.join('dist', edge.replace(/^\//, ''))) && !seen.has(edge)) queue.push(edge);
    }
  }
  return [...seen];
}

check('index.html preloads neither the PDF renderer nor Leaflet', () => {
  for (const url of initialScriptUrls()) {
    assert.doesNotMatch(
      url,
      /vendor-pdf|vendor-maps/,
      `${url} must not be preloaded/loaded by the homepage document`,
    );
  }
  assert.ok(
    !/rel="modulepreload"[^>]*vendor-(pdf|maps)/.test(distIndex),
    'a modulepreload for vendor-pdf/vendor-maps re-opens the audit finding',
  );
});

check('no PDF or Leaflet code is reachable from the initial request set', () => {
  const initial = initialRequestSet();
  const offenders: string[] = [];
  for (const url of initial) {
    const text = chunkText(url);
    for (const marker of [...PDF_CODE_MARKERS, LEAFLET_CODE_MARKER]) {
      if (text.includes(marker)) offenders.push(`${url} contains "${marker}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the homepage must not download the PDF/map engines: ${offenders.join('; ')} (initial set: ${initial.join(', ')})`,
  );
});

check('the chat client is not in the initial bytes', () => {
  // The launcher owns services/aiAstrologerApi.ts (the endpoint paths and the
  // session calls). With the launcher deferred, that module must leave the
  // entry too — a normal visit never talks to the AI endpoint.
  const initial = initialRequestSet();
  // Markers that only exist inside services/aiAstrologerApi.ts — the endpoint
  // it talks to and the session/upload actions it posts. The chunk NAMES may
  // still appear in the entry's dynamic-deps list (that is how a lazy import
  // works); the client itself must not.
  const CHAT_CLIENT_MARKERS = ['ai_astrologer.php', 'action=upload', 'action=session'];
  const offenders: string[] = [];
  for (const url of initial) {
    const text = chunkText(url);
    for (const marker of CHAT_CLIENT_MARKERS) {
      if (text.includes(marker)) offenders.push(`${url} contains "${marker}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the AI chat client must not be reachable from the homepage: ${offenders.join(', ')}`,
  );
});

check('none of the deferred chunks is part of the initial request set', () => {
  const initial = initialRequestSet();
  const offenders = initial.filter((url) =>
    DEFERRED_CHUNK_NAMES.some((name) => path.basename(url).startsWith(`${name}-`)),
  );
  assert.deepEqual(
    offenders,
    [],
    `a homepage visit must not download these chunks: ${offenders.join(', ')}`,
  );
  // And the initial set is deliberately tiny: the entry + the React vendor chunk.
  const unexpected = initial.filter((url) => {
    const base = path.basename(url);
    return !/^index-[^/]*\.js$/.test(base) && !/^vendor-core-/.test(base);
  });
  assert.deepEqual(
    unexpected,
    [],
    `the initial request set should be the entry + vendor-core and nothing else, found: ${unexpected.join(', ')}`,
  );
});

check('service forms do not import the sample calculator or report builders', () => {
  const files = fs.readdirSync(abs('dist/assets'));
  for (const page of ['BirthJathagamPage', 'MarriageCompatibilityPage', 'BabyNamingPage', 'MuhurthamPage']) {
    const file = files.find((f) => f.startsWith(`${page}-`) && f.endsWith('.js'));
    assert.ok(file, `${page} must ship`);
    const dependencies = new Set<string>();
    const visit = (url: string) => {
      if (dependencies.has(url)) return;
      dependencies.add(url);
      for (const dep of staticImportsOf(url)) visit(dep);
    };
    visit(`/assets/${file}`);
    assert.deepEqual([...dependencies].filter((url) => /sampleReports-|HtmlBuilder-|vendor-pdf-|LivePdfPreviewModal-/.test(url)), [],
      `${page} must not load sample/report code before a click`);
  }
});

check('the deferred features are still shipped and wired through dynamic imports', () => {
  const files = fs.readdirSync(abs('dist/assets'));
  for (const name of [
    'vendor-pdf',
    'vendor-maps',
    'LeafletMapPickerModal',
    'jathagamPdfExporter',
    'LivePdfPreviewModal',
    'sampleReports',
    'UnifiedCheckoutModal',
    'FamilyCartDrawer',
    'AiAstrologerLauncher',
    'AiAstrologerPanel',
  ]) {
    assert.ok(
      files.some((f) => new RegExp(`^${name}-`).test(f)),
      `${name} must still be emitted — deferring a feature must not delete it`,
    );
  }

  // Opening a report preview must not pull the PDF engine; the download does.
  // Static imports are what the browser fetches with the chunk, so that is the
  // level this contract is written at.
  const previewChunk = files.find((f) => /^LivePdfPreviewModal-.*\.js$/.test(f))!;
  const previewImports = staticImportsOf(`/assets/${previewChunk}`);
  assert.ok(
    !previewImports.some((url) => /vendor-pdf/.test(url)),
    `opening a sample must not download jspdf/html2canvas: ${previewChunk} imports ${previewImports.join(', ')}`,
  );
  // The preview's dynamic path now goes through the shared loader chunk, which
  // owns the only dynamic path to the exporter itself.
  assert.ok(
    chunkText(`/assets/${previewChunk}`).includes('pdfEngine-'),
    'the preview must keep a dynamic path to the deferred loader for its download button',
  );
  const loaderChunk = files.find((f) => /^pdfEngine-.*\.js$/.test(f))!;
  assert.ok(
    chunkText(`/assets/${loaderChunk}`).includes('jathagamPdfExporter'),
    'the loader chunk must keep the dynamic import of the exporter',
  );

  const exporterChunk = files.find((f) => /^jathagamPdfExporter-.*\.js$/.test(f))!;
  assert.ok(
    staticImportsOf(`/assets/${exporterChunk}`).some((url) => /vendor-pdf/.test(url)),
    'the exporter chunk is what carries the PDF engine — it must import vendor-pdf',
  );

  // ...and NOTHING else may. Every route chunk (dashboard, admin portal, order
  // modal, report pages) must reach the engine only through the dynamic
  // import in `pdfEngine`; a static edge would download ~780 kB of jspdf +
  // html2canvas on page load, for a visitor who never asks for a PDF.
  const staticVendorPdfImporters = files.filter((file) => {
    if (!file.endsWith('.js')) return false;
    const text = chunkText(`/assets/${file}`);
    return /import\s*\{[^}]*\}\s*from\s*"\.\/vendor-pdf-/.test(text);
  });
  assert.deepEqual(
    staticVendorPdfImporters,
    [exporterChunk],
    'only the exporter chunk may statically import vendor-pdf',
  );
  const staticExporterImporters = files.filter((file) => {
    if (!file.endsWith('.js')) return false;
    const text = chunkText(`/assets/${file}`);
    return /import\s*\{[^}]*\}\s*from\s*"\.\/jathagamPdfExporter-/.test(text);
  });
  assert.deepEqual(
    staticExporterImporters,
    [],
    'no chunk may statically import the exporter — the loader makes it dynamic everywhere',
  );
});

check('each report builder ships with its report, not with the PDF engine', () => {
  const files = fs.readdirSync(abs('dist/assets'));
  const builders = [
    'jathagamHtmlBuilder',
    'weddingHtmlBuilder',
    'babyNamingHtmlBuilder',
    'muhurthamHtmlBuilder',
    'invoiceHtmlBuilder',
  ];
  const chunkOf = (name: string) => files.find((f) => new RegExp(`^${name}-.*\.js$`).test(f))!;

  for (const builder of builders) {
    assert.ok(
      files.some((f) => new RegExp(`^${builder}-.*\.js$`).test(f)),
      `${builder} must be emitted as its own chunk (see REPORT_BUILDER_CHUNKS in vite.config.ts)`,
    );
    const imports = staticImportsOf(`/assets/${chunkOf(builder)}`);
    assert.ok(
      !imports.some((url) => /vendor-pdf/.test(url)),
      `${builder} must not drag the PDF engine in: ${imports.join(', ')}`,
    );
  }

  // Rollup folds a module that is BOTH statically and dynamically imported into
  // the chunk of the static importer. That put the builders inside the exporter
  // chunk (which imports jspdf), so the preview's import('...HtmlBuilder')
  // resolved to the PDF engine and opening a sample downloaded it after all.
  // The named chunks are what stops that — assert the resolution explicitly.
  const exporter = chunkOf('jathagamPdfExporter');
  const exporterImports = staticImportsOf(`/assets/${exporter}`);
  for (const builder of builders) {
    assert.ok(
      exporterImports.some((url) => url.includes(`/${builder}-`)),
      `the exporter renders every report type, so it must import ${builder} (imports: ${exporterImports.join(', ')})`,
    );
  }

  const modal = chunkOf('LivePdfPreviewModal');
  const modalText = chunkText(`/assets/${modal}`);
  for (const builder of builders) {
    assert.ok(
      modalText.includes(`${builder}-`),
      `the preview must reach ${builder} as its own chunk (dynamic deps of ${modal})`,
    );
  }
  assert.ok(
    !staticImportsOf(`/assets/${modal}`).some((url) => /vendor-pdf|babynames|scanner/.test(url)),
    'opening a preview must not download the PDF engine or another report type\'s tables',
  );
});

check('the initial download stays inside the JS budget', () => {
  const initial = initialRequestSet();
  const bytes = initial.reduce(
    (total, url) => total + fs.statSync(path.join(projectRoot, 'dist', url.replace(/^\//, ''))).size,
    0,
  );
  const listed = initial
    .map((url) => `${path.basename(url)} (${Math.round(fs.statSync(path.join(projectRoot, 'dist', url.replace(/^\//, ''))).size / 1024)} kB)`)
    .join(', ');
  console.log(`         initial JS: ${Math.round(bytes / 1024)} kB — ${listed}`);
  assert.ok(
    bytes <= INITIAL_JS_BUDGET_BYTES,
    `initial JavaScript is ${Math.round(bytes / 1024)} kB, above the ${Math.round(INITIAL_JS_BUDGET_BYTES / 1024)} kB budget`,
  );
});

check('the global stylesheet carries no Leaflet rules', () => {
  const cssFiles = fs
    .readdirSync(abs('dist/assets'))
    .filter((f) => /^index-.*\.css$/.test(f));
  for (const file of cssFiles) {
    const css = read(path.join('dist/assets', file));
    assert.ok(
      !css.includes('.leaflet-container'),
      `${file} must not contain Leaflet's stylesheet (it belongs to the lazy map chunk)`,
    );
  }
});

console.log(`\nInitial JS budget contract passed (${passed} checks).`);
