/** Admin console contracts: rendered features must be backed by real routes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const admin = read('api/admin/index.php');
const portal = read('src/pages/AdminPortal.tsx');
const api = read('src/services/api.ts');
const schema = read('api/schema.sql');
const migration = read('api/migrations/016_admin_contact_notes.sql');
const htaccess = read('api/.htaccess');
const databasePanel = read('src/components/admin/DatabaseBackupPanel.tsx');

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- ADMIN FEATURES CONTRACT ---');

check('the admin router authenticates before any feature route', () => {
  const guard = admin.indexOf('$admin = requireAdmin($pdo);');
  const firstRoute = admin.indexOf('// 1. GET /api/admin/orders');
  assert.ok(guard >= 0 && firstRoute > guard, 'requireAdmin must run before route dispatch');
});

check('users and customers share one query and return the SPA customer shape', () => {
  assert.ok(admin.includes('admin/(?:users|customers)'), 'both users and customers routes must be registered');
  const queryAt = admin.indexOf('LEFT JOIN birth_profiles bp ON bp.id = (');
  const routeEnd = admin.indexOf('// 11. BANNED IPS MANAGEMENT', queryAt);
  const route = admin.slice(queryAt, routeEnd);
  assert.match(route, /WHERE latest\.user_id = u\.id[\s\S]*?ORDER BY latest\.updated_at DESC, latest\.id DESC[\s\S]*?LIMIT 1/);
  assert.match(route, /'createdAt'\s*=>\s*\(string\)\$row\['created_at'\]/);
  assert.match(route, /'birthProfile'\s*=>\s*\$hasBirthProfile \? \[/);
  assert.match(route, /'birthPlace'\s*=>/);
  assert.match(route, /'dob'\s*=>/);
  assert.match(route, /'users'\s*=>\s*\$customers,\s*'customers'\s*=>\s*\$customers/);
  assert.doesNotMatch(route, /foreach\s*\([^\n]*\$customers[\s\S]*?SELECT/i, 'birth profiles must not be fetched with an N+1 loop');
});

check('both inbox paths use the shared camelCase mapper', () => {
  assert.match(admin, /function astroAdminMapContactMessage\(\$row\)/);
  assert.ok(admin.includes('admin/(?:contact-messages|messages)'), 'the legacy contact-messages and current messages routes must both remain');
  assert.match(admin, /array_map\('astroAdminMapContactMessage', \$rows\)/);
  for (const field of [
    "'status' => astroAdminContactMessageStatus",
    "'autoEmailDispatched' =>",
    "'dispatchedTo' =>",
    "'emailDispatchedAt' =>",
    "'createdAt' =>",
    "'adminNotes' =>"
  ]) assert.ok(admin.includes(field), `shared inbox mapper must include ${field}`);
  assert.match(admin, /\['NEW' => 'UNREAD', 'REVIEWED' => 'READ', 'RESPONDED' => 'REPLIED'\]/);
  assert.match(admin, /CONTACT_MESSAGE_UPDATED/);
  assert.match(admin, /CONTACT_MESSAGE_DELETED/);
  assert.match(admin, /must be 2000 characters or fewer/);
  assert.match(admin, /FROM contact_messages WHERE id = \?/);
  assert.match(admin, /DELETE FROM contact_messages WHERE id = \?/);
  assert.match(migration, /ADD COLUMN `admin_notes` TEXT NULL/);
  assert.match(schema, /`admin_notes` TEXT NULL/);
  assert.match(htaccess, /Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"/);
});

check('statistics are calculated from SQL aggregates and recorded values', () => {
  const start = admin.indexOf("preg_match('#(?:^|/)admin/statistics/?$#'");
  const end = admin.indexOf('// 6. GET /api/admin/audit-logs', start);
  const route = admin.slice(start, end);
  assert.ok(start >= 0 && end > start, 'statistics route must exist');
  assert.match(route, /COUNT\(\*\) AS total_orders/);
  assert.match(route, /SUM\(status IN \('PENDING', 'PENDING_APPROVAL'\)\)/);
  assert.match(route, /SUM\(status IN \('GENERATED', 'COMPLETED'\)\)/);
  assert.match(route, /GROUP BY service_type/);
  assert.match(route, /GROUP BY language/);
  assert.match(route, /GROUP BY country/);
  assert.match(route, /'totalRevenueUSD'/);
  assert.match(route, /'totalRevenueINR'/);
  assert.match(route, /'currentServiceMode'/);
  assert.match(portal, /stats\?\.totalOrders/);
  assert.match(portal, /stats\?\.pendingOrders/);
  assert.match(portal, /stats\?\.completedOrders/);
});

check('unverified analytics are explicitly unavailable and cannot show sample metrics', () => {
  assert.match(portal, /Analytics \(not available yet\)/);
  assert.match(portal, /Analytics dashboard — not available yet/);
  assert.match(portal, /No estimates or sample values are shown/);
  assert.doesNotMatch(api, /getAdminAnalytics\s*\(/);
  assert.ok(!fs.existsSync(path.join(root, 'src/components/admin/AdminAnalyticsDashboard.tsx')));
});

check('JSON export is admin-route JSON, no-store, audited and excludes credentials', () => {
  const routeAt = admin.indexOf('// Export a documented allowlist');
  const routeEnd = admin.indexOf("jsonResponse(['success' => false, 'message' => 'Admin endpoint not found']", routeAt);
  const route = admin.slice(routeAt, routeEnd);
  assert.ok(routeAt >= 0 && routeEnd > routeAt, 'export endpoint must exist');
  assert.match(route, /admin\/database\/export/);
  assert.match(route, /Cache-Control: no-store/);
  assert.match(route, /Content-Type: application\/json/);
  assert.match(route, /logAudit\([^;]*'DATABASE_EXPORT'/s);
  const queries = route.slice(route.indexOf('$exportQueries = ['), route.indexOf('];', route.indexOf('$exportQueries = [')));
  assert.doesNotMatch(queries, /password_hash|otp_hash|password_reset_hash|gateway_signature|client_secret|system_settings|payment_intents/i);
  assert.match(queries, /'users'\s*=>/);
  assert.match(queries, /'orders'\s*=>/);
  assert.match(route, /excludedSensitiveData/);
  assert.match(databasePanel, /read-only database export/i);
  assert.match(databasePanel, /intentionally unavailable/);
  assert.doesNotMatch(api, /importDatabase\s*\(/);
  assert.doesNotMatch(api, /database\/import/);
  assert.doesNotMatch(databasePanel, /Import Data|Restore \/ Import|importDatabase/i);
});

check('request-error alerts are hidden because no reporting pipeline exists', () => {
  assert.doesNotMatch(portal, /Request error alerts|Request Errors|client-errors/);
  assert.doesNotMatch(api, /getAdminClientErrors|resolveAdminClientError|client-errors/);
});

console.log(`\n${passed} admin feature contract checks passed.`);
