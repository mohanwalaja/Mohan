/**
 * ASTRO SIVAM — the download progress label is customer-facing copy.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * A download is a download: the customer pressed "Download Report" (dashboard)
 * or "Download PDF" (live/sample preview) and the only correct status is
 * "Downloading…". The old labels described the internal mechanism instead —
 * "Preparing…", "Rendering sample PDF…", "Preparing the report you see above at
 * print resolution…" — which reads like the system is generating a different
 * document rather than handing over the one on screen.
 *
 * These are single, short strings in three components; a refactor that swaps a
 * button label back to "Rendering…" would look harmless and never fail another
 * test. So the exact copy is pinned here:
 *
 *   * user profile (CustomerDashboard) → "Downloading…"
 *   * live preview + public sample (LivePdfPreviewModal) → "Downloading…"
 *     with a "Downloading the …" note in the progress banner
 *   * order modal (OrderReportModal) → "Downloading PDF..."
 *
 * The work itself is unchanged: the same print-profile capture, served through
 * the deferred engine loader.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const dashboard = read('src/pages/CustomerDashboard.tsx');
const previewModal = read('src/components/common/LivePdfPreviewModal.tsx');
const orderModal = read('src/components/common/OrderReportModal.tsx');
const sampleButton = read('src/components/common/SampleReportButton.tsx');

console.log('--- DOWNLOAD PROGRESS LABELS ---');

check('the profile’s icon-only downloads announce “Downloading…” while busy', () => {
  // Buttons moved beside the person/report names; the loading label is now
  // the accessible name and the visible affordance is a spinning icon.
  assert.match(dashboard, /const itemKey = `\$\{order\.id\}:\$\{item\.id\}`;/);
  assert.match(dashboard, /aria-label=\{downloadingKey === itemKey \? 'Downloading…' : `Download Report — \$\{item\.personName \|\| 'report'\}`\}/,
    'each multi-person item announces its own busy state');
  assert.match(dashboard, /aria-label=\{downloadingKey === order\.id \? 'Downloading…' : `Download Report — \$\{orderPersonLabel\}`\}/,
    'the single order also announces its busy state');
  assert.match(dashboard, /aria-label=\{mBusy \? 'Downloading…' : `Download Report — \$\{mName\}`\}/,
    'each family chart announces its busy state');
  assert.match(dashboard, /downloadingKey === itemKey\s*\? <Loader2 className="h-4 w-4 animate-spin"/,
    'the item icon visibly spins while downloading');
  assert.doesNotMatch(dashboard, /downloadingKey === [^?]+\? 'Preparing…'/,
    'no download button may say “Preparing…” any more');
});

check('the preview / sample-preview button says "Downloading…"', () => {
  assert.match(
    previewModal,
    /<span>\{isDownloading \? 'Downloading…' : 'Download PDF \(exactly this preview\)'\}<\/span>/,
    'the preview download button must show "Downloading…" for paid and sample previews alike'
  );
  for (const old of ['Rendering sample PDF', 'Rendering print-quality PDF', 'Preparing the sample report']) {
    assert.ok(
      !previewModal.includes(old),
      `the preview must not describe the download as "${old}"`
    );
  }
});

check('all public sample buttons say "Downloading" while the sample loads', () => {
  assert.match(sampleButton, /loadingLabel = 'Downloading sample…'/);
  assert.match(sampleButton, /Downloading the sample viewer…/);
  assert.match(sampleButton, /aria-label="Downloading sample report"/);
  assert.doesNotMatch(sampleButton, /Preparing sample|Preparing the sample viewer/);
});

check('the sample preview progress banner says it is downloading', () => {
  const handler = previewModal.slice(previewModal.indexOf('const handleDownload'), previewModal.indexOf('const getLivePreviewPages'));
  assert.match(
    handler,
    /'Downloading the sample report — this takes a few seconds…'/,
    'sample mode must announce a download'
  );
  assert.match(
    handler,
    /'Downloading the report you see above — this takes a few seconds…'/,
    'the paid preview must announce a download'
  );
  assert.doesNotMatch(
    handler,
    /setDownloadNote\((?:sampleMode\s*\n?\s*\??|sampleMode \?)?\s*'Preparing/,
    'the progress banner must not say "Preparing"'
  );
});

check('the order-modal download buttons say "Downloading", not "Preparing"', () => {
  assert.match(
    orderModal,
    /\{isDownloading \? 'Downloading PDF\.\.\.' : `Download /,
    'the order-modal report download must say "Downloading PDF..."'
  );
  assert.ok(!orderModal.includes("'Preparing PDF...'"), 'the old "Preparing PDF..." label must stay deleted');
});

check('the progress label does not promise a different document', () => {
  // The whole point: the file the customer receives is the one on screen.
  // While it downloads, nothing in the label may suggest it is being generated
  // (rendered) again.
  const downloadMessages = [
    ...dashboard.matchAll(/downloadingKey === [^?]+\? '([^']+)'/g),
    ...previewModal.matchAll(/isDownloading \? '([^']+)'/g),
    ...orderModal.matchAll(/isDownloading \? '([^']+)'/g)
  ].map(match => match[1]);
  assert.ok(downloadMessages.length >= 4, `expected every busy label to be found (found ${downloadMessages.length})`);
  for (const message of downloadMessages) {
    assert.match(message, /^Downloading/, `busy download label must start with "Downloading": "${message}"`);
    assert.doesNotMatch(message, /Rendering|Preparing/i, `busy download label must not say "${message}"`);
  }
});

console.log(`\nDownload progress labels passed (${passed} checks).\n`);
