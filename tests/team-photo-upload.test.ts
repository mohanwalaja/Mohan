/**
 * Astrology team portraits are UPLOADED from the admin panel, not pasted as a
 * URL (2026-10-21 request): "site asking for photo url I can't do that ... can
 * photo can 250 kb".
 *
 * Three things must stay true:
 *  1. The browser shrinks the photo to <=250 KB before uploading, so it works
 *     from a phone on mobile data and the server never sees a 6 MB camera file.
 *  2. The server re-checks everything: real JPG/PNG/WebP only, <=250 KB, a
 *     server-chosen file name under api/uploads/team/, and the folder can never
 *     execute what it stores.
 *  3. The photo actually appears on the site: the public team cards show it
 *     (falling back to the emblem), which the old URL field never did.
 *
 * The PHP half is EXECUTED (tests/team-photo-upload.test.php) when the optional
 * php-wasm runtime is installed; CI runs the same file natively.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEAM_PHOTO_ACCEPT,
  TEAM_PHOTO_MAX_BYTES,
  TEAM_PHOTO_MAX_EDGE,
  TEAM_PHOTO_QUALITY_LADDER,
  TEAM_PHOTO_SCALE_STEPS,
  TEAM_PHOTO_TARGET_BYTES,
  base64FromDataUrl,
  describeTeamPhotoRejection,
  formatTeamPhotoBytes,
  teamPhotoFitsBudget,
  teamPhotoSquareCrop,
  teamPhotoTargetEdge
} from '../src/services/teamPhoto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- ASTROLOGY TEAM PHOTO UPLOAD ---');

check('the photo budget is 250 KB and the browser aims just under it', () => {
  assert.equal(TEAM_PHOTO_MAX_BYTES, 250 * 1024);
  assert.ok(TEAM_PHOTO_TARGET_BYTES < TEAM_PHOTO_MAX_BYTES, 'the target must leave headroom for base64 framing');
  assert.ok(TEAM_PHOTO_TARGET_BYTES > TEAM_PHOTO_MAX_BYTES * 0.9, 'the target must not starve quality');
  assert.ok(TEAM_PHOTO_MAX_EDGE >= 600 && TEAM_PHOTO_MAX_EDGE <= 1600, 'a portrait stays sharp but small');
});

check('the quality ladder can always reach the budget', () => {
  assert.ok(TEAM_PHOTO_QUALITY_LADDER.length >= 4);
  for (let i = 1; i < TEAM_PHOTO_QUALITY_LADDER.length; i++) {
    assert.ok(TEAM_PHOTO_QUALITY_LADDER[i] < TEAM_PHOTO_QUALITY_LADDER[i - 1], 'quality must step down');
  }
  assert.ok(TEAM_PHOTO_SCALE_STEPS.length >= 3, 'a stubborn photo is scaled down, not just re-compressed');
  assert.ok(TEAM_PHOTO_SCALE_STEPS[0] === 1 && TEAM_PHOTO_SCALE_STEPS.at(-1)! < 0.6);
  assert.equal(teamPhotoFitsBudget(TEAM_PHOTO_MAX_BYTES), true);
  assert.equal(teamPhotoFitsBudget(TEAM_PHOTO_MAX_BYTES + 1), false);
  assert.equal(teamPhotoFitsBudget(Number.NaN), false);
});

check('every photo is auto-cropped to a square from the middle', () => {
  // 4000x3000: the square is 3000 wide, 500 px taken off each side.
  const landscape = teamPhotoSquareCrop(4000, 3000);
  assert.equal(landscape.sw, 3000);
  assert.equal(landscape.sh, landscape.sw, 'the source rect is a square');
  assert.equal(landscape.sx, 500, 'a landscape photo is cropped equally left and right');
  assert.equal(landscape.sy, 0);
  assert.equal(landscape.size, TEAM_PHOTO_MAX_EDGE, 'the saved square is the documented edge');

  // 1200x4800 portrait: 1800 px off the top and bottom, the face stays centred.
  const portrait = teamPhotoSquareCrop(1200, 4800);
  assert.equal(portrait.sw, 1200);
  assert.equal(portrait.sy, 1800, 'a tall photo is cropped equally top and bottom');
  assert.equal(portrait.sx, 0);
  assert.equal(portrait.size, TEAM_PHOTO_MAX_EDGE, 'a tall photo is saved at the normal square size');

  // A small portrait keeps its own size: upscaling would only blur it.
  const small = teamPhotoSquareCrop(120, 160);
  assert.equal(small.size, 120);
  assert.equal(small.sw, 120);
  assert.equal(small.sy, 20);

  // An already-square photo is not moved at all.
  assert.deepEqual(teamPhotoSquareCrop(900, 900), { sx: 0, sy: 0, sw: 900, sh: 900, size: 800 });

  // The shrink ladder still produces a smaller square.
  const shrunk = teamPhotoSquareCrop(4000, 4000, TEAM_PHOTO_MAX_EDGE / 2);
  assert.equal(shrunk.size, TEAM_PHOTO_MAX_EDGE / 2);

  // The old alias must agree: prepared portraits are square.
  const legacy = teamPhotoTargetEdge(4000, 3000);
  assert.equal(legacy.width, legacy.height, 'the prepared portrait is never a rectangle');
  assert.equal(legacy.width, TEAM_PHOTO_MAX_EDGE);

  // Degenerate input can never produce a zero-width canvas.
  const broken = teamPhotoSquareCrop(0, 0);
  assert.ok(broken.sw >= 1 && broken.size >= 1);
});

check('the browser draws the centre crop, not the whole photo', () => {
  const module = read('src/services/teamPhoto.ts');
  assert.match(
    module,
    /drawImage\(decoded\.source, crop\.sx, crop\.sy, crop\.sw, crop\.sh, 0, 0, width, height\)/,
    'the canvas must receive the cropped source rect'
  );
  assert.match(module, /canvas\.width = width;/, 'the canvas is square');
  assert.match(module, /const height = crop\.size;/, 'height comes from the same square size');
});

check('unsupported files are refused with advice the admin can act on', () => {
  const heic = describeTeamPhotoRejection({ type: 'image/heic', size: 3_000_000, name: 'IMG_0001.HEIC' });
  assert.ok(heic && /HEIC/i.test(heic) && /JPG/i.test(heic), 'an iPhone HEIC photo gets conversion steps, not a bare error');
  assert.ok(describeTeamPhotoRejection({ type: 'application/pdf', size: 1000, name: 'a.pdf' })?.includes('JPG, PNG or WebP'));
  const huge = describeTeamPhotoRejection({ type: 'image/jpeg', size: 40 * 1024 * 1024, name: 'big.jpg' });
  assert.ok(huge && /MB/.test(huge));
  assert.equal(describeTeamPhotoRejection({ type: 'image/jpeg', size: 900_000, name: 'ok.jpg' }), null);
  assert.equal(describeTeamPhotoRejection({ type: 'image/webp', size: 900_000, name: 'ok.webp' }), null);
});

check('byte labels and base64 extraction are right', () => {
  assert.equal(formatTeamPhotoBytes(2048), '2 KB');
  assert.equal(formatTeamPhotoBytes(250 * 1024), '250 KB');
  assert.equal(formatTeamPhotoBytes(0), '1 KB');
  assert.equal(base64FromDataUrl('data:image/jpeg;base64,AAAA'), 'AAAA');
  assert.equal(base64FromDataUrl('AAAA'), 'AAAA');
  assert.equal(TEAM_PHOTO_ACCEPT, 'image/jpeg,image/png,image/webp');
});

console.log('--- ADMIN PANEL WIRING ---');

check('the admin form uploads a file instead of demanding a URL', () => {
  const admin = read('src/pages/AdminPortal.tsx');
  assert.match(admin, /data-testid="team-photo-input"/, 'there is a file input');
  assert.match(admin, /accept=\{TEAM_PHOTO_ACCEPT\}/, 'the picker only offers usable image types');
  assert.match(admin, /data-testid="team-photo-hint"/, 'the panel tells the admin the photo is cropped for them');
  assert.match(admin, /cropped to a square/i, 'the admin is told about the automatic crop');
  assert.match(admin, /prepareTeamPhoto\(file\)/, 'the photo is shrunk in the browser first');
  assert.match(admin, /api\.uploadTeamPhoto\(prepared\.base64\)/, 'the shrunk photo is uploaded');
  assert.match(admin, /data-testid="team-photo-upload-button"/, 'the upload button is identifiable');
  assert.match(admin, /data-testid="team-photo-error"/, 'upload errors are shown in the form');
  assert.doesNotMatch(admin, /Photo URL \*/, 'the URL field is no longer the primary way in');
  assert.match(admin, /or paste a link/, 'a URL is still available as a fallback');
  assert.match(admin, /if \(!memberFormData\.photoUrl\.trim\(\)\)/, 'saving without a photo is refused');
  assert.match(admin, /formatTeamPhotoBytes\(TEAM_PHOTO_MAX_BYTES\)/, 'the budget is stated on screen');

  const apiClient = read('src/services/api.ts');
  assert.match(apiClient, /\$\{API_BASE\}\/admin\/team\/photo/, 'the client calls the upload route');
  assert.match(apiClient, /imageBase64/, 'the upload body carries the shrunk image');
});

check('the public team cards actually show the uploaded portrait', () => {
  const avatar = read('src/components/common/TeamMemberAvatar.tsx');
  assert.match(avatar, /isUsableTeamPhoto/, 'placeholder/unsafe URLs are filtered');
  assert.match(avatar, /unsplash/, 'the seeded stock portraits are never shown as an astrologer');
  assert.match(avatar, /onError=\{\(\) => setFailed\(true\)\}/, 'a broken URL falls back instead of showing a blank box');

  const section = read('src/components/common/AstrologyTeamSection.tsx');
  const usages = section.match(/<TeamMemberAvatar/g) || [];
  assert.ok(usages.length >= 2, 'both the slider and grid cards use the member photo');
  assert.match(section, /emblemClassName="w-full h-full object-contain p-2"/, 'the emblem still shows when there is no photo');
});

console.log('--- SERVER RULES ---');

check('the upload route is admin-only, rate-limited and cannot be mistaken for "create member"', () => {
  const admin = read('api/admin/index.php');
  assert.match(admin, /require_once __DIR__ \. '\/team_photos\.php';/);
  const photoRoute = admin.indexOf("/admin/team/photo");
  const teamRoute = admin.indexOf("// 8. GET & POST & PUT & DELETE /api/admin/team");
  assert.ok(photoRoute > 0 && teamRoute > photoRoute, 'the photo route must be declared before the generic team router');
  assert.match(admin, /astro_admin_action_limit\(\$pdo, \$admin, 'team-photo'\)/, 'uploads are rate-limited');
  assert.match(admin, /'team-photo' => array\(20, 600,/, 'the photo bucket is bounded per admin');
  assert.match(admin, /astro_team_photo_store\(getJsonBody\(\)\)/);

  const module = read('api/admin/team_photos.php');
  assert.match(module, /define\('ASTRO_TEAM_PHOTO_MAX_BYTES', 250 \* 1024\)/);
  assert.match(module, /getimagesizefromstring/, 'the real image type is sniffed, not trusted');
  assert.match(module, /IMAGETYPE_JPEG/, 'JPEG is accepted');
  assert.match(module, /IMAGETYPE_PNG/, 'PNG is accepted');
  assert.match(module, /IMAGETYPE_WEBP/, 'WebP is accepted');
  assert.match(module, /astro_random_hex\(24\)/, 'the file name is chosen by the server');
  assert.match(module, /imagejpeg\(\$canvas, null, \$quality\)/, 'GD re-encodes, which drops EXIF/GPS');
  assert.doesNotMatch(module, /move_uploaded_file/, 'no raw upload temp file is trusted');
  assert.match(module, /function astro_team_photo_delete\(/);
  // The server squares the photo too, so no other route can store a strip.
  assert.match(module, /define\('ASTRO_TEAM_PHOTO_SQUARE_EDGE', 800\)/);
  assert.match(module, /\$side = min\(\$sourceW, \$sourceH\)/, 'the square side is the shorter edge');
  assert.match(module, /imagecopyresampled\(\$canvas, \$source, 0, 0, \$cropX, \$cropY/, 'GD draws from the centre crop, not the whole photo');
  assert.match(module, /\$height = \$width;/, 'the stored image is always square');

  const cleanup = admin.match(/astro_team_photo_delete\(/g) || [];
  assert.ok(cleanup.length >= 2, 'both a replaced photo and a deleted member clean up the file');
});

check('the upload folder can never execute code and never ships local test images', () => {
  for (const file of ['api/uploads/.htaccess', 'api/uploads/team/.htaccess']) {
    const rules = read(file);
    assert.match(rules, /RemoveHandler \.php/, `${file} removes PHP handlers`);
    assert.match(rules, /Require all denied/, `${file} denies script extensions`);
    assert.match(rules, /Options -Indexes/, `${file} cannot be listed`);
  }
  assert.match(read('api/uploads/team/.htaccess'), /Cache-Control "public, max-age=2592000"/, 'a replaced photo is a new URL, so caching is safe');

  const packer = read('scripts/create_dist_zip.py');
  assert.match(packer, /'\/uploads\/' in normalized/, 'the release zip keeps a developer\'s local uploads out');
  assert.match(read('.gitignore'), /api\/uploads\/team\/\*/, 'uploaded portraits are not committed');
});

// The PHP rules are executed, not just read, when the optional runtime exists.
if (fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'))) {
  check('tests/team-photo-upload.test.php passes under PHP 8.1', () => {
    const run = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/php-wasm-run.mjs'), '--php', '8.1', 'tests/team-photo-upload.test.php'],
      { cwd: root, encoding: 'utf8', timeout: 180000 }
    );
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Team photo upload tests passed \(\d+ checks\)/);
  });
} else {
  console.log('  [SKIP] @php-wasm/node is not installed - tests/team-photo-upload.test.php runs in CI (npm run test:php).');
}

console.log(`\nTeam photo upload contract passed (${passed} checks).`);
