# sitemap.xml 406 / unreadable sitemap — fix, deploy, verify & submit

**Date:** 2026-10-17 · **Status:** FIXED IN CODE — deploy + submit to finish ·
**Scope:** `public/.htaccess`, `scripts/prerender.mjs`, `scripts/check-sitemap-serving.mjs`,
`scripts/submit-sitemap-gsc.mjs`, `tests/sitemap-serving-contract.test.ts`

## 1. What was actually broken

Search Console reported the sitemap as unreadable / `406 Not Acceptable`. The
XML was never the problem. The **response** was:

```http
$ curl -sSI https://astrosivam.com/sitemap.xml
HTTP/1.1 200 OK
Server: Apache
Content-Type: application/x-gzip      <-- a GZIP FILE, not XML
Content-Length: 353                  <-- the COMPRESSED size (the XML is 2425 bytes)
Vary: Accept-Encoding
(no Content-Encoding header)
```

`robots.txt` on the same host answered `Content-Type: text/plain` — correct.
The difference between the two files is the whole bug.

### Root cause A — the pre-compressed sibling was served without its encoding

`scripts/prerender.mjs` wrote `dist/sitemap.xml` **and** its pre-compressed
siblings (`sitemap.xml.br`, `sitemap.xml.gz`), because the sitemap is larger
than the 1 KiB compression threshold. The production `.htaccess` then
negotiated every request for a `.xml`/`.txt` file to the compressed sibling
when the client advertised `Accept-Encoding` — and **every crawler does**.

The `.htaccess` declared `Content-Encoding`/`Content-Type` for the
pre-compressed siblings of `.js`, `.css` and `.html` only. There was no
mapping for `.xml`, so `sitemap.xml.gz` was served as
`Content-Type: application/x-gzip` **with no `Content-Encoding` header**:
Google received gzip bytes where XML was expected and could not parse the
file. (`robots.txt` was fine — it is 67 bytes, under the threshold, so it
never got a sibling.)

This was a hole in a *family* of rules: `.json`, `.mjs`, `.svg`, `.wasm` and
`.webmanifest` had the same missing mapping.

### Root cause B — the host WAF answers 406 to non-browser clients

Shared cPanel hosts run ModSecurity (or a host WAF) that scores a request by
the **shape** of its headers. A real browser sends `User-Agent`, `Accept`,
`Accept-Language`, `Accept-Encoding` and `Sec-Fetch-*`. A crawler, a Search
Console fetcher and a monitoring probe send a bare `User-Agent` — or none.
The generic "missing / invalid header" rules then trip and the WAF answers
**406**. The rules that fire, depending on the ruleset version:

| Rule ID | What it flags |
|---|---|
| `200002`–`200006` | CRS 2.x protocol enforcement (invalid/missing User-Agent, Accept, Accept-Encoding) |
| `920350`, `920420` | CRS 3.x protocol enforcement (header/cookie not allowed by policy) |
| `949110` | CRS 3.x bot fingerprinting (generic non-browser client) |
| `980130` | CRS 3.x anomaly score exceeded — the usual 406 trigger |

## 2. What changed (three layers, so the next edit cannot reopen this)

1. **The crawl-facing documents are never pre-compressed** (`public/.htaccess`,
   rule `0-crawl`): a request for `.xml`/`.txt` skips the sibling negotiation
   *and* on-the-fly compression. A crawler gets plain bytes, always.
2. **Every negotiable type declares its encoding and its original content
   type** (`public/.htaccess`, section 5): `.mjs`, `.json`, `.svg`, `.wasm` and
   `.webmanifest` siblings now carry `Content-Encoding` + `Content-Type`
   exactly like `.js`/`.css`/`.html` do. `sitemap.xml` is pinned to
   `application/xml` and `robots.txt` to `text/plain`; `AddType` entries make
   the type host-independent.
3. **The build stops creating the sibling in the first place**
   (`scripts/prerender.mjs`): `writeWithSiblings(..., { compress: false })` for
   `sitemap.xml`. A 2.4 KB sitemap gains nothing from compression.
4. **The WAF is exempted, not disabled** (`public/.htaccess`, section 2b):
   - `SecRuleRemoveById` for the header-shape rules on `sitemap.xml` and
     `robots.txt` — a config-time removal, so it works whatever order the
     server-level rules run in;
   - a phase-1 rule that lets **verified search-engine crawlers** (Googlebot,
     Bingbot, …) past the same header-shape rules site-wide. Only those rules
     are removed for crawlers: every injection, traversal and bot-blocking
     rule still applies.
   - `SecRuleEngine Off` / `SecFilterEngine Off` are **not** used anywhere —
     switching the WAF off for the whole site to fix a crawler problem
     removes a real protection layer. `tests/sitemap-serving-contract.test.ts`
     fails if anyone tries.

## 3. Deploy

```bash
npm run build                 # rebuilds dist/ (sitemap.xml has no sibling now)
npm run sitemap:check:local   # proves the build output is clean
```

Then upload to cPanel exactly as usual
([deployment guide](BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md)):

- `dist/**` → `public_html/` (this includes the new `dist/sitemap.xml`),
- `public/.htaccess` → `public_html/.htaccess` (the WAF block and the
  encoding fixes live here — **this file is the actual fix**),
- remove the stale `public_html/sitemap.xml.gz` and `public_html/sitemap.xml.br`
  if the previous deploy left them on the server.

**Cloudflare:** the broken response may still be cached at the edge. Purge it
after deploying — `Purge Everything` in **Caching → Configuration**, or the
scoped API call in [CLOUDFLARE_CDN_SETUP.md §5](CLOUDFLARE_CDN_SETUP.md).
Without the purge, Google can keep fetching the cached `application/x-gzip`
response and the site will still look broken.

## 4. Verify (from any machine with internet access to the site)

```bash
npm run sitemap:check
```

It fetches the live sitemap the way four different clients do (Googlebot with
full browser headers, a bare Googlebot fetcher, `curl`, and a request with
**no User-Agent at all**) and asserts, for each:

- HTTP 200 (a 406 is reported as a WAF block, with the next step),
- `Content-Type` is `application/xml` / `text/xml` — never `application/x-gzip`,
- the body is not gzip data served without a `Content-Encoding` header,
- the body is a real `<urlset>` and lists exactly the URLs of
  `public/sitemap.xml`,
- `robots.txt` is `text/plain` and advertises the sitemap.

Exit code 0 = a search engine can read the sitemap, 1 = it cannot,
3 = the site could not be reached from this machine at all (a connectivity
problem, not a broken sitemap). This is the same script the GSC submission
runs before it submits anything.

## 5. Submit to Google Search Console

### 5a. The UI (no credentials, 30 seconds)

Search Console → **Sitemaps** → *Enter a sitemap* → `sitemap.xml` → **Submit**.
It must report **Success** and the number of URLs (14 today). If it still
reports an error, the sitemap is still not readable — run `npm run sitemap:check`
and fix that first.

### 5b. The API (repeatable, for after every content deploy)

```bash
export GSC_CLIENT_ID=...        # OAuth client id
export GSC_CLIENT_SECRET=...    # OAuth client secret
export GSC_REFRESH_TOKEN=...    # refresh token for the webmasters scope
npm run sitemap:submit          # verify -> submit -> read the status back
```

`scripts/submit-sitemap-gsc.mjs` does three things in order:

1. **verifies** the sitemap is readable by a crawler (it refuses to submit a
   broken sitemap — a submission of an unreadable file is a no-op),
2. **submits** it: `PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}`,
3. **reads the status back** (`lastSubmitted`, `isPending`, `errors`) so the
   result is visible without opening the UI.

Useful flags: `--status` (read the submitted sitemaps and their state),
`--dry-run` (print the request, touch no credentials), `--skip-verify` (submit
without the crawler check — use it when the machine running the script cannot
open the site but the sitemap is known to be live), `--site-url`,
`--sitemap-url`.

**Property identifier.** `siteUrl` is the property as Search Console knows it:

- Domain property → `sc-domain:astrosivam.com` (no protocol, no slash) — this
  is what the site should use, because it covers `www` as well;
- URL-prefix property → `https://astrosivam.com/` (with the trailing slash).

A wrong identifier is the most common cause of a `403` from this API.

**Getting the refresh token** (one time): Google Cloud Console → enable the
**Search Console API** → *Credentials* → **OAuth client ID → Desktop app** →
authorize an account that is an owner of the property, with the scope
`https://www.googleapis.com/auth/webmasters`. The refresh token, client id and
client secret go into the shell environment (or an untracked `.env` file);
`.env.example` declares the variable names and nothing else.

**The legacy ping endpoints are dead** (both confirmed live on 2026-10-17):

| Endpoint | Answer |
|---|---|
| `https://www.google.com/ping?sitemap=…` | *"Sitemaps ping is deprecated"* / HTTP **404** |
| `https://www.bing.com/ping?sitemap=…` | HTTP **410 Gone**, empty body |

So there is no "ping" shortcut left on either engine: Google submission goes
through the Sitemaps API (or the UI), and Bing through Bing Webmaster Tools
(UI, or its `IndexNow`/API route). The script deliberately uses neither ping
endpoint, and the contract test fails if somebody puts one back.

## 6. If a 406 is still returned after the deploy

The exemption list in `public/.htaccess` section 2b covers the rules that
fire on the common rulesets. If the host's ruleset uses a different ID, find
it in the ModSecurity audit log and add it to **both** `SecRuleRemoveById`
lists (the `FilesMatch` one and the crawler one):

```bash
# BigRock / cPanel — the host's error log carries the rule ID
grep -i "modsecurity" /usr/local/apache/logs/error_log | tail -50
# or the audit log, if the host exposes it
tail -50 /usr/local/apache/logs/modsec_audit.log
```

The line to look for is the one naming the rule and the URL:

```
ModSecurity: Access denied with code 406 (phase 1). Matched "Operator `...' against variable `REQUEST_HEADERS:User-Agent' ... [file "/home/xxx/public_html/sitemap.xml"] [id "949110"] [rev ""]
```

Add that ID (e.g. `949110`) to:

```apache
SecRuleRemoveById 200002 200003 200004 200005 200006 920350 920420 949110 980130
```

If the host will not let you edit the ruleset, send this to BigRock support:

> ModSecurity on astrosivam.com is returning HTTP 406 Not Acceptable for HTTP
> clients with non-browser User-Agents (Googlebot, Bingbot and the Google
> Search Console sitemap fetcher send no Accept-Language and no Sec-Fetch-*
> headers). I need the header-shape rules exempted for the crawl-critical
> paths, or the rule IDs that fire to be whitelisted, for:
>
>   /sitemap.xml
>   /robots.txt
>
> Please check the ModSecurity audit log on this domain for the rule IDs that
> triggered on those paths and apply the exclusion. The site must not be left
> with ModSecurity disabled globally — a targeted exclusion is what is needed.

## 7. Regression guards

`tests/sitemap-serving-contract.test.ts` (11 checks, wired into
`npm test`) pins the whole contract:

- the crawl-facing documents are excluded from the sibling negotiation and
  from on-the-fly compression;
- `sitemap.xml` is `application/xml`, `robots.txt` is `text/plain`;
- **every** type the negotiation can reach declares its `Content-Encoding` and
  its original `Content-Type` (the hole the sitemap fell through);
- the build emits no compressed sibling for the sitemap;
- the WAF exemption exists for **both** `mod_security2.c` and
  `mod_security3.c` (a block guarded by `<IfModule mod_security.c>` — the most
  common copy-paste — matches nothing on a real server and silently disables
  the whole exemption) and contains the known 406 triggers;
- the WAF is never switched off wholesale, and the audit log stays on;
- `robots.txt` keeps advertising the sitemap and the site stays crawlable;
- the check script exists and detects a gzip body without a `Content-Encoding`;
- the submission uses the supported Sitemaps API, not the deprecated ping;
- no OAuth credential is committed to the repository;
- the `.htaccess` is structurally sound (balanced containers, known
  directives, ModSecurity directives only inside their `<IfModule>` guard) —
  there is no Apache in CI, and a syntax error there is a 500 on every
  request.
