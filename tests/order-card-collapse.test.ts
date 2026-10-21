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
  assert.match(src, /Hide details' : 'View details'/, 'and a label that says what the tap does');
});

check('the collapsed card still names the person', () => {
  const toggleStart = src.indexOf('aria-controls={`order-details-${order.id}`}');
  const regionStart = src.indexOf('{expandedOrders[order.id] && (');
  assert.ok(toggleStart > 0 && regionStart > toggleStart, 'the toggle precedes the expand-only region');
  const header = src.slice(toggleStart, regionStart);
  assert.match(header, /: personName\}/, 'a single-person order shows the name while collapsed');
  assert.match(header, /boy\?\.name \|\| 'Groom'/, 'a marriage order shows both names while collapsed');
});

check('birth details and payment info are expand-only', () => {
  const regionStart = src.indexOf('{expandedOrders[order.id] && (');
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
  const regionStart = src.indexOf('{expandedOrders[order.id] && (');
  const bottomRow = src.indexOf('{/* Bottom Row: Delivery Status & Conditional Email Retry */}', regionStart);
  assert.ok(regionStart > 0, 'the expand-only region exists');
  assert.ok(bottomRow > regionStart, 'the status row follows it');
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
