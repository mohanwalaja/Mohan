<?php
/* ==========================================================================
 * TEST DOUBLE - never deployed, never loaded by production code.
 *
 * scripts/php-auth-api-bridge.mjs mounts the REAL api/google_login.php with its
 * outbound transport astro_http_get_json_detailed() renamed out of the way and
 * appends this replacement. astro_verify_google_login(), the route, the rate-limit
 * budgets, the session and the token issuing all stay production code; ONLY the
 * HTTPS call to Google is scripted, so no network is ever touched.
 *
 * ASTRO_TEST_GOOGLE_SCRIPT names a JSON file: { "<url substring>": [reply, ...] }
 * where a reply is { "data": {...}|null, "status": 200, "transient": false }.
 * Each call to a matching URL consumes the next reply (the last one repeats).
 * ASTRO_TEST_GOOGLE_LOG receives one line per outbound call, token redacted.
 * ======================================================================== */

function astro_http_get_json_detailed($url, $timeoutSeconds = 8)
{
    $scriptFile = getenv('ASTRO_TEST_GOOGLE_SCRIPT');
    $logFile = getenv('ASTRO_TEST_GOOGLE_LOG');
    if (!is_string($scriptFile) || $scriptFile === '' || !is_file($scriptFile)) {
        throw new RuntimeException('ASTRO_TEST_GOOGLE_SCRIPT is not set; the Google transport double refuses to guess.');
    }
    if (is_string($logFile) && $logFile !== '') {
        file_put_contents($logFile, preg_replace('/(token=)[^&]+/', '$1<redacted>', $url) . "\n", FILE_APPEND);
    }

    $rules = json_decode((string) file_get_contents($scriptFile), true) ?: [];
    $cursorFile = $scriptFile . '.cursor';
    $cursor = is_file($cursorFile) ? (json_decode((string) file_get_contents($cursorFile), true) ?: []) : [];
    foreach ($rules as $needle => $replies) {
        if (strpos($url, (string) $needle) === false || !is_array($replies) || $replies === []) {
            continue;
        }
        $index = min((int) ($cursor[$needle] ?? 0), count($replies) - 1);
        $cursor[$needle] = ((int) ($cursor[$needle] ?? 0)) + 1;
        file_put_contents($cursorFile, json_encode($cursor));
        $reply = $replies[$index];
        return [
            'data' => is_array($reply['data'] ?? null) ? $reply['data'] : null,
            'status' => (int) ($reply['status'] ?? 0),
            'transient' => !empty($reply['transient']),
        ];
    }
    // Nothing scripted for this URL: behave like an unreachable host.
    return ['data' => null, 'status' => 0, 'transient' => true];
}
