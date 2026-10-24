import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const router = fs.readFileSync(path.join(root, 'api/admin/index.php'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/services/api.ts'), 'utf8');
let passed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

await check('every admin read requested by the browser has a real PHP route', () => {
  for (const route of ['/admin/statistics', '/admin/customers', '/admin/messages']) {
    assert.ok(client.includes(route), `client must still request ${route}`);
    assert.ok(router.includes(route), `PHP router must implement ${route}`);
  }
});

await check('customer and message responses use the shapes rendered by the portal', () => {
  assert.match(router, /'createdAt'\s*=>\s*\$row\['created_at'\]/);
  assert.match(router, /'birthProfile'\s*=>\s*\$profile/);
  assert.match(router, /'UNREAD'\s*=>\s*'NEW'/);
  assert.match(router, /'READ'\s*=>\s*'REVIEWED'/);
  assert.match(router, /'REPLIED'\s*=>\s*'RESPONDED'/);
  assert.match(router, /'autoEmailDispatched'/);
});

await check('message review and deletion are routed and audited', () => {
  assert.match(router, /\$isMessageItem && \$method === 'PATCH'/);
  assert.match(router, /\$isMessageItem && \$method === 'DELETE'/);
  assert.match(router, /CONTACT_MESSAGE_UPDATED/);
  assert.match(router, /CONTACT_MESSAGE_DELETED/);
});

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - admin route runtime checks did not run.');
  console.log('         npm install --no-save @php-wasm/node @php-wasm/universal');
} else {
  const { createAdminApiBridge } = await import('../scripts/php-admin-api-bridge.mjs');
  const bridge = await createAdminApiBridge();

  try {
    await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("DROP TABLE users");
$pdo->exec("CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, mobile TEXT DEFAULT '', role TEXT DEFAULT 'customer',
  country TEXT DEFAULT '', token_version INTEGER NOT NULL DEFAULT 0, password_hash TEXT DEFAULT '',
  created_at TEXT DEFAULT '', last_login TEXT NULL
)");
$pdo->prepare("INSERT INTO users (id, name, email, role, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?)")
  ->execute(['usr_test_admin', 'Bridge Test Admin', 'admin@example.test', 'admin', 0, '2026-01-01 00:00:00']);
$pdo->exec("CREATE TABLE birth_profiles (
  id TEXT PRIMARY KEY, user_id TEXT, name TEXT, dob TEXT, tob TEXT, birth_place TEXT,
  country TEXT, latitude REAL, longitude REAL, timezone_offset_hours REAL,
  time_zone_id TEXT, gender TEXT, updated_at TEXT
)");
$pdo->exec("CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, mobile TEXT, subject TEXT, message TEXT,
  status TEXT, email_status TEXT, email_recipient TEXT, email_dispatched_at TEXT,
  email_last_status_message TEXT, created_at TEXT
)");
$pdo->prepare("INSERT INTO users (id, name, email, mobile, role, country, created_at, last_login)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
  ->execute(['usr_customer_test', 'Customer Test', 'customer@example.test', '+910000000000', 'customer', 'India', '2026-02-01 10:00:00', '2026-02-02 10:00:00']);
$pdo->prepare("INSERT INTO birth_profiles (id, user_id, name, dob, tob, birth_place, country, latitude, longitude, timezone_offset_hours, time_zone_id, gender, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  ->execute(['bp_test', 'usr_customer_test', 'Customer Test', '1990-05-15', '06:30', 'Chennai', 'India', 13.0827, 80.2707, 5.5, 'Asia/Kolkata', 'F', '2026-02-01 10:00:00']);
$pdo->prepare("INSERT INTO contact_messages (id, name, email, mobile, subject, message, status, email_status, email_recipient, email_dispatched_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  ->execute(['msg_test', 'Visitor Test', 'visitor@example.test', '', 'Report question', 'Please explain my report.', 'UNREAD', 'SENT', 'admin@example.test', '2026-02-03 09:00:00', '2026-02-03 08:55:00']);
$pdo->exec("UPDATE orders SET country = 'India'");
$pdo->exec("UPDATE orders SET status = 'COMPLETED', service_mode = 'PAID', payment_status = 'CAPTURED', payment_confirmed = 1, amount = 25, currency = 'USD' WHERE id = 'ord_test_single_a'");
echo json_encode(['ok' => true]);
`);

    await check('statistics returns real KPI totals and chart breakdowns', async () => {
      const res = await bridge.request({ url: '/api/admin/statistics' });
      assert.equal(res.status, 200, res.text.slice(0, 500));
      assert.equal(res.json.success, true);
      const stats = res.json.statistics;
      assert.equal(stats.totalOrders, 2);
      assert.equal(stats.completedOrders, 1);
      assert.equal(stats.pendingOrders, 1);
      assert.equal(stats.pendingApproval, 0);
      assert.equal(stats.rejectedOrders, 0);
      assert.equal(stats.totalRevenueUSD, 25);
      assert.equal(stats.totalRevenueINR, 0);
      assert.equal(stats.totalUsers, 2);
      assert.equal(stats.currentServiceMode, 'FREE_BETA');
      assert.deepEqual(stats.serviceCounts, { BIRTH_JATHAGAM: 2 });
      assert.deepEqual(stats.languageCounts, { en: 2 });
      assert.deepEqual(stats.countryCounts, { India: 2 });
    });

    await check('customers returns camelCase users and their latest birth profiles', async () => {
      const res = await bridge.request({ url: '/api/admin/customers' });
      assert.equal(res.status, 200, res.text.slice(0, 500));
      assert.equal(res.json.success, true);
      assert.equal(res.json.count, 2);
      assert.equal(res.json.users.length, 2);
      assert.equal(res.json.customers.length, 2);
      const customer = res.json.customers.find((row: any) => row.id === 'usr_customer_test');
      assert.equal(customer.createdAt, '2026-02-01 10:00:00');
      assert.equal(customer.lastLogin, '2026-02-02 10:00:00');
      assert.equal(customer.birthProfile.birthPlace, 'Chennai');
      assert.equal(customer.birthProfile.dob, '1990-05-15');
      assert.equal(customer.birthProfile.timeZoneId, 'Asia/Kolkata');

      const legacy = await bridge.request({ url: '/api/admin/users' });
      assert.equal(legacy.status, 200, legacy.text.slice(0, 500));
      assert.equal(legacy.json.success, true);
      assert.equal(legacy.json.users.length, 2);
      assert.ok(legacy.json.users[0].created_at, 'legacy users keep their original snake_case shape');
    });

    await check('messages returns localized UI statuses and email delivery metadata', async () => {
      const res = await bridge.request({ url: '/api/admin/messages' });
      assert.equal(res.status, 200, res.text.slice(0, 500));
      assert.equal(res.json.success, true);
      assert.equal(res.json.count, 1);
      const message = res.json.messages[0];
      assert.equal(message.id, 'msg_test');
      assert.equal(message.status, 'NEW');
      assert.equal(message.autoEmailDispatched, true);
      assert.equal(message.dispatchedTo, 'admin@example.test');
      assert.equal(message.createdAt, '2026-02-03 08:55:00');

      const legacy = await bridge.request({ url: '/api/admin/contact-messages' });
      assert.equal(legacy.status, 200, legacy.text.slice(0, 500));
      assert.equal(legacy.json.messages[0].status, 'UNREAD', 'legacy route keeps its raw status');
    });

    await check('message review, validation and deletion work through the real router', async () => {
      const reviewed = await bridge.request({
        method: 'PATCH',
        url: '/api/admin/messages/msg_test',
        json: { status: 'REVIEWED' },
      });
      assert.equal(reviewed.status, 200, reviewed.text.slice(0, 500));
      assert.equal(reviewed.json.success, true);
      assert.equal(reviewed.json.status, 'REVIEWED');

      const listed = await bridge.request({ url: '/api/admin/messages' });
      assert.equal(listed.json.messages[0].status, 'REVIEWED');

      const invalid = await bridge.request({
        method: 'PATCH',
        url: '/api/admin/messages/msg_test',
        json: { status: 'INVALID' },
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.json.success, false);

      const deleted = await bridge.request({ method: 'DELETE', url: '/api/admin/messages/msg_test' });
      assert.equal(deleted.status, 200, deleted.text.slice(0, 500));
      assert.equal(deleted.json.success, true);
      const empty = await bridge.request({ url: '/api/admin/messages' });
      assert.equal(empty.json.count, 0);

      const actions = (await bridge.auditActions()).map((row: any) => row.action);
      assert.ok(actions.includes('CONTACT_MESSAGE_UPDATED'));
      assert.ok(actions.includes('CONTACT_MESSAGE_DELETED'));
    });

    await check('the new read routes remain administrator-only', async () => {
      for (const route of ['statistics', 'customers', 'messages']) {
        const res = await bridge.request({ url: `/api/admin/${route}`, auth: false });
        assert.ok([401, 403].includes(res.status), `${route}: expected 401/403, got ${res.status}`);
      }
    });
  } catch (error) {
    const phpErrors = bridge.phpErrors();
    if (phpErrors) console.error(`PHP runtime log:\n${phpErrors}`);
    throw error;
  } finally {
    await bridge.close();
  }
}

console.log(`Admin read endpoints: ${passed} checks passed.`);
