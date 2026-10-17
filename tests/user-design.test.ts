import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const css = read('src/user-designs.css');
const navbar = read('src/components/layout/Navbar.tsx');
const prerender = read('scripts/prerender.mjs');
const admin = read('src/pages/AdminPortal.tsx');

// The current product contract is admin-selected public design, with the
// admin panel itself always dark. A valid cached design is used immediately;
// an uncached public page stays behind the boot splash until settings resolve.
assert.match(app, /const activeUserDesign = settings\?\.userDesign \|\| 'ivory'/);
assert.match(app, /const isLight = !isAdminRoute && activeUserDesign === 'ivory'/);
assert.match(app, /data-user-design=\{isLight \? 'ivory' : undefined\}/);
assert.match(app, /document\.documentElement\.style\.colorScheme = isLight \? 'light' : 'dark'/);
assert.match(app, /if \(isAdminRoute \|\| settingsResolved\) dismissBootSplash\(\)/);
assert.match(app, /settingsResolved=\{settingsResolved\}/);
assert.match(admin, /handleUpdateSettingsGeneric\(\{ userDesign: 'ivory' \}\)/);
assert.match(admin, /handleUpdateSettingsGeneric\(\{ userDesign: 'original' \}\)/);
assert.match(read('api/admin/index.php'), /in_array\(\$body\['userDesign'\], \['original', 'ivory'\], true\)/);
assert.doesNotMatch(app, /getSavedColorMode|saveColorMode|showColorModeToggle|onToggleColorMode/);
assert.doesNotMatch(navbar, /ColorMode|role="switch"|onToggleColorMode/);
assert.match(prerender, /'data-user-design': 'ivory'/);
assert.doesNotMatch(prerender, /showColorModeToggle|onToggleColorMode|colorMode: 'light'/);
assert.doesNotMatch(css, /sage|lavender/);

// No local navbar override can bypass the admin-selected public setting.
assert.doesNotMatch(navbar, /localStorage|updateAdminSettings/);

// Unrelated payment branding and legacy API validation remain intact.
assert.match(read('api/admin/index.php'), /in_array\(\$body\['userDesign'\], \['original', 'ivory'\], true\)/);
for (const name of ['paypal', 'google_pay', 'visa', 'master', 'american_express', 'discover']) {
  assert.ok(existsSync(`public/assets/payments/${name}.svg`));
}
assert.doesNotMatch(read('src/components/layout/Footer.tsx'), /payment-text-badges/);
assert.match(css, /\.payment-brand-logos \{ display:flex;/);
assert.doesNotMatch(css, /\[data-user-design\] \.payment-brand-logos/);
console.log('User design contracts passed: admin-selected public design, dark admin shell, and local payment artwork.');
