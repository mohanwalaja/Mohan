<?php
/**
 * ASTRO SIVAM - bounded JSON request-body reader for document-carrying routes.
 *
 * WHY THIS EXISTS
 * ---------------
 * config.php's getJsonBody() caps every JSON body at 1 MiB and returns []
 * for anything larger - silently, exactly as if the client had sent nothing.
 * That cap is right for logins and settings, but the admin delivery routes
 * carry the browser-rendered, preview-quality PDFs (~2 MB per report, ~2.7 MB
 * once base64-encoded). Their bodies were dropped, the approval gate saw no
 * documents, and every delivery failed with "Preview-quality report and
 * invoice PDF did not reach the server" while php.ini (api/.user.ini,
 * post_max_size = 128M) would have accepted the request.
 *
 * WHY IT IS NOT IN config.php
 * ---------------------------
 * Both deploy paths (.cpanel.yml and deploy_cpanel.sh) deliberately keep the
 * live api/config.php because it holds the database credentials. A fix
 * inside config.php would never reach an existing installation; this file is
 * copied on every deployment.
 *
 * WHAT IS DIFFERENT
 * -----------------
 * - Document routes get their own, explicit limit (ASTRO_DOCUMENT_JSON_MAX_BYTES),
 *   large enough for one maximum-size staged PDF in base64 and still below
 *   post_max_size. Every other route keeps getJsonBody()'s 1 MiB limit.
 * - Nothing is silent: a body that is too large, one that PHP or a proxy
 *   discarded (Content-Length announced, nothing delivered), and malformed JSON
 *   are each reported instead of being indistinguishable from "no body".
 * - The rejection happens before the route does anything, so it never sends
 *   e-mail, stages a file or changes an order.
 */

if (!defined('ASTRO_JSON_BODY_MAX_BYTES')) {
    /** Ordinary JSON routes (same limit as config.php's getJsonBody()). */
    define('ASTRO_JSON_BODY_MAX_BYTES', 1048576);
}

if (!defined('ASTRO_ORDER_JSON_MAX_BYTES')) {
    /**
     * Service-order routes (/api/services/order, /orders, /multi-order and the
     * multi-person checkout).
     *
     * A single Subha Muhurtham report carries its panchangam scan inside the
     * order body: six months of day records, each with the English / Tamil /
     * Hindi tithi, nakshatra, yoga, karana and reason strings. Measured from the
     * shipped scanner that scan alone is ~1.1 MB, so ONE Muhurtham report in a
     * family tray already pushed the body past getJsonBody()'s 1 MiB cap. The
     * body was then dropped and the family-tray route answered the misleading
     * "At least one service chart item is required in the family tray." even
     * though the tray was full.
     *
     * 16 MiB holds a full tray (6 reports, even if several are Muhurtham
     * reports) with headroom, and stays far below post_max_size (128M in
     * api/.user.ini) so PHP itself never discards a request this reader
     * accepts. Pinned by tests/family-order-body-limit.test.ts.
     */
    define('ASTRO_ORDER_JSON_MAX_BYTES', 16 * 1048576);
}

if (!defined('ASTRO_DOCUMENT_JSON_MAX_BYTES')) {
    /**
     * Routes that carry PDFs. 64 MiB covers one maximum-size staged document
     * (ASTRO_FAMILY_DOC_MAX_BYTES = 40 MiB, ~53.4 MiB as base64) plus the JSON
     * envelope, and the inline approve body (report + invoice <= 5 MB, ~6.7 MB
     * as base64). It must stay below post_max_size (128M in api/.user.ini) so
     * PHP itself never discards a request this reader would accept.
     */
    define('ASTRO_DOCUMENT_JSON_MAX_BYTES', 64 * 1048576);
}

if (!function_exists('astro_read_json_request_body')) {
    /**
     * Read and decode a JSON request body without ever discarding it silently.
     *
     * @param int           $maxBytes      Largest body accepted.
     * @param callable|null $readRaw       Test seam: fn(int $limit): string|false.
     *                                     Defaults to reading php://input.
     * @param int|null      $declaredBytes Content-Length announced by the client.
     *                                     Defaults to $_SERVER['CONTENT_LENGTH'].
     * @return array{ok:bool,body:array,error:?string,bytes:int,declaredBytes:int,maxBytes:int}
     *         error is null, 'too_large', 'discarded' or 'invalid_json'.
     */
    function astro_read_json_request_body(int $maxBytes, ?callable $readRaw = null, ?int $declaredBytes = null): array
    {
        if ($declaredBytes === null) {
            $header = (string) ($_SERVER['CONTENT_LENGTH'] ?? ($_SERVER['HTTP_CONTENT_LENGTH'] ?? ''));
            $declaredBytes = ctype_digit($header) ? (int) $header : 0;
        }

        $result = [
            'ok' => false,
            'body' => [],
            'error' => null,
            'bytes' => 0,
            'declaredBytes' => max(0, $declaredBytes),
            'maxBytes' => $maxBytes
        ];

        // Refuse before reading: never pull an oversized body into memory.
        if ($declaredBytes > $maxBytes) {
            $result['error'] = 'too_large';
            return $result;
        }

        // Read at most one byte past the limit, which also catches chunked
        // uploads that announce no Content-Length.
        $raw = $readRaw !== null
            ? $readRaw($maxBytes + 1)
            : @file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        $raw = is_string($raw) ? $raw : '';
        $result['bytes'] = strlen($raw);

        if ($result['bytes'] > $maxBytes) {
            $result['error'] = 'too_large';
            return $result;
        }

        if (trim($raw) === '') {
            if ($declaredBytes > 0) {
                // The client announced a body that never reached PHP:
                // post_max_size, or a proxy / ModSecurity stripping it.
                $result['error'] = 'discarded';
                return $result;
            }
            $result['ok'] = true; // a genuinely empty request
            return $result;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            $result['error'] = 'invalid_json';
            return $result;
        }

        $result['ok'] = true;
        $result['body'] = $decoded;
        return $result;
    }
}

if (!function_exists('astro_request_body_error_response')) {
    /**
     * The explicit, side-effect-free answer for an unusable body.
     *
     * @param array  $read    result of astro_read_json_request_body()
     * @param string $purpose what the request was for, e.g. 'approval'
     * @return array{0:int,1:array} [HTTP status, JSON payload]
     */
    function astro_request_body_error_response(array $read, string $purpose): array
    {
        $mb = static function ($bytes): string {
            return number_format(((int) $bytes) / 1048576, 1) . ' MB';
        };
        $requestBytes = max((int) ($read['declaredBytes'] ?? 0), (int) ($read['bytes'] ?? 0));
        $maxBytes = (int) ($read['maxBytes'] ?? ASTRO_DOCUMENT_JSON_MAX_BYTES);
        $nothingDone = 'Nothing was staged, approved or emailed.';

        switch ($read['error'] ?? null) {
            case 'too_large':
                return [413, [
                    'success' => false,
                    'bodyTooLarge' => true,
                    'requestBytes' => $requestBytes,
                    'maxBytes' => $maxBytes,
                    'message' => "The {$purpose} request is " . $mb($requestBytes) . ', larger than the '
                        . $mb($maxBytes) . " the server accepts for documents. {$nothingDone}"
                ]];
            case 'discarded':
                return [413, [
                    'success' => false,
                    'bodyTooLarge' => true,
                    'bodyDiscarded' => true,
                    'requestBytes' => $requestBytes,
                    'postMaxSize' => (string) ini_get('post_max_size'),
                    'message' => "The {$purpose} request announced " . $mb($requestBytes) . ' but its body never reached PHP '
                        . '(post_max_size is ' . ini_get('post_max_size') . ', or a proxy/firewall stripped it). '
                        . $nothingDone
                ]];
            case 'invalid_json':
                return [400, [
                    'success' => false,
                    'message' => "The {$purpose} request body is not valid JSON (" . $mb($requestBytes) . " received). {$nothingDone}"
                ]];
        }
        return [400, ['success' => false, 'message' => "The {$purpose} request body could not be read. {$nothingDone}"]];
    }
}

if (!function_exists('astro_document_json_body')) {
    /**
     * Body of a document-carrying admin route, read with the document limit.
     * Answers the explicit error and stops the request when the body cannot be
     * used. Memoised, so reading it twice does not double the memory.
     */
    function astro_document_json_body(string $purpose = 'document upload'): array
    {
        static $body = null;
        if ($body !== null) {
            return $body;
        }

        $read = astro_read_json_request_body(ASTRO_DOCUMENT_JSON_MAX_BYTES);
        if (!$read['ok']) {
            list($status, $payload) = astro_request_body_error_response($read, $purpose);
            error_log('ASTRO SIVAM: rejected ' . $purpose . ' body (' . $read['error'] . ', '
                . max($read['declaredBytes'], $read['bytes']) . ' bytes, limit ' . $read['maxBytes'] . ')');
            if (function_exists('jsonResponse')) {
                jsonResponse($payload, $status);
            }
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($payload);
            exit;
        }

        $body = $read['body'];
        return $body;
    }
}

if (!function_exists('astro_order_json_body')) {
    /**
     * Request body for a service-order route, read with the order limit.
     *
     * A checkout body is never silently emptied: an oversized tray, a body PHP
     * or a proxy discarded, and malformed JSON each answer with their own code
     * and message BEFORE any order row, mail or payment binding happens. A
     * genuinely empty request still returns [] so the route can answer its own
     * validation message.
     *
     * @return array Decoded JSON body.
     */
    function astro_order_json_body(string $purpose = 'order'): array
    {
        static $body = null;
        if ($body !== null) {
            return $body;
        }

        // Form-encoded / multipart requests are not JSON bodies: those routes
        // read $_POST / $_FILES, exactly as before this reader existed.
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '')));
        if ($contentType !== '' && strpos($contentType, 'json') === false) {
            $body = [];
            return $body;
        }

        $read = astro_read_json_request_body(ASTRO_ORDER_JSON_MAX_BYTES);
        if ($read['ok']) {
            $body = $read['body'];
            return $body;
        }

        $mb = static function ($bytes): string {
            return number_format(((int) $bytes) / 1048576, 1) . ' MB';
        };
        $received = max((int) $read['declaredBytes'], (int) $read['bytes']);
        $nothingSaved = 'Nothing was charged, saved or emailed.';

        switch ($read['error'] ?? null) {
            case 'too_large':
                $payload = [
                    'success' => false,
                    'code' => 'ORDER_BODY_TOO_LARGE',
                    'bodyTooLarge' => true,
                    'requestBytes' => $received,
                    'maxBytes' => (int) $read['maxBytes'],
                    'message' => 'This ' . $purpose . ' is ' . $mb($received) . ', larger than the '
                        . $mb($read['maxBytes']) . ' the server accepts. Remove a report from the tray and try again. '
                        . $nothingSaved
                ];
                $status = 413;
                break;
            case 'discarded':
                $payload = [
                    'success' => false,
                    'code' => 'ORDER_BODY_DROPPED',
                    'bodyTooLarge' => true,
                    'bodyDiscarded' => true,
                    'requestBytes' => $received,
                    'postMaxSize' => (string) ini_get('post_max_size'),
                    'message' => 'Your ' . $purpose . ' details (' . $mb($received) . ') did not reach the server'
                        . ' (post_max_size is ' . ini_get('post_max_size') . ', or a proxy/firewall stripped them). '
                        . $nothingSaved . ' Please retry, and remove a report from the tray if it keeps happening.'
                ];
                $status = 413;
                break;
            case 'invalid_json':
                $payload = [
                    'success' => false,
                    'code' => 'ORDER_BODY_INVALID_JSON',
                    'message' => 'The ' . $purpose . ' request body is not valid JSON (' . $mb($received) . ' received). '
                        . $nothingSaved . ' Please reload the checkout page and submit again.'
                ];
                $status = 400;
                break;
            default:
                $payload = [
                    'success' => false,
                    'code' => 'ORDER_BODY_UNREADABLE',
                    'message' => 'The ' . $purpose . ' request body could not be read. ' . $nothingSaved
                        . ' Please reload the checkout page and submit again.'
                ];
                $status = 400;
                break;
        }

        error_log('ASTRO SIVAM: rejected ' . $purpose . ' body (' . ($read['error'] ?? 'unreadable') . ', '
            . $received . ' bytes, limit ' . $read['maxBytes'] . ')');
        if (function_exists('jsonResponse')) {
            jsonResponse($payload, $status);
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload);
        exit;
    }
}
