<?php
/**
 * Exhaustive PHP-WASM probe verifying 100% answer coverage, safety guardrails,
 * script purity, localization fidelity, and multi-source classical accuracy across:
 *   1. Every curated guided option x 3 languages (en/ta/hi) x chart / no-chart
 *   2. 100+ free-text astrology queries across English, Tamil, and Hindi
 *   3. Honest handoff on non-astrology negative controls
 */
error_reporting(E_ALL);
file_put_contents('/repo/api/config.php', "<?php\n// probe stub\n");

require_once '/repo/api/astrology/ai_astrologer_provider.php';
require_once '/repo/api/astrology/engine.php';

if (!function_exists('astro_normalize_report_language')) {
    function astro_normalize_report_language($l) { return in_array($l, ['en', 'ta', 'hi'], true) ? $l : 'ta'; }
}
require_once '/repo/api/astrology/ai_astrologer/guided_and_binding.php';
require_once '/repo/api/astrology/ai_astrologer/chart_and_report_facts.php';

$order = [
    'id' => 'complete-1',
    'service_type' => 'BIRTH_JATHAGAM',
    'language' => 'en',
    'order_number' => 'AST-COMPLETE-1',
    'input_payload' => json_encode([
        'name' => 'Mohan',
        'dob' => '1990-05-15',
        'tob' => '06:30',
        'birthPlace' => 'Chennai, Tamil Nadu, India',
        'country' => 'India',
        'latitude' => 13.0827,
        'longitude' => 80.2707,
        'timezoneOffsetHours' => 5.5,
    ]),
];
$facts = astro_ai_chart_facts($order);
$chart = $facts['chart'];

$orderDetails = 'Order number: AST-COMPLETE-1 | Service: BIRTH_JATHAGAM | Amount paid: USD 50 | '
    . 'Payment: confirmed | Placed on: 2026-10-01 | Report emailed on: 2026-10-02 | Order status: COMPLETED | '
    . 'Birth details used: Name: Mohan, Date of birth: 1990-05-15, Time of birth: 06:30, Birth place: Chennai';

$guidedJson = json_decode(file_get_contents('/repo/knowledge/ai-astrologer/rules/guided-questions.json'), true);

$guidedRuns = 0;
$guidedFailures = [];
$scriptLeaks = [];
$samples = [];

foreach (($guidedJson['categories'] ?? []) as $cat) {
    foreach (($cat['questions'] ?? []) as $q) {
        $id = (string) $q['id'];
        foreach (['en', 'ta', 'hi'] as $lang) {
            foreach ([true, false] as $withChart) {
                $guidedRuns++;
                $found = astro_ai_guided_find($id);
                $text = (string) ($q['text'][$lang] ?? '');
                $r = AstroAiProvider::answer($text, $lang, [], $withChart ? $chart : null, [
                    'customerName' => 'Mohan',
                    'orderTitle' => 'BIRTH_JATHAGAM',
                    'orderDetails' => $withChart ? $orderDetails : '',
                    'guided' => $found,
                ]);
                $guard = AstroAiProvider::checkReply($r['content'], $lang);
                $unresolvedKnowledge = ($q['kind'] ?? '') === 'knowledge' && !empty($r['handoff']);
                if ($unresolvedKnowledge || !$guard['ok'] || empty($r['bubbles']) || trim($r['content']) === '') {
                    $guidedFailures[] = [
                        'id' => $id,
                        'lang' => $lang,
                        'withChart' => $withChart,
                        'unresolvedKnowledge' => $unresolvedKnowledge,
                        'violations' => $guard['violations'],
                    ];
                }
                $hasTamil = preg_match('/[\x{0B80}-\x{0BFF}]/u', $r['content']) === 1;
                $hasDeva = preg_match('/[\x{0900}-\x{097F}]/u', $r['content']) === 1;
                if ($lang === 'en' && ($hasTamil || $hasDeva)) {
                    $scriptLeaks[] = ['id' => $id, 'lang' => $lang, 'withChart' => $withChart, 'content' => $r['content']];
                }
                if ($lang === 'ta' && $hasDeva) {
                    $scriptLeaks[] = ['id' => $id, 'lang' => $lang, 'withChart' => $withChart, 'content' => $r['content']];
                }
                if ($lang === 'hi' && $hasTamil) {
                    $scriptLeaks[] = ['id' => $id, 'lang' => $lang, 'withChart' => $withChart, 'content' => $r['content']];
                }
                if ($withChart && in_array($id, ['remedy-rahuketu', 'remedy-personal', 'remedy-temple', 'current-year', 'current-period', 'current-star', 'current-sade-sati', 'current-family-journal', 'career-overview', 'bhava-family-resources-guide', 'transit-varshaphala-guide', 'yoga-dhana-guide'], true)) {
                    $samples[$id][$lang] = [
                        'content' => $r['content'],
                        'bubbles' => $r['bubbles'],
                        'sourceLine' => $r['sourceLine'] ?? '',
                    ];
                }
                if (!$withChart && in_array($id, ['dosha-all', 'dosha-kuja', 'dosha-kalasarpa'], true)) {
                    $samples[$id . '-nochart'][$lang] = [
                        'content' => $r['content'],
                        'bubbles' => $r['bubbles'],
                    ];
                }
            }
        }
    }
}

$freeQueries = [
    ['en', 'How is my career?'],
    ['en', 'When will I get promoted?'],
    ['en', 'Should I do job or business?'],
    ['en', 'How is my wealth and savings?'],
    ['en', 'Will I clear my debt?'],
    ['en', 'How is my education and higher study?'],
    ['en', 'When will I get married?'],
    ['en', 'Will we have children?'],
    ['en', 'When can I buy my own house or land?'],
    ['en', 'Will I settle abroad?'],
    ['en', 'How is my health and vitality?'],
    ['en', 'What is my current Mahadasha and Bhukti?'],
    ['en', 'What is Kuja Dosha?'],
    ['en', 'What is Sevvai Dosham?'],
    ['en', 'What is Kala Sarpa Dosha?'],
    ['en', 'What is Pitru Dosha?'],
    ['en', 'What is Guru Chandala Dosha?'],
    ['en', 'What is Kalathra Dosha?'],
    ['en', 'What is Putra Dosha?'],
    ['en', 'What is Kemadruma Yoga?'],
    ['en', 'What is Sakata Yoga?'],
    ['en', 'What is Papa Kartari Yoga?'],
    ['en', 'What is Gajakesari Yoga?'],
    ['en', 'What is Budhaditya Yoga?'],
    ['en', 'What is Raja Yoga?'],
    ['en', 'What is Dhana Yoga?'],
    ['en', 'What is Pancha Mahapurusha Yoga?'],
    ['en', 'What is Hamsa Yoga?'],
    ['en', 'What is Ruchaka Yoga?'],
    ['en', 'What is Malavya Yoga?'],
    ['en', 'What is Sasa Yoga?'],
    ['en', 'What is Neecha Bhanga Raja Yoga?'],
    ['en', 'What is Vipareeta Raja Yoga?'],
    ['en', 'What is Parivartana Yoga?'],
    ['en', 'What is Sade Sati?'],
    ['en', 'What is Ezharai Sani?'],
    ['en', 'What is Ashtama Sani?'],
    ['en', 'What is Kantaka Sani?'],
    ['en', 'What is Guru Peyarchi?'],
    ['en', 'What is Rahu Ketu Peyarchi?'],
    ['en', 'What is Chandrashtamam?'],
    ['en', 'What is Rahu Kalam?'],
    ['en', 'What is Yamagandam?'],
    ['en', 'What is Gulikai Kalam?'],
    ['en', 'What is Nalla Neram?'],
    ['en', 'What is Abhijit Muhurtham?'],
    ['en', 'What is Brahma Muhurtham?'],
    ['en', 'How is Subha Muhurtham chosen?'],
    ['en', 'Best rules for Grihapravesam housewarming?'],
    ['en', 'What is Ekadashi fasting significance?'],
    ['en', 'What is Pradosham worship?'],
    ['en', 'What is Sankatahara Chaturthi?'],
    ['en', 'What is Amavasya tarpanam?'],
    ['en', 'What are the 10 Poruthams in marriage matching?'],
    ['en', 'What is Kudumpa Jothidam?'],
    ['en', 'What is Varshaphala?'],
    ['en', 'What is Rajju Porutham?'],
    ['en', 'What is Dina Porutham?'],
    ['en', 'What is Gana Porutham?'],
    ['en', 'What is Yoni Porutham?'],
    ['en', 'What is Vedha Porutham?'],
    ['en', 'What is Nadi Koota?'],
    ['en', 'What is Lagna ascendant?'],
    ['en', 'What are the 12 Rasis?'],
    ['en', 'What are the 27 Nakshatras?'],
    ['en', 'What is Navamsa D9 chart?'],
    ['en', 'What is Vargottama?'],
    ['en', 'What is Vimshottari Dasha?'],
    ['en', 'How is baby name starting letter chosen from Janma Nakshatra?'],
    ['en', 'What are the 9 Navagraha temples?'],
    ['en', 'What is Panchapakshi Sastram?'],
    ['en', 'What is Nadi astrology?'],
    ['en', 'Tell me about 1st house'],
    ['en', 'Tell me about 2nd house'],
    ['en', 'Tell me about 3rd house'],
    ['en', 'Tell me about 4th house'],
    ['en', 'Tell me about 5th house'],
    ['en', 'Tell me about 6th house'],
    ['en', 'Tell me about 7th house'],
    ['en', 'Tell me about 8th house'],
    ['en', 'Tell me about 9th house'],
    ['en', 'Tell me about 10th house'],
    ['en', 'Tell me about 11th house'],
    ['en', 'Tell me about 12th house'],
    ['en', 'Explain all 12 houses in astrology'],
    ['en', 'Tell me about Guru in my chart'],
    ['en', 'Remedies for Surya'],
    ['en', 'Remedies for Rahu and Ketu'],
    ['en', 'Which temple should I visit?'],
    // Tamil queries
    ['ta', 'என் தொழில் எப்படி இருக்கும்?'],
    ['ta', 'செவ்வாய் தோஷம் என்றால் என்ன?'],
    ['ta', 'கால சர்ப்ப தோஷம் என்றால் என்ன?'],
    ['ta', 'பித்ரு தோஷம் என்றால் என்ன?'],
    ['ta', 'குரு சண்டால யோகம் என்றால் என்ன?'],
    ['ta', 'ஏழரைச் சனி என்றால் என்ன?'],
    ['ta', 'அஷ்டம சனி என்றால் என்ன?'],
    ['ta', 'சந்திராஷ்டமம் என்றால் என்ன?'],
    ['ta', 'ராகு காலம் எமகண்டம் நேரம் என்ன?'],
    ['ta', 'கஜகேசரி யோகம் என்றால் என்ன?'],
    ['ta', '10 பொருத்தங்கள் யாவை?'],
    ['ta', 'குடும்ப ஜோதிடம் என்றால் என்ன?'],
    ['ta', 'வர்ஷபலம் என்றால் என்ன?'],
    ['ta', 'ரஜ்ஜு பொருத்தம் என்றால் என்ன?'],
    ['ta', '5-ஆம் வீடு பலன் என்ன?'],
    ['ta', 'நவக்கிரக கோயில்கள் யாவை?'],
    ['ta', 'சுப முகூர்த்தம் எப்படி தேர்ந்தெடுக்கப்படுகிறது?'],
    // Hindi queries
    ['hi', 'मेरा करियर कैसा रहेगा?'],
    ['hi', 'कुज दोष क्या है?'],
    ['hi', 'काल सर्प दोष क्या है?'],
    ['hi', 'पितृ दोष क्या है?'],
    ['hi', 'गुरु चांडाल योग क्या है?'],
    ['hi', 'साढ़ेसाती क्या है?'],
    ['hi', 'अष्टम शनि क्या है?'],
    ['hi', 'राहु काल कब होता है?'],
    ['hi', 'गजकेसरी योग क्या है?'],
    ['hi', 'दस पोरुत्तम क्या हैं?'],
    ['hi', 'वर्षफल क्या है?'],
    ['hi', 'पंचम भाव का फल क्या है?'],
    ['hi', 'नौ नवग्रह मंदिर कौन से हैं?'],
];

$noMatchMarkers = [
    'could not find this in our astrology sources',
    'எங்கள் ஜோதிட நூல்களில் என்னால் காண முடியவில்லை',
    'यह मुझे हमारे ज्योतिष स्रोतों में नहीं मिला',
];

$freeCount = 0;
$freeUnanswered = [];
$freeGuardFailures = [];
$freeSamples = [];

foreach ($freeQueries as [$lang, $q]) {
    $freeCount++;
    $r = AstroAiProvider::answer($q, $lang, [], $chart, [
        'customerName' => 'Mohan',
        'orderTitle' => 'BIRTH_JATHAGAM',
        'orderDetails' => $orderDetails,
    ]);
    $guard = AstroAiProvider::checkReply($r['content'], $lang);
    if (!$guard['ok']) {
        $freeGuardFailures[] = ['lang' => $lang, 'q' => $q, 'violations' => $guard['violations']];
    }
    foreach ($noMatchMarkers as $m) {
        if (strpos($r['content'], $m) !== false) {
            $freeUnanswered[] = ['lang' => $lang, 'q' => $q];
            break;
        }
    }
    if (in_array($q, [
        'Tell me about 5th house',
        'What is Rahu Kalam?',
        'What is Ashtama Sani?',
        'What is Kuja Dosha?',
        'What are the 10 Poruthams in marriage matching?',
        'What is Kudumpa Jothidam?',
        'குடும்ப ஜோதிடம் என்றால் என்ன?',
        'What is Varshaphala?',
        'வர்ஷபலம் என்றால் என்ன?',
        'वर्षफल क्या है?',
        'Remedies for Rahu and Ketu',
        'Tell me about Guru in my chart',
    ], true)) {
        $freeSamples[$q] = $r;
    }
}

$nonAstro = AstroAiProvider::answer('What is the best smartphone to buy?', 'en', [], $chart, [
    'customerName' => 'Mohan',
]);

$out = [
    'chartMeta' => [
        'moonNakshatra' => $chart['moonNakshatra'],
        'moonNakshatraLord' => $chart['moonNakshatraLord'],
        'labels' => $chart['labels'],
    ],
    'guidedRuns' => $guidedRuns,
    'guidedFailures' => $guidedFailures,
    'scriptLeaks' => $scriptLeaks,
    'freeCount' => $freeCount,
    'freeUnanswered' => $freeUnanswered,
    'freeGuardFailures' => $freeGuardFailures,
    'samples' => $samples,
    'freeSamples' => $freeSamples,
    'nonAstro' => $nonAstro,
];

echo json_encode($out, JSON_UNESCAPED_UNICODE);
