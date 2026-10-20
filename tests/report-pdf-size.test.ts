import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  A4_PRINT_MIN_HEIGHT_PX,
  A4_PRINT_MIN_WIDTH_PX,
  JPEG_QUALITY_FLOOR,
  PRINT_CAPTURE_SCALE,
  PRINT_JPEG_QUALITY,
  REPORT_PDF_TARGET_BYTES,
  base64DataUrlBytes,
  encodePageJpeg,
  pageBudgetBytes
} from '../src/services/jathagamPdfExporter.js';

/**
 * REPORT SIZE (owner request, 20 Oct 2026)
 *
 * Every report page is a raster, so a document's weight is pixels × compression
 * and nothing else. At 3.2× (≈307 dpi) + JPEG 0.95 a four-page Birth Jathagam
 * weighed ~3 MB and the report + invoice email payload ~5 MB; approving orders
 * from a phone on mobile data took minutes each.
 *
 * The fix has two halves and this suite pins both:
 *
 *   1. the density is the 200 dpi A4 print floor, captured at 2.2× (~211 dpi);
 *   2. a per-document BYTE BUDGET steps the JPEG quality down (0.88 → 0.80)
 *      when a document would overshoot — the raster is reused, never resized
 *      and never re-captured, so the win is compression, not blur.
 */
const exporter = readFileSync(new URL('../src/services/jathagamPdfExporter.ts', import.meta.url), 'utf8');
const familyDocs = readFileSync(new URL('../api/admin/family_docs.php', import.meta.url), 'utf8');

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
};

/**
 * A fake page: JPEG size falls as quality falls, like a real encoder. The
 * exponent models how steeply a text page compresses (real JPEG curves are
 * steeper than linear because ringing is what costs the bytes).
 */
function fakePage(options: { bytesAtCeiling: number; exponent?: number; shrink?: number }) {
  const calls: number[] = [];
  const exponent = options.exponent ?? 12;
  const shrink = options.shrink ?? 1;
  return {
    calls,
    toDataURL(_type: 'image/jpeg', quality = PRINT_JPEG_QUALITY) {
      calls.push(quality);
      const ratio = (quality / PRINT_JPEG_QUALITY) ** exponent;
      const bytes = Math.max(1024, Math.round(options.bytesAtCeiling * ratio * shrink));
      const body = Buffer.alloc(bytes, 0x41).toString('base64');
      return `data:image/jpeg;base64,${body}`;
    }
  };
}

console.log('--- REPORT PDF SIZE ---');

check('the paid profile is the 200 dpi A4 floor, captured at 2.2x', () => {
  assert.equal(A4_PRINT_MIN_WIDTH_PX, 1654, 'A4 at 200 dpi is 1654 px wide');
  assert.equal(A4_PRINT_MIN_HEIGHT_PX, 2339, 'A4 at 200 dpi is 2339 px tall');
  assert.equal(PRINT_CAPTURE_SCALE, 2.2, 'the capture scale is a fixed constant');
  const dpi = 96 * PRINT_CAPTURE_SCALE;
  assert.ok(dpi >= 200, `the capture must clear the 200 dpi floor (got ${dpi.toFixed(0)} dpi)`);
  assert.ok(Math.floor(793.7 * PRINT_CAPTURE_SCALE) >= A4_PRINT_MIN_WIDTH_PX,
    'a capture must clear the width floor without relying on rounding');
  assert.ok(Math.floor(1122.5 * PRINT_CAPTURE_SCALE) >= A4_PRINT_MIN_HEIGHT_PX,
    'a capture must clear the height floor without relying on rounding');
  // The floor really is A4 at 200 dpi (8.2677in × 11.6929in).
  assert.equal(Math.round(8.2677 * 200), A4_PRINT_MIN_WIDTH_PX);
  assert.equal(Math.round(11.6929 * 200), A4_PRINT_MIN_HEIGHT_PX);
});

check('the JPEG ceiling is 0.88 and the floor 0.80', () => {
  assert.equal(PRINT_JPEG_QUALITY, 0.88, 'the paid quality must stay at 0.88');
  assert.equal(JPEG_QUALITY_FLOOR, 0.8, 'compression must never fall below 0.80');
  assert.ok(JPEG_QUALITY_FLOOR < PRINT_JPEG_QUALITY, 'the floor must leave room to step down');
});

check('a page inside its budget is encoded once, at the ceiling', () => {
  const page = fakePage({ bytesAtCeiling: 300 * 1024 });
  const encoded = encodePageJpeg(page, { budgetBytes: 500 * 1024 });
  assert.equal(page.calls.length, 1, 'no extra encoding when the page already fits');
  assert.equal(encoded.quality, PRINT_JPEG_QUALITY);
  assert.equal(page.calls[0], PRINT_JPEG_QUALITY);
});

check('an overshooting page steps down until it fits, without touching resolution', () => {
  const page = fakePage({ bytesAtCeiling: 900 * 1024 });
  const encoded = encodePageJpeg(page, { budgetBytes: 400 * 1024 });
  assert.ok(page.calls.length > 1, 'the budget must have forced a re-encode');
  assert.ok(encoded.quality < PRINT_JPEG_QUALITY, 'quality must have dropped');
  assert.ok(encoded.quality >= JPEG_QUALITY_FLOOR, 'quality must never drop below the floor');
  assert.ok(base64DataUrlBytes(encoded.dataUrl) <= 400 * 1024, 'the returned page must fit the budget');
  for (const quality of page.calls) {
    assert.ok(quality <= PRINT_JPEG_QUALITY && quality >= JPEG_QUALITY_FLOOR,
      `every attempt must stay inside ${JPEG_QUALITY_FLOOR}–${PRINT_JPEG_QUALITY} (saw ${quality})`);
  }
});

check('an impossible budget stops at the floor instead of degrading forever', () => {
  // A page whose size barely responds to quality: the budget can never be met.
  const page = fakePage({ bytesAtCeiling: 5 * 1024 * 1024, exponent: 0.01 });
  const encoded = encodePageJpeg(page, { budgetBytes: 10 * 1024 });
  assert.equal(encoded.quality, JPEG_QUALITY_FLOOR, 'the encoder must bottom out at the floor');
  assert.ok(page.calls.length < 20, `the ladder must terminate quickly (took ${page.calls.length} encodes)`);
});

check('the document budget is split across the pages it actually has', () => {
  assert.equal(pageBudgetBytes(1), REPORT_PDF_TARGET_BYTES, 'a one-page invoice gets the whole budget');
  assert.equal(pageBudgetBytes(4), Math.floor(REPORT_PDF_TARGET_BYTES / 4));
  assert.equal(pageBudgetBytes(10), Math.floor(REPORT_PDF_TARGET_BYTES / 10));
  assert.equal(pageBudgetBytes(0), REPORT_PDF_TARGET_BYTES, 'a nonsense count falls back to one page');
  assert.ok(REPORT_PDF_TARGET_BYTES <= 2 * 1024 * 1024,
    'the document budget must stay small enough to email over mobile data');
});

check('base64 size accounting matches the bytes actually carried', () => {
  for (const size of [0, 1, 2, 3, 4, 5, 1023, 1024]) {
    const encoded = Buffer.alloc(size, 0x42).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${encoded}`;
    assert.equal(base64DataUrlBytes(dataUrl), size, `a ${size}-byte payload must be measured as ${size}`);
  }
});

check('the capture pipeline uses the budget encoder and never resizes the canvas', () => {
  assert.match(exporter, /const encoded = encodePageJpeg\(canvas, \{/,
    'capturePageIntoDoc must encode through the budget-aware helper');
  assert.match(exporter, /budgetBytes: pageBudgetBytes/,
    'the page budget must be passed into the encoder');
  assert.match(exporter, /const pageBudget = pageBudgetBytes\(pages\.length\);/,
    'the budget must be derived from the real page count');
  // A resize would destroy print density; the byte win must come from JPEG only.
  assert.doesNotMatch(exporter, /canvas\.width\s*=(?!=)/, 'the capture canvas must never be resized');
  assert.doesNotMatch(exporter, /canvas\.height\s*=(?!=)/, 'the capture canvas must never be resized');
  assert.doesNotMatch(exporter, /putImageData|ctx\.scale\(0\./,
    'no downscaling hack may enter the capture path');
});

check('the API floor and the client floor are the same A4 at 200 dpi', () => {
  assert.match(familyDocs, /define\('ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX', 1654\);/);
  assert.match(familyDocs, /define\('ASTRO_FAMILY_DOC_MIN_PREVIEW_HEIGHT_PX', 2339\);/);
});

check('the old 300 dpi / JPEG 0.95 profile is gone from the exporter', () => {
  assert.doesNotMatch(exporter, /PRINT_CAPTURE_SCALE = 3\.2;/,
    'the 300 dpi capture must not come back by accident');
  assert.doesNotMatch(exporter, /jpegQuality: 0\.95/,
    'no render profile may hard-code JPEG 0.95 again');
  assert.doesNotMatch(exporter, /A4_PRINT_MIN_WIDTH_PX = 2480;/,
    'the 300 dpi pixel floor must not come back by accident');
});

console.log(`\n${passed} report-size checks passed.`);
