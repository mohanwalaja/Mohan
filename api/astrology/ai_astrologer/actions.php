<?php
/**
 * ASTRO SIVAM — AI Astrologer Action Handlers
 */

/* ================================================================== */
/* ACTIONS                                                            */
/* ================================================================== */

function astro_ai_action_session(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    $isAdmin = astro_ai_is_admin($user);
    $orderId = trim((string) ($body['orderId'] ?? ''));
    $orderNumber = null;
    $serviceType = null;
    /** The language the customer chose for the bound report, when there is one. */
    $reportLanguage = null;

    if ($orderId !== '') {
        // A report-specific chat can only bind to this account's delivered
        // report (paid or free-beta first report).
        $stmt = $pdo->prepare(
            "SELECT id, order_number, service_type, language, email_sent_at
               FROM orders
              WHERE id = ? AND user_id = ? AND payment_confirmed = 1
                AND status IN ('COMPLETED', 'PROCESSING')
                AND (refund_status IS NULL OR refund_status = 'NONE')
                AND email_status = 'SENT'
                AND email_sent_at IS NOT NULL
              LIMIT 1"
        );
        $stmt->execute([$orderId, $user['id']]);
        $order = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$order) {
            jsonResponse(['success' => false, 'code' => 'ORDER_NOT_FOUND',
                'message' => 'I could not find that delivered report on your account.'], 404);
        }

        $sentAt = strtotime((string) $order['email_sent_at']);
        if ($sentAt === false || (!$isAdmin && time() >= $sentAt + (ASTRO_AI_CHAT_WINDOW_DAYS * 86400))) {
            $copy = astro_ai_entitlement_copy('CHAT_WINDOW_EXPIRED', []);
            jsonResponse(['success' => false, 'code' => 'CHAT_WINDOW_EXPIRED', 'message' => $copy['en']], 403);
        }

        $orderId = (string) $order['id'];
        $orderNumber = (string) $order['order_number'];
        $serviceType = (string) $order['service_type'];
        $reportLanguage = (string) ($order['language'] ?? '');
    }

    if ($orderId === '' && !$isAdmin) {
        // The floating launcher starts a general session with the newest report
        // that opened access, so its first answer has the customer's chart.
        $entitlement = astro_ai_chat_entitlement($pdo, (string) $user['id']);
        if (!$entitlement['allowed'] || empty($entitlement['orderId'])) {
            $copy = astro_ai_entitlement_copy($entitlement['code'], $entitlement);
            jsonResponse([
                'success' => false,
                'code' => $entitlement['code'],
                'message' => $copy['en'],
                'message_ta' => $copy['ta'],
                'message_hi' => $copy['hi'],
            ], 403);
        }
        $orderId = (string) $entitlement['orderId'];
        $orderNumber = $entitlement['orderNumber'];
        $serviceType = $entitlement['serviceType'];
        $reportLanguage = (string) ($entitlement['language'] ?? '');
    }

    // The conversation opens in the language of the report it discusses — the
    // language the customer selected when ordering — so chat and report always
    // match. The caller's language only decides conversations with no report
    // attached (administrator sessions), falling back to the country default.
    $language = $reportLanguage !== null
        ? astro_normalize_report_language($reportLanguage)
        : astro_normalize_report_language((string) ($body['language'] ?? (($user['country'] ?? '') === 'India' ? 'hi' : 'ta')));
    // Family reports: remember which member this conversation answers about.
    // The first member is selected automatically; the customer can switch to
    // any of the other names in the chat's person picker.
    $persons = astro_ai_order_persons($pdo, $orderId);
    $selectedPerson = $persons !== [] ? $persons[0] : null;
    $sessionId = astro_ai_new_session_id();

    $stmt = $pdo->prepare(
        "INSERT INTO ai_chat_sessions (id, user_id, language, order_id, order_number, service_type, person_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $sessionId,
        $user['id'],
        $language,
        $orderId !== '' ? $orderId : null,
        $orderNumber,
        $serviceType,
        $selectedPerson !== null ? $selectedPerson['id'] : null,
    ]);

    // Real delivery timestamp, so the client can greet the customer with the
    // report that just opened this chat.
    $deliveredAt = null;
    if ($orderId !== '') {
        $dStmt = $pdo->prepare("SELECT email_sent_at FROM orders WHERE id = ? LIMIT 1");
        $dStmt->execute([$orderId]);
        $deliveredAt = $dStmt->fetchColumn() ?: null;
    }

    jsonResponse([
        'success' => true,
        'sessionId' => $sessionId,
        'language' => $language,
        'orderNumber' => $orderNumber,
        'serviceType' => $serviceType,
        'deliveredAt' => $deliveredAt,
        // The family member names, so the panel can show the person picker
        // immediately (empty for single-person reports).
        'persons' => $persons,
        'selectedPersonId' => $selectedPerson !== null ? $selectedPerson['id'] : null,
        'dailyLimit' => null,
        'unlimited' => true,
    ], 201);
}

function astro_ai_action_history(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    $sessionId = trim((string) ($body['sessionId'] ?? ($_GET['sessionId'] ?? '')));
    if ($sessionId === '') {
        jsonResponse(['success' => false, 'code' => 'MISSING_SESSION', 'message' => 'sessionId is required.'], 400);
    }

    $session = astro_ai_load_session($pdo, $sessionId, $user['id']);
    if (!$session) {
        // 404, not 403: do not confirm that the session exists.
        jsonResponse(['success' => false, 'code' => 'SESSION_NOT_FOUND', 'message' => 'That conversation was not found.'], 404);
    }

    $messages = astro_ai_recent_messages($pdo, $sessionId);
    jsonResponse([
        'success' => true,
        'session' => [
            'id' => $session['id'],
            'language' => $session['language'],
            'orderNumber' => $session['order_number'],
            'serviceType' => $session['service_type'],
            'status' => $session['status'],
            'messageCount' => (int) $session['message_count'],
        ],
        'messages' => array_map(function ($m) {
            return [
                'id' => (int) $m['id'],
                'role' => $m['role'],
                'language' => $m['language'],
                'content' => $m['content'],
                'areaId' => $m['area_id'],
                'sources' => $m['sources'],
                'createdAt' => $m['created_at'],
            ];
        }, $messages),
    ]);
}

function astro_ai_action_ask(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    // Fail fast only when the local answer path cannot run. This chat never
    // calls a model provider and never requires an API key.
    if (!AstroAiProvider::canAnswer()) {
        $diag = AstroAiProvider::diagnostics(false);
        error_log('Source-based astrologer: ask refused - local knowledge unavailable. Blocking: '
            . (implode(', ', $diag['blocking']) ?: 'unknown')
            . '. Run /api/ai_astrologer.php?action=diagnose as an admin for the full report.');
        jsonResponse(['success' => false, 'code' => 'LOCAL_KNOWLEDGE_UNAVAILABLE',
            'message' => 'The local astrology knowledge base is missing on this server. '
                . 'Upload the knowledge/ folder to the website root (see deploy_cpanel.sh), then try again.',
            'message_ta' => 'உள்ளூர் ஜோதிட அறிவுத் தளம் இந்த சர்வரில் இல்லை. '
                . 'நிர்வாகி knowledge/ கோப்புறையை பதிவேற்ற வேண்டும்.',
            'message_hi' => 'स्थानीय ज्योतिष ज्ञान-आधार इस सर्वर पर नहीं है। '
                . 'एडमिन को knowledge/ फ़ोल्डर अपलोड करना होगा।',
            'blocking' => $diag['blocking'],
            // Only an administrator can do anything with this, and the client
            // only shows it to one. The customer keeps seeing the short retry
            // wording, never a setup instruction.
            'diagnose' => astro_ai_is_admin($user) ? $diag : null,
        ], 503);
    }

    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    $guidedId = trim((string) ($body['questionId'] ?? ''));

    if ($sessionId === '') {
        jsonResponse(['success' => false, 'code' => 'MISSING_FIELDS',
            'message' => 'sessionId is required.'], 400);
    }

    $session = astro_ai_load_session($pdo, $sessionId, $user['id']);
    if (!$session) {
        jsonResponse(['success' => false, 'code' => 'SESSION_NOT_FOUND', 'message' => 'That conversation was not found.'], 404);
    }
    if ($session['status'] === 'CLOSED') {
        jsonResponse(['success' => false, 'code' => 'SESSION_CLOSED',
            'message' => 'That conversation is closed. Please start a new one.'], 409);
    }

    // GUIDED MODE — customers pick a curated option, they never type a
    // question. The allowlist lives in
    // knowledge/ai-astrologer/rules/guided-questions.json. Administrators keep
    // free text so they can test the reply path; customers without a valid
    // questionId are refused, which is what makes unrelated questions
    // impossible rather than merely discouraged.
    $isAdmin = astro_ai_is_admin($user);
    $guided = null;
    if ($guidedId !== '') {
        $guided = astro_ai_guided_find($guidedId);
        if ($guided === null) {
            jsonResponse(['success' => false, 'code' => 'UNKNOWN_QUESTION',
                'message' => 'That option is not available. Please pick a question from the list.',
                'message_ta' => 'அந்த விருப்பம் இல்லை. பட்டியலிலிருந்து ஒரு கேள்வியை தேர்வு செய்யவும்.',
                'message_hi' => 'वह विकल्प उपलब्ध नहीं है। कृपया सूची से कोई प्रश्न चुनें।'], 400);
        }
        // The three service chapters are only for customers who hold that
        // report. The menu already hides them; this keeps a hand-built request
        // from asking about a report the account does not have.
        $required = astro_ai_guided_required_services($guided);
        if ($required !== [] && !$isAdmin) {
            $held = astro_ai_entitled_service_types($pdo, (string) $user['id']);
            $allowed = false;
            foreach ($required as $service) {
                if (in_array(strtoupper(trim($service)), $held, true)) {
                    $allowed = true;
                    break;
                }
            }
            if (!$allowed) {
                jsonResponse(['success' => false, 'code' => 'UNKNOWN_QUESTION',
                    'message' => 'That option is not available. Please pick a question from the list.',
                    'message_ta' => 'அந்த விருப்பம் இல்லை. பட்டியலிலிருந்து ஒரு கேள்வியை தேர்வு செய்யவும்.',
                    'message_hi' => 'वह विकल्प उपलब्ध नहीं है। कृपया सूची से कोई प्रश्न चुनें।'], 400);
            }
        }
    }

    // The session's language is fixed when the conversation opens: it is the
    // language of the bound report, and a stale client preference must not
    // pull the replies into a different language than the report.
    $language = astro_normalize_report_language((string) ($session['language'] ?? ($body['language'] ?? 'ta')));

    if ($guided !== null) {
        // The canonical wording of the option, in the customer's language.
        // This is what retrieval matches on, so every guided question carries
        // the keywords of its own answer path in all three languages.
        $question = trim((string) ($guided['text'][$language] ?? ($guided['text']['en'] ?? '')));
        if ($question === '') {
            jsonResponse(['success' => false, 'code' => 'UNKNOWN_QUESTION',
                'message' => 'That option is not available. Please pick a question from the list.'], 400);
        }
    } else {
        if (!$isAdmin) {
            jsonResponse(['success' => false, 'code' => 'GUIDED_ONLY',
                'message' => 'Please pick a question from the list — typing your own question is not available.',
                'message_ta' => 'பட்டியலிலிருந்து ஒரு கேள்வியை தேர்வு செய்யவும் — நீங்களே கேள்வி எழுதும் வசதி இல்லை.',
                'message_hi' => 'कृपया सूची से कोई प्रश्न चुनें — अपना प्रश्न लिखने की सुविधा नहीं है।'], 400);
        }
        $question = trim((string) ($body['question'] ?? ''));
        if ($question === '') {
            jsonResponse(['success' => false, 'code' => 'MISSING_FIELDS',
                'message' => 'questionId or question is required.'], 400);
        }
    }
    if (mb_strlen($question, 'UTF-8') > 2000) {
        jsonResponse(['success' => false, 'code' => 'TOO_LONG',
            'message' => 'Please keep the question under 2000 characters.'], 400);
    }

    // Complaint options may carry a short detail line (the ONLY free text a
    // customer can send). It is stored with the message and queued to the
    // human team; the rule engine never sees it, so it cannot become an
    // unrelated astrology question by the back door.
    $complaintDetails = trim((string) ($body['complaintDetails'] ?? ''));
    if (mb_strlen($complaintDetails, 'UTF-8') > 500) {
        jsonResponse(['success' => false, 'code' => 'TOO_LONG',
            'message' => 'Please keep the details under 500 characters.'], 400);
    }
    $storedQuestion = $question;
    if ($guided !== null && ($guided['kind'] ?? '') === 'complaint' && $complaintDetails !== '') {
        $storedQuestion = $question . "\n" . $complaintDetails;
    }
    // No daily question cap: entitled customers ask without limit (admins too).
    // The authentication + delivered-report + 7-day window gates are the only
    // boundary; nothing here counts or refuses questions any more.

    $startedAt = microtime(true);

    // 1. Store the question before building a reply, so the customer's words are safe.
    $questionId = astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'customer', $language, $storedQuestion);

    try {
        // 2. Retrieve the local rules and build a deterministic reply. No external
        //    provider, model call or API key is involved.
        $reply = astro_ai_generate_reply($pdo, $user, $session, $language, $question, $guided);

        // NOTE: questions are unlimited now - no rate-limit counter is bumped
        // anywhere in this handler (the old daily allowance was removed).

        $replyId = astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'assistant', $language, $reply['content'], [
            'area_id' => $reply['areaId'] ?? null,
            'sources' => null,
            'status' => 'SENT',
            'latency_ms' => (int) round((microtime(true) - $startedAt) * 1000),
        ]);

        // 3. Complaints go straight to the admin queue (ai_chat_handoffs),
        //    whatever the local rule engine answered, and the customer sees a visible
        //    confirmation. Non-complaint handoffs (health, declined topics)
        //    only OFFER the astrologer - they are queued when the customer
        //    accepts via the "Talk to our astrologer" button, so the queue
        //    is never flooded with offers nobody confirmed.
        $escalation = astro_ai_escalation_reason($question);
        // Guided complaint/support options (and the birth-detail correction
        // option) always reach the human queue, even when their wording
        // contains none of the complaint keywords above.
        if ($escalation === null && $guided !== null
            && (($guided['escalate'] ?? false) === true || ($guided['kind'] ?? '') === 'complaint')) {
            $escalation = 'complaint';
        }
        $escalated = false;
        $bubbles = $reply['bubbles'] ?? [];
        if ($escalation !== null) {
            astro_ai_record_escalation($pdo, $user, $session, $storedQuestion, $escalation, $language);
            $notice = astro_ai_escalation_notice($language);
            astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'system', $language, $notice, [
                'status' => 'SENT',
            ]);
            $bubbles[] = $notice;
            $escalated = true;
        }

        jsonResponse([
            'success' => true,
            'sessionId' => $sessionId,
            'questionId' => $questionId,
            'guidedId' => $guidedId !== '' ? $guidedId : null,
            'customerMessage' => $storedQuestion,
            'messageId' => $replyId,
            'language' => $language,
            'content' => $reply['content'],
            'bubbles' => $bubbles,
            'sources' => '',
            'areaId' => $reply['areaId'] ?? null,
            'handoff' => (bool) ($reply['handoff'] ?? false) || $escalated,
            'mode' => (string) ($reply['mode'] ?? AstroAiProvider::mode()),
            'escalated' => $escalated,
            'latencyMs' => (int) round((microtime(true) - $startedAt) * 1000),
            'remainingToday' => null,
            'unlimited' => true,
        ]);
    } catch (Throwable $e) {
        error_log('AI Astrologer generation failed: ' . $e->getMessage());

        // Record the failure as its own row. The customer's question stays, and
        // the FAILED row is what lets a retry be linked back to it.
        astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'assistant', $language,
            'Please give me a moment, I am checking again.', [
                'status' => 'FAILED',
                'error_message' => mb_substr($e->getMessage(), 0, 500, 'UTF-8'),
                'latency_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            ]);

        // The question did not consume an allowance: the customer got no answer.
        jsonResponse([
            'success' => false,
            'code' => 'GENERATION_FAILED',
            'questionId' => $questionId,
            'message' => 'Please give me a moment, I am checking again.',
            'retry' => true,
        ], 503);
    }
}

function astro_ai_action_upload(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);
    require_once dirname(__DIR__) . '/ai_report_extract.php';

    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    $session = astro_ai_load_session($pdo, $sessionId, $user['id']);
    if (!$session) {
        jsonResponse(['success' => false, 'code' => 'SESSION_NOT_FOUND', 'message' => 'That conversation was not found.'], 404);
    }

    if (empty($_FILES['report']) || !is_uploaded_file($_FILES['report']['tmp_name'] ?? '')) {
        jsonResponse(['success' => false, 'code' => 'MISSING_FILE', 'message' => 'No file was received.'], 400);
    }
    $file = $_FILES['report'];
    $size = (int) ($file['size'] ?? 0);
    $filename = basename((string) ($file['name'] ?? 'report.pdf'));

    $language = astro_normalize_report_language((string) ($session['language'] ?? 'ta'));

    $accept = function (string $kind, ?string $orderNumber) use ($pdo, $sessionId, $user, $language, $filename, $size) {
        astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'system', $language,
            AstroAiReportExtract::rejectionText($kind, $language), [
                'attachment_kind' => 'pdf',
                'attachment_filename' => $filename,
                'attachment_bytes' => $size,
                'attachment_order_number' => $orderNumber,
                'attachment_rejection' => $kind,
            ]);
        jsonResponse([
            'success' => false,
            'code' => strtoupper($kind),
            'message' => AstroAiReportExtract::rejectionText($kind, $language),
        ], 422);
    };

    if ($size > AI_ASTROLOGER_MAX_UPLOAD_BYTES) {
        $accept('tooLarge', null);
    }
    if (strtolower((string) pathinfo($filename, PATHINFO_EXTENSION)) !== 'pdf') {
        $accept('unreadable', null);
    }
    if (function_exists('finfo_open')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);
        if ($mime !== 'application/pdf') {
            $accept('unreadable', null);
        }
    }

    // Extract, then gate. The PDF is an ownership token, not the explanation -
    // see knowledge/ai-astrologer/rules/report-sections.json.
    $extracted = AstroAiReportExtract::extractPdfText((string) $file['tmp_name']);
    $orders = AstroAiReportExtract::customerOrders($pdo, (string) $user['id']);

    $decision = AstroAiReportExtract::decideAcceptance(
        (string) $extracted['text'],
        $filename,
        $orders['all'],
        $orders['paid'],
        $size
    );

    if (!$decision['accepted']) {
        error_log('AI Astrologer upload refused: ' . $decision['reason']);
        $accept((string) $decision['rejection'], $decision['orderNumber']);
    }

    // Accepted. Bind the session to this order; re-verify exact ownership row
    // by string user_id before binding so an unowned order can never be attached.
    $orderNumber = (string) $decision['orderNumber'];
    $stmt = $pdo->prepare("SELECT id, service_type FROM orders WHERE order_number = ? AND user_id = ? LIMIT 1");
    $stmt->execute([$orderNumber, (string) $user['id']]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    if (empty($order['id'])) {
        error_log('AI Astrologer upload refused: verified order lookup came back empty for ' . $orderNumber);
        $accept('notYours', $orderNumber);
    }
    // A family report starts on its first member, same as session creation.
    $uploadPersons = !empty($order['id']) ? astro_ai_order_persons($pdo, (string) $order['id']) : [];

    $bind = $pdo->prepare(
        "UPDATE ai_chat_sessions SET order_id = ?, order_number = ?, service_type = ?, person_id = ? WHERE id = ? AND user_id = ?"
    );
    $bind->execute([
        $order['id'] ?? null,
        $orderNumber,
        $order['service_type'] ?? null,
        $uploadPersons !== [] ? $uploadPersons[0]['id'] : null,
        $sessionId,
        $user['id'],
    ]);

    astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'system', $language,
        $language === 'ta' ? 'உங்கள் அறிக்கையை இணைத்துவிட்டேன். எந்த பகுதியை விளக்க வேண்டும்?'
            : ($language === 'hi' ? 'मैंने आपकी रिपोर्ट जोड़ दी है। कौन सा हिस्सा समझाऊँ?'
            : 'I have attached your report. Which part would you like me to explain?'), [
            'attachment_kind' => 'pdf',
            'attachment_filename' => $filename,
            'attachment_bytes' => $size,
            'attachment_order_number' => $orderNumber,
            'status' => 'SENT',
        ]);

    $type = $decision['type'] ?? null;
    jsonResponse([
        'success' => true,
        'sessionId' => $sessionId,
        'orderNumber' => $orderNumber,
        'serviceType' => $order['service_type'] ?? null,
        'reportType' => $type['id'] ?? null,
        'sections' => array_map(function ($s) use ($language) {
            return ['id' => $s['id'], 'title' => $s['title'][$language] ?? $s['title']['en'], 'page' => $s['page']];
        }, $type['sections'] ?? []),
    ]);
}

function astro_ai_action_handoff(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    $question = trim((string) ($body['question'] ?? ''));
    if ($question === '') {
        jsonResponse(['success' => false, 'code' => 'MISSING_QUESTION',
            'message' => 'Please tell our astrologer what you would like help with.'], 400);
    }

    $sessionId = trim((string) ($body['sessionId'] ?? '')) ?: null;
    $session = $sessionId ? astro_ai_load_session($pdo, $sessionId, (string) $user['id']) : null;

    $stmt = $pdo->prepare(
        "INSERT INTO ai_chat_handoffs
            (session_id, user_id, user_name, user_email, user_mobile, language, question, reason, order_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $sessionId,
        $user['id'],
        $user['name'],
        $user['email'] ?? null,
        $user['mobile'] ?? null,
        astro_normalize_report_language((string) ($session['language'] ?? ($body['language'] ?? 'ta'))),
        $question,
        (string) ($body['reason'] ?? 'requested'),
        $session['order_number'] ?? null,
    ]);

    if ($session) {
        astro_ai_save_message($pdo, $sessionId, (string) $user['id'], 'handoff', $session['language'], $question, [
            'status' => 'SENT',
        ]);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Thank you. Our astrologer has your question and will reply to you directly.',
        'message_ta' => 'நன்றி. உங்கள் கேள்வி எங்கள் ஜோதிடரிடம் சென்றுவிட்டது; அவர்கள் நேரடியாக பதிலளிப்பார்கள்.',
        'message_hi' => 'धन्यवाद। आपका प्रश्न हमारे ज्योतिषी तक पहुँच गया है; वे सीधे उत्तर देंगे।',
    ], 201);
}

function astro_ai_action_usage(PDO $pdo, array $user): void
{
    astro_ai_ensure_tables($pdo);

    // Questions are unlimited for admins AND customers; the only customer-
    // specific datum left here is the chat language, taken from the report
    // that opened access so the floating launcher can speak it before a
    // session exists. Null once the window has closed - the chat cannot open then.
    $entitlement = astro_ai_is_admin($user) ? null : astro_ai_chat_entitlement($pdo, (string) $user['id']);
    jsonResponse([
        'success' => true,
        'used' => null,
        'limit' => null,
        'remaining' => null,
        'unlimited' => true,
        'language' => $entitlement !== null && $entitlement['allowed'] && $entitlement['language'] !== null
            ? astro_normalize_report_language($entitlement['language'])
            : null,
        'windowSeconds' => AI_ASTROLOGER_WINDOW_SECONDS,
    ]);
}

/**
 * WHY THE CHAT IS NOT ANSWERING — the one request that says so.
 *
 * Admin-only. Checks the local reply path (mbstring, JSON knowledge files and
 * the source catalogue). External providers are disabled, and this diagnostic
 * never makes an outbound network request, even if a legacy key is still stored.
 */
function astro_ai_action_diagnose(PDO $pdo, array $user, array $body): void
{
    if (!astro_ai_is_admin($user)) {
        jsonResponse(['success' => false, 'code' => 'ADMIN_ONLY',
            'message' => 'Admin privileges are required to check the local astrology knowledge base.'], 403);
    }

    // Ignore legacy ping requests: this endpoint is permanently local-only.
    $diagnostics = AstroAiProvider::diagnostics(false);

    // The customer-facing view of the same problem: what the last few attempts
    // actually did. A wall of FAILED rows with the same error message is the
    // signature of a configuration problem rather than a slow computation.
    $recentFailures = [];
    try {
        astro_ai_ensure_tables($pdo);
        $stmt = $pdo->query(
            "SELECT status, error_message, latency_ms, created_at
               FROM ai_chat_messages
              WHERE role = 'assistant'
              ORDER BY id DESC
              LIMIT 50"
        );
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $failed = 0;
        $sent = 0;
        $lastError = null;
        $slowest = 0;
        foreach ($rows as $row) {
            if (($row['status'] ?? '') === 'FAILED') {
                $failed++;
                if (!empty($row['error_message'])) {
                    $lastError = (string) $row['error_message'];
                }
            } else if (($row['status'] ?? '') === 'SENT') {
                $sent++;
            }
            $slowest = max($slowest, (int) ($row['latency_ms'] ?? 0));
        }
        $recentFailures = [
            'window' => count($rows),
            'failed' => $failed,
            'sent' => $sent,
            'lastError' => $lastError,
            'slowestLatencyMs' => $slowest,
        ];
    } catch (Throwable $e) {
        // The chat tables may not exist yet on a fresh install; that is itself
        // worth reporting, but it must not hide the local knowledge checks.
        $recentFailures = ['error' => $e->getMessage()];
    }

    jsonResponse([
        'success' => true,
        'ok' => $diagnostics['ok'],
        'configured' => $diagnostics['configured'],
        'blocking' => $diagnostics['blocking'],
        'checks' => $diagnostics['checks'],
        'ping' => $diagnostics['ping'],
        'sourceRegistry' => $diagnostics['sourceRegistry'],
        'recentMessages' => $recentFailures,
        'generatedAt' => $diagnostics['generatedAt'],
    ]);
}

