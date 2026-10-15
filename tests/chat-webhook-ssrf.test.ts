/**
 * Chat-gateway webhook SSRF guard (audit 2026-10-15).
 *
 * THE RULE UNDER TEST: the admin-configured WhatsApp/Viber gateway webhook
 * URLs are the only chat-alert destinations an operator can point at an
 * arbitrary host, so both sender branches must validate the URL before the
 * order payload is posted: https only, no embedded userinfo, no localhost,
 * no literal private/reserved IP, and every DNS answer must be public
 * (unresolvable names fail closed). The transport itself must not follow
 * redirects and must speak https only, so a validated URL cannot bounce the
 * payload elsewhere via a 30x. Saving a bad URL in admin settings fails fast
 * instead of failing silently at send time.
 *
 * PHP cannot be executed natively in this sandbox, so the endpoint is
 * verified by reading it; assertions run against code with comments removed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceText } from './helpers/sourceSlice';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const endpoint = read('api/chat_alerts.php');
const admin = read('api/admin/index.php');

/** PHP source with comments removed: assertions must run against code, not prose. */
const code = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*#(?!\[).*$/gm, '');

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    throw err;
  }
}

check('the WhatsApp webhook branch validates the URL before posting', () => {
  const sender = code(sliceText(
    endpoint, 'function sendWhatsApp', 'function sendViber', 'whatsapp sender'
  ));
  const guardAt = sender.indexOf('isValidWebhookUrl($url)');
  const postAt = sender.indexOf('httpPostJson($url');
  assert.ok(guardAt !== -1, 'the branch must call isValidWebhookUrl($url)');
  assert.ok(postAt !== -1, 'the branch must post via httpPostJson($url)');
  assert.ok(guardAt < postAt, 'validation must run before the payload is posted');
});

check('the Viber webhook branch validates the URL before posting', () => {
  const sender = code(sliceText(
    endpoint, 'function sendViber', 'function sendOrderAlerts', 'viber sender'
  ));
  const guardAt = sender.indexOf('isValidWebhookUrl($url)');
  const postAt = sender.indexOf('httpPostJson($url');
  assert.ok(guardAt !== -1, 'the branch must call isValidWebhookUrl($url)');
  assert.ok(postAt !== -1, 'the branch must post via httpPostJson($url)');
  assert.ok(guardAt < postAt, 'validation must run before the payload is posted');
});

check('the guard requires https and rejects userinfo, localhost and private IPs', () => {
  const guard = code(sliceText(
    endpoint, 'function isValidWebhookUrl', 'function httpPostJson', 'webhook guard'
  ));
  assert.match(guard, /!== 'https'/, 'only the https scheme passes');
  assert.match(guard, /\$parts\['user'\]/, 'embedded userinfo is rejected');
  assert.match(guard, /strtolower\(\$host\) === 'localhost'/, 'localhost is rejected');
  assert.match(guard, /FILTER_FLAG_NO_PRIV_RANGE \| FILTER_FLAG_NO_RES_RANGE/, 'private/reserved ranges are rejected');
  assert.match(guard, /gethostbynamel\(\$host\)/, 'DNS answers are resolved and every address is checked');
});

check('the transport cannot be bounced off-host by a redirect', () => {
  const transport = code(sliceText(
    endpoint, 'function httpPostJson', 'function sendWhatsApp', 'webhook transport'
  ));
  assert.match(transport, /CURLOPT_FOLLOWLOCATION => false/, 'cURL never follows redirects');
  assert.match(transport, /CURLOPT_PROTOCOLS => CURLPROTO_HTTPS/, 'cURL speaks https only');
  assert.match(transport, /'follow_location' => 0/, 'the stream fallback never follows redirects');
  assert.match(transport, /'verify_peer_name' => true/, 'the stream fallback verifies the TLS hostname');
});

check('saving a bad gateway URL in admin settings fails fast', () => {
  const settings = code(admin);
  assert.match(settings, /AstroChatAlerts::isValidWebhookUrl\(\$webhookCandidate\)/, 'newly saved URLs are validated');
  assert.match(settings, /Nothing was saved/, 'a bad URL aborts the save');
});

console.log(`\n[OK] chat webhook ssrf: ${passed} checks passed`);
