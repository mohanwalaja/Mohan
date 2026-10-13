<?php
/**
 * ASTRO SIVAM - hardened client IP resolution (shared by every API router).
 *
 * WHY THIS EXISTS: X-Forwarded-For / CF-Connecting-IP are attacker-controlled
 * when the app is reached directly. Honouring them unconditionally lets any
 * client mint a fresh IP per request, which bypasses the FREE-BETA
 * 1-order-per-IP limit, the pending-order limit, IP bans and every IP-based
 * rate limit. Forwarding headers are therefore trusted ONLY when the direct
 * peer (REMOTE_ADDR) is a proxy we actually run behind: loopback / private
 * network, or a published Cloudflare edge range
 * (https://www.cloudflare.com/ips/).
 *
 * This file is deliberately dependency-free so requiring it from config.php
 * cannot create a circular include. Do not add require statements here.
 */

/** CIDR membership test for both IPv4 and IPv6 (no dependencies). */
function astro_ip_in_cidr($ip, $cidr) {
    $parts = explode('/', $cidr);
    if (count($parts) !== 2) return false;
    list($subnet, $bits) = $parts;
    $bits = (int)$bits;

    if (strpos($ip, ':') !== false || strpos($subnet, ':') !== false) {
        // IPv6
        $ipBin = @inet_pton($ip);
        $subnetBin = @inet_pton($subnet);
        if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) return false;
        $fullBytes = intdiv($bits, 8);
        $remBits = $bits % 8;
        if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($subnetBin, 0, $fullBytes)) return false;
        if ($remBits === 0) return true;
        $mask = chr((0xFF << (8 - $remBits)) & 0xFF);
        return ((ord($ipBin[$fullBytes]) & ord($mask)) === (ord($subnetBin[$fullBytes]) & ord($mask)));
    }

    // IPv4
    $ipLong = ip2long($ip);
    $subnetLong = ip2long($subnet);
    if ($ipLong === false || $subnetLong === false) return false;
    $mask = $bits <= 0 ? 0 : (-1 << (32 - $bits));
    return (($ipLong & $mask) === ($subnetLong & $mask));
}

/**
 * The published Cloudflare edge ranges (https://www.cloudflare.com/ips/).
 *
 * REFRESHING: Cloudflare adds ranges occasionally. A stale list is not a
 * security hole — an unrecognised peer simply falls back to REMOTE_ADDR — but
 * it silently collapses every visitor behind the new range into ONE client IP,
 * which would apply the Free Beta 1-report-per-IP limit to all of them and make
 * IP rate limits global. That failure is therefore *detected*: the admin health
 * endpoint reports `edge` as failing when a request arrives with Cloudflare
 * headers from a peer that is not on this list. Re-check the list after any
 * such alert and either extend this array or set the TRUSTED_PROXY_RANGES
 * environment variable (comma-separated CIDRs) to add ranges without a deploy.
 */
function astro_cloudflare_ranges() {
    return array(
        '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '104.16.0.0/13',
        '104.24.0.0/14', '108.162.192.0/18', '131.0.72.0/22', '141.101.64.0/18',
        '162.158.0.0/15', '172.64.0.0/13', '173.245.48.0/20', '188.114.96.0/20',
        '190.93.240.0/20', '197.234.240.0/22', '198.41.128.0/17',
        '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
        '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
    );
}

/**
 * Operator-supplied extra trusted proxies (comma-separated CIDRs), for hosts
 * that put another reverse proxy / load balancer in front of the origin (or a
 * Cloudflare range added after this file was written). Empty by default.
 */
function astro_extra_trusted_proxy_ranges() {
    // Cached on the ENV VALUE, not on "called once": a plain static would make
    // the override impossible to change within a process (and impossible to
    // test), while re-parsing on every call is wasted work in the hot path.
    static $cachedRaw = null;
    static $ranges = array();
    $raw = (string)(getenv('TRUSTED_PROXY_RANGES') ?: '');
    if ($cachedRaw === $raw) return $ranges;
    $ranges = array();
    foreach (explode(',', $raw) as $cidr) {
        $cidr = trim($cidr);
        if ($cidr !== '' && strpos($cidr, '/') !== false) $ranges[] = $cidr;
    }
    $cachedRaw = $raw;
    return $ranges;
}

/** True when the peer IP is inside a published Cloudflare edge range. */
function astro_is_cloudflare_ip($ip) {
    $ip = trim((string)$ip);
    if ($ip === '' || filter_var($ip, FILTER_VALIDATE_IP) === false) return false;
    foreach (astro_cloudflare_ranges() as $cidr) {
        if (astro_ip_in_cidr($ip, $cidr)) return true;
    }
    return false;
}

/** True when the direct TCP peer is a proxy we run behind (or Cloudflare). */
function astro_is_trusted_proxy_ip($ip) {
    $ip = trim((string)$ip);
    if ($ip === '') return false;
    if ($ip === '127.0.0.1' || $ip === '::1') return true;

    // Loopback / RFC1918 / link-local / CGNAT — proxies on our own infrastructure.
    $parsed = @inet_pton($ip);
    if ($parsed !== false && strpos($ip, ':') === false) {
        foreach (array('127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10') as $cidr) {
            if (astro_ip_in_cidr($ip, $cidr)) return true;
        }
    }
    if ($parsed !== false && strpos($ip, ':') !== false) {
        foreach (array('fc00::/7', 'fe80::/10') as $cidr) {
            if (astro_ip_in_cidr($ip, $cidr)) return true;
        }
    }

    // Published Cloudflare edge ranges, plus any operator override.
    if (astro_is_cloudflare_ip($ip)) return true;
    foreach (astro_extra_trusted_proxy_ranges() as $cidr) {
        if (astro_ip_in_cidr($ip, $cidr)) return true;
    }
    return false;
}

/**
 * Resolve the client IP *and* how it was decided, so operators can see whether
 * a CDN is in front and whether its forwarding header is being trusted.
 *
 * @return array{ip:string,source:string,remote:string,trustedPeer:bool,cloudflarePeer:bool,proxied:bool}
 *   source: remote_addr | cf_connecting_ip | x_forwarded_for | x_real_ip
 *   proxied: any forwarding header (or Cloudflare's CF-Ray) was present
 */
function astro_client_ip_resolution() {
    $remote = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $hasCfHeader = !empty($_SERVER['HTTP_CF_CONNECTING_IP']);
    $hasForwardedFor = !empty($_SERVER['HTTP_X_FORWARDED_FOR']);
    $hasRealIp = !empty($_SERVER['HTTP_X_REAL_IP']);
    $resolution = array(
        'remote' => $remote,
        'trustedPeer' => astro_is_trusted_proxy_ip($remote),
        'cloudflarePeer' => astro_is_cloudflare_ip($remote),
        'proxied' => $hasCfHeader || $hasForwardedFor || $hasRealIp || !empty($_SERVER['HTTP_CF_RAY'])
    );

    if (!$resolution['trustedPeer']) {
        // Public peer talking to us directly — forwarding headers are spoofed.
        return $resolution + array('ip' => $remote, 'source' => 'remote_addr');
    }
    // Cloudflare sets this at the edge and strips any client-supplied copy.
    if ($hasCfHeader) {
        $cf = trim((string)$_SERVER['HTTP_CF_CONNECTING_IP']);
        if (filter_var($cf, FILTER_VALIDATE_IP)) {
            return $resolution + array('ip' => $cf, 'source' => 'cf_connecting_ip');
        }
    }
    // Our nearest proxy appends the real client, so the LAST valid hop is the
    // one it added (earlier hops may have been supplied by the client).
    if ($hasForwardedFor) {
        $hops = array_reverse(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']));
        foreach ($hops as $hop) {
            $hop = trim($hop);
            if (filter_var($hop, FILTER_VALIDATE_IP)) {
                return $resolution + array('ip' => $hop, 'source' => 'x_forwarded_for');
            }
        }
    }
    if ($hasRealIp) {
        $real = trim((string)$_SERVER['HTTP_X_REAL_IP']);
        if (filter_var($real, FILTER_VALIDATE_IP)) {
            return $resolution + array('ip' => $real, 'source' => 'x_real_ip');
        }
    }
    return $resolution + array('ip' => $remote, 'source' => 'remote_addr');
}

/** Reliably get the client IP address (spoof-resistant). */
function getClientIpAddress() {
    $resolution = astro_client_ip_resolution();
    return $resolution['ip'];
}
