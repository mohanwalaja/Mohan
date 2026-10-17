/**
 * ASTRO SIVAM — sitemap serving contract (the 2026-10-17 "sitemap.xml 406"
 * incident).
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Google Search Console reported the sitemap as unreadable. The XML was
 * correct the whole time; the RESPONSE was not. The origin answered:
 *
 *     HTTP/1.1 200 OK
 *     Content-Type: application/x-gzip
 *     Content-Length: 353          <- compressed size; the XML is 2425 bytes
 *     (no Content-Encoding header)
 *
 * Two independent defects produced that, and BOTH are pinned here:
 *
 *   1. ENCODING: the .htaccess pre-compression negotiation swapped in
 *      sitemap.xml.gz, but the mapping that declares `Content-Encoding` /
 *      `Content-Type` existed for .js/.css/.html ONLY. Every other type the
 *      negotiation can reach (json, mjs, svg, wasm, webmanifest) had the same
 *      hole; a future asset would have hit it too.
 *   2. WAF: the host's ModSecurity answers 406 to clients whose header shape
 *      is not browser-like — which is exactly what a crawler, a Search Console
 *      fetcher and a monitoring probe send.
 *
 * A third, quieter defect is pinned as well: the BUILD emitted the compressed
 * sitemap sibling in the first place (scripts/prerender.mjs). Even with a
 * perfect .htaccess, shipping a sibling for a crawl-facing document is one
 * broken rewrite away from the same outage.
 *
 * These are static contracts on files that are easy to "tidy up" by accident:
 * every one of the assertions below fails if somebody re-adds a compressed
 * sibling, drops a Content-Encoding mapping, narrows the crawler allowlist, or
 * "fixes" a 406 by switching the WAF off for the whole site.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) throw new Error(`check("${name}") must be synchronous`);
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- SITEMAP SERVING CONTRACT (sitemap.xml 406 / unreadable sitemap) ---');

const htaccess = read('public/.htaccess');
/** Apache comments are whole lines starting with "#" — the prose in this file
 *  explains WHY the WAF is not switched off, and that prose must not be
 *  mistaken for a directive that switches it off. */
const htaccessDirectives = htaccess
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
const prerender = read('scripts/prerender.mjs');
const robotsTxt = read('public/robots.txt');
const checkScript = read('scripts/check-sitemap-serving.mjs');
const submitScript = read('scripts/submit-sitemap-gsc.mjs');

// The extension list the negotiation rule can reach. Anything added to it
// needs a Content-Encoding + Content-Type mapping, or it must be removed from
// the negotiation.
const negotiatedExtensions = (() => {
  const rule = /RewriteRule \^\(\.\*\)\\\.\(([^)]*)\)\$ \/\$1\.\$2\.br \[L\]/.exec(htaccess);
  assert.ok(rule, 'the Brotli negotiation rule must still exist');
  return rule[1].split('|').map((ext) => ext.trim());
})();

check('the crawl-facing documents are excluded from the pre-compressed negotiation', () => {
  // Every negotiation rule must refuse to serve the compressed sibling of a
  // crawl-facing text document. The condition is on REQUEST_FILENAME (the
  // on-disk path) so a query string cannot smuggle the request past it.
  const negotiationRules = [...htaccess.matchAll(/RewriteCond %\{REQUEST_FILENAME\} !\\\.\(xml\|txt\)\$\n\s*RewriteCond %\{HTTP:Accept-Encoding\}/g)];
  assert.ok(
    negotiationRules.length >= 2,
    'both the Brotli and the gzip negotiation rules must exclude .xml/.txt documents',
  );

  // The same documents must also skip on-the-fly compression, so the bytes on
  // the wire are always plain text.
  assert.match(
    htaccess,
    /RewriteCond %\{REQUEST_FILENAME\} \\\.\(xml\|txt\)\$\n\s*RewriteRule \^ - \[E=no-gzip:1,E=no-brotli:1\]/,
    'crawl-facing text documents must set no-gzip/no-brotli',
  );
});

check('the crawl-facing documents declare an explicit, parseable content type', () => {
  assert.match(
    htaccess,
    /<FilesMatch "\^sitemap\\\.xml\$">\s*\n\s*Header set Content-Type "application\/xml"/,
    'sitemap.xml must be served as application/xml',
  );
  assert.match(
    htaccess,
    /<FilesMatch "\^robots\\\.txt\$">\s*\n\s*Header set Content-Type "text\/plain"/,
    'robots.txt must be served as text/plain',
  );
  // The MIME map must agree, so the type is right even without the FilesMatch
  // block (e.g. a different vhost config).
  assert.match(htaccess, /AddType application\/xml \.xml/);
  assert.match(htaccess, /AddType text\/plain \.txt/);
});

check('every negotiable type declares its encoding and its original content type', () => {
  // This is the exact hole the sitemap fell through: the mapping existed for
  // .js/.css/.html only, so .xml.gz was served as raw gzip bytes.
  const typeFor: Record<string, string> = {
    js: 'application/javascript',
    mjs: 'application/javascript',
    css: 'text/css',
    html: 'text/html',
    json: 'application/json',
    svg: 'image/svg+xml',
    wasm: 'application/wasm',
    webmanifest: 'application/manifest+json',
  };
  for (const ext of negotiatedExtensions) {
    if (ext === 'xml' || ext === 'txt' || ext === 'map') {
      // .xml/.txt are excluded from the negotiation entirely (checked above);
      // .map files are never shipped (the deploy drops them and the sensitive
      // file block denies them).
      continue;
    }
    const contentType = typeFor[ext];
    assert.ok(contentType, `unknown negotiated extension .${ext} — add its content type to this test`);
    // The content type contains regex metacharacters (the "+" of image/svg+xml
    // and application/manifest+json), so it must be escaped, not pasted.
    const escapedType = contentType.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    for (const [suffix, encoding] of [
      ['br', 'br'],
      ['gz', 'gzip'],
    ]) {
      const pattern = new RegExp(
        `<FilesMatch "\\\\.${ext}\\\\.${suffix}\\$">[^]*?Header set Content-Encoding ${encoding}[^]*?Header set Content-Type ${escapedType}`,
      );
      assert.match(
        htaccess,
        pattern,
        `.${ext}.${suffix} must declare Content-Encoding ${encoding} and Content-Type ${contentType} — ` +
          'without it the client receives raw compressed bytes',
      );
    }
  }
});

check('the build does not emit a compressed sibling for the sitemap', () => {
  // The sibling is what the origin served as application/x-gzip. It must not
  // exist for a crawl-facing document in the first place.
  assert.match(
    prerender,
    /writeWithSiblings\(join\(DIST, 'sitemap\.xml'\), renderSitemap\(\), \{ compress: false \}\)/,
    'the sitemap must be written without pre-compressed siblings',
  );
  assert.match(
    prerender,
    /function writeWithSiblings\(absPath, contents, \{ compress = true \} = \{\}\)/,
    'writeWithSiblings must be able to skip the compression step',
  );
});

check('the deploy removes a stale compressed sibling left by an earlier release', () => {
  // The build no longer emits the sibling, but a copy left over on the host
  // from an earlier deploy would still be negotiated by .htaccess — and served
  // as application/x-gzip with no Content-Encoding header, which is exactly
  // the failure this whole change set fixes.
  for (const deployFile of ['deploy_cpanel.sh', 'scripts/sync_public_html_api.sh']) {
    const source = read(deployFile);
    assert.match(
      source,
      /sitemap\.xml\.gz/,
      `${deployFile} must remove the stale sitemap.xml.gz sibling`,
    );
    assert.match(
      source,
      /sitemap\.xml\.br/,
      `${deployFile} must remove the stale sitemap.xml.br sibling`,
    );
  }
  // The cPanel Git deployment has its own task list.
  const cpanel = read('.cpanel.yml');
  assert.match(cpanel, /sitemap\.xml\.gz/);
  assert.match(cpanel, /sitemap\.xml\.br/);
});

check('the WAF exemptions cover the crawl-critical paths', () => {
  // ModSecurity 2 loads as mod_security2.c and ModSecurity 3 as
  // mod_security3.c. A block guarded by <IfModule mod_security.c> (the most
  // common copy-paste) matches NOTHING on a real server and silently disables
  // the whole exemption — so both engine names must be present.
  for (const moduleName of ['mod_security2.c', 'mod_security3.c']) {
    const start = htaccess.indexOf(`<IfModule ${moduleName}>`);
    assert.ok(start !== -1, `the WAF exemption block must exist for ${moduleName}`);
    const end = htaccess.indexOf('</IfModule>', start);
    const block = htaccess.slice(start, end);

    assert.match(
      block,
      /<FilesMatch "\^\(sitemap\\\.xml\|robots\\\.txt\)\$">\s*\n\s*SecRuleRemoveById/,
      `${moduleName}: the crawl-critical documents must be exempt from the header-shape rules`,
    );
    assert.match(
      block,
      /SecRule REQUEST_HEADERS[:.]User-Agent "@rx \(\?i\).*googlebot.*bingbot/s,
      `${moduleName}: verified search-engine crawlers must be recognised by user agent`,
    );
    // The rules that actually produce the 406 must be in the removal list.
    for (const ruleId of ['949110', '980130', '920350', '200002']) {
      assert.ok(
        block.includes(ruleId),
        `${moduleName}: the WAF removal list must contain rule ${ruleId} (a known 406 trigger)`,
      );
    }
  }
});

check('the WAF is never switched off wholesale', () => {
  // "Fixing" a 406 by turning ModSecurity off for the whole site is the trap
  // this test exists to catch: it removes a real protection layer to fix a
  // crawler problem. Only targeted, per-path / per-user-agent exemptions are
  // allowed. The check runs on the DIRECTIVES only — the file's prose
  // explains the rule and must not trip it.
  assert.doesNotMatch(
    htaccessDirectives,
    /SecRuleEngine\s+Off/i,
    'ModSecurity must stay enabled for the site (use a targeted SecRuleRemoveById instead)',
  );
  assert.doesNotMatch(
    htaccessDirectives,
    /SecFilterEngine\s+Off/i,
    'the legacy ModSecurity 1 filter engine must not be disabled',
  );
  assert.doesNotMatch(
    htaccessDirectives,
    /SecFilterScanPOST\s+Off/i,
    'the legacy ModSecurity 1 POST scanner must not be disabled',
  );
  assert.doesNotMatch(
    htaccessDirectives,
    /SecAuditEngine\s+Off/i,
    'the WAF audit log must stay on — it is how the blocking rule ID is found',
  );
});

check('robots.txt advertises the sitemap that is actually served', () => {
  assert.match(robotsTxt, /Sitemap:\s*https:\/\/astrosivam\.com\/sitemap\.xml/);
  assert.match(robotsTxt, /User-agent:\s*\*/);
  assert.doesNotMatch(robotsTxt, /Disallow:\s*\/\s*$/, 'the whole site must stay crawlable');
});

check('a crawler-side check exists and catches the exact failure', () => {
  // The check script is what proves the fix landed on the live host, so it
  // must test the response the way a crawler receives it.
  assert.match(checkScript, /googlebot/);
  assert.match(checkScript, /no user-agent at all/i);
  assert.match(checkScript, /application\/xml/);
  assert.match(checkScript, /406/);
  assert.match(
    checkScript,
    /isGzipMagic|gzip magic/i,
    'the check must detect a gzip body served without a Content-Encoding header',
  );
});

check('the Search Console submission uses the supported API', () => {
  // The legacy ping endpoint is deprecated (it answers 404 / "Sitemaps ping is
  // deprecated"), so the submission must go through the Sitemaps API. The
  // check runs on the CODE — the script's prose explains that the ping
  // endpoint is deprecated and must not be mistaken for a call to it.
  const code = submitScript
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /webmasters\/v3/);
  assert.match(code, /method: 'PUT'/);
  assert.match(code, /sc-domain:astrosivam\.com/);
  assert.match(code, /https:\/\/www\.googleapis\.com\/auth\/webmasters/);
  assert.doesNotMatch(
    code,
    /google\.com\/ping/,
    'the deprecated sitemap ping endpoint must not be used',
  );
  // Submitting a sitemap that a crawler cannot read is a no-op, so the
  // submission verifies readability first.
  assert.match(submitScript, /assertSitemapReadable/);
  assert.match(submitScript, /check-sitemap-serving\.mjs/);
});

check('no credential is committed to the repository', () => {
  const envExample = read('.env.example');
  for (const key of ['GSC_CLIENT_ID', 'GSC_CLIENT_SECRET', 'GSC_REFRESH_TOKEN', 'GSC_ACCESS_TOKEN']) {
    assert.match(envExample, new RegExp(`^${key}=$`, 'm'), `${key} must be declared (empty) in .env.example`);
  }
  for (const [name, source] of [
    ['submit-sitemap-gsc.mjs', submitScript],
    ['check-sitemap-serving.mjs', checkScript],
    ['.env.example', envExample],
  ]) {
    assert.doesNotMatch(
      source,
      /[0-9]+-[a-z0-9]{32}\.apps\.googleusercontent\.com/,
      `${name} must not contain a real OAuth client id`,
    );
    assert.doesNotMatch(source, /\bAIza[0-9A-Za-z_-]{35}\b/, `${name} must not contain an API key`);
  }
});

check('the .htaccess is structurally sound (a syntax error would 500 every request)', () => {
  // There is no Apache in this sandbox to run `apachectl -t`, and a broken
  // .htaccess takes the whole site down with HTTP 500. This linter covers the
  // failure modes that actually happen when a file like this is edited: an
  // unbalanced container, a misspelled directive, and a ModSecurity directive
  // outside its <IfModule> guard (Apache answers 500 with "Invalid command"
  // for SecRule/SecRuleRemoveById when mod_security is not loaded).
  const containers = ['IfModule', 'FilesMatch', 'Files', 'Directory', 'DirectoryMatch', 'Location', 'Limit'];
  const knownDirectives = new Set([
    'AddOutputFilterByType', 'AddType', 'Deny', 'ErrorDocument', 'ExpiresActive', 'ExpiresByType',
    'ExpiresDefault', 'Header', 'Options', 'Order', 'Require', 'RewriteBase', 'RewriteCond',
    'RewriteEngine', 'RewriteRule', 'SecRule', 'SecRuleRemoveById', 'SetEnv', 'SetEnvIfNoCase',
    'SetOutputFilter',
  ]);

  const stack: Array<{ name: string; arg: string }> = [];
  const lines = htaccess.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // A continued directive (trailing backslash) spans the next line: both
    // belong to the same directive and must not be parsed on their own.
    if (/\\$/.test(line)) {
      index += 1;
      continue;
    }

    const open = /^<([A-Za-z]+)(?:\s([^>]*))?>$/.exec(line);
    if (open) {
      const name = open[1];
      assert.ok(containers.includes(name), `unknown container <${name}> on line ${index + 1}`);
      stack.push({ name, arg: open[2] || '' });
      continue;
    }
    const close = /^<\/([A-Za-z]+)>$/.exec(line);
    if (close) {
      const name = close[1];
      assert.ok(stack.length > 0, `unbalanced </${name}> on line ${index + 1}`);
      const open2 = stack.pop();
      assert.equal(
        open2.name,
        name,
        `container mismatch on line ${index + 1}: </${name}> closes <${open2.name}>`,
      );
      continue;
    }
    // A quoted argument may contain ">" — take the first token as the directive.
    const directive = /^([A-Za-z]+)\b/.exec(line);
    assert.ok(directive, `unparsable line ${index + 1}: ${raw}`);
    const name = directive[1];
    assert.ok(
      knownDirectives.has(name),
      `unknown directive "${name}" on line ${index + 1} — Apache would answer 500`,
    );
    if (name.startsWith('Sec')) {
      const inModSecurity = stack.some(
        (container) => container.name === 'IfModule' && /mod_security/.test(container.arg),
      );
      assert.ok(
        inModSecurity,
        `"${name}" on line ${index + 1} is outside an <IfModule mod_security*>.c> guard — ` +
          'Apache answers 500 ("Invalid command") when mod_security is not loaded',
      );
    }
  }
  assert.deepEqual(
    stack.map((container) => container.name),
    [],
    `unclosed containers at the end of the file: ${stack.map((c) => c.name).join(' > ')}`,
  );
});

console.log(`\nSitemap serving contract passed (${passed} checks).`);
