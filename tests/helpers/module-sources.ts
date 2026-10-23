import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ADMIN_PORTAL_CHAPTERS = [
  'src/pages/AdminPortal.tsx',
  'src/components/admin/adminPortalHelpers.tsx',
  'src/components/admin/useAdminPortalActions.ts',
  'src/components/admin/AdminHeaderAndTabs.tsx',
  'src/components/admin/AdminOrdersToolbar.tsx',
  'src/components/admin/AdminOrdersMobileList.tsx',
  'src/components/admin/AdminOrdersDesktopTable.tsx',
  'src/components/admin/AdminTeamSection.tsx',
  'src/components/admin/AdminGeneralSettingsPanel.tsx',
  'src/components/admin/AdminOperationsPanels.tsx',
];

function stripOuterPhpAndTraitWrapper(code: string): string {
  let out = code.replace(/^<\?php\s*/, '');
  const traitMatch = out.match(/^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?trait\s+\w+\s*\{/);
  if (traitMatch) {
    out = out.slice(traitMatch[0].length).replace(/\}\s*$/, '');
  }
  return out;
}

function expandPhpEntrypoint(entryAbsPath: string): string {
  const dir = path.dirname(entryAbsPath);
  const raw = fs.readFileSync(entryAbsPath, 'utf8');
  const traitBodies = new Map<string, string>();

  // Expand local chapter require_once statements in exact source order; hold trait
  // bodies so `use SomeTrait;` expands inside the class body in PHP compile order.
  const afterRequires = raw.replace(
    /^\s*require_once\s+__DIR__\s*\.\s*'\/((?:report_views|engine|astrology\/ai_astrologer)\/[^']+\.php)';\s*$/gm,
    (_m, relSub: string) => {
      let subSrc = fs.readFileSync(path.join(dir, relSub), 'utf8');
      if (relSub.startsWith('report_views/') || relSub.startsWith('engine/')) {
        subSrc = subSrc.replace(/dirname\(__DIR__\)\s*\.\s*'\//g, "__DIR__ . '/");
      }
      const tName = subSrc.match(/\btrait\s+(\w+)\b/);
      if (tName) {
        traitBodies.set(tName[1], stripOuterPhpAndTraitWrapper(subSrc));
        return '';
      }
      return stripOuterPhpAndTraitWrapper(subSrc);
    }
  );

  return afterRequires.replace(/^\s*use\s+(\w+);\s*$/gm, (_m, traitName: string) => {
    return traitBodies.get(traitName) ?? _m;
  });
}

/**
 * Read a repository file (or URL/path within the repo) and, when it is one of
 * the S8 modularized entrypoints, transparently expand its extracted chapter
 * modules in exact compile/execution order so static contract tests inspect the
 * complete implementation without requiring monolithic source files.
 */
export function readRepoSource(target: string | URL): string {
  const abs =
    target instanceof URL
      ? fileURLToPath(target)
      : path.isAbsolute(target)
      ? target
      : path.resolve(REPO_ROOT, target);
  const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');

  if (rel === 'src/pages/AdminPortal.tsx') {
    return ADMIN_PORTAL_CHAPTERS.map((c) => fs.readFileSync(path.join(REPO_ROOT, c), 'utf8')).join('\n');
  }

  if (
    rel === 'api/astrology/report_views.php' ||
    rel === 'api/astrology/engine.php' ||
    rel === 'api/ai_astrologer.php'
  ) {
    return expandPhpEntrypoint(abs);
  }

  return fs.readFileSync(abs, 'utf8');
}
