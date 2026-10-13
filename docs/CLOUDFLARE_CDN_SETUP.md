# Cloudflare in front of ASTRO SIVAM — setup, safety rules and verification

P1 item 5. The origin is shared cPanel hosting with ~1 s TTFB; Cloudflare adds
edge caching, Brotli at the edge and DDoS posture. Everything the **repo** has to
do is already implemented and tested — this document is the half that lives in
the Cloudflare dashboard, plus what to check afterwards.

Two configuration mistakes are dormant today and become incidents the moment a
shared cache is in front. Both are fixed in the repo (see §4) and both are
covered by `tests/cloudflare-cdn-contract.test.ts`.

---

## 1. DNS and SSL/TLS — do this first

| setting | value | why |
|---|---|---|
| A/AAAA record for `astrosivam.com` | **Proxied** (orange cloud) | without the proxy there is no edge caching, no Brotli at the edge, no DDoS posture — the monitor fails on purpose if this is "DNS only" |
| SSL/TLS encryption mode | **Full (strict)** | Flexible means Cloudflare↔origin is plain HTTP: the origin cannot tell the request is secure, redirect loops appear, and caches are shared with the redirect |
| Edge Certificates → Always Use HTTPS | **On** | one redirect at the edge instead of a round trip to the origin |
| Edge Certificates → HSTS | leave **as-is** | `public/.htaccess` already sends `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`; Cloudflare preserves the origin header. Do not enable Cloudflare's HSTS *and* preload — one source of truth. Preload only matters once the domain is submitted; if you submit it, it is effectively permanent. |
| Minimum TLS version | **1.2** | 1.0/1.1 are dead protocols |
| Automatic HTTPS Rewrites | On | harmless, catches stray `http://` subresources |

**Never** switch to Flexible to "fix" a redirect loop — a loop with Full
(strict) means the origin certificate is missing/expired, not that the mode is
wrong. Check `https://<origin-ip>/` directly with `openssl s_client` first.

## 2. Speed → compression

| setting | value | notes |
|---|---|---|
| Brotli | **On** | edge compression for clients that accept it. Our origin ALSO ships pre-compressed `.br`/`.gz` siblings that Apache negotiates — Cloudflare caches whichever variant it receives and now (with `Vary: Accept-Encoding`, §4) never hands a Brotli body to a gzip-only client. |
| Auto Accept | On, **with care** | makes the edge request/accept one encoding so the cache holds a single variant, then re-encodes per client. If you see a client receiving unreadable JS after enabling it, that is a `Vary`/encoding mismatch: the §4 rules are the fix, and the monitor's API check plus the Playwright smoke test will catch a broken bundle. |
| Rocket Loader | **OFF** | it rewrites and defers scripts from the edge; our CSP (`script-src 'self' …`) blocks the injected loader, and deferring app scripts breaks the report renderer's timing |
| Email Obfuscation | **OFF** | it injects markup/scripts into HTML; nothing in the app needs it and it fights the CSP |
| Auto Minify | **OFF** for JavaScript (the dashboard feature is deprecated/removed — if your zone still exposes it, it must stay unticked for JS) | Cloudflare's edge minifier **rewrites ES modules**, and Vite's code-split output depends on exact module semantics (dynamic-import preload helper, side-effect order). Edge-minified JS has broken Vite lazy chunks before — never let anything between Cloudflare and the origin re-minify what Vite already minified |
| HTTP/3, 0-RTT, Early Hints | On | free wins for TTFB; the app does not depend on request ordering |
| Web Analytics (optional) | if enabled, update the CSP | add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src` in `public/.htaccess`. It is **not** in the policy today, so the beacon is blocked until you add it. |

## 3. Cache Rules — the dangerous half

Create these under **Caching → Cache Rules** (rules are evaluated in order; the
bypass must come first).

**Cache Rule 1 (mandatory): bypass the API.**

```
When incoming requests match:  URI Path starts with /api/
Then:                          Bypass cache
```

The origin also sends `Cache-Control: no-store, private` on **every** API
response (added in `api/config.php`), so a mis-scoped rule is a second line of
defence rather than the only one. This matters most for
`/api/services/my-orders`, `?action=settings` and anything else session-scoped:
an edge HIT on one of those replays one customer's data to another.

**Cache Rule 2: cache the hashed build output forever.**

```
When incoming requests match:  URI Path starts with /assets/
Then:                          Eligible for cache, Edge TTL: 1 year, Browser TTL: 1 year
```

Vite filenames are content-hashed, so this is safe by construction; the origin
already sends a 1-year `Expires` for them.

**Cache Rule 3 (optional, biggest TTFB win for the HTML): cache the prerendered
pages.**

The site ships prerendered HTML per route (`/`, `/services`, `/birth-jathagam`,
…). Enable a rule with **Edge TTL: 1 hour** (not "Cache Everything" globally) and
**purge on deploy** — see §5. If you would rather not think about staleness, skip
this rule: static assets + Brotli already remove most of the payload time, and
the HTML stays origin-served.

**Never** enable a global "Cache Everything" rule, and never cache
`/api/admin/*`, `/dashboard`, or anything after a login.

## 4. What the repo already does (verified)

| concern | implementation | test |
|---|---|---|
| Real client IP behind the proxy | `api/client_ip.php`: forwarding headers are trusted **only** when `REMOTE_ADDR` is loopback/private or inside a published Cloudflare range; `CF-Connecting-IP` wins, otherwise the **last** XFF hop | `tests/cloudflare-cdn-contract.test.ts` executes 14 scenarios under real PHP (§ below) |
| Spoof resistance | a direct public peer sending `CF-Connecting-IP`/`XFF`/`X-Real-IP`/fake `CF-Ray` is ignored — otherwise anyone could mint a fresh IP per request and defeat the Free Beta one-report-per-IP limit, IP bans and every IP rate limit | same matrix |
| Stale Cloudflare range list | detected by the new `edge` probe in `GET /api/admin/health.php`: **failing** when Cloudflare fronts the request but the peer is untrusted, or when forwarding headers arrive from an untrusted peer. Escape hatch: the `TRUSTED_PROXY_RANGES` env var (comma-separated CIDRs) trusts another proxy without a deploy | `tests/cloudflare-cdn-contract.test.ts` + a live check in `health.php` |
| Cache poisoning of negotiated assets | `Vary: Accept-Encoding` on every `.js/.mjs/.css/.html/.json/.svg/.txt/.xml/.webmanifest/.wasm` (and their `.br`/`.gz` siblings) in `public/.htaccess` | static assertion |
| Cross-customer API caching | `Cache-Control: no-store, private` + `Pragma: no-cache` on all API responses (`api/config.php`); file endpoints may override | static assertion + the weekly monitor |
| Session cookies behind the edge | the 7-day session cookie and the auth-token cookie both derive `Secure` from `astro_request_is_https()` (`api/config.php`), which honours `X-Forwarded-Proto` — Cloudflare documents that header as the visitor's scheme and **overwrites** any client-supplied value, so an offloaded/Flexible TLS hop can no longer issue a non-`Secure` session cookie | `tests/cloudflare-cdn-contract.test.ts` executes the 5-scenario matrix under real PHP |
| CSP vs edge features | Rocket Loader / Email Obfuscation must stay off (§2); Web Analytics needs two CSP origins | runbook + the CSP assertion in the deployment guide |

Refresh the Cloudflare ranges occasionally (they rarely change):

```bash
curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6
```

If a range is missing, either edit `astro_cloudflare_ranges()` in
`api/client_ip.php` or set `TRUSTED_PROXY_RANGES=198.51.100.0/24,...` in the
hosting environment — the health endpoint's `edge` check turns the failure loud
in the meantime.

## 5. Deployments — purge the edge

A new `dist.zip` changes `index.html` and the hashed asset names. Hashed assets
need no purge (new names are new URLs). The HTML does:

```bash
# After uploading a release, purge the cached HTML so visitors get the new asset names.
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://astrosivam.com/","https://astrosivam.com/index.html"]}'
```

Use a **scoped** token (Zone → Cache Purge → Purge), never a global API key.
If you skip Rule 3 entirely, no purge step is needed.

## 6. Origin exposure (optional hardening)

The site cannot be reached by IP: the Apache vhost answers on the hostname, and
`api/client_ip.php` refuses to trust forwarding headers from an untrusted peer —
so an attacker who finds the origin IP cannot forge a client IP anyway. If you
also want to block direct-to-origin traffic, add a Cloudflare WAF rule allowing
only Cloudflare IPs (or a firewall rule on the host) — but keep a temporary
allow-list bypass while applying it, and re-test the health endpoint afterwards.

## 7. Verification checklist

**In the repo (already green):** `npm test` runs `tests/cloudflare-cdn-contract.test.ts`
— the spoofing matrix executes the real PHP (PHP-WASM), and the configuration
assertions cover the `Vary`/`no-store`/monitor/runbook wiring.

**From the edge, after enabling Cloudflare:**

```bash
# 1. The proxy is really in front
curl -sI https://astrosivam.com/ | grep -i 'cf-ray\|server\|strict-transport-security'

# 2. The API is NOT cached at the edge, and says so
curl -s -o /dev/null -D - https://astrosivam.com/api/payment/webhook/health \
  | grep -i 'cf-cache-status\|cache-control'

# 3. Compression: the bundle arrives Brotli/gzip compressed
curl -s -o /dev/null -D - -H 'Accept-Encoding: br' https://astrosivam.com/assets/<a-real-chunk>.js \
  | grep -i 'content-encoding\|cf-cache-status'

# 4. Assets are cached at the edge after the first hit (2nd request should HIT)
curl -s -o /dev/null -D - https://astrosivam.com/assets/<a-real-chunk>.js | grep -i cf-cache-status

# 5. The app still works end to end (the real regression suite, over the CDN)
npx playwright test tests/browser/homepage-navigation.spec.ts --base-url https://astrosivam.com

# 6. Admin health: the `edge` probe must read ok and name cf_connecting_ip
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://astrosivam.com/api/admin/health.php \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([c for c in d['checks'] if c['name']=='edge'][0])"

# 7. Rate limits still see distinct visitors (the whole point of §4)
#    Two requests from different networks must not share one bucket:
#    check the admin recovery panel / server log for distinct client IPs.
```

**Then, once only:** run the weekly monitor by hand
(`Actions → Production monitoring → Run workflow`) and confirm no step is red.

## 8. What "done" looks like

- `cf-ray` present on the homepage; `cf-cache-status: MISS` then `HIT` for `/assets/*`.
- `cf-cache-status` **never** `HIT` for `/api/*`, and `Cache-Control: no-store` present.
- Brotli served to a `br`-capable client.
- The Playwright smoke test passes against the live origin.
- `GET /api/admin/health.php` → `edge: ok`, `clientIpSource: cf_connecting_ip`.
- HSTS and the rest of the security headers still present in the response.
