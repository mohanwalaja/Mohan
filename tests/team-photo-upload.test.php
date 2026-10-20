<?php
/**
 * ASTRO SIVAM — astrology team photo uploads (no pasted image URL).
 *
 * Runs with plain `php tests/team-photo-upload.test.php` (no database, no
 * network, no GD required) and is executed by CI via scripts/run-php-tests.sh,
 * and locally under PHP-WASM by tests/team-photo-upload.test.ts.
 *
 * The rules customers depend on: a portrait is at most 250 KB, only a real
 * JPEG/PNG/WebP is stored, the file name is chosen by the server (never by the
 * upload), and a file can never end up as executable code in the public folder.
 */

putenv('APP_SECRET_KEY=test-only-app-secret-key-0123456789abcdef');

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/admin/team_photos.php';

$checks = 0;
function checkPhoto($condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
    echo "[PASS] " . $message . "\n";
}

/** A real, tiny PNG (2×2) so the sniffer has something genuine to inspect. */
function teamPhotoTinyPng(int $width = 120, int $height = 120): string
{
    if (function_exists('imagecreatetruecolor')) {
        $img = imagecreatetruecolor($width, $height);
        imagefill($img, 0, 0, imagecolorallocate($img, 180, 140, 60));
        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();
        imagedestroy($img);
        return $png;
    }
    // GD-free fallback: a hand-built 1×1 PNG, scaled up by repeating the file
    // is impossible, so the dimension checks use the constants instead.
    return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
}

// ---------------------------------------------------------------------------
// 1. The budget itself is 250 KB, and it is a hard server limit.
// ---------------------------------------------------------------------------
checkPhoto(ASTRO_TEAM_PHOTO_MAX_BYTES === 250 * 1024, 'The stored photo budget is 250 KB');
checkPhoto(ASTRO_TEAM_PHOTO_MAX_EDGE >= 600, 'A stored portrait keeps a usable resolution');

// ---------------------------------------------------------------------------
// 2. Decoding: raw base64 and a data: URL both work; junk and oversize do not.
// ---------------------------------------------------------------------------
$png = teamPhotoTinyPng();
checkPhoto($png !== '', 'The test fixture is a real PNG');
checkPhoto(astro_team_photo_decode(base64_encode($png)) === $png, 'Raw base64 decodes to the uploaded bytes');
checkPhoto(astro_team_photo_decode('data:image/png;base64,' . base64_encode($png)) === $png, 'A data: URL decodes to the same bytes');
checkPhoto(astro_team_photo_decode('') === null, 'An empty upload is refused');
checkPhoto(astro_team_photo_decode('not base64 !!!') === null, 'Malformed base64 is refused');
checkPhoto(astro_team_photo_decode(null) === null, 'A missing upload is refused');
$oversize = base64_encode(str_repeat('A', 260 * 1024));
checkPhoto(astro_team_photo_decode($oversize) === null, 'An upload over 250 KB is refused before any image work');
$justOver = base64_encode(str_repeat('A', 250 * 1024 + 1));
checkPhoto(astro_team_photo_decode($justOver) === null, 'One byte over the 250 KB budget is still refused');

// ---------------------------------------------------------------------------
// 3. Sniffing: the real type decides, and it must be an image.
// ---------------------------------------------------------------------------
$info = astro_team_photo_inspect($png);
checkPhoto(is_array($info), 'A real PNG is accepted');
checkPhoto($info['mime'] === 'image/png' && $info['ext'] === 'png', 'The sniffed type decides the stored extension');
checkPhoto(astro_team_photo_inspect('just some text pretending to be a photo') === null, 'Plain text is refused');
checkPhoto(astro_team_photo_inspect(base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')) === null, 'A GIF is refused (only JPG/PNG/WebP are portraits)');
checkPhoto(astro_team_photo_inspect("\x89PNG\r\n\x1a\n" . str_repeat('x', 200)) === null, 'A truncated PNG header is refused');

// ---------------------------------------------------------------------------
// 4. The stored name is the server's, and only this folder is ever touched.
// ---------------------------------------------------------------------------
$stored = astro_team_photo_store(['imageBase64' => base64_encode($png)]);
checkPhoto(!empty($stored['success']), 'A valid upload is stored: ' . ($stored['message'] ?? ''));
$url = (string) ($stored['photoUrl'] ?? '');
checkPhoto((bool) preg_match('#^/api/uploads/team/[a-f0-9]{24}\.(png|jpg|webp)$#', $url), 'The stored URL is a server-chosen name under /api/uploads/team/');
checkPhoto(strpos($url, '..') === false, 'The stored URL can not walk out of its folder');
checkPhoto(astro_team_photo_is_local($url), 'The stored URL is recognised as ours');
$absolute = ASTRO_TEAM_PHOTO_DIR . '/' . basename($url);
checkPhoto(is_file($absolute), 'The photo really exists on disk');
checkPhoto(@filesize($absolute) <= ASTRO_TEAM_PHOTO_MAX_BYTES, 'The stored photo is within the 250 KB budget');

checkPhoto(!astro_team_photo_is_local('https://evil.example/x.jpg'), 'An external URL is never ours to delete');
checkPhoto(!astro_team_photo_is_local('/api/uploads/team/../../config.php'), 'A traversal URL is not recognised as ours');
checkPhoto(!astro_team_photo_is_local('/api/uploads/team/evil.php'), 'A .php file in the folder is not treated as a photo');
checkPhoto(!astro_team_photo_delete('/api/uploads/team/../../config.php'), 'Deleting a traversal path does nothing');
checkPhoto(!astro_team_photo_delete('/etc/passwd'), 'Deleting an unrelated path does nothing');

// ---------------------------------------------------------------------------
// 5. Refusals are understandable and never write anything.
// ---------------------------------------------------------------------------
$before = count((array) @scandir(ASTRO_TEAM_PHOTO_DIR));
$refused = astro_team_photo_store(['imageBase64' => base64_encode('<?php echo 1; ?>')]);
checkPhoto(empty($refused['success']), 'A PHP payload uploaded as an image is refused');
checkPhoto(strpos((string) ($refused['message'] ?? ''), 'JPG, PNG or WebP') !== false, 'The refusal tells the admin which formats work');
$after = count((array) @scandir(ASTRO_TEAM_PHOTO_DIR));
checkPhoto($before === $after, 'A refused upload writes no file');

// ---------------------------------------------------------------------------
// 6. Cleanup: a removed photo is deleted, and nothing else is.
// ---------------------------------------------------------------------------
checkPhoto(astro_team_photo_delete($url) === true, 'A replaced/removed portrait is deleted from disk');
checkPhoto(!is_file($absolute), 'The deleted portrait is really gone');
checkPhoto(astro_team_photo_delete($url) === false, 'Deleting it twice is harmless');

echo "\nTeam photo upload tests passed ({$checks} checks).\n";
