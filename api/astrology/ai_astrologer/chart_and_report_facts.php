<?php
/**
 * ASTRO SIVAM — AI Astrologer Chart & Delivered-Report Fact Extractors
 */

/**
 * The customer's own order facts, for answering "where is my report / what
 * did I pay" questions. Only data from their own row - never prices of other
 * services or any discount.
 */
function astro_ai_order_details_text(array $order): string
{
    $parts = [
        'Order number: ' . (string) ($order['order_number'] ?? ''),
        'Service: ' . (string) ($order['service_type'] ?? ''),
    ];
    $amount = (string) ($order['amount'] ?? '');
    if ($amount !== '') {
        $parts[] = 'Amount paid: ' . trim((string) ($order['currency'] ?? '') . ' ' . $amount);
    }
    $parts[] = 'Payment: ' . ((int) ($order['payment_confirmed'] ?? 0) === 1
        ? 'confirmed'
        : (string) ($order['payment_status'] ?? 'pending'));
    $placed = substr((string) ($order['created_at'] ?? ''), 0, 10);
    if ($placed !== '') {
        $parts[] = 'Placed on: ' . $placed;
    }
    $delivered = substr((string) ($order['email_sent_at'] ?? ''), 0, 10);
    if ($delivered !== '') {
        $parts[] = 'Report emailed on: ' . $delivered;
    }
    $parts[] = 'Order status: ' . (string) ($order['status'] ?? '');

    // The birth facts the chart was calculated from, for the "which birth
    // details were used" guided option. Parsed from this order's own saved
    // inputs only; marriage orders carry a bride and a groom instead of one
    // person.
    $rawInput = $order['input_payload'] ?? null;
    $input = is_array($rawInput) ? $rawInput : (is_string($rawInput) ? json_decode($rawInput, true) : null);
    if (is_array($input)) {
        $birthBits = [];
        $single = static function (array $p): string {
            $bits = [];
            foreach (['name' => 'Name', 'dob' => 'Date of birth', 'tob' => 'Time of birth',
                       'birthPlace' => 'Birth place', 'birth_place' => 'Birth place'] as $key => $label) {
                $value = trim((string) ($p[$key] ?? ''));
                if ($value !== '') {
                    $bits[] = $label . ': ' . $value;
                }
            }
            return implode(', ', $bits);
        };
        $one = $single($input);
        if ($one !== '') {
            $birthBits[] = $one;
        }
        foreach (['groom' => 'Groom', 'bride' => 'Bride', 'boy' => 'Boy', 'girl' => 'Girl'] as $key => $label) {
            if (is_array($input[$key] ?? null)) {
                $two = $single($input[$key]);
                if ($two !== '') {
                    $birthBits[] = $label . ' (' . $two . ')';
                }
            }
        }
        if (!empty($birthBits)) {
            $parts[] = 'Birth details used: ' . implode(' | ', $birthBits);
        }
        $reportLang = trim((string) ($order['language'] ?? ''));
        if ($reportLang !== '') {
            $parts[] = 'Report language: ' . $reportLang;
        }
    }

    return implode(' | ', $parts);
}

/**
 * Flattens a stored order into the small chart shape the retrieval layer reads.
 * Returns null when the order cannot be calculated, which makes every
 * chart-dependent rule decline to fire rather than guess.
 *
 * @return array{chart:array, header:string, dashaEndDate:?string}|null
 */
/**
 * The order's own report result, rebuilt from its saved inputs.
 *
 * ONE rebuild per order per request: the natal chart facts and the service
 * readings (matching / naming / muhurtham) both read this, so asking a
 * question never makes the engine calculate the same report twice.
 */
function astro_ai_report_result(array $order): ?array
{
    static $cache = [];
    $key = (string) ($order['id'] ?? '') . '|' . (string) ($order['order_number'] ?? '');

    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        require_once dirname(__DIR__) . '/engine.php';
        if (!class_exists('AstroEngine')) {
            return $cache[$key] = null;
        }
        $result = AstroEngine::rebuildReportResultFromSavedInputs($order);
    } catch (Throwable $e) {
        error_log('AI Astrologer: report rebuild failed for order '
            . ($order['order_number'] ?? '?') . ': ' . $e->getMessage());
        return $cache[$key] = null;
    }

    return $cache[$key] = is_array($result) ? $result : null;
}

/**
 * The readings of the three non-Jathagam services, read out of the customer's
 * own report result so the chat repeats the report instead of re-judging it.
 *
 * Every value is copied from the engine result in all three languages; nothing
 * here is invented, and nothing is recalculated. A service whose result does
 * not carry its own shape (an old stored result, a failed rebuild, a service
 * type with no chat chapter) returns null, and the answer route then says it
 * cannot read the report instead of guessing.
 *
 * @return array{serviceType:string, matching:?array, naming:?array, muhurtham:?array}|null
 */
function astro_ai_service_facts(array $order): ?array
{
    $service = (string) ($order['service_type'] ?? '');
    if (!in_array($service, ['MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'], true)) {
        return null;
    }
    $result = astro_ai_report_result($order);
    if (!is_array($result)) {
        return null;
    }

    // Some engine fields are strings, others (reasons, doshas) are lists of
    // strings; both flatten to one readable line per language.
    $hiAstroTerm = static function (string $en): string {
        static $map = [
            'Mesham (Aries)' => 'मेष', 'Mesham' => 'मेष', 'Mesha' => 'मेष', 'Aries' => 'मेष',
            'Rishabam (Taurus)' => 'वृषभ', 'Rishabam' => 'वृषभ', 'Vrishabha' => 'वृषभ', 'Taurus' => 'वृषभ',
            'Mithunam (Gemini)' => 'मिथुन', 'Mithunam' => 'मिथुन', 'Mithuna' => 'मिथुन', 'Gemini' => 'मिथुन',
            'Kadagam (Cancer)' => 'कर्क', 'Kadagam' => 'कर्क', 'Kataka' => 'कर्क', 'Cancer' => 'कर्क',
            'Simmam (Leo)' => 'सिंह', 'Simmam' => 'सिंह', 'Simha' => 'सिंह', 'Leo' => 'सिंह',
            'Kanni (Virgo)' => 'कन्या', 'Kanni' => 'कन्या', 'Kanya' => 'कन्या', 'Virgo' => 'कन्या',
            'Thulam (Libra)' => 'तुला', 'Thulam' => 'तुला', 'Tula' => 'तुला', 'Libra' => 'तुला',
            'Viruchigam (Scorpio)' => 'वृश्चिक', 'Viruchigam' => 'वृश्चिक', 'Vrischika' => 'वृश्चिक', 'Scorpio' => 'वृश्चिक',
            'Dhanusu (Sagittarius)' => 'धनु', 'Dhanusu' => 'धनु', 'Dhanu' => 'धनु', 'Sagittarius' => 'धनु',
            'Makaram (Capricorn)' => 'मकर', 'Makaram' => 'मकर', 'Makara' => 'मकर', 'Capricorn' => 'मकर',
            'Kumbam (Aquarius)' => 'कुंभ', 'Kumbam' => 'कुंभ', 'Kumbha' => 'कुंभ', 'Aquarius' => 'कुंभ',
            'Meenam (Pisces)' => 'मीन', 'Meenam' => 'मीन', 'Meena' => 'मीन', 'Pisces' => 'मीन',
            'Ashwini' => 'अश्विनी', 'Aswini' => 'अश्विनी',
            'Bharani' => 'भरणी',
            'Krittika' => 'कृत्तिका', 'Karthigai' => 'कृत्तिका',
            'Rohini' => 'रोहिणी',
            'Mrigashira' => 'मृगशिरा', 'Mrigasira' => 'मृगशिरा', 'Mrigashirsha' => 'मृगशिरा',
            'Ardra' => 'आर्द्रा', 'Thiruvathirai' => 'आर्द्रा',
            'Punarvasu' => 'पुनर्वसु', 'Punarpoosam' => 'पुनर्वसु',
            'Pushya' => 'पुष्य', 'Poosam' => 'पुष्य',
            'Ashlesha' => 'आश्लेषा', 'Ayilyam' => 'आश्लेषा',
            'Magha' => 'मघा', 'Makam' => 'मघा',
            'Purva Phalguni' => 'पूर्वा फाल्गुनी', 'Pooram' => 'पूर्वा फाल्गुनी',
            'Uttara Phalguni' => 'उत्तरा फाल्गुनी', 'Uthiram' => 'उत्तरा फाल्गुनी',
            'Hasta' => 'हस्त', 'Hastham' => 'हस्त',
            'Chitra' => 'चित्रा', 'Chithirai' => 'चित्रा',
            'Swati' => 'स्वाति', 'Swathi' => 'स्वाति',
            'Vishakha' => 'विशाखा', 'Visakam' => 'विशाखा',
            'Anuradha' => 'अनुराधा', 'Anusham' => 'अनुराधा',
            'Jyeshtha' => 'ज्येष्ठा', 'Kettai' => 'ज्येष्ठा',
            'Mula' => 'मूल', 'Moolam' => 'मूल',
            'Purva Ashadha' => 'पूर्वाषाढ़ा', 'Pooradam' => 'पूर्वाषाढ़ा',
            'Uttara Ashadha' => 'उत्तराषाढ़ा', 'Uthiradam' => 'उत्तराषाढ़ा',
            'Shravana' => 'श्रवण', 'Thiruvonam' => 'श्रवण',
            'Dhanishta' => 'धनिष्ठा', 'Dhanishtha' => 'धनिष्ठा', 'Avittam' => 'धनिष्ठा',
            'Shatabhisha' => 'शतभिषा', 'Sadayam' => 'शतभिषा',
            'Purva Bhadrapada' => 'पूर्वा भाद्रपद', 'Poorattathi' => 'पूर्वा भाद्रपद',
            'Uttara Bhadrapada' => 'उत्तरा भाद्रपद', 'Uthirattathi' => 'उत्तरा भाद्रपद',
            'Revati' => 'रेवती', 'Revathi' => 'रेवती',
        ];
        return $map[$en] ?? $en;
    };
    $tri = static function (array $r, string $base) use ($hiAstroTerm): array {
        $flat = static function ($value): string {
            if (is_array($value)) {
                return implode('; ', array_values(array_filter(array_map('strval', $value),
                    static function (string $s): bool { return trim($s) !== ''; })));
            }
            return trim((string) $value);
        };
        $en = $flat($r[$base . 'En'] ?? '');
        $hiRaw = $flat($r[$base . 'Hi'] ?? '');
        return [
            'en' => $en,
            'ta' => $flat($r[$base . 'Ta'] ?? $en),
            'hi' => $hiRaw !== '' ? $hiRaw : $hiAstroTerm($en),
        ];
    };

    if ($service === 'MARRIAGE_COMPATIBILITY') {
        if (!is_array($result['poruthams'] ?? null) || !isset($result['score'], $result['maxScore'])) {
            return null;
        }
        $poruthams = [];
        foreach ($result['poruthams'] as $p) {
            if (!is_array($p)) {
                continue;
            }
            $status = strtoupper((string) ($p['status'] ?? ''));
            if (!in_array($status, ['UTTHAMAM', 'MADHYAMAM', 'PORUNDHADHU'], true)) {
                $status = 'PORUNDHADHU';
            }
            $poruthams[] = [
                'key' => (string) ($p['poruthamKey'] ?? ($p['id'] ?? '')),
                'name' => $tri($p, 'name'),
                'points' => (int) ($p['points'] ?? 0),
                'maxPoints' => (int) ($p['maxPoints'] ?? 0),
                'status' => $status,
                'matched' => $status !== 'PORUNDHADHU',
                'full' => $status === 'UTTHAMAM',
                'crucial' => !empty($p['isCrucial']),
                'note' => $tri($p, 'explanation'),
            ];
        }
        $sevvai = is_array($result['sevvayDosham'] ?? null) ? $result['sevvayDosham'] : [];
        return [
            'serviceType' => 'MARRIAGE_COMPATIBILITY',
            'matching' => [
                'groom' => [
                    'name' => (string) ($result['groomName'] ?? ''),
                    'rasi' => $tri($result, 'groomRasiName'),
                    'nakshatra' => $tri($result, 'groomNakshatraName'),
                    'pada' => (int) ($result['groomPada'] ?? 0),
                ],
                'bride' => [
                    'name' => (string) ($result['brideName'] ?? ''),
                    'rasi' => $tri($result, 'brideRasiName'),
                    'nakshatra' => $tri($result, 'brideNakshatraName'),
                    'pada' => (int) ($result['bridePada'] ?? 0),
                ],
                'score' => (int) ($result['score'] ?? 0),
                'maxScore' => (int) ($result['maxScore'] ?? 0),
                'percentage' => (float) ($result['percentage'] ?? 0),
                'matched' => (int) ($result['totalPoruthamsMatched'] ?? 0),
                'total' => count($poruthams),
                'verdictStatus' => (string) ($result['verdictStatus'] ?? ''),
                'verdict' => $tri($result, 'overallVerdict'),
                'rajjuOk' => !empty($result['rajjuMatch']),
                'vedhaOk' => !empty($result['vedhaMatch']),
                'poruthams' => $poruthams,
                'sevvai' => [
                    'brideStatus' => (string) ($sevvai['brideDoshaStatus'] ?? ''),
                    'groomStatus' => (string) ($sevvai['groomDoshaStatus'] ?? ''),
                    'samyamStatus' => $sevvai['doshaSamyamStatus'] ?? null,
                    'samyamLabel' => $tri($sevvai, 'doshaSamyamStatus'),
                    'advice' => $tri($sevvai, 'recommendation'),
                ],
            ],
            'naming' => null,
            'muhurtham' => null,
        ];
    }

    if ($service === 'BABY_NAMING') {
        if ((int) ($result['janmaNakshatraIndex'] ?? 0) < 1 || !is_array($result['primaryPadaInfo'] ?? null)) {
            return null;
        }
        $letters = is_array($result['nakshatraLetters'] ?? null) ? $result['nakshatraLetters'] : [];
        $padas = [];
        foreach ((array) ($letters['padas'] ?? []) as $p) {
            if (!is_array($p)) {
                continue;
            }
            $padas[] = [
                'pada' => (int) ($p['padaNumber'] ?? 0),
                'sound' => $tri($p, 'letter'),
                'rasi' => $tri($p, 'rasi'),
            ];
        }
        $primary = is_array($result['primaryPadaInfo'] ?? null) ? $result['primaryPadaInfo'] : [];
        $pada = (int) ($result['janmaPada'] ?? 0);
        $names = [];
        $addName = static function (array $n) use (&$names): void {
            if (!is_array($n)) {
                return;
            }
            $name = trim((string) ($n['nameEn'] ?? ($n['name'] ?? '')));
            if ($name === '') {
                return;
            }
            $meanEn = (string) ($n['meaningEn'] ?? ($n['meaning'] ?? ''));
            $names[] = [
                'name' => $name,
                'meaning' => [
                    'en' => $meanEn,
                    'ta' => (string) ($n['meaningTa'] ?? $meanEn),
                    'hi' => (string) ($n['meaningHi'] ?? $meanEn),
                ],
            ];
        };
        // Page-1 suggestions first (they are the report's own short list for
        // the birth-pada sound). Some sounds carry none, because the curated
        // examples cover only a few syllables - in that case the names come
        // from the report's page-2 name bank for this very pada.
        foreach ((array) ($result['suggestedNames'] ?? []) as $n) {
            $addName(is_array($n) ? $n : []);
        }
        if ($names === []) {
            foreach ((array) ($result['nameSuggestions'] ?? []) as $column) {
                if (!is_array($column) || (int) ($column['padaNumber'] ?? 0) !== $pada) {
                    continue;
                }
                foreach (['south', 'north'] as $side) {
                    foreach ((array) ($column[$side] ?? []) as $n) {
                        $addName(is_array($n) ? $n : []);
                    }
                }
            }
        }
        $provenance = is_array($result['nameProvenance'] ?? null) ? $result['nameProvenance'] : [];
        return [
            'serviceType' => 'BABY_NAMING',
            'matching' => null,
            'naming' => [
                'baby' => [
                    'name' => (string) ($result['babyName'] ?? ''),
                    'gender' => (string) ($result['gender'] ?? ''),
                    'dob' => (string) ($result['dob'] ?? ''),
                    'tob' => (string) ($result['tob'] ?? ''),
                    'place' => (string) ($result['birthPlace'] ?? ''),
                ],
                'star' => [
                    'en' => (string) ($result['janmaNakshatraEn'] ?? ''),
                    'ta' => (string) ($result['janmaNakshatraTa'] ?? ($result['janmaNakshatraEn'] ?? '')),
                    'hi' => (string) ($result['janmaNakshatraHi'] ?? $hiAstroTerm((string) ($result['janmaNakshatraEn'] ?? ''))),
                ],
                'pada' => $pada,
                'rasi' => $tri($result, 'chandraRasiName'),
                'lagna' => $tri($result, 'lagnaRasiName'),
                'primarySound' => [
                    'en' => (string) ($primary['letterEn'] ?? ($result['primaryStartingSyllable'] ?? '')),
                    'ta' => (string) ($primary['letterTa'] ?? ($result['primaryStartingSyllable'] ?? '')),
                    'hi' => (string) ($primary['letterHi'] ?? ($result['primaryStartingSyllable'] ?? '')),
                ],
                'padas' => $padas,
                'names' => array_slice($names, 0, 8),
                'provenance' => [
                    'suppliedName' => (string) ($provenance['suppliedName'] ?? ''),
                    'status' => (string) ($provenance['status'] ?? ''),
                    'note' => $tri($provenance, 'note'),
                ],
            ],
            'muhurtham' => null,
        ];
    }

    // MUHURTHAM - the six-month auspicious-date calendar.
    if (!is_array($result['months'] ?? null) || count($result['months']) === 0) {
        return null;
    }
    $months = [];
    $recommended = [];
    $dayCount = 0;
    foreach ($result['months'] as $m) {
        if (!is_array($m)) {
            continue;
        }
        $days = [];
        foreach ((array) ($m['days'] ?? []) as $d) {
            if (!is_array($d)) {
                continue;
            }
            $day = [
                'date' => (string) ($d['date'] ?? ''),
                'weekday' => $tri($d, 'dayOfWeekName'),
                'nakshatra' => $tri($d, 'nakshatraName'),
                'tithi' => $tri($d, 'tithiName'),
                'grade' => (string) ($d['grade'] ?? 'FAIR'),
                'score' => (int) ($d['score'] ?? 0),
                'recommended' => !empty($d['isRecommended']),
                'nallaNeram' => array_values(array_filter(array_map('strval', (array) ($d['nallaNeram'] ?? [])))),
                'rahuKalam' => (string) ($d['rahuKalam'] ?? ''),
                'yamagandam' => (string) ($d['yamagandam'] ?? ''),
                'gulikai' => (string) ($d['gulikai'] ?? ''),
                'reasons' => $tri($d, 'reasons'),
                'doshas' => $tri($d, 'doshas'),
            ];
            $days[] = $day;
            $dayCount++;
            if ($day['recommended'] || $day['grade'] === 'BEST') {
                $recommended[] = $day;
            }
        }
        if ($days === []) {
            continue;
        }
        $months[] = [
            'key' => (string) ($m['monthKey'] ?? ''),
            'name' => $tri($m, 'monthName'),
            'bestCount' => (int) ($m['bestCount'] ?? 0),
            'goodCount' => (int) ($m['goodCount'] ?? 0),
            'days' => $days,
        ];
    }
    usort($recommended, static function (array $a, array $b): int {
        return $b['score'] <=> $a['score'];
    });

    return [
        'serviceType' => 'MUHURTHAM',
        'matching' => null,
        'naming' => null,
        'muhurtham' => [
            'event' => $tri($result, 'eventTitle'),
            'window' => $tri($result, 'windowLabel'),
            'place' => (string) ($result['muhurthamPlace'] ?? ''),
            'country' => (string) ($result['muhurthamCountry'] ?? ''),
            'personalCheckMode' => (string) ($result['personalCheckMode'] ?? 'single'),
            'dayCount' => $dayCount,
            'months' => $months,
            'recommended' => array_slice($recommended, 0, 6),
        ],
    ];
}

function astro_ai_chart_facts(array $order): ?array
{
    // Shared with astro_ai_service_facts(): one engine run per order per
    // request, whichever reading asks first.
    $result = astro_ai_report_result($order);
    if (!is_array($result)) {
        return null;
    }

    // A Birth Jathagam result is the only shape that carries a natal chart.
    // Other services (matching, naming, muhurtham) answer from the general
    // knowledge base instead of inventing chart facts.
    if (!is_array($result['planetPositions'] ?? null) || !is_array($result['dasha'] ?? null)) {
        return null;
    }

    // AstroEngine::calculateHoroscope() keys, mapped to the vocabulary the
    // rule conditions in knowledge/ai-astrologer/rules/life-areas.json use.
    // (This used to read keys such as 'lagnaSign' and 'planetHouses' that the
    // engine never returns, so every chart reached the rules empty.)
    $grahaVocab = [
        'sun' => 'Surya', 'moon' => 'Chandra', 'mars' => 'Sevvai', 'mercury' => 'Budha',
        'jupiter' => 'Guru', 'venus' => 'Sukra', 'saturn' => 'Sani', 'rahu' => 'Rahu', 'ketu' => 'Ketu',
    ];
    $englishLord = [
        'Sun' => 'Surya', 'Moon' => 'Chandra', 'Mars' => 'Sevvai', 'Mercury' => 'Budha',
        'Jupiter' => 'Guru', 'Venus' => 'Sukra', 'Saturn' => 'Sani', 'Rahu' => 'Rahu', 'Ketu' => 'Ketu',
    ];
    // Sign lords, Aries (1) .. Pisces (12).
    $signLord = [1 => 'Sevvai', 2 => 'Sukra', 3 => 'Budha', 4 => 'Chandra', 5 => 'Surya', 6 => 'Budha',
        7 => 'Sukra', 8 => 'Sevvai', 9 => 'Guru', 10 => 'Sani', 11 => 'Sani', 12 => 'Guru'];

    $planetHouse = [];
    $dignity = [];
    foreach ($result['planetPositions'] as $p) {
        $g = $grahaVocab[strtolower((string) ($p['graha'] ?? ''))] ?? null;
        $house = (int) ($p['house'] ?? ($p['bhavaNumber'] ?? 0));
        if ($g === null || $house < 1 || $house > 12) {
            continue;
        }
        $planetHouse[$g] = $house;
        $d = is_array($p['dignity'] ?? null) ? $p['dignity'] : [];
        if (!empty($d['isExalted']) || !empty($d['isOwnSign'])) {
            $dignity[$g] = 'strong';
        } elseif (!empty($d['isDebilitated']) && empty($d['isNeechaBhanga'])) {
            $dignity[$g] = 'weak';
        } else {
            $dignity[$g] = 'neutral';
        }
    }
    if (isset($planetHouse['Chandra'])) {
        $planetHouse['Moon'] = $planetHouse['Chandra']; // one rule names the Moon in English
    }

    $lagnaRasi = (int) ($result['lagnaRasi'] ?? 0);
    $lordHouse = [];
    if ($lagnaRasi >= 1 && $lagnaRasi <= 12) {
        for ($h = 1; $h <= 12; $h++) {
            $lord = $signLord[(($lagnaRasi - 1 + $h - 1) % 12) + 1];
            if (isset($planetHouse[$lord])) {
                $lordHouse[$h] = $planetHouse[$lord];
            }
        }
        $lagnaLord = $signLord[$lagnaRasi];
        $dignity['lagnaLord'] = $dignity[$lagnaLord] ?? 'neutral';
    }

    $dasha = $result['dasha'];
    $antarPeriod = (string) ($dasha['antarPeriod'] ?? '');
    $dashaEnd = strpos($antarPeriod, ' - ') !== false ? trim(substr($antarPeriod, strrpos($antarPeriod, ' - ') + 3)) : '';
    $kuja = $result['sevvaiDosha'] ?? [];
    $kujaPresent = ($kuja['hasDosha'] ?? null) === true && ($kuja['status'] ?? '') !== 'DOSHA_CANCELLED';

    // The full engine dosha block (page-1 Dosha Analysis), flattened for the
    // guided dosha options. Each entry keeps the engine's own verdict,
    // description and traditional remedy in all three languages, so the chat
    // repeats the report instead of re-judging the chart.
    // Maps an engine dosha name ("Mars (Kuja) Dosha", ...) to the short key
    // the guided dosha options use. Inline closure, not a helper: the WASM
    // probe evals this function alone, so it must not call siblings.
    $doshaKey = static function (string $nameEn): string {
        $name = strtolower($nameEn);
        if (strpos($name, 'kuja') !== false || strpos($name, 'mangal') !== false || strpos($name, 'sevvai') !== false) {
            return 'kuja';
        }
        if (strpos($name, 'kala sarpa') !== false || strpos($name, 'kalasarpa') !== false) {
            return 'kalasarpa';
        }
        if (strpos($name, 'pitru') !== false) {
            return 'pitru';
        }
        if (strpos($name, 'guru chandala') !== false || strpos($name, 'chandala') !== false) {
            return 'guruchandala';
        }
        return '';
    };
    $doshaDetails = [];
    if (is_array($result['doshas'] ?? null)) {
        foreach ($result['doshas'] as $d) {
            if (!is_array($d) || trim((string) ($d['nameEn'] ?? '')) === '') {
                continue;
            }
            $key = $doshaKey((string) $d['nameEn']);
            if ($key === '') {
                continue;
            }
            $doshaDetails[] = [
                'key' => $key,
                'present' => $d['isPresent'] ?? null,
                'status' => (string) ($d['status'] ?? ''),
                'name' => [
                    'en' => (string) ($d['nameEn'] ?? ''),
                    'ta' => (string) ($d['nameTa'] ?? ($d['nameEn'] ?? '')),
                    'hi' => (string) ($d['nameHi'] ?? ($d['nameEn'] ?? '')),
                ],
                'description' => [
                    'en' => (string) ($d['descriptionEn'] ?? ''),
                    'ta' => (string) ($d['descriptionTa'] ?? ''),
                    'hi' => (string) ($d['descriptionHi'] ?? ''),
                ],
                'remedy' => [
                    'en' => (string) ($d['traditionalRemedyEn'] ?? ''),
                    'ta' => (string) ($d['traditionalRemedyTa'] ?? ''),
                    'hi' => (string) ($d['traditionalRemedyHi'] ?? ''),
                ],
            ];
        }
    }

    $hiAstroChart = static function (string $en): string {
        static $map = [
            'Mesham (Aries)' => 'मेष', 'Mesham' => 'मेष', 'Mesha' => 'मेष', 'Aries' => 'मेष',
            'Rishabam (Taurus)' => 'वृषभ', 'Rishabam' => 'वृषभ', 'Vrishabha' => 'वृषभ', 'Taurus' => 'वृषभ',
            'Mithunam (Gemini)' => 'मिथुन', 'Mithunam' => 'मिथुन', 'Mithuna' => 'मिथुन', 'Gemini' => 'मिथुन',
            'Kadagam (Cancer)' => 'कर्क', 'Kadagam' => 'कर्क', 'Kataka' => 'कर्क', 'Cancer' => 'कर्क',
            'Simmam (Leo)' => 'सिंह', 'Simmam' => 'सिंह', 'Simha' => 'सिंह', 'Leo' => 'सिंह',
            'Kanni (Virgo)' => 'कन्या', 'Kanni' => 'कन्या', 'Kanya' => 'कन्या', 'Virgo' => 'कन्या',
            'Thulam (Libra)' => 'तुला', 'Thulam' => 'तुला', 'Tula' => 'तुला', 'Libra' => 'तुला',
            'Viruchigam (Scorpio)' => 'वृश्चिक', 'Viruchigam' => 'वृश्चिक', 'Vrischika' => 'वृश्चिक', 'Scorpio' => 'वृश्चिक',
            'Dhanusu (Sagittarius)' => 'धनु', 'Dhanusu' => 'धनु', 'Dhanu' => 'धनु', 'Sagittarius' => 'धनु',
            'Makaram (Capricorn)' => 'मकर', 'Makaram' => 'मकर', 'Makara' => 'मकर', 'Capricorn' => 'मकर',
            'Kumbam (Aquarius)' => 'कुंभ', 'Kumbam' => 'कुंभ', 'Kumbha' => 'कुंभ', 'Aquarius' => 'कुंभ',
            'Meenam (Pisces)' => 'मीन', 'Meenam' => 'मीन', 'Meena' => 'मीन', 'Pisces' => 'मीन',
            'Ashwini' => 'अश्विनी', 'Aswini' => 'अश्विनी',
            'Bharani' => 'भरणी',
            'Krittika' => 'कृत्तिका', 'Karthigai' => 'कृत्तिका',
            'Rohini' => 'रोहिणी',
            'Mrigashira' => 'मृगशिरा', 'Mrigasira' => 'मृगशिरा', 'Mrigashirsha' => 'मृगशिरा',
            'Ardra' => 'आर्द्रा', 'Thiruvathirai' => 'आर्द्रा',
            'Punarvasu' => 'पुनर्वसु', 'Punarpoosam' => 'पुनर्वसु',
            'Pushya' => 'पुष्य', 'Poosam' => 'पुष्य',
            'Ashlesha' => 'आश्लेषा', 'Ayilyam' => 'आश्लेषा',
            'Magha' => 'मघा', 'Makam' => 'मघा',
            'Purva Phalguni' => 'पूर्वा फाल्गुनी', 'Pooram' => 'पूर्वा फाल्गुनी',
            'Uttara Phalguni' => 'उत्तरा फाल्गुनी', 'Uthiram' => 'उत्तरा फाल्गुनी',
            'Hasta' => 'हस्त', 'Hastham' => 'हस्त',
            'Chitra' => 'चित्रा', 'Chithirai' => 'चित्रा',
            'Swati' => 'स्वाति', 'Swathi' => 'स्वाति',
            'Vishakha' => 'विशाखा', 'Visakam' => 'विशाखा',
            'Anuradha' => 'अनुराधा', 'Anusham' => 'अनुराधा',
            'Jyeshtha' => 'ज्येष्ठा', 'Kettai' => 'ज्येष्ठा',
            'Mula' => 'मूल', 'Moolam' => 'मूल',
            'Purva Ashadha' => 'पूर्वाषाढ़ा', 'Pooradam' => 'पूर्वाषाढ़ा',
            'Uttara Ashadha' => 'उत्तराषाढ़ा', 'Uthiradam' => 'उत्तराषाढ़ा',
            'Shravana' => 'श्रवण', 'Thiruvonam' => 'श्रवण',
            'Dhanishta' => 'धनिष्ठा', 'Dhanishtha' => 'धनिष्ठा', 'Avittam' => 'धनिष्ठा',
            'Shatabhisha' => 'शतभिषा', 'Sadayam' => 'शतभिषा',
            'Purva Bhadrapada' => 'पूर्वा भाद्रपद', 'Poorattathi' => 'पूर्वा भाद्रपद',
            'Uttara Bhadrapada' => 'उत्तरा भाद्रपद', 'Uthirattathi' => 'उत्तरा भाद्रपद',
            'Revati' => 'रेवती', 'Revathi' => 'रेवती',
        ];
        return $map[$en] ?? $en;
    };
    $nakshatraLords = ['Ketu', 'Sukra', 'Surya', 'Chandra', 'Sevvai', 'Rahu', 'Guru', 'Sani', 'Budha'];
    $nakIndex = (int) ($result['nakshatram']['index'] ?? ($result['janmaNakshatraIndex'] ?? 0));
    $nakNameEn = (string) ($result['nakshatram']['name'] ?? ($result['janmaNakshatraEn'] ?? ''));
    if ($nakIndex >= 1 && $nakIndex <= 27) {
        $moonNakshatraLord = $nakshatraLords[($nakIndex - 1) % 9];
    } else {
        static $nakByName = [
            'Ashwini' => 1, 'Aswini' => 1, 'Bharani' => 2, 'Krittika' => 3, 'Karthigai' => 3,
            'Rohini' => 4, 'Mrigashira' => 5, 'Mrigasira' => 5, 'Ardra' => 6, 'Punarvasu' => 7,
            'Pushya' => 8, 'Ashlesha' => 9, 'Magha' => 10, 'Purva Phalguni' => 11,
            'Uttara Phalguni' => 12, 'Hasta' => 13, 'Chitra' => 14, 'Swati' => 15,
            'Vishakha' => 16, 'Anuradha' => 17, 'Jyeshtha' => 18, 'Mula' => 19,
            'Purva Ashadha' => 20, 'Uttara Ashadha' => 21, 'Shravana' => 22,
            'Dhanishta' => 23, 'Dhanishtha' => 23, 'Shatabhisha' => 24,
            'Purva Bhadrapada' => 25, 'Uttara Bhadrapada' => 26, 'Revati' => 27,
        ];
        $idx = $nakByName[$nakNameEn] ?? 0;
        $moonNakshatraLord = $idx >= 1 ? $nakshatraLords[($idx - 1) % 9] : '';
    }

    $lagnaEn = (string) ($result['lagna']['rasi'] ?? '');
    $rasiEn = (string) ($result['rasi']['name'] ?? '');

    $chart = [
        'lagna' => $lagnaEn,
        'moonSign' => $rasiEn,
        'moonNakshatra' => $nakNameEn,
        'moonNakshatraLord' => $moonNakshatraLord,
        'currentDasha' => $englishLord[(string) ($dasha['currentLord'] ?? '')] ?? (string) ($dasha['currentLord'] ?? ''),
        'currentAntardasha' => $englishLord[(string) ($dasha['subLord'] ?? '')] ?? (string) ($dasha['subLord'] ?? ''),
        'dashaEndDate' => $dashaEnd,
        'planetHouse' => $planetHouse,
        'lordHouse' => $lordHouse,
        'dignity' => $dignity,
        'saniTransitFromMoon' => (int) ($result['saniTransit']['house'] ?? 0),
        'doshas' => $kujaPresent ? ['kujaDosha'] : [],
        'doshaDetails' => $doshaDetails,
        // The customer's own report readings per life area, in en/ta/hi -
        // the same text as their PDF. Knowledge-base mode answers from these.
        'summary' => is_array($result['summary'] ?? null) ? $result['summary'] : [],
        'labels' => [
            'lagna' => ['en' => $lagnaEn, 'ta' => (string) ($result['lagna']['rasiTa'] ?? ''), 'hi' => $hiAstroChart($lagnaEn)],
            'rasi' => ['en' => $rasiEn, 'ta' => (string) ($result['rasi']['nameTa'] ?? ''), 'hi' => $hiAstroChart($rasiEn)],
            'nakshatra' => ['en' => $nakNameEn, 'ta' => (string) ($result['nakshatram']['nameTa'] ?? ''), 'hi' => $hiAstroChart($nakNameEn)],
            'dasha' => ['en' => (string) ($dasha['currentLord'] ?? ''), 'ta' => (string) ($dasha['currentLordTa'] ?? ''), 'hi' => (string) ($dasha['currentLordHi'] ?? '')],
            'bhukti' => ['en' => (string) ($dasha['subLord'] ?? ''), 'ta' => (string) ($dasha['subLordTa'] ?? ''), 'hi' => (string) ($dasha['subLordHi'] ?? '')],
        ],
    ];

    $lang = astro_normalize_report_language((string) ($order['language'] ?? 'ta'));
    $label = $lang === 'ta' ? 'உங்கள் ஜாதகம்' : ($lang === 'hi' ? 'आपकी कुंडली' : 'Your chart');
    $header = $label . ': ' . $chart['lagna'] . ' / ' . $chart['moonSign'] . ' / ' . $chart['moonNakshatra'] . "\n"
        . ($lang === 'ta' ? 'தசை' : ($lang === 'hi' ? 'दशा' : 'Dasha')) . ' ' . (string) ($dasha['currentLord'] ?? '')
        . ' / ' . (string) ($dasha['subLord'] ?? '')
        . ($chart['dashaEndDate'] !== '' ? ' (' . $chart['dashaEndDate'] . ')' : '');

    return ['chart' => $chart, 'header' => $header, 'dashaEndDate' => $chart['dashaEndDate'] ?: null];
}

