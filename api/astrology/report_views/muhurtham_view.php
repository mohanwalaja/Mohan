<?php
/**
 * ASTRO SIVAM — Subha Muhurtham Calendar HTML Builder
 */

trait AstroReportMuhurthamTrait
{
    // =====================================================================
    // MUHURTHAM - SUBHA MUHURTHAM SIX-MONTH CALENDAR
    // Layout: exactly 2 pages.
    //   page 1: devotee details + every recommended date of the six-month scan
    //   page 2: calendar rows that overflowed (upper half) + the calculation
    //             system guide (lower half)
    // Mirrors src/services/muhurthamHtmlBuilder.ts so the browser preview,
    // the admin preview and the emailed PDF are byte-identical.
    // =====================================================================
    public static function generateMuhurthamHtml($order, $result): string {
        $lang = astro_report_normalize_language($order['language'] ?? 'en');
        $isTa = ($lang === 'ta');
        $isHi = ($lang === 'hi');

        if (!is_array($result)) {
            $result = [];
        }
        if (empty($result['months']) && class_exists('AstroEngine')) {
            $input = $order['input_payload'] ?? [];
            if (!is_array($input)) {
                $input = json_decode((string) $input, true) ?: [];
            }
            if (!empty($input['muhurthamScan'])) {
                try {
                    $result = AstroEngine::calculateMuhurtham($input);
                } catch (\Throwable $e) {
                    error_log('Muhurtham recalculation failed: ' . $e->getMessage());
                }
            }
        }

        $months = [];
        if (!empty($result['months']) && is_array($result['months'])) {
            $months = $result['months'];
        } else {
            foreach (['prevMonth', 'chosenMonth', 'nextMonth'] as $legacyKey) {
                if (!empty($result[$legacyKey]['days']) && is_array($result[$legacyKey]['days'])) {
                    $months[] = $result[$legacyKey];
                }
            }
        }

        $rules = class_exists('AstroEngine') ? AstroEngine::getMuhurthamRules() : [];
        $eventKey = (string) ($result['eventKey'] ?? 'wedding');
        $event = is_array($rules[$eventKey] ?? null) ? $rules[$eventKey] : [];
        // Date calendar plus a compact ceremony-specific selection guide.
        $weekdayNamesByLang = [
            'en' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            'ta' => ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'],
            'hi' => ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
        ];
        $weekdayNames = $isTa ? $weekdayNamesByLang['ta'] : ($isHi ? $weekdayNamesByLang['hi'] : $weekdayNamesByLang['en']);

        $eventTitle = $isTa
            ? ($result['eventTitleTa'] ?? $event['titleTa'] ?? 'சுப முகூர்த்தம்')
            : ($isHi
                ? ($result['eventTitleHi'] ?? $event['titleHi'] ?? 'शुभ मुहूर्त')
                : ($result['eventTitleEn'] ?? $event['titleEn'] ?? 'Subha Muhurtham'));

        $eventDescription = $isTa
            ? ($result['eventDescriptionTa'] ?? $event['descriptionTa'] ?? '')
            : ($isHi
                ? ($result['eventDescriptionHi'] ?? $event['descriptionHi'] ?? '')
                : ($result['eventDescriptionEn'] ?? $event['descriptionEn'] ?? ''));

        $windowLabel = $isTa
            ? ($result['windowLabelTa'] ?? 'தேர்ந்தெடுத்த மாதத்திற்கு முன் 2 மாதங்கள் + தேர்ந்தெடுத்த மாதம் மற்றும் அதற்குப் பின் 3 மாதங்கள்')
            : ($isHi
                ? ($result['windowLabelHi'] ?? 'चुने हुए महीने से पहले 2 महीने + चयनित माह और उसके बाद के 3 महीने')
                : ($result['windowLabelEn'] ?? '2 months before the selected month + the selected month and the following 3 months'));

        $devoteeName = self::e($result['devoteeName'] ?? ($order['user_name'] ?? 'User'));
        $dob = self::e(self::birthDate($result['dob'] ?? '', '—'));
        $tob = self::e($result['tob'] ?? '—');
        $birthPlaceRaw = trim((string) ($result['birthPlace'] ?? '—'));
        $countryRaw = trim((string) ($result['country'] ?? ''));
        $birthPlace = self::e($countryRaw && stripos($birthPlaceRaw, $countryRaw) === false ? $birthPlaceRaw . ', ' . $countryRaw : $birthPlaceRaw);
        $muhurthamPlaceRaw = trim((string) ($result['muhurthamPlace'] ?? 'the selected place'));
        $muhurthamCountryRaw = trim((string) ($result['muhurthamCountry'] ?? ''));
        $muhurthamPlace = self::e($muhurthamCountryRaw && stripos($muhurthamPlaceRaw, $muhurthamCountryRaw) === false
            ? $muhurthamPlaceRaw . ', ' . $muhurthamCountryRaw
            : $muhurthamPlaceRaw);

        // Both charts of a wedding, exactly as the browser and Node builders
        // print them: name, birth details and their own Nakshatra / Rasi / Lagna.
        $persons = [];
        foreach ((array) ($result['persons'] ?? []) as $person) {
            if (!is_array($person)) { continue; }
            $role = (string) ($person['role'] ?? 'self');
            if (!in_array($role, ['bride', 'groom', 'child', 'mother', 'self'], true)) { $role = 'self'; }
            $personStar = $isTa
                ? ($person['nakshatraNameTa'] ?? $person['nakshatraNameEn'] ?? '')
                : ($isHi ? ($person['nakshatraNameHi'] ?? $person['nakshatraNameEn'] ?? '') : ($person['nakshatraNameEn'] ?? ''));
            $personRasi = $isTa
                ? ($person['rasiNameTa'] ?? $person['rasiNameEn'] ?? '')
                : ($isHi ? ($person['rasiNameHi'] ?? $person['rasiNameEn'] ?? '') : ($person['rasiNameEn'] ?? ''));
            $personLagna = $isTa
                ? ($person['lagnaNameTa'] ?? $person['lagnaNameEn'] ?? '')
                : ($isHi ? ($person['lagnaNameHi'] ?? $person['lagnaNameEn'] ?? '') : ($person['lagnaNameEn'] ?? ''));
            $persons[] = [
                'role' => $role,
                'name' => (string) ($person['name'] ?? ''),
                'dob' => self::birthDate($person['dob'] ?? ''),
                'tob' => (string) ($person['tob'] ?? ''),
                'place' => (string) ($person['birthPlace'] ?? ''),
                'star' => (string) $personStar,
                'rasi' => (string) $personRasi,
                'lagna' => (string) $personLagna
            ];
        }
        $bridePerson = null; $groomPerson = null;
        foreach ($persons as $person) {
            if ($person['role'] === 'bride' && $bridePerson === null) { $bridePerson = $person; }
            if ($person['role'] === 'groom' && $groomPerson === null) { $groomPerson = $person; }
        }
        $singlePersonMode = !($bridePerson && $groomPerson);
        // The window line is the real covered range ("07 Oct 2026 – 31 Mar 2027").
        $windowRange = class_exists('AstroEngine') ? AstroEngine::muhurthamWindowRange($months) : '';
        if ($windowRange !== '') { $windowLabel = $windowRange; }

        $t = [
            'docTitle' => $isTa ? 'சுப முகூர்த்த அறிக்கை' : ($isHi ? 'शुभ मुहूर्त रिपोर्ट' : 'Subha Muhurtham Report'),
            'datesTitle' => $isTa ? 'பரிந்துரைக்கப்பட்ட முகூர்த்த தேதிகள் - ஆறு மாதங்கள்' : ($isHi ? 'अनुशंसित मुहूर्त तिथियाँ - छह माह' : 'RECOMMENDED MUHURTHAM DATES - SIX MONTHS'),
            'datesSub' => $isTa ? 'தேதி · கிழமை · நட்சத்திரம் (சூரிய உதயம்) · நல்ல நேரம்' : ($isHi ? 'दिनांक · वार · नक्षत्र (सूर्योदय) · शुभ समय' : 'Date · Weekday · Nakshatra (at sunrise) · Nalla Neram'),
            'continued' => $isTa ? '1-வது பக்கத்தின் தொடர்ச்சி' : ($isHi ? 'पृष्ठ 1 से जारी' : 'Continued from page 1'),
            'certified' => $isTa ? 'சான்றளித்தவர்: ASTRO SIVAM' : ($isHi ? 'प्रमाणित: ASTRO SIVAM' : 'Certified by ASTRO SIVAM'),
            'page1' => ($isTa ? 'பக்கம்' : ($isHi ? 'पृष्ठ' : 'Page')) . ' 1 / ' . self::MUHURTHAM_PAGE_TOTAL,
            'page2Fixed' => ($isTa ? 'பக்கம்' : ($isHi ? 'पृष्ठ' : 'Page')) . ' 2 / ' . self::MUHURTHAM_PAGE_TOTAL,
            'secParticulars' => $isTa ? 'பயனர் விவரம்' : ($isHi ? 'उपयोगकर्ता विवरण' : 'USER PARTICULARS'),
            'lblName' => $isTa ? 'பெயர்' : ($isHi ? 'नाम' : 'NAME'),
            'lblDob' => $isTa ? 'பிறந்த தேதி' : ($isHi ? 'जन्म तिथि' : 'DATE OF BIRTH'),
            'lblTob' => $isTa ? 'பிறந்த நேரம்' : ($isHi ? 'जन्म समय' : 'TIME OF BIRTH'),
            'lblPlace' => $isTa ? 'முகூர்த்த இடம் (உள்ளூர் நேரம்)' : ($isHi ? 'मुहूर्त स्थान (स्थानीय समय)' : 'MUHURTHAM LOCATION (LOCAL TIMES)'),
            'lblBirthPlace' => $isTa ? 'ஜன்ம நட்சத்திரத்திற்கான பிறந்த இடம்' : ($isHi ? 'जन्म नक्षत्र हेतु जन्म स्थान' : 'Birth place for Janma Nakshatra'),
            'lblBest' => $isTa ? 'உத்தமம்' : ($isHi ? 'उत्तम' : 'BEST'),
            'lblGood' => $isTa ? 'சுபம்' : ($isHi ? 'शुभ' : 'GOOD'),
            'lblDate' => $isTa ? 'தேதி' : ($isHi ? 'तिथि' : 'DATE'),
            'lblDay' => $isTa ? 'கிழமை' : ($isHi ? 'वार' : 'DAY'),
            'lblStar' => $isTa ? 'நட்சத்திரம்' : ($isHi ? 'नक्षत्र' : 'STAR'),
            'lblNalla' => $isTa ? 'நல்ல நேரம்' : ($isHi ? 'शुभ समय' : 'NALLA NERAM'),
            'lblGrade' => $isTa ? 'தரம்' : ($isHi ? 'श्रेणी' : 'GRADE'),
            'lblNoDays' => $isTa ? 'இந்த மாதத்தில் சிறந்த அல்லது சுப தேதிகள் இல்லை.' : ($isHi ? 'इस माह में कोई उत्तम या शुभ तिथि उपलब्ध नहीं है।' : 'No BEST or GOOD dates in this month.'),
            'secCouple' => $isTa ? 'மணமகன் & மணமகள் விவரங்கள்' : ($isHi ? 'वर एवं वधू विवरण' : 'BRIDE & GROOM PARTICULARS'),
            'lblStar' => $isTa ? 'ஜன்ம நட்சத்திரம்' : ($isHi ? 'जन्म नक्षत्र' : 'JANMA NAKSHATRA'),
            'lblRasi' => $isTa ? 'ராசி' : ($isHi ? 'राशि' : 'RASI'),
            'lblLagna' => $isTa ? 'லக்னம்' : ($isHi ? 'लग्न' : 'LAGNA'),
            'lblBride' => $isTa ? 'மணமகள்' : ($isHi ? 'वधू' : 'BRIDE'),
            'lblGroom' => $isTa ? 'மணமகன்' : ($isHi ? 'वर' : 'GROOM'),
            'singlePersonNote' => $isTa
                ? 'ஒருவரின் விவரங்கள் மட்டும் பயன்படுத்தப்பட்டன — சந்திராஷ்டமம் மற்றும் தாரா பலம் இந்த ஒருவரின் ஜாதகத்திற்கு மட்டுமே சரிபார்க்கப்பட்டது.'
                : ($isHi
                    ? 'केवल एक व्यक्ति का विवरण उपयोग किया गया है — चंद्राष्टम और तारा बल केवल इसी जातक की कुंडली से जाँचे गए हैं।'
                    : 'Only one person\'s details were used - Chandrashtama and Tara Bala were checked for that single chart alone.'),
            'lblReference' => $isTa ? 'குறிப்பு எண்' : ($isHi ? 'संदर्भ क्रमांक' : 'REFERENCE'),
            'lblIssuedOn' => $isTa ? 'வழங்கப்பட்ட நாள்' : ($isHi ? 'जारी तिथि' : 'ISSUED ON'),
            'lblPreparedFor' => $isTa ? 'இவர்களுக்காக' : ($isHi ? 'हेतु तैयार' : 'PREPARED FOR'),
            'lblSignatory' => $isTa ? 'அங்கீகரிக்கப்பட்ட கையொப்பம்' : ($isHi ? 'अधिकृत हस्ताक्षरकर्ता' : 'AUTHORISED SIGNATORY'),
            'signatoryDesk' => $isTa ? 'ASTRO SIVAM வேத ஆய்வு மையம்' : ($isHi ? 'ASTRO SIVAM वैदिक अनुसंधान केंद्र' : 'ASTRO SIVAM Vedic Research Desk')
        ];

        // =====================================================================
        // TWO-PAGE LAYOUT - dates plus a compact selection guide on page 2
        // Mirrors src/services/muhurthamHtmlBuilder.ts and Node jsPDF generator
        // =====================================================================
        $page1BudgetMm = 160;   // date rows share A4 space below the centered cover header
        $page2BudgetMm = 78;    // keep continuation dates above the guide + authorisation block on page 2
        $densityTiers = [
            ['fontPx' => 9.4, 'padMm' => 1.5],
            ['fontPx' => 8.6, 'padMm' => 1.15],
            ['fontPx' => 7.8, 'padMm' => 0.9],
            ['fontPx' => 7.1, 'padMm' => 0.7],
            ['fontPx' => 6.5, 'padMm' => 0.55],
            ['fontPx' => 6.0, 'padMm' => 0.4]
        ];
        $hasPersonalNotes = false;   // set once the rows are built, below
        $muhurthamRowHeight = function ($fontPx, $padMm) use (&$hasPersonalNotes) {
            return $fontPx * 0.3528 * 1.5 + $padMm * 2 + 0.3 + ($hasPersonalNotes ? $fontPx * 0.3528 * 1.5 : 0);
        };

        $monthBlocks = [];
        foreach ($months as $monthIndex => $month) {
            $monthLabel = $isTa
                ? ($month['monthNameTa'] ?? $month['monthNameEn'] ?? '')
                : ($isHi ? ($month['monthNameHi'] ?? $month['monthNameEn'] ?? '') : ($month['monthNameEn'] ?? ''));
            $monthLabel = (string) $monthLabel;
            $rows = [];
            $bestInMonth = 0;
            $recommendedInMonth = 0;
            foreach ((array) ($month['days'] ?? []) as $day) {
                if (!is_array($day)) { continue; }
                $grade = strtoupper((string) ($day['grade'] ?? ''));
                if ($grade !== 'BEST' && $grade !== 'GOOD') { continue; }
                $recommendedInMonth++;
                if ($grade === 'BEST') { $bestInMonth++; }
                $dateStr = substr((string) ($day['date'] ?? ''), 0, 10);
                $dayNum = $dateStr;
                $weekday = (string) ($day['dayOfWeekName' . ($isTa ? 'Ta' : ($isHi ? 'Hi' : 'En'))] ?? '');
                $ts = strtotime($dateStr . ' UTC');
                if ($ts !== false) {
                    $dayNum = (string) (int) gmdate('j', $ts);
                    if ($weekday === '') { $weekday = $weekdayNames[(int) gmdate('w', $ts)]; }
                }
                $star = $isTa
                    ? ($day['nakshatraNameTa'] ?? $day['nakshatraNameEn'] ?? '')
                    : ($isHi ? ($day['nakshatraNameHi'] ?? $day['nakshatraNameEn'] ?? '') : ($day['nakshatraNameEn'] ?? ''));
                $isPersonal = self::isPersonalMuhurthamDay($day);
                $rows[] = [
                    'kind' => 'date',
                    'isPersonal' => $isPersonal,
                    'isBest' => ($grade === 'BEST'),
                    'dayNum' => $dayNum,
                    'weekday' => (string) $weekday,
                    'star' => (string) $star,
                    'nalla' => self::muhurthamNallaCompactLabel($day['nallaNeram'] ?? []),
                    'grade' => self::muhurthamGradeLabel($grade, $lang),
                    // Small per-date line proving the Chandrashtama / Tara Bala
                    // check ran for each person (mirrors the browser builder).
                    'note' => (string) ($isTa
                        ? ($day['personalNoteTa'] ?? $day['personalNoteEn'] ?? '')
                        : ($isHi ? ($day['personalNoteHi'] ?? $day['personalNoteEn'] ?? '') : ($day['personalNoteEn'] ?? '')))
                ];
            }
            $bandCounts = $recommendedInMonth
                ? ($bestInMonth . ' ' . $t['lblBest'] . '  ·  ' . ($recommendedInMonth - $bestInMonth) . ' ' . $t['lblGood'])
                : $t['lblNoDays'];
            if (count($rows) === 0) {
                $rows[] = ['kind' => 'note', 'text' => $t['lblNoDays']];
            }
            $monthBlocks[] = ['label' => $monthLabel, 'counts' => $bandCounts, 'rows' => $rows, 'recommended' => $recommendedInMonth];
        }

        $calendarRows = [];
        foreach ($monthBlocks as $blockIndex => $block) {
            $calendarRows[] = ['kind' => 'band', 'block' => $blockIndex, 'label' => $block['label'], 'counts' => $block['counts']];
            foreach ($block['rows'] as $row) {
                $row['block'] = $blockIndex;
                $calendarRows[] = $row;
            }
        }

        // When any date carries the ♥ mark, page 1 shows a one-line text legend
        // explaining how heart-marked dates differ from the other good dates.
        $hasPersonalDates = false;
        foreach ($calendarRows as $calendarRow) {
            if (!empty($calendarRow['isPersonal'])) { $hasPersonalDates = true; break; }
        }
        // Reserve the legend's height so date rows never overflow page 1.
        $effectivePage1BudgetMm = $page1BudgetMm - ($hasPersonalDates ? 11 : 0);
        if (!$singlePersonMode) { $effectivePage1BudgetMm -= 12; }
        // Every recommended row carries the per-date Chandrashtama / Tara Bala
        // line; reserve its height so no row is clipped.
        $hasPersonalNotes = false;
        foreach ($calendarRows as $calendarRow) {
            if (!empty($calendarRow['note'])) { $hasPersonalNotes = true; break; }
        }

        $density = $densityTiers[count($densityTiers) - 1];
        foreach ($densityTiers as $tier) {
            $tierRowHeight = $muhurthamRowHeight($tier['fontPx'], $tier['padMm']);
            $tierCapacity = (int) floor($effectivePage1BudgetMm / $tierRowHeight) + (int) floor($page2BudgetMm / $tierRowHeight) - 2;
            if ($tierCapacity >= count($calendarRows)) { $density = $tier; break; }
        }
        $rowHeightMm = $muhurthamRowHeight($density['fontPx'], $density['padMm']);
        if (count($calendarRows) * $rowHeightMm > ($effectivePage1BudgetMm + $page2BudgetMm)) {
            // Very wide scans: shrink instead of dropping any recommended date.
            $scale = (($effectivePage1BudgetMm + $page2BudgetMm) * 0.97) / (count($calendarRows) * $rowHeightMm);
            $density['fontPx'] = $density['fontPx'] * $scale;
            $density['padMm'] = $density['padMm'] * $scale;
            $rowHeightMm = $rowHeightMm * $scale;
        }
        $page1Capacity = max(4, (int) floor($effectivePage1BudgetMm / $rowHeightMm) - 1);
        $page2Capacity = max(0, (int) floor($page2BudgetMm / $rowHeightMm));
        $page1Rows = array_slice($calendarRows, 0, $page1Capacity);
        $page2Rows = array_slice($calendarRows, $page1Capacity);
        $page1Count = count($page1Rows);
        if ($page1Count > 1 && $page1Rows[$page1Count - 1]['kind'] === 'band' && count($page2Rows) > 0) {
            $orphan = array_pop($page1Rows);
            array_unshift($page2Rows, $orphan);
            $page1Count--;
        }
        $datesContinueOnPage2 = count($page2Rows) > 0;
        if ($datesContinueOnPage2 && $page2Rows[0]['kind'] !== 'band' && count($page2Rows) < $page2Capacity) {
            $carriedBlock = intval($page2Rows[0]['block']);
            $startedOnPage1 = false;
            foreach ($page1Rows as $row) {
                if (intval($row['block']) === $carriedBlock) { $startedOnPage1 = true; break; }
            }
            if ($startedOnPage1) {
                array_unshift($page2Rows, [
                    'kind' => 'band',
                    'block' => $carriedBlock,
                    'label' => $monthBlocks[$carriedBlock]['label'] . ' (' . $t['continued'] . ')',
                    'counts' => $monthBlocks[$carriedBlock]['counts']
                ]);
            }
        }

        $cellPad = number_format($density['padMm'], 2, '.', '');
        $cellFontPt = $density['fontPx'] * 0.75;
        $cellFont = number_format($cellFontPt, 2, '.', '');
        $bandFont = number_format($density['fontPx'] * 0.75 * 0.94, 2, '.', '');
        $renderCalendarTable = function ($rows) use ($cellPad, $cellFont, $cellFontPt, $bandFont, $t) {
            $html = '<table class="six-month-cal">';
            // Column widths mirror MUHURTHAM_DATE_COLUMN_RATIOS: the Nalla Neram
            // column is the widest because a row can carry three time windows.
            $html .= '<thead><tr>'
                . '<th style="width:19%;font-size:' . $cellFont . 'pt;padding:' . $cellPad . 'mm 1mm;">' . self::e($t['lblDate'] . ' / ' . $t['lblDay']) . '</th>'
                . '<th style="width:21%;font-size:' . $cellFont . 'pt;padding:' . $cellPad . 'mm 1mm;">' . self::e($t['lblStar']) . '</th>'
                . '<th style="width:46%;font-size:' . $cellFont . 'pt;padding:' . $cellPad . 'mm 1mm;">' . self::e($t['lblNalla']) . '</th>'
                . '<th style="width:14%;font-size:' . $cellFont . 'pt;padding:' . $cellPad . 'mm 1mm;">' . self::e($t['lblGrade']) . '</th>'
                . '</tr></thead><tbody>';
            foreach ($rows as $row) {
                if ($row['kind'] === 'band') {
                    $html .= '<tr class="cal-band"><td colspan="4" style="font-size:' . $bandFont . 'pt;padding:' . number_format($cellPad * 0.85, 2, '.', '') . 'mm 1mm;">'
                        . '<span class="band-label">' . self::e($row['label']) . '</span>'
                        . '<span class="band-counts">' . self::e($row['counts']) . '</span></td></tr>';
                    continue;
                }
                if ($row['kind'] === 'note') {
                    $html .= '<tr class="cal-note"><td colspan="4" style="font-size:' . $cellFont . 'pt;padding:' . $cellPad . 'mm 1mm;">' . self::e($row['text']) . '</td></tr>';
                    continue;
                }
                $rowClass = $row['isBest'] ? 'cal-best' : 'cal-good';
                $isPersonalRow = !empty($row['isPersonal']);
                if ($isPersonalRow) { $rowClass .= ' cal-personal'; }
                $personalBg = $isPersonalRow ? 'background:#fff1f2;' : '';
                $gradeClass = $row['isBest'] ? 'grade-best' : 'grade-good';
                // A three-window Nalla Neram line is wider than the column at the
                // larger densities: step that one cell down (same 80% floor as the
                // browser builders) so it cannot print across the grade cell.
                $timeLength = function_exists('mb_strlen') ? mb_strlen($row['nalla']) : strlen($row['nalla']);
                $timeScale = self::muhurthamTimeFontScale($timeLength, $cellFontPt);
                $timeFont = number_format($cellFontPt * $timeScale, 3, '.', '');
                $html .= '<tr class="' . $rowClass . '" style="font-size:' . $cellFont . 'pt;">'
                    . '<td class="cal-date" style="' . $personalBg . ($isPersonalRow ? 'border-left:1.2mm solid #9f1239;' : '') . 'padding:' . $cellPad . 'mm 1mm;"><b>' . self::e($row['dayNum']) . '</b> <span class="cal-weekday">' . self::e($row['weekday']) . '</span></td>'
                    . '<td class="cal-star" style="' . $personalBg . 'padding:' . $cellPad . 'mm 1mm;">' . ($isPersonalRow ? '<span class="personal-mark">&#9829;</span> ' : '') . self::e($row['star'])
                        . (!empty($row['note']) ? '<span class="cal-personal-note">' . self::e($row['note']) . '</span>' : '') . '</td>'
                    . '<td class="cal-time" style="' . $personalBg . 'padding:' . $cellPad . 'mm 1mm;font-size:' . $timeFont . 'pt;">' . self::e($row['nalla']) . '</td>'
                    . '<td class="cal-grade" style="' . $personalBg . 'padding:' . $cellPad . 'mm 0.5mm;"><span class="grade-pill ' . $gradeClass . '">' . self::e($row['grade']) . '</span></td>'
                    . '</tr>';
            }
            return $html . '</tbody></table>';
        };

        $clip = function ($text, $max) {
            $text = trim((string) $text);
            if (function_exists('mb_strlen') && function_exists('mb_substr')) {
                if (mb_strlen($text) <= $max) { return $text; }
                return rtrim(mb_substr($text, 0, $max)) . '…';
            }
            if (strlen($text) <= $max) { return $text; }
            return rtrim(substr($text, 0, $max)) . '...';
        };

        $orderNumberSafe = trim((string) ($order['order_number'] ?? $order['orderNumber'] ?? ''));
        $totalRecommendedDates = 0;
        foreach ($monthBlocks as $block) { $totalRecommendedDates += $block['recommended']; }

        $recommendedDatesLabel = $isTa ? 'பரிந்துரைக்கப்பட்ட தேதிகள்' : ($isHi ? 'अनुशंसित तिथियाँ' : 'recommended dates');
        $coverMeta = $eventTitle . ' • ' . $totalRecommendedDates . ' ' . $recommendedDatesLabel;
        // prepared-date stamp: first page only, on the LEFT of the reference
        // line — never centred with the page tag (owner request, Oct 2026).
        $preparedLabel = self::preparedDateStamp($result, $lang);
        $coverHeader = self::topHeader('ASTRO SIVAM', $t['docTitle'], $orderNumberSafe, 1, self::MUHURTHAM_PAGE_TOTAL, $lang, $coverMeta, false, $preparedLabel);

        $page1DatesHtml = $renderCalendarTable($page1Rows);

        // Build the shared notes early: page 1 needs the ♥ legend copy from it.
        $notes = MuhurthamReportNotes::build($result, $event, $lang);
        $personalDatesNoteHtml = $hasPersonalDates
            ? '<div class="personal-dates-note">' . self::e($notes['personalMarkNote']) . '</div>'
            : '';

        $cover = '<div class="sheet muhurtham-sheet report-page-break">'
            . $coverHeader
            . '<div class="muhurtham-hero"><div class="hero-event">' . self::e($eventTitle) . '</div><div class="hero-window">' . self::e($windowLabel) . '</div></div>'
            . '<div class="sec-head"><span class="sec-no">01</span>' . ($singlePersonMode ? $t['secParticulars'] : $t['secCouple']) . '</div>'
            . ($singlePersonMode
                ? '<table class="details-grid">'
                    . '<tr><td class="lbl">' . $t['lblName'] . '</td><td>' . $devoteeName . '</td><td class="lbl">' . $t['lblDob'] . '</td><td>' . $dob . '</td></tr>'
                    . '<tr><td class="lbl">' . $t['lblTob'] . '</td><td>' . $tob . '</td><td class="lbl">' . $t['lblPlace'] . '</td><td><strong>' . $muhurthamPlace . '</strong><br><span class="muhurtham-location-note">' . $t['lblBirthPlace'] . ': ' . $birthPlace . '</span></td></tr>'
                    . (!empty($persons[0])
                        ? '<tr><td class="lbl">' . $t['lblStar'] . '</td><td>' . self::e($persons[0]['star']) . ' · ' . $t['lblRasi'] . ': ' . self::e($persons[0]['rasi']) . '</td><td class="lbl">' . $t['lblLagna'] . '</td><td>' . self::e($persons[0]['lagna']) . '</td></tr>'
                        : '')
                    . '</table>'
                    . (count($persons) < 2 ? '<div class="single-person-note">' . self::e($t['singlePersonNote']) . '</div>' : '')
                : '<table class="couple-grid">'
                    . '<tr><td class="person-cell">' . self::muhurthamPersonCell($bridePerson, $t['lblBride'], $t) . '</td>'
                    . '<td class="person-cell">' . self::muhurthamPersonCell($groomPerson, $t['lblGroom'], $t) . '</td></tr>'
                    . '</table>'
                    . '<div class="couple-place">' . $t['lblPlace'] . ': <strong>' . $muhurthamPlace . '</strong> · <span class="muhurtham-location-note">' . $t['lblBirthPlace'] . ': ' . $birthPlace . '</span></div>')
            . ($eventDescription !== '' ? '<div class="event-desc">' . self::e($eventDescription) . '</div>' : '')
            . '<div class="sec-head"><span class="sec-no">02</span>' . self::e($t['datesTitle']) . '<span class="sec-note">' . self::e($t['datesSub']) . '</span></div>'
            . $personalDatesNoteHtml
            . $page1DatesHtml
            . self::footerBand($lang)
            . '</div>';

        // ---- Page 2 - date continuation, then the selection guide ----
        $checksHeading = (string) ($notes['checksHeading'] ?? '');
        $checksText = (string) ($notes['checksText'] ?? '');
        $selectionGuide = '<div class="muhurtham-selection-notes">'
            . '<h2>' . self::e($notes['title']) . '</h2>'
            // The paragraph that names every check is always present, so the
            // heading can never render with no body under it.
            . (($checksHeading !== '' || $checksText !== '')
                ? '<p><b>' . self::e($checksHeading) . '</b><br/>' . self::e($checksText) . '</p>'
                : '')
            . (!empty($notes['weekdayText'])
                ? '<p><b>' . self::e($notes['weekdayHeading']) . '</b><br/>' . self::e($notes['weekdayText']) . '</p>'
                : '')
            . '<p><b>' . self::e($notes['selectionHeading']) . '</b><br/>'
            . ($notes['summaryText'] !== '' ? '<span class="selection-counts">' . self::e($notes['summaryText']) . '</span><br/>' : '')
            . self::e($notes['selectionText']) . '</p>'
            . '</div>';
        $upperHalf = '';
        if ($datesContinueOnPage2) {
            $upperHalf = '<div class="sec-head"><span class="sec-no">02</span>' . self::e($t['datesTitle'])
                . '<span class="sec-note">' . self::e($t['continued']) . '</span></div>'
                . $renderCalendarTable($page2Rows);
        } else {
            $upperHalf = '<div class="sec-head"><span class="sec-no">02</span>' . self::e($t['datesTitle']) . '</div>'
                . '<div style="text-align:center; padding:12mm 4mm; color:#64748b; font-weight:bold;">✓ All ' . $totalRecommendedDates . ' recommended dates are listed on page 1.</div>';
        }

        // A table-cell height is a minimum in print renderers, unlike unsupported
        // min-height on divs. 6mm page margin + 6mm sheet padding + 104mm
        // upper content + 3mm guide margin puts the guide at 119mm on A4; that
        // leaves room for the three-paragraph explanation plus the
        // authorisation block on the same sheet.
        // Longer continuations expand the cell and keep the guide below dates.
        $secondPage = '<div class="sheet muhurtham-sheet">'
            . '<table class="muhurtham-page2-upper"><tr><td style="height:100mm;padding:0;vertical-align:top;">'
            . self::topHeader('ASTRO SIVAM', $t['docTitle'] . ' - ' . $t['continued'], $orderNumberSafe, 2, self::MUHURTHAM_PAGE_TOTAL, $lang, $eventTitle . ($isHi ? ' • केवल शुद्ध तिथियाँ' : ' • Clean dates only'))
            . $upperHalf
            . '</td></tr></table>'
            . $selectionGuide
            . self::muhurthamAttestation($result, $t, $orderNumberSafe, $singlePersonMode, $bridePerson, $groomPerson, $devoteeName)
            . self::footerBand($lang)
            . '</div>';

        $muhurthamCss = '
    .muhurtham-sheet { page-break-inside: auto; }
    table.muhurtham-page2-upper { width:100%; border-collapse:collapse; margin:0; }
    .muhurtham-selection-notes { page-break-inside: avoid; margin-top: 2.4mm; border: 0.5px solid #e2e8f0; border-left: 2px solid #c9962c; border-radius: 3px; background: #fffaf0; padding: 2.4mm 3.4mm; color: #334155; font-size: 14.4px; line-height: 1.36; }
    .muhurtham-selection-notes h2 { color: #7a1f1f; font-size: 16.5px; font-weight: bold; margin: 0; line-height: 1.28; }
    .muhurtham-selection-notes p { margin: 1.6mm 0 0; }
    .muhurtham-selection-notes b { color: #7a1f1f; font-size: 15px; }
    .muhurtham-selection-notes .selection-counts { color: #166534; font-weight: bold; }
    .muhurtham-hero { background: #fdf3e0; border: 1.5px solid #c9962c; border-radius: 4px; padding: 2mm 3mm; text-align: center; margin-bottom: 2.5mm; }
    .muhurtham-hero .hero-event { font-size: 12.5px; font-weight: bold; color: #7a1f1f; }
    .muhurtham-hero .hero-window { font-size: 8.6px; color: #2d5a3d; font-weight: bold; margin-top: 0.8mm; }
    .details-grid .lbl { background: #fdf3e0; color: #7a1f1f; font-weight: bold; width: 15%; }
    table.couple-grid { width: 100%; border-collapse: separate; border-spacing: 2mm 0; margin: 0 0 1.5mm; }
    .person-cell { width: 50%; vertical-align: top; background: #fdfaf2; border: 0.4px solid #e5d9c5; border-radius: 2px; padding: 1.6mm 2.4mm; }
    .person-role { color: #a67c1f; font-size: 7.2px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; }
    .person-name { color: #7a1f1f; font-size: 11px; font-weight: bold; }
    .person-meta { color: #334155; font-size: 7.6px; }
    .person-astro { color: #2b1d14; font-size: 8px; font-weight: bold; }
    .person-astro .lbl-mini { color: #64748b; font-weight: normal; }
    .person-place { color: #64748b; font-size: 7px; }
    .couple-place { margin: 0 0 1.6mm; color: #334155; font-size: 7.6px; }
    .single-person-note { margin: 1.2mm 0 0; background: #fffbeb; border: 0.4px solid #fde68a; border-left: 1.2mm solid #c9962c; padding: 1.1mm 2mm; color: #78350f; font-size: 7.6px; font-weight: bold; }
    .muhurtham-auth { width: 100%; border-collapse: collapse; margin-top: 3mm; border: 0.4px solid #c9962c; background: #fffdf5; }
    .muhurtham-auth td { padding: 1.6mm 2.6mm; vertical-align: middle; }
    .muhurtham-auth .auth-label { color: #a67c1f; font-size: 6.6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; }
    .muhurtham-auth .auth-value { color: #7a1f1f; font-size: 8px; font-weight: bold; }
    .muhurtham-auth .signature-rule { border-top: 0.4px solid #64748b; width: 26mm; margin: 0 auto; }
    .muhurtham-auth .signatory-label { color: #64748b; font-size: 6.6px; text-align: center; }
    .muhurtham-auth .signatory-desk { color: #7a1f1f; font-size: 7.6px; font-weight: bold; text-align: center; }
    .muhurtham-location-note { display:inline-block; margin-top:0.8mm; color:#64748b; font-size:7px; font-weight:normal; }
    .sec-note { float: right; font-size: 7.4px; color: #6b5540; font-weight: normal; letter-spacing: 0; text-transform: none; }
    table.six-month-cal { width: 100%; border-collapse: collapse; table-layout: fixed; page-break-inside: avoid; }
    .six-month-cal th { background: #7a1f1f; color: #fff; text-align: left; font-weight: bold; letter-spacing: 0.3px; border: 0.4px solid #7a1f1f; }
    .six-month-cal td { border-bottom: 0.4px solid #e8d9b8; color: #2b1d14; vertical-align: middle; line-height: 1.15; overflow: hidden; }
    .six-month-cal .cal-band td { background: #fdf3e0; border-top: 0.6px solid #c9962c; border-bottom: 0.6px solid #c9962c; }
    .six-month-cal .band-label { color: #7a1f1f; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; }
    .six-month-cal .band-counts { float: right; color: #166534; font-weight: bold; }
    .six-month-cal .cal-best { background: #f4fbf7; }
    .personal-mark { color: #be123c; font-weight: bold; }
    /* One-line text legend explaining the ♥ mark; no extra panel or feature. */
    .personal-dates-note { margin: 1mm 0 1.4mm; background: #fff1f2; border: 0.4px solid #fecdd3; border-left: 1.2mm solid #be123c; padding: 1.2mm 2mm; color: #7a1f1f; font-size: 8.4px; font-weight: bold; line-height: 1.4; }
    .six-month-cal .cal-good { background: #fffdf7; }
    .six-month-cal .cal-date b { color: #7a1f1f; font-size: 1.42em; }
    .six-month-cal .cal-weekday { color: #a67c1f; font-weight: bold; overflow: hidden; text-overflow: ellipsis; }
    .six-month-cal .cal-star { color: #7a1f1f; overflow: hidden; text-overflow: ellipsis; }
    .six-month-cal .cal-personal-note { display: block; color: #64748b; font-size: 0.82em; font-weight: normal; line-height: 1.15; }
    .six-month-cal .cal-time { color: #2b1d14; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .six-month-cal .cal-grade { text-align: center; overflow: hidden; }
    .six-month-cal .cal-note td { background: #f8fafc; color: #64748b; font-style: italic; text-align: center; }
    .grade-pill { display: inline-block; font-size: 0.92em; font-weight: bold; padding: 0.2mm 1mm; border-radius: 2px; white-space: nowrap; overflow: hidden; max-width: 100%; }
    .grade-best { background: #166534; color: #fff; }
    .grade-good { background: #d1fae5; color: #166534; border: 0.4px solid #166534; }
    .method-cert { border: 0.5px dashed #c9962c; border-radius: 3px; background: #fdf3e0; color: #7a1f1f; font-size: 7.2px; font-weight: bold; padding: 0.9mm 1.6mm; margin-top: 1.2mm; text-align: center; letter-spacing: 0.3px; }
        ';

        $css = self::sharedCss($lang) . $muhurthamCss;

        $glossaryBodyMuh = astro_report_glossary_html('MUHURTHAM', $lang);
        $glossarySubtitleMuh = $isTa ? 'சொல் விளக்கம்' : ($isHi ? 'शब्दार्थ' : 'Plain-language guide to this report');
        $glossarySheetMuh = $glossaryBodyMuh === ''
            ? ''
            : '<pagebreak /><div class="sheet glossary-sheet" id="muhurtham-glossary-sheet">'
                . self::topHeader('ASTRO SIVAM', $glossarySubtitleMuh, $orderNumberSafe, 3, self::MUHURTHAM_PAGE_TOTAL, $lang)
                . $glossaryBodyMuh . self::footerBand($lang) . '</div>';

        return '<!DOCTYPE html><html lang="' . self::e($lang) . '"><head><meta charset="UTF-8"><title>ASTRO SIVAM - Subha Muhurtham Report</title><style>' . $css . '</style></head><body>'
            . $cover . $secondPage . $glossarySheetMuh
            . '</body></html>';
    }

    /** Compact "6:35 – 8:01 AM · 9:27 – 10:52 AM" label so every Nalla Neram
     *  window fits on one table row (the six-month calendar has to stay on 2 pages). */
    private static function muhurthamNallaCompactLabel($windows): string {
        if (!is_array($windows) || count($windows) === 0) { return '—'; }
        $labels = [];
        foreach ($windows as $window) {
            if (is_array($window)) {
                $start = self::muhurthamCompactClock($window['start'] ?? '');
                $end = self::muhurthamCompactClock($window['end'] ?? '');
                if ($start !== '' && $end !== '') {
                    $sameMeridiem = (substr($start, -2) === substr($end, -2));
                    $labels[] = $sameMeridiem ? (substr($start, 0, -3) . ' – ' . $end) : ($start . ' – ' . $end);
                    continue;
                }
                $labels[] = trim(((string) ($window['start'] ?? '')) . ' – ' . ((string) ($window['end'] ?? '')), ' –');
                continue;
            }
            $labels[] = trim((string) $window);
        }
        $labels = array_values(array_filter($labels, function ($label) { return $label !== ''; }));
        return count($labels) ? implode(' · ', $labels) : '—';
    }

    /**
     * Mirrors muhurthamTimeFontScale() in src/services/muhurthamHtmlBuilder.ts: a
     * Nalla Neram line that is wider than its 46% column is printed smaller (down to
     * 80%) instead of printing across the grade cell. $fontPt is the typographic size
     * of the row font; the printable width is 188mm x 46% minus the cell padding, the
     * clock gap and the clock glyph.
     */
    private static function muhurthamTimeFontScale($textLength, $fontPt) {
        $textLength = (float) $textLength;
        $fontPt = (float) $fontPt;
        if ($textLength <= 0 || $fontPt <= 0) { return 1.0; }
        $textWidthMm = 188 * 0.46 - 2 - 4;
        $capacity = $textWidthMm / (0.62 * $fontPt * 0.3528);
        if ($textLength <= $capacity) { return 1.0; }
        return max(0.8, $capacity / $textLength);
    }

    /** BEST/GOOD date with auspicious Tara Balam and no Chandrashtama for every person
     *  (mirrors isPersonalMuhurthamDay() in src/services/muhurthamHtmlBuilder.ts). */
    private static function isPersonalMuhurthamDay($day): bool {
        $grade = strtoupper((string) ($day['grade'] ?? ''));
        if ($grade !== 'BEST' && $grade !== 'GOOD') { return false; }
        $checks = array_values(array_filter((array) ($day['personalChecks'] ?? []), 'is_array'));
        if (count($checks) === 0) { return false; }
        foreach ($checks as $c) {
            if (empty($c['isTaraAuspicious']) || !empty($c['isChandrashtama']) || !empty($c['isJanmaNakshatra'])) { return false; }
        }
        return true;
    }

    /**
     * One bride/groom card: name, birth details and their own Janma Nakshatra,
     * Rasi and Lagna (mirrors the browser builder's person card).
     */
    private static function muhurthamPersonCell($person, string $roleLabel, array $t): string {
        if (!is_array($person)) { return ''; }
        $meta = trim($person['dob'] . ($person['tob'] !== '' ? ' · ' . self::muhurthamClock($person['tob']) : ''));
        return '<div class="person-role">' . self::e($roleLabel) . '</div>'
            . '<div class="person-name">' . self::e($person['name'] !== '' ? $person['name'] : '—') . '</div>'
            . '<div class="person-meta">' . self::e($meta) . '</div>'
            . '<div class="person-astro"><span class="lbl-mini">' . self::e($t['lblStar']) . '</span> ' . self::e($person['star'] !== '' ? $person['star'] : '—')
            . ' · <span class="lbl-mini">' . self::e($t['lblRasi']) . '</span> ' . self::e($person['rasi'] !== '' ? $person['rasi'] : '—')
            . ($person['lagna'] !== '' ? ' · <span class="lbl-mini">' . self::e($t['lblLagna']) . '</span> ' . self::e($person['lagna']) : '')
            . '</div>'
            . ($person['place'] !== '' ? '<div class="person-place">' . self::e($person['place']) . '</div>' : '');
    }

    /** 12-hour clock for a person's birth time ("02:00 AM"). */
    private static function muhurthamClock($value): string {
        if (!preg_match('/^(\d{1,2}):(\d{2})/', trim((string) $value), $m)) { return (string) $value; }
        $hour = intval($m[1]);
        return (($hour % 12) ?: 12) . ':' . $m[2] . ' ' . ($hour >= 12 ? 'PM' : 'AM');
    }

    /**
     * Authorisation block: reference number, issued-on, prepared-for and the
     * signatory desk — the same block the marriage report prints.
     */
    private static function muhurthamAttestation($result, array $t, string $orderNumber, bool $singlePersonMode, $bridePerson, $groomPerson, string $devoteeName): string {
        $generatedAt = (string) ($result['generatedAt'] ?? '');
        $timeZoneId = (string) ($result['muhurthamTimeZoneId'] ?? '');
        $issuedOn = self::muhurthamIssuedOn($generatedAt !== '' ? $generatedAt : 'now', $timeZoneId);
        $stamp = date('Ymd', $generatedAt !== '' ? (int) strtotime($generatedAt) : time());
        $referenceNo = $orderNumber !== '' ? $orderNumber : 'ASTRO-MUH-' . $stamp;
        $preparedFor = $singlePersonMode
            ? $devoteeName
            : self::e(trim((string) ($bridePerson['name'] ?? '')) . ' & ' . trim((string) ($groomPerson['name'] ?? '')));
        return '<table class="muhurtham-auth"><tr>'
            . '<td style="width:24%;"><div class="auth-label">' . self::e($t['lblReference']) . '</div><div class="auth-value">' . self::e($referenceNo) . '</div></td>'
            . '<td style="width:30%;"><div class="auth-label">' . self::e($t['lblIssuedOn']) . '</div><div class="auth-value">' . self::e($issuedOn) . '</div></td>'
            . '<td style="width:26%;"><div class="auth-label">' . self::e($t['lblPreparedFor']) . '</div><div class="auth-value">' . $preparedFor . '</div></td>'
            . '<td style="width:20%;"><div class="signature-rule"></div><div class="signatory-label">' . self::e($t['lblSignatory']) . '</div><div class="signatory-desk">' . self::e($t['signatoryDesk']) . '</div></td>'
            . '</tr></table>';
    }

    /** THE report date format: "07 Oct 2026" (mirrors formatReportDate() in the builders). */
    public static function muhurthamReportDate($value): string {
        $iso = substr(trim((string) $value), 0, 10);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $iso, $m)) { return $iso; }
        $months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return $m[3] . ' ' . $months[intval($m[2]) - 1] . ' ' . $m[1];
    }

    /** Issued-on stamp in the report timezone, matching the marriage report. */
    public static function muhurthamIssuedOn($value, string $timeZoneId = ''): string {
        $timestamp = strtotime((string) $value);
        if ($timestamp === false) { $timestamp = time(); }
        try {
            $zone = $timeZoneId !== '' ? new \DateTimeZone($timeZoneId) : new \DateTimeZone(date_default_timezone_get());
            $date = new \DateTime('@' . $timestamp);
            $date->setTimezone($zone);
            return $date->format('d M Y, H:i T');
        } catch (\Throwable $e) {
            return gmdate('d M Y, H:i', $timestamp) . ' UTC';
        }
    }

    private static function muhurthamCompactClock($value): string {
        if (preg_match('/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i', trim((string) $value), $match)) {
            return intval($match[1]) . ':' . $match[2] . ' ' . strtoupper($match[3]) . 'M';
        }
        return '';
    }

    private static function muhurthamGradeClass($grade): string {
        $grade = strtoupper((string) $grade);
        if ($grade === 'BEST') { return 'grade-best'; }
        if ($grade === 'GOOD') { return 'grade-good'; }
        if ($grade === 'AVOID') { return 'grade-avoid'; }
        return 'grade-fair';
    }

    private static function muhurthamGradeLabel($grade, $lang): string {
        $grade = strtoupper((string) $grade);
        $map = [
            'BEST' => ['BEST', 'உத்தமம்', 'उत्तम'],
            'GOOD' => ['GOOD', 'சுபம்', 'शुभ'],
            'FAIR' => ['FAIR', 'மிதமான்', 'सामान्य'],
            'AVOID' => ['AVOID', 'விலக்கு', 'वर्जित']
        ];
        $row = $map[$grade] ?? $map['FAIR'];
        return $lang === 'ta' ? $row[1] : ($lang === 'hi' ? $row[2] : $row[0]);
    }

    private static function muhurthamWindowListLabel($windows): string {
        return self::muhurthamNallaCompactLabel($windows);
    }

}
