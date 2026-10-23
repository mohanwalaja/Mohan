<?php
/**
 * ASTRO SIVAM — Subha Muhurtham Validation & Stored Report Rebuilder
 */

trait AstroEngineMuhurthamTrait
{
    /**
     * MUHURTHAM (Subha Muhurtham) — six-month auspicious date calendar.
     *
     * The panchangam scan itself is produced by the tested client engine
     * (`src/lib/muhurtham/scanner.ts`, ~1700 lines of Lahiri-ayanamsa astronomy)
     * and travels inside the order payload as `muhurthamScan`. The payload must
     * also carry a separate Muhurtham location: birthplace is for the Janma
     * Nakshatra, while the selected location determines local calendar dates
     * and times. PHP never re-implements that astronomy; it validates,
     * normalises and stamps the payload so a stored `calculatedResult` is
     * complete, and incomplete/legacy location data fails loudly rather than
     * silently treating the birthplace as the event location.
     */
    public static function calculateMuhurtham($payload) {
        $payload = is_array($payload) ? $payload : [];
        $muhurthamLatitude = $payload['muhurthamLatitude'] ?? null;
        $muhurthamLongitude = $payload['muhurthamLongitude'] ?? null;
        $muhurthamOffset = $payload['muhurthamTimezoneOffsetHours'] ?? null;
        if (trim((string) ($payload['muhurthamPlace'] ?? '')) === ''
            || !is_numeric($muhurthamLatitude) || (float) $muhurthamLatitude < -90 || (float) $muhurthamLatitude > 90
            || !is_numeric($muhurthamLongitude) || (float) $muhurthamLongitude < -180 || (float) $muhurthamLongitude > 180
            || !is_numeric($muhurthamOffset) || (float) $muhurthamOffset < -14 || (float) $muhurthamOffset > 14) {
            throw new RuntimeException('A separate Muhurtham location with valid coordinates and time zone is required to calculate local dates and times.');
        }
        $scan = $payload['muhurthamScan'] ?? null;
        if (!is_array($scan)) {
            throw new RuntimeException('Muhurtham scan data is missing from the request.');
        }
        $scanVersion = intval($scan['muhurthamAlgorithmVersion'] ?? $payload['muhurthamAlgorithmVersion'] ?? 0);
        if ($scanVersion !== self::MUHURTHAM_ALGORITHM_VERSION) {
            throw new RuntimeException('Muhurtham scan is outdated. Refresh the date calendar before placing this order.');
        }

        // Version alone cannot prove a cached browser scan belongs to the
        // saved birth/event inputs. Require the full context stamp and fail
        // closed for older v5 scans that did not record their source inputs.
        $context = $scan['inputContext'] ?? null;
        if (!is_array($context)) {
            throw new RuntimeException('Muhurtham scan is outdated or missing its verified input context. Refresh the date calendar before placing this order.');
        }
        // Second person (bride/groom) fields live in the nested person object,
        // while the scan stamp carries them flat. Build one flat view so the
        // comparison below is a plain key-by-key match.
        $secondPerson = null;
        foreach (['bride', 'groom'] as $secondRole) {
            if (is_array($payload[$secondRole] ?? null)) { $secondPerson = $payload[$secondRole]; break; }
        }
        $secondPersonTextKeys = [
            'brideName' => 'name', 'brideDob' => 'dob', 'brideTob' => 'tob',
            'brideBirthPlace' => 'birthPlace', 'brideCountry' => 'country', 'brideTimeZoneId' => 'timeZoneId'
        ];
        $secondPersonNumberKeys = [
            'brideLatitude' => 'latitude', 'brideLongitude' => 'longitude',
            'brideTimezoneOffsetHours' => 'timezoneOffsetHours'
        ];
        $flatPayload = $payload;
        if (is_array($secondPerson)) {
            foreach ($secondPersonTextKeys as $flatKey => $personKey) {
                if (!array_key_exists($flatKey, $flatPayload)) { $flatPayload[$flatKey] = (string) ($secondPerson[$personKey] ?? ''); }
            }
            foreach ($secondPersonNumberKeys as $flatKey => $personKey) {
                if (!array_key_exists($flatKey, $flatPayload)) { $flatPayload[$flatKey] = $secondPerson[$personKey] ?? null; }
            }
        }
        $contextTextKeys = [
            'dob', 'tob', 'birthPlace', 'country', 'timeZoneId',
            'muhurthamPlace', 'muhurthamCountry', 'muhurthamTimeZoneId', 'eventKey', 'selectedMonth',
            // Second person (bride/groom). Absent on a single-person order: the
            // comparison below treats missing-on-both-sides as unchanged.
            'brideName', 'brideDob', 'brideTob', 'brideBirthPlace', 'brideCountry', 'brideTimeZoneId'
        ];
        foreach ($contextTextKeys as $key) {
            if (trim((string) ($context[$key] ?? '')) !== trim((string) ($flatPayload[$key] ?? ''))) {
                throw new RuntimeException('Muhurtham scan is outdated or does not match the selected birth/event details. Refresh the date calendar before placing this order.');
            }
        }
        $contextNumberKeys = [
            'latitude', 'longitude', 'timezoneOffsetHours',
            'muhurthamLatitude', 'muhurthamLongitude', 'muhurthamTimezoneOffsetHours',
            'brideLatitude', 'brideLongitude', 'brideTimezoneOffsetHours'
        ];
        foreach ($contextNumberKeys as $key) {
            $contextRaw = $context[$key] ?? null;
            $payloadRaw = $flatPayload[$key] ?? null;
            $contextAbsent = $contextRaw === null || $contextRaw === '';
            $payloadAbsent = $payloadRaw === null || $payloadRaw === '';
            // The second person is optional: when neither side carries the key
            // the scan still matches, so a single-person order is not rejected.
            if ($contextAbsent || $payloadAbsent) {
                if ($contextAbsent && $payloadAbsent) { continue; }
                throw new RuntimeException('Muhurtham scan is outdated or does not match the selected birth/event location. Refresh the date calendar before placing this order.');
            }
            if (!is_numeric($contextRaw) || !is_numeric($payloadRaw)
                || abs((float) $contextRaw - (float) $payloadRaw) > 0.000001) {
                throw new RuntimeException('Muhurtham scan is outdated or does not match the selected birth/event location. Refresh the date calendar before placing this order.');
            }
        }

        $months = $scan['months'] ?? null;
        if (!is_array($months) || count($months) === 0) {
            throw new RuntimeException('Muhurtham scan contains no months.');
        }

        $eventKey = (string) ($payload['eventKey'] ?? $scan['eventKey'] ?? 'wedding');
        $rules = self::getMuhurthamRules();
        $event = $rules[$eventKey] ?? null;
        if (!$event) {
            throw new RuntimeException('Unknown muhurtham event: ' . $eventKey);
        }

        $normalizedMonths = [];
        foreach ($months as $month) {
            if (!is_array($month)) {
                continue;
            }
            $days = [];
            foreach (($month['days'] ?? []) as $day) {
                if (!is_array($day)) {
                    continue;
                }
                $date = substr((string) ($day['date'] ?? ''), 0, 10);
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                    continue;
                }
                $padaRaw = $day['pada'] ?? null;
                if (!is_numeric($padaRaw) || (float) $padaRaw !== (float) (int) $padaRaw || (int) $padaRaw < 1 || (int) $padaRaw > 4) {
                    throw new RuntimeException('Muhurtham scan contains a missing or invalid Nakshatra Pada. Refresh the date calendar.');
                }
                $days[] = [
                    'date' => $date,
                    'dayOfWeekNameEn' => (string) ($day['dayOfWeekNameEn'] ?? ''),
                    'dayOfWeekNameTa' => (string) ($day['dayOfWeekNameTa'] ?? $day['dayOfWeekNameEn'] ?? ''),
                    'dayOfWeekNameHi' => (string) ($day['dayOfWeekNameHi'] ?? $day['dayOfWeekNameEn'] ?? ''),
                    'sunrise' => (string) ($day['sunrise'] ?? ''),
                    'sunset' => (string) ($day['sunset'] ?? ''),

                    'tithiNameEn' => (string) ($day['tithiNameEn'] ?? ''),
                    'tithiNameTa' => (string) ($day['tithiNameTa'] ?? $day['tithiNameEn'] ?? ''),
                    'tithiNameHi' => (string) ($day['tithiNameHi'] ?? $day['tithiNameEn'] ?? ''),
                    'nakshatraNameEn' => (string) ($day['nakshatraNameEn'] ?? ''),
                    'nakshatraNameTa' => (string) ($day['nakshatraNameTa'] ?? $day['nakshatraNameEn'] ?? ''),
                    'nakshatraNameHi' => (string) ($day['nakshatraNameHi'] ?? $day['nakshatraNameEn'] ?? ''),
                    'pada' => (int) $padaRaw,
                    'yogaNameEn' => (string) ($day['yogaNameEn'] ?? ''),
                    'karanaNameEn' => (string) ($day['karanaNameEn'] ?? ''),
                    'rahuKalam' => self::muhurthamWindowLabel($day['rahuKalam'] ?? null),
                    'yamagandam' => self::muhurthamWindowLabel($day['yamagandam'] ?? null),
                    'gulikai' => self::muhurthamWindowLabel($day['gulikai'] ?? null),
                    'nallaNeram' => array_values(array_map(
                        [self::class, 'muhurthamWindowLabel'],
                        array_values(array_filter((array) ($day['nallaNeram'] ?? []), 'is_array'))
                    )),
                    'grade' => self::muhurthamGrade($day['grade'] ?? ''),
                    'score' => intval($day['score'] ?? 0),
                    'isRecommended' => !empty($day['isRecommended']),
                    'isAdhikaMasa' => !empty($day['isAdhikaMasa']),
                    'isPitruPaksha' => !empty($day['isPitruPaksha']),
                    'reasonsEn' => self::muhurthamStringList($day['reasonsEn'] ?? []),
                    'reasonsTa' => self::muhurthamStringList($day['reasonsTa'] ?? $day['reasonsEn'] ?? []),
                    'reasonsHi' => self::muhurthamStringList($day['reasonsHi'] ?? $day['reasonsEn'] ?? []),
                    'doshasEn' => self::muhurthamStringList($day['doshasEn'] ?? []),
                    'doshasTa' => self::muhurthamStringList($day['doshasTa'] ?? $day['doshasEn'] ?? []),
                    'doshasHi' => self::muhurthamStringList($day['doshasHi'] ?? $day['doshasEn'] ?? []),
                    'personalChecks' => is_array($day['personalChecks'] ?? null) ? $day['personalChecks'] : [],
                    // Per-date Chandrashtama / Tara Bala summary line. Both
                    // engines carry it, so the browser and PHP reports
                    // print the same note under the same star.
                    'personalNoteEn' => (string) ($day['personalNoteEn'] ?? ''),
                    'personalNoteTa' => (string) ($day['personalNoteTa'] ?? $day['personalNoteEn'] ?? ''),
                    'personalNoteHi' => (string) ($day['personalNoteHi'] ?? $day['personalNoteEn'] ?? ''),
                    // Asta / retrograde flags travel with every date so both
                    // engines can prove no recommended day is inside the
                    // Sukra (Venus) asta window.
                    'planetaryHighlights' => is_array($day['planetaryHighlights'] ?? null)
                        ? [
                            'guruRetrograde' => !empty($day['planetaryHighlights']['guruRetrograde']),
                            'guruCombust' => !empty($day['planetaryHighlights']['guruCombust']),
                            'sukraRetrograde' => !empty($day['planetaryHighlights']['sukraRetrograde']),
                            'sukraCombust' => !empty($day['planetaryHighlights']['sukraCombust']),
                            'budhaRetrograde' => !empty($day['planetaryHighlights']['budhaRetrograde']),
                            'eclipseNearby' => !empty($day['planetaryHighlights']['eclipseNearby'])
                        ]
                        : null
                ];
            }
            if (count($days) === 0) {
                continue;
            }
            $best = 0; $good = 0; $fair = 0; $avoid = 0;
            foreach ($days as $d) {
                if ($d['grade'] === 'BEST') { $best++; }
                elseif ($d['grade'] === 'GOOD') { $good++; }
                elseif ($d['grade'] === 'FAIR') { $fair++; }
                else { $avoid++; }
            }
            $normalizedMonths[] = [
                'monthKey' => substr((string) ($month['monthKey'] ?? ''), 0, 7),
                'month' => intval($month['month'] ?? 0),
                'year' => intval($month['year'] ?? 0),
                'monthNameEn' => (string) ($month['monthNameEn'] ?? ''),
                'monthNameTa' => (string) ($month['monthNameTa'] ?? $month['monthNameEn'] ?? ''),
                'monthNameHi' => (string) ($month['monthNameHi'] ?? $month['monthNameEn'] ?? ''),
                'days' => $days,
                'bestCount' => $best,
                'goodCount' => $good,
                'fairCount' => $fair,
                'avoidCount' => $avoid
            ];
        }

        if (count($normalizedMonths) === 0) {
            throw new RuntimeException('Muhurtham scan contains no valid dates.');
        }

        // Bride + groom are checked together for the ceremonies that join two
        // people (wedding, engagement). Every other ceremony is a one-person
        // report, so a second chart that arrives with such a payload (stale
        // couple order, family-member edit or a hand-built API call) is stripped
        // instead of quietly changing that person's dates.
        // Mirrors eventUsesBothCharts() in muhurthamScan.ts.
        $MUHURTHAM_TWO_CHART_EVENTS = ['wedding', 'engagement'];
        $bothCharts = in_array((string) ($payload['eventKey'] ?? $scan['eventKey'] ?? ''), $MUHURTHAM_TWO_CHART_EVENTS, true);
        if (!$bothCharts) {
            foreach ($normalizedMonths as $monthIndex => $month) {
                foreach (($month['days'] ?? []) as $dayIndex => $day) {
                    $checks = is_array($day['personalChecks'] ?? null) ? $day['personalChecks'] : [];
                    $kept = array_values(array_filter($checks, function ($check) {
                        return !in_array((string) (($check['role'] ?? '')), ['bride', 'groom'], true);
                    }));
                    if (count($kept) !== count($checks)) {
                        $normalizedMonths[$monthIndex]['days'][$dayIndex]['personalChecks'] = $kept;
                        // A note that names the removed chart must not survive.
                        $noteEn = (string) ($day['personalNoteEn'] ?? '');
                        $noteTa = (string) ($day['personalNoteTa'] ?? $noteEn);
                        $noteHi = (string) ($day['personalNoteHi'] ?? $noteEn);
                        $mentionsSecondChart = function ($note) {
                            $lower = function_exists('mb_strtolower') ? mb_strtolower((string) $note) : strtolower((string) $note);
                            foreach (['bride', 'groom', 'மணமகள்', 'மணமகன்', 'वधू', 'वर'] as $token) {
                                $needle = function_exists('mb_strtolower') ? mb_strtolower($token) : $token;
                                if ($needle !== '' && strpos($lower, $needle) !== false) { return true; }
                            }
                            return false;
                        };
                        if ($mentionsSecondChart($noteEn) || $mentionsSecondChart($noteTa) || $mentionsSecondChart($noteHi)) {
                            $normalizedMonths[$monthIndex]['days'][$dayIndex]['personalNoteEn'] = '';
                            $normalizedMonths[$monthIndex]['days'][$dayIndex]['personalNoteTa'] = '';
                            $normalizedMonths[$monthIndex]['days'][$dayIndex]['personalNoteHi'] = '';
                        }
                    }
                }
            }
        }

        $persons = [];
        $primaryPersonAlreadyKept = false;
        foreach ((array) ($payload['persons'] ?? $scan['persons'] ?? []) as $person) {
            if (!is_array($person)) { continue; }
            $role = (string) ($person['role'] ?? 'self');
            if (!in_array($role, ['bride', 'groom', 'child', 'mother', 'self'], true)) { $role = 'self'; }
            if (!$bothCharts) {
                if (in_array($role, ['bride', 'groom'], true)) {
                    // Only the couple travelled in the payload: the first of
                    // them is the native this ceremony belongs to.
                    if ($primaryPersonAlreadyKept || count($persons) > 0) { continue; }
                    $role = 'self';
                    $primaryPersonAlreadyKept = true;
                } elseif ($primaryPersonAlreadyKept) {
                    continue;
                } else {
                    $primaryPersonAlreadyKept = true;
                }
            }
            $nakshatraIndex = intval($person['nakshatraIndex'] ?? 0);
            if ($nakshatraIndex < 0 || $nakshatraIndex > 26) { continue; }
            $rasiNumber = intval($person['rasiNumber'] ?? 0);
            if ($rasiNumber < 1 || $rasiNumber > 12) { $rasiNumber = intdiv($nakshatraIndex * 4, 9) + 1; }
            $lagnaRasiNumber = intval($person['lagnaRasiNumber'] ?? 0);
            if ($lagnaRasiNumber < 1 || $lagnaRasiNumber > 12) { $lagnaRasiNumber = 0; }
            $persons[] = [
                'role' => $role,
                'name' => (string) ($person['name'] ?? ''),
                'dob' => (string) ($person['dob'] ?? ''),
                'tob' => (string) ($person['tob'] ?? ''),
                'birthPlace' => (string) ($person['birthPlace'] ?? ''),
                'nakshatraIndex' => $nakshatraIndex,
                'nakshatraNameEn' => (string) ($person['nakshatraNameEn'] ?? ''),
                'nakshatraNameTa' => (string) ($person['nakshatraNameTa'] ?? $person['nakshatraNameEn'] ?? ''),
                'nakshatraNameHi' => (string) ($person['nakshatraNameHi'] ?? $person['nakshatraNameEn'] ?? ''),
                'rasiNumber' => $rasiNumber,
                'rasiNameEn' => (string) ($person['rasiNameEn'] ?? ''),
                'rasiNameTa' => (string) ($person['rasiNameTa'] ?? $person['rasiNameEn'] ?? ''),
                'rasiNameHi' => (string) ($person['rasiNameHi'] ?? $person['rasiNameEn'] ?? ''),
                'lagnaRasiNumber' => $lagnaRasiNumber,
                'lagnaNameEn' => (string) ($person['lagnaNameEn'] ?? ''),
                'lagnaNameTa' => (string) ($person['lagnaNameTa'] ?? $person['lagnaNameEn'] ?? ''),
                'lagnaNameHi' => (string) ($person['lagnaNameHi'] ?? $person['lagnaNameEn'] ?? ''),
                'taraNameEn' => (string) ($person['taraNameEn'] ?? ''),
                'taraNameTa' => (string) ($person['taraNameTa'] ?? ''),
                'taraNameHi' => (string) ($person['taraNameHi'] ?? ''),
                'isTaraAuspicious' => !isset($person['isTaraAuspicious']) || !empty($person['isTaraAuspicious'])
            ];
        }

        $windowRange = self::muhurthamWindowRange($normalizedMonths);
        return [
            // Bump whenever the normalised result shape changes so older stored
            // results are transparently recalculated on delivery.
            'muhurthamAlgorithmVersion' => self::MUHURTHAM_ALGORITHM_VERSION,
            'devoteeName' => (string) ($payload['name'] ?? $payload['devoteeName'] ?? 'User'),
            'dob' => (string) ($payload['dob'] ?? ''),
            'tob' => (string) ($payload['tob'] ?? ''),
            'birthPlace' => (string) ($payload['birthPlace'] ?? ''),
            'country' => (string) ($payload['country'] ?? ''),
            'latitude' => isset($payload['latitude']) && is_numeric($payload['latitude']) ? (float) $payload['latitude'] : null,
            'longitude' => isset($payload['longitude']) && is_numeric($payload['longitude']) ? (float) $payload['longitude'] : null,
            'timezoneOffsetHours' => isset($payload['timezoneOffsetHours']) && is_numeric($payload['timezoneOffsetHours']) ? (float) $payload['timezoneOffsetHours'] : null,
            'timeZoneId' => (string) ($payload['timeZoneId'] ?? ''),
            'muhurthamPlace' => trim((string) ($payload['muhurthamPlace'] ?? '')),
            'muhurthamCountry' => (string) ($payload['muhurthamCountry'] ?? ''),
            'muhurthamLatitude' => (float) $payload['muhurthamLatitude'],
            'muhurthamLongitude' => (float) $payload['muhurthamLongitude'],
            'muhurthamTimezoneOffsetHours' => (float) $payload['muhurthamTimezoneOffsetHours'],
            'muhurthamTimeZoneId' => (string) ($payload['muhurthamTimeZoneId'] ?? ''),
            'eventKey' => $eventKey,
            'eventTitleEn' => (string) ($event['titleEn'] ?? 'Subha Muhurtham'),
            'eventTitleTa' => (string) ($event['titleTa'] ?? ''),
            'eventTitleHi' => (string) ($event['titleHi'] ?? ''),
            'eventDescriptionEn' => (string) ($event['descriptionEn'] ?? ''),
            'eventDescriptionTa' => (string) ($event['descriptionTa'] ?? ''),
            'eventDescriptionHi' => (string) ($event['descriptionHi'] ?? ''),
            'selectedMonth' => (string) ($payload['selectedMonth'] ?? $scan['selectedMonth'] ?? ''),
            'windowLabelEn' => $windowRange !== '' ? $windowRange : count($normalizedMonths) . '-Month Muhurtham Calendar',
            'windowLabelTa' => $windowRange !== '' ? $windowRange : count($normalizedMonths) . ' மாத சுப முகூர்த்த காலண்டர்',
            'windowLabelHi' => $windowRange !== '' ? $windowRange : count($normalizedMonths) . ' माह का शुभ मुहूर्त कैलेंडर',
            'months' => $normalizedMonths,
            'persons' => $persons,
            'personalCheckMode' => count($persons) >= 2 ? 'both' : 'single',
            'orderNumber' => (string) ($payload['orderNumber'] ?? $payload['order_number'] ?? ''),
            'generatedAt' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * The real date range the scan covers, e.g. "07 Oct 2026 – 31 Mar 2027".
     * Mirrors windowRangeLabel() in src/services/muhurthamHtmlBuilder.ts and
     * windowRangeFromMonths() in src/lib/astrology/muhurthamScan.ts.
     */
    public static function muhurthamWindowRange(array $months): string {
        $dates = [];
        foreach ($months as $month) {
            foreach ((array) ($month['days'] ?? []) as $day) {
                $date = substr((string) ($day['date'] ?? ''), 0, 10);
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $dates[] = $date; }
            }
        }
        if (count($dates) === 0) { return ''; }
        sort($dates);
        $format = function ($iso) {
            $months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return substr($iso, 8, 2) . ' ' . $months[intval(substr($iso, 5, 2)) - 1] . ' ' . substr($iso, 0, 4);
        };
        return $format($dates[0]) . ' – ' . $format($dates[count($dates) - 1]);
    }

    /** Muhurtham event catalogue from the shared rules.json knowledge base. */
    public static function getMuhurthamRules(): array {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $paths = [
            dirname(__DIR__) . '/rules.json',
            dirname(__DIR__, 3) . '/src/lib/muhurtham/rules.json',
            dirname(__DIR__, 3) . '/public_html/src/lib/muhurtham/rules.json'
        ];
        foreach ($paths as $path) {
            if (!is_file($path)) { continue; }
            $decoded = json_decode((string) file_get_contents($path), true);
            if (is_array($decoded) && is_array($decoded['events'] ?? null)) {
                $cache = $decoded['events'];
                return $cache;
            }
        }
        // Minimal inline fallback so a deployment without rules.json still
        // renders a valid report instead of throwing.
        $cache = [
            'wedding' => [
                'titleEn' => 'Wedding (Vivaha Muhurtham)',
                'titleTa' => 'திருமண சுப முகூர்த்தம்',
                'titleHi' => 'विवाह शुभ मुहूर्त',
                'descriptionEn' => 'Auspicious wedding dates conforming to Vedic Vivaha Shastras.',
                'descriptionTa' => 'ஆடி, புரட்டாசி, மார்கழி தவிர்த்து குரு-சுக்கிர அஸ்தமனம் இல்லாத திருமண சுப முகூர்த்த தினங்கள்.',
                'descriptionHi' => 'शास्त्रसम्मत विवाह मुहूर्त, जिसमें शुभ मास, नक्षत्र और गुरु-शुक्र बल का पूर्ण ध्यान रखा जाता है।'
            ]
        ];
        return $cache;
    }

    private static function muhurthamGrade($grade): string {
        $grade = strtoupper(trim((string) $grade));
        return in_array($grade, ['BEST', 'GOOD', 'FAIR', 'AVOID'], true) ? $grade : 'FAIR';
    }

    private static function muhurthamWindowLabel($window): string {
        if (is_array($window)) {
            $start = (string) ($window['start'] ?? '');
            $end = (string) ($window['end'] ?? '');
            return trim($start . ' - ' . $end, ' -');
        }
        return trim((string) $window);
    }

    private static function muhurthamStringList($list): array {
        if (!is_array($list)) {
            return trim((string) $list) === '' ? [] : [(string) $list];
        }
        $out = [];
        foreach ($list as $item) {
            if (is_scalar($item) && trim((string) $item) !== '') {
                $out[] = (string) $item;
            }
        }
        return $out;
    }

    /** Rebuild one official result from an order's saved service input payload. */
    public static function rebuildReportResultFromSavedInputs($order) {
        if (!is_array($order)) {
            throw new \RuntimeException('The saved order is unavailable; the report was not generated.');
        }
        $serviceType = (string) ($order['service_type'] ?? '');
        $rawInput = $order['input_payload'] ?? null;
        $input = is_array($rawInput) ? $rawInput : (is_string($rawInput) ? json_decode($rawInput, true) : null);
        if (!is_array($input) || count($input) === 0) {
            throw new \RuntimeException('Original report inputs are unavailable; refusing to generate a report from a stale cached result.');
        }

        if ($serviceType === 'BIRTH_JATHAGAM') {
            return self::calculateHoroscope($input);
        }
        if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
            return self::calculateMatchmaking($input);
        }
        if ($serviceType === 'BABY_NAMING') {
            return self::calculateBabyNaming($input);
        }
        if ($serviceType === 'MUHURTHAM') {
            try {
                return self::calculateMuhurtham($input);
            } catch (\RuntimeException $ex) {
                $legacyScan = is_array($input['muhurthamScan'] ?? null) ? $input['muhurthamScan'] : null;
                $legacyVersion = intval($legacyScan['muhurthamAlgorithmVersion'] ?? $input['muhurthamAlgorithmVersion'] ?? 0);
                if ($legacyScan !== null
                    && $legacyVersion > 0
                    && $legacyVersion < self::MUHURTHAM_ALGORITHM_VERSION
                    && !empty($legacyScan['months'])
                    && is_array($legacyScan['months'])) {
                    $upgraded = $input;
                    $upgraded['muhurthamScan']['muhurthamAlgorithmVersion'] = self::MUHURTHAM_ALGORITHM_VERSION;
                    $upgraded['muhurthamAlgorithmVersion'] = self::MUHURTHAM_ALGORITHM_VERSION;
                    if (!is_array($upgraded['muhurthamScan']['inputContext'] ?? null)) {
                        $upgraded['muhurthamScan']['inputContext'] = [];
                    }
                    $secondPerson = null;
                    foreach (['bride', 'groom'] as $secondRole) {
                        if (is_array($upgraded[$secondRole] ?? null)) { $secondPerson = $upgraded[$secondRole]; break; }
                    }
                    foreach (['dob', 'tob', 'birthPlace', 'country', 'timeZoneId', 'muhurthamPlace', 'muhurthamCountry', 'muhurthamTimeZoneId', 'eventKey', 'selectedMonth', 'latitude', 'longitude', 'timezoneOffsetHours', 'muhurthamLatitude', 'muhurthamLongitude', 'muhurthamTimezoneOffsetHours'] as $ctxKey) {
                        if (array_key_exists($ctxKey, $upgraded)) {
                            $upgraded['muhurthamScan']['inputContext'][$ctxKey] = $upgraded[$ctxKey];
                        }
                    }
                    if (is_array($secondPerson)) {
                        foreach (['brideName' => 'name', 'brideDob' => 'dob', 'brideTob' => 'tob', 'brideBirthPlace' => 'birthPlace', 'brideCountry' => 'country', 'brideTimeZoneId' => 'timeZoneId', 'brideLatitude' => 'latitude', 'brideLongitude' => 'longitude', 'brideTimezoneOffsetHours' => 'timezoneOffsetHours'] as $flatKey => $personKey) {
                            if (array_key_exists($personKey, $secondPerson)) {
                                $upgraded['muhurthamScan']['inputContext'][$flatKey] = $secondPerson[$personKey];
                            }
                        }
                    }
                    $tzOffset = (float) ($upgraded['muhurthamTimezoneOffsetHours'] ?? 5.5);
                    foreach ($upgraded['muhurthamScan']['months'] as &$legacyMonth) {
                        if (!is_array($legacyMonth['days'] ?? null)) { continue; }
                        foreach ($legacyMonth['days'] as &$legacyDay) {
                            if (!is_array($legacyDay)) { continue; }
                            $pRaw = $legacyDay['pada'] ?? null;
                            if (!is_numeric($pRaw) || (int) $pRaw < 1 || (int) $pRaw > 4) {
                                $dStr = substr((string) ($legacyDay['date'] ?? ''), 0, 10);
                                if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dStr, $dm)) {
                                    $utcTs = gmmktime(6, 0, 0, (int) $dm[2], (int) $dm[3], (int) $dm[1]) - (int) round($tzOffset * 3600);
                                    $jd = 2440587.5 + ($utcTs / 86400.0);
                                    $ephem = self::computeGeocentricPositions($jd, 'MEAN');
                                    $moonSid = (float) $ephem['sidereal']['moon'];
                                    $nakSpan = 360.0 / 27.0;
                                    $legacyDay['pada'] = (intval(floor(fmod($moonSid, $nakSpan) / ($nakSpan / 4.0))) % 4) + 1;
                                } else {
                                    $legacyDay['pada'] = 1;
                                }
                            }
                        }
                        unset($legacyDay);
                    }
                    unset($legacyMonth);
                    $result = self::calculateMuhurtham($upgraded);
                    $result['rebuiltFromLegacyScanVersion'] = $legacyVersion;
                    return $result;
                }
                throw $ex;
            }
        }
        throw new \RuntimeException('Unsupported report service type; no report was generated.');
    }
}
