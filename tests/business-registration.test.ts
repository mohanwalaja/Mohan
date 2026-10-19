/**
 * ASTRO SIVAM — business identity disclosure guard.
 *
 * THE POLICY (owner's instruction, 15 Oct 2026)
 * --------------------------------------------
 *   • REGISTRATION NUMBER (India, Udyam/MSME `UDYAM-TN-35-0058124`) → printed on
 *     the TAX INVOICE (both layouts) and shown on the CONTACT PAGE. Anywhere
 *     else is a mistake.
 *   • OFFICE ADDRESS → the CONTACT PAGE ONLY. Never on an invoice, never in the
 *     footer, About page, policy pages or the JSON-LD block.
 *
 * WHY THIS TEST EXECUTES THINGS
 * -----------------------------
 * "On the invoice" and "not on the invoice" are claims about the HTML that is
 * actually emitted, so the browser invoice builder is EXECUTED here for both
 * layouts. The server no longer renders invoices (mPDF was retired in Oct 2026);
 * tests/invoice-business-registration.test.php pins the PHP constant instead.
 * A template that retypes the number, drops it, or leaks the street address
 * fails here instead of reaching a customer's receipt.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUSINESS_INFO,
  BUSINESS_REGISTRATION_META,
  BUSINESS_REGISTRATION_SHORT,
  businessRegistrationSentence
} from '../src/data/businessInfo';
import { buildInvoiceHtml, buildFamilyInvoiceHtml } from '../src/services/invoiceHtmlBuilder';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- BUSINESS REGISTRATION (invoice + contact) & OFFICE ADDRESS (contact only) ---');

// ---------------------------------------------------------------------------
// 1. The single source of truth.
// ---------------------------------------------------------------------------

check('the registration number is the India Udyam (MSME) number', () => {
  assert.equal(BUSINESS_INFO.registrationNumber, 'UDYAM-TN-35-0058124');
  assert.match(BUSINESS_INFO.registrationNumber, /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/);
  assert.ok(BUSINESS_INFO.registrationNumber.includes('-TN-'), 'UDYAM-TN-… is the Tamil Nadu block');
  assert.equal(BUSINESS_INFO.country, 'India');
  assert.equal(BUSINESS_INFO.registrationStatus, 'Registered MSME in India');
});

check('the shared helpers label the number for documents and for the site', () => {
  assert.equal(BUSINESS_REGISTRATION_SHORT, 'Udyam Reg. No. UDYAM-TN-35-0058124');
  assert.equal(BUSINESS_REGISTRATION_META, 'Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)');
  const sentence = businessRegistrationSentence();
  assert.ok(sentence.includes('registered in India'), 'the declaration must name the country');
  assert.ok(sentence.includes(BUSINESS_INFO.registrationNumber), 'the declaration must quote the number');
  assert.ok(
    !sentence.includes('Walajapet') && !sentence.includes('632513'),
    'the invoice declaration must NOT contain the office address'
  );
});

check('the office address matches the address supplied by the owner', () => {
  const oneLine = BUSINESS_INFO.officeAddressOneLine;
  for (const fact of ['ASTROSIVAM', 'No 4', 'Thiruttani Thettu Street', 'Kamakshi Puram', 'Walajapet', 'Ranipet', '632513', 'Tamil Nadu', 'India']) {
    assert.ok(oneLine.includes(fact), `the office address must contain "${fact}"`);
  }
  assert.deepEqual(
    [...BUSINESS_INFO.officeAddressLines].slice(0, 2),
    ['ASTROSIVAM', 'No 4 Thiruttani Thettu Street'],
    'the rendered lines keep the postal order'
  );
  assert.ok(BUSINESS_INFO.officeAddressLines.at(-1)!.toUpperCase().includes('INDIA'));
});

// ---------------------------------------------------------------------------
// 2. The invoice PRINTS the number — and never the address.
// ---------------------------------------------------------------------------

const invoiceOrder = (over: Record<string, unknown> = {}) => ({
  id: 'ord-1',
  orderNumber: 'REG-1001',
  userId: 'u1',
  userName: 'Client Name',
  userEmail: 'client@example.com',
  userMobile: '+91 98765 43210',
  serviceType: 'MARRIAGE_COMPATIBILITY',
  language: 'en',
  country: 'India',
  currency: 'INR',
  amount: 2500,
  serviceMode: 'PAID',
  paymentMethod: 'GPAY',
  paymentReference: 'REG-PAY-1',
  status: 'PAID',
  emailStatus: 'SENT',
  emailDeliveryAttempts: 1,
  inputPayload: {},
  hasPdf: true,
  createdAt: new Date('2026-10-02T09:00:00Z').toISOString(),
  ...over
}) as any;

const invoices: Array<[string, string, string[]]> = [
  ['single-order invoice', buildInvoiceHtml(invoiceOrder()), ['INV-REG-1001', 'Client Name']],
  [
    'consolidated family invoice',
    buildFamilyInvoiceHtml(
      [
        invoiceOrder({ id: 'a', orderNumber: 'REG-1001', groupOrderIndex: 0 }),
        invoiceOrder({ id: 'b', orderNumber: 'REG-1002', userName: 'Second Member', serviceType: 'BABY_NAMING', amount: 1500, groupOrderIndex: 1 })
      ],
      'FAM-REG-1'
    ),
    ['INV-FAM-REG-1', 'Client Name', 'Second Member']
  ]
];

const escapedSentence = businessRegistrationSentence()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

for (const [label, html, receiptMarkers] of invoices) {
  check(`${label}: header metadata carries the Udyam registration number`, () => {
    assert.ok(
      html.includes(BUSINESS_REGISTRATION_META),
      `${label} must print "Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)"`
    );
  });

  check(`${label}: declaration certifies the registered Indian entity`, () => {
    assert.ok(html.includes(escapedSentence), `${label} declaration must quote the registration`);
  });

  check(`${label}: never prints the office address or the PIN`, () => {
    assert.ok(!html.includes('Walajapet'), `${label} must not print the office address`);
    assert.ok(!html.includes('632513'), `${label} must not print the PIN`);
    assert.ok(!html.includes('Thiruttani Thettu'), `${label} must not print the street`);
    assert.ok(!html.includes(BUSINESS_INFO.officeAddressOneLine), `${label} must not print the one-line address`);
  });

  check(`${label}: the retired regional placeholder has not returned`, () => {
    assert.ok(!html.includes('ASV-FJ'), 'the stale placeholder must stay removed');
  });

  check(`${label}: still contains the real receipt content`, () => {
    for (const marker of receiptMarkers) {
      assert.ok(html.includes(marker), `${label} must still print "${marker}"`);
    }
  });
}

check('the invoice renderer never retypes the number or the address', () => {
  const source = read('src/services/invoiceHtmlBuilder.ts');
  assert.ok(!source.includes(BUSINESS_INFO.registrationNumber), 'it must read the shared constant');
  assert.match(source, /from '\.\.\/data\/businessInfo'/);
  assert.ok(!source.includes('Walajapet'), 'the address must never be written into the invoice template');
});

// ---------------------------------------------------------------------------
// 3. There is no server-side invoice renderer; the PHP constant is the mirror.
// ---------------------------------------------------------------------------

check('the server-side invoice renderer is gone (invoices are browser-only)', () => {
  assert.ok(
    !fs.existsSync(path.join(projectRoot, 'api/astrology/pdf_mpdf_invoice.php')),
    'api/astrology/pdf_mpdf_invoice.php must stay deleted: PDFs are browser captures now'
  );
  for (const route of [
    'api/admin/index.php'
  ]) {
    const php = read(route);
    assert.ok(!php.includes('generateInvoicePdf'), `${route} must not call a server invoice renderer`);
    assert.ok(!php.includes('generateFamilyInvoicePdf'), `${route} must not call a server family invoice renderer`);
  }
});

check('api/branding.php owns the same number for the PHP runtime', () => {
  const php = read('api/branding.php');
  const match = php.match(/define\(\s*'ASTRO_BUSINESS_REG_NO'\s*,\s*'([^']+)'\s*\)/);
  assert.ok(match, 'ASTRO_BUSINESS_REG_NO must be defined in api/branding.php');
  assert.equal(match![1], BUSINESS_INFO.registrationNumber, 'the frontend and PHP numbers must be identical');
  assert.ok(!php.includes('Walajapet'), 'the PHP side must not carry the office address (Contact page only)');
});

// ---------------------------------------------------------------------------
// 4. The Contact page shows both; nothing else shows the address.
// ---------------------------------------------------------------------------

check('the Contact page renders the office address and the registration from the module', () => {
  const contact = read('src/pages/ContactPage.tsx');
  assert.match(contact, /from '\.\.\/data\/businessInfo'/);
  assert.match(contact, /officeAddressLines/);
  assert.match(contact, /BUSINESS_REGISTRATION_SHORT/);
  assert.ok(!contact.includes(BUSINESS_INFO.registrationNumber), 'the Contact page must not retype the number');
  assert.ok(!contact.includes('Walajapet'), 'the Contact page must not retype the address');
});

check('the footer, About page, policy pages and JSON-LD stay clean of both', () => {
  for (const surface of [
    'src/components/layout/Footer.tsx',
    'src/pages/AboutPage.tsx',
    'src/pages/PoliciesPage.tsx',
    'index.html'
  ]) {
    const source = read(surface);
    assert.ok(!source.includes(BUSINESS_INFO.registrationNumber), `${surface} must not print the number`);
    assert.ok(!/UDYAM/i.test(source), `${surface} must not mention Udyam`);
    assert.ok(!source.includes('Walajapet'), `${surface} must not print the office address`);
    assert.ok(!source.includes('632513'), `${surface} must not print the PIN`);
  }
});

check('the number lives only in the data module, the PHP constant and the invoice/contact renderers', () => {
  // `tests` is skipped: this file must hold the literal to assert the
  // cross-runtime parity (that is the assertion), so it can never be its own
  // offender. The claim being checked is about the SHIPPED tree.
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'docs', 'tests', '__pycache__', '.arena']);
  const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.php', '.json', '.html']);

  const offenders: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
      // Owners of the string: the TS module and its renderer, and the PHP
      // constant file that any future PHP document reads.
      if (['src/data/businessInfo.ts', 'src/pages/ContactPage.tsx', 'api/branding.php'].includes(relative)) continue;
      fs.readFileSync(absolute, 'utf8').split('\n').forEach((line, index) => {
        if (line.includes(BUSINESS_INFO.registrationNumber)) offenders.push(`${relative}:${index + 1}`);
      });
    }
  };
  walk(projectRoot);
  assert.deepEqual(offenders, [], `these lines retype the registration number: ${offenders.join(', ')}`);
});

check('the office address lives only in the data module and the Contact page', () => {
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'docs', 'tests', '__pycache__', '.arena']);
  const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.php', '.json', '.html']);

  // The town name is also real geography and a real verification datum, so a
  // line is only an offence when it is a DISCLOSURE. Two functional shapes are
  // exempt, matched by shape rather than by file (the technique
  // tests/retired-branding-guard.test.ts uses):
  //   • the birthplace picker's place-data row (`latitude: …, longitude: …`) —
  //     a customer born in Walajapet must be able to select it, and
  //   • the ayanamsa doc-block recording the town of the verification chart
  //     (`… IST, Walajapet`), which is an accuracy note, not a disclosure.
  const ADDRESS_MARKERS = ['Walajapet', 'Kamakshi Puram', 'Thiruttani Thettu', '632513'];
  const FUNCTIONAL_PLACE_PATTERNS = [
    /latitude:\s*-?\d+(\.\d+)?\s*,\s*longitude:/,
    /IST,\s*Walajapet/
  ];

  const offenders: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
      if (relative === 'src/data/businessInfo.ts' || relative === 'src/pages/ContactPage.tsx') continue;
      fs.readFileSync(absolute, 'utf8').split('\n').forEach((line, index) => {
        if (FUNCTIONAL_PLACE_PATTERNS.some(pattern => pattern.test(line))) return;
        if (ADDRESS_MARKERS.some(marker => line.includes(marker))) {
          offenders.push(`${relative}:${index + 1}`);
        }
      });
    }
  };
  walk(projectRoot);
  assert.deepEqual(offenders, [], `the office address may only be disclosed on the Contact page: ${offenders.join(', ')}`);
});

console.log(`\n${passed} business-identity checks passed.`);
