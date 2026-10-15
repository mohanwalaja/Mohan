/**
 * ASTRO SIVAM — build-time prerender of every public route.
 *
 * WHY THIS EXISTS (SEO audit 2026-10-14, all three critical findings):
 *
 *   1. EMPTY SHELL: the site is a client-rendered SPA, so every URL served the
 *      identical <head> and a body containing only `<div id="root"></div>`.
 *      Google indexes the raw HTML first — the entire site (services, prices,
 *      copy, trust signals) was invisible to crawlers and to social link
 *      previews.
 *   2. HOMEPAGE CANONICALS: because the shell was static, /services, /about,
 *      /contact… all shipped `rel=canonical` + `og:url` pointing at "/".
 *      Titles and descriptions were identical across every URL too, so any
 *      rendered duplicates would be consolidated away.
 *   3. DEAD HREFLANG: the sitemap advertised `?lang=ta` / `?lang=hi`
 *      alternates that served the same English shell. Translation is
 *      client-side only, so hreflang was meaningless to search engines and
 *      has been dropped from the sitemap until it can be rendered
 *      server-side.
 *
 * HOW IT WORKS:
 *
 *   `npm run build` = `vite build --manifest && node scripts/prerender.mjs`.
 *   After the bundle is written, this script renders each public route to a
 *   real HTML document with ReactDOMServer: Navbar + page + Footer inside the
 *   same provider stack the SPA uses. React 19 hoists the page's <title>,
 *   <meta> and <link> tags (react-helmet-async v3 relies on that) into the
 *   render stream; we split them out of the body and place them in <head>
 *   at the template's `<!--prerender-head-->` anchor (after <meta charset> and
 *   the inline boot-critical style, so the encoding declaration stays in the
 *   spec's 1024-byte window and the boot surface is parsed first), together
 *   with the shared site chrome (fonts, favicons, Organization JSON-LD) taken
 *   from the Vite-built index.html template.
 *
 *   Route documents live in one shared `dist/pages/` folder —
 *   `dist/pages/services.html`, `dist/pages/about.html`, … — while
 *   `dist/index.html` stays at the root. This keeps the cPanel root tidy
 *   without creating one directory per route; create_dist_zip.py and
 *   dist-shape.test.ts pin the approved root folders. public/.htaccess rewrites
 *   the clean URL (/services) to the matching file internally, so the browser
 *   keeps the clean URL and each document's self-referencing canonical names
 *   it. Every written file gets fresh .br/.gz siblings (and stale siblings of
 *   overwritten files are removed),
 *   because .htaccess negotiates text assets to the pre-compressed copies —
 *   a stale index.html.br would otherwise keep serving the old empty shell.
 *
 *   Image /src/… URLs that Vite resolved in dev-server style are rewritten to
 *   their hashed dist/assets equivalents via the build manifest (dist/.vite),
 *   which is deleted afterwards so the deploy root keeps its approved shape.
 *
 *   The build FAILS LOUDLY on any route that cannot be rendered, has no
 *   <title>, has a non-self canonical, or whose body text is trivially short.
 *   A silently half-prerendered site is exactly how this bug shipped.
 *
 *   sitemap.xml is generated from the same ROUTES table (NO hreflang — see
 *   finding 3) and written to dist/; public/sitemap.xml is kept byte-identical
 *   by tests/seo-prerender-contract.test.ts.
 *
 * On the client, src/main.tsx removes the baked `[data-prerender-seo]` tags
 * before React mounts (React 19 re-hoists its own copy; leaving both would
 * let stale titles survive SPA navigation). Crawlers that never run JS keep
 * the baked tags and the baked body — which is the whole point.
 */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

export const ORIGIN = 'https://astrosivam.com';
const DIST = join(process.cwd(), 'dist');

/**
 * Every URL that must ship as its own HTML document. `path` is the canonical
 * clean URL; `file` is the output basename (non-home documents go under
 * dist/pages/ while index.html stays at the dist/ root).
 * `noindex` routes still get a document (so the page is not an empty shell)
 * but carry `noindex, nofollow` and are excluded from the sitemap.
 */
export const ROUTES = [
  {
    path: '/',
    file: 'index.html',
    routeKey: 'home',
    module: '/src/pages/HomePage.tsx',
    component: 'HomePage',
    lastmod: '2026-10-14',
    changefreq: 'daily',
    priority: '1.0',
  },
  {
    path: '/services',
    file: 'services.html',
    routeKey: 'services',
    module: '/src/pages/ServicesPage.tsx',
    component: 'ServicesPage',
    lastmod: '2026-10-14',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/birth-jathagam',
    file: 'birth-jathagam.html',
    routeKey: 'birth-jathagam',
    module: '/src/pages/BirthJathagamPage.tsx',
    component: 'BirthJathagamPage',
    lastmod: '2026-10-14',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/marriage-compatibility',
    file: 'marriage-compatibility.html',
    routeKey: 'marriage-compatibility',
    module: '/src/pages/MarriageCompatibilityPage.tsx',
    component: 'MarriageCompatibilityPage',
    lastmod: '2026-10-14',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/baby-naming',
    file: 'baby-naming.html',
    routeKey: 'baby-naming',
    module: '/src/pages/BabyNamingPage.tsx',
    component: 'BabyNamingPage',
    lastmod: '2026-10-14',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/muhurtham',
    file: 'muhurtham.html',
    routeKey: 'muhurtham',
    module: '/src/pages/MuhurthamPage.tsx',
    component: 'MuhurthamPage',
    lastmod: '2026-10-14',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/how-it-works',
    file: 'how-it-works.html',
    routeKey: 'how-it-works',
    module: '/src/pages/HowItWorksPage.tsx',
    component: 'HowItWorksPage',
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/about',
    file: 'about.html',
    routeKey: 'about',
    module: '/src/pages/AboutPage.tsx',
    component: 'AboutPage',
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/contact',
    file: 'contact.html',
    routeKey: 'contact',
    module: '/src/pages/ContactPage.tsx',
    component: 'ContactPage',
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/team',
    file: 'team.html',
    routeKey: 'team',
    module: '/src/pages/AstrologyTeamPage.tsx',
    component: 'AstrologyTeamPage',
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/login',
    file: 'login.html',
    routeKey: 'login',
    module: '/src/pages/LoginPage.tsx',
    component: 'LoginPage',
    noindex: true,
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.6',
  },
  {
    path: '/register',
    file: 'register.html',
    routeKey: 'register',
    module: '/src/pages/RegisterPage.tsx',
    component: 'RegisterPage',
    noindex: true,
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.6',
  },
  {
    path: '/privacy-policy',
    file: 'privacy-policy.html',
    routeKey: 'policy-privacy',
    module: '/src/pages/PoliciesPage.tsx',
    component: 'PoliciesPage',
    props: { type: 'privacy' },
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: '/terms',
    file: 'terms.html',
    routeKey: 'policy-terms',
    module: '/src/pages/PoliciesPage.tsx',
    component: 'PoliciesPage',
    props: { type: 'terms' },
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: '/payment-policy',
    file: 'payment-policy.html',
    routeKey: 'policy-payment',
    module: '/src/pages/PoliciesPage.tsx',
    component: 'PoliciesPage',
    props: { type: 'payment' },
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: '/refund-policy',
    file: 'refund-policy.html',
    routeKey: 'policy-refund',
    module: '/src/pages/PoliciesPage.tsx',
    component: 'PoliciesPage',
    props: { type: 'refund' },
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: '/dashboard',
    file: 'dashboard.html',
    routeKey: 'dashboard',
    module: '/src/pages/CustomerDashboard.tsx',
    component: 'CustomerDashboard',
    noindex: true,
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.3',
  },
  {
    path: '/admin',
    file: 'admin.html',
    routeKey: 'admin',
    module: '/src/pages/AdminPortal.tsx',
    component: 'AdminPortal',
    noindex: true,
    lastmod: '2026-10-14',
    changefreq: 'monthly',
    priority: '0.1',
  },
];

/** Sitemap XML for the indexable routes. NO hreflang: translations are
 *  client-side only, so language alternates are not advertised (audit #3) until
 *  each language can be rendered server-side. */
export function renderSitemap() {
  const urls = ROUTES.filter((r) => !r.noindex).map((r) => {
    const loc = r.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${r.path}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${r.lastmod}</lastmod>`,
      `    <changefreq>${r.changefreq}</changefreq>`,
      `    <priority>${r.priority}</priority>`,
      '  </url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function sitemapLocs() {
  return ROUTES.filter((r) => !r.noindex).map((r) => (r.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${r.path}`));
}

// ---------------------------------------------------------------------------
// Small HTML helpers
// ---------------------------------------------------------------------------

/** Mask <svg>…</svg> so SVG <title>/<desc> children are never mistaken for
 *  document-level hoistable head tags. */
function maskSvg(html) {
  const spans = [];
  const masked = html.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => {
    spans.push(m);
    return `<!--__PRERENDER_SVG_${spans.length - 1}__-->`;
  });
  return {
    masked,
    unmask: (text) => text.replace(/<!--__PRERENDER_SVG_(\d+)__-->/g, (_m, i) => spans[Number(i)]),
  };
}

/**
 * React 19 + react-helmet-async v3 emit <title>/<meta>/<link> inside the
 * component tree and rely on React's native hoisting to move them into
 * <head>. renderToString leaves them in the stream — collect them (in order)
 * and return a clean body. Anything hoistable left in the body would become a
 * duplicate after the SPA mounts.
 */
function splitHeadFromBody(renderedHtml) {
  const { masked, unmask } = maskSvg(renderedHtml);
  const headTags = [];
  let body = masked.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, (m) => {
    headTags.push(m);
    return '';
  });
  body = body.replace(/<meta\s[^>]*>/gi, (m) => {
    headTags.push(m);
    return '';
  });
  body = body.replace(/<link\s[^>]*>/gi, (m) => {
    headTags.push(m);
    return '';
  });
  return { headTags, body: unmask(body) };
}

/** Rewrite dev-style /src/… URLs to the hashed dist asset paths from the Vite
 *  build manifest. Assets below Vite's inline threshold never reach the
 *  manifest (they become data: URIs inside the bundle) — inline those the same
 *  way. An unmatched /src/ URL would 404 in production, so it fails the build. */
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const ASSETS_INLINE_LIMIT = 4096; // Vite's default build.assetsInlineLimit

function mapAssetUrls(html, manifest) {
  return html.replace(/(\/src\/[^"'\s)>\\]+)/g, (m) => {
    const key = m.slice(1).split('?')[0];
    const entry = manifest[key];
    if (entry && entry.file) return `/${entry.file}`;
    const abs = join(process.cwd(), key);
    if (existsSync(abs)) {
      const bytes = readFileSync(abs);
      const mime = MIME_TYPES[extname(abs).toLowerCase()];
      if (bytes.length < ASSETS_INLINE_LIMIT && mime) {
        return `data:${mime};base64,${bytes.toString('base64')}`;
      }
    }
    throw new Error(`prerender: no build-manifest entry for ${m} (would 404 in production)`);
  });
}

/** Write a file with fresh pre-compressed siblings, deleting any stale ones
 *  first — .htaccess negotiates text assets to the .br/.gz copies, so a stale
 *  sibling silently overrides the file we just wrote. */
function writeWithSiblings(absPath, contents) {
  for (const stale of [`${absPath}.br`, `${absPath}.gz`]) {
    if (existsSync(stale)) rmSync(stale);
  }
  writeFileSync(absPath, contents);
  if (Buffer.byteLength(contents) >= 1024) {
    writeFileSync(
      `${absPath}.br`,
      brotliCompressSync(contents, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }),
    );
    writeFileSync(`${absPath}.gz`, gzipSync(contents, { level: 9 }));
  }
}

function attrValue(tag, attr) {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function visibleTextLength(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

// ---------------------------------------------------------------------------
// Browser-global stubs (module-level browser API access in deps like Leaflet)
// ---------------------------------------------------------------------------

function installBrowserStubs() {
  const storage = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      clear: () => map.clear(),
    };
  };
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  const matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  globalThis.matchMedia = matchMedia;
  globalThis.scrollTo = () => {};
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.matchMedia = matchMedia;
  globalThis.window.scrollTo = globalThis.scrollTo;
  globalThis.window.devicePixelRatio = 1;
  const screenStub = {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1080,
    deviceXDPI: 96,
    logicalXDPI: 96,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: 'landscape-primary', addEventListener() {}, removeEventListener() {} },
  };
  globalThis.window.screen = screenStub;
  globalThis.screen = screenStub;
  globalThis.window.location = {
    href: `${ORIGIN}/`,
    pathname: '/',
    search: '',
    hash: '',
    origin: ORIGIN,
    protocol: 'https:',
    host: 'astrosivam.com',
    hostname: 'astrosivam.com',
  };
  globalThis.location = globalThis.window.location;
  // Node 21+ (and some Node 20 backports) expose a read-only `navigator`
  // without the DOM fields Leaflet reads at module init (`navigator.platform`
  // here; `userAgent` elsewhere). Fill in whatever is missing on the existing
  // object instead of assuming a clean slate.
  const navigatorStub = {
    userAgent: 'prerender',
    platform: 'Linux x86_64',
    appVersion: '5.0 (prerender)',
    vendor: 'prerender',
    language: 'en',
    languages: ['en'],
    onLine: true,
  };
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', { value: navigatorStub, configurable: true });
  } else {
    for (const [key, value] of Object.entries(navigatorStub)) {
      if (typeof globalThis.navigator[key] === 'undefined') {
        try {
          Object.defineProperty(globalThis.navigator, key, { value, configurable: true });
        } catch {
          // Non-configurable prototype getter — nothing else we can do.
        }
      }
    }
  }
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute() {},
      appendChild() {},
      classList: { add() {}, remove() {}, contains: () => false },
    }),
    documentElement: { classList: { add() {}, remove() {}, contains: () => false }, style: {} },
    body: { classList: { add() {}, remove() {} }, style: {}, appendChild() {} },
    head: { appendChild() {} },
    cookie: '',
    title: '',
  };
}

/** Point the window.location stub at one route so location-derived defaults
 *  (e.g. the SEO component's self-canonical fallback) resolve per page. */
function setLocationFor(route) {
  const loc = globalThis.window.location;
  loc.pathname = route.path;
  loc.href = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

function buildPageTree(mods, route, React) {
  const { Navbar, Footer } = mods.layout;
  const pageModule = mods.pages[route.module];
  const Page = pageModule ? pageModule[route.component] : undefined;
  if (typeof Page !== 'function') {
    throw new Error(`prerender: ${route.module} does not export ${route.component}`);
  }

  const onNavigate = () => {};
  const pageEl = React.createElement(Page, { onNavigate, ...(route.props || {}) });
  // The same visual shell App.tsx builds (minus the interactive overlays:
  // cart drawers, checkout modals, AI launcher, background canvas — none of
  // which carry crawlable content).
  return React.createElement(
    'div',
    {
      className:
        'min-h-screen flex flex-col bg-[#0b0718] dark:bg-[#0b0718] text-[#fffdfa] font-sans antialiased selection:bg-amber-500 selection:text-slate-950 relative',
    },
    React.createElement(Navbar, { currentRoute: route.routeKey, onNavigate }),
    React.createElement('main', { className: 'flex-grow relative z-10' }, pageEl),
    React.createElement(Footer, { onNavigate }),
  );
}

/** The same provider stack App.tsx builds (Helmet first, like the app). */
function wrapWithProviders(mods, element, React) {
  let el = element;
  el = React.createElement(mods.providers.CartProvider, null, el);
  el = React.createElement(mods.providers.ThemeProvider, null, el);
  el = React.createElement(mods.providers.AuthProvider, null, el);
  el = React.createElement(mods.providers.LanguageProvider, null, el);
  el = React.createElement(mods.providers.HelmetProvider, null, el);
  return el;
}

function assembleDocument(baseHtml, route, headTags, bodyHtml, manifest) {
  let html = baseHtml.replace('<html ', '<html data-prerendered="true" ');

  // Fetch only THIS route's static dependencies alongside the entry, avoiding
  // the entry -> route -> dependency waterfall. Never follow dynamicImports:
  // samples, PDFs, maps and admin tools must remain click-time downloads.
  const links = new Set();
  const visited = new Set();
  function preload(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error(`prerender: missing route dependency ${key}`);
    if (entry.file.endsWith('.js')) {
      const href = `/${entry.file}`;
      if (!baseHtml.includes(`href="${href}"`)) {
        links.add(`<link rel="modulepreload" crossorigin href="${href}" />`);
      }
    }
    for (const css of entry.css || []) {
      if (!baseHtml.includes(`href="/${css}"`)) {
        links.add(`<link rel="stylesheet" crossorigin href="/${css}" />`);
      }
    }
    for (const dependency of entry.imports || []) preload(dependency);
  }
  const routeKey = route.module.replace(/^\//, '');
  // The eager homepage is already owned by the entry, not a separate chunk.
  if (manifest[routeKey]) preload(routeKey);
  html = html.replace('</head>', `${[...links].join('\n    ')}\n  </head>`);

  // Drop the template's homepage SEO tags — each route supplies its own.
  //
  // Every pattern is LINE-ANCHORED (^…\n, multiline) on purpose, and that is
  // not cosmetic. An unanchored /<title>[\s\S]*?<\/title>/ also matches a tag
  // name merely MENTIONED in an HTML comment: the boot-critical comment block
  // in index.html names <title> while explaining the head order, and the
  // non-greedy match then ran from that mention all the way to the template's
  // real </title> — silently deleting the `<!--prerender-head-->` anchor, the
  // viewport meta, the font preloads, the favicons, <meta name="theme-color">
  // and both JSON-LD blocks. The build still "succeeded" as far as Vite was
  // concerned; only the anchor check below turned it into a hard failure.
  // In the template each of these tags owns a whole line, so matching whole
  // lines is both safer and sufficient. (If a future tag ever spans lines, the
  // built-output contract fails loudly on "exactly one <title>", not silently.)
  html = html.replace(/^[ \t]*<title>[^\n]*<\/title>[ \t]*\r?\n/im, '');
  html = html.replace(/^[ \t]*<meta name="description"[^>]*>[ \t]*\r?\n/gim, '');
  html = html.replace(/^[ \t]*<meta name="robots"[^>]*>[ \t]*\r?\n/gim, '');
  html = html.replace(/^[ \t]*<link rel="canonical"[^>]*>[ \t]*\r?\n/gim, '');
  html = html.replace(/^[ \t]*<meta property="og:[^>]*>[ \t]*\r?\n/gim, '');
  html = html.replace(/^[ \t]*<meta name="twitter:[^>]*>[ \t]*\r?\n/gim, '');
  // Strip obsolete template keywords on every route, including the homepage.
  html = html.replace(/^[ \t]*<meta name="keywords"[^>]*>[ \t]*\r?\n/gim, '');

  // Enforce the robots policy from the route table even if a page's <SEO>
  // forgot its noindex flag.
  let tags = headTags;
  if (route.noindex) {
    tags = tags.filter((t) => !/^<meta\s[^>]*name="robots"/i.test(t));
    tags.push('<meta name="robots" content="noindex, nofollow" data-prerender-seo />');
  }

  const title = tags.find((t) => /^<title/i.test(t));
  const descriptionTag = tags.find((t) => /^<meta\s[^>]*name="description"/i.test(t));
  const description = descriptionTag ? attrValue(descriptionTag, 'content') || '' : '';

  // Per-route WebPage entity (indexable routes only). Marked like the other
  // baked tags so the SPA boot removes it — a fresh document load is the only
  // place where it is meaningful.
  if (!route.noindex && title) {
    const url = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
    const name = title.replace(/^<title[^>]*>/i, '').replace(/<\/title>$/i, '');
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': url,
      url,
      name,
      description,
      isPartOf: { '@id': `${ORIGIN}/#webapp` },
      inLanguage: 'en',
    };
    tags = [
      ...tags,
      `<script type="application/ld+json" data-prerender-seo>${JSON.stringify(ld)}</script>`,
    ];
  }

  const marked = tags.map((t) =>
    // Mark every baked head tag for removal when the SPA boots (see main.tsx).
    /data-prerender-seo/.test(t) ? t : t.replace(/^(<\w+)(?=[\s>])/, '$1 data-prerender-seo'),
  );

  // The route tags go to an explicit anchor in the template (index.html),
  // which sits AFTER <meta charset> and the inline boot-critical style — not
  // just "somewhere after <head>". Two reasons: the encoding declaration must
  // stay inside the spec's first-1024-bytes window (it was being pushed out to
  // ~10 kB by this injection, which is a silent risk the moment the server
  // stops sending charset in the Content-Type), and the styles that paint the
  // dark boot surface must be parsed before the rest of the head.
  const HEAD_ANCHOR = '<!--prerender-head-->';
  if (!html.includes(HEAD_ANCHOR)) {
    throw new Error(
      `prerender: index.html lost its ${HEAD_ANCHOR} anchor — the per-route head tags have nowhere to go`,
    );
  }
  // A function replacer keeps `$&`/`$1` sequences inside a page's own meta
  // description from being treated as replacement patterns.
  html = html.replace(HEAD_ANCHOR, () => marked.join('\n    '));
  html = html.replace(/<div id="root"><\/div>/, `<div id="root">${bodyHtml}</div>`);
  if (!html.includes('<div id="root">')) {
    throw new Error('prerender: template lost its #root mount point');
  }
  return html;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const distIndex = join(DIST, 'index.html');
  const manifestPath = join(DIST, '.vite', 'manifest.json');
  if (!existsSync(distIndex)) {
    throw new Error('prerender: dist/index.html missing — run `vite build --manifest` first');
  }
  if (!existsSync(manifestPath)) {
    throw new Error('prerender: dist/.vite/manifest.json missing — build with `vite build --manifest`');
  }
  const baseHtml = readFileSync(distIndex, 'utf8');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  installBrowserStubs();

  const { createServer } = await import('vite');
  const vite = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    appType: 'custom',
    configFile: join(process.cwd(), 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  try {
    // React et al. are npm-externalized in Vite's SSR module graph (the pages
    // resolve them to the same Node CJS copies), so import them directly —
    // `ssrLoadModule('react')` would try to evaluate the CJS entry as ESM.
    const React = (await import('react')).default;
    const { renderToString } = await import('react-dom/server');
    const { HelmetProvider } = await import('react-helmet-async');
    const mods = {
      providers: {
        HelmetProvider,
        LanguageProvider: (await vite.ssrLoadModule('/src/context/LanguageContext.tsx')).LanguageProvider,
        ThemeProvider: (await vite.ssrLoadModule('/src/context/ThemeContext.tsx')).ThemeProvider,
        AuthProvider: (await vite.ssrLoadModule('/src/context/AuthContext.tsx')).AuthProvider,
        CartProvider: (await vite.ssrLoadModule('/src/context/CartContext.tsx')).CartProvider,
      },
      layout: {
        Navbar: (await vite.ssrLoadModule('/src/components/layout/Navbar.tsx')).Navbar,
        Footer: (await vite.ssrLoadModule('/src/components/layout/Footer.tsx')).Footer,
      },
      pages: {},
    };
    for (const route of ROUTES) {
      if (!mods.pages[route.module]) {
        mods.pages[route.module] = await vite.ssrLoadModule(route.module);
      }
    }

    // Head extraction: react-helmet-async v3 on React 19 renders its tags
    // inline in the tree (no context extraction) and relies on React's native
    // hoisting — splitHeadFromBody collects them from the render stream.
    const titles = new Map();
    let written = 0;
    const pagesDir = join(DIST, 'pages');
    mkdirSync(pagesDir, { recursive: true });

    for (const route of ROUTES) {
      setLocationFor(route);
      const tree = buildPageTree(mods, route, React);
      const wrapped = wrapWithProviders(mods, tree, React);
      const rendered = renderToString(wrapped);
      const { headTags, body: rawBody } = splitHeadFromBody(rendered);
      const bodyHtml = mapAssetUrls(rawBody, manifest);
      const mappedHead = mapAssetUrls(headTags.join('\n    '), manifest).split('\n    ');

      const titleTag = mappedHead.find((t) => /^<title/i.test(t));
      const titleText = titleTag
        ? titleTag.replace(/^<title[^>]*>/i, '').replace(/<\/title>$/i, '')
        : '';
      if (!titleText) {
        throw new Error(`prerender: ${route.path} produced no <title> — every page must set one`);
      }
      const canonicalTag = mappedHead.find((t) => /rel="canonical"/i.test(t));
      const canonical = canonicalTag ? attrValue(canonicalTag, 'href') : null;
      const expectCanonical = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
      if (canonical !== expectCanonical) {
        throw new Error(
          `prerender: ${route.path} canonical is ${JSON.stringify(canonical)}, expected ${expectCanonical} — ` +
            'every page must ship a self-referencing canonical',
        );
      }
      if (/hreflang/i.test(mappedHead.join(' '))) {
        throw new Error(`prerender: ${route.path} emitted hreflang — language alternates are not server-rendered`);
      }
      // Indexable pages must carry real content for crawlers that never run
      // JS (the audit's core complaint). noindex utility gates (admin login,
      // dashboard sign-in) just need a non-empty document.
      const minBodyText = route.noindex ? 50 : 400;
      if (visibleTextLength(bodyHtml) < minBodyText) {
        throw new Error(
          `prerender: ${route.path} body has under ${minBodyText} visible characters — crawlers would see an empty page`,
        );
      }
      if (titles.has(titleText)) {
        throw new Error(
          `prerender: duplicate <title> ${JSON.stringify(titleText)} on ${route.path} and ${titles.get(titleText)}`,
        );
      }
      titles.set(titleText, route.path);

      const pageHtml = assembleDocument(baseHtml, route, mappedHead, bodyHtml, manifest);
      const outputPath = route.path === '/' ? join(DIST, route.file) : join(pagesDir, route.file);
      writeWithSiblings(outputPath, pageHtml);
      written += 1;
    }

    writeWithSiblings(join(DIST, 'sitemap.xml'), renderSitemap());
    // The manifest exists only for the asset-URL rewriting above; leaving
    // dist/.vite behind would add a top-level folder to the deploy root, which
    // the dist-shape contract forbids.
    rmSync(join(DIST, '.vite'), { recursive: true, force: true });

    console.log(`prerender: wrote ${written} route document(s) (non-index under dist/pages/; index.html and sitemap.xml stay at root; compressed siblings refreshed)`);
  } finally {
    await vite.close();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
