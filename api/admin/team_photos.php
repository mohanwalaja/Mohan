<?php
/**
 * ASTRO SIVAM — astrology team member photos.
 *
 * The admin used to have to paste a public image URL to add a team member, which
 * nobody can do with a photo that only exists on their phone. This module
 * accepts an UPLOADED image instead and stores it on the site itself.
 *
 * Rules that matter:
 *  * A photo is at most 250 KB (after any re-encode), and the browser already
 *    shrinks it before sending, so the admin never sees a "file too large" wall.
 *  * Only a real JPEG / PNG / WebP is accepted: the bytes are sniffed with
 *    getimagesizefromstring(), never trusted from a file name or Content-Type.
 *  * The stored file name is generated here (random hex + an extension taken
 *    from the sniffed type), so an upload can never pick its own path and can
 *    never land as .php / .phtml. api/uploads/.htaccess also refuses to execute
 *    anything in the folder as a second lock.
 *  * When GD is available the image is re-encoded, which drops EXIF (GPS,
 *    camera serial) and any data appended after the image — a photo of the
 *    astrologer should not carry their home coordinates onto the website.
 *  * A replaced or removed member photo is deleted from disk; unreferenced
 *    uploads older than a day (a cancelled "add member" form) are pruned.
 *
 * Stored as a site-relative URL (/api/uploads/team/<hex>.jpg) in
 * team_members.photo_url, which is what every reader already displays.
 */

if (!defined('ASTRO_TEAM_PHOTO_MAX_BYTES')) {
    // 250 KB — the size the admin asked for. Also the hard server limit.
    define('ASTRO_TEAM_PHOTO_MAX_BYTES', 250 * 1024);
}
if (!defined('ASTRO_TEAM_PHOTO_MAX_EDGE')) {
    // Stored copies are never wider/taller than this; a portrait card shows
    // the photo at ~64 px, so 1200 px is already more than a retina screen uses.
    define('ASTRO_TEAM_PHOTO_MAX_EDGE', 1200);
}
if (!defined('ASTRO_TEAM_PHOTO_SQUARE_EDGE')) {
    // Every stored portrait is a SQUARE of this edge (or smaller, never
    // upscaled). The browser already centre-crops; doing it again here means a
    // photo posted by any other route cannot land as a letterboxed strip.
    define('ASTRO_TEAM_PHOTO_SQUARE_EDGE', 800);
}
if (!defined('ASTRO_TEAM_PHOTO_MIN_EDGE')) {
    define('ASTRO_TEAM_PHOTO_MIN_EDGE', 60);
}
if (!defined('ASTRO_TEAM_PHOTO_DIR')) {
    define('ASTRO_TEAM_PHOTO_DIR', dirname(__DIR__) . '/uploads/team');
}
if (!defined('ASTRO_TEAM_PHOTO_URL')) {
    define('ASTRO_TEAM_PHOTO_URL', '/api/uploads/team');
}
if (!defined('ASTRO_TEAM_PHOTO_PRUNE_AFTER')) {
    // A photo uploaded from a form that was then cancelled is safe to remove
    // after a day, which is far longer than any admin edit session.
    define('ASTRO_TEAM_PHOTO_PRUNE_AFTER', 86400);
}

/** Image types a team portrait may be: sniffed type => file extension. */
if (!function_exists('astro_team_photo_types')) {
    function astro_team_photo_types(): array
    {
        return [
            IMAGETYPE_JPEG => ['mime' => 'image/jpeg', 'ext' => 'jpg'],
            IMAGETYPE_PNG => ['mime' => 'image/png', 'ext' => 'png'],
            IMAGETYPE_WEBP => ['mime' => 'image/webp', 'ext' => 'webp'],
        ];
    }
}

/**
 * Decode the browser's base64 (raw or a data: URL) into bytes.
 * Returns null for empty, malformed or oversized payloads.
 */
if (!function_exists('astro_team_photo_decode')) {
    function astro_team_photo_decode($value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        $raw = trim($value);
        // Accept a full data URL: the browser preview uses one.
        $comma = strpos($raw, ',');
        if (strpos($raw, 'data:') === 0 && $comma !== false) {
            $raw = substr($raw, $comma + 1);
        }
        $raw = preg_replace('/\s+/', '', $raw);
        if ($raw === '' || strlen($raw) > (int)ceil(ASTRO_TEAM_PHOTO_MAX_BYTES * 1.5)) {
            // base64 is 4/3 of the bytes, so anything bigger than 1.5x the
            // budget can never decode to an acceptable image.
            return null;
        }
        $binary = base64_decode($raw, true);
        if ($binary === false || $binary === '' || strlen($binary) > ASTRO_TEAM_PHOTO_MAX_BYTES) {
            return null;
        }
        return $binary;
    }
}

/**
 * Sniff the image. Returns ['mime','ext','width','height'] or null when the
 * bytes are not a JPEG/PNG/WebP of a sane size for a portrait.
 */
if (!function_exists('astro_team_photo_inspect')) {
    function astro_team_photo_inspect(string $binary): ?array
    {
        if (strlen($binary) === 0 || strlen($binary) > ASTRO_TEAM_PHOTO_MAX_BYTES) {
            return null;
        }
        $info = @getimagesizefromstring($binary);
        if (!is_array($info) || empty($info[2])) {
            return null;
        }
        $types = astro_team_photo_types();
        if (!isset($types[(int)$info[2]])) {
            return null;
        }
        $width = (int)($info[0] ?? 0);
        $height = (int)($info[1] ?? 0);
        if ($width < ASTRO_TEAM_PHOTO_MIN_EDGE || $height < ASTRO_TEAM_PHOTO_MIN_EDGE) {
            return null;
        }
        // A very wide panorama or a 8000 px camera original is not a portrait;
        // refuse rather than store something that will never render usefully.
        if ($width > 6000 || $height > 6000) {
            return null;
        }
        return [
            'mime' => $types[(int)$info[2]]['mime'],
            'ext' => $types[(int)$info[2]]['ext'],
            'width' => $width,
            'height' => $height,
        ];
    }
}

/**
 * Re-encode (when GD is present) into a JPEG that fits the byte budget and
 * drops EXIF. Without GD the verified original is kept, but only if it already
 * fits the budget.
 *
 * @return array{binary:string,mime:string,ext:string,width:int,height:int}|null
 */
if (!function_exists('astro_team_photo_normalize')) {
    function astro_team_photo_normalize(string $binary, array $info): ?array
    {
        if (!function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) {
            // No GD on this host: the sniffed original is still a real image
            // and already within the budget (inspect() enforced that). It keeps
            // its own shape — the browser has already cropped it to a square,
            // and shipping a wrong crop is worse than shipping no crop.
            return [
                'binary' => $binary,
                'mime' => $info['mime'],
                'ext' => $info['ext'],
                'width' => (int)$info['width'],
                'height' => (int)$info['height'],
            ];
        }

        $source = @imagecreatefromstring($binary);
        if ($source === false) {
            return null;
        }
        // Centre square of the original: crop first, then downscale, so the
        // saved portrait keeps the resolution the card can use. A portrait or a
        // panorama loses its sides, never its middle (that is where the face is).
        $sourceW = max(1, (int)$info['width']);
        $sourceH = max(1, (int)$info['height']);
        $side = min($sourceW, $sourceH);
        $cropX = max(0, (int)round(($sourceW - $side) / 2));
        $cropY = max(0, (int)round(($sourceH - $side) / 2));
        $squareEdge = min(ASTRO_TEAM_PHOTO_SQUARE_EDGE, ASTRO_TEAM_PHOTO_MAX_EDGE, $side);
        $scale = 1.0;

        for ($attempt = 0; $attempt < 4; $attempt++) {
            $width = max(1, (int)round($squareEdge * $scale));
            $height = $width;
            $canvas = imagecreatetruecolor($width, $height);
            if ($canvas === false) {
                break;
            }
            // JPEG has no alpha: fill white first so a transparent PNG does not
            // turn black on the site's dark cards.
            $white = imagecolorallocate($canvas, 255, 255, 255);
            imagefilledrectangle($canvas, 0, 0, $width, $height, $white);
            imagecopyresampled($canvas, $source, 0, 0, $cropX, $cropY, $width, $height, $side, $side);

            foreach ([88, 82, 76, 70, 62] as $quality) {
                ob_start();
                imagejpeg($canvas, null, $quality);
                $jpeg = (string)ob_get_clean();
                if ($jpeg !== '' && strlen($jpeg) <= ASTRO_TEAM_PHOTO_MAX_BYTES) {
                    imagedestroy($canvas);
                    imagedestroy($source);
                    return [
                        'binary' => $jpeg,
                        'mime' => 'image/jpeg',
                        'ext' => 'jpg',
                        'width' => $width,
                        'height' => $height,
                    ];
                }
            }
            imagedestroy($canvas);
            // Still too big at the lowest useful quality: shrink and retry.
            $scale *= 0.75;
        }

        imagedestroy($source);
        return null;
    }
}

/** True when the URL points at a file this module owns. */
if (!function_exists('astro_team_photo_is_local')) {
    function astro_team_photo_is_local($url): bool
    {
        if (!is_string($url)) return false;
        return (bool)preg_match('#^' . preg_quote(ASTRO_TEAM_PHOTO_URL, '#') . '/[a-f0-9]{16,64}\.(?:jpg|png|webp)$#', trim($url));
    }
}

/** Delete one stored photo. Anything outside this module's folder is left alone. */
if (!function_exists('astro_team_photo_delete')) {
    function astro_team_photo_delete($url): bool
    {
        if (!astro_team_photo_is_local($url)) return false;
        $path = ASTRO_TEAM_PHOTO_DIR . '/' . basename(trim((string)$url));
        if (!is_file($path)) return false;
        return @unlink($path);
    }
}

/**
 * Store an uploaded portrait.
 *
 * @return array{success:bool,message:string,photoUrl?:string,bytes?:int,width?:int,height?:int}
 */
if (!function_exists('astro_team_photo_store')) {
    function astro_team_photo_store($body): array
    {
        $payload = is_array($body)
            ? ($body['imageBase64'] ?? ($body['photoBase64'] ?? ($body['image'] ?? '')))
            : '';
        $binary = astro_team_photo_decode($payload);
        if ($binary === null) {
            return [
                'success' => false,
                'message' => 'The photo could not be read, or it is larger than ' . round(ASTRO_TEAM_PHOTO_MAX_BYTES / 1024) . ' KB. Choose a JPG, PNG or WebP photo and try again.'
            ];
        }
        $info = astro_team_photo_inspect($binary);
        if ($info === null) {
            return [
                'success' => false,
                'message' => 'That file is not a usable portrait photo. Use a JPG, PNG or WebP image at least ' . ASTRO_TEAM_PHOTO_MIN_EDGE . ' pixels wide.'
            ];
        }
        $normalized = astro_team_photo_normalize($binary, $info);
        if ($normalized === null) {
            return [
                'success' => false,
                'message' => 'The photo could not be reduced to ' . round(ASTRO_TEAM_PHOTO_MAX_BYTES / 1024) . ' KB. Try a smaller or simpler image.'
            ];
        }

        $dir = ASTRO_TEAM_PHOTO_DIR;
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            error_log('ASTRO SIVAM: team photo folder is not creatable: ' . $dir);
            return ['success' => false, 'message' => 'The server cannot store photos right now (upload folder is not writable).'];
        }

        $fileName = astro_random_hex(24) . '.' . $normalized['ext'];
        $path = $dir . '/' . $fileName;
        $written = @file_put_contents($path, $normalized['binary'], LOCK_EX);
        clearstatcache(true, $path);
        if ($written !== strlen($normalized['binary']) || @filesize($path) !== strlen($normalized['binary'])) {
            @unlink($path);
            error_log('ASTRO SIVAM: could not write team photo ' . $path);
            return ['success' => false, 'message' => 'The server could not save the photo. Please try again.'];
        }
        @chmod($path, 0644);

        return [
            'success' => true,
            'message' => 'Photo uploaded.',
            'photoUrl' => ASTRO_TEAM_PHOTO_URL . '/' . $fileName,
            'bytes' => strlen($normalized['binary']),
            'width' => (int)$normalized['width'],
            'height' => (int)$normalized['height'],
        ];
    }
}

/**
 * Remove uploads nothing points at (a cancelled "add member" form).
 * Only files older than ASTRO_TEAM_PHOTO_PRUNE_AFTER are considered, so a
 * photo uploaded seconds ago and about to be saved is never touched.
 *
 * @return int number of files removed
 */
if (!function_exists('astro_team_photo_prune')) {
    function astro_team_photo_prune($pdo): int
    {
        $dir = ASTRO_TEAM_PHOTO_DIR;
        if (!is_dir($dir)) return 0;
        $referenced = [];
        try {
            $stmt = $pdo->query("SELECT photo_url FROM team_members WHERE photo_url LIKE '" . ASTRO_TEAM_PHOTO_URL . "/%'");
            foreach (($stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : []) as $url) {
                $referenced[basename((string)$url)] = true;
            }
        } catch (Throwable $e) {
            // No table yet (fresh install): nothing is referenced, but do not
            // guess and delete files we cannot prove are orphans.
            return 0;
        }

        $removed = 0;
        foreach ((array)@scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..' || $entry === '.htaccess') continue;
            $path = $dir . '/' . $entry;
            if (!is_file($path) || isset($referenced[$entry])) continue;
            if (time() - (int)@filemtime($path) < ASTRO_TEAM_PHOTO_PRUNE_AFTER) continue;
            if (@unlink($path)) $removed++;
        }
        return $removed;
    }
}
