/**
 * ASTRO SIVAM — lazy route export contract (audit S1).
 *
 * App.tsx builds each lazy() factory as
 *   safeImport(() => import('./pages/X')).then((m) => ({ default: m.X }))
 * If a page's named export is ever renamed without updating that mapping, the
 * factory resolves to `default: undefined` and the route throws at render
 * time — the visitor sees an error boundary instead of the page. This test
 * pins the mapping to the pages' actual `export const` names at source level
 * (the modules themselves import Vite-managed assets like .png, so they cannot
 * be imported in plain Node; `npm run lint` additionally type-checks the same
 * mapping against the real module types).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

console.log('--- LAZY ROUTE EXPORT CONTRACT ---');

const app = read('src/App.tsx');

// Every lazy() factory in App.tsx:
//   safeImport(() => import('./pages/Page')).then((m) => ({ default: m.Export }))
// The safeImport(...) wrapper is part of the contract: a synchronous throw from
// the import() wrapper must become a rejection routed through
// recoverFromChunkError (see src/services/routeChunks.ts).
const factories = [
  ...app.matchAll(
    /safeImport\(\(\) => import\('\.\/pages\/(\w+)'\)\)\s*\.then\(\(m\) => \(\{\s*default:\s*m\.(\w+)\s*\}\)\)/g,
  ),
];
assert.ok(factories.length > 0, 'no lazy() route factories found in src/App.tsx — are the heavy routes still code-split?');

const expectedPages = [
  'AdminPortal',
  'CustomerDashboard',
  'BirthJathagamPage',
  'MarriageCompatibilityPage',
  'BabyNamingPage',
  'MuhurthamPage',
];

const mappedPages = factories.map((m) => m[1]).sort();
assert.deepEqual(mappedPages, [...expectedPages].sort(), 'App.tsx must lazy-load exactly the six heavy routes');

// Hardening contract (the __VITE_PRELOAD__ incident): every lazy factory must
// go through safeImport() so a synchronous throw from the import() wrapper is
// converted into a rejection instead of escaping .catch() into the
// ErrorBoundary. A bare `import('./pages/X')` inside lazy() re-opens that hole.
for (const page of expectedPages) {
  assert.match(
    app,
    new RegExp(`safeImport\\(\\(\\) => import\\('\\./pages/${page}'\\)\\)`),
    `${page} must be wrapped in safeImport(() => import(...)) — a synchronous import() throw must reach recoverFromChunkError`,
  );
}

let passed = 0;
for (const [, page, exportName] of factories) {
  const source = read(`src/pages/${page}.tsx`);
  const exportPattern = new RegExp(`export (?:const|function|default function)\\s+${exportName}\\b`);
  assert.match(
    source,
    exportPattern,
    `src/pages/${page}.tsx must export '${exportName}' — App.tsx maps m.${exportName} as the lazy default`,
  );
  passed += 1;
  console.log(`  [PASS] ${page}.tsx exports ${exportName} (matches App.tsx lazy mapping)`);
}

console.log(`\nLazy route export contract passed (${passed} checks).`);
