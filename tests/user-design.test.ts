import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const css = read('src/user-designs.css');
const panel = read('src/components/admin/UserDesignSettings.tsx');
assert.match(app, /settings\?\.userDesign === 'ivory' \? 'ivory' : 'original'/);
assert.match(app, /data-user-design=\{!isAdminRoute && design !== 'original' \? design : undefined\}/);
assert.doesNotMatch(app, /useUserDesign|selectDesign|localStorage/);
assert.doesNotMatch(css, /sage|lavender/);
assert.doesNotMatch(read('src/components/layout/Navbar.tsx'), /DesignSwitcher/);
assert.match(panel, /value="original"/);
assert.match(panel, /value="ivory"/);
assert.match(panel, /api\.updateAdminSettings\(\{ userDesign: design \}\)/);
assert.match(read('api/admin/index.php'), /in_array\(\$body\['userDesign'\], \['original', 'ivory'\], true\)/);
for (const name of ['paypal', 'google_pay', 'visa', 'master', 'american_express', 'discover']) {
  assert.ok(existsSync(`public/assets/payments/${name}.svg`));
}
console.log('User design contracts passed: two choices, server persistence, admin exclusion, no local preview override, and local payment artwork.');
