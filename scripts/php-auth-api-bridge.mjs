/**
 * Runs the REAL ASTRO SIVAM auth API (api/auth/index.php) under PHP-WASM, for
 * tests only — the Google sign-in counterpart of scripts/php-admin-api-bridge.mjs.
 *
 * It mounts the actual api/ tree into a php-wasm virtual filesystem and runs
 * the real router with HTTP-shaped requests (method, headers, CONTENT_LENGTH
 * and a raw body delivered through php://input). Only the I/O boundaries are
 * replaced, and only inside the virtual FS:
 *   - api/db.php     -> real file, but getDbConnection() opens a throwaway SQLite
 *                       file (tests/fixtures/admin-delivery/sqlite-db-double.php)
 *   - api/mailer.php -> real file, SMTP transport recorded, never sent
 *   - api/google_login.php -> real file, but the single outbound HTTPS call to Google
 *                       (astro_http_get_json_detailed) is scripted
 *                       (tests/fixtures/auth-google/google-transport-double.php)
 * Token verification rules, account creation, rate-limit budgets, session and
 * token issuing are the production code.
 *
 * Usage (dev-only runtime, not in package.json):
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 *   const bridge = await createAuthApiBridge();
 *   bridge.scriptGoogle({ tokeninfo: [...], userinfo: [...] });
 *   const res = await bridge.googleLogin({ accessToken: 'x' });
 *
 * No network, SMTP server or real database is contacted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PHP, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';

const repoRoot = path.resolve(import.meta.dirname, '..');
const VFS = '/repo';
const STATE = `${VFS}/test-state`;
const SQLITE_FILE = `${STATE}/auth.sqlite`;
const OUTBOX_FILE = `${STATE}/outbox.json`;
const ERROR_LOG = `${STATE}/php-error.log`;
const GOOGLE_SCRIPT = `${STATE}/google-script.json`;
const GOOGLE_LOG = `${STATE}/google-calls.log`;
const TEST_SECRET = 'php-wasm-bridge-test-only-secret-key-0123456789abcdef';

/** Test data only - clearly fake identities and a fake OAuth client. */
export const TEST_GOOGLE_CLIENT_ID = 'bridge-test-client.apps.googleusercontent.com';

const SCHEMA_SQL = `
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, mobile TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'customer',
  auth_provider TEXT NOT NULL DEFAULT 'local', provider_subject TEXT NULL, email_verified INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0, country TEXT NOT NULL DEFAULT '',
  created_at TEXT NULL, updated_at TEXT NULL, last_login TEXT NULL,
  UNIQUE (auth_provider, provider_subject)
);
CREATE TABLE birth_profiles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', dob TEXT, tob TEXT, birth_place TEXT,
  country TEXT, latitude REAL, longitude REAL, timezone_offset_hours REAL, gender TEXT DEFAULT 'M', updated_at TEXT
);
CREATE TABLE system_settings (
  id INTEGER PRIMARY KEY, email_settings TEXT, general_settings TEXT, payment_settings TEXT, service_pricing TEXT,
  service_mode TEXT DEFAULT 'FREE_BETA', updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, user_role TEXT, action TEXT, details TEXT, ip_address TEXT, created_at TEXT
);
CREATE TABLE api_rate_limits (rate_key TEXT NOT NULL PRIMARY KEY, window_started_at INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
CREATE TABLE banned_ips (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_address TEXT, reason TEXT, created_at TEXT);
`;

function phpString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function mkdirp(php, dir) {
  let current = '';
  for (const part of dir.split('/').filter(Boolean)) {
    current += `/${part}`;
    if (!php.fileExists(current)) php.mkdir(current);
  }
}

function mountApiTree(php) {
  const skip = (relative) =>
    relative.startsWith('api/storage/') || relative.startsWith('api/astrology/tmp/') || relative.startsWith('api/vendor/');
  const walk = (hostDir) => {
    for (const entry of fs.readdirSync(hostDir, { withFileTypes: true })) {
      const hostPath = path.join(hostDir, entry.name);
      const relative = path.relative(repoRoot, hostPath).split(path.sep).join('/');
      if (skip(relative + (entry.isDirectory() ? '/' : ''))) continue;
      if (entry.isDirectory()) {
        walk(hostPath);
      } else {
        mkdirp(php, path.posix.dirname(`${VFS}/${relative}`));
        php.writeFile(`${VFS}/${relative}`, fs.readFileSync(hostPath));
      }
    }
  };
  walk(path.join(repoRoot, 'api'));
  const rules = path.join(repoRoot, 'src/lib/muhurtham/rules.json');
  if (fs.existsSync(rules)) {
    mkdirp(php, `${VFS}/src/lib/muhurtham`);
    php.writeFile(`${VFS}/src/lib/muhurtham/rules.json`, fs.readFileSync(rules));
  }
}

function installDoubles(php) {
  const adminFixtures = path.join(repoRoot, 'tests/fixtures/admin-delivery');
  const authFixtures = path.join(repoRoot, 'tests/fixtures/auth-google');
  const stripOpenTag = (source) => source.replace(/^<\?php\s*/, '');

  const realDb = fs.readFileSync(path.join(repoRoot, 'api/db.php'), 'utf8');
  if (!realDb.includes('function getDbConnection()')) {
    throw new Error('api/db.php no longer declares getDbConnection(); update the SQLite test double.');
  }
  php.writeFile(
    `${VFS}/api/db.php`,
    realDb.replace('function getDbConnection()', 'function astro_real_mysql_connection_replaced_by_test_double()') +
      '\n' +
      stripOpenTag(fs.readFileSync(path.join(adminFixtures, 'sqlite-db-double.php'), 'utf8'))
  );

  const realMailer = fs.readFileSync(path.join(repoRoot, 'api/mailer.php'), 'utf8');
  if (!/^class AstroMailer\b/m.test(realMailer)) {
    throw new Error('api/mailer.php no longer declares class AstroMailer; update the mailer test double.');
  }
  php.writeFile(
    `${VFS}/api/mailer.php`,
    realMailer.replace(/^class AstroMailer\b/m, 'class AstroMailerRealTransport') +
      '\n' +
      stripOpenTag(fs.readFileSync(path.join(adminFixtures, 'mailer-double.php'), 'utf8'))
  );

  const realGoogle = fs.readFileSync(path.join(repoRoot, 'api/google_login.php'), 'utf8');
  if (!realGoogle.includes('function astro_http_get_json_detailed(')) {
    throw new Error('api/google_login.php no longer declares astro_http_get_json_detailed(); update the Google transport double.');
  }
  php.writeFile(
    `${VFS}/api/google_login.php`,
    realGoogle.replace('function astro_http_get_json_detailed(', 'function astro_real_google_transport_replaced_by_test_double(') +
      '\n' +
      stripOpenTag(fs.readFileSync(path.join(authFixtures, 'google-transport-double.php'), 'utf8'))
  );
}

/** @param {{ phpVersion?: string }} [options] 8.1 matches CI (scripts/run-php-tests.sh); 8.4 is the default. */
export async function createAuthApiBridge({ phpVersion = process.env.ASTRO_PHP_VERSION || '8.4' } = {}) {
  const php = new PHP(await loadNodeRuntime(phpVersion, { emscriptenOptions: { processId: 4244 } }));
  mkdirp(php, STATE);
  mkdirp(php, '/tmp');
  const ini = fs.readFileSync(path.join(repoRoot, 'api/.user.ini'), 'utf8');
  const limits = {};
  for (const line of ini.split(/\r?\n/)) {
    const match = /^\s*([a-z_.]+)\s*=\s*([^;\s]+)\s*$/i.exec(line);
    if (match) limits[match[1]] = match[2];
  }
  await setPhpIniEntries(php, {
    ...limits,
    display_errors: '0',
    log_errors: '1',
    error_log: ERROR_LOG,
    'session.save_path': '/tmp'
  });
  mountApiTree(php);
  installDoubles(php);

  let raceSql = '';
  const env = () => ({
    APP_SECRET_KEY: TEST_SECRET,
    ASTRO_TEST_SQLITE: SQLITE_FILE,
    ASTRO_TEST_OUTBOX: OUTBOX_FILE,
    ASTRO_TEST_MAIL_MODE: 'accept',
    ASTRO_TEST_GOOGLE_SCRIPT: GOOGLE_SCRIPT,
    ASTRO_TEST_GOOGLE_LOG: GOOGLE_LOG,
    ASTRO_TEST_RACE_SQL: raceSql
  });

  /** Runs a PHP snippet with the doubles loaded; returns its decoded JSON output. */
  async function runPhp(code) {
    const response = await php.run({
      code: `<?php
$_SERVER['SCRIPT_NAME'] = '/test-state/probe.php';
require_once '${VFS}/api/db.php';
${code}`,
      env: env()
    });
    try {
      return JSON.parse(response.text);
    } catch {
      throw new Error(`PHP snippet did not return JSON (exit ${response.exitCode}): ${response.text.slice(0, 2000)}\n${response.errors || ''}`);
    }
  }

  /** Fresh database, empty Google script and call log. */
  async function reset({ googleLoginEnabled = true, googleClientId = TEST_GOOGLE_CLIENT_ID } = {}) {
    raceSql = '';
    for (const file of [SQLITE_FILE, OUTBOX_FILE, ERROR_LOG, GOOGLE_SCRIPT, `${GOOGLE_SCRIPT}.cursor`, GOOGLE_LOG]) {
      if (php.fileExists(file)) php.unlink(file);
    }
    const general = JSON.stringify({ googleLoginEnabled, googleClientId });
    await runPhp(`
$pdo = getDbConnection();
foreach (array_filter(array_map('trim', explode(';', ${phpString(SCHEMA_SQL)}))) as $statement) {
    $pdo->exec($statement);
}
$pdo->prepare("INSERT INTO system_settings (id, email_settings, general_settings) VALUES (1, '{}', ?)")->execute([${phpString(general)}]);
echo json_encode(['ok' => true]);
`);
    php.writeFile(GOOGLE_SCRIPT, '{}');
  }

  /**
   * Scripts Google's answers. `tokeninfo`, `userinfo` and `idTokenInfo` are reply
   * queues (the last reply repeats): { data, status, transient }.
   *
   * @param {{ tokeninfo?: unknown[], userinfo?: unknown[], idTokenInfo?: unknown[] }} replies
   */
  function scriptGoogle({ tokeninfo, userinfo, idTokenInfo }) {
    const rules = {};
    if (tokeninfo) rules['tokeninfo?access_token='] = tokeninfo;
    if (idTokenInfo) rules['tokeninfo?id_token='] = idTokenInfo;
    if (userinfo) rules['oauth2/v3/userinfo'] = userinfo;
    if (php.fileExists(`${GOOGLE_SCRIPT}.cursor`)) php.unlink(`${GOOGLE_SCRIPT}.cursor`);
    php.writeFile(GOOGLE_SCRIPT, JSON.stringify(rules));
  }

  function googleCalls() {
    return php.fileExists(GOOGLE_LOG) ? php.readFileAsText(GOOGLE_LOG).split('\n').filter(Boolean) : [];
  }

  /** One HTTP request through the real auth router. */
  async function request({ method = 'POST', url, json, headers = {}, remoteAddr = '203.0.113.10' }) {
    const parsed = new URL(url, 'https://astrosivam.test');
    const relative = parsed.pathname.replace(/^\/api\//, '');
    const scriptRelative = relative.endsWith('.php') ? relative : `${relative.split('/')[0]}/index.php`;
    const scriptPath = `${VFS}/api/${scriptRelative}`;
    const startedAt = Date.now();

    const bytes = json === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(json));
    const requestHeaders = { ...headers };
    if (json !== undefined) requestHeaders['content-type'] = 'application/json';
    if (method !== 'GET' && method !== 'HEAD') requestHeaders['content-length'] = String(bytes.length);

    const server = {
      REQUEST_URI: parsed.pathname + parsed.search,
      SCRIPT_NAME: `/api/${scriptRelative}`,
      SCRIPT_FILENAME: scriptPath,
      PHP_SELF: `/api/${scriptRelative}`,
      REMOTE_ADDR: remoteAddr,
      HTTPS: 'on',
      SERVER_NAME: 'astrosivam.test',
      HTTP_HOST: 'astrosivam.test'
    };
    if (method !== 'GET' && method !== 'HEAD') {
      server.CONTENT_LENGTH = String(bytes.length);
      if (requestHeaders['content-type']) server.CONTENT_TYPE = requestHeaders['content-type'];
    }

    const response = await php.run({
      scriptPath,
      relativeUri: parsed.pathname + parsed.search,
      method,
      headers: requestHeaders,
      body: bytes,
      $_SERVER: server,
      env: env()
    });
    let body = null;
    try {
      body = JSON.parse(response.text);
    } catch {
      body = null;
    }
    return { status: response.httpStatusCode, headers: response.headers, text: response.text, json: body, ms: Date.now() - startedAt };
  }

  /** The request the browser sends: POST /api/auth/index.php?action=google. */
  const googleLogin = (payload, options = {}) =>
    request({ url: '/api/auth/index.php?action=google', json: { action: 'google-login', ...payload }, ...options });

  async function users() {
    return runPhp(`echo json_encode(getDbConnection()->query('SELECT id, name, email, role, auth_provider, provider_subject FROM users ORDER BY created_at, id')->fetchAll());`);
  }

  /** Sum of the failed-credential counters: 0 means no failure was recorded. */
  async function failureHits() {
    return runPhp(`echo json_encode((int) getDbConnection()->query('SELECT COALESCE(SUM(hits), 0) FROM api_rate_limits')->fetchColumn());`);
  }

  /** Runs raw SQL (test setup, e.g. to break a table). */
  async function exec(sql) {
    return runPhp(`getDbConnection()->exec(${phpString(sql)}); echo json_encode(['ok' => true]);`);
  }

  /**
   * Simulates a second request for the same account: `sql` is committed on its
   * own right before the router's first `INSERT INTO users` (see the hook in
   * tests/fixtures/admin-delivery/sqlite-db-double.php). Pass '' to clear it.
   */
  function raceBeforeUserInsert(sql) {
    raceSql = sql;
  }

  function phpErrors() {
    return php.fileExists(ERROR_LOG) ? php.readFileAsText(ERROR_LOG) : '';
  }

  await reset();

  return {
    request,
    googleLogin,
    runPhp,
    reset,
    scriptGoogle,
    googleCalls,
    users,
    failureHits,
    exec,
    raceBeforeUserInsert,
    phpErrors,
    async close() {
      php.exit();
    }
  };
}
