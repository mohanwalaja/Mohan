<?php
/**
 * ASTRO SIVAM - Google sign-in token verification.
 *
 * WHY THIS IS ITS OWN FILE: both deploy paths (.cpanel.yml and deploy_cpanel.sh)
 * deliberately keep the live api/config.php - it holds the host's database
 * credentials - instead of overwriting it, so logic added to config.php never
 * reaches production. Shared server code therefore lives in files of its own
 * (request_body.php, rate_limit.php, client_ip.php, and this one), which every
 * deploy does replace. The older verifyGoogleLogin() / httpGetJson() in
 * config.php are left untouched: httpGetJson() still serves the Facebook
 * verifier, and api/auth/index.php no longer calls verifyGoogleLogin().
 *
 * It relies only on helpers config.php has always defined
 * (googleTokenAudienceMatches, googleEmailIsVerified, cleanDisplayName).
 *
 * WHAT IS NEW: the verifier reports WHY a verification failed. "Google rejected
 * this token" (a 4xx) is a failed credential and counts against the visitor's
 * failed-login budget; "this server could not get an answer from Google" (a
 * dropped connection, a timeout, a 5xx) is not the visitor's failure - the
 * route answers 503 + retryable and the browser sends the same token again.
 */
require_once __DIR__ . '/config.php';

/**
 * Like httpGetJson(), but also reports WHY nothing usable came back, so a login
 * flow can tell "Google rejected this token" apart from "this server could not
 * reach Google for a moment" (a cold DNS cache, a dropped connection, a 5xx).
 * httpGetJson() in config.php is unchanged and still used by the Facebook verifier.
 *
 * @return array{data: ?array, status: int, transient: bool}
 *   data       decoded JSON object of a successful (HTTP 2xx) answer, else null
 *   status     HTTP status of the last answer received (0 = no answer at all)
 *   transient  true when asking again may succeed: no answer at all (DNS,
 *              connect, TLS, timeout), HTTP 408/429, or any 5xx. A 4xx such as
 *              Google's 400 "invalid_token" is a final answer, never transient.
 */
function astro_http_get_json_detailed($url, $timeoutSeconds = 8) {
    $status = 0;
    $transportAvailable = false;

    if (function_exists('curl_init')) {
        $transportAvailable = true;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => true
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $status >= 200 && $status < 300) {
            $decoded = json_decode($body, true);
            if (is_array($decoded)) {
                return ['data' => $decoded, 'status' => $status, 'transient' => false];
            }
        }
        // A definitive 4xx (Google's 400 "invalid_token", 401, 403, ...) is the
        // final word: asking again through the stream wrapper cannot change it.
        if ($status >= 400 && $status < 500 && $status !== 408 && $status !== 429) {
            return ['data' => null, 'status' => $status, 'transient' => false];
        }
    }

    if (ini_get('allow_url_fopen')) {
        $transportAvailable = true;
        $context = stream_context_create([
            'http' => ['timeout' => $timeoutSeconds, 'ignore_errors' => true],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
        ]);
        $body = @file_get_contents($url, false, $context);
        $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : [];
        $fopenStatus = 0;
        foreach ($headers as $line) {
            // The last "HTTP/x.y NNN" line is the final answer after redirects.
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string)$line, $m)) $fopenStatus = (int)$m[1];
        }
        if ($fopenStatus > 0) $status = $fopenStatus;
        if ($body !== false && $fopenStatus >= 200 && $fopenStatus < 300) {
            $decoded = json_decode($body, true);
            if (is_array($decoded)) {
                return ['data' => $decoded, 'status' => $fopenStatus, 'transient' => false];
            }
        }
    }

    if (!$transportAvailable) {
        // A configuration problem, not a blip: asking again can never help.
        error_log('ASTRO SIVAM: outbound HTTPS is impossible on this host (enable the PHP cURL extension or allow_url_fopen); social sign-in cannot verify tokens.');
        return ['data' => null, 'status' => 0, 'transient' => false];
    }

    $transient = $status === 0 || $status === 408 || $status === 429 || $status >= 500;
    return ['data' => null, 'status' => $status, 'transient' => $transient];
}

/**
 * @param string      $credential        GSI ID token (signed JWT), or ''
 * @param string      $accessToken       OAuth2 access token, or ''
 * @param string      $expectedClientId  the OAuth client id the token must be issued to
 * @param string|null $failure           out: 'unavailable' when the deciding call to
 *                                       Google never produced an answer (network blip,
 *                                       timeout, 5xx) — the credential was NOT judged —
 *                                       otherwise null (verified, or really rejected)
 * @param callable|null $fetch           transport override (tests); defaults to
 *                                       astro_http_get_json_detailed()
 */
function astro_verify_google_login($credential, $accessToken, $expectedClientId = '', &$failure = null, $fetch = null) {
    $failure = null;
    $expectedClientId = trim((string)$expectedClientId);
    if ($expectedClientId === '') return null;

    $transport = is_callable($fetch) ? $fetch : 'astro_http_get_json_detailed';
    $get = function ($url) use ($transport, &$failure) {
        $reply = $transport($url);
        $data = is_array($reply) && is_array($reply['data'] ?? null) ? $reply['data'] : null;
        // Only the LAST call's outcome decides, so reset on every call.
        $failure = ($data === null && is_array($reply) && !empty($reply['transient'])) ? 'unavailable' : null;
        return $data;
    };

    if (!empty($credential)) {
        $info = $get('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential));
        if ($info && !empty($info['email']) && googleTokenAudienceMatches($info, $expectedClientId) && googleEmailIsVerified($info['email_verified'] ?? null)) {
            $failure = null;
            return [
                'sub' => $info['sub'] ?? null,
                'email' => strtolower($info['email']),
                'name' => cleanDisplayName($info['name'] ?? ''),
            ];
        }

        // No local JWT decode fallback: failed remote verification is a hard
        // authentication failure, not a reason to trust request-body identity.
    }

    if (!empty($accessToken)) {
        $tokenInfo = $get('https://oauth2.googleapis.com/tokeninfo?access_token=' . urlencode($accessToken));
        if (!$tokenInfo || !googleTokenAudienceMatches($tokenInfo, $expectedClientId)) return null;
        $info = $get('https://www.googleapis.com/oauth2/v3/userinfo?access_token=' . urlencode($accessToken));
        if ($info && !empty($info['email']) && googleEmailIsVerified($info['email_verified'] ?? null)) {
            $failure = null;
            return [
                'sub' => $info['sub'] ?? null,
                'email' => strtolower($info['email']),
                'name' => cleanDisplayName($info['name'] ?? ''),
            ];
        }
    }

    return null;
}
