import { readRepoSource } from './helpers/module-sources.js';
/**
 * Regression suite for:
 *  1. Tamil / Hindi / English AI Astrologer report switching (no stale English
 *     topics, questions, opening greeting, report dropdown titles, or `Report #`
 *     subtitle when attaching a Tamil report from an English launcher session).
 *  2. Service-chapter filtering & priority ordering when a single-service report
 *     (e.g. `MARRIAGE_COMPATIBILITY` #ORD-5A4305) is attached, plus pinned
 *     non-clipped Report/Person selector bar and clean mobile launcher layout.
 *  3. Whole-repo audit fixes:
 *     - Zero cross-script Devanagari (`ॐ`) inside Tamil PDF / HTML view strings.
 *     - Zero unbounded `file_get_contents('php://input')` stream reads in `api/`.
 *     - Full locale variant normalization (`ta`, `ta-IN`, `tamil`, `தமிழ்`, `hi`,
 *       `hi-IN`, `hindi`, `हिन्दी`) in both TypeScript and PHP.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeReportLanguage } from '../src/services/reportLanguage';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'tests', 'fixtures', 'php-ai-probes', 'out-tamil-order-bind.json');

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function walkPhpFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'vendor' || ent.name === 'storage' || ent.name === 'knowledge') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkPhpFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith('.php')) acc.push(full);
  }
  return acc;
}

check('TypeScript normalizeReportLanguage handles full names, regional codes, and native script labels', () => {
  assert.equal(normalizeReportLanguage('ta'), 'ta');
  assert.equal(normalizeReportLanguage('TA'), 'ta');
  assert.equal(normalizeReportLanguage('ta-IN'), 'ta');
  assert.equal(normalizeReportLanguage('ta_IN'), 'ta');
  assert.equal(normalizeReportLanguage('tamil'), 'ta');
  assert.equal(normalizeReportLanguage('தமிழ்'), 'ta');
  assert.equal(normalizeReportLanguage('hi'), 'hi');
  assert.equal(normalizeReportLanguage('hi-IN'), 'hi');
  assert.equal(normalizeReportLanguage('hindi'), 'hi');
  assert.equal(normalizeReportLanguage('हिन्दी'), 'hi');
  assert.equal(normalizeReportLanguage('हिंदी'), 'hi');
  assert.equal(normalizeReportLanguage('en'), 'en');
  assert.equal(normalizeReportLanguage('fr'), 'en');
});

check('AiAstrologerPanel re-localizes menu, report labels, greetings, customer bubbles, and prioritizes the bound report chapter', () => {
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'ai-astrologer', 'AiAstrologerPanel.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'src', 'pages', 'CustomerDashboard.tsx'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'src', 'components', 'ai-astrologer', 'AiAstrologerLauncher.tsx'), 'utf8');

  // Attach & PDF upload both refresh the guided menu in `res.language` and localize `Report #`.
  assert.match(panel, /await syncMenuForLanguage\(\s*res\.language/);
  assert.match(panel, /formatOrderLabel\(res\.language,\s*res\.orderNumber\)/);
  assert.match(panel, /content:\s*reply\.customerMessage\s*\?\?\s*msg\.content/);

  // Service-bound chapters filter out mismatched single-service chapters and promote the matching chapter first.
  assert.match(panel, /const visibleCategories = useMemo/);
  assert.match(panel, /!reqServices \|\| reqServices\.includes\(normalizedBound\)/);
  assert.match(panel, /matching\.length > 0 \? \[\.\.\.matching, \.\.\.rest\] : filtered/);

  // CustomerDashboard passes localized report labels for Tamil / Hindi / English.
  assert.match(dashboard, /அறிக்கை #\$\{aiChatOrder\.orderNumber\}/);
  assert.match(dashboard, /रिपोर्ट #\$\{aiChatOrder\.orderNumber\}/);

  // Mobile launcher hides redundant floating close button while panel is open.
  assert.match(launcher, /\$\{isOpen \? 'hidden sm:flex' : 'flex'\}/);
});

check('server HTML view builder contains zero Devanagari inside Tamil invocations and low-quality server mPDF is gone', () => {
  assert.ok(!fs.existsSync(path.join(root, 'api/astrology/pdf_mpdf_reports.php')),
    'api/astrology/pdf_mpdf_reports.php must remain deleted');
  const content = readRepoSource(path.join(root, 'api/astrology/report_views.php'));
  assert.match(content, /\|\| ஓம் விநாயகாய நமஃ \|\|/, 'api/astrology/report_views.php must use pure Tamil Om invocation');
  assert.doesNotMatch(content, /\|\| ॐ விநாயகாய/, 'api/astrology/report_views.php must not embed Devanagari ॐ in Tamil text');
});

check('every php://input reader across api/ enforces an explicit byte ceiling', () => {
  const unbounded: string[] = [];
  for (const file of walkPhpFiles(path.join(root, 'api'))) {
    const content = fs.readFileSync(file, 'utf8');
    if (/file_get_contents\(\s*['"]php:\/\/input['"]\s*\)/.test(content)) {
      unbounded.push(path.relative(root, file));
    }
  }
  assert.deepEqual(unbounded, [], `Unbounded php://input reads found: ${unbounded.join(', ')}`);
});

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (runtimeInstalled) {
  check('PHP-WASM runtime verifies pure Tamil menu, Wedding Matching answer, localized order status, and zero cross-script leaks', () => {
    fs.rmSync(OUT, { force: true });
    const run = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'php-ai-provider-check.mjs'), 'tests/fixtures/php-ai-probes/tamil-order-bind.php', '--emit', 'tests/fixtures/php-ai-probes/out-tamil-order-bind.json'],
      { cwd: root, encoding: 'utf8', timeout: 180000 },
    );
    assert.equal(run.status, 0, `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
    const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    assert.ok((out.phpParsedCount as number) >= 18, `Expected mounted api/*.php files to parse, got ${out.phpParsedCount}`);
    assert.equal(out.taMenuCount, 15);
    assert.equal(out.taAllTamil, true, 'Every category title and guided question in Tamil menu must contain Tamil script');
    assert.equal(out.taHasDevanagari, false, 'Tamil menu must contain zero Devanagari characters');
    assert.equal(out.taOrderTitle, 'திருமணப் பொருத்தம்');
    assert.match(out.taSamples['weddingFirst'] as string, /[\u0B80-\u0BFF]/u);
    assert.match(out.matchReplyTa as string, /[\u0B80-\u0BFF]/u);
    assert.doesNotMatch(out.matchReplyTa as string, /[\u0900-\u097F]/u);
    assert.match(out.orderReplyTa as string, /ஆர்டர் எண்:\s*ORD-5A4305/);
    assert.match(out.orderReplyTa as string, /சேவை:\s*திருமணப் பொருத்தம்/);
    assert.doesNotMatch(out.orderReplyTa as string, /[\u0900-\u097F]/u);
    assert.match(out.orderReplyHi as string, /ऑर्डर संख्या:\s*ORD-5A4305/);
    assert.match(out.orderReplyHi as string, /सेवा:\s*विवाह मिलान/);
    assert.doesNotMatch(out.orderReplyHi as string, /[\u0B80-\u0BFF]/u);
    assert.deepEqual(out.normChecks, {
      ta: 'ta',
      TA: 'ta',
      'ta-IN': 'ta',
      tamil: 'ta',
      taNative: 'ta',
      hi: 'hi',
      'hi-IN': 'hi',
      hindi: 'hi',
      hiNative: 'hi',
      en: 'en',
      invalid: 'en',
    });
    fs.rmSync(OUT, { force: true });
  });
}

if (!process.exitCode) {
  console.log(`\n[OK] ai-astrologer tamil order + repo audit: ${passed} checks passed`);
}
