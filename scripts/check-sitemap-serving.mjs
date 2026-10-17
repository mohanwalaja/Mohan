#!/usr/bin/env node
/**
 * ASTRO SIVAM — sitemap serving check ("did the 406 fix actually land?").
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-10-17 the sitemap was rejected by Google with a 406 / "Sitemap could
 * not be read". The cause was NOT the XML: the origin answered
 *
 *     HTTP/1.1 200 OK
 *     Content-Type: application/x-gzip
 *     Content-Length: 353          <- the COMPRESSED size (the XML is 2425 B)
 *     (no Content-Encoding header)
 *
 * i.e. the pre-compressed sibling (sitemap.xml.gz) was served as opaque gzip
 * bytes with no `Content-Encoding` header, because the .htaccess mapping that
 * declares the encoding existed for .js/.css/.html only. Google received gzip
 * where XML was expected. A second, independent cause is the host WAF
 * (ModSecurity) answering 406 to requests whose header shape is not
 * browser-like — a crawler sends no Accept-Language and no Sec-Fetch-*.
 *
 * This script reproduces BOTH failure modes from the crawler's side and
 * fails loudly, so "the sitemap is submitted but Google cannot read it" can
 * never be mistaken for "the sitemap is fine".
 *
 * USAGE
 *   node scripts/check-sitemap-serving.mjs                 # check the live site
 *   node scripts/check-sitemap-serving.mjs --url https://astrosivam.com/sitemap.xml
 *   node scripts/check-sitemap-serving.mjs --local         # check the build output
 *   node scripts/check-sitemap-serving.mjs --json          # machine-readable
 *
 * The live check needs outbound HTTPS to the site (run it from the machine
 * that hosts or administers the site). It never sends credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const ORIGIN = 'https://astrosivam.com';
const sitemapUrl = option('url', `${ORIGIN}/sitemap.xml`);
const robotsUrl = option('robots-url', `${ORIGIN}/robots.txt`);
const timeoutMs = Number(option('timeout', '20000'));
const asJson = flag('json');

/**
 * The client profiles a search engine (or a monitor) actually uses. A real
 * browser sends Accept, Accept-Language, Accept-Encoding and Sec-Fetch-*; a
 * crawler sends almost nothing. The bare profiles are the ones that used to
 * trip the WAF's header-shape rules.
 */
const PROFILES = [
  {
    name: 'googlebot (browser-like)',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  },
  {
    name: 'googlebot (bare fetcher)',
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      Accept: '*/*',
    },
  },
  {
    name: 'curl (no accept-language)',
    headers: { 'User-Agent': 'curl/8.4.0', Accept: '*/*' },
  },
  {
    name: 'no user-agent at all',
    headers: {},
  },
];

/** Content types a search engine can actually parse as a sitemap. */
const READABLE_SITEMAP_TYPES = ['application/xml', 'text/xml', 'application/rss+xml'];

const results = [];
let failures = 0;
let networkErrors = 0;

function record(profile, name, ok, detail) {
  results.push({ profile, name, ok, detail });
  if (!ok) failures += 1;
}

async function fetchWithTimeout(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { response, buffer };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The body is only usable if it is XML. A compressed body is fine ONLY when
 * the server said so (`Content-Encoding`), because then the client is allowed
 * to decode it. A body that starts with the gzip magic bytes while the
 * response claims to be XML is the exact 2026-10-17 failure.
 */
function readBody(response, buffer) {
  const encoding = (response.headers.get('content-encoding') || '').toLowerCase();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!encoding) {
    return { text: buffer.toString('utf8'), encoding, contentType, compressed: false };
  }
  try {
    if (encoding.includes('gzip')) {
      return { text: gunzipSync(buffer).toString('utf8'), encoding, contentType, compressed: true };
    }
    if (encoding.includes('br')) {
      return { text: brotliDecompressSync(buffer).toString('utf8'), encoding, contentType, compressed: true };
    }
    if (encoding.includes('deflate')) {
      return { text: inflateSync(buffer).toString('utf8'), encoding, contentType, compressed: true };
    }
  } catch (error) {
    return { text: '', encoding, contentType, compressed: true, decodeError: String(error) };
  }
  return { text: buffer.toString('utf8'), encoding, contentType, compressed: false };
}

function isGzipMagic(buffer) {
  return buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function expectedLocs() {
  const local = path.join(projectRoot, 'public', 'sitemap.xml');
  if (!fs.existsSync(local)) return null;
  const xml = fs.readFileSync(local, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function checkLive() {
  const expected = expectedLocs();

  for (const profile of PROFILES) {
    let payload;
    try {
      payload = await fetchWithTimeout(sitemapUrl, profile.headers);
    } catch (error) {
      record(
        profile.name,
        'sitemap fetch',
        false,
        `network error: ${error && error.message ? error.message : String(error)}`,
      );
      networkErrors += 1;
      continue;
    }

    const { response, buffer } = payload;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const encoding = (response.headers.get('content-encoding') || '').toLowerCase();

    if (response.status === 406) {
      record(
        profile.name,
        'sitemap fetch',
        false,
        'HTTP 406 Not Acceptable — the host WAF is rejecting this client. ' +
          'Check the ModSecurity audit log for the rule ID and add it to the ' +
          'SecRuleRemoveById list in public/.htaccess (section 2b).',
      );
      continue;
    }
    if (response.status !== 200) {
      record(profile.name, 'sitemap fetch', false, `HTTP ${response.status} ${response.statusText}`);
      continue;
    }
    record(profile.name, 'sitemap fetch', true, 'HTTP 200');

    const type = contentType.split(';')[0].trim();
    if (READABLE_SITEMAP_TYPES.includes(type)) {
      record(profile.name, 'content-type', true, type);
    } else {
      record(
        profile.name,
        'content-type',
        false,
        `${type || '(none)'} is not a readable sitemap type` +
          (type === 'application/x-gzip'
            ? ' — the compressed sibling is being served without a Content-Encoding header (the 2026-10-17 bug)'
            : ''),
      );
    }

    if (isGzipMagic(buffer) && !encoding) {
      record(
        profile.name,
        'body',
        false,
        'body is gzip data but the response carries no Content-Encoding header — ' +
          'a crawler cannot read this',
      );
      continue;
    }

    const body = readBody(response, buffer);
    if (body.decodeError) {
      record(profile.name, 'body', false, `body could not be decoded: ${body.decodeError}`);
      continue;
    }

    const text = body.text.trim();
    if (!text.startsWith('<?xml')) {
      record(profile.name, 'body', false, `body is not an XML document (starts with ${JSON.stringify(text.slice(0, 40))})`);
      continue;
    }
    if (!/<urlset[\s>]/.test(text) || !/<\/urlset>/.test(text)) {
      record(profile.name, 'body', false, 'body has no <urlset> root element');
      continue;
    }
    record(profile.name, 'body', true, `valid sitemap XML (${text.length} bytes${body.encoding ? `, ${body.encoding}` : ''})`);

    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (expected) {
      if (locs.length === expected.length) {
        record(profile.name, 'url count', true, `${locs.length} URLs (matches public/sitemap.xml)`);
      } else {
        record(profile.name, 'url count', false, `${locs.length} URLs live, ${expected.length} in public/sitemap.xml — the deployed sitemap is stale`);
      }
      const missing = expected.filter((loc) => !locs.includes(loc));
      if (missing.length) {
        record(profile.name, 'url set', false, `missing from the live sitemap: ${missing.join(', ')}`);
      } else {
        record(profile.name, 'url set', true, 'every URL of public/sitemap.xml is listed');
      }
    } else {
      record(profile.name, 'url count', true, `${locs.length} URLs`);
    }
  }

  // robots.txt is the other document a crawler fetches with a non-browser
  // client, and it must point at the sitemap.
  try {
    const { response, buffer } = await fetchWithTimeout(robotsUrl, { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (response.status !== 200) {
      record('robots.txt', 'fetch', false, `HTTP ${response.status} ${response.statusText}`);
    } else if (type !== 'text/plain') {
      record('robots.txt', 'content-type', false, `${type || '(none)'} (expected text/plain)`);
    } else {
      record('robots.txt', 'fetch', true, 'HTTP 200, text/plain');
      const text = buffer.toString('utf8');
      if (text.includes(sitemapUrl)) {
        record('robots.txt', 'sitemap pointer', true, `advertises ${sitemapUrl}`);
      } else {
        record('robots.txt', 'sitemap pointer', false, `does not advertise ${sitemapUrl}`);
      }
    }
  } catch (error) {
    record('robots.txt', 'fetch', false, `network error: ${error && error.message ? error.message : String(error)}`);
    networkErrors += 1;
  }
}

function checkLocal() {
  const dist = path.join(projectRoot, 'dist');
  const distSitemap = path.join(dist, 'sitemap.xml');
  if (!fs.existsSync(distSitemap)) {
    record('build', 'dist/sitemap.xml', false, 'missing — run `npm run build` first');
    return;
  }
  record('build', 'dist/sitemap.xml', true, 'present');

  // The compressed sibling is the 2026-10-17 bug: it must not exist for the
  // sitemap, and it must not exist for robots.txt either.
  for (const name of ['sitemap.xml', 'robots.txt']) {
    for (const suffix of ['.br', '.gz']) {
      const candidate = path.join(dist, `${name}${suffix}`);
      if (fs.existsSync(candidate)) {
        record('build', `${name}${suffix}`, false, 'a pre-compressed sibling exists — it can be served as opaque gzip bytes');
      } else {
        record('build', `${name}${suffix}`, true, 'absent (plain bytes only)');
      }
    }
  }

  const xml = fs.readFileSync(distSitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length > 0) {
    record('build', 'url count', true, `${locs.length} URLs`);
  } else {
    record('build', 'url count', false, 'no <loc> entries');
  }

  const publicSitemap = path.join(projectRoot, 'public', 'sitemap.xml');
  if (fs.existsSync(publicSitemap)) {
    const same = fs.readFileSync(publicSitemap, 'utf8') === xml;
    record(
      'build',
      'public/sitemap.xml',
      same,
      same ? 'byte-identical to dist/sitemap.xml' : 'differs from dist/sitemap.xml — copy it after every build',
    );
  }
}

if (flag('local')) {
  checkLocal();
} else {
  await checkLive();
}

// Exit codes: 0 = a crawler can read the sitemap, 1 = it cannot,
// 3 = the site could not be reached at all (a different problem: wrong URL,
// DNS, firewall — NOT a broken sitemap). The distinction matters to the
// submission script, which must not claim "the sitemap is broken" when the
// only thing that failed was the network.
const unreachable = failures > 0 && networkErrors === failures;

if (asJson) {
  console.log(JSON.stringify({ ok: failures === 0, failures, networkErrors, unreachable, results }, null, 2));
} else {
  console.log('\n--- SITEMAP SERVING CHECK ---');
  let lastProfile = null;
  for (const result of results) {
    if (result.profile !== lastProfile) {
      console.log(`\n[${result.profile}]`);
      lastProfile = result.profile;
    }
    console.log(`  [${result.ok ? 'PASS' : 'FAIL'}] ${result.name}: ${result.detail}`);
  }
  if (failures === 0) {
    console.log('\nAll checks passed — a search engine can read the sitemap.\n');
  } else if (unreachable) {
    console.log(
      `\nThe site could not be reached from this machine (${networkErrors} network error(s)). ` +
        'That is a connectivity problem, not a broken sitemap — run this from a machine ' +
        'that can reach the site.\n',
    );
  } else {
    console.log(`\n${failures} check(s) failed — see docs/SITEMAP_406_WAF_FIX_AND_GSC_SUBMISSION.md.\n`);
  }
}

process.exit(failures === 0 ? 0 : unreachable ? 3 : 1);
