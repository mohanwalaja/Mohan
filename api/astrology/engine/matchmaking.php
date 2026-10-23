<?php
/**
 * ASTRO SIVAM — Marriage Compatibility (Porutham Synastry) Calculation
 */

trait AstroEngineMatchmakingTrait
{
    public static function calculateMatchmaking($payload) {
        $boy = $payload['groom'] ?? $payload['groomDetails'] ?? $payload['boy'] ?? $payload['boyDetails'] ?? [];
        $girl = $payload['bride'] ?? $payload['brideDetails'] ?? $payload['girl'] ?? $payload['girlDetails'] ?? [];

        if (empty($boy) && empty($girl)) {
            if (isset($payload['p1']) && isset($payload['p2'])) {
                $boy = $payload['p1'];
                $girl = $payload['p2'];
            }
        }

        $boyH = self::calculateHoroscope($boy);
        $girlH = self::calculateHoroscope($girl);

        $poruthamDefs = [
            ['id' => 'dina', 'nameEn' => 'Dina Porutham', 'nameTa' => 'தினப் பொருத்தம்', 'nameHi' => 'दिन पोरुथम', 'pts' => 3, 'max' => 3, 'enum' => 'UTTHAMAM', 'expEn' => 'Longevity, good health and freedom from discord.', 'expTa' => 'நீண்ட ஆயுள், நல்ல ஆரோக்கியம் மற்றும் கருத்து வேறுபாடு இன்மை.', 'expHi' => 'यह दीर्घायु, उत्तम स्वास्थ्य एवं मतभेद रहित जीवन प्रदान करता है।', 'lackEn' => 'The star distance does not carry full Dina strength; vitality, health support and freedom from discord are only partly assured.', 'lackTa' => 'நட்சத்திர இடைவெளியில் முழு தின பலம் இல்லை; ஆரோக்கியம், ஆயுள் ஆதரவு மற்றும் கருத்து ஒற்றுமை முழுமையாக இல்லை.', 'lackHi' => 'नक्षत्र दूरी में पूर्ण दिन बल नहीं है; स्वास्थ्य, दीर्घायु एवं मतभेद-रहितता का समर्थन अपूर्ण है।', 'crucial' => false],
            ['id' => 'gana', 'nameEn' => 'Gana Porutham', 'nameTa' => 'கணப் பொருத்தம்', 'nameHi' => 'गण पोरुथम', 'pts' => 4, 'max' => 4, 'enum' => 'UTTHAMAM', 'expEn' => 'Harmonious temperament and mutual affection.', 'expTa' => 'இணக்கமான சுபாவமும் பரஸ்பர பாசமும்.', 'expHi' => 'यह सामंजस्यपूर्ण स्वभाव एवं परस्पर स्नेह प्रदान करता है।', 'lackEn' => 'The two Ganas differ, so temperamental harmony and mutual affection are not assured and need deliberate adjustment.', 'lackTa' => 'இரு கணங்கள் வேறுபடுவதால் குண ஒற்றுமையும் பாசமும் தானாக அமையாது; விட்டுக்கொடுத்தல் தேவை.', 'lackHi' => 'दोनों गण भिन्न हैं; स्वभाव-सामंजस्य एवं परस्पर स्नेह के लिए समझदारी आवश्यक है।', 'crucial' => false],
            ['id' => 'mahendra', 'nameEn' => 'Mahendra Porutham', 'nameTa' => 'மகேந்திரப் பொருத்தம்', 'nameHi' => 'महेंद्र पोरुथम', 'pts' => 3, 'max' => 3, 'enum' => 'UTTHAMAM', 'expEn' => 'Children, lineage expansion and wealth generation.', 'expTa' => 'குழந்தைகள், வம்சவிருத்தி மற்றும் செல்வ வளர்ச்சி.', 'expHi' => 'यह संतान सुख, वंश वृद्धि एवं धन लाभ के लिए शुभ है।', 'lackEn' => 'The star distance gives no Mahendra support, so this blessing for children, lineage growth and wealth is absent.', 'lackTa' => 'நட்சத்திர இடைவெளியில் மகேந்திர ஆதரவு இல்லை; குழந்தை, வம்சவிருத்தி மற்றும் செல்வ வளர்ச்சி ஆசி இல்லை.', 'lackHi' => 'नक्षत्र दूरी से महेंद्र सहायता नहीं मिलती है; संतान, वंश वृद्धि एवं धन लाभ का फल नहीं मिलता है।', 'crucial' => false],
            ['id' => 'stree_deergha', 'nameEn' => 'Stree Deergha Porutham', 'nameTa' => 'ஸ்திரீ தீர்க்கப் பொருத்தம்', 'nameHi' => 'स्त्री दीर्घ पोरुथम', 'pts' => 2, 'max' => 2, 'enum' => 'UTTHAMAM', 'expEn' => 'Long, prosperous life and all-round growth for the bride.', 'expTa' => 'மனைவிக்கு நீண்ட ஆயுளும் அனைத்துவிதமான வளர்ச்சியும்.', 'expHi' => 'इससे वधू को दीर्घायु, सुख एवं सर्वांगीण उन्नति प्राप्त होती है।', 'lackEn' => 'The star distance is short, so long life and all-round growth for the bride are not strengthened.', 'lackTa' => 'நட்சத்திர இடைவெளி குறைவு; மணமகளுக்கு நீண்ட ஆயுளும் அனைத்துவித வளர்ச்சியும் வலுப்படுத்தப்படவில்லை.', 'lackHi' => 'नक्षत्र दूरी कम है; वधू की दीर्घायु एवं सर्वांगीण उन्नति को बल नहीं मिलता है।', 'crucial' => false],
            ['id' => 'yoni', 'nameEn' => 'Yoni Porutham', 'nameTa' => 'யோனிப் பொருத்தம்', 'nameHi' => 'योनि पोरुथम', 'pts' => 4, 'max' => 4, 'enum' => 'UTTHAMAM', 'expEn' => 'Physical and biological compatibility.', 'expTa' => 'உடல் மற்றும் உயிரியல் இணக்கம்.', 'expHi' => 'यह शारीरिक एवं जैविक अनुकूलता दर्शाता है।', 'lackEn' => 'The two Yoni animals are not a strong match (neutral or inimical), so physical and biological harmony is weak or strained.', 'lackTa' => 'இரு யோனி விலங்குகளும் வலுவான பொருத்தம் அல்ல (நடுநிலை அல்லது பகை); உடல் மற்றும் உயிரியல் இணக்கம் பலவீனம் அல்லது வலி.', 'lackHi' => 'दोनों योनि पशु मजबूत मेल नहीं हैं (तटस्थ या शत्रु); शारीरिक एवं जैविक सामंजस्य कमज़ोर है।', 'crucial' => false],
            ['id' => 'rasi', 'nameEn' => 'Rasi Porutham', 'nameTa' => 'ராசிப் பொருத்தம்', 'nameHi' => 'राशि पोरुथम', 'pts' => 5, 'max' => 5, 'enum' => 'UTTHAMAM', 'expEn' => 'Union of families and life stability.', 'expTa' => 'குடும்பங்களின் ஒற்றுமை மற்றும் வாழ்க்கை உறுதி.', 'expHi' => 'इससे परिवारों का मिलन एवं जीवन में स्थिरता रहती है।', 'lackEn' => 'The Moon signs are an inauspicious distance apart, so family union and life stability need conscious effort.', 'lackTa' => 'சந்திர ராசிகள் சாதகமற்ற இடைவெளியில் உள்ளன; குடும்ப ஒற்றுமையும் வாழ்க்கை உறுதியும் முயற்சியால் மட்டுமே அமையும்.', 'lackHi' => 'चंद्र राशियाँ अशुभ दूरी में हैं; पारिवारिक मिलन एवं जीवन स्थिरता के लिए प्रयास आवश्यक है।', 'crucial' => false],
            ['id' => 'rasiyadhipathi', 'nameEn' => 'Rasiyadhipathi Porutham', 'nameTa' => 'ராசியாதிபதிப் பொருத்தம்', 'nameHi' => 'राशि अधिपति पोरुथम', 'pts' => 4, 'max' => 4, 'enum' => 'UTTHAMAM', 'expEn' => 'Friendly planetary lords bringing peace.', 'expTa' => 'நட்பான ராசி அதிபதிகள் அமைதியைத் தரும்.', 'expHi' => 'मैत्रीपूर्ण राशि स्वामी शांति प्रदान करते हैं।', 'lackEn' => 'The ruling lords are not mutual friends, so peace between the families depends on conscious understanding.', 'lackTa' => 'ராசி அதிபதிகள் பரஸ்பர நண்பர்கள் அல்ல; குடும்பங்களிடையே அமைதி புரிந்துணர்வால் மட்டுமே அமையும்.', 'lackHi' => 'राशि स्वामी परस्पर मित्र नहीं हैं; शांति हेतु समझदारी आवश्यक है।', 'crucial' => false],
            ['id' => 'vasiya', 'nameEn' => 'Vasiya Porutham', 'nameTa' => 'வசியப் பொருத்தம்', 'nameHi' => 'वश्य पोरुथम', 'pts' => 2, 'max' => 2, 'enum' => 'MADHYAMAM', 'expEn' => 'Mutual attraction and mental alignment.', 'expTa' => 'பரஸ்பர ஈர்ப்பும் மன ஒற்றுமையும்.', 'expHi' => 'इससे परस्पर आकर्षण एवं मानसिक तालमेल बना रहता है।', 'lackEn' => 'The special Vasiya pull is absent; mutual attraction and mental alignment stay at an ordinary level.', 'lackTa' => 'விசேஷ வசிய ஈர்ப்பு இல்லை; பரஸ்பர கவர்ச்சியும் மன ஒற்றுமையும் சாதாரண அளவிலேயே இருக்கும்.', 'lackHi' => 'विशेष वश्य आकर्षण नहीं है; परस्पर आकर्षण एवं मानसिक तालमेल सामान्य स्तर पर रहता है।', 'crucial' => false],
            ['id' => 'rajju', 'nameEn' => 'Rajju Porutham', 'nameTa' => 'ரஜ்ஜுப் பொருத்தம்', 'nameHi' => 'रज्जु पोरुथम', 'pts' => 5, 'max' => 5, 'enum' => 'UTTHAMAM', 'expEn' => 'Aayush and lifelong marital bonding (most essential).', 'expTa' => 'ஆயுளும் வாழ்நாள் முழுவதும் திருமண பந்தமும் (மிக முக்கியமானது).', 'expHi' => 'यह दीर्घायु एवं आजीवन दांपत्य बंधन के लिए अत्यंत शुभ है।', 'lackEn' => 'Both stars fall in the SAME Rajju group (Eka Rajju dosha), so the classical protection of lifespan and marital security is missing.', 'lackTa' => 'இரு நட்சத்திரங்களும் ஒரே ரஜ்ஜு குழுவில் உள்ளன (ஏக ரஜ்ஜு தோஷம்); ஆயுள் மற்றும் மாங்கல்ய பாதுகாப்பு இல்லை.', 'lackHi' => 'दोनों नक्षत्र एक ही रज्जु समूह में हैं (एक रज्जु दोष); आयु एवं वैवाहिक सुरक्षा का संरक्षण अनुपस्थित है।', 'crucial' => true],
            ['id' => 'vedha', 'nameEn' => 'Vedha Porutham', 'nameTa' => 'வேதைப் பொருத்தம்', 'nameHi' => 'वेध पोरुथम', 'pts' => 3, 'max' => 3, 'enum' => 'UTTHAMAM', 'expEn' => 'Free from malefic psychic affliction.', 'expTa' => 'தீய நட்சத்திர வேதை இன்மை.', 'expHi' => 'दोनों जन्म नक्षत्र अशुभ वेध दोष से मुक्त हैं।', 'lackEn' => 'A Vedha (obstruction) pair is present, so friction, disputes and avoidable obstacles are indicated.', 'lackTa' => 'வேதை (தடை) ஜோடி உள்ளது; கருத்து வேறுபாடு, தகராறு மற்றும் தடைகள் ஏற்படலாம்.', 'lackHi' => 'वेध (बाधा) युग्म है; मतभेद, विवाद एवं बाधाएँ संभव हैं।', 'crucial' => false]
        ];

        $enumToLegacyStatus = [
            'UTTHAMAM' => 'Very Good',
            'MADHYAMAM' => 'Good',
            'PORUNDHADHU' => 'Not Compatible'
        ];

        // --- Real calculation FIRST: fill $poruthamDefs with actual results ---
        $lordNameToKey = ['Sun'=>'sun','Moon'=>'moon','Mars'=>'mars','Mercury'=>'mercury','Jupiter'=>'jupiter','Venus'=>'venus','Saturn'=>'saturn'];
        $boyLordKey = $lordNameToKey[$boyH['rasi']['lord']] ?? 'sun';
        $girlLordKey = $lordNameToKey[$girlH['rasi']['lord']] ?? 'sun';
        $boyNakIdx = array_search($boyH['janmaNakshatraEn'], self::$NAKSHATRAS_EN, true);
        $girlNakIdx = array_search($girlH['janmaNakshatraEn'], self::$NAKSHATRAS_EN, true);
        $boyRasiIdx = $boyH['chandraRasi'] - 1;
        $girlRasiIdx = $girlH['chandraRasi'] - 1;

        $realResults = self::calculatePoruthams($boyNakIdx, $boyRasiIdx, $girlNakIdx, $girlRasiIdx, $boyLordKey, $girlLordKey);
        foreach ($poruthamDefs as &$definition) {
            if ($definition['id'] !== 'yoni') { continue; }
            $definition['expEn'] = $definition['lackEn'] = $realResults['yoni']['explanationEn'];
            $definition['expTa'] = $definition['lackTa'] = $realResults['yoni']['explanationTa'];
            $definition['expHi'] = $definition['lackHi'] = $realResults['yoni']['explanationHi'];
        }
        unset($definition);

        // The PHP delivery path retains its traditional weighted point maxima
        // (3+4+3+2+4+5+4+2+5+3 = 35); its denominator is summed from these rows.
        // This intentionally differs from the TypeScript calculator's
        // normalized equal-weight /10 score until a canonical weighting is agreed.
        $totalScore = 0; $maxScore = 0; $anyCrucialFailed = false;
        foreach ($poruthamDefs as &$pd) {
            $r = $realResults[$pd['id']];
            $pd['pts'] = $r['pts'];
            $pd['max'] = $r['max'];
            // Full marks are "Uthamam"; a genuine partial score (for example
            // Yoni 2/4 for a neutral animal pair) is "Mathimam", never
            // "Uthamam" - the old pass/fail flag labelled every >=-half row as
            // excellent and hid the shortfall. A zero row is Porundhadhu.
            $pd['enum'] = $r['pts'] >= $r['max'] ? 'UTTHAMAM' : ($r['pts'] > 0 ? 'MADHYAMAM' : 'PORUNDHADHU');
            $pd['crucial'] = !empty($pd['crucial']) || !empty($r['crucial']);
            if ($pd['crucial'] && !$r['pass']) { $anyCrucialFailed = true; }
            $totalScore += $r['pts'];
            $maxScore += $r['max'];
        }
        unset($pd);
        $scorePercent = $maxScore > 0 ? round(($totalScore / $maxScore) * 100, 1) : 0;

        // --- NOW build $poruthams from the already-updated real $poruthamDefs ---
        $poruthams = [];
        $totalPoruthamsMatched = 0;
        foreach ($poruthamDefs as $pd) {
            // "Matched" counts everything that is not a failed row, exactly like
            // the TypeScript engine's matchedCount (Uthamam + Mathimam).
            if ($pd['enum'] !== 'PORUNDHADHU') { $totalPoruthamsMatched++; }
            $poruthamRow = [
                'name' => $pd['nameEn'],
                'nameTa' => $pd['nameTa'],
                'points' => $pd['pts'],
                'maxPoints' => $pd['max'],
                'status' => $enumToLegacyStatus[$pd['enum']],
                'description' => $pd['expEn'],
                'id' => $pd['id'],
                'nameEn' => $pd['nameEn'],
                'nameHi' => $pd['nameHi'],
                'poruthamKey' => $pd['id'],
                'status2' => $pd['enum'],
                'pointsEarned' => $pd['pts'],
                // A row that did not earn full marks explains the shortfall
                // instead of repeating the benefit the couple does NOT receive.
                'explanationEn' => $pd['enum'] === 'UTTHAMAM' ? $pd['expEn'] : $pd['lackEn'],
                'explanationTa' => $pd['enum'] === 'UTTHAMAM' ? $pd['expTa'] : $pd['lackTa'],
                'explanationHi' => $pd['enum'] === 'UTTHAMAM' ? $pd['expHi'] : $pd['lackHi'],
                'isCrucial' => $pd['crucial']
            ];
            if ($pd['id'] === 'yoni') {
                foreach ([
                    'yoniRelationship', 'yoniRelationshipEn', 'yoniRelationshipTa', 'yoniRelationshipHi',
                    'yoniBrideAnimalEn', 'yoniBrideAnimalTa', 'yoniBrideAnimalHi',
                    'yoniGroomAnimalEn', 'yoniGroomAnimalTa', 'yoniGroomAnimalHi'
                ] as $field) {
                    $poruthamRow[$field] = $realResults['yoni'][$field] ?? null;
                }
            }
            $poruthams[] = $poruthamRow;
        }
        foreach ($poruthams as &$p) {
            $p['statusLabel'] = $p['status'];
            $p['status'] = $p['status2'];
            unset($p['status2']);
        }
        unset($p);

        // Sevvay / Kuja Dosha for both parties, with the classical exceptions
        // (own/exalted Mars, Leo/Aquarius, house-sign Vilakku, Guru-Mangala and
        // Chandra-Mangala yoga, Guru Drishti) already applied by evaluateKujaDosha().
        $groomKuja = is_array($boyH['kujaDosha'] ?? null) ? $boyH['kujaDosha'] : ['status' => 'NOT_ASSESSED', 'isPresent' => null, 'marsBhava' => null];
        $brideKuja = is_array($girlH['kujaDosha'] ?? null) ? $girlH['kujaDosha'] : ['status' => 'NOT_ASSESSED', 'isPresent' => null, 'marsBhava' => null];
        $groomMarsHouse = $groomKuja['marsBhava'];
        $brideMarsHouse = $brideKuja['marsBhava'];
        $groomHasDosha = $groomKuja['isPresent']; // effective dosha: DOSHA_PRESENT or DOSHA_MILD
        $brideHasDosha = $brideKuja['isPresent'];
        $doshaLevel = static function (array $kuja): ?int {
            switch ($kuja['status'] ?? 'NOT_ASSESSED') {
                case 'DOSHA_PRESENT': return 2;
                case 'DOSHA_MILD': return 1;
                case 'DOSHA_NONE':
                case 'DOSHA_CANCELLED': return 0;
                default: return null;
            }
        };
        $groomLevel = $doshaLevel($groomKuja);
        $brideLevel = $doshaLevel($brideKuja);
        // BALANCED: neither has an active dosha, or both do (Dosha Samyam).
        // MINOR_IMBALANCE: one side has only a mild dosha. IMBALANCE: one side
        // carries a full dosha the other does not share.
        if ($groomLevel === null || $brideLevel === null) {
            $samyamStatus = null;
        } elseif (($groomLevel === 0 && $brideLevel === 0) || ($groomLevel > 0 && $brideLevel > 0)) {
            $samyamStatus = 'BALANCED';
        } elseif (max($groomLevel, $brideLevel) === 1) {
            $samyamStatus = 'MINOR_IMBALANCE';
        } else {
            $samyamStatus = 'IMBALANCE';
        }
        $doshaSamyam = $samyamStatus === null ? null : $samyamStatus === 'BALANCED';
        $doshaUnavailableEn = 'N/A - Mars house placement unavailable';
        $doshaUnavailableTa = 'செவ்வாய் பாவ நிலை கிடைக்கவில்லை (N/A)';
        $doshaUnavailableHi = 'मंगल का भाव उपलब्ध नहीं है (N/A)';
        $severityText = static function (array $kuja, string $lang, string $unavailable): string {
            if (($kuja['status'] ?? 'NOT_ASSESSED') === 'NOT_ASSESSED') return $unavailable;
            return (string) ($kuja['severity' . $lang] ?? $unavailable);
        };
        $reasonText = static function (array $kuja, string $lang): ?string {
            $status = $kuja['status'] ?? 'NOT_ASSESSED';
            if ($status === 'NOT_ASSESSED' || $status === 'DOSHA_NONE') return null;
            $items = $status === 'DOSHA_CANCELLED' ? ($kuja['exceptions'] ?? []) : ($kuja['mitigations'] ?? []);
            $text = implode(' ', array_column($items, strtolower($lang)));
            return $text !== '' ? $text : null;
        };
        $bothClean = $groomLevel === 0 && $brideLevel === 0;
        $bothDosha = $groomLevel !== null && $brideLevel !== null && $groomLevel > 0 && $brideLevel > 0;
        $mildSideEn = $groomLevel === 1 ? 'the groom' : 'the bride';
        $mildSideTa = $groomLevel === 1 ? 'மாப்பிள்ளைக்கு' : 'பெண்ணிற்கு';
        $mildSideHi = $groomLevel === 1 ? 'वर' : 'वधू';
        $fullSideEn = ($groomLevel ?? 0) === 2 ? 'the groom' : 'the bride';
        $fullSideTa = ($groomLevel ?? 0) === 2 ? 'மாப்பிள்ளைக்கு' : 'பெண்ணிற்கு';
        $fullSideHi = ($groomLevel ?? 0) === 2 ? 'वर' : 'वधू';

        $sevvayDosham = [
            'isBrideHasDosham' => $brideHasDosha,
            'isGroomHasDosham' => $groomHasDosha,
            // NOT_ASSESSED | DOSHA_NONE | DOSHA_CANCELLED | DOSHA_MILD | DOSHA_PRESENT
            'brideDoshaStatus' => $brideKuja['status'],
            'groomDoshaStatus' => $groomKuja['status'],
            'brideMarsHouses' => $brideKuja['houses'] ?? null,
            'groomMarsHouses' => $groomKuja['houses'] ?? null,
            'brideAfflictedFrom' => $brideKuja['afflictedFrom'] ?? [],
            'groomAfflictedFrom' => $groomKuja['afflictedFrom'] ?? [],
            'brideDoshamSeverityEn' => $severityText($brideKuja, 'En', $doshaUnavailableEn),
            'brideDoshamSeverityTa' => $severityText($brideKuja, 'Ta', $doshaUnavailableTa),
            'brideDoshamSeverityHi' => $severityText($brideKuja, 'Hi', $doshaUnavailableHi),
            'groomDoshamSeverityEn' => $severityText($groomKuja, 'En', $doshaUnavailableEn),
            'groomDoshamSeverityTa' => $severityText($groomKuja, 'Ta', $doshaUnavailableTa),
            'groomDoshamSeverityHi' => $severityText($groomKuja, 'Hi', $doshaUnavailableHi),
            'brideCancellationReasonEn' => $reasonText($brideKuja, 'En'),
            'brideCancellationReasonTa' => $reasonText($brideKuja, 'Ta'),
            'brideCancellationReasonHi' => $reasonText($brideKuja, 'Hi'),
            'groomCancellationReasonEn' => $reasonText($groomKuja, 'En'),
            'groomCancellationReasonTa' => $reasonText($groomKuja, 'Ta'),
            'groomCancellationReasonHi' => $reasonText($groomKuja, 'Hi'),
            'brideExplanationEn' => $brideKuja['explanationEn'] ?? null,
            'brideExplanationTa' => $brideKuja['explanationTa'] ?? null,
            'brideExplanationHi' => $brideKuja['explanationHi'] ?? null,
            'groomExplanationEn' => $groomKuja['explanationEn'] ?? null,
            'groomExplanationTa' => $groomKuja['explanationTa'] ?? null,
            'groomExplanationHi' => $groomKuja['explanationHi'] ?? null,
            // BALANCED | MINOR_IMBALANCE | IMBALANCE | null
            'doshaSamyamStatus' => $samyamStatus,
            'isBalanced' => $doshaSamyam,
            'doshaSamyamStatusEn' => $samyamStatus === null ? $doshaUnavailableEn
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha ? 'Balanced (Dosha Samyam - both charts carry Sevvay Dosha)' : 'Balanced (neither chart has an active Sevvay Dosha)')
                    : ($samyamStatus === 'MINOR_IMBALANCE' ? 'Minor imbalance (only a mild dosha on one side)' : 'Not balanced - remedies advised')),
            'doshaSamyamStatusTa' => $samyamStatus === null ? $doshaUnavailableTa
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha ? 'சமன் நிலை (தோஷ சம்யம் - இருவருக்கும் செவ்வாய் தோஷம்)' : 'சமன் நிலை (இருவருக்கும் செயலில் உள்ள செவ்வாய் தோஷம் இல்லை)')
                    : ($samyamStatus === 'MINOR_IMBALANCE' ? 'சிறிய சமனின்மை (ஒரு பக்கத்தில் மிதமான தோஷம் மட்டும்)' : 'சமநிலை இல்லை - பரிகாரங்கள் பரிந்துரைக்கப்படுகின்றன')),
            'doshaSamyamStatusHi' => $samyamStatus === null ? $doshaUnavailableHi
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha ? 'दोष साम्य संतुलित (दोनों कुंडलियों में मंगल दोष)' : 'संतुलित (किसी भी कुंडली में सक्रिय मंगल दोष नहीं)')
                    : ($samyamStatus === 'MINOR_IMBALANCE' ? 'अल्प असंतुलन (एक पक्ष में केवल अल्प दोष)' : 'दोष साम्य नहीं - उपाय आवश्यक')),
            'recommendationEn' => $samyamStatus === null ? $doshaUnavailableEn
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha
                        ? 'Both charts carry Sevvay Dosha, so they neutralise each other (Dosha Samyam); from a Mangal Dosha perspective this match is auspicious.'
                        : ($bothClean && ($groomKuja['status'] === 'DOSHA_CANCELLED' || $brideKuja['status'] === 'DOSHA_CANCELLED')
                            ? 'Mars occupies a dosha house in ' . ($groomKuja['status'] === 'DOSHA_CANCELLED' && $brideKuja['status'] === 'DOSHA_CANCELLED' ? 'both charts' : ($groomKuja['status'] === 'DOSHA_CANCELLED' ? "the groom's chart" : "the bride's chart")) . ', but a classical Dosha Nivrutti rule relieves it. This is an indicator only and does not guarantee any outcome.'
                            : 'From a Mangal Dosha perspective, this match is auspicious.'))
                    : ($samyamStatus === 'MINOR_IMBALANCE'
                        ? "Only a mild Sevvay Dosha is present for {$mildSideEn} (reduced by classical rules). This is not a severe dosha; simple remedies such as Sevvay (Angaraka) worship on Tuesdays are advised for Kuja Dosha alone."
                        : "An active Sevvay Dosha is present for {$fullSideEn} and not for the other partner. Traditional remedies for Mangal Dosha (Angaraka/Subramanya worship, Kuja Shanti) are recommended before proceeding.")),
            'recommendationTa' => $samyamStatus === null ? $doshaUnavailableTa
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha
                        ? 'இரு ஜாதகங்களிலும் செவ்வாய் தோஷம் இருப்பதால் தோஷ சம்யம் ஏற்படுகிறது; செவ்வாய் தோஷ கண்ணோட்டத்தில் இந்தப் பொருத்தம் சுபமானது.'
                        : ($bothClean && ($groomKuja['status'] === 'DOSHA_CANCELLED' || $brideKuja['status'] === 'DOSHA_CANCELLED')
                            ? 'செவ்வாய் தோஷ ஸ்தானத்தில் இருந்தாலும் சாஸ்திர விலக்கால் தோஷ நிவர்த்தி பெறுகிறது. செயலில் உள்ள செவ்வாய் தோஷம் இல்லை; இந்தப் பொருத்தம் சுபமானது.'
                            : 'செவ்வாய் தோஷ கண்ணோட்டத்தில் இந்த பொருத்தம் சுபமானது.'))
                    : ($samyamStatus === 'MINOR_IMBALANCE'
                        ? "{$mildSideTa} மட்டும் மிதமான செவ்வாய் தோஷம் உள்ளது (சாஸ்திர விதிகளால் குறைக்கப்பட்டது). இது கடுமையான தோஷம் அல்ல; செவ்வாய்க்கிழமை அங்காரக வழிபாடு போன்ற எளிய பரிகாரங்கள் போதுமானவை."
                        : "{$fullSideTa} செயலில் உள்ள செவ்வாய் தோஷம் உள்ளது; மற்றவருக்கு இல்லை. தொடர முன் செவ்வாய் தோஷ பரிகாரங்கள் (அங்காரக/சுப்பிரமணிய வழிபாடு, குஜ சாந்தி) பரிந்துரைக்கப்படுகின்றன.")),
            'recommendationHi' => $samyamStatus === null ? $doshaUnavailableHi
                : ($samyamStatus === 'BALANCED'
                    ? ($bothDosha
                        ? 'दोनों कुंडलियों में मंगल दोष होने से दोष साम्य बनता है; मंगल दोष की दृष्टि से यह संबंध शुभ है।'
                        : ($bothClean && ($groomKuja['status'] === 'DOSHA_CANCELLED' || $brideKuja['status'] === 'DOSHA_CANCELLED')
                            ? 'मंगल दोष भाव में होते हुए भी शास्त्रीय अपवाद से दोष निवृत्ति होती है। कोई सक्रिय मंगल दोष नहीं है; यह संबंध शुभ है।'
                            : 'मंगल दोष की दृष्टि से यह संबंध शुभ है।'))
                    : ($samyamStatus === 'MINOR_IMBALANCE'
                        ? "केवल {$mildSideHi} पक्ष में अल्प मंगल दोष है (शास्त्रीय नियमों से न्यून)। यह गंभीर दोष नहीं है; मंगलवार को अंगारक पूजा जैसे सरल उपाय पर्याप्त हैं।"
                        : "{$fullSideHi} पक्ष में सक्रिय मंगल दोष है और दूसरे पक्ष में नहीं है। आगे बढ़ने से पूर्व मंगल दोष के पारंपरिक उपाय (अंगारक/सुब्रह्मण्य पूजा, कुज शांति) करने की सलाह दी जाती है।"))
        ];

        // Canonical verdict rule shared 1:1 with src/lib/astrology/matchmaking.ts:
        // unitPoints counts 1.0 for UTTHAMAM, 0.5 for MADHYAMAM, 0.0 for PORUNDHADHU;
        // UTTHAMAM requires unitPoints >= 7.0, clear Rajju + Vedha, AND balanced Kuja Dosha.
        $unitPoints = 0.0;
        foreach ($poruthamDefs as $pdUnit) {
            $unitPoints += $pdUnit['enum'] === 'UTTHAMAM' ? 1.0 : ($pdUnit['enum'] === 'MADHYAMAM' ? 0.5 : 0.0);
        }
        $rajjuOk = (bool) ($realResults['rajju']['pass'] ?? false);
        $vedhaOk = (bool) ($realResults['vedha']['pass'] ?? false);
        $criticalPoruthamsOk = $rajjuOk && $vedhaOk;
        $kujaBalanced = ($doshaSamyam === true);
        $verdictStatus = ($unitPoints >= 7.0 && $criticalPoruthamsOk && $kujaBalanced)
            ? 'UTTHAMAM'
            : (($unitPoints >= 5.0 && $criticalPoruthamsOk) ? 'MADHYAMAM' : 'PORUNDHADHU');
        $failedEn = implode(' and ', array_filter([$rajjuOk ? null : 'Rajju', $vedhaOk ? null : 'Vedha']));
        $failedTa = implode(' மற்றும் ', array_filter([$rajjuOk ? null : 'ரஜ்ஜு', $vedhaOk ? null : 'வேதை']));
        $failedHi = implode(' और ', array_filter([$rajjuOk ? null : 'रज्जु', $vedhaOk ? null : 'वेध']));
        $verdictLabel = !$criticalPoruthamsOk ? "Not Compatible - {$failedEn} mismatch" : ($verdictStatus === 'UTTHAMAM' ? 'Very Good' : ($verdictStatus === 'MADHYAMAM' ? 'Good (Acceptable with Remedies)' : 'Not Compatible'));

        // Kuja remedies concern Kuja alone; they do not remove a failed
        // Rajju/Vedha check or amount to approval of the overall marriage.
        // The failed hard stop itself is stated ONCE, by the overall verdict
        // below: the Kuja box printed that same Rajju/Vedha sentence on top of
        // the score-banner verdict and the final verdict banner, so one failure
        // was repeated three times on the same page.
        $sevvayDosham['recommendationEn'] .= ' This guidance concerns Kuja Dosha alone, not the overall marriage recommendation.';
        $sevvayDosham['recommendationTa'] .= ' இது செவ்வாய் தோஷம் குறித்த வழிகாட்டல் மட்டுமே; முழுத் திருமணப் பொருத்தத்தின் பரிந்துரை அல்ல.';
        $sevvayDosham['recommendationHi'] .= ' यह केवल मंगल दोष का मार्गदर्शन है, समग्र विवाह अनुशंसा नहीं है।';

        if ($anyCrucialFailed) {
            $overallVerdictEn = "Not Compatible - {$failedEn} mismatch. Requires detailed astrological assessment.";
            $overallVerdictTa = "பொருத்தம் இல்லை - {$failedTa} பொருத்தமின்மை உள்ளது. விரிவான ஜாதக ஆய்வின்றி திருமணம் பரிந்துரைக்கப்படவில்லை.";
            $overallVerdictHi = "मेल नहीं - {$failedHi} की बाधा है। विस्तृत ज्योतिषीय समीक्षा के बिना विवाह अनुशंसित नहीं है।";
        } elseif ($verdictStatus === 'UTTHAMAM') {
            $overallVerdictEn = 'Very Good - Highly favourable match for marriage';
            $overallVerdictTa = 'மிக நன்று - திருமணத்திற்கு மிகவும் ஏற்ற நல்ல பொருத்தம்';
            $overallVerdictHi = 'बहुत अच्छा - विवाह के लिए अत्यंत अनुकूल मिलान।';
        } elseif ($verdictStatus === 'MADHYAMAM') {
            $overallVerdictEn = 'Good - Acceptable with Remedies';
            $overallVerdictTa = 'நன்று - பரிகாரங்களுடன் ஏற்றுக்கொள்ளத்தக்க பொருத்தம்';
            $overallVerdictHi = 'अच्छा - उपायों के साथ विवाह उपयुक्त है।';
        } else {
            $overallVerdictEn = 'Not Compatible - Does not meet recommended compatibility';
            $overallVerdictTa = 'பொருத்தம் இல்லை - திருமணத்திற்கு பரிந்துரைக்கப்படவில்லை';
            $overallVerdictHi = 'मेल नहीं - पर्याप्त पोरुथम के अभाव में यह विवाह अनुशंसित नहीं है।';
        }

        $formatBirthPlaceLabel = static function ($place, $country): string {
            $place = trim((string) $place);
            $country = trim((string) $country);
            if ($place === '') {
                return $country;
            }
            if ($country === '') {
                return $place;
            }
            $parts = array_map('trim', explode(',', $place));
            $tail = $parts ? (string) end($parts) : '';
            return stripos($tail, $country) === false ? $place . ', ' . $country : $place;
        };
        $brideBirthPlaceLabel = $formatBirthPlaceLabel($girlH['birthPlace'] ?? '', $girlH['country'] ?? '');
        $groomBirthPlaceLabel = $formatBirthPlaceLabel($boyH['birthPlace'] ?? '', $boyH['country'] ?? '');

        return [
            'groom' => $boyH,
            'bride' => $girlH,
            'nodeType' => $boyH['nodeType'] ?? self::nodeType(),
            'poruthams' => $poruthams,
            'score' => $totalScore,
            'maxScore' => $maxScore,
            'percentage' => $scorePercent,
            'verdict' => $verdictLabel,
            'doshaSummary' => $sevvayDosham['recommendationEn'],

            'brideName' => $girlH['devoteeName'],
            'brideDob' => $girlH['dob'],
            'brideTob' => $girlH['tob'],
            'bridePlace' => $brideBirthPlaceLabel,
            'brideRasi' => $girlH['chandraRasi'],
            'brideRasiNameEn' => $girlH['rasi']['name'],
            'brideRasiNameTa' => $girlH['rasi']['nameTa'],
            'brideRasiNameHi' => $girlH['rasi']['nameHi'],
            'brideNakshatraNameEn' => $girlH['janmaNakshatraEn'],
            'brideNakshatraNameTa' => $girlH['janmaNakshatraTa'],
            'brideNakshatraNameHi' => $girlH['janmaNakshatraHi'],
            'bridePada' => $girlH['janmaPada'],
            'brideLagnaNameEn' => $girlH['lagna']['rasi'],
            'brideLagnaNameTa' => $girlH['lagna']['rasiTa'],
            'brideLagnaNameHi' => $girlH['lagna']['rasiHi'],
            'brideMarsHouse' => $brideMarsHouse,

            'groomName' => $boyH['devoteeName'],
            'groomDob' => $boyH['dob'],
            'groomTob' => $boyH['tob'],
            'groomPlace' => $groomBirthPlaceLabel,
            'groomRasi' => $boyH['chandraRasi'],
            'groomRasiNameEn' => $boyH['rasi']['name'],
            'groomRasiNameTa' => $boyH['rasi']['nameTa'],
            'groomRasiNameHi' => $boyH['rasi']['nameHi'],
            'groomNakshatraNameEn' => $boyH['janmaNakshatraEn'],
            'groomNakshatraNameTa' => $boyH['janmaNakshatraTa'],
            'groomNakshatraNameHi' => $boyH['janmaNakshatraHi'],
            'groomPada' => $boyH['janmaPada'],
            'groomLagnaNameEn' => $boyH['lagna']['rasi'],
            'groomLagnaNameTa' => $boyH['lagna']['rasiTa'],
            'groomLagnaNameHi' => $boyH['lagna']['rasiHi'],
            'groomMarsHouse' => $groomMarsHouse,

            'totalPoruthamsMatched' => $totalPoruthamsMatched,
            'overallVerdictEn' => $overallVerdictEn,
            'overallVerdictTa' => $overallVerdictTa,
            'overallVerdictHi' => $overallVerdictHi,
            'verdictStatus' => $verdictStatus,
            'rajjuMatch' => $rajjuOk,
            'vedhaMatch' => $vedhaOk,
            'sevvayDosham' => $sevvayDosham,

            'generatedAt' => date('Y-m-d H:i:s'),
            'generatedAtTimeZoneId' => date_default_timezone_get(),
            'certifiedBy' => 'ASTRO SIVAM Marriage Compatibility Board'
        ];
    }
    
    
    
}
