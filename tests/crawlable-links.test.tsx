/**
 * Crawlable internal links (SEO audit 2026-10-15, finding 1 — severity high).
 *
 * The prerendered homepage carried exactly two anchors (Facebook and a
 * mailto:). Every internal link — header, footer, policy links, service cards —
 * was a `<button data-route>` whose click called the SPA router, so crawlers
 * could not follow any of them and visitors could not middle-click, copy the
 * link or open a page in a new tab.
 *
 * What must hold:
 *   1. routeHref() maps every route key to the CANONICAL path of a prerendered
 *      document (the /privacy-policy page, not the /policy-privacy alias that
 *      .htaccess 301s), and the router pushes the same URL.
 *   2. RouteLink renders `<a href data-route>` and intercepts ONLY a plain
 *      left-click (modifier/middle clicks and target="_blank" are left to the
 *      browser) — executed here against fake events, no DOM needed.
 *   3. No `<button data-route>` exists in the source; the converted pages no
 *      longer navigate from button click handlers; every literal RouteLink
 *      route resolves to a prerendered URL.
 *   4. When dist/ exists, every shipped document passes the same guard the
 *      build runs (scripts/prerender.mjs crawlableLinkProblems).
 *
 * The real-browser half (SPA transition keeps the document, Ctrl/⌘ and
 * middle-click open a new tab) lives in tests/browser/homepage-navigation.spec.ts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteLink } from '../src/components/common/RouteLink';
import { ROUTE_CANONICAL_PATHS, routeHref, shouldRouteInApp } from '../src/services/routePaths';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const prerender = await import(new URL('../scripts/prerender.mjs', import.meta.url).href);
const ROUTES: Array<{ path: string; file: string; routeKey: string; noindex?: boolean }> = prerender.ROUTES;
const canonicalPaths = new Set(ROUTES.map((route) => route.path));

console.log('--- CRAWLABLE INTERNAL LINKS (SEO audit 2026-10-15, finding 1) ---');

// ---------------------------------------------------------------------------
// 1. Route key -> canonical URL
// ---------------------------------------------------------------------------

check('routeHref maps every prerendered route key to its canonical path', () => {
  for (const route of ROUTES) {
    assert.equal(routeHref(route.routeKey), route.path, `${route.routeKey} must link to ${route.path}`);
  }
  assert.equal(routeHref('home'), '/');
  assert.equal(routeHref('policy-privacy'), '/privacy-policy');
  assert.equal(routeHref('policy-terms'), '/terms');
  assert.equal(routeHref('policy-payment'), '/payment-policy');
  assert.equal(routeHref('policy-refund'), '/refund-policy');
  assert.equal(routeHref('admin-portal'), '/admin');
  assert.equal(routeHref(''), '/');
  for (const target of Object.values(ROUTE_CANONICAL_PATHS)) {
    assert.ok(canonicalPaths.has(target), `${target} has no prerendered document`);
  }
});

check('no link ever targets a URL that .htaccess only keeps as a 301 alias', () => {
  const htaccess = read('public/.htaccess');
  const aliases = [...htaccess.matchAll(/^\s*RewriteRule \^\(?([^$)]+)\)?\/\?\$ \/[\w-]* \[R=301,L\]/gm)]
    .flatMap((m) => m[1].split('|'))
    .map((alias) => `/${alias.replace(/\\/g, '')}`);
  assert.ok(aliases.includes('/policy-privacy') && aliases.includes('/home'), 'the alias scan found the policy/home aliases');
  for (const route of ROUTES) {
    assert.ok(!aliases.includes(routeHref(route.routeKey)), `${route.routeKey} links to the 301 alias ${routeHref(route.routeKey)}`);
  }
});

check('the router pushes the same canonical URL the links carry', () => {
  const app = read('src/App.tsx');
  assert.match(app, /import \{ routeHref \} from '\.\/services\/routePaths';/);
  assert.match(app, /new URL\(routeHref\(targetRoute\), window\.location\.origin\)/,
    'handleNavigate must push routeHref(route) — otherwise the address bar shows /policy-privacy after an in-app click');
  assert.doesNotMatch(app, /`\/\$\{targetRoute\}`/, 'the old /${route} path builder must be gone');
});

// ---------------------------------------------------------------------------
// 2. RouteLink markup and click semantics
// ---------------------------------------------------------------------------

check('RouteLink renders a real anchor with the canonical href and data-route', () => {
  const html = renderToStaticMarkup(
    <RouteLink route="policy-terms" onNavigate={() => {}} className="footer-link" aria-current="page">
      Terms
    </RouteLink>
  );
  assert.match(html, /^<a [^>]*>Terms<\/a>$/);
  assert.match(html, /\shref="\/terms"/);
  assert.match(html, /\sdata-route="policy-terms"/);
  assert.match(html, /\sclass="footer-link"/);
  assert.match(html, /\saria-current="page"/);
});

type FakeClick = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  prevented: boolean;
  preventDefault: () => void;
};
const click = (overrides: Partial<FakeClick> = {}): FakeClick => {
  const event: FakeClick = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...overrides
  };
  return event;
};

/** Runs RouteLink's real click handler (taken from the element it returns). */
function clickRouteLink(props: Partial<React.ComponentProps<typeof RouteLink>>, event: FakeClick) {
  const navigated: string[] = [];
  const element = RouteLink({
    route: 'birth-jathagam',
    onNavigate: (route: string) => navigated.push(route),
    children: 'Birth Jathagam',
    ...props
  } as React.ComponentProps<typeof RouteLink>) as React.ReactElement<{ onClick: (e: unknown) => void }>;
  element.props.onClick(event);
  return navigated;
}

check('a plain left-click becomes an in-app transition (preventDefault + onNavigate)', () => {
  const event = click();
  assert.deepEqual(clickRouteLink({}, event), ['birth-jathagam']);
  assert.equal(event.prevented, true);
});

check('Ctrl/⌘/Shift/Alt and middle clicks are left to the browser (new tab, window, download)', () => {
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
    const event = click(overrides);
    assert.deepEqual(clickRouteLink({}, event), [], `click ${JSON.stringify(overrides)} must not be intercepted`);
    assert.equal(event.prevented, false, `click ${JSON.stringify(overrides)} must keep the browser default`);
  }
});

check('target="_blank" and an already-handled click are left alone; a caller onClick still runs', () => {
  const blank = click();
  assert.deepEqual(clickRouteLink({ target: '_blank' }, blank), []);
  assert.equal(blank.prevented, false);

  const handled = click({ defaultPrevented: true });
  assert.deepEqual(clickRouteLink({}, handled), []);

  let callerRan = 0;
  const event = click();
  assert.deepEqual(clickRouteLink({ onClick: () => { callerRan += 1; } }, event), ['birth-jathagam']);
  assert.equal(callerRan, 1, 'a caller-supplied onClick (e.g. closing a menu) must still run');
  assert.equal(shouldRouteInApp(click(), '_self'), true);
});

// ---------------------------------------------------------------------------
// 3. Source contracts
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(tsx|ts)$/.test(entry.name) ? [relative] : [];
  });
}
/** Code only: block/JSX comments and // line comments (not URLs) removed, so docs may describe the old markup. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');
const allSources = sourceFiles('src').map((file) => [file, stripComments(read(file))] as const);

check('no <button> anywhere in src/ carries data-route (navigation is never a button)', () => {
  const offenders = allSources.flatMap(([file, source]) =>
    [...source.matchAll(/<button\b[^>]*?\sdata-route=/g)].map(() => file)
  );
  assert.deepEqual(offenders, [], `navigation buttons found in: ${offenders.join(', ')}`);
});

check('the converted pages no longer navigate from button click handlers', () => {
  for (const file of [
    'src/components/layout/Footer.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/ServicesPage.tsx',
    'src/pages/PoliciesPage.tsx',
    'src/pages/HowItWorksPage.tsx',
    'src/pages/NotFoundPage.tsx',
    'src/pages/AstrologyTeamPage.tsx',
    'src/components/common/TestimonialsSection.tsx'
  ]) {
    assert.doesNotMatch(stripComments(read(file)), /onClick=\{\(\) => onNavigate\(/, `${file} still navigates from a click handler`);
  }
  // Navbar: navTo may only be the RouteLink router or follow a logout.
  const navbar = stripComments(read('src/components/layout/Navbar.tsx'));
  const navToCalls = [...navbar.matchAll(/navTo\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(navToCalls, ['home', 'home'], 'only the two sign-out buttons may call navTo() directly');
  assert.ok((navbar.match(/<RouteLink\b/g) || []).length >= 10, 'header navigation must be RouteLinks');
  const footer = stripComments(read('src/components/layout/Footer.tsx'));
  assert.ok((footer.match(/<RouteLink\b/g) || []).length >= 16, 'footer navigation (brand, contact, services, company, policies) must be RouteLinks');
});

check('every literal RouteLink route resolves to a prerendered canonical URL', () => {
  const routes = new Set<string>();
  for (const [, source] of allSources) {
    for (const match of source.matchAll(/<RouteLink\b[^>]*?\sroute="([\w-]+)"/g)) routes.add(match[1]);
  }
  assert.ok(routes.size >= 15, `expected many literal RouteLink routes, found ${routes.size}`);
  for (const route of routes) {
    assert.ok(canonicalPaths.has(routeHref(route)), `RouteLink route="${route}" -> ${routeHref(route)} has no prerendered document`);
  }
});

// ---------------------------------------------------------------------------
// 4. Shipped documents (when built)
// ---------------------------------------------------------------------------

const distDir = path.join(root, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to check the shipped documents.');
} else {
  check('every prerendered document ships crawlable links to every public page', () => {
    for (const route of ROUTES) {
      const file = route.path === '/' ? path.join(distDir, route.file) : path.join(distDir, 'pages', route.file);
      const html = fs.readFileSync(file, 'utf8');
      const body = html.slice(html.indexOf('<div id="root">'));
      const problems: string[] = prerender.crawlableLinkProblems(body);
      assert.deepEqual(problems, [], `${route.path}: ${problems.join('; ')}`);
    }
  });

  check('the prerendered homepage went from 2 anchors to real internal navigation', () => {
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const body = html.slice(html.indexOf('<div id="root">'));
    const internal = [...body.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)].map((m) => m[1]);
    assert.ok(internal.length >= 25, `only ${internal.length} internal anchors on the homepage`);
    for (const href of ['/birth-jathagam', '/marriage-compatibility', '/baby-naming', '/muhurtham', '/privacy-policy', '/terms']) {
      assert.ok(internal.includes(href), `homepage must link ${href}`);
    }
  });
}

console.log(`\nCrawlable links contract passed (${passed} checks).`);
