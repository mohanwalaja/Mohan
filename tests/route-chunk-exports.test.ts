/**
 * ASTRO SIVAM — lazy route export contract (audit S1).
 *
 * App.tsx builds each lazy() factory as
 *   import('./pages/X').then((m) => ({ default: m.X }))
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

// Every lazy() factory in App.tsx: import('./pages/Page') ... default: m.Export
const factories = [...app.matchAll(/import\('\.\/pages\/(\w+)'\)\s*\.then\(\(m\) => \(\{\s*default:\s*m\.(\w+)\s*\}\)\)/g)];
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
