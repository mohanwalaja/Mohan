/**
 * WhatsApp/Viber PDF delivery + download-language rule (customer request).
 *
 * Confirmed requirements pinned here:
 *   1. The dashboard report download is ONLY in the language chosen when
 *      ordering. The system renders exactly that one language, only when
 *      the user clicks Download — never all three (en/ta/hi), and a
 *      `language` request parameter can never switch it.
 *   2. A customer can save ONE mobile number in their profile and verify
 *      it separately on WhatsApp and/or Viber via a one-time code sent in
 *      that app (hashed, 10-minute expiry, attempt-capped).
 *   3. When an order is delivered, the actual report + invoice PDFs are
 *      ADDITIONALLY sent to the verified app(s). Email remains the
 *      official delivery; chat sending is strictly best-effort and must
 *      never block or fail an approval.
 *
 * Layers: source contracts across frontend + PHP, plus real PHP
 * execution of the pure helpers (phone normalization, OTP hashing,
 * signed media tokens) under PHP-WASM when installed.
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

// ------------------------------------------------------- download rule ---
check('download renders only the ordered language, only on click', () => {
  const services = read('api/services/index.php');
  const start = services.indexOf('// 6c. GET /api/services/orders/:id/report-pdf');
  const end = services.indexOf('// 6d. GET /api/services/chat-media');
  assert.ok(start > 0 && end > start, 'frozen download block exists');
  const block = services.slice(start, end);
  assert.ok(!block.includes("$_GET['language']") && !block.includes('$_GET["language"]'),
    'a language parameter must never switch the download language');
  assert.ok(!block.includes("$_GET['lang']"), 'no lang override either');
  const api = read('src/services/api.ts');
  const fnStart = api.indexOf('async downloadMyOrderReport');
  const fn = api.slice(fnStart, fnStart + 1200);
  assert.ok(!/language/.test(fn.split('fileName')[0]), 'client sends no language choice for downloads');
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /your order language/, 'dashboard states the ordered-language rule');
  assert.match(dashboard, /reportLanguageName\(order\.language\)/);
  assert.match(dashboard, /reportLanguageName\(item\.language\)/, 'each person downloads in their own ordered language');
});

// ------------------------------------------------------------ endpoints ---
check('chat-delivery endpoints: authenticated, rate-limited, OTP never echoed', () => {
  const services = read('api/services/index.php');
  const start = services.indexOf('// 3c. WhatsApp & Viber delivery contacts');
  const end = services.indexOf('// 4. POST /api/services/calculate-preview');
  assert.ok(start > 0 && end > start, 'chat-delivery block exists');
  const block = services.slice(start, end);
  assert.match(block, /requireAuth\(\$pdo\)/);
  assert.match(block, /chat-delivery-number/);
  assert.match(block, /chat-delivery-verify-request/);
  assert.match(block, /chat-delivery-verify-confirm/);
  assert.match(block, /astro_rate_limit_enforce\(\$pdo, 'chat-otp-request-user'/);
  assert.match(block, /astro_rate_limit_enforce\(\$pdo, 'chat-otp-confirm-user'/);
  assert.ok(!block.includes("'otp' =>"), 'the endpoint never returns the code itself');
  assert.match(block, /AstroChatAlerts::chatContactState/, 'state response carries no provider credentials');
});

check('OTP lifecycle: hashed only, 6 digits, 10-minute expiry, attempt cap, per-app verification', () => {
  const alerts = read('api/chat_alerts.php');
  assert.match(alerts, /random_int\(100000, 999999\)/);
  assert.match(alerts, /otp_hash/, 'codes are stored hashed');
  assert.match(alerts, /hash_hmac\('sha256', \$otp \. '\|' \. \$userId \. '\|' \. \$channel \. '\|' \. \$phone/);
  assert.match(alerts, /INTERVAL 10 MINUTE/);
  assert.match(alerts, /\(int\)\$row\['attempts'\] >= 5/);
  assert.match(alerts, /whatsapp_verified_at/);
  assert.match(alerts, /viber_verified_at/);
  assert.match(alerts, /verification_code/, 'WhatsApp OTP bypasses the order template so the code survives');
  assert.match(alerts, /preg_match\('\/\^\\\+\\d\{7,15\}\$\/', \$phone\)/, 'saved numbers must be full international format');
});

check('changing the number clears both verifications', () => {
  const alerts = read('api/chat_alerts.php');
  assert.match(alerts, /whatsapp_verified_at = NULL, viber_verified_at = NULL/);
  assert.match(alerts, /DELETE FROM chat_number_otps WHERE user_id = \?/);
});

// ------------------------------------------------------------- delivery ---
check('document delivery: real PDFs, transports per provider, best-effort', () => {
  const alerts = read('api/chat_alerts.php');
  assert.match(alerts, /function sendOrderDocuments/);
  assert.match(alerts, /function sendWhatsAppDocument/);
  assert.match(alerts, /function sendViberDocument/);
  // Meta WhatsApp: upload then reference the media id.
  assert.match(alerts, /graph\.facebook\.com/);
  assert.match(alerts, /'\/media'/);
  assert.match(alerts, /'type' => 'document'/);
  assert.match(alerts, /'id' => \$mediaId/);
  // Webhook gateways receive the file bytes.
  assert.match(alerts, /'contentBase64' => base64_encode\(\$pdf\)/);
  // Viber bot: file message links our signed media URL; the API takes no uploads.
  assert.match(alerts, /'type' => 'file'/);
  assert.match(alerts, /'media' => \$mediaUrl/);
  assert.match(alerts, /signedMediaToken/);
  assert.match(alerts, /verifySignedMediaToken/);
  // Documents mirror the email: per-order reports (+items), one invoice/family invoice.
  assert.match(alerts, /generateFamilyInvoicePdf/);
  assert.match(alerts, /generateInvoicePdf/);
  // Delivered-only gate inside the orchestrator.
  assert.match(alerts, /\['COMPLETED', 'GENERATED'\]/);
  // Verified-channel gate.
  assert.match(alerts, /whatsapp_verified_at'\]\) && self::channelConfigured\(\$settings, 'whatsapp'\)/);
  assert.match(alerts, /viber_verified_at'\]\) && self::channelConfigured\(\$settings, 'viber'\)/);
});

check('all four completion flows also send the chat documents', () => {
  for (const file of ['api/admin/index.php', 'api/admin/approve_order.php', 'api/admin/family_approval.php', 'api/admin/order_items.php']) {
    const src = read(file);
    assert.match(src, /AstroChatAlerts::sendOrderAlerts\(\$pdo, 'order_completed'/, `${file} keeps the completion alert`);
    assert.match(src, /AstroChatAlerts::sendOrderDocuments\(\$pdo, /, `${file} also sends the PDFs`);
  }
});

check('signed chat-media endpoint: HMAC + expiry scoped, frozen report, invoice capable', () => {
  const services = read('api/services/index.php');
  const start = services.indexOf('// 6d. GET /api/services/chat-media');
  const end = services.indexOf('// 7. (Removed)');
  assert.ok(start > 0 && end > start, 'chat-media block exists');
  const block = services.slice(start, end);
  assert.match(block, /verifySignedMediaToken/);
  assert.match(block, /frozen_snapshot'\] = true/, 'reports served to Viber are the frozen snapshot');
  assert.match(block, /generateInvoicePdf/, 'invoice document kind supported');
  assert.match(block, /chat-media-ip/, 'rate limited');
});

// ------------------------------------------------------------ schema/UI ---
check('migration 017 + schema carry the contact tables', () => {
  const migration = read('api/migrations/017_chat_delivery_contacts.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `user_chat_contacts`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `chat_number_otps`/);
  assert.match(migration, /`otp_hash` VARCHAR\(128\)/);
  const schema = read('api/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `user_chat_contacts`/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `chat_number_otps`/);
});

check('dashboard offers number save + per-app OTP verification', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /WhatsApp &amp; Viber Delivery/);
  assert.match(dashboard, /Verify on \{app\.label\}/);
  assert.match(dashboard, /Enter the 6-digit code/);
  assert.match(dashboard, /in addition to email/);
  const api = read('src/services/api.ts');
  for (const method of ['getChatDelivery', 'saveChatDeliveryNumber', 'removeChatDelivery', 'requestChatDeliveryOtp', 'confirmChatDeliveryOtp']) {
    assert.match(api, new RegExp(`async ${method}`), `api client exposes ${method}`);
  }
});

// --------------------------------------------------------- PHP runtime ---
let failures = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  [FAIL] ${name}\n         ${(error as Error).message}`);
  }
}

const wasmInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!wasmInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the PHP helper execution did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const phpFile = path.join(root, 'tests', '_chat_delivery_runtime.php');
  fs.writeFileSync(phpFile, `<?php
define('APP_SECRET_KEY', str_repeat('k', 40));
require_once __DIR__ . '/../api/chat_alerts.php';
function ok(bool $c, string $m): void {
    echo ($c ? "[PASS] " : "[FAIL] ") . $m . "\\n";
    if (!$c) { $GLOBALS['fails'] = ($GLOBALS['fails'] ?? 0) + 1; }
}
ok(AstroChatAlerts::normalizePhone('98765 43210', 'India') === '+919876543210', 'local Indian number normalizes with country');
ok(AstroChatAlerts::normalizePhone('+679 123 4567') === '+6791234567', 'international number keeps its country code');
$h = AstroChatAlerts::hashChatOtp('user1', 'whatsapp', '+919876543210', '123456');
ok($h === AstroChatAlerts::hashChatOtp('user1', 'whatsapp', '+919876543210', '123456'), 'OTP hash is deterministic for verify');
ok($h !== AstroChatAlerts::hashChatOtp('user1', 'viber', '+919876543210', '123456'), 'OTP hash is channel-scoped');
ok($h !== AstroChatAlerts::hashChatOtp('user1', 'whatsapp', '+919876543210', '654321'), 'different code, different hash');
ok(strpos($h, '123456') === false, 'stored hash never contains the plain code');
$token = AstroChatAlerts::signedMediaToken('ord_1', 'report', 7);
$p = AstroChatAlerts::verifySignedMediaToken($token);
ok(is_array($p) && $p['oid'] === 'ord_1' && (int)$p['item'] === 7 && $p['kind'] === 'report', 'signed media token round-trips');
$tampered = substr($token, 0, -2) . 'xx';
ok(AstroChatAlerts::verifySignedMediaToken($tampered) === null, 'tampered media token is rejected');
$expiredPayload = rtrim(strtr(base64_encode(json_encode(['oid' => 'ord_1', 'kind' => 'report', 'item' => 0, 'exp' => time() - 5])), '+/', '-_'), '=');
$expired = $expiredPayload . '.' . hash_hmac('sha256', $expiredPayload, APP_SECRET_KEY);
ok(AstroChatAlerts::verifySignedMediaToken($expired) === null, 'expired media token is rejected');
exit(($GLOBALS['fails'] ?? 0) > 0 ? 1 : 0);
`);
  try {
    const run = spawnSync(process.execPath,
      [path.join(root, 'scripts', 'php-wasm-run.mjs'), '--php', '8.4', 'tests/_chat_delivery_runtime.php'],
      { cwd: root, encoding: 'utf8', timeout: 240000 });
    process.stdout.write(run.stdout || '');
    if (run.status !== 0) {
      failures += 1;
      console.error(`  [FAIL] PHP-WASM chat helper execution exited ${run.status}\n${run.stderr || ''}`);
    }
  } finally {
    fs.rmSync(phpFile, { force: true });
  }
}

if (failures > 0) {
  console.error(`\nchat-delivery-and-download-language: ${failures} failing check(s)`);
  process.exit(1);
}
console.log('\nchat-delivery-and-download-language: all checks passed');
