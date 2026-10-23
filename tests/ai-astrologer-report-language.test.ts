import { readRepoSource } from './helpers/module-sources.js';
/**
 * AI astrologer chat language follows the report language.
 *
 * THE RULE UNDER TEST: whatever language the customer selected for their
 * report is the language the AI astrologer chat speaks — from the first
 * greeting to every reply. The site's language picker only decides chats
 * with no report attached (administrator sessions).
 *
 * PHP cannot be executed in this sandbox, so the endpoint is verified by
 * reading it; the React side is verified the same way the other astrologer
 * contract tests do it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceText } from './helpers/sourceSlice';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);

const endpoint = read('api/ai_astrologer.php');
const panel = read('src/components/ai-astrologer/AiAstrologerPanel.tsx');
const launcher = read('src/components/ai-astrologer/AiAstrologerLauncher.tsx');
const dashboard = read('src/pages/CustomerDashboard.tsx');
const client = read('src/services/aiAstrologerApi.ts');

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

check('the entitlement that opens the chat also reports the order\'s language', () => {
  const entitlement = sliceText(
    endpoint, 'function astro_ai_chat_entitlement', 'function astro_ai_entitlement_copy', 'entitlement body'
  );
  // The language column of the newest delivered order travels with the
  // entitlement, in both the granted and the expired answer.
  assert.match(entitlement, /SELECT id, order_number, service_type, language, email_sent_at/);
  assert.match(entitlement, /'language' => \$reportLanguage/);
  assert.match(entitlement, /'language' => null/, 'a denied entitlement carries no language');
});

check('a session opens in the language of the report it binds to', () => {
  const session = code(sliceText(
    endpoint, 'function astro_ai_action_session', 'function astro_ai_action_history', 'session handler'
  ));
  // Both binding paths (explicit orderId and floating-launcher entitlement)
  // capture the order's language, and it decides the session language.
  assert.match(session, /SELECT id, order_number, service_type, language, email_sent_at/);
  assert.match(session, /\$reportLanguage = \(string\) \(\$entitlement\['language'\] \?\? ''\)/);
  assert.match(session, /\$reportLanguage = \(string\) \(\$order\['language'\] \?\? ''\)/);
  assert.match(session, /\$reportLanguage !== null\s*\?\s*astro_normalize_report_language\(\$reportLanguage\)/);
  // The caller's language only survives when no report is bound at all.
  assert.match(session, /: astro_normalize_report_language\(\(string\) \(\$body\['language'\]/);
});

check('replies and escalations stay in the session language, not a stale client preference', () => {
  const ask = code(sliceText(
    endpoint, 'function astro_ai_action_ask', 'function astro_ai_action_upload', 'ask handler body'
  ));
  assert.match(ask, /\$session\['language'\] \?\? \(\$body\['language'\] \?\? 'ta'\)/);
  assert.ok(
    !/\$body\['language'\] \?\? \$session\['language'\]/.test(ask),
    'the request body must not override the report language for a reply'
  );
  const handoff = sliceText(
    endpoint, 'function astro_ai_action_handoff', 'function astro_ai_action_usage', 'handoff handler'
  );
  assert.match(handoff, /\$session\['language'\] \?\? \(\$body\['language'\] \?\? 'ta'\)/);
});

check('usage tells the floating launcher which language the report is in', () => {
  const usage = code(sliceText(
    endpoint, 'function astro_ai_action_usage', '/* ==================================================================', 'usage handler body'
  ));
  assert.match(usage, /astro_ai_chat_entitlement\(\$pdo, \(string\) \$user\['id'\]\)/);
  assert.match(usage, /\$entitlement !== null && \$entitlement\['allowed'\] && \$entitlement\['language'\] !== null/);
  // An administrator has no bound report and follows the site picker instead:
  // the entitlement lookup is skipped for admins via the ternary.
  assert.match(usage, /astro_ai_is_admin\(\$user\)\s*\?\s*null\s*:\s*astro_ai_chat_entitlement/);
  // Without an entitlement (admin, or expired window) the language is null.
  assert.match(usage, /:\s*null,\s*\n\s*'windowSeconds'/);
});

check('attaching a report moves the conversation into that report\'s language', () => {
  const bind = code(sliceText(
    endpoint, 'function astro_ai_action_bind', '/* ==================================================================', 'bind handler body'
  ));
  assert.match(bind, /SELECT id, service_type, order_number, language/);
  assert.match(bind, /\$language = \$order !== null\s*\?\s*astro_normalize_report_language/);
  // The session row stores the switch, and the response hands it to the panel.
  assert.match(bind, /service_type = \?, language = \?, person_id = \? WHERE id = \?/);
  assert.match(bind, /'language' => \$language/);
  // Detaching keeps the session's current language rather than resetting it.
  assert.match(bind, /: astro_normalize_report_language\(\(string\) \(\$session\['language'\] \?\? 'ta'\)\)/);
});

check('the panel renders every string in the session\'s report language', () => {
  // The opener's language is a fallback until the server answers with the
  // session language, which is the language of the bound report.
  assert.match(panel, /language: initialLanguage/);
  assert.match(panel, /sessionLanguage \?\? initialLanguage/);
  assert.match(panel, /setSessionLanguage\(s\.language\)/);
  // The welcome and the guided menu are built with the session language.
  const open = sliceText(panel, 'const s = await aiAstrologer.createSession', '} catch (e) {', 'session open effect');
  assert.match(open, /const language = s\.language/);
  assert.match(open, /aiAstrologer\.options\(language\)/);
  // Switching to another report switches the conversation language too.
  assert.match(panel, /setSessionLanguage\(res\.language\)/);
  assert.match(panel, /ATTACHED_NOTE\[res\.language\]/);
});

check('the floating launcher opens in the report language and admins keep the site picker', () => {
  assert.match(launcher, /setReportLanguage\(usage\.language \?\? null\)/);
  assert.match(launcher, /reportLanguage \?\? appLanguage/);
  // Access denial clears the language along with availability.
  assert.match(launcher, /setReportLanguage\(null\)/);
});

check('the dashboard opens the report chat in that order\'s language', () => {
  assert.match(dashboard, /normalizeReportLanguage\(aiChatOrder\.language\)/);
  // A chat with no bound report still follows the site's language picker.
  assert.match(dashboard, /: appLanguage/);
});

check('the browser client carries the language fields the UI depends on', () => {
  assert.match(client, /language: ChatLanguage \| null;/);
  assert.match(client, /The conversation now speaks this report's language/);
});

/**
 * When the optional PHP-WASM runtime is present, compile the endpoint for
 * real — the same check `php -l` performs — so a syntax error in the language
 * wiring fails here instead of waiting for a production request. Nothing in
 * the endpoint executes; TOKEN_PARSE only parses it.
 */
const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (runtimeInstalled) {
  check('the endpoint compiles under PHP with the report-language wiring', () => {
    const run = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'php-ai-provider-check.mjs'),
        'tests/fixtures/php-ai-probes/endpoint-lint.php',
        '--emit', 'tests/fixtures/php-ai-probes/out-lint.json',
      ],
      { cwd: root, encoding: 'utf8', timeout: 180000 },
    );
    assert.equal(run.status, 0, `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
    const lint = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'php-ai-probes', 'out-lint.json'), 'utf8'));
    assert.equal(lint.ok, true, `api/ai_astrologer.php does not parse: ${lint.error ?? 'unknown error'}`);
  });
} else {
  console.log('  [SKIP] endpoint compile check - @php-wasm/node is not installed');
}

console.log(`\n[OK] ai-astrologer report language: ${passed} checks passed`);
