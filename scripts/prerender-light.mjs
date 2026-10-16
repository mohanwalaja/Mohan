/**
 * ASTRO SIVAM — light design prerender (Sunrise Ivory, design 2 of 2).
 *
 * WHAT THIS WRITES
 *   For every public route that has a light document,
 *       dist/pages/<route>-light.html      (+ .br / .gz siblings)
 *   and for the homepage, dist/pages/index-light.html. Nothing new appears at
 *   the deploy root: tests/dist-shape.test.ts pins dist/ to exactly
 *   assets, audio, pages, video-scenes.
 *
 * WHY IT EXISTS
 *   The light design is a SECOND bundle (light/), and the operator selects it
 *   in the admin portal (Admin → Site Design). A design choice must not cost a
 *   client-side redirect or an indexable page: so each light page ships as a
 *   real prerendered document at the SAME canonical URL the classic design
 *   serves, and public/.htaccess picks which document a visitor receives. The
 *   selection travels as the api/.design-light activation marker that
 *   api/admin/index.php writes when the setting changes.
 *
 * WHAT GOES IN A LIGHT DOCUMENT
 *   · the light shell — the built light bundle's <script>/<link> tags, which
 *     live under /assets/light/ and carry their own content hashes;
 *   · the page body, rendered server-side from the SAME light components the
 *     browser mounts, so crawlers (and the first paint) get the light page's
 *     real content, its real internal <a href> links and its brand imagery;
 *   · the SEO head of the classic document for that route — title, meta
 *     description, robots, self-referencing canonical, og:/twitter: tags and
 *     the JSON-LD the page already publishes. It is the SAME page at the SAME
 *     URL, so it is the same metadata; copying it (instead of inventing a
 *     second SEO story) is what keeps the two designs interchangeable for
 *     search engines, and keeps the classic document the single source of
 *     truth for what a page says about itself. scripts/prerender.mjs still
 *     runs first and still validates all of it.
 *   · the boot splash contract (tests/boot-splash-contract.test.ts): an inline
 *     <style id="boot-critical"> before the app stylesheet, the #boot-splash
 *     markup before #root, the CSS escape hatch, and data-prerendered="true" —
 *     which is also how the light bundle knows it is running inside a
 *     deployed document (light/src/router.ts).
 *
 * RUN ORDER (npm run build)
 *   1. vite build --manifest           → dist/ + the classic manifest
 *   2. node scripts/prerender.mjs      → the classic documents (SEO source)
 *   3. vite build --mode light-deploy  → dist/assets/light/ + its manifest
 *   4. node scripts/prerender-light.mjs→ this file
 */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
import { ROUTES, ORIGIN, crawlableLinkProblems, readableText } from './prerender.mjs';

const DIST = join(process.cwd(), 'dist');
const LIGHT_OUT = join(DIST, 'assets', 'light');
const LIGHT_INDEX = join(LIGHT_OUT, 'index.html');
const LIGHT_MANIFEST = join(LIGHT_OUT, '.vite', 'manifest.json');

/**
 * Route keys that deliberately have NO light document: the four signed-in /
 * operator surfaces. They are noindex tools, and the light UI links to the
 * live account pages rather than reimplementing them. Keep in step with
 * LIGHT_DESIGN_EXCLUDED_ROUTES in src/services/designSwitch.ts (pinned by
 * tests/site-design-switch.test.ts).
 */
export const NO_LIGHT_DOCUMENT = ['login', 'register', 'dashboard', 'admin'];

/** Every route that gets a light document, in the prerender table's order. */
export const LIGHT_ROUTES = ROUTES.filter((route) => !NO_LIGHT_DOCUMENT.includes(route.routeKey));

/** '<route>.html' → '<route>-light.html'; the homepage lands in pages/ too. */
export function lightDocumentFile(route) {
  const base = route.file.replace(/\.html$/i, '');
  return `${base === 'index' ? 'index' : base}-light.html`;
}

/** Where a light document is written: always inside dist/pages/. */
export function lightDocumentPath(route) {
  return join(DIST, 'pages', lightDocumentFile(route));
}

/**
 * The classic document for a route is the SEO source: it already passed every
 * guard in scripts/prerender.mjs. Only tags the classic prerender MARKED as
 * per-route SEO travel; the classic bundle's own <script>/<link> tags must
 * never leak into a light document.
 */
function classicSeoFor(route) {
  const file = route.path === '/' ? join(DIST, 'index.html') : join(DIST, 'pages', route.file);
  if (!existsSync(file)) {
    throw new Error(`prerender-light: ${relative(DIST, file)} is missing — run the classic prerender first`);
  }
  const html = readFileSync(file, 'utf8');
  const headStart = html.indexOf('<head>');
  const headEnd = html.indexOf('</head>');
  if (headStart === -1 || headEnd === -1) {
    throw new Error(`prerender-light: ${relative(DIST, file)} has no <head> to read the route SEO from`);
  }
  const head = html.slice(headStart, headEnd);
  const tags = [];
  for (const match of head.matchAll(/<(title|meta|link)\b[^>]*\bdata-prerender-seo\b[^>]*>(?:([^<]*)<\/title>)?/gi)) {
    tags.push(match[0]);
  }
  if (!tags.some((tag) => /^<title/i.test(tag))) {
    throw new Error(`prerender-light: ${relative(DIST, file)} ships no prerendered <title> to copy`);
  }
  // The per-route JSON-LD lives inside the page tree (see assembleDocument in
  // scripts/prerender.mjs), so it is read from the document, not the head.
  const jsonLd = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi)].map(
    (match) => match[0],
  );
  return { tags, jsonLd };
}

/** The light shell's own tags: the hashed script, stylesheet and preloads. */
function lightShellTags(shellHtml) {
  const headEnd = shellHtml.indexOf('</head>');
  const head = shellHtml.slice(0, headEnd);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const stylesheet = links.find((tag) => /rel="stylesheet"/i.test(tag));
  if (!stylesheet) {
    throw new Error('prerender-light: the built light index.html has no stylesheet to link');
  }
  const scripts = [...shellHtml.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/gi)].map((m) => m[0]);
  if (!scripts.length) {
    throw new Error('prerender-light: the built light index.html has no module script to load');
  }
  return { links, stylesheet, scripts };
}

/**
 * Inline boot-critical paint for the light documents: the warm paper surface on
 * the earliest paint signal, plus the same splash contract the classic
 * documents carry (fixed overlay, CSS escape hatch, hidden on a prerendered
 * document because the content is already there — see src/index.html).
 */
const LIGHT_BOOT_STYLE = `<style id="boot-critical">
      html, body { background-color: #fffbf3; color: #1e2438; }
      html { color-scheme: light; }
      body { margin: 0; }
      #boot-splash {
        position: fixed; inset: 0; z-index: 2147483646; display: flex;
        align-items: center; justify-content: center;
        background: radial-gradient(120% 90% at 50% 0%, #fff7e6 0%, #fffbf3 55%, #fdf1d8 100%);
        animation: boot-splash-escape 600ms ease 8s forwards;
      }
      html[data-prerendered] #boot-splash { display: none; }
      #boot-splash .boot-lockup { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 24px; text-align: center; }
      #boot-splash .boot-orb { position: relative; display: grid; place-items: center; width: 56px; height: 56px; }
      #boot-splash .boot-ring { position: absolute; inset: 0; border: 2px solid rgba(217, 154, 43, 0.22); border-top-color: #c98f1e; border-radius: 50%; animation: boot-splash-spin 1.05s linear infinite; }
      #boot-splash .boot-core { width: 10px; height: 10px; border-radius: 50%; background: #c98f1e; box-shadow: 0 0 18px 4px rgba(201, 143, 30, 0.35); }
      #boot-splash .boot-word { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 1.05rem; font-weight: 600; letter-spacing: 0.32em; text-indent: 0.32em; color: #9a6a15; }
      #boot-splash .boot-sub { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 0.68rem; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(30, 36, 56, 0.6); }
      @keyframes boot-splash-spin { to { transform: rotate(360deg); } }
      @keyframes boot-splash-escape { to { opacity: 0; visibility: hidden; } }
      @media (prefers-reduced-motion: reduce) {
        #boot-splash .boot-ring { animation: none; }
      }
    </style>`;

const LIGHT_SPLASH_MARKUP = `<div id="boot-splash" aria-hidden="true">
      <div class="boot-lockup">
        <div class="boot-orb">
          <span class="boot-ring"></span>
          <span class="boot-core"></span>
        </div>
        <p class="boot-word">ASTRO SIVAM</p>
        <p class="boot-sub">Indian Vedic Astrology</p>
      </div>
    </div>
    <noscript><style>#boot-splash{display:none!important}</style></noscript>`;

/** Resolve the SSR run's dev-style asset URLs ('/@fs/…') to the built files. */
function mapLightAssetUrls(html, manifest) {
  return html.replace(/(\/@fs\/[^"'\s)>\\]+)/g, (url) => {
    // '/@fs' is the marker; the absolute path (leading slash included) is the rest.
    const resolved = decodeURIComponent(url.slice('/@fs'.length));
    // The light build's manifest keys are relative to the Vite root (light/).
    const key = relative(join(process.cwd(), 'light'), resolved).split('\\').join('/');
    const entry = manifest[key];
    if (!entry || !entry.file) {
      throw new Error(`prerender-light: no light build-manifest entry for ${url} (would 404 in production)`);
    }
    return `/assets/light/${entry.file}`;
  });
}

/**
 * Remove the light SHELL's own site-wide SEO tags before the per-route classic
 * ones are injected: the shell is a template (its title/description describe the
 * light UI itself), and a document with two <title> tags — or a canonical that
 * disagrees with the page — is exactly what the classic build's guards exist to
 * prevent. The same job is done line-by-line in scripts/prerender.mjs; here the
 * head is small and the tags may wrap lines, so whole tags are matched inside
 * the head region only.
 */
function stripTemplateSeo(head) {
  return head
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*name="description"[^>]*>/gi, '')
    .replace(/<meta\b[^>]*name="robots"[^>]*>/gi, '')
    .replace(/<meta\b[^>]*name="keywords"[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '')
    .replace(/<meta\b[^>]*property="og:[^>]*>/gi, '')
    .replace(/<meta\b[^>]*name="twitter:[^>]*>/gi, '');
}

/**
 * Drop the light SHELL's "this preview needs JavaScript" note. It belongs to the
 * standalone light preview (light/index.html), where the body really is empty
 * until the bundle evaluates. Every prerendered light document instead ships a
 * fully rendered body and canonical <a href> links, so a visitor without
 * scripting can read and navigate it — and the boot-splash contract reads
 * everything up to the last </div> before </body> as #root's content, which the
 * note would break. Only the block carrying that wording is removed; the
 * inline <noscript> anti-flash style the document needs must survive.
 */
function dropPreviewNote(html) {
  return html.replace(/<noscript>[\s\S]*?<\/noscript>/g, (block) =>
    block.includes('This preview needs JavaScript') ? '' : block,
  );
}

/** Assemble one light document around a rendered light body. */
export function assembleLightDocument({ shellHtml, headTags, bodyHtml }) {
  const { links, stylesheet, scripts } = lightShellTags(shellHtml);

  const headStart = shellHtml.indexOf('<head>') + '<head>'.length;
  const headEnd = shellHtml.indexOf('</head>');
  shellHtml = shellHtml.slice(0, headStart) + stripTemplateSeo(shellHtml.slice(headStart, headEnd)) + shellHtml.slice(headEnd);

  let html = shellHtml
    .replace('<html ', '<html data-prerendered="true" style="background-color:#fffbf3;color-scheme:light" ')
    // Warm surface + splash, parsed before the render-blocking stylesheet.
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${LIGHT_BOOT_STYLE}`)
    // The classic document's per-route SEO, so both designs describe the page
    // identically to search engines.
    .replace('</head>', `    ${[...headTags].join('\n    ')}\n  </head>`);

  // The light bundle's own tags. modulepreload for the entry keeps the script
  // request from becoming a waterfall behind the stylesheet.
  const extra = links.filter((tag) => tag !== stylesheet && !/rel="preload"/i.test(tag));
  if (extra.length) html = html.replace('</head>', `    ${extra.join('\n    ')}\n  </head>`);

  if (!html.includes(stylesheet)) {
    throw new Error('prerender-light: the light stylesheet link was lost while assembling the document');
  }

  // The splash sits BEFORE #root — the same order the classic documents use
  // (the boot-splash contract reads everything up to the last </div> before
  // </body> as #root's content, and the splash must not be inside it).
  html = html.replace(
    /<div id="root"><\/div>/,
    `${LIGHT_SPLASH_MARKUP}\n    <div id="root">${bodyHtml}</div>`,
  );
  if (!/<div id="root">[\s\S]*<\/div>/.test(html)) {
    throw new Error('prerender-light: the light shell lost its #root mount point');
  }

  html = dropPreviewNote(html);

  for (const script of scripts) {
    if (!html.includes(script)) html = html.replace('</body>', `    ${script}\n  </body>`);
  }

  return html;
}

/** Fresh .br/.gz siblings, deleting stale ones first (same contract as the classic). */
function writeWithSiblings(absPath, contents) {
  for (const stale of [`${absPath}.br`, `${absPath}.gz`]) {
    if (existsSync(stale)) rmSync(stale);
  }
  writeFileSync(absPath, contents);
  if (Buffer.byteLength(contents) >= 1024) {
    writeFileSync(`${absPath}.br`, brotliCompressSync(contents, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }));
    writeFileSync(`${absPath}.gz`, gzipSync(contents, { level: 9 }));
  }
}

/** The browser stubs the light components need while they are rendered in Node. */
function installBrowserStubs() {
  const store = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
      clear: () => map.clear(),
    };
  };
  globalThis.localStorage = store();
  globalThis.sessionStorage = store();
  globalThis.scrollTo = () => {};
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.scrollTo = globalThis.scrollTo;
  globalThis.window.matchMedia = globalThis.matchMedia;
  globalThis.window.location = {
    href: `${ORIGIN}/`,
    pathname: '/',
    search: '',
    hash: '',
    origin: ORIGIN,
    protocol: 'https:',
    host: 'astrosivam.com',
    hostname: 'astrosivam.com',
    assign() {},
    replace() {},
  };
  globalThis.location = globalThis.window.location;
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    // data-prerendered is what puts the light router into document mode, so a
    // prerendered page resolves its route from the pathname exactly as it will
    // in the browser.
    documentElement: {
      getAttribute: (name) => (name === 'data-prerendered' ? 'true' : null),
      setAttribute() {},
      style: { setProperty() {} },
      classList: { add() {}, remove() {} },
    },
    body: { style: {} },
    title: '',
  };
}

async function main() {
  if (!existsSync(join(DIST, 'index.html')) || !existsSync(join(DIST, 'pages'))) {
    throw new Error('prerender-light: dist/ holds no classic documents — run `npm run build` end to end');
  }
  if (!existsSync(LIGHT_INDEX) || !existsSync(LIGHT_MANIFEST)) {
    throw new Error('prerender-light: missing the light deploy build — run `vite build --config light/vite.config.ts --mode light-deploy`');
  }

  const shellHtml = readFileSync(LIGHT_INDEX, 'utf8');
  const manifest = JSON.parse(readFileSync(LIGHT_MANIFEST, 'utf8'));

  installBrowserStubs();

  const { createServer } = await import('vite');
  const vite = await createServer({
    root: join(process.cwd(), 'light'),
    logLevel: 'error',
    appType: 'custom',
    configFile: join(process.cwd(), 'light', 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  try {
    const React = (await import('react')).default;
    const { renderToString } = await import('react-dom/server');
    const LightApp = (await vite.ssrLoadModule('/src/App.tsx')).default;
    if (typeof LightApp !== 'function') {
      throw new Error('prerender-light: light/src/App.tsx does not export a component');
    }

    mkdirSync(join(DIST, 'pages'), { recursive: true });
    const titles = new Map();
    let written = 0;

    for (const route of LIGHT_ROUTES) {
      const location = globalThis.window.location;
      location.pathname = route.path;
      location.href = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
      location.search = '';
      location.hash = '';

      const rendered = renderToString(React.createElement(LightApp));
      const bodyHtml = mapLightAssetUrls(rendered, manifest);

      const problems = crawlableLinkProblems(bodyHtml);
      if (problems.length > 0) {
        throw new Error(
          `prerender-light: ${route.path} failed the crawlability guard (the light design is the same site and must stay crawlable):\n  - ${problems.join('\n  - ')}`,
        );
      }
      const text = readableText(bodyHtml);
      if (text.length < 400) {
        throw new Error(`prerender-light: ${route.path} body has under 400 visible characters — crawlers would see an empty page`);
      }

      const { tags, jsonLd } = classicSeoFor(route);
      const titleTag = tags.find((tag) => /^<title/i.test(tag));
      const titleText = titleTag ? titleTag.replace(/^<title[^>]*>/i, '').replace(/<\/title>$/i, '') : '';
      if (titles.has(titleText)) {
        throw new Error(`prerender-light: duplicate <title> ${JSON.stringify(titleText)} on ${route.path} and ${titles.get(titleText)}`);
      }
      titles.set(titleText, route.path);

      const pageHtml = assembleLightDocument({ shellHtml, headTags: [...tags, ...jsonLd], bodyHtml });
      if (/["'(]\/src\//.test(pageHtml) || /\/@fs\//.test(pageHtml)) {
        throw new Error(`prerender-light: ${route.path} still contains dev-style asset URLs`);
      }

      const outputPath = lightDocumentPath(route);
      writeWithSiblings(outputPath, pageHtml);
      written += 1;
    }

    // The light build's own index.html and manifest exist only to be read
    // above: leaving them in dist/assets/light/ would ship a copy of the site's
    // shell and a build manifest to production.
    rmSync(LIGHT_INDEX, { force: true });
    rmSync(join(LIGHT_OUT, '.vite'), { recursive: true, force: true });

    console.log(
      `prerender-light: wrote ${written} light document(s) under dist/pages/ as <route>-light.html (compressed siblings refreshed); ` +
        'public/.htaccess serves them at the canonical URLs while api/.design-light exists',
    );
  } finally {
    await vite.close();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
