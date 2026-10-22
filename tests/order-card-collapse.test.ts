/**
 * Customer My Orders keeps the admin panel's compact order / name / payment /
 * action layout, without inheriting admin controls. The existing per-order and
 * per-person expand behaviour and the frozen-report download gates are part of
 * the UI contract; the only regular download control is an icon to the right
 * of the name of the report being downloaded.
 *
 * Static on purpose: these checks pin the JSX ordering and event wiring even
 * when a browser is unavailable in the build environment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/pages/CustomerDashboard.tsx'), 'utf8');
const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

const summaryStart = src.indexOf('{/* Admin-style order summary:');
const familyStart = src.indexOf('{expandedOrders[order.id] && isFamily && (');
const singleStart = src.indexOf('{expandedOrders[order.id] && !isFamily && (');
const statusStart = src.indexOf('{/* Bottom Row: Delivery Status & Conditional Email Retry */}', singleStart);
const feedbackStart = src.indexOf('{/* Feedback and the Safari save link survive collapsing the card. */}', statusStart);
const reviewStart = src.indexOf('{/* Verified Review Section */}', feedbackStart);

console.log('--- MY ORDERS: ADMIN-STYLE COLLAPSIBLE CARDS ---');

check('one compact, responsive summary per order, not a second row of actions', () => {
  assert.ok(summaryStart > 0 && familyStart > summaryStart, 'summary precedes the optional detail region');
  const summary = src.slice(summaryStart, familyStart);
  assert.match(summary, /lg:grid-cols-12/, 'desktop uses the admin-style order row');
  assert.match(summary, /lg:col-span-3/, 'order number, language and date have their own column');
  assert.match(summary, /lg:col-span-4/, 'name and service have their own column');
  assert.match(summary, /lg:col-span-5/, 'payment, status and View details finish the row');
  assert.match(summary, /\{getLangBadge\(\)\}/);
  assert.match(summary, /\{orderPersonLabel\}/, 'the recipient is visible while collapsed');
  assert.match(src, /\$\{personName\} \+ \$\{members\.length - 1\} more/, 'a family stays one card');
  assert.match(src, /\$\{boy\?\.name \|\| 'Groom'\} & \$\{girl\?\.name \|\| 'Bride'\}/,
    'wedding orders still show both names while collapsed');
});

check('the name and View details both toggle only their own order accessibly', () => {
  assert.match(src, /const \[expandedOrders, setExpandedOrders\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(src, /setExpandedOrders\(prev => \(\{ \.\.\.prev, \[order\.id\]: !prev\[order\.id\] \}\)\)/);
  const summary = src.slice(summaryStart, familyStart);
  assert.match(summary, /aria-label=\{`View details for \$\{orderPersonLabel\}`\}/,
    'clicking the name still expands its order without activating the adjacent download icon');
  assert.match(summary, /aria-expanded=\{!!expandedOrders\[order\.id\]\}/);
  assert.match(summary, /aria-controls=\{`order-details-\$\{order\.id\}`\}/);
  assert.match(src, /id=\{`order-details-\$\{order\.id\}`\}/);
  assert.match(summary, /\? 'Hide details' : isFamily \? `\$\{members\.length\} Charts`/);
  assert.match(summary, /: 'View details'/);
  assert.match(summary, /<ChevronDown className=\{`h-4 w-4 transition-transform/);
});

check('only a frozen, delivered single report gets the icon by its summary name', () => {
  const summary = src.slice(summaryStart, familyStart);
  assert.match(src, /const singleReportReady = !isFamily && !order\.items\?\.length\s*&& memberDone\(order\) && order\.hasPdf && order\.hasReportSnapshot !== false;/,
    'a multi-person order cannot show a misleading single-file icon beside the account holder');
  const namePanel = summary.slice(summary.indexOf('{/* Only the report download icon'), summary.indexOf('grid-cols-[minmax(0,1fr)_auto]'));
  assert.match(namePanel, /\{singleReportReady && \(/);
  assert.match(namePanel, /onClick=\{\(\) => handleDownloadReport\(order\)\}/);
  assert.match(namePanel, /aria-label=\{downloadingKey === order\.id \? 'Downloading…' : `Download Report — \$\{orderPersonLabel\}`\}/);
  assert.match(namePanel, /h-9 w-9 shrink-0/, 'the control is an icon, not a full-width CTA');
  assert.doesNotMatch(namePanel, />Download (PDF|Report)</, 'no download text is printed beside the icon');
});

check('birth details and payment details are still behind View details', () => {
  assert.ok(familyStart > 0 && singleStart > familyStart && statusStart > singleStart);
  const expanded = src.slice(familyStart, statusStart);
  for (const detail of ['User & Birth Details', 'Order & Payment Information', 'Date of Birth:', 'Exact Time:', 'Birth Place:', 'Delivery Email:']) {
    assert.ok(expanded.includes(detail), `"${detail}" still lives in expanded details`);
  }
});

check('family names each expand independently, with one icon at the far right', () => {
  assert.match(src, /const orderGroups = useMemo\(\(\) => \{/);
  assert.match(src, /const key = entry\.groupId \|\| entry\.id;/);
  assert.match(src, /\{orderGroups\.map\(members => \{/);
  assert.match(src, /key=\{order\.groupId \|\| order\.id\}/);
  assert.match(src, /const \[expandedPersons, setExpandedPersons\] = useState<Record<string, boolean>>\(\{\}\);/);
  const family = src.slice(familyStart, singleStart);
  assert.match(family, /setExpandedPersons\(prev => \(\{ \.\.\.prev, \[member\.id\]: !prev\[member\.id\] \}\)\)/);
  assert.match(family, /aria-controls=\{`person-details-\$\{member\.id\}`\}/);
  assert.match(family, /id=\{`person-details-\$\{member\.id\}`\}/);
  assert.match(family, /const \{ item: mItem, key: mKey \} = memberDownload\(member\);/);
  assert.match(family, /\{memberDone\(member\) && member\.hasPdf && mReady && \(/);
  assert.match(family, /onClick=\{\(\) => handleDownloadReport\(member, mItem\)\}/);
  assert.match(family, /aria-label=\{mBusy \? 'Downloading…' : `Download Report — \$\{mName\}`\}/);
  assert.doesNotMatch(family, />Download PDF</, 'family member rows show only an icon');
});

check('multi-person items each have their own eligible icon beside their name', () => {
  const multi = src.slice(src.indexOf('{/* Multi-person reports:', singleStart), statusStart);
  assert.match(multi, /\{\(order\.items \|\| \[\]\)\.map\(item => \{/);
  assert.match(multi, /const itemReady = memberDone\(order\) && order\.hasPdf\s*&& item\.reportStatus === 'SENT' && item\.hasReportSnapshot !== false;/);
  assert.match(multi, /\{item\.personName \|\| 'Report'\}/);
  assert.match(multi, /onClick=\{\(\) => handleDownloadReport\(order, item\)\}/);
  assert.match(multi, /aria-label=\{downloadingKey === itemKey \? 'Downloading…' : `Download Report — \$\{item\.personName \|\| 'report'\}`\}/);
  assert.doesNotMatch(multi, />Download Report</, 'no second, labelled download button');
});

check('delivery warnings, resend and chat remain visible when collapsed', () => {
  assert.ok(feedbackStart > statusStart && reviewStart > feedbackStart);
  const status = src.slice(statusStart, feedbackStart);
  for (const actionable of ['Email Delivery Failed / Bounced', 'Report Complete & Emailed', 'Processing in Vedic Astrology Queue', 'Update Email & Retry Delivery', 'Ask Astrologer']) {
    assert.ok(status.includes(actionable), `"${actionable}" must not hide behind View details`);
  }
  assert.match(status, /handleOpenResendModal\(bannerOrder\)/, 'the same member with a bounced email is the retry target');
  assert.doesNotMatch(status, /expandedOrders\[order\.id\]/);
});

check('only download feedback and the real Safari save link remain in the footer', () => {
  assert.match(src, /const downloadableMembers = members\.filter\(m => memberDone\(m\) && m\.hasPdf\);/);
  assert.match(src, /const downloadBandOpen = !!expandedOrders\[order\.id\]/);
  for (const state of [
    "downloadTouchedMember(downloadingKey ? downloadingKey.split(':')[0] : '')",
    'downloadTouchedMember(downloadFeedback?.orderId)',
    'downloadTouchedMember(savedReport?.orderId)'
  ]) assert.ok(src.includes(state), `${state} keeps the outcome visible`);
  const footer = src.slice(feedbackStart, reviewStart);
  assert.match(footer, /downloadableMembers\.map\(downloadOrder => \{/);
  assert.match(footer, /key=\{`download-\$\{order\.id\}`\}/);
  assert.match(footer, /data-saved-report=\{order\.id\}/);
  assert.match(footer, /<span>Save the PDF<\/span>/);
  assert.doesNotMatch(footer, /onClick=\{\(\) => handleDownloadReport/, 'no duplicate download buttons in the footer');
});

check('family summary shows the bundle amount, not only the first free chart', () => {
  assert.match(src, /const totalAmount = members\.reduce\(\(sum, member\) => sum \+ \(Number\(member\.amount\) \|\| 0\), 0\);/);
  assert.match(src, /const isFree = totalAmount === 0 && members\.every\(member => member\.serviceMode === 'FREE_BETA'\);/);
  assert.match(src.slice(summaryStart, familyStart), /totalAmount\.toFixed\(2\)/);
});

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

if (failures) {
  console.error(`\norder-card-collapse: ${failures} failing check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\norder-card-collapse: all ${checks.length} checks passed`);
}
