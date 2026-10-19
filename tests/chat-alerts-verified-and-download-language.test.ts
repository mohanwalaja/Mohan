/**
 * WhatsApp/Viber alerts + download-language rule (customer request).
 *
 * Confirmed requirements pinned here:
 *   1. The dashboard report download is ONLY in the language chosen when
 *      ordering. The system renders exactly that one language, only when
 *      the user clicks Download — never all three (en/ta/hi), and a
 *      `language` request parameter can never switch it.
 *   2. A customer can save ONE mobile number in their profile and verify
 *      it separately on WhatsApp and/or Viber via a one-time code sent in
 *      that app (hashed, 10-minute expiry, attempt-capped).
 *   3. Order-status alerts are sent ONLY to a number verified with an OTP
 *      in that same app. The unverified mobile from checkout is never a
 *      chat destination.
 *   4. Reports and invoices are NEVER sent over WhatsApp or Viber. Email
 *      remains the only document delivery channel; chat is alerts only.
 *
 * Layers: source contracts across frontend + PHP, plus real PHP
 * execution of the pure helpers (phone normalization, OTP hashing, the
 * verified-target gate) under PHP-WASM when installed.
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceText } from './helpers/sourceSlice';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

// ------------------------------------------------------- download rule ---
check('download renders only the ordered language, only on click', () => {
  const services = read('api/services/index.php');
  // The report-pdf route is gone: the dashboard reads the frozen snapshot and
  // renders it in the browser. The snapshot route must never accept a language
  // override either, so the printed report keeps the ordered language.
  const start = services.indexOf('// 6b2. GET /api/services/orders/:id/report-snapshot');
  const end = services.indexOf('// 6c. (Removed)');
  assert.ok(start > 0 && end > start, 'frozen snapshot source exists');
  const block = services.slice(start, end);
  assert.ok(!block.includes("$_GET['language']") && !block.includes('$_GET["language"]'),
    'a language parameter must never switch the download language');
  assert.ok(!block.includes("$_GET['lang']"), 'no lang override either');
  assert.ok(!/preg_match\([^\n]*report-pdf/.test(services), 'no server PDF route may come back');
  assert.ok(!services.includes('Content-Type: application/pdf'), 'the API never streams a PDF');
  const api = read('src/services/api.ts');
  const fnStart = api.indexOf('async getMyOrderReportSnapshot');
  const fn = api.slice(fnStart, api.indexOf('\n  },', fnStart) + 4);
  // The response TYPE names the ordered language; the REQUEST must not send a
  // language choice, so the frozen report keeps the language it was bought in.
  const request = fn.slice(fn.indexOf('> {'));
  assert.ok(!/lang(?:uage)?\s*[:=]/.test(request), 'client sends no language choice for downloads');
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /reportLanguageName\(order\.language\)/, 'the ordered language is still shown');
  assert.match(dashboard, /reportLanguageName\(item\.language\)/, 'each person downloads in their own ordered language');
  assert.doesNotMatch(dashboard, /your order language|frozen as ordered|never updates itself/,
    'the customer asked for the old profile wording to be removed');
});

// ------------------------------------------------------------ endpoints ---
check('chat-alert endpoints: authenticated, rate-limited, OTP never echoed', () => {
  const services = read('api/services/index.php');
  const start = services.indexOf('// 3c. WhatsApp & Viber alert contacts');
  const end = services.indexOf('// 4. POST /api/services/calculate-preview');
  assert.ok(start > 0 && end > start, 'chat-alert contact block exists');
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

// --------------------------------------------------------- verified only ---
check('alerts use only OTP-verified numbers, never the order mobile', () => {
  const alerts = read('api/chat_alerts.php');
  const target = sliceText(alerts, 'function verifiedChatTargets', 'function chatContactState', 'verified target gate');
  assert.match(target, /getChatContact\(\$pdo, \$userId\)/);
  assert.match(target, /!empty\(\$contact\['whatsapp_verified_at'\]\) && self::channelConfigured\(\$settings, 'whatsapp'\)/);
  assert.match(target, /!empty\(\$contact\['viber_verified_at'\]\) && self::channelConfigured\(\$settings, 'viber'\)/);
  assert.match(target, /preg_match\('\/\^\\\+\\d\{7,15\}\$\/', \$phone\)/, 'only a full E.164 number can receive alerts');

  const orchestrator = sliceText(alerts, 'function sendOrderAlerts', 'function sendTestAlert', 'order alert orchestrator');
  assert.match(orchestrator, /verifiedChatTargets\(\$pdo, \$userId, \$settings\)/);
  assert.match(orchestrator, /if \(empty\(\$target\)\) \{\s*return \[\];/);
  assert.match(orchestrator, /in_array\('whatsapp', \$channels, true\)/);
  assert.match(orchestrator, /in_array\('viber', \$channels, true\)/);
  assert.doesNotMatch(orchestrator, /user_mobile|userMobile|normalizePhone/,
    'the unverified checkout mobile is never a chat destination');
});

// ------------------------------------------------------------ alerts only ---
check('no report or invoice is ever sent over WhatsApp/Viber', () => {
  const alerts = read('api/chat_alerts.php');
  const services = read('api/services/index.php');
  assert.doesNotMatch(alerts, /sendOrderDocuments|sendWhatsAppDocument|sendViberDocument|signedMediaToken|verifySignedMediaToken|buildOrderDocuments|httpPostMultipart/);
  assert.doesNotMatch(alerts, /generateReportPdf|generateInvoicePdf|generateFamilyInvoicePdf/);
  assert.doesNotMatch(services, /chat-media|verifySignedMediaToken/);
  for (const file of ['api/admin/index.php', 'api/admin/approve_order.php', 'api/admin/family_approval.php', 'api/admin/order_items.php']) {
    const src = read(file);
    assert.match(src, /AstroChatAlerts::sendOrderAlerts\(\$pdo, 'order_completed'/, `${file} keeps the completion alert`);
    assert.doesNotMatch(src, /sendOrderDocuments/, `${file} must not send PDFs over chat`);
  }
  for (const file of ['api/services/index.php', 'api/services/multi_person_order.php']) {
    assert.match(read(file), /AstroChatAlerts::sendOrderAlerts\(\$pdo, 'order_confirmed'/);
  }
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

check('dashboard offers number save + per-app OTP verification and states alerts-only', () => {
  const dashboard = read('src/pages/CustomerDashboard.tsx');
  assert.match(dashboard, /WhatsApp &amp; Viber Order Alerts/);
  assert.match(dashboard, /only to a verified number/);
  assert.match(dashboard, /PDFs are never sent over chat/);
  assert.match(dashboard, /Order status alerts \(confirmed \/ completed\) will be sent/);
  assert.match(dashboard, /Verify on \{app\.label\}/);
  assert.match(dashboard, /Enter the 6-digit code/);
  assert.doesNotMatch(dashboard, /in addition to email|PDFs will also be sent/, 'no PDF-over-chat promise remains');

  const checkout = read('src/components/cart/SingleServiceCheckoutModal.tsx');
  assert.doesNotMatch(checkout, /whatsappDelivery|PDF certificate to my WhatsApp/,
    'checkout never collects an unverified WhatsApp PDF destination');

  const panel = read('src/components/admin/ChatAlertConfigPanel.tsx');
  assert.match(panel, /Reports and invoices are never sent over WhatsApp\/Viber/);
  assert.doesNotMatch(panel, /PDFs are also sent to verified apps/);

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
  const phpFile = path.join(root, 'tests', '_chat_alerts_verified_runtime.php');
  fs.writeFileSync(phpFile, `<?php
define('APP_SECRET_KEY', str_repeat('k', 40));
require_once __DIR__ . '/../api/chat_alerts.php';

class FakeChatContactPdo {
    public $contact = null;
    public function exec($sql) { return 0; }
    public function prepare($sql) { return new FakeChatContactStmt($this); }
}
class FakeChatContactStmt {
    private $pdo;
    public function __construct($pdo) { $this->pdo = $pdo; }
    public function execute($params = []) { return true; }
    public function fetch() { return $this->pdo->contact; }
}

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

$settings = [
    'enabled' => true,
    'whatsapp' => ['enabled' => true, 'provider' => 'meta', 'phoneNumberId' => '123', 'accessToken' => 'token'],
    'viber' => ['enabled' => true, 'provider' => 'viber_bot', 'authToken' => 'token'],
];
$pdo = new FakeChatContactPdo();
ok(AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $settings) === [], 'no saved contact means no alert destination');
$alertSettings = $settings + ['notifyOrderConfirmed' => true, 'notifyOrderCompleted' => true];
ok(AstroChatAlerts::sendOrderAlerts($pdo, 'order_confirmed', [['userId' => 'user1', 'orderNumber' => 'ORD-X']], $alertSettings) === [], 'the dispatcher sends nothing without a saved contact');

$pdo->contact = ['phone_e164' => '+919876543210', 'whatsapp_verified_at' => null, 'viber_verified_at' => null];
ok(AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $settings) === [], 'unverified number is not an alert destination');
ok(AstroChatAlerts::sendOrderAlerts($pdo, 'order_confirmed', [['userId' => 'user1', 'orderNumber' => 'ORD-X', 'userMobile' => '+919876543210']], $alertSettings) === [], 'the dispatcher ignores an unverified order mobile');

$pdo->contact = ['phone_e164' => '+919876543210', 'whatsapp_verified_at' => '2026-10-19 10:00:00', 'viber_verified_at' => null];
$wa = AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $settings);
ok(($wa['channels'] ?? []) === ['whatsapp'] && $wa['phone'] === '+919876543210', 'per-app verification: WhatsApp only');

$pdo->contact = ['phone_e164' => '+919876543210', 'whatsapp_verified_at' => '2026-10-19 10:00:00', 'viber_verified_at' => '2026-10-19 10:00:00'];
$both = AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $settings);
ok(($both['channels'] ?? []) === ['whatsapp', 'viber'], 'both apps must be verified separately and both then qualify');

$pdo->contact = ['phone_e164' => '98765', 'whatsapp_verified_at' => '2026-10-19 10:00:00', 'viber_verified_at' => null];
ok(AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $settings) === [], 'a non-E.164 saved number is never messaged');

$off = $settings;
$off['whatsapp']['enabled'] = false;
$pdo->contact = ['phone_e164' => '+919876543210', 'whatsapp_verified_at' => '2026-10-19 10:00:00', 'viber_verified_at' => null];
ok(AstroChatAlerts::verifiedChatTargets($pdo, 'user1', $off) === [], 'an admin-disabled channel is not a target');

exit(($GLOBALS['fails'] ?? 0) > 0 ? 1 : 0);
`);
  try {
    const run = spawnSync(process.execPath,
      [path.join(root, 'scripts', 'php-wasm-run.mjs'), '--php', '8.4', 'tests/_chat_alerts_verified_runtime.php'],
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
  console.error(`\nchat-alerts-verified-and-download-language: ${failures} failing check(s)`);
  process.exit(1);
}
console.log('\nchat-alerts-verified-and-download-language: all checks passed');
