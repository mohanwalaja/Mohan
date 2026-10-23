/**
 * SUBHA MUHURTHAM — ONLY THE GOOD TIME IS SHOWN OR PROMISED.
 *
 * Owner decision (2026-10-24): the Muhurtham product shows the good time
 * (Nalla Neram) and nothing else. The avoidance windows are an INTERNAL part of
 * the scan — the day is divided into eight parts and the Rahu Kalam, Yamagandam
 * and Gulikai parts are subtracted — but they are never printed in the report
 * and never advertised in the copy.
 *
 * Why this test exists: the scan was already correct and the report already
 * printed only Nalla Neram, yet the homepage card, the Muhurtham page, the
 * Services feature list, the FAQ, a testimonial, the invoice line, the SEO
 * description and the admin/order preview table all still promised "Rahu Kalam
 * & Yamaganda". A visitor was sold a feature the document does not contain.
 *
 * Pinned here:
 *   1. no customer-facing Muhurtham surface (pages, FAQ, testimonials, invoice
 *      line, share/SEO description, rules knowledge base, order preview) carries
 *      an avoidance-window phrase in English, Tamil or Hindi;
 *   2. the sample PDF the visitor can open BEFORE ordering — rendered here with
 *      the real builder and the real fixed sample payload, in all three
 *      languages — contains no avoidance window at all, and still carries the
 *      Nalla Neram column (so "removed" can never quietly become "empty");
 *   3. the two rules.json copies stay byte-identical (the PHP engine reads the
 *      api/ copy, the browser reads the src/ copy).
 *
 * Deliberately NOT scanned: src/lib/muhurtham/scanner.ts and
 * src/lib/astrology/astronomy.ts. They must keep computing those windows —
 * that computation is HOW Nalla Neram is derived. Only what is printed or
 * promised is pinned here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSamplePayload } from '../src/services/sampleReports';
import { buildMuhurthamHtml } from '../src/services/muhurthamHtmlBuilder';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** Any phrasing that names one of the avoided windows, in any shipped language. */
const AVOID_WINDOW = /rahu[\s-]?kal(?:a)?m?|rahu\s*kalam|இராகு\s*காலம்|ராகு\s*காலம்|राहु\s*काल|yama\s*gand(?:a)?m?|yamaganda|எமகண்டம்|யமகண்டம்|यमगण्ड|यमगंड|gulikai|gulika|குளிகை|गुलिक/gi;

function avoidWindowHits(text: string): string[] {
  return [...new Set((text.match(AVOID_WINDOW) || []).map(hit => hit.toLowerCase()))];
}

console.log('--- SUBHA MUHURTHAM: GOOD TIME ONLY ---');

/** Every customer-facing surface that describes what the Muhurtham report is. */
const CUSTOMER_COPY_FILES = [
  'src/pages/HomePage.tsx',              // homepage service card (incl. its detail line)
  'src/pages/MuhurthamPage.tsx',         // page itself + "what is included" list + SEO description
  'src/pages/ServicesPage.tsx',          // services catalogue feature list
  'src/data/serviceFaqs.ts',             // visible FAQ + FAQPage JSON-LD (one source)
  'src/data/testimonials.ts',            // customer quotes shown on the pages
  'src/context/LanguageContext.tsx',     // localized service descriptions
  'src/services/invoiceHtmlBuilder.ts',  // the line printed on the tax invoice
  'src/services/structuredData.ts',      // service schema
  'index.html',                          // static shell metadata / JSON-LD
  'src/lib/muhurtham/rules.json',        // event tips + Panchangam knowledge base
  'api/astrology/rules.json'             // PHP engine's byte-identical copy
];

for (const file of CUSTOMER_COPY_FILES) {
  check(`${file} advertises no avoidance window`, () => {
    const hits = avoidWindowHits(read(file));
    assert.deepEqual(hits, [], `${file} still names an avoided window: ${hits.join(', ')}`);
  });
}

check('the order/dashboard report preview prints Nalla Neram and no Rahu Kalam column', () => {
  const modal = read('src/components/common/OrderReportModal.tsx');
  assert.match(modal, /Nalla Neram/, 'the preview must still show the Nalla Neram column');
  assert.deepEqual(avoidWindowHits(modal), [], 'the preview table still prints an avoided window');
});

check('the two rules.json copies stay byte-identical', () => {
  assert.equal(
    read('src/lib/muhurtham/rules.json'),
    read('api/astrology/rules.json'),
    'src/lib/muhurtham/rules.json and api/astrology/rules.json must match byte for byte'
  );
});

/**
 * The REAL sample PDF: the same fixed payload (01 Jan 2000, 2:00 AM, Chennai,
 * wedding ceremony) the "View Sample Report" button calculates, rendered by the
 * same builder the emailed PDF uses.
 */
const samplePayload: any = buildSamplePayload('MUHURTHAM');
const sampleScan = samplePayload.muhurthamScan;
const sampleResult: any = { ...samplePayload, ...sampleScan };

for (const lang of ['en', 'ta', 'hi'] as const) {
  check(`the sample PDF (${lang}) prints only the good time`, () => {
    const html = buildMuhurthamHtml(sampleResult, lang);
    assert.ok(html.length > 5000, `the ${lang} sample must render a real report`);
    const hits = avoidWindowHits(html);
    assert.deepEqual(hits, [], `the ${lang} sample PDF still prints: ${hits.join(', ')}`);
    // The good time must still be there — removing the bad windows must not
    // have emptied the report.
    const nalla = lang === 'ta' ? /நல்ல நேரம்/ : lang === 'hi' ? /शुभ समय/ : /Nalla Neram|BEST TIME/i;
    assert.match(html, nalla, `the ${lang} sample must still show the Nalla Neram column`);
  });
}

console.log(`\n[OK] subha muhurtham good-time-only: ${passed} checks passed`);
