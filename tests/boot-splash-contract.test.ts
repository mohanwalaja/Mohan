/**
 * ASTRO SIVAM — boot splash contract (mobile white screen, 2026-10-14).
 *
 * WHY THIS EXISTS: opening the site on a phone showed a WHITE screen for ~2 s.
 * Nothing was broken: the document was the whole first paint, but its styles
 * lived in /assets/index-*.css (a second, render-blocking request) and its
 * pixels came from the React bundle, so until both arrived the browser painted
 * its own white canvas. The fix is an inline "boot-critical" <style> plus an
 * inline #boot-splash overlay in index.html, handed over to the app by
 * src/services/bootSplash.ts.
 *
 * WHAT THIS PINS (each one has a way of silently regressing):
 *   SOURCE  · the splash styles are INLINE in index.html, ahead of the
 *             prerender anchor and of anything the app stylesheet must style —
 *             and the <html> tag carries the dark background itself, which is
 *             the earliest signal a browser can paint;
 *           · the splash costs no request (no <img>/src/href) and no inline
 *             <script> — the shipped CSP allows inline styles but not inline
 *             scripts, so an inline script here would be blocked at runtime and
 *             the splash would never go away;
 *           · three escape hatches exist for the case where that JS never runs:
 *             <noscript>, an 8 s CSS animation, and a JS give-up timer whose
 *             value is cross-checked against the CSS delay;
 *           · every JavaScript path that can own the screen dismisses it
 *             (route-ready marker, main.tsx timer, ErrorBoundary);
 *           · the hand-off function is EXECUTED against a stub document:
 *             idempotent, null-safe, removes the node, never throws.
 *   BUILT   · every one of the prerendered documents carries the splash and the
 *             inline styles, positioned BEFORE #root (the SEO body contract
 *             reads everything up to the last </div> before </body>);
 *           · the inline boot styles are parsed before the app stylesheet link
 *             (otherwise the dark surface is still waiting on that request);
 *           · <meta charset> stays inside the spec's first 1024 bytes, which the
 *             prerender injection must not push out;
 *           · the prerender anchor is consumed (no leftover marker ships).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const abs = (relative: string) => path.join(projectRoot, relative);

let passed = 0;
/** Async checks exist because the hand-off helper is executed, not read. */
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** The inline boot style block, as shipped inside index.html. */
function bootStyle(html: string): string {
  const match = html.match(/<style id="boot-critical">([\s\S]*?)<\/style>/);
  assert.ok(match, 'index.html must ship an inline <style id="boot-critical"> block');
  return match[1]!;
}

const indexHtml = read('index.html');
const bootMarkup = indexHtml.slice(
  indexHtml.indexOf('<div id="boot-splash"'),
  indexHtml.indexOf('<div id="root">'),
);

console.log('--- BOOT SPLASH CONTRACT (mobile white screen) ---');

// ---------------------------------------------------------------------------
// 1. Ships inside the document, ahead of anything that needs a request.
// ---------------------------------------------------------------------------

await check('index.html carries the dark surface on <html> itself (earliest paint signal)', () => {
  assert.match(
    indexHtml,
    /<html[^>]*style="[^"]*background-color:\s*#0b0718/,
    'the <html> element must declare the brand background inline: it is the only signal available before any stylesheet is parsed',
  );
  assert.match(indexHtml, /<html[^>]*style="[^"]*color-scheme:\s*dark/);
});

await check('the boot-critical style is inline and ahead of the prerender anchor', () => {
  const styleAt = indexHtml.indexOf('<style id="boot-critical">');
  const anchorAt = indexHtml.indexOf('<!--prerender-head-->');
  assert.ok(styleAt > 0, 'the inline boot style must exist');
  assert.ok(anchorAt > styleAt, 'the prerender anchor must sit AFTER the boot-critical style');
  assert.ok(
    styleAt < indexHtml.indexOf('<meta name="viewport"'),
    'the boot style must be parsed before the rest of the head: on a mobile link every later byte is a later paint',
  );
});

await check('the boot style paints the surface and the splash without any external request', () => {
  const css = bootStyle(indexHtml);
  assert.match(
    css,
    /html,\s*body\s*\{[^}]*background-color:\s*#0b0718/,
    'the dark canvas must be painted by the inline style',
  );
  assert.match(css, /#boot-splash\s*\{[^}]*position:\s*fixed/, 'the splash must be a fixed overlay');
  assert.match(css, /#boot-splash\s*\{[^}]*inset:\s*0/, 'the splash must cover the viewport');
  assert.doesNotMatch(css, /url\(/, 'no background image or font fetch may delay the first paint');
});

await check('the splash costs no extra request and no inline script (the CSP forbids the latter)', () => {
  assert.ok(bootMarkup.length > 0, 'the splash markup must live between the head style and #root');
  assert.doesNotMatch(
    bootMarkup,
    /<img|<svg|<script|\bsrc=|\bhref=/i,
    'the splash must be pure markup + CSS: any fetch competes with the bundle on a mobile link',
  );
  const htaccess = read('public/.htaccess');
  const csp = /Content-Security-Policy "([^"]+)"/.exec(htaccess)?.[1] ?? '';
  assert.ok(csp, 'the CSP must be findable in public/.htaccess');
  const styleSrc = /style-src([^;]+)/.exec(csp)?.[1] ?? '';
  const scriptSrc = /script-src([^;]+)/.exec(csp)?.[1] ?? '';
  assert.match(styleSrc, /'unsafe-inline'/, 'inline <style> must stay allowed, or the splash loses its styling');
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'/, "inline <script> must stay blocked — do not 'fix' the splash with one");
});

await check('the splash is aria-hidden and does not impersonate the Suspense spinner', () => {
  assert.match(
    bootMarkup,
    /<div id="boot-splash"[^>]*aria-hidden="true"/,
    'the prerendered content behind the splash is already in the accessibility tree',
  );
  assert.doesNotMatch(
    bootMarkup,
    /role="status"/,
    'the browser smoke asserts no stuck [role="status"][aria-label="Loading page"] spinner',
  );
});

// ---------------------------------------------------------------------------
// 2. Escape hatches — the splash can never outlive the page it covers.
// ---------------------------------------------------------------------------

await check('<noscript> hides the splash for browsers without scripting', () => {
  assert.match(
    indexHtml,
    /<noscript><style>#boot-splash\{display:none!important\}<\/style><\/noscript>/,
    'a JS-less visitor must land straight on the prerendered document',
  );
});

await check('a CSS animation fades the splash even if main.tsx never runs', () => {
  const css = bootStyle(indexHtml);
  const escape = /#boot-splash\s*\{[^}]*animation:\s*boot-splash-escape\s+(\d+(?:\.\d+)?)ms\s+\w+\s+(\d+(?:\.\d+)?)s\s+forwards/.exec(
    css,
  );
  assert.ok(
    escape,
    'the splash must carry a delayed `forwards` animation: a stale deploy (entry chunk 404, wrong content-encoding) never executes main.tsx',
  );
  assert.ok(Number(escape[2]) >= 4, `the CSS escape hatch must leave the app time to boot, got ${escape[2]}s`);
  assert.match(
    css,
    /@keyframes boot-splash-escape\s*\{[^}]*visibility:\s*hidden/,
    'the escaped splash must also stop receiving pointer events',
  );
});

await check('the JS give-up timer fires before the CSS escape hatch', () => {
  const main = read('src/main.tsx');
  const css = bootStyle(indexHtml);
  const cssDelayMs = Number(/(\d+(?:\.\d+)?)s\s+forwards/.exec(css)![1]) * 1000;
  const giveUp = /BOOT_SPLASH_GIVE_UP_MS\s*=\s*(\d+)/.exec(main);
  assert.ok(giveUp, 'main.tsx must declare the give-up timer');
  const giveUpMs = Number(giveUp[1]);
  assert.ok(
    giveUpMs < cssDelayMs,
    `the JS timer (${giveUpMs}ms) must fire before the CSS fallback (${cssDelayMs}ms) so a JS-capable browser always gets the styled prerendered document first`,
  );
  assert.match(main, /window\.setTimeout\(dismissBootSplash,\s*BOOT_SPLASH_GIVE_UP_MS\)/);
  assert.match(
    main,
    /import \{dismissBootSplash\} from '\.\/services\/bootSplash'/,
    'the timer needs the hand-off helper',
  );
});

await check('the route-ready marker dismisses the splash inside the Suspense boundary', () => {
  const app = read('src/App.tsx');
  assert.match(
    app,
    /<Suspense fallback=\{<RouteFallback \/>\}>[\s\S]*?<RouteLoadedMarker \/>[\s\S]*?<\/Suspense>/,
    'RouteLoadedMarker must stay INSIDE the Suspense boundary: dismissing the splash before a lazy route chunk resolves would reveal the spinner instead of the page',
  );
  assert.match(
    app,
    /function RouteLoadedMarker\(\)\s*\{[\s\S]*?useEffect\(\(\)\s*=>\s*\{[\s\S]*?dismissBootSplash\(\)/,
    'RouteLoadedMarker must dismiss the splash once the route has rendered',
  );
});

await check('the ErrorBoundary dismisses the splash before showing the support screen', () => {
  const boundary = read('src/components/common/ErrorBoundary.tsx');
  assert.match(
    boundary,
    /componentDidCatch\([\s\S]*?dismissBootSplash\(\)/,
    'a render crash must not stay hidden behind the splash until a timer fires',
  );
});

// ---------------------------------------------------------------------------
// 3. The hand-off helper itself — executed, not read.
// ---------------------------------------------------------------------------

interface FakeSplash {
  id: string;
  classes: string[];
  style: Record<string, string>;
  removed: number;
  parentNode: { removeChild: (node: unknown) => void };
  classList: { add: (name: string) => void };
}

function fakeSplash(): FakeSplash {
  const element: FakeSplash = {
    id: 'boot-splash',
    classes: [],
    style: {},
    removed: 0,
    parentNode: { removeChild: () => { element.removed += 1; } },
    classList: { add: (name: string) => { element.classes.push(name); } },
  };
  return element;
}

interface SplashModule {
  dismissBootSplash: () => void;
  BOOT_SPLASH_HIDE_CLASS: string;
  BOOT_SPLASH_ID: string;
}

let moduleCase = 0;

/** Install a stub document/window and return a FRESH copy of the module. */
async function loadWithStubDom(splash: FakeSplash | null): Promise<SplashModule> {
  moduleCase += 1;
  const globals = globalThis as Record<string, unknown>;
  globals.document = {
    getElementById: (id: string) => (splash && id === splash.id ? splash : null),
  };
  globals.window = {
    // The real helper defers removal past the CSS fade; run it inline.
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  };
  // A distinct query per case gives a distinct module instance, so one case's
  // `dismissed` flag cannot make the next case pass without doing anything.
  const url = new URL(`../src/services/bootSplash.ts?boot-splash-contract=${moduleCase}`, import.meta.url).href;
  return (await import(url)) as SplashModule;
}

await check('dismissBootSplash() is a no-op without a document (prerender/SSR safe)', async () => {
  const globals = globalThis as Record<string, unknown>;
  const previousDocument = globals.document;
  try {
    globals.document = undefined;
    moduleCase += 1;
    const url = new URL(`../src/services/bootSplash.ts?boot-splash-contract=${moduleCase}`, import.meta.url).href;
    const mod = (await import(url)) as SplashModule;
    mod.dismissBootSplash();
    mod.dismissBootSplash();
  } finally {
    globals.document = previousDocument;
  }
});

await check('dismissBootSplash() tolerates a document that never had a splash', async () => {
  const mod = await loadWithStubDom(null);
  mod.dismissBootSplash();
  mod.dismissBootSplash();
});

await check('dismissBootSplash() fades, disarms and removes the splash exactly once', async () => {
  const splash = fakeSplash();
  const mod = await loadWithStubDom(splash);
  assert.equal(splash.removed, 0);
  mod.dismissBootSplash();
  // Idempotent: the route marker, the give-up timer and the ErrorBoundary all
  // call it, and StrictMode double-invokes the effect that calls it first.
  mod.dismissBootSplash();
  assert.deepEqual(splash.classes, [mod.BOOT_SPLASH_HIDE_CLASS], 'the fade class must be added once');
  assert.equal(splash.style.pointerEvents, 'none', 'the fading splash must not intercept taps on the page behind it');
  assert.equal(splash.removed, 1, 'the splash must be removed from the DOM, not merely hidden');
});

// ---------------------------------------------------------------------------
// 4. Built output — what the browser actually receives.
// ---------------------------------------------------------------------------

const distDir = abs('dist');
const routeFiles = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter((name) => name.endsWith('.html') && name !== '404.html')
  : [];

if (!routeFiles.length) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to verify the shipped documents.');
  console.log(`\nBoot splash contract passed (${passed} checks).`);
  process.exit(0);
}

await check(`every prerendered document ships the splash before #root (${routeFiles.length} documents)`, () => {
  for (const file of routeFiles) {
    const html = read(path.join('dist', file));
    assert.equal(
      html.match(/id="boot-splash"/g)?.length ?? 0,
      1,
      `dist/${file} must contain exactly one boot splash`,
    );
    const splashAt = html.indexOf('<div id="boot-splash"');
    const rootAt = html.indexOf('<div id="root">');
    assert.ok(splashAt > 0 && rootAt > splashAt, `dist/${file} must place the splash BEFORE #root`);
    assert.match(
      html.slice(rootAt),
      /^<div id="root">[\s\S]*<\/div>\s*<\/body>/,
      `dist/${file} must still satisfy the SEO body contract (everything up to the last </div> before </body> is #root content)`,
    );
    bootStyle(html);
    assert.match(html, /<noscript><style>#boot-splash\{display:none!important\}<\/style><\/noscript>/);
    assert.match(html, /animation:\s*boot-splash-escape/, `dist/${file} lost the CSS escape hatch`);
  }
});

await check('the inline boot styles are parsed before the app stylesheet link', () => {
  for (const file of routeFiles) {
    const html = read(path.join('dist', file));
    const styleAt = html.indexOf('<style id="boot-critical">');
    const cssLinkAt = html.indexOf('<link rel="stylesheet"');
    assert.ok(cssLinkAt > 0, `dist/${file} must link the app stylesheet`);
    assert.ok(
      styleAt < cssLinkAt,
      `dist/${file} must parse the boot styles before the render-blocking stylesheet`,
    );
  }
});

await check('the boot-critical block stays inside its byte budget', () => {
  const css = bootStyle(read('dist/index.html'));
  const bytes = Buffer.byteLength(css, 'utf8');
  assert.ok(
    bytes <= 5000,
    `the inline boot style is ${bytes} bytes — it ships in every document on every page load, keep it small`,
  );
});

await check('<meta charset> stays inside the first 1024 bytes (encoding declaration window)', () => {
  for (const file of routeFiles) {
    const html = read(path.join('dist', file));
    const charsetAt = html.indexOf('<meta charset');
    assert.ok(charsetAt >= 0, `dist/${file} lost its encoding declaration`);
    assert.ok(
      charsetAt < 1024,
      `dist/${file} pushes <meta charset> to byte ${charsetAt}, past the spec window — a server that stops sending charset in Content-Type would flip Tamil/Hindi text to mojibake`,
    );
  }
});

await check('the prerender anchor is consumed and never ships', () => {
  for (const file of routeFiles) {
    assert.doesNotMatch(
      read(path.join('dist', file)),
      /<!--prerender-head-->/,
      `dist/${file} still contains the raw anchor comment`,
    );
  }
});

console.log(`\nBoot splash contract passed (${passed} checks).`);
