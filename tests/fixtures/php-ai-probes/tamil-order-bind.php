<?php
/**
 * PHP-WASM runtime probe for Tamil / Hindi / English report binding, menu
 * re-localization, Wedding Matching service-chapter replies, localized
 * order-status answers, and language normalization.
 */
error_reporting(E_ALL);

// Extract real astro_normalize_report_language() from api/config.php BEFORE stubbing config.php
$realConfig = file_get_contents('/repo/api/config.php');
$normStart = strpos($realConfig, 'function astro_normalize_report_language(');
$normEnd = strpos($realConfig, 'function astro_random_id(', $normStart);
eval(substr($realConfig, $normStart, $normEnd - $normStart));

// Syntax-parse EVERY single .php file in /repo/api BEFORE stubbing /repo/api/config.php!
$phpParsedCount = 0;
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator('/repo/api', FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    $p = $f->getPathname();
    if (strpos($p, '/vendor/') !== false || strpos($p, '/storage/') !== false || strpos($p, '/knowledge/') !== false) {
        continue;
    }
    if (substr($p, -4) !== '.php') {
        continue;
    }
    token_get_all(file_get_contents($p), TOKEN_PARSE);
    $phpParsedCount++;
}

file_put_contents('/repo/api/config.php', "<?php\n// probe stub\n");

require_once '/repo/api/astrology/ai_astrologer_provider.php';
require_once '/repo/api/astrology/engine.php';

$endpoint = file_get_contents('/repo/api/ai_astrologer.php');
$evalFromEndpoint = function (string $from, string $to) use ($endpoint) {
    $start = strpos($endpoint, $from);
    $end = strpos($endpoint, $to, $start);
    eval(str_replace('__DIR__', "'/repo/api'", substr($endpoint, $start, $end - $start)));
};
$evalFromEndpoint('function astro_ai_guided_path(', '/* ================================================================== */');
$evalFromEndpoint('function astro_ai_report_result(', 'function astro_ai_chart_facts(');
$evalFromEndpoint('function astro_ai_chart_facts(', '/* ================================================================== */');

$taMenu = astro_ai_guided_menu('ta', ['MARRIAGE_COMPATIBILITY'], true);
$taAllTamil = true;
$taHasDevanagari = false;
$taSamples = [];
$firstWeddingId = '';
foreach ($taMenu as $cat) {
    $title = (string) ($cat['title'] ?? '');
    if (!preg_match('/[\x{0B80}-\x{0BFF}]/u', $title)) {
        $taAllTamil = false;
    }
    if (preg_match('/[\x{0900}-\x{097F}]/u', $title)) {
        $taHasDevanagari = true;
    }
    if (($cat['id'] ?? '') === 'wedding-match' && !empty($cat['questions'][0]['id'])) {
        $firstWeddingId = (string) $cat['questions'][0]['id'];
        $taSamples['weddingFirst'] = (string) $cat['questions'][0]['text'];
    }
    foreach (($cat['questions'] ?? []) as $q) {
        $qt = (string) ($q['text'] ?? '');
        if (!preg_match('/[\x{0B80}-\x{0BFF}]/u', $qt)) {
            $taAllTamil = false;
        }
        if (preg_match('/[\x{0900}-\x{097F}]/u', $qt)) {
            $taHasDevanagari = true;
        }
    }
}

$sampleOrder = [
    'id' => 'ord_5a4305',
    'order_number' => 'ORD-5A4305',
    'service_type' => 'MARRIAGE_COMPATIBILITY',
    'status' => 'COMPLETED',
    'payment_confirmed' => 1,
    'amount' => '15',
    'currency' => 'USD',
    'language' => 'ta',
    'created_at' => '2026-10-23 10:00:00',
    'email_sent_at' => '2026-10-23 10:05:00',
    'input_payload' => json_encode([
        'groom' => [
            'name' => 'Karthik Raman',
            'gender' => 'M',
            'dob' => '2000-01-01',
            'tob' => '02:00',
            'birthPlace' => 'Chennai, Tamil Nadu, India',
            'country' => 'India',
            'latitude' => 13.0827,
            'longitude' => 80.2707,
            'timezoneOffsetHours' => 5.5,
        ],
        'bride' => [
            'name' => 'Priya Devi',
            'gender' => 'F',
            'dob' => '1998-06-15',
            'tob' => '06:30',
            'birthPlace' => 'Chennai, Tamil Nadu, India',
            'country' => 'India',
            'latitude' => 13.0827,
            'longitude' => 80.2707,
            'timezoneOffsetHours' => 5.5,
        ],
    ]),
];

$serviceFacts = astro_ai_service_facts($sampleOrder);
$orderDetails = 'Order number: ORD-5A4305 | Service: MARRIAGE_COMPATIBILITY | Amount paid: USD 15 | '
    . 'Payment: confirmed | Placed on: 2026-10-23 | Report emailed on: 2026-10-23 | Order status: COMPLETED | '
    . 'Birth details used: Groom Name: Karthik Raman, Date of birth: 2000-01-01 | Bride Name: Priya Devi, Date of birth: 1998-06-15 | Report language: ta';

$matchGuided = astro_ai_guided_find($firstWeddingId);
$matchReplyTa = AstroAiProvider::answer(
    $matchGuided['text']['ta'],
    'ta',
    [],
    null,
    [
        'customerName' => 'Mohan Ji',
        'orderTitle' => 'MARRIAGE_COMPATIBILITY',
        'serviceFacts' => $serviceFacts,
        'orderDetails' => $orderDetails,
        'guided' => $matchGuided,
    ]
);

$orderGuided = astro_ai_guided_find('order-status');
$orderReplyTa = AstroAiProvider::answer(
    $orderGuided['text']['ta'],
    'ta',
    [],
    null,
    [
        'customerName' => 'Mohan Ji',
        'orderTitle' => 'MARRIAGE_COMPATIBILITY',
        'serviceFacts' => $serviceFacts,
        'orderDetails' => $orderDetails,
        'guided' => $orderGuided,
    ]
);
$orderReplyHi = AstroAiProvider::answer(
    $orderGuided['text']['hi'],
    'hi',
    [],
    null,
    [
        'customerName' => 'Mohan Ji',
        'orderTitle' => 'MARRIAGE_COMPATIBILITY',
        'serviceFacts' => $serviceFacts,
        'orderDetails' => $orderDetails,
        'guided' => $orderGuided,
    ]
);

$normChecks = [
    'ta' => astro_normalize_report_language('ta'),
    'TA' => astro_normalize_report_language('TA'),
    'ta-IN' => astro_normalize_report_language('ta-IN'),
    'tamil' => astro_normalize_report_language('tamil'),
    'taNative' => astro_normalize_report_language('தமிழ்'),
    'hi' => astro_normalize_report_language('hi'),
    'hi-IN' => astro_normalize_report_language('hi-IN'),
    'hindi' => astro_normalize_report_language('hindi'),
    'hiNative' => astro_normalize_report_language('हिन्दी'),
    'en' => astro_normalize_report_language('en-US'),
    'invalid' => astro_normalize_report_language('fr'),
];

$out = [
    'phpParsedCount' => $phpParsedCount,
    'taMenuCount' => count($taMenu),
    'taAllTamil' => $taAllTamil,
    'taHasDevanagari' => $taHasDevanagari,
    'taSamples' => $taSamples,
    'taOrderTitle' => astro_ai_service_title('MARRIAGE_COMPATIBILITY', 'ta'),
    'matchReplyTa' => $matchReplyTa['content'] ?? '',
    'orderReplyTa' => $orderReplyTa['content'] ?? '',
    'orderReplyHi' => $orderReplyHi['content'] ?? '',
    'normChecks' => $normChecks,
];

file_put_contents('/repo/out.json', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "done\n";
