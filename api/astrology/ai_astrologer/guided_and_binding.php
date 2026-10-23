<?php
/**
 * ASTRO SIVAM — AI Astrologer Guided Questions, Report Binding & Escalation
 */

/* ================================================================== */
/* Guided questions — customers pick, never type                       */
/* ================================================================== */

/**
 * Locates the guided menu. knowledge/ lives at the repository root in
 * development and at the document root on cPanel, with api/knowledge/ as a
 * fallback for manual uploads (same convention as AstroAiProvider::kbPath).
 */
function astro_ai_guided_path(): string
{
    foreach ([
        dirname(__DIR__, 3) . '/knowledge/ai-astrologer/rules/guided-questions.json',
        dirname(__DIR__, 2) . '/knowledge/ai-astrologer/rules/guided-questions.json',
    ] as $candidate) {
        if (is_file($candidate)) {
            return $candidate;
        }
    }
    return dirname(__DIR__, 3) . '/knowledge/ai-astrologer/rules/guided-questions.json';
}

function astro_ai_guided_data(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $path = astro_ai_guided_path();
    $contents = is_file($path) ? @file_get_contents($path) : false;
    $decoded = is_string($contents) ? json_decode($contents, true) : null;
    $cache = is_array($decoded) ? $decoded : [];
    return $cache;
}

/**
 * Finds one curated option by id, or null. This is the server-side
 * allowlist: a questionId that is not in this file is rejected in ask().
 */
function astro_ai_guided_find(string $questionId): ?array
{
    foreach ((astro_ai_guided_data()['categories'] ?? []) as $category) {
        foreach (($category['questions'] ?? []) as $q) {
            if ((string) ($q['id'] ?? '') === $questionId) {
                $q['_category'] = (string) ($category['id'] ?? '');
                $q['_services'] = array_values(array_filter(array_map('strval', (array) ($category['services'] ?? []))));
                return $q;
            }
        }
    }
    return null;
}

/**
 * The service types a curated option needs a delivered report for, or [] when
 * the option is open to every entitled customer (life areas, doshas, remedies,
 * order facts, complaints).
 *
 * @return string[]
 */
function astro_ai_guided_required_services(array $guided): array
{
    return array_values(array_filter(array_map('strval', (array) ($guided['_services'] ?? []))));
}

/**
 * The service types this customer already has a delivered report for.
 *
 * This is what decides whether the Wedding Matching, Baby Naming and Subha
 * Muhurtham chapters appear in the menu: a chapter about a report the
 * customer has never received would only invite a question the chat cannot
 * answer from their own data. The same query as the entitlement gate, minus
 * the 7-day window — a chapter is about the report, not about the chat window.
 *
 * @return string[] e.g. ['BIRTH_JATHAGAM', 'MUHURTHAM']
 */
function astro_ai_entitled_service_types(PDO $pdo, string $userId): array
{
    $stmt = $pdo->prepare(
        "SELECT DISTINCT service_type
           FROM orders
          WHERE user_id = :uid
            AND payment_confirmed = 1
            AND status IN ('COMPLETED', 'PROCESSING')
            AND (refund_status IS NULL OR refund_status = 'NONE')
            AND email_status = 'SENT'
            AND email_sent_at IS NOT NULL"
    );
    $stmt->execute([':uid' => $userId]);
    $types = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $t = strtoupper(trim((string) ($row['service_type'] ?? '')));
        if ($t !== '') {
            $types[] = $t;
        }
    }

    // A family order's header only says MULTI_PERSON; its items carry the
    // services that family actually bought. Without this, a customer who
    // ordered (say) Baby Naming for one of five people would never see the
    // chapter that their own delivered report entitles them to.
    try {
        $itemStmt = $pdo->prepare(
            "SELECT DISTINCT i.service_code AS service_type
               FROM order_items i
               JOIN orders o ON o.id = i.order_id
              WHERE o.user_id = :uid
                AND o.payment_confirmed = 1
                AND o.status IN ('COMPLETED', 'PROCESSING')
                AND (o.refund_status IS NULL OR o.refund_status = 'NONE')
                AND o.email_status = 'SENT'
                AND o.email_sent_at IS NOT NULL"
        );
        $itemStmt->execute([':uid' => $userId]);
        foreach ($itemStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $t = strtoupper(trim((string) ($row['service_type'] ?? '')));
            if ($t !== '') {
                $types[] = $t;
            }
        }
    } catch (Throwable $e) {
        // order_items missing on an un-migrated database: header types only.
    }
    return array_values(array_unique($types));
}

/**
 * The reports this conversation may be attached to: the customer's own
 * delivered orders, newest first. Used by the panel's report picker so a
 * customer can move the chat to the report they want to ask about.
 *
 * @return array<int, array{orderNumber:string, serviceType:string, deliveredAt:?string}>
 */
function astro_ai_attachable_orders(PDO $pdo, string $userId): array
{
    $stmt = $pdo->prepare(
        "SELECT order_number, service_type, email_sent_at
           FROM orders
          WHERE user_id = :uid
            AND payment_confirmed = 1
            AND status IN ('COMPLETED', 'PROCESSING')
            AND (refund_status IS NULL OR refund_status = 'NONE')
            AND email_status = 'SENT'
            AND email_sent_at IS NOT NULL
          ORDER BY email_sent_at DESC
          LIMIT 50"
    );
    $stmt->execute([':uid' => $userId]);
    $orders = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $orders[] = [
            'orderNumber' => (string) ($row['order_number'] ?? ''),
            'serviceType' => strtoupper(trim((string) ($row['service_type'] ?? ''))),
            'deliveredAt' => $row['email_sent_at'] !== null ? (string) $row['email_sent_at'] : null,
        ];
    }
    return $orders;
}

/**
 * The people of one order, in checkout sequence. Family orders carry several;
 * legacy orders were backfilled to exactly one. Empty when the child tables
 * cannot be read, which simply hides the person picker - never an error.
 *
 * @return array<int, array{id:int, seq:int, name:string}>
 */
function astro_ai_order_persons(PDO $pdo, string $orderId): array
{
    if ($orderId === '') {
        return [];
    }
    astro_ensure_multi_person_tables($pdo);
    try {
        $stmt = $pdo->prepare(
            "SELECT id, seq, full_name
               FROM order_persons
              WHERE order_id = ?
              ORDER BY seq ASC"
        );
        $stmt->execute([$orderId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('AI Astrologer: person list unavailable: ' . $e->getMessage());
        return [];
    }

    $persons = [];
    foreach ($rows as $row) {
        $name = trim((string) ($row['full_name'] ?? ''));
        $seq = (int) ($row['seq'] ?? 0);
        $persons[] = [
            'id' => (int) ($row['id'] ?? 0),
            'seq' => $seq,
            'name' => $name !== '' ? $name : ('Person ' . max(1, $seq)),
        ];
    }
    return $persons;
}

/**
 * The family member this conversation answers about: the session's saved
 * choice when it belongs to the bound order, otherwise the first member.
 * Only family orders (two or more people) have a selected person; single
 * person reports keep reading the order header exactly as before.
 */
function astro_ai_selected_person(array $session, array $persons): ?array
{
    if (count($persons) < 2) {
        return null;
    }
    $wanted = (int) ($session['person_id'] ?? 0);
    foreach ($persons as $person) {
        if ($person['id'] === $wanted && $wanted > 0) {
            return $person;
        }
    }
    return $persons[0];
}

/**
 * The report rows one family member bought: service code plus that person's
 * own saved inputs. A member with no items yields an empty list.
 *
 * @return array<int, array{serviceCode:string, payload:mixed, language:string}>
 */
function astro_ai_person_items(PDO $pdo, string $orderId, int $personId): array
{
    if ($orderId === '' || $personId < 1) {
        return [];
    }
    astro_ensure_multi_person_tables($pdo);
    try {
        $stmt = $pdo->prepare(
            "SELECT service_code, input_payload, language
               FROM order_items
              WHERE order_id = ? AND person_id = ?
              ORDER BY id ASC"
        );
        $stmt->execute([$orderId, $personId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('AI Astrologer: person report items unavailable: ' . $e->getMessage());
        return [];
    }

    $items = [];
    foreach ($rows as $row) {
        $code = strtoupper(trim((string) ($row['service_code'] ?? '')));
        if ($code === '') {
            continue;
        }
        $items[] = [
            'serviceCode' => $code,
            'payload' => $row['input_payload'] ?? null,
            'language' => (string) ($row['language'] ?? ''),
        ];
    }
    return $items;
}

/**
 * One family member's report in the order shape the reply builder reads: the
 * order header plus this person's saved inputs. The id is namespaced by person
 * so two members of the same order never share one cached rebuild.
 */
function astro_ai_person_report_order(array $order, array $item, int $personId): array
{
    $pseudo = $order;
    $pseudo['id'] = (string) ($order['id'] ?? '') . '#' . $personId;
    $pseudo['service_type'] = (string) $item['serviceCode'];
    $pseudo['input_payload'] = $item['payload'] ?? null;
    $itemLanguage = astro_normalize_report_language((string) ($item['language'] ?? ''));
    $pseudo['language'] = $itemLanguage;
    return $pseudo;
}

/**
 * The readings of ONE family member, merged across the service reports that
 * member bought. serviceType stays MULTI_PERSON (that is what the bound
 * report is) while `services` lists the chapters this member actually holds,
 * so the answer route can tell "this member has no such report" apart from
 * "this member's report could not be rebuilt here".
 *
 * @return array{serviceType:string, services:array, matching?:array, naming?:array, muhurtham?:array}|null
 */
function astro_ai_person_service_facts(array $order, int $personId, array $items): ?array
{
    $merged = ['serviceType' => 'MULTI_PERSON', 'services' => []];
    foreach ($items as $item) {
        $code = (string) $item['serviceCode'];
        if (!in_array($code, ['MARRIAGE_COMPATIBILITY', 'BABY_NAMING', 'MUHURTHAM'], true)) {
            continue;
        }
        if (!in_array($code, $merged['services'], true)) {
            $merged['services'][] = $code;
        }
        if (!is_array($item['payload'] ?? null) && !(is_string($item['payload'] ?? null) && trim((string) $item['payload']) !== '')) {
            continue;
        }
        $facts = astro_ai_service_facts(astro_ai_person_report_order($order, $item, $personId));
        if ($facts === null) {
            continue;
        }
        foreach (['matching', 'naming', 'muhurtham'] as $key) {
            if (isset($facts[$key])) {
                $merged[$key] = $facts[$key];
            }
        }
    }
    // Null only when this member holds none of the three chapter reports:
    // then the chat has nothing of theirs to read for those questions.
    return $merged['services'] !== [] ? $merged : null;
}

/**
 * The selected family member's birth-details line for the order question,
 * in the same wording the single-person path uses. '' when no item carries
 * birth fields (should not happen - every item payload holds them).
 */
function astro_ai_person_birth_text(array $items): string
{
    $candidates = [];
    foreach ($items as $item) {
        if ($item['serviceCode'] === 'BIRTH_JATHAGAM') {
            $candidates[] = $item;
            break;
        }
    }
    if ($candidates === []) {
        $candidates = $items;
    }
    foreach ($candidates as $item) {
        $payload = $item['payload'] ?? null;
        if (is_string($payload)) {
            $payload = json_decode($payload, true);
        }
        if (!is_array($payload)) {
            continue;
        }
        $bits = [];
        foreach (['name' => 'Name', 'dob' => 'Date of birth', 'tob' => 'Time of birth',
                  'birthPlace' => 'Birth place', 'birth_place' => 'Birth place'] as $key => $label) {
            $value = trim((string) ($payload[$key] ?? ''));
            if ($value !== '' && !in_array($label . ': ' . $value, $bits, true)) {
                $bits[] = $label . ': ' . $value;
            }
        }
        if ($bits !== []) {
            return implode(', ', $bits);
        }
    }
    return '';
}

/**
 * The menu the client renders: categories with their options in the
 * customer's language. Routing metadata (area, service, dosha, planet, topic)
 * stays on the server — the client only ever sends the id back.
 *
 * A category that names `services` (the three service chapters) is served only
 * when the customer holds a delivered report of one of those service types,
 * or to an administrator. The client is never the one that decides: it simply
 * receives fewer chapters.
 */
function astro_ai_guided_menu(string $language, ?array $allowedServices = null, bool $isAdmin = false): array
{
    $lang = in_array($language, ['en', 'ta', 'hi'], true) ? $language : 'en';
    $allowed = [];
    if (is_array($allowedServices)) {
        foreach ($allowedServices as $s) {
            $allowed[strtoupper(trim((string) $s))] = true;
        }
    }
    $menu = [];
    foreach ((astro_ai_guided_data()['categories'] ?? []) as $category) {
        $needs = array_values(array_filter(array_map('strval', (array) ($category['services'] ?? []))));
        if ($needs !== [] && !$isAdmin) {
            $visible = false;
            foreach ($needs as $service) {
                if (isset($allowed[strtoupper(trim($service))])) {
                    $visible = true;
                    break;
                }
            }
            if (!$visible) {
                continue;
            }
        }
        $questions = [];
        foreach (($category['questions'] ?? []) as $q) {
            $questions[] = [
                'id' => (string) ($q['id'] ?? ''),
                'kind' => (string) ($q['kind'] ?? 'area'),
                'text' => (string) ($q['text'][$lang] ?? ($q['text']['en'] ?? '')),
                'needsDetails' => (bool) ($q['needsDetails'] ?? false),
            ];
        }
        $menu[] = [
            'id' => (string) ($category['id'] ?? ''),
            'icon' => (string) ($category['icon'] ?? ''),
            'title' => (string) ($category['title'][$lang] ?? ($category['title']['en'] ?? '')),
            'hint' => (string) ($category['hint'][$lang] ?? ($category['hint']['en'] ?? '')),
            'questions' => $questions,
        ];
    }
    return $menu;
}

function astro_ai_action_options(PDO $pdo, array $user, array $body): void
{
    // Read-only: the menu and the report list are answered from the knowledge
    // files and the orders table, so there is nothing to bootstrap here.
    $language = astro_normalize_report_language((string) ($body['language'] ?? ($_GET['language'] ?? 'ta')));
    $isAdmin = astro_ai_is_admin($user);
    $services = $isAdmin ? [] : astro_ai_entitled_service_types($pdo, (string) $user['id']);
    $menu = astro_ai_guided_menu($language, $services, $isAdmin);
    if (empty($menu)) {
        error_log('AI Astrologer: guided-questions.json is missing or empty at ' . astro_ai_guided_path());
        jsonResponse(['success' => false, 'code' => 'GUIDED_UNAVAILABLE',
            'message' => 'The question list is not available right now. Please try again in a moment.',
            'message_ta' => 'கேள்விப் பட்டியல் இப்போது இல்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.',
            'message_hi' => 'प्रश्न-सूची अभी उपलब्ध नहीं है। कृपया कुछ देर बाद फिर कोशिश करें।'], 503);
    }
    // The reports this conversation can be attached to. The service chapters
    // are only useful once the matching report is attached, and the floating
    // launcher opens with no report bound.
    $orders = astro_ai_attachable_orders($pdo, (string) $user['id']);
    foreach ($orders as &$o) {
        $o['title'] = astro_ai_service_title((string) $o['serviceType'], $language);
    }
    unset($o);

    jsonResponse([
        'success' => true,
        'language' => $language,
        'categories' => $menu,
        /** Service types the customer holds a delivered report for (drives the gated chapters). */
        'entitledServices' => $services,
        /** The customer's own delivered reports, attachable to this conversation. */
        'orders' => $orders,
    ]);
}

/** Plain service names for the report picker, in the customer's language. */
function astro_ai_service_title(string $serviceType, string $language): string
{
    $names = [
        'BIRTH_JATHAGAM' => ['en' => 'Birth Jathagam', 'ta' => 'ஜன்ம ஜாதகம்', 'hi' => 'जन्म कुंडली'],
        'MARRIAGE_COMPATIBILITY' => ['en' => 'Wedding Matching', 'ta' => 'திருமணப் பொருத்தம்', 'hi' => 'विवाह मिलान'],
        'BABY_NAMING' => ['en' => 'Baby Naming', 'ta' => 'குழந்தைப் பெயர்', 'hi' => 'नामकरण'],
        'MUHURTHAM' => ['en' => 'Subha Muhurtham', 'ta' => 'சுப முகூர்த்தம்', 'hi' => 'शुभ मुहूर्त'],
        'MULTI_PERSON' => ['en' => 'Family Report', 'ta' => 'குடும்ப அறிக்கை', 'hi' => 'पारिवारिक रिपोर्ट'],
    ];
    $lang = in_array($language, ['en', 'ta', 'hi'], true) ? $language : 'en';
    $map = $names[$serviceType] ?? null;
    return $map ? (string) ($map[$lang] ?? $map['en']) : $serviceType;
}

/**
 * Attaches one of the customer's own delivered reports to this conversation
 * (or detaches it with an empty orderNumber). Nothing here trusts the client:
 * the order must belong to this account and must already have been delivered.
 */
function astro_ai_action_bind(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    $sessionId = trim((string) ($body['sessionId'] ?? ''));
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

    $orderNumber = trim((string) ($body['orderNumber'] ?? ''));
    $serviceType = null;
    $orderId = null;
    $order = null;

    if ($orderNumber !== '') {
        // Ownership AND delivery, in the query itself - an undelivered or
        // someone else's order cannot become the chart this chat discusses.
        $stmt = $pdo->prepare(
            "SELECT id, service_type, order_number, language
               FROM orders
              WHERE order_number = :num
                AND user_id = :uid
                AND payment_confirmed = 1
                AND status IN ('COMPLETED', 'PROCESSING')
                AND (refund_status IS NULL OR refund_status = 'NONE')
                AND email_status = 'SENT'
                AND email_sent_at IS NOT NULL
              LIMIT 1"
        );
        $stmt->execute([':num' => $orderNumber, ':uid' => $user['id']]);
        $order = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$order) {
            jsonResponse(['success' => false, 'code' => 'ORDER_NOT_FOUND',
                'message' => 'That report is not available for this conversation.'], 404);
        }
        $orderId = (string) ($order['id'] ?? '');
        $serviceType = strtoupper(trim((string) ($order['service_type'] ?? '')));
        $orderNumber = (string) ($order['order_number'] ?? $orderNumber);
    }

    // Attaching a report moves the conversation into the language that report
    // was ordered in, so the answers about it read like the report itself.
    // Detaching keeps the language the session already speaks.
    $language = $order !== null
        ? astro_normalize_report_language((string) ($order['language'] ?? ''))
        : astro_normalize_report_language((string) ($session['language'] ?? 'ta'));

    // A family report starts the conversation on its first member; switching
    // reports must not keep another order's person selected. Detaching clears
    // the person with the report.
    $persons = $order !== null ? astro_ai_order_persons($pdo, (string) $orderId) : [];
    $selectedPerson = $persons !== [] ? $persons[0] : null;

    $bind = $pdo->prepare(
        "UPDATE ai_chat_sessions SET order_id = ?, order_number = ?, service_type = ?, language = ?, person_id = ? WHERE id = ? AND user_id = ?"
    );
    $bind->execute([
        $orderId !== '' ? $orderId : null,
        $orderNumber !== '' ? $orderNumber : null,
        $serviceType,
        $language,
        $selectedPerson !== null ? $selectedPerson['id'] : null,
        $sessionId,
        $user['id'],
    ]);

    jsonResponse([
        'success' => true,
        'sessionId' => $sessionId,
        'orderNumber' => $orderNumber !== '' ? $orderNumber : null,
        'serviceType' => $serviceType,
        'serviceTitle' => $serviceType ? astro_ai_service_title($serviceType, $language) : null,
        'language' => $language,
        'persons' => $persons,
        'selectedPersonId' => $selectedPerson !== null ? $selectedPerson['id'] : null,
    ]);
}

/**
 * PICK THE FAMILY MEMBER this conversation answers about. The person must be
 * part of the order currently bound to the session - a customer can never
 * point the chat at another family's member.
 */
function astro_ai_action_person(PDO $pdo, array $user, array $body): void
{
    astro_ai_ensure_tables($pdo);

    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    if ($sessionId === '') {
        jsonResponse(['success' => false, 'code' => 'MISSING_FIELDS',
            'message' => 'sessionId is required.'], 400);
    }
    $session = astro_ai_load_session($pdo, $sessionId, $user['id']);
    if (!$session) {
        jsonResponse(['success' => false, 'code' => 'SESSION_NOT_FOUND',
            'message' => 'That conversation was not found.'], 404);
    }
    if ($session['status'] === 'CLOSED') {
        jsonResponse(['success' => false, 'code' => 'SESSION_CLOSED',
            'message' => 'That conversation is closed. Please start a new one.'], 409);
    }

    $orderId = (string) ($session['order_id'] ?? '');
    if ($orderId === '') {
        jsonResponse(['success' => false, 'code' => 'NO_REPORT',
            'message' => 'Attach a report to this conversation first.'], 400);
    }

    $personId = (int) ($body['personId'] ?? 0);
    $persons = astro_ai_order_persons($pdo, $orderId);
    $chosen = null;
    foreach ($persons as $person) {
        if ($person['id'] === $personId && $personId > 0) {
            $chosen = $person;
            break;
        }
    }
    if ($chosen === null) {
        jsonResponse(['success' => false, 'code' => 'PERSON_NOT_FOUND',
            'message' => 'That family member is not part of this report.'], 404);
    }

    $stmt = $pdo->prepare(
        "UPDATE ai_chat_sessions SET person_id = ? WHERE id = ? AND user_id = ?"
    );
    $stmt->execute([$chosen['id'], $sessionId, $user['id']]);

    jsonResponse([
        'success' => true,
        'personId' => $chosen['id'],
        'name' => $chosen['name'],
        'persons' => $persons,
    ]);
}

/* ================================================================== */
/* Generation — deterministic local knowledge-base reply               */
/* ================================================================== */

/**
 * Rebuilds the customer's chart from their own saved order inputs, then uses
 * only local rules, report readings and remedies to assemble the reply. Throws
 * on a real local setup/runtime failure so the caller records a FAILED row.
 *
 * @param array|null $guided the curated option the customer picked (kind, area,
 *                             dosha, planet, topic), or null for an admin free-text question.
 * @return array{content:string, bubbles:array, sourceLine:?string, areaId:?string, handoff:bool}
 */
function astro_ai_generate_reply(PDO $pdo, array $user, array $session, string $language, string $question, ?array $guided = null): array
{
    // The chart comes from the order bound to this session, rebuilt from the
    // saved inputs - never from a cached calculated_result.
    $chart = null;
    $context = [
        'customerName' => (string) ($user['name'] ?? 'there'),
        'orderTitle' => 'your report',
        'orderDetails' => '(no order attached to this conversation yet)',
        'dashaEndDate' => null,
    ];

    if (!empty($session['order_id'])) {
        $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1");
        $stmt->execute([$session['order_id'], $user['id']]);
        $order = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($order) {
            $context['orderTitle'] = (string) ($order['service_type'] ?? 'your report');
            $context['orderDetails'] = astro_ai_order_details_text($order);
            // The bound report's own readings, whichever service it is: a
            // natal chart for a Birth Jathagam, the porutham table / birth-pada
            // syllables / muhurtham calendar for the other three.
            $context['boundServiceType'] = strtoupper(trim((string) ($order['service_type'] ?? '')));

            // FAMILY REPORT: the conversation answers about ONE member - the
            // name the customer picked in the person picker (first member by
            // default). The chart and the service readings below are rebuilt
            // from THAT member's own report inputs, so switching names in the
            // picker switches whose answers these are.
            $persons = astro_ai_order_persons($pdo, (string) $order['id']);
            $person = astro_ai_selected_person($session, $persons);
            $personItems = $person !== null
                ? astro_ai_person_items($pdo, (string) $order['id'], $person['id'])
                : [];

            $chartOrder = $order;
            if ($person !== null) {
                $context['personName'] = $person['name'];
                foreach ($personItems as $personItem) {
                    if ($personItem['serviceCode'] === 'BIRTH_JATHAGAM') {
                        $chartOrder = astro_ai_person_report_order($order, $personItem, $person['id']);
                        break;
                    }
                }
                $birthText = astro_ai_person_birth_text($personItems);
                if ($birthText !== '') {
                    // Keep the single-person structure the order question
                    // parses: "... | Birth details used: ... | Report language: ...".
                    if (strpos($context['orderDetails'], ' | Report language:') !== false) {
                        $context['orderDetails'] = str_replace(
                            ' | Report language:',
                            ' | Birth details used: ' . $birthText . ' | Report language:',
                            $context['orderDetails']
                        );
                    } else {
                        $context['orderDetails'] .= ' | Birth details used: ' . $birthText;
                    }
                }
                $context['orderDetails'] .= ' | Answering for: ' . $person['name'];
            }

            $serviceFacts = $person !== null
                ? astro_ai_person_service_facts($order, $person['id'], $personItems)
                : astro_ai_service_facts($order);
            if ($serviceFacts !== null) {
                $context['serviceFacts'] = $serviceFacts;
            }
            $facts = astro_ai_chart_facts($chartOrder);
            if ($facts !== null) {
                $chart = $facts['chart'];
                // Name the member whose chart this is, for family reports.
                $context['chartHeader'] = $person !== null
                    ? $person['name'] . ' — ' . $facts['header']
                    : $facts['header'];
                $context['dashaEndDate'] = $facts['dashaEndDate'];
            }
        }
    }

    if (!isset($context['chartHeader'])) {
        $context['chartHeader'] = $language === 'ta'
            ? 'இந்த உரையாடலுடன் இன்னும் ஜாதகம் இணைக்கப்படவில்லை.'
            : ($language === 'hi'
                ? 'इस बातचीत से अभी कोई कुंडली नहीं जुड़ी है।'
                : 'No chart is attached to this conversation yet.');
    }

    // The guided option travels inside the context so the local answer
    // builder can route to the right path (area, dosha, remedy, order fact
    // or complaint acknowledgement) without re-guessing from wording.
    $context['guided'] = $guided;
    return AstroAiProvider::answerFromKnowledgeBase($question, $language, $chart, $context);
}

/** Trilingual complaint/escalation keywords. Deliberately broad: missing a
 *  real complaint is worse than an extra queue row for the admin to dismiss. */
function astro_ai_escalation_reason(string $question): ?string
{
    $q = mb_strtolower(trim($question), 'UTF-8');
    $complaintTokens = [
        // English
        'complaint', 'refund', 'money back', 'wrong report', 'incorrect report',
        'not received', "haven't received", 'did not receive', "didn't receive",
        'never received', 'still waiting for my report', 'report missing',
        'overcharged', 'charged twice', 'double charge', 'cheating', 'fraud',
        'scam', 'disappointed with', 'unhappy with', 'not satisfied',
        'poor quality', 'bad service',
        // Tamil
        'புகார்', 'பணம் திருப்பி', 'பணத்தை திருப்பி', 'ரீஃபண்ட்', 'ரிஃபண்ட்',
        'தவறான அறிக்கை', 'கிடைக்கவில்லை', 'மோசடி', 'ஏமாற்றம்',
        'வரவில்லை', 'அனுப்பவில்லை',
        // Hindi
        'शिकायत', 'रिफंड', 'पैसे वापस', 'पैसा वापस', 'गलत रिपोर्ट',
        'रिपोर्ट नहीं मिली', 'नहीं मिली', 'धोखा', 'नाराज', 'दो बार चार्ज',
    ];
    foreach ($complaintTokens as $token) {
        if ($token !== '' && mb_strpos($q, $token, 0, 'UTF-8') !== false) {
            return 'complaint';
        }
    }
    return null;
}

/** Confirmation shown in the chat once a message has reached the admin queue. */
function astro_ai_escalation_notice(string $language): string
{
    if ($language === 'ta') {
        return 'உங்கள் செய்தியை எங்கள் குழுவிடம் அனுப்பிவிட்டேன். அவர்கள் உங்களை விரைவில் தொடர்பு கொள்வார்கள்.';
    }
    if ($language === 'hi') {
        return 'आपका संदेश हमारी टीम को भेज दिया गया है। वे जल्द ही आपसे संपर्क करेंगे।';
    }
    return 'I have forwarded your message to our team. They will get back to you shortly.';
}

/**
 * Pushes the customer's message into the admin escalation queue
 * (ai_chat_handoffs). Best-effort: a queue insert failure must never break
 * the customer's answer - it is logged instead.
 */
function astro_ai_record_escalation(PDO $pdo, array $user, ?array $session, string $question, string $reason, string $language): void
{
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO ai_chat_handoffs
                (session_id, user_id, user_name, user_email, user_mobile, language, question, reason, order_number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $session['id'] ?? null,
            (string) $user['id'],
            (string) ($user['name'] ?? 'Unknown'),
            $user['email'] ?? null,
            $user['mobile'] ?? null,
            astro_normalize_report_language($language),
            $question,
            $reason,
            $session['order_number'] ?? null,
        ]);
    } catch (Throwable $e) {
        error_log('AI Astrologer: escalation insert failed: ' . $e->getMessage());
    }
}

