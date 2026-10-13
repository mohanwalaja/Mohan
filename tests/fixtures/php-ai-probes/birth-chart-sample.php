<?php
/**
 * Probe: full-precision engine values for the Birth Jathagam sample chart.
 *
 * Priya Devi, 15-06-1998, 06:30 IST, Chennai (13.0827 N, 80.2707 E, UTC+5:30)
 * -> 1998-06-15 01:00:00 UT, JD 2450979.5416667.
 *
 * Executed by tests/birth-jathagam-sample.test.ts through
 * scripts/php-ai-provider-check.mjs (PHP-WASM), which mounts the real
 * api/astrology/engine.php + ephemeris_tables.php. The harness copies
 * /repo/out.json to the path given by --emit.
 */
require __DIR__ . '/../../../api/astrology/engine.php';

$payload = [
    'name' => 'Priya Devi',
    'dob' => '1998-06-15',
    'tob' => '06:30',
    'birthPlace' => 'Chennai, Tamil Nadu, India',
    'country' => 'India',
    'latitude' => 13.0827,
    'longitude' => 80.2707,
    'timezoneOffsetHours' => 5.5,
    'timeZoneId' => 'Asia/Kolkata',
    'gender' => 'F',
];

$instant = AstroEngine::resolveBirthInstant($payload);
if (($instant['ok'] ?? false) !== true) {
    fwrite(STDERR, 'resolveBirthInstant failed: ' . (string) ($instant['error'] ?? 'unknown') . "\n");
    exit(1);
}
$julianDay = ($instant['timestamp'] / 86400.0) + 2440587.5;

$eph = AstroEngine::computeGeocentricPositions($julianDay);
$asc = AstroEngine::computeAscendant($julianDay, 13.0827, 80.2707, $eph);
$horoscope = AstroEngine::calculateHoroscope($payload);

$retrograde = [];
foreach (($horoscope['planetPositions'] ?? []) as $planet) {
    $retrograde[$planet['graha']] = (bool) $planet['isRetrograde'];
}

$lagnaDisplay = null;
foreach (($horoscope['planets'] ?? []) as $planet) {
    if (($planet['name'] ?? '') === 'Lagna') {
        $lagnaDisplay = $planet;
    }
}

$out = [
    'jdUt' => $julianDay,
    'offsetHours' => $instant['offsetHours'],
    'nodeType' => $eph['nodeType'],
    'ayanamsaTrue' => $eph['ayanamsa'],
    'ayanamsaMean' => $eph['ayanamsaMean'],
    'deltaT' => $eph['deltaT'],
    'sidereal' => $eph['sidereal'],
    'speed' => $eph['speed'],
    'ascendant' => $asc,
    'lagnaSign' => $horoscope['lagna']['rasi'] ?? null,
    'lagnaDisplayDegree' => $lagnaDisplay['degree'] ?? null,
    'retrograde' => $retrograde,
];

$json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
echo $json, "\n";
file_put_contents('/repo/out.json', $json);
