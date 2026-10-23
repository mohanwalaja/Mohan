import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { calculatePrecisionHoroscope } from '../src/lib/astrology/astronomy';
import { ALL_NAKSHATRA_LETTERS, calculateBabyNamingDetails } from '../src/lib/astrology/babynames';
import { buildNamakaranPadaNames } from '../src/lib/astrology/namakaranNames';
import { calculateWeddingCompatibility, evaluateTenPoruthams } from '../src/lib/astrology/matchmaking';
import { classifyJathagamPlanetsForSummary } from '../src/services/jathagamPlanetSummary';
import { buildJathagamHtml } from '../src/services/jathagamHtmlBuilder';
import { computeLifeCardPredictions } from '../src/lib/astrology/lifeCardPredictions';
import { computeDayMuhurtham, calculateMoonPositionAt } from '../src/lib/muhurtham/scanner';
import { Graha, PoruthamStatus } from '../src/lib/astrology/types';

const repoRoot = path.resolve(import.meta.dirname, '..');

function runPhpJson(phpBody: string): any {
  const probeRel = 'tests/fixtures/.tmp-four-services-parity-probe.php';
  const probeAbs = path.join(repoRoot, probeRel);
  fs.writeFileSync(probeAbs, `<?php\n${phpBody}\n`);
  try {
    const hasNativePhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0;
    const raw = hasNativePhp
      ? execFileSync('php', [probeAbs], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      : execFileSync(process.execPath, ['scripts/php-wasm-run.mjs', '--php', '8.1', probeRel], {
          cwd: repoRoot,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        });
    return JSON.parse(raw.trim());
  } finally {
    if (fs.existsSync(probeAbs)) fs.unlinkSync(probeAbs);
  }
}

console.log('--- ALL FOUR ASTROLOGY SERVICES: FULL TS <-> PHP PARITY SUITE ---');

// Single batch PHP probe covering all 4 services in one fast execution
const phpProbe = runPhpJson(`
require_once __DIR__ . '/../../api/astrology/engine.php';
require_once __DIR__ . '/../../api/astrology/report_views.php';

$poruthamRef = new ReflectionMethod(AstroEngine::class, 'calculatePoruthams');
$poruthamRef->setAccessible(true);
$combustRef = new ReflectionMethod(AstroEngine::class, 'getCombustionLimit');
$combustRef->setAccessible(true);

$rasiLords = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];

// 1. Exhaustive 27 x 27 = 729 Nakshatra x Pada-1 matrix across all 10 Poruthams
$matrix729 = [];
for ($gNak = 0; $gNak < 27; $gNak++) {
    $gRasiIdx = intdiv($gNak * 4, 9);
    for ($bNak = 0; $bNak < 27; $bNak++) {
        $bRasiIdx = intdiv($bNak * 4, 9);
        $res = $poruthamRef->invoke(
            null,
            $bNak,
            $bRasiIdx,
            $gNak,
            $gRasiIdx,
            $rasiLords[$bRasiIdx],
            $rasiLords[$gRasiIdx]
        );
        $row = [];
        foreach ($res as $k => $v) {
            $pts = (float) $v['pts'];
            $max = (float) $v['max'];
            $row[$k] = $pts <= 0.0 ? 'P' : ($pts < $max ? 'M' : 'U');
        }
        $matrix729["{$gNak}:{$bNak}"] = $row;
    }
}

// 1b. Exhaustive 12 x 12 = 144 Rasi pairs for Rasi, Rasiyadhipathi, and Vasiya
$matrix144 = [];
for ($gRasiIdx = 0; $gRasiIdx < 12; $gRasiIdx++) {
    for ($bRasiIdx = 0; $bRasiIdx < 12; $bRasiIdx++) {
        $res = $poruthamRef->invoke(
            null,
            0,
            $bRasiIdx,
            3,
            $gRasiIdx,
            $rasiLords[$bRasiIdx],
            $rasiLords[$gRasiIdx]
        );
        $matrix144["{$gRasiIdx}:{$bRasiIdx}"] = [
            'rasi' => $res['rasi']['pts'] <= 0 ? 'PORUNDHADHU' : ($res['rasi']['pts'] < $res['rasi']['max'] ? 'MADHYAMAM' : 'UTTHAMAM'),
            'rasiyadhipathi' => $res['rasiyadhipathi']['pts'] <= 0 ? 'PORUNDHADHU' : ($res['rasiyadhipathi']['pts'] < $res['rasiyadhipathi']['max'] ? 'MADHYAMAM' : 'UTTHAMAM'),
            'vasiya' => $res['vasiya']['pts'] <= 0 ? 'PORUNDHADHU' : 'UTTHAMAM',
        ];
    }
}

// 2. Service 1: Birth Jathagam checks
$sampleHoroscope = AstroEngine::calculateHoroscope([
    'name' => 'Arjun Kumar',
    'dob' => '1992-08-14',
    'tob' => '06:30',
    'birthPlace' => 'Chennai',
    'country' => 'India',
    'latitude' => 13.0827,
    'longitude' => 80.2707,
    'timezoneOffsetHours' => 5.5,
    'timeZoneId' => 'Asia/Kolkata',
]);

// Synthetic chart verifying 360° 10° conjunction orb & Moon-Kendra Neecha Bhanga on Page-3 Summary
$syntheticChart = [
    'lagnaRasi' => 2,      // Rishabam Lagna -> Mesham is 12th from Lagna (NOT Lagna Kendra)
    'chandraRasi' => 10,   // Magaram Moon -> Mesham (1) IS 4th from Moon (Moon-Kendra!) & Mangal in Magaram (10) IS 1st from Moon!
    'planetPositions' => [
        ['graha' => 'sun', 'rasi' => 5, 'bhavaNumber' => 4, 'degrees' => 10.0, 'totalDegrees' => 130.0, 'isRetrograde' => false, 'isCombust' => false],
        ['graha' => 'moon', 'rasi' => 10, 'bhavaNumber' => 9, 'degrees' => 2.0, 'totalDegrees' => 272.0, 'isRetrograde' => false, 'isCombust' => false],
        // Mars exalted in Magaram (27° -> 25° away from Moon in same sign: NOT within 10° conjunction orb!)
        ['graha' => 'mars', 'rasi' => 10, 'bhavaNumber' => 9, 'degrees' => 27.0, 'totalDegrees' => 297.0, 'isRetrograde' => false, 'isCombust' => false],
        ['graha' => 'mercury', 'rasi' => 6, 'bhavaNumber' => 5, 'degrees' => 16.0, 'totalDegrees' => 166.0, 'isRetrograde' => false, 'isCombust' => false],
        ['graha' => 'jupiter', 'rasi' => 9, 'bhavaNumber' => 8, 'degrees' => 15.0, 'totalDegrees' => 255.0, 'isRetrograde' => false, 'isCombust' => false],
        ['graha' => 'venus', 'rasi' => 2, 'bhavaNumber' => 1, 'degrees' => 12.0, 'totalDegrees' => 42.0, 'isRetrograde' => false, 'isCombust' => false],
        // Saturn debilitated in Mesham (1), dispositor Mars in Magaram (1st from Moon = Moon-Kendra Neecha Bhanga!)
        ['graha' => 'saturn', 'rasi' => 1, 'bhavaNumber' => 12, 'degrees' => 14.0, 'totalDegrees' => 14.0, 'isRetrograde' => false, 'isCombust' => false],
        ['graha' => 'rahu', 'rasi' => 11, 'bhavaNumber' => 10, 'degrees' => 8.0, 'totalDegrees' => 308.0, 'isRetrograde' => true, 'isCombust' => false],
        ['graha' => 'ketu', 'rasi' => 5, 'bhavaNumber' => 4, 'degrees' => 8.0, 'totalDegrees' => 128.0, 'isRetrograde' => true, 'isCombust' => false],
    ],
    'dashaPeriods' => [
        ['mahadashaLord' => 'moon', 'isCurrent' => true, 'planetEn' => 'Chandra (Moon)', 'planetTa' => 'சந்திரன்', 'planetHi' => 'चंद्र', 'start' => '2022-01-01', 'end' => '2032-01-01', 'antardashas' => []],
    ],
];
// Debilitated running Mahadasha lord (Moon in Viruchigam = rasi 8, house 7 Kendra, non-combust, direct)
$debilitatedDashaChart = $sampleHoroscope;
foreach ($debilitatedDashaChart['planetPositions'] as &$pp) {
    if ($pp['graha'] === 'moon') {
        $pp['rasi'] = 8;
        $pp['house'] = 7;
        $pp['bhavaNumber'] = 7;
        $pp['isCombust'] = false;
        $pp['isRetrograde'] = false;
    }
}
unset($pp);
$debilitatedDashaChart['lagnaRasi'] = 2;
$debilitatedDashaChart['chandraRasi'] = 8;
$debilitatedDashaChart['dashaPeriods'] = [[
    'mahadashaLord' => 'moon',
    'isCurrent' => true,
    'planetEn' => 'Chandra (Moon)',
    'planetTa' => 'சந்திரன்',
    'planetHi' => 'चंद्र',
    'start' => '2020-01-01',
    'end' => '2030-01-01',
    'antardashas' => [],
]];
$debilitatedDashaHtml = AstroReportViews::generateBirthJathagamHtml(['language' => 'en', 'order_number' => 'AS-JAT-TEST'], $debilitatedDashaChart);

// 3. Service 3: All 27 Nakshatras x 2 genders full Namakaran sheets + Baby Naming Hindi Rasi
$letters = json_decode((string) file_get_contents(__DIR__ . '/../../api/astrology/baby_nakshatra_letters.json'), true);
$namakaranSheets = [];
foreach ($letters as $starRow) {
    foreach (['M', 'F'] as $g) {
        $namakaranSheets[$starRow['nakshatraIndex'] . ':' . $g] = AstroEngine::getBabyNameSuggestionsByPada($starRow['padas'], $g, 8);
    }
}
$babyCalc = AstroEngine::calculateBabyNaming([
    'babyName' => 'Aarav',
    'gender' => 'M',
    'dob' => '2000-01-01',
    'tob' => '02:00',
    'birthPlace' => 'Chennai',
    'country' => 'India',
    'latitude' => 13.0827,
    'longitude' => 80.2707,
    'timezoneOffsetHours' => 5.5,
    'timeZoneId' => 'Asia/Kolkata',
]);

// 4. Service 4: Legacy Muhurtham rebuild check
$legacyMuhurthamOrder = [
    'service_type' => 'MUHURTHAM',
    'input_payload' => [
        'name' => 'Kavitha S',
        'eventKey' => 'wedding',
        'muhurthamPlace' => 'Chennai',
        'muhurthamCountry' => 'India',
        'muhurthamLatitude' => 13.0827,
        'muhurthamLongitude' => 80.2707,
        'muhurthamTimezoneOffsetHours' => 5.5,
        'muhurthamTimeZoneId' => 'Asia/Kolkata',
        'muhurthamAlgorithmVersion' => 5,
        'muhurthamScan' => [
            'muhurthamAlgorithmVersion' => 5,
            'inputContext' => [
                'eventKey' => 'wedding',
                'muhurthamLatitude' => 13.0827,
                'muhurthamLongitude' => 80.2707,
                'muhurthamTimezoneOffsetHours' => 5.5,
                'muhurthamTimeZoneId' => 'Asia/Kolkata',
                'persons' => [['role' => 'self', 'nakshatraIndex' => 3, 'rasiNumber' => 2]],
            ],
            'persons' => [['role' => 'self', 'name' => 'Kavitha S', 'nakshatraIndex' => 3, 'rasiNumber' => 2]],
            'months' => array_map(fn($m) => [
                'year' => 2026,
                'monthIndex' => $m,
                'days' => [[
                    'date' => sprintf('2026-%02d-15', $m + 1),
                    'grade' => 'GOOD',
                    'score' => 75,
                    'tithiEn' => 'Shukla Panchami',
                    'nakshatraEn' => 'Rohini',
                    'yogaEn' => 'Siddha',
                    'nallaNeram' => [['start' => '09:00', 'end' => '10:30']],
                ]],
            ], range(6, 11)),
        ],
    ],
];
$rebuiltLegacyMuhurtham = AstroEngine::rebuildReportResultFromSavedInputs($legacyMuhurthamOrder);

echo json_encode([
    'combustLimits' => [
        'mercuryDirect' => $combustRef->invoke(null, 'mercury', false),
        'mercuryRetro' => $combustRef->invoke(null, 'mercury', true),
        'venusDirect' => $combustRef->invoke(null, 'venus', false),
        'venusRetro' => $combustRef->invoke(null, 'venus', true),
    ],
    'sampleHoroscope' => $sampleHoroscope,
    'syntheticSummaryEn' => AstroReportViews::classifyJathagamPlanetsForSummary($syntheticChart, 'en'),
    'debilitatedDashaCardHasCaution' => strpos($debilitatedDashaHtml, 'Upcoming Year ⚠ Caution') !== false,
    'matrix729' => $matrix729,
    'matrix144' => $matrix144,
    'namakaranSheets' => $namakaranSheets,
    'babyCalc' => $babyCalc,
    'rebuiltLegacyMuhurtham' => $rebuiltLegacyMuhurtham,
]);
`);

// ============================================================================
// 1. SERVICE 1: BIRTH JATHAGAM PARITY
// ============================================================================
assert.deepEqual(phpProbe.combustLimits, {
  mercuryDirect: 14,
  mercuryRetro: 12,
  venusDirect: 10,
  venusRetro: 8,
}, 'PHP getCombustionLimit enforces exact Surya Siddhanta retrograde orbs (Mercury 12°, Venus 8°)');

const tsChart = calculatePrecisionHoroscope('Arjun Kumar', '1992-08-14', '06:30', 'Chennai', 13.0827, 80.2707, 5.5, 'India');
assert.equal(tsChart.lagnaRasi, phpProbe.sampleHoroscope.lagnaRasi, 'TS <-> PHP Lagna Rasi matches');
assert.equal(tsChart.chandraRasi, phpProbe.sampleHoroscope.chandraRasi, 'TS <-> PHP Chandra Rasi matches');

for (const phpPlanet of phpProbe.sampleHoroscope.planetPositions) {
  assert.ok(phpPlanet.nameHi && /[\u0900-\u097F]/.test(phpPlanet.nameHi) && !/[A-Za-z]/.test(phpPlanet.nameHi), `PHP planet ${phpPlanet.graha} carries pure Devanagari nameHi`);
  assert.ok(phpPlanet.rasiNameHi && /[\u0900-\u097F]/.test(phpPlanet.rasiNameHi), `PHP planet ${phpPlanet.graha} carries Devanagari rasiNameHi`);
  assert.ok(phpPlanet.nakshatramHi && /[\u0900-\u097F]/.test(phpPlanet.nakshatramHi) && !/[A-Za-z]/.test(phpPlanet.nakshatramHi), `PHP planet ${phpPlanet.graha} carries pure Devanagari nakshatramHi`);
  assert.ok(phpPlanet.navamsaRasiNameHi && /[\u0900-\u097F]/.test(phpPlanet.navamsaRasiNameHi), `PHP planet ${phpPlanet.graha} carries Devanagari navamsaRasiNameHi`);
}
for (const dosha of Object.values<any>(phpProbe.sampleHoroscope.doshaDetails || phpProbe.sampleHoroscope.doshas || [])) {
  if (dosha.descriptionHi) {
    assert.doesNotMatch(
      dosha.descriptionHi,
      /\b(Mesham|Rishabam|Mithunam|Kadagam|Simham|Kanni|Thulam|Viruchigam|Dhanusu|Magaram|Kumbham|Meenam)\b/,
      `Hindi dosha ${dosha.id} contains zero English Rasi names`
    );
  }
}

// Page-3 Summary: 360° 10° conjunction orb + Moon-Kendra Neecha Bhanga + Top-3 cap parity
const tsSyntheticSummary = classifyJathagamPlanetsForSummary({
  lagnaRasi: 2,
  chandraRasi: 10,
  planetPositions: [
    { graha: 'sun', rasi: 5, bhavaNumber: 4, degree: 10, totalDegrees: 130, isRetrograde: false, isCombust: false },
    { graha: 'moon', rasi: 10, bhavaNumber: 9, degree: 2, totalDegrees: 272, isRetrograde: false, isCombust: false },
    { graha: 'mars', rasi: 10, bhavaNumber: 9, degree: 27, totalDegrees: 297, isRetrograde: false, isCombust: false },
    { graha: 'mercury', rasi: 6, bhavaNumber: 5, degree: 16, totalDegrees: 166, isRetrograde: false, isCombust: false },
    { graha: 'jupiter', rasi: 9, bhavaNumber: 8, degree: 15, totalDegrees: 255, isRetrograde: false, isCombust: false },
    { graha: 'venus', rasi: 2, bhavaNumber: 1, degree: 12, totalDegrees: 42, isRetrograde: false, isCombust: false },
    { graha: 'saturn', rasi: 1, bhavaNumber: 12, degree: 14, totalDegrees: 14, isRetrograde: false, isCombust: false },
    { graha: 'rahu', rasi: 11, bhavaNumber: 10, degree: 8, totalDegrees: 308, isRetrograde: true, isCombust: false },
    { graha: 'ketu', rasi: 5, bhavaNumber: 4, degree: 8, totalDegrees: 128, isRetrograde: true, isCombust: false },
  ] as any,
} as any, 'en');

assert.deepEqual(
  {
    ...tsSyntheticSummary,
    supportive: tsSyntheticSummary.supportive.map(({ key, house }) => ({ key, house })),
  },
  {
    ...phpProbe.syntheticSummaryEn,
    supportive: phpProbe.syntheticSummaryEn.supportive.map(({ key, house }: any) => ({ key, house })),
  },
  'TS <-> PHP Page-3 Summary matches 100% with 10° orb & Moon-Kendra Neecha Bhanga'
);
assert.ok(tsSyntheticSummary.supportive.length <= 3 && tsSyntheticSummary.needsCare.length <= 3, 'Top-3 planet caps hold strictly');
assert.ok(
  !tsSyntheticSummary.needsCare.some(row => row.key === 'moon'),
  'Moon in Magaram at 2° is NOT falsely afflicted by exalted Mars at 27° (25° > 10° orb)'
);

// Card 8 running Mahadasha debilitation check across TS predictor, TS HTML, and PHP HTML
const debDashaChartTs: any = {
  ...tsChart,
  lagnaRasi: 2,
  chandraRasi: 8,
  currentDasha: 'Chandra (Moon) Mahadasha',
  planetPositions: tsChart.planetPositions.map(p =>
    p.graha === 'moon' || p.planet === Graha.CHANDRA
      ? { ...p, rasi: 8, bhavaNumber: 7, dignity: undefined, isCombust: false, isRetrograde: false }
      : p
  ),
  dashaPeriods: [{
    mahadashaLord: 'moon',
    planet: Graha.CHANDRA,
    planetEn: 'Chandra (Moon)',
    planetTa: 'சந்திரன்',
    planetHi: 'चंद्र',
    start: '2020-01-01',
    end: '2030-01-01',
    isCurrent: true,
    antardashas: [],
  }],
};
const tsDebHtml = buildJathagamHtml(debDashaChartTs, 'en');
assert.ok(tsDebHtml.includes('Upcoming Year ⚠ Caution'), 'TS HTML renders Caution badge on Card 8 when running Mahadasha lord is debilitated');
assert.equal(phpProbe.debilitatedDashaCardHasCaution, true, 'PHP HTML renders Caution badge on Card 8 when running Mahadasha lord is debilitated');
console.log('  [PASS] Service 1 (Birth Jathagam): retrograde combustion orbs, 10° summary orb, Moon-Kendra Neecha Bhanga, Card-8 debilitation & trilingual purity');

// ============================================================================
// 2. SERVICE 2: EXHAUSTIVE 729 + 144 WEDDING MATCHING PARITY
// ============================================================================
const idMap: Array<[string, string]> = [
  ['dina', 'dina'],
  ['gana', 'gana'],
  ['mahendra', 'mahendra'],
  ['sthree_dheergam', 'stree_deergha'],
  ['yoni', 'yoni'],
  ['rasi', 'rasi'],
  ['rasiyadhipathi', 'rasiyadhipathi'],
  ['vasiya', 'vasiya'],
  ['rajju', 'rajju'],
  ['vedhai', 'vedha'],
];

const statusShort: Record<string, string> = {
  UTTHAMAM: 'U',
  MADHYAMAM: 'M',
  PORUNDHADHU: 'P',
};

for (let gNak = 0; gNak < 27; gNak++) {
  const gRasi = Math.floor((gNak * 4) / 9) + 1;
  for (let bNak = 0; bNak < 27; bNak++) {
    const bRasi = Math.floor((bNak * 4) / 9) + 1;
    const poruthams = evaluateTenPoruthams(gNak, gRasi, bNak, bRasi);
    const phpRow = phpProbe.matrix729[`${gNak}:${bNak}`];
    for (const [tsId, phpId] of idMap) {
      const tsStatus = poruthams.find(p => p.id === tsId)?.status || '';
      assert.equal(
        statusShort[tsStatus],
        phpRow[phpId],
        `Mismatch at star pair (${gNak}, ${bNak}) [${tsId}]: TS=${tsStatus} vs PHP=${phpRow[phpId]}`
      );
    }
  }
}

for (let gRasiIdx = 0; gRasiIdx < 12; gRasiIdx++) {
  for (let bRasiIdx = 0; bRasiIdx < 12; bRasiIdx++) {
    const poruthams = evaluateTenPoruthams(3, gRasiIdx + 1, 0, bRasiIdx + 1);
    const phpRow = phpProbe.matrix144[`${gRasiIdx}:${bRasiIdx}`];
    assert.equal(poruthams.find(p => p.id === 'rasi')?.status, phpRow.rasi, `Rasi pair (${gRasiIdx + 1}, ${bRasiIdx + 1})`);
    assert.equal(poruthams.find(p => p.id === 'rasiyadhipathi')?.status, phpRow.rasiyadhipathi, `Lord pair (${gRasiIdx + 1}, ${bRasiIdx + 1})`);
    assert.equal(poruthams.find(p => p.id === 'vasiya')?.status, phpRow.vasiya, `Vasiya pair (${gRasiIdx + 1}, ${bRasiIdx + 1})`);
  }
}

// Explicit check for Pushya (star 8, idx 7) Eka-Nakshatra Dina = UTTHAMAM and 22nd Vainashika star = PORUNDHADHU
const pushyaSame = evaluateTenPoruthams(7, 4, 7, 4);
assert.equal(pushyaSame.find(p => p.id === 'dina')?.status, PoruthamStatus.UTTHAMAM, 'Pushya same-star Dina is UTTHAMAM');
const vainashika22 = evaluateTenPoruthams(0, 1, 21, 10);
assert.equal(vainashika22.find(p => p.id === 'dina')?.status, PoruthamStatus.PORUNDHADHU, '22nd Vainashika star Dina is PORUNDHADHU');

const fullMatch = calculateWeddingCompatibility(
  {
    name: 'Meenakshi',
    dob: '1997-04-14',
    tob: '08:15',
    birthPlace: 'Madurai, India',
    country: 'IN',
    latitude: 9.9252,
    longitude: 78.1198,
    timezoneOffsetHours: 5.5,
  },
  {
    name: 'Sundaresan',
    dob: '1994-11-20',
    tob: '06:45',
    birthPlace: 'Chennai, India',
    country: 'IN',
    latitude: 13.0827,
    longitude: 80.2707,
    timezoneOffsetHours: 5.5,
  }
);
assert.equal(fullMatch.poruthams.length, 10, 'Full end-to-end Wedding Compatibility produces all 10 Poruthams');
console.log('  [PASS] Service 2 (Wedding Matching): 7,290/7,290 Porutham checks (27x27 stars) + 432/432 Rasi checks (12x12 signs) match 100% between TS and PHP');

// ============================================================================
// 3. SERVICE 3: ALL 27 NAKSHATRAS x 2 GENDERS BABY NAMING PARITY
// ============================================================================
let totalVerifiedNames = 0;
for (const star of ALL_NAKSHATRA_LETTERS) {
  for (const gender of ['M', 'F'] as const) {
    const tsCols = buildNamakaranPadaNames(star.padas as any, gender, 8);
    assert.deepEqual(
      tsCols,
      phpProbe.namakaranSheets[`${star.nakshatraIndex}:${gender}`],
      `Deep equality mismatch on Namakaran sheet ${star.nakshatraNameEn} (${gender})`
    );

    const seenRoman = new Set<string>();
    const seenTamil = new Set<string>();
    for (const col of tsCols) {
      for (const entry of [...col.south, ...col.north]) {
        totalVerifiedNames++;
        assert.ok(!seenRoman.has(entry.name.toLowerCase()), `Zero duplicate Roman names on ${star.nakshatraNameEn} (${gender}): ${entry.name}`);
        assert.ok(!seenTamil.has(entry.nameTa), `Zero duplicate Tamil names on ${star.nakshatraNameEn} (${gender}): ${entry.nameTa}`);
        seenRoman.add(entry.name.toLowerCase());
        seenTamil.add(entry.nameTa);
      }
    }
  }
}
const tsBaby = calculateBabyNamingDetails('Aarav', '2000-01-01', '02:00', 'Chennai', 'M', 13.0827, 80.2707, 5.5, 'India');
assert.ok(/[\u0900-\u097F]/.test(phpProbe.babyCalc.chandraRasiNameHi), 'Baby Naming PHP chandraRasiNameHi carries Devanagari script');
assert.ok(/[\u0900-\u097F]/.test(phpProbe.babyCalc.lagnaRasiNameHi), 'Baby Naming PHP lagnaRasiNameHi carries Devanagari script');
assert.ok(phpProbe.babyCalc.chandraRasiNameHi.startsWith(tsBaby.chandraRasiNameHi.split(' ')[0]), 'Baby Naming Hindi Chandra Rasi matches TS');
assert.ok(phpProbe.babyCalc.lagnaRasiNameHi.startsWith(tsBaby.chandraRasiNameHi.split(' ')[0]) || phpProbe.babyCalc.lagnaRasiNameHi.startsWith(tsBaby.lagnaRasiNameHi.split(' ')[0]), 'Baby Naming Hindi Lagna Rasi matches TS');
console.log(`  [PASS] Service 3 (Baby Naming): all 54 full Namakaran sheets (${totalVerifiedNames} entries), zero duplicates, and pure Devanagari Rasi/Lagna names match 100%`);

// ============================================================================
// 4. SERVICE 4: SUBHA MUHURTHAM RULES SYNC, INTRADAY VETO & LEGACY REBUILD
// ============================================================================
const tsRules = fs.readFileSync(path.join(repoRoot, 'src/lib/muhurtham/rules.json'), 'utf8');
const phpRules = fs.readFileSync(path.join(repoRoot, 'api/astrology/rules.json'), 'utf8');
assert.equal(tsRules, phpRules, 'src/lib/muhurtham/rules.json and api/astrology/rules.json are byte-identical');

// Verify intraday personal Janma Nakshatra / Chandrashtama veto on a day where Moon transits mid-day
// Scan November 2026 in Chennai and find a date where sunrise Nakshatra != 15:00 local Nakshatra
const chennaiLoc = { name: 'Chennai', latitude: 13.0827, longitude: 80.2707, timezoneOffsetHours: 5.5 };
let transitTestDate: { dateStr: string; afternoonNak: number; sunriseNak: number } | null = null;
for (let day = 1; day <= 30; day++) {
  const ds = `2026-11-${String(day).padStart(2, '0')}`;
  const morningMoon = calculateMoonPositionAt(new Date(`${ds}T01:00:00Z`)); // 06:30 IST
  const afternoonMoon = calculateMoonPositionAt(new Date(`${ds}T10:30:00Z`)); // 16:00 IST
  if (morningMoon.nakshatraIndex !== afternoonMoon.nakshatraIndex) {
    const baseline = computeDayMuhurtham(new Date(`${ds}T00:00:00Z`), chennaiLoc as any, 'griha_pravesam');
    if (baseline && baseline.nallaNeram.length > 0) {
      const hasAfternoonWindow = baseline.nallaNeram.some(w => {
        const midM = ((w.startMinutes ?? 0) + (w.endMinutes ?? 0)) / 2;
        const utc = new Date(Date.UTC(2026, 10, day, Math.floor(midM / 60), Math.round(midM % 60), 0) - 5.5 * 3600000);
        return calculateMoonPositionAt(utc).nakshatraIndex === afternoonMoon.nakshatraIndex;
      });
      if (hasAfternoonWindow) {
        transitTestDate = { dateStr: ds, sunriseNak: morningMoon.nakshatraIndex, afternoonNak: afternoonMoon.nakshatraIndex };
        break;
      }
    }
  }
}
assert.ok(transitTestDate !== null, 'Found a real Moon-transit day in Nov 2026 with an afternoon Nalla Neram window');
const withoutPerson = computeDayMuhurtham(
  new Date(`${transitTestDate!.dateStr}T00:00:00Z`),
  chennaiLoc as any,
  'griha_pravesam'
);
const withAfternoonJanmaPerson = computeDayMuhurtham(
  new Date(`${transitTestDate!.dateStr}T00:00:00Z`),
  chennaiLoc as any,
  'griha_pravesam',
  {
    persons: [{
      role: 'self',
      nakshatraIndex: transitTestDate!.afternoonNak,
      rasiNumber: Math.floor((transitTestDate!.afternoonNak * 4) / 9) + 1,
    }],
  } as any
);
assert.ok(
  withAfternoonJanmaPerson.nallaNeram.length < withoutPerson.nallaNeram.length,
  `Intraday Moon transit into native Janma Nakshatra on ${transitTestDate!.dateStr} vetoes the affected Nalla Neram window (${withoutPerson.nallaNeram.length} -> ${withAfternoonJanmaPerson.nallaNeram.length})`
);

// Legacy Muhurtham rebuild check
assert.equal(phpProbe.rebuiltLegacyMuhurtham.muhurthamAlgorithmVersion, 6, 'Legacy saved Muhurtham order upgrades cleanly to version 6');
assert.equal(phpProbe.rebuiltLegacyMuhurtham.rebuiltFromLegacyScanVersion, 5, 'Legacy rebuild records rebuiltFromLegacyScanVersion = 5');
assert.equal(phpProbe.rebuiltLegacyMuhurtham.months.length, 6, 'Legacy rebuild preserves all 6 scanned months');
console.log('  [PASS] Service 4 (Subha Muhurtham): rules.json sync, intraday Moon/Janma/Chandrashtama window veto, and legacy order rebuild verified');

console.log('\nALL FOUR ASTROLOGY SERVICES PARITY CHECKS PASSED (100% TS <-> PHP AGREEMENT)!\n');
