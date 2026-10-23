<?php
/**
 * PHP-WASM probe for the ORDER JOURNEY answer in the AI Astrologer.
 *
 * Owner request (2026-10-24): the chat must understand and answer questions
 * about what happens to an astrology order — that it goes to the India-based
 * priest team, that they calculate and verify it, that the administrator
 * approves it, and that the report + tax invoice are then emailed to the
 * customer with the priest-team verification line.
 *
 * Exercises the real guided menu (option "order-process"), the real local
 * answer builder for that option in all three languages, and the same question
 * TYPED as free text — plus one control question that must NOT be answered with
 * the order-journey text.
 */
error_reporting(E_ALL);
file_put_contents('/repo/api/config.php', "<?php\n// probe stub\n");

require_once '/repo/api/astrology/ai_astrologer_provider.php';
require_once '/repo/api/astrology/engine.php';

if (!function_exists('astro_normalize_report_language')) {
    function astro_normalize_report_language($l) { return in_array($l, ['en', 'ta', 'hi'], true) ? $l : 'en'; }
}
require_once '/repo/api/astrology/ai_astrologer/guided_and_binding.php';
require_once '/repo/api/astrology/ai_astrologer/chart_and_report_facts.php';

$out = ['menu' => null, 'guided' => [], 'typed' => [], 'control' => []];

// 1. The option exists in the menu, in all three languages.
$found = astro_ai_guided_find('order-process');
$out['menu'] = $found ? [
    'id' => $found['id'] ?? null,
    'kind' => $found['kind'] ?? null,
    'topic' => $found['topic'] ?? null,
    'text' => $found['text'] ?? null,
] : null;

// 2. The guided option, answered in en / ta / hi, with NO order attached:
//    a visitor who has not ordered yet must still get the full answer.
foreach (['en', 'ta', 'hi'] as $lang) {
    $canonical = $found ? (string) ($found['text'][$lang] ?? ($found['text']['en'] ?? '')) : 'order-process';
    try {
        $r = AstroAiProvider::answer($canonical, $lang, [], null, [
            'customerName' => 'Mohan',
            'guided' => ['kind' => 'order', 'topic' => 'process'],
        ]);
        $out['guided'][] = ['lang' => $lang, 'content' => $r['content'], 'bubbles' => $r['bubbles'],
            'handoff' => $r['handoff'] ?? null, 'mode' => $r['mode'] ?? ''];
    } catch (Throwable $e) {
        $out['guided'][] = ['lang' => $lang, 'error' => get_class($e) . ': ' . $e->getMessage()];
    }
}

// 3. The same question TYPED as free text (no guided context).
$typedQuestions = [
    'en' => 'Who prepares my report, and when is it emailed?',
    'ta' => 'என் அறிக்கையை யார் தயாரிப்பார்கள், எப்போது மின்னஞ்சல் அனுப்புவார்கள்?',
    'hi' => 'मेरी रिपोर्ट कौन तैयार करता है और ईमेल कब होता है?',
];
foreach ($typedQuestions as $lang => $question) {
    try {
        $r = AstroAiProvider::answer($question, $lang, [], null, ['customerName' => 'Mohan']);
        $out['typed'][] = ['lang' => $lang, 'question' => $question, 'content' => $r['content'],
            'handoff' => $r['handoff'] ?? null];
    } catch (Throwable $e) {
        $out['typed'][] = ['lang' => $lang, 'error' => get_class($e) . ': ' . $e->getMessage()];
    }
}

// 4. Control: an astrology question must NOT be answered with the order text.
try {
    $r = AstroAiProvider::answer('When will I get married?', 'en', [], null, ['customerName' => 'Mohan']);
    $out['control'] = ['lang' => 'en', 'content' => $r['content'], 'handoff' => $r['handoff'] ?? null];
} catch (Throwable $e) {
    $out['control'] = ['error' => get_class($e) . ': ' . $e->getMessage()];
}

file_put_contents('/repo/out.json', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "done\n";
