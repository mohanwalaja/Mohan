<?php
/**
 * Executes api/client_ip.php against a table of proxy / spoofing scenarios and
 * writes the results as JSON. Run through PHP-WASM by
 * scripts/php-ai-provider-check.mjs (see tests/client-ip-trust.test.ts).
 *
 * WHY: this is the one piece of the CDN setup that is a security boundary. The
 * FREE BETA limit is one free report per IP, IP bans and every IP rate limit key
 * off this value. If a forwarding header is trusted too eagerly, an attacker
 * mints a new "IP" per request and gets unlimited free reports; if it is trusted
 * too cautiously behind Cloudflare, every visitor behind one edge range shares a
 * single identity and the site wrongly refuses the free report.
 */

require '/repo/api/client_ip.php';

/** One scenario: the $_SERVER keys to set, and what must come out. */
function scenario($name, array $server, $expectedIp, $expectedSource, array $expectedFlags = array()) {
    foreach (array_keys($_SERVER) as $key) {
        if (strpos($key, 'REMOTE_ADDR') === 0 || strpos($key, 'HTTP_') === 0) unset($_SERVER[$key]);
    }
    $_SERVER['REQUEST_METHOD'] = 'GET';
    foreach ($server as $key => $value) $server[$key] = $value;
    $_SERVER = array_merge($_SERVER, $server);

    $resolution = astro_client_ip_resolution();
    return array(
        'name' => $name,
        'expectedIp' => $expectedIp,
        'actualIp' => $resolution['ip'],
        'expectedSource' => $expectedSource,
        'actualSource' => $resolution['source'],
        'flags' => array(
            'trustedPeer' => $resolution['trustedPeer'],
            'cloudflarePeer' => $resolution['cloudflarePeer'],
            'proxied' => $resolution['proxied']
        ),
        'expectedFlags' => $expectedFlags,
        'ok' => $resolution['ip'] === $expectedIp && $resolution['source'] === $expectedSource
    );
}

$results = array();

// ---------------------------------------------------------------------------
// SPOOFING: a public peer talking to the origin directly. Nothing it sends in
// a forwarding header may influence the result.
// ---------------------------------------------------------------------------
$results[] = scenario('direct public peer + spoofed CF-Connecting-IP', array(
    'REMOTE_ADDR' => '203.0.113.7',
    'HTTP_CF_CONNECTING_IP' => '198.51.100.9'
), '203.0.113.7', 'remote_addr', array('trustedPeer' => false, 'cloudflarePeer' => false, 'proxied' => true));

$results[] = scenario('direct public peer + spoofed X-Forwarded-For chain', array(
    'REMOTE_ADDR' => '203.0.113.7',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.9, 198.51.100.10'
), '203.0.113.7', 'remote_addr');

$results[] = scenario('direct public peer + spoofed X-Real-IP + fake CF-Ray', array(
    'REMOTE_ADDR' => '203.0.113.7',
    'HTTP_X_REAL_IP' => '198.51.100.11',
    'HTTP_CF_RAY' => '8a1b2c3d4e5f6789-SIN'
), '203.0.113.7', 'remote_addr', array('proxied' => true));

// A peer just outside a Cloudflare range must not be trusted either.
$results[] = scenario('direct peer near a Cloudflare range (104.15.255.255)', array(
    'REMOTE_ADDR' => '104.15.255.255',
    'HTTP_CF_CONNECTING_IP' => '198.51.100.12'
), '104.15.255.255', 'remote_addr', array('cloudflarePeer' => false));

// ---------------------------------------------------------------------------
// CLOUDFLARE: the peer IS an edge node, so its header is authoritative.
// ---------------------------------------------------------------------------
$results[] = scenario('Cloudflare edge + CF-Connecting-IP', array(
    'REMOTE_ADDR' => '104.16.132.229',
    'HTTP_CF_CONNECTING_IP' => '198.51.100.20',
    'HTTP_CF_RAY' => '8a1b2c3d4e5f6789-SIN'
), '198.51.100.20', 'cf_connecting_ip', array('trustedPeer' => true, 'cloudflarePeer' => true, 'proxied' => true));

$results[] = scenario('Cloudflare IPv6 edge + CF-Connecting-IP', array(
    'REMOTE_ADDR' => '2606:4700:3033::ac43:8ac3',
    'HTTP_CF_CONNECTING_IP' => '2001:db8::42'
), '2001:db8::42', 'cf_connecting_ip', array('cloudflarePeer' => true));

$results[] = scenario('Cloudflare edge + client-supplied junk in CF-Connecting-IP', array(
    'REMOTE_ADDR' => '172.68.1.1',
    'HTTP_CF_CONNECTING_IP' => 'not-an-ip',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.30, 198.51.100.31'
), '198.51.100.31', 'x_forwarded_for', array('trustedPeer' => true));

$results[] = scenario('Cloudflare edge boundary: 172.71.255.255 is inside 172.64.0.0/13', array(
    'REMOTE_ADDR' => '172.71.255.255',
    'HTTP_CF_CONNECTING_IP' => '198.51.100.40'
), '198.51.100.40', 'cf_connecting_ip', array('cloudflarePeer' => true));

$results[] = scenario('outside boundary: 172.72.0.0 is NOT Cloudflare', array(
    'REMOTE_ADDR' => '172.72.0.0',
    'HTTP_CF_CONNECTING_IP' => '198.51.100.40'
), '172.72.0.0', 'remote_addr', array('cloudflarePeer' => false));

// ---------------------------------------------------------------------------
// OWN INFRASTRUCTURE: loopback / private ranges (a host proxy, not Cloudflare).
// ---------------------------------------------------------------------------
$results[] = scenario('loopback proxy + X-Forwarded-For', array(
    'REMOTE_ADDR' => '127.0.0.1',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.50'
), '198.51.100.50', 'x_forwarded_for', array('trustedPeer' => true));

$results[] = scenario('private-network proxy + X-Real-IP', array(
    'REMOTE_ADDR' => '10.0.0.5',
    'HTTP_X_REAL_IP' => '198.51.100.51'
), '198.51.100.51', 'x_real_ip', array('trustedPeer' => true));

$results[] = scenario('trusted proxy appends the client LAST (spoofed hops ignored)', array(
    'REMOTE_ADDR' => '10.0.0.5',
    'HTTP_X_FORWARDED_FOR' => '203.0.113.99, 198.51.100.52'
), '198.51.100.52', 'x_forwarded_for');

$results[] = scenario('trusted proxy with no usable header falls back to the peer', array(
    'REMOTE_ADDR' => '10.0.0.5',
    'HTTP_X_FORWARDED_FOR' => 'garbage'
), '10.0.0.5', 'remote_addr');

// ---------------------------------------------------------------------------
// TRUSTED_PROXY_RANGES override (ops escape hatch for a new range / own proxy).
// ---------------------------------------------------------------------------
putenv('TRUSTED_PROXY_RANGES=198.18.0.0/15,10.0.0.0/33,10.0.0.0/-1,::/129,garbage');
$results[] = scenario('TRUSTED_PROXY_RANGES admits a valid operator range beside malformed entries', array(
    'REMOTE_ADDR' => '198.18.7.7',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.60'
), '198.51.100.60', 'x_forwarded_for', array('trustedPeer' => true, 'cloudflarePeer' => false));
$parsedOverrideRanges = astro_extra_trusted_proxy_ranges();
putenv('TRUSTED_PROXY_RANGES');

// ---------------------------------------------------------------------------
// CIDR helper edge cases.
// ---------------------------------------------------------------------------
$cidrCases = array(
    array('104.15.255.255', '104.16.0.0/13', false),
    array('104.16.0.0', '104.16.0.0/13', true),
    array('104.23.255.255', '104.16.0.0/13', true),
    array('104.24.0.0', '104.16.0.0/13', false),
    array('104.24.0.0', '104.24.0.0/14', true),
    array('203.0.113.7', '203.0.113.0/24', true),
    array('203.0.114.7', '203.0.113.0/24', false),
    array('203.0.113.7', '203.0.113.7/32', true),
    array('0.0.0.0', '0.0.0.0/0', true),
    array('2606:4700::1', '2606:4700::/32', true),
    array('2606:4701::1', '2606:4700::/32', false),
    array('2606:4700::1', '104.16.0.0/13', false),
    array('203.0.113.7', '2606:4700::/32', false),
    array('203.0.113.7', 'not-a-cidr', false),
    array('10.0.0.1', '10.0.0.0/33', false),
    array('10.0.0.1', '10.0.0.0/-1', false),
    array('::1', '::/129', false),
    array('10.0.0.1', 'garbage', false)
);
$cidrFailures = array();
foreach ($cidrCases as $case) {
    $actual = astro_ip_in_cidr($case[0], $case[1]);
    if ($actual !== $case[2]) {
        $cidrFailures[] = $case[0] . ' in ' . $case[1] . ' returned ' . var_export($actual, true) . ', expected ' . var_export($case[2], true);
    }
}

echo json_encode(array(
    'scenarios' => $results,
    'cidrFailures' => $cidrFailures,
    'cidrCaseCount' => count($cidrCases),
    'invalidTrustedProxyRangesSkipped' => $parsedOverrideRanges === array('198.18.0.0/15'),
    'cloudflareRangeCount' => count(astro_cloudflare_ranges()),
    'cloudflareRangesWellFormed' => count(array_filter(astro_cloudflare_ranges(), function ($cidr) {
        $parts = explode('/', (string)$cidr);
        return count($parts) === 2
            && filter_var($parts[0], FILTER_VALIDATE_IP) !== false
            && is_numeric($parts[1])
            && (int)$parts[1] >= 0
            && (int)$parts[1] <= (strpos($parts[0], ':') !== false ? 128 : 32);
    })) === count(astro_cloudflare_ranges())
), JSON_UNESCAPED_SLASHES);
