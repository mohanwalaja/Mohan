/**
 * ASTRO SIVAM — light-design fixes regression contracts (2026-10-17).
 *
 * Three fixes, each with a way of silently regressing:
 *
 *   1. DARK FLASH BEFORE IVORY & SAFFRON LOADS (~2 s of dark UI, then light).
 *      The design used to be applied by React only after the public settings
 *      request resolved. Now assets/boot-design.js stamps the saved design
 *      onto <html> before the body paints (classic EXTERNAL script — the CSP
 *      blocks inline scripts), the boot-critical style paints the light
 *      canvas/splash from that stamp, and first-time visitors (no saved
 *      design yet) hold the prerendered content behind the boot splash until
 *      settings resolve — with a fail-open release (main.tsx backstop + the
 *      existing give-up timers) so the page can never stay hidden. Admin
 *      routes never receive the user design.
 *
 *   2. AI ASTROLOGER CHAT FADED / UNREADABLE IN LIGHT DESIGN.
 *      `[data-user-design] > .fixed { opacity:.08 }` faded the chat launcher
 *      and panel along with the cosmic background. The dimming is now scoped
 *      to CosmicBackground's dedicated `cosmic-background` class, the chat is
 *      fully opaque, and its header/thread/menu get explicit light surfaces
 *      (the dark gradient header is not a Tailwind bg-* utility, so the
 *      blanket repaint rules cannot reach it).
 *
 *   3. VERIFIED BIRTHPLACE CARD (shared GooglePlacesPicker).
 *      The card kept its dark gradient while the blanket rules turned its ink
 *      dark. It now carries the semantic `verified-location-card` hook with
 *      light-surface/readable-ink overrides (place name, country, lat/long,
 *      UTC offset, Adjust on Map button), and long place names wrap inside
 *      the card instead of pushing the badge/button out.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- LIGHT-DESIGN FIXES (flash / chat / location card) ---');

// ---------------------------------------------------------------------------
// 1. Pre-paint design (dark flash fix)
// ---------------------------------------------------------------------------

const indexHtml = read('index.html');
const bootStyle = indexHtml.match(/<style id="boot-critical">([\s\S]*?)<\/style>/)?.[1] ?? '';

check('index.html loads the pre-paint design stamp as an EXTERNAL script (CSP-safe)', () => {
  assert.match(indexHtml, /<script src="\/assets\/boot-design\.js"><\/script>/);
  // The stamp must run before the body paints: it sits in <head>.
  assert.ok(
    indexHtml.indexOf('/assets/boot-design.js') < indexHtml.indexOf('<body>'),
    'boot-design.js must be a head script so it runs before the body exists',
  );
  // CSP forbids inline executable scripts (JSON-LD is data, not code).
  const executable = indexHtml.match(/<script\b[^>]*>/g) ?? [];
  for (const tag of executable) {
    assert.ok(
      /type="application\/ld\+json"/.test(tag) || /\bsrc=/.test(tag),
      `inline executable script found (${tag}) — the CSP blocks these; use external boot-design.js`,
    );
  }
});

check('the boot-critical style repaints canvas + splash for the saved ivory design', () => {
  assert.match(bootStyle, /html\[data-user-design="ivory"\]\s*\{[^}]*background-color:\s*#fffaf2\s*!important/);
  assert.match(bootStyle, /html\[data-user-design="ivory"\]\s*#boot-splash\s*\{/);
  assert.match(bootStyle, /html\[data-user-design="ivory"\]\s*#boot-splash\s*\.boot-word\s*\{[^}]*color:\s*#9c4c1d/);
  // The dark default canvas must stay the base (dark design unchanged).
  assert.match(bootStyle, /html,\s*body\s*\{[^}]*background-color:\s*#0b0718/);
});

check('a first-time visitor (no saved design) holds content behind the splash, with fail-open release', () => {
  assert.match(
    bootStyle,
    /html\[data-prerendered\]\[data-boot-design="pending"\]\s+#boot-splash\s*\{\s*display:\s*flex/,
    'the pending design must hold the prerendered content behind the splash',
  );
  const main = read('src/main.tsx');
  assert.match(main, /BOOT_DESIGN_HOLD_MS/, 'main.tsx must arm the design-hold backstop');
  assert.match(main, /forceReleaseBootDesignHold/, 'the backstop must fail open into the default design');
  assert.match(
    main,
    /window\.setTimeout\(dismissBootSplash,\s*BOOT_SPLASH_GIVE_UP_MS\)/,
    'the existing splash give-up timer must remain',
  );
});

check('bootSplash.ts releases the design hold and defers dismissal while pending', () => {
  const mod = read('src/services/bootSplash.ts');
  assert.match(mod, /export function applyBootDesign\(/);
  assert.match(mod, /export function forceReleaseBootDesignHold\(/);
  assert.match(mod, /if \(bootDesignPending\(\)\) return;/, 'dismissals must defer while the design is pending');
  assert.match(mod, /if \(dismissRequested && !dismissed\) dismissBootSplash\(\);/, 'the deferred dismissal must replay when the hold ends');
});

check('App.tsx syncs the resolved design per route and keeps admin dark', () => {
  const app = read('src/App.tsx');
  // The original contract from tests/user-design.test.ts must remain true.
  assert.match(app, /data-user-design=\{!isAdminRoute && design !== 'original' \? design : undefined\}/);
  assert.match(app, /applyBootDesign\(/);
  assert.match(app, /applyBootDesign\('original', \{ admin: true \}\)/, 'admin routes must never take the user design');
  assert.match(app, /settings \|\| !isLoading/, 'first-timers must hold until settings resolve (or fail open)');
  assert.doesNotMatch(app, /useUserDesign|selectDesign|localStorage/);
});

check('settings resolve early: the public settings request starts beside the session probe', () => {
  const auth = read('src/context/AuthContext.tsx');
  assert.match(auth, /const settingsPromise = refreshSettings\(\);/);
  assert.match(auth, /await settingsPromise;/);
});

// ---------------------------------------------------------------------------
// The pre-paint stamp itself — EXECUTED, not just read.
// ---------------------------------------------------------------------------

interface StubAttr { getAttribute: (n: string) => string | null; setAttribute: (n: string, v: string) => void; removeAttribute: (n: string) => void; attrs: Record<string, string>; }

function stubRoot(): StubAttr {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    setAttribute: (n: string, v: string) => { attrs[n] = v; },
    removeAttribute: (n: string) => { delete attrs[n]; },
  };
}

function runBootDesign(root: StubAttr, opts: { path?: string; search?: string; cached?: string | null; storageThrows?: boolean }): Record<string, string> {
  const code = read('public/assets/boot-design.js');
  const windowStub = {
    location: { pathname: opts.path ?? '/', search: opts.search ?? '' },
    localStorage: {
      getItem: () => {
        if (opts.storageThrows) throw new Error('blocked');
        return opts.cached ?? null;
      },
    },
  };
  // The stamp is an IIFE over the window/document globals.
  new Function('window', 'document', code)(windowStub, { documentElement: root });
  return root.attrs;
}

check('boot-design.js stamps ivory from the cached settings before first paint', () => {
  assert.ok(existsSync('public/assets/boot-design.js'));
  const attrs = runBootDesign(stubRoot(), { cached: JSON.stringify({ userDesign: 'ivory' }) });
  assert.equal(attrs['data-user-design'], 'ivory');
  assert.equal(attrs['data-boot-design'], 'ivory');
});

check('boot-design.js resolves a cached original design without holding', () => {
  const attrs = runBootDesign(stubRoot(), { cached: JSON.stringify({ userDesign: 'original' }) });
  assert.equal(attrs['data-boot-design'], 'original');
  assert.equal(attrs['data-user-design'], undefined);
});

check('boot-design.js holds first-time visitors as pending (content hidden until settings)', () => {
  const attrs = runBootDesign(stubRoot(), { cached: null });
  assert.equal(attrs['data-boot-design'], 'pending');
  const blocked = runBootDesign(stubRoot(), { cached: null, storageThrows: true });
  assert.equal(blocked['data-boot-design'], 'pending');
});

check('boot-design.js never pre-paints a user design on admin routes', () => {
  for (const [path, search] of [
    ['/admin', ''],
    ['/admin-portal', ''],
    ['/admin.php', ''],
    ['/nested/admin', ''],
    ['/', '?route=admin'],
    ['/', '?route=admin-portal'],
  ] as Array<[string, string]>) {
    const attrs = runBootDesign(stubRoot(), { path, search, cached: JSON.stringify({ userDesign: 'ivory' }) });
    assert.equal(attrs['data-boot-design'], 'admin', `admin exclusion failed for ${path}${search}`);
    assert.equal(attrs['data-user-design'], undefined, `admin route ${path}${search} must stay dark`);
  }
});

check('boot-design.js is failure-safe: a thrown stamp can never hide the page', () => {
  const code = read('public/assets/boot-design.js');
  assert.doesNotThrow(() => new Function('window', 'document', code)({ location: { pathname: '/', search: '' } }, {}));
  assert.doesNotThrow(() => new Function('window', 'document', code)(undefined, undefined));
});

// ---------------------------------------------------------------------------
// 2. AI astrologer chat visibility
// ---------------------------------------------------------------------------

check('the decorative dimming is scoped to the cosmic background only', () => {
  const css = read('src/user-designs.css');
  const cosmic = read('src/components/common/CosmicBackground.tsx');
  assert.match(cosmic, /className="cosmic-background /, 'CosmicBackground must carry its dedicated class');
  assert.doesNotMatch(
    css,
    /\[data-user-design\]\s*>\s*\.fixed\s*\{[^}]*opacity/,
    'the bare > .fixed rule faded the chat — it must not come back',
  );
  assert.match(css, /\[data-user-design\]\s*\.cosmic-background\s*\{[^}]*opacity:\s*\.08/);
});

check('the chat launcher and panel stay fully opaque', () => {
  const css = read('src/user-designs.css');
  assert.match(css, /:is\(\.ai-chat-panel-frame,\.ai-chat-launcher,\.ai-chat-panel,\.ai-chat-panel-fallback\)\s*\{\s*opacity:\s*1/);
});

check('chat surfaces carry semantic classes and light-theme repaints', () => {
  const panel = read('src/components/ai-astrologer/AiAstrologerPanel.tsx');
  const launcher = read('src/components/ai-astrologer/AiAstrologerLauncher.tsx');
  const css = read('src/user-designs.css');
  assert.match(panel, /className="ai-chat-panel /);
  assert.match(panel, /className="ai-chat-header /);
  assert.match(panel, /className="ai-chat-thread /);
  assert.match(panel, /className="ai-chat-menu /);
  assert.match(launcher, /className="ai-chat-panel-frame /);
  assert.match(launcher, /className="ai-chat-launcher-pill /);
  // Light repaints for the bespoke dark gradients (header + thread).
  assert.match(css, /\[data-user-design\]\s*\.ai-chat-header\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(css, /\[data-user-design\]\s*\.ai-chat-thread\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(css, /\[data-user-design\]\s*\.ai-chat-menu\s*\{/);
  assert.match(css, /\[data-user-design\]\s*\.ai-chat-launcher-pill\s*\{/);
});

// ---------------------------------------------------------------------------
// 3. Verified birthplace card
// ---------------------------------------------------------------------------

check('the verified-location card has a semantic hook and wrap-safe layout', () => {
  const picker = read('src/components/common/GooglePlacesPicker.tsx');
  assert.match(picker, /className="verified-location-card /);
  assert.match(picker, /verified-location-card__title/);
  assert.match(picker, /verified-location-card__map-button/);
  // Long place names wrap; the country badge and map button stay inside.
  assert.match(picker, /flex flex-wrap items-center gap-1\.5/);
  assert.match(picker, /min-w-0 max-w-full break-words/);
  assert.match(picker, /verified-location-card__country shrink-0/);
  assert.match(picker, /verified-location-card__map-button[^"]*shrink-0/);
});

check('the card gets a light surface with readable ink and button contrast', () => {
  const css = read('src/user-designs.css');
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card__title/);
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card__country/);
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card__coords/);
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card__offset/);
  assert.match(css, /\[data-user-design\]\s*\.verified-location-card__map-button\s*\{[^}]*color:\s*#7c3410\s*!important/);
});

// ---------------------------------------------------------------------------
// Guardrails: dark design + admin screens untouched by the light skin.
// ---------------------------------------------------------------------------

check('every new light-design rule stays scoped under [data-user-design]', () => {
  const css = read('src/user-designs.css');
  for (const line of css.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/') || trimmed.startsWith('}') || trimmed.includes('{') === false) continue;
    const selector = trimmed.slice(0, trimmed.indexOf('{')).trim();
    if (!selector || selector.startsWith('@')) continue;
    // Only the payment brand strip (shared neutral artwork) may sit outside
    // the design scope; everything else must key off the design attribute.
    if (selector.includes('.payment-brand-logos')) continue;
    assert.ok(
      selector.includes('[data-user-design'),
      `user-designs.css rule escapes the design scope: ${selector}`,
    );
  }
});

check('the dark default and the admin panels keep their own styling', () => {
  assert.match(read('index.html'), /<html lang="en" class="dark" style="background-color: #0b0718; color-scheme: dark">/);
  const panel = read('src/components/admin/UserDesignSettings.tsx');
  assert.match(panel, /value="original"/);
  assert.match(panel, /value="ivory"/);
  // The admin UI itself must not take the light skin.
  assert.doesNotMatch(panel, /data-user-design|ai-chat|verified-location/);
});

console.log(`Light-design fixes contracts passed (${passed} checks): pre-paint design stamp + hold, scoped chat opacity, verified-location card.`);
