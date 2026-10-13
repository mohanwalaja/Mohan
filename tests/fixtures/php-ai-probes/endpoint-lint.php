<?php
/**
 * PHP-WASM probe: compile the AI astrologer endpoint and answer router
 * without executing them.
 *
 * TOKEN_PARSE forces a full parse - the same check `php -l` performs - so a
 * syntax error anywhere in api/ai_astrologer.php or the offline answer
 * builder fails the test instead of waiting for a production request to find
 * it. Nothing in either file runs.
 */
error_reporting(E_ALL);

$files = [
    '/repo/api/ai_astrologer.php',
    '/repo/api/astrology/ai_astrologer_offline.php',
];

$errors = [];
foreach ($files as $file) {
    $code = @file_get_contents($file);
    if (!is_string($code) || $code === '') {
        $errors[$file] = 'file could not be read';
        continue;
    }
    try {
        token_get_all($code, TOKEN_PARSE);
    } catch (ParseError $e) {
        $errors[$file] = $e->getMessage();
    } catch (Throwable $e) {
        $errors[$file] = get_class($e) . ': ' . $e->getMessage();
    }
}

$first = $errors === [] ? null : reset($errors);
$result = ['ok' => $errors === [], 'error' => $first, 'errors' => $errors];

file_put_contents('/repo/out.json', json_encode($result));
echo json_encode($result);
