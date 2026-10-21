/**
 * ASTRO SIVAM — My Orders cards stay small until the customer asks for more.
 *
 * Owner request (2026-10-21), looking at a phone screenshot of the dashboard:
 * "No need show birth details in this card once the user click on name can
 * expand and show birth details … cards should be smaller less details name and
 * order details when click on it can expand with more detail."
 *
 * A collapsed card is now one line of identity — the order badges and the name —
 * with the birth details and the payment block behind a tap on the name row.
 * The trap this test guards is hiding something the customer must ACT on: a
 * bounced-email warning or a download button buried behind a toggle is a
 * support ticket, not a feature. So the contract is directional:
 *
 *   • the detail blocks live INSIDE the expand-only region,
 *   • the status banner and every button live AFTER it (always visible),
 *   • the toggle is a real button with aria-expanded/aria-controls wired to the
 *     region it opens, per order, so a screen reader and a sighted customer get
 *     the same behaviour.
 *
 * Static on purpose: there is no DOM renderer in this repo's test stack, and the
 * ordering of the regions is exactly the thing a refactor would break.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const checks: Array<[string, () => void]> = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

const src = read('src/pages/CustomerDashboard.tsx');

console.log('--- MY ORDERS: COLLAPSIBLE ORDER CARDS ---');

check('one expansion state per order, collapsed by default', () => {
  assert.match(
    src,
    /const \[expandedOrders, setExpandedOrders\] = useState<Record<string, boolean>>\(\{\}\);/,
    'keyed by order id so opening one card cannot open its neighbours'
  );
  assert.match(src, /setExpandedOrders\(prev => \(\{ \.\.\.prev, \[order\.id\]: !prev\[order\.id\] \}\)\)/,
    'the toggle flips only its own card');
});

check('the toggle is a real button wired to the region it opens', () => {
  assert.match(src, /aria-expanded=\{!!expandedOrders\[order\.id\]\}/, 'state is announced, not implied');
  assert.match(src, /aria-controls=\{`order-details-\$\{order\.id\}`\}/, 'and points at a real region');
  assert.match(src, /id=\{`order-details-\$\{order\.id\}`\}/, 'the region exists to be pointed at');
  assert.match(src, /<ChevronDown className=\{`h-4 w-4 transition-transform/, 'a visible affordance that turns');
  assert.match(src, /\? 'Hide details'/, 'and a label that says what the tap does');
  assert.match(src, /: 'View details'/, 'single order: view details');
  assert.match(src, /isFamily \? 'View names & details'/, 'family: the tap promises the names');
});

check('the collapsed card still names the person', () => {
  const toggleStart = src.indexOf('aria-controls={`order-details-${order.id}`}');
  const regionStart = src.indexOf('{expandedOrders[order.id] && isFamily && (');
  assert.ok(toggleStart > 0 && regionStart > toggleStart, 'the toggle precedes the expand-only region');
  const header = src.slice(toggleStart, regionStart);
  assert.match(header, /: personName\}/, 'a single-person order shows the name while collapsed');
  assert.match(header, /boy\?\.name \|\| 'Groom'/, 'a marriage order shows both names while collapsed');
});

check('birth details and payment info are expand-only', () => {
  const regionStart = src.indexOf('{expandedOrders[order.id] && isFamily && (');
  const bottomRow = src.indexOf('{/* Bottom Row: Delivery Status & Conditional Email Retry */}', regionStart);
  assert.ok(regionStart > 0, 'the expand-only region exists');
  assert.ok(bottomRow > regionStart, 'and it ends before the status row');
  const region = src.slice(regionStart, bottomRow);
  for (const detail of ['User & Birth Details', 'Order & Payment Information', 'Date of Birth:', 'Exact Time:', 'Birth Place:', 'Delivery Email:']) {
    assert.ok(region.includes(detail), `"${detail}" must sit inside the expand-only region`);
  }
  // The name must not be stated twice on one card any more.
  assert.ok(!region.includes('<span>{personName}</span>'), 'the name moved to the collapsed header');
});

check('nothing actionable is hidden behind the toggle', () => {
  const regionStart = src.indexOf('{expandedOrders[order.id] && isFamily && (');
  const bottomRow = src.indexOf('{/* Bottom Row: Delivery Status & Conditional Email Retry */}', regionStart);
  assert.ok(regionStart > 0, 'the expand-only region exists');
  assert.ok(bottomRow > regionStart, 'the status row follows it');
  assert.ok(src.indexOf('{expandedOrders[order.id] && !isFamily && (') > regionStart,
    'the single-order detail columns sit in the same expand-only band');
  // Searched FROM the region onward: the same words also appear in the doc
  // comment at the top of this component, and a whole-file indexOf would find
  // that prose instead of the rendered button.
  for (const actionable of [
    'Email Delivery Failed / Bounced',
    'Report Complete & Emailed',
    'Processing in Vedic Astrology Queue',
    'Update Email & Retry Delivery',
    'data-frozen-download={order.id}',
    'Download Report'
  ]) {
    const at = src.indexOf(actionable, regionStart);
    assert.ok(at > bottomRow, `"${actionable}" must sit after the expand-only region, so it stays visible when the card is collapsed`);
  }
});

check('a family bundle is one card, with names behind the first tap', () => {
  assert.match(src, /const orderGroups = useMemo\(\(\) => \{/, 'orders are grouped before rendering');
  assert.match(src, /const key = entry\.groupId \|\| entry\.id;/, 'grouped by group_id, singletons by their own id');
  assert.match(src, /\{orderGroups\.map\(members => \{/, 'the list renders one card per group');
  assert.match(src, /key=\{order\.groupId \|\| order\.id\}/, 'and the card is keyed by the group, not by one chart');
  assert.match(src, /\{members\.length\} charts · one order/, 'the collapsed card says how many charts are inside');
  assert.match(src, /\$\{personName\} \+ \$\{members\.length - 1\} more/, 'and who the first one belongs to');
});

check('inside the family card, a tap on a name opens that person only', () => {
  assert.match(src, /const \[expandedPersons, setExpandedPersons\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(src, /aria-controls=\{`person-details-\$\{member\.id\}`\}/);
  assert.match(src, /id=\{`person-details-\$\{member\.id\}`\}/);
  assert.match(src, /setExpandedPersons\(prev => \(\{ \.\.\.prev, \[member\.id\]: !prev\[member\.id\] \}\)\)/,
    'opening one person cannot open a sibling');
  const familyStart = src.indexOf('{expandedOrders[order.id] && isFamily && (');
  const singleStart = src.indexOf('{expandedOrders[order.id] && !isFamily && (');
  assert.ok(familyStart > 0 && singleStart > familyStart, 'both card shapes exist, family first');
  for (const detail of ['Date of Birth:', 'Exact Time:', 'Birth Place:']) {
    assert.ok(src.indexOf(detail, familyStart) > familyStart, `the family card carries "${detail}" behind the name tap`);
    assert.ok(src.indexOf(detail, singleStart) > singleStart, `and the single-order card still carries it`);
  }
});

check('every delivered chart keeps its own download on the family card', () => {
  assert.match(src, /members\.filter\(m => memberDone\(m\) && m\.hasPdf\)\.map\(downloadOrder => \{ const order = downloadOrder; return \(/,
    'the tested download block is re-bound per delivered member, not copied');
  assert.match(src, /key=\{`download-\$\{order\.id\}`\}/, 'one block per member, keyed');
});

check('one status banner per family card, reporting the member that needs action', () => {
  assert.match(src, /const bannerOrder = !isFamily/, 'a single order reports itself');
  assert.match(src, /members\.find\(m => m\.emailStatus === 'FAILED'\)/, 'a bounced email wins over completed siblings');
  assert.match(src, /\{bannerOrder\.emailStatus === 'FAILED' \? \(/, 'the banner reads the chosen member');
  assert.match(src, /handleOpenResendModal\(bannerOrder\)/, 'and the retry acts on that same member');
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

if (failures > 0) {
  console.error(`\norder-card-collapse: ${failures} failing check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\norder-card-collapse: all ${checks.length} checks passed`);
}
