/**
 * Full-stack verification suite for:
 *   1. Cross-origin CSRF protection & security headers (api/config.php, api/.htaccess)
 *   2. Login, Google Sign-In popup recovery, Checkout AuthModal OTP + mobile field, & AdminLogin UX
 *   3. Multipart plain-text + HTML email delivery, RFC 5322 headers, & Royal Maroon/Gold templates
 *   4. 1-Click Email Birthday Wishes + upcoming countdowns + Admin quick setup (PHP + SQLite)
 *   5. Ivory light-theme button & picker contrast rules
 *
 * Run: npx tsx tests/security-auth-email-birthday-audit.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;

async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (err: any) {
    failed += 1;
    console.error(`  FAIL ${label}\n       ${err?.stack || err}`);
  }
}

/* ------------------------------------------- 1. CSRF & .htaccess hardening */

await check('api/.htaccess blocks direct HTTP access to all internal PHP libraries and staging dirs', () => {
  const htaccess = read('api/.htaccess');
  for (const lib of [
    'config',
    'db',
    'client_ip',
    'rate_limit',
    'request_body',
    'mailer',
    'payments',
    'refunds',
    'reviews',
    'birth_profiles',
    'branding',
    'chat_alerts',
    'birthday_wishes',
  ]) {
    assert.ok(htaccess.includes(lib), `api/.htaccess must guard ${lib}.php`);
  }
  assert.match(htaccess, /RewriteRule \^\(vendor\|knowledge\|storage\|migrations\)/);
  assert.doesNotMatch(htaccess, /RewriteRule \^[^#\n]*cron/, 'cron endpoint remains reachable for token-authenticated schedulers');
});

/* ------------------------------ 2. Auth, Google Sign-In, & Admin Login UI */

await check('Checkout AuthModal collects mobile number, handles otp_required on login & signup, and toggles password visibility', () => {
  const modal = read('src/components/common/AuthModal.tsx');
  assert.match(modal, /id="auth-register-mobile"/, 'registration tab renders mobile phone input');
  assert.match(modal, /res\.status === 'otp_required'/, 'transitions cleanly to OTP verification step');
  assert.match(modal, /verifyRegisterOtp\(/, 'verifies 6-digit email OTP inside checkout modal');
  assert.match(modal, /resendRegisterOtp\(/, 'offers 1-click OTP resend inside checkout modal');
  assert.match(modal, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
});

await check('LoginPage handles unverified email accounts inline with OTP verification + resend', () => {
  const loginPage = read('src/pages/LoginPage.tsx');
  assert.match(loginPage, /res\.status === 'otp_required'/);
  assert.match(loginPage, /verifyRegisterOtp\(/);
  assert.match(loginPage, /resendRegisterOtp\(/);
  assert.match(loginPage, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
});

await check('GoogleLoginButton recovers cleanly when popup is dismissed or blocked', () => {
  const googleBtn = read('src/components/common/GoogleLoginButton.tsx');
  assert.match(googleBtn, /error_callback:\s*\(err:\s*any\)/, 'handles GIS popup error_callback');
  assert.match(googleBtn, /popup_closed/, 'quietly resets loading spinner when user closes popup');
  assert.match(googleBtn, /window\.addEventListener\('focus'/, 'recovers loading state on window focus');
});

await check('AdminLogin & ForgotPasswordForm expose consistent contrast, labels, and password toggles', () => {
  const adminLogin = read('src/components/admin/AdminLogin.tsx');
  const forgot = read('src/components/common/ForgotPasswordForm.tsx');
  assert.match(adminLogin, /bg-white dark:bg-slate-900/, 'AdminLogin card adapts cleanly to both light and dark modes');
  assert.match(adminLogin, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(forgot, /placeholder="At least 10 characters"/, 'ForgotPasswordForm matches 10-character minimum policy');
});

/* ------------------------------------------- 3. Ivory CSS & PDF Exporter  */

await check('Ivory theme preserves readable foreground ink on solid buttons and visible calendar icons', () => {
  const css = read('src/user-designs.css');
  assert.match(css, /\[data-user-design\] :is\(button,a\):is\(/);
  assert.match(css, /-webkit-calendar-picker-indicator/);
});

await check('PDF page auto-fit measures computed styles using the target document view', () => {
  const pdf = read('src/services/jathagamPdfExporter.ts');
  assert.match(pdf, /pageEl\.ownerDocument\?\.defaultView \|\| window/);
});

/* ---------------- 4. Real PHP Runtime: CSRF + Mailer + 1-Click Birthdays */

const { createAdminApiBridge } = await import(
  new URL('../scripts/php-admin-api-bridge.mjs', import.meta.url).href
);
const bridge = await createAdminApiBridge();

await check('PHP runtime: CSRF origin gate, multipart/alternative mailer headers, and 1-click Email Birthday Wishes end-to-end', async () => {
  const out = await bridge.runPhp(`
require_once '/repo/api/config.php';
require_once '/repo/api/mailer.php';
require_once '/repo/api/birthday_wishes.php';

$allowed = ['https://astrosivam.com', 'https://www.astrosivam.com'];

// A. CSRF Origin / Referer verification checks
$evilPost = astro_verify_request_origin('https://attacker.example', null, 'POST', '/api/services/birthday-wishes', $allowed, 'astrosivam.com');
$nullPost = astro_verify_request_origin('null', null, 'POST', '/api/auth/login', $allowed, 'astrosivam.com');
$evilRef  = astro_verify_request_origin(null, 'https://attacker.example/form.html', 'POST', '/api/auth/logout', $allowed, 'astrosivam.com');
$goodPost = astro_verify_request_origin('https://astrosivam.com', null, 'POST', '/api/services/birthday-wishes', $allowed, 'astrosivam.com');
$devPost  = astro_verify_request_origin('http://localhost:3000', null, 'POST', '/api/services/birthday-wishes', $allowed, 'localhost:3000');
$safeGet  = astro_verify_request_origin('https://google.com', 'https://google.com/search', 'GET', '/api/services/settings', $allowed, 'astrosivam.com');
$webhook  = astro_verify_request_origin('https://api.razorpay.com', null, 'POST', '/api/payment/webhook/razorpay', $allowed, 'astrosivam.com');

// B. Mailer multipart/alternative + branded HTML wrapper checks
$wrapped = astro_wrap_branded_email_html('Verification Test', '<p>Namaste Devotee, code: <strong>654321</strong></p>');
$ref = new ReflectionMethod('AstroMailer', 'buildMimeBody');
$ref->setAccessible(true);
$mime = $ref->invoke(null, $wrapped, [], astro_inline_logo_attachment(), 'OUTER_B', 'INNER_B');

// C. 1-Click Email Birthday Wishes end-to-end against real SQLite PDO
$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

$pdo->exec("CREATE TABLE system_settings (id INTEGER PRIMARY KEY, email_settings TEXT, general_settings TEXT)");
$pdo->exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, mobile TEXT, role TEXT)");
$pdo->exec("CREATE TABLE birth_profiles (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, dob TEXT, tob TEXT, birth_place TEXT, country TEXT, latitude REAL, longitude REAL, timezone_offset_hours REAL, gender TEXT, updated_at TEXT)");
$pdo->exec("CREATE TABLE family_members (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, relation TEXT, dob TEXT, tob TEXT, birth_place TEXT, country TEXT, latitude REAL, longitude REAL, timezone_offset_hours REAL, gender TEXT, created_at TEXT)");
$pdo->exec("CREATE TABLE birthday_wish_preferences (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, language TEXT NOT NULL DEFAULT 'en', enabled_at TEXT NULL, updated_at TEXT NULL)");
$pdo->exec("CREATE TABLE birthday_email_preferences (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, language TEXT NOT NULL DEFAULT 'en', enabled_at TEXT NULL, updated_at TEXT NULL)");
$pdo->exec("CREATE TABLE birthday_wishes_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, person_key TEXT NOT NULL, person_name TEXT NOT NULL DEFAULT '', wish_year INTEGER NOT NULL, wish_date TEXT NOT NULL, channel TEXT NOT NULL, phone_e164 TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'SENT', detail TEXT NOT NULL DEFAULT '', created_at TEXT NULL, UNIQUE(user_id, person_key, wish_year, channel))");

$pdo->exec("INSERT INTO users VALUES ('u_easy', 'Kavitha Devi', 'kavitha@example.com', '+919876543210', 'customer')");
$pdo->exec("INSERT INTO birth_profiles VALUES ('bp_1', 'u_easy', 'Kavitha Devi', '1992-10-25', '06:30', 'Chennai', 'India', 13.08, 80.27, 5.5, 'F', '2026-10-01')");
$pdo->exec("INSERT INTO family_members VALUES ('fm_leap', 'u_easy', 'Arjun Kumar', 'SON', '2020-02-29', '09:15', 'Madurai', 'India', 9.92, 78.11, 5.5, 'M', '2026-10-01')");

$pdo->exec("INSERT INTO system_settings VALUES (1, '{}', '{\\"chatAlertSettings\\":{\\"enabled\\":false,\\"birthdayWishes\\":{\\"enabled\\":false,\\"emailEnabled\\":false,\\"timezone\\":\\"Asia/Kolkata\\",\\"includeFamilyMembers\\":true}}}')");
$blockedOptIn = AstroBirthdayWishes::saveEmailPreference($pdo, 'u_easy', true, 'ta');

$pdo->exec("UPDATE system_settings SET general_settings = '{\\"chatAlertSettings\\":{\\"enabled\\":false,\\"birthdayWishes\\":{\\"enabled\\":false,\\"emailEnabled\\":true,\\"timezone\\":\\"Asia/Kolkata\\",\\"includeFamilyMembers\\":true}}}' WHERE id = 1");
$easyOptIn = AstroBirthdayWishes::saveEmailPreference($pdo, 'u_easy', true, 'ta');

$upcoming = AstroBirthdayWishes::upcomingSavedBirthdays($pdo, 'u_easy', '2026-10-23');
$leapUpcoming = AstroBirthdayWishes::upcomingSavedBirthdays($pdo, 'u_easy', '2026-02-27');

$dispatched = [];
$firstRun = AstroBirthdayWishes::sendDueWishes($pdo, [
    'date' => '2026-10-25',
    'emailTransport' => function ($to, $subj, $html, $person) use (&$dispatched) {
        $dispatched[] = ['to' => $to, 'subject' => $subj, 'html' => $html, 'person' => $person['personName']];
        return ['success' => true, 'message' => 'Delivered'];
    }
]);
$secondRun = AstroBirthdayWishes::sendDueWishes($pdo, [
    'date' => '2026-10-25',
    'emailTransport' => function () {
        return ['success' => true, 'message' => 'Should never run twice'];
    }
]);

echo json_encode([
    'csrf' => compact('evilPost', 'nullPost', 'evilRef', 'goodPost', 'devPost', 'safeGet', 'webhook'),
    'hasPlainPart' => strpos($mime, 'Content-Type: text/plain; charset=UTF-8') !== false,
    'hasHtmlPart' => strpos($mime, 'Content-Type: text/html; charset=UTF-8') !== false,
    'hasCidLogo' => strpos($mime, 'cid:astrosivamlogo') !== false,
    'blockedOptIn' => $blockedOptIn,
    'easyOptIn' => $easyOptIn,
    'upcoming' => $upcoming,
    'leapUpcoming' => $leapUpcoming,
    'dispatched' => $dispatched,
    'firstRun' => $firstRun,
    'secondRun' => $secondRun,
], JSON_UNESCAPED_UNICODE);
`);

  assert.equal(out.csrf.evilPost.ok, false);
  assert.equal(out.csrf.evilPost.reason, 'cross_origin_blocked');
  assert.equal(out.csrf.nullPost.ok, false);
  assert.equal(out.csrf.nullPost.reason, 'null_origin');
  assert.equal(out.csrf.evilRef.ok, false);
  assert.equal(out.csrf.goodPost.ok, true);
  assert.equal(out.csrf.devPost.ok, true);
  assert.equal(out.csrf.safeGet.ok, true);
  assert.equal(out.csrf.webhook.ok, true);

  assert.equal(out.hasPlainPart, true, 'MIME message includes plain-text alternative part');
  assert.equal(out.hasHtmlPart, true, 'MIME message includes HTML alternative part');
  assert.equal(out.hasCidLogo, true, 'MIME message embeds inline brand logo');

  assert.equal(out.blockedOptIn.success, false, 'cannot enable before admin switches emailEnabled on');
  assert.equal(out.easyOptIn.success, true, '1-click opt-in succeeds with zero chat verification');
  assert.equal(out.easyOptIn.birthdayWishes.emailEnabled, true);
  assert.equal(out.easyOptIn.birthdayWishes.emailAvailable, true);
  assert.equal(out.upcoming[0].name, 'Kavitha Devi');
  assert.equal(out.upcoming[0].daysUntil, 2);

  const leapChild = out.leapUpcoming.find((p: any) => p.name === 'Arjun Kumar');
  assert.ok(leapChild);
  assert.equal(leapChild.nextDate, '2026-02-28');
  assert.equal(leapChild.daysUntil, 1);

  assert.equal(out.firstRun.sent, 1, 'sends Tamil birthday greeting card even when chat gateway is disabled');
  assert.equal(out.dispatched.length, 1);
  assert.equal(out.dispatched[0].to, 'kavitha@example.com');
  assert.ok(out.dispatched[0].subject.includes('இனிய பிறந்தநாள்'), 'subject uses customer Tamil language');
  assert.equal(out.secondRun.sent, 0, 'dedupe prevents sending a second birthday email in the same year');
  assert.equal(out.secondRun.skipped, 1);
});

await bridge.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
