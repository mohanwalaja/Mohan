/**
 * Birth Jathagam sample-chart regression — Priya Devi, 15-06-1998, 06:30 IST,
 * Chennai (13.0827 N, 80.2707 E, UTC+5:30) = 1998-06-15 01:00 UT,
 * JD 2450979.5416667.
 *
 * The test executes the REAL PHP engine (api/astrology/engine.php + generated
 * ephemeris_tables.php) through the existing PHP-WASM harness
 * (scripts/php-ai-provider-check.mjs), never a JavaScript reimplementation.
 * If @php-wasm/node is not installed, the test reports SKIPPED and exits 0 —
 * it does not claim to have passed.
 *
 * Independent references (all verified October 2026, tolerance 1.0 arcmin):
 *
 *  1. Sidereal longitudes — online Lahiri ephemerides (astro-seek and
 *     signsbystars, 15 Jun 1998 00:00 UT interpolated to 01:00 UT):
 *     Sun 59.907, Moon 299.053, Mars 51.545, Mercury 65.756, Venus 24.965,
 *     Jupiter 332.504, Saturn 6.704, Rahu 131.148.
 *  2. Lagna — astro-seek "Sidereal Astrology Calculator" (Lahiri ayanamsa)
 *     for the same date/time/place: Gemini 9°58′08″ = 69.9688889°. That form
 *     only accepts whole-arcminute coordinates (13°4′N 80°16′E), which is
 *     worth ≈0.62′ of the difference; Swiss Ephemeris at the exact engine
 *     coordinates gives 69.9785494°. Both are pinned below.
 *  3. Ayanamsa — Swiss Ephemeris 2.10.03 SIDM_LAHIRI true ayanamsa at
 *     1998-06-15 01:00 UT: 23.8333777° (mean 23.8354666°). The report prints
 *     23.8334° (4 dp).
 *  4. Node convention — the sample report says "Mean node (classical)": the
 *     chart must declare nodeType MEAN and Rahu must equal the mean node
 *     (Swiss SE_MEAN_NODE sidereal 131.1521986°), not the osculating node.
 *  5. Retrograde — astro-seek's 1998 retrograde calendar and its sidereal
 *     chart's Motion column for this instant: every classical planet is
 *     Direct (Mercury Rx Mar 27–Apr 20 and Jul 31–Aug 23; Venus Rx ended
 *     Feb 5; no Mars Rx in 1998; Jupiter Rx from Jul 18; Saturn Rx from
 *     Aug 15); only the lunar nodes are retrograde, as always.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'tests', 'fixtures', 'php-ai-probes', 'out-birth-chart-sample.json');

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the Birth Jathagam sample-chart PHP check did not run.');
  console.log('         npm install --no-save @php-wasm/node @php-wasm/universal');
  console.log('\n[OK] birth-jathagam sample chart: skipped');
  process.exit(0);
}

fs.rmSync(OUT, { force: true });
const run = spawnSync(
  process.execPath,
  [
    path.join(root, 'scripts', 'php-ai-provider-check.mjs'),
    'tests/fixtures/php-ai-probes/birth-chart-sample.php',
    '--emit',
    OUT
  ],
  { cwd: root, encoding: 'utf8', timeout: 180000 }
);
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(run.stderr);
  throw new Error(`birth-chart-sample.php exited with status ${run.status}`);
}
assert.ok(fs.existsSync(OUT), 'birth-chart-sample.php must write its output file');
const out = JSON.parse(fs.readFileSync(OUT, 'utf8')) as {
  jdUt: number;
  offsetHours: number;
  nodeType: string;
  ayanamsaTrue: number;
  ayanamsaMean: number;
  sidereal: Record<string, number>;
  speed: Record<string, number>;
  ascendant: { tropical: number; sidereal: number; ramc: number };
  lagnaSign: string;
  lagnaDisplayDegree: number;
  retrograde: Record<string, boolean>;
};

const ARC_MIN = 1 / 60; // 1.0 arcminute tolerance
const angularDifference = (actual: number, expected: number): number => {
  const raw = (actual - expected) % 360;
  const folded = raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
  return Math.abs(folded);
};
const arcmin = (deltaDeg: number): string => `${(deltaDeg * 60).toFixed(3)}′`;

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

check('the probe resolves the exact sample instant (06:30 IST = 01:00 UT)', () => {
  assert.ok(
    Math.abs(out.jdUt - 2450979.5416667) < 1e-6,
    `JD(UT) should be 2450979.5416667, got ${out.jdUt}`
  );
  assert.equal(out.offsetHours, 5.5, 'Asia/Kolkata offset must be +05:30');
});

// 1. Sidereal longitudes pinned to the online Lahiri ephemeris values.
const EXPECTED_SIDEREAL: Record<string, number> = {
  sun: 59.907,
  moon: 299.053,
  mars: 51.545,
  mercury: 65.756,
  venus: 24.965,
  jupiter: 332.504,
  saturn: 6.704,
  rahu: 131.148
};
for (const [body, expected] of Object.entries(EXPECTED_SIDEREAL)) {
  check(`${body} sidereal longitude stays within 1.0′ of the online ephemeris`, () => {
    assert.ok(out.sidereal[body] !== undefined, `${body} missing from engine output`);
    const delta = angularDifference(out.sidereal[body], expected);
    assert.ok(
      delta <= ARC_MIN,
      `${body}: engine ${out.sidereal[body]}° vs reference ${expected}° = ${arcmin(delta)} (limit 1.000′)`
    );
  });
}

// 2. Lagna from steps above: online Lahiri calculator + Swiss at exact coords.
check('Lagna stays within 1.0′ of the astro-seek Lahiri ascendant (Gemini 9°58′08″)', () => {
  const astroSeek = 69.9688889;
  const delta = angularDifference(out.ascendant.sidereal, astroSeek);
  assert.ok(
    delta <= ARC_MIN,
    `ascendant ${out.ascendant.sidereal}° vs astro-seek ${astroSeek}° = ${arcmin(delta)} (limit 1.000′)`
  );
});
check('Lagna stays within 1.0′ of the Swiss Ephemeris Lahiri ascendant at the exact coordinates', () => {
  const swiss = 69.9785494;
  const delta = angularDifference(out.ascendant.sidereal, swiss);
  assert.ok(
    delta <= ARC_MIN,
    `ascendant ${out.ascendant.sidereal}° vs Swiss ${swiss}° = ${arcmin(delta)} (limit 1.000′)`
  );
});
check('Lagna is Mithunam at the displayed degree', () => {
  assert.equal(out.lagnaSign, 'Mithunam (Gemini)');
  assert.equal(out.lagnaDisplayDegree, 9.98, 'displayed Lagna degree rounds to 9.98°');
});

// 3. Ayanamsa: report value 23.8334° vs Swiss Ephemeris SIDM_LAHIRI (true).
check('true Lahiri ayanamsa stays within 1.0′ of the reported 23.8334°', () => {
  const delta = Math.abs(out.ayanamsaTrue - 23.8334);
  assert.ok(
    delta <= ARC_MIN,
    `ayanamsa ${out.ayanamsaTrue}° vs 23.8334° = ${arcmin(delta)} (limit 1.000′)`
  );
});
check('true Lahiri ayanamsa stays within 1.0′ of the Swiss Ephemeris value for 1998-06-15 01:00 UT', () => {
  const swissTrue = 23.8333777;
  const swissMean = 23.8354666;
  const deltaTrue = Math.abs(out.ayanamsaTrue - swissTrue);
  assert.ok(
    deltaTrue <= ARC_MIN,
    `ayanamsa(true) ${out.ayanamsaTrue}° vs Swiss ${swissTrue}° = ${arcmin(deltaTrue)} (limit 1.000′)`
  );
  const deltaMean = Math.abs(out.ayanamsaMean - swissMean);
  assert.ok(
    deltaMean <= ARC_MIN,
    `ayanamsa(mean) ${out.ayanamsaMean}° vs Swiss ${swissMean}° = ${arcmin(deltaMean)} (limit 1.000′)`
  );
});

// 4. Node convention: the report says "Mean node (classical)".
check('the chart declares the classical MEAN node and Rahu equals the mean node', () => {
  assert.equal(out.nodeType, 'MEAN', 'sample chart must use the MEAN node convention');
  const deltaMean = angularDifference(out.sidereal.rahu, out.sidereal.meanNode);
  assert.ok(
    deltaMean < 1e-9,
    `Rahu ${out.sidereal.rahu}° must equal the mean node ${out.sidereal.meanNode}°`
  );
  const swissMeanNode = 131.1521986; // Swiss Ephemeris SE_MEAN_NODE, Lahiri, 1998-06-15 01:00 UT
  const deltaRef = angularDifference(out.sidereal.rahu, swissMeanNode);
  assert.ok(
    deltaRef <= ARC_MIN,
    `Rahu ${out.sidereal.rahu}° vs Swiss mean node ${swissMeanNode}° = ${arcmin(deltaRef)} (limit 1.000′)`
  );
  const trueNodeDelta = angularDifference(out.sidereal.rahu, out.sidereal.trueNode);
  assert.ok(
    trueNodeDelta > 1.0,
    `mean and osculating nodes must stay distinguishable (${arcmin(trueNodeDelta)} apart)`
  );
  const ketuDelta = angularDifference(out.sidereal.ketu, out.sidereal.rahu + 180);
  assert.ok(ketuDelta < 1e-9, 'Ketu must stay exactly opposite Rahu');
});

// 5. Retrograde flags/speeds: only the nodes are retrograde on this date.
check('only the nodes are flagged retrograde for 15 Jun 1998', () => {
  const expected: Record<string, boolean> = {
    sun: false,
    moon: false,
    mars: false,
    mercury: false,
    jupiter: false,
    venus: false,
    saturn: false,
    rahu: true,
    ketu: true
  };
  assert.deepEqual(out.retrograde, expected, 'retrograde flags drifted from the reference');
});
check('daily motion signs agree: classical planets direct, nodes retrograde', () => {
  for (const body of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    assert.ok(out.speed[body] > 0, `${body} should move forward (speed ${out.speed[body]}°/day)`);
  }
  assert.ok(out.speed.rahu < 0, `rahu should be retrograde (speed ${out.speed.rahu}°/day)`);
  assert.ok(out.speed.ketu < 0, `ketu should be retrograde (speed ${out.speed.ketu}°/day)`);
});

if (!process.exitCode) console.log(`\n[OK] birth-jathagam sample chart: ${passed} checks passed`);
