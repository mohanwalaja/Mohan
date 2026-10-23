<?php
/**
 * ASTRO SIVAM — Birth Jathagam HTML Builder (Pages 1–3)
 */

trait AstroReportBirthJathagamTrait
{
    // =====================================================================
    // BIRTH JATHAGAM - 3 FULL PAGES HTML
    // =====================================================================
    public static function generateBirthJathagamHtml($order, $result): string {
        $lang = astro_report_normalize_language($order['language'] ?? 'en');
        $isTa = ($lang === 'ta');
        $isHi = ($lang === 'hi');

        $rasiNamesByNumber = [
            1 => ['en' => 'Mesham (Aries)', 'ta' => 'மேஷம்', 'hi' => 'मेष', 'lordEn' => 'Mars', 'lordTa' => 'செவ்வாய்', 'lordHi' => 'मंगल'],
            2 => ['en' => 'Rishabam (Taurus)', 'ta' => 'ரிஷபம்', 'hi' => 'वृषभ', 'lordEn' => 'Venus', 'lordTa' => 'சுக்கிரன்', 'lordHi' => 'शुक्र'],
            3 => ['en' => 'Mithunam (Gemini)', 'ta' => 'மிதுனம்', 'hi' => 'मिथुन', 'lordEn' => 'Mercury', 'lordTa' => 'புதன்', 'lordHi' => 'बुध'],
            4 => ['en' => 'Kadagam (Cancer)', 'ta' => 'கடகம்', 'hi' => 'कर्क', 'lordEn' => 'Moon', 'lordTa' => 'சந்திரன்', 'lordHi' => 'चंद्र'],
            5 => ['en' => 'Simham (Leo)', 'ta' => 'சிம்மம்', 'hi' => 'सिंह', 'lordEn' => 'Sun', 'lordTa' => 'சூரியன்', 'lordHi' => 'सूर्य'],
            6 => ['en' => 'Kanni (Virgo)', 'ta' => 'கன்னி', 'hi' => 'कन्या', 'lordEn' => 'Mercury', 'lordTa' => 'புதன்', 'lordHi' => 'बुध'],
            7 => ['en' => 'Thulam (Libra)', 'ta' => 'துலாம்', 'hi' => 'तुला', 'lordEn' => 'Venus', 'lordTa' => 'சுக்கிரன்', 'lordHi' => 'शुक्र'],
            8 => ['en' => 'Viruchigam (Scorpio)', 'ta' => 'விருச்சிகம்', 'hi' => 'वृश्चिक', 'lordEn' => 'Mars', 'lordTa' => 'செவ்வாய்', 'lordHi' => 'मंगल'],
            9 => ['en' => 'Dhanusu (Sagittarius)', 'ta' => 'தனுசு', 'hi' => 'धनु', 'lordEn' => 'Jupiter', 'lordTa' => 'குரு', 'lordHi' => 'गुरु'],
            10 => ['en' => 'Magaram (Capricorn)', 'ta' => 'மகரம்', 'hi' => 'मकर', 'lordEn' => 'Saturn', 'lordTa' => 'சனி', 'lordHi' => 'शनि'],
            11 => ['en' => 'Kumbam (Aquarius)', 'ta' => 'கும்பம்', 'hi' => 'कुंभ', 'lordEn' => 'Saturn', 'lordTa' => 'சனி', 'lordHi' => 'शनि'],
            12 => ['en' => 'Meenam (Pisces)', 'ta' => 'மீனம்', 'hi' => 'मीन', 'lordEn' => 'Jupiter', 'lordTa' => 'குரு', 'lordHi' => 'गुरु'],
        ];
        $normalizeRasiNumber = static function ($value) {
            return is_numeric($value) && (float) $value === (float) (int) $value && (int) $value >= 1 && (int) $value <= 12
                ? (int) $value
                : null;
        };
        $lagnaRasiNum = $normalizeRasiNumber($result['lagnaRasi'] ?? null);
        $chandraRasiNum = $normalizeRasiNumber($result['chandraRasi'] ?? null);
        $lagnaRasiInfo = $lagnaRasiNum !== null ? ($rasiNamesByNumber[$lagnaRasiNum] ?? null) : null;
        $chandraRasiInfo = $chandraRasiNum !== null ? ($rasiNamesByNumber[$chandraRasiNum] ?? null) : null;

        $orderNumber = $order['order_number'] ?? $order['orderNumber'] ?? 'ORD-JATHAGAM';
        // Printed on the FIRST page header only, on the LEFT of the reference
        // line: when this report was prepared. A stored snapshot keeps its
        // original order date.
        $preparedLabel = self::preparedDateStamp($result, $lang);
        $name = self::e($result['devoteeName'] ?? $result['nativeName'] ?? ($order['user_name'] ?? 'User'));
        $dob = self::e(self::birthDate($result['dob'] ?? '', 'N/A'));
        $tob = self::e($result['tob'] ?? 'N/A');
        $placeRaw = trim((string) ($result['birthPlace'] ?? ''));
        $countryRaw = trim((string) ($result['country'] ?? ''));
        $placeParts = array_values(array_filter(array_map('trim', explode(',', $placeRaw))));
        $placeTail = $placeParts ? end($placeParts) : '';
        $placeDisplay = $placeRaw;
        if ($placeDisplay !== '' && $countryRaw !== '' && stripos($placeTail, $countryRaw) === false) {
            $placeDisplay .= ', ' . $countryRaw;
        } elseif ($placeDisplay === '' && $countryRaw !== '') {
            $placeDisplay = $countryRaw;
        }
        if ($placeDisplay === '') {
            $placeDisplay = $isTa ? 'குறிப்பிடப்படவில்லை' : ($isHi ? 'उल्लेख नहीं किया गया' : 'Not provided');
        }
        $place = self::e($placeDisplay);

        $rasiName = self::e($chandraRasiInfo[$lang] ?? 'N/A');
        $rasiLord = self::e($chandraRasiInfo[$lang === 'ta' ? 'lordTa' : ($lang === 'hi' ? 'lordHi' : 'lordEn')] ?? 'N/A');
        // English-only "Mesham/Aries" for the Janma Rasi row (all twelve signs).
        // Tamil and Hindi keep their single sign name. The zodiac names come
        // from api/astrology/jathagam_page1.json, the same file the browser
        // report (src/services/jathagamHtmlBuilder.ts) imports.
        $rasiDualEnRaw = 'N/A';
        if ($chandraRasiNum !== null) {
            $rasiBaseEn = trim((string) preg_replace('/\s*\(.*\)$/', '', (string) ($chandraRasiInfo['en'] ?? '')));
            $zodiacEnForRasi = astro_jathagam_page1()['zodiacSignEn'][$chandraRasiNum] ?? '';
            if ($rasiBaseEn !== '') {
                $rasiDualEnRaw = $zodiacEnForRasi !== '' ? $rasiBaseEn . '/' . $zodiacEnForRasi : $rasiBaseEn;
            }
        }
        $rasiDualEn = self::e($rasiDualEnRaw);

        $nakName = self::e(
            $isTa ? ($result['nakshatram']['nameTa'] ?? $result['janmaNakshatraTa'] ?? 'N/A')
            : ($isHi ? ($result['nakshatram']['nameHi'] ?? $result['janmaNakshatraHi'] ?? 'N/A')
            : ($result['nakshatram']['name'] ?? $result['janmaNakshatraEn'] ?? 'N/A'))
        );
        $pada = self::e($result['nakshatram']['pada'] ?? $result['janmaPada'] ?? 'N/A');
        // Readability (Oct 2026): the particulars row must not print English
        // fragments inside a Tamil/Hindi report. "at" and "Pada" used to be
        // hard-coded here while the rest of the page was translated.
        $dobAtJoiner = $isTa ? ' அன்று ' : ($isHi ? ' को ' : ' at ');
        $padaTextForPdf = ($pada === '' || $pada === 'N/A')
            ? 'N/A'
            : ($isTa ? "{$pada}-ஆம் பாதம்" : ($isHi ? "पाद {$pada}" : "Pada {$pada}"));

        $lagnaRasi = self::e($lagnaRasiInfo[$lang] ?? 'N/A');
        $lagnaLord = self::e($lagnaRasiInfo[$lang === 'ta' ? 'lordTa' : ($lang === 'hi' ? 'lordHi' : 'lordEn')] ?? 'N/A');

        // Retain the current-period summary for page-2 Current Guidance; it is
        // intentionally not displayed in the page-1 particulars or chart row.
        $dasha = $result['dasha'] ?? [];
        $dashaMajor = $isTa ? ($dasha['currentLordTa'] ?? $dasha['currentLord'] ?? 'N/A') : ($isHi ? ($dasha['currentLordHi'] ?? $dasha['currentLord'] ?? 'N/A') : ($dasha['currentLord'] ?? 'N/A'));
        $dashaSub = $isTa ? ($dasha['subLordTa'] ?? $dasha['subLord'] ?? 'N/A') : ($isHi ? ($dasha['subLordHi'] ?? $dasha['subLord'] ?? 'N/A') : ($dasha['subLord'] ?? 'N/A'));
        $dashaPeriod = self::e($dasha['period'] ?? 'N/A');
        $currentDasha = self::e("{$dashaMajor} - {$dashaSub} ({$dashaPeriod})");

        // ---------------- PAGE 1: Particulars + Rasi/Navamsa Charts + Doshas ----------------
        $chartHouses = [
            'Pisces' => 12, 'Aries' => 1, 'Taurus' => 2, 'Gemini' => 3,
            'Cancer' => 4, 'Leo' => 5, 'Virgo' => 6, 'Libra' => 7,
            'Scorpio' => 8, 'Sagittarius' => 9, 'Capricorn' => 10, 'Aquarius' => 11,
        ];
        $signDisplayNames = [
            'Pisces' => $isTa ? 'மீனம்' : ($isHi ? 'मीन' : 'Pisces'),
            'Aries' => $isTa ? 'மேஷம்' : ($isHi ? 'मेष' : 'Aries'),
            'Taurus' => $isTa ? 'ரிஷபம்' : ($isHi ? 'वृषभ' : 'Taurus'),
            'Gemini' => $isTa ? 'மிதுனம்' : ($isHi ? 'मिथुन' : 'Gemini'),
            'Cancer' => $isTa ? 'கடகம்' : ($isHi ? 'कर्क' : 'Cancer'),
            'Leo' => $isTa ? 'சிம்மம்' : ($isHi ? 'सिंह' : 'Leo'),
            'Virgo' => $isTa ? 'கன்னி' : ($isHi ? 'कन्या' : 'Virgo'),
            'Libra' => $isTa ? 'துலாம்' : ($isHi ? 'तुला' : 'Libra'),
            'Scorpio' => $isTa ? 'விருச்சிகம்' : ($isHi ? 'वृश्चिक' : 'Scorpio'),
            'Sagittarius' => $isTa ? 'தனுசு' : ($isHi ? 'धनु' : 'Sagittarius'),
            'Capricorn' => $isTa ? 'மகரம்' : ($isHi ? 'मकर' : 'Capricorn'),
            'Aquarius' => $isTa ? 'கும்பம்' : ($isHi ? 'कुंभ' : 'Aquarius'),
        ];
        // Short tags for planets in chart. Keys are the engine's graha values
        // (the lowercase Graha enum: sun, moon, ...). They were capitalised before,
        // so no planet ever matched and the Hindi chart lost every placement.
        // The tags must match src/services/jathagamHtmlBuilder.ts
        // (GRAHA_NAMES_REPORT) exactly: the same customer reads both renderers,
        // and the legend below is printed from these same strings.
        $grahaTags = [
            'sun' => $isTa ? 'சூ' : ($isHi ? 'सू' : 'Su'),
            'moon' => $isTa ? 'சந்' : ($isHi ? 'चं' : 'Ch'),
            'mars' => $isTa ? 'செவ்' : ($isHi ? 'मं' : 'Ma'),
            'mercury' => $isTa ? 'பு' : ($isHi ? 'बु' : 'Bu'),
            'jupiter' => $isTa ? 'குரு' : ($isHi ? 'गु' : 'Gu'),
            'venus' => $isTa ? 'சுக்' : ($isHi ? 'शु' : 'Sk'),
            'saturn' => $isTa ? 'சனி' : ($isHi ? 'श' : 'Sa'),
            'rahu' => $isTa ? 'ரா' : ($isHi ? 'रा' : 'Ra'),
            'ketu' => $isTa ? 'கே' : ($isHi ? 'के' : 'Ke'),
        ];
        // What each tag means, in the family's language. Read from the same
        // arrays as the chart so a legend entry can never go missing.
        $grahaLegendNames = [
            'sun' => $isTa ? 'சூரியன்' : ($isHi ? 'सूर्य' : 'Surya (Sun)'),
            'moon' => $isTa ? 'சந்திரன்' : ($isHi ? 'चंद्र' : 'Chandra (Moon)'),
            'mars' => $isTa ? 'செவ்வாய்' : ($isHi ? 'मंगल' : 'Mangal (Mars)'),
            'mercury' => $isTa ? 'புதன்' : ($isHi ? 'बुध' : 'Budha (Mercury)'),
            'jupiter' => $isTa ? 'குரு' : ($isHi ? 'गुरु' : 'Guru (Jupiter)'),
            'venus' => $isTa ? 'சுக்கிரன்' : ($isHi ? 'शुक्र' : 'Sukra (Venus)'),
            'saturn' => $isTa ? 'சனி' : ($isHi ? 'शनि' : 'Sani (Saturn)'),
            'rahu' => $isTa ? 'ராகு' : ($isHi ? 'राहु' : 'Rahu (N. Node)'),
            'ketu' => $isTa ? 'கேது' : ($isHi ? 'केतु' : 'Ketu (S. Node)'),
        ];

        $chartPlanetPositions = is_array($result['planetPositions'] ?? null) ? $result['planetPositions'] : [];
        $planetsByRasi = [];
        foreach ($chartPlanetPositions as $p) {
            if (!is_array($p)) { continue; }
            $rasiRaw = $p['rasi'] ?? $p['rasiNumber'] ?? null;
            if (!is_numeric($rasiRaw) || (float) $rasiRaw !== (float) (int) $rasiRaw || (int) $rasiRaw < 1 || (int) $rasiRaw > 12) {
                continue;
            }
            $r = (int) $rasiRaw;
            $gKey = $p['graha'] ?? $p['nameEn'] ?? '';
            $tag = $grahaTags[strtolower((string) $gKey)] ?? ($isTa ? ($p['nameTa'] ?? '') : ($isHi ? ($p['nameHi'] ?? '') : $gKey));
            if (trim((string) $tag) !== '') {
                $planetsByRasi[$r][] = '<span class="planet-name">' . self::e($tag) . '</span>';
            }
        }
        $lagnaTagText = $isTa ? 'லக்' : ($isHi ? 'लग्न' : 'Lagna');
        $lagnaTag = '<span class="planet-name lagna">' . $lagnaTagText . '</span>';

        $signOrder = [
            ['Pisces','Aries','Taurus','Gemini'],
            ['Aquarius', null, null, 'Cancer'],
            ['Capricorn', null, null, 'Leo'],
            ['Sagittarius','Scorpio','Libra','Virgo'],
        ];
        // Chart key: without it a cell reading "GuSa" or "LagnaCh" is unreadable.
        // Same wording as the browser report's .chart-legend.
        $chartLegendTitle = $isTa ? 'கட்டக் குறியீடுகள்' : ($isHi ? 'चक्र के चिह्न' : 'Chart Symbols');
        $chartLegendNote = $isTa
            ? 'ஒரே ராசியில் இரண்டு குறியீடுகள் (எ.கா. குருசனி) என்பது இரண்டு கிரகங்களும் அந்த ராசியில் அமைந்துள்ளன என்று பொருள்.'
            : ($isHi
                ? 'एक ही राशि में दो चिह्न (जैसे गुश) का अर्थ है कि दोनों ग्रह उसी राशि में हैं।'
                : 'Two symbols in one sign (for example GuSa) mean both planets sit in that rasi.');
        $chartLegendItemsHtml = '';
        foreach ($grahaTags as $gKey => $gTag) {
            $chartLegendItemsHtml .= '<span class="chart-legend-item"><b>' . self::e($gTag) . '</b> '
                . self::e($grahaLegendNames[$gKey] ?? '') . '</span>';
        }
        $chartLegendItemsHtml .= '<span class="chart-legend-item"><b>' . self::e($lagnaTagText) . '</b> '
            . self::e($isTa ? 'லக்னம்' : ($isHi ? 'लग्न (उदय राशि)' : 'Ascendant (rising sign)')) . '</span>';
        $chartLegendHtml = '<div class="chart-legend">'
            . '<span class="chart-legend-title">' . self::e($chartLegendTitle) . '</span>'
            . '<span class="chart-legend-items">' . $chartLegendItemsHtml . '</span>'
            . '<span class="chart-legend-note">' . self::e($chartLegendNote) . '</span>'
            . '</div>';

        // Item 7: the same 4x4 South-Indian grid serves the Rasi chart and the
        // Navamsa (D9) confirmation chart. A closure keeps the two grids from
        // drifting apart (cell order, Lagna marker, center label).
        $buildRasiRows = function ($planetsForGrid, $lagnaRasiForGrid, $lagnaTagForGrid, $centerSubLabel) use ($signOrder, $chartHouses, $signDisplayNames, $isTa, $isHi) {
            $rowsHtml = '';
            foreach ($signOrder as $ri => $row) {
                $rowsHtml .= '<tr>';
                foreach ($row as $ci => $sign) {
                    if ($ri === 1 && $ci === 1) {
                        $centerOm = $isTa ? 'ஓம்' : ($isHi ? 'ॐ' : 'OM');
                        $rowsHtml .= '<td class="rasi-center-om" colspan="2" rowspan="2">' . $centerOm . '<br><span>ASTRO SIVAM</span><br><span>' . $centerSubLabel . '</span></td>';
                    } elseif ($ri === 1 && $ci === 2) {
                        continue;
                    } elseif ($ri === 2 && ($ci === 1 || $ci === 2)) {
                        continue;
                    } elseif ($sign === null) {
                        continue;
                    } else {
                        $rasiNum = $chartHouses[$sign];
                        $pList = $planetsForGrid[$rasiNum] ?? [];
                        if ($lagnaRasiForGrid !== null && $rasiNum === $lagnaRasiForGrid) {
                            array_unshift($pList, $lagnaTagForGrid);
                        }
                        $pStr = implode('', $pList);
                        $signLabel = $signDisplayNames[$sign] ?? $sign;
                        $rowsHtml .= '<td><span class="rasi-sign-title">' . self::e($signLabel) . '</span><div class="rasi-planets">' . $pStr . '</div></td>';
                    }
                }
                $rowsHtml .= '</tr>';
            }
            return $rowsHtml;
        };
        $chartRows = $buildRasiRows($planetsByRasi, $lagnaRasiNum, $lagnaTag, ($isTa ? 'ராசி கட்டம்' : ($isHi ? 'राशि चक्र' : 'RASI CHAKRA')));

        // Item 7: Navamsa (D9) grouping. The engine's own navamsaRasi wins when
        // the payload carries it (the TypeScript engine sends one per graha); the PHP
        // engine does not, so the same rule the TypeScript engine uses is applied to
        // the same sidereal longitude: padaOverall = floor(lon / 3°20′),
        // navamsa rasi = padaOverall % 12 + 1. Never a fabricated sign.
        $navamsaPlanetsByRasi = [];
        $navamsaTagged = 0;
        foreach ($chartPlanetPositions as $p) {
            if (!is_array($p)) { continue; }
            $navRasi = $normalizeRasiNumber($p['navamsaRasi'] ?? null);
            $totalLonForNavamsa = null;
            if (is_numeric($p['totalDegrees'] ?? null)) {
                $totalLonForNavamsa = fmod((float) $p['totalDegrees'] + 360.0, 360.0);
            } else {
                $rasiForNavamsa = $normalizeRasiNumber($p['rasi'] ?? $p['rasiNumber'] ?? null);
                $degreesForNavamsa = $p['degrees'] ?? null;
                if ($rasiForNavamsa !== null && is_numeric($degreesForNavamsa) && is_finite((float) $degreesForNavamsa)) {
                    $totalLonForNavamsa = fmod((($rasiForNavamsa - 1) * 30.0) + (float) $degreesForNavamsa, 360.0);
                    if ($totalLonForNavamsa < 0) { $totalLonForNavamsa += 360.0; }
                }
            }
            if ($navRasi === null && $totalLonForNavamsa !== null) {
                $navRasi = ((int) floor($totalLonForNavamsa / (360.0 / 108.0)) % 12) + 1;
            }
            if ($navRasi === null) { continue; }
            $gKey = $p['graha'] ?? $p['nameEn'] ?? '';
            $tag = $grahaTags[strtolower((string) $gKey)] ?? ($isTa ? ($p['nameTa'] ?? '') : ($isHi ? ($p['nameHi'] ?? '') : $gKey));
            if (trim((string) $tag) === '') { continue; }
            $navamsaPlanetsByRasi[$navRasi][] = '<span class="planet-name">' . self::e($tag) . '</span>';
            $navamsaTagged++;
        }
        $navamsaLagnaRasi = $normalizeRasiNumber($result['lagnaNavamsaRasi'] ?? null);
        if ($navamsaLagnaRasi === null && $lagnaRasiNum !== null) {
            $lagnaDegreesForNavamsa = $result['lagnaDegrees'] ?? null;
            if (is_numeric($lagnaDegreesForNavamsa) && (float) $lagnaDegreesForNavamsa >= 0 && (float) $lagnaDegreesForNavamsa < 30) {
                $lagnaTotalForNavamsa = (($lagnaRasiNum - 1) * 30.0) + (float) $lagnaDegreesForNavamsa;
                $navamsaLagnaRasi = ((int) floor($lagnaTotalForNavamsa / (360.0 / 108.0)) % 12) + 1;
            }
        }
        $navamsaLagnaTag = '<span class="planet-name lagna">' . $lagnaTagText . '</span>';
        $navamsaRows = $navamsaTagged > 0
            ? $buildRasiRows($navamsaPlanetsByRasi, $navamsaLagnaRasi, $navamsaLagnaTag, ($isTa ? 'நவாம்சம் D9' : ($isHi ? 'नवांश D9' : 'NAVAMSA D9')))
            : '';
        $navamsaCardTitle = $isTa ? 'நவாம்ச கட்டம் (Navamsa D9)' : ($isHi ? 'नवांश चक्र (Navamsa D9)' : 'Navamsa Chart (D9)');
        $navamsaBlockHtml = $navamsaRows !== ''
            ? '<table class="rasi-table">' . $navamsaRows . '</table>'
            : '<p class="mini-note">' . ($isTa ? 'நவாம்ச நிலை தகவல் கிடைக்கவில்லை; N/A.' : ($isHi ? 'नवांश स्थिति उपलब्ध नहीं है; N/A।' : 'Navamsa positions unavailable; N/A.')) . '</p>';

        $chartCardTitle = $isTa ? 'ராசி கட்டம் (Rasi Chart)' : ($isHi ? 'राशि चक्र (Rasi Chakra)' : 'Rasi Chart (Chakra)');
        $rasiNavamsaRowHtml = <<<HTML
<table style="width:100%; margin-bottom:2mm;"><tr>
  <td style="width:49%; vertical-align:top;">
    <div class="panel">
      <div class="panel-title">{$chartCardTitle}</div>
      <table class="rasi-table">{$chartRows}</table>
    </div>
  </td>
  <td style="width:2%;"></td>
  <td style="width:49%; vertical-align:top;">
    <div class="panel">
      <div class="panel-title">{$navamsaCardTitle}</div>
      {$navamsaBlockHtml}
    </div>
  </td>
</tr></table>
{$chartLegendHtml}
HTML;

        $planetsList = $chartPlanetPositions;
        $doshasList = is_array($result['doshas'] ?? null) ? $result['doshas'] : [];
        $hasGuruDosha = false;
        foreach ($doshasList as $d) {
            if (!is_array($d)) { continue; }
            $nameStr = ($d['nameEn'] ?? '') . ($d['nameTa'] ?? '') . ($d['nameHi'] ?? '');
            if (stripos($nameStr, 'Guru Chandala') !== false || stripos($nameStr, 'குரு சண்டாள') !== false || stripos($nameStr, 'गुरु चांडाल') !== false) {
                $hasGuruDosha = true;
                break;
            }
        }

        if (!$hasGuruDosha) {
            $jupiterSign = null; $rahuSign = null; $ketuSign = null;
            foreach ($planetsList as $p) {
                if (!is_array($p)) { continue; }
                $pId = strtolower((string) ($p['graha'] ?? $p['nameEn'] ?? $p['key'] ?? ''));
                $pSign = $normalizeRasiNumber($p['rasi'] ?? $p['rasiNumber'] ?? null);
                if (stripos($pId, 'guru') !== false || stripos($pId, 'jup') !== false) { $jupiterSign = $pSign; }
                if (stripos($pId, 'rahu') !== false) { $rahuSign = $pSign; }
                if (stripos($pId, 'ketu') !== false) { $ketuSign = $pSign; }
            }
            $guruSignsAvailable = $jupiterSign !== null && $rahuSign !== null && $ketuSign !== null;
            $isGuruAfflicted = $guruSignsAvailable
                ? ($jupiterSign === $rahuSign || $jupiterSign === $ketuSign || (($jupiterSign + 6) % 12 ?: 12) === $rahuSign || (($jupiterSign + 6) % 12 ?: 12) === $ketuSign)
                : null;

            $doshasList[] = [
                'nameEn' => 'Guru Chandala Dosha',
                'nameTa' => 'குரு சண்டாள தோஷம் (Guru Chandala)',
                'nameHi' => 'गुरु चांडाल दोष',
                'isPresent' => $isGuruAfflicted,
                'severityEn' => $isGuruAfflicted === null ? 'N/A' : ($isGuruAfflicted ? 'Moderate' : 'Clean / Favourable'),
                'severityTa' => $isGuruAfflicted === null ? 'N/A' : ($isGuruAfflicted ? 'மிதமான தோஷம்' : 'சுப நிலை (தோஷம் இல்லை)'),
                'severityHi' => $isGuruAfflicted === null ? 'N/A' : ($isGuruAfflicted ? 'मध्यम' : 'शुभ स्थिति (दोष रहित)'),
                'descriptionEn' => $isGuruAfflicted === null ? 'Jupiter, Rahu or Ketu sign data is unavailable; Guru Chandala Dosha is not assessed.' : ($isGuruAfflicted ? 'Jupiter (Guru) is conjunct or aspected by shadow planets Rahu/Ketu, forming Guru Chandala Dosha. Lord Dakshinamurthy and Shiva worship recommended.' : 'No trigger was found under this limited sign-level rule; this does not establish that Jupiter is free from other afflictions.'),
                'descriptionTa' => $isGuruAfflicted === null ? 'குரு, ராகு அல்லது கேதுவின் ராசித் தகவல் கிடைக்கவில்லை; குரு சண்டாள தோஷம் மதிப்பிடப்படவில்லை.' : ($isGuruAfflicted ? 'சுப கிரகமான குரு பகவானும் சாயா கிரகமான ராகு/கேதுவும் ஒரே ராசியில் இணைவு அல்லது பார்வையில் உள்ளதால் குரு சண்டாள தோஷம் உருவாகிறது. ஸ்ரீ தட்சிணாமூர்த்தி மற்றும் சிவ வழிபாடு மூலம் குருவின் பரிபூரண சுப யோகம் உண்டாகும்.' : 'இந்த வரையறுக்கப்பட்ட ராசி விதியில் குறியீடு இல்லை; இதனால் குருவுக்கு வேறு பாதிப்புகள் இல்லை என உறுதிப்படுத்த முடியாது.'),
                'descriptionHi' => $isGuruAfflicted === null ? 'गुरु, राहु या केतु की राशि-संबंधी जानकारी उपलब्ध नहीं है; गुरु चांडाल दोष का आकलन नहीं हुआ है।' : ($isGuruAfflicted ? 'शुभ ग्रह गुरु एवं छाया ग्रह राहु/केतु की युति अथवा दृष्टि के कारण गुरु चांडाल दोष का प्रभाव है।' : 'इस सीमित राशि-आधारित नियम में संकेत नहीं मिला है; इससे अन्य ग्रह-दोषों की अनुपस्थिति सिद्ध नहीं होती है।'),
                'traditionalRemedyEn' => 'Pray to Lord Dakshinamurthy or Lord Shiva.',
                'traditionalRemedyTa' => 'தட்சிணாமூர்த்தி அல்லது சிவன் பெயரைச் சொல்லி பிரார்த்தனை செய்யுங்கள்.',
                'traditionalRemedyHi' => 'भगवान दक्षिणामूर्ति या भगवान शिव का नाम लेकर प्रार्थना करें।',
            ];
        }

        // ---- Sani Doshas (Birth Jathagam Page 1) — replaces Kuja/Sevvay ----
        // Kuja is retained for Wedding Compatibility but removed from Birth chart
        // per user request. Live Sani-transit families: Sade Sati (Ezharai),
        // Ashtama and Kandaka/Ardhashtama are derived from saniStatus.
        $saniStatusData = $result['saniStatus'] ?? $result['saniTransit'] ?? null;
        $saniHouseForPdf = null;
        if (is_array($saniStatusData)) {
            $saniHouseForPdf = isset($saniStatusData['saniHouseFromMoon']) ? (int) $saniStatusData['saniHouseFromMoon'] : (isset($saniStatusData['house']) ? (int) $saniStatusData['house'] : null);
        }
        $saniCardsHtml = '';
        // Show only the active Sani dosha; if none is active, show a single
        // "No Sani dosha is active" card. Every Sani card carries
        // the same two-line explanation (astro_jathagam_dosha_explainer) and the
        // badge carries the verdict, mirroring src/services/jathagamHtmlBuilder.ts.
        if (is_array($saniStatusData)) {
            $isEzharaiForPdf = !empty($saniStatusData['isEzharaiSani']);
            $isAshtamaForPdf = !empty($saniStatusData['isAshtamaSani']);
            $isKandakaForPdf = !empty($saniStatusData['isKandakaSani']);
            $ezharaiTypeLabelForPdf = $isTa ? ($saniStatusData['ezharaiTypeTa'] ?? '') : ($isHi ? ($saniStatusData['ezharaiTypeHi'] ?? '') : ($saniStatusData['ezharaiTypeEn'] ?? ''));
            if ($isEzharaiForPdf) {
                $ezharaiStatusForPdf = $ezharaiTypeLabelForPdf !== '' ? $ezharaiTypeLabelForPdf : ($isTa ? 'ஏழரை சனி உள்ளது' : ($isHi ? 'साढ़े साती है' : 'In Sade Sati'));
                $ezharaiBadgeForPdf = 'badge-moderate';
                $ezharaiDescForPdf = astro_jathagam_dosha_explainer('sani', $lang);
                $ezharaiTitleForPdf = $isTa ? 'ஏழரை சனி — சனி பெயர்ச்சி (Sade Sati / Ezharai Sani)' : ($isHi ? 'साढ़े साती — शनि गोचर (Ezharai Sani)' : 'Ezharai Sani — Saturn Transit (Sade Sati)');
                $saniCardsHtml .= '<div class="dosha-card"><table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;"><tr><td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">' . self::e($ezharaiTitleForPdf) . '</td><td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge ' . $ezharaiBadgeForPdf . '">' . self::e($ezharaiStatusForPdf) . '</span></td></tr></table><div class="dosha-desc">' . self::e($ezharaiDescForPdf) . '</div></div>';
            }
            if ($isAshtamaForPdf) {
                $ashtamaStatusForPdf = $isTa ? 'அஷ்டம சனி உள்ளது — 8-ஆம் வீடு' : ($isHi ? 'अष्टम शनि — आठवें भाव में है' : 'Ashtama Sani — Saturn in 8th');
                $ashtamaBadgeForPdf = 'badge-moderate';
                $ashtamaDescForPdf = astro_jathagam_dosha_explainer('sani', $lang);
                $ashtamaTitleForPdf = $isTa ? 'அஷ்டம சனி (Ashtama Sani — 8-ஆம் வீடு)' : ($isHi ? 'अष्टम शनि (आठवाँ भाव)' : 'Ashtama Sani (Saturn in 8th House)');
                $saniCardsHtml .= '<div class="dosha-card"><table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;"><tr><td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">' . self::e($ashtamaTitleForPdf) . '</td><td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge ' . $ashtamaBadgeForPdf . '">' . self::e($ashtamaStatusForPdf) . '</span></td></tr></table><div class="dosha-desc">' . self::e($ashtamaDescForPdf) . '</div></div>';
            }
            if ($isKandakaForPdf) {
                if ($saniHouseForPdf === 4) { $kandakaStatusForPdf = $isTa ? 'அர்த்தாஷ்டம சனி — 4-ஆம் வீட்டில்' : ($isHi ? 'अर्धाष्टम शनि — चौथे भाव में है' : 'Ardhashtama Sani — Saturn in 4th'); }
                elseif ($saniHouseForPdf === 7) { $kandakaStatusForPdf = $isTa ? 'கண்டக சனி — 7-ஆம் வீட்டில்' : ($isHi ? 'कंटक शनि — सातवें भाव में है' : 'Kandaka Sani — Saturn in 7th'); }
                elseif ($saniHouseForPdf === 10) { $kandakaStatusForPdf = $isTa ? 'கண்டக சனி — 10-ஆம் வீட்டில்' : ($isHi ? 'कंटक शनि — दसवें भाव में है' : 'Kandaka Sani — Saturn in 10th'); }
                else { $kandakaStatusForPdf = $isTa ? 'கண்டக / அர்த்தாஷ்டம சனி உள்ளது' : ($isHi ? 'कंटक / अर्धाष्टम शनि है' : 'Kandaka / Ardhashtama Sani present'); }
                $kandakaBadgeForPdf = 'badge-moderate';
                $kandakaDescForPdf = astro_jathagam_dosha_explainer('sani', $lang);
                $kandakaTitleForPdf = $isTa ? 'கண்டக / அர்த்தாஷ்டம சனி (4, 7, 10-ஆம் வீடு)' : ($isHi ? 'कंटक / अर्धाष्टम शनि (चौथा, सातवाँ, दसवाँ भाव)' : 'Kandaka / Ardhashtama Sani (Saturn in 4th, 7th, 10th)');
                $saniCardsHtml .= '<div class="dosha-card"><table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;"><tr><td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">' . self::e($kandakaTitleForPdf) . '</td><td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge ' . $kandakaBadgeForPdf . '">' . self::e($kandakaStatusForPdf) . '</span></td></tr></table><div class="dosha-desc">' . self::e($kandakaDescForPdf) . '</div></div>';
            }
            $hasAnySaniForPdf = $isEzharaiForPdf || $isAshtamaForPdf || $isKandakaForPdf;
            if (!$hasAnySaniForPdf) {
                $noSaniTitleForPdf = $isTa ? 'சனி தோஷ நிலை' : ($isHi ? 'शनि दोष स्थिति' : 'Sani Dosha Status');
                $noSaniBadgeForPdf = $isTa ? 'எந்த சனி தோஷமும் இல்லை' : ($isHi ? 'आपकी कुंडली में कोई शनि दोष सक्रिय नहीं है' : 'No Sani dosha is active in your chart');
                $noSaniDescForPdf = astro_jathagam_dosha_explainer('sani', $lang);
                $saniCardsHtml .= '<div class="dosha-card"><table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;"><tr><td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">' . self::e($noSaniTitleForPdf) . '</td><td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge badge-clean">' . self::e($noSaniBadgeForPdf) . '</span></td></tr></table><div class="dosha-desc">' . self::e($noSaniDescForPdf) . '</div></div>';
            }
        } else {
            // No saniStatus (legacy payload) — show the same "no active" card as fallback
            $fallbackTitle = $isTa ? 'சனி தோஷ நிலை' : ($isHi ? 'शनि दोष स्थिति' : 'Sani Dosha Status');
            $fallbackBadge = $isTa ? 'எந்த சனி தோஷமும் இல்லை' : ($isHi ? 'आपकी कुंडली में कोई शनि दोष सक्रिय नहीं है' : 'No Sani dosha is active in your chart');
            $fallbackDesc = astro_jathagam_dosha_explainer('sani', $lang);
            $saniCardsHtml .= '<div class="dosha-card"><table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;"><tr><td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">' . self::e($fallbackTitle) . '</td><td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge badge-clean">' . self::e($fallbackBadge) . '</span></td></tr></table><div class="dosha-desc">' . self::e($fallbackDesc) . '</div></div>';
        }

        $doshaCardsHtml = $saniCardsHtml;
        $baseDoshas = array_values(array_filter($doshasList, static function ($d) {
            if (!is_array($d) || !empty($d['isNavagrahaAfflictionIndicator'])) return false;
            $name = ($d['nameEn'] ?? '') . ($d['nameTa'] ?? '') . ($d['nameHi'] ?? '');
            if (stripos($name, 'Kuja') !== false || stripos($name, 'Mangala') !== false || stripos($name, 'Sevvay') !== false || stripos($name, 'Mars (Kuja)') !== false || stripos($name, 'செவ்வாய்') !== false || stripos($name, 'मंगल') !== false) return false;
            return true;
        }));
        foreach (array_slice($baseDoshas, 0, 3) as $d) {
            $dName = $isTa ? ($d['nameTa'] ?? $d['nameEn'] ?? '') : ($isHi ? ($d['nameHi'] ?? $d['nameEn'] ?? '') : ($d['nameEn'] ?? ''));
            $dSev = $isTa ? ($d['severityTa'] ?? $d['severityEn'] ?? '') : ($isHi ? ($d['severityHi'] ?? $d['severityEn'] ?? '') : ($d['severityEn'] ?? ''));
            $dDesc = $isTa ? ($d['descriptionTa'] ?? $d['descriptionEn'] ?? '') : ($isHi ? ($d['descriptionHi'] ?? $d['descriptionEn'] ?? '') : ($d['descriptionEn'] ?? ''));
            // Page 1 prints a SHORT two-line explanation for the three named
            // doshas instead of the engine's long paragraph + remedies. The
            // wording is shared with the browser report through
            // api/astrology/jathagam_page1.json; the badge still carries the
            // engine's verdict.
            $explainerKeyForPdf = '';
            $nameForExplainer = ($d['nameEn'] ?? '') . ' ' . ($d['nameTa'] ?? '') . ' ' . ($d['nameHi'] ?? '');
            if (stripos($nameForExplainer, 'kala') !== false && stripos($nameForExplainer, 'sarpa') !== false) {
                $explainerKeyForPdf = 'kalaSarpa';
            } elseif (stripos($nameForExplainer, 'pitru') !== false) {
                $explainerKeyForPdf = 'pitru';
            } elseif (stripos($nameForExplainer, 'chandala') !== false) {
                $explainerKeyForPdf = 'guruChandala';
            }
            if ($explainerKeyForPdf !== '') {
                $dDesc = astro_jathagam_dosha_explainer($explainerKeyForPdf, $lang);
            }
            // Item 2: the badge speaks the Kuja verdict (none / present /
            // present-cancelled) instead of the old boolean severity.
            if (!empty($d['verdict'])) {
                $dSev = $isTa ? ($d['verdictLabelTa'] ?? $dSev) : ($isHi ? ($d['verdictLabelHi'] ?? $dSev) : ($d['verdictLabelEn'] ?? $dSev));
            }
            // The fuller ancestral remedy is no longer appended to the page-1
            // card (it made the card a paragraph); the two-line explanation
            // above replaces it. The remedy itself stays on page 3.
            
            $badgeClass = 'badge-clean';
            if (!array_key_exists('isPresent', $d) || $d['isPresent'] === null || trim((string) $dSev) === 'N/A') {
                $badgeClass = 'badge-na';
            } elseif (stripos($dSev, 'Afflicted') !== false || stripos($dSev, 'Severe') !== false || stripos($dSev, 'தோஷம்') !== false || stripos($dSev, 'दोष') !== false) {
                $badgeClass = 'badge-afflicted';
            } elseif (stripos($dSev, 'Moderate') !== false || stripos($dSev, 'மத்திமம்') !== false || stripos($dSev, 'मध्यम') !== false) {
                $badgeClass = 'badge-moderate';
            }
            if (($d['verdict'] ?? '') === 'present-cancelled') {
                $badgeClass = 'badge-cancelled';
            }

            $doshaCardsHtml .= <<<HTML
<div class="dosha-card">
  <table style="width:100%; border-collapse:collapse; margin:0 0 1.2mm;">
    <tr>
      <td style="font-weight:bold; color:#7a1f1f; font-size:9.5px; vertical-align:middle; text-align:left;">{$dName}</td>
      <td style="text-align:right; vertical-align:middle; width:35%;"><span class="dosha-badge {$badgeClass}">{$dSev}</span></td>
    </tr>
  </table>
  <div class="dosha-desc">{$dDesc}</div>
</div>
HTML;
        }

        // The Navagraha Affliction Indicators card is no longer printed on page
        // 1. The screening rules themselves stay in the engine (and surface in
        // the Short Summary planet read), so only this page-1 card was dropped.

        // Yogas & Graha Yuddha intentionally not rendered per user request
        $yogaNoteLines = [];
        $yogaCardsHtml = '';
        $yogaNotesCardHtml = '';

        $p1Sub = $isTa ? 'ஜாதக கணிப்பு அறிக்கை (Birth Jathagam)' : ($isHi ? 'जन्म कुंडली रिपोर्ट (Birth Horoscope)' : 'Certified Vedic Horoscope &amp; Ephemeris');
        $panelDevoteeTitle = $isTa ? 'ஜாதகர் விவரங்கள்' : ($isHi ? 'जातक जन्म विवरण (Birth Particulars)' : 'User Particulars');
        $lblPName = $isTa ? 'பெயர்:' : ($isHi ? 'नाम:' : 'Name:');
        $lblPDob = $isTa ? 'பிறந்த தேதி & நேரம்:' : ($isHi ? 'जन्म तिथि एवं समय:' : 'DOB &amp; Time:');
        $lblPPlace = $isTa ? 'பிறந்த இடம் & நாடு:' : ($isHi ? 'जन्म स्थान:' : 'Birth Place:');
        $lblPLagna = $isTa ? 'லக்னம்:' : ($isHi ? 'लग्न:' : 'Lagna (Ascendant):');
        // Page-1 values: the English report prints the sign ("Mesham/Aries") and
        // the star in BOLD. Tamil and Hindi keep their exact previous markup.
        // Bold in every language; only the English row adds the zodiac twin.
        $rasiValueHtml = '<strong>' . (($isTa || $isHi) ? $rasiName : $rasiDualEn) . '</strong>';
        $nakValueHtml = '<strong>' . $nakName . '</strong>';
        $lblPRasi = $isTa ? 'ராசி & அதிபதி:' : ($isHi ? 'राशि एवं स्वामी:' : 'Janma Rasi / Zodiac Sign &amp; Lord:');
        $lblPNak = $isTa ? 'நட்சத்திரம் & பாதம்:' : ($isHi ? 'नक्षत्र एवं पद:' : 'Janma Nakshatra / Star Sign:');
        $lblPAyanNode = $isTa ? 'அயனாம்சம் / ராகு நிலை:' : ($isHi ? 'अयनांश / राहु नोड:' : 'Ayanamsa / Rahu Node:');

        // Item 5: the report states which ayanamsa and which lunar-node
        // convention produced the chart, so a reader can reproduce Rahu/Ketu.
        // MEAN is the classical default (always retrograde, BPHS/dasha work);
        // TRUE is the modern osculating node. The seven classical grahas are
        // identical under both conventions.
        $ayanamsaValueForReport = $result['ayanamsa'] ?? null;
        $ayanamsaValueText = (is_numeric($ayanamsaValueForReport) && is_finite((float) $ayanamsaValueForReport))
            ? number_format((float) $ayanamsaValueForReport, 4) . '&deg;'
            : 'N/A';
        $ayanamsaModeForReport = strtoupper((string) ($result['ayanamsaMode'] ?? 'TRUE')) === 'MEAN' ? 'MEAN' : 'TRUE';
        $ayanamsaText = $ayanamsaValueText . ' Lahiri Chitra Paksha (' . ($ayanamsaModeForReport === 'MEAN' ? 'mean' : 'true') . ')';
        $nodeTypeConfigured = $result['nodeType'] ?? (class_exists('AstroEngine') ? AstroEngine::nodeType() : 'MEAN');
        $nodeTypeForReport = strtoupper((string) $nodeTypeConfigured) === 'TRUE' ? 'TRUE' : 'MEAN';
        $nodeTypeText = $nodeTypeForReport === 'TRUE'
            ? ($isTa ? 'உண்மை நிலை (True node)' : ($isHi ? 'सच्चा नोड (True node)' : 'True node (osculating)'))
            : ($isTa ? 'சராசரி நிலை (Mean node)' : ($isHi ? 'औसत नोड (Mean node)' : 'Mean node (classical)'));

        $doshaSecTitle = $isTa ? 'தோஷ பரிசீலனை' : ($isHi ? 'दोष विश्लेषण' : 'Dosha Analysis');

        // Keep the chart pair as the only astrology-chart row on page 1; the
        // full planetary and Dasha values remain available to page-2 predictions.
        $doshaCardChunks = array_values(array_filter(
            preg_split('/(?=<div class="dosha-card">)/', $doshaCardsHtml) ?: [],
            static fn($chunk) => trim((string) $chunk) !== ''
        ));
        if (count($doshaCardChunks) > 1) {
            $doshaCardsHtml = '<table class="dosha-pair-grid">';
            for ($doshaChunkIndex = 0; $doshaChunkIndex < count($doshaCardChunks); $doshaChunkIndex += 2) {
                $doshaCardsHtml .= '<tr><td class="dosha-cell">' . $doshaCardChunks[$doshaChunkIndex] . '</td><td class="dosha-cell">'
                    . ($doshaCardChunks[$doshaChunkIndex + 1] ?? '') . '</td></tr>';
            }
            $doshaCardsHtml .= '</table>';
        }

        $page1Html = self::topHeader('ASTRO SIVAM', $p1Sub, $orderNumber, 1, self::JATHAGAM_PAGE_TOTAL, $lang, '', true, $preparedLabel);
        $page1Html .= <<<HTML
<div class="panel">
  <div class="panel-title">{$panelDevoteeTitle}</div>
  <table class="details-grid">
    <tr>
      <td><div class="det-box"><span class="det-lbl">{$lblPName}</span><span class="det-val">{$name}</span></div></td>
      <td><div class="det-box"><span class="det-lbl">{$lblPRasi}</span><span class="det-val">{$rasiValueHtml} ({$rasiLord})</span></div></td>
    </tr>
    <tr>
      <td><div class="det-box"><span class="det-lbl">{$lblPDob}</span><span class="det-val">{$dob}{$dobAtJoiner}{$tob}</span></div></td>
      <td><div class="det-box"><span class="det-lbl">{$lblPNak}</span><span class="det-val">{$nakValueHtml}, {$padaTextForPdf}</span></div></td>
    </tr>
    <tr>
      <td><div class="det-box"><span class="det-lbl">{$lblPPlace}</span><span class="det-val">{$place}</span></div></td>
      <td><div class="det-box"><span class="det-lbl">{$lblPLagna}</span><span class="det-val">{$lagnaRasi} ({$lagnaLord})</span></div></td>
    </tr>
    <tr>
      <td colspan="2"><div class="det-box"><span class="det-lbl">{$lblPAyanNode}</span><span class="det-val">{$ayanamsaText}<br>{$nodeTypeText}</span></div></td>
    </tr>
  </table>
</div>

{$rasiNavamsaRowHtml}
<div class="panel">
  <div class="panel-title">{$doshaSecTitle}</div>
  {$doshaCardsHtml}
</div>
HTML;

        // ---------------- PAGE 2: 8 Life Guidance Cards ----------------
        // Rebuild the same whole-sign house-lord indicators used by the Node/
        // browser report. The legacy PHP summary is intentionally not used here:
        // it was generic, categorical, and could disagree with the chart.
        $p2Sub = $isTa ? 'ஜாதக வாழ்க்கை வழிகாட்டல்' : ($isHi ? 'कुंडली जीवन मार्गदर्शन' : 'Astrological Life Guidance');
        $planetPositionsForLife = is_array($result['planetPositions'] ?? null) ? $result['planetPositions'] : [];
        $bhavaByGrahaForLife = [];
        $rasiByGrahaForLife = [];
        $flagsByGrahaForLife = [];
        $longitudeByGrahaForLife = [];
        $dignityByGrahaForLife = [];
        foreach ($planetPositionsForLife as $p) {
            if (!is_array($p)) { continue; }
            $grahaKey = strtolower((string)($p['graha'] ?? ''));
            if ($grahaKey === '') {
                $nameKey = strtolower((string)($p['nameEn'] ?? ''));
                foreach (['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] as $candidate) {
                    if (strpos($nameKey, $candidate) !== false) { $grahaKey = $candidate; break; }
                }
            }
            if ($grahaKey === '') { continue; }
            $bhavaValue = $normalizeRasiNumber($p['bhavaNumber'] ?? $p['house'] ?? null);
            if ($bhavaValue !== null) { $bhavaByGrahaForLife[$grahaKey] = $bhavaValue; }
            $flagsByGrahaForLife[$grahaKey] = [
                'isCombust' => !empty($p['isCombust']),
                'isRetrograde' => !empty($p['isRetrograde']),
            ];
            $rasiRaw = $p['rasi'] ?? $p['rasiNumber'] ?? null;
            if ($rasiRaw === null && isset($p['rasiIdx'])) {
                $rasiIdxRaw = $p['rasiIdx'];
                if (is_numeric($rasiIdxRaw) && (float) $rasiIdxRaw === (float) (int) $rasiIdxRaw && (int) $rasiIdxRaw >= 0 && (int) $rasiIdxRaw <= 11) {
                    $rasiRaw = (int) $rasiIdxRaw + 1;
                }
            }
            $rasiValue = $normalizeRasiNumber($rasiRaw);
            if ($rasiValue !== null) { $rasiByGrahaForLife[$grahaKey] = $rasiValue; }
            // Items 2/3 need the graha's longitude (10° conjunction orb) and its
            // dignity. Prefer the engine's own totalDegrees, else rebuild it from
            // the rasi + degrees the same way the TypeScript engine does.
            $totalDegreesForLife = null;
            if (is_numeric($p['totalDegrees'] ?? null)) {
                $totalDegreesForLife = fmod((float) $p['totalDegrees'] + 360.0, 360.0);
            } elseif ($rasiValue !== null) {
                $degreesForLife = $p['degrees'] ?? null;
                if (is_numeric($degreesForLife) && is_finite((float) $degreesForLife)) {
                    $totalDegreesForLife = fmod((($rasiValue - 1) * 30.0) + (float) $degreesForLife, 360.0);
                }
            }
            if ($totalDegreesForLife !== null) {
                if ($totalDegreesForLife < 0) { $totalDegreesForLife += 360.0; }
                $longitudeByGrahaForLife[$grahaKey] = $totalDegreesForLife;
            }
            $dignityByGrahaForLife[$grahaKey] = is_array($p['dignity'] ?? null) ? $p['dignity'] : null;
        }
        $rasiLordsForLife = [1 => 'mars', 2 => 'venus', 3 => 'mercury', 4 => 'moon', 5 => 'sun', 6 => 'mercury', 7 => 'venus', 8 => 'mars', 9 => 'jupiter', 10 => 'saturn', 11 => 'saturn', 12 => 'jupiter'];
        $lordNamesEnForLife = ['mars' => 'Mars', 'venus' => 'Venus', 'mercury' => 'Mercury', 'moon' => 'Moon', 'sun' => 'Sun', 'jupiter' => 'Jupiter', 'saturn' => 'Saturn', 'rahu' => 'Rahu', 'ketu' => 'Ketu'];
        $lordNamesTaForLife = ['mars' => 'செவ்வாய்', 'venus' => 'சுக்கிரன்', 'mercury' => 'புதன்', 'moon' => 'சந்திரன்', 'sun' => 'சூரியன்', 'jupiter' => 'குரு', 'saturn' => 'சனி', 'rahu' => 'ராகு', 'ketu' => 'கேது'];
        $lordNamesHiForLife = ['mars' => 'मंगल', 'venus' => 'शुक्र', 'mercury' => 'बुध', 'moon' => 'चंद्र', 'sun' => 'सूर्य', 'jupiter' => 'गुरु', 'saturn' => 'शनि', 'rahu' => 'राहु', 'ketu' => 'केतु'];
        // Item 4: Neecha rasi of the seven classical grahas only. Rahu and Ketu
        // are deliberately absent: the classical texts contradict each other
        // (Rahu=Scorpio/Ketu=Taurus in one school, Sagittarius/Gemini in
        // another), and the shared dignity engine reports the nodes as
        // 'not-applicable'. The old table invented Rahu-in-Scorpio and
        // Ketu-in-Taurus, so a card could call a node debilitated while the
        // Navagraha table said the nodes have no sign dignity.
        $debilitationRasiForLife = ['sun' => 7, 'moon' => 8, 'mars' => 4, 'mercury' => 12, 'jupiter' => 10, 'venus' => 6, 'saturn' => 1];
        // Item 3a: exaltation (uchcha) and own sign (swakshetra) rasis, the same
        // two tables src/lib/astrology/dignity.ts uses.
        $exaltationRasiForLife = ['sun' => 1, 'moon' => 2, 'mars' => 10, 'mercury' => 6, 'jupiter' => 4, 'venus' => 12, 'saturn' => 7];
        $ownSignsForLife = ['sun' => [5], 'moon' => [4], 'mars' => [1, 8], 'mercury' => [3, 6], 'jupiter' => [9, 12], 'venus' => [2, 7], 'saturn' => [10, 11]];
        $naturalMaleficsForLife = ['mars' => true, 'saturn' => true, 'rahu' => true, 'ketu' => true];
        // Item 2: a malefic counts as conjunct only inside this orb (degrees),
        // never merely by sharing a rasi.
        $lifeConjunctionOrbDeg = 10.0;
        $lifeIsDebilitated = function ($grahaKey, $rasiNum, $dignityRow) use ($debilitationRasiForLife) {
            if (is_array($dignityRow) && array_key_exists('isDebilitated', $dignityRow)) {
                return !empty($dignityRow['isDebilitated']);
            }
            return isset($debilitationRasiForLife[$grahaKey]) && $rasiNum === $debilitationRasiForLife[$grahaKey];
        };
        $lifeIsDignified = function ($grahaKey, $rasiNum, $dignityRow) use ($exaltationRasiForLife, $ownSignsForLife) {
            if (is_array($dignityRow) && array_key_exists('isExalted', $dignityRow)) {
                return !empty($dignityRow['isExalted']) || !empty($dignityRow['isOwnSign']);
            }
            return (($exaltationRasiForLife[$grahaKey] ?? null) === $rasiNum)
                || in_array($rasiNum, $ownSignsForLife[$grahaKey] ?? [], true);
        };
        $lifeLongitude = function ($grahaKey) use ($longitudeByGrahaForLife) {
            return array_key_exists($grahaKey, $longitudeByGrahaForLife) ? (float) $longitudeByGrahaForLife[$grahaKey] : null;
        };
        $lagnaRasiForLife = $normalizeRasiNumber($result['lagnaRasi'] ?? null);
        $getLifePlacement = function ($houseNum) use ($lagnaRasiForLife, $rasiLordsForLife, $bhavaByGrahaForLife, $rasiByGrahaForLife, $flagsByGrahaForLife, $naturalMaleficsForLife, $lifeConjunctionOrbDeg, $lifeIsDebilitated, $lifeIsDignified, $lifeLongitude, $dignityByGrahaForLife, $isTa, $isHi, $lordNamesEnForLife, $lordNamesTaForLife, $lordNamesHiForLife) {
            $unavailable = [
                'lordGraha' => null,
                'bhava' => null,
                'isAvailable' => false,
                'isOwnSign' => null,
                'isDusthana' => null,
                'isDebilitated' => null,
                'isCombust' => null,
                'isRetrograde' => null,
                'isChallenging' => false,
                'reason' => '',
            ];
            if (!is_int($lagnaRasiForLife) || $lagnaRasiForLife < 1 || $lagnaRasiForLife > 12 ||
                !is_int($houseNum) || $houseNum < 1 || $houseNum > 12) {
                return $unavailable;
            }
            $targetSign = (($lagnaRasiForLife - 1 + ($houseNum - 1)) % 12) + 1;
            $lordGraha = $rasiLordsForLife[$targetSign] ?? null;
            if ($lordGraha === null) { return $unavailable; }
            $bhava = $bhavaByGrahaForLife[$lordGraha] ?? null;
            $placedSign = $rasiByGrahaForLife[$lordGraha] ?? null;
            if (!is_int($bhava) || $bhava < 1 || $bhava > 12 || !is_int($placedSign) || $placedSign < 1 || $placedSign > 12) {
                return $unavailable;
            }

            // Dusthana houses come from the shared rules file, not a literal here.
            $isDusthana = in_array($bhava, astro_life_card_rules()['dusthanaHouses'], true);
            $isDebilitated = $lifeIsDebilitated($lordGraha, $placedSign, $dignityByGrahaForLife[$lordGraha] ?? null);
            $isDignifiedLord = $lifeIsDignified($lordGraha, $placedSign, $dignityByGrahaForLife[$lordGraha] ?? null);
            $isCombust = !empty($flagsByGrahaForLife[$lordGraha]['isCombust']);
            $isRetrograde = !empty($flagsByGrahaForLife[$lordGraha]['isRetrograde']);
            // Item 2: degree-based orb, not sign-sharing. Item 3b: a debilitated
            // malefic is in its weakest state, so it is not a strong malefic.
            $strongMaleficNames = [];
            $weakMaleficNames = [];
            $lordLongitude = $lifeLongitude($lordGraha);
            if ($lordLongitude !== null) {
                foreach ($bhavaByGrahaForLife as $g => $gBhava) {
                    if ($g === $lordGraha || empty($naturalMaleficsForLife[$g])) { continue; }
                    $maleficLongitude = $lifeLongitude($g);
                    if ($maleficLongitude === null) { continue; }
                    $separation = abs($maleficLongitude - $lordLongitude);
                    if ($separation > 180.0) { $separation = 360.0 - $separation; }
                    if ($separation > $lifeConjunctionOrbDeg) { continue; }
                    $maleficName = $isTa ? ($lordNamesTaForLife[$g] ?? $g) : ($isHi ? ($lordNamesHiForLife[$g] ?? $g) : ($lordNamesEnForLife[$g] ?? $g));
                    if ($lifeIsDebilitated($g, $rasiByGrahaForLife[$g] ?? null, $dignityByGrahaForLife[$g] ?? null)) {
                        $weakMaleficNames[] = $maleficName;
                    } else {
                        $strongMaleficNames[] = $maleficName;
                    }
                }
            }
            // Item 3a: an exalted / own-sign lord offsets exactly ONE malefic
            // conjunction; the rest still count.
            $dignityOffsetCount = ($isDignifiedLord && !empty($strongMaleficNames)) ? 1 : 0;
            $offsetMaleficNames = array_slice($strongMaleficNames, 0, $dignityOffsetCount);
            $conjunctNames = array_slice($strongMaleficNames, $dignityOffsetCount, 2);
            $reasons = [];
            if ($isDusthana) { $reasons[] = $isTa ? ($bhava . '-ஆம் சவாலான பாவத்தில்') : ($isHi ? (self::houseOrdinalHi($bhava) . ' चुनौतीपूर्ण भाव में') : ('placed in a challenging ' . self::houseOrdinalEn($bhava) . ' house')); }
            if ($isDebilitated) { $reasons[] = $isTa ? 'நீச நிலையில்' : ($isHi ? 'नीच राशि में' : 'debilitated'); }
            if ($isCombust) { $reasons[] = $isTa ? 'சூரியனுக்கு அருகில் அஸ்தமன நிலையில்' : ($isHi ? 'सूर्य के निकट अस्त' : 'combust/too close to Sun'); }
            if (!empty($conjunctNames)) { $reasons[] = $isTa ? ($lifeConjunctionOrbDeg . '°-க்குள் ' . implode('/', $conjunctNames) . ' சேர்க்கையுடன்') : ($isHi ? ($lifeConjunctionOrbDeg . '° के भीतर ' . implode('/', $conjunctNames) . ' के साथ') : ('joined within ' . $lifeConjunctionOrbDeg . '° with ' . implode('/', $conjunctNames))); }
            if (!empty($offsetMaleficNames)) { $reasons[] = $isTa ? ('உச்ச/சொந்த ராசி அதிபதி ஒரு பாவச் சேர்க்கையை ஈடுசெய்கிறார் (' . implode('/', $offsetMaleficNames) . ')') : ($isHi ? ('उच्च/स्वराशि का स्वामी एक पाप-युति की भरपाई करता है (' . implode('/', $offsetMaleficNames) . ')') : ('exalted/own-sign lord offsets one malefic conjunction (' . implode('/', $offsetMaleficNames) . ')')); }
            if (!empty($weakMaleficNames)) { $reasons[] = $isTa ? (implode('/', $weakMaleficNames) . ' நீச நிலையில் உள்ளதால் வலுவான பாவ கிரகமாகக் கணக்கிடப்படவில்லை') : ($isHi ? (implode('/', $weakMaleficNames) . ' नीच होने से प्रबल पाप ग्रह नहीं माना गया है') : (implode('/', $weakMaleficNames) . ' is debilitated, so not counted as a strong malefic')); }
            if ($isRetrograde) { $reasons[] = $isTa ? 'வக்கிரமாக இருப்பதால் பொறுமை தேவை' : ($isHi ? 'वक्री होने से धैर्य आवश्यक' : 'retrograde, requiring review and patience'); }
            return [
                'lordGraha' => $lordGraha,
                'bhava' => $bhava,
                'isAvailable' => true,
                'isOwnSign' => (($rasiLordsForLife[$placedSign] ?? '') === $lordGraha),
                'isDusthana' => $isDusthana,
                'isDebilitated' => $isDebilitated,
                'isDignifiedLord' => $isDignifiedLord,
                'isCombust' => $isCombust,
                'isRetrograde' => $isRetrograde,
                'isChallenging' => $isDusthana || $isDebilitated || $isCombust || !empty($conjunctNames),
                'reason' => implode(', ', $reasons),
            ];
        };
        $lifeLordName = function ($placement) use ($isTa, $isHi, $lordNamesEnForLife, $lordNamesTaForLife, $lordNamesHiForLife) {
            $key = $placement['lordGraha'] ?? null;
            if ($key === null) return 'N/A';
            return $isTa ? ($lordNamesTaForLife[$key] ?? 'N/A') : ($isHi ? ($lordNamesHiForLife[$key] ?? 'N/A') : ($lordNamesEnForLife[$key] ?? 'N/A'));
        };
        $lifeBadge = function ($houseNum, $placement) use ($isTa, $isHi) {
            if (empty($placement['isAvailable'])) {
                return $isTa ? ($houseNum . '-ஆம் அதிபதி → N/A') : ($isHi ? (self::houseOrdinalHi($houseNum) . ' भाव का स्वामी → N/A') : (self::houseOrdinalEn($houseNum) . ' lord → N/A'));
            }
            // The verdict wording comes from the shared rules file, so the PDF and
            // the browser report cannot drift apart on how a verdict is phrased.
            $lifeRules = astro_life_card_rules();
            $suffixSet = !empty($placement['isChallenging']) ? $lifeRules['badgeChallenging'] : $lifeRules['badgeSupportive'];
            $suffix = $isTa ? $suffixSet['ta'] : ($isHi ? $suffixSet['hi'] : $suffixSet['en']);
            return $isTa ? ($houseNum . '-ஆம் அதிபதி → ' . $placement['bhava'] . '-ஆம் பாவம்' . $suffix) : ($isHi ? (self::houseOrdinalHi($houseNum) . ' भाव का स्वामी → ' . self::houseOrdinalHi($placement['bhava']) . ' भाव' . $suffix) : (self::houseOrdinalEn($houseNum) . ' lord → ' . self::houseOrdinalEn($placement['bhava']) . ' house' . $suffix));
        };
        $lifeStatus = function ($placement) use ($isTa, $isHi, $lifeLordName) {
            if (empty($placement['isAvailable'])) return 'N/A';
            if (!empty($placement['reason'])) {
                if (!$isHi) { return $placement['reason']; }
                $trimmedReason = trim((string) preg_replace('/।\s*$/u', '', (string) $placement['reason']));
                return preg_match('/(?:है|हैं)(?:\s*\([^)]*\))?$/u', $trimmedReason) ? $trimmedReason : ($trimmedReason . ' है');
            }
            return $isTa ? ($lifeLordName($placement) . ' ஆதரவு நிலையில்') : ($isHi ? ($lifeLordName($placement) . ' सहायक स्थिति में है') : ($lifeLordName($placement) . ' in a supportive placement'));
        };
        $lifePos = function ($placement) use ($isTa, $isHi, $lifeLordName) {
            if (empty($placement['isAvailable'])) return 'N/A';
            return $isTa ? ($lifeLordName($placement) . ' ' . $placement['bhava'] . '-ஆம் பாவத்தில்') : ($isHi ? ($lifeLordName($placement) . ' ' . self::houseOrdinalHi($placement['bhava']) . ' भाव में') : ($lifeLordName($placement) . ' in the ' . self::houseOrdinalEn($placement['bhava']) . ' house'));
        };

        // Item 6: natural karakas and the role houses, named on the same cards
        // as the browser report — Venus (marriage), Jupiter (wealth), the 11th lord
        // (income/Labha) and the 6th lord (health/Roga). A missing graha yields
        // '' so a card never invents a placement.
        $reportNamesForLife = [
            'sun' => $isTa ? 'சூரியன்' : ($isHi ? 'सूर्य' : 'Surya'),
            'moon' => $isTa ? 'சந்திரன்' : ($isHi ? 'चंद्र' : 'Chandra'),
            'mars' => $isTa ? 'செவ்வாய்' : ($isHi ? 'मंगल' : 'Mangal'),
            'mercury' => $isTa ? 'புதன்' : ($isHi ? 'बुध' : 'Budha'),
            'jupiter' => $isTa ? 'குரு' : ($isHi ? 'गुरु' : 'Guru'),
            'venus' => $isTa ? 'சுக்கிரன்' : ($isHi ? 'शुक्र' : 'Sukra'),
            'saturn' => $isTa ? 'சனி' : ($isHi ? 'शनि' : 'Sani'),
            'rahu' => $isTa ? 'ராகு' : ($isHi ? 'राहु' : 'Rahu'),
            'ketu' => $isTa ? 'கேது' : ($isHi ? 'केतु' : 'Ketu'),
        ];
        $karakaLineForLife = function ($grahaKey, $roleTa, $roleHi, $roleEn) use ($bhavaByGrahaForLife, $rasiByGrahaForLife, $dignityByGrahaForLife, $reportNamesForLife, $rasiNamesByNumber, $lang, $isTa, $isHi) {
            $bhavaForKaraka = $bhavaByGrahaForLife[$grahaKey] ?? null;
            if (!is_int($bhavaForKaraka) || $bhavaForKaraka < 1 || $bhavaForKaraka > 12) { return ''; }
            $karakaName = $reportNamesForLife[$grahaKey] ?? $grahaKey;
            $rasiNumForKaraka = $rasiByGrahaForLife[$grahaKey] ?? null;
            $karakaRasiLabel = ($rasiNumForKaraka !== null && isset($rasiNamesByNumber[$rasiNumForKaraka]))
                ? $rasiNamesByNumber[$rasiNumForKaraka][$lang] : '';
            $karakaDignity = $dignityByGrahaForLife[$grahaKey] ?? null;
            $karakaDignityText = '';
            if (is_array($karakaDignity)) {
                $karakaDignityLabel = $isTa ? ($karakaDignity['statusTa'] ?? '') : ($isHi ? ($karakaDignity['statusHi'] ?? '') : ($karakaDignity['statusEn'] ?? ''));
                if (is_string($karakaDignityLabel) && $karakaDignityLabel !== ''
                    && !preg_match('/^(Neutral|சம நிலை|सामान्य स्थिति)/u', $karakaDignityLabel)) {
                    $karakaDignityText = ' (' . $karakaDignityLabel . ')';
                }
            }
            $karakaPlace = $isTa ? ($bhavaForKaraka . '-ஆம் பாவத்தில்') : ($isHi ? (self::houseOrdinalHi($bhavaForKaraka) . ' भाव में') : ('in the ' . self::houseOrdinalEn($bhavaForKaraka) . ' house'));
            $karakaRole = $isTa ? $roleTa : ($isHi ? $roleHi : $roleEn);
            if ($isHi) {
                return ' ' . $karakaRole . ': ' . $karakaName . ' ' . $karakaPlace . $karakaDignityText . ($karakaRasiLabel !== '' ? ' — ' . $karakaRasiLabel . ' राशि में' : '') . ' स्थित है।';
            }
            return ' ' . $karakaRole . ': ' . $karakaName . ' ' . $karakaPlace . $karakaDignityText . ($karakaRasiLabel !== '' ? ' — ' . $karakaRasiLabel : '') . '.';
        };
        $lifeLordRoleLine = function ($houseNum, $roleTa, $roleHi, $roleEn) use ($getLifePlacement, $lifePos, $isTa, $isHi) {
            $placementForRole = $getLifePlacement($houseNum);
            if (empty($placementForRole['isAvailable'])) { return ''; }
            $roleState = !empty($placementForRole['isChallenging'])
                ? ($isTa ? 'கவனம் தேவை' : ($isHi ? 'ध्यान आवश्यक है' : 'needs attention'))
                : ($isTa ? 'ஆதரவு நிலை' : ($isHi ? 'सहायक स्थिति में है' : 'supportive'));
            $roleName = $isTa ? $roleTa : ($isHi ? $roleHi : $roleEn);
            $endMark = $isHi ? '।' : '.';
            return ' ' . $roleName . ': ' . $lifePos($placementForRole) . ' — ' . $roleState . $endMark;
        };
        $venusLineForLife = $karakaLineForLife('venus', 'திருமண காரகன் சுக்கிரன்', 'विवाह कारक शुक्र', 'Venus, karaka of marriage');
        $jupiterLineForLife = $karakaLineForLife('jupiter', 'தன காரகன் குரு', 'धन कारक गुरु', 'Jupiter, karaka of wealth');
        $incomeLordLineForLife = $lifeLordRoleLine(11, '11-ஆம் அதிபதி (வருமானம்/லாபம்)', '11वें भाव का स्वामी (आय/लाभ)', '11th lord (income/Labha)');
        $healthLordLineForLife = $lifeLordRoleLine(6, '6-ஆம் அதிபதி (ஆரோக்கியம்/ரோகம்)', 'छठे भाव का स्वामी (स्वास्थ्य/रोग)', '6th lord (health/Roga)');

        $h1Life = $getLifePlacement(1); $h2Life = $getLifePlacement(2); $h4Life = $getLifePlacement(4); $h5Life = $getLifePlacement(5);
        $h7Life = $getLifePlacement(7); $h9Life = $getLifePlacement(9); $h10Life = $getLifePlacement(10);
        // Item 1: the running Mahadasa lord is resolved from the engine's Graha
        // ENUM key (dashaPeriods[].mahadashaLord, e.g. 'venus'/'saturn'), never
        // from the display text — the report labels those two "Sukra"/"Sani"
        // while the dasha block says "Venus"/"Saturn". Only older payloads
        // without dashaPeriods fall back to a name -> key lookup.
        $dashaPeriodsForLife = is_array($result['dashaPeriods'] ?? null) ? $result['dashaPeriods'] : [];
        $currentDashaLordKeyForLife = null;
        $dashaPeriodStartForLife = '';
        foreach ($dashaPeriodsForLife as $periodForLife) {
            if (is_array($periodForLife) && !empty($periodForLife['isCurrent'])) {
                $currentDashaLordKeyForLife = strtolower((string) ($periodForLife['mahadashaLord'] ?? ''));
                $dashaPeriodStartForLife = (string) ($periodForLife['startDate'] ?? '');
                break;
            }
        }
        if (($currentDashaLordKeyForLife === null || $currentDashaLordKeyForLife === '') && is_array($result['dasha'] ?? null)) {
            $dashaNameToKeyForLife = [
                'surya' => 'sun', 'sun' => 'sun', 'chandra' => 'moon', 'moon' => 'moon',
                'mangal' => 'mars', 'mars' => 'mars', 'budha' => 'mercury', 'mercury' => 'mercury',
                'guru' => 'jupiter', 'jupiter' => 'jupiter', 'sukra' => 'venus', 'venus' => 'venus',
                'sani' => 'saturn', 'saturn' => 'saturn', 'rahu' => 'rahu', 'ketu' => 'ketu',
            ];
            $dashaLordNameRaw = strtolower(trim((string) ($result['dasha']['currentLord'] ?? '')));
            $currentDashaLordKeyForLife = $dashaNameToKeyForLife[$dashaLordNameRaw] ?? null;
        }
        if ($currentDashaLordKeyForLife === '') { $currentDashaLordKeyForLife = null; }
        $dashaPlacementAvailableForLife = $currentDashaLordKeyForLife !== null
            && isset($bhavaByGrahaForLife[$currentDashaLordKeyForLife])
            && is_int($bhavaByGrahaForLife[$currentDashaLordKeyForLife]);
        $dashaDebilitatedSignsForLife = ['sun' => 7, 'moon' => 8, 'mars' => 4, 'mercury' => 12, 'jupiter' => 10, 'venus' => 6, 'saturn' => 1];
        $dashaRasiForLife = $currentDashaLordKeyForLife !== null ? ($rasiByGrahaForLife[$currentDashaLordKeyForLife] ?? null) : null;
        $dashaIsDebilitatedForLife = $currentDashaLordKeyForLife !== null
            && isset($dashaDebilitatedSignsForLife[$currentDashaLordKeyForLife])
            && $dashaRasiForLife === $dashaDebilitatedSignsForLife[$currentDashaLordKeyForLife];
        $dashaIsChallengingForLife = $dashaPlacementAvailableForLife
            ? (in_array($bhavaByGrahaForLife[$currentDashaLordKeyForLife], [6, 8, 12], true)
                || $dashaIsDebilitatedForLife
                || !empty($flagsByGrahaForLife[$currentDashaLordKeyForLife]['isCombust'])
                || !empty($flagsByGrahaForLife[$currentDashaLordKeyForLife]['isRetrograde']))
            : null;
        $dashaLordNameForLife = $currentDashaLordKeyForLife !== null
            ? ($isTa ? ($lordNamesTaForLife[$currentDashaLordKeyForLife] ?? null) : ($isHi ? ($lordNamesHiForLife[$currentDashaLordKeyForLife] ?? null) : ($lordNamesEnForLife[$currentDashaLordKeyForLife] ?? null)))
            : null;
        $dashaLabelForLife = $dashaLordNameForLife !== null
            ? ($isTa ? ($dashaLordNameForLife . ' மகாதிசை' . ($dashaPeriodStartForLife !== '' ? ' (' . $dashaPeriodStartForLife . ' முதல்)' : ''))
                : ($isHi ? ($dashaLordNameForLife . ' महादशा' . ($dashaPeriodStartForLife !== '' ? ' (' . $dashaPeriodStartForLife . ' से)' : ''))
                : ($dashaLordNameForLife . ' Mahadasa' . ($dashaPeriodStartForLife !== '' ? ' (from ' . $dashaPeriodStartForLife . ')' : ''))))
            : ($currentDasha ?: ($isTa ? 'நடப்பு தசை' : ($isHi ? 'वर्तमान दशा' : 'Current dasha')));
        // Items 4/6/7b: the 9th lord in the 8th is a caution (never "நன்மை /
        // Good"), Sarala / own-sign Saturn are named, Kendradhipati is quoted by
        // the Career and Marriage cards, and a Mahadasa change inside 12 months
        // is always announced.
        $ninthLordInEighthNow = false;
        $saralaYogaNow = null;
        $saturnOwnYogaNow = null;
        foreach ((array) ($result['yogas'] ?? []) as $yogaNote) {
            if (!is_array($yogaNote)) { continue; }
            if (($yogaNote['code'] ?? '') === 'NINTH_LORD_IN_EIGHTH') { $ninthLordInEighthNow = true; }
            if (($yogaNote['code'] ?? '') === 'SARALA') { $saralaYogaNow = $yogaNote; }
            if (($yogaNote['code'] ?? '') === 'SATURN_OWN_SIGN') { $saturnOwnYogaNow = $yogaNote; }
        }
        $fortuneLeadTa = $ninthLordInEighthNow ? 'கவனம்' : 'நன்மை';
        $fortuneLeadHi = $ninthLordInEighthNow ? 'सावधानी' : 'शुभ';
        $fortuneLeadEn = $ninthLordInEighthNow ? 'Caution' : 'Good';
        $fortuneCautionTa = $ninthLordInEighthNow ? ' 9-ஆம் அதிபதி 8-ஆம் பாவத்தில் உள்ளதால் இது நன்மையாகக் கணக்கிடப்படவில்லை; பாக்கியம் முயற்சி, தாமதம் அல்லது ஆராய்ச்சி வழியே வரும்.' : '';
        $fortuneCautionHi = $ninthLordInEighthNow ? ' नवमेश अष्टम भाव में होने से इसे शुभ नहीं माना गया है; भाग्य परिश्रम, विलंब या शोध से मिलता है।' : '';
        $fortuneCautionEn = $ninthLordInEighthNow ? ' The 9th lord sits in the 8th house, so this is read as a caution rather than a benefit: fortune arrives through effort, delay or research.' : '';
        $yogaExtraTa = ($saralaYogaNow ? ' ' . ($saralaYogaNow['nameTa'] ?? '') . '.' : '') . ($saturnOwnYogaNow ? ' ' . ($saturnOwnYogaNow['nameTa'] ?? '') . '.' : '');
        $yogaExtraHi = ($saralaYogaNow ? ' ' . ($saralaYogaNow['nameHi'] ?? '') . ' है।' : '') . ($saturnOwnYogaNow ? ' ' . ($saturnOwnYogaNow['nameHi'] ?? '') . ' है।' : '');
        $yogaExtraEn = ($saralaYogaNow ? ' ' . ($saralaYogaNow['nameEn'] ?? '') . '.' : '') . ($saturnOwnYogaNow ? ' ' . ($saturnOwnYogaNow['nameEn'] ?? '') . '.' : '');
        $kendraCareerNoteTa = '';
        $kendraCareerNoteHi = '';
        $kendraCareerNoteEn = '';
        $kendraMarriageNoteTa = '';
        $kendraMarriageNoteHi = '';
        $kendraMarriageNoteEn = '';
        foreach ((array) ($result['kendradhipati'] ?? []) as $kendraEntry) {
            if (!is_array($kendraEntry)) { continue; }
            $kendraHouses = array_map('intval', (array) ($kendraEntry['houses'] ?? []));
            if (in_array(10, $kendraHouses, true)) {
                $kendraCareerNoteTa = ' ' . ($kendraEntry['descriptionTa'] ?? '');
                $kendraCareerNoteHi = ' ' . ($kendraEntry['descriptionHi'] ?? '');
                $kendraCareerNoteEn = ' ' . ($kendraEntry['descriptionEn'] ?? '');
            }
            if (in_array(7, $kendraHouses, true)) {
                $kendraMarriageNoteTa = ' ' . ($kendraEntry['descriptionTa'] ?? '');
                $kendraMarriageNoteHi = ' ' . ($kendraEntry['descriptionHi'] ?? '');
                $kendraMarriageNoteEn = ' ' . ($kendraEntry['descriptionEn'] ?? '');
            }
        }
        $nextMahadasaReport = is_array($result['dasha']['nextMahadasa'] ?? null) ? $result['dasha']['nextMahadasa'] : [];
        $dashaNoticeTa = !empty($nextMahadasaReport['within12Months']) ? (string) ($nextMahadasaReport['noticeTa'] ?? '') : '';
        $dashaNoticeHi = !empty($nextMahadasaReport['within12Months']) ? (string) ($nextMahadasaReport['noticeHi'] ?? '') : '';
        $dashaNoticeEn = !empty($nextMahadasaReport['within12Months']) ? (string) ($nextMahadasaReport['noticeEn'] ?? '') : '';

        $lifeCardsData = [
            [
                'title' => $isTa ? 'ஆரோக்கியம் & நல்வாழ்வு' : ($isHi ? 'स्वास्थ्य एवं आरोग्य' : 'Health & Vitality'),
                'badge' => $lifeBadge(1, $h1Life), 'caution' => $h1Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: லக்னாதிபதி ' . $lifePos($h1Life) . ' இருப்பதால் உடல் சக்தி மேம்பட முயற்சி, உணவு ஒழுக்கம் உதவும். கவனம்: ' . $lifeStatus($h1Life) . '; பலவீனம் இருந்தால் உடல் வலி, சோர்வு, தோல்/வயிறு எரிச்சல் போன்ற சிறு தொந்தரவுகள் வரலாம். அறிகுறிகள் இருந்தால் மருத்துவரை அணுகவும்.' . $healthLordLineForLife
                    : ($isHi ? 'शुभ: लग्नेश ' . $lifePos($h1Life) . ' होने से ऊर्जा संभालने में दिनचर्या, आहार और व्यायाम सहायक रहेंगे। सावधानी: ' . $lifeStatus($h1Life) . '; कमजोरी हो तो शरीर-दर्द, थकान, त्वचा/पेट की परेशानी हो सकती है। लक्षण हों तो डॉक्टर से मिलें।' . $healthLordLineForLife : 'Good: Lagna lord ' . $lifePos($h1Life) . ' supports vitality when routine, diet, and movement are maintained. Caution: ' . $lifeStatus($h1Life) . '; if weak, body pain, fatigue, skin irritation or stomach sensitivity may trouble you. Seek medical care for symptoms.' . $healthLordLineForLife),
            ],
            [
                'title' => $isTa ? 'தனம் & நிதி நிலை' : ($isHi ? 'धन एवं संपत्ति' : 'Wealth & Finance'),
                'badge' => $lifeBadge(2, $h2Life), 'caution' => $h2Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: தனாதிபதி ' . $lifePos($h2Life) . ' இருப்பதால் சேமிப்பு, குடும்ப ஆதரவு, வருமான திட்டம் பலன் தரலாம். கவனம்: ' . $lifeStatus($h2Life) . '; செலவு அதிகரிப்பு, கடன் அழுத்தம் அல்லது பணம் தாமதம் வரலாம். பட்ஜெட் அவசியம்.' . $jupiterLineForLife . $incomeLordLineForLife
                    : ($isHi ? 'शुभ: धनेश ' . $lifePos($h2Life) . ' बचत, परिवार-सहयोग और आय-योजना में मदद दे सकता है। सावधानी: ' . $lifeStatus($h2Life) . '; खर्च, कर्ज-दबाव या पैसा अटकना दिख सकता है। बजट रखें।' . $jupiterLineForLife . $incomeLordLineForLife : 'Good: 2nd lord ' . $lifePos($h2Life) . ' can support savings, family resources, and income planning. Caution: ' . $lifeStatus($h2Life) . '; watch for higher expenses, debt pressure, or delayed payments. Keep a budget.' . $jupiterLineForLife . $incomeLordLineForLife),
            ],
            [
                'title' => $isTa ? 'கல்வி & அறிவுத்திறன்' : ($isHi ? 'शिक्षा एवं बौद्धिकता' : 'Education & Intellect'),
                'badge' => $lifeBadge(5, $h5Life), 'caution' => $h5Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: 5-ஆம் அதிபதி ' . $lifePos($h5Life) . ' இருப்பதால் நினைவாற்றல், படைப்பாற்றல், தேர்வு தயாரிப்பு மேம்படலாம். கவனம்: ' . $lifeStatus($h5Life) . '; கவனம் சிதறல், மறதி, பாடத்தில் இடைவேளை வரலாம். தினசரி திட்டம் தேவை.'
                    : ($isHi ? 'शुभ: पंचमेश ' . $lifePos($h5Life) . ' स्मरण-शक्ति, रचनात्मकता और परीक्षा-तैयारी में सहायक हो सकता है। सावधानी: ' . $lifeStatus($h5Life) . '; ध्यान भटकना, भूलना या पढ़ाई में रुकावट आ सकती है। दैनिक योजना रखें।' : 'Good: 5th lord ' . $lifePos($h5Life) . ' can help memory, creativity, and exam preparation. Caution: ' . $lifeStatus($h5Life) . '; concentration breaks, forgetfulness, or study gaps may occur. Use a daily study plan.'),
            ],
            [
                'title' => $isTa ? 'தொழில் & உத்தியோகம்' : ($isHi ? 'व्यवसाय एवं आजीविका' : 'Career & Profession'),
                'badge' => $lifeBadge(10, $h10Life), 'caution' => $h10Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: 10-ஆம் அதிபதி ' . $lifePos($h10Life) . ' இருப்பதால் பொறுப்பு, பெயர், திறன் வளர்ச்சி வாய்ப்பு உண்டு. கவனம்: ' . $lifeStatus($h10Life) . '; வேலை தாமதம், மேலதிகாரி உராய்வு, திட்ட மாற்றம் வரலாம். ஆவணங்களையும் காலக்கெடுவையும் கவனிக்கவும்.' . $kendraCareerNoteTa
                    : ($isHi ? 'शुभ: दशमेश ' . $lifePos($h10Life) . ' जिम्मेदारी, पहचान और कौशल-विकास में मदद दे सकता है। सावधानी: ' . $lifeStatus($h10Life) . '; काम में देरी, वरिष्ठों से मतभेद या योजना-बदलाव हो सकता है। दस्तावेज़ और समय-सीमा संभालें।' . $kendraCareerNoteHi : 'Good: 10th lord ' . $lifePos($h10Life) . ' can support responsibility, recognition, and skill growth. Caution: ' . $lifeStatus($h10Life) . '; delays, friction with seniors, or project changes may arise. Watch documents and deadlines.' . $kendraCareerNoteEn),
            ],
            [
                'title' => $isTa ? 'திருமணம் & உறவு' : ($isHi ? 'विवाह एवं सम्बंध' : 'Marriage & Relations'),
                'badge' => $lifeBadge(7, $h7Life), 'caution' => $h7Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: 7-ஆம் அதிபதி ' . $lifePos($h7Life) . ' இருப்பதால் துணை/கூட்டாண்மை ஆதரவு கிடைக்கலாம். கவனம்: ' . $lifeStatus($h7Life) . '; தவறான புரிதல், தாமதம், வாக்குவாதம் வரலாம். மெதுவாக பேசுவது நல்லது.' . $venusLineForLife . $kendraMarriageNoteTa
                    : ($isHi ? 'शुभ: सप्तमेश ' . $lifePos($h7Life) . ' जीवनसाथी/साझेदारी से सहयोग दे सकता है। सावधानी: ' . $lifeStatus($h7Life) . '; गलतफहमी, देरी या बहस हो सकती है। शांत संवाद रखें।' . $venusLineForLife . $kendraMarriageNoteHi : 'Good: 7th lord ' . $lifePos($h7Life) . ' can support spouse/partner cooperation. Caution: ' . $lifeStatus($h7Life) . '; misunderstanding, delay, or arguments may occur. Use patient communication.' . $venusLineForLife . $kendraMarriageNoteEn),
            ],
            [
                'title' => $isTa ? 'வீடு, நிலம் & சொத்து' : ($isHi ? 'भूमि, भवन एवं संपत्ति' : 'Property & Real Estate'),
                'badge' => $lifeBadge(4, $h4Life), 'caution' => $h4Life['isChallenging'],
                'text' => $isTa
                    ? 'நன்மை: 4-ஆம் அதிபதி ' . $lifePos($h4Life) . ' இருப்பதால் வீட்டு வசதி, வாகனம், மன அமைதி மேம்படலாம். கவனம்: ' . $lifeStatus($h4Life) . '; வீடு/நில ஆவண தாமதம், பழுது செலவு, குடும்ப மனஅழுத்தம் வரலாம். சரிபார்ப்பு அவசியம்.'
                    : ($isHi ? 'शुभ: चतुर्थेश ' . $lifePos($h4Life) . ' घर-सुख, वाहन और मानसिक शांति में मदद दे सकता है। सावधानी: ' . $lifeStatus($h4Life) . '; संपत्ति कागज़, मरम्मत खर्च या घरेलू तनाव आ सकता है। जाँच ज़रूरी है।' : 'Good: 4th lord ' . $lifePos($h4Life) . ' can support home comfort, vehicle matters, and peace of mind. Caution: ' . $lifeStatus($h4Life) . '; property-document delays, repair expenses, or family stress may arise. Verify carefully.'),
            ],
            [
                'title' => $isTa ? 'பயணம் & அதிர்ஷ்டம்' : ($isHi ? 'विदेश यात्रा एवं भाग्य' : 'Travel & Global Fortune'),
                'badge' => $lifeBadge(9, $h9Life), 'caution' => $h9Life['isChallenging'],
                'text' => $isTa
                    ? $fortuneLeadTa . ': 9-ஆம் அதிபதி ' . $lifePos($h9Life) . ' இருப்பதால் குரு அருள், பயணம், உயர் கற்றல் வாய்ப்பு கிடைக்கலாம். கவனம்: ' . $lifeStatus($h9Life) . '; பயண தாமதம், விசா/ஆவண பிரச்சனை, வழிகாட்டி மாற்றம் வரலாம். முன்கூட்டியே திட்டமிடவும்.' . $fortuneCautionTa . $yogaExtraTa
                    : ($isHi ? $fortuneLeadHi . ': नवमेश ' . $lifePos($h9Life) . ' गुरु-कृपा, यात्रा और उच्च शिक्षा के अवसर दे सकता है। सावधानी: ' . $lifeStatus($h9Life) . '; यात्रा देरी, वीज़ा/कागज़ समस्या या मार्गदर्शन बदल सकता है। पहले से योजना करें।' . $fortuneCautionHi . $yogaExtraHi : $fortuneLeadEn . ': 9th lord ' . $lifePos($h9Life) . ' can support blessings, travel, and higher learning. Caution: ' . $lifeStatus($h9Life) . '; travel delays, visa/document issues, or mentor changes may happen. Plan early.' . $fortuneCautionEn . $yogaExtraEn),
            ],
            [
                'title' => $isTa ? 'தற்போதைய வழிகாட்டல்' : ($isHi ? 'ज्योतिषीय मार्गदर्शन' : 'Current Guidance'),
                'badge' => $dashaIsChallengingForLife === null
                    ? 'N/A'
                    : ($dashaIsChallengingForLife
                        ? ($isTa ? 'நடப்பு ஆண்டு ⚠ கவனம்' : ($isHi ? 'आगामी वर्ष ⚠ सावधान' : 'Upcoming Year ⚠ Caution'))
                        : ($isTa ? 'நடப்பு ஆண்டு ✓ வாய்ப்பு' : ($isHi ? 'आगामी वर्ष ✓ अवसर' : 'Upcoming Year ✓ Opportunity'))),
                'caution' => $dashaIsChallengingForLife === true,
                'text' => $isTa ? 'ஜென்ம ராசி மற்றும் ' . $dashaLabelForLife . '.' . ($dashaNoticeTa !== '' ? ' ' . $dashaNoticeTa : '') . ' நன்மை: பழைய முயற்சிகளை முடித்து ஆன்மீக தெளிவு பெறலாம். கவனம்: அடுத்த 12 மாதங்களில் அவசர முடிவு, ஆரோக்கிய அலட்சியம், தேவையற்ற செலவு தவிர்க்கவும்.' : ($isHi ? 'जन्म राशि और ' . $dashaLabelForLife . ' सक्रिय है।' . ($dashaNoticeHi !== '' ? ' ' . $dashaNoticeHi : '') . ' शुभ: पुराने कार्य पूरे करके आध्यात्मिक स्पष्टता मिल सकती है। सावधानी: अगले 12 महीनों में जल्दबाज़ निर्णय, स्वास्थ्य-लापरवाही और अनावश्यक खर्च से बचें।' : 'Janma Rasi and ' . $dashaLabelForLife . '.' . ($dashaNoticeEn !== '' ? ' ' . $dashaNoticeEn : '') . ' Good: the next 12 months can help complete pending efforts and improve spiritual clarity. Caution: avoid rushed decisions, health neglect, and unnecessary spending.'),
            ],
        ];

        $lifePlacementsForCards = [$h1Life, $h2Life, $h5Life, $h10Life, $h7Life, $h4Life, $h9Life];
        $lifeHouseNumbersForCards = [1, 2, 5, 10, 7, 4, 9];
        $unavailableLifeText = $isTa
            ? 'தேவையான கிரக நிலை கிடைக்கவில்லை (N/A); இந்த ஜாதகத்திற்கான வழிகாட்டலைத் தீர்மானிக்க முடியாது.'
            : ($isHi ? 'आवश्यक ग्रह स्थिति उपलब्ध नहीं है (N/A); इस कुंडली के लिए मार्गदर्शन निर्धारित नहीं किया जा सकता है।' : 'Required planetary placement unavailable (N/A); chart-specific guidance cannot be determined.');
        foreach ($lifePlacementsForCards as $index => $placement) {
            if (!empty($placement['isAvailable'])) { continue; }
            $lifeCardsData[$index]['badge'] = $lifeBadge($lifeHouseNumbersForCards[$index], $placement);
            $lifeCardsData[$index]['caution'] = false;
            $lifeCardsData[$index]['text'] = $unavailableLifeText;
        }

        $lifeDisclaimer = $isTa ? 'பாரம்பரிய ஜோதிடக் குறியீடுகள் மட்டுமே; மருத்துவம், நிதி, சட்டம் அல்லது உறவு ஆலோசனை அல்ல.' : ($isHi ? 'ये पारंपरिक ज्योतिषीय संकेत मात्र हैं; यह चिकित्सा, वित्त, कानूनी या संबंध सलाह नहीं है।' : 'Traditional Jyotisha indicators only; not medical, financial, legal, or relationship advice.');
        $lifeCardsHtml = '<table class="life-grid">';
        for ($i = 0; $i < count($lifeCardsData); $i += 2) {
            $lifeCardsHtml .= '<tr>';
            for ($j = 0; $j < 2; $j++) {
                $card = $lifeCardsData[$i + $j] ?? null;
                if (!$card) { $lifeCardsHtml .= '<td></td>'; continue; }
                $badgeClass = !empty($card['caution']) ? 'life-card-badge badge-caution' : 'life-card-badge';
                $cardHeader = '<table style="width:100%; border-collapse:collapse; margin-bottom:1.5mm; border-bottom:1px dotted #a67c1f; padding-bottom:1mm;"><tr><td style="font-size:12px; font-weight:bold; color:#7a1f1f; vertical-align:top; text-align:left; width:58%;">' . self::e($card['title']) . '</td><td style="text-align:right; vertical-align:top; width:42%;"><span class="' . $badgeClass . '">' . self::e($card['badge']) . '</span></td></tr></table>';
                $lifeCardsHtml .= '<td class="life-card">' . $cardHeader . '<p>' . self::e($card['text']) . '</p></td>';
            }
            $lifeCardsHtml .= '</tr>';
        }
        $lifeCardsHtml .= '</table>';

        $page2Html = self::topHeader('ASTRO SIVAM', $p2Sub, $orderNumber, 2, self::JATHAGAM_PAGE_TOTAL, $lang, '', true);
        $page2Html .= '<div class="life-disclaimer">' . self::e($lifeDisclaimer) . '</div>' . $lifeCardsHtml;

        // ---------------- PAGE 3: Short Summary (one A4, always) ----------------
        // Plain-language readback of pages 1 and 2. The supportive / needs-care
        // lists come from the ONE shared rule (classifyJathagamPlanetsForSummary,
        // mirrored from src/services/jathagamPlanetSummary.ts), and the remedies
        // come from the Navagraha reference data (deity / weekday / charity) plus
        // the additive lamp-oil and mantra fields. Everything is drawn from the
        // computed chart; nothing is hardcoded, and the page is laid out in
        // tables only, because print renderers have no flexbox or grid.
        $summary = self::classifyJathagamPlanetsForSummary($result, $lang);
        $summaryTexts = self::jathagamSummaryText($lang);
        $summaryText = $summaryTexts['text'];
        $summaryLabels = $summaryTexts['labels'];
        $summaryRemedyData = self::jathagamSummaryRemedyData();
        $isCompact = !empty($summary['compact']);

        $summaryPlanetNameRaw = static function (string $key) use ($summaryRemedyData, $lang): string {
            return (string) ($summaryRemedyData[$key]['name'][$lang] ?? $key);
        };
        $summaryPlanetName = static function (string $key) use ($summaryPlanetNameRaw): string {
            return self::e($summaryPlanetNameRaw($key));
        };

        $padaText = ($pada === '' || $pada === 'N/A')
            ? 'N/A'
            : ($isTa ? "{$pada}-ஆம் பாதம்" : ($isHi ? "पाद {$pada}" : "Pada {$pada}"));

        $summaryCell = static function (string $label, string $value, int $span = 1): string {
            return '<td class="summary-cell"' . ($span === 2 ? ' colspan="2"' : '') . '>'
                . '<div class="summary-detail-label">' . self::e($label) . '</div>'
                . '<div class="summary-detail-value">' . $value . '</div></td>';
        };
        $summaryDetailsHtml = '<table class="summary-details"><tr>'
            . $summaryCell($isTa ? 'பெயர்' : ($isHi ? 'नाम' : 'Name'), $name)
            . $summaryCell($isTa ? 'பிறந்த தேதி' : ($isHi ? 'जन्म तिथि' : 'Birth Date'), $dob)
            . $summaryCell($isTa ? 'பிறந்த நேரம்' : ($isHi ? 'जन्म समय' : 'Birth Time'), $tob)
            . $summaryCell($isTa ? 'பிறந்த இடம்' : ($isHi ? 'जन्म स्थान' : 'Birth Place'), $place)
            . '</tr><tr>'
            . $summaryCell($isTa ? 'லக்னம்' : ($isHi ? 'लग्न' : 'Lagna'), $lagnaRasi)
            . $summaryCell($isTa ? 'ராசி' : ($isHi ? 'राशि' : 'Rasi'), $rasiName)
            . $summaryCell($isTa ? 'நட்சத்திரம்' : ($isHi ? 'नक्षत्र' : 'Nakshatra'), $nakName . ' — ' . self::e($padaText), 2)
            . '</tr></table>';

        $summaryGoodRows = '';
        if (!empty($summary['supportive'])) {
            $perRow = count($summary['supportive']) === 4 ? 4 : 3;
            foreach (array_chunk($summary['supportive'], $perRow) as $rowPlanets) {
                $rowCells = '';
                foreach ($rowPlanets as $planet) {
                    $rowCells .= '<td class="summary-planet">'
                        . '<div class="summary-planet-name">' . $summaryPlanetName((string) $planet['key']) . '</div>'
                        . '<div class="summary-planet-note">'
                        . self::e((string) ($summaryRemedyData[$planet['key']]['support'][$lang] ?? '')) . '</div></td>';
                }
                while (count($rowPlanets) < $perRow) {
                    $rowCells .= '<td class="summary-planet-empty"></td>';
                    $rowPlanets[] = null;
                }
                $summaryGoodRows .= '<tr>' . $rowCells . '</tr>';
            }
        }
        $summaryGoodHtml = $summaryGoodRows === ''
            ? '<div class="summary-empty">' . self::e($summaryText['noSupportPlanet']) . '</div>'
            : '<table class="summary-good">' . $summaryGoodRows . '</table>';

        $summaryCareRows = '';
        foreach ($summary['needsCare'] as $planet) {
            if ($isCompact) {
                $remedyCell = '<div class="summary-care-compact">' . self::e((string) $planet['compactLine']) . '</div>';
            } else {
                $remedyCell = '<div class="summary-care-line"><span class="summary-care-label">'
                        . self::e($summaryLabels['worship']) . '</span> ' . self::e((string) $planet['worship']) . '</div>'
                    . '<div class="summary-care-line"><span class="summary-care-label">'
                        . self::e($summaryLabels['lamp']) . '</span> ' . self::e((string) $planet['lamp']) . '</div>'
                    . '<div class="summary-care-line"><span class="summary-care-label">'
                        . self::e($summaryLabels['donation']) . '</span> ' . self::e((string) $planet['donation']) . '</div>'
                    . '<div class="summary-care-line"><span class="summary-care-label">'
                        . self::e($summaryLabels['mantra']) . '</span> ' . self::e((string) $planet['mantra']) . '</div>';
            }
            $summaryCareRows .= '<tr><td class="summary-care-planet">' . $summaryPlanetName((string) $planet['key'])
                . '</td><td>' . self::e((string) $planet['difficulties']) . '</td><td>' . $remedyCell . '</td></tr>';
        }
        if ($summaryCareRows === '') {
            $summaryCareRows = '<tr><td colspan="3" class="summary-empty">' . self::e($summaryText['noCarePlanet']) . '</td></tr>';
        }
        $summaryCareHtml = '<table class="summary-care"><colgroup>'
            . '<col style="width:15%" /><col style="width:28%" /><col style="width:57%" /></colgroup><thead><tr>'
            . '<th>' . self::e($summaryText['tablePlanet']) . '</th>'
            . '<th>' . self::e($summaryText['tableDifficulties']) . '</th>'
            . '<th>' . self::e($summaryText['tableRemedies']) . '</th>'
            . '</tr></thead><tbody>' . $summaryCareRows . '</tbody></table>';
        // A chart with a placement the rule could not read must never look
        // "all clean": the page says so instead of implying a clear chart.
        if (empty($summary['assessmentComplete'])) {
            $summaryCareHtml .= '<div class="summary-empty summary-incomplete">'
                . self::e((string) ($summary['incompleteNote'] ?? $summaryText['assessmentIncomplete'])) . '</div>';
        }

        $summarySupportNames = [];
        foreach ($summary['supportive'] as $planet) {
            $summarySupportNames[] = $summaryPlanetNameRaw((string) $planet['key']);
        }
        $summaryCareNames = [];
        foreach ($summary['needsCare'] as $planet) {
            $summaryCareNames[] = $summaryPlanetNameRaw((string) $planet['key']);
        }
        // Pick the sentence form that stays grammatical when a side is empty.
        $summaryLeadTemplate = $summarySupportNames === []
            ? (string) $summaryText['summaryLeadNoSupport']
            : ($summaryCareNames === []
                ? (string) $summaryText['summaryLeadNoCare']
                : (string) $summaryText['summaryLead']);
        $summaryLead = str_replace(
            ['{supportive}', '{care}'],
            [implode(', ', $summarySupportNames), implode(', ', $summaryCareNames)],
            $summaryLeadTemplate
        );
        $summarySentences = implode(' ', array_values(array_filter(
            [
                $summaryLead,
                (string) $summaryText['summaryRemedy'],
                $isCompact ? (string) $summaryText['compactModeNote'] : ''
            ],
            static function ($part) {
                return trim((string) $part) !== '';
            }
        )));

        $page3Html = self::topHeader('ASTRO SIVAM', $summaryText['subtitle'], $orderNumber, 3, self::JATHAGAM_PAGE_TOTAL, $lang, '', true);
        $page3Html .= '<div class="summary-card">'
            . '<div class="summary-card-title">' . self::e($summaryText['detailsTitle']) . '</div>'
            . $summaryDetailsHtml . '</div>';
        // Lucky indicators (birth stone / colour / numbers) from the janma
        // nakshatra lord — mirrored from
        // src/services/jathagamLuckyData.ts (Tamil Ratna Sastra convention).
        $luckyText = self::jathagamLuckyText($lang);
        $lucky = self::resolveJathagamLuckyIndicators(
            $result['janmaNakshatraIndex'] ?? ($result['nakshatram']['index'] ?? null),
            $lang
        );
        $luckyCell = static function (string $label, string $value): string {
            return '<td class="summary-cell lucky-cell">'
                . '<div class="summary-detail-label">' . self::e($label) . '</div>'
                . '<div class="summary-detail-value lucky-value">' . self::e($value) . '</div></td>';
        };
        $luckyRow = static function (string $head, string $sub, array $cells) use ($luckyCell): string {
            $html = '<div class="lucky-row-head">' . self::e($head)
                . ' <span class="lucky-row-sub">' . self::e($sub) . '</span></div>'
                . '<table class="summary-details lucky-grid"><tr>';
            foreach ($cells as $cell) {
                $html .= $luckyCell($cell[0], $cell[1]);
            }
            return $html . '</tr></table>';
        };
        $page3Html .= '<div class="summary-card lucky" id="summary-lucky">'
            . '<div class="summary-card-title lucky">' . self::e($luckyText['title']) . '</div>'
            . $luckyRow(
                $luckyText['nakshatraRow'],
                html_entity_decode($nakName, ENT_QUOTES, 'UTF-8') . ' · ' . $luckyText['lord'] . ': ' . $lucky['nakshatraLordName'],
                [
                    [$luckyText['birthStone'], $lucky['birthStone']],
                    [$luckyText['luckyColour'], $lucky['luckyColour']],
                    [$luckyText['luckyNumbers'], $lucky['luckyNumbers']],
                ]
            )
            . '<p class="lucky-note">' . self::e($isCompact ? $luckyText['noteShort'] : $luckyText['note']) . '</p></div>';
        $page3Html .= '<div class="summary-card good">'
            . '<div class="summary-card-title good">' . self::e($summaryText['supportiveTitle']) . '</div>'
            . $summaryGoodHtml . '</div>';
        $page3Html .= '<div class="summary-card care">'
            . '<div class="summary-card-title care">' . self::e($summaryText['careTitle']) . '</div>'
            . $summaryCareHtml . '</div>';
        $page3Html .= '<div class="summary-card">'
            . '<div class="summary-card-title">' . self::e($summaryText['summaryTitle']) . '</div>'
            . '<p class="summary-short">' . self::e($summarySentences) . '</p>'
            . '<p class="summary-short">' . self::e($summaryText['dailyHabit']) . '</p></div>';
        $page3Html .= '<div class="summary-reassurance">' . self::e($summaryText['reassurance']) . '</div>';

        $glossarySubtitle = $isTa ? 'சொல் விளக்கம்' : ($isHi ? 'शब्दार्थ' : 'Plain-language guide to this report');
        $glossaryBody = astro_report_glossary_html('BIRTH_JATHAGAM', $lang);
        $glossarySheetHtml = $glossaryBody === ''
            ? ''
            : '<div class="sheet glossary-sheet" id="birth-glossary-sheet">'
                . self::topHeader('ASTRO SIVAM', $glossarySubtitle, $orderNumber, 4, self::JATHAGAM_PAGE_TOTAL, $lang, '', true)
                . $glossaryBody . self::footerBand($lang) . '</div>';

        $css = self::sharedCss($lang) . self::birthSummaryCss();
        return '<!DOCTYPE html><html lang="' . self::e($lang) . '"><head><meta charset="UTF-8"><title>ASTRO SIVAM - Birth Jathagam Report</title><style>' . $css . '</style></head><body>'
            . '<div class="sheet">' . $page1Html . self::footerBand($lang) . '</div><pagebreak />'
            . '<div class="sheet">' . $page2Html . ($yogaNotesCardHtml ?? '') . self::footerBand($lang) . '</div><pagebreak />'
            . '<div class="sheet' . ($isCompact ? ' is-compact' : '') . '" id="birth-summary-sheet">' . $page3Html . self::footerBand($lang) . '</div><pagebreak />'
            // Report Guide & Glossary: the wording lives in
            // api/astrology/report_glossary.json and is shared with the browser
            // builder, so the printed PDF and the preview explain a term the
            // same way. Skipped entirely if the JSON is unreadable.
            . $glossarySheetHtml
            . '</body></html>';
    }

}
