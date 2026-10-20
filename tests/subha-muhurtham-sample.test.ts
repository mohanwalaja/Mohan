/**
 * Public Subha Muhurtham samples must load without depending on the live PHP
 * preview endpoint. Their six-month date scan is produced by the same shared
 * scanner used by the order form and rendered by the production HTML builder.
 */
import assert from 'node:assert/strict';
import {
  buildSamplePayload,
  calculateSampleResult
} from '../src/services/sampleReports';
import {
  MUHURTHAM_ALGORITHM_VERSION
} from '../src/lib/muhurtham/scanner';
import { buildMuhurthamHtml } from '../src/services/muhurthamHtmlBuilder';
import {
  applySampleWatermark,
  countSampleWatermarks
} from '../src/services/sampleReportInfo';

async function main() {
  const payload = buildSamplePayload('MUHURTHAM');
  assert.equal(payload.muhurthamScan?.muhurthamAlgorithmVersion, MUHURTHAM_ALGORITHM_VERSION);
  assert.equal(payload.muhurthamScan?.months?.length, 6, 'the fixed sample carries all six report months');

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('The sample should not need a remote preview request.');
  }) as typeof fetch;

  let result: any;
  try {
    result = await calculateSampleResult('MUHURTHAM', { force: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0, 'loading the public Muhurtham sample does not depend on the live API');
  assert.equal(result.muhurthamAlgorithmVersion, MUHURTHAM_ALGORITHM_VERSION);
  assert.equal(result.selectedMonth, payload.selectedMonth);
  assert.equal(result.months.length, 6);
  assert.ok(result.months.every((month: any) => Array.isArray(month.days)));
  assert.ok(
    result.months.reduce((count: number, month: any) => count + month.days.length, 0) > 0,
    'the six-month calendar contains dates'
  );
  assert.deepEqual(
    result.persons.map((person: any) => person.name),
    ['Karthik Raman', 'Priya Devi'],
    'the wedding sample uses its two fixed example people'
  );

  const html = buildMuhurthamHtml(result, 'en');
  assert.ok(html.includes('Karthik Raman'));
  assert.ok(html.includes('Priya Devi'));
  assert.ok(html.includes('Chennai'));
  const watermarked = applySampleWatermark(html);
  const pageCount = (html.match(/<div class="page(?:\s|\")/g) || []).length;
  assert.equal(pageCount, 3, 'the sample renders the complete report: dates, selection guide, glossary');
  assert.equal(countSampleWatermarks(watermarked), pageCount, 'each report page receives the sample watermark');

  console.log('  [PASS] Subha Muhurtham sample builds and renders its complete six-month report offline.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
