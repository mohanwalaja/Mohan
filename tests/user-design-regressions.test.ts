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
const servicesPage = read('src/pages/ServicesPage.tsx');

// Boot: HTML has no CSP-sensitive inline bootstrap, prerenders stay covered,
// settings load alongside session lookup, and slow requests have bounded exits.
const splashMarkup = html.slice(html.indexOf('<div id="boot-splash"'), html.indexOf('<div id="root">'));
assert.doesNotMatch(splashMarkup, /<script\b/i, 'boot design resolution must not rely on CSP-blocked inline JavaScript');
assert.doesNotMatch(html, /html\[data-prerendered\]\s+#boot-splash\s*\{\s*display:\s*none/);
assert.match(html, /Public prerenders start on the default Ivory surface/);
assert.match(html, /html\[data-prerendered\] #boot-splash/);
assert.match(html, /background: radial-gradient\([^;]+#fffaf2/);
assert.match(auth, /const settingsRequest = refreshSettings\(\)/);
assert.match(auth, /setTimeout\(\(\) => setSettingsResolved\(true\), 4500\)/);
assert.match(auth, /finally\s*\{\s*setSettingsResolved\(true\)/);
assert.match(api, /new AbortController\(\)/);
assert.match(api, /setTimeout\(\(\) => controller\.abort\(\), 4000\)/);
assert.match(app, /function RouteLoadedMarker\(\{[\s\S]*?settingsResolved[\s\S]*?clearPrerenderedPage\(\)/);
assert.match(app, /if \(isAdminRoute \|\| settingsResolved\) dismissBootSplash\(\)/);
// Public design comes from saved admin settings; admin pages remain dark.
assert.match(app, /const activeUserDesign = settings\?\.userDesign \|\| 'ivory'/);
assert.match(app, /const isLight = !isAdminRoute && activeUserDesign === 'ivory'/);
assert.match(app, /data-user-design=\{isLight \? 'ivory' : undefined\}/);
assert.match(app, /if \(isAdminRoute \|\| settingsResolved\) dismissBootSplash\(\)/);
assert.match(app, /settingsResolved=\{settingsResolved\}/);
assert.doesNotMatch(app, /showColorModeToggle|onToggleColorMode|getSavedColorMode|saveColorMode/);
assert.doesNotMatch(navbar, /role="switch"|ColorMode|onToggleColorMode/);
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

// The Services page keeps its dark design unchanged, but its intro label and
// guided banner need readable light-only surfaces (the generic header selector
// otherwise paints a white block behind pale dark-mode text).
assert.match(servicesPage, /className="services-catalogue-header/);
assert.match(servicesPage, /className="services-catalogue-eyebrow eyebrow/);
assert.match(servicesPage, /className="beta-banner services-guided-banner/);
assert.match(css, /\[data-user-design\] \.services-catalogue-header\s*\{[\s\S]*?background:transparent!important/);
assert.match(css, /\[data-user-design\] \.services-catalogue-eyebrow\s*\{[\s\S]*?color:#713911!important/);
assert.match(css, /\[data-user-design\] \.services-guided-banner\s*\{[\s\S]*?background:linear-gradient\([^;]+!important/);
assert.match(css, /\[data-user-design\] \.services-guided-banner p\s*\{\s*color:#584638!important/);
const luminance = (hex: string) => {
  const rgb = hex.match(/[a-f0-9]{2}/gi)!.map(channel => parseInt(channel, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (foreground: string, background: string) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
assert.ok(contrast('#713911', '#f4e5d1') >= 4.5, 'Services eyebrow must meet WCAG AA');
assert.ok(contrast('#584638', '#fff7eb') >= 4.5, 'Guided-banner copy must meet WCAG AA');

// Shared place card gets explicit light colors and content-safe wrapping while
// leaving selection and map/timezone implementation untouched.
assert.match(picker, /verified-location-card/);
assert.match(picker, /\[overflow-wrap:anywhere\]/);
assert.match(css, /\.verified-location-card\s*\{[\s\S]*?background:linear-gradient\([^;]+!important/);
assert.match(css, /\.verified-location-card button:hover[\s\S]*?color:#fff/);
console.log('User design regression contracts passed: startup design gate, AI chat, and verified birthplace card.');
