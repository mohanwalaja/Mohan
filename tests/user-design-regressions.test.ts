import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const auth = read('src/context/AuthContext.tsx');
const api = read('src/services/api.ts');
const html = read('index.html');
const css = read('src/user-designs.css');
const navbar = read('src/components/layout/Navbar.tsx');
const cosmic = read('src/components/common/CosmicBackground.tsx');
const launcher = read('src/components/ai-astrologer/AiAstrologerLauncher.tsx');
const panel = read('src/components/ai-astrologer/AiAstrologerPanel.tsx');
const picker = read('src/components/common/GooglePlacesPicker.tsx');

// Boot: HTML has no CSP-sensitive inline bootstrap, prerenders stay covered,
// settings load alongside session lookup, and slow requests have bounded exits.
const splashMarkup = html.slice(html.indexOf('<div id="boot-splash"'), html.indexOf('<div id="root">'));
assert.doesNotMatch(splashMarkup, /<script\b/i, 'boot design resolution must not rely on CSP-blocked inline JavaScript');
assert.doesNotMatch(html, /html\[data-prerendered\]\s+#boot-splash\s*\{\s*display:\s*none/);
assert.match(html, /Keep customer prerenders covered until saved design settings resolve/);
assert.match(auth, /const settingsRequest = refreshSettings\(\)/);
assert.match(auth, /setTimeout\(\(\) => setSettingsResolved\(true\), 4500\)/);
assert.match(auth, /finally\s*\{\s*setSettingsResolved\(true\)/);
assert.match(api, /new AbortController\(\)/);
assert.match(api, /setTimeout\(\(\) => controller\.abort\(\), 4000\)/);
assert.match(app, /if \(isAdminRoute \|\| settingsResolved\) dismissBootSplash\(\)/);
assert.match(app, /showDesignPreview=\{!isAdminRoute\}/);

// A non-persisted navbar switch exercises both customer designs but cannot
// affect the admin route or alter the saved settings value.
assert.match(navbar, /role="switch"/);
assert.match(navbar, /aria-checked=\{designPreview === 'ivory'\}/);
assert.match(navbar, /not saved/);
assert.match(app, /setPreviewDesign\(\(current\) => \(current \?\? savedDesign\)/);
assert.match(app, /data-user-design=\{!isAdminRoute && design !== 'original' \? design : undefined\}/);
assert.doesNotMatch(navbar, /updateAdminSettings|localStorage/);

// Only the decorative cosmic layer is dimmed; fixed chat interfaces remain
// opaque, with dedicated light-theme surfaces that do not change dark mode.
assert.match(cosmic, /className="cosmic-background fixed/);
assert.doesNotMatch(css, /\[data-user-design\]\s*>\s*\.fixed/);
assert.match(css, /\[data-user-design\]\s*>\s*\.cosmic-background\s*\{\s*opacity:\.08/);
assert.match(launcher, /ai-astrologer-launcher fixed/);
assert.match(launcher, /ai-astrologer-panel-shell fixed/);
assert.match(panel, /ai-astrologer-header/);
assert.match(panel, /ai-astrologer-conversation/);
assert.match(panel, /ai-astrologer-controls/);
assert.match(css, /\[data-user-design="ivory"\] \.ai-astrologer-header[\s\S]*?background:linear-gradient/);
assert.match(css, /\[data-user-design="ivory"\] \.ai-astrologer-conversation/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.ai-astrologer-panel-shell/);

// Shared place card gets explicit light colors and content-safe wrapping while
// leaving selection and map/timezone implementation untouched.
assert.match(picker, /verified-location-card/);
assert.match(picker, /\[overflow-wrap:anywhere\]/);
assert.match(css, /\.verified-location-card\s*\{[\s\S]*?background:linear-gradient\([^;]+!important/);
assert.match(css, /\.verified-location-card button:hover[\s\S]*?color:#fff/);
console.log('User design regression contracts passed: startup, preview switch, AI chat, and verified birthplace card.');
