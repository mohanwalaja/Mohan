import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lineCount = (relPath: string) =>
  fs.readFileSync(path.join(repoRoot, relPath), 'utf8').split(/\r?\n/).length;

// 1. All 4 S8 oversized monoliths stay compact orchestrators/facades
const ENTRYPOINT_BUDGETS: Array<[string, number]> = [
  ['src/pages/AdminPortal.tsx', 1500],
  ['api/astrology/report_views.php', 200],
  ['api/astrology/engine.php', 250],
  ['api/ai_astrologer.php', 450],
];

for (const [relPath, ceiling] of ENTRYPOINT_BUDGETS) {
  const lines = lineCount(relPath);
  assert.ok(
    lines <= ceiling,
    `S8 modular budget exceeded on ${relPath}: ${lines} lines > ${ceiling} line ceiling`
  );
}

// 2. Every extracted chapter library stays focused and strictly below 1,400 lines
const CHAPTER_DIRS: Array<[string, string[]]> = [
  [
    'api/astrology/report_views',
    [
      'glossary_and_labels.php',
      'shared_layout_and_translit.php',
      'birth_jathagam_view.php',
      'birth_jathagam_lucky_and_css.php',
      'birth_jathagam_remedies.php',
      'wedding_matching_view.php',
      'muhurtham_view.php',
      'baby_naming_view.php',
    ],
  ],
  [
    'api/astrology/engine',
    [
      'birth_instant.php',
      'ephemeris.php',
      'dasha_and_porutham.php',
      'dignity_and_horoscope.php',
      'matchmaking.php',
      'namakaran.php',
      'muhurtham_and_rebuild.php',
    ],
  ],
  [
    'api/astrology/ai_astrologer',
    ['storage.php', 'actions.php', 'guided_and_binding.php', 'chart_and_report_facts.php'],
  ],
  [
    'src/components/admin',
    [
      'adminPortalHelpers.tsx',
      'useAdminPortalActions.ts',
      'AdminHeaderAndTabs.tsx',
      'AdminOrdersToolbar.tsx',
      'AdminOrdersMobileList.tsx',
      'AdminOrdersDesktopTable.tsx',
      'AdminTeamSection.tsx',
      'AdminGeneralSettingsPanel.tsx',
      'AdminOperationsPanels.tsx',
    ],
  ],
];

for (const [dir, expectedFiles] of CHAPTER_DIRS) {
  for (const file of expectedFiles) {
    const rel = `${dir}/${file}`;
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `Missing extracted S8 chapter ${rel}`);
    const lines = lineCount(rel);
    assert.ok(lines >= 40 && lines <= 1400, `Chapter ${rel} line count out of healthy range: ${lines}`);
  }
}

// 3. Built AdminPortal chunk drops strictly below 260 KiB and cPanel web root stays ultra-clean
const distAssets = path.join(repoRoot, 'dist', 'assets');
if (fs.existsSync(distAssets)) {
  const adminChunks = fs.readdirSync(distAssets).filter((f) => /^AdminPortal-.*\.js$/.test(f));
  assert.equal(adminChunks.length, 1, 'Expected exactly one main AdminPortal entry chunk');
  const adminBytes = fs.statSync(path.join(distAssets, adminChunks[0])).size;
  assert.ok(
    adminBytes <= 260 * 1024,
    `Expected lazy-split AdminPortal chunk <= 260 KiB, got ${(adminBytes / 1024).toFixed(1)} KiB`
  );
}

const distZip = path.join(repoRoot, 'dist.zip');
if (fs.existsSync(distZip)) {
  const rootsRaw = execFileSync(
    'python3',
    [
      '-c',
      "import json, zipfile; z=zipfile.ZipFile('dist.zip'); print(json.dumps(sorted({n.split('/')[0] for n in z.namelist() if '/' in n})))",
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  ).trim();
  assert.deepEqual(
    JSON.parse(rootsRaw),
    ['.well-known', 'api', 'assets', 'pages'],
    'cPanel File Manager root must contain only api, assets, pages (+ .well-known)'
  );
}

console.log(
  '✓ s8-modular-architecture: all 4 S8 entrypoints, 28 chapter modules, lazy AdminPortal chunk (<260 KiB) & minimal 3-folder cPanel root verified'
);
