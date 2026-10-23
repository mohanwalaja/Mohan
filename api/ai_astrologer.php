<?php
/**
 * ASTRO SIVAM AI Astrologer — customer and admin chat endpoint.
 * -------------------------------------------------------------
 * POST /api/ai_astrologer.php?action=...
 *
 * ACTIONS
 *   session            create a conversation, optionally bound to an order
 *   history            the messages of the signed-in account's own sessions
 *   options            the guided question menu (categories + curated options)
 *   bind               attach one of the customer's own delivered reports to
 *                      this conversation (or detach it)
 *   person             pick which family member the conversation answers about
 *                      (family / multi-person reports only)
 *   ask                send a questionId picked from options, get an answer
 *   upload             attach an ASTRO SIVAM report PDF (Part 3 gate)
 *   handoff            "Talk to our astrologer"
 *   usage              chat language + unlimited-question status (no daily cap)
 *   diagnose           admin-only: check the local source-based reply path
 *
 * GUIDED MODE
 * Customers never type a question: the client fetches `options` and sends
 * `ask` with a questionId from that menu. The server resolves the canonical
 * wording and routes it to one supported answer path (life-area card, the
 * customer's own service report, dosha, remedy, order fact, or the human
 * complaint queue). Free-text `question` is accepted from administrators
 * only, for testing. The only free text a customer can send is the short
 * `complaintDetails` line on complaint options, which is queued to the human
 * team and never answered by rules.
 *
 * The Wedding Matching, Baby Naming and Subha Muhurtham chapters are served
 * only to a customer who already holds a delivered report of that service,
 * and they are answered by reading that report (never re-judging it). The
 * customer attaches the report with `bind`; a question about a report that is
 * not attached says so plainly instead of inventing an answer.
 *
 * IF THE CHAT NEVER REPLIES, READ THIS FIRST
 * Replies are local-only: this endpoint never calls an external AI service
 * and never needs an API key. If the chat cannot answer, sign in as an admin
 * and run /api/ai_astrologer.php?action=diagnose to check PHP extensions and
 * the deployed knowledge/ files. See docs/AI_CHAT_NOT_REPLYING_FIX.md.
 *
 * ACCESS GATES — READ BEFORE EDITING
 * Authentication and entitlement checks run in PHP on EVERY action, including
 * read-only ones; the client is never trusted to decide who can use the chat:
 *
 *   1. requireAuth()       — a signed-in account, with the token_version check
 *                            that api/config.php already applies.
 *   2. Customer entitlement — customers need a delivered report (a paid order
 *                            or the free-beta first report). Admins are exempt
 *                            from payment and daily-usage gates.
 *
 * A free-beta first report qualifies for customer access exactly like a paid
 * order once it has been delivered. An order that is
 * PENDING, PROCESSING, REJECTED or CANCELLED does not qualify. A refunded order
 * does not qualify. Admin access is based only on the persisted database role.
 *
 * VERIFICATION STATUS: this file's HTTP dispatch is not executed in the build
 * sandbox (there is no native `php` binary or database here). The local reply
 * builder and chart path are exercised under the wasm PHP runtime:
 *   node scripts/php-ai-provider-check.mjs tests/fixtures/php-ai-probes/knowledge-base-mode.php
 * The gates, migration and schema contracts are checked by
 * tests/ai-astrologer-access.test.ts. Smoke-test the dispatch on the server
 * before relying on it — see docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md.
 */

require_once __DIR__ . '/config.php';
// config.php does NOT include db.php - getDbConnection() lives there.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/rate_limit.php';
require_once __DIR__ . '/client_ip.php';
require_once __DIR__ . '/astrology/ai_report_extract.php';
require_once __DIR__ . '/astrology/ai_astrologer_provider.php';
// The family (multi-person) order tables and their runtime guard: the chat's
// person picker reads order_persons / order_items for family reports.
require_once __DIR__ . '/services/multi_person_order.php';

// NO daily question limit: every entitled customer (and every admin) may ask
// as many guided questions as they like while their report window is open.
// Access stays gated by authentication + the delivered-report entitlement +
// the 7-day window, so the endpoint cannot be hammered without a report.
const AI_ASTROLOGER_WINDOW_SECONDS = 86400;
const AI_ASTROLOGER_MAX_UPLOAD_BYTES = 8388608; // 8 MB
const AI_ASTROLOGER_HISTORY_CONTEXT_MESSAGES = 20;

/** The account role is loaded from the database by requireAuth(). */
function astro_ai_is_admin(array $user): bool
{
    return strtolower(trim((string) ($user['role'] ?? ''))) === 'admin';
}

/**
 * GATE 2 — customers need a current delivered-report entitlement (a paid order
 * or the free-beta first report); admins are exempt.
 *
 * Deliberately a single indexed lookup rather than loading the orders: this runs
 * on every customer request, including history reads, so it must stay cheap on
 * shared hosting. An authenticated administrator always has access and does
 * not need a paid order.
 */
function astro_ai_require_paid_order(PDO $pdo, array $user): array
{
    if (astro_ai_is_admin($user)) {
        return $user;
    }

    $entitlement = astro_ai_chat_entitlement($pdo, $user['id']);

    if (!$entitlement['allowed']) {
        // Trilingual, because the customer may have been browsing in any of the
        // three. Never reveals that a specific order was found and rejected.
        $copy = astro_ai_entitlement_copy($entitlement['code'], $entitlement);
        jsonResponse([
            'success' => false,
            'code' => $entitlement['code'],
            'message' => $copy['en'],
            'message_ta' => $copy['ta'],
            'message_hi' => $copy['hi'],
            'dashboardUrl' => '/dashboard',
            // Days left, so the UI can say "4 days left on this report's chat".
            // Zero once expired.
            'daysRemaining' => $entitlement['daysRemaining'],
            'expiresAt' => $entitlement['expiresAt'],
        ], 403);
    }

    return $user;
}

/**
 * How long the AI chat stays available for a report.
 *
 * Owner rule: the chat stays live for 7 days, starting on the day the report
 * email was delivered, then it disables. A new paid order starts a fresh window.
 *
 * Two decisions that shape this:
 *  - the clock starts at orders.email_sent_at, the real delivery timestamp, not
 *    the order or payment date
 *  - the NEWEST delivered order wins. An older order still inside its own window
 *    does not extend anything.
 *
 * email_sent_at is NULL when the report has not been emailed yet (or the email
 * job failed). That order simply has no window yet - which is correct, because
 * the customer has not received the report the chat would discuss.
 */
define('ASTRO_AI_CHAT_WINDOW_DAYS', 7);

/**
 * @return array{allowed: bool, code: string, daysRemaining: int, expiresAt: ?string,
 *                orderId: ?string, orderNumber: ?string, serviceType: ?string, language: ?string}
 */
function astro_ai_chat_entitlement(PDO $pdo, string $userId): array
{
    $denied = static function (string $code): array {
        return [
            'allowed' => false,
            'code' => $code,
            'daysRemaining' => 0,
            'expiresAt' => null,
            'orderId' => null,
            'orderNumber' => null,
            'serviceType' => null,
            'language' => null,
        ];
    };

    // Newest delivered order (paid or free-beta first report). Ordering by
    // email_sent_at DESC is what makes "newest order wins" true: we only ever
    // look at the one that would expire last, so an old order cannot keep the
    // chat alive. Its language column is the language the customer picked for
    // the report - the chat speaks that language back to them.
    $stmt = $pdo->prepare(
        "SELECT id, order_number, service_type, language, email_sent_at
           FROM orders
          WHERE user_id = :uid
            AND payment_confirmed = 1
            AND status IN ('COMPLETED', 'PROCESSING')
            AND (refund_status IS NULL OR refund_status = 'NONE')
            AND email_status = 'SENT'
            AND email_sent_at IS NOT NULL
          ORDER BY email_sent_at DESC
          LIMIT 1"
    );
    $stmt->execute([':uid' => $userId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        // Either no qualifying order at all, or one that has not been delivered
        // yet. Distinguishing them only for the server log - the customer sees
        // the same message either way, so the endpoint never leaks which it was.
        $countStmt = $pdo->prepare(
            "SELECT COUNT(*) AS c
               FROM orders
              WHERE user_id = :uid
                AND payment_confirmed = 1
                AND status IN ('COMPLETED', 'PROCESSING')
                AND (refund_status IS NULL OR refund_status = 'NONE')"
        );
        $countStmt->execute([':uid' => $userId]);
        $paid = (int) ((array) $countStmt->fetch(PDO::FETCH_ASSOC))['c'];
        return $denied($paid > 0 ? 'REPORT_NOT_DELIVERED' : 'NO_PAID_ORDER');
    }

    $sentAt = strtotime((string) $order['email_sent_at']);
    if ($sentAt === false) {
        // An unparseable timestamp must not open the chat.
        error_log('astro_ai_chat_entitlement: unparseable email_sent_at for user ' . $userId);
        return $denied('REPORT_NOT_DELIVERED');
    }

    $expiresAt = $sentAt + (ASTRO_AI_CHAT_WINDOW_DAYS * 86400);
    $now = time();
    $reportLanguage = astro_normalize_report_language((string) ($order['language'] ?? ''));

    if ($now >= $expiresAt) {
        $expired = $denied('CHAT_WINDOW_EXPIRED');
        $expired['orderId'] = (string) $order['id'];
        $expired['orderNumber'] = (string) $order['order_number'];
        $expired['serviceType'] = (string) $order['service_type'];
        $expired['language'] = $reportLanguage;
        return $expired;
    }

    $secondsLeft = $expiresAt - $now;
    // Round UP so a customer on day 1 of 7 sees 7, not 6.
    return [
        'allowed' => true,
        'code' => 'OK',
        'daysRemaining' => (int) ceil($secondsLeft / 86400),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expiresAt),
        'orderId' => (string) $order['id'],
        'orderNumber' => (string) $order['order_number'],
        'serviceType' => (string) $order['service_type'],
        'language' => $reportLanguage,
    ];
}

/** Trilingual wording for each refusal, kept next to the codes that use it. */
function astro_ai_entitlement_copy(string $code, array $entitlement): array
{
    if ($code === 'REPORT_NOT_DELIVERED') {
        return [
            'en' => 'Your report has not been delivered yet. The astrologer chat opens as soon as '
                . 'your report email is sent.',
            'ta' => 'உங்கள் அறிக்கை இன்னும் அனுப்பப்படவில்லை. அறிக்கை மின்னஞ்சல் சென்றவுடன் '
                . 'ஜோதிடர் உரையாடல் தொடங்கும்.',
            'hi' => 'आपकी रिपोर्ट अभी नहीं भेजी गई है। रिपोर्ट ईमेल भेजते ही ज्योतिषी चैट शुरू हो जाएगी।',
        ];
    }

    if ($code === 'CHAT_WINDOW_EXPIRED') {
        return [
            'en' => 'The 7-day astrologer chat period for this report has ended. '
                . 'Place a new order and the chat opens again.',
            'ta' => 'இந்த அறிக்கைக்கான 7 நாள் ஜோதிடர் உரையாடல் காலம் முடிந்தது. '
                . 'புதிய ஆர்டர் செய்தால் மீண்டும் தொடங்கும்.',
            'hi' => 'इस रिपोर्ट के लिए 7 दिन की ज्योतिषी चैट अवधि समाप्त हो गई है। '
                . 'नया ऑर्डर करने पर चैट फिर शुरू हो जाएगी।',
        ];
    }

    return [
        'en' => 'The astrologer chat is available to customers with a completed report. '
            . 'Once your order is complete, I will be here.',
        'ta' => 'முடிந்த அறிக்கை உள்ள வாடிக்கையாளர்களுக்கு மட்டுமே ஜோதிடர் உரையாடல் கிடைக்கும். '
            . 'உங்கள் ஆர்டர் முடிந்ததும் நான் இங்கே இருப்பேன்.',
        'hi' => 'ज्योतिषी चैट उन ग्राहकों के लिए उपलब्ध है जिनकी रिपोर्ट पूरी हो चुकी है। '
            . 'आपका ऑर्डर पूरा होते ही मैं यहाँ रहूँगा।',
    ];
}

/** Both gates, in order. Every action calls this and nothing else for auth. */
function astro_ai_gate(PDO $pdo): array
{
    $user = requireAuth($pdo);
    return astro_ai_require_paid_order($pdo, $user);
}

require_once __DIR__ . '/astrology/ai_astrologer/storage.php';
require_once __DIR__ . '/astrology/ai_astrologer/actions.php';
require_once __DIR__ . '/astrology/ai_astrologer/guided_and_binding.php';
require_once __DIR__ . '/astrology/ai_astrologer/chart_and_report_facts.php';

/* ================================================================== */
/* Dispatch                                                           */
/* ================================================================== */

if (!defined('ASTRO_AI_ENDPOINT_NO_AUTO_DISPATCH')) {
    require_once __DIR__ . '/request_body.php';

    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

    try {
        $pdo = getDbConnection();

        // BOTH GATES, on every action, before anything else.
        $user = astro_ai_gate($pdo);

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $action = strtolower((string) ($_GET['action'] ?? ($_POST['action'] ?? '')));

        // Enforce POST on all state-mutating actions so GET requests can never
        // bypass config.php CSRF Origin/Referer checks.
        $mutatingActions = ['session', 'ask', 'upload', 'handoff', 'bind', 'person'];
        if (in_array($action, $mutatingActions, true) && $method !== 'POST') {
            jsonResponse([
                'success' => false,
                'code' => 'METHOD_NOT_ALLOWED',
                'message' => 'POST is required for this action.',
            ], 405);
        }

        $body = [];
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if ($method === 'POST' && strpos($contentType, 'multipart/form-data') === false) {
            $body = getJsonBody(1048576);
        }
        foreach ($_POST as $k => $v) {
            if (!isset($body[$k])) {
                $body[$k] = $v;
            }
        }

        switch ($action) {
            case 'session':
                astro_ai_action_session($pdo, $user, $body);
                break;
            case 'history':
                astro_ai_action_history($pdo, $user, $body);
                break;
            case 'ask':
                astro_ai_action_ask($pdo, $user, $body);
                break;
            case 'upload':
                astro_ai_action_upload($pdo, $user, $body);
                break;
            case 'handoff':
                astro_ai_action_handoff($pdo, $user, $body);
                break;
            case 'usage':
                astro_ai_action_usage($pdo, $user);
                break;
            case 'diagnose':
                astro_ai_action_diagnose($pdo, $user, $body);
                break;
            case 'options':
                astro_ai_action_options($pdo, $user, $body);
                break;
            case 'bind':
                astro_ai_action_bind($pdo, $user, $body);
                break;
            case 'person':
                astro_ai_action_person($pdo, $user, $body);
                break;
            default:
                jsonResponse(['success' => false, 'message' => 'Unknown action.'], 400);
        }
    } catch (Throwable $e) {
        error_log('AI Astrologer endpoint error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Something went wrong. Please try again.'], 500);
    }
}
