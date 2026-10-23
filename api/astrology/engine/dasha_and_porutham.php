<?php
/**
 * ASTRO SIVAM — Vimshottari Mahadasa/Bhukti, Kuja Dosha & 10-Porutham Scoring
 */

trait AstroEngineDashaPoruthamTrait
{
    /** Format dasha boundaries in the native's local civil date, never the PHP server zone. */
    private static function formatDashaDate($timestamp, $timeZoneId = '', $timezoneOffsetHours = 0.0): string {
        try {
            if (is_string($timeZoneId) && trim($timeZoneId) !== '') {
                $zone = new DateTimeZone(trim($timeZoneId));
            } else {
                $offsetMinutes = (int) round(((float) $timezoneOffsetHours) * 60.0);
                $offsetSign = $offsetMinutes >= 0 ? '+' : '-';
                $absoluteMinutes = abs($offsetMinutes);
                $offsetName = sprintf('%s%02d:%02d', $offsetSign, intdiv($absoluteMinutes, 60), $absoluteMinutes % 60);
                $zone = new DateTimeZone($offsetName);
            }
        } catch (Throwable $e) {
            $zone = new DateTimeZone('UTC');
        }

        $instant = new DateTimeImmutable('@' . (string) (int) floor((float) $timestamp));
        return $instant->setTimezone($zone)->format('Y-m-d');
    }

    private static function calculateVimshottariDasha($moonSiderealDeg, $birthTimestamp, $targetTimestamp = null, $timeZoneId = '', $timezoneOffsetHours = 0.0) {
        $lordsTa = ['Ketu'=>'கேது','Venus'=>'சுக்கிரன்','Sun'=>'சூரியன்','Moon'=>'சந்திரன்','Mars'=>'செவ்வாய்','Rahu'=>'ராகு','Jupiter'=>'குரு','Saturn'=>'சனி','Mercury'=>'புதன்'];
        $lordsHi = ['Ketu'=>'केतु','Venus'=>'शुक्र','Sun'=>'सूर्य','Moon'=>'चंद्र','Mars'=>'मंगल','Rahu'=>'राहु','Jupiter'=>'गुरु','Saturn'=>'शनि','Mercury'=>'बुध'];
        $years = ['Ketu'=>7,'Venus'=>20,'Sun'=>6,'Moon'=>10,'Mars'=>7,'Rahu'=>18,'Jupiter'=>16,'Saturn'=>19,'Mercury'=>17];
        $YEAR = 365.25 * 86400;
        $target = $targetTimestamp ?? time();

        $lordsOrder = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
        $span = 360.0 / 27.0;
        $nakIndex = (int) floor($moonSiderealDeg / $span) % 27;
        $posInNak = fmod(fmod($moonSiderealDeg, $span) + $span, $span);
        $elapsedFraction = $posInNak / $span;
        $startLordIdx = $nakIndex % 9;
        $startLord = $lordsOrder[$startLordIdx];

        // Balance at birth: (1 - elapsedFraction) * years[startLord]
        $balanceRemainingYears = (1.0 - $elapsedFraction) * $years[$startLord];
        $balYrs = (int) floor($balanceRemainingYears);
        $balMonths = (int) round(($balanceRemainingYears - $balYrs) * 12);
        if ($balMonths === 12) {
            $balYrs += 1;
            $balMonths = 0;
        }

        // Walk FULL Mahadashas until the target timestamp falls inside one
        $birthMahaStart = $birthTimestamp - ($elapsedFraction * $years[$startLord] * $YEAR);
        $cursor = $birthMahaStart;
        $mIdx = $startLordIdx;
        $mahaDur = $years[$lordsOrder[$mIdx]] * $YEAR;

        while ($cursor + $mahaDur <= $target) {
            $cursor += $mahaDur;
            $mIdx = ($mIdx + 1) % 9;
            $mahaDur = $years[$lordsOrder[$mIdx]] * $YEAR;
        }

        $currentMahaLord = $lordsOrder[$mIdx];
        $mahaStart = $cursor;
        $mahaEnd = $cursor + $mahaDur;

        // Locate Antardasha (starts with Mahadasha lord, duration = mahaYears * antarYears / 120)
        $aCursor = $mahaStart;
        $aIdx = $mIdx;
        $aDur = ($mahaDur * $years[$lordsOrder[$aIdx]]) / 120.0;

        for ($i = 0; $i < 9; $i++) {
            $aDur = ($mahaDur * $years[$lordsOrder[$aIdx]]) / 120.0;
            if ($target < $aCursor + $aDur || $i === 8) {
                break;
            }
            $aCursor += $aDur;
            $aIdx = ($aIdx + 1) % 9;
        }

        $currentAntarLord = $lordsOrder[$aIdx];
        $antarStart = $aCursor;
        $antarEnd = $aCursor + $aDur;

        // Locate Pratyantardasha (starts with Antardasha lord, duration = antarYears * pratYears / 120)
        $pCursor = $antarStart;
        $pIdx = $aIdx;
        $pDur = ($aDur * $years[$lordsOrder[$pIdx]]) / 120.0;

        for ($i = 0; $i < 9; $i++) {
            $pDur = ($aDur * $years[$lordsOrder[$pIdx]]) / 120.0;
            if ($target < $pCursor + $pDur || $i === 8) {
                break;
            }
            $pCursor += $pDur;
            $pIdx = ($pIdx + 1) % 9;
        }

        $currentPratyantarLord = $lordsOrder[$pIdx];
        $pratStart = $pCursor;
        $pratEnd = $pCursor + $pDur;

        return [
            'currentLord' => $currentMahaLord,
            'currentLordTa' => $lordsTa[$currentMahaLord] ?? $currentMahaLord,
            'currentLordHi' => $lordsHi[$currentMahaLord] ?? $currentMahaLord,
            'subLord' => $currentAntarLord,
            'subLordTa' => $lordsTa[$currentAntarLord] ?? $currentAntarLord,
            'subLordHi' => $lordsHi[$currentAntarLord] ?? $currentAntarLord,
            'pratyantarLord' => $currentPratyantarLord,
            'pratyantarLordTa' => $lordsTa[$currentPratyantarLord] ?? $currentPratyantarLord,
            'pratyantarLordHi' => $lordsHi[$currentPratyantarLord] ?? $currentPratyantarLord,
            'period' => self::formatDashaDate($mahaStart, $timeZoneId, $timezoneOffsetHours) . ' to ' . self::formatDashaDate($mahaEnd, $timeZoneId, $timezoneOffsetHours),
            'antarPeriod' => self::formatDashaDate($antarStart, $timeZoneId, $timezoneOffsetHours) . ' - ' . self::formatDashaDate($antarEnd, $timeZoneId, $timezoneOffsetHours),
            'pratyantarPeriod' => self::formatDashaDate($pratStart, $timeZoneId, $timezoneOffsetHours) . ' - ' . self::formatDashaDate($pratEnd, $timeZoneId, $timezoneOffsetHours),
            'balanceAtBirth' => "{$balYrs} Years " . max(0, $balMonths) . " Months",
        ];
    }

    /**
     * Build the birth-start Mahadasha sequence and each Mahadasha's nine
     * Antardashas from the computed Moon longitude. The first Mahadasha is
     * shown from birth to its remaining balance; its sub-periods retain their
     * true starts, which can predate birth.
     */
    private static function calculateVimshottariDashaPeriods($moonSiderealDeg, $birthTimestamp, $targetTimestamp, $timeZoneId = '', $timezoneOffsetHours = 0.0): array {
        $lordsTa = ['Ketu'=>'கேது','Venus'=>'சுக்கிரன்','Sun'=>'சூரியன்','Moon'=>'சந்திரன்','Mars'=>'செவ்வாய்','Rahu'=>'ராகு','Jupiter'=>'குரு','Saturn'=>'சனி','Mercury'=>'புதன்'];
        $lordsHi = ['Ketu'=>'केतु','Venus'=>'शुक्र','Sun'=>'सूर्य','Moon'=>'चंद्र','Mars'=>'मंगल','Rahu'=>'राहु','Jupiter'=>'गुरु','Saturn'=>'शनि','Mercury'=>'बुध'];
        $lordsOrder = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
        $years = ['Ketu'=>7,'Venus'=>20,'Sun'=>6,'Moon'=>10,'Mars'=>7,'Rahu'=>18,'Jupiter'=>16,'Saturn'=>19,'Mercury'=>17];
        $lordKeys = ['Ketu'=>'ketu','Venus'=>'venus','Sun'=>'sun','Moon'=>'moon','Mars'=>'mars','Rahu'=>'rahu','Jupiter'=>'jupiter','Saturn'=>'saturn','Mercury'=>'mercury'];
        $yearSeconds = 365.25 * 86400.0;
        $span = 360.0 / 27.0;
        $nakIndex = (int) floor(self::norm360((float) $moonSiderealDeg) / $span) % 27;
        $posInNak = fmod(fmod((float) $moonSiderealDeg, $span) + $span, $span);
        $elapsedFraction = $posInNak / $span;
        $startLordIdx = $nakIndex % 9;
        $startLord = $lordsOrder[$startLordIdx];
        $balanceYears = (1.0 - $elapsedFraction) * $years[$startLord];
        $birthMahaStart = (float) $birthTimestamp - ($elapsedFraction * $years[$startLord] * $yearSeconds);
        $periods = [];
        $mahaCursor = $birthMahaStart;
        $mahaLordIdx = $startLordIdx;

        for ($mahaNumber = 0; $mahaNumber < 9; $mahaNumber++) {
            $mahaLord = $lordsOrder[$mahaLordIdx];
            $mahaDurationYears = $years[$mahaLord];
            $mahaDuration = $mahaDurationYears * $yearSeconds;
            $mahaEnd = $mahaCursor + $mahaDuration;
            $antardashas = [];
            $antarCursor = $mahaCursor;

            for ($antarNumber = 0; $antarNumber < 9; $antarNumber++) {
                $antarLord = $lordsOrder[($mahaLordIdx + $antarNumber) % 9];
                $antarDurationYears = ($mahaDurationYears * $years[$antarLord]) / 120.0;
                $antarEnd = $antarCursor + ($antarDurationYears * $yearSeconds);
                $antardashas[] = [
                    'lord' => $lordKeys[$antarLord],
                    'lordNameEn' => $antarLord,
                    'lordNameTa' => $lordsTa[$antarLord],
                    'lordNameHi' => $lordsHi[$antarLord],
                    'startDate' => self::formatDashaDate($antarCursor, $timeZoneId, $timezoneOffsetHours),
                    'endDate' => self::formatDashaDate($antarEnd, $timeZoneId, $timezoneOffsetHours),
                    'months' => round($antarDurationYears * 12.0, 1),
                    'isCurrent' => (float) $targetTimestamp >= $antarCursor && (float) $targetTimestamp < $antarEnd,
                ];
                $antarCursor = $antarEnd;
            }

            $displayStart = $mahaNumber === 0 ? (float) $birthTimestamp : $mahaCursor;
            $displayEnd = $mahaNumber === 0
                ? (float) $birthTimestamp + ($balanceYears * $yearSeconds)
                : $mahaEnd;
            $displayYears = $mahaNumber === 0 ? $balanceYears : (float) $mahaDurationYears;
            $periods[] = [
                'mahadashaLord' => $lordKeys[$mahaLord],
                'lordNameEn' => $mahaLord,
                'lordNameTa' => $lordsTa[$mahaLord],
                'lordNameHi' => $lordsHi[$mahaLord],
                'startDate' => self::formatDashaDate($displayStart, $timeZoneId, $timezoneOffsetHours),
                'endDate' => self::formatDashaDate($displayEnd, $timeZoneId, $timezoneOffsetHours),
                'years' => round($displayYears, 1),
                'durationYears' => round($displayYears, 1),
                // The first displayed span is the balance from birth, not
                // the full Mahadasha whose reference Antardashas may predate it.
                'periodKind' => $mahaNumber === 0 ? 'BIRTH_BALANCE' : 'FULL_MAHADASHA',
                'fullStartDate' => self::formatDashaDate($mahaCursor, $timeZoneId, $timezoneOffsetHours),
                'fullYears' => $mahaDurationYears,
                'antardashas' => $antardashas,
                'isCurrent' => (float) $targetTimestamp >= $mahaCursor && (float) $targetTimestamp < $mahaEnd,
            ];

            $mahaCursor = $mahaEnd;
            $mahaLordIdx = ($mahaLordIdx + 1) % 9;
        }

        return $periods;
    }

    // The five-group Rajju mapping in the same Nakshatra order as the
    // TypeScript matchmaking engine (0=Siro, 1=Kanda, 2=Udhara, 3=Uru, 4=Pada):
    //
    //   Siro   (head):  Mrigashirsha, Chitra, Dhanishta (Avittam)
    //   Kanda  (neck):  Rohini, Ardra (Thiruvadhirai), Hasta, Swati, Shravana (Thiruvonam), Shatabhisha (Sathayam)
    //   Udhara (navel): Krittika (Karthigai), Punarvasu (Punarpoosam), Uttara Phalguni (Uthiram), Vishakha (Visakam), Uttara Ashadha (Uthiradam), Purva Bhadrapada (Poorattathi)
    //   Uru    (thigh): Bharani, Pushya (Poosam), Purva Phalguni (Pooram), Anuradha (Anusham), Purva Ashadha (Pooradam), Uttara Bhadrapada (Uthirattathi)
    //   Pada   (foot):  Ashwini, Ashlesha (Ayilyam), Magha (Magam), Jyeshtha (Kettai), Mula (Moolam), Revati (Revathi)
    //
    // The five groups repeat identically over each nine-Nakshatra arc, so the
    // table is the nine-value pattern (4,3,2,1,0,1,2,3,4) three times. Rajju
    // MATCHES when the two stars are in DIFFERENT groups. The former table
    // rotated 4,3,2,1,0 every five stars, shifting Ardra..Ashlesha,
    // Swati..Jyeshtha and Shatabhisha..Uttara Bhadrapada by one group and
    // wrongly failing e.g. bride Avittam (Siro) + groom Swati (Kanda).
    private static function rajjuTable() {
        static $table = null;
        return $table ?? ($table = json_decode(file_get_contents(dirname(__DIR__) . '/rajju.json'), true, 512, JSON_THROW_ON_ERROR));
    }
    private static function planetFriendship($p1, $p2) {
        $friends = [
            'sun' => ['moon','mars','jupiter'], 'moon' => ['sun','mercury'],
            'mars' => ['sun','moon','jupiter'], 'mercury' => ['sun','venus'],
            'jupiter' => ['sun','moon','mars'], 'venus' => ['mercury','saturn'],
            'saturn' => ['mercury','venus'],
        ];
        $enemies = [
            'sun' => ['venus','saturn'], 'moon' => [],
            'mars' => ['mercury'], 'mercury' => ['moon'],
            'jupiter' => ['mercury','venus'], 'venus' => ['sun','moon'],
            'saturn' => ['sun','moon','mars'],
        ];
        if (in_array($p2, $friends[$p1] ?? [])) return 'friend';
        if (in_array($p2, $enemies[$p1] ?? [])) return 'enemy';
        return 'neutral';
    }

    private static function grahaMaitriScore($lord1, $lord2) {
        $rel1 = self::planetFriendship($lord1, $lord2);
        $rel2 = self::planetFriendship($lord2, $lord1);
        if ($rel1 === 'friend' && $rel2 === 'friend') return 5;
        if ($rel1 === 'enemy' && $rel2 === 'enemy') return 0;
        if ($rel1 === 'neutral' && $rel2 === 'neutral') return 3;
        if (($rel1 === 'friend' && $rel2 === 'enemy') || ($rel1 === 'enemy' && $rel2 === 'friend')) return 1;
        return 4;
    }

    /**
     * House list used by the live evaluation: the ASTRO_KUJA_HOUSES environment
     * override when it holds a valid 1-12 list, else the South Indian default —
     * the exact behaviour of activeKujaHouses() in src/lib/astrology/kujaDosha.ts.
     */
    private static function kujaDoshaHouses(): array {
        $raw = getenv('ASTRO_KUJA_HOUSES');
        $raw = is_string($raw) ? trim($raw) : '';
        if ($raw === '') { return self::KUJA_DOSHA_HOUSES; }
        $parsed = [];
        foreach (explode(',', $raw) as $part) {
            $value = trim($part);
            if ($value === '' || !ctype_digit($value)) { continue; }
            $number = (int) $value;
            if ($number >= 1 && $number <= 12) { $parsed[$number] = true; }
        }
        if ($parsed === []) {
            error_log('ASTRO SIVAM: ASTRO_KUJA_HOUSES="' . $raw . '" is not a house list. Using the default.');
            return self::KUJA_DOSHA_HOUSES;
        }
        $houses = array_keys($parsed);
        sort($houses);
        return $houses;
    }

    /**
     * Classical Sevvay (Kuja / Mangala) Dosha evaluation with the standard
     * exceptions. Whole-sign houses; rasi numbers are 1-based (Mesham = 1).
     *
     * Dosha trigger (South Indian rule): Mars in the 2nd, 4th, 7th, 8th or 12th
     * house counted from the Lagna, from the Moon (Chandra Lagna) and from Venus
     * (Sukra). The 1st house is only screened when ASTRO_KUJA_HOUSES asks for it.
     *
     * Cancelling exceptions (status DOSHA_CANCELLED):
     *   OWN_SIGN          Mars in Mesham or Viruchigam
     *   EXALTED           Mars in Magaram
     *   HOUSE_SIGN        house/sign pairs in KUJA_HOUSE_SIGN_EXCEPTIONS
     *   LEO_AQUARIUS      Mars in Simham or Kumbam
     *   YOGAKARAKA_LAGNA  Kadagam/Simham Lagna (Mars is Yogakaraka)
     *   GURU_MANGALA      Mars conjunct Jupiter (same rasi)
     *   CHANDRA_MANGALA   Mars conjunct the Moon (same rasi)
     *   GURU_DRISHTI      Jupiter's 5th/7th/9th aspect on Mars
     *
     * Mitigating conditions (status DOSHA_MILD when no cancellation applies):
     *   NOT_FROM_LAGNA    dosha arises only from the Moon and/or Venus
     *   MOON_ONLY / VENUS_ONLY (recorded for the explanation)
     *   SATURN_NODE_BALANCE Saturn, Rahu or Ketu also occupy a Kuja house from
     *                     the Lagna (in-chart mutual neutralisation)
     *
     * @param array $chart 1-based rasi numbers: mars, lagna, moon, venus,
     *                     jupiter (required); saturn, rahu, ketu (optional).
     * @return array status NOT_ASSESSED | DOSHA_NONE | DOSHA_CANCELLED |
     *               DOSHA_MILD | DOSHA_PRESENT, plus isPresent (effective
     *               dosha, null when not assessed), raw, cancelled, mild,
     *               houses (per reference), afflictedFrom, exceptions,
     *               mitigations and trilingual severity/explanation text.
     */
    private static function evaluateKujaDosha(array $chart): array {
        $rasi = static function ($value): ?int {
            return is_numeric($value) && (int) $value >= 1 && (int) $value <= 12 ? (int) $value : null;
        };
        $mars = $rasi($chart['mars'] ?? null);
        $lagna = $rasi($chart['lagna'] ?? null);
        $moon = $rasi($chart['moon'] ?? null);
        $venus = $rasi($chart['venus'] ?? null);
        $jupiter = $rasi($chart['jupiter'] ?? null);
        $saturn = $rasi($chart['saturn'] ?? null);
        $rahu = $rasi($chart['rahu'] ?? null);
        $ketu = $rasi($chart['ketu'] ?? null);

        $result = [
            'status' => 'NOT_ASSESSED',
            'isPresent' => null, 'raw' => null, 'cancelled' => null, 'mild' => null,
            'marsRasi' => $mars, 'marsRasiNameEn' => $mars ? self::$RASIS[$mars - 1]['en'] : null,
            'marsRasiNameTa' => $mars ? self::$RASIS[$mars - 1]['ta'] : null,
            'marsBhava' => null,
            'houses' => ['lagna' => null, 'moon' => null, 'venus' => null],
            'afflictedFrom' => [], 'exceptions' => [], 'mitigations' => [],
            'severityEn' => 'N/A', 'severityTa' => 'N/A', 'severityHi' => 'N/A',
            'explanationEn' => 'Required Mars, Lagna, Moon, Venus or Jupiter placement data is unavailable; Sevvay Dosha is not assessed.',
            'explanationTa' => 'செவ்வாய், லக்னம், சந்திரன், சுக்கிரன் அல்லது குருவின் ராசி நிலை கிடைக்கவில்லை; செவ்வாய் தோஷம் மதிப்பிடப்படவில்லை.',
            'explanationHi' => 'मंगल, लग्न, चंद्र, शुक्र अथवा गुरु की राशि स्थिति उपलब्ध नहीं है; मंगल दोष का आकलन नहीं हुआ है।',
        ];
        if ($mars === null || $lagna === null || $moon === null || $venus === null || $jupiter === null) {
            return $result; // Missing data must stay N/A, never a false "clean" result.
        }

        $houseFrom = static fn(int $reference): int => (($mars - $reference + 12) % 12) + 1;
        $houses = ['lagna' => $houseFrom($lagna), 'moon' => $houseFrom($moon), 'venus' => $houseFrom($venus)];
        $result['houses'] = $houses;
        $result['marsBhava'] = $houses['lagna'];
        $afflictedFrom = [];
        foreach ($houses as $reference => $house) {
            if (in_array($house, self::kujaDoshaHouses(), true)) $afflictedFrom[] = $reference;
        }
        $result['afflictedFrom'] = $afflictedFrom;
        $raw = count($afflictedFrom) > 0;
        $result['raw'] = $raw;

        $signName = static fn(int $r): string => self::$RASIS[$r - 1]['en'];
        $signNameTa = static fn(int $r): string => self::$RASIS[$r - 1]['ta'];
        $signNameHi = static fn(int $r): string => (string) preg_replace('/\s*\([^)]*\)\s*$/u', '', self::$RASIS[$r - 1]['hi']);
        $referenceEn = ['lagna' => 'Lagna', 'moon' => 'Moon', 'venus' => 'Venus'];
        $referenceFromEn = ['lagna' => 'the Lagna', 'moon' => 'the Moon (Chandra Lagna)', 'venus' => 'Venus (Sukra)'];
        $referenceTa = ['lagna' => 'லக்னம்', 'moon' => 'சந்திரன்', 'venus' => 'சுக்கிரன்'];
        $referenceHi = ['lagna' => 'लग्न', 'moon' => 'चंद्र', 'venus' => 'शुक्र'];

        if (!$raw) {
            $result['status'] = 'DOSHA_NONE';
            $result['isPresent'] = false; $result['cancelled'] = false; $result['mild'] = false;
            $result['severityEn'] = 'No Sevvay Dosha';
            $result['severityTa'] = 'செவ்வாய் தோஷம் இல்லை';
            $result['severityHi'] = 'मंगल दोष नहीं';
            $result['explanationEn'] = sprintf('Mars in %s occupies the %s house from the Lagna, the %s from the Moon and the %s from Venus - none of the Kuja Dosha houses (%s).',
                $signName($mars), self::ordinalEn($houses['lagna']), self::ordinalEn($houses['moon']), self::ordinalEn($houses['venus']), implode(', ', self::kujaDoshaHouses()));
            $result['explanationTa'] = sprintf('%s ராசியில் உள்ள செவ்வாய் லக்னத்திலிருந்து %d-ஆம், சந்திரனிலிருந்து %d-ஆம், சுக்கிரனிலிருந்து %d-ஆம் இடத்தில் உள்ளார்; இவை தோஷ ஸ்தானங்கள் (%s) அல்ல.',
                $signNameTa($mars), $houses['lagna'], $houses['moon'], $houses['venus'], implode(', ', self::kujaDoshaHouses()));
            $result['explanationHi'] = sprintf('%s राशि में स्थित मंगल लग्न से %dवें, चंद्र से %dवें तथा शुक्र से %dवें भाव में है; ये मंगल दोष के भाव (%s) नहीं हैं।',
                $signNameHi($mars), $houses['lagna'], $houses['moon'], $houses['venus'], implode(', ', self::kujaDoshaHouses()));
            return $result;
        }

        // ---- Cancelling exceptions -------------------------------------------------
        $exceptions = [];
        $add = static function (array &$list, string $code, string $en, string $ta, string $hi): void {
            $list[] = ['code' => $code, 'en' => $en, 'ta' => $ta, 'hi' => $hi];
        };
        if (in_array($mars, [1, 8], true)) {
            $add($exceptions, 'OWN_SIGN',
                "Mars is in its own sign {$signName($mars)} (Swakshetra); Sevvay Dosha does not apply.",
                "செவ்வாய் தனது ஆட்சி வீடான {$signNameTa($mars)} ராசியில் உள்ளதால் செவ்வாய் தோஷம் இல்லை.",
                "मंगल अपनी स्वराशि {$signNameHi($mars)} में है; मंगल दोष लागू नहीं होता है।");
        }
        if ($mars === 10) {
            $add($exceptions, 'EXALTED',
                'Mars is exalted in Magaram (Capricorn); an exalted Mars does not give Sevvay Dosha.',
                'செவ்வாய் மகர ராசியில் உச்சம் பெற்றுள்ளதால் செவ்வாய் தோஷம் இல்லை.',
                'मंगल मकर राशि में उच्च का है; उच्च मंगल से मंगल दोष नहीं होता है।');
        }
        if (in_array($mars, self::KUJA_UNIVERSAL_SIGN_EXCEPTIONS, true)) {
            $add($exceptions, 'LEO_AQUARIUS',
                "Mars in {$signName($mars)} is exempt from Sevvay Dosha in every dosha house (Simha/Kumbha exception).",
                "{$signNameTa($mars)} ராசியில் உள்ள செவ்வாய்க்கு எந்த தோஷ ஸ்தானத்திலும் தோஷம் இல்லை (சிம்ம/கும்ப விலக்கு).",
                "{$signNameHi($mars)} राशि का मंगल किसी भी दोष भाव में मंगल दोष नहीं देता है (सिंह/कुंभ अपवाद)।");
        }
        // House-sign exceptions neutralise only the reference point whose
        // count they match; the dosha is cancelled on this ground only when
        // every afflicted reference is covered.
        $houseSignExceptions = [];
        $neutralisedBySign = [];
        foreach ($afflictedFrom as $reference) {
            $house = $houses[$reference];
            if (in_array($mars, self::KUJA_HOUSE_SIGN_EXCEPTIONS[$house] ?? [], true)) {
                $neutralisedBySign[] = $reference;
                $houseSignExceptions[] = ['reference' => $reference, 'house' => $house];
            }
        }
        $remaining = array_values(array_diff($afflictedFrom, $neutralisedBySign));
        if ($houseSignExceptions && !$remaining) {
            $en = []; $ta = []; $hi = [];
            foreach ($houseSignExceptions as $item) {
                $en[] = sprintf('the %s house from %s', self::ordinalEn($item['house']), $referenceFromEn[$item['reference']]);
                $ta[] = sprintf('%s-இலிருந்து %d-ஆம் இடம்', $referenceTa[$item['reference']], $item['house']);
                $hi[] = sprintf('%s से %dवां भाव', $referenceHi[$item['reference']], $item['house']);
            }
            $add($exceptions, 'HOUSE_SIGN',
                sprintf('Mars in %s in %s is a classical house-sign exception (Sevvay Dosha Vilakku), so the dosha does not apply.', $signName($mars), implode(' and ', $en)),
                sprintf('%s ராசியில் உள்ள செவ்வாய்க்கு %s ஆகிய இடங்களுக்கான சாஸ்திர விலக்கு உண்டு; எனவே தோஷம் இல்லை.', $signNameTa($mars), implode(', ', $ta)),
                sprintf('%s राशि का मंगल %s के लिए शास्त्रीय भाव-राशि अपवाद में आता है; अतः दोष लागू नहीं होता है।', $signNameHi($mars), implode(' एवं ', $hi)));
        }
        if (in_array($lagna, [4, 5], true) && in_array($houses['lagna'], self::kujaDoshaHouses(), true)) {
            $add($exceptions, 'YOGAKARAKA_LAGNA',
                "For a {$signName($lagna)} Lagna Mars is the Yogakaraka; its placement does not create Sevvay Dosha.",
                "{$signNameTa($lagna)} லக்னத்திற்கு செவ்வாய் யோககாரகர்; அவரது நிலை செவ்வாய் தோஷத்தை உண்டாக்காது.",
                "{$signNameHi($lagna)} लग्न के लिए मंगल योगकारक है; उसकी स्थिति से मंगल दोष नहीं बनता है।");
        }
        if ($jupiter === $mars) {
            $add($exceptions, 'GURU_MANGALA',
                'Jupiter is conjunct Mars (Guru-Mangala Yoga); this classical Dosha Nivrutti rule relieves the dosha.',
                'குரு செவ்வாயுடன் இணைந்துள்ளார் (குரு-மங்கள யோகம்); இந்த சாஸ்திர தோஷ நிவர்த்தி விதி தோஷத்தைத் தணிக்கிறது.',
                'गुरु मंगल के साथ युति में है (गुरु-मंगल योग); यह शास्त्रीय दोष निवृत्ति नियम दोष को शमित करता है।');
        }
        if ($moon === $mars) {
            $add($exceptions, 'CHANDRA_MANGALA',
                'The Moon is conjunct Mars (Chandra-Mangala / Kuja-Chandra Yoga); this classical rule relieves the dosha.',
                'சந்திரன் செவ்வாயுடன் இணைந்துள்ளார் (சந்திர-மங்கள யோகம்); இந்த சாஸ்திர விதி தோஷத்தைத் தணிக்கிறது.',
                'चंद्र मंगल के साथ युति में है (चंद्र-मंगल योग); यह शास्त्रीय नियम दोष को शमित करता है।');
        }
        $guruAspectCount = (($mars - $jupiter + 12) % 12) + 1;
        if ($jupiter !== $mars && in_array($guruAspectCount, [5, 7, 9], true)) {
            $add($exceptions, 'GURU_DRISHTI',
                sprintf('Jupiter aspects Mars with its %s-house aspect (Guru Drishti); the benefic aspect relieves Sevvay Dosha.', self::ordinalEn($guruAspectCount)),
                sprintf('குரு தனது %d-ஆம் பார்வையால் செவ்வாயைப் பார்க்கிறார்; குரு பார்வை தோஷத்தைத் தணிக்கிறது.', $guruAspectCount),
                sprintf('गुरु अपनी %dवीं दृष्टि से मंगल को देखता है; गुरु दृष्टि दोष को शमित करती है।', $guruAspectCount));
        }

        // ---- Mitigating conditions (evaluated on the references still afflicted) ----
        $mitigations = [];
        if ($remaining && $houseSignExceptions) {
            $covered = implode(' and ', array_map(static fn($i) => sprintf('the %s house from %s', self::ordinalEn($i['house']), $referenceFromEn[$i['reference']]), $houseSignExceptions));
            $add($mitigations, 'HOUSE_SIGN_PARTIAL',
                sprintf('Mars in %s in %s is a classical house-sign exception, so that count does not add to the dosha.', $signName($mars), $covered),
                sprintf('%s ராசியில் உள்ள செவ்வாய்க்கு %s-இலிருந்து ஆன எண்ணிக்கைக்கு சாஸ்திர விலக்கு உண்டு.', $signNameTa($mars), implode(', ', array_map(static fn($i) => $referenceTa[$i['reference']], $houseSignExceptions))),
                sprintf('%s राशि का मंगल %s से गिनती में शास्त्रीय अपवाद में आता है।', $signNameHi($mars), implode(' एवं ', array_map(static fn($i) => $referenceHi[$i['reference']], $houseSignExceptions))));
        }
        if ($remaining && !in_array('lagna', $remaining, true)) {
            $only = implode(' and ', array_map(static fn($r) => $referenceFromEn[$r], $remaining));
            $onlyTa = implode(' மற்றும் ', array_map(static fn($r) => $referenceTa[$r], $remaining));
            $onlyHi = implode(' एवं ', array_map(static fn($r) => $referenceHi[$r], $remaining));
            $add($mitigations, 'NOT_FROM_LAGNA',
                "The dosha arises only from {$only}, not from the Lagna, so it is considered mild.",
                "{$onlyTa} அடிப்படையில் மட்டுமே தோஷம்; லக்னத்திலிருந்து இல்லை - எனவே மிதமானது.",
                "दोष केवल {$onlyHi} से बनता है, लग्न से नहीं; अतः यह अल्प माना जाता है।");
        }
        $balancers = [];
        foreach (['saturn' => $saturn, 'rahu' => $rahu, 'ketu' => $ketu] as $graha => $grahaRasi) {
            if ($grahaRasi !== null && in_array((($grahaRasi - $lagna + 12) % 12) + 1, self::kujaDoshaHouses(), true)) $balancers[] = $graha;
        }
        if ($balancers) {
            $namesEn = ['saturn' => 'Saturn', 'rahu' => 'Rahu', 'ketu' => 'Ketu'];
            $namesTa = ['saturn' => 'சனி', 'rahu' => 'ராகு', 'ketu' => 'கேது'];
            $namesHi = ['saturn' => 'शनि', 'rahu' => 'राहु', 'ketu' => 'केतु'];
            $add($mitigations, 'SATURN_NODE_BALANCE',
                implode(', ', array_map(static fn($g) => $namesEn[$g], $balancers)) . ' also occupies a Kuja house from the Lagna, which reduces the intensity of the dosha (in-chart balance).',
                implode(', ', array_map(static fn($g) => $namesTa[$g], $balancers)) . ' லக்னத்திலிருந்து தோஷ ஸ்தானத்தில் இருப்பதால் தோஷத்தின் தீவிரம் குறைகிறது.',
                implode(', ', array_map(static fn($g) => $namesHi[$g], $balancers)) . ' भी लग्न से मंगल दोष भाव में है, जिससे दोष की तीव्रता घटती है।');
        }

        $cancelled = count($exceptions) > 0;
        $result['exceptions'] = $exceptions;
        $result['mitigations'] = $cancelled ? [] : $mitigations; // moot once cancelled
        $mild = !$cancelled && count($mitigations) > 0;
        $result['cancelled'] = $cancelled;
        $result['mild'] = $mild;
        $result['isPresent'] = !$cancelled; // DOSHA_MILD still counts as present (reduced)

        $placementEn = sprintf('Mars in %s is in the %s house from the Lagna, the %s from the Moon and the %s from Venus (dosha from: %s).',
            $signName($mars), self::ordinalEn($houses['lagna']), self::ordinalEn($houses['moon']), self::ordinalEn($houses['venus']),
            implode(', ', array_map(static fn($r) => $referenceEn[$r], $afflictedFrom)));
        $placementTa = sprintf('%s ராசியில் உள்ள செவ்வாய் லக்னத்திலிருந்து %d, சந்திரனிலிருந்து %d, சுக்கிரனிலிருந்து %d-ஆம் இடத்தில் உள்ளார் (தோஷம்: %s).',
            $signNameTa($mars), $houses['lagna'], $houses['moon'], $houses['venus'],
            implode(', ', array_map(static fn($r) => $referenceTa[$r], $afflictedFrom)));
        $placementHi = sprintf('%s राशि का मंगल लग्न से %dवें, चंद्र से %dवें तथा शुक्र से %dवें भाव में है (दोष: %s से)।',
            $signNameHi($mars), $houses['lagna'], $houses['moon'], $houses['venus'],
            implode(', ', array_map(static fn($r) => $referenceHi[$r], $afflictedFrom)));
        $join = static fn(array $items, string $key): string => implode(' ', array_column($items, $key));

        if ($cancelled) {
            $result['status'] = 'DOSHA_CANCELLED';
            // A cancelled indication is not an active dosha. Keep the
            // exception in the detailed explanation, while the summary uses
            // the same effective result as `isPresent`.
            $result['severityEn'] = 'No active Sevvay Dosha (Dosha Nivrutti applies)';
            $result['severityTa'] = 'தோஷம் இல்லை (தோஷ நிவர்த்தி விதி பொருந்துகிறது)';
            $result['severityHi'] = 'मंगल दोष नहीं (दोष निवृत्ति नियम लागू)';
            $result['explanationEn'] = $placementEn . ' ' . $join($exceptions, 'en') . ' Under Dosha Nivrutti this count is relieved for marriage matching; this is an indicator only and guarantees no particular outcome.';
            $result['explanationTa'] = $placementTa . ' ' . $join($exceptions, 'ta') . ' திருமணப் பொருத்தத்தில் தோஷ நிவர்த்தி விதியால் இது தணிக்கப்படுகிறது; இது குறியீடு மட்டுமே, உறுதியான பலனை உறுதி செய்யாது.';
            $result['explanationHi'] = $placementHi . ' ' . $join($exceptions, 'hi') . ' विवाह मिलान में दोष निवृत्ति नियम से इसे शमित माना जाता है; यह केवल संकेत है, किसी निश्चित परिणाम की गारंटी नहीं है।';
        } elseif ($mild) {
            $result['status'] = 'DOSHA_MILD';
            $result['severityEn'] = 'Mild Sevvay Dosha (reduced by classical rules)';
            $result['severityTa'] = 'மிதமான செவ்வாய் தோஷம் (சாஸ்திர விதிகளால் குறைக்கப்பட்டது)';
            $result['severityHi'] = 'अल्प मंगल दोष (शास्त्रीय नियमों से न्यून)';
            $result['explanationEn'] = $placementEn . ' ' . $join($mitigations, 'en') . ' Simple remedies and a compatible partner chart are sufficient; it is not a severe dosha.';
            $result['explanationTa'] = $placementTa . ' ' . $join($mitigations, 'ta') . ' எளிய பரிகாரங்களும் பொருத்தமான ஜாதகமும் போதுமானவை; இது கடுமையான தோஷம் அல்ல.';
            $result['explanationHi'] = $placementHi . ' ' . $join($mitigations, 'hi') . ' सरल उपाय एवं अनुकूल कुंडली मिलान पर्याप्त है; यह गंभीर दोष नहीं है।';
        } else {
            $result['status'] = 'DOSHA_PRESENT';
            $result['severityEn'] = 'Sevvay Dosha Present (remedies & Dosha Samyam match advised)';
            $result['severityTa'] = 'செவ்வாய் தோஷம் உள்ளது (பரிகாரம் மற்றும் தோஷ சம்யப் பொருத்தம் நலம்)';
            $result['severityHi'] = 'मंगल दोष उपस्थित (उपाय एवं दोष साम्य मिलान आवश्यक)';
            $result['explanationEn'] = $placementEn . ' No classical Dosha Nivrutti rule (own/exalted sign, Leo/Aquarius, house-sign exception, Jupiter or Moon association) applies. Traditional remedies and a partner with matching Sevvay Dosha are advised.';
            $result['explanationTa'] = $placementTa . ' ஆட்சி/உச்சம், சிம்ம/கும்பம், இட-ராசி விலக்கு, குரு அல்லது சந்திர சேர்க்கை போன்ற எந்த தோஷ நிவர்த்தி விதியும் பொருந்தவில்லை. பரிகாரங்களும் செவ்வாய் தோஷம் உள்ள ஜாதகப் பொருத்தமும் நலம்.';
            $result['explanationHi'] = $placementHi . ' स्वराशि/उच्च, सिंह/कुंभ, भाव-राशि अपवाद, गुरु अथवा चंद्र युति जैसा कोई अपवाद लागू नहीं है। पारंपरिक उपाय तथा मंगल दोष वाले साथी से मिलान की सलाह है।';
        }
        return $result;
    }

    private static function ordinalEn(int $n): string {
        if ($n % 100 >= 11 && $n % 100 <= 13) return $n . 'th';
        return $n . (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');
    }

    private static function calculatePoruthams($boyNakIdx, $boyRasiIdx, $girlNakIdx, $girlRasiIdx, $boyLord, $girlLord) {
        $results = [];

        // 1. Dina Porutham: count from Bride's star to Groom's star (1..27).
        //    - Same star: allowed for Rohini(3), Arudra(5), Pushya(7), Magha(9),
        //      Vishakha(15), Shravana(21), Uttara Bhadrapada(25), Revati(26).
        //    - 22nd star (Vainashika): rejected even though 22 % 9 === 4.
        $starDiff = (($boyNakIdx - $girlNakIdx + 27) % 27) + 1;
        $dinaRem = $starDiff % 9;
        $ekaAllowed = [3, 5, 7, 9, 15, 21, 25, 26];
        if ($boyNakIdx === $girlNakIdx) {
            $dinaGood = in_array($girlNakIdx, $ekaAllowed, true);
        } elseif ($starDiff === 22) {
            $dinaGood = false;
        } else {
            $dinaGood = in_array($dinaRem, [2, 4, 6, 8, 0], true) || $starDiff === 27;
        }
        $results['dina'] = ['pts' => $dinaGood ? 3 : 0, 'max' => 3, 'pass' => $dinaGood];

        // 2. Gana Porutham (mirrors src/lib/astrology/matchmaking.ts)
        $bg = self::$NAK_GANA[$boyNakIdx]; // groom Gana
        $gg = self::$NAK_GANA[$girlNakIdx]; // bride Gana
        if ($gg === $bg || ($bg === 0 && $gg === 1)) {
            $ganaUnit = 1.0; // UTTHAMAM
        } elseif (($bg === 1 && $gg === 0) || ($bg === 2 && $gg === 0 && $starDiff > 14)) {
            $ganaUnit = 0.5; // MADHYAMAM
        } else {
            $ganaUnit = 0.0; // PORUNDHADHU
        }
        $results['gana'] = ['pts' => $ganaUnit * 4, 'max' => 4, 'pass' => $ganaUnit > 0];

        // 3. Mahendra Porutham: counts 4, 7, 10, 13, 16, 19, 22, 25 from Bride to Groom
        $mahendraGood = in_array($starDiff, [4, 7, 10, 13, 16, 19, 22, 25], true);
        $results['mahendra'] = ['pts' => $mahendraGood ? 3 : 0, 'max' => 3, 'pass' => $mahendraGood];

        // 4. Stree Deergha Porutham: > 13 Utthamam, >= 7 Madhyamam, < 7 Porundhadhu
        $sdUnit = $starDiff > 13 ? 1.0 : ($starDiff >= 7 ? 0.5 : 0.0);
        $results['stree_deergha'] = ['pts' => $sdUnit * 2, 'max' => 2, 'pass' => $sdUnit > 0];

        // 5. Yoni Porutham: same animal = Utthamam (4/4), 7 Maha-Vaira inimical
        //    animal pairs = Porundhadhu (0/4), all other pairs = Madhyamam (2/4).
        [$groomAnimal] = self::$NAK_YONI[$boyNakIdx];
        [$brideAnimal] = self::$NAK_YONI[$girlNakIdx];
        $mahaVairaPairs = [
            'horse:buffalo', 'buffalo:horse',
            'elephant:lion', 'lion:elephant',
            'goat:monkey', 'monkey:goat',
            'serpent:mongoose', 'mongoose:serpent',
            'dog:deer', 'deer:dog',
            'cat:rat', 'rat:cat',
            'cow:tiger', 'tiger:cow',
        ];
        $isYoniEnemy = in_array($brideAnimal . ':' . $groomAnimal, $mahaVairaPairs, true);
        if ($groomAnimal === $brideAnimal) {
            $yoniPts = 4;
            $yoniRelationship = 'same';
        } elseif ($isYoniEnemy) {
            $yoniPts = 0;
            $yoniRelationship = 'enemy';
        } else {
            $yoniPts = 2;
            $yoniRelationship = 'neutral';
        }
        $yoniAnimalNames = [
            'horse' => ['en' => 'Horse', 'ta' => 'குதிரை', 'hi' => 'घोड़ा'],
            'elephant' => ['en' => 'Elephant', 'ta' => 'யானை', 'hi' => 'हाथी'],
            'goat' => ['en' => 'Goat', 'ta' => 'ஆடு', 'hi' => 'बकरी'],
            'serpent' => ['en' => 'Serpent', 'ta' => 'பாம்பு', 'hi' => 'सर्प'],
            'dog' => ['en' => 'Dog', 'ta' => 'நாய்', 'hi' => 'कुत्ता'],
            'cat' => ['en' => 'Cat', 'ta' => 'பூனை', 'hi' => 'बिल्ली'],
            'rat' => ['en' => 'Rat', 'ta' => 'எலி', 'hi' => 'चूहा'],
            'cow' => ['en' => 'Cow', 'ta' => 'பசு', 'hi' => 'गाय'],
            'buffalo' => ['en' => 'Buffalo', 'ta' => 'எருமை', 'hi' => 'भैंस'],
            'tiger' => ['en' => 'Tiger', 'ta' => 'புலி', 'hi' => 'बाघ'],
            'deer' => ['en' => 'Deer', 'ta' => 'மான்', 'hi' => 'हिरण'],
            'monkey' => ['en' => 'Monkey', 'ta' => 'குரங்கு', 'hi' => 'बंदर'],
            'mongoose' => ['en' => 'Mongoose', 'ta' => 'கீரி', 'hi' => 'नेवला'],
            'lion' => ['en' => 'Lion', 'ta' => 'சிங்கம்', 'hi' => 'सिंह'],
        ];
        $yoniRelationshipText = [
            'same' => ['en' => 'same yoni', 'ta' => 'ஒரே யோனி', 'hi' => 'समान योनि'],
            'friend' => ['en' => 'friendly', 'ta' => 'நட்பு', 'hi' => 'मैत्रीपूर्ण'],
            'neutral' => ['en' => 'neutral', 'ta' => 'நடுநிலை', 'hi' => 'तटस्थ'],
            'enemy' => ['en' => 'enmity', 'ta' => 'பகை', 'hi' => 'शत्रुता'],
        ][$yoniRelationship];
        $brideYoniNames = $yoniAnimalNames[$brideAnimal];
        $groomYoniNames = $yoniAnimalNames[$groomAnimal];
        $results['yoni'] = [
            'pts' => $yoniPts,
            'max' => 4,
            'pass' => $yoniPts > 0,
            'yoniRelationship' => $yoniRelationship,
            'yoniRelationshipEn' => $yoniRelationshipText['en'],
            'yoniRelationshipTa' => $yoniRelationshipText['ta'],
            'yoniRelationshipHi' => $yoniRelationshipText['hi'],
            'yoniBrideAnimalEn' => $brideYoniNames['en'],
            'yoniBrideAnimalTa' => $brideYoniNames['ta'],
            'yoniBrideAnimalHi' => $brideYoniNames['hi'],
            'yoniGroomAnimalEn' => $groomYoniNames['en'],
            'yoniGroomAnimalTa' => $groomYoniNames['ta'],
            'yoniGroomAnimalHi' => $groomYoniNames['hi'],
            'explanationEn' => 'Bride: ' . $brideYoniNames['en'] . '; Groom: ' . $groomYoniNames['en'] . '. Yoni relationship: ' . $yoniRelationshipText['en'] . '.',
            'explanationTa' => 'மணமகள்: ' . $brideYoniNames['ta'] . '; மணமகன்: ' . $groomYoniNames['ta'] . '. யோனி உறவு: ' . $yoniRelationshipText['ta'] . '.',
            'explanationHi' => 'वधू: ' . $brideYoniNames['hi'] . '; वर: ' . $groomYoniNames['hi'] . ' — योनि संबंध ' . $yoniRelationshipText['hi'] . ' है।',
        ];

        // 6. Rasi Porutham: count from Bride's Rasi to Groom's Rasi (1..12)
        $bRasi = $girlRasiIdx + 1;
        $gRasi = $boyRasiIdx + 1;
        $rasiDiff = (($gRasi - $bRasi + 12) % 12) + 1;
        if (in_array($rasiDiff, [3, 4, 7, 10, 11, 12], true)) {
            $rasiUnit = 1.0;
        } elseif (in_array($rasiDiff, [6, 8], true)) {
            $rasiUnit = ($boyLord === $girlLord) ? 0.5 : 0.0;
        } else {
            $rasiUnit = 0.5;
        }
        $results['rasi'] = ['pts' => $rasiUnit * 5, 'max' => 5, 'pass' => $rasiUnit > 0];

        // 7. Rasiyadhipathi Porutham: Deva/Asura planetary lord affinity (mirrors TS)
        $devaLords = ['sun', 'moon', 'mars', 'jupiter'];
        $asuraLords = ['mercury', 'venus', 'saturn'];
        if ($girlLord === $boyLord
            || (in_array($girlLord, $devaLords, true) && in_array($boyLord, $devaLords, true))
            || (in_array($girlLord, $asuraLords, true) && in_array($boyLord, $asuraLords, true))) {
            $lordUnit = 1.0;
        } elseif (($girlLord === 'mercury' && in_array($boyLord, $devaLords, true))
            || ($boyLord === 'mercury' && in_array($girlLord, $devaLords, true))) {
            $lordUnit = 0.5;
        } else {
            $lordUnit = 0.0;
        }
        $results['rasiyadhipathi'] = ['pts' => $lordUnit * 4, 'max' => 4, 'pass' => $lordUnit > 0];

        // 8. Vasiya Porutham: classical South Indian 12-Rasi Penn-Rasi Vasiyam table
        $vasiyaMap = [
            1 => [5, 8], 2 => [4, 7], 3 => [6], 4 => [8, 9], 5 => [7, 9], 6 => [3, 12],
            7 => [10, 12], 8 => [4, 11], 9 => [12], 10 => [1, 11], 11 => [1, 10], 12 => [3, 10],
        ];
        $vasyaGood = in_array($gRasi, $vasiyaMap[$bRasi] ?? [], true);
        $results['vasiya'] = ['pts' => $vasyaGood ? 2 : 0, 'max' => 2, 'pass' => $vasyaGood];

        // 9. Rajju Porutham: critical 5-group body mapping
        $boyGroup = self::rajjuTable()['groups'][$boyNakIdx];
        $girlGroup = self::rajjuTable()['groups'][$girlNakIdx];
        $rajjuGood = ($boyGroup !== $girlGroup);
        $results['rajju'] = ['pts' => $rajjuGood ? 5 : 0, 'max' => 5, 'pass' => $rajjuGood, 'crucial' => true];

        // 10. Vedha Porutham: all classical Vedha pairs INCLUDING Pancha-Vedha (4, 13, 22)
        $vedhaPairs = [
            '0:17', '17:0', '1:16', '16:1', '2:15', '15:2', '3:14', '14:3',
            '5:21', '21:5', '6:20', '20:6', '7:19', '19:7', '8:18', '18:8',
            '9:26', '26:9', '10:25', '25:10', '11:24', '24:11', '12:23', '23:12',
            '4:13', '13:4', '13:22', '22:13', '4:22', '22:4',
        ];
        $vedhaHit = in_array($girlNakIdx . ':' . $boyNakIdx, $vedhaPairs, true);
        $results['vedha'] = ['pts' => $vedhaHit ? 0 : 3, 'max' => 3, 'pass' => !$vedhaHit, 'crucial' => true];

        return $results;
    }

}
