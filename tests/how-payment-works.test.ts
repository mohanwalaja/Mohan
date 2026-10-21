/**
 * ASTRO SIVAM — "How payment works": the trust popup at payment time.
 *
 * Owner request (2026-10-22): customers abroad read a USD price and stall —
 * "how I pay USD, maybe they from Australia using Australia dollars or New
 * Zealand or Canada … need to explain the users that PayPal will accept the
 * money by card any currency … create a trust regarding payment system. In
 * payment time can add how the payment works, if the user click that can open
 * popup … after reading user can click the close button in top right. After
 * can continue for payment."
 *
 * Pinned here, because none of this would fail another test:
 *   1. the popup explains OWN-currency billing with real examples (AUD, NZD,
 *      CAD …) and that the converted amount is shown BEFORE approval;
 *   2. it says any PayPal-enabled card works and no PayPal account is needed;
 *   3. it says card details never touch our site;
 *   4. the close button is in the TOP RIGHT (and Escape / backdrop close too),
 *      with a continue-to-payment action after reading;
 *   5. the trigger is wired into EVERY payment surface (single service,
 *      family/unified checkout, family cart) and can never submit the form or
 *      open by itself — reading is optional, paying is never blocked.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const modal = read('src/components/cart/HowPaymentWorksModal.tsx');

console.log('--- PAYMENT: HOW-IT-WORKS TRUST POPUP ---');

check('the popup explains own-currency billing with real currencies', () => {
  assert.match(modal, /You pay in YOUR currency, from any country/);
  for (const currency of ['Australian dollars', 'New Zealand dollars', 'Canadian dollars', 'euros', 'pounds']) {
    assert.ok(modal.includes(currency), `the explainer names ${currency} so no customer feels excluded`);
  }
  assert.match(modal, /at their own exchange rate/, 'the conversion is attributed to PayPal / the card networks');
  assert.match(modal, /BEFORE you approve it/, 'and the customer sees the converted amount before approving');
});

check('the popup builds trust: cards without PayPal, and card safety', () => {
  assert.match(modal, /no PayPal account needed/i);
  assert.match(modal, /VISA, Mastercard, American Express, Discover/);
  assert.match(modal, /Your card details never touch our site/);
  assert.match(modal, /never your card number, CVV or password/);
  assert.match(modal, /90% is\s*\n?\s*refunded to your payment method within 3 working days/,
    'the refund promise repeats the site-wide policy, not a new one');
});

check('the close button is top right, with escape and backdrop as backups', () => {
  assert.match(modal, /data-testid="how-payment-works-close"/);
  assert.match(modal, /absolute right-3 top-3/, 'top right, exactly as the owner described');
  assert.match(modal, /aria-label="Close"/);
  assert.match(modal, /event\.key === 'Escape'/, 'escape closes it too');
  assert.match(modal, /onClick=\{\(\) => setOpen\(false\)\}\s*\n\s*>\s*\n\s*<div\s*\n\s*className="relative/,
    'a backdrop tap closes it while clicks inside do not');
  assert.match(modal, /Got it — continue to payment/, 'and reading ends with a way back to paying');
});

check('the trigger can never submit a form or open by itself', () => {
  assert.match(modal, /data-testid="how-payment-works-trigger"/);
  assert.match(modal, /<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setOpen\(true\)\}/,
    'the trigger is an explicit type="button" inside checkout forms');
  assert.match(modal, /const \[open, setOpen\] = useState\(false\);/, 'closed until the customer asks');
  // Every button in the component declares its type, so none can submit.
  const buttons = (modal.match(/<button/g) || []).length;
  const typed = (modal.match(/type="button"/g) || []).length;
  assert.equal(buttons, typed, `all ${buttons} buttons are type="button"`);
  assert.match(modal, /createPortal\(/, 'portalled out of transformed drawers and modals');
  assert.match(modal, /z-\[70\]/, 'and stacked above the z-50 checkout overlays');
});

check('every payment surface offers the explainer', () => {
  for (const surface of [
    'src/components/cart/SingleServiceCheckoutModal.tsx',
    'src/components/cart/UnifiedCheckoutModal.tsx',
    'src/components/cart/FamilyCartDrawer.tsx'
  ]) {
    const src = read(surface);
    assert.match(src, /import \{ HowPaymentWorksModal \} from '\.\/HowPaymentWorksModal';/, `${surface} imports it`);
    assert.match(src, /<HowPaymentWorksModal \/>/, `${surface} renders the trigger`);
  }
  // The single-service trigger sits in the PAID card only: free-beta orders
  // never show payment copy they do not need.
  const single = read('src/components/cart/SingleServiceCheckoutModal.tsx');
  const paidCard = single.indexOf('/* Paid Options Card */');
  const trigger = single.indexOf('<HowPaymentWorksModal />');
  assert.ok(paidCard > 0 && trigger > paidCard, 'the trigger lives inside the paid-options card');
});

console.log(`\nHow-payment-works contract passed (${passed} checks).`);
