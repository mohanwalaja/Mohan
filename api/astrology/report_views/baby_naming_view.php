<?php
/**
 * ASTRO SIVAM — Namakaran Baby Naming HTML Builder
 */

trait AstroReportBabyNamingTrait
{
    // =====================================================================
    // BABY NAMING - 2 PAGE HTML
    // =====================================================================
    /**
     * Normalize cached page-2 entries and attach all three meaning variants.
     *
     * The English meaning is the source value and is always re-localized from
     * the curated glossary, so an order whose cached Tamil/Hindi text was
     * written by an older (word-by-word) localizer prints the corrected text
     * without a database migration. A cached localized meaning is only kept
     * when the entry carries no English meaning at all.
     */
    private static function localizeNamakaranColumns($columns): array {
        $columns = is_array($columns) ? $columns : [];
        foreach ($columns as &$column) {
            if (!is_array($column)) { continue; }
            foreach (['south', 'north'] as $side) {
                $entries = is_array($column[$side] ?? null) ? $column[$side] : [];
                foreach ($entries as &$entry) {
                    if (!is_array($entry)) { continue; }
                    $english = trim((string) ($entry['meaningEn'] ?? $entry['meaning'] ?? ''));
                    $entry['meaning'] = $entry['meaning'] ?? $english;
                    $entry['meaningEn'] = $english;
                    if ($english === '') {
                        continue;
                    }
                    if (class_exists('AstroEngine')) {
                        $entry['meaningTa'] = AstroEngine::localizeNamakaranMeaning($english, 'ta');
                        $entry['meaningHi'] = AstroEngine::localizeNamakaranMeaning($english, 'hi');
                    } else {
                        $entry['meaningTa'] = $english;
                        $entry['meaningHi'] = $english;
                    }
                }
                $column[$side] = $entries;
            }
        }
        unset($column, $entry);
        return $columns;
    }

    public static function generateBabyNamingHtml($order, $result): string {
        $lang = astro_report_normalize_language($order['language'] ?? 'en');
        $isTa = ($lang === 'ta');
        $isHi = ($lang === 'hi');

        // A stored report created before the 108-pada fix must never be
        // rendered with Ashwini's Chu/Che/Cho/La fallback. Recalculate it
        // from the original birth details before generating a preview.
        // (This HTML is preview/parity only: no PDF is rendered from it.)
        if (class_exists('AstroEngine') && !AstroEngine::isCurrentBabyNamingResult($result)) {
            $input = $order['input_payload'] ?? [];
            if (!is_array($input)) {
                $input = json_decode((string) $input, true) ?: [];
            }
            if (!empty($input)) {
                $result = AstroEngine::calculateBabyNaming($input);
            }
        }

        $orderNumber = $order['order_number'] ?? $order['orderNumber'] ?? 'ORD-BABY';
        $genderCode = strtoupper((string) ($result['gender'] ?? 'M')) === 'F' ? 'F' : 'M';
        $gender = self::e($genderCode === 'M' ? ($isTa ? 'ஆண் குழந்தை' : ($isHi ? 'बालक' : 'Baby Boy')) : ($isTa ? 'பெண் குழந்தை' : ($isHi ? 'बालिका' : 'Baby Girl')));
        $babyName = self::e($result['babyName'] ?? ($genderCode === 'M' ? 'Baby Boy' : 'Baby Girl'));

        $nakshatraLetters = is_array($result['nakshatraLetters'] ?? null) ? $result['nakshatraLetters'] : [];
        $rajjuTable = json_decode(file_get_contents(dirname(__DIR__) . '/rajju.json'), true, 512, JSON_THROW_ON_ERROR);
        $starIndex = intval($nakshatraLetters['nakshatraIndex'] ?? 0);
        if ($starIndex < 1 || $starIndex > 27) throw new RuntimeException('Invalid naming Nakshatra');
        $rajjuGroup = $rajjuTable['groups'][$starIndex - 1];
        foreach (['En' => 'en', 'Ta' => 'ta', 'Hi' => 'hi'] as $suffix => $language) {
            $nakshatraLetters['rajju' . $suffix] = $rajjuTable[$language][$rajjuGroup];
        }
        $padas = is_array($nakshatraLetters['padas'] ?? null) ? $nakshatraLetters['padas'] : [];
        $verifiedPadas = [];
        foreach ($padas as $padaInfo) {
            if (!is_array($padaInfo)) { continue; }
            $padaRaw = $padaInfo['padaNumber'] ?? null;
            if (!is_numeric($padaRaw) || (float) $padaRaw !== (float) (int) $padaRaw) { continue; }
            $padaNumber = (int) $padaRaw;
            if ($padaNumber >= 1 && $padaNumber <= 4 && !empty($padaInfo['letterEn'])) {
                $verifiedPadas[$padaNumber] = $padaInfo;
            }
        }
        ksort($verifiedPadas);
        if (array_keys($verifiedPadas) !== [1, 2, 3, 4]) {
            throw new RuntimeException('Cannot render Baby Naming report without all four verified birth-star padas.');
        }
        $padas = array_values($verifiedPadas);
        $birthPadaRaw = $result['janmaPada'] ?? $nakshatraLetters['pada'] ?? null;
        if (!is_numeric($birthPadaRaw) || (float) $birthPadaRaw !== (float) (int) $birthPadaRaw || (int) $birthPadaRaw < 1 || (int) $birthPadaRaw > 4) {
            throw new RuntimeException('Cannot render Baby Naming report without a verified birth pada.');
        }
        $birthPada = (int) $birthPadaRaw;
        $primaryPada = null;
        foreach ($padas as $padaInfo) {
            if ((int) $padaInfo['padaNumber'] === $birthPada) {
                $primaryPada = $padaInfo;
                break;
            }
        }
        if (!is_array($primaryPada) || empty($primaryPada['letterEn'])) {
            throw new RuntimeException('Cannot render Baby Naming report without the birth-pada syllable.');
        }
        $savedChandraRasi = self::validRasiNumber($result['chandraRasi'] ?? null);
        $padaChandraRasi = self::validRasiNumber($primaryPada['rasi'] ?? null);
        $resolvedChandraRasi = $savedChandraRasi !== null && $padaChandraRasi !== null && $savedChandraRasi !== $padaChandraRasi
            ? null
            : ($savedChandraRasi ?? $padaChandraRasi);
        $rasi = self::e(self::rasiNameForNumber($resolvedChandraRasi, $lang));
        $nak = self::e($isTa ? ($nakshatraLetters['nakshatraNameTa'] ?? $result['janmaNakshatraTa'] ?? 'N/A') : ($isHi ? ($nakshatraLetters['nakshatraNameHi'] ?? 'N/A') : ($nakshatraLetters['nakshatraNameEn'] ?? $result['janmaNakshatraEn'] ?? 'N/A')));
        $pada = self::e($birthPada);
        $dob = self::e(self::birthDate($result['dob'] ?? '', 'N/A'));
        $tob = self::e($result['tob'] ?? 'N/A');
        $birthPlaceRaw = trim((string) ($result['birthPlace'] ?? 'N/A'));
        $countryRaw = trim((string) ($result['country'] ?? ''));
        $birthPlace = self::e($countryRaw && stripos($birthPlaceRaw, $countryRaw) === false ? $birthPlaceRaw . ', ' . $countryRaw : $birthPlaceRaw);

        $lagna = self::e(self::rasiNameForNumber($result['lagnaRasi'] ?? null, $lang));
        $lord = self::e($isTa ? ($nakshatraLetters['lordTa'] ?? 'N/A') : ($isHi ? ($nakshatraLetters['lordHi'] ?? 'N/A') : ($nakshatraLetters['lordEn'] ?? 'N/A')));
        $gana = self::e($isTa ? ($nakshatraLetters['ganaTa'] ?? 'N/A') : ($isHi ? ($nakshatraLetters['ganaHi'] ?? 'N/A') : ($nakshatraLetters['ganaEn'] ?? 'N/A')));
        $yoni = self::e($isTa ? ($nakshatraLetters['yoniTa'] ?? 'N/A') : ($isHi ? ($nakshatraLetters['yoniHi'] ?? 'N/A') : ($nakshatraLetters['yoniEn'] ?? 'N/A')));
        $rajju = self::e($isTa ? ($nakshatraLetters['rajjuTa'] ?? 'N/A') : ($isHi ? ($nakshatraLetters['rajjuHi'] ?? 'N/A') : ($nakshatraLetters['rajjuEn'] ?? 'N/A')));

        $syllableList = is_array($result['suggestedSyllables'] ?? null)
            ? $result['suggestedSyllables']
            : (is_array($result['startingSyllables'] ?? null) ? $result['startingSyllables'] : array_map(function ($p) { return $p['letterEn'] ?? ''; }, $padas));
        $syllableList = array_values(array_filter($syllableList, function ($sound) { return trim((string) $sound) !== ''; }));
        $syllables = self::e(implode(', ', $syllableList));
        $primarySyllable = self::e($isTa ? ($primaryPada['letterTa'] ?? '') : ($isHi ? ($primaryPada['letterHi'] ?? '') : ($primaryPada['letterEn'] ?? '')));
        $primaryTransliteration = self::e($primaryPada['letterEn'] ?? '');

        $padaRows = '';
        foreach ($padas as $padaInfo) {
            $isBirthPada = intval($padaInfo['padaNumber'] ?? 0) === $birthPada;
            $sound = $isTa ? ($padaInfo['letterTa'] ?? '') : ($isHi ? ($padaInfo['letterHi'] ?? '') : ($padaInfo['letterEn'] ?? ''));
            $rasiForPada = self::rasiNameForNumber((($starIndex - 1) * 4 + intval($padaInfo['padaNumber']) - 1) % 12 + 1, $lang);
            $padaLabel = ($isTa ? 'பாதம் ' : ($isHi ? 'पाद ' : 'Pada ')) . intval($padaInfo['padaNumber'] ?? 0);
            $badge = $isBirthPada
                ? ' <span class="mini-badge">' . ($isTa ? 'ஜன்ம பாதம்' : ($isHi ? 'जन्म पाद' : 'JANMA PADA')) . '</span>'
                : '';
            $rowStyle = $isBirthPada ? ' class="birth-row"' : '';
            $padaRows .= '<tr' . $rowStyle . '><td><b>' . self::e($padaLabel) . '</b>' . $badge . '</td><td><b>' . self::e($sound) . '</b> <span class="translit">(' . self::e($padaInfo['letterEn'] ?? '') . ')</span></td><td>' . self::e($rasiForPada) . '</td></tr>';
        }
        if ($padaRows === '') {
            $padaRows = '<tr><td colspan="3">' . ($isTa ? 'இந்த பதிவுக்கு பாத அக்ஷரங்கள் இல்லை.' : ($isHi ? 'इस रिकॉर्ड हेतु पाद अक्षर उपलब्ध नहीं हैं।' : 'No pada syllables are available for this record.')) . '</td></tr>';
        }

        $nameRows = '';
        $idx = 1;
        foreach (($result['suggestedNames'] ?? []) as $n) {
            $nName = $isTa ? ($n['nameTa'] ?? $n['nameEn'] ?? '') : ($isHi ? ($n['nameHi'] ?? $n['nameEn'] ?? '') : ($n['nameEn'] ?? ''));
            $nMeaning = $isTa ? ($n['meaningTa'] ?? $n['meaningEn'] ?? '') : ($isHi ? ($n['meaningHi'] ?? $n['meaningEn'] ?? '') : ($n['meaningEn'] ?? ''));
            $nameRows .= '<tr><td class="name-cell">' . self::e($nName) . '</td><td class="sound-cell">' . self::e($n['startingLetter'] ?? '') . '</td><td>' . self::e($nMeaning) . '</td></tr>';
            $idx++;
        }
        $namesSection = $nameRows === '' ? '' : '<div class="sec-head"><span class="sec-no">06</span>' . ($isTa ? 'பரிந்துரைக்கப்பட்ட பெயர்கள்' : ($isHi ? 'सुझावित नाम' : 'SUGGESTED SACRED NAMES')) . '</div><table class="data-table names-table"><thead><tr><th width="30%">' . ($isTa ? 'பரிந்துரை பெயர்' : ($isHi ? 'सुझावित नाम' : 'SUGGESTED NAME')) . '</th><th width="22%">' . ($isTa ? 'ஒலி' : ($isHi ? 'ध्वनि' : 'SOUND')) . '</th><th>' . ($isTa ? 'பொருள்' : ($isHi ? 'अर्थ' : 'MEANING')) . '</th></tr></thead><tbody>' . $nameRows . '</tbody></table>';

        // ── Localized labels ──
        $invocation = $isTa ? '|| ஓம் விநாயகாய நமஃ ||' : ($isHi ? '|| ॐ श्री गणेशाय नमः ||' : '|| Om Sri Ganeshaya Namah ||');
        $brandTagline = $isTa ? 'வேத ஜோதிடம் • பஞ்சாங்கம் • நாமகரண சேவைகள்' : ($isHi ? 'वैदिक ज्योतिष • पंचांग • नामकरण सेवाएं' : 'VEDIC ASTROLOGY &bull; PANCHANGAM &bull; NAMAKARAN SERVICES');
        $docTitle = $isTa ? 'வேத நாமகரண அறிக்கை' : ($isHi ? 'वैदिक नामकरण रिपोर्ट' : 'Vedic Namakaran Report');
        $docSubtitle = $isTa ? 'குழந்தை பெயர் சூட்டு சான்றிதழ் — ஜன்ம நட்சத்திரம் & சுப அக்ஷரங்கள்' : ($isHi ? 'शिशु नामकरण प्रमाणपत्र — जन्म नक्षत्र एवं शुभ अक्षर' : 'Certified Baby Naming Dossier &mdash; Janma Nakshatra &amp; Auspicious Syllables');
        $lblReportNo = $isTa ? 'அறிக்கை எண்' : ($isHi ? 'रिपोर्ट सं.' : 'REPORT NO');
        $lblIssueDate = $isTa ? 'வழங்கிய தேதி' : ($isHi ? 'जारी तिथि' : 'ISSUE DATE');
        $lblLanguage = $isTa ? 'மொழி' : ($isHi ? 'भाषा' : 'LANGUAGE');
        $langName = $isTa ? 'தமிழ்' : ($isHi ? 'हिन्दी' : 'English');
        $sec1 = $isTa ? 'குழந்தை விபரம்' : ($isHi ? 'शिशु का विवरण' : 'BABY PARTICULARS');
        $sec2 = $isTa ? 'ஜோதிட கணிப்புகள்' : ($isHi ? 'ज्योतिषीय गणना' : 'ASTROLOGICAL COORDINATES');
        $sec3 = $isTa ? 'சுப நாமகரண அக்ஷரம்' : ($isHi ? 'शुभ नामकरण अक्षर' : 'PRIMARY NAMING SYLLABLE');
        $sec4 = $isTa ? 'நட்சத்திர பாத அக்ஷரங்கள்' : ($isHi ? 'नक्षत्र पाद अक्षर' : 'NAKSHATRA PADA SYLLABLES');
        // The whole point of the naming report, said out loud: WHY the first
        // sound is fixed to the birth star's pada.
        $whySoundTitle = $isTa ? 'ஏன் முதல் ஒலி முக்கியம்' : ($isHi ? 'पहली ध्वनि क्यों महत्वपूर्ण है' : 'WHY THE FIRST SOUND MATTERS');
        $whySoundText = $isTa
            ? 'பெயர் ஒலியை மட்டும் வைத்துத் தேர்ந்தெடுப்பதல்ல — மரபு குழந்தையின் பிறந்த நட்சத்திரம் மற்றும் பாதத்திலிருந்து முதல் ஒலியை நிர்ணயிக்கிறது; அதனால் பெயர் குழந்தையின் நட்சத்திரம் தொடங்கும் இடத்திலிருந்தே தொடங்குகிறது. மேலே உள்ள நான்கு ஒலிகளில் ஒன்றில் தொடங்கும் எந்தப் பெயரையும் குடும்பம் தேர்ந்தெடுக்கலாம். இந்த அறிக்கையின் அனைத்துப் பெயர் பட்டியலும் அந்த ஒலிகளில் தொடங்குவதற்குக் காரணம் இதுவே: பொருள் உங்கள் தேர்வு, முதல் ஒலி ஆசி.'
            : ($isHi
                ? 'नाम केवल सुनने में अच्छा लगने से नहीं चुना जाता है — परंपरा पहली ध्वनि शिशु के जन्म नक्षत्र और पाद से तय करती है, इसलिए नाम वहीं से शुरू होता है जहाँ शिशु का नक्षत्र शुरू होता है। परिवार ऊपर दी गई चार ध्वनियों में से किसी एक से शुरू होने वाला कोई भी नाम चुन सकता है। इस रिपोर्ट की हर नाम-सूची इन्हीं ध्वनियों से शुरू होती है: अर्थ आपकी पसंद है, पहली ध्वनि आशीर्वाद है।'
                : 'A name is not chosen by sound alone - tradition fixes the FIRST sound from the birth star and pada, so the name begins where the child\'s star begins. The family then picks any name that starts with one of the four syllables printed above. That is why every name list in this report starts with those sounds: the meaning is your choice, the first sound is the blessing.');
        $sec5 = $isTa ? 'வேத குணநலன்கள்' : ($isHi ? 'वैदिक गुण' : 'VEDIC GUNAM & VIRTUES');

        $lblBabyName = $isTa ? 'குழந்தையின் பெயர்' : ($isHi ? 'शिशु का नाम' : 'BABY NAME');
        $lblGender = $isTa ? 'பாலினம்' : ($isHi ? 'लिंग' : 'GENDER');
        $lblDob = $isTa ? 'பிறந்த தேதி' : ($isHi ? 'जन्म तिथि' : 'DATE OF BIRTH');
        $lblTob = $isTa ? 'பிறந்த நேரம்' : ($isHi ? 'जन्म समय' : 'TIME OF BIRTH');
        $lblPlace = $isTa ? 'பிறந்த இடம்' : ($isHi ? 'जन्म स्थान' : 'PLACE OF BIRTH');
        $lblLagna = $isTa ? 'லக்னம்' : ($isHi ? 'लग्न' : 'LAGNAM (ASCENDANT)');
        $lblNak = $isTa ? 'ஜன்ம நட்சத்திரம்' : ($isHi ? 'जन्म नक्षत्र' : 'JANMA NAKSHATRA');
        $lblPada = $isTa ? 'பாதம்' : ($isHi ? 'पाद / चरण' : 'JANMA PADA');
        // Same fix as the Jathagam particulars: "Pada 2" is an English fragment
        // inside a Tamil/Hindi Namakaran report.
        $padaValue = ($pada === '' || $pada === 'N/A')
            ? 'N/A'
            : ($isTa ? "{$pada}-ஆம் பாதம்" : ($isHi ? "पाद {$pada}" : "Pada {$pada}"));
        $lblRasi = $isTa ? 'சந்திர ராசி' : ($isHi ? 'चंद्र राशि' : 'CHANDRA RASI (MOON)');
        $lblLord = $isTa ? 'நட்சத்திர அதிபதி' : ($isHi ? 'नक्षत्र स्वामी' : 'NAKSHATRA LORD');
        $lblGana = $isTa ? 'கணம்' : ($isHi ? 'गण' : 'GANA');
        $lblYoni = $isTa ? 'யோனி' : ($isHi ? 'योनि' : 'YONI');
        $lblRajju = $isTa ? 'ரஜ்ஜு' : ($isHi ? 'रज्जु' : 'RAJJU');

        $heroTitle = $isTa ? 'ஜன்ம பாதத்தின் முதன்மை சுப ஒலி' : ($isHi ? 'जन्म पाद का प्रमुख शुभ ध्वनि' : 'PRIMARY AUSPICIOUS SOUND FOR THE JANMA PADA');
        $heroDesc = $isTa
            ? "வேத வானியல் கணிதப்படி, {$nak} நட்சத்திரம் {$pada}-ம் பாதத்தில் பிறந்த குழந்தைக்கு இந்த ஒலியில் தொடங்கும் பெயர்கள் சிறப்பு."
            : ($isHi
                ? "वैदिक गणना के अनुसार, {$nak} नक्षत्र के {$pada} चरण में जन्मे शिशु हेतु इस ध्वनि से आरंभ नाम शुभ एवं अनुकूल हैं।"
                : "Names beginning with this sound are recommended for a baby born in {$nak} Nakshatra, Pada {$pada}.");
        $thPada = $isTa ? 'பாதம்' : ($isHi ? 'पाद' : 'PADA (QUARTER)');
        $thSound = $isTa ? 'சுப ஆரம்ப ஒலி' : ($isHi ? 'शुभ प्रारंभिक ध्वनि' : 'AUSPICIOUS STARTING SOUND');
        $thRasi = $isTa ? 'தொடர்புடைய ராசி' : ($isHi ? 'संबंधित राशि' : 'CORRESPONDING RASI');

        $certText = $isTa
            ? "இவ்வறிக்கை {$babyName} குழந்தையின் ஜன்ம நட்சத்திரம், சுப அக்ஷரங்கள் லஹிரி அயனாம்ச முறைப்படி கணிக்கப்பட்டதை உறுதிப்படுத்துகிறது. வழங்கப்பட்ட பெயர் அடையாளத்திற்காக மட்டுமே; அது பிறந்த பாத ஒலிக்குப் பொருந்துவதாகச் சான்றளிக்கப்படவில்லை."
            : ($isHi
                ? "यह रिपोर्ट {$babyName} के जन्म नक्षत्र और शुभ नामाक्षरों की गणना को प्रमाणित करती है। दिया गया नाम केवल पहचान के लिए है; जन्म-पाद की ध्वनि से उसका मेल प्रमाणित नहीं है।"
                : "This report certifies the computed Janma Nakshatra and naming syllables for {$babyName}. The supplied name is for identification only, not a certified birth-pada name match.");
        $signRole = $isTa ? 'அங்கீகரிக்கப்பட்ட ஜோதிடர்' : ($isHi ? 'अधिकृत ज्योतिषी' : 'AUTHORIZED ASTROLOGER');
        $footerLabel = $isTa ? 'அதிகாரப்பூர்வ வேத நாமகரண அறிக்கை' : ($isHi ? 'आधिकारिक वैदिक नामकरण रिपोर्ट' : 'Official Vedic Namakaran Report');
        // prepared-date stamp: first page only, on the LEFT of the footer bar
        // — never centred with the brand line (owner request, Oct 2026).
        $preparedLabel = self::preparedDateStamp($result, $lang);
        $bnPreparedSpan = $preparedLabel !== '' ? '<span class="bn-prepared">' . self::e($preparedLabel) . '</span>' : '';

        $virtue1 = $isTa ? 'பிரகாசமான உயிர்த்திருவும் அறிவும் — கூர்மையான பார்வை, உயர்ந்த மன சுறுசுறுப்பு.' : ($isHi ? 'तेजस्वी ओज एवं बुद्धि — तीक्ष्ण बुद्धि, सूक्ष्म दृष्टि एवं उत्तम स्वभाव का विकास होता है।' : 'Radiant Vitality &amp; Intellect — keen observational clarity, mental agility and noble presence.');
        $virtue2 = $isTa ? 'கருணை & தர்ம நெறி — உண்மை, ஈகை, வலிய அற உணர்வு.' : ($isHi ? 'करुणा एवं धर्म — सत्यनिष्ठा, उदारता एवं नैतिक बल प्राप्त होता है।' : 'Compassion &amp; Dharma Alignment — truthfulness, generosity and strong moral grounding.');
        $virtue3 = $isTa ? 'சுப பெய் அதிர்வுகள் — நாமகரண ஒலி நீண்ட ஆயுள், வெற்றி, ஆன்மீக பாதுகாப்பு.' : ($isHi ? 'शुभ नाम-कंपन — नामाक्षर दीर्घायु, सफलता एवं आध्यात्मिक सुरक्षा देते हैं।' : 'Auspicious Name Vibrations — the namakshara sound harmonizes longevity, success and spiritual protection.');
        $virtue4 = $isTa ? 'குடும்ப சுப வளர்ச்சி — ஜன்ம பாத அக்ஷரங்கள் ஆரோக்கியம், பாசம், சுப ஆரம்பங்கள்.' : ($isHi ? 'पारिवारिक मंगल वृद्धि — जन्म पाद अक्षर स्वास्थ्य, स्नेह एवं शुभ आरंभ देते हैं।' : 'Family Blessing &amp; Growth — janma pada syllables support healthy development, affection and auspicious beginnings.');

        $issued = new DateTimeImmutable($result['generatedAt'] ?? 'now');
        $issued = $issued->setTimezone(new DateTimeZone('Asia/Kolkata'));
        $certId = self::e($order['order_number'] ?? $order['orderNumber'] ?? ('ASTRO-NAME-' . $issued->format('Ymd')));
        $issueDate = $issued->format('d M Y, H:i') . ' IST';
        $verifiedLabel = $isTa ? 'கணிப்பு சரிபார்க்கப்பட்டது' : ($isHi ? 'गणना सत्यापित' : 'CALCULATION VERIFIED');
        $rawName = trim($result['babyName'] ?? '');
        preg_match('/^[^aeiou]*[aeiou]/i', $rawName, $firstLatin);
        $firstSound = self::e(preg_match('/[\x{0B80}-\x{0BFF}]/u', $rawName) ? self::firstTamilSound($rawName) : ($firstLatin[0] ?? substr($rawName, 0, 1)));
        $birthSound = self::e($primaryPada['letterEn']);
        $matches = self::nameMatchesPada($rawName, $primaryPada['letterTa']);
        $nameCheck = $isTa ? "பெயரின் முதல் ஒலி ({$firstSound}) ஜன்ம பாத ஒலிக்கு ({$birthSound}) " . ($matches ? 'பொருந்துகிறது' : 'பொருந்தவில்லை')
            : ($isHi ? "नाम की पहली ध्वनि ({$firstSound}) जन्म पाद ({$birthSound}) से " . ($matches ? 'मेल खाती है।' : 'मेल नहीं खाती है।')
            : "Name's first sound ({$firstSound}) " . ($matches ? 'matches' : 'does not match') . " the birth-pada sound ({$birthSound}).");
        $thRasi = $isTa ? 'நவாம்சம்' : ($isHi ? 'नवांश' : 'Navamsa');
        $signRole = $isTa ? 'அங்கீகரிக்கப்பட்டவர்' : ($isHi ? 'अधिकृत हस्ताक्षरकर्ता' : 'Authorised Signatory');


        // ── PAGE 2: South & North Indian name suggestions ─────────────────────
        // Stored results carry `nameSuggestions`; orders saved before page 2
        // existed are completed here so every delivered report has it.
        $suggestionColumns = AstroEngine::getBabyNameSuggestionsByPada($padas, $genderCode);
        // Orders saved before localized meanings were added only have the
        // English `meaning` value. Normalize both fresh and legacy columns
        // before the page-2 HTML is assembled.
        $suggestionColumns = self::localizeNamakaranColumns($suggestionColumns);

        // Reserve a full sheet for the lists, not a compact table at the top.
        // Shared row counts align both styles, even when one list is shorter.
        $totalNameRows = 0;
        foreach ($suggestionColumns as $column) {
            $totalNameRows += max(1, (int) ceil(max(count($column['south'] ?? []), count($column['north'] ?? [])) / 2));
        }
        $nameRowHeight = number_format(186 / max(1, $totalNameRows), 3, '.', '');

        $suggestionNameSize = $totalNameRows > 28 ? 11.5 : ($totalNameRows > 22 ? 12.5 : 14);
        $suggestionMeaningSize = $totalNameRows > 22 ? 8.5 : 9.5;

        // ── Print-safe scoped styles for the redesigned certificate ──
        $babyCss = <<<CSS
    body { background: #ffffff; color: #2d241c; }
    .bn-frame { border: 1.2px solid #b3862e; padding: 5mm 6mm 4mm; background: #fdfaf4; }
    .bn-invocation { text-align: center; font-size: 8.5px; color: #8c6a1e; font-weight: bold; letter-spacing: 1px; margin-bottom: 2mm; }
    .bn-brand { text-align: center; font-size: 19px; color: #7a2129; font-weight: bold; letter-spacing: 2px; line-height: 1.15; }
    .bn-tagline { text-align: center; font-size: 8px; color: #8c6a1e; font-weight: bold; letter-spacing: 0.8px; margin-top: 0.8mm; }
    .bn-orn { border-top: 1px solid #b3862e; margin: 2mm 30mm; }
    .bn-title-band { background: #fdfaf4; border-top: 1px solid #cbbb89; border-bottom: 1px solid #cbbb89; padding: 2.4mm 3mm; text-align: center; margin: 2mm 0 3mm; }
    .bn-doc-title { font-size: 15px; color: #5c1720; font-weight: bold; line-height: 1.2; }
    .bn-doc-sub { font-size: 9px; color: #5c5044; font-weight: bold; margin-top: 0.8mm; }
    .bn-doc-meta { font-size: 7.5px; color: #8a7c6c; font-weight: bold; margin-top: 1.2mm; letter-spacing: 0.3px; }
    .bn-doc-meta b { color: #7a2129; }

    .bn-why { background: #fdfaf4; border: 1px solid #e5d9c5; border-left: 3px solid #b3862e; border-radius: 3px; padding: 2mm 2.6mm; margin: 1.5mm 0 0; page-break-inside: avoid; }
    .bn-why-title { font-size: 9.5px; font-weight: bold; color: #7a2129; letter-spacing: 0.5px; margin-bottom: 1mm; }
    .bn-why-text { font-size: 8.6px; line-height: 1.45; color: #5c5044; text-align: justify; }
    .sec-head { font-size: 9.5px; font-weight: bold; color: #7a2129; letter-spacing: 0.8px; margin: 2.5mm 0 1.5mm; padding-bottom: 0.8mm; border-bottom: 1px solid #e5d9c5; }
    .sec-no { display: inline-block; background: #7a2129; color: #ffffff; font-size: 7.5px; padding: 0.4mm 1.4mm; margin-right: 1.6mm; border-radius: 2px; }

    table.bn-details { width: 100%; border-collapse: collapse; margin-bottom: 2.5mm; }
    table.bn-details td { border: 1px solid #e5d9c5; padding: 1.4mm 2.2mm; vertical-align: top; }
    .bn-lbl { background: #f6efe1; color: #8c6a1e; font-size: 7px; font-weight: bold; letter-spacing: 0.5px; width: 21%; }
    .bn-val { background: #ffffff; color: #2d241c; font-size: 9px; font-weight: bold; width: 29%; }

    .bn-syllable { background: #f7efdd; border: 1px solid #b3862e; padding: 3mm 4mm; margin-bottom: 2.5mm; }
    .bn-hero-kicker { font-size: 7px; color: #8c6a1e; font-weight: bold; letter-spacing: 0.8px; }
    .bn-hero-line { font-size: 15px; color: #5c1720; font-weight: bold; margin-top: 1mm; }
    .bn-hero-alt { font-size: 8.5px; color: #5c5044; font-weight: bold; margin-top: 0.5mm; }
    .bn-hero-desc { font-size: 8.2px; color: #5c5044; margin-top: 1.2mm; line-height: 1.4; }

    table.data-table th { background: #f6efe1; color: #7a2129; border-bottom: 1px solid #cbbb89; font-size: 7.6px; letter-spacing: 0.6px; }
    table.data-table td { padding: 1.4mm 2.2mm; }
    .translit { font-size: 7.5px; color: #8a7c6c; font-weight: bold; }
    .mini-badge { background: #b3862e; color: #ffffff; font-size: 6.2px; padding: 0.3mm 1.4mm; margin-left: 1.2mm; border-radius: 2px; letter-spacing: 0.4px; }
    tr.birth-row td { background: #f7efdd !important; color: #5c1720; font-weight: bold; }
    .name-cell { color: #7a2129; font-weight: bold; }
    .sound-cell { color: #5c5044; font-weight: bold; }

    table.bn-virtues { width: 100%; border-collapse: collapse; margin-bottom: 2.5mm; }
    table.bn-virtues td { border: 1px solid #e5d9c5; padding: 1.5mm 2.2mm; font-size: 8.4px; color: #5c5044; vertical-align: top; width: 50%; background: #fdfaf4; }
    .virtue-no { color: #2e6b4f; font-weight: bold; margin-right: 1.2mm; }

    .bn-cert { font-size: 7.8px; color: #5c5044; line-height: 1.45; margin-top: 1mm; }
    .bn-meta { font-size: 7px; color: #8a7c6c; font-weight: bold; margin-top: 1mm; }
    .bn-meta b { color: #7a2129; }
    table.bn-sign { width: 100%; margin-top: 2mm; }
    .bn-sign-line { border-bottom: 1px solid #8a7c6c; height: 5mm; width: 40mm; }
    .bn-sign-name { font-size: 7.8px; color: #2d241c; font-weight: bold; }
    .bn-sign-role { font-size: 6.8px; color: #8a7c6c; font-weight: bold; letter-spacing: 0.4px; }
    .bn-seal { border: 1.5px dashed #b3862e; border-radius: 50%; width: 17mm; height: 17mm; text-align: center; vertical-align: middle; background: #f7efdd; }
    .bn-seal-title { font-size: 8px; color: #7a2129; font-weight: bold; line-height: 1.1; }
    .bn-seal-sub { font-size: 5.8px; color: #8c6a1e; font-weight: bold; }
    .bn-footer-bar { border-top: 1px solid #b3862e; margin-top: 2mm; padding-top: 1mm; font-size: 7.2px; color: #8a7c6c; text-align: center; position: relative; }
    .bn-footer-bar b { color: #7a2129; letter-spacing: 0.8px; }
    /* First page only: the prepared-date stamp sits on the LEFT edge of the
       footer bar, level with the brand text; the centred line never moves. */
    .bn-footer-bar .bn-prepared { position: absolute; left: 0; top: 1mm; color: #7a2129; font-weight: bold; white-space: nowrap; }
    .bn-doc-hint { font-size: 7.2px; color: #5c5044; margin-top: 1.4mm; line-height: 1.35; }

    /* ── Page 2: South & North Indian name suggestions (table layout) ── */
    .bn-sug-title-band { padding: 1.8mm 3mm; margin: 2mm 0; }
    table.sug-cols { width: 100%; border-collapse: separate; border-spacing: 2.4mm 0; margin-top: 1mm; }
    td.sug-col { width: 50%; vertical-align: top; border: 1px solid #e5d9c5; padding: 1.6mm 1.8mm 2mm; background: #fffdf9; }
    .sug-col-head { font-size: 11px; font-weight: bold; color: #ffffff; padding: 1.1mm 1mm; text-align: center; letter-spacing: 0.3px; margin-bottom: 1.6mm; }
    .sug-col-head.sug-south { background-color: #2e6b4f; }
    .sug-col-head.sug-north { background-color: #7a2129; }
    .sug-block { margin-bottom: 1.5mm; }
    table.sug-head { width: 100%; border-bottom: 0.6px dashed #e5d9c5; margin-bottom: 0.9mm; }
    td.sug-chip { width: 9mm; text-align: center; background-color: #f7efdd; border: 0.6px solid #cbbb89; color: #5c1720; font-size: 14px; font-weight: bold; }
    .sug-sound-cell { font-size: 9.5px; color: #7a2129; font-weight: bold; padding-left: 1.4mm; line-height: 1.1; }
    .sug-rasi { font-size: 8px; color: #8a7c6c; font-weight: bold; }
    td.sug-pada { font-size: 8px; color: #8a7c6c; font-weight: bold; letter-spacing: 0.3px; white-space: nowrap; }
    table.sug-names { width: 100%; border-collapse: collapse; }
    td.sug-cell { width: 50%; font-family: notosans, sans-serif; font-size: 8.5px; color: #2d241c; padding: 0.6mm 1mm; vertical-align: top; line-height: 1.3; }
    .sug-nm { font-size: {$suggestionNameSize}px; font-weight: bold; color: #2d241c; }
    .sug-mn { font-family: notosans, notosanstamil, notosansdevanagari, sans-serif; font-size: {$suggestionMeaningSize}px; color: #8a7c6c; }
    .sug-empty { font-size: 10px; color: #8a7c6c; font-style: italic; }
    .sug-note { font-size: 8.5px; color: #8a7c6c; text-align: center; margin-top: 1.6mm; line-height: 1.3; }
CSS;

        $logoTag = '<img src="' . astro_logo_url() . '" style="width:38px; height:38px; border-radius:50%; margin-left:8mm;" alt="ASTRO SIVAM" />';

        $padaWord = $isTa ? 'பாதம்' : ($isHi ? 'पाद' : 'PADA');
        $southTitle = $isTa ? 'தென்னிந்திய பாணி பெயர்கள்' : ($isHi ? 'दक्षिण भारतीय शैली के नाम' : 'SOUTH INDIAN STYLE NAMES');
        $northTitle = $isTa ? 'வடஇந்திய பாணி பெயர்கள்' : ($isHi ? 'उत्तर भारतीय शैली के नाम' : 'NORTH INDIAN STYLE NAMES');
        $sugDocTitle = $isTa ? 'பெயர் பரிந்துரைகள்' : ($isHi ? 'नाम सुझाव' : 'NAME SUGGESTIONS');
        $sugDocSub = $isTa
            ? 'தென்னிந்திய & வடஇந்திய பாணி — நட்சத்திர பாத ஒலிகளுக்கான பெயர்கள்'
            : ($isHi
                ? 'दक्षिण भारतीय एवं उत्तर भारतीय शैली — नक्षत्र पाद ध्वनियों हेतु नाम'
                : 'South &amp; North Indian Styles &mdash; Names for Every Pada Syllable');
        $southBlocks = '';
        $northBlocks = '';
        foreach ($suggestionColumns as $column) {
            $chip = self::e($column['soundTa'] ?? '');
            $sound = self::e($isTa ? ($column['soundTa'] ?? '') : ($isHi ? ($column['soundHi'] ?? '') : ($column['soundEn'] ?? '')));
            $columnRasi = self::e($isTa
                ? ($column['rasiTa'] ?? '')
                : ($isHi ? ($column['rasiHi'] ?? '') : ($column['rasiEn'] ?? '')));
            $isBirthSection = intval($column['padaNumber'] ?? 0) === $birthPada;
            $padaLabel = ($isBirthSection ? '★ ' : '') . self::e($padaWord . ' ' . intval($column['padaNumber'] ?? 0));
            $rowCount = max(1, (int) ceil(max(count($column['south'] ?? []), count($column['north'] ?? [])) / 2));
            $renderList = function ($names) use ($rowCount, $nameRowHeight, $isTa, $isHi) {
                $cells = is_array($names) ? array_values($names) : [];
                $rows = '';
                for ($i = 0; $i < $rowCount; $i++) {
                    $rows .= '<tr>';
                    for ($col = 0; $col < 2; $col++) {
                        $entry = $cells[$i * 2 + $col] ?? null;
                        $rows .= '<td class="sug-cell" style="height:' . $nameRowHeight . 'mm;">';
                        if ($entry !== null) {
                            $rawName = $entry['name'] ?? '';
                            if ($isTa) {
                                // Hand-written bank spelling; the transliterator is
                                // only a fallback for a legacy stored order.
                                $taName = (string) ($entry['nameTa'] ?? '');
                                if ($taName === '') {
                                    $taName = self::transliterateToTamil($rawName);
                                }
                                $nameHtml = '<span class="sug-nm-ta" style="font-family:notosanstamil,sans-serif; color:#7d1233; font-weight:bold;">' . self::e($taName) . '</span>';
                            } elseif ($isHi) {
                                $hiName = (string) ($entry['nameHi'] ?? '');
                                if ($hiName === '') {
                                    $hiName = self::transliterateToHindi($rawName);
                                }
                                $nameHtml = '<span class="sug-nm-hi" style="font-family:notosansdevanagari,sans-serif; color:#7d1233; font-weight:bold;">' . self::e($hiName) . '</span>';
                            } else {
                                $nameHtml = '<span class="sug-nm" style="font-weight:bold;">' . self::e($rawName) . '</span>';
                            }
                            $meaning = $isTa
                                ? ($entry['meaningTa'] ?? '')
                                : ($isHi ? ($entry['meaningHi'] ?? '') : ($entry['meaningEn'] ?? $entry['meaning'] ?? ''));
                            $rows .= $nameHtml . '<br/><span class="sug-mn">' . self::e($meaning) . '</span>';
                        } elseif (empty($cells) && $i === 0 && $col === 0) {
                            $rows .= '<span class="sug-empty">&#8212;</span>';
                        }
                        $rows .= '</td>';
                    }
                    $rows .= '</tr>';
                }
                return '<table class="sug-names" width="100%">' . $rows . '</table>';
            };

            $head = '<table class="sug-head" width="100%"><tr>'
                . '<td class="sug-chip" width="9mm">' . $chip . '</td>'
                . '<td class="sug-sound-cell"><span class="sug-sound">' . $sound . '</span>'
                . ($columnRasi !== '' ? '<br/><span class="sug-rasi">' . $columnRasi . '</span>' : '')
                . '</td>'
                . '<td class="sug-pada" align="right">' . $padaLabel . '</td>'
                . '</tr></table>';

            $southBlocks .= '<div class="sug-block"' . ($isBirthSection ? ' style="background:#fff7e0;border-left:2px solid #c9962c;"' : '') . '>' . $head . $renderList($column['south'] ?? []) . '</div>';
            $northBlocks .= '<div class="sug-block"' . ($isBirthSection ? ' style="background:#fff7e0;border-left:2px solid #c9962c;"' : '') . '>' . $head . $renderList($column['north'] ?? []) . '</div>';
        }

        $exactSoundNote = $isTa
            ? 'கொடுக்கப்பட்ட நான்கு பாத ஒலிகளுடன் சரியாகப் பொருந்தும் பெயர்கள் மட்டுமே காட்டப்படுகின்றன; சில ஒலிகளுக்கு பெயர்கள் குறைவாக இருக்கலாம்.'
            : ($isHi
                ? 'केवल दिए गए चार पाद स्वरों से ठीक मेल खाने वाले नाम दिखाए गए हैं; कुछ स्वरों के लिए नाम कम हो सकते हैं।'
                : 'Only exact matches to the four listed pada sounds are shown; some sounds may have fewer names.');

        $suggestionsPage = '';
        if ($southBlocks !== '' || $northBlocks !== '') {
            $suggestionsPage = '<pagebreak />'
                . '<div class="bn-frame" id="namakaran-page-2">'
                . '<table style="width:100%; margin-bottom:1mm;"><tr>'
                . '<td style="width:72px; vertical-align:middle; text-align:left;">' . $logoTag . '</td>'
                . '<td style="vertical-align:middle;"><div class="bn-brand">ASTRO SIVAM</div>'
                . '<div class="bn-tagline">' . $brandTagline . '</div></td>'
                . '<td style="width:62px;"></td></tr></table>'
                . '<div class="bn-title-band bn-sug-title-band">'
                . '<div class="bn-doc-title">' . $sugDocTitle . '</div>'
                . '<div class="bn-doc-sub">' . $sugDocSub . '</div>'
                . '<div class="bn-doc-meta"><b>' . $babyName . '</b> &nbsp;&bull;&nbsp; ' . $nak . ', ' . $padaValue
                . ' &nbsp;&bull;&nbsp; ' . $gender . ' &nbsp;&bull;&nbsp; <b>' . $lblReportNo . ':</b> ' . $certId . '</div>'
                . '</div>'
                . '<table class="sug-cols" width="100%"><tr>'
                . '<td class="sug-col" width="50%" valign="top">'
                . '<div class="sug-col-head sug-south">' . $southTitle . '</div>' . $southBlocks . '</td>'
                . '<td class="sug-col" width="50%" valign="top">'
                . '<div class="sug-col-head sug-north">' . $northTitle . '</div>' . $northBlocks . '</td>'
                . '</tr></table>'
                . '<div class="sug-note">' . $exactSoundNote . '</div>'
                . '<div class="bn-footer-bar"><b>ASTRO SIVAM</b> &nbsp;&bull;&nbsp; ' . $footerLabel
                . ' &nbsp;&bull;&nbsp; admin@astrosivam.com</div>'
                . '</div>';
        }

        $body = <<<HTML
<div class="bn-frame">

  <div class="bn-invocation">{$invocation}</div>
  <table style="width:100%; margin-bottom:1mm;"><tr>
    <td style="width:72px; vertical-align:middle; text-align:left;">{$logoTag}</td>
    <td style="vertical-align:middle;">
      <div class="bn-brand">ASTRO SIVAM</div>
      <div class="bn-tagline">{$brandTagline}</div>
    </td>
    <td style="width:62px;"></td>
  </tr></table>
  <div class="bn-orn"></div>

  <div class="bn-title-band">
    <div class="bn-doc-title">{$docTitle}</div>
    <div class="bn-doc-sub">{$docSubtitle}</div>
    <div class="bn-doc-meta"><b>{$lblReportNo}:</b> {$certId} &nbsp;&bull;&nbsp; <b>{$lblIssueDate}:</b> {$issueDate} &nbsp;&bull;&nbsp; <b>{$lblLanguage}:</b> {$langName}</div>
  </div>

  <div class="sec-head"><span class="sec-no">01</span>{$sec1} / {$sec2}</div>
  <table class="bn-details">
    <tr>
      <td class="bn-lbl">{$lblBabyName}</td><td class="bn-val">{$babyName} ({$gender})</td>
      <td class="bn-lbl">{$lblNak}</td><td class="bn-val">{$nak}, {$padaValue}</td>
    </tr>
    <tr>
      <td class="bn-lbl">{$lblDob}</td><td class="bn-val">{$dob}</td>
      <td class="bn-lbl">{$lblPada}</td><td class="bn-val">{$padaValue}</td>
    </tr>
    <tr>
      <td class="bn-lbl">{$lblTob}</td><td class="bn-val">{$tob}</td>
      <td class="bn-lbl">{$lblRasi}</td><td class="bn-val">{$rasi}</td>
    </tr>
    <tr>
      <td class="bn-lbl">{$lblPlace}</td><td class="bn-val">{$birthPlace}</td>
      <td class="bn-lbl">{$lblLagna}</td><td class="bn-val">{$lagna}</td>
    </tr>
    <tr>
      <td class="bn-lbl">{$lblLord}</td><td class="bn-val">{$lord}</td>
      <td class="bn-lbl">{$lblGana} / {$lblYoni}</td><td class="bn-val">{$gana} / {$yoni}</td>
    </tr>
    <tr>
      <td class="bn-lbl">{$lblRajju}</td><td class="bn-val">{$rajju}</td>
      <td class="bn-lbl"></td><td class="bn-val"></td>
    </tr>
  </table>

  <div class="sec-head"><span class="sec-no">02</span>{$sec3}</div>
  <div class="bn-syllable">
    <div class="bn-hero-kicker">{$heroTitle}</div>
    <div class="bn-hero-line">{$primarySyllable}</div>
    <div class="bn-hero-alt">{$primaryTransliteration}</div>
    <div class="bn-hero-desc">{$heroDesc}</div>
  </div>

  <div class="sec-head"><span class="sec-no">03</span>{$sec4}</div>
  <div style="font-size:9px; color:#7a2129; font-weight:bold; margin-bottom:1.5mm;">{$syllables}</div>
  <table class="data-table">
    <thead><tr><th width="30%">{$thPada}</th><th width="40%">{$thSound}</th><th>{$thRasi}</th></tr></thead>
    <tbody>{$padaRows}</tbody>
  </table>

  <div class="bn-why">
    <div class="bn-why-title">{$whySoundTitle}</div>
    <div class="bn-why-text">{$whySoundText}</div>
  </div>

  <div class="sec-head"><span class="sec-no">04</span>{$sec5}</div>
  <table class="bn-virtues">
    <tr>
<td><span class="virtue-no">1.</span>{$virtue1}</td>
<td><span class="virtue-no">2.</span>{$virtue2}</td>
    </tr>
    <tr>
<td><span class="virtue-no">3.</span>{$virtue3}</td>
<td><span class="virtue-no">4.</span>{$virtue4}</td>
    </tr>
  </table>

  {$namesSection}

  <table class="bn-sign"><tr>
    <td style="width:58%; vertical-align:top;">
      <div class="bn-cert">{$certText}</div><div class="bn-cert"><b>✓ {$verifiedLabel}</b><br/>{$nameCheck}</div>
      <div class="bn-meta"><b>{$lblReportNo}:</b> {$certId} &nbsp;&bull;&nbsp; <b>{$lblIssueDate}:</b> {$issueDate} &nbsp;&bull;&nbsp; astrosivam.com</div>
    </td>
    <td style="width:24%; vertical-align:top; text-align:center;">
      <div class="bn-sign-line"></div>
      <div class="bn-sign-name">ASTRO SIVAM — Vedic Research Desk</div>
      <div class="bn-sign-role">{$signRole}</div>
    </td>
    <td style="width:18%; vertical-align:top; text-align:center;">
      <div class="bn-seal">
        <div class="bn-seal-title">ASTRO<br/>SIVAM</div>
        <div class="bn-seal-sub">{$verifiedLabel}</div>
      </div>
    </td>
  </tr></table>

  <div class="bn-footer-bar">{$bnPreparedSpan}<b>ASTRO SIVAM</b> &nbsp;&bull;&nbsp; {$footerLabel} &nbsp;&bull;&nbsp; admin@astrosivam.com</div>

</div>
HTML;

        $css = self::sharedCss($lang) . $babyCss;
        // Page 1 = the certificate, page 2 = the South & North Indian name lists,
        // page 3 = the plain-language glossary of every term used in the report.
        $glossaryBodyBaby = astro_report_glossary_html('BABY_NAMING', $lang);
        $glossarySubtitleBaby = $isTa ? 'சொல் விளக்கம்' : ($isHi ? 'शब्दार्थ' : 'Plain-language guide to this report');
        $glossarySheetBaby = $glossaryBodyBaby === ''
            ? ''
            : '<pagebreak /><div class="sheet glossary-sheet" id="namakaran-glossary-sheet">'
                . self::topHeader('ASTRO SIVAM', $glossarySubtitleBaby, $orderNumber, 3, self::BABY_PAGE_TOTAL, $lang)
                . $glossaryBodyBaby . self::footerBand($lang) . '</div>';
        return '<!DOCTYPE html><html lang="' . self::e($lang) . '"><head><meta charset="UTF-8"><title>ASTRO SIVAM - Baby Naming Certificate</title><style>' . $css . '</style></head><body>'
            . $body . self::footerBand($lang)
            . $suggestionsPage . $glossarySheetBaby
            . '</body></html>';
    }
}
