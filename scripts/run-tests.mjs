import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const testFiles = [
  'tests/remedies.test.ts',
  // Cheap and first on purpose: it fails loudly if the CI security gate is
  // ever unwired, which is otherwise invisible in review.
  'tests/ci-security-gate.test.ts',
  // Also cheap and first: it pins the money paths' ordering of operations
  // (claim the payment intent before inserting order rows) against silent
  // refactors that no runtime test in this sandbox can reach.
  'tests/checkout-idempotency-contract.test.ts',
  // Same reason, money leaving instead of entering: the 90% pre-approval
  // refund, its 3-working-day settlement promise and the refusal to refund an
  // approved (delivered) order must stay identical in the policy engine, the
  // one-click admin handler, the admin portal and the customer-facing page.
  'tests/refund-policy-contract.test.ts',
  // Same policy, but EXECUTED in a real PHP runtime when the optional
  // php-wasm dev dependency is installed (it SKIPs otherwise): the 90% split
  // and the 3-working-day calendar are arithmetic, and arithmetic must be run.
  'tests/refund-policy-php-runtime.test.ts',
  // And the inverse guard: the retired currency/branding must never come back.
  // It scans the shipped tree (frontend, PHP API, fixtures, scripts, CI, docs)
  // and fails with file+line for anything outside the three approved
  // functional occurrences (IANA zone, dial code, birthplace data).
  'tests/retired-branding-guard.test.ts',
  // Executes the backup script against a stubbed mysqldump: proves the marker,
  // the retention rotation and the "a failed dump cannot look like a backup"
  // failure path, none of which a code-reading review would catch.
  'tests/backup-and-health-contract.test.ts',
  // Also early: the render densities (~300 dpi email capture, JPEG 0.95) are a
  // contract. A "performance" commit that lowers them to shave bytes would
  // still pass every other test in this suite.
  'tests/pdf-pipeline-integrity.test.ts',
  // The CDN safety contract: two "dormant" bugs (a cacheable API response and a
  // URL->encoding map without Vary) become customer-visible incidents the moment
  // a shared edge cache sits in front of the origin. It also EXECUTES the
  // real PHP for the client-IP spoofing matrix and the session-cookie Secure
  // flag, so a resolver "simplification" cannot pass by reading plausibly.
  'tests/cloudflare-cdn-contract.test.ts',
  'tests/jathagam-summary-parity.test.ts',
  'tests/namakaran-meanings.test.ts',
  'tests/logo-assets.test.ts',
  'tests/mobile-inputs.test.tsx',
  'tests/birth-details-validation.test.ts',
  'tests/birth-details-edge.test.ts',
  'tests/timezone-offset.test.ts',
  'tests/family-report-tz-staleness.test.ts',
  'tests/family-report-engine-parity.test.ts',
  'tests/astrology-accuracy-regression.test.ts',
  'tests/birth-jathagam-sample.test.ts',
  'tests/node-php-parity.test.ts',
  'tests/astrology-integrity-regression.test.tsx',
  'tests/jathagam-card-rules.test.ts',
  'tests/jathagam-lucky-indicators.test.ts',
  'tests/vimshottari-dasha-timeline.test.ts',
  'tests/dosha-rule-accuracy.test.ts',
  'tests/porutham-reference.test.ts',
  'tests/muhurtham-astronomy-regression.test.ts',
  'tests/sample-engine-meaning.test.ts',
  'tests/report-dob-format.test.ts',
  'tests/ai-astrologer-sources.test.ts',
  'tests/ai-astrologer-knowledge.test.ts',
  'tests/ai-astrologer-report.test.ts',
  'tests/ai-astrologer-access.test.ts',
  'tests/ai-astrologer-report-language.test.ts',
  'tests/ai-astrologer-family-persons.test.ts',
  'tests/ai-astrologer-provider.test.ts',
  'tests/ai-astrologer-consistency.test.ts',
  'tests/ai-astrologer-failure-path.test.ts',
  'tests/ai-astrologer-guided.test.ts',
  'tests/ai-astrologer-guided-focus.test.ts',
  'tests/ai-astrologer-guided-runtime.test.ts',
  'tests/ai-astrologer-service-runtime.test.ts',
  'tests/ai-astrologer-php-runtime.test.ts',
  'tests/jathagam-page2-wiring.test.ts',
  'tests/jathagam-page2-php-parity.test.ts',
  // Deployment-shape contract for the code-split build: the six heavy route
  // chunks must exist inside dist/assets, and the cPanel root folder list must
  // never grow. Runs its built-output checks whenever dist/ is present.
  'tests/dist-shape.test.ts',
  // Lazy route modules must keep exporting the component names App.tsx maps.
  'tests/route-chunk-exports.test.ts',
  'tests/lockfile-drift.test.ts'
];
const tsxCli = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs');

for (const relativeFile of testFiles) {
  console.log(`\n[TEST] ${relativeFile}`);
  const result = spawnSync(
    process.execPath,
    [tsxCli, resolve(projectRoot, relativeFile)],
    { cwd: projectRoot, stdio: 'inherit' }
  );

  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
