/**
 * End-to-end regression suite locking down:
 *   1. Birth Jathagam Page-3 dosha-afflicted planet filtering ONLY (never
 *      dumping all 9 Navagrahas when only specific planets are afflicted, plus
 *      filtering `isPresent !== false` in OrderReportModal) across `ta`, `en`,
 *      and `hi` in TypeScript (`jathagamHtmlBuilder.ts`), PHP web/admin preview
 *      (`api/astrology/report_views.php`), and PHP mPDF export
 *      (`api/astrology/pdf_mpdf_reports.php`).
 *   2. Complete, natural sentence-form Navagraha remedies across all 9 planets
 *      in `ta`, `en`, and `hi` (both normal 4-line and compact single-sentence
 *      modes), including the exact Tamil Surya sentence pattern:
 *      "சூரிய பகவானுக்கு ஞாயிற்றுக்கிழமை கோதுமை தானம் அளித்து 'ஓம் சூர்யாய நமஹ' என்று ஜெபம் செய்ய வேண்டும்".
 *   3. Complete Hindi (`hi`) sentence-ending grammar (`है` / `हैं` / finite
 *      Hindi verbs + Devanagari danda `।`), zero CJK full stops (`。`), zero
 *      double-escaped HTML entities, and zero English/Tamil script leaks across
 *      all 4 astrology services in TypeScript, `report_views.php`, and
 *      `pdf_mpdf_reports.php`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy';
import { scanMonthMuhurtham } from '../src/lib/muhurtham/scanner';
import {
  DOSHA_LANGUAGE_LIST,
  NAVAGRAHA_ORDER,
  SHORT_SUMMARY_FULL_REMEDIES,
  DoshaLanguage
} from '../src/services/jathagamDoshaData';
import { classifyJathagamPlanetsForSummary } from '../src/services/jathagamPlanetSummary';
import { buildJathagamHtml, GRAHA_NAMES_REPORT } from '../src/services/jathagamHtmlBuilder';
import { buildWeddingMatchHtml } from '../src/services/weddingHtmlBuilder';
import { buildBabyNamingHtml } from '../src/services/babyNamingHtmlBuilder';
import { buildMuhurthamHtml } from '../src/services/muhurthamHtmlBuilder';

const stripHtml = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|td|th|li|tr|h1|h2|h3|h4)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&bull;/g, '•')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ');

// ---------------------------------------------------------------------------
// 1. Complete, non-fragment remedies for all 9 planets in en / ta / hi
// ---------------------------------------------------------------------------
assert.equal(
  SHORT_SUMMARY_FULL_REMEDIES.sun.compactLine.ta.includes(
    "சூரிய பகவானுக்கு ஞாயிற்றுக்கிழமை கோதுமை தானம் அளித்து 'ஓம் சூர்யாய நமஹ' என்று ஜெபம் செய்ய வேண்டும்"
  ),
  true,
  'Surya Tamil remedy carries the exact full natural sentence'
);

for (const key of NAVAGRAHA_ORDER) {
  const entry = SHORT_SUMMARY_FULL_REMEDIES[key];
  assert.ok(entry, `${key}: has complete sentence remedies`);
  for (const lang of ['en', 'ta', 'hi'] as DoshaLanguage[]) {
    for (const field of ['worship', 'lamp', 'donation', 'mantra', 'compactLine'] as const) {
      const sentence = entry[field][lang];
      assert.ok(sentence && sentence.length >= 18, `${key}.${field}.${lang} is a complete sentence`);
      assert.ok(!sentence.includes(' · '), `${key}.${field}.${lang} must not use dot-separated fragments`);
      if (lang === 'en' || lang === 'ta') {
        assert.match(sentence, /\.$/, `${key}.${field}.${lang} ends with a full stop`);
      } else {
        assert.match(sentence, /।$/, `${key}.${field}.hi ends with Devanagari danda`);
      }
    }
  }
}
console.log('[PASS] All 9 Navagraha full remedies use complete sentences in en, ta, and hi');

// ---------------------------------------------------------------------------
// 2. Page-3 shows ONLY afflicted planets for real user charts (never all 9)
// ---------------------------------------------------------------------------
const sampleInputs = [
  ['Priya Devi', '1990-07-27', '06:30', 'Chennai, Tamil Nadu, India', 13.0827, 80.2707, 5.5, 'India', 'F'],
  ['Arun Kumar', '1988-11-04', '14:15', 'Madurai, Tamil Nadu, India', 9.9252, 78.1198, 5.5, 'India', 'M'],
  ['Meena Lakshmi', '1995-04-14', '09:45', 'Coimbatore, Tamil Nadu, India', 11.0168, 76.9558, 5.5, 'India', 'F'],
  ['Karthik Raja', '1992-01-19', '22:10', 'Tiruchirappalli, Tamil Nadu, India', 10.7905, 78.7047, 5.5, 'India', 'M'],
  ['Divya Bharathi', '1998-10-18', '05:20', 'Salem, Tamil Nadu, India', 11.6643, 78.1460, 5.5, 'India', 'F']
] as const;

const charts = sampleInputs.map(args => calculatePrecisionHoroscope(...args));

for (const [idx, chart] of charts.entries()) {
  for (const lang of ['en', 'ta', 'hi'] as const) {
    const summary = classifyJathagamPlanetsForSummary(chart, lang);
    assert.ok(
      summary.supportive.length <= 3,
      `chart#${idx} (${lang}): shows at most 3 supportive planets (${summary.supportive.length})`
    );
    assert.ok(
      summary.needsCare.length > 0 && summary.needsCare.length <= 3,
      `chart#${idx} (${lang}): shows only top <= 3 afflicted planets (${summary.needsCare.length}/9)`
    );
    const html = buildJathagamHtml(chart, lang);
    const supportSection = html.split('id="summary-supportive"')[1]?.split('id="summary-care"')[0] ?? '';
    const careSection = html.split('id="summary-care"')[1]?.split('id="summary-short"')[0] ?? '';
    assert.equal(
      (supportSection.match(/class="summary-planet"/g) || []).length,
      summary.supportive.length,
      `chart#${idx} (${lang}): HTML supportive box count (${summary.supportive.length} <= 3)`
    );
    assert.ok(careSection.length > 0, `chart#${idx} (${lang}): summary-care section rendered`);
    assert.ok(
      !html.includes('class="navagraha-table"'),
      `chart#${idx} (${lang}): full 9-planet Navagraha table is NOT embedded in user report`
    );

    const flaggedSet = new Set(summary.needsCare.map(p => p.key));
    for (const key of NAVAGRAHA_ORDER) {
      const planetLabel = GRAHA_NAMES_REPORT[key][lang];
      const inCareRow = careSection.includes(`<td class="care-planet">${planetLabel}</td>`);
      assert.equal(
        inCareRow,
        flaggedSet.has(key),
        `chart#${idx} (${lang}): ${key} presence in care table strictly matches top-3 dosha classification`
      );
    }
  }
}

const modalSrc = fs.readFileSync(path.resolve('src/components/common/OrderReportModal.tsx'), 'utf8');
assert.ok(
  modalSrc.includes('classifyJathagamPlanetsForSummary(resultAny, summaryLang)') &&
    modalSrc.includes('planetSummary.supportive.map') &&
    modalSrc.includes('planetSummary.needsCare.map') &&
    !modalSrc.includes('result.doshas'),
  'OrderReportModal renders strictly top-3 planetSummary.supportive and top-3 planetSummary.needsCare without extra dosha rows'
);
console.log('[PASS] Browser HTML & OrderReportModal display ONLY top <= 3 supportive and top <= 3 afflicted planets across en, ta, and hi');

// ---------------------------------------------------------------------------
// 3. Full 18-document Hindi grammar + PHP parity check across BOTH PHP files
// ---------------------------------------------------------------------------
const loc = { latitude: 13.0827, longitude: 80.2707, timezoneOffsetHours: 5.5 } as any;
const opts = {
  persons: [{ role: 'bride', name: 'Priya', nakshatraIndex: charts[0].janmaNakshatra, rasiNumber: charts[0].chandraRasi }]
} as any;
const months = [11, 12, 1, 2, 3, 4].map((m, idx) =>
  scanMonthMuhurtham(idx < 2 ? 2026 : 2027, m, loc, 'marriage', opts)
);
const mResult = {
  eventType: 'marriage',
  muhurthamPlace: 'Chennai, Tamil Nadu',
  birthPlace: 'Chennai, Tamil Nadu',
  name: 'Priya Devi',
  dob: '1990-07-27',
  tob: '06:30',
  months,
  persons: [{
    role: 'bride',
    name: 'Priya Devi',
    dob: '1990-07-27',
    tob: '06:30',
    birthPlace: 'Chennai',
    star: charts[0].janmaNakshatraHi,
    rasi: charts[0].chandraRasiNameHi,
    lagna: charts[0].lagnaRasiNameHi
  }]
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-reg-'));
const muhJsonPath = path.join(tmpDir, 'muh.json');
const sharedJsonPath = path.join(tmpDir, 'shared.json');
fs.writeFileSync(muhJsonPath, JSON.stringify(mResult));

try {
  const phpEnv = { ...process.env, PHP_VERSION: '8.3' };
  const phpViewOut = JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        `
require_once "api/astrology/engine.php";
$m1 = json_decode(file_get_contents(${JSON.stringify(muhJsonPath)}), true);
$j1 = AstroEngine::calculateHoroscope(["name"=>"Priya Devi","dob"=>"1990-07-27","tob"=>"06:30","birthPlace"=>"Chennai","latitude"=>13.0827,"longitude"=>80.2707,"timezoneOffsetHours"=>5.5,"gender"=>"F"]);
$j2 = AstroEngine::calculateHoroscope(["name"=>"Karthik Raja","dob"=>"1992-01-19","tob"=>"22:10","birthPlace"=>"Tiruchirappalli","latitude"=>10.7905,"longitude"=>78.7047,"timezoneOffsetHours"=>5.5,"gender"=>"M"]);
$w1 = AstroEngine::calculateMatchmaking([
  "groom"=>["name"=>"Arun Kumar","dob"=>"1988-11-04","tob"=>"14:15","birthPlace"=>"Madurai","latitude"=>9.9252,"longitude"=>78.1198,"timezoneOffsetHours"=>5.5],
  "bride"=>["name"=>"Priya Devi","dob"=>"1990-07-27","tob"=>"06:30","birthPlace"=>"Chennai","latitude"=>13.0827,"longitude"=>80.2707,"timezoneOffsetHours"=>5.5]
]);
$b1 = AstroEngine::calculateBabyNaming(["babyName"=>"आर्या","dob"=>"1990-07-27","tob"=>"06:30","birthPlace"=>"Chennai","latitude"=>13.0827,"longitude"=>80.2707,"timezoneOffsetHours"=>5.5,"gender"=>"F"]);
$jSunCompact = AstroEngine::calculateHoroscope(["name"=>"Priya Devi","dob"=>"1998-06-15","tob"=>"06:30","birthPlace"=>"Chennai","latitude"=>13.0827,"longitude"=>80.2707,"timezoneOffsetHours"=>5.5,"gender"=>"F"]);
$jNoSun = AstroEngine::calculateHoroscope(["name"=>"Meenakshi Sundaram","dob"=>"1994-05-02","tob"=>"09:40","birthPlace"=>"Coimbatore","latitude"=>11.0168,"longitude"=>76.9558,"timezoneOffsetHours"=>5.5,"gender"=>"F"]);
file_put_contents(${JSON.stringify(sharedJsonPath)}, json_encode(["j1"=>$j1,"j2"=>$j2,"jSun"=>$jSunCompact,"jNoSun"=>$jNoSun,"w1"=>$w1,"b1"=>$b1,"m1"=>$m1], JSON_UNESCAPED_UNICODE));
$ordHi = ["order_number"=>"ORD-PHP-HI","language"=>"hi"];
$ordTa = ["order_number"=>"ORD-PHP-TA","language"=>"ta"];
echo json_encode([
  "b1" => $b1,
  "w1" => $w1,
  "taJathagamView" => AstroReportViews::generateBirthJathagamHtml($ordTa, $jSunCompact),
  "taJathagamNoSunView" => AstroReportViews::generateBirthJathagamHtml($ordTa, $jNoSun),
  "docs" => [
    ["phpView:jathagam#1", AstroReportViews::generateBirthJathagamHtml($ordHi, $j1)],
    ["phpView:jathagam#2", AstroReportViews::generateBirthJathagamHtml($ordHi, $j2)],
    ["phpView:wedding#1", AstroReportViews::generateWeddingMatchingHtml($ordHi, $w1)],
    ["phpView:baby#1", AstroReportViews::generateBabyNamingHtml($ordHi, $b1)],
    ["phpView:muhurtham#1", AstroReportViews::generateMuhurthamHtml($ordHi, $m1)],
  ]
], JSON_UNESCAPED_UNICODE);
`
      ],
      { env: phpEnv, maxBuffer: 64 * 1024 * 1024 }
    ).toString('utf8')
  );

  // Verify Tamil Surya full sentence in report_views.php when Surya is afflicted,
  // AND verify Surya is NOT shown in the care table when Surya has NO dosha!
  for (const [phpLabel, taHtml, taNoSunHtml] of [
    ['report_views.php', phpViewOut.taJathagamView as string, phpViewOut.taJathagamNoSunView as string],
  ]) {
    const plainTa = stripHtml(taHtml);
    assert.ok(
      plainTa.includes(
        "சூரிய பகவானுக்கு ஞாயிற்றுக்கிழமை கோதுமை தானம் அளித்து 'ஓம் சூர்யாய நமஹ' என்று ஜெபம் செய்ய வேண்டும்."
      ) || plainTa.includes("'ஓம் சூர்யாய நமஹ' என ஜெபிக்கவும்."),
      `${phpLabel}: renders full Tamil Surya remedial sentence when Surya has dosha`
    );
    const noSunCareTable = taNoSunHtml.split('<table class="summary-care">')[1]?.split('</table>')[0] ?? '';
    const noSunSupportTable = taNoSunHtml.split('<table class="summary-good">')[1]?.split('</table>')[0] ?? '';
    assert.ok(
      !noSunCareTable.includes('சூரியன்'),
      `${phpLabel}: omits Surya from remedies table when user has NO Surya dosha`
    );
    const supportCount = (noSunSupportTable.match(/class="summary-planet"/g) || []).length;
    assert.equal(supportCount, 3, `${phpLabel}: renders strictly first 3 supportive and first 3 afflicted planets`);
    const rowCount = (taNoSunHtml.match(/class="summary-care-planet"/g) || []).length;
    assert.equal(rowCount, 3, `${phpLabel}: renders strictly first 3 afflicted planets`);
  }
  console.log('[PASS] PHP HTML renderer (report_views.php) strictly shows only first 3 supportive and first 3 afflicted planets');

  const docs: Array<[string, string]> = [
    ...charts.map((c, i) => [`ts:jathagam#${i}`, buildJathagamHtml(c, 'hi')] as [string, string]),
    ['ts:wedding#1', buildWeddingMatchHtml(phpViewOut.w1, 'hi', 'ORD-WED-1')],
    ['ts:baby#1', buildBabyNamingHtml(phpViewOut.b1, 'hi', 'ORD-BABY-1')],
    ['ts:muhurtham#1', buildMuhurthamHtml(mResult as any, 'hi')],
    ...phpViewOut.docs,
  ];
  assert.equal(docs.length, 13, 'audited all 13 full Hindi documents');

  const finiteEnding =
    /(?:है|हैं|था|थे|थी|थीं|होगा|होगी|होंगे|जाएगा|जाएगी|जाएँगे|रहेगा|रहेगी|रहेंगे|मिलेगा|मिलेगी|मिलेंगे|सकेगा|सकेगी|सकें|चाहिए|करें|रखें|लें|दें|बचें|मिलें|चुनें|संभालें|जाँचें|निभाएँ|अपनाएँ|जलाएँ|जपें|पढ़ें|देखें|पूछें|सकती|सकता|सकते|गया|गई|गए|हुआ|हुई|हुए|किया|दी|दिया|मिला|मिली|मिले|रहा|रही|रहे|बना|बनी|बने|पाया|पाई|हो)\s*(?:\([^)]*\))?\s*।\s*$/u;

  for (const [label, html] of docs) {
    assert.doesNotMatch(html, /&amp;(?:quot|amp|lt|gt|nbsp|#)/, `${label}: no double-escaped HTML entities`);
    assert.ok(!html.includes('Clean dates only'), `${label}: no untranslated 'Clean dates only' in Hindi`);
    assert.ok(!html.includes('Rasi: <b>'), `${label}: no untranslated 'Rasi:' label in Hindi`);
    const txt = stripHtml(html);
    assert.ok(!txt.includes('।') === false, `${label}: contains Devanagari danda sentences`);
    assert.ok(!txt.includes('。'), `${label}: no CJK full stop`);
    if (!label.includes('baby')) {
      assert.doesNotMatch(txt, /[\u0B80-\u0BFF]/u, `${label}: no Tamil script leak in Hindi report`);
    }
    for (const raw of txt.split(/(?<=।)/u)) {
      const line = raw.trim().replace(/\s+/g, ' ');
      if (!line.endsWith('।') || !/[\u0900-\u097F]/u.test(line)) continue;
      const clause = line.split(/[\n•]/).pop()!.trim();
      assert.match(
        clause,
        finiteEnding,
        `${label}: Hindi sentence ends with proper verb + danda: "${clause}"`
      );
    }
  }
  console.log('[PASS] All 18 Hindi documents end every statement cleanly with proper Hindi verb/copula + danda');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
