<?php
/**
 * ASTRO SIVAM — Planetary Dignity, Yogas, Kendradhipati & Horoscope Calculation
 */

trait AstroEngineHoroscopeTrait
{
    /** Debilitation sign of a graha (exaltation + 6 signs), or null for the nodes. */
    private static function debilitationSign(string $graha): ?int {
        $exalted = self::DIGNITY_EXALTATION_SIGN[$graha] ?? null;
        return $exalted === null ? null : (($exalted - 1 + 6) % 12) + 1;
    }

    /** Whole-sign house number of `target` counted from `reference` (both 1-based). */
    private static function dignityHouseFrom(int $target, int $reference): int {
        return (($target - $reference + 12) % 12) + 1;
    }

    /**
     * Neecha Bhanga for a debilitated graha: the graha exalted in the occupied
     * sign is conjunct it or sits in a kendra (1/4/7/10) from the Lagna or the
     * Moon, OR the dispositor (lord of the occupied sign) sits in such a kendra.
     *
     * Each reason carries a short rule tag, so the report can print
     * "Neecha Bhanga (by Jupiter conjunction)" instead of a flat "cancelled".
     * The Moon is never used as a kendra reference for itself (it is always in
     * the 1st house from the Moon), which would invent a reason on every chart
     * whose dispositor is the Moon (Kadagam).
     */
    private static function evaluateNeechaBhanga(string $graha, int $rasi, int $lagnaRasi, int $moonRasi, array $rasiByGraha): array {
        $reasons = [];
        $exaltationGraha = self::DIGNITY_SIGN_EXALTED_BY[$rasi] ?? null;
        $dispositor = self::DIGNITY_SIGN_LORDS[$rasi] ?? null;
        $debilitatedName = self::DIGNITY_GRAHA_TEXT[$graha] ?? ['en' => $graha, 'ta' => $graha, 'hi' => $graha];
        if ($exaltationGraha !== null) {
            $exaltName = self::DIGNITY_GRAHA_TEXT[$exaltationGraha] ?? ['en' => $exaltationGraha, 'ta' => $exaltationGraha, 'hi' => $exaltationGraha];
            $exaltRasi = $rasiByGraha[$exaltationGraha] ?? null;
            if ($exaltRasi === $rasi) {
                $reasons[] = [
                    'code' => 'EXALTATION_LORD_CONJUNCT',
                    'en' => $exaltName['en'] . ', the graha exalted in this sign, is conjunct the debilitated ' . $debilitatedName['en'] . '.',
                    'ta' => 'இந்த ராசியில் உச்சம் பெறும் ' . $exaltName['ta'] . ' நீச நிலையில் உள்ள ' . $debilitatedName['ta'] . ' உடன் இணைந்துள்ளார்.',
                    'hi' => 'इस राशि में उच्च का ' . $exaltName['hi'] . ' नीच स्थिति वाले ' . $debilitatedName['hi'] . ' के साथ युति में है।',
                    'tagEn' => 'by ' . $exaltName['en'] . ' conjunction',
                    'tagTa' => $exaltName['ta'] . ' சேர்க்கையால்',
                    'tagHi' => $exaltName['hi'] . ' युति के कारण',
                ];
            }
            if ($exaltRasi !== null) {
                $fromLagna = self::dignityHouseFrom($exaltRasi, $lagnaRasi);
                $fromMoon = $exaltationGraha === 'moon' ? 0 : self::dignityHouseFrom($exaltRasi, $moonRasi);
                if (in_array($fromLagna, [1, 4, 7, 10], true)) {
                    $reasons[] = [
                        'code' => 'EXALTATION_LORD_KENDRA_LAGNA',
                        'en' => $exaltName['en'] . ' is in a kendra (' . $fromLagna . ') from the Lagna.',
                        'ta' => 'உச்ச கிரகம் ' . $exaltName['ta'] . ' லக்னத்திலிருந்து ' . $fromLagna . '-ஆம் கேந்திரத்தில் உள்ளார்.',
                        'hi' => $exaltName['hi'] . ' लग्न से ' . $fromLagna . 'वें केंद्र में है।',
                        'tagEn' => 'by ' . $exaltName['en'] . ' in a kendra (' . $fromLagna . ') from the Lagna',
                        'tagTa' => $exaltName['ta'] . ' லக்னத்திலிருந்து ' . $fromLagna . '-ஆம் கேந்திரத்தில் இருப்பதால்',
                        'tagHi' => $exaltName['hi'] . ' लग्न से ' . $fromLagna . 'वें केंद्र में होने के कारण',
                    ];
                }
                if (in_array($fromMoon, [1, 4, 7, 10], true)) {
                    $reasons[] = [
                        'code' => 'EXALTATION_LORD_KENDRA_MOON',
                        'en' => $exaltName['en'] . ' is in a kendra (' . $fromMoon . ') from the Moon.',
                        'ta' => 'உச்ச கிரகம் ' . $exaltName['ta'] . ' சந்திரனிலிருந்து ' . $fromMoon . '-ஆம் கேந்திரத்தில் உள்ளார்.',
                        'hi' => $exaltName['hi'] . ' चंद्र से ' . $fromMoon . 'वें केंद्र में है।',
                        'tagEn' => 'by ' . $exaltName['en'] . ' in a kendra (' . $fromMoon . ') from the Moon',
                        'tagTa' => $exaltName['ta'] . ' சந்திரனிலிருந்து ' . $fromMoon . '-ஆம் கேந்திரத்தில் இருப்பதால்',
                        'tagHi' => $exaltName['hi'] . ' चंद्र से ' . $fromMoon . 'वें केंद्र में होने के कारण',
                    ];
                }
            }
        }
        if ($dispositor !== null && $dispositor !== $graha) {
            $dispositorRasi = $rasiByGraha[$dispositor] ?? null;
            $dispositorName = self::DIGNITY_GRAHA_TEXT[$dispositor] ?? ['en' => $dispositor, 'ta' => $dispositor, 'hi' => $dispositor];
            if ($dispositorRasi !== null) {
                $fromLagna = self::dignityHouseFrom($dispositorRasi, $lagnaRasi);
                $fromMoon = $dispositor === 'moon' ? 0 : self::dignityHouseFrom($dispositorRasi, $moonRasi);
                if (in_array($fromLagna, [1, 4, 7, 10], true)) {
                    $reasons[] = [
                        'code' => 'DISPOSITOR_KENDRA_LAGNA',
                        'en' => 'The dispositor ' . $dispositorName['en'] . ' is in a kendra (' . $fromLagna . ') from the Lagna.',
                        'ta' => 'அதிபதி ' . $dispositorName['ta'] . ' லக்னத்திலிருந்து ' . $fromLagna . '-ஆம் கேந்திரத்தில் உள்ளார்.',
                        'hi' => 'राशीश ' . $dispositorName['hi'] . ' लग्न से ' . $fromLagna . 'वें केंद्र में है।',
                        'tagEn' => 'by dispositor ' . $dispositorName['en'] . ' in a kendra (' . $fromLagna . ') from the Lagna',
                        'tagTa' => 'அதிபதி ' . $dispositorName['ta'] . ' லக்னத்திலிருந்து ' . $fromLagna . '-ஆம் கேந்திரத்தில் இருப்பதால்',
                        'tagHi' => 'राशीश ' . $dispositorName['hi'] . ' लग्न से ' . $fromLagna . 'वें केंद्र में होने के कारण',
                    ];
                }
                if (in_array($fromMoon, [1, 4, 7, 10], true)) {
                    $reasons[] = [
                        'code' => 'DISPOSITOR_KENDRA_MOON',
                        'en' => 'The dispositor ' . $dispositorName['en'] . ' is in a kendra (' . $fromMoon . ') from the Moon.',
                        'ta' => 'அதிபதி ' . $dispositorName['ta'] . ' சந்திரனிலிருந்து ' . $fromMoon . '-ஆம் கேந்திரத்தில் உள்ளார்.',
                        'hi' => 'राशीश ' . $dispositorName['hi'] . ' चंद्र से ' . $fromMoon . 'वें केंद्र में है।',
                        'tagEn' => 'by dispositor ' . $dispositorName['en'] . ' in a kendra (' . $fromMoon . ') from the Moon',
                        'tagTa' => 'அதிபதி ' . $dispositorName['ta'] . ' சந்திரனிலிருந்து ' . $fromMoon . '-ஆம் கேந்திரத்தில் இருப்பதால்',
                        'tagHi' => 'राशीश ' . $dispositorName['hi'] . ' चंद्र से ' . $fromMoon . 'वें केंद्र में होने के कारण',
                    ];
                }
            }
        }
        $isCancelled = count($reasons) > 0;
        if (!$isCancelled) {
            return ['isCancelled' => false, 'reasons' => [], 'tagEn' => '', 'tagTa' => '', 'tagHi' => '', 'en' => '', 'ta' => '', 'hi' => ''];
        }
        // Heading only — the rule is always named next to it. Never a flat
        // "cancelled" and never a promise that the debilitation is erased.
        $heading = ['en' => 'Neecha Bhanga', 'ta' => 'நீச பங்க', 'hi' => 'नीच भंग'];
        $caveat = [
            'en' => 'This rule reduces the effect of the debilitation; it does not erase it, and no particular result is guaranteed.',
            'ta' => 'இந்த விதி நீச நிலையின் விளைவைத் தணிக்கிறது; அதை முழுமையாக நீக்குவதுமில்லை, உறுதியான பலனை உறுதி செய்வதுமில்லை.',
            'hi' => 'यह नियम नीच स्थिति के प्रभाव को कम करता है; उसे मिटाता नहीं है और किसी निश्चित परिणाम की गारंटी नहीं देता है।',
        ];
        $tagEn = implode('; ', array_column($reasons, 'tagEn'));
        $tagTa = implode('; ', array_column($reasons, 'tagTa'));
        $tagHi = implode('; ', array_column($reasons, 'tagHi'));
        return [
            'isCancelled' => true,
            'reasons' => $reasons,
            'tagEn' => $tagEn,
            'tagTa' => $tagTa,
            'tagHi' => $tagHi,
            'en' => $heading['en'] . ' (' . $tagEn . '): ' . implode(' ', array_column($reasons, 'en')) . ' ' . $caveat['en'],
            'ta' => $heading['ta'] . ' (' . $tagTa . '): ' . implode(' ', array_column($reasons, 'ta')) . ' ' . $caveat['ta'],
            'hi' => $heading['hi'] . ' (' . $tagHi . '): ' . implode(' ', array_column($reasons, 'hi')) . ' ' . $caveat['hi'],
        ];
    }

    /** Exalted / own / debilitated / combust / retrograde + Neecha Bhanga. */
    private static function computePlanetDignity(string $graha, int $rasi, bool $isCombust, bool $isRetrograde, int $lagnaRasi, int $moonRasi, array $rasiByGraha): array {
        $exalted = (self::DIGNITY_EXALTATION_SIGN[$graha] ?? null) === $rasi;
        $own = in_array($rasi, self::DIGNITY_OWN_SIGNS[$graha] ?? [], true);
        $debilitated = self::debilitationSign($graha) === $rasi;
        $isNode = $graha === 'rahu' || $graha === 'ketu';
        $status = 'neutral';
        if ($isNode) {
            $status = 'not-applicable';
        } elseif ($exalted) {
            $status = 'exalted';
        } elseif ($own) {
            $status = 'own';
        } elseif ($debilitated) {
            $status = 'debilitated';
        }
        $statusTexts = [
            'exalted' => ['en' => 'Exalted (Uchcha)', 'ta' => 'உச்சம் (உச்ச நிலை)', 'hi' => 'उच्च (उच्च स्थान)'],
            'own' => ['en' => 'Own sign (Swakshetra)', 'ta' => 'ஆட்சி (சுய ராசி)', 'hi' => 'स्वराशि (स्वक्षेत्र)'],
            'debilitated' => ['en' => 'Debilitated (Neecha)', 'ta' => 'நீசம் (நீச நிலை)', 'hi' => 'नीच (नीच स्थान)'],
            'neutral' => ['en' => 'Neutral', 'ta' => 'சம நிலை', 'hi' => 'सामान्य स्थिति'],
            'not-applicable' => ['en' => 'No classical sign dignity (node)', 'ta' => 'சிறப்பு நிலை இல்லை (சாயா கிரகம்)', 'hi' => 'शास्त्रीय राशि-स्थिति नहीं (छाया ग्रह)'],
        ];
        $statusText = $statusTexts[$status];
        $combustText = ['en' => 'Combust (Astangata)', 'ta' => 'அஸ்தமனம் (சூரியனுக்கு அருகில்)', 'hi' => 'अस्त (सूर्य के निकट)'];
        $retroText = ['en' => 'Retrograde (Vakri)', 'ta' => 'வக்கிரம்', 'hi' => 'वक्री'];
        // Heading only — the tag always names the rule that applies, e.g.
        // "Neecha Bhanga (by Jupiter conjunction)". Never a flat "cancelled".
        $neechaText = ['en' => 'Neecha Bhanga', 'ta' => 'நீச பங்க', 'hi' => 'नीच भंग'];
        $neecha = $debilitated
            ? self::evaluateNeechaBhanga($graha, $rasi, $lagnaRasi, $moonRasi, $rasiByGraha)
            : ['isCancelled' => false, 'reasons' => [], 'tagEn' => '', 'tagTa' => '', 'tagHi' => '', 'en' => '', 'ta' => '', 'hi' => ''];
        $tags = [];
        foreach (['en', 'ta', 'hi'] as $lang) {
            $parts = [$statusText[$lang]];
            if ($isCombust) { $parts[] = $combustText[$lang]; }
            if ($isRetrograde) { $parts[] = $retroText[$lang]; }
            if ($neecha['isCancelled']) {
                $tag = $lang === 'ta' ? $neecha['tagTa'] : ($lang === 'hi' ? $neecha['tagHi'] : $neecha['tagEn']);
                $parts[] = $neechaText[$lang] . ' (' . $tag . ')';
            }
            $tags[$lang] = implode(', ', array_filter($parts, static function ($part) { return $part !== ''; }));
        }
        return [
            'graha' => $graha,
            'status' => $status,
            'statusEn' => $statusText['en'], 'statusTa' => $statusText['ta'], 'statusHi' => $statusText['hi'],
            'isExalted' => $exalted, 'isOwnSign' => $own, 'isDebilitated' => $debilitated,
            'isCombust' => $isCombust, 'isRetrograde' => $isRetrograde,
            'isNeechaBhanga' => $neecha['isCancelled'],
            'neechaBhangaEn' => $neecha['en'], 'neechaBhangaTa' => $neecha['ta'], 'neechaBhangaHi' => $neecha['hi'],
            'neechaBhangaTagEn' => $neecha['tagEn'], 'neechaBhangaTagTa' => $neecha['tagTa'], 'neechaBhangaTagHi' => $neecha['tagHi'],
            'neechaBhangaReasons' => array_column($neecha['reasons'], 'code'),
            'tagsEn' => $tags['en'], 'tagsTa' => $tags['ta'], 'tagsHi' => $tags['hi'],
        ];
    }

    /**
     * One-line dignity summary for report cards — mirror of dignityCardLine()
     * in src/lib/astrology/dignity.ts. When Neecha Bhanga applies the line names
     * the rule that caused it and carries the "reduces, does not erase"
     * caveat; '' means there is nothing to say.
     */
    private static function dignityCardLine(array $dignity, string $lang): string {
        if ($dignity === []) { return ''; }
        $status = (string) ($lang === 'ta' ? ($dignity['statusTa'] ?? '') : ($lang === 'hi' ? ($dignity['statusHi'] ?? '') : ($dignity['statusEn'] ?? '')));
        $tags = (string) ($lang === 'ta' ? ($dignity['tagsTa'] ?? '') : ($lang === 'hi' ? ($dignity['tagsHi'] ?? '') : ($dignity['tagsEn'] ?? '')));
        $note = (string) ($lang === 'ta' ? ($dignity['neechaBhangaTa'] ?? '') : ($lang === 'hi' ? ($dignity['neechaBhangaHi'] ?? '') : ($dignity['neechaBhangaEn'] ?? '')));
        $isNeecha = !empty($dignity['isNeechaBhanga']);
        $isCombust = !empty($dignity['isCombust']);
        $statusKey = (string) ($dignity['status'] ?? 'neutral');
        if ($statusKey === 'neutral' && !$isNeecha && !$isCombust) { return ''; }
        return ($isNeecha && $note !== '') ? ($status !== '' ? $status . '. ' : '') . $note : $tags;
    }

    /**
     * Graha Yuddha (item 7a): two of Mars, Mercury, Jupiter, Venus or Saturn in
     * the same rasi within 1°; the northern (greater) ecliptic latitude wins.
     */
    private static function grahaYuddhaPairs(array $siderealByGraha, array $latitudes, array $rasiByGraha): array {
        $pairs = [];
        $warlike = ['mars', 'mercury', 'jupiter', 'venus', 'saturn'];
        for ($i = 0; $i < count($warlike); $i += 1) {
            for ($k = $i + 1; $k < count($warlike); $k += 1) {
                $planetA = $warlike[$i];
                $planetB = $warlike[$k];
                if (($rasiByGraha[$planetA] ?? null) !== ($rasiByGraha[$planetB] ?? null)) { continue; }
                $separation = abs(self::angleDelta($siderealByGraha[$planetA], $siderealByGraha[$planetB]));
                if ($separation >= 1.0) { continue; }
                $latitudeA = (float) ($latitudes[$planetA] ?? 0.0);
                $latitudeB = (float) ($latitudes[$planetB] ?? 0.0);
                $winner = $latitudeA >= $latitudeB ? $planetA : $planetB;
                $loser = $winner === $planetA ? $planetB : $planetA;
                $winnerLatitude = $winner === $planetA ? $latitudeA : $latitudeB;
                $loserLatitude = $winner === $planetA ? $latitudeB : $latitudeA;
                $sign = self::$RASIS[($rasiByGraha[$planetA] ?? 1) - 1];
                $sepText = number_format($separation, 2, '.', '');
                $nameA = self::DIGNITY_GRAHA_TEXT[$planetA];
                $nameB = self::DIGNITY_GRAHA_TEXT[$planetB];
                $nameW = self::DIGNITY_GRAHA_TEXT[$winner];
                $nameL = self::DIGNITY_GRAHA_TEXT[$loser];
                $pairs[] = [
                    'planetA' => $planetA, 'planetB' => $planetB,
                    'planetANameEn' => $nameA['en'], 'planetANameTa' => $nameA['ta'], 'planetANameHi' => $nameA['hi'],
                    'planetBNameEn' => $nameB['en'], 'planetBNameTa' => $nameB['ta'], 'planetBNameHi' => $nameB['hi'],
                    'separationDegrees' => round($separation, 3),
                    'winner' => $winner, 'loser' => $loser,
                    'winnerNameEn' => $nameW['en'], 'winnerNameTa' => $nameW['ta'], 'winnerNameHi' => $nameW['hi'],
                    'loserNameEn' => $nameL['en'], 'loserNameTa' => $nameL['ta'], 'loserNameHi' => $nameL['hi'],
                    'winnerLatitude' => round($winnerLatitude, 4), 'loserLatitude' => round($loserLatitude, 4),
                    'descriptionEn' => $nameA['en'] . ' and ' . $nameB['en'] . ' are ' . $sepText . '° apart in ' . $sign['en'] . ' — Graha Yuddha. Decided by ecliptic latitude (north wins): ' . $nameW['en'] . ' (' . ($winnerLatitude >= 0 ? '+' : '') . number_format($winnerLatitude, 3, '.', '') . '°) defeats ' . $nameL['en'] . ' (' . number_format($loserLatitude, 3, '.', '') . '°).',
                    'descriptionTa' => $sign['ta'] . ' ராசியில் ' . $nameA['ta'] . '–' . $nameB['ta'] . ' இடையே ' . $sepText . '° இடைவெளி — கிரக யுத்தம். வடக்கு அகலாங்கு (ecliptic latitude) விதிப்படி ' . $nameW['ta'] . ' (' . number_format($winnerLatitude, 3, '.', '') . '°) ' . $nameL['ta'] . '-ஐ (' . number_format($loserLatitude, 3, '.', '') . '°) வெல்கிறார்.',
                    'descriptionHi' => ($sign['hi'] ?? $sign['en']) . ' राशि में ' . $nameA['hi'] . '–' . $nameB['hi'] . ' के बीच ' . $sepText . '° का अंतर है — ग्रह युद्ध। उत्तर अक्षांश नियम से ' . $nameW['hi'] . ' (' . number_format($winnerLatitude, 3, '.', '') . '°) ने ' . $nameL['hi'] . ' (' . number_format($loserLatitude, 3, '.', '') . '°) को पराजित किया है।',
                ];
            }
        }
        return $pairs;
    }

    /** Kendradhipati (item 7b): Jupiter or Mercury owning two kendras. */
    private static function kendradhipatiDosha(int $lagnaRasi): array {
        $kendraSignNumbers = [];
        foreach ([1, 4, 7, 10] as $offset) {
            $kendraSignNumbers[] = (($lagnaRasi - 1 + ($offset - 1)) % 12) + 1;
        }
        $entries = [];
        $ordinal = static function (int $n): string {
            if ($n % 100 >= 11 && $n % 100 <= 13) { return $n . 'th'; }
            $suffix = ['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th';
            return $n . $suffix;
        };
        foreach (['jupiter', 'mercury'] as $graha) {
            $ownedSigns = [];
            foreach ($kendraSignNumbers as $sign) {
                if ((self::DIGNITY_SIGN_LORDS[$sign] ?? null) === $graha) { $ownedSigns[] = $sign; }
            }
            if (count($ownedSigns) < 2) { continue; }
            $houses = [];
            foreach ($ownedSigns as $sign) { $houses[] = self::dignityHouseFrom($sign, $lagnaRasi); }
            sort($houses);
            $appliesToLagnaLord = in_array(1, $houses, true);
            $names = self::DIGNITY_GRAHA_TEXT[$graha];
            $houseListEn = implode(' and ', array_map($ordinal, $houses));
            $signListEn = implode(', ', array_map(static function ($sign) { return self::$RASIS[$sign - 1]['en']; }, $ownedSigns));
            $signListTa = implode(', ', array_map(static function ($sign) { return self::$RASIS[$sign - 1]['ta']; }, $ownedSigns));
            $signListHi = implode(', ', array_map(static function ($sign) { return preg_replace('/\s*\([^)]*\)\s*$/u', '', self::$RASIS[$sign - 1]['hi']); }, $ownedSigns));
            $housesTa = implode(', ', array_map(static function ($house) { return $house . '-ஆம்'; }, $houses));
            $housesHi = implode(', ', array_map(static function ($house) { return $house . 'वें'; }, $houses));
            $grahaLabelHi = preg_replace('/\s*\([^)]*\)\s*$/u', '', $names['hi']);
            $entries[] = [
                'graha' => $graha,
                'grahaNameEn' => $names['en'], 'grahaNameTa' => $names['ta'], 'grahaNameHi' => $names['hi'],
                'houses' => $houses, 'signs' => $ownedSigns,
                'appliesToLagnaLord' => $appliesToLagnaLord,
                'isDosha' => !$appliesToLagnaLord,
                'descriptionEn' => $names['en'] . ' rules the ' . $houseListEn . ' houses (' . $signListEn . ') for this Lagna — Kendradhipati dosha. A natural benefic owning two kendras is read as a caution for those houses.'
                    . ($appliesToLagnaLord ? ' As the Lagna lord it is traditionally exempt, but the note is kept.' : ''),
                'descriptionTa' => $names['ta'] . ' இந்த லக்னத்திற்கு ' . $housesTa . ' பாவங்களை (' . $signListTa . ') ஆள்கிறார் — கேந்திராதிபதி தோஷம். நல்ல கிரகம் இரண்டு கேந்திரங்களை ஆள்வது அந்த பாவ விஷயங்களுக்கு எச்சரிக்கையாகக் கருதப்படுகிறது.'
                    . ($appliesToLagnaLord ? ' லக்னாதிபதி என்பதால் மரபு விலக்கு உண்டு; குறிப்பு மட்டும் வைக்கப்பட்டுள்ளது.' : ''),
                'descriptionHi' => $appliesToLagnaLord
                    ? $grahaLabelHi . ' इस लग्न के लिए ' . $housesHi . ' भावों (' . $signListHi . ') के स्वामी हैं। लग्नेश होने से केंद्राधिपति दोष से पारंपरिक छूट है, फिर भी कार्य/विवाह कार्ड में यह उल्लेख किया गया है।'
                    : $grahaLabelHi . ' इस लग्न के लिए ' . $housesHi . ' भावों (' . $signListHi . ') के स्वामी हैं, इसलिए केंद्राधिपति दोष लगता है। शुभ ग्रह का दो केंद्रों पर स्वामित्व सावधानी माना जाता है।',
            ];
        }
        return $entries;
    }

    /**
     * Yoga notes (item 6): Sarala yoga (8th lord in the 8th), Saturn in its own
     * sign, and the 9th lord in the 8th as a caution (never a benefit).
     */
    private static function yogaNotes(int $lagnaRasi, array $rasiByGraha, array $bhavaByGraha): array {
        $yogas = [];
        $names = self::DIGNITY_GRAHA_TEXT;
        $lordOfBhava = static function (int $bhava) use ($lagnaRasi): string {
            $sign = (($lagnaRasi - 1 + ($bhava - 1)) % 12) + 1;
            return self::DIGNITY_SIGN_LORDS[$sign];
        };
        $eighthLord = $lordOfBhava(8);
        if (($bhavaByGraha[$eighthLord] ?? null) === 8) {
            $info = $names[$eighthLord];
            $yogas[] = [
                'code' => 'SARALA',
                'nameEn' => 'Sarala Yoga — 8th lord ' . $info['en'] . ' in the 8th',
                'nameTa' => 'சரள யோகம் — 8-ஆம் அதிபதி ' . $info['ta'] . ' 8-ஆம் பாவத்தில்',
                'nameHi' => 'सरल योग — अष्टमेश ' . $info['hi'] . ' अष्टम भाव में',
                'severity' => 'auspicious',
                'descriptionEn' => $info['en'] . ', lord of the 8th house, occupies the 8th house itself (Sarala Yoga). Traditionally this protects longevity and turns crises into endurance, research depth and inheritance of knowledge rather than sudden loss.',
                'descriptionTa' => '8-ஆம் பாவ அதிபதி ' . $info['ta'] . ' அதே 8-ஆம் பாவத்தில் அமர்ந்துள்ளார் (சரள யோகம்). மரபில் இது ஆயுள் மற்றும் தைரியத்தைப் பாதுகாக்கும்; நெருக்கடிகளை அறிவுத் தேடலாக மாற்றும்.',
                'descriptionHi' => 'अष्टम भाव के स्वामी ' . $info['hi'] . ' स्वयं अष्टम भाव में हैं (सरल योग)। परंपरा में यह आयु और धैर्य की रक्षा करता है।',
            ];
        }
        $saturnSign = $rasiByGraha['saturn'] ?? null;
        if ($saturnSign === 10 || $saturnSign === 11) {
            $saturnInfo = $names['saturn'];
            $signName = self::$RASIS[$saturnSign - 1];
            $yogas[] = [
                'code' => 'SATURN_OWN_SIGN',
                'nameEn' => 'Saturn in its own sign ' . $signName['en'],
                'nameTa' => 'சனி தனது ஆட்சி ராசி ' . $signName['ta'] . '-இல்',
                'nameHi' => 'शनि अपनी स्वराशि ' . ($signName['hi'] ?? $signName['en']) . ' में',
                'severity' => 'auspicious',
                'descriptionEn' => $saturnInfo['en'] . ' occupies its own sign ' . $signName['en'] . '. Own-sign Saturn gives structure, discipline and slow but durable results.',
                'descriptionTa' => $saturnInfo['ta'] . ' தனது ஆட்சி ராசி ' . $signName['ta'] . '-இல் உள்ளார். ஆட்சி சனி கட்டமைப்பு, ஒழுக்கம், நிலைத்த வெற்றியைத் தரும்.',
                'descriptionHi' => $saturnInfo['hi'] . ' अपनी स्वराशि ' . ($signName['hi'] ?? $signName['en']) . ' में है। स्वराशि का शनि अनुशासन और स्थायी उपलब्धि देता है।',
            ];
        }
        $ninthLord = $lordOfBhava(9);
        if (($bhavaByGraha[$ninthLord] ?? null) === 8) {
            $info = $names[$ninthLord];
            $yogas[] = [
                'code' => 'NINTH_LORD_IN_EIGHTH',
                'nameEn' => '9th lord ' . $info['en'] . ' in the 8th house — caution',
                'nameTa' => '9-ஆம் அதிபதி ' . $info['ta'] . ' 8-ஆம் பாவத்தில் — கவனம்',
                'nameHi' => 'नवमेश ' . $info['hi'] . ' अष्टम भाव में — सावधानी',
                'severity' => 'caution',
                'descriptionEn' => $info['en'] . ', lord of the 9th (fortune, dharma, teachers, long journeys), sits in the 8th house. Read this as a caution, not as a blessing: fortune arrives through effort, delay, research or transformation, and documents/journeys need care.',
                'descriptionTa' => '9-ஆம் பாவ (பாக்கியம், தர்மம், குரு, தூர பயணம்) அதிபதி ' . $info['ta'] . ' 8-ஆம் பாவத்தில் உள்ளார். இதை நன்மை எனக் கூறக்கூடாது — கவனமே: பாக்கியம் முயற்சி, தாமதம், ஆராய்ச்சி அல்லது மாற்றத்தின் வழியே வரும்.',
                'descriptionHi' => 'नवम भाव (भाग्य, धर्म, गुरु, दूर यात्रा) के स्वामी ' . $info['hi'] . ' अष्टम भाव में हैं। इसे शुभ न मानें — सावधानी: भाग्य परिश्रम, विलंब, शोध या परिवर्तन से मिलता है।',
            ];
        }
        return $yogas;
    }

    /**
     * The Mahadasa that follows the running one, plus the "begins on <date>"
     * notice that is ALWAYS emitted when the change lands inside 12 months.
     */
    private static function nextMahadasaInfo(array $dashaPeriods): array {
        $now = time();
        $next = null;
        foreach ($dashaPeriods as $period) {
            $start = strtotime((string) ($period['startDate'] ?? ''));
            if ($start !== false && $start > $now) { $next = $period; $startTs = $start; break; }
        }
        if ($next === null || !isset($startTs)) {
            return ['within12Months' => false, 'noticeEn' => '', 'noticeTa' => '', 'noticeHi' => ''];
        }
        $daysAhead = (int) floor(($startTs - $now) / 86400);
        $monthsAhead = max(1, (int) round($daysAhead / 30.44));
        $within = $daysAhead <= 366;
        $beginsOn = date('Y-m-d', $startTs);
        $lordEn = (string) ($next['lordNameEn'] ?? '');
        $lordTa = (string) ($next['lordNameTa'] ?? '');
        $lordHi = (string) ($next['lordNameHi'] ?? '');
        return [
            'lord' => (string) ($next['mahadashaLord'] ?? ''),
            'lordNameEn' => $lordEn, 'lordNameTa' => $lordTa, 'lordNameHi' => $lordHi,
            'beginsOn' => $beginsOn,
            'monthsAhead' => round($daysAhead / 30.44, 1),
            'within12Months' => $within,
            'noticeEn' => $within ? $lordEn . ' Mahadasa begins on ' . $beginsOn . ' (about ' . $monthsAhead . ' month' . ($monthsAhead === 1 ? '' : 's') . ' from now).' : '',
            'noticeTa' => $within ? $lordTa . ' மகாதிசை ' . $beginsOn . ' அன்று தொடங்குகிறது (இன்னும் சுமார் ' . $monthsAhead . ' மாதங்கள்).' : '',
            'noticeHi' => $within ? $lordHi . ' महादशा ' . $beginsOn . ' को आरंभ होगी (लगभग ' . $monthsAhead . ' माह में)।' : '',
        ];
    }

    public static function calculateHoroscope($payload) {
        $payload = is_array($payload) ? $payload : [];
        if (!self::hasValidBirthDetails($payload)) {
            throw new RuntimeException('A valid past birth date, birth time, birth place, coordinates and time zone are required for an accurate horoscope.');
        }
        $dob = trim((string) $payload['dob']);
        $tob = self::normalizeBirthTime($payload['tob']);
        $lat = (float) $payload['latitude'];
        $lng = (float) $payload['longitude'];
        $name = trim((string) ($payload['name'] ?? 'Native')) ?: 'Native';

        // One resolver for validation and calculation: the UTC instant comes
        // from the IANA zone (explicit `timeZoneId`, else derived from the
        // coordinates) evaluated against the region's historical standard/DST
        // transitions. The submitted numeric offset is only trusted when no
        // zone can be determined, so a DST-observing southern-hemisphere or US-DST birth
        // no longer shifts the Lagna by an hour because a client sent today's offset.
        $birthInstant = self::resolveBirthInstant($payload);
        $timeTs = (int) $birthInstant['timestamp'];
        $tz = (float) $birthInstant['offsetHours'];
        $timeZoneId = (string) ($birthInstant['timeZoneId'] ?? '');
        $timeZoneSource = (string) $birthInstant['timeZoneSource'];
        if ($birthInstant['offsetAdjusted']) {
            error_log(sprintf(
                'AstroEngine: birth offset corrected from UTC%+.2f to UTC%+.2f using %s (%s) for %s %s',
                (float) $birthInstant['suppliedOffsetHours'], $tz, $timeZoneId, $timeZoneSource, $dob, $tob
            ));
        }
        $julianDay = ($timeTs / 86400.0) + 2440587.5; // UT

        // Full geocentric ephemeris: UT→TT, VSOP87D planets, ELP2000-82 Moon,
        // osculating node, IAU 1980 nutation and the true Lahiri ayanamsa.
        $ephemeris = self::computeGeocentricPositions($julianDay);
        $ayanamsa = $ephemeris['ayanamsa'];          // true (Chitra Paksha + Δψ)
        $siderealLongitudes = $ephemeris['sidereal'];
        $dailyMotion = $ephemeris['speed'];
        $eclipticLatitudes = $ephemeris['latitude'];
        // Item 1: print the ayanamsa the chart actually used, so a report can
        // be audited against any other ephemeris without guessing the mode.
        error_log(sprintf(
            'AstroEngine: Lahiri (Chitra Paksha) ayanamsa used = %.6f° (true) | mean %.6f° | JD(UT) %.6f | node %s',
            $ayanamsa, $ephemeris['ayanamsaMean'], $julianDay, $ephemeris['nodeType']
        ));

        $sunTropical = $ephemeris['tropical']['sun'];
        $sunSidereal = $siderealLongitudes['sun'];
        $moonTropical = $ephemeris['tropical']['moon'];
        $moonSidereal = $siderealLongitudes['moon'];
        $marsSidereal = $siderealLongitudes['mars'];
        $mercurySidereal = $siderealLongitudes['mercury'];
        $jupiterSidereal = $siderealLongitudes['jupiter'];
        $venusSidereal = $siderealLongitudes['venus'];
        $saturnSidereal = $siderealLongitudes['saturn'];
        $rahuSidereal = $siderealLongitudes['rahu'];
        $ketuSidereal = $siderealLongitudes['ketu'];

        $ascendant = self::computeAscendant($julianDay, $lat, $lng, $ephemeris);
        $ascTropical = $ascendant['tropical'];
        $lagnaSidereal = $ascendant['sidereal'];

        $moonRasiIndex = intval(floor($moonSidereal / 30.0)) % 12;
        $lagnaRasiIndex = intval(floor($lagnaSidereal / 30.0)) % 12;
        $sunRasiIndex = intval(floor($sunSidereal / 30.0)) % 12;
        $marsRasiIndex = intval(floor($marsSidereal / 30.0)) % 12;
        $mercuryRasiIndex = intval(floor($mercurySidereal / 30.0)) % 12;
        $jupiterRasiIndex = intval(floor($jupiterSidereal / 30.0)) % 12;
        $venusRasiIndex = intval(floor($venusSidereal / 30.0)) % 12;
        $saturnRasiIndex = intval(floor($saturnSidereal / 30.0)) % 12;
        $rahuRasiIndex = intval(floor($rahuSidereal / 30.0)) % 12;
        $ketuRasiIndex = intval(floor($ketuSidereal / 30.0)) % 12;

        $nakshatraSpan = 360.0 / 27.0;
        $nakshatraIndex = intval(floor($moonSidereal / $nakshatraSpan)) % 27;
        $padaIndex = (intval(floor(($moonSidereal - ($nakshatraIndex * $nakshatraSpan)) / ($nakshatraSpan / 4.0))) % 4) + 1;

        $rasi = self::$RASIS[$moonRasiIndex];
        $lagna = self::$RASIS[$lagnaRasiIndex];

        $planets = [
            ['name' => 'Lagna', 'nameTa' => 'லக்னம்', 'rasi' => $lagna['en'], 'rasiTa' => $lagna['ta'], 'degree' => round(fmod($lagnaSidereal, 30), 2), 'house' => 1, 'isBenefic' => true],
            ['name' => 'Surya (Sun)', 'nameTa' => 'சூரியன்', 'rasi' => self::$RASIS[$sunRasiIndex]['en'], 'rasiTa' => self::$RASIS[$sunRasiIndex]['ta'], 'degree' => round(fmod($sunSidereal, 30), 2), 'house' => (($sunRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => true],
            ['name' => 'Chandra (Moon)', 'nameTa' => 'சந்திரன்', 'rasi' => $rasi['en'], 'rasiTa' => $rasi['ta'], 'degree' => round(fmod($moonSidereal, 30), 2), 'house' => (($moonRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => true],
            ['name' => 'Chevvai (Mars)', 'nameTa' => 'செவ்வாய்', 'rasi' => self::$RASIS[$marsRasiIndex]['en'], 'rasiTa' => self::$RASIS[$marsRasiIndex]['ta'], 'degree' => round(fmod($marsSidereal, 30), 2), 'house' => (($marsRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => false],
            ['name' => 'Budha (Mercury)', 'nameTa' => 'புதன்', 'rasi' => self::$RASIS[$mercuryRasiIndex]['en'], 'rasiTa' => self::$RASIS[$mercuryRasiIndex]['ta'], 'degree' => round(fmod($mercurySidereal, 30), 2), 'house' => (($mercuryRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => true],
            ['name' => 'Guru (Jupiter)', 'nameTa' => 'குரு', 'rasi' => self::$RASIS[$jupiterRasiIndex]['en'], 'rasiTa' => self::$RASIS[$jupiterRasiIndex]['ta'], 'degree' => round(fmod($jupiterSidereal, 30), 2), 'house' => (($jupiterRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => true],
            ['name' => 'Sukra (Venus)', 'nameTa' => 'சுக்கிரன்', 'rasi' => self::$RASIS[$venusRasiIndex]['en'], 'rasiTa' => self::$RASIS[$venusRasiIndex]['ta'], 'degree' => round(fmod($venusSidereal, 30), 2), 'house' => (($venusRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => true],
            ['name' => 'Sani (Saturn)', 'nameTa' => 'சனி', 'rasi' => self::$RASIS[$saturnRasiIndex]['en'], 'rasiTa' => self::$RASIS[$saturnRasiIndex]['ta'], 'degree' => round(fmod($saturnSidereal, 30), 2), 'house' => (($saturnRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => false],
            ['name' => 'Rahu', 'nameTa' => 'ராகு', 'rasi' => self::$RASIS[$rahuRasiIndex]['en'], 'rasiTa' => self::$RASIS[$rahuRasiIndex]['ta'], 'degree' => round(fmod($rahuSidereal, 30), 2), 'house' => (($rahuRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => false],
            ['name' => 'Ketu', 'nameTa' => 'கேது', 'rasi' => self::$RASIS[$ketuRasiIndex]['en'], 'rasiTa' => self::$RASIS[$ketuRasiIndex]['ta'], 'degree' => round(fmod($ketuSidereal, 30), 2), 'house' => (($ketuRasiIndex - $lagnaRasiIndex + 12) % 12) + 1, 'isBenefic' => false]
        ];

        $siderealByGraha = [
            'sun' => $sunSidereal, 'moon' => $moonSidereal, 'mars' => $marsSidereal, 'mercury' => $mercurySidereal,
            'jupiter' => $jupiterSidereal, 'venus' => $venusSidereal, 'saturn' => $saturnSidereal,
            'rahu' => $rahuSidereal, 'ketu' => $ketuSidereal,
        ];
        $rawPlanets = [];
        foreach ([
            ['sun', 'Surya (Sun)', 'சூரியன்', 'सूर्य', $sunRasiIndex],
            ['moon', 'Chandra (Moon)', 'சந்திரன்', 'चंद्र', $moonRasiIndex],
            ['mars', 'Chevvai (Mars)', 'செவ்வாய்', 'मंगल', $marsRasiIndex],
            ['mercury', 'Budha (Mercury)', 'புதன்', 'बुध', $mercuryRasiIndex],
            ['jupiter', 'Guru (Jupiter)', 'குரு', 'गुरु', $jupiterRasiIndex],
            ['venus', 'Sukra (Venus)', 'சுக்கிரன்', 'शुक्र', $venusRasiIndex],
            ['saturn', 'Sani (Saturn)', 'சனி', 'शनि', $saturnRasiIndex],
            ['rahu', 'Rahu', 'ராகு', 'राहु', $rahuRasiIndex],
            ['ketu', 'Ketu', 'கேது', 'केतु', $ketuRasiIndex],
        ] as [$graha, $nameEn, $nameTa, $nameHi, $rasiIdx]) {
            $longitude = $siderealByGraha[$graha];
            $isNode = $graha === 'rahu' || $graha === 'ketu';
            $isRetro = $isNode ? true : (($graha !== 'sun' && $graha !== 'moon') && ($dailyMotion[$graha] ?? 0.0) < 0);
            $combustLimit = self::getCombustionLimit($graha, $isRetro);
            $rawPlanets[] = [
                'graha' => $graha,
                'nameEn' => $nameEn,
                'nameTa' => $nameTa,
                'nameHi' => $nameHi,
                'rasiIdx' => $rasiIdx,
                'longitude' => $longitude,
                'degrees' => round(fmod($longitude, 30), 2),
                'house' => (($rasiIdx - $lagnaRasiIndex + 12) % 12) + 1,
                // Nodes always move backwards; luminaries never do.
                'isRetrograde' => $isRetro,
                'isCombust' => $combustLimit > 0.0
                    && abs(self::angleDelta($longitude, $sunSidereal)) < $combustLimit,
            ];
        }

        
        $planetPositions = [];
        $bhavaByGraha = []; // e.g. 'mars' => 8  (used for dosha + house-lord lookups below)
        // 1-based rasi of every graha, for the dignity / Neecha Bhanga checks.
        $rasiByGraha = [];
        foreach ($rawPlanets as $rpLookup) { $rasiByGraha[$rpLookup['graha']] = $rpLookup['rasiIdx'] + 1; }
        foreach ($rawPlanets as $rp) {
            // Use the exact longitude (not the 0.01°-rounded display value) so a
            // body within 36″ of a Nakshatra Sandhi is never placed on the wrong side.
            $totalDeg = $rp['longitude'];
            $pNakIndex = intval(floor($totalDeg / $nakshatraSpan)) % 27;
            $pPada = (intval(floor(($totalDeg - ($pNakIndex * $nakshatraSpan)) / ($nakshatraSpan / 4.0))) % 4) + 1;
            // D9 (Navamsa): each sign holds nine 3°20′ parts, so the navamsa rasi is
            // floor(longitude / 3°20′) % 12 + 1 — the same rule the TypeScript engine uses.
            $navRasiForPlanet = (intval(floor($totalDeg / (360.0 / 108.0))) % 12) + 1;
            $planetPositions[] = [
                'graha' => $rp['graha'],
                'nameEn' => $rp['nameEn'],
                'nameTa' => $rp['nameTa'],
                'nameHi' => $rp['nameHi'],
                'rasi' => $rp['rasiIdx'] + 1,
                'rasiNameEn' => self::$RASIS[$rp['rasiIdx']]['en'],
                'rasiNameTa' => self::$RASIS[$rp['rasiIdx']]['ta'],
                'rasiNameHi' => self::$RASIS[$rp['rasiIdx']]['hi'],
                'degrees' => $rp['degrees'],
                // Sidereal longitude (2dp) and D9 placement, so the report and the
                // browser preview draw the Navamsa chart from the engine's own values.
                'totalDegrees' => round($totalDeg, 2),
                'navamsaRasi' => $navRasiForPlanet,
                'navamsaRasiNameEn' => self::$RASIS[$navRasiForPlanet - 1]['en'],
                'navamsaRasiNameTa' => self::$RASIS[$navRasiForPlanet - 1]['ta'],
                'navamsaRasiNameHi' => self::$RASIS[$navRasiForPlanet - 1]['hi'],
                'isVargottama' => $navRasiForPlanet === ($rp['rasiIdx'] + 1),
                'house' => $rp['house'],
                'bhavaNumber' => $rp['house'],
                'nakshatramEn' => self::$NAKSHATRAS_EN[$pNakIndex],
                'nakshatramTa' => self::$NAKSHATRAS_TA[$pNakIndex],
                'nakshatramHi' => self::$NAKSHATRAS_HI[$pNakIndex],
                'pada' => $pPada,
                'isRetrograde' => $rp['isRetrograde'],
                'isCombust' => $rp['isCombust'],
                // Item 3: ecliptic latitude (Graha Yuddha input) + dignity.
                'eclipticLatitude' => round((float) ($eclipticLatitudes[$rp['graha']] ?? 0.0), 3),
                'dignity' => self::computePlanetDignity(
                    $rp['graha'], $rp['rasiIdx'] + 1, (bool) $rp['isCombust'], (bool) $rp['isRetrograde'],
                    $lagnaRasiIndex + 1, $moonRasiIndex + 1, $rasiByGraha
                )
            ];
            $bhavaByGraha[$rp['graha']] = $rp['house'];
        }

        // Dignity by graha (same source as the planet table) so the card text
        // can name a Neecha Bhanga rule without recomputing anything.
        $dignityByGraha = [];
        foreach ($planetPositions as $dignityPosition) {
            if (is_array($dignityPosition['dignity'] ?? null)) {
                $dignityByGraha[$dignityPosition['graha']] = $dignityPosition['dignity'];
            }
        }

        // English rasi-lord name -> planetPositions graha key
        $lordNameToGraha = [
            'Mars' => 'mars', 'Venus' => 'venus', 'Mercury' => 'mercury', 'Moon' => 'moon',
            'Sun' => 'sun', 'Jupiter' => 'jupiter', 'Saturn' => 'saturn'
        ];

        $rasiIdxByGraha = [
            'sun' => $sunRasiIndex, 'moon' => $moonRasiIndex, 'mars' => $marsRasiIndex,
            'mercury' => $mercuryRasiIndex, 'jupiter' => $jupiterRasiIndex, 'venus' => $venusRasiIndex,
            'saturn' => $saturnRasiIndex, 'rahu' => $rahuRasiIndex, 'ketu' => $ketuRasiIndex,
        ];

        // Ordinal helper for proper grammar (1st, 2nd, 3rd, 4th, 11th, 12th, 13th, etc.)
        $ordinal = function ($n) {
            $n = (int)$n;
            if ($n % 100 >= 11 && $n % 100 <= 13) {
                return $n . 'th';
            }
            switch ($n % 10) {
                case 1: return $n . 'st';
                case 2: return $n . 'nd';
                case 3: return $n . 'rd';
                default: return $n . 'th';
            }
        };

        // Placement of the lord of a given house (1-12), mirroring getHousePlacement().
        // Missing planet data remains unavailable instead of borrowing the target house/sign.
        $getHousePlacement = function ($houseNum) use ($lagnaRasiIndex, $lordNameToGraha, $bhavaByGraha, $rasiIdxByGraha, $dignityByGraha) {
            $unavailable = [
                'bhava' => null,
                'isOwnHouse' => null,
                'isOwnSign' => null,
                'isDusthana' => null,
                'lordName' => null,
                'placedSignIdx' => null,
                'isAvailable' => false,
                'dignityNoteEn' => '',
                'dignityNoteTa' => '',
                'dignityNoteHi' => '',
            ];
            if (!is_int($houseNum) || $houseNum < 1 || $houseNum > 12) {
                return $unavailable;
            }

            $targetSignIdx = ($lagnaRasiIndex + ($houseNum - 1)) % 12;
            $lordEnName = self::$RASIS[$targetSignIdx]['lord'] ?? null;
            $lordGraha = $lordEnName !== null ? ($lordNameToGraha[$lordEnName] ?? null) : null;
            if ($lordGraha === null) {
                return $unavailable;
            }

            $bhava = $bhavaByGraha[$lordGraha] ?? null;
            $placedSignIdx = $rasiIdxByGraha[$lordGraha] ?? null;
            if (!is_int($bhava) || $bhava < 1 || $bhava > 12 ||
                !is_int($placedSignIdx) || $placedSignIdx < 0 || $placedSignIdx > 11) {
                return $unavailable;
            }

            $placedSignLord = self::$RASIS[$placedSignIdx]['lord'] ?? null;
            if ($placedSignLord === null) {
                return $unavailable;
            }
            return [
                'bhava' => $bhava,
                'isOwnHouse' => ($bhava === $houseNum),
                'isOwnSign' => ($placedSignLord === $lordEnName),
                'isDusthana' => in_array($bhava, [6, 8, 12], true),
                'lordName' => $lordEnName,
                'placedSignIdx' => $placedSignIdx,
                'isAvailable' => true,
                // Item 3: the Health/Career/etc. cards name the dignity state and
                // the Neecha Bhanga rule when it applies to that house's lord.
                'dignityNoteEn' => self::dignityCardLine($dignityByGraha[$lordGraha] ?? [], 'en'),
                'dignityNoteTa' => self::dignityCardLine($dignityByGraha[$lordGraha] ?? [], 'ta'),
                'dignityNoteHi' => self::dignityCardLine($dignityByGraha[$lordGraha] ?? [], 'hi'),
            ];
        };

        $h1 = $getHousePlacement(1);
        $h2 = $getHousePlacement(2);
        $h4 = $getHousePlacement(4);
        $h5 = $getHousePlacement(5);
        $h7 = $getHousePlacement(7);
        $h9 = $getHousePlacement(9);
        $h10 = $getHousePlacement(10);

        // Sevvay / Kuja (Mars) Dosha: Mars in house 2, 4, 7, 8 or 12 (the
        // South Indian rule) from the Lagna, Moon or Venus, subject to the classical exceptions (own /
        // exalted sign, Leo/Aquarius, house-sign Vilakku, Yogakaraka Lagna,
        // Guru-Mangala / Chandra-Mangala yoga, Guru Drishti) and mitigations.
        // Missing data must remain N/A, never a false clean result.
        $kujaDosha = self::evaluateKujaDosha([
            'mars' => $marsRasiIndex + 1, 'lagna' => $lagnaRasiIndex + 1, 'moon' => $moonRasiIndex + 1,
            'venus' => $venusRasiIndex + 1, 'jupiter' => $jupiterRasiIndex + 1, 'saturn' => $saturnRasiIndex + 1,
            'rahu' => $rahuRasiIndex + 1, 'ketu' => $ketuRasiIndex + 1,
        ]);
        $marsBhava = $kujaDosha['marsBhava'];
        $isKujaDosha = $kujaDosha['isPresent'];          // null (N/A) | true (present or mild) | false
        $isKujaCancelled = $kujaDosha['cancelled'];
        $isKujaMild = $kujaDosha['mild'];
        $kujaStatus = $kujaDosha['status'];

        // Items 6/7: Graha Yuddha, Kendradhipati and the yoga notes the report
        // prints. All three mirror the TypeScript engine field-for-field.
        $grahaYuddha = self::grahaYuddhaPairs($siderealByGraha, $eclipticLatitudes, $rasiByGraha);
        $kendradhipati = self::kendradhipatiDosha($lagnaRasiIndex + 1);
        $yogas = self::yogaNotes($lagnaRasiIndex + 1, $rasiByGraha, $bhavaByGraha);
        $kendraCareerNoteEn = '';
        $kendraCareerNoteTa = '';
        $kendraCareerNoteHi = '';
        $kendraMarriageNoteEn = '';
        $kendraMarriageNoteTa = '';
        $kendraMarriageNoteHi = '';
        foreach ($kendradhipati as $kendraEntry) {
            if (in_array(10, $kendraEntry['houses'], true)) {
                $kendraCareerNoteEn = ' ' . $kendraEntry['descriptionEn'];
                $kendraCareerNoteTa = ' ' . $kendraEntry['descriptionTa'];
                $kendraCareerNoteHi = ' ' . $kendraEntry['descriptionHi'];
            }
            if (in_array(7, $kendraEntry['houses'], true)) {
                $kendraMarriageNoteEn = ' ' . $kendraEntry['descriptionEn'];
                $kendraMarriageNoteTa = ' ' . $kendraEntry['descriptionTa'];
                $kendraMarriageNoteHi = ' ' . $kendraEntry['descriptionHi'];
            }
        }

        // Kala Sarpa Dosha: all 7 classical planets fall on one side of the Rahu-Ketu axis
        $lonMap = ['sun' => $sunSidereal, 'moon' => $moonSidereal, 'mars' => $marsSidereal, 'mercury' => $mercurySidereal, 'jupiter' => $jupiterSidereal, 'venus' => $venusSidereal, 'saturn' => $saturnSidereal];
        $sideFlags = [];
        foreach ($lonMap as $lon) {
            $diff = self::norm360($lon - $rahuSidereal);
            $sideFlags[] = $diff < 180.0;
        }
        $isKalaSarpaDosha = (count(array_unique($sideFlags, SORT_REGULAR)) === 1);

        // Simplified Pitru indicator: Sun shares a sign with Rahu/Ketu, or Saturn occupies the 9th whole-sign house.
        // Broader traditions, including additional 9th-lord affliction rules, are not assessed here.
        $sunHouse = $bhavaByGraha['sun'] ?? null;
        $rahuHouse = $bhavaByGraha['rahu'] ?? null;
        $ketuHouse = $bhavaByGraha['ketu'] ?? null;
        $saturnHouse = $bhavaByGraha['saturn'] ?? null;
        // A missing input placement leaves this limited indicator unassessed instead of clean.
        $pitruInputsAvailable = is_int($sunHouse) && $sunHouse >= 1 && $sunHouse <= 12 &&
            is_int($rahuHouse) && $rahuHouse >= 1 && $rahuHouse <= 12 &&
            is_int($ketuHouse) && $ketuHouse >= 1 && $ketuHouse <= 12 &&
            is_int($saturnHouse) && $saturnHouse >= 1 && $saturnHouse <= 12;
        // Item 5: the Sun-node pair only counts inside a 12° orb; a wider
        // same-sign pair remains a weak (same sign only) indicator. The
        // Saturn-in-the-9th rule is unchanged.
        $sunRasiIdxNow = $rasiIdxByGraha['sun'] ?? null;
        $sunNodeSeparation = null;
        $closestNodeKey = null;
        foreach (['rahu', 'ketu'] as $nodeKey) {
            $nodeRasiIdx = $rasiIdxByGraha[$nodeKey] ?? null;
            if (!is_int($sunRasiIdxNow) || !is_int($nodeRasiIdx) || $sunRasiIdxNow !== $nodeRasiIdx) { continue; }
            $separationNow = abs(self::angleDelta($sunSidereal, $siderealByGraha[$nodeKey]));
            if ($sunNodeSeparation === null || $separationNow < $sunNodeSeparation) {
                $sunNodeSeparation = $separationNow;
                $closestNodeKey = $nodeKey;
            }
        }
        $sunNodeWithinOrb = $sunNodeSeparation !== null && $sunNodeSeparation < 12.0;
        $isSaturnIn9th = $pitruInputsAvailable && $saturnHouse === 9;
        $isPitruDosha = $pitruInputsAvailable
            ? ($sunNodeWithinOrb || $isSaturnIn9th)
            : null;
        $pitruStrength = $isPitruDosha === null
            ? null
            : ($isPitruDosha ? 'present' : ($sunNodeSeparation !== null ? 'weak' : 'none'));
        $nodeNameEn = $closestNodeKey === 'ketu' ? 'Ketu' : 'Rahu';
        $nodeNameTa = $closestNodeKey === 'ketu' ? 'கேது' : 'ராகு';
        $nodeNameHi = $closestNodeKey === 'ketu' ? 'केतु' : 'राहु';
        $sunNodeSeparationText = $sunNodeSeparation === null ? '' : number_format($sunNodeSeparation, 1, '.', '');
        $pitruStrengthLabelEn = $pitruStrength === 'weak' ? 'Weak (same sign only) — Sun and ' . $nodeNameEn . ' are ' . $sunNodeSeparationText . '° apart' : '';
        $pitruStrengthLabelTa = $pitruStrength === 'weak' ? 'பலவீனம் (ஒரே ராசி மட்டும்) — சூரியனும் ' . $nodeNameTa . ' உம் ' . $sunNodeSeparationText . '° இடைவெளியில்' : '';
        $pitruStrengthLabelHi = $pitruStrength === 'weak' ? 'दुर्बल (केवल समान राशि) — सूर्य और ' . $nodeNameHi . ' ' . $sunNodeSeparationText . '° की दूरी पर' : '';

        // Guru Chandala Dosha: Jupiter conjunct or in full 7th-sign opposition to Rahu/Ketu.
        // NOTE: $rasiIdxByGraha holds 0-based sign indices, for which (guru - node) % 12 === 6
        // is the exact opposition test (mirrors the TypeScript engine).
        $jupiterSignIdx = $rasiIdxByGraha['jupiter'] ?? null;
        $rahuSignIdx = $rasiIdxByGraha['rahu'] ?? null;
        $ketuSignIdx = $rasiIdxByGraha['ketu'] ?? null;
        $guruChandalaInputsAvailable = is_int($jupiterSignIdx) && $jupiterSignIdx >= 0 && $jupiterSignIdx <= 11 &&
            is_int($rahuSignIdx) && $rahuSignIdx >= 0 && $rahuSignIdx <= 11 &&
            is_int($ketuSignIdx) && $ketuSignIdx >= 0 && $ketuSignIdx <= 11;
        $isGuruWithRahu = $guruChandalaInputsAvailable && $jupiterSignIdx === $rahuSignIdx;
        $isGuruWithKetu = $guruChandalaInputsAvailable && $jupiterSignIdx === $ketuSignIdx;
        $isGuruAspectRahu = $guruChandalaInputsAvailable && ((($jupiterSignIdx - $rahuSignIdx + 12) % 12) === 6);
        $isGuruAspectKetu = $guruChandalaInputsAvailable && ((($jupiterSignIdx - $ketuSignIdx + 12) % 12) === 6);
        $isGuruChandalaDosha = $guruChandalaInputsAvailable
            ? ($isGuruWithRahu || $isGuruWithKetu || $isGuruAspectRahu || $isGuruAspectKetu)
            : null;

        $doshas = [
            [
                'nameEn' => 'Mars (Kuja) Dosha', 'nameTa' => 'செவ்வாய் தோஷம் (Kuja Dosha)', 'nameHi' => 'मंगल (कुज) दोष',
                'isPresent' => $isKujaDosha,
                // NOT_ASSESSED | DOSHA_NONE | DOSHA_CANCELLED | DOSHA_MILD | DOSHA_PRESENT
                'status' => $kujaStatus,
                'severityEn' => $kujaDosha['severityEn'],
                'severityTa' => $kujaDosha['severityTa'],
                'severityHi' => $kujaDosha['severityHi'],
                // Item 3: the Kuja card also states Mars's dignity and names the
                // Neecha Bhanga rule ("by Jupiter conjunction") when it applies.
                'descriptionEn' => self::dignityCardLine($dignityByGraha['mars'] ?? [], 'en') !== ''
                    ? $kujaDosha['explanationEn'] . ' ' . self::dignityCardLine($dignityByGraha['mars'] ?? [], 'en')
                    : $kujaDosha['explanationEn'],
                'descriptionTa' => self::dignityCardLine($dignityByGraha['mars'] ?? [], 'ta') !== ''
                    ? $kujaDosha['explanationTa'] . ' ' . self::dignityCardLine($dignityByGraha['mars'] ?? [], 'ta')
                    : $kujaDosha['explanationTa'],
                'descriptionHi' => self::dignityCardLine($dignityByGraha['mars'] ?? [], 'hi') !== ''
                    ? $kujaDosha['explanationHi'] . ' ' . self::dignityCardLine($dignityByGraha['mars'] ?? [], 'hi')
                    : $kujaDosha['explanationHi'],
                'traditionalRemedyEn' => 'Pray to Karthikeyan (Murugan) or Lord Hanuman.',
                'traditionalRemedyTa' => 'முருகன் (கார்த்திகேயன்) அல்லது அனுமனைப் பிரார்த்தனை செய்யுங்கள்.',
                'traditionalRemedyHi' => 'भगवान कार्तिकेय या हनुमान जी से प्रार्थना करें।',
            ],
            [
                'nameEn' => 'Kala Sarpa Dosha', 'nameTa' => 'காலசர்ப தோஷம்', 'nameHi' => 'काल सर्प दोष',
                'isPresent' => $isKalaSarpaDosha,
                'severityEn' => $isKalaSarpaDosha ? 'Present' : 'Not present',
                'severityTa' => $isKalaSarpaDosha ? 'தோஷம் உள்ளது' : 'தோஷம் இல்லை',
                'severityHi' => $isKalaSarpaDosha ? 'उपस्थित' : 'अनुपस्थित',
                'descriptionEn' => $isKalaSarpaDosha ? 'All seven classical planets fall within the Rahu-Ketu axis.' : 'Planets are spread outside the Rahu-Ketu axis.',
                'descriptionTa' => $isKalaSarpaDosha ? 'அனைத்து கிரகங்களும் ராகு-கேது அச்சுக்குள் அமைந்துள்ளன.' : 'ராகு-கேது அச்சுக்கு வெளியே கிரகங்கள் பரவலாக அமைந்துள்ளன.',
                'descriptionHi' => $isKalaSarpaDosha ? 'सभी सात ग्रह राहु-केतु अक्ष के भीतर स्थित हैं।' : 'ग्रह राहु-केतु अक्ष से बाहर फैले हुए हैं।',
                'traditionalRemedyEn' => 'Pray to Lord Shiva.',
                'traditionalRemedyTa' => 'சிவன் பெயரைச் சொல்லி பிரார்த்தனை செய்யுங்கள்.',
                'traditionalRemedyHi' => 'भगवान शिव का नाम लेकर प्रार्थना करें।',
            ],
            [
                'nameEn' => 'Pitru Dosha', 'nameTa' => 'பித்ரு தோஷம்', 'nameHi' => 'पितृ दोष',
                'isPresent' => $isPitruDosha,
                'severityEn' => $isPitruDosha === null ? 'N/A' : ($isPitruDosha ? 'Moderate' : 'Favourable'),
                'severityTa' => $isPitruDosha === null ? 'N/A' : ($isPitruDosha ? 'மிதமான தோஷம்' : 'நல்ல நிலை'),
                'severityHi' => $isPitruDosha === null ? 'N/A' : ($isPitruDosha ? 'मध्यम' : 'शुभ स्थिति'),
                'descriptionEn' => $isPitruDosha === null ? 'Required Sun, Rahu, Ketu or Saturn house data is unavailable; this indicator is not assessed.' : ($isPitruDosha ? 'The Sun shares a sign with Rahu or Ketu, or Saturn occupies the 9th house under this simplified rule.' : 'No Sun-node same-sign or Saturn-in-9th trigger was found under this limited rule; it does not assess all traditional Pitru criteria or the strength of the 9th lord.'),
                'descriptionTa' => $isPitruDosha === null ? 'சூரியன், ராகு, கேது அல்லது சனியின் தேவையான பாவத் தகவல் கிடைக்கவில்லை; இந்தக் குறியீடு மதிப்பிடப்படவில்லை.' : ($isPitruDosha ? 'இந்த எளிய விதிப்படி சூரியன் ராகு/கேதுவுடன் ஒரே ராசியில் உள்ளார் அல்லது சனி 9-ஆம் பாவத்தில் உள்ளார்.' : 'இந்த வரையறுக்கப்பட்ட விதியில் சூரியன்-ராகு/கேது ஒரே ராசி அல்லது சனி 9-ஆம் பாவக் குறியீடு இல்லை; இது 9-ஆம் அதிபதியின் பலத்தையோ பிற பாரம்பரிய பித்ரு விதிகளையோ மதிப்பிடாது.'),
                'descriptionHi' => $isPitruDosha === null ? 'सूर्य, राहु, केतु या शनि के आवश्यक भाव-डेटा उपलब्ध नहीं हैं; इस संकेत का आकलन नहीं हुआ है।' : ($isPitruDosha ? 'इस सरल नियम के अनुसार सूर्य राहु/केतु के साथ एक राशि में हैं, या शनि नवम भाव में है।' : 'इस सीमित नियम में सूर्य-राहु/केतु की एक-राशि युति या शनि-नवम भाव का संकेत नहीं मिला; यह नवमेश के बल या अन्य पारंपरिक पितृ नियमों का मूल्यांकन नहीं करता है।'),
                'traditionalRemedyEn' => 'Pray to Maha Vishnu.',
                'traditionalRemedyTa' => 'மகா விஷ்ணு பெயரைச் சொல்லி பிரார்த்தனை செய்யுங்கள்.',
                'traditionalRemedyHi' => 'महाविष्णु का नाम लेकर प्रार्थना करें।',
            ],
            [
                'nameEn' => 'Guru Chandala Dosha', 'nameTa' => 'குரு சண்டாள தோஷம் (Guru Chandala)', 'nameHi' => 'गुरु चांडाल दोष',
                'isPresent' => $isGuruChandalaDosha,
                'severityEn' => $isGuruChandalaDosha === null ? 'N/A' : ($isGuruChandalaDosha ? 'Moderate' : 'Not triggered under this sign-level rule'),
                'severityTa' => $isGuruChandalaDosha === null ? 'N/A' : ($isGuruChandalaDosha ? 'மிதமான தோஷம்' : 'இந்த ராசி விதியில் குறியீடு இல்லை'),
                'severityHi' => $isGuruChandalaDosha === null ? 'N/A' : ($isGuruChandalaDosha ? 'मध्यम' : 'इस राशि-आधारित नियम में संकेत नहीं'),
                'descriptionEn' => $isGuruChandalaDosha === null ? 'Jupiter, Rahu or Ketu sign data is unavailable; Guru Chandala Dosha is not assessed.' : ($isGuruChandalaDosha ? 'Jupiter shares a sign with or is opposite Rahu/Ketu under this sign-level rule; interpretations vary.' : 'No trigger was found under this limited sign-level rule; this does not establish the absence of other afflictions.'),
                'descriptionTa' => $isGuruChandalaDosha === null ? 'குரு, ராகு அல்லது கேதுவின் ராசித் தகவல் கிடைக்கவில்லை; குரு சண்டாள தோஷம் மதிப்பிடப்படவில்லை.' : ($isGuruChandalaDosha ? 'இந்த ராசி விதிப்படி குரு ராகு/கேதுவுடன் ஒரே ராசி அல்லது எதிர் ராசியில் உள்ளார்; விளக்கங்கள் மரபுக்கு மாறுபடும்.' : 'இந்த வரையறுக்கப்பட்ட ராசி விதியில் குறியீடு இல்லை; இதனால் பிற பாதிப்புகள் இல்லை என உறுதிப்படுத்த முடியாது.'),
                'descriptionHi' => $isGuruChandalaDosha === null ? 'गुरु, राहु या केतु की राशि-संबंधी जानकारी उपलब्ध नहीं है; गुरु चांडाल दोष का आकलन नहीं हुआ है।' : ($isGuruChandalaDosha ? 'इस राशि-आधारित नियम के अनुसार गुरु राहु/केतु के साथ या उनसे विपरीत राशि में हैं; व्याख्याएँ भिन्न हो सकती हैं।' : 'इस सीमित राशि-आधारित नियम में संकेत नहीं मिला; इससे अन्य ग्रह-दोषों की अनुपस्थिति सिद्ध नहीं होती है।'),
                'traditionalRemedyEn' => 'Pray to Lord Dakshinamurthy or Lord Shiva.',
                'traditionalRemedyTa' => 'தட்சிணாமூர்த்தி அல்லது சிவன் பெயரைச் சொல்லி பிரார்த்தனை செய்யுங்கள்.',
                'traditionalRemedyHi' => 'भगवान दक्षिणामूर्ति या भगवान शिव का नाम लेकर प्रार्थना करें।',
            ]
        ];

        // Simple Navagraha screening: traditional debilitation sign, houses 6/8/12,
        // or same-house placement with a natural malefic. Interpretations differ.
        $debilitationSigns = [
            'sun' => 6, 'moon' => 7, 'mars' => 3, 'mercury' => 11, 'jupiter' => 9,
            'venus' => 5, 'saturn' => 0, 'rahu' => 7, 'ketu' => 1,
        ];
        $malefics = ['mars', 'saturn', 'rahu', 'ketu'];

        $navagrahaMeta = [
            'sun' => ['nameEn' => 'Surya (Sun) Affliction Indicator', 'nameTa' => 'சூரிய கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'सूर्य ग्रह पीड़ा संकेत',
                'planetEn' => 'Sun (Surya)', 'planetTa' => 'சூரியன்', 'planetHi' => 'सूर्य',
                'remEn' => 'Pray to Lord Surya.', 'remTa' => 'சூரிய பகவானைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान सूर्य से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Surya, the Sun God. Day: Sunday. Colour: Red or copper. Give in charity: Wheat, jaggery, red cloth or copper. Conduct: Offer clean water to the rising sun in the morning, and honour your father and elders.', 'fullRemTa' => 'வழிபாடு: சூரிய பகவான். நாள்: ஞாயிறு. நிறம்: சிவப்பு அல்லது செம்பு நிறம். கொடை: கோதுமை, வெல்லம், சிவப்புத் துணி. நடத்தை: காலையில் எழும் சூரியனுக்குத் தூய நீர் வழங்கி வணங்குங்கள்; தந்தையையும் மூத்தோரையும் மதியுங்கள்.', 'fullRemHi' => 'आराधना: भगवान सूर्य। वार: रविवार। रंग: लाल या ताम्र। सहायता सामग्री: गेहूँ, गुड़, लाल वस्त्र। आचरण: उगते सूर्य को शुद्ध जल अर्पित करें, और पिता तथा वृद्धों का सम्मान करें।'],
            'moon' => ['nameEn' => 'Chandra (Moon) Affliction Indicator', 'nameTa' => 'சந்திர கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'चंद्र ग्रह पीड़ा संकेत',
                'planetEn' => 'Moon (Chandra)', 'planetTa' => 'சந்திரன்', 'planetHi' => 'चंद्र',
                'remEn' => 'Pray to Lord Shiva.', 'remTa' => 'சிவபெருமானைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान शिव से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Shiva. Day: Monday. Colour: White or silver. Give in charity: Rice, milk, sugar or white cloth. Conduct: Care for your mother and keep a calm, regular daily routine.', 'fullRemTa' => 'வழிபாடு: சிவபெருமான். நாள்: திங்கள். நிறம்: வெள்ளை அல்லது வெள்ளி நிறம். கொடை: அரிசி, பால், சர்க்கரை, வெள்ளைத் துணி. நடத்தை: தாயைக் கவனித்துக் கொள்ளுங்கள்; அமைதியான ஒழுங்கான நாள்வழக்கத்தைக் கடைப்பிடியுங்கள்.', 'fullRemHi' => 'आराधना: भगवान शिव। वार: सोमवार। रंग: सफेद या चाँदी। सहायता सामग्री: चावल, दूध, चीनी या सफेद वस्त्र। आचरण: माता की सेवा करें और शांत, नियमित दिनचर्या रखें।'],
            'mars' => ['nameEn' => 'Mangala (Mars) Affliction Indicator', 'nameTa' => 'செவ்வாய் கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'मंगल ग्रह पीड़ा संकेत',
                'planetEn' => 'Mars (Mangala)', 'planetTa' => 'செவ்வாய்', 'planetHi' => 'मंगल',
                'remEn' => 'Pray to Karthikeyan (Murugan) or Lord Hanuman.', 'remTa' => 'முருகன் (கார்த்திகேயன்) அல்லது அனுமனைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान कार्तिकेय या हनुमान जी से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Murugan (Karthikeya) or Lord Hanuman. Day: Tuesday. Colour: Red. Give in charity: Red lentils, jaggery or red cloth. Conduct: Control anger and impatience, and keep cordial relations with your brothers and sisters.', 'fullRemTa' => 'வழிபாடு: முருகன் (கார்த்திகேயன்) அல்லது அனுமன். நாள்: செவ்வாய். நிறம்: சிவப்பு. கொடை: சிவப்புப் பயறு, வெல்லம், சிவப்புத் துணி. நடத்தை: கோபத்தையும் பொறுமையின்மையையும் கட்டுப்படுத்துங்கள்; சகோதரர்களுடன் நல்லுறவைப் பேணுங்கள்.', 'fullRemHi' => 'आराधना: भगवान कार्तिकेय या हनुमान जी। वार: मंगलवार। रंग: लाल। सहायता सामग्री: लाल दाल, गुड़ या लाल वस्त्र। आचरण: क्रोध और अधीरता पर नियंत्रण रखें, और भाइयों-बहनों से सौहार्द रखें।'],
            'mercury' => ['nameEn' => 'Budha (Mercury) Affliction Indicator', 'nameTa' => 'புதன் கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'बुध ग्रह पीड़ा संकेत',
                'planetEn' => 'Mercury (Budha)', 'planetTa' => 'புதன்', 'planetHi' => 'बुध',
                'remEn' => 'Pray to Lord Vishnu.', 'remTa' => 'மகா விஷ்ணுவைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान विष्णु से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Vishnu or Lord Ganesha. Day: Wednesday. Colour: Green. Give in charity: Green gram (mung beans), green cloth or books. Conduct: Speak the truth and avoid deceit or careless speech.', 'fullRemTa' => 'வழிபாடு: மகா விஷ்ணு அல்லது விநாயகர். நாள்: புதன். நிறம்: பச்சை. கொடை: பச்சைப் பயறு, பச்சைத் துணி, நூல்கள். நடத்தை: உண்மையே பேசுங்கள்; வஞ்சகத்தையும் சிந்தியாத பேச்சையும் தவிருங்கள்.', 'fullRemHi' => 'आराधना: भगवान विष्णु या भगवान गणेश। वार: बुधवार। रंग: हरा। सहायता सामग्री: हरी मूँग, हरा वस्त्र या पुस्तकें। आचरण: सत्य बोलें और छल तथा असावधान वाणी से बचें।'],
            'jupiter' => ['nameEn' => 'Guru (Jupiter) Affliction Indicator', 'nameTa' => 'குரு கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'गुरु ग्रह पीड़ा संकेत',
                'planetEn' => 'Jupiter (Guru)', 'planetTa' => 'குரு', 'planetHi' => 'गुरु',
                'remEn' => 'Pray to Lord Brihaspati or Lord Dakshinamurthy.', 'remTa' => 'குரு பகவான் அல்லது தட்சிணாமூர்த்தியைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान बृहस्पति या दक्षिणामूर्ति से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Brihaspati or Lord Dakshinamurthy. Day: Thursday. Colour: Yellow. Give in charity: Chickpeas, turmeric, bananas, yellow cloth or books. Conduct: Honour your teachers and elders, and set ego aside.', 'fullRemTa' => 'வழிபாடு: குரு பகவான் அல்லது தட்சிணாமூர்த்தி. நாள்: வியாழன். நிறம்: மஞ்சள். கொடை: கொண்டைக்கடலை, மஞ்சள், வாழைப்பழம், மஞ்சள் துணி. நடத்தை: ஆசிரியர்களையும் மூத்தோரையும் மதியுங்கள்; அகந்தையை விடுங்கள்.', 'fullRemHi' => 'आराधना: भगवान बृहस्पति या दक्षिणामूर्ति। वार: गुरुवार। रंग: पीला। सहायता सामग्री: चना, हल्दी, केले, पीला वस्त्र। आचरण: गुरुओं और वृद्धों का सम्मान करें, और अहंकार त्यागें।'],
            'venus' => ['nameEn' => 'Shukra (Venus) Affliction Indicator', 'nameTa' => 'சுக்கிர கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'शुक्र ग्रह पीड़ा संकेत',
                'planetEn' => 'Venus (Shukra)', 'planetTa' => 'சுக்கிரன்', 'planetHi' => 'शुक्र',
                'remEn' => 'Pray to Goddess Maha Lakshmi.', 'remTa' => 'மகா லட்சுமியைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'माँ महालक्ष्मी से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Goddess Maha Lakshmi. Day: Friday. Colour: White or cream. Give in charity: Rice, yoghurt, white sweets or white cloth. Conduct: Treat women with respect and keep your home and surroundings clean.', 'fullRemTa' => 'வழிபாடு: மகா லட்சுமி. நாள்: வெள்ளி. நிறம்: வெள்ளை அல்லது வெண்மை. கொடை: அரிசி, தயிர், வெள்ளை இனிப்பு, வெள்ளைத் துணி. நடத்தை: பெண்களை மதியுங்கள்; வீட்டையும் சுற்றுப்புறத்தையும் தூய்மையாக வையுங்கள்.', 'fullRemHi' => 'आराधना: माँ महालक्ष्मी। वार: शुक्रवार। रंग: सफेद या क्रीम। सहायता सामग्री: चावल, दही, सफेद मिठाई या सफेद वस्त्र। आचरण: स्त्रियों का सम्मान करें और घर तथा परिवेश को स्वच्छ रखें।'],
            'saturn' => ['nameEn' => 'Shani (Saturn) Affliction Indicator', 'nameTa' => 'சனி கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'शनि ग्रह पीड़ा संकेत',
                'planetEn' => 'Saturn (Shani)', 'planetTa' => 'சனி', 'planetHi' => 'शनि',
                'remEn' => 'Pray to Lord Shani or Lord Hanuman.', 'remTa' => 'சனி பகவான் அல்லது அனுமனைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान शनि या हनुमान जी से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Shani or Lord Hanuman. Day: Saturday. Colour: Black or dark blue. Give in charity: Black sesame seeds, sesame oil (nallennai), iron, black cloth or warm blankets. Conduct: Serve the poor, the elderly and the disabled, and stay patient and disciplined.', 'fullRemTa' => 'வழிபாடு: சனி பகவான் அல்லது அனுமன். நாள்: சனி. நிறம்: கருப்பு அல்லது அடர் நீலம். கொடை: கருப்பு எள்ளு, நல்லெண்ணெய், இரும்பு, போர்வைகள். நடத்தை: ஏழைகள், முதியோர், மாற்றுத்திறனாளிகளுக்கு உதவுங்கள்; பொறுமையும் ஒழுக்கமும் கடைப்பிடியுங்கள்.', 'fullRemHi' => 'आराधना: भगवान शनि या हनुमान जी। वार: शनिवार। रंग: काला या गहरा नीला। सहायता सामग्री: काले तिल, तिल का तेल, लोहा, कंबल। आचरण: निर्धनों, वृद्धों और दिव्यांगों की सेवा करें, और धैर्य तथा अनुशासन रखें।'],
            'rahu' => ['nameEn' => 'Rahu Affliction Indicator', 'nameTa' => 'ராகு கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'राहु ग्रह पीड़ा संकेत',
                'planetEn' => 'Rahu', 'planetTa' => 'ராகு', 'planetHi' => 'राहु',
                'remEn' => 'Pray to Goddess Durga or Lord Bhairava.', 'remTa' => 'துர்க்கை அல்லது பைரவரைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'माँ दुर्गा या भगवान भैरव से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Goddess Durga or Lord Bhairava. Day: Saturday. Colour: Blue or smoky grey. Give in charity: Black gram, coconut, sesame seeds or warm blankets. Conduct: Avoid addictions and deception, and live an honest, open life.', 'fullRemTa' => 'வழிபாடு: துர்க்கை அல்லது பைரவர். நாள்: சனி. நிறம்: நீலம் அல்லது புகைச் சாம்பல். கொடை: கருப்பு உளுந்து, தேங்காய், எள், போர்வைகள். நடத்தை: பழக்க அடிமைத்தனத்தையும் வஞ்சகத்தையும் தவிருங்கள்; நேர்மையான திறந்த வாழ்வை வாழுங்கள்.', 'fullRemHi' => 'आराधना: माँ दुर्गा या भगवान भैरव। वार: शनिवार। रंग: नीला या धुँआरा स्लेटी। सहायता सामग्री: काला उड़द, नारियल, तिल के बीज, कंबल। आचरण: व्यसनों और छल से बचें, और ईमानदार, खुला जीवन जिएँ।'],
            'ketu' => ['nameEn' => 'Ketu Affliction Indicator', 'nameTa' => 'கேது கிரகப் பாதிப்பு குறியீடு', 'nameHi' => 'केतु ग्रह पीड़ा संकेत',
                'planetEn' => 'Ketu', 'planetTa' => 'கேது', 'planetHi' => 'केतु',
                'remEn' => 'Pray to Lord Ganesha.', 'remTa' => 'விநாயகரைப் பிரார்த்தனை செய்யுங்கள்.', 'remHi' => 'भगवान गणेश से प्रार्थना करें।',
                'fullRemEn' => 'Pray to: Lord Ganesha. Day: Tuesday or Saturday. Colour: Grey or multi-coloured. Give in charity: Sesame seeds, horse gram or warm blankets. Conduct: Feed and care for stray dogs, set aside time for quiet reflection, and avoid needless conflict.', 'fullRemTa' => 'வழிபாடு: விநாயகர். நாள்: செவ்வாய் அல்லது சனி. நிறம்: சாம்பல் அல்லது பல்நிறம். கொடை: எள்ளு, கொள்ளு, போர்வைகள். நடத்தை: தெரு நாய்களுக்கு உணவளித்துக் கவனியுங்கள்; அமைதியான சிந்தனைக்கு நேரம் ஒதுக்குங்கள்; தேவையற்ற சண்டைகளைத் தவிருங்கள்.', 'fullRemHi' => 'आराधना: भगवान गणेश। वार: मंगलवार या शनिवार। रंग: स्लेटी या बहुरंगी। सहायता सामग्री: तिल, कुल्थी, कंबल। आचरण: आवारा कुत्तों को भोजन दें और उनकी देखभाल करें, शांत चिंतन के लिए समय निकालें, और अनावश्यक विवाद से बचें।'],
        ];

        foreach ($navagrahaMeta as $g => $meta) {
            $rasiIdx = $rasiIdxByGraha[$g] ?? null;
            if (!is_int($rasiIdx) || $rasiIdx < 0 || $rasiIdx > 11) { continue; }
            $isDebilitated = ($rasiIdx === $debilitationSigns[$g]);
            $house = $bhavaByGraha[$g] ?? null;
            $isDusthana = in_array($house, [6, 8, 12], true);
            $conjunctMalefic = null;
            foreach ($malefics as $m) {
                if ($m !== $g && $house !== null && ($bhavaByGraha[$m] ?? null) === $house) { $conjunctMalefic = $m; break; }
            }
            $isAfflicted = $isDebilitated || $isDusthana || ($conjunctMalefic !== null);
            if (!$isAfflicted || ($g === 'mars' && $isKujaDosha)) continue;

            $maleficMeta = $conjunctMalefic !== null ? ($navagrahaMeta[$conjunctMalefic] ?? null) : null;
            $reasonEn = $isDebilitated ? 'is in its traditional debilitation sign' : ($conjunctMalefic !== null ? 'shares a house with ' . ($maleficMeta['planetEn'] ?? ucfirst($conjunctMalefic)) . ', classified as a natural malefic by this rule' : 'is placed in House ' . $house . ', treated as a challenging house by this rule');
            $reasonTa = $isDebilitated ? 'பாரம்பரிய நீச ராசியில் உள்ளது' : ($conjunctMalefic !== null ? 'ஒரு எளிய விதிப்படி பாபக் கிரகமாகக் கருதப்படும் ' . ($maleficMeta['planetTa'] ?? $conjunctMalefic) . ' உடன் ஒரே பாவத்தில் உள்ளது' : $house . '-ஆம் பாவத்தில் இந்த எளிய விதிப்படி கணிக்கப்பட்டுள்ளது');
            $reasonHi = $isDebilitated ? 'पारंपरिक नीच राशि में स्थित है' : ($conjunctMalefic !== null ? 'इस सरल नियम में पाप ग्रह माने गए ' . ($maleficMeta['planetHi'] ?? $conjunctMalefic) . ' के साथ एक भाव में स्थित है' : 'इस सरल नियम के अनुसार भाव ' . $house . ' में स्थित है');

            $doshas[] = [
                'nameEn' => $meta['nameEn'], 'nameTa' => $meta['nameTa'], 'nameHi' => $meta['nameHi'],
                'isPresent' => true, 'isNavagrahaAfflictionIndicator' => true,
                // Item 7c: the rule that triggered this simplified indicator.
                'ruleCode' => $isDebilitated ? 'DEBILITATED' : ($conjunctMalefic !== null ? 'MALEFIC_HOUSE_CONJUNCTION' : 'DUSTHANA_HOUSE'),
                'ruleEn' => $reasonEn, 'ruleTa' => $reasonTa, 'ruleHi' => $reasonHi,
                'severityEn' => 'Simplified indicator present', 'severityTa' => 'எளிய குறியீட்டின்படி பாதிப்பு உள்ளது', 'severityHi' => 'सरल मानदंड के अनुसार संकेत उपस्थित',
                'descriptionEn' => $meta['planetEn'] . ' ' . $reasonEn . '. This is a simplified screening indicator; interpretations vary by tradition.',
                'descriptionTa' => $meta['planetTa'] . ' ' . $reasonTa . '. இது எளிய குறியீடு மட்டுமே; மரபுகளின் விளக்கங்கள் மாறுபடலாம்.',
                'descriptionHi' => $meta['planetHi'] . ' ' . $reasonHi . '। यह केवल एक सरल संकेत है; परंपराओं में व्याख्याएँ भिन्न हो सकती हैं।',
                'traditionalRemedyEn' => $meta['fullRemEn'] ?? $meta['remEn'],
                'traditionalRemedyTa' => $meta['fullRemTa'] ?? $meta['remTa'],
                'traditionalRemedyHi' => $meta['fullRemHi'] ?? $meta['remHi'],
            ];
        }

        // Items 2/5: verdict, severity labels and the fuller Pitru remedy on
        // the assembled dosha list (by name, so the file stays easy to audit).
        foreach ($doshas as &$doshaRef) {
            if (($doshaRef['nameEn'] ?? '') === 'Mars (Kuja) Dosha') {
                $verdict = $kujaStatus === 'DOSHA_CANCELLED' ? 'present-cancelled'
                    : ($kujaStatus === 'DOSHA_PRESENT' || $kujaStatus === 'DOSHA_MILD' ? 'present'
                    : ($kujaStatus === 'DOSHA_NONE' ? 'none' : 'not-assessed'));
                $exceptionSuffixEn = '';
                $exceptionSuffixTa = '';
                $exceptionSuffixHi = '';
                foreach (($kujaDosha['exceptions'] ?? []) as $exception) {
                    if (($exception['code'] ?? '') === 'GURU_MANGALA') {
                        $exceptionSuffixEn .= ' (Guru-Mangala yoga)';
                        $exceptionSuffixTa .= ' (குரு-மங்கள யோகம்)';
                        $exceptionSuffixHi .= ' (गुरु-मंगल योग)';
                    }
                }
                $doshaRef['verdict'] = $verdict;
                // The machine verdict stays 'present-cancelled'; the label names
                // the Dosha Nivrutti rule instead of a flat "cancelled".
                $doshaRef['verdictLabelEn'] = $verdict === 'present-cancelled' ? 'Kuja Dosha present — Dosha Nivrutti applies' . $exceptionSuffixEn : ($verdict === 'present' ? 'Kuja Dosha present' : ($verdict === 'none' ? 'No Kuja Dosha under the chosen rule set' : 'N/A'));
                $doshaRef['verdictLabelTa'] = $verdict === 'present-cancelled' ? 'செவ்வாய் தோஷம் உள்ளது – தோஷ நிவர்த்தி விதி பொருந்துகிறது' . $exceptionSuffixTa : ($verdict === 'present' ? 'செவ்வாய் தோஷம் உள்ளது' : ($verdict === 'none' ? 'செவ்வாய் தோஷம் இல்லை' : 'N/A'));
                $doshaRef['verdictLabelHi'] = $verdict === 'present-cancelled' ? 'मंगल दोष उपस्थित — दोष निवृत्ति नियम लागू' . $exceptionSuffixHi : ($verdict === 'present' ? 'मंगल दोष उपस्थित' : ($verdict === 'none' ? 'मंगल दोष नहीं' : 'N/A'));
                $doshaRef['ruleEn'] = 'Rule set: Mars in houses ' . implode(', ', self::kujaDoshaHouses()) . ' counted from the Lagna, the Moon and Venus.';
                $doshaRef['ruleTa'] = 'விதி: செவ்வாய் லக்னம், சந்திரன், சுக்கிரன் ஆகியவற்றிலிருந்து ' . implode(', ', self::kujaDoshaHouses()) . ' ஆகிய இடங்களில்.';
                $doshaRef['ruleHi'] = 'नियम: मंगल लग्न, चंद्र और शुक्र से ' . implode(', ', self::kujaDoshaHouses()) . ' भावों में।';
            }
            if (($doshaRef['nameEn'] ?? '') === 'Pitru Dosha') {
                $doshaRef['strength'] = $pitruStrength;
                $doshaRef['strengthLabelEn'] = $pitruStrengthLabelEn;
                $doshaRef['strengthLabelTa'] = $pitruStrengthLabelTa;
                $doshaRef['strengthLabelHi'] = $pitruStrengthLabelHi;
                $doshaRef['extendedRemedyEn'] = 'Offer Amavasya tarpanam; feed crows and cows; pray to Maha Vishnu.';
                $doshaRef['extendedRemedyTa'] = 'அமாவாசை தர்ப்பணம் செய்யுங்கள்; காகங்களுக்கும் பசுக்களுக்கும் உணவளியுங்கள்; மகா விஷ்ணு பெயரைச் சொல்லி பிரார்த்தனை செய்யுங்கள்.';
                $doshaRef['extendedRemedyHi'] = 'अमावस्या तर्पण करें; कौओं और गायों को भोजन कराएँ; महाविष्णु का नाम लेकर प्रार्थना करें।';
                if ($pitruStrength === 'weak') {
                    $doshaRef['severityEn'] = $pitruStrengthLabelEn;
                    $doshaRef['severityTa'] = $pitruStrengthLabelTa;
                    $doshaRef['severityHi'] = $pitruStrengthLabelHi;
                    $doshaRef['descriptionEn'] = 'The Sun and ' . $nodeNameEn . ' share a sign but are ' . $sunNodeSeparationText . '° apart — outside the 12° orb, so no dosha is flagged: weak (same sign only).';
                    $doshaRef['descriptionTa'] = 'சூரியனும் ' . $nodeNameTa . ' உம் ஒரே ராசியில் ' . $sunNodeSeparationText . '° இடைவெளியில் உள்ளனர் — 12° எல்லைக்குள் இல்லாததால் தோஷம் கொடுக்கவில்லை; பலவீனமான (ஒரே ராசி மட்டும்) அறிகுறி.';
                    $doshaRef['descriptionHi'] = 'सूर्य और ' . $nodeNameHi . ' एक ही राशि में हैं पर ' . $sunNodeSeparationText . '° दूर हैं — 12° सीमा से बाहर होने के कारण यह दुर्बल (केवल समान राशि) संकेत है।';
                } elseif ($pitruStrength === 'present') {
                    $doshaRef['descriptionEn'] = ($sunNodeWithinOrb ? 'The Sun is within 12° of ' . $nodeNameEn . ' (' . $sunNodeSeparationText . '° apart). ' : '') . ($isSaturnIn9th ? 'Saturn occupies the 9th house by sign. ' : '') . 'These are simplified indicators only, not a complete Pitru assessment.';
                    $doshaRef['descriptionTa'] = ($sunNodeWithinOrb ? 'சூரியன் ' . $nodeNameTa . ' உடன் 12° எல்லைக்குள் (' . $sunNodeSeparationText . '°) உள்ளார். ' : '') . ($isSaturnIn9th ? 'சனி 9-ஆம் பாவத்தில் உள்ளார். ' : '') . 'இவை தேர்ந்தெடுத்த எளிய குறியீடுகள் மட்டுமே.';
                    $doshaRef['descriptionHi'] = ($sunNodeWithinOrb ? 'सूर्य ' . $nodeNameHi . ' से 12° के भीतर (' . $sunNodeSeparationText . '° अंतर) है। ' : '') . ($isSaturnIn9th ? 'शनि नवम भाव में है। ' : '') . 'ये केवल सरल संकेत हैं।';
                }
            }
        }
        unset($doshaRef);

        $ownEn = function ($h) use ($ordinal) {
            if (empty($h['isAvailable'])) return 'placement unavailable (N/A)';
            return $h['isOwnSign'] ? 'in its own sign' : "in the " . $ordinal($h['bhava']) . " house";
        };
        $ownTa = function ($h) {
            if (empty($h['isAvailable'])) return 'நிலை கிடைக்கவில்லை (N/A)';
            return $h['isOwnSign'] ? 'சுய ராசியில்' : "{$h['bhava']}-ஆம் இடத்தில்";
        };
        $ownHi = function ($h) {
            if (empty($h['isAvailable'])) return 'स्थिति उपलब्ध नहीं (N/A)';
            return $h['isOwnSign'] ? 'स्वराशि' : "{$h['bhava']}वें भाव";
        };

        // Live Sani Transit computation — detailed breakdown for Birth Jathagam Page 1
        $nowTs = time();
        $nowJd = ($nowTs / 86400.0) + 2440587.5;
        $saturnTransitSidereal = self::computeGeocentricPositions($nowJd, false)['sidereal']['saturn'];
        $saturnTransitRasiIdx = intval(floor($saturnTransitSidereal / 30.0)) % 12;
        $saturnHouseFromMoon = (($saturnTransitRasiIdx - $moonRasiIndex + 12) % 12) + 1;
        $isSaniFavourable = in_array($saturnHouseFromMoon, [3, 6, 11], true);
        $saturnHouseOrdinal = $ordinal($saturnHouseFromMoon);
        $saniDiff = ($saturnTransitRasiIdx - $moonRasiIndex + 12) % 12;
        $isEzharaiSani = in_array($saniDiff, [11, 0, 1], true);
        $isAshtamaSani = $saniDiff === 7;
        $isKandakaSani = in_array($saniDiff, [3, 6, 9], true);
        $isArdhashtamaSani = $saniDiff === 3;
        if ($saniDiff === 11) {
            $ezharaiTypeEn = 'Viraya Sani (12th House - Phase 1)';
            $ezharaiTypeTa = 'விரய சனி (12-ம் வீடு - முதல் பருவம்)';
            $ezharaiTypeHi = 'व्यय शनि (12वां भाव - प्रथम चरण)';
        } elseif ($saniDiff === 0) {
            $ezharaiTypeEn = 'Jenma Sani (Janma Rasi - Core Phase 2)';
            $ezharaiTypeTa = 'ஜென்ம சனி (ஜென்ம ராசி - இரண்டாம் பருவம்)';
            $ezharaiTypeHi = 'जन्म शनि (जन्म राशि - द्वितीय चरण)';
        } elseif ($saniDiff === 1) {
            $ezharaiTypeEn = 'Patha Sani (2nd House - Phase 3)';
            $ezharaiTypeTa = 'பாத சனி (2-ம் வீடு - மூன்றாம் பருவம்)';
            $ezharaiTypeHi = 'पाद शनि (दूसरा भाव - तृतीय चरण)';
        } else {
            $ezharaiTypeEn = 'None';
            $ezharaiTypeTa = 'இல்லை';
            $ezharaiTypeHi = 'कोई नहीं';
        }
        $saniRasiInfo = self::$RASIS[$saturnTransitRasiIdx] ?? ['en' => 'N/A', 'ta' => 'N/A', 'hi' => 'N/A'];

        $saniTransitStatusEn = $isSaniFavourable ? 'Favourable Transit' : 'Transit demands remedies';
        $saniTransitStatusTa = $isSaniFavourable ? 'அனுகூலமான சனி பெயர்ச்சி' : 'பரிகாரங்கள் தேவைப்படும் சனி பெயர்ச்சி';
        $saniTransitStatusHi = $isSaniFavourable ? 'शनि का गोचर अनुकूल है' : 'शनि के गोचर में उपाय अपेक्षित हैं';

        // Career placement-aware wording (10th lord)
        if (empty($h10['isAvailable'])) {
            $careerEn = 'Career-lord placement is unavailable (N/A); chart-derived career guidance cannot be determined.';
            $careerTa = 'தொழில் அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான வழிகாட்டலைத் தீர்மானிக்க முடியாது.';
            $careerHi = 'दशमेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित मार्गदर्शन निर्धारित नहीं किया जा सकता है।';
        } elseif ($h10['isDusthana'] && !$h10['isOwnSign']) {
            $careerEn = "With the career lord in the " . $ordinal($h10['bhava']) . " house, career progress requires patience, consistent effort, and navigating workplace dynamics with care.";
            $careerTa = "10-ஆம் இட அதிபதி {$h10['bhava']}-ஆம் இடத்தில் அமைந்துள்ளதால், தொழிலில் பொறுமையும் தொடர் முயற்சியும் தேவைப்படும். விவேகமான திட்டமிடல் வெற்றியைத் தரும்.";
            $careerHi = "दशमेश {$h10['bhava']}वें भाव में स्थित होने के कारण कार्यक्षेत्र में धैर्य, निरंतर परिश्रम एवं सावधानीपूर्वक निर्णय लेने की आवश्यकता है।";
        } else {
            $careerEn = "With the career lord " . ($h10['isOwnSign'] ? 'placed in its own sign' : "in the " . $ordinal($h10['bhava']) . " house") . ", career strength is greatly enhanced with natural leadership and recognition.";
            $careerTa = "10-ஆம் இட அதிபதி " . $ownTa($h10) . " அமைந்துள்ளதால், தொழில் மிகவும் பலம் பெறும். இயல்பான தலைமைத்துவமும் அங்கீகாரமும் கிடைக்கும்.";
            $careerHi = "दशमेश " . $ownHi($h10) . " में स्थित होने से कार्यक्षेत्र में उन्नति एवं प्रतिष्ठा प्राप्त होती है।";
        }
        // Item 3: when the 10th lord is debilitated (Mars for a Mithunam Lagna,
        // say) name the Neecha Bhanga rule rather than implying a guaranteed
        // career result either way.
        if (!empty($h10['dignityNoteEn'])) { $careerEn .= ' ' . $h10['dignityNoteEn']; $careerTa .= ' ' . $h10['dignityNoteTa']; $careerHi .= ' ' . $h10['dignityNoteHi']; }

        // Marriage placement-aware wording (7th lord)
        if (empty($h7['isAvailable'])) {
            $marriageEn = '7th-lord placement is unavailable (N/A); chart-derived relationship guidance cannot be determined.';
            $marriageTa = '7-ஆம் அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான உறவு வழிகாட்டலைத் தீர்மானிக்க முடியாது.';
            $marriageHi = 'सप्तमेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित संबंध मार्गदर्शन निर्धारित नहीं किया जा सकता है।';
        } elseif ($h7['isDusthana'] && !$h7['isOwnSign']) {
            $marriageEn = "With the 7th lord in the " . $ordinal($h7['bhava']) . " house, mutual understanding, patient communication, and adjustments are essential for marital harmony.";
            $marriageTa = "7-ஆம் இட அதிபதி {$h7['bhava']}-ஆம் இடத்தில் அமைந்துள்ளதால், திருமண வாழ்வில் பரஸ்பர புரிதலும் பொறுமையும் நல்லிணக்கத்தை வளர்க்கும்.";
            $marriageHi = "सप्तमेश {$h7['bhava']}वें भाव में स्थित होने से दांपत्य जीवन में आपसी समझ, धैर्य एवं सामंजस्य बनाए रखना आवश्यक है।";
        } else {
            $marriageEn = "With the 7th lord " . ($h7['isOwnSign'] ? 'placed in its own sign' : "in the " . $ordinal($h7['bhava']) . " house") . ", married life is strongly supported with natural harmony.";
            $marriageTa = "7-ஆம் இட அதிபதி " . $ownTa($h7) . " அமைந்துள்ளதால், திருமண வாழ்க்கை மிகவும் பலம் பெறும்.";
            $marriageHi = "सप्तमेश " . $ownHi($h7) . " में स्थित होने से दांपत्य जीवन सुखद रहता है।";
        }

        // Family / Property placement-aware wording (4th lord)
        if (empty($h4['isAvailable'])) {
            $familyEn = '4th-lord placement is unavailable (N/A); chart-derived property guidance cannot be determined.';
            $familyTa = '4-ஆம் அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான சொத்து வழிகாட்டலைத் தீர்மானிக்க முடியாது.';
            $familyHi = 'चतुर्थेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित संपत्ति मार्गदर्शन निर्धारित नहीं किया जा सकता है।';
        } elseif ($h4['isDusthana'] && !$h4['isOwnSign']) {
            $familyEn = "With the 4th lord in the " . $ordinal($h4['bhava']) . " house, property transactions and domestic matters require careful diligence and verification.";
            $familyTa = "சுக அதிபதி {$h4['bhava']}-ஆம் இடத்தில் அமைந்துள்ளதால், சொத்து மற்றும் குடும்ப விவகாரங்களில் கூடுதல் கவனம் தேவைப்படும்.";
            $familyHi = "चतुर्थेश {$h4['bhava']}वें भाव में स्थित होने से भूमि-भवन एवं पारिवारिक मामलों में सावधानी आवश्यक है।";
        } else {
            $familyEn = "With the 4th lord " . ($h4['isOwnSign'] ? 'in its own sign' : "in the " . $ordinal($h4['bhava']) . " house") . ", prospects for owning property/land are favourable and domestic happiness is indicated.";
            $familyTa = "சுக அதிபதி " . $ownTa($h4) . " அமைந்துள்ளதால், சொந்த வீடு/நிலம் வாய்ப்பு நல்ல நிலையில் இருக்கும். குடும்ப மகிழ்ச்சியும் அமையும்.";
            $familyHi = "चतुर्थेश " . $ownHi($h4) . " में स्थित होने से गृह लाभ के योग बनते हैं।";
        }

        // Foreign Travel / Fortune placement-aware wording (9th lord)
        if (empty($h9['isAvailable'])) {
            $foreignTravelEn = '9th-lord placement is unavailable (N/A); chart-derived travel guidance cannot be determined.';
            $foreignTravelTa = '9-ஆம் அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான பயண வழிகாட்டலைத் தீர்மானிக்க முடியாது.';
            $foreignTravelHi = 'नवमेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित यात्रा मार्गदर्शन निर्धारित नहीं किया जा सकता है।';
        } elseif ($h9['isDusthana'] && !$h9['isOwnSign']) {
            $foreignTravelEn = "With the 9th lord in the " . $ordinal($h9['bhava']) . " house, fortunes improve through persistent self-effort, higher learning, and spiritual devotion.";
            $foreignTravelTa = "பாக்கிய அதிபதி {$h9['bhava']}-ஆம் இடத்தில் அமைந்துள்ளதால், சுய முயற்சி மற்றும் ஆன்மீக வழிபாட்டின் மூலம் அதிர்ஷ்டமும் உயர்வும் கிட்டும்.";
            $foreignTravelHi = "नवमेश {$h9['bhava']}वें भाव में स्थित होने से निरंतर प्रयास एवं आध्यात्मिक साधना से भाग्योदय होता है।";
        } else {
            $foreignTravelEn = "With the 9th lord " . ($h9['isOwnSign'] ? 'in its own sign' : "in the " . $ordinal($h9['bhava']) . " house") . ", foreign connections and fortune are favourably indicated.";
            $foreignTravelTa = "பாக்கிய அதிபதி " . $ownTa($h9) . " அமைந்துள்ளதால், வெளிநாட்டு தொடர்பு மற்றும் அதிர்ஷ்டம் சாதகமாக இருக்கும்.";
            $foreignTravelHi = "नवमेश " . $ownHi($h9) . " में स्थित होने से विदेश संपर्क शुभ रहता है।";
        }

        // Current period guidance (derived from live Sani transit)
        if ($isSaniFavourable) {
            $currentPeriodGuidanceEn = "Saturn's transit in the {$saturnHouseOrdinal} house from Janma Rasi is favourable, supporting career progress and success. Worshipping Lord Ganesha and regular prayers will sustain positive momentum.";
            $currentPeriodGuidanceTa = "ஜென்ம ராசியிலிருந்து {$saturnHouseFromMoon}-ஆம் இடத்தில் சனி பகவான் சஞ்சரிப்பதால் நற்பலன்களும் காரிய வெற்றியும் உண்டாகும். விநாயகர் மற்றும் பெருமாள் வழிபாடு தொடர்ந்து நலம் சேர்க்கும்.";
            $currentPeriodGuidanceHi = "जन्म राशि से {$saturnHouseOrdinal} भाव में शनि का गोचर अनुकूल फल एवं कार्यक्षेत्र में प्रगति प्रदान करता है। भगवान गणेश एवं विष्णु की आराधना से शुभता बढ़ती है।";
        } else {
            $currentPeriodGuidanceEn = "Saturn's transit in the {$saturnHouseOrdinal} house from Janma Rasi calls for patience and discipline. Pray to Ganesha or Shiva.";
            $currentPeriodGuidanceTa = "ஜென்ம ராசியிலிருந்து {$saturnHouseFromMoon}-ஆம் இடத்தில் சனி பகவான் சஞ்சரிப்பதால் பொறுமையும் கவனமும் தேவை. விநாயகர் அல்லது சிவனைப் பிரார்த்தனை செய்யுங்கள்.";
            $currentPeriodGuidanceHi = "जन्म राशि से {$saturnHouseOrdinal} भाव में शनि का गोचर सावधानी और धैर्य की मांग करता है। गणेश या शिव से प्रार्थना करें।";
        }

        $healthEn = !empty($h1['isAvailable']) ? "With the Lagna lord " . $ownEn($h1) . ", attention to diet and lifestyle habits is advised. Regular exercise supports good health." : 'Lagna-lord placement unavailable (N/A); chart-derived health guidance cannot be determined.';
        $healthTa = !empty($h1['isAvailable']) ? "லக்னாதிபதி " . $ownTa($h1) . " அமைந்துள்ளதால், உணவு மற்றும் வாழ்க்கை முறையில் கவனம் தேவை. ஒழுங்கான உடற்பயிற்சி நல்ல ஆரோக்கியத்தைத் தரும்." : 'லக்னாதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான ஆரோக்கிய வழிகாட்டலைத் தீர்மானிக்க முடியாது.';
        $healthHi = !empty($h1['isAvailable']) ? "लग्नेश " . $ownHi($h1) . " में स्थित होने के कारण खान-पान एवं दिनचर्या पर ध्यान देना लाभकारी रहता है।" : 'लग्नेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित स्वास्थ्य मार्गदर्शन निर्धारित नहीं किया जा सकता है।';
        // Item 3: the Health card names the Neecha Bhanga rule when the Lagna
        // lord is debilitated, never a flat "cancelled" and never a promise.
        if (!empty($h1['dignityNoteEn'])) { $healthEn .= ' ' . $h1['dignityNoteEn']; $healthTa .= ' ' . $h1['dignityNoteTa']; $healthHi .= ' ' . $h1['dignityNoteHi']; }

        $summary = [
            'healthEn' => $healthEn,
            'healthTa' => $healthTa,
            'healthHi' => $healthHi,
            'wealthEn' => !empty($h2['isAvailable']) ? "With the 2nd lord " . $ownEn($h2) . ", gains arrive through multiple income streams. Consistent saving habits build strong finances over time." : '2nd-lord placement unavailable (N/A); chart-derived financial guidance cannot be determined.',
            'wealthTa' => !empty($h2['isAvailable']) ? "தன அதிபதி " . $ownTa($h2) . " அமைந்துள்ளதால், பல வழிகளிலிருந்து இலாபம் கிடைக்கும். சேமிப்பு பழக்கம் தொடர்ந்தால் நல்ல நிதி நிலை உருவாகும்." : 'தன அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான நிதி வழிகாட்டலைத் தீர்மானிக்க முடியாது.',
            'wealthHi' => !empty($h2['isAvailable']) ? "द्वितीयेश " . $ownHi($h2) . " में स्थित होने से विभिन्न स्रोतों से धन लाभ होता है।" : 'द्वितीयेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित वित्तीय मार्गदर्शन निर्धारित नहीं किया जा सकता है।',
            'educationEn' => !empty($h5['isAvailable']) ? "With the 5th lord " . $ownEn($h5) . ", interest in higher education and spiritual knowledge is indicated." : '5th-lord placement unavailable (N/A); chart-derived education guidance cannot be determined.',
            'educationTa' => !empty($h5['isAvailable']) ? "வித்யா அதிபதி " . $ownTa($h5) . " அமைந்துள்ளதால், உயர்கல்வி மற்றும் ஆன்மீக அறிவில் ஆர்வம் காணப்படும்." : '5-ஆம் அதிபதியின் நிலை கிடைக்கவில்லை (N/A); ஜாதக அடிப்படையிலான கல்வி வழிகாட்டலைத் தீர்மானிக்க முடியாது.',
            'educationHi' => !empty($h5['isAvailable']) ? "पंचमेश " . $ownHi($h5) . " में स्थित होने से उच्च शिक्षा में रुचि रहती है।" : 'पंचमेश की स्थिति उपलब्ध नहीं है (N/A); कुंडली-आधारित शिक्षा मार्गदर्शन निर्धारित नहीं किया जा सकता है।',
            'careerEn' => $careerEn,
            'careerTa' => $careerTa,
            'careerHi' => $careerHi,
            'marriageEn' => $marriageEn,
            'marriageTa' => $marriageTa,
            'marriageHi' => $marriageHi,
            'familyEn' => $familyEn,
            'familyTa' => $familyTa,
            'familyHi' => $familyHi,
            'foreignTravelEn' => $foreignTravelEn,
            'foreignTravelTa' => $foreignTravelTa,
            'foreignTravelHi' => $foreignTravelHi,
            'currentPeriodGuidanceEn' => $currentPeriodGuidanceEn,
            'currentPeriodGuidanceTa' => $currentPeriodGuidanceTa,
            'currentPeriodGuidanceHi' => $currentPeriodGuidanceHi
        ];

        $dashaTargetTimestamp = time();
        $dasha = self::calculateVimshottariDasha($moonSidereal, $timeTs, $dashaTargetTimestamp, $timeZoneId, $tz);
        $dashaPeriods = self::calculateVimshottariDashaPeriods($moonSidereal, $timeTs, $dashaTargetTimestamp, $timeZoneId, $tz);

        // Item 4: the guidance card uses the real running dasa and ALWAYS names
        // a Mahadasa that begins inside the next 12 months.
        $nextMahadasa = self::nextMahadasaInfo($dashaPeriods);
        $dasha['nextMahadasa'] = $nextMahadasa;
        $dashaContextEn = sprintf('The running period is %s Mahadasa with %s Bhukti.', $dasha['currentLord'] ?? 'N/A', $dasha['subLord'] ?? 'N/A');
        $dashaContextTa = sprintf('தற்போது %s மகாதிசை, %s புக்தி.', $dasha['currentLordTa'] ?? 'N/A', $dasha['subLordTa'] ?? 'N/A');
        $dashaContextHi = sprintf('वर्तमान में %s महादशा में %s भुक्ति चल रही है।', $dasha['currentLordHi'] ?? 'N/A', $dasha['subLordHi'] ?? 'N/A');
        $summary['currentPeriodGuidanceEn'] = $dashaContextEn . ' ' . $summary['currentPeriodGuidanceEn'] . ($nextMahadasa['noticeEn'] !== '' ? ' ' . $nextMahadasa['noticeEn'] : '');
        $summary['currentPeriodGuidanceTa'] = $dashaContextTa . ' ' . $summary['currentPeriodGuidanceTa'] . ($nextMahadasa['noticeTa'] !== '' ? ' ' . $nextMahadasa['noticeTa'] : '');
        $summary['currentPeriodGuidanceHi'] = $dashaContextHi . ' ' . $summary['currentPeriodGuidanceHi'] . ($nextMahadasa['noticeHi'] !== '' ? ' ' . $nextMahadasa['noticeHi'] : '');
        // Item 7b: Kendradhipati is quoted by the Career and Marriage cards.
        $summary['careerEn'] = $summary['careerEn'] . $kendraCareerNoteEn;
        $summary['careerTa'] = $summary['careerTa'] . $kendraCareerNoteTa;
        $summary['careerHi'] = $summary['careerHi'] . $kendraCareerNoteHi;
        $summary['marriageEn'] = $summary['marriageEn'] . $kendraMarriageNoteEn;
        $summary['marriageTa'] = $summary['marriageTa'] . $kendraMarriageNoteTa;
        $summary['marriageHi'] = $summary['marriageHi'] . $kendraMarriageNoteHi;

        return [
            'nativeName' => $name,
            'devoteeName' => $name,
            'dob' => $dob,
            'tob' => $tob,
            'birthPlace' => trim((string) $payload['birthPlace']),
            'country' => trim((string) ($payload['country'] ?? '')),
            'latitude' => $lat,
            'longitude' => $lng,
            'timezoneOffsetHours' => $tz,
            'timeZoneId' => $timeZoneId !== '' ? $timeZoneId : null,
            // How the birth instant was fixed: 'payload' (client sent a valid
            // IANA id), 'coordinates' (zone derived from lat/long) or 'offset'
            // (fixed offset only). timezoneOffsetAdjusted is true when the
            // submitted offset disagreed with the historical rules by >= 30 min.
            'timeZoneSource' => $timeZoneSource,
            'timezoneAbbreviation' => $birthInstant['abbreviation'],
            'daylightSaving' => $birthInstant['dst'],
            'submittedTimezoneOffsetHours' => $birthInstant['suppliedOffsetHours'],
            'timezoneOffsetAdjusted' => $birthInstant['offsetAdjusted'],
            'ayanamsa' => round($ayanamsa, 4),
            // Which lunar-node convention produced Rahu/Ketu ('TRUE' | 'MEAN').
            'nodeType' => $ephemeris['nodeType'],
            'ephemeris' => [
                'model' => 'VSOP87D/ELP2000-82, IAU1980 nutation, Lahiri (Chitra Paksha) true ayanamsa',
                'rahuNodeType' => $ephemeris['nodeType'],
                'rahuTrueNode' => round($siderealLongitudes['trueNode'], 5),
                'rahuMeanNode' => round($siderealLongitudes['meanNode'], 5),
                'julianDayUT' => round($julianDay, 6),
                'deltaTSeconds' => round($ephemeris['deltaT'], 2),
                'ayanamsaTrue' => round($ayanamsa, 6),
                'ayanamsaMean' => round($ephemeris['ayanamsaMean'], 6),
                'nutationLongitude' => round($ephemeris['nutation']['dpsi'] * 3600.0, 2), // arcseconds
                'siderealLongitudes' => array_map(static fn($v) => round($v, 5), $siderealLongitudes),
                'lagnaSidereal' => round($lagnaSidereal, 5),
            ],
            'lagnaRasi' => $lagnaRasiIndex + 1,
            'lagnaDegrees' => round(fmod($lagnaSidereal, 30), 2),
            // D9 Ascendant: the same 3°20′ rule, applied to the exact sidereal Lagna.
            'lagnaNavamsaRasi' => (intval(floor($lagnaSidereal / (360.0 / 108.0))) % 12) + 1,
            'isLagnaVargottama' => ((intval(floor($lagnaSidereal / (360.0 / 108.0))) % 12) + 1) === ($lagnaRasiIndex + 1),
            'chandraRasi' => $moonRasiIndex + 1,
            'janmaNakshatraIndex' => $nakshatraIndex,
            'janmaNakshatraEn' => self::$NAKSHATRAS_EN[$nakshatraIndex],
            'janmaNakshatraTa' => self::$NAKSHATRAS_TA[$nakshatraIndex],
            'janmaNakshatraHi' => self::$NAKSHATRAS_HI[$nakshatraIndex],
            'janmaPada' => $padaIndex,
            'birthDetails' => [
                'dob' => $dob,
                'tob' => $tob,
                'birthPlace' => trim((string) $payload['birthPlace']),
                'country' => trim((string) ($payload['country'] ?? '')),
                'latitude' => $lat,
                'longitude' => $lng,
                'timezoneOffsetHours' => $tz,
                'timeZoneId' => $timeZoneId !== '' ? $timeZoneId : null,
                'timeZoneSource' => $timeZoneSource,
                'daylightSaving' => $birthInstant['dst']
            ],
            'lagna' => [
                'rasi' => $lagna['en'],
                'rasiTa' => $lagna['ta'],
                'rasiHi' => $lagna['hi'],
                'lord' => $lagna['lord'],
                'lordTa' => $lagna['lordTa']
            ],
            'rasi' => [
                'name' => $rasi['en'],
                'nameTa' => $rasi['ta'],
                'nameHi' => $rasi['hi'],
                'lord' => $rasi['lord'],
                'lordTa' => $rasi['lordTa']
            ],
            'nakshatram' => [
                'name' => self::$NAKSHATRAS_EN[$nakshatraIndex],
                'nameTa' => self::$NAKSHATRAS_TA[$nakshatraIndex],
                'nameHi' => self::$NAKSHATRAS_HI[$nakshatraIndex],
                'pada' => $padaIndex
            ],
            'planets' => $planets,
            'planetPositions' => $planetPositions,
            'dasha' => $dasha,
            'dashaPeriods' => $dashaPeriods,
            'saniTransit' => [
                'status' => $saniTransitStatusEn,
                'statusTa' => $saniTransitStatusTa,
                'statusHi' => $saniTransitStatusHi,
                'house' => $saturnHouseFromMoon,
                'phase' => "{$saturnHouseOrdinal} House Transit",
                'isEzharaiSani' => $isEzharaiSani,
                'ezharaiTypeEn' => $ezharaiTypeEn,
                'ezharaiTypeTa' => $ezharaiTypeTa,
                'ezharaiTypeHi' => $ezharaiTypeHi,
                'isAshtamaSani' => $isAshtamaSani,
                'isKandakaSani' => $isKandakaSani,
                'isArdhashtamaSani' => $isArdhashtamaSani,
                'saniHouseFromMoon' => $saturnHouseFromMoon,
                'currentSaniRasi' => $saturnTransitRasiIdx + 1,
                'saniRasiNameEn' => $saniRasiInfo['en'],
                'saniRasiNameTa' => $saniRasiInfo['ta'],
                'saniRasiNameHi' => $saniRasiInfo['hi']
            ],
            'saniStatus' => [
                'isEzharaiSani' => $isEzharaiSani,
                'ezharaiTypeEn' => $ezharaiTypeEn,
                'ezharaiTypeTa' => $ezharaiTypeTa,
                'ezharaiTypeHi' => $ezharaiTypeHi,
                'isAshtamaSani' => $isAshtamaSani,
                'isKandakaSani' => $isKandakaSani,
                'isArdhashtamaSani' => $isArdhashtamaSani,
                'saniHouseFromMoon' => $saturnHouseFromMoon,
                'currentSaniRasi' => $saturnTransitRasiIdx + 1,
                'saniRasiNameEn' => $saniRasiInfo['en'],
                'saniRasiNameTa' => $saniRasiInfo['ta'],
                'saniRasiNameHi' => $saniRasiInfo['hi'],
                'remedyEn' => 'Pray to Shiva.',
                'remedyTa' => 'சிவனைப் பிரார்த்தனை செய்யுங்கள்.',
                'remedyHi' => 'शिव से प्रार्थना करें।'
            ],
            'kujaDosha' => $kujaDosha,
            'dosha' => [
                'chevvaiDosha' => $isKujaDosha,
                'chevvaiDoshaStatus' => $kujaStatus,
                'rahuKetuDosha' => $isKalaSarpaDosha,
                'summary' => $isKujaDosha === null
                    ? 'Kuja Dosha assessment unavailable because Mars placement data is missing.'
                    : ($isKujaDosha
                        ? ($isKujaMild
                            ? 'Mild Sevvay Dosha (reduced by classical rules); simple remedies and a compatible horoscope are sufficient.'
                            : 'Sevvay Dosha present; traditional remedies and a Dosha Samyam (matching) partner chart are recommended.')
                        : ($isKujaCancelled
                            ? 'Sevvay Dosha is relieved by a classical Dosha Nivrutti rule; it is an indicator only, not a guarantee of any outcome.'
                            : ($isKalaSarpaDosha || $isPitruDosha === true
                            ? 'Dosha indications present; traditional remedies and prayers recommended.'
                            : 'No trigger was found under the available selected rules; this is not a complete dosha assessment.')))
            ],
            'doshas' => $doshas,
            'grahaYuddha' => $grahaYuddha,
            'kendradhipati' => $kendradhipati,
            'yogas' => $yogas,
            'pitruStrength' => $pitruStrength,
            'summary' => $summary,
            'sevvaiDosha' => [
                'hasDosha' => $isKujaDosha,
                'status' => $kujaStatus,
                'severityEn' => $kujaDosha['severityEn'],
                'severityTa' => $kujaDosha['severityTa'],
                'severityHi' => $kujaDosha['severityHi'],
                'recommendation' => $kujaDosha['explanationEn'],
                'recommendationTa' => $kujaDosha['explanationTa'],
                'recommendationHi' => $kujaDosha['explanationHi']
            ],
            'kalaSarpaDosha' => ['hasDosha' => $isKalaSarpaDosha, 'typeEn' => $isKalaSarpaDosha ? 'Present' : 'None', 'typeTa' => $isKalaSarpaDosha ? 'காலசர்ப தோஷம் உள்ளது' : 'இல்லை'],
            'pitruDosha' => [
                'hasDosha' => $isPitruDosha,
                'severityEn' => $isPitruDosha === null ? 'N/A' : ($isPitruDosha ? 'Moderate' : 'Favourable'),
                'severityTa' => $isPitruDosha === null ? 'N/A' : ($isPitruDosha ? 'மிதமான தோஷம்' : 'நல்ல நிலை')
            ],
            'generatedAt' => date('Y-m-d H:i:s'),
            'certifiedBy' => 'ASTRO SIVAM Astrological Council'
        ];
    }

}
