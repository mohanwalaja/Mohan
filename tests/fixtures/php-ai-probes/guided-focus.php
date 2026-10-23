<?php
/**
 * PHP-WASM probe for GUIDED FOCUS: every curated life-area option is answered
 * through the real endpoint lookup (astro_ai_guided_find, so the option's own
 * `focus` reaches the answer builder) against one rebuilt chart. The output
 * lets the test confirm that options inside one chapter give different answers.
 * No external service is contacted.
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

$input = [
    'name' => 'Probe Native', 'dob' => '1990-05-15', 'tob' => '06:30',
    'birthPlace' => 'Chennai', 'country' => 'India',
    'latitude' => 13.0827, 'longitude' => 80.2707, 'timezoneOffsetHours' => 5.5,
];
$order = [
    'service_type' => 'BIRTH_JATHAGAM', 'language' => 'en', 'order_number' => 'AST-FOCUS',
    'input_payload' => json_encode($input),
];
$facts = astro_ai_chart_facts($order);
$chart = $facts['chart'] ?? null;

$out = ['chartBuilt' => $chart !== null, 'replies' => []];
$data = astro_ai_guided_data();
foreach (($data['categories'] ?? []) as $category) {
    foreach (($category['questions'] ?? []) as $q) {
        if (($q['kind'] ?? '') !== 'area') {
            continue;
        }
        $guided = astro_ai_guided_find((string) $q['id']);
        $text = (string) ($guided['text']['en'] ?? '');
        try {
            $r = AstroAiProvider::answer($text, 'en', [], $chart, [
                'customerName' => 'Mohan',
                'orderTitle' => 'BIRTH_JATHAGAM',
                'orderDetails' => 'Order number: AST-FOCUS | Service: BIRTH_JATHAGAM | Report language: English',
                'guided' => $guided,
            ]);
            $out['replies'][] = ['id' => $q['id'], 'category' => $category['id'],
                'focus' => $guided['focus'] ?? null, 'bubbles' => $r['bubbles'] ?? [], 'content' => $r['content'] ?? ''];
        } catch (Throwable $e) {
            $out['replies'][] = ['id' => $q['id'], 'category' => $category['id'], 'error' => get_class($e) . ': ' . $e->getMessage()];
        }
    }
}
file_put_contents('/repo/out.json', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo 'ok';
