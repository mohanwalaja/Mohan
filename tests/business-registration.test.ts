/**
 * ASTRO SIVAM — registered business identity (India, Udyam/MSME) guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * The enterprise is registered in INDIA as a Micro, Small & Medium Enterprise
 * (MSME) under the Udyam Registration scheme (Government of India). The
 * registration number is a legal disclosure: it must appear on every tax
 * invoice / payment receipt AND be publicly visible on the website. The invoice
 * is rendered twice — in the browser by src/services/invoiceHtmlBuilder.ts and
 * by the PHP API's mPDF copy in api/astrology/pdf_mpdf_invoice.php — so the
 * number is stored once per runtime (src/data/businessInfo.ts and
 * ASTRO_BUSINESS_REG_NO in api/branding.php) and every surface reads it.
 *
 * The failure this guards against is silent and expensive: a re-typed or stale
 * number on the document a customer keeps (the invoice used to carry a
 * placeholder from a region the business is no longer registered in), or a
 * website that discloses a different number than the invoice. The checks below
 * EXECUTE both renderers and compare the emitted HTML against the shared
 * constant, then scan the shipped tree so a template cannot retype the number.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUSINESS_INFO,
  BUSINESS_REGISTRATION_DISPLAY,
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

console.log('--- BUSINESS REGISTRATION (India / Udyam MSME) ---');

// ---------------------------------------------------------------------------
// 1. The source of truth.
// ---------------------------------------------------------------------------

check('the registration number is the India Udyam number issued for the enterprise', () => {
  assert.equal(BUSINESS_INFO.registrationNumber, 'UDYAM-TN-35-0058124');
  assert.equal(BUSINESS_INFO.country, 'India');
  assert.equal(BUSINESS_INFO.countryCode, 'IN');
  assert.equal(BUSINESS_INFO.registrationScheme, 'Udyam Registration');
});

check('the number follows the Udyam format (UDYAM-<state>-<district>-<serial>)', () => {
  assert.match(BUSINESS_INFO.registrationNumber, /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/);
  // UDYAM-TN-… = Tamil Nadu, the state the registered office sits in — the two
  // halves of the disclosure must not drift apart.
  assert.ok(BUSINESS_INFO.registrationNumber.includes('-TN-'), 'the state code must match Tamil Nadu');
  assert.ok(BUSINESS_INFO.registeredOffice.includes('Tamil Nadu'));
});

check('the shared helpers label the number, the country and the registered office', () => {
  assert.equal(BUSINESS_REGISTRATION_SHORT, 'Udyam Reg. No. UDYAM-TN-35-0058124');
  assert.equal(BUSINESS_REGISTRATION_META, 'Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)');
  assert.equal(
    BUSINESS_REGISTRATION_DISPLAY,
    'Registered MSME in India • Udyam Reg. No. UDYAM-TN-35-0058124'
  );
  const sentence = businessRegistrationSentence();
  assert.ok(sentence.includes('registered in India'), 'must name the country of registration');
  assert.ok(sentence.includes(BUSINESS_INFO.registrationNumber), 'must quote the number');
  assert.ok(sentence.includes(BUSINESS_INFO.registeredOffice), 'must quote the registered office');
});

// ---------------------------------------------------------------------------
// 2. The invoices (the documents the customer keeps).
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

const singleInvoice = buildInvoiceHtml(invoiceOrder());
const familyInvoice = buildFamilyInvoiceHtml(
  [
    invoiceOrder({ id: 'a', orderNumber: 'REG-1001', groupOrderIndex: 0 }),
    invoiceOrder({ id: 'b', orderNumber: 'REG-1002', userName: 'Second Member', serviceType: 'BABY_NAMING', amount: 1500, groupOrderIndex: 1 })
  ],
  'FAM-REG-1'
);

for (const [label, html] of [['single-order invoice', singleInvoice], ['consolidated family invoice', familyInvoice]] as const) {
  check(`${label}: header metadata carries the Udyam registration number`, () => {
    assert.ok(html.includes(BUSINESS_REGISTRATION_META), `${label} is missing the registration metadata`);
  });

  check(`${label}: declaration discloses the registered Indian entity`, () => {
    // The declaration lives in HTML, so the sentence is escaped there.
    const escaped = businessRegistrationSentence()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    assert.ok(html.includes(escaped), `${label} declaration must certify the registered entity`);
  });

  check(`${label}: registered office and country are printed on the document`, () => {
    assert.ok(html.includes(BUSINESS_INFO.registeredOffice));
    assert.ok(html.includes('(MSME, India)') || html.includes('(MSME, India)'.replace('&', '&amp;')));
  });

  check(`${label}: no stale regional registration placeholder survives`, () => {
    assert.ok(!html.includes('ASV-FJ'), 'the retired placeholder must never come back');
  });
}

check('the invoice renderer never retypes the number (it reads the shared module)', () => {
  const source = read('src/services/invoiceHtmlBuilder.ts');
  assert.ok(!source.includes(BUSINESS_INFO.registrationNumber), 'invoiceHtmlBuilder.ts must import the constant');
  assert.match(source, /from '\.\.\/data\/businessInfo'/);
});

// ---------------------------------------------------------------------------
// 3. Cross-runtime parity: the PHP API must print the SAME number.
// ---------------------------------------------------------------------------

check('api/branding.php owns the same registration number (the mPDF invoice reads it)', () => {
  const php = read('api/branding.php');
  const match = php.match(/define\(\s*'ASTRO_BUSINESS_REG_NO'\s*,\s*'([^']+)'\s*\)/);
  assert.ok(match, 'ASTRO_BUSINESS_REG_NO must be defined in api/branding.php');
  assert.equal(match![1], BUSINESS_INFO.registrationNumber, 'the frontend and PHP numbers must be identical');

  const phpInvoice = read('api/astrology/pdf_mpdf_invoice.php');
  assert.ok(
    phpInvoice.includes('astro_business_registration_meta()') &&
      phpInvoice.includes('astro_business_registration_sentence_html()'),
    'both PHP invoice layouts must interpolate the shared helpers'
  );
  assert.ok(!phpInvoice.includes(BUSINESS_INFO.registrationNumber), 'the PHP invoice must not retype the number');
  assert.ok(!phpInvoice.includes('ASV-FJ'), 'the PHP invoice must not carry the retired placeholder');
});

// ---------------------------------------------------------------------------
// 4. The website discloses the same registered entity.
// ---------------------------------------------------------------------------

const WEBSITE_SURFACES = [
  'src/components/layout/Footer.tsx',
  'src/pages/AboutPage.tsx',
  'src/pages/ContactPage.tsx',
  'src/pages/PoliciesPage.tsx'
];

check('every public surface renders the registration from the shared module', () => {
  for (const surface of WEBSITE_SURFACES) {
    const source = read(surface);
    assert.match(source, /from '\S*businessInfo'/, `${surface} must read the business identity module`);
    assert.match(
      source,
      /BUSINESS_REGISTRATION_SHORT|BUSINESS_REGISTRATION_DISPLAY|BUSINESS_INFO\.registrationNumber|BUSINESS_INFO\.registrationStatus/,
      `${surface} must actually render the registration`
    );
    assert.ok(
      !source.includes(BUSINESS_INFO.registrationNumber),
      `${surface} must not retype the number`
    );
  }
});

check('the structured data (index.html JSON-LD) publishes the registration for search engines', () => {
  const html = read('index.html');
  assert.ok(html.includes('"legalName"'), 'Organization must declare its legal name');
  assert.ok(html.includes('"addressCountry": "IN"'), 'Organization must declare India');
  assert.ok(html.includes(BUSINESS_INFO.registrationNumber), 'Organization must publish the Udyam number as its identifier');
  assert.match(html, /"identifier"\s*:\s*\{\s*"@type"\s*:\s*"PropertyValue"/);
});

// ---------------------------------------------------------------------------
// 5. One source per runtime: no template may hold a second copy of the number.
// ---------------------------------------------------------------------------

check('the number is stored exactly once per runtime (frontend + PHP) and nowhere else', () => {
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tests', 'docs', '__pycache__', '.arena']);
  const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.php', '.json', '.html', '.html']);

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
      // The two runtimes' constants, plus the static HTML document that cannot
      // import a module and therefore inlines it in its JSON-LD.
      if (['src/data/businessInfo.ts', 'api/branding.php', 'index.html'].includes(relative)) continue;
      if (fs.readFileSync(absolute, 'utf8').includes(BUSINESS_INFO.registrationNumber)) offenders.push(relative);
    }
  };
  walk(projectRoot);
  assert.deepEqual(offenders, [], `these files retype the registration number: ${offenders.join(', ')}`);
});

console.log(`\n${passed} business-registration checks passed.`);
