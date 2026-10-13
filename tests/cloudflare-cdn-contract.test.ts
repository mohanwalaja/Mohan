/**
 * ASTRO SIVAM — the CDN (Cloudflare) safety contract.
 *
 * WHY THIS EXISTS: putting a shared cache in front of the site converts two
 * dormant configuration mistakes into incidents —
 *
 *   1. URL → encoding negotiation without `Vary: Accept-Encoding`, which lets the
 *      edge serve a Brotli body to a gzip-only client (the bundle fails to parse
 *      and the site is blank), and
 *   2. API responses with no cache directive, where one "Cache Everything" rule
 *      makes the edge replay one customer's JSON to another.
 *
 * It also guards the security boundary: forwarding headers (CF-Connecting-IP,
 * X-Forwarded-For) may only be trusted when the TCP peer is a proxy we actually
 * run behind. Trusting them blindly hands out unlimited free reports and a free
 * pass on every IP rate limit.
 *
 * The IP-resolution half is verified BEHAVIOURALLY by executing the real PHP
 * (tests/fixtures/php-ai-probes/client-ip-trust.php through PHP-WASM). The wasm
 * runtime is a dev-only optional install, so that part reports SKIP instead of
 * silently passing when it is absent; the configuration assertions always run.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
let skipped = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const htaccess = read('public/.htaccess');
const configPhp = read('api/config.php');
const clientIp = read('api/client_ip.php');
const health = read('api/admin/health.php');
const monitoring = read('.github/workflows/monitoring.yml');
const setupDoc = read('docs/CLOUDFLARE_CDN_SETUP.md');

console.log('--- CDN (CLOUDFLARE) CONTRACT ---');

check('content-negotiated assets declare Vary: Accept-Encoding', () => {
  // Without this the edge cache keys only on the URL, so the first visitor's
  // Brotli variant is served to everyone.
  assert.match(htaccess, /Header merge Vary Accept-Encoding/);
  const varyAt = htaccess.indexOf('Header merge Vary Accept-Encoding');
  // Start from just before the directive so the FilesMatch pattern above it is
  // part of the block being asserted (starting AT the header line would slice
  // the extension list away).
  const block = htaccess.slice(Math.max(0, varyAt - 400), htaccess.indexOf('</FilesMatch>', varyAt));
  for (const ext of ['js', 'mjs', 'css', 'html', 'json']) {
    assert.ok(block.includes(ext), `the Vary rule must cover .${ext}`);
  }
  const negotiationAt = htaccess.indexOf('RewriteRule ^(.*)\\.(js|mjs|css|html|json|svg|txt|xml|webmanifest|wasm|map)$ /$1.$2.br [L]');
  assert.ok(negotiationAt !== -1, 'the Brotli negotiation rule must still exist');
  assert.ok(negotiationAt < varyAt, 'the Vary rule must accompany the negotiation it protects');
});

check('hashed bundles are immutable to browsers on every JS content type', () => {
  // Apache reports .js as text/javascript on current mime.types and as
  // application/javascript on older ones; a rule covering only one of them
  // silently gives the other a 1-month TTL.
  const expires = htaccess.slice(htaccess.indexOf('<IfModule mod_expires.c>'), htaccess.indexOf('</IfModule>', htaccess.indexOf('ExpiresActive On')));
  for (const type of ['application/javascript', 'text/javascript']) {
    assert.match(
      expires,
      new RegExp(`ExpiresByType ${type.replace('/', '\\/')} "access plus 1 year"`),
      `${type} must get the immutable 1-year TTL`
    );
  }
  assert.match(expires, /ExpiresByType text\/html "access plus 0 seconds"/, 'HTML must keep revalidating');
});

check('the pre-compressed siblings still declare their true Content-Encoding', () => {
  // Belt and braces: Vary without the encoding header would serve raw Brotli.
  assert.match(htaccess, /<FilesMatch "\\.js\\.br\$">[^]*?Header set Content-Encoding br/);
  assert.match(htaccess, /<FilesMatch "\\.js\\.gz\$">[^]*?Header set Content-Encoding gzip/);
});

check('every API response is no-store by default', () => {
  assert.match(configPhp, /header\('Cache-Control: no-store, private'\);/);
  assert.match(configPhp, /header\('Pragma: no-cache'\);/);
  // It must sit with the other global API headers, not inside a branch a router
  // could skip.
  const securityBlock = configPhp.slice(configPhp.indexOf("header('X-Content-Type-Options: nosniff')"));
  assert.ok(
    securityBlock.indexOf("Cache-Control: no-store, private") < securityBlock.indexOf('$allowedOrigins = ['),
    'the cache header must be applied unconditionally, before any routing'
  );
});

check('the IP resolver trusts forwarding headers only from a known proxy', () => {
  assert.match(clientIp, /if \(!\$resolution\['trustedPeer'\]\) \{/);
  assert.match(clientIp, /return \$resolution \+ array\('ip' => \$remote, 'source' => 'remote_addr'\);/);
  assert.match(clientIp, /function astro_is_cloudflare_ip/);
  assert.match(clientIp, /function astro_extra_trusted_proxy_ranges/);
  assert.match(clientIp, /TRUSTED_PROXY_RANGES/);
  assert.match(configPhp, /require_once __DIR__ \. '\/client_ip\.php';/, 'config.php must load the resolver for every API route');
});

check('the Cloudflare range list is complete, well formed and refreshable', () => {
  const list = clientIp.slice(clientIp.indexOf('function astro_cloudflare_ranges'));
  const body = list.slice(list.indexOf('return array('), list.indexOf(');'));
  const cidrs = [...body.matchAll(/'([0-9a-fA-F:.]+\/\d+)'/g)].map(m => m[1]);
  assert.ok(cidrs.length >= 22, `expected the published v4+v6 ranges, found ${cidrs.length}`);
  for (const cidr of cidrs) {
    const [addr, bits] = cidr.split('/');
    assert.ok(/^\d{1,3}(\.\d{1,3}){3}$/.test(addr) || addr.includes(':'), `${cidr} is not a valid address`);
    assert.ok(Number(bits) <= (addr.includes(':') ? 128 : 32), `${cidr} has an impossible prefix length`);
  }
  // The refresh path must be documented where the list lives.
  assert.match(clientIp, new RegExp('https://www\\.cloudflare\\.com/ips/'));
  assert.match(clientIp, /ONE client IP/, 'the consequence of a stale list must be documented');
});

check('the health endpoint detects an untrusted proxy / stale range list', () => {
  assert.match(health, /astro_health_run\('edge'/);
  assert.match(health, /Forwarding headers arrived from an untrusted peer/);
  assert.match(health, /CF-Ray present\) but the peer/);
  assert.match(health, /one-report-per-IP|free report per IP/i, 'the consequence must be stated, not just the symptom');
  for (const field of ['clientIpSource', 'peerTrusted', 'cloudflarePeer', 'cfRay', 'trustedRangeCount', 'extraTrustedRanges']) {
    assert.ok(health.includes(field), `the edge probe must expose ${field}`);
  }
});

check('the weekly monitor asserts the edge is in front and is not caching the API', () => {
  assert.match(monitoring, /^ {6}- name: Edge is in front and is not caching the API$/m);
  assert.match(monitoring, /grep -qi '\^cf-ray:'/, 'the edge must be proven present');
  assert.match(monitoring, /CF_STATUS" = "HIT"/, 'an edge-cached API response must fail the monitor');
  assert.match(monitoring, /cf-cache-status/);
  assert.match(monitoring, /strict-transport-security/);
  assert.match(monitoring, /Cache-Control: no-store/);
});

check('the runbook pins the settings that break the app when wrong', () => {
  const topics: Array<[RegExp, string]> = [
    [/Full \(strict\)/i, 'SSL mode: Flexible breaks Secure cookies and redirects'],
    [/Rocket Loader/i, 'must stay OFF: it rewrites scripts and breaks the CSP'],
    [/Email Obfuscation/i, 'must stay OFF: it injects markup into the page'],
    [/Brotli/i, 'edge compression'],
    [/Auto Accept/i, 'with the documented caveat'],
    [/HSTS/i, 'keep as-is'],
    [/Cache Rule/i, 'the bypass rule'],
    [/purge/i, 'deploy step'],
    [/bypass/i, 'the API bypass rule'],
    [/TRUSTED_PROXY_RANGES/, 'the escape hatch for a new proxy range']
  ];
  for (const [pattern, why] of topics) {
    assert.match(setupDoc, pattern, `the runbook must cover ${why}`);
  }
  assert.match(setupDoc, /astrosivam\.com/);
});

check('the session cookie takes its Secure flag from the client scheme, not origin HTTPS', () => {
  // Regression guard for the bug this suite caught: behind a TLS-terminating
  // edge the origin sees plain HTTP, so `isset($_SERVER['HTTPS'])` alone shipped
  // the 7-day session cookie without Secure.
  const sessionBlock = configPhp.slice(
    configPhp.indexOf("if (session_status() === PHP_SESSION_NONE)"),
    configPhp.indexOf('@session_start();')
  );
  assert.match(sessionBlock, /\$astro_session_secure = astro_request_is_https\(\);/);
  assert.ok(
    sessionBlock.indexOf('astro_request_is_https()') < sessionBlock.indexOf('session_set_cookie_params'),
    'the Secure flag must be computed before the cookie params are set'
  );
  assert.doesNotMatch(sessionBlock, /'secure' => isset\(\$_SERVER\['HTTPS'\]\)/);
  assert.doesNotMatch(sessionBlock, /,\s*isset\(\$_SERVER\['HTTPS'\]\) && \$_SERVER\['HTTPS'\] === 'on', true\)/);
  // Both cookie paths (array form + legacy positional form) must use the helper.
  assert.equal((sessionBlock.match(/\$astro_session_secure/g) || []).length, 3, 'declare once, use in both branches');
});

// ---------------------------------------------------------------------------
// Behavioural verification of the resolver (real PHP under PHP-WASM).
// ---------------------------------------------------------------------------
const wasmInstalled = fs.existsSync(path.join(projectRoot, 'node_modules', '@php-wasm', 'node'));
if (!wasmInstalled) {
  skipped += 1;
  console.log('  [SKIP] the IP-resolution spoofing matrix did not run (PHP-WASM is a dev-only install):');
  console.log('         npm install --no-save @php-wasm/node @php-wasm/universal');
} else {
  check('14 proxy/spoofing scenarios resolve correctly under real PHP', () => {
    const probe = 'tests/fixtures/php-ai-probes/client-ip-trust.php';
    const run = spawnSync(
      process.execPath,
      [path.join(projectRoot, 'scripts', 'php-ai-provider-check.mjs'), probe],
      { cwd: projectRoot, encoding: 'utf8', timeout: 180000 }
    );
    assert.equal(run.status, 0, `the probe must exit 0\n${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(run.stdout);
    const failures = (out.scenarios || []).filter((s: any) => !s.ok);
    assert.deepEqual(failures, [], `these scenarios resolved wrongly: ${JSON.stringify(failures, null, 2)}`);
    assert.ok(out.scenarios.length >= 14, `expected the full spoofing matrix, got ${out.scenarios.length}`);
    assert.deepEqual(out.cidrFailures, [], 'the CIDR helper must handle /0, /32, /128, mismatched families and junk');
    assert.equal(out.cloudflareRangesWellFormed, true);
  });

  check('the session cookie is Secure exactly when the visitor is on HTTPS', () => {
    // Each scenario needs its own PHP process: api/config.php declares functions
    // and starts a session, so a second include would be a redeclaration fatal.
    const expectations: Array<[string, boolean]> = [
      ['direct-https', true],          // origin terminates TLS
      ['edge-full-strict', true],      // Cloudflare Full (strict)
      ['edge-flexible', true],         // visitor -> edge is HTTPS, edge -> origin is HTTP
      ['direct-http', false],          // no TLS anywhere: Secure here would break the cookie entirely
      ['direct-https-off-value', false] // HTTPS=off and no forwarded scheme: genuinely plain
    ];
    const probe = 'tests/fixtures/php-ai-probes/session-cookie-hardening.php';
    const results: Record<string, any> = {};
    for (const [scenario, expectedSecure] of expectations) {
      const run = spawnSync(
        process.execPath,
        [path.join(projectRoot, 'scripts', 'php-ai-provider-check.mjs'), probe, '--env', `PROBE_SCENARIO=${scenario}`],
        { cwd: projectRoot, encoding: 'utf8', timeout: 120000 }
      );
      assert.equal(run.status, 0, `scenario ${scenario} must run\n${run.stdout}\n${run.stderr}`);
      const session = JSON.parse(run.stdout);
      results[scenario] = session;
      assert.equal(
        session.cookieSecure,
        expectedSecure,
        `${scenario}: Secure=${session.cookieSecure} but the visitor is ${session.requestIsHttps ? 'on HTTPS' : 'on HTTP'}`
      );
      assert.equal(session.cookieHttpOnly, true, `${scenario}: HttpOnly must never regress`);
      assert.equal(session.cookieSameSite, 'Lax', `${scenario}: SameSite=Lax must never regress`);
      assert.equal(session.cookieLifetimeDays, 7, `${scenario}: the 7-day session lifetime must not change`);
    }
    // The two ways the visitor can be on HTTPS while the origin sees HTTP must agree.
    assert.equal(
      results['edge-flexible'].requestIsHttps,
      results['edge-full-strict'].requestIsHttps,
      'the app must consider the visitor on HTTPS in both edge modes, or only the cookie flag would differ'
    );
  });
}

console.log(`\nCDN (Cloudflare) contract passed (${passed} checks${skipped ? ', 1 skipped' : ''}).\n`);
