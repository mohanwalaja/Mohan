/**
 * Runs the REAL ASTRO SIVAM admin API under PHP-WASM, for tests only.
 *
 * The sandbox and the Node CI job have no native PHP or MySQL. This bridge
 * mounts the actual api/ tree into a php-wasm virtual filesystem and executes
 * the real route scripts (api/admin/index.php, approve_order.php,
 * family_docs.php, orders.php) with real HTTP-shaped requests: method,
 * headers, CONTENT_LENGTH and a raw body delivered through php://input,
 * exactly as Apache/LiteSpeed/PHP-FPM would hand them over.
 *
 * Only the two I/O boundaries are replaced, and only inside the virtual FS:
 *   - api/db.php     -> real file, but getDbConnection() opens a throwaway
 *                       SQLite file (tests/fixtures/admin-delivery/sqlite-db-double.php)
 *   - api/mailer.php -> real file, but the SMTP transport records to a JSON
 *                       outbox and NEVER sends (tests/fixtures/admin-delivery/mailer-double.php)
 * Everything else - body parsing, auth, rate limits, staging, the PDF quality
 * validator, the approval gate, the e-mail assembly and the order status
 * updates - is the production code. The PHP ini limits are read from
 * api/.user.ini so the runtime matches the deployed limits.
 *
 * Usage (dev-only runtime, not in package.json):
 *   npm install --no-save @php-wasm/node @php-wasm/universal
 *   const bridge = await createAdminApiBridge();
 *   const res = await bridge.request({ method: 'POST', url: '/api/admin/orders/<id>/approve', json: {...} });
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
const SQLITE_FILE = `${STATE}/admin.sqlite`;
const OUTBOX_FILE = `${STATE}/outbox.json`;
const ERROR_LOG = `${STATE}/php-error.log`;
const STAGING_DIR = `${VFS}/api/storage/family_docs`;
const TEST_SECRET = 'php-wasm-bridge-test-only-secret-key-0123456789abcdef';

/** Test data only - clearly fake identities, never a production order. */
export const TEST_ADMIN = {
  id: 'usr_test_admin',
  name: 'Bridge Test Admin',
  email: 'admin@example.test',
  role: 'admin'
};

const BIRTH_INPUT = {
  name: 'Test Devotee',
  devoteeName: 'Test Devotee',
  dob: '1990-05-15',
  tob: '06:30',
  birthPlace: 'Chennai',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5
};

export const TEST_ORDERS = {
  single: {
    id: 'ord_test_single_a',
    orderNumber: 'ORD-TESTA0001',
    email: 'devotee-a@example.test',
    name: 'Devotee A'
  },
  other: {
    id: 'ord_test_single_b',
    orderNumber: 'ORD-TESTB0002',
    email: 'devotee-b@example.test',
    name: 'Devotee B'
  }
};

const SCHEMA_SQL = `
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, mobile TEXT DEFAULT '', role TEXT DEFAULT 'customer',
  country TEXT DEFAULT '', token_version INTEGER NOT NULL DEFAULT 0, password_hash TEXT DEFAULT ''
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, group_id TEXT NULL, group_order_index INTEGER NOT NULL DEFAULT 0,
  user_id TEXT NOT NULL, user_name TEXT NOT NULL, user_email TEXT NOT NULL, user_mobile TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '', service_type TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en',
  amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', service_mode TEXT NOT NULL DEFAULT 'PAID',
  status TEXT NOT NULL DEFAULT 'PENDING', payment_method TEXT NULL, payment_reference TEXT NULL, payment_intent_id TEXT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING_ADMIN', payment_confirmed INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'PENDING', email_sent_at TEXT NULL, email_last_status_message TEXT NULL,
  input_payload TEXT NOT NULL, calculated_result TEXT NULL, has_pdf INTEGER NOT NULL DEFAULT 0, has_invoice INTEGER NOT NULL DEFAULT 0,
  admin_notes TEXT NULL, refund_status TEXT NOT NULL DEFAULT 'NONE', refund_reason TEXT NULL, refund_percent REAL NULL,
  refund_amount REAL NULL, refund_currency TEXT NULL, refund_processed_at TEXT NULL, refund_deadline TEXT NULL,
  refund_admin_notes TEXT NULL, refund_method TEXT NULL, refund_reference TEXT NULL, ip_address TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, person_id INTEGER NULL, service_code TEXT, language TEXT,
  unit_price REAL DEFAULT 0, report_status TEXT DEFAULT 'PENDING', input_payload TEXT, calculated_result TEXT, sent_at TEXT NULL
);
CREATE TABLE order_persons (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, full_name TEXT);
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

/** Reads `key = value` pairs from api/.user.ini (the deployed PHP limits). */
function deployedIniLimits() {
  const ini = fs.readFileSync(path.join(repoRoot, 'api/.user.ini'), 'utf8');
  const entries = {};
  for (const line of ini.split(/\r?\n/)) {
    const match = /^\s*([a-z_.]+)\s*=\s*([^;\s]+)\s*$/i.exec(line);
    if (match) entries[match[1]] = match[2];
  }
  return entries;
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
    relative.startsWith('api/storage/') ||
    relative.startsWith('api/astrology/tmp/') ||
    relative.startsWith('api/vendor/');
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
  // Muhurtham rules are read from src/ by the engine.
  const rules = path.join(repoRoot, 'src/lib/muhurtham/rules.json');
  if (fs.existsSync(rules)) {
    mkdirp(php, `${VFS}/src/lib/muhurtham`);
    php.writeFile(`${VFS}/src/lib/muhurtham/rules.json`, fs.readFileSync(rules));
  }
}

function installDoubles(php) {
  const fixtures = path.join(repoRoot, 'tests/fixtures/admin-delivery');
  const stripOpenTag = (source) => source.replace(/^<\?php\s*/, '');

  const realDb = fs.readFileSync(path.join(repoRoot, 'api/db.php'), 'utf8');
  if (!realDb.includes('function getDbConnection()')) {
    throw new Error('api/db.php no longer declares getDbConnection(); update the SQLite test double.');
  }
  php.writeFile(
    `${VFS}/api/db.php`,
    realDb.replace('function getDbConnection()', 'function astro_real_mysql_connection_replaced_by_test_double()') +
      '\n' +
      stripOpenTag(fs.readFileSync(path.join(fixtures, 'sqlite-db-double.php'), 'utf8'))
  );

  const realMailer = fs.readFileSync(path.join(repoRoot, 'api/mailer.php'), 'utf8');
  if (!/^class AstroMailer\b/m.test(realMailer)) {
    throw new Error('api/mailer.php no longer declares class AstroMailer; update the mailer test double.');
  }
  php.writeFile(
    `${VFS}/api/mailer.php`,
    realMailer.replace(/^class AstroMailer\b/m, 'class AstroMailerRealTransport') +
      '\n' +
      stripOpenTag(fs.readFileSync(path.join(fixtures, 'mailer-double.php'), 'utf8'))
  );
}

const STATIC_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
  '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain'
};

function decodeResponse(response, startedAt) {
  const text = response.text;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.httpStatusCode,
    headers: response.headers,
    bytes: response.bytes,
    text,
    json,
    ms: Date.now() - startedAt
  };
}

function plainResponse(status, bytes, contentType, startedAt) {
  const text = new TextDecoder().decode(bytes);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status, headers: { 'content-type': [contentType] }, bytes, text, json, ms: Date.now() - startedAt };
}

export async function createAdminApiBridge() {
  const php = new PHP(await loadNodeRuntime('8.4', { emscriptenOptions: { processId: 4242 } }));
  mkdirp(php, STATE);
  mkdirp(php, STAGING_DIR);
  mkdirp(php, '/tmp');
  await setPhpIniEntries(php, {
    ...deployedIniLimits(),
    display_errors: '0',
    log_errors: '1',
    error_log: ERROR_LOG,
    'session.save_path': '/tmp'
  });
  mountApiTree(php);
  installDoubles(php);

  let mailMode = 'accept';
  const env = () => ({
    APP_SECRET_KEY: TEST_SECRET,
    ASTRO_TEST_SQLITE: SQLITE_FILE,
    ASTRO_TEST_OUTBOX: OUTBOX_FILE,
    ASTRO_TEST_MAIL_MODE: mailMode
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

  async function reset() {
    for (const file of [SQLITE_FILE, OUTBOX_FILE, ERROR_LOG]) {
      if (php.fileExists(file)) php.unlink(file);
    }
    for (const entry of php.listFiles(STAGING_DIR)) {
      const full = `${STAGING_DIR}/${entry}`;
      if (php.isDir(full)) {
        for (const nested of php.listFiles(full)) php.unlink(`${full}/${nested}`);
        php.rmdir(full);
      } else {
        php.unlink(full);
      }
    }
    mailMode = 'accept';
    const input = phpString(JSON.stringify(BIRTH_INPUT));
    const orderRows = Object.values(TEST_ORDERS)
      .map(
        (order) => `$insert->execute([${phpString(order.id)}, ${phpString(order.orderNumber)}, ${phpString(order.name)}, ${phpString(order.email)}, ${input}]);`
      )
      .join('\n');
    await runPhp(`
$pdo = getDbConnection();
foreach (array_filter(array_map('trim', explode(';', ${phpString(SCHEMA_SQL)}))) as $statement) {
    $pdo->exec($statement);
}
$pdo->prepare("INSERT INTO users (id, name, email, role, token_version) VALUES (?, ?, ?, ?, 0)")
    ->execute([${phpString(TEST_ADMIN.id)}, ${phpString(TEST_ADMIN.name)}, ${phpString(TEST_ADMIN.email)}, ${phpString(TEST_ADMIN.role)}]);
$settings = json_encode(['smtpHost' => 'smtp.example.test', 'smtpPort' => 587, 'smtpUsername' => 'mailer@example.test',
    'smtpPassword' => 'test-only', 'fromEmail' => 'reports@example.test', 'fromName' => 'ASTRO SIVAM (test)']);
$pdo->prepare("INSERT INTO system_settings (id, email_settings, general_settings) VALUES (1, ?, '{}')")->execute([$settings]);
$insert = $pdo->prepare("INSERT INTO orders (id, order_number, user_id, user_name, user_email, service_type, language, amount, currency,
    service_mode, status, payment_method, payment_status, payment_confirmed, email_status, input_payload)
    VALUES (?, ?, 'usr_test_customer', ?, ?, 'BIRTH_JATHAGAM', 'en', 0, 'INR', 'FREE_BETA', 'PENDING', 'NONE', 'NOT_REQUIRED', 0, 'PENDING', ?)");
${orderRows}
echo json_encode(['ok' => true]);
`);
  }

  await reset();
  const { token } = await runPhp(`
echo json_encode(['token' => createBearerToken(['id' => ${phpString(TEST_ADMIN.id)}, 'email' => ${phpString(TEST_ADMIN.email)}, 'role' => 'admin'], 3600, 0)]);
`);

  /**
   * One HTTP request through the real route script. `body` (string/Uint8Array)
   * or `json` (serialised here) is delivered via php://input with a matching
   * CONTENT_LENGTH, like Apache/PHP-FPM. Pass `contentLength` to simulate a
   * proxy/PHP that announced a body but delivered none.
   *
   * @param {{ method?: string, url: string, json?: unknown, body?: string | Uint8Array,
   *           headers?: Record<string, string>, auth?: boolean, contentLength?: number }} options
   */
  async function request({ method = 'GET', url, json, body, headers = {}, auth = true, contentLength }) {
    const parsed = new URL(url, 'https://astrosivam.test');
    const relative = parsed.pathname.replace(/^\/api\//, '');
    const requested = `${VFS}/api/${relative}`;
    const startedAt = Date.now();

    // Apache serves existing non-PHP files under /api directly (RewriteCond !-f).
    if (!relative.endsWith('.php') && php.fileExists(requested) && !php.isDir(requested)) {
      const extension = path.posix.extname(relative).toLowerCase();
      return plainResponse(200, php.readFileAsBuffer(requested), STATIC_TYPES[extension] || 'application/octet-stream', startedAt);
    }

    const directFile = relative.endsWith('.php') && php.fileExists(requested);
    const section = relative.split('/')[0];
    const scriptRelative = directFile ? relative : `${section}/index.php`;
    const scriptPath = `${VFS}/api/${scriptRelative}`;
    if (!php.fileExists(scriptPath)) {
      // No rewrite target: the host would answer 404 (api/404.php in production).
      return plainResponse(404, new TextEncoder().encode(JSON.stringify({ success: false, message: 'API endpoint not found' })), 'application/json', startedAt);
    }

    let payload = body;
    if (json !== undefined) payload = JSON.stringify(json);
    const bytes = payload === undefined ? new Uint8Array() : typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const announced = contentLength ?? bytes.length;

    const requestHeaders = { ...headers };
    if (json !== undefined && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      requestHeaders['content-type'] = 'application/json';
    }
    if (auth) requestHeaders.authorization = `Bearer ${token}`;
    if (method !== 'GET' && method !== 'HEAD') requestHeaders['content-length'] = String(announced);

    const server = {
      REQUEST_URI: parsed.pathname + parsed.search,
      SCRIPT_NAME: `/api/${scriptRelative}`,
      SCRIPT_FILENAME: scriptPath,
      PHP_SELF: `/api/${scriptRelative}`,
      REMOTE_ADDR: '203.0.113.10',
      HTTPS: 'on',
      SERVER_NAME: 'astrosivam.test',
      HTTP_HOST: 'astrosivam.test'
    };
    if (method !== 'GET' && method !== 'HEAD') {
      server.CONTENT_LENGTH = String(announced);
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
    return decodeResponse(response, startedAt);
  }

  async function order(id) {
    return runPhp(`
$stmt = getDbConnection()->prepare('SELECT id, order_number, status, email_status, has_pdf, has_invoice, payment_confirmed, email_last_status_message FROM orders WHERE id = ?');
$stmt->execute([${phpString(id)}]);
echo json_encode($stmt->fetch() ?: null);
`);
  }

  async function auditActions() {
    return runPhp(`
echo json_encode(getDbConnection()->query('SELECT action, details FROM audit_logs ORDER BY created_at, id')->fetchAll());
`);
  }

  function outbox() {
    return php.fileExists(OUTBOX_FILE) ? JSON.parse(php.readFileAsText(OUTBOX_FILE)) : [];
  }

  /** Staged files per scope directory (PDFs + manifest), for association checks. */
  function stagedFiles() {
    const result = {};
    for (const scope of php.listFiles(STAGING_DIR)) {
      const full = `${STAGING_DIR}/${scope}`;
      if (php.isDir(full)) result[scope] = php.listFiles(full).sort();
    }
    return result;
  }

  function stagedManifest(scope) {
    const dir = `${STAGING_DIR}/${scope}`;
    if (!php.isDir(dir)) return null;
    const manifest = php.listFiles(dir).find((name) => name.endsWith('.json'));
    return manifest ? JSON.parse(php.readFileAsText(`${dir}/${manifest}`)) : null;
  }

  function phpErrors() {
    return php.fileExists(ERROR_LOG) ? php.readFileAsText(ERROR_LOG) : '';
  }

  return {
    request,
    runPhp,
    reset,
    order,
    auditActions,
    outbox,
    stagedFiles,
    stagedManifest,
    phpErrors,
    setMailMode(mode) {
      mailMode = mode;
    },
    token,
    async close() {
      php.exit();
    }
  };
}
