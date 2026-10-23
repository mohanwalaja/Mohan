<?php
/**
 * ASTRO SIVAM — Report Glossary, Verdict Labels & Language Helpers
 */

require_once dirname(__DIR__) . '/muhurtham_report_notes.php';
require_once dirname(__DIR__) . '/wedding_disclaimer_notes.php';

if (!function_exists('astro_report_normalize_language')) {
    /** Local builder boundary: trust only the supported BCP-47 report language tags. */
    function astro_report_normalize_language($value): string {
        if (function_exists('astro_normalize_report_language')) {
            return astro_normalize_report_language($value);
        }
        if (!is_string($value)) return 'en';
        $language = strtolower(trim($value));
        return in_array($language, ['en', 'ta', 'hi'], true) ? $language : 'en';
    }
}
/**
 * THE SHARED LIFE-CARD RULES.
 *
 * Page 2 of the Birth Jathagam, the browser report and the AI Astrologer chat
 * all read api/astrology/life_cards_rules.json. The TypeScript side calls
 * computeLifeCardPredictions() from src/lib/astrology/lifeCardPredictions.ts;
 * PHP cannot execute TypeScript, so this file re-expresses the same verdict
 * expression - but the HOUSE LISTS and the BADGE WORDING below come from the
 * JSON, so changing the rule in one place changes the PDF too.
 *
 * That is the honest limit of the sharing: data and wording are single-sourced,
 * the ~1-line boolean expression is necessarily written twice.
 * tests/jathagam-page2-php-parity.test.ts fails if the two drift.
 *
 * @return array{dusthanaHouses: int[], badgeChallenging: array<string,string>, badgeSupportive: array<string,string>, badgeUnavailable: string}
 */
function astro_life_card_rules()
{
    static $rules = null;
    if ($rules !== null) {
        return $rules;
    }
    $fallback = [
        'dusthanaHouses' => [6, 8, 12],
        'badgeChallenging' => ['ta' => ' ⚠ கவனம்', 'hi' => ' ⚠ सावधान', 'en' => ' ⚠ Caution'],
        'badgeSupportive' => ['ta' => ' ✓ பலம்', 'hi' => ' ✓ बल', 'en' => ' ✓ Strength'],
        'badgeUnavailable' => ' · N/A',
    ];
    $path = dirname(__DIR__) . '/life_cards_rules.json';
    if (!is_file($path)) {
        return $fallback;
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $fallback;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $fallback;
    }
    $constants = is_array($decoded['constants'] ?? null) ? $decoded['constants'] : [];
    $suffix = is_array($decoded['badgeSuffix'] ?? null) ? $decoded['badgeSuffix'] : [];
    $dusthana = [];
    foreach ((array) ($constants['dusthanaHouses'] ?? []) as $h) {
        if (is_numeric($h)) {
            $dusthana[] = (int) $h;
        }
    }
    $pick = static function ($key) use ($suffix, $fallback) {
        $entry = $suffix[$key] ?? null;
        if (!is_array($entry)) {
            return $key === 'unavailable' ? $fallback['badgeUnavailable'] : [];
        }
        return [
            'ta' => (string) ($entry['ta'] ?? ''),
            'hi' => (string) ($entry['hi'] ?? ''),
            'en' => (string) ($entry['en'] ?? ''),
        ];
    };
    return [
        'dusthanaHouses' => $dusthana ?: [6, 8, 12],
        'badgeChallenging' => $pick('challenging') ?: $fallback['badgeChallenging'],
        'badgeSupportive' => $pick('supportive') ?: $fallback['badgeSupportive'],
        'badgeUnavailable' => is_string($suffix['unavailable'] ?? null) ? $suffix['unavailable'] : $fallback['badgeUnavailable'],
    ];
}

/**
 * Birth Jathagam page-1 wording, read from api/astrology/jathagam_page1.json.
 *
 * WHY: page 1 prints the English Janma Rasi as "Mesham/Aries" (all twelve
 * signs) and gives every dosha card a short two-line explanation. The browser
 * report (src/services/jathagamHtmlBuilder.ts) imports the SAME JSON, so the
 * preview, the customer PDF and the admin/email PDF cannot drift.
 *
 * @return array{zodiacSignEn: array<int,string>, doshaExplainers: array<string, array<string,string>>}
 */
function astro_jathagam_page1()
{
    static $page1 = null;
    if ($page1 !== null) {
        return $page1;
    }
    $fallback = [
        'zodiacSignEn' => [
            1 => 'Aries', 2 => 'Taurus', 3 => 'Gemini', 4 => 'Cancer', 5 => 'Leo', 6 => 'Virgo',
            7 => 'Libra', 8 => 'Scorpio', 9 => 'Sagittarius', 10 => 'Capricorn', 11 => 'Aquarius', 12 => 'Pisces',
        ],
        'doshaExplainers' => [],
    ];
    $path = dirname(__DIR__) . '/jathagam_page1.json';
    if (!is_file($path)) {
        return $fallback;
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $fallback;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $fallback;
    }

    $zodiac = [];
    foreach ((array) ($decoded['zodiacSignEn'] ?? []) as $sign => $name) {
        if (is_numeric($sign) && is_string($name) && $name !== '') {
            $zodiac[(int) $sign] = $name;
        }
    }
    $explainers = [];
    foreach ((array) ($decoded['doshaExplainers'] ?? []) as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $clean = [];
        foreach (['en', 'ta', 'hi'] as $langKey) {
            if (isset($entry[$langKey]) && is_string($entry[$langKey])) {
                $clean[$langKey] = $entry[$langKey];
            }
        }
        if ($clean !== []) {
            $explainers[(string) $key] = $clean;
        }
    }

    $page1 = [
        'zodiacSignEn' => $zodiac ?: $fallback['zodiacSignEn'],
        'doshaExplainers' => $explainers,
    ];
    return $page1;
}

/**
 * The shared plain-language glossary (api/astrology/report_glossary.json).
 *
 * WHY: the readability audit (docs/REPORTS_READABILITY_AUDIT_2026-10-20.md)
 * found 30 specialist terms across the four reports and not one explanation.
 * The wording is shared with src/services/reportGlossary.ts, so the browser
 * preview, the customer PDF and the emailed PDF explain a term identically.
 *
 * An unreadable/missing file returns an empty array and the caller simply does
 * not print the glossary sheet — it never prints a half-built one.
 */
function astro_report_glossary(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }
    $cache = [];
    $path = dirname(__DIR__) . '/report_glossary.json';
    if (!is_file($path)) {
        return $cache;
    }
    $raw = @file_get_contents($path);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        return $cache;
    }
    $cache = [
        'terms' => is_array($decoded['terms'] ?? null) ? $decoded['terms'] : [],
        'reportTerms' => is_array($decoded['reportTerms'] ?? null) ? $decoded['reportTerms'] : [],
        'quickTerms' => is_array($decoded['quickTerms'] ?? null) ? $decoded['quickTerms'] : [],
    ];
    return $cache;
}

/**
 * The terms one report uses, already resolved for the requested language:
 * [['label' => ..., 'meaning' => ...], ...]. English is the fallback, and a term
 * with an incomplete translation is skipped rather than printed half-empty.
 */
function astro_report_glossary_entries(string $reportKind, string $lang): array
{
    $glossary = astro_report_glossary();
    $keys = $glossary['reportTerms'][$reportKind] ?? [];
    $entries = [];
    foreach ((array) $keys as $key) {
        $row = $glossary['terms'][$key] ?? null;
        if (!is_array($row)) { continue; }
        $copy = is_array($row[$lang] ?? null) ? $row[$lang] : ($row['en'] ?? null);
        if (!is_array($copy)) { continue; }
        $label = trim((string) ($copy['label'] ?? ''));
        $meaning = trim((string) ($copy['meaning'] ?? ''));
        if ($label === '' || $meaning === '') { continue; }
        $entries[] = ['label' => $label, 'meaning' => $meaning];
    }
    return $entries;
}

/**
 * The five words a reader meets first (quickTerms in report_glossary.json).
 * Same lines as the full guide, so the box and the page can never disagree.
 */
function astro_report_glossary_quick_entries(string $reportKind, string $lang): array
{
    $glossary = astro_report_glossary();
    $keys = $glossary['quickTerms'][$reportKind] ?? [];
    $entries = [];
    foreach ((array) $keys as $key) {
        $row = $glossary['terms'][$key] ?? null;
        if (!is_array($row)) { continue; }
        $copy = is_array($row[$lang] ?? null) ? $row[$lang] : ($row['en'] ?? null);
        if (!is_array($copy)) { continue; }
        $label = trim((string) ($copy['label'] ?? ''));
        $meaning = trim((string) ($copy['meaning'] ?? ''));
        if ($label === '' || $meaning === '') { continue; }
        $entries[] = ['label' => $label, 'meaning' => $meaning];
    }
    return $entries;
}

/**
 * The compact "5 words you'll meet in this report" box: term + one line each,
 * closed by the pointer to the full guide. Printed on page 1 of the Birth
 * Jathagam and at the top of every Report Guide sheet.
 */
function astro_report_glossary_quick_html(string $reportKind, string $lang): string
{
    $entries = astro_report_glossary_quick_entries($reportKind, $lang);
    if ($entries === []) {
        return '';
    }
    $e = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    };
    $text = [
        'en' => [
            'title' => '5 words you will meet in this report',
            'more' => 'All the other words are explained in one line on the last page (Report Guide & Glossary).',
        ],
        'ta' => [
            'title' => 'இந்த அறிக்கையில் சந்திக்கும் 5 சொற்கள்',
            'more' => 'மற்ற அனைத்துச் சொற்களும் கடைசிப் பக்கத்தில் ஒரு வரியில் விளக்கப்பட்டுள்ளன (அறிக்கை வழிகாட்டி & சொல் விளக்கம்).',
        ],
        'hi' => [
            'title' => 'इस रिपोर्ट में मिलने वाले 5 शब्द',
            'more' => 'बाकी सभी शब्द अंतिम पृष्ठ पर एक पंक्ति में समझाए गए हैं (रिपोर्ट मार्गदर्शिका एवं शब्दार्थ)।',
        ],
    ];
    $copy = $text[$lang] ?? $text['en'];
    $rows = '';
    foreach ($entries as $entry) {
        $rows .= '<div class="glossary-quick-row"><b>' . $e($entry['label']) . '</b> — '
            . '<span class="glossary-quick-meaning">' . $e($entry['meaning']) . '</span></div>';
    }
    return '<div class="glossary-quick"><div class="glossary-quick-title">' . $e($copy['title']) . '</div>'
        . $rows . '<div class="glossary-quick-more">' . $e($copy['more']) . '</div></div>';
}

/**
 * The marriage verdict ladder, in the customer's own words.
 *
 * The porutham table used to print "Utthamam", "Madhyamam" and "Incompatible"
 * in one column - two Sanskrit words and one English word in the same list, so
 * a reader who does not know the Sanskrit could not rank them. All three tiers
 * now read as plain grading words, and the same ladder is used for the score
 * badge and the recommendation, so one row can never look like it came from a
 * different table:
 *
 *   UTTHAMAM    -> Very Good      / மிக நன்று        / बहुत अच्छा
 *   MADHYAMAM   -> Good           / நன்று            / अच्छा
 *   PORUNDHADHU -> Not Compatible / பொருத்தம் இல்லை / मेल नहीं
 *
 * $withHint adds the one-glance hint used where the verdict stands alone.
 */
function astro_porutham_verdict_label(?string $tier, string $lang, bool $withHint = false): string
{
    $label = [
        'UTTHAMAM' => ['en' => 'Very Good', 'ta' => 'மிக நன்று', 'hi' => 'बहुत अच्छा'],
        'MADHYAMAM' => ['en' => 'Good', 'ta' => 'நன்று', 'hi' => 'अच्छा'],
        'PORUNDHADHU' => ['en' => 'Not Compatible', 'ta' => 'பொருத்தம் இல்லை', 'hi' => 'मेल नहीं'],
    ];
    $hint = [
        'UTTHAMAM' => ['en' => 'Very Good (highly favourable)', 'ta' => 'மிக நன்று (மிகச் சாதகம்)', 'hi' => 'बहुत अच्छा (अत्यंत अनुकूल)'],
        'MADHYAMAM' => ['en' => 'Good (remedies may help)', 'ta' => 'நன்று (பரிகாரங்கள் உதவும்)', 'hi' => 'अच्छा (उपाय सहायक)'],
        'PORUNDHADHU' => ['en' => 'Not Compatible', 'ta' => 'பொருத்தம் இல்லை', 'hi' => 'मेल नहीं'],
    ];
    $key = strtoupper(trim((string) $tier));
    $map = $withHint ? $hint : $label;
    if (!isset($map[$key])) {
        return 'N/A';
    }
    return $map[$key][$lang] ?? $map[$key]['en'];
}

/**
 * Reads a verdict tier out of anything an older saved order may carry: the
 * enum itself, the engine's legacy labels ("Uthama (Excellent)",
 * "Madhyama (Good)", "Porundhadhu (Not Compatible)") or the plain wording.
 */
function astro_porutham_verdict_tier($value): ?string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }
    $upper = strtoupper($raw);
    if (in_array($upper, ['UTTHAMAM', 'MADHYAMAM', 'PORUNDHADHU'], true)) {
        return $upper;
    }
    $lower = strtolower($raw);
    if (preg_match('/very good|utthama|uthama|uttama|excellent|highly|மிக நன்று|बहुत अच्छा/u', $lower)) {
        return 'UTTHAMAM';
    }
    if (preg_match('/^good\b|madhyam|mathimam|moderate|acceptable|partial|^நன்று\b|^अच्छा\b/u', $lower)) {
        return 'MADHYAMAM';
    }
    if (preg_match('/incompatible|porundh|not compatible|not recommended|adhamam|பொருத்தம் இல்லை|பொருந்தாது|मेल नहीं/u', $lower)) {
        return 'PORUNDHADHU';
    }
    return null;
}

/**
 * The "Report Guide & Glossary" sheet body for one report: title, two-column
 * list of term + one-line meaning, and the closing reassurance.
 */
function astro_report_glossary_html(string $reportKind, string $lang, bool $includeQuick = true): string
{
    $entries = astro_report_glossary_entries($reportKind, $lang);
    if ($entries === []) {
        return '';
    }
    $quickHtml = $includeQuick ? astro_report_glossary_quick_html($reportKind, $lang) : '';
    $e = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    };
    $text = [
        'en' => [
            'title' => 'Report Guide & Glossary',
            'intro' => 'Every technical word used in this report, explained in one line. Read this page once and the whole report becomes clear.',
            'note' => 'Nothing here is a prediction of doom. These words describe tendencies and timings; the reports always state a caution together with what to do about it.',
        ],
        'ta' => [
            'title' => 'அறிக்கை வழிகாட்டி & சொல் விளக்கம்',
            'intro' => 'இந்த அறிக்கையில் பயன்படுத்தப்பட்ட ஒவ்வொரு தொழில்நுட்பச் சொல்லும் ஒரு வரியில் விளக்கப்பட்டுள்ளது. இந்தப் பக்கத்தை ஒருமுறை படித்தால் முழு அறிக்கையும் தெளிவாகும்.',
            'note' => 'இங்கு எதுவும் தீங்கான முன்னறிவிப்பு அல்ல. இவை போக்குகளையும் காலங்களையும் குறிக்கும்; ஒவ்வொரு கவனத்திற்கும் என்ன செய்ய வேண்டும் என்பதும் அறிக்கையில் தரப்படுகிறது.',
        ],
        'hi' => [
            'title' => 'रिपोर्ट मार्गदर्शिका एवं शब्दार्थ',
            'intro' => 'इस रिपोर्ट में प्रयुक्त हर तकनीकी शब्द एक पंक्ति में समझाया गया है। यह पृष्ठ एक बार पढ़ लें, पूरी रिपोर्ट स्पष्ट हो जाएगी।',
            'note' => 'यहाँ कुछ भी अशुभ भविष्यवाणी नहीं है। ये शब्द प्रवृत्तियाँ और समय बताते हैं; हर सावधानी के साथ यह भी बताया जाता है कि क्या करना है।',
        ],
    ];
    $copy = $text[$lang] ?? $text['en'];
    // Print renderers have no CSS columns, so the list is one table per column:
    // the entries are split down the middle and laid out side by side.
    $half = (int) ceil(count($entries) / 2);
    $left = ''; $right = '';
    foreach ($entries as $index => $entry) {
        $cell = '<div class="glossary-item"><div class="glossary-term">' . $e($entry['label'])
            . '</div><div class="glossary-meaning">' . $e($entry['meaning']) . '</div></div>';
        if ($index < $half) { $left .= $cell; } else { $right .= $cell; }
    }
    return '<div class="glossary-sheet-body">'
        . '<div class="glossary-title">' . $e($copy['title']) . '</div>'
        . '<div class="glossary-intro">' . $e($copy['intro']) . '</div>'
        . $quickHtml
        . '<table class="glossary-columns"><tr><td class="glossary-col">' . $left
        . '</td><td class="glossary-col">' . $right . '</td></tr></table>'
        . '<div class="glossary-note">' . $e($copy['note']) . '</div>'
        . '</div>';
}

/**
 * One two-line dosha explanation. Falls back to English, then to an empty string
 * (the caller then keeps its unavailable/N/A sentence).
 */
function astro_jathagam_dosha_explainer(string $key, string $lang): string
{
    $explainers = astro_jathagam_page1()['doshaExplainers'];
    $entry = is_array($explainers[$key] ?? null) ? $explainers[$key] : [];
    $text = $entry[$lang] ?? ($entry['en'] ?? '');
    return is_string($text) ? $text : '';
}

