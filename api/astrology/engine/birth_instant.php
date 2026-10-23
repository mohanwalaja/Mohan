<?php
/**
 * ASTRO SIVAM — Birth Date/Time Validation, Coordinate IANA Lookup & Instant Resolution
 */

trait AstroEngineBirthInstantTrait
{
    /** Validate the strict ISO calendar portion without silently normalising overflow dates. */
    public static function isValidBirthDate($value): bool {
        $dob = trim((string) $value);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dob, $match)) {
            return false;
        }
        $year = (int) $match[1];
        $month = (int) $match[2];
        $day = (int) $match[3];
        return $year >= 1900 && $year <= 2100 && checkdate($month, $day, $year);
    }

    /** Normalize supported birth-time inputs to the engine's canonical HH:MM. */
    public static function normalizeBirthTime($value): ?string {
        $time = trim((string) $value);
        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $time, $match)) {
            $hour = (int) $match[1];
            $minute = (int) $match[2];
            $second = isset($match[3]) ? (int) $match[3] : 0;
            if ($hour > 23 || $minute > 59 || $second > 59) {
                return null;
            }
            return sprintf('%02d:%02d', $hour, $minute);
        }
        if (preg_match('/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i', $time, $match)) {
            $hour = (int) $match[1];
            $minute = (int) $match[2];
            if ($hour < 1 || $hour > 12 || $minute > 59) {
                return null;
            }
            $meridian = strtoupper($match[3]);
            $hour = ($hour % 12) + ($meridian === 'PM' ? 12 : 0);
            return sprintf('%02d:%02d', $hour, $minute);
        }
        return null;
    }

    /**
     * IANA identifiers PHP can evaluate with full historical DST rules.
     * Abbreviations such as "EST"/"IST" are deliberately not accepted: they
     * carry no region-specific transition history.
     */
    public static function isValidIanaTimeZoneId($value): bool {
        $id = is_string($value) ? trim($value) : '';
        if ($id === '' || strlen($id) > 64 || !preg_match('#^[A-Za-z0-9_+\-/]+$#', $id)) {
            return false;
        }
        // PHP's backward-compatible list still contains fixed abbreviations
        // (EST, HST, CET, GB, PRC, ...). Only Area/Location identifiers
        // (including Etc/GMT±N) and UTC carry real transition history.
        if ($id !== 'UTC' && strpos($id, '/') === false) {
            return false;
        }
        static $index = null;
        if ($index === null) {
            $index = array_fill_keys(DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true);
            $index['UTC'] = true;
        }
        return isset($index[$id]);
    }

    /**
     * Coordinate → IANA zone lookup. PHP port of the tz-lookup npm package
     * decoder (CC0-1.0); the quadtree lives in tz_lookup_data.php, regenerated
     * with `node scripts/build-tz-lookup-table.mjs` so the browser's
     * TypeScript calculator and this PHP API agree on the zone for a place.
     * Territorial waters belong to their country; open ocean resolves to the
     * nautical "Etc/GMT±N" zones. Returns null when the table is unavailable.
     */
    public static function timeZoneIdForCoordinates($latitude, $longitude): ?string {
        if (!is_numeric($latitude) || !is_numeric($longitude)) return null;
        $lat = (float) $latitude;
        $lng = (float) $longitude;
        if (!is_finite($lat) || !is_finite($lng) || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) return null;

        static $table = null;
        if ($table === null) {
            $file = dirname(__DIR__) . '/tz_lookup_data.php';
            $loaded = is_file($file) ? include $file : null;
            $table = (is_array($loaded) && is_string($loaded['tree'] ?? null) && is_array($loaded['zones'] ?? null)) ? $loaded : false;
            if ($table === false) {
                error_log('AstroEngine: tz_lookup_data.php missing or invalid; coordinate time-zone lookup disabled.');
            }
        }
        if ($table === false) return null;

        $tree = $table['tree'];
        $zones = $table['zones'];
        $zoneCount = count($zones);
        if ($lat >= 90) return 'Etc/GMT'; // North Pole: same convention as tz-lookup

        // Mirrors tz-lookup exactly, including its slightly widened divisors
        // that keep lng=180 / lat=-90 inside the last quadtree cell.
        $x = 48 * (180 + $lng) / 360.00000000000006;
        $y = 24 * (90 - $lat) / 180.00000000000003;
        $xi = (int) floor($x);
        $yi = (int) floor($y);
        $node = -1;
        $index = 96 * $yi + 2 * $xi;
        $index = 56 * ord($tree[$index]) + ord($tree[$index + 1]) - 1995;
        while ($index + $zoneCount < 3136) {
            $node = $node + $index + 1;
            $y = fmod(2 * ($y - $yi), 2);
            $yi = (int) floor($y);
            $x = fmod(2 * ($x - $xi), 2);
            $xi = (int) floor($x);
            $index = 8 * $node + 4 * $yi + 2 * $xi + 2304;
            $index = 56 * ord($tree[$index]) + ord($tree[$index + 1]) - 1995;
        }
        $zone = $zones[$index + $zoneCount - 3136] ?? null;
        return is_string($zone) && self::isValidIanaTimeZoneId($zone) ? $zone : null;
    }

    /**
     * Resolve the IANA zone to use for a birth payload: an explicit valid
     * `timeZoneId` wins, otherwise the coordinates are looked up. Returns
     * ['timeZoneId' => string|null, 'source' => 'payload'|'coordinates'|null].
     */
    public static function resolveBirthTimeZoneId($payload): array {
        $payload = is_array($payload) ? $payload : [];
        $explicit = trim((string) ($payload['timeZoneId'] ?? ''));
        if ($explicit !== '' && self::isValidIanaTimeZoneId($explicit)) {
            return ['timeZoneId' => $explicit, 'source' => 'payload'];
        }
        $derived = self::timeZoneIdForCoordinates($payload['latitude'] ?? null, $payload['longitude'] ?? null);
        if ($derived !== null) {
            return ['timeZoneId' => $derived, 'source' => 'coordinates'];
        }
        return ['timeZoneId' => null, 'source' => null];
    }

    /**
     * Evaluate a wall-clock time against the zone's real transition history.
     * Returns the UTC instants that display exactly this local time: one
     * normally, none inside a spring-forward gap, two inside an autumn fold.
     */
    private static function wallClockInstantsInZone(DateTimeZone $zone, string $localDateTime): array {
        $wallClockUtc = DateTime::createFromFormat('!Y-m-d H:i:s', $localDateTime, new DateTimeZone('UTC'));
        if ($wallClockUtc === false) return [];
        $wallTs = $wallClockUtc->getTimestamp();

        // Candidate offsets: every offset in force within ±2 days of the wall
        // clock (getTransitions() returns the state at the window start first).
        $offsets = [];
        $transitions = $zone->getTransitions($wallTs - 2 * 86400, $wallTs + 2 * 86400);
        if (is_array($transitions)) {
            foreach ($transitions as $transition) {
                if (isset($transition['offset'])) $offsets[(int) $transition['offset']] = true;
            }
        }
        foreach ([$wallTs - 2 * 86400, $wallTs, $wallTs + 2 * 86400] as $probe) {
            $offsets[$zone->getOffset(new DateTime('@' . $probe))] = true;
        }

        $instants = [];
        foreach (array_keys($offsets) as $offset) {
            $candidate = new DateTime('@' . ($wallTs - $offset));
            $candidate->setTimezone($zone);
            if ($candidate->format('Y-m-d H:i:s') === $localDateTime) {
                $instants[$candidate->getTimestamp()] = [
                    'timestamp' => $candidate->getTimestamp(),
                    'offsetSeconds' => (int) $offset,
                    'abbreviation' => $candidate->format('T'),
                    'dst' => $candidate->format('I') === '1'
                ];
            }
        }
        ksort($instants);
        return array_values($instants);
    }

    /**
     * Resolve a birth payload to a single UTC instant, strictly honouring the
     * historical standard/daylight-saving rules of the birth region.
     *
     * Zone precedence: valid `timeZoneId` → zone derived from latitude/longitude
     * → the submitted fixed `timezoneOffsetHours` (only when no zone can be
     * determined at all). Inside a DST gap or fold the result is invalid
     * rather than guessed; `ambiguous`/`nonexistent` tell the caller why.
     *
     * Returns an array with: ok, error, timestamp, timeZoneId, timeZoneSource
     * ('payload'|'coordinates'|'offset'), offsetHours (the offset actually in
     * force), suppliedOffsetHours, offsetAdjusted (supplied offset was wrong by
     * ≥ 30 minutes, e.g. a DST hour), abbreviation, dst, ambiguous, nonexistent.
     */
    public static function resolveBirthInstant($payload): array {
        $result = [
            'ok' => false, 'error' => null, 'timestamp' => null,
            'timeZoneId' => null, 'timeZoneSource' => null,
            'offsetHours' => null, 'suppliedOffsetHours' => null, 'offsetAdjusted' => false,
            'abbreviation' => null, 'dst' => null, 'ambiguous' => false, 'nonexistent' => false
        ];
        if (!is_array($payload)) {
            $result['error'] = 'Birth details are missing.';
            return $result;
        }
        if (!self::isValidBirthDate($payload['dob'] ?? '')) {
            $result['error'] = 'A valid birth date (YYYY-MM-DD) is required.';
            return $result;
        }
        $tob = self::normalizeBirthTime($payload['tob'] ?? '');
        if ($tob === null) {
            $result['error'] = 'A valid birth time (HH:MM, 24-hour) is required.';
            return $result;
        }
        if (trim((string) ($payload['birthPlace'] ?? '')) === '') {
            $result['error'] = 'The birth place is required.';
            return $result;
        }
        $latitude = $payload['latitude'] ?? null;
        $longitude = $payload['longitude'] ?? null;
        if (!is_numeric($latitude) || (float) $latitude < -90 || (float) $latitude > 90
            || !is_numeric($longitude) || (float) $longitude < -180 || (float) $longitude > 180) {
            $result['error'] = 'Verified birth place coordinates are required.';
            return $result;
        }
        $offset = $payload['timezoneOffsetHours'] ?? null;
        if (!is_numeric($offset) || (float) $offset < -14 || (float) $offset > 14) {
            $result['error'] = 'A valid birth time-zone offset is required.';
            return $result;
        }
        $suppliedOffset = (float) $offset;
        $result['suppliedOffsetHours'] = $suppliedOffset;

        $explicitZoneId = trim((string) ($payload['timeZoneId'] ?? ''));
        if ($explicitZoneId !== '' && !self::isValidIanaTimeZoneId($explicitZoneId)) {
            // Fail closed: an unknown zone ID means we cannot prove the offset.
            $result['error'] = 'Unsupported time zone "' . $explicitZoneId . '". Use an IANA identifier such as Asia/Kolkata or Pacific/Fiji.';
            return $result;
        }

        $dob = trim((string) $payload['dob']);
        $localDateTime = $dob . ' ' . $tob . ':00';
        try {
            $resolution = self::resolveBirthTimeZoneId($payload);
            $zoneId = $resolution['timeZoneId'];
            if ($zoneId !== null) {
                $zone = new DateTimeZone($zoneId);
                $instants = self::wallClockInstantsInZone($zone, $localDateTime);
                $result['timeZoneId'] = $zone->getName();
                $result['timeZoneSource'] = $resolution['source'];
                if (count($instants) === 0) {
                    // Spring-forward gap: this wall-clock time never happened.
                    $result['nonexistent'] = true;
                    $result['error'] = 'The birth time ' . $tob . ' did not exist on ' . $dob . ' in ' . $zone->getName()
                        . ' because clocks were moved forward for daylight saving. Please re-check the recorded birth time.';
                    return $result;
                }
                if (count($instants) > 1) {
                    // Autumn fold: both instants are plausible; do not guess.
                    $result['ambiguous'] = true;
                    $result['error'] = 'The birth time ' . $tob . ' occurred twice on ' . $dob . ' in ' . $zone->getName()
                        . ' because clocks were set back for daylight saving. Please confirm the recorded birth time.';
                    return $result;
                }
                $instant = $instants[0];
                $result['timestamp'] = $instant['timestamp'];
                $result['offsetHours'] = $instant['offsetSeconds'] / 3600.0;
                $result['abbreviation'] = $instant['abbreviation'];
                $result['dst'] = $instant['dst'];
            } else {
                // No zone could be determined: trust the submitted fixed offset.
                // Parse the wall clock in UTC explicitly so php.ini's server
                // timezone cannot influence the chart.
                $wallClockUtc = DateTime::createFromFormat('!Y-m-d H:i:s', $localDateTime, new DateTimeZone('UTC'));
                $errors = DateTime::getLastErrors();
                if ($wallClockUtc === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
                    $result['error'] = 'The birth date and time could not be interpreted.';
                    return $result;
                }
                $result['timestamp'] = (int) round($wallClockUtc->getTimestamp() - $suppliedOffset * 3600.0);
                $result['timeZoneSource'] = 'offset';
                $result['offsetHours'] = $suppliedOffset;
            }
        } catch (Throwable $e) {
            $result['error'] = 'The birth time zone could not be evaluated.';
            return $result;
        }

        $result['offsetAdjusted'] = abs($result['offsetHours'] - $suppliedOffset) >= 0.5;
        if ($result['timestamp'] > time()) {
            $result['error'] = 'The birth date and time must be in the past.';
            return $result;
        }
        $result['ok'] = true;
        return $result;
    }

    /**
     * Validate the birth particulars: calendar date, 24-hour time, place,
     * coordinates and offset, plus a strict wall-clock evaluation against the
     * historical DST transitions of the birth region. The region comes from a
     * valid IANA `timeZoneId` when supplied, otherwise from the coordinates;
     * the numeric offset alone is trusted only when neither is available.
     * Nonexistent (DST gap) and repeated (DST fold) local times, unknown zone
     * IDs and future instants all fail closed.
     */
    public static function hasValidBirthDetails($payload): bool {
        return self::resolveBirthInstant($payload)['ok'] === true;
    }

    /** Human-readable reason why hasValidBirthDetails() rejected a payload (null when valid). */
    public static function describeBirthDetailsProblem($payload): ?string {
        $resolution = self::resolveBirthInstant($payload);
        return $resolution['ok'] ? null : (string) $resolution['error'];
    }

}
