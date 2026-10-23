<?php
/**
 * ASTRO SIVAM — Pure-PHP VSOP87 / ELP2000-82 / Lahiri Ephemeris Core
 */

trait AstroEngineEphemerisTrait
{
    // =====================================================================
    //  Ephemeris core — pure PHP (8.1+), no binary dependencies.
    //
    //  Accuracy versus Swiss Ephemeris 2.10 (Lahiri sidereal, 1900–2100):
    //    Sun ≈ 1″, Moon ≤ 15″ (target ±0.01° = 36″), Mercury–Saturn ≈ 1–3″,
    //    Rahu (osculating true node) ≈ 1′, Lahiri ayanamsa < 0.01″.
    //  See scripts/php-ephemeris-accuracy.php for the verification harness.
    //
    //  Models:
    //    • Time scale ........ UT → TT via observed ΔT table (1900–2026) with
    //                          projection beyond the table.
    //    • Sun & planets ..... VSOP87D heliocentric series (Bretagnon &
    //                          Francou 1988) truncated to ~1″, geocentric
    //                          reduction with light-time + aberration.
    //    • Moon .............. ELP2000-82 periodic terms (Meeus Tables
    //                          47.A/47.B, 60 + 60 terms, E-factor and the
    //                          A1/A2/A3 planetary & flattening terms).
    //    • Nutation .......... IAU 1980, full 63-term Δψ / Δε series.
    //    • Ayanamsa .......... Chitra Paksha (Lahiri): J2000 constant +
    //                          IAU 2006 general precession p_A, plus Δψ for
    //                          the true ayanamsa shown by Drik Panchang /
    //                          swe_get_ayanamsa_ex().
    //    • Rahu/Ketu ......... osculating ("true") node from the lunar
    //                          state vector r × v, like SE_TRUE_NODE.
    // =====================================================================

    private static function getCombustionLimit(string $graha, bool $isRetrograde = false): float {
        if ($graha === 'mercury') return $isRetrograde ? 12.0 : 14.0;
        if ($graha === 'venus') return $isRetrograde ? 8.0 : 10.0;
        return self::COMBUSTION_LIMITS[$graha] ?? 0.0;
    }

    /**
     * Which lunar node convention Rahu uses: 'TRUE' (osculating node, the
     * Swiss Ephemeris SE_TRUE_NODE / Drik Panchang default) or 'MEAN'. The two
     * differ by up to ≈1°45′, so the choice is a single global setting:
     *   1. AstroEngine::setNodeType() runtime override,
     *   2. the ASTRO_RAHU_NODE_TYPE constant defined in api/config.php,
     *   3. the ASTRO_RAHU_NODE_TYPE environment variable,
     *   4. 'MEAN' (classical default, matching TypeScript).
     * engine.php never loads config.php itself (that file emits HTTP headers
     * and starts sessions), so the constant is consulted only when defined.
     * The default is MEAN (the classical, always-retrograde convention) and
     * matches the TypeScript engine's ASTRO_RAHU_NODE_TYPE default; unknown values
     * fall back to MEAN and are logged once per process.
     */
    public static function nodeType(): string {
        if (self::$nodeTypeOverride !== null) {
            return self::$nodeTypeOverride;
        }
        $configured = null;
        if (defined('ASTRO_RAHU_NODE_TYPE')) {
            $configured = constant('ASTRO_RAHU_NODE_TYPE');
        } else {
            $env = getenv('ASTRO_RAHU_NODE_TYPE');
            if (is_string($env) && trim($env) !== '') {
                $configured = $env;
            }
        }
        if ($configured === null) {
            return self::NODE_TYPE_MEAN;
        }
        $normalized = self::normalizeNodeType($configured);
        if ($normalized === null) {
            static $warned = false;
            if (!$warned) {
                $warned = true;
                error_log('AstroEngine: invalid ASTRO_RAHU_NODE_TYPE "' . (string) $configured . '"; expected TRUE or MEAN. Using MEAN.');
            }
            return self::NODE_TYPE_MEAN;
        }
        return $normalized;
    }

    /**
     * Override the configured node type for the rest of the process (pass
     * null to return to the config.php / environment setting).
     * @throws InvalidArgumentException for anything other than TRUE / MEAN
     */
    public static function setNodeType(?string $type): void {
        if ($type === null) {
            self::$nodeTypeOverride = null;
            return;
        }
        $normalized = self::normalizeNodeType($type);
        if ($normalized === null) {
            throw new InvalidArgumentException("Unsupported Rahu node type '{$type}'; expected 'TRUE' or 'MEAN'.");
        }
        self::$nodeTypeOverride = $normalized;
    }

    /** Accepts TRUE/MEAN case-insensitively (also 'OSCULATING' as an alias of TRUE); null when invalid. */
    private static function normalizeNodeType($value): ?string {
        if (!is_string($value)) return null;
        $v = strtoupper(trim($value));
        if ($v === self::NODE_TYPE_TRUE || $v === 'OSCULATING') return self::NODE_TYPE_TRUE;
        if ($v === self::NODE_TYPE_MEAN) return self::NODE_TYPE_MEAN;
        return null;
    }

    /** Lazily load the generated coefficient tables (api/astrology/ephemeris_tables.php). */
    private static function ephemerisTables(): array {
        if (self::$ephemerisTables === null) {
            $path = dirname(__DIR__) . '/ephemeris_tables.php';
            $tables = is_file($path) ? require $path : null;
            if (!is_array($tables) || empty($tables['vsop87']) || empty($tables['moonLR'])
                || empty($tables['moonB']) || empty($tables['nutation']) || empty($tables['deltaT'])) {
                throw new RuntimeException('Ephemeris coefficient tables are missing or corrupt: ' . $path);
            }
            self::$ephemerisTables = $tables;
        }
        return self::$ephemerisTables;
    }

    private static function norm360($x) {
        $x = fmod($x, 360.0);
        if ($x < 0) $x += 360.0;
        return $x;
    }

    /** Signed angular difference a − b folded into (−180°, +180°]. */
    private static function angleDelta(float $a, float $b): float {
        $d = fmod($a - $b + 540.0, 360.0);
        if ($d < 0) $d += 360.0;
        return $d - 180.0;
    }

    // ---------------------------------------------------------------------
    //  Time scale
    // ---------------------------------------------------------------------

    /**
     * ΔT = TT − UT in seconds. Observed annual values 1900–2026 are linearly
     * interpolated; later dates use a gentle quadratic projection that agrees
     * with the Swiss Ephemeris 2.10 extrapolation to ≈0.5 s through 2100;
     * earlier dates fall back to the Espenak–Meeus (NASA) polynomials.
     * Using TT instead of UT matters: ΔT ≈ 69 s moves the Moon by ≈ 38″.
     */
    public static function deltaT(float $jdUt): float {
        $tables = self::ephemerisTables();
        $values = $tables['deltaT'];
        $startYear = (int) $tables['deltaTStartYear'];
        $count = count($values);
        $endYear = $startYear + $count - 1;
        $year = 2000.0 + ($jdUt - 2451544.5) / 365.2425;

        if ($year >= $startYear && $year <= $endYear) {
            $i = (int) floor($year - $startYear);
            if ($i >= $count - 1) $i = $count - 2;
            $f = ($year - $startYear) - $i;
            return $values[$i] + ($values[$i + 1] - $values[$i]) * $f;
        }
        if ($year > $endYear) {
            $t = $year - $endYear;
            return $values[$count - 1] + 0.1919 * $t + 0.001854 * $t * $t;
        }
        if ($year >= 1860) {
            $t = $year - 1860;
            return 7.62 + 0.5737 * $t - 0.251754 * $t ** 2 + 0.01680668 * $t ** 3 - 0.0004473624 * $t ** 4 + $t ** 5 / 233174.0;
        }
        if ($year >= 1800) {
            $t = $year - 1800;
            return 13.72 - 0.332447 * $t + 0.0068612 * $t ** 2 + 0.0041116 * $t ** 3 - 0.00037436 * $t ** 4
                + 0.0000121272 * $t ** 5 - 0.0000001699 * $t ** 6 + 0.000000000875 * $t ** 7;
        }
        $u = ($year - 1820.0) / 100.0;
        return -20.0 + 32.0 * $u * $u;
    }

    /** Julian Day in Terrestrial Time from a Julian Day in UT. */
    public static function julianDayTT(float $jdUt): float {
        return $jdUt + self::deltaT($jdUt) / 86400.0;
    }

    // ---------------------------------------------------------------------
    //  Nutation, obliquity, ayanamsa
    // ---------------------------------------------------------------------

    /**
     * IAU 1980 nutation, full 63-term series (Meeus ch. 22 / Table 22.A).
     * @param  float $T Julian centuries TT from J2000.0
     * @return array{dpsi: float, deps: float} degrees (Δψ in longitude, Δε in obliquity)
     */
    public static function nutation(float $T): array {
        $T2 = $T * $T;
        $T3 = $T2 * $T;
        $D  = deg2rad(self::norm360(297.85036 + 445267.111480 * $T - 0.0019142 * $T2 + $T3 / 189474.0));
        $M  = deg2rad(self::norm360(357.52772 + 35999.050340 * $T - 0.0001603 * $T2 - $T3 / 300000.0));
        $Mp = deg2rad(self::norm360(134.96298 + 477198.867398 * $T + 0.0086972 * $T2 + $T3 / 56250.0));
        $F  = deg2rad(self::norm360(93.27191 + 483202.017538 * $T - 0.0036825 * $T2 + $T3 / 327270.0));
        $Om = deg2rad(self::norm360(125.04452 - 1934.136261 * $T + 0.0020708 * $T2 + $T3 / 450000.0));

        $dpsi = 0.0;
        $deps = 0.0;
        foreach (self::ephemerisTables()['nutation'] as $row) {
            $arg = $row[0] * $D + $row[1] * $M + $row[2] * $Mp + $row[3] * $F + $row[4] * $Om;
            $dpsi += ($row[5] + $row[6] * $T) * sin($arg);
            $deps += ($row[7] + $row[8] * $T) * cos($arg);
        }
        // Coefficients are in units of 0.0001 arcsecond.
        return ['dpsi' => $dpsi * 0.0001 / 3600.0, 'deps' => $deps * 0.0001 / 3600.0];
    }

    /** Mean obliquity of the ecliptic (Laskar 1986, Meeus 22.3), degrees. */
    public static function meanObliquity(float $T): float {
        $U = $T / 100.0;
        $seconds = 84381.448
            + $U * (-4680.93 + $U * (-1.55 + $U * (1999.25 + $U * (-51.38 + $U * (-249.67
            + $U * (-39.05 + $U * (7.12 + $U * (27.87 + $U * (5.79 + $U * 2.45)))))))));
        return $seconds / 3600.0;
    }

    /**
     * Chitra Paksha / Lahiri MEAN ayanamsa (no nutation), degrees.
     * Growth follows the IAU 2006 general precession in longitude
     * p_A = 5028.796195″T + 1.1054348″T² + 0.00007964″T³ − 0.000023857″T⁴ − 0.0000000383″T⁵.
     * Reproduces Swiss Ephemeris SIDM_LAHIRI (swe_get_ayanamsa_ut) to < 0.001″ for 1800–2200.
     * @param float $T Julian centuries TT from J2000.0
     */
    public static function lahiriAyanamsaMean(float $T): float {
        $pA = (((((-0.0000000383 * $T) - 0.000023857) * $T + 0.00007964) * $T + 1.1054348) * $T + 5028.796195) * $T;
        return self::LAHIRI_AYANAMSA_J2000 + $pA / 3600.0;
    }

    /**
     * TRUE Lahiri ayanamsa = mean ayanamsa + nutation in longitude (Δψ).
     * This is the value Drik Panchang displays and what swe_get_ayanamsa_ex_ut()
     * returns; subtract it from APPARENT (nutated) tropical longitudes.
     * @param float      $T    Julian centuries TT from J2000.0
     * @param float|null $dpsi Δψ in degrees when already known (avoids recomputing the series)
     */
    public static function lahiriAyanamsa(float $T, ?float $dpsi = null): float {
        if ($dpsi === null) $dpsi = self::nutation($T)['dpsi'];
        return self::lahiriAyanamsaMean($T) + $dpsi;
    }

    /** Convenience: true Lahiri ayanamsa for a UT Julian Day (handles ΔT internally). */
    public static function lahiriAyanamsaForJulianDayUT(float $jdUt): float {
        $T = (self::julianDayTT($jdUt) - self::J2000) / 36525.0;
        return self::lahiriAyanamsa($T);
    }

    // ---------------------------------------------------------------------
    //  Sun & planets — VSOP87D
    // ---------------------------------------------------------------------

    /**
     * Heliocentric spherical coordinates from the truncated VSOP87D series,
     * referred to the mean ecliptic and equinox of date.
     * @param  float $tau Julian millennia TT from J2000.0
     * @return array{0: float, 1: float, 2: float} [L rad, B rad, R AU]
     */
    private static function vsop87(string $planet, float $tau): array {
        $series = self::ephemerisTables()['vsop87'][$planet] ?? null;
        if ($series === null) {
            throw new InvalidArgumentException("No VSOP87 series for '{$planet}'.");
        }
        $out = [];
        foreach (['L', 'B', 'R'] as $key) {
            $sum = 0.0;
            $tn = 1.0;
            foreach ($series[$key] as $order) {
                $s = 0.0;
                foreach ($order as $term) {
                    $s += $term[0] * cos($term[1] + $term[2] * $tau);
                }
                $sum += $s * $tn;
                $tn *= $tau;
            }
            $out[] = $sum * 1e-8;
        }
        return $out;
    }

    /** Heliocentric rectangular coordinates (AU, mean ecliptic of date). */
    private static function heliocentricXYZ(string $planet, float $tau): array {
        [$L, $B, $R] = self::vsop87($planet, $tau);
        $cb = cos($B);
        return [$R * $cb * cos($L), $R * $cb * sin($L), $R * sin($B)];
    }

    /**
     * Meeus 32.3 — reduce VSOP87 dynamical-ecliptic longitudes to the FK5 frame
     * (≈ 0.09″). Returns [Δλ°, Δβ°].
     */
    private static function fk5Correction(float $lonDeg, float $latDeg, float $T): array {
        $Lp = deg2rad($lonDeg - 1.397 * $T - 0.00031 * $T * $T);
        $dLon = (-0.09033 + 0.03916 * (cos($Lp) + sin($Lp)) * tan(deg2rad($latDeg))) / 3600.0;
        $dLat = (0.03916 * (cos($Lp) - sin($Lp))) / 3600.0;
        return [$dLon, $dLat];
    }

    /**
     * Apparent geocentric Sun (light-time + aberration included, nutation NOT
     * included — longitudes are referred to the mean equinox of date so that
     * sidereal = λ − mean ayanamsa, identical to λ_apparent − true ayanamsa).
     * @return array{lon: float, lat: float, dist: float}
     */
    private static function sunGeocentric(float $jdTt): array {
        $T = ($jdTt - self::J2000) / 36525.0;
        [, , $R] = self::vsop87('earth', $T / 10.0);
        // Evaluate Earth at the retarded epoch t − τ: the direction −E(t − τ)
        // is the apparent direction corrected for both light-time and annual
        // aberration (−20.4898″/R) to first order in v/c.
        $tauRetarded = ($jdTt - self::LIGHT_TIME_PER_AU_DAYS * $R - self::J2000) / 365250.0;
        [$L, $B, $R] = self::vsop87('earth', $tauRetarded);
        $lon = self::norm360(rad2deg($L) + 180.0);
        $lat = -rad2deg($B);
        [$dLon, $dLat] = self::fk5Correction($lon, $lat, $T);
        return ['lon' => self::norm360($lon + $dLon), 'lat' => $lat + $dLat, 'dist' => $R];
    }

    /**
     * Apparent geocentric planet (light-time iterated, aberration included,
     * mean equinox of date). The planet AND the Earth are both evaluated at
     * the retarded instant t − τ, which yields the aberrated direction.
     * @return array{lon: float, lat: float, dist: float, lightTime: float}
     */
    private static function planetGeocentric(string $planet, float $jdTt): array {
        $T = ($jdTt - self::J2000) / 36525.0;
        $lightTime = 0.0;
        $x = $y = $z = 0.0;
        for ($i = 0; $i < 5; $i++) {
            $tau = ($jdTt - $lightTime - self::J2000) / 365250.0;
            [$xp, $yp, $zp] = self::heliocentricXYZ($planet, $tau);
            [$xe, $ye, $ze] = self::heliocentricXYZ('earth', $tau);
            $x = $xp - $xe;
            $y = $yp - $ye;
            $z = $zp - $ze;
            $delta = sqrt($x * $x + $y * $y + $z * $z);
            $next = self::LIGHT_TIME_PER_AU_DAYS * $delta;
            $converged = abs($next - $lightTime) < 1e-10;
            $lightTime = $next;
            if ($converged) break;
        }
        $delta = sqrt($x * $x + $y * $y + $z * $z);
        $lon = self::norm360(rad2deg(atan2($y, $x)));
        $lat = rad2deg(atan2($z, sqrt($x * $x + $y * $y)));
        [$dLon, $dLat] = self::fk5Correction($lon, $lat, $T);
        return ['lon' => self::norm360($lon + $dLon), 'lat' => $lat + $dLat, 'dist' => $delta, 'lightTime' => $lightTime];
    }

    // ---------------------------------------------------------------------
    //  Moon — ELP2000-82 (Meeus ch. 47)
    // ---------------------------------------------------------------------

    /**
     * Geometric geocentric Moon referred to the mean equinox of date.
     * Longitude accuracy ≈ 10″, latitude ≈ 4″, distance ≈ 4 km (Meeus).
     * @param  float $T Julian centuries TT from J2000.0
     * @return array{lon: float, lat: float, dist: float} degrees, degrees, km
     */
    private static function moonGeometric(float $T): array {
        $T2 = $T * $T;
        $T3 = $T2 * $T;
        $T4 = $T3 * $T;
        // Mean longitude, elongation, Sun/Moon anomalies, argument of latitude (47.1–47.5)
        $Lp = self::norm360(218.3164477 + 481267.88123421 * $T - 0.0015786 * $T2 + $T3 / 538841.0 - $T4 / 65194000.0);
        $D  = self::norm360(297.8501921 + 445267.1114034 * $T - 0.0018819 * $T2 + $T3 / 545868.0 - $T4 / 113065000.0);
        $M  = self::norm360(357.5291092 + 35999.0502909 * $T - 0.0001536 * $T2 + $T3 / 24490000.0);
        $Mp = self::norm360(134.9633964 + 477198.8675055 * $T + 0.0087414 * $T2 + $T3 / 69699.0 - $T4 / 14712000.0);
        $F  = self::norm360(93.2720950 + 483202.0175233 * $T - 0.0036539 * $T2 - $T3 / 3526000.0 + $T4 / 863310000.0);
        // Venus / Jupiter perturbations and Earth flattening arguments
        $A1 = deg2rad(self::norm360(119.75 + 131.849 * $T));
        $A2 = deg2rad(self::norm360(53.09 + 479264.290 * $T));
        $A3 = deg2rad(self::norm360(313.45 + 481266.484 * $T));
        // Secular decrease of the Earth's orbital eccentricity (47.6)
        $E = 1.0 - 0.002516 * $T - 0.0000074 * $T2;
        $E2 = $E * $E;

        $Dr = deg2rad($D); $Mr = deg2rad($M); $Mpr = deg2rad($Mp); $Fr = deg2rad($F); $Lpr = deg2rad($Lp);
        $tables = self::ephemerisTables();

        $sumL = 0.0;
        $sumR = 0.0;
        foreach ($tables['moonLR'] as $row) {
            $arg = $row[0] * $Dr + $row[1] * $Mr + $row[2] * $Mpr + $row[3] * $Fr;
            $m = (int) $row[1];
            $e = $m === 0 ? 1.0 : (abs($m) === 1 ? $E : $E2);
            $sumL += $row[4] * $e * sin($arg);
            $sumR += $row[5] * $e * cos($arg);
        }
        $sumB = 0.0;
        foreach ($tables['moonB'] as $row) {
            $arg = $row[0] * $Dr + $row[1] * $Mr + $row[2] * $Mpr + $row[3] * $Fr;
            $m = (int) $row[1];
            $e = $m === 0 ? 1.0 : (abs($m) === 1 ? $E : $E2);
            $sumB += $row[4] * $e * sin($arg);
        }
        $sumL += 3958.0 * sin($A1) + 1962.0 * sin($Lpr - $Fr) + 318.0 * sin($A2);
        $sumB += -2235.0 * sin($Lpr) + 382.0 * sin($A3) + 175.0 * sin($A1 - $Fr) + 175.0 * sin($A1 + $Fr)
            + 127.0 * sin($Lpr - $Mpr) - 115.0 * sin($Lpr + $Mpr);

        return [
            'lon' => self::norm360($Lp + $sumL / 1000000.0),
            'lat' => $sumB / 1000000.0,
            'dist' => 385000.56 + $sumR / 1000.0,
        ];
    }

    /**
     * Apparent geocentric Moon (mean equinox of date): the geometric position
     * retarded by the ≈1.3 s light-time (≈ 0.7″), matching Swiss Ephemeris'
     * default (non-SEFLG_TRUEPOS) convention.
     */
    private static function moonGeocentric(float $T): array {
        $geometric = self::moonGeometric($T);
        $lightTimeCenturies = ($geometric['dist'] / self::SPEED_OF_LIGHT_KM_PER_DAY) / 36525.0;
        return self::moonGeometric($T - $lightTimeCenturies);
    }

    /** Lunar geocentric rectangular position (km, mean ecliptic of date). */
    private static function moonXYZ(float $T): array {
        $m = self::moonGeometric($T);
        $lon = deg2rad($m['lon']);
        $lat = deg2rad($m['lat']);
        $cb = cos($lat);
        return [$m['dist'] * $cb * cos($lon), $m['dist'] * $cb * sin($lon), $m['dist'] * sin($lat)];
    }

    /**
     * Osculating ("true") ascending node of the Moon, degrees, mean equinox of
     * date — the SE_TRUE_NODE convention used by Drik Panchang. The node is
     * the direction ẑ × h of the instantaneous orbital plane, where
     * h = r × v is the specific angular momentum of the geocentric lunar
     * state vector (velocity by a central difference over ±0.01 day).
     * @param float $T Julian centuries TT from J2000.0
     */
    private static function moonOsculatingNode(float $T): float {
        $hDays = 0.01;
        $h = $hDays / 36525.0;
        [$x, $y, $z] = self::moonXYZ($T);
        [$x1, $y1, $z1] = self::moonXYZ($T - $h);
        [$x2, $y2, $z2] = self::moonXYZ($T + $h);
        $vx = ($x2 - $x1) / (2.0 * $hDays);
        $vy = ($y2 - $y1) / (2.0 * $hDays);
        $vz = ($z2 - $z1) / (2.0 * $hDays);
        $hx = $y * $vz - $z * $vy;
        $hy = $z * $vx - $x * $vz;
        return self::norm360(rad2deg(atan2($hx, -$hy)));
    }

    /** Mean ascending node of the lunar orbit (Meeus 47.7), degrees. */
    private static function meanLunarNode($T) {
        return self::norm360(125.0445479 - 1934.1362891 * $T + 0.0020754 * $T * $T + pow($T, 3) / 467441.0 - pow($T, 4) / 60616000.0);
    }

    // ---------------------------------------------------------------------
    //  Combined geocentric chart positions
    // ---------------------------------------------------------------------

    /**
     * Compute every chart body for a UT Julian Day.
     *
     * Returns tropical longitudes in two conventions plus sidereal (Lahiri):
     *   tropicalMean[]  — mean equinox of date (no nutation)
     *   tropical[]      — apparent / true equinox of date (Δψ added)
     *   sidereal[]      — tropical − ayanamsa(true) == tropicalMean − ayanamsa(mean)
     * together with latitudes, geocentric distances (AU; Moon in km), daily
     * sidereal motion (deg/day, negative when retrograde), the ayanamsa pair,
     * nutation and obliquity. Bodies: sun, moon, mercury, venus, mars,
     * jupiter, saturn, rahu, ketu, plus both node conventions as trueNode and
     * meanNode. 'rahu' is whichever convention $nodeType selects (default:
     * the ASTRO_RAHU_NODE_TYPE setting, see nodeType()); 'ketu' is always
     * exactly rahu + 180°. The convention used is echoed back as 'nodeType'.
     *
     * @param float       $jdUt      Julian Day (UT/UTC)
     * @param bool        $withSpeed Also evaluate ±0.5 day to derive daily motion / retrogression
     * @param string|null $nodeType  'TRUE' | 'MEAN' | null (= configured value)
     */
    public static function computeGeocentricPositions(float $jdUt, bool $withSpeed = true, ?string $nodeType = null): array {
        if (!is_finite($jdUt)) {
            throw new InvalidArgumentException('A finite Julian Day is required for ephemeris calculations.');
        }
        if ($nodeType === null) {
            $nodeType = self::nodeType();
        } else {
            $normalizedNodeType = self::normalizeNodeType($nodeType);
            if ($normalizedNodeType === null) {
                throw new InvalidArgumentException("Unsupported Rahu node type '{$nodeType}'; expected 'TRUE' or 'MEAN'.");
            }
            $nodeType = $normalizedNodeType;
        }
        $jdTt = self::julianDayTT($jdUt);
        $T = ($jdTt - self::J2000) / 36525.0;
        $nut = self::nutation($T);
        $epsMean = self::meanObliquity($T);
        $epsTrue = $epsMean + $nut['deps'];
        $ayanamsaMean = self::lahiriAyanamsaMean($T);
        $ayanamsaTrue = $ayanamsaMean + $nut['dpsi'];

        $mean = [];
        $lat = [];
        $dist = [];
        $sun = self::sunGeocentric($jdTt);
        $mean['sun'] = $sun['lon']; $lat['sun'] = $sun['lat']; $dist['sun'] = $sun['dist'];
        $moon = self::moonGeocentric($T);
        $mean['moon'] = $moon['lon']; $lat['moon'] = $moon['lat']; $dist['moon'] = $moon['dist'];
        foreach (['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as $planet) {
            $p = self::planetGeocentric($planet, $jdTt);
            $mean[$planet] = $p['lon']; $lat[$planet] = $p['lat']; $dist[$planet] = $p['dist'];
        }
        // Both node conventions are always evaluated so results can be audited;
        // Rahu follows the configured convention and Ketu is exactly opposite.
        $mean['trueNode'] = self::moonOsculatingNode($T);
        $mean['meanNode'] = self::meanLunarNode($T);
        $mean['rahu'] = $nodeType === self::NODE_TYPE_MEAN ? $mean['meanNode'] : $mean['trueNode'];
        $mean['ketu'] = self::norm360($mean['rahu'] + 180.0);
        $lat['rahu'] = $lat['ketu'] = $lat['trueNode'] = $lat['meanNode'] = 0.0;

        $tropical = [];
        $sidereal = [];
        foreach ($mean as $body => $lon) {
            $tropical[$body] = self::norm360($lon + $nut['dpsi']);
            $sidereal[$body] = self::norm360($lon - $ayanamsaMean);
        }

        $speed = [];
        if ($withSpeed) {
            // Centered ±0.5 day difference of SIDEREAL longitude: robust near
            // the stations of slow planets, identical to the TypeScript engine.
            $before = self::computeGeocentricPositions($jdUt - 0.5, false, $nodeType);
            $after = self::computeGeocentricPositions($jdUt + 0.5, false, $nodeType);
            foreach ($sidereal as $body => $_) {
                $speed[$body] = self::angleDelta($after['sidereal'][$body], $before['sidereal'][$body]);
            }
        }

        return [
            'jdUt' => $jdUt,
            'jdTt' => $jdTt,
            'deltaT' => ($jdTt - $jdUt) * 86400.0,
            'T' => $T,
            'nodeType' => $nodeType,
            'nutation' => $nut,
            'obliquity' => ['mean' => $epsMean, 'true' => $epsTrue],
            'ayanamsa' => $ayanamsaTrue,
            'ayanamsaMean' => $ayanamsaMean,
            'tropicalMean' => $mean,
            'tropical' => $tropical,
            'sidereal' => $sidereal,
            'latitude' => $lat,
            'distance' => $dist,
            'speed' => $speed,
        ];
    }

    /**
     * Sidereal (Lahiri) Ascendant. Uses apparent sidereal time (GMST + equation
     * of the equinoxes), the true obliquity and the true ayanamsa — the same
     * reduction Swiss Ephemeris applies in swe_houses_ex(SEFLG_SIDEREAL).
     * @param array $positions Result of computeGeocentricPositions() for the same instant
     * @return array{tropical: float, sidereal: float, ramc: float}
     */
    public static function computeAscendant(float $jdUt, float $latitudeDeg, float $longitudeDeg, array $positions): array {
        $d = $jdUt - self::J2000;
        $Tut = $d / 36525.0;
        $gmst = 280.46061837 + 360.98564736629 * $d + 0.000387933 * $Tut * $Tut - $Tut * $Tut * $Tut / 38710000.0;
        $epsTrue = deg2rad($positions['obliquity']['true']);
        $gast = $gmst + $positions['nutation']['dpsi'] * cos($epsTrue);
        $ramc = self::norm360($gast + $longitudeDeg);
        $ramcRad = deg2rad($ramc);
        $latRad = deg2rad($latitudeDeg);
        $ascTropical = self::norm360(rad2deg(atan2(cos($ramcRad),
            -(sin($ramcRad) * cos($epsTrue) + tan($latRad) * sin($epsTrue)))));
        return [
            'tropical' => $ascTropical,
            'sidereal' => self::norm360($ascTropical - $positions['ayanamsa']),
            'ramc' => $ramc,
        ];
    }

    // ---------------------------------------------------------------------
    //  Legacy wrappers (kept for callers that pass Julian centuries directly).
    //  $T is now interpreted as Julian centuries TT from J2000.0 and the
    //  returned longitudes are APPARENT tropical (true equinox of date).
    // ---------------------------------------------------------------------

    private static function sunTropicalLongitude($T) {
        $jdTt = self::J2000 + $T * 36525.0;
        return self::norm360(self::sunGeocentric($jdTt)['lon'] + self::nutation((float) $T)['dpsi']);
    }

    private static function moonTropicalLongitude($T) {
        return self::norm360(self::moonGeocentric((float) $T)['lon'] + self::nutation((float) $T)['dpsi']);
    }

    /** Osculating true node (apparent tropical longitude). Ignores ASTRO_RAHU_NODE_TYPE by design. */
    private static function trueLunarNode($T) {
        return self::norm360(self::moonOsculatingNode((float) $T) + self::nutation((float) $T)['dpsi']);
    }

    /**
     * Rahu's apparent tropical longitude under the configured (or given) node
     * convention — the single switch between trueLunarNode() and meanLunarNode().
     * Ketu is always rahuTropicalLongitude() + 180°.
     */
    private static function rahuTropicalLongitude($T, ?string $nodeType = null) {
        $nodeType = $nodeType === null ? self::nodeType() : (self::normalizeNodeType($nodeType) ?? self::NODE_TYPE_TRUE);
        if ($nodeType === self::NODE_TYPE_MEAN) {
            return self::norm360(self::meanLunarNode((float) $T) + self::nutation((float) $T)['dpsi']);
        }
        return self::trueLunarNode($T);
    }

    private static function planetGeocentricLongitude($key, $T) {
        $jdTt = self::J2000 + $T * 36525.0;
        return self::norm360(self::planetGeocentric($key, $jdTt)['lon'] + self::nutation((float) $T)['dpsi']);
    }

}
