<?php
/**
 * ASTRO SIVAM — Wedding Matching (10-Porutham) HTML Builder
 */

trait AstroReportWeddingTrait
{
    // =====================================================================
    // MARRIAGE COMPATIBILITY - 1 PAGE HTML
    // =====================================================================
    public static function generateWeddingMatchingHtml($order, $result): string {
        $lang = astro_report_normalize_language($order['language'] ?? 'en');
        $isTa = ($lang === 'ta');
        $isHi = ($lang === 'hi');

        $orderNumber = $order['order_number'] ?? $order['orderNumber'] ?? 'ORD-WEDDING';
        $groom = is_array($result['groom'] ?? null) ? $result['groom'] : [];
        $bride = is_array($result['bride'] ?? null) ? $result['bride'] : [];
        $groomName = self::e($result['groomName'] ?? $groom['nativeName'] ?? 'Groom (Varan)');
        $brideName = self::e($result['brideName'] ?? $bride['nativeName'] ?? 'Bride (Kanya)');

        $groomRasi = self::e(self::rasiNameForNumber($result['groomRasi'] ?? $groom['chandraRasi'] ?? null, $lang));
        $groomNak = self::e($isTa ? ($result['groomNakshatraNameTa'] ?? $groom['nakshatram']['nameTa'] ?? 'N/A') : ($isHi ? ($result['groomNakshatraNameHi'] ?? $groom['nakshatram']['nameHi'] ?? 'N/A') : ($result['groomNakshatraNameEn'] ?? $groom['nakshatram']['name'] ?? 'N/A')));
        $brideRasi = self::e(self::rasiNameForNumber($result['brideRasi'] ?? $bride['chandraRasi'] ?? null, $lang));
        $brideNak = self::e($isTa ? ($result['brideNakshatraNameTa'] ?? $bride['nakshatram']['nameTa'] ?? 'N/A') : ($isHi ? ($result['brideNakshatraNameHi'] ?? $bride['nakshatram']['nameHi'] ?? 'N/A') : ($result['brideNakshatraNameEn'] ?? $bride['nakshatram']['name'] ?? 'N/A')));
        $groomLagna = self::e(self::rasiNameForNumber($groom['lagnaRasi'] ?? $result['groomLagnaRasi'] ?? null, $lang));
        $brideLagna = self::e(self::rasiNameForNumber($bride['lagnaRasi'] ?? $result['brideLagnaRasi'] ?? null, $lang));
        $brideMarsHouseValue = $result['brideMarsHouse'] ?? null;
        $groomMarsHouseValue = $result['groomMarsHouse'] ?? null;
        $brideMarsHouse = self::e(is_numeric($brideMarsHouseValue) && (float) $brideMarsHouseValue === (float) (int) $brideMarsHouseValue && (int) $brideMarsHouseValue >= 1 && (int) $brideMarsHouseValue <= 12 ? ($isHi ? ((int) $brideMarsHouseValue . 'वाँ भाव') : ('House ' . (int) $brideMarsHouseValue)) : 'N/A');
        $groomMarsHouse = self::e(is_numeric($groomMarsHouseValue) && (float) $groomMarsHouseValue === (float) (int) $groomMarsHouseValue && (int) $groomMarsHouseValue >= 1 && (int) $groomMarsHouseValue <= 12 ? ($isHi ? ((int) $groomMarsHouseValue . 'वाँ भाव') : ('House ' . (int) $groomMarsHouseValue)) : 'N/A');

        $groomDob = self::e(self::birthDate($result['groomDob'] ?? $groom['dob'] ?? '', 'N/A'));
        $groomTob = self::e($result['groomTob'] ?? $groom['tob'] ?? 'N/A');
        $groomPlace = self::e($result['groomPlace'] ?? 'N/A');
        $brideDob = self::e(self::birthDate($result['brideDob'] ?? $bride['dob'] ?? '', 'N/A'));
        $brideTob = self::e($result['brideTob'] ?? $bride['tob'] ?? 'N/A');
        $bridePlace = self::e($result['bridePlace'] ?? 'N/A');

        $scoreRaw = $result['totalPointsEarned'] ?? $result['score'] ?? null;
        $maxScoreRaw = $result['maxPossiblePoints'] ?? $result['maxScore'] ?? null;
        $percentRaw = $result['matchPercentage'] ?? $result['percentage'] ?? null;
        // ONE number on page 1 (owner request, Oct 2026): "8 / 10 Poruthams
        // matched". The panel used to print the point score, the percentage AND
        // the porutham count side by side - three different measures with
        // nothing saying so - and the reader could not tell which was the
        // verdict. Only the porutham count survives; the meter fills from that
        // same number, so the bar and the text cannot disagree.

        $matchedCountRaw = $result['totalPoruthamsMatched'] ?? $result['matchedCount'] ?? null;
        $matchedCountValue = null;
        if (is_numeric($matchedCountRaw) && (float) $matchedCountRaw >= 0 && (float) $matchedCountRaw <= 10 && floor((float) $matchedCountRaw) === (float) $matchedCountRaw) {
            $matchedCountValue = (int) $matchedCountRaw;
        } else {
            $matchRows = is_array($result['poruthams'] ?? null) ? $result['poruthams'] : [];
            if (count($matchRows) === 10) {
                $rowsCanBeCounted = true;
                $matchedCountValue = 0;
                foreach ($matchRows as $matchRow) {
                    $rowStatus = strtoupper(trim((string) ($matchRow['status'] ?? '')));
                    $rowPoints = $matchRow['pointsEarned'] ?? $matchRow['points'] ?? null;
                    $statusCanBeCounted = in_array($rowStatus, ['UTTHAMAM', 'MADHYAMAM', 'PORUNDHADHU'], true);
                    $pointsCanBeCounted = is_numeric($rowPoints);
                    if (!$statusCanBeCounted && !$pointsCanBeCounted) {
                        $rowsCanBeCounted = false;
                        break;
                    }
                    if ($statusCanBeCounted ? in_array($rowStatus, ['UTTHAMAM', 'MADHYAMAM'], true) : (float) $rowPoints > 0) {
                        $matchedCountValue++;
                    }
                }
                if (!$rowsCanBeCounted) {
                    $matchedCountValue = null;
                }
            }
        }
        $matchedCountDisplay = $matchedCountValue === null ? 'N/A' : (string) $matchedCountValue;
        $matchedMeterWidth = $matchedCountValue === null ? '0%' : (($matchedCountValue * 10)) . '%';

        $verdictStatus = strtoupper(trim((string) ($result['verdictStatus'] ?? '')));
        $ratingTier = in_array($verdictStatus, ['UTTHAMAM', 'MADHYAMAM', 'PORUNDHADHU'], true) ? $verdictStatus : null;
        $legacyVerdict = strtolower((string) ($result['overallVerdictEn'] ?? $result['verdict'] ?? ''));
        $legacyPercent = is_numeric($percentRaw)
            ? (float) $percentRaw
            : (is_numeric($scoreRaw) && is_numeric($maxScoreRaw) && (float) $maxScoreRaw > 0
                ? ((float) $scoreRaw / (float) $maxScoreRaw) * 100.0
                : null);
        if ($ratingTier === null) {
            if (preg_match('/not recommended|not compatible|not good|porundh/', $legacyVerdict)) {
                $ratingTier = 'PORUNDHADHU';
            } elseif (preg_match('/madhyam|moderate|acceptable|remed(y|ies)/', $legacyVerdict)) {
                $ratingTier = 'MADHYAMAM';
            } elseif (preg_match('/utthama|uttama|highly recommended|auspicious/', $legacyVerdict)) {
                $ratingTier = 'UTTHAMAM';
            } elseif ($legacyPercent !== null) {
                $ratingTier = $legacyPercent >= 70 ? 'UTTHAMAM' : ($legacyPercent >= 50 ? 'MADHYAMAM' : 'PORUNDHADHU');
            }
        }
        if ($ratingTier === 'UTTHAMAM') {
            $verdictText = $isTa ? 'இந்த மதிப்பீட்டின்படி மிக நல்ல பொருத்தம்.' : ($isHi ? 'इस आकलन के अनुसार बहुत अच्छा मेल है।' : 'Very good match based on this assessment.');
        } elseif ($ratingTier === 'MADHYAMAM') {
            $verdictText = $isTa ? 'ஒட்டுமொத்தமாக நல்ல பொருத்தம் — சில பொருத்தங்கள் பகுதியளவே.' : ($isHi ? 'कुल मिलाकर अच्छा मेल — कुछ पोरुथम आंशिक हैं।' : 'Good match overall — a few poruthams are partial.');
        } elseif ($ratingTier === 'PORUNDHADHU') {
            $verdictText = $isTa
                ? 'இந்த மதிப்பீட்டின்படி பரிந்துரைக்கப்படவில்லை; நிபுணர் ஆலோசனை பெறவும்.'
                : ($isHi
                    ? 'इस आकलन के अनुसार यह विवाह अनुशंसित नहीं है; कृपया विशेषज्ञ ज्योतिषी से सलाह लें।'
                    : 'Not recommended on this assessment; seek expert review.');
        } else {
            $verdictText = 'N/A';
        }
        $finalVerdictLabel = $isTa ? 'இறுதிப் பரிந்துரை' : ($isHi ? 'अंतिम अनुशंसा' : 'FINAL RECOMMENDATION');
        $finalVerdictText = $verdictText;
        // The next step exists only where there IS one. When the charts match,
        // the family's next action is picking the date with the Subha Muhurtham
        // report (Tara Bala, Chandrashtama, Nalla Neram for both of them). A
        // non-matching verdict stands on its own - no upsell, no promised
        // review line.
        $nextStepLabel = $isTa ? 'அடுத்த படி' : ($isHi ? 'अगला कदम' : 'NEXT STEP');
        $nextStepText = '';
        if ($ratingTier === 'UTTHAMAM' || $ratingTier === 'MADHYAMAM') {
            $nextStepText = $isTa
                ? 'திருமணத் தேதியை நமது சுப முகூர்த்த அறிக்கையுடன் தேர்ந்தெடுங்கள் — உங்கள் இருவருக்கும் தாரா பலம், சந்திராஷ்டமம், நல்ல நேரம் சரிபார்த்து சுப தேதிகளைப் பட்டியலிடும்: astrosivam.com/subha-muhurtham'
                : ($isHi
                    ? 'विवाह की तिथि हमारी शुभ मुहूर्त रिपोर्ट से चुनें — यह आप दोनों के लिए तारा बल, चंद्राष्टम और नल्ला नेरम जाँचकर शुभ तिथियाँ देती है: astrosivam.com/subha-muhurtham'
                    : 'Choose the wedding date with our Subha Muhurtham report — it checks Tara Bala, Chandrashtama and Nalla Neram for both of you and lists the auspicious dates: astrosivam.com/subha-muhurtham');
        }
        $finalVerdictClass = $ratingTier === null ? 'final-verdict-unavailable' : ($ratingTier === 'UTTHAMAM' ? 'final-verdict-good' : ($ratingTier === 'MADHYAMAM' ? 'final-verdict-moderate' : 'final-verdict-not-good'));
        $finalVerdictColor = $ratingTier === null ? '#475569' : ($ratingTier === 'UTTHAMAM' ? '#166534' : ($ratingTier === 'MADHYAMAM' ? '#92400e' : '#991b1b'));
        $finalVerdictBackground = $ratingTier === null ? '#f1f5f9' : ($ratingTier === 'UTTHAMAM' ? '#ecfdf5' : ($ratingTier === 'MADHYAMAM' ? '#fffbeb' : '#fef2f2'));
        $finalVerdictBorder = $ratingTier === null ? '#cbd5e1' : ($ratingTier === 'UTTHAMAM' ? '#86efac' : ($ratingTier === 'MADHYAMAM' ? '#fcd34d' : '#fca5a5'));
        $nextStepHtml = $nextStepText === ''
            ? ''
            : '<div style="font-size:9.5px; line-height:1.3; font-weight:normal; color:' . $finalVerdictColor . '; text-align:left; margin-top:1.2mm; padding-top:1.1mm; border-top:1px dotted ' . $finalVerdictColor . ';"><b style="letter-spacing:0.4px;">' . $nextStepLabel . '</b>&nbsp;&nbsp;' . $nextStepText . '</div>';
        if ($ratingTier === 'UTTHAMAM') {
            $meterBadgeText = astro_porutham_verdict_label('UTTHAMAM', $lang, true);
            $meterBadgeStyle = 'background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;';
            $meterFillColor = '#059669';
        } elseif ($ratingTier === 'MADHYAMAM') {
            $meterBadgeText = astro_porutham_verdict_label('MADHYAMAM', $lang, true);
            $meterBadgeStyle = 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d;';
            $meterFillColor = '#d97706';
        } elseif ($ratingTier === 'PORUNDHADHU') {
            $meterBadgeText = astro_porutham_verdict_label('PORUNDHADHU', $lang, true);
            $meterBadgeStyle = 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;';
            $meterFillColor = '#be123c';
        } else {
            $meterBadgeText = 'N/A';
            $meterBadgeStyle = 'background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;';
            $meterFillColor = '#94a3b8';
        }

        $sevvay = is_array($result['sevvayDosham'] ?? null) ? $result['sevvayDosham'] : [];
        $groomDoshaStatus = self::e($isTa ? ($sevvay['groomDoshamSeverityTa'] ?? 'N/A') : ($isHi ? ($sevvay['groomDoshamSeverityHi'] ?? 'N/A') : ($sevvay['groomDoshamSeverityEn'] ?? 'N/A')));
        $brideDoshaStatus = self::e($isTa ? ($sevvay['brideDoshamSeverityTa'] ?? 'N/A') : ($isHi ? ($sevvay['brideDoshamSeverityHi'] ?? 'N/A') : ($sevvay['brideDoshamSeverityEn'] ?? 'N/A')));
        // Keep the profile placement and its simple status in sync.
        $groomMarsHouse .= ' (' . $groomDoshaStatus . ')';
        $brideMarsHouse .= ' (' . $brideDoshaStatus . ')';

        // The first page uses a concise summary. Prefer the engine's structured
        // Samyam code, then fall back to the assessed statuses when available.
        $doshaBalanceCode = strtoupper(trim((string) ($sevvay['doshaSamyamStatus'] ?? '')));
        if (!in_array($doshaBalanceCode, ['BALANCED', 'MINOR_IMBALANCE', 'IMBALANCE'], true)) {
            if ((($sevvay['brideDoshaStatus'] ?? '') === 'DOSHA_MILD' && ($sevvay['isGroomHasDosham'] ?? null) === false) ||
                (($sevvay['groomDoshaStatus'] ?? '') === 'DOSHA_MILD' && ($sevvay['isBrideHasDosham'] ?? null) === false)) {
                $doshaBalanceCode = 'MINOR_IMBALANCE';
            } elseif (is_bool($sevvay['isBalanced'] ?? null)) {
                $doshaBalanceCode = $sevvay['isBalanced'] ? 'BALANCED' : 'IMBALANCE';
            } elseif (is_bool($sevvay['isBrideHasDosham'] ?? null) && is_bool($sevvay['isGroomHasDosham'] ?? null)) {
                $doshaBalanceCode = $sevvay['isBrideHasDosham'] === $sevvay['isGroomHasDosham'] ? 'BALANCED' : 'IMBALANCE';
            } else {
                $doshaBalanceCode = 'UNKNOWN';
            }
        }
        $doshaNotAssessed = $isTa ? 'கிடைக்கவில்லை (N/A)' : ($isHi ? 'उपलब्ध नहीं (N/A)' : 'Not assessed');
        $doshaBalance = $doshaBalanceCode === 'BALANCED'
            ? ($isTa ? 'சமநிலை' : ($isHi ? 'संतुलित' : 'Balanced'))
            : ($doshaBalanceCode === 'MINOR_IMBALANCE'
                ? ($isTa ? 'சிறிய சமனின்மை' : ($isHi ? 'मामूली असंतुलन' : 'Minor imbalance'))
                : ($doshaBalanceCode === 'IMBALANCE'
                    ? ($isTa ? 'சமநிலை இல்லை' : ($isHi ? 'असंतुलन' : 'Imbalance'))
                    : $doshaNotAssessed));
        $doshaGuidance = $doshaBalanceCode === 'BALANCED'
            ? ($isTa ? 'செவ்வாய் தோஷக் கண்ணோட்டத்தில் சமநிலை உள்ளது; இது முழுத் திருமணப் பரிந்துரை அல்ல.' : ($isHi ? 'मंगल दोष की दृष्टि से संतुलन है; यह समग्र विवाह अनुशंसा नहीं है।' : 'Kuja Dosha is balanced; this does not determine overall compatibility.'))
            : ($doshaBalanceCode === 'MINOR_IMBALANCE'
                ? ($isTa ? 'சிறிய சமனின்மை உள்ளது; எளிய பரிகாரங்களுக்கு ஜோதிடரிடம் ஆலோசனை பெறவும்.' : ($isHi ? 'मामूली असंतुलन है; सरल उपायों के लिए ज्योतिषी से सलाह लें।' : 'A mild imbalance is indicated; ask an astrologer about simple remedies.'))
                : ($doshaBalanceCode === 'IMBALANCE'
                    ? ($isTa ? 'செவ்வாய் தோஷ சமநிலை இல்லை; பரிகாரங்களுக்கு நிபுணர் ஆலோசனை பெறவும்.' : ($isHi ? 'मंगल दोष में असंतुलन है; उपायों के लिए विशेषज्ञ सलाह लें।' : 'A Kuja Dosha imbalance is indicated; seek expert guidance on remedies.'))
                    : ($isTa ? 'கிடைத்த ஜாதகத் தகவல்களால் செவ்வாய் தோஷத்தை மதிப்பிட முடியவில்லை.' : ($isHi ? 'उपलब्ध जन्म विवरण से मंगल दोष का आकलन नहीं किया जा सका है।' : 'Kuja Dosha could not be assessed from the available chart data.'))));
        $doshaTitle = $isTa ? 'செவ்வாய் தோஷச் சுருக்கம்' : ($isHi ? 'मंगल दोष सारांश' : 'Kuja (Mars) Dosha Summary');
        $lblDoshaBride = $isTa ? 'பெண்' : ($isHi ? 'वधू' : 'Bride');
        $lblDoshaGroom = $isTa ? 'ஆண்' : ($isHi ? 'वर' : 'Groom');
        $lblDoshaBalance = $isTa ? 'தோஷ சமநிலை' : ($isHi ? 'दोष संतुलन' : 'Dosha Balance');
        $lblDoshaGuidance = $isTa ? 'செவ்வாய் வழிகாட்டல்' : ($isHi ? 'मंगल मार्गदर्शन' : 'Kuja Guidance');
        $lblVisualMeter = $isTa ? 'பொருத்த ஒத்திசைவு அளவுகோல்' : ($isHi ? 'विवाह अनुकूलता मीटर' : 'Visual Compatibility Meter');
        $lblPoruthamsMatched = $isTa ? 'பொருத்தங்கள் பொருந்தின' : ($isHi ? 'गुण मेल खाते हैं' : 'Poruthams matched');
        $lblRajju = $isTa ? 'ரஜ்ஜு நிலை' : ($isHi ? 'रज्जु स्थिति' : 'Rajju status');
        $rajjuMatch = $result['rajjuMatch'] ?? null;
        $rajjuStatusText = !is_bool($rajjuMatch)
            ? 'N/A'
            : ($rajjuMatch
                ? ($isTa ? 'பொருத்துகிறது (சுபம்)' : ($isHi ? 'शुभ मेल' : 'Auspicious match'))
                : ($isTa ? 'ரஜ்ஜு தட்டுப்படுகிறது' : ($isHi ? 'अशुभ' : 'Afflicted')));
        $rajjuStatusColor = !is_bool($rajjuMatch) ? '#64748b' : ($rajjuMatch ? '#047857' : '#be123c');

        $rows = '';
        $idx = 1;
        foreach (($result['poruthams'] ?? []) as $p) {
            $pName = $isTa ? ($p['nameTa'] ?? $p['nameEn'] ?? '') : ($isHi ? ($p['nameHi'] ?? $p['nameEn'] ?? '') : ($p['nameEn'] ?? ''));
            $earnedRaw = array_key_exists('pointsEarned', $p) ? $p['pointsEarned'] : null;
            // A genuine zero is a present score. Only null/empty means "fall
            // back" to the legacy `points` field or render N/A.
            if ($earnedRaw === null || $earnedRaw === '') {
                $earnedRaw = $p['points'] ?? null;
            }
            $maxRaw = $p['maxPoints'] ?? null;
            $hasEarned = $earnedRaw !== null && $earnedRaw !== '' && is_numeric($earnedRaw) && (float) $earnedRaw >= 0;
            $hasMaximum = $maxRaw !== null && $maxRaw !== '' && is_numeric($maxRaw) && (float) $maxRaw > 0;
            $pts = ($hasEarned ? (string) $earnedRaw : 'N/A') . ' / ' . ($hasMaximum ? (string) $maxRaw : 'N/A');
            // The engine stores the tier in status2 / status; older saved
            // orders only carry the legacy English label. Both are read and
            // printed as the same plain grading word in the order's language.
            $statusTier = astro_porutham_verdict_tier($p['status2'] ?? null);
            if ($statusTier === null) {
                $statusTier = astro_porutham_verdict_tier($p['status'] ?? null);
            }
            $status = astro_porutham_verdict_label($statusTier, $lang);
            $expl = $isTa ? ($p['explanationTa'] ?? $p['explanationEn'] ?? '') : ($isHi ? ($p['explanationHi'] ?? $p['explanationEn'] ?? '') : ($p['explanationEn'] ?? ''));

            $rows .= '<tr><td>' . $idx . '</td><td><b>' . self::e($pName) . '</b></td><td>' . self::e($pts) . '</td><td>' . self::e($status) . '</td><td>' . self::e($expl) . '</td></tr>';
            $idx++;
        }

        $headerSub = $isTa ? 'திருமணப் பொருத்த அறிக்கை (10 திருமணப் பொருத்தங்கள்)' : ($isHi ? 'विवाह कुंडली मिलान (10 गुण मिलान)' : 'Marriage Compatibility (10 Poruthams Report)');
        $lblGroom = $isTa ? 'வரன் (ஆண்) விவரம்' : ($isHi ? 'वर का विवरण' : 'GROOM DETAILS');
        $lblBride = $isTa ? 'கன்னிகை (பெண்) விவரம்' : ($isHi ? 'कन्या का विवरण' : 'BRIDE DETAILS');
        $thP = $isTa ? 'பொருத்தம்' : ($isHi ? 'गुण / कूट' : 'Porutham');
        $thPts = $isTa ? 'மதிப்பெண்' : ($isHi ? 'अंक' : 'Points');
        $thSt = $isTa ? 'நிலை' : ($isHi ? 'स्थिति' : 'Status');
        $thExp = $isTa ? 'விளக்கம் & பலன்' : ($isHi ? 'विवरण एवं फल' : 'Explanation');

        // prepared-date stamp: first page only, on the LEFT of the reference
        // line — never centred with the page tag (owner request, Oct 2026).
        $lblWedName = $isHi ? 'नाम' : 'Name';
        $lblWedDob = 'DOB';
        $lblWedPlace = $isHi ? 'जन्म स्थान' : 'Place';
        $lblWedRasi = $isHi ? 'राशि' : 'Rasi';
        $lblWedStar = $isHi ? 'नक्षत्र' : 'Star';
        $lblWedLagna = $isHi ? 'लग्न' : 'Lagna';
        $lblWedMars = $isHi ? 'मंगल' : 'Mars';
        $preparedLabel = self::preparedDateStamp($result, $lang);
        $body = self::topHeader('ASTRO SIVAM', $headerSub, $orderNumber, 1, self::WEDDING_PAGE_TOTAL, $lang, '', false, $preparedLabel);
        $body .= <<<HTML
<div class="panel" style="padding:3.5mm 4mm;">
  <table style="width:100%; font-size:10px; line-height:1.5;"><tr>
    <td style="width:48%; vertical-align:top;">
      <div style="color:#7a1f1f; font-size:10.5px; font-weight:bold; margin-bottom:1.5mm;">{$lblGroom}</div>
      <div style="margin-bottom:1mm;">{$lblWedName}: <b>{$groomName}</b></div>
      <div style="margin-bottom:1mm;">{$lblWedDob}: {$groomDob} ({$groomTob})</div>
      <div style="margin-bottom:1mm;">{$lblWedPlace}: {$groomPlace}</div>
      <div style="margin-bottom:1mm;">{$lblWedRasi}: <b>{$groomRasi}</b> &bull; {$lblWedStar}: <b>{$groomNak}</b></div>
      <div>{$lblWedLagna}: <b>{$groomLagna}</b> &bull; {$lblWedMars}: <b>{$groomMarsHouse}</b></div>
    </td>
    <td style="width:4%; border-left:1px solid #e8d9b8;"></td>
    <td style="width:48%; vertical-align:top;">
      <div style="color:#7a1f1f; font-size:10.5px; font-weight:bold; margin-bottom:1.5mm;">{$lblBride}</div>
      <div style="margin-bottom:1mm;">{$lblWedName}: <b>{$brideName}</b></div>
      <div style="margin-bottom:1mm;">{$lblWedDob}: {$brideDob} ({$brideTob})</div>
      <div style="margin-bottom:1mm;">{$lblWedPlace}: {$bridePlace}</div>
      <div style="margin-bottom:1mm;">{$lblWedRasi}: <b>{$brideRasi}</b> &bull; {$lblWedStar}: <b>{$brideNak}</b></div>
      <div>{$lblWedLagna}: <b>{$brideLagna}</b> &bull; {$lblWedMars}: <b>{$brideMarsHouse}</b></div>
    </td>
  </tr></table>
</div>

<table class="wedding-overview-grid" cellpadding="0" cellspacing="0" style="width:100%; table-layout:fixed; border-collapse:collapse; margin:2mm 0 2.5mm;">
  <tr>
    <td style="width:50%; vertical-align:top; padding:0 1.2mm 0 0;">
      <div class="panel" style="padding:3mm; margin:0; border:1px solid #e2e8f0; background:#ffffff; border-radius:4px;">
        <table style="width:100%; border-collapse:collapse; margin-bottom:1mm;">
          <tr>
            <td style="font-size:9.5px; line-height:1.25; color:#7a1f1f; font-weight:bold; vertical-align:middle;">{$lblVisualMeter}</td>
            <td style="text-align:right; vertical-align:middle; white-space:nowrap;"><span style="display:inline-block; font-size:7px; line-height:1.2; font-weight:bold; border-radius:12px; padding:0.8mm 1.6mm; {$meterBadgeStyle}">{$meterBadgeText}</span></td>
          </tr>
        </table>
        <div style="font-size:15px; line-height:1.2; color:#0f172a; font-weight:bold; margin-bottom:1.2mm;">
          {$matchedCountDisplay} / 10<span style="font-size:8px; color:#64748b; font-weight:normal;"> {$lblPoruthamsMatched}</span>
        </div>
        <div role="meter" aria-label="{$lblVisualMeter}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="{$matchedCountDisplay}" aria-valuetext="{$matchedCountDisplay} / 10 {$lblPoruthamsMatched}" style="width:100%; height:2.5mm; overflow:hidden; border-radius:20px; background:#e2e8f0; margin-bottom:1.2mm;">
          <div style="width:{$matchedMeterWidth}; height:2.5mm; background:{$meterFillColor}; border-radius:20px;"></div>
        </div>
        <div style="font-size:8px; line-height:1.35; color:#475569;">{$lblRajju}: <b style="color:{$rajjuStatusColor};">{$rajjuStatusText}</b></div>
      </div>
    </td>
    <td style="width:50%; vertical-align:top; padding:0 0 0 1.2mm;">
      <div class="panel" style="padding:3mm; margin:0; border:1px solid #e8d9b8; border-left:3px solid #7a1f1f; background:#f8fafc; border-radius:4px;">
        <div class="panel-title" style="font-size:9.5px; line-height:1.25; border-bottom:0; padding:0; margin:0 0 1.2mm;">{$doshaTitle}</div>
        <table style="width:100%; border-collapse:separate; border-spacing:1mm 0; table-layout:fixed; font-size:8px; line-height:1.3; margin:0 -1mm 1mm;">
          <tr>
            <td style="width:50%; vertical-align:top; padding:1.2mm 1.5mm; border:1px solid #e8d9b8; background:#fffdf7;">
              <div style="font-size:7px; color:#64748b; font-weight:bold; text-transform:uppercase; margin-bottom:0.6mm;">{$lblDoshaBride}</div>
              <div style="font-weight:bold; color:#2b1d14;">{$brideDoshaStatus}</div>
            </td>
            <td style="width:50%; vertical-align:top; padding:1.2mm 1.5mm; border:1px solid #e8d9b8; background:#fffdf7;">
              <div style="font-size:7px; color:#64748b; font-weight:bold; text-transform:uppercase; margin-bottom:0.6mm;">{$lblDoshaGroom}</div>
              <div style="font-weight:bold; color:#2b1d14;">{$groomDoshaStatus}</div>
            </td>
          </tr>
        </table>
        <div style="display:block; padding:0.9mm 1.5mm; border:1px solid #e8d9b8; background:#fffdf7; font-size:8px; line-height:1.25; margin-bottom:1mm;">
          <span style="color:#64748b; font-weight:bold;">{$lblDoshaBalance}:</span> <b style="color:#2b1d14;">{$doshaBalance}</b>
        </div>
        <div style="border-top:1px solid #e8d9b8; padding-top:1mm; font-size:7.8px; line-height:1.3; color:#4b3d28;">
          <b style="color:#7a1f1f;">{$lblDoshaGuidance}:</b> {$doshaGuidance}
        </div>
      </div>
    </td>
  </tr>
</table>

<table class="data-table" style="font-size:9.5px;">
  <thead><tr><th width="26" style="padding:2mm 2.5mm;">#</th><th style="padding:2mm 2.5mm;">{$thP}</th><th width="52" style="padding:2mm 2.5mm;">{$thPts}</th><th width="70" style="padding:2mm 2.5mm;">{$thSt}</th><th style="padding:2mm 2.5mm;">{$thExp}</th></tr></thead>
  <tbody>{$rows}</tbody>
</table>

<div class="panel {$finalVerdictClass}" role="status" style="text-align:center; background:{$finalVerdictBackground}; border:1px solid {$finalVerdictBorder}; margin-top:1mm; margin-bottom:1mm; padding:3mm 4mm;">
  <div style="font-size:9.5px; font-weight:bold; letter-spacing:0.5px; color:{$finalVerdictColor};">{$finalVerdictLabel}</div>
  <div style="font-size:13px; line-height:1.25; font-weight:bold; color:{$finalVerdictColor}; margin-top:0.8mm;">{$finalVerdictText}</div>
  {$nextStepHtml}
</div>
HTML;

        // ---------------------------------------------------------------------
        // Page 2 - Marriage Matching disclaimer, in the language the order was
        // placed in. Shared copy so the email, the admin preview and the
        // browser export always print exactly the same wording.
        // ---------------------------------------------------------------------
        $disclaimer = WeddingDisclaimerNotes::build($lang);
        // Tamil and Devanagari set wider than Latin, so each language gets its own
        // reading column and type size: the panel fills the sheet without ever
        // spilling onto a third page.
        $disclaimerParaStyle = $isTa
            ? 'font-size:11.5px; line-height:1.9; margin:0 0 4mm;'
            : ($isHi
                ? 'font-size:13.5px; line-height:1.95; margin:0 0 4.5mm;'
                : 'font-size:13px; line-height:1.95; margin:0 0 4.5mm;');
        $disclaimerPanelStyle = $isTa ? 'width:100%;' : ($isHi ? 'width:148mm;' : 'width:155mm;');
        $disclaimerParagraphs = '';
        foreach ($disclaimer['paragraphs'] as $paragraph) {
            $disclaimerParagraphs .= '<p class="disclaimer-para" style="' . $disclaimerParaStyle . '">' . WeddingDisclaimerNotes::rich($paragraph) . '</p>';
        }
        $disclaimerTitle = self::e($disclaimer['title']);
        $disclaimerHeading = self::e($disclaimer['heading']);
        $disclaimerBody = self::topHeader('ASTRO SIVAM', $disclaimer['pageSubtitle'], $orderNumber, 2, self::WEDDING_PAGE_TOTAL, $lang);
        $disclaimerBody .= <<<HTML
<div class="panel disclaimer-panel" style="{$disclaimerPanelStyle} margin:0 auto;">
  <div class="disclaimer-title">{$disclaimerTitle}</div>
  <div class="disclaimer-heading">{$disclaimerHeading}</div>
  {$disclaimerParagraphs}
</div>
HTML;

        // ---------------------------------------------------------------------
        // Page 2 - attestation block. Closes the sheet with the report
        // reference, the issue date and the authorised signature line so the
        // disclaimer no longer ends half a page above the footer.
        // ---------------------------------------------------------------------
        $attestTitle = $isTa ? 'சான்றளிக்கப்பட்டது &amp; உறுதிப்படுத்தப்பட்டது' : ($isHi ? 'प्रमाणित एवं अभिप्रमाणित' : 'CERTIFIED &amp; ATTESTED');
        $lblReference = $isTa ? 'குறிப்பு எண்' : ($isHi ? 'संदर्भ क्रमांक' : 'Reference');
        $lblIssuedOn = $isTa ? 'வழங்கப்பட்ட நாள்' : ($isHi ? 'जारी तिथि' : 'Issued On');
        $lblPreparedFor = $isTa ? 'இவர்களுக்காக' : ($isHi ? 'हेतु तैयार' : 'Prepared For');
        $lblSignatory = $isTa ? 'அங்கீகரிக்கப்பட்டவர்' : ($isHi ? 'अधिकृत हस्ताक्षरकर्ता' : 'Authorised Signatory');
        $signatoryDesk = $isTa ? 'ASTRO SIVAM வேத ஆய்வு மையம்' : ($isHi ? 'ASTRO SIVAM वैदिक अनुसंधान केंद्र' : 'ASTRO SIVAM Vedic Research Desk');
        $issueTimeZoneId = trim((string) ($result['generatedAtTimeZoneId'] ?? date_default_timezone_get()));
        try {
            $issueTimeZone = new DateTimeZone($issueTimeZoneId !== '' ? $issueTimeZoneId : date_default_timezone_get());
        } catch (Throwable $error) {
            $issueTimeZone = new DateTimeZone(date_default_timezone_get());
        }
        try {
            $generatedAtValue = trim((string) ($result['generatedAt'] ?? ''));
            $issueDate = new DateTimeImmutable($generatedAtValue !== '' ? $generatedAtValue : 'now', $issueTimeZone);
        } catch (Throwable $error) {
            $issueDate = new DateTimeImmutable('now', $issueTimeZone);
        }
        $issuedOn = self::e($issueDate->setTimezone($issueTimeZone)->format('d M Y, H:i T'));
        $referenceNo = self::e((string) $orderNumber);
        $attestation = <<<HTML
<div class="attestation">
  <div class="attestation-title">{$attestTitle}</div>
  <table class="attestation-grid"><tr>
    <td style="width:58%;">
      <div class="attest-item"><span class="attest-lbl">{$lblReference}</span><span class="attest-val">{$referenceNo}</span></div>
      <div class="attest-item"><span class="attest-lbl">{$lblIssuedOn}</span><span class="attest-val">{$issuedOn}</span></div>
      <div class="attest-item" style="margin-bottom:0;"><span class="attest-lbl">{$lblPreparedFor}</span><span class="attest-val">{$brideName} &#9792; &amp; {$groomName} &#9794;</span></div>
    </td>
    <td class="attestation-sign" style="width:42%;">
      <div class="signature-rule"></div>
      <div class="signatory-label">{$lblSignatory}</div>
      <div class="signatory-desk">{$signatoryDesk}</div>
    </td>
  </tr></table>
</div>
HTML;
        $disclaimerBody .= $attestation;

        $glossaryBodyWedding = astro_report_glossary_html('MARRIAGE_COMPATIBILITY', $lang);
        $glossarySubtitleWedding = $isTa ? 'சொல் விளக்கம்' : ($isHi ? 'शब्दार्थ' : 'Plain-language guide to this report');
        $glossarySheetWedding = $glossaryBodyWedding === ''
            ? ''
            : '<pagebreak /><div class="sheet glossary-sheet" id="wedding-glossary-sheet">'
                . self::topHeader('ASTRO SIVAM', $glossarySubtitleWedding, $orderNumber, 3, self::WEDDING_PAGE_TOTAL, $lang)
                . $glossaryBodyWedding . self::footerBand($lang) . '</div>';

        $css = self::sharedCss($lang);
        return '<!DOCTYPE html><html lang="' . self::e($lang) . '"><head><meta charset="UTF-8"><title>ASTRO SIVAM - Marriage Compatibility Report</title><style>' . $css . '</style></head><body>'
            . '<div class="sheet">' . $body . self::footerBand($lang) . '</div><pagebreak />'
            . '<div class="sheet">' . $disclaimerBody . self::footerBand($lang) . '</div>'
            . $glossarySheetWedding
            . '</body></html>';
    }

}
