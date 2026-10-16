/**
 * Site design switch contract — the TWO shipped designs, one admin setting.
 *
 * THE FEATURE: ASTRO SIVAM keeps the classic dark/indigo design (repo root,
 * src/) and adds the light Sunrise Ivory design (its own bundle, light/). The
 * operator picks between them in Admin → Site Design; that choice is persisted
 * as `activeThemeTemplate`, and public/.htaccess serves the matching prerendered
 * documents at the SAME canonical URLs.
 *
 * WHAT THIS PINS (each one has a way of silently regressing):
 *   SOURCE  · exactly two design ids, named in one place on each side of the
 *             wire (src/services/designSwitch.ts, api/config.php) and closed —
 *             an unknown id is rejected, never stored;
 *           · the activation marker api/.design-light is the only thing the
 *             light rewrite is allowed to depend on, so the classic design keeps
 *             today's static path and a host that refuses the marker write
 *             degrades to the classic design instead of half-switching;
 *           · the four account/operator routes (login, register, dashboard,
 *             admin) have no light document, in the marker rule, in the
 *             prerender and in the preview middleware alike;
 *           · the build runs the light build AFTER the classic prerender (the
 *             classic documents are the SEO source) and prerenders the light
 *             documents after that.
 *   BEHAVIOUR · the light bundle's boot gate is EXECUTED: a light document whose
 *             operator has switched back to the classic design navigates to the
 *             classic page; an unreachable API or a malformed payload keeps the
 *             light design (the rewrite only fires while the light design is
 *             active), and nothing ever throws.
 *   BUILT   · every light route ships pages/<route>-light.html with fresh .br/
 *             .gz siblings, and every one of those documents passes the very
 *             same guards the classic build runs: no dev-style asset URLs, one
 *             <title>, a self-referencing canonical, real body text, and
 *             crawlable internal links (the light design is the same site).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_ACTIVATION_MARKER,
  DEFAULT_THEME_TEMPLATE,
  LIGHT_DESIGN_DOCUMENT_SUFFIX,
  LIGHT_DESIGN_EXCLUDED_ROUTES,
  LIGHT_THEME_TEMPLATE,
  SHIPPED_THEME_TEMPLATES,
  isLightThemeTemplate,
  lightDocumentName,
  normalizeThemeTemplate,
  readActiveThemeTemplate,
  resolveLightDocumentDesign,
} from '../src/services/designSwitch';
import { routeHref } from '../src/services/routePaths';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const abs = (relative: string) => path.join(projectRoot, relative);

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const prerender = await import(new URL('../scripts/prerender.mjs', import.meta.url).href);
const prerenderLight = await import(new URL('../scripts/prerender-light.mjs', import.meta.url).href);

console.log('--- SITE DESIGN SWITCH CONTRACT (two designs, one admin setting) ---');

// ---------------------------------------------------------------------------
// 1. One closed set of design ids, named on both sides of the wire.
// ---------------------------------------------------------------------------

await check('exactly two shipped designs, and only one of them is light', () => {
  assert.deepEqual([...SHIPPED_THEME_TEMPLATES], ['classic-primary', 'sunrise-ivory']);
  assert.equal(DEFAULT_THEME_TEMPLATE, 'classic-primary');
  assert.equal(LIGHT_THEME_TEMPLATE, 'sunrise-ivory');
  assert.equal(isLightThemeTemplate('sunrise-ivory'), true);
  assert.equal(isLightThemeTemplate('classic-primary'), false);
  assert.equal(isLightThemeTemplate('midnight'), false);
  assert.equal(normalizeThemeTemplate('sunrise-ivory'), 'sunrise-ivory');
  assert.equal(normalizeThemeTemplate('nonsense'), DEFAULT_THEME_TEMPLATE, 'an unknown id must fall back to the classic design');
  assert.equal(normalizeThemeTemplate(null), DEFAULT_THEME_TEMPLATE);
});

await check('the activation marker path is the one api/config.php and public/.htaccess use', () => {
  assert.equal(DESIGN_ACTIVATION_MARKER, 'api/.design-light');
  assert.equal(LIGHT_DESIGN_DOCUMENT_SUFFIX, '-light.html');
  assert.equal(lightDocumentName('services.html'), 'services-light.html');
  assert.equal(lightDocumentName('index'), 'index-light.html');
  assert.deepEqual([...LIGHT_DESIGN_EXCLUDED_ROUTES], ['login', 'register', 'dashboard', 'admin']);

  const config = read('api/config.php');
  assert.match(config, /define\('ASTRO_SHIPPED_THEME_TEMPLATES', \['classic-primary', 'sunrise-ivory'\]\)/);
  assert.match(config, /define\('ASTRO_DEFAULT_THEME_TEMPLATE', 'classic-primary'\)/);
  assert.match(config, /define\('ASTRO_LIGHT_THEME_TEMPLATE', 'sunrise-ivory'\)/);
  assert.match(config, /function astro_design_marker_path\(\)[\s\S]{0,220}__DIR__ \. '\/\.design-light'/, 'the marker must live at api/.design-light');
  assert.match(config, /function astro_sync_design_marker\(\$themeTemplate\)/);
  assert.match(config, /function astro_normalize_theme_template\(\$value\)/);
});

await check('the admin settings PUT rejects an unknown design and syncs the marker', () => {
  const admin = read('api/admin/index.php');
  assert.match(
    admin,
    /if \(array_key_exists\('activeThemeTemplate', \$body\)\)[\s\S]{0,600}!in_array\(\$requestedDesign, ASTRO_SHIPPED_THEME_TEMPLATES, true\)[\s\S]{0,600}jsonResponse\(\[[\s\S]{0,600}\], 400\);/,
    'an unknown design id must be rejected with 400 before it can reach general_settings',
  );
  assert.match(
    admin,
    /\$designSwitch = astro_sync_design_marker\(/,
    'the api/.design-light marker is the switch, so it must be synced in the same request that saves the setting',
  );
  assert.match(admin, /'designSwitch' => \$designSwitch/, 'the panel needs the marker state to warn when the host refuses the write');
  assert.match(admin, /astro_normalize_theme_template\(\$settings\['activeThemeTemplate'\]/, 'the GET side must only ever report one of the two designs');
  assert.match(admin, /'activeThemeTemplate' => ASTRO_DEFAULT_THEME_TEMPLATE/);
});

await check('the public settings payload normalizes the design id too', () => {
  const services = read('api/services/index.php');
  assert.match(
    services,
    /\$settings\['activeThemeTemplate'\] = astro_normalize_theme_template\(/,
    'the light bundle reads this payload to detect that the operator switched back',
  );
  assert.match(services, /'activeThemeTemplate' => ASTRO_DEFAULT_THEME_TEMPLATE/);
});

// ---------------------------------------------------------------------------
// 2. Serving: the light rewrite depends on the marker ALONE, and the classic
//    rules stay untouched.
// ---------------------------------------------------------------------------

await check('.htaccess serves the light documents only while the marker exists', () => {
  const htaccess = read('public/.htaccess');
  const markerGuard = htaccess.indexOf('RewriteCond %{DOCUMENT_ROOT}/api/.design-light -f');
  assert.ok(markerGuard > 0, 'the light rewrite must be guarded by the activation marker');

  assert.match(
    htaccess,
    /RewriteCond %\{DOCUMENT_ROOT\}\/api\/\.design-light -f\s*\n\s*RewriteCond %\{DOCUMENT_ROOT\}\/pages\/index-light\.html -f\s*\n\s*RewriteRule \^\/\?\$ \/pages\/index-light\.html \[L\]/,
    'the homepage light document must be reachable through the marker guard',
  );
  assert.match(
    htaccess,
    /RewriteCond %\{DOCUMENT_ROOT\}\/api\/\.design-light -f\s*\n\s*RewriteCond %\{DOCUMENT_ROOT\}\/pages\/\$1-light\.html -f\s*\n\s*RewriteRule \^\(([^)]+)\)\/\?\$ \/pages\/\$1-light\.html \[L\]/,
    'clean URLs must resolve to the light documents',
  );

  const lightRule = /RewriteRule \^\(([^)]+)\)\/\?\$ \/pages\/\$1-light\.html \[L\]/.exec(htaccess);
  const lightSlugs = (lightRule?.[1] ?? '').split('|');
  const lightRoutes = prerender.ROUTES.filter((route: { routeKey: string }) => !LIGHT_DESIGN_EXCLUDED_ROUTES.includes(route.routeKey as never));
  for (const route of lightRoutes) {
    const slug = String(route.path).replace(/^\//, '');
    if (slug === '') continue;
    assert.ok(lightSlugs.includes(slug), `${route.path} has a light document but no .htaccess rule`);
  }
  for (const excluded of LIGHT_DESIGN_EXCLUDED_ROUTES) {
    const slug = excluded === 'admin' ? 'admin' : excluded;
    assert.ok(!lightSlugs.includes(slug), `${slug} must keep the classic interface — it has no light document`);
  }
  assert.ok(!lightSlugs.includes('admin'), 'the admin portal is never re-skinned');
});

await check('the classic prerendered-route rule is still exactly where it was', () => {
  const htaccess = read('public/.htaccess');
  assert.match(htaccess, /RewriteCond %\{DOCUMENT_ROOT\}\/pages\/\$1\.html -f/, 'the classic guard must survive');
  assert.match(
    htaccess,
    /RewriteRule \^\(services\|birth-jathagam\|[\s\S]{0,400}\)\s*\/\?\$ \/pages\/\$1\.html \[L\]/,
    'the classic clean-URL rule must survive — the dark design keeps today\'s serving path',
  );
  // The light rules must sit BEFORE the classic ones (rewrite order decides).
  const lightAt = htaccess.indexOf('/pages/$1-light.html [L]');
  const classicAt = htaccess.indexOf('/pages/$1.html [L]');
  assert.ok(lightAt > 0 && classicAt > lightAt, 'the marker-guarded light rules must be evaluated before the classic rewrite');
});

await check('the preview server mirrors the same switch and the same route list', () => {
  const config = read('vite.config.ts');
  assert.match(config, /function previewServeSiteDesign\(\): Plugin/, 'a preview that cannot exercise the switch cannot verify it');
  assert.match(config, /path\.join\(outDir, 'api', '\.design-light'\)/);
  assert.match(config, /previewServeSiteDesign\(\), previewServePrerendered\(\)/, 'the design middleware must run first');
  const routes = /const LIGHT_DESIGN_ROUTES = \[([\s\S]*?)\];/.exec(config)?.[1] ?? '';
  const slugs = [...routes.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  const expected = prerender.ROUTES.filter((r: { routeKey: string }) => !LIGHT_DESIGN_EXCLUDED_ROUTES.includes(r.routeKey as never))
    .map((r: { path: string }) => String(r.path).replace(/^\//, ''))
    .filter(Boolean);
  for (const slug of expected) assert.ok(slugs.includes(slug), `preview middleware is missing ${slug}`);
  for (const excluded of LIGHT_DESIGN_EXCLUDED_ROUTES) assert.ok(!slugs.includes(excluded));
});

await check('the light prerender excludes exactly the same four routes', () => {
  assert.deepEqual([...prerenderLight.NO_LIGHT_DOCUMENT], [...LIGHT_DESIGN_EXCLUDED_ROUTES]);
  const routeKeys = prerenderLight.LIGHT_ROUTES.map((route: { routeKey: string }) => route.routeKey);
  assert.equal(routeKeys.length, prerender.ROUTES.length - LIGHT_DESIGN_EXCLUDED_ROUTES.length);
  for (const excluded of LIGHT_DESIGN_EXCLUDED_ROUTES) assert.ok(!routeKeys.includes(excluded));
});

// ---------------------------------------------------------------------------
// 3. Build order: classic documents first (they are the SEO source).
// ---------------------------------------------------------------------------

await check('npm run build prerenders the classic documents before the light ones', () => {
  const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
  const build = scripts.build ?? '';
  const classicAt = build.indexOf('node scripts/prerender.mjs');
  const lightBuildAt = build.indexOf('build:light:deploy');
  const lightAt = build.indexOf('node scripts/prerender-light.mjs');
  assert.ok(classicAt > 0 && lightBuildAt > classicAt && lightAt > lightBuildAt, `build order is wrong: ${build}`);
  assert.equal(scripts['build:light:deploy'], 'vite build --config light/vite.config.ts --mode light-deploy');
  const lightConfig = read('light/vite.config.ts');
  assert.match(lightConfig, /mode === 'light-deploy'/, 'the deploy build must be opt-in: the standalone preview keeps its own output');
  assert.match(lightConfig, /path\.resolve\(repoRoot, 'dist', 'assets', 'light'\)/, 'light bytes must land inside the approved assets/ folder');
  assert.match(lightConfig, /publicDir: deploy \? false/, 'the deploy build must not re-copy public/ into assets/light/');
});

await check('the admin portal exposes the design section', () => {
  const portal = read('src/pages/AdminPortal.tsx');
  assert.match(portal, /import \{ DesignPanel \} from '\.\.\/components\/admin\/DesignPanel';/);
  assert.match(portal, /'design'/, 'the section must be part of the activeSection union');
  assert.match(portal, /onClick=\{\(\) => setActiveSection\('design'\)\}/, 'the operator needs a tab to reach it');
  assert.match(portal, /activeSection === 'design' && \(/, 'the section must actually render the panel');
  assert.match(portal, /<DesignPanel[\s\S]{0,300}onUpdateSettings=\{handleUpdateSettingsGeneric\}/);

  const panel = read('src/components/admin/DesignPanel.tsx');
  assert.match(panel, /api\.updateAdminSettings\(\{ activeThemeTemplate: design \}\)/, 'the panel must save through the settings endpoint the PHP whitelist guards');
  assert.match(panel, /markerWritten === false/, 'a refused marker write must be surfaced, never swallowed');
  assert.match(panel, /lucide-react/);
  assert.match(panel, /themeTemplateId|activeThemeTemplate/, 'the panel reads the stored setting');

  const theme = read('src/context/ThemeContext.tsx');
  assert.match(theme, /Record<PaintThemeTemplateId, ThemeTemplateConfig>/, 'the light design is a separate document set, not a runtime paint template');
  const types = read('src/types/index.ts');
  assert.match(types, /export type ThemeTemplateId = 'classic-primary' \| 'sunrise-ivory';/);
  assert.match(types, /export interface DesignSwitchState/);
});

// ---------------------------------------------------------------------------
// 4. The light bundle's boot gate, EXECUTED.
// ---------------------------------------------------------------------------

const settingsPayload = (design: string) => ({ success: true, settings: { activeThemeTemplate: design } });

const runGate = async (payload: unknown, pathname = '/pages/services-light.html') => {
  const navigations: string[] = [];
  const active = await resolveLightDocumentDesign({
    settingsUrl: 'api/services.php?action=settings',
    location: { pathname, search: '', hash: '' },
    storage: null,
    navigate: (destination) => navigations.push(destination),
    fetchImpl: (async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch,
  });
  return { active, navigations };
};

await check('a light document whose operator chose the classic design sends the visitor back', async () => {
  const { active, navigations } = await runGate(settingsPayload('classic-primary'));
  assert.equal(active, 'classic-primary');
  assert.deepEqual(navigations, ['/services'], 'the classic design serves the clean URL itself');

  const home = await runGate(settingsPayload('classic-primary'), '/pages/index-light.html');
  assert.deepEqual(home.navigations, ['/'], 'the homepage light document must return to /');
});

await check('a light document under the light design stays exactly where it is', async () => {
  const { active, navigations } = await runGate(settingsPayload('sunrise-ivory'));
  assert.equal(active, 'sunrise-ivory');
  assert.deepEqual(navigations, [], 'no navigation when the operator still wants this design');
});

await check('an unreachable or design-less settings response keeps the light document', async () => {
  for (const payload of [null, {}, { settings: {} }, { data: {} }, { success: false }]) {
    const { active, navigations } = await runGate(payload);
    assert.equal(active, 'sunrise-ivory', `payload ${JSON.stringify(payload)} must not bounce the visitor`);
    assert.deepEqual(navigations, []);
  }

  // A payload that DOES name a design decides — and an id outside the two
  // shipped designs resolves to the classic default (the API normalizes, so
  // this is a hand-edited database talking).
  const unknown = await runGate({ settings: { activeThemeTemplate: 'who-knows' } });
  assert.equal(unknown.active, 'classic-primary');
  assert.deepEqual(unknown.navigations, ['/services']);

  const failing = await resolveLightDocumentDesign({
    settingsUrl: 'api/services.php?action=settings',
    location: { pathname: '/pages/services-light.html', search: '', hash: '' },
    storage: null,
    navigate: () => {
      throw new Error('must not navigate');
    },
    fetchImpl: (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch,
  });
  assert.equal(failing, 'sunrise-ivory');
});

await check('the public payload is read in every shape the API is served in', () => {
  assert.equal(readActiveThemeTemplate({ activeThemeTemplate: 'sunrise-ivory' }), 'sunrise-ivory');
  assert.equal(readActiveThemeTemplate({ settings: { activeThemeTemplate: 'sunrise-ivory' } }), 'sunrise-ivory');
  assert.equal(readActiveThemeTemplate({ data: { settings: { activeThemeTemplate: 'classic-primary' } } }), 'classic-primary');
  assert.equal(readActiveThemeTemplate({ data: { activeThemeTemplate: 'classic-primary' } }), 'classic-primary');
  assert.equal(readActiveThemeTemplate(null), undefined);
  assert.equal(readActiveThemeTemplate('sunrise-ivory'), undefined);
});

// ---------------------------------------------------------------------------
// 5. Built output: the light documents pass the same guards the classic ones do.
// ---------------------------------------------------------------------------

const distDir = abs('dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to verify the shipped light documents.');
} else {
  await check('every light route shipped its document inside dist/pages with compressed siblings', () => {
    const lightRoutes = prerender.ROUTES.filter((route: { routeKey: string }) => !LIGHT_DESIGN_EXCLUDED_ROUTES.includes(route.routeKey as never));
    for (const route of lightRoutes) {
      const file = prerenderLight.lightDocumentFile(route);
      const filePath = path.join(distDir, 'pages', file);
      assert.ok(fs.existsSync(filePath), `missing light document dist/pages/${file}`);
      const bytes = fs.readFileSync(filePath);
      for (const sibling of ['.br', '.gz']) {
        const siblingPath = `${filePath}${sibling}`;
        assert.ok(fs.existsSync(siblingPath), `missing ${sibling} sibling for dist/pages/${file} — .htaccess negotiates to it`);
        assert.ok(fs.statSync(siblingPath).size > 0);
      }
      assert.ok(bytes.length > 1024, `dist/pages/${file} is suspiciously small`);
      // The physical .html URL must never exist at the deploy root.
      assert.ok(!fs.existsSync(path.join(distDir, file)), `${file} must not sit at the dist root`);
    }
    assert.ok(fs.existsSync(path.join(distDir, 'pages', 'index-light.html')), 'the homepage needs its light document too');
    for (const excluded of LIGHT_DESIGN_EXCLUDED_ROUTES) {
      assert.ok(
        !fs.existsSync(path.join(distDir, 'pages', `${excluded}-light.html`)),
        `${excluded} must keep the classic design — no light document may ship for it`,
      );
    }
  });

  await check('the light documents carry the same SEO, splash and asset contract as the classic ones', () => {
    const lightRoutes = prerender.ROUTES.filter((route: { routeKey: string }) => !LIGHT_DESIGN_EXCLUDED_ROUTES.includes(route.routeKey as never));
    const titles = new Set<string>();
    for (const route of lightRoutes) {
      const file = path.join(distDir, 'pages', prerenderLight.lightDocumentFile(route));
      const html = fs.readFileSync(file, 'utf8');
      const label = `dist/pages/${path.basename(file)}`;

      assert.match(html, /<html[^>]*data-prerendered="true"/, `${label} must declare itself prerendered (the light router reads this)`);
      assert.equal(html.match(/id="boot-splash"/g)?.length, 1, `${label} must carry exactly one boot splash`);
      const splashAt = html.indexOf('<div id="boot-splash"');
      const rootAt = html.indexOf('<div id="root">');
      assert.ok(splashAt > 0 && rootAt > splashAt, `${label} must place the splash before #root`);
      const styleAt = html.indexOf('<style id="boot-critical">');
      const cssAt = html.indexOf('<link rel="stylesheet"');
      assert.ok(styleAt > 0 && cssAt > styleAt, `${label} must parse the boot style before the app stylesheet`);
      assert.match(html, /<noscript><style>#boot-splash\{display:none!important\}<\/style><\/noscript>/);

      const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
      assert.ok(title.length > 10, `${label} lost its <title>`);
      assert.ok(!titles.has(title), `${label} duplicates the title of another light document: ${title}`);
      titles.add(title);

      const expectedCanonical = route.path === '/' ? `${prerender.ORIGIN}/` : `${prerender.ORIGIN}${route.path}`;
      const canonical = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*>/gi)].map((m) => m[0]);
      assert.equal(canonical.length, 1, `${label} must carry exactly one canonical`);
      assert.ok(canonical[0].includes(`href="${expectedCanonical}"`), `${label} canonical must be ${expectedCanonical} — the light design lives at the same URLs`);
      assert.match(html, /<meta[^>]*name="robots"/, `${label} lost its robots meta`);
      assert.match(html, /"@type":"(WebPage|FAQPage|BreadcrumbList)"/, `${label} must carry the page's JSON-LD`);

      assert.doesNotMatch(html, /["'(]\/src\//, `${label} still contains dev-style /src/ asset URLs`);
      assert.doesNotMatch(html, /\/@fs\//, `${label} still contains dev-server asset URLs`);
      assert.match(html, /<script[^>]*src="\/assets\/light\/index-[A-Za-z0-9_-]+\.js"/, `${label} must load the light bundle from assets/light/`);
      assert.match(html, /<link[^>]*rel="stylesheet"[^>]*href="\/assets\/light\/index-[A-Za-z0-9_-]+\.css"/, `${label} must load the light stylesheet from assets/light/`);
      assert.doesNotMatch(html, /assets\/index-[A-Za-z0-9_-]+\.js/, `${label} must not preload the classic bundle`);

      const body = html.slice(rootAt);
      const problems: string[] = prerender.crawlableLinkProblems(body);
      assert.deepEqual(problems, [], `${label} must stay crawlable: ${problems.join('; ')}`);
      const text = prerender.readableText(body);
      assert.ok(text.length >= 400, `${label} body text is only ${text.length} chars — crawlers would see an empty page`);

      // Same wording as the classic document: the light design is a re-skin.
      const classic = fs.readFileSync(
        route.path === '/' ? path.join(distDir, 'index.html') : path.join(distDir, 'pages', route.file),
        'utf8',
      );
      const classicTitle = /<title[^>]*>([^<]*)<\/title>/.exec(classic)?.[1] ?? '';
      assert.equal(title, classicTitle, `${label} must ship the same <title> the classic document publishes`);
    }
  });

  await check('the light bundle ships inside dist/assets/light with no build leftovers', () => {
    const lightDir = path.join(distDir, 'assets', 'light');
    assert.ok(fs.existsSync(lightDir), 'dist/assets/light is missing — did the deploy build run?');
    const files = fs.readdirSync(lightDir);
    assert.ok(files.some((name) => /^index-[A-Za-z0-9_-]+\.js$/.test(name)), 'the light entry bundle is missing');
    assert.ok(files.some((name) => /^index-[A-Za-z0-9_-]+\.css$/.test(name)), 'the light stylesheet is missing');
    assert.ok(!files.includes('index.html'), 'the light build index.html is a build input, not a deployable file');
    assert.ok(!fs.existsSync(path.join(lightDir, '.vite')), 'the light build manifest must be deleted after prerendering');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
      );
    for (const file of walk(lightDir)) {
      assert.ok(!file.endsWith('.map') && !file.endsWith('.cjs'), `unexpected deploy file ${path.relative(projectRoot, file)}`);
    }
  });

  await check('every light document links only canonical URLs the classic site actually serves', () => {
    const canonicalPaths = new Set(prerender.ROUTES.map((route: { path: string }) => route.path));
    const lightRoutes = prerender.ROUTES.filter((route: { routeKey: string }) => !LIGHT_DESIGN_EXCLUDED_ROUTES.includes(route.routeKey as never));
    for (const route of lightRoutes) {
      const html = fs.readFileSync(path.join(distDir, 'pages', prerenderLight.lightDocumentFile(route)), 'utf8');
      const body = html.slice(html.indexOf('<div id="root">'));
      for (const match of body.matchAll(/<a\b[^>]*\shref="(\/[^"#]*)"[^>]*>/g)) {
        const href = match[1];
        if (href.startsWith('//')) continue;
        assert.ok(canonicalPaths.has(href), `${route.path} light document links ${href}, which is not a prerendered canonical URL`);
      }
    }
    assert.equal(routeHref('policy-privacy'), '/privacy-policy');
  });
}

console.log(`\nSite design switch contract passed (${passed} checks).`);
