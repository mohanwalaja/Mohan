/**
 * AI astrologer family (multi-person) chat: all member names in the chat,
 * and the customer picks whose answers they want.
 *
 * THE RULE UNDER TEST: a family report of N people shows every name in the
 * chat; the selected member decides which chart, which report readings and
 * which birth details the replies are built from. The selection lives on the
 * session, is re-verified against the bound order, and defaults to the first
 * member.
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
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const endpoint = read('api/ai_astrologer.php');
const offline = read('api/astrology/ai_astrologer_offline.php');
const migration = read('api/migrations/007_ai_astrologer_chat.sql');
const panel = read('src/components/ai-astrologer/AiAstrologerPanel.tsx');
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

check('the session schema remembers which member the chat answers about', () => {
  assert.match(migration, /`person_id` INT NULL/);
  // Databases created before the picker get the column from migration 014 —
  // never from runtime DDL. The bootstrap only verifies and fails loudly.
  const personMigration = read('api/migrations/014_ai_chat_person_id.sql');
  assert.match(personMigration, /ADD COLUMN `person_id` INT NULL/);
  const ensure = code(sliceText(
    endpoint, 'function astro_ai_ensure_tables', 'function astro_ai_new_session_id', 'schema bootstrap'
  ));
  assert.match(ensure, /SHOW COLUMNS FROM `ai_chat_sessions` LIKE 'person_id'/);
  assert.match(ensure, /014_ai_chat_person_id\.sql/);
  assert.match(ensure, /, 503\)/);
  assert.doesNotMatch(ensure, /ALTER TABLE/);
});

check('opening a session lists every family member and selects the first', () => {
  const session = code(sliceText(
    endpoint, 'function astro_ai_action_session', 'function astro_ai_action_history', 'session handler'
  ));
  assert.match(session, /\$persons = astro_ai_order_persons\(\$pdo, \$orderId\)/);
  assert.match(session, /\$selectedPerson = \$persons !== \[\] \? \$persons\[0\] : null/);
  assert.match(session, /person_id\)\s*\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?\)/);
  assert.match(session, /'persons' => \$persons/);
  assert.match(session, /'selectedPersonId' => \$selectedPerson !== null/);
});

check('the person list reads the family tables and degrades to empty, never to an error', () => {
  const helpers = code(sliceText(
    endpoint, 'function astro_ai_order_persons', 'function astro_ai_selected_person', 'person list helper'
  ));
  assert.match(helpers, /astro_ensure_multi_person_tables\(\$pdo\)/);
  assert.match(helpers, /FROM order_persons/);
  assert.match(helpers, /ORDER BY seq ASC/);
  assert.match(helpers, /catch \(Throwable \$e\)/);
  // Every name is presentable, even a blank full_name in old data.
  assert.match(helpers, /'Person ' \. max\(1, \$seq\)/);
});

check('only a family order has a selected person, and the saved choice wins', () => {
  const select = code(sliceText(
    endpoint, 'function astro_ai_selected_person', 'function astro_ai_person_items', 'selected person helper'
  ));
  assert.match(select, /count\(\$persons\) < 2/);
  assert.match(select, /\$person\['id'\] === \$wanted/);
  // Falls back to the first member when the session predates a valid choice.
  assert.match(select, /return \$persons\[0\]/);
});

check('picking a member is re-checked against the bound order', () => {
  const person = code(sliceText(
    endpoint, 'function astro_ai_action_person', '/* ==================================================================', 'person handler'
  ));
  // Same two gates as every other action: own session, session not closed.
  assert.match(person, /astro_ai_load_session\(\$pdo, \$sessionId, \$user\['id'\]\)/);
  assert.match(person, /\$session\['status'\] === 'CLOSED'/);
  // The person must belong to the order bound to THIS session.
  assert.match(person, /\$orderId = \(string\) \(\$session\['order_id'\] \?\? ''\)/);
  assert.match(person, /astro_ai_order_persons\(\$pdo, \$orderId\)/);
  assert.match(person, /\$person\['id'\] === \$personId/);
  assert.match(person, /UPDATE ai_chat_sessions SET person_id = \? WHERE id = \? AND user_id = \?/);
  assert.match(endpoint, /case 'person':\s*\n\s*astro_ai_action_person\(\$pdo, \$user, \$body\)/);
});

check('attaching a report resets the member to that report (and clears on detach)', () => {
  const bind = code(sliceText(
    endpoint, 'function astro_ai_action_bind', 'function astro_ai_action_person', 'bind handler'
  ));
  assert.match(bind, /\$persons = \$order !== null \? astro_ai_order_persons\(\$pdo, \(string\) \$orderId\) : \[\]/);
  assert.match(bind, /person_id = \? WHERE id = \?/);
  // The PDF-upload bind path resets it the same way.
  const upload = code(sliceText(
    endpoint, '// Accepted. Bind the session to this order', 'astro_ai_save_message', 'upload bind'
  ));
  assert.match(upload, /astro_ai_order_persons\(\$pdo, \(string\) \$order\['id'\]\)/);
  assert.match(upload, /person_id = \? WHERE id = \?/);
});

check('replies are built from the selected member\'s chart, readings and birth details', () => {
  const reply = code(sliceText(
    endpoint, 'function astro_ai_generate_reply', 'function astro_ai_escalation_reason', 'reply builder body'
  ));
  assert.match(reply, /\$persons = astro_ai_order_persons\(\$pdo, \(string\) \$order\['id'\]\)/);
  assert.match(reply, /\$person = astro_ai_selected_person\(\$session, \$persons\)/);
  assert.match(reply, /astro_ai_person_items\(\$pdo, \(string\) \$order\['id'\], \$person\['id'\]\)/);
  // The natal chart comes from the member's own Birth Jathagam row.
  assert.match(reply, /\$chartOrder = astro_ai_person_report_order\(\$order, \$personItem, \$person\['id'\]\)/);
  // Service chapters read the member's merged facts, not the family header.
  assert.match(reply, /astro_ai_person_service_facts\(\$order, \$person\['id'\], \$personItems\)/);
  // The context names whose answers these are.
  assert.match(reply, /\$context\['personName'\] = \$person\['name'\]/);
  assert.match(reply, /' \| Answering for: ' \. \$person\['name'\]/);
  assert.match(reply, /Birth details used: /);
  assert.match(reply, /\$person\['name'\] \. ' — ' \. \$facts\['header'\]/);
});

check('the member\'s own report rows rebuild through the existing engine path', () => {
  const itemOrder = code(sliceText(
    endpoint, 'function astro_ai_person_report_order', 'function astro_ai_person_service_facts', 'person report order'
  ));
  // Cache key namespaced by person: two members never share one rebuild.
  assert.match(itemOrder, /\. '#' \. \$personId/);
  assert.match(itemOrder, /\$pseudo\['service_type'\] = \(string\) \$item\['serviceCode'\]/);
  assert.match(itemOrder, /\$pseudo\['input_payload'\] = \$item\['payload'\]/);
  const facts = code(sliceText(
    endpoint, 'function astro_ai_person_service_facts', 'function astro_ai_person_birth_text', 'person service facts'
  ));
  assert.match(facts, /\['serviceType' => 'MULTI_PERSON', 'services' => \[\]\]/);
  assert.match(facts, /astro_ai_service_facts\(astro_ai_person_report_order\(/);
});

check('family buyers see the service chapters their items were bought for', () => {
  const entitled = code(sliceText(
    endpoint, 'function astro_ai_entitled_service_types', 'function astro_ai_attachable_orders', 'entitled services'
  ));
  assert.match(entitled, /FROM order_items i/);
  assert.match(entitled, /JOIN orders o ON o\.id = i\.order_id/);
  // A missing child table must never hide the header-based chapters.
  assert.match(entitled, /catch \(Throwable \$e\)/);
});

check('the answer route reads the selected member\'s chapters and points at the picker', () => {
  const route = code(sliceText(
    offline, 'private static function serviceRoute', 'private static function serviceAttachBubbles', 'service route'
  ));
  // MULTI_PERSON facts cover a chapter when `services` lists it for this member.
  assert.match(route, /\$factsService === 'MULTI_PERSON'/);
  assert.match(route, /in_array\(\$service, array_map\('strval', \(array\) \(\$facts\['services'\] \?\? \[\]\)\), true\)/);
  const attach = code(sliceText(
    offline, 'private static function serviceAttachBubbles', 'private static function serviceUnreadableText', 'attach bubbles'
  ));
  // Bound family report + chapter the member lacks -> use the Person picker.
  assert.match(attach, /\$bound === 'MULTI_PERSON'/);
  assert.match(attach, /Person picker/);
});

check('the browser client carries the person fields the picker needs', () => {
  assert.match(client, /export interface ChatPerson \{/);
  assert.match(client, /persons: ChatPerson\[\];/);
  assert.match(client, /selectedPersonId: number \| null;/);
  assert.match(client, /async selectPerson\(sessionId: string, personId: number\)/);
  assert.match(client, /call\('person', \{ sessionId, personId \}\)/);
});

check('the panel lists every name, announces the default and switches on pick', () => {
  // The picker renders one option per family member and only when there are many.
  assert.match(panel, /persons\.length > 1/);
  assert.match(panel, /persons\.map\(\(p\) =>/);
  assert.match(panel, /PERSON_LABEL/);
  assert.match(panel, /aiAstrologer\.selectPerson\(sessionId, personId\)/);
  // Names arrive with the session and with a report switch.
  assert.match(panel, /setPersons\(sessionPersons\)/);
  assert.match(panel, /setPersons\(res\.persons \?\? \[\]\)/);
  assert.match(panel, /setSelectedPersonId\(s\.selectedPersonId \?\? null\)/);
  // The chat says whose answers these are, in all three languages.
  for (const token of ['PERSON_OPEN_NOTE', 'PERSON_SWITCHED_NOTE', 'PERSON_FAILED', 'PERSON_LABEL']) {
    const block = sliceText(panel, `const ${token}`, 'interface Props', `${token} block`);
    for (const key of ['en:', 'ta:', 'hi:']) {
      assert.ok(block.includes(key), `${token} is missing a ${key} entry`);
    }
  }
});

/**
 * When the optional PHP-WASM runtime is present, compile the endpoint and the
 * answer router for real - the same check `php -l` performs - so a syntax
 * error in the family wiring cannot wait for a production request.
 */
const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (runtimeInstalled) {
  check('the endpoint and the answer router compile under PHP', () => {
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
    assert.equal(lint.ok, true, `PHP does not parse: ${lint.error ?? 'unknown error'}`);
  });
} else {
  console.log('  [SKIP] PHP compile check - @php-wasm/node is not installed');
}

console.log(`\n[OK] ai-astrologer family persons: ${passed} checks passed`);
