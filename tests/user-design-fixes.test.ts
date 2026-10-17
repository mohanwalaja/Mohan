/**
 * ASTRO SIVAM — Ivory & Saffron follow-up fixes (dark flash, chat visibility,
 * verified-location card).
 *
 * WHY THIS EXISTS: after Admin → Settings → User website design shipped with
 * the Original Dark + Ivory & Saffron designs (PR #24), three defects were
 * reported against the light design:
 *   Fix 1 — with Ivory selected, customer pages painted dark for ~2 s before
 *           switching to light (prerendered dark first paint + settings that
 *           resolve async with no cache for first-time visitors);
 *   Fix 2 — the AI astrologer launcher/panel was faded to 8% opacity and parts
 *           of the chat had poor contrast (`[data-user-design] > .fixed`
 *           matched the fixed chat elements, not just the cosmic background);
 *   Fix 3 — the verified birthplace card kept its dark gradient while its text
 *           turned dark, with poor button contrast and long names overflowing.
 *
 * WHAT THIS PINS: the design gate (settings readiness, boot-splash hand-off,
 * prerendered #root gating with failure fallbacks, admin bypass), the scoped
 * cosmic-background fade with opaque light chat surfaces, and the
 * verified-location-card light surface with wrapping. Each check names the
 * file it guards so a silent refactor fails loudly here instead of shipping.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- USER DESIGN FIXES (dark flash / chat / location card) ---');

// ---------------------------------------------------------------------------
// Fix 1 — dark flash before light UI: settings readiness + design gate.
// ---------------------------------------------------------------------------

await check('AuthContext exposes settingsReady resolved from cache or first fetch', () => {
  const auth = read('src/context/AuthContext.tsx');
  assert.match(auth, /settingsReady: boolean;/);
  assert.match(auth, /settingsReady: false,/);
  assert.match(auth, /const \[settingsReady, setSettingsReady\] = useState<boolean>\(\(\) => \{[\s\S]*?localStorage\.getItem\(SETTINGS_CACHE_KEY\)/);
  assert.match(auth, /finally \{\s*\/\/ Resolve the design gate even when the request fails[\s\S]*?setSettingsReady\(true\);/);
  assert.match(auth, /settings,\s*settingsReady,\s*isLoading,/);
});

await check('the design-gate cache key matches the AuthContext settings cache', () => {
  const authKey = /const SETTINGS_CACHE_KEY = '([^']+)'/.exec(read('src/context/AuthContext.tsx'))?.[1];
  const gateKey = /export const DESIGN_SETTINGS_CACHE_KEY = '([^']+)'/.exec(read('src/services/bootSplash.ts'))?.[1];
  assert.ok(authKey, 'AuthContext must declare SETTINGS_CACHE_KEY');
  assert.equal(gateKey, authKey, 'bootSplash must read the same cache key AuthContext writes');
});

await check('bootSplash exports the design-gate helpers (CSP-safe, no inline script)', () => {
  const gate = read('src/services/bootSplash.ts');
  assert.match(gate, /export const DESIGN_READY_ATTR = 'data-design-ready';/);
  assert.match(gate, /export function getCachedUserDesign\(\): CachedUserDesign \| null/);
  assert.match(gate, /export function isAdminRouteLocation\(/);
  assert.match(gate, /export function markDesignReady\(\): void/);
  assert.match(gate, /export function prepareDesignGate\(\): void/);
  assert.doesNotMatch(gate, /<script/);
});

await check('getCachedUserDesign() reads the saved design without throwing', async () => {
  const globals = globalThis as Record<string, unknown>;
  const previousLocalStorage = globals.localStorage;
  const previousDocument = globals.document;
  const previousWindow = globals.window;
  try {
    const store = new Map<string, string>();
    globals.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    globals.document = { documentElement: { hasAttribute: () => false, setAttribute: () => {} } };
    globals.window = { location: { pathname: '/', search: '' } };
    const mod = (await import(`../src/services/bootSplash.ts?user-design-fixes=${Date.now()}`)) as {
      getCachedUserDesign: () => string | null;
      DESIGN_SETTINGS_CACHE_KEY: string;
    };
    assert.equal(mod.getCachedUserDesign(), null);
    store.set(mod.DESIGN_SETTINGS_CACHE_KEY, JSON.stringify({ userDesign: 'ivory' }));
    assert.equal(mod.getCachedUserDesign(), 'ivory');
    store.set(mod.DESIGN_SETTINGS_CACHE_KEY, JSON.stringify({ userDesign: 'original' }));
    assert.equal(mod.getCachedUserDesign(), 'original');
    store.set(mod.DESIGN_SETTINGS_CACHE_KEY, JSON.stringify({}));
    assert.equal(mod.getCachedUserDesign(), 'original');
    store.set(mod.DESIGN_SETTINGS_CACHE_KEY, '{not json');
    assert.equal(mod.getCachedUserDesign(), null);
  } finally {
    globals.localStorage = previousLocalStorage;
    globals.document = previousDocument;
    globals.window = previousWindow;
  }
});

await check('isAdminRouteLocation() matches the admin paths App.tsx routes', async () => {
  const mod = (await import(`../src/services/bootSplash.ts?user-design-fixes-admin=${Date.now()}`)) as {
    isAdminRouteLocation: (pathname?: string, search?: string) => boolean;
  };
  for (const [pathname, search] of [
    ['/admin', ''], ['/admin/', ''], ['/admin-portal', ''], ['/admin.php', ''],
    ['/foo/admin', ''], ['/x/admin-portal', ''], ['/', '?route=admin'], ['/', '?route=admin-portal'],
  ] as Array<[string, string]>) {
    assert.equal(mod.isAdminRouteLocation(pathname, search), true, `${pathname}${search} must be admin`);
  }
  for (const [pathname, search] of [
    ['/', ''], ['/services', ''], ['/login', ''], ['/dashboard', ''], ['/', '?route=services'],
  ] as Array<[string, string]>) {
    assert.equal(mod.isAdminRouteLocation(pathname, search), false, `${pathname}${search} must not be admin`);
  }
});

await check('prepareDesignGate() opens at once for admin/cached-original, holds otherwise', async () => {
  const run = async (pathname: string, cached: string | null): Promise<boolean> => {
    const globals = globalThis as Record<string, unknown>;
    const previousLocalStorage = globals.localStorage;
    const previousDocument = globals.document;
    const previousWindow = globals.window;
    try {
      let ready = false;
      globals.localStorage = { getItem: () => cached };
      globals.document = {
        documentElement: {
          hasAttribute: () => false,
          setAttribute: (name: string) => { if (name === 'data-design-ready') ready = true; },
        },
      };
      globals.window = { location: { pathname, search: '' } };
      const mod = (await import(`../src/services/bootSplash.ts?user-design-fixes-gate=${Date.now()}-${Math.random()}`)) as {
        prepareDesignGate: () => void;
      };
      mod.prepareDesignGate();
      return ready;
    } finally {
      globals.localStorage = previousLocalStorage;
      globals.document = previousDocument;
      globals.window = previousWindow;
    }
  };
  assert.equal(await run('/admin', null), true, 'admin must never wait behind the gate');
  assert.equal(await run('/', JSON.stringify({ userDesign: 'original' })), true, 'cached dark prerender is already correct');
  assert.equal(await run('/', JSON.stringify({})), true, 'a cache without userDesign still means the dark default');
  assert.equal(await run('/', JSON.stringify({ userDesign: 'ivory' })), false, 'cached ivory stays gated until React applies light');
  assert.equal(await run('/', null), false, 'first-time visitors stay gated until settings resolve');
  assert.equal(await run('/services', null), false, 'direct links stay gated too');
});

await check('App.tsx gates customer content on settings with an admin bypass and timeout', () => {
  const app = read('src/App.tsx');
  assert.match(app, /export const DESIGN_GATE_TIMEOUT_MS = 3000;/);
  assert.match(app, /const \{ user, birthProfile, settings, settingsReady \} = useAuth\(\);/);
  assert.match(app, /const designResolved = isAdminRoute \|\| settingsReady \|\| designGateTimedOut \|\| previewDesign !== null;/);
  assert.match(app, /window\.setTimeout\(\(\) => setDesignGateTimedOut\(true\), DESIGN_GATE_TIMEOUT_MS\)/);
  assert.match(app, /if \(designResolved\) markDesignReady\(\);/);
  assert.match(app, /aria-label="Loading website design"/);
  assert.match(app, /import \{[^}]*markDesignReady[^}]*\} from '\.\/services\/bootSplash';/);
  // The gate must not reintroduce a local preview override in App.
  assert.doesNotMatch(app, /localStorage/);
});

await check('the React gate timeout fires before the CSS reveal fallback', () => {
  const app = read('src/App.tsx');
  const html = read('index.html');
  const reactMs = Number(/DESIGN_GATE_TIMEOUT_MS = (\d+)/.exec(app)?.[1]);
  const cssDelayMs = Number(/boot-design-reveal \d+ms linear (\d+)s forwards/.exec(html)?.[1]) * 1000;
  assert.ok(reactMs > 0 && cssDelayMs > 0, 'both the React timeout and the CSS fallback must declare their delays');
  assert.ok(
    reactMs < cssDelayMs,
    `React (${reactMs}ms, which knows the cached/fallback design) must win over the blind CSS timer (${cssDelayMs}ms)`,
  );
});

await check('main.tsx opens the gate synchronously before the first render', () => {
  const main = read('src/main.tsx');
  assert.match(main, /import \{[^}]*prepareDesignGate[^}]*\} from '\.\/services\/bootSplash';/);
  const gateAt = main.indexOf('prepareDesignGate();');
  const rootAt = main.indexOf('createRoot(');
  assert.ok(gateAt > 0 && rootAt > gateAt, 'prepareDesignGate() must run before createRoot()');
});

await check('index.html gates prerendered #root with splash + fallback and no inline script', () => {
  const html = read('index.html');
  assert.match(html, /html\[data-prerendered\]:not\(\[data-design-ready\]\) #root \{\s*visibility: hidden;/);
  assert.match(html, /html\[data-prerendered\]:not\(\[data-design-ready\]\) #boot-splash \{\s*display: flex;/);
  assert.match(html, /@keyframes boot-design-reveal \{\s*to \{\s*visibility: visible;/);
  assert.match(
    html,
    /<noscript><style>html\[data-prerendered\] #root\{visibility:visible!important;animation:none!important\}<\/style><\/noscript>/,
  );
  // The shipped CSP still forbids inline scripts: the gate is CSS + bundled JS only.
  assert.doesNotMatch(html, /<script>(?!.*application\/ld\+json)/s);
  const csp = /Content-Security-Policy "([^"]+)"/.exec(read('public/.htaccess'))?.[1] ?? '';
  assert.doesNotMatch(/script-src([^;]+)/.exec(csp)?.[1] ?? '', /'unsafe-inline'/);
});

await check('a render crash releases the design gate with the splash', () => {
  const boundary = read('src/components/common/ErrorBoundary.tsx');
  assert.match(boundary, /import \{[^}]*markDesignReady[^}]*\} from '\.\.\/\.\.\/services\/bootSplash';/);
  assert.match(boundary, /componentDidCatch\([\s\S]*?dismissBootSplash\(\);[\s\S]*?markDesignReady\(\);/);
});

// ---------------------------------------------------------------------------
// Fix 2 — AI astrologer chat visibility in the light design.
// ---------------------------------------------------------------------------

await check('CosmicBackground carries a dedicated class for the scoped fade', () => {
  assert.match(read('src/components/common/CosmicBackground.tsx'), /className="cosmic-background fixed /);
});

await check('the chat launcher and panel carry semantic light-design hooks', () => {
  const launcher = read('src/components/ai-astrologer/AiAstrologerLauncher.tsx');
  assert.match(launcher, /ai-astrologer-panel-wrap fixed bottom-24/);
  assert.match(launcher, /ai-astrologer-launcher fixed bottom-5/);
  assert.match(launcher, /ai-astrologer-hint hidden items-center/);
  const panel = read('src/components/ai-astrologer/AiAstrologerPanel.tsx');
  for (const cls of [
    'ai-astrologer-panel relative flex flex-col',
    'ai-astrologer-header relative shrink-0',
    'ai-astrologer-thread flex-1 space-y-4',
    'ai-astrologer-menu max-h-\\[42%\\]',
    'ai-astrologer-topic group flex cursor-pointer',
    'ai-astrologer-option group flex w-full cursor-pointer',
  ]) {
    assert.match(panel, new RegExp(cls), `panel must carry ${cls.split(' ')[0]}`);
  }
  assert.equal(panel.match(/ai-astrologer-bot /g)?.length, 2, 'both assistant avatars must carry ai-astrologer-bot');
});

await check('only the cosmic background fades; the chat stays fully opaque', () => {
  const css = read('src/user-designs.css');
  assert.doesNotMatch(css, /\[data-user-design\] > \.fixed \{ opacity:\.08; \}/);
  assert.match(css, /\[data-user-design\] \.cosmic-background \{ opacity:\.08; \}/);
  assert.match(
    css,
    /\[data-user-design\] :is\(\.ai-astrologer-launcher,\.ai-astrologer-panel-wrap,\.ai-astrologer-panel\) \{ opacity:1!important; \}/,
  );
});

await check('the light chat has readable header, message, menu and control surfaces', () => {
  const css = read('src/user-designs.css');
  assert.match(css, /\[data-user-design\] \.ai-astrologer-hint \{ background:var\(--surface\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-header \{ background:linear-gradient\(135deg,var\(--surface\),var\(--tint\)\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-header button:hover \{ background:var\(--tint\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-thread \{ background:var\(--paper\)!important; background-image:none!important; \}/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-bot \{ background:var\(--tint\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-menu select \{ background:var\(--surface\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-panel textarea \{ background:var\(--surface\)!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-panel textarea::placeholder \{ color:var\(--muted\);/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-topic \{ background:var\(--surface\)!important; background-image:none!important;/);
  assert.match(css, /\[data-user-design\] \.ai-astrologer-option \{ background:var\(--surface\)!important;/);
});

await check('no light chat rule leaks into the dark design', () => {
  for (const line of read('src/user-designs.css').split('\n')) {
    if (!line.includes('ai-astrologer')) continue;
    assert.ok(line.includes('[data-user-design]'), `dark chat must stay untouched: ${line.trim()}`);
  }
});

// ---------------------------------------------------------------------------
// Fix 3 — verified birthplace card in the light design.
// ---------------------------------------------------------------------------

await check('the shared picker marks the verified-location card', () => {
  assert.match(read('src/components/common/GooglePlacesPicker.tsx'), /className="verified-location-card mt-2\.5/);
});

await check('location lookup, coordinates and map behavior are untouched', () => {
  const picker = read('src/components/common/GooglePlacesPicker.tsx');
  assert.match(picker, /photon\.komoot\.io\/api\//);
  assert.match(picker, /nominatim\.openstreetmap\.org\/search/);
  assert.match(picker, /estimateTimezoneOffset\(lat, lng, country\)/);
  assert.match(picker, /getTimeZoneIdForCoordinates\(lat, lng\)/);
  assert.match(picker, /lazy\(\(\) =>\s*import\('\.\/LeafletMapPickerModal'\)/);
  assert.match(picker, /isVerifiedBirthLocation\(value\)/);
});

await check('the light card uses a light surface with readable place, country and offsets', () => {
  const css = read('src/user-designs.css');
  assert.match(
    css,
    /\[data-user-design\] \.verified-location-card \{ background:var\(--surface\)!important; background-image:none!important;/,
  );
  assert.match(css, /\[data-user-design\] \.verified-location-card div\[class\*="text-slate-900"\] \{ color:var\(--heading\)!important;/);
  assert.match(css, /\[data-user-design\] \.verified-location-card span\[class\*="bg-slate-200"\] \{ background:var\(--tint\)!important;/);
  assert.match(css, /\[data-user-design\] \.verified-location-card div\[class\*="text-slate-500"\] \{ color:var\(--muted\)!important; \}/);
  assert.match(css, /\[data-user-design\] \.verified-location-card div\[class\*="text-slate-500"\] strong \{ color:var\(--heading\)!important; \}/);
  assert.match(css, /\[data-user-design\] \.verified-location-card span\[class\*="text-amber-600"\] \{ color:var\(--accent\)!important; \}/);
});

await check('the card button keeps contrast and long names wrap inside the card', () => {
  const css = read('src/user-designs.css');
  assert.match(
    css,
    /\[data-user-design\] \.verified-location-card button \{ background:var\(--tint\)!important; color:var\(--accent\)!important;/,
  );
  assert.match(
    css,
    /\[data-user-design\] \.verified-location-card button:hover \{ background:var\(--accent\)!important; color:#fff!important;/,
  );
  assert.match(
    css,
    /\[data-user-design\] \.verified-location-card \.truncate \{ white-space:normal!important; overflow:visible!important;/,
  );
  assert.match(css, /overflow-wrap:anywhere/);
});

// ---------------------------------------------------------------------------
// TEMPORARY preview switch (?design=) — remove with the switch before merge.
// ---------------------------------------------------------------------------

await check('TEMPORARY: ?design= preview override bypasses the gate', () => {
  const app = read('src/App.tsx');
  assert.match(app, /function getPreviewDesign\(\): 'original' \| 'ivory' \| null/);
  assert.match(app, /const design = previewDesign \?\? savedDesign;/);
  assert.match(app, /url\.searchParams\.set\('design', preview\);/);
  const gate = read('src/services/bootSplash.ts');
  assert.match(gate, /const previewParam = new URLSearchParams\(window\.location\.search\)\.get\('design'\);/);
  const navbar = read('src/components/layout/Navbar.tsx');
  assert.match(navbar, /aria-label="Preview website design"/);
  assert.match(navbar, /url\.searchParams\.set\('design', value\);/);
  assert.doesNotMatch(navbar, /DesignSwitcher/);
});

console.log(`\nUser design fixes passed (${passed} checks).`);
