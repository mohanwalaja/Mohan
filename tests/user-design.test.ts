import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { COLOR_MODE_STORAGE_KEY, getSavedColorMode, saveColorMode } from '../src/services/colorMode';

const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const css = read('src/user-designs.css');
const navbar = read('src/components/layout/Navbar.tsx');
const prerender = read('scripts/prerender.mjs');

// The customer-facing choice is independent of the old admin-wide setting.
// New visitors get light, while admins keep their original dark shell.
assert.match(app, /useState<ColorMode>\(getSavedColorMode\)/);
assert.match(app, /saveColorMode\(nextMode\)/);
assert.match(app, /data-user-design=\{!isAdminRoute && colorMode === 'light' \? 'ivory' : undefined\}/);
assert.match(app, /showColorModeToggle=\{!isAdminRoute\}/);
assert.match(app, /const light = !isAdminRoute && colorMode === 'light'/);
assert.match(app, /document\.documentElement\.style\.colorScheme = light \? 'light' : 'dark'/);
assert.doesNotMatch(app, /settings\?\.userDesign|previewDesign/);
assert.doesNotMatch(read('src/pages/AdminPortal.tsx'), /UserDesignSettings/);
assert.match(prerender, /'data-user-design': 'ivory'/);
assert.match(prerender, /showColorModeToggle: true/);
assert.doesNotMatch(css, /sage|lavender/);

// No visible text accompanies the single icon, but the switch has a stable
// accessible name and announces whether dark mode is on or off.
assert.match(navbar, /role="switch"/);
assert.match(navbar, /aria-checked=\{colorMode === 'dark'\}/);
assert.match(navbar, /aria-label="Dark mode"/);
assert.match(navbar, /colorMode === 'light' \? <Moon aria-hidden="true"[\s\S]*: <Sun aria-hidden="true"/);
assert.doesNotMatch(navbar, /Test (?:dark|light)|Testing preview|not saved|<span[^>]*>.*(?:light|dark).*<\/span>/i);

// Exercise the actual storage boundary: only an explicit dark selection can
// override the light default, and blocked storage cannot break the control.
const globals = globalThis as unknown as Record<string, unknown>;
const previousWindow = globals.window;
try {
  delete globals.window;
  assert.equal(getSavedColorMode(), 'light');
  saveColorMode('dark'); // SSR/no window is safe.

  const saved = new Map<string, string>();
  globals.window = {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
    },
  };
  assert.equal(getSavedColorMode(), 'light');
  saved.set(COLOR_MODE_STORAGE_KEY, 'original');
  assert.equal(getSavedColorMode(), 'light');
  saveColorMode('dark');
  assert.equal(saved.get(COLOR_MODE_STORAGE_KEY), 'dark');
  assert.equal(getSavedColorMode(), 'dark');
  saveColorMode('light');
  assert.equal(getSavedColorMode(), 'light');

  globals.window = { localStorage: {
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => { throw new Error('Storage unavailable'); },
  } };
  assert.equal(getSavedColorMode(), 'light');
  saveColorMode('dark');
} finally {
  if (previousWindow === undefined) delete globals.window;
  else globals.window = previousWindow;
}

// Unrelated payment branding and legacy API validation remain intact.
assert.match(read('api/admin/index.php'), /in_array\(\$body\['userDesign'\], \['original', 'ivory'\], true\)/);
for (const name of ['paypal', 'google_pay', 'visa', 'master', 'american_express', 'discover']) {
  assert.ok(existsSync(`public/assets/payments/${name}.svg`));
}
assert.doesNotMatch(read('src/components/layout/Footer.tsx'), /payment-text-badges/);
assert.match(css, /\.payment-brand-logos \{ display:flex;/);
assert.doesNotMatch(css, /\[data-user-design\] \.payment-brand-logos/);
console.log('User design contracts passed: light default, persistent icon-only toggle, admin isolation, and local payment artwork.');
