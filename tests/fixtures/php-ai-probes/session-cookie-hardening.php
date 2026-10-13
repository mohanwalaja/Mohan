<?php
/**
 * ASTRO SIVAM — behavioural probe: is the 7-day session cookie marked Secure
 * when the origin itself sees plain HTTP?
 *
 * WHY: api/config.php built the session cookie's `secure` flag from
 * `isset($_SERVER['HTTPS'])` alone. Behind a TLS-terminating edge the origin can
 * legitimately see plain HTTP while the visitor is on HTTPS — Cloudflare's
 * documented behaviour is that `X-Forwarded-Proto` carries "the protocol (HTTP
 * or HTTPS) that a visitor used to connect to Cloudflare" and that a
 * client-supplied value is OVERWRITTEN, so the header is trustworthy exactly
 * when the TCP peer is the edge. Without honouring it, the login/session cookie
 * for a 7-day session ships without `Secure` and can leak over any plain-http
 * request to the same host.
 *
 * WHY ONE SCENARIO PER PROCESS: including api/config.php declares functions and
 * starts a session, so a second include in the same process is a redeclaration
 * fatal. The harness runs this file once per scenario with PROBE_SCENARIO set
 * (see scripts/php-ai-provider-check.mjs --env), each in a fresh PHP instance.
 *
 * Usage:
 *   npm install --no-save @php-wasm/node @php-wasm/universal
 *   PROBE_SCENARIO=edge-flexible node scripts/php-ai-provider-check.mjs \
 *     tests/fixtures/php-ai-probes/session-cookie-hardening.php --env PROBE_SCENARIO=edge-flexible
 */
$scenario = getenv('PROBE_SCENARIO') ?: 'direct-https';

// A realistic request: no HTTPS server flag, no forwarding headers, until the
// scenario below adds what a real proxy would.
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['HTTP_HOST'] = 'astrosivam.com';
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';
unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO'], $_SERVER['HTTP_CF_CONNECTING_IP']);

switch ($scenario) {
    case 'direct-https':
        // Ordinary hosting: the origin terminates TLS itself.
        $_SERVER['HTTPS'] = 'on';
        break;

    case 'direct-https-off-value':
        // Apache/cPanel sometimes export HTTPS=off behind a proxy that did TLS.
        $_SERVER['HTTPS'] = 'off';
        break;

    case 'direct-http':
        // No TLS anywhere. The cookie MUST NOT be Secure, or it is never sent.
        break;

    case 'edge-flexible':
        // Cloudflare Flexible: visitor -> edge is HTTPS, edge -> origin is HTTP.
        // The peer is a real Cloudflare address, so the header is trustworthy.
        $_SERVER['REMOTE_ADDR'] = '172.71.150.9';
        $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '8.8.4.4';
        $_SERVER['HTTP_CF_RAY'] = '8a1b2c3d4e5f6789-LHR';
        break;

    case 'edge-full-strict':
        // Cloudflare Full (strict): the origin sees HTTPS too.
        $_SERVER['HTTPS'] = 'on';
        $_SERVER['REMOTE_ADDR'] = '172.71.150.9';
        $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
        break;

    default:
        fwrite(STDERR, "unknown PROBE_SCENARIO: $scenario\n");
        exit(2);
}

require_once '/repo/api/config.php';

$params = session_get_cookie_params();
$out = array(
    'scenario' => $scenario,
    'requestIsHttps' => astro_request_is_https(),
    'cookieSecure' => (bool)($params['secure'] ?? false),
    'cookieHttpOnly' => (bool)($params['httponly'] ?? false),
    'cookieSameSite' => (string)($params['samesite'] ?? ''),
    'cookieLifetimeDays' => (int)round(((int)($params['lifetime'] ?? 0)) / 86400),
    'phpVersion' => PHP_VERSION,
);
echo json_encode($out, JSON_PRETTY_PRINT) . "\n";
