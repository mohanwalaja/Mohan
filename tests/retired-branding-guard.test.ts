/**
 * ASTRO SIVAM — retired-branding guard (repo-wide, executed, not read).
 *
 * WHY THIS EXISTS: the site used to price orders in a regional currency that it
 * no longer offers, and the area it used to market to left a trail of labels,
 * defaults and identifiers through the frontend, the PHP API, the fixtures, the
 * scripts, the CI workflow and the docs. Removing all of it was a deliberate
 * product decision (the two supported currencies are INR and USD, and no country
 * is ever assumed), so re-introducing a single mention — a copy-pasted label, a
 * `DEFAULT 'X'` column, a fixture that quietly comes back — must fail the suite
 * instead of shipping.
 *
 * The two retired tokens are assembled from character codes on purpose: this
 * guard lives in the very tree it audits, so it must contain no reference of its
 * own. The only accepted occurrences are the four approved FUNCTIONAL places,
 * each matched by shape:
 *
 *   • the IANA time-zone identifier used by the astrology engine,
 *   • the dial-code entry used to normalise chat-alert phone numbers,
 *   • the birthplace rows used by the location picker (real geography a customer
 *     born there needs to be able to select),
 *
 * Anything else — a comment, a label, a column default, a fixture, a doc line —
 * fails with the exact file and line.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Assembled so the guard does not itself contain the tokens it searches for.
const RETIRED_CURRENCY = String.fromCharCode(70, 74, 68); // three-letter code
const RETIRED_BRAND = String.fromCharCode(70, 105, 106, 105); // four-letter brand
const NEEDLES = [
  { label: 'retired currency code', value: RETIRED_CURRENCY },
  { label: 'retired brand name', value: RETIRED_BRAND }
].map(entry => ({ ...entry, pattern: new RegExp(entry.value, 'gi') }));

/** Directories that are generated, vendored or not part of the shipped tree. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '__pycache__', '.arena']);
/** Only text files can hold a branding claim; binaries (fonts, audio) are skipped. */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.php', '.sql',
  '.md', '.yml', '.yaml', '.sh', '.html', '.css', '.txt', '.htaccess'
]);

/**
 * The approved functional occurrences, matched by shape rather than by file:
 * an IANA time-zone id, the dial-code map entry, and the birthplace rows /
 * place-data heuristic of the location picker.
 */
const APPROVED_PATTERNS = [
  new RegExp(`Pacific/${RETIRED_BRAND}`), // IANA time zone
  new RegExp(`'${RETIRED_BRAND}'\\s*=>\\s*'679'`, 'i'), // dial code map
  new RegExp(`name:\\s*'${RETIRED_BRAND}'`, 'i'), // birthplace data
  new RegExp(`includes\\('${RETIRED_BRAND}'\\)`, 'i') // place-data heuristic
];

interface Offence {
  file: string;
  line: number;
  label: string;
  text: string;
}

function* walk(directory: string): Generator<string> {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(directory, entry.name));
      continue;
    }
    const extension = path.extname(entry.name);
    if (!TEXT_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(entry.name)) continue;
    yield path.join(directory, entry.name);
  }
}

const offences: Offence[] = [];
let scanned = 0;

for (const absolute of walk(projectRoot)) {
  const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
  let source: string;
  try {
    source = fs.readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  scanned += 1;
  source.split('\n').forEach((line, index) => {
    for (const needle of NEEDLES) {
      needle.pattern.lastIndex = 0;
      if (!needle.pattern.test(line)) continue;
      if (APPROVED_PATTERNS.some(pattern => pattern.test(line))) continue;
      offences.push({ file: relative, line: index + 1, label: needle.label, text: line.trim() });
    }
  });
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- RETIRED BRANDING GUARD ---');

check('the scan actually covers the shipped tree (frontend, PHP API, tests, scripts, CI, docs)', () => {
  const covered = new Set(offences.map(offence => offence.file));
  assert.ok(scanned > 200, `the guard must scan the repository, not a stub (scanned ${scanned} text files)`);
  for (const expected of [
    'src/services/pricing.ts',
    'api/refunds.php',
    'api/payments.php',
    'api/schema.sql',
    'tests/refund-policy-contract.test.ts',
    'scripts/run-tests.mjs',
    '.github/workflows/tests.yml',
    'docs/REFUND_POLICY_AND_ONE_CLICK_REFUND.md'
  ]) {
    assert.ok(fs.existsSync(path.join(projectRoot, expected)), `${expected} must exist to be scanned`);
    assert.ok(!covered.has(expected), `${expected} must be free of retired branding`);
  }
});

check('exactly the two supported currencies are offered', () => {
  const pricing = fs.readFileSync(path.join(projectRoot, 'src/services/pricing.ts'), 'utf8');
  assert.match(pricing, /ALL_CURRENCIES: CurrencyCode\[\] = \['INR', 'USD'\]/, 'the currency list must be INR + USD only');
  assert.doesNotMatch(pricing, new RegExp(RETIRED_CURRENCY, 'i'), 'the retired currency must not be offered');
});

check('no retired branding survives anywhere in the shipped tree', () => {
  const report = offences
    .slice(0, 25)
    .map(offence => `  ${offence.file}:${offence.line} [${offence.label}] ${offence.text}`)
    .join('\n');
  assert.equal(
    offences.length,
    0,
    `${offences.length} retired-branding reference(s) found — the only allowed places are the IANA time-zone id, the dial-code map and the birthplace data:\n${report}`
  );
});

console.log(`\n${passed} retired-branding guard checks passed (${scanned} files scanned, ${offences.length} offences).`);
