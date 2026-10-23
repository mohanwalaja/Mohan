<?php
/**
 * ASTRO SIVAM — Birth Jathagam Summary CSS & Lucky Indicators
 */

trait AstroReportBirthLuckyTrait
{
    /**
     * Page-3-only styles for the Birth Jathagam Short Summary.
     *
     * Print renderers have no flexbox or grid, so the summary is laid out in tables, and
     * every rule stays local to #birth-summary-sheet so the other reports and
     * pages 1-2 are untouched. Text never drops below 10.5px - the readability
     * floor shared with the HTML builder and the jsPDF renderer - and that
     * floor includes the table's muted header line, so all three renderers
     * agree on the smallest size the Short Summary is allowed to use.
     *
     * Type sizes stay at the proven 3-page budget: a print renderer cannot measure leftover
     * space the way fitJathagamSummaryText does in the browser, and enlarging
     * here spills a fourth physical page (Tamil/Hindi wrap). Compact mode
     * (5 to 9 flagged grahas) keeps the same 10.5px floor.
     */
    public static function birthSummaryCss(): string
    {
        return <<<CSS
    #birth-summary-sheet { padding: 5.5mm 7mm 5.5mm; }
    #birth-summary-sheet .summary-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.4mm 2mm; margin-bottom: 1.6mm; page-break-inside: avoid; }
    #birth-summary-sheet .summary-card-title { font-size: 14px; font-weight: bold; color: #7a1230; border-bottom: 0.6px solid #e5e7eb; padding-bottom: 0.5mm; margin-bottom: 1mm; }
    #birth-summary-sheet .summary-card.good { background: #f2fbf6; border-color: #bfe6d3; }
    #birth-summary-sheet .summary-card.care { background: #fffaf0; border-color: #f1d9a6; }
    #birth-summary-sheet .summary-card-title.good { color: #0f6b4a; border-bottom-color: #bfe6d3; }
    #birth-summary-sheet .summary-card-title.care { color: #92400e; border-bottom-color: #f1d9a6; }
    #birth-summary-sheet table.summary-details { width: 100%; border-collapse: separate; border-spacing: 0.8mm 0.8mm; table-layout: fixed; }
    #birth-summary-sheet table.summary-details td.summary-cell { background: #ffffff; border: 0.6px solid #e5e7eb; border-radius: 4px; padding: 0.7mm 1mm; vertical-align: top; }
    #birth-summary-sheet .summary-detail-label { font-size: 10.5px; color: #6b7280; line-height: 1.3; }
    #birth-summary-sheet .summary-detail-value { font-size: 11.5px; font-weight: bold; color: #1f2937; line-height: 1.35; word-wrap: break-word; }
    #birth-summary-sheet table.summary-good { width: 100%; border-collapse: separate; border-spacing: 0.8mm 0.8mm; table-layout: fixed; }
    #birth-summary-sheet td.summary-planet-empty { border: none; background: transparent; padding: 0; }
    #birth-summary-sheet td.summary-planet { background: #ffffff; border: 0.6px solid #bfe6d3; border-radius: 4px; padding: 0.8mm 1mm; vertical-align: top; }
    #birth-summary-sheet .summary-planet-name { font-size: 13px; font-weight: bold; color: #0f6b4a; line-height: 1.3; }
    #birth-summary-sheet .summary-planet-note { font-size: 11.5px; color: #1f2937; line-height: 1.45; }
    #birth-summary-sheet table.summary-care { width: 100%; border-collapse: collapse; table-layout: fixed; }
    #birth-summary-sheet table.summary-care th { background: #ffffff; color: #6b7280; font-size: 10.5px; font-weight: bold; text-align: left; border: 0.6px solid #f1d9a6; padding: 0.5mm 0.9mm; }
    #birth-summary-sheet table.summary-care td { border: 0.6px solid #f1d9a6; padding: 0.7mm 0.9mm; vertical-align: top; font-size: 11px; line-height: 1.45; color: #1f2937; word-wrap: break-word; }
    #birth-summary-sheet td.summary-care-planet { font-weight: bold; color: #7a1230; font-size: 13px; line-height: 1.3; }
    #birth-summary-sheet .summary-care-label { font-weight: bold; color: #92400e; }
    #birth-summary-sheet .summary-empty { color: #0f6b4a; font-size: 11.5px; font-weight: bold; line-height: 1.45; }
    #birth-summary-sheet .summary-care-compact { color: #1f2937; }
    #birth-summary-sheet .summary-incomplete { color: #92400e; font-size: 10.5px; line-height: 1.45; font-weight: normal; }
    #birth-summary-sheet .summary-short { font-size: 11.5px; line-height: 1.5; color: #1f2937; margin: 0; }
    #birth-summary-sheet .summary-short + .summary-short { margin-top: 0.6mm; }
    #birth-summary-sheet .summary-reassurance { background: #f8f9fb; border: 0.6px solid #e5e7eb; border-left: 2.5px solid #7a1230; border-radius: 4px; padding: 1mm 1.4mm; font-size: 11px; line-height: 1.5; color: #1f2937; }
    #birth-summary-sheet .summary-card.lucky { background: #fffbeb; border-color: #f3e0a6; }
    #birth-summary-sheet .summary-card-title.lucky { color: #8a5a00; border-bottom-color: #f3e0a6; }
    #birth-summary-sheet .lucky-row-head { font-size: 10.5px; font-weight: bold; color: #8a5a00; line-height: 1.35; margin-top: 0.6mm; }
    #birth-summary-sheet .lucky-row-sub { color: #6b7280; font-weight: normal; }
    #birth-summary-sheet table.lucky-grid td.lucky-cell { border-color: #f3e0a6; }
    #birth-summary-sheet .lucky-value { color: #7a1230; }
    #birth-summary-sheet .lucky-note { font-size: 10.5px; line-height: 1.4; color: #4b5563; margin: 0.6mm 0 0; }
    #birth-summary-sheet.is-compact .lucky-row-sub { display: none; }
    #birth-summary-sheet.is-compact .lucky-row-head { margin-top: 0.3mm; }
    #birth-summary-sheet.is-compact .summary-card { padding: 1.1mm 1.6mm; margin-bottom: 1.3mm; }
    #birth-summary-sheet.is-compact table.summary-care td { font-size: 10.5px; padding: 0.5mm 0.8mm; line-height: 1.4; }
    #birth-summary-sheet.is-compact .summary-detail-value { font-size: 11px; }
    #birth-summary-sheet.is-compact .summary-planet-note { font-size: 11px; }
    #birth-summary-sheet.is-compact .summary-short { font-size: 11px; line-height: 1.45; }
    #birth-summary-sheet.is-compact .summary-reassurance { font-size: 10.5px; line-height: 1.45; }
CSS;
    }

    /**
     * Lucky-indicator data for the Birth Jathagam page 3 — mirror of
     * src/services/jathagamLuckyData.ts. Every indicator belongs to a GRAHA:
     * the native receives it through the janma nakshatra lord (birth stone,
     * lucky colour, three lucky numbers) and the Chandra rasi lord (rasi
     * stone, rasi colour, rasi number). Tamil sources: Samayam Tamil (27
     * nakshatra lucky god/number/colour/stone; 27 nakshatra gems; graha
     * numbers), livingastro 27 நட்சத்திரக் குறிப்புகள், SwasthikTv 12 ராசி நிறங்கள்,
     * Zee News Tamil ராசிக்கு ஏற்ற ரத்தினம். Keep both copies in sync.
     */
    public static function jathagamLuckyProfiles(): array
    {
        return [
            'sun' => [
                'name' => ['en' => 'Surya (Sun)', 'ta' => 'சூரியன்', 'hi' => 'सूर्य'],
                'stone' => ['en' => 'Ruby (Manikkam)', 'ta' => 'மாணிக்கம்', 'hi' => 'माणिक्य (रूबी)'],
                'colour' => ['en' => 'Red', 'ta' => 'சிவப்பு', 'hi' => 'लाल'],
                'number' => 1, 'luckyNumbers' => [1, 5, 7],
            ],
            'moon' => [
                'name' => ['en' => 'Chandra (Moon)', 'ta' => 'சந்திரன்', 'hi' => 'चंद्र'],
                'stone' => ['en' => 'Pearl (Muthu)', 'ta' => 'முத்து', 'hi' => 'मोती'],
                'colour' => ['en' => 'White', 'ta' => 'வெள்ளை', 'hi' => 'सफ़ेद'],
                'number' => 2, 'luckyNumbers' => [2, 3, 9],
            ],
            'mars' => [
                'name' => ['en' => 'Chevvai (Mars)', 'ta' => 'செவ்வாய்', 'hi' => 'मंगल'],
                'stone' => ['en' => 'Red Coral (Pavalam)', 'ta' => 'பவளம்', 'hi' => 'मूंगा'],
                'colour' => ['en' => 'Light red / Pink', 'ta' => 'இளஞ்சிவப்பு', 'hi' => 'हल्का लाल / गुलाबी'],
                'number' => 9, 'luckyNumbers' => [3, 6, 9],
            ],
            'mercury' => [
                'name' => ['en' => 'Budha (Mercury)', 'ta' => 'புதன்', 'hi' => 'बुध'],
                'stone' => ['en' => 'Emerald (Maragatham)', 'ta' => 'மரகதம்', 'hi' => 'पन्ना'],
                'colour' => ['en' => 'Green', 'ta' => 'பச்சை', 'hi' => 'हरा'],
                'number' => 5, 'luckyNumbers' => [1, 5, 8],
            ],
            'jupiter' => [
                'name' => ['en' => 'Guru (Jupiter)', 'ta' => 'குரு', 'hi' => 'गुरु'],
                'stone' => ['en' => 'Yellow Sapphire (Pushparagam)', 'ta' => 'புஷ்பராகம்', 'hi' => 'पुखराज'],
                'colour' => ['en' => 'Yellow', 'ta' => 'மஞ்சள்', 'hi' => 'पीला'],
                'number' => 3, 'luckyNumbers' => [2, 3, 9],
            ],
            'venus' => [
                'name' => ['en' => 'Sukra (Venus)', 'ta' => 'சுக்கிரன்', 'hi' => 'शुक्र'],
                'stone' => ['en' => 'Diamond (Vairam)', 'ta' => 'வைரம்', 'hi' => 'हीरा'],
                'colour' => ['en' => 'White', 'ta' => 'வெள்ளை', 'hi' => 'सफ़ेद'],
                'number' => 6, 'luckyNumbers' => [3, 6, 8],
            ],
            'saturn' => [
                'name' => ['en' => 'Sani (Saturn)', 'ta' => 'சனி', 'hi' => 'शनि'],
                'stone' => ['en' => 'Blue Sapphire (Neelam)', 'ta' => 'நீலம்', 'hi' => 'नीलम'],
                'colour' => ['en' => 'Dark blue / Black', 'ta' => 'கருநீலம் / கருப்பு', 'hi' => 'गहरा नीला / काला'],
                'number' => 8, 'luckyNumbers' => [5, 6, 8],
            ],
            'rahu' => [
                'name' => ['en' => 'Rahu', 'ta' => 'ராகு', 'hi' => 'राहु'],
                'stone' => ['en' => 'Hessonite (Gomedhagam)', 'ta' => 'கோமேதகம்', 'hi' => 'गोमेद'],
                'colour' => ['en' => 'Black / Smoky', 'ta' => 'கருப்பு', 'hi' => 'काला / धुएँ जैसा'],
                'number' => 4, 'luckyNumbers' => [1, 4, 7],
            ],
            'ketu' => [
                'name' => ['en' => 'Ketu', 'ta' => 'கேது', 'hi' => 'केतु'],
                'stone' => ['en' => "Cat's Eye (Vaiduryam)", 'ta' => 'வைடூரியம்', 'hi' => 'लहसुनिया (वैदूर्य)'],
                'colour' => ['en' => 'Red with mixed colours', 'ta' => 'சிவப்பு கலந்த பல நிறங்கள்', 'hi' => 'लाल व मिश्रित रंग'],
                'number' => 7, 'luckyNumbers' => [5, 7, 9],
            ],
        ];
    }

    public static function jathagamLuckyText(string $lang): array
    {
        $all = [
            'en' => [
                'title' => 'Lucky Indicators — Birth Stone, Colour & Numbers (by Nakshatra)',
                'nakshatraRow' => 'By Janma Nakshatra', 'rasiRow' => 'By Chandra Rasi', 'lord' => 'Lord',
                'birthStone' => 'Birth Stone', 'rasiStone' => 'Rasi Stone',
                'luckyColour' => 'Lucky Colour', 'rasiColour' => 'Rasi Colour',
                'luckyNumbers' => 'Lucky Numbers', 'rasiNumber' => 'Rasi Number',
                'note' => 'As per Tamil Ratna Sastra the stone, colour and numbers follow the janma nakshatra lord. A gem should be worn only after a personal consultation; the colour and numbers can be used freely in daily life.',
                'noteShort' => 'Wear a gem only after a personal consultation; colour and numbers may be used freely.',
                'unavailable' => 'N/A',
            ],
            'ta' => [
                'title' => 'அதிர்ஷ்டக் குறிப்புகள் — நட்சத்திரக் கல், நிறம், எண்',
                'nakshatraRow' => 'ஜென்ம நட்சத்திரப்படி', 'rasiRow' => 'சந்திர ராசிப்படி', 'lord' => 'அதிபதி',
                'birthStone' => 'நட்சத்திரக் கல்', 'rasiStone' => 'ராசிக் கல்',
                'luckyColour' => 'அதிர்ஷ்ட நிறம்', 'rasiColour' => 'ராசி நிறம்',
                'luckyNumbers' => 'அதிர்ஷ்ட எண்கள்', 'rasiNumber' => 'ராசி எண்',
                'note' => 'தமிழ் ரத்ன சாஸ்திரப்படி கல், நிறம், எண் ஆகியவை ஜென்ம நட்சத்திர அதிபதியைப் பொறுத்து அமைகின்றன. ரத்தினக் கல்லை தனிப்பட்ட ஆலோசனைக்குப் பின்னரே அணிய வேண்டும்; நிறத்தையும் எண்களையும் அன்றாட வாழ்வில் தாராளமாகப் பயன்படுத்தலாம்.',
                'noteShort' => 'ரத்தினக் கல்லை ஆலோசனைக்குப் பின்னரே அணியவும்; நிறம், எண்களைத் தாராளமாகப் பயன்படுத்தலாம்.',
                'unavailable' => 'கிடைக்கவில்லை',
            ],
            'hi' => [
                'title' => 'शुभ संकेत — जन्म रत्न, रंग व अंक (नक्षत्र अनुसार)',
                'nakshatraRow' => 'जन्म नक्षत्र के अनुसार', 'rasiRow' => 'चंद्र राशि के अनुसार', 'lord' => 'स्वामी',
                'birthStone' => 'जन्म रत्न', 'rasiStone' => 'राशि रत्न',
                'luckyColour' => 'शुभ रंग', 'rasiColour' => 'राशि रंग',
                'luckyNumbers' => 'शुभ अंक', 'rasiNumber' => 'राशि अंक',
                'note' => 'तमिल रत्न शास्त्र के अनुसार रत्न, रंग और अंक जन्म नक्षत्र स्वामी से निर्धारित होते हैं। रत्न केवल व्यक्तिगत परामर्श के बाद ही धारण करें; रंग और अंक दैनिक जीवन में सहज रूप से अपनाए जा सकते हैं।',
                'noteShort' => 'रत्न केवल परामर्श के बाद धारण करें; रंग और अंक सहज रूप से अपनाएँ।',
                'unavailable' => 'उपलब्ध नहीं',
            ],
        ];
        return $all[$lang] ?? $all['en'];
    }

    /** Vimshottari nakshatra-lord cycle from Aswini (0-based index). */
    public static function jathagamNakshatraLord($index): ?string
    {
        if (!is_numeric($index)) return null;
        $n = (int) $index;
        if ((float) $index !== (float) $n || $n < 0 || $n > 26) return null;
        $cycle = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
        return $cycle[$n % 9];
    }

    /** Rasi lord for a 1-based rasi number. */
    public static function jathagamRasiLordKey($rasi): ?string
    {
        if (!is_numeric($rasi)) return null;
        $n = (int) $rasi;
        if ((float) $rasi !== (float) $n || $n < 1 || $n > 12) return null;
        $lords = [1 => 'mars', 2 => 'venus', 3 => 'mercury', 4 => 'moon', 5 => 'sun', 6 => 'mercury',
            7 => 'venus', 8 => 'mars', 9 => 'jupiter', 10 => 'saturn', 11 => 'saturn', 12 => 'jupiter'];
        return $lords[$n];
    }

    /**
     * Resolve the page-3 lucky indicators from the janma nakshatra. An
     * unreadable index never fabricates a stone — the language's "N/A" is
     * printed instead (same rule as Node).
     */
    public static function resolveJathagamLuckyIndicators($janmaNakshatraIndex, string $lang): array
    {
        $text = self::jathagamLuckyText($lang);
        $profiles = self::jathagamLuckyProfiles();
        $nakLord = self::jathagamNakshatraLord($janmaNakshatraIndex);
        $nak = $nakLord !== null ? ($profiles[$nakLord] ?? null) : null;
        $pick = static function ($record) use ($lang, $text): string {
            if (!is_array($record)) return (string) $text['unavailable'];
            return (string) ($record[$lang] ?? $record['en'] ?? $text['unavailable']);
        };
        return [
            'nakshatraLord' => $nakLord,
            'nakshatraLordName' => $nak ? $pick($nak['name']) : (string) $text['unavailable'],
            'birthStone' => $nak ? $pick($nak['stone']) : (string) $text['unavailable'],
            'luckyColour' => $nak ? $pick($nak['colour']) : (string) $text['unavailable'],
            'luckyNumbers' => $nak ? implode(', ', $nak['luckyNumbers']) : (string) $text['unavailable'],
        ];
    }

    /**
     * English house ordinals: 1st / 2nd / 3rd - never "1th" / "2th" / "3th".
     */
    public static function houseOrdinalEn($n): string
    {
        $n = (int)$n;
        $map = [1 => '1st', 2 => '2nd', 3 => '3rd', 4 => '4th', 5 => '5th', 6 => '6th',
                7 => '7th', 8 => '8th', 9 => '9th', 10 => '10th', 11 => '11th', 12 => '12th'];
        return $map[$n] ?? ($n . 'th');
    }

    /**
     * Hindi house ordinals: the first three houses use their own words, so a
     * generic "वें" suffix would read wrong for भाव 1-3.
     */
    public static function houseOrdinalHi($n): string
    {
        $n = (int)$n;
        $map = [1 => 'पहले', 2 => 'दूसरे', 3 => 'तीसरे', 4 => 'चौथे', 5 => 'पांचवें', 6 => 'छठे',
                7 => 'सातवें', 8 => 'आठवें', 9 => 'नौवें', 10 => 'दसवें', 11 => 'ग्यारहवें', 12 => 'बारहवें'];
        return $map[$n] ?? ($n . 'वें');
    }

    /**
     * Render one bulleted list for the Navagraha guidance panel.
     *
     * Print renderers have only partial CSS list-marker support, so the bullet is
     * emitted as a literal character inside a plain block element - that way
     * the browser preview and the printed page look identical.
     *
     * @param array<int, array{0: string, 1: string}> $items [heading, text] pairs
     */
    public static function navagrahaBullets(array $items): string
    {
        $html = '';
        foreach ($items as $item) {
            $html .= '<div class="navagraha-reason">&bull; <strong>'
                . self::e((string)($item[0] ?? '')) . ':</strong> '
                . self::e((string)($item[1] ?? '')) . '</div>';
        }
        return $html;
    }


}
