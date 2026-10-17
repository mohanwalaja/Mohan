#!/usr/bin/env node
/**
 * ASTRO SIVAM — submit the sitemap to Google Search Console (and read its
 * status back).
 *
 * WHY A SCRIPT
 * ------------
 * The 2026-10-17 incident was: the sitemap was submitted, but Google could
 * not READ it (the origin served the gzip sibling as `application/x-gzip`
 * without a `Content-Encoding` header, and the host WAF answered 406 to the
 * non-browser fetcher). Submitting a sitemap that cannot be read is a no-op,
 * so this script is designed around the same order of operations:
 *
 *   1. verify   — the sitemap must be readable over the public internet first
 *                 (scripts/check-sitemap-serving.mjs does that; --verify runs it)
 *   2. submit   — PUT the sitemap to the Search Console Sitemaps API
 *   3. read back — GET the sitemap's status and print what Google recorded
 *
 * The legacy `https://www.google.com/ping?sitemap=...` endpoint is DEPRECATED
 * (it answers "Sitemaps ping is deprecated" / 404 as of 2023) and is NOT used
 * here. The Sitemaps API is the supported way.
 *
 * API (https://developers.google.com/webmaster-tools/v1/sitemaps/submit):
 *   PUT  https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
 *   GET  https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps
 *   GET  https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
 * Scope: https://www.googleapis.com/auth/webmasters
 *
 * siteUrl is the PROPERTY identifier as Search Console knows it:
 *   Domain property    -> sc-domain:astrosivam.com   (no protocol, no slash)
 *   URL-prefix property-> https://astrosivam.com/    (with trailing slash)
 *
 * CREDENTIALS (never commit them; keep them in the shell or a .env file)
 *   GSC_ACCESS_TOKEN           a ready OAuth2 access token (short lived)
 *   GSC_CLIENT_ID             OAuth client id
 *   GSC_CLIENT_SECRET         OAuth client secret
 *   GSC_REFRESH_TOKEN         OAuth refresh token (the usual setup)
 *
 * USAGE
 *   node scripts/submit-sitemap-gsc.mjs                 # verify + submit
 *   node scripts/submit-sitemap-gsc.mjs --status        # read the status back
 *   node scripts/submit-sitemap-gsc.mjs --dry-run       # print the request only
 *   node scripts/submit-sitemap-gsc.mjs --skip-verify   # submit without the crawler check
 *   node scripts/submit-sitemap-gsc.mjs --site-url 'sc-domain:astrosivam.com'
 *   node scripts/submit-sitemap-gsc.mjs --sitemap-url https://astrosivam.com/sitemap.xml
 *
 * HOW TO GET THE REFRESH TOKEN (one time, ~5 minutes)
 *   1. Google Cloud Console -> create/select a project -> enable the
 *      "Search Console API".
 *   2. Credentials -> OAuth client ID -> "Desktop app" -> download the JSON.
 *   3. Authorize your Google account with that client and the scope
 *      https://www.googleapis.com/auth/webmasters (one consent screen click).
 *      The easiest script-free way is to run the "gcloud auth application-default
 *      login --scopes=..." flow and read the refresh token from
 *      ~/.config/gcloud/application_default_credentials.json.
 *   4. Export GSC_CLIENT_ID, GSC_CLIENT_SECRET and GSC_REFRESH_TOKEN.
 *
 * The UI route needs no credentials at all: Search Console -> Sitemaps ->
 * "Enter a sitemap" -> https://astrosivam.com/sitemap.xml -> Submit.
 * See docs/SEARCH_INDEXING_GSC_BING_RUNBOOK.md section 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const DEFAULT_SITE_URL = 'sc-domain:astrosivam.com';
const DEFAULT_SITEMAP_URL = 'https://astrosivam.com/sitemap.xml';
const API_BASE = 'https://www.googleapis.com/webmasters/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

const siteUrl = option('site-url', process.env.GSC_SITE_URL || DEFAULT_SITE_URL);
const sitemapUrl = option('sitemap-url', process.env.GSC_SITEMAP_URL || DEFAULT_SITEMAP_URL);
const dryRun = flag('dry-run');
const statusOnly = flag('status');

/** Load a .env file if one exists (no dependency, no overwrite of real env). */
function loadDotEnv() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

function fail(message, hint) {
  console.error(`\nERROR: ${message}\n`);
  if (hint) console.error(`${hint}\n`);
  process.exit(2);
}

/** Exchange the refresh token for a short-lived access token. */
async function accessToken() {
  const direct = process.env.GSC_ACCESS_TOKEN;
  if (direct) return direct;

  const { GSC_CLIENT_ID: clientId, GSC_CLIENT_SECRET: clientSecret, GSC_REFRESH_TOKEN: refreshToken } = process.env;
  if (!clientId || !clientSecret || !refreshToken) {
    fail(
      'no Search Console credentials found.',
      [
        'Set one of:',
        '  GSC_ACCESS_TOKEN=<oauth2 access token>',
        '  or GSC_CLIENT_ID=... GSC_CLIENT_SECRET=... GSC_REFRESH_TOKEN=...',
        '',
        'The refresh token is created once in the Google Cloud Console (enable the',
        'Search Console API, create a Desktop OAuth client, authorize an account',
        'with the scope https://www.googleapis.com/auth/webmasters).',
        '',
        'No credentials are needed for the manual route: Search Console ->',
        'Sitemaps -> "Enter a sitemap" -> https://astrosivam.com/sitemap.xml.',
      ].join('\n'),
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    fail(
      `could not exchange the refresh token (HTTP ${response.status}): ${payload.error_description || payload.error || 'unknown error'}`,
      'Check that the Search Console API is enabled for the project and that the refresh token was issued for the webmasters scope.',
    );
  }
  return payload.access_token;
}

async function apiGet(pathname, token) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload.error?.message || `HTTP ${response.status}`;
    if (response.status === 403) {
      fail(
        `the account is not authorised for this property: ${reason}`,
        [
          `siteUrl in use: ${siteUrl}`,
          'For a Domain property the identifier is sc-domain:astrosivam.com (no protocol, no slash).',
          'For a URL-prefix property it is https://astrosivam.com/ (trailing slash).',
          'The account that owns the token must be an owner/full user of the property.',
        ].join('\n'),
      );
    }
    fail(`Search Console API request failed: ${reason}`);
  }
  return payload;
}

/** Fetch the sitemap the way a crawler does, and refuse to submit a broken one. */
async function assertSitemapReadable() {
  const { spawnSync } = await import('node:child_process');
  const script = path.join(projectRoot, 'scripts', 'check-sitemap-serving.mjs');
  const result = spawnSync(process.execPath, [script, '--url', sitemapUrl], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout || '');
  if (result.status === 3) {
    fail(
      `${sitemapUrl} could not be reached from this machine — nothing was submitted.`,
      'This is a connectivity problem (URL, DNS, firewall, proxy), not a broken sitemap. ' +
        'Run the submission from a machine that can reach the site.',
    );
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    fail(
      'the sitemap is not readable as a search engine would read it — nothing was submitted.',
      'Fix the serving first (deploy the updated public/.htaccess and re-run the build), then submit again.',
    );
  }
}

if (dryRun) {
  console.log('\n--- GSC SUBMISSION (dry run) ---');
  console.log(`property : ${siteUrl}`);
  console.log(`sitemap  : ${sitemapUrl}`);
  console.log(`submit   : PUT ${API_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`);
  console.log(`status   : GET ${API_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`);
  console.log('token    : <not requested>');
  console.log('');
  process.exit(0);
}

if (!statusOnly) {
  console.log(`\n--- GSC SUBMISSION ---`);
  if (flag('skip-verify')) {
    // Escape hatch: the verification needs to REACH the site from this
    // machine, while the API call only needs to reach Google. Use it when
    // this machine cannot open the site (VPN/firewall) but the sitemap is
    // known to be live.
    console.log('1/3 skipping the crawler check (--skip-verify)');
  } else {
    console.log('1/3 verifying the sitemap is readable by a crawler...');
    await assertSitemapReadable();
  }
}

const token = await accessToken();

if (statusOnly) {
  console.log('\n2/3 reading the submitted sitemaps...');
  const list = await apiGet(`/sites/${encodeURIComponent(siteUrl)}/sitemaps`, token);
  const entries = Array.isArray(list) ? list : list.sitemap || [];
  if (!entries.length) {
    console.log('   no sitemap has been submitted for this property yet.');
  }
  for (const entry of entries) {
    console.log(`   ${entry.path}`);
    console.log(`     last submitted : ${entry.lastSubmitted || '(never)'}`);
    console.log(`     is pending     : ${entry.isPending}`);
    console.log(`     is an index    : ${entry.isSitemapsIndex}`);
    console.log(`     errors         : ${entry.errors || entry.warning ? `${entry.errors || ''} ${entry.warning || ''}`.trim() : 'none'}`);
    if (entry.lastSubmitted && entry.lastSubmittedDate) {
      console.log(`     submitted at   : ${entry.lastSubmittedDate}`);
    }
    for (const child of entry.sitemaps || []) {
      console.log(`     child          : ${child.path} (${child.errors || 'no errors'})`);
    }
  }
  console.log('');
  process.exit(0);
}

console.log('2/3 submitting the sitemap...');
const submitPath = `/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
const submitResponse = await fetch(`${API_BASE}${submitPath}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Length': '0' },
});
if (!submitResponse.ok) {
  const payload = await submitResponse.json().catch(() => ({}));
  fail(
    `the sitemap could not be submitted (HTTP ${submitResponse.status}): ${payload.error?.message || 'unknown error'}`,
    'Check the property identifier and that the token belongs to an owner of the property.',
  );
}
console.log(`   submitted: ${sitemapUrl}`);

console.log('3/3 reading the status back...');
let status = null;
try {
  status = await apiGet(submitPath, token);
} catch {
  const list = await apiGet(`/sites/${encodeURIComponent(siteUrl)}/sitemaps`, token);
  const entries = Array.isArray(list) ? list : list.sitemap || [];
  status = entries.find((entry) => entry.path === sitemapUrl) || null;
}
if (status) {
  console.log(`   last submitted : ${status.lastSubmitted || '(pending)'}`);
  console.log(`   is pending     : ${status.isPending}`);
  console.log(`   errors         : ${status.errors || 'none'}`);
  console.log(`   warning        : ${status.warning || 'none'}`);
  console.log('   Google will crawl the sitemap shortly; check "Indexing -> Sitemaps" for the result.');
} else {
  console.log('   the sitemap is queued; the status will appear in "Indexing -> Sitemaps".');
}
console.log('');
