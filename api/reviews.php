<?php
/**
 * ASTRO SIVAM - verified customer reviews (SEO audit 2026-10-15, finding 3).
 *
 * WHY THIS EXISTS
 *   The homepage showed six hand-entered testimonials, the newest eight months
 *   old, with nothing tying any of them to a real order. Freshness and trust
 *   have to come from real customers, so a customer can now review what they
 *   bought:
 *
 *     - ONLY the owner of a PAID order whose report was DELIVERED (status
 *       COMPLETED/GENERATED, payment confirmed, not refunded) can write one -
 *       astro_review_order_eligibility() is the single rule, enforced on
 *       submit, re-checked when an administrator publishes, and applied again
 *       by the public list (a refund later hides the review).
 *     - One review per service per order (a family order can review each
 *       service it contained). Editing sends it back to moderation.
 *     - Nothing is public until an administrator approves it. The public list
 *       exposes the display name the customer chose, the optional location,
 *       the service, rating, text and the publication DATE - never the order,
 *       email or account.
 *
 * ROUTES (wired in api/services/index.php and api/admin/index.php)
 *   GET    /api/services/reviews               public: published reviews + totals
 *   POST   /api/services/reviews               customer: create/edit a review
 *   GET    /api/services/my-reviews            customer: own reviews + reviewable orders
 *   GET    /api/admin/reviews?status=          admin: moderation queue
 *   POST   /api/admin/reviews/:id/approve      admin: publish
 *   POST   /api/admin/reviews/:id/reject       admin: hide (optional reason)
 *   DELETE /api/admin/reviews/:id              admin: delete
 *
 * INVITATION ("Rate your report")
 *   Every delivery email of an order that will be reviewable once it is
 *   delivered carries astro_review_invite_email_html(): a link to
 *   https://astrosivam.com/dashboard?review=<order number>, which opens the
 *   review form for that order after sign-in (src/services/reviewInvite.ts).
 *   The delivery templates are api/admin/index.php (approve + resend),
 *   api/admin/family_approval.php, api/admin/order_items.php and
 *   api/admin/approve_order.php. Every paid customer is invited, whatever
 *   they might think of the report - never only the ones expected to be happy.
 *
 * Table: customer_reviews - api/migrations/011_customer_reviews.sql and
 * api/schema.sql; astro_reviews_ensure_table() creates it at runtime on an
 * installation that has not been migrated (the convention of api/db.php).
 *
 * The validation limits are mirrored for instant form feedback in
 * src/services/reviews.ts (REVIEW_LIMITS); this file is the authority.
 *
 * Including this file has no side effects: it only declares constants and
 * functions, so tests can execute the pure rules in isolation.
 */

const ASTRO_REVIEW_RATING_MIN = 1;
const ASTRO_REVIEW_RATING_MAX = 5;
const ASTRO_REVIEW_TITLE_MAX = 100;
const ASTRO_REVIEW_BODY_MIN = 20;
const ASTRO_REVIEW_BODY_MAX = 1500;
const ASTRO_REVIEW_NAME_MIN = 2;
const ASTRO_REVIEW_NAME_MAX = 60;
const ASTRO_REVIEW_LOCATION_MAX = 80;
const ASTRO_REVIEW_REASON_MAX = 255;
const ASTRO_REVIEW_PUBLIC_LIMIT_DEFAULT = 12;
const ASTRO_REVIEW_PUBLIC_LIMIT_MAX = 50;
/** Per customer: generous for fixing a typo, useless for flooding the queue. */
const ASTRO_REVIEW_SUBMIT_MAX_PER_WINDOW = 20;
const ASTRO_REVIEW_SUBMIT_WINDOW_SECONDS = 3600;
/**
 * Origin of the links sent by email: always the canonical public site, never
 * the host of the admin request that triggers a delivery (a staging host, a
 * cPanel temporary URL or a bare IP would reach the customer otherwise).
 */
const ASTRO_REVIEW_PUBLIC_ORIGIN = 'https://astrosivam.com';

/** Reviewable service codes -> the clean URL of the page the service is sold on. */
function astro_review_service_routes(): array
{
    return [
        'BIRTH_JATHAGAM' => 'birth-jathagam',
        'MARRIAGE_COMPATIBILITY' => 'marriage-compatibility',
        'BABY_NAMING' => 'baby-naming',
        'MUHURTHAM' => 'muhurtham',
    ];
}

function astro_review_is_service_code($code): bool
{
    return is_string($code) && array_key_exists($code, astro_review_service_routes());
}

/** Unicode-aware length: Tamil and Hindi text counts characters, not bytes. */
function astro_review_strlen(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : (int) preg_match_all('/./us', $value);
}

/**
 * Normalises user-written text: valid UTF-8 only, no control characters (a
 * newline survives in multi-line fields), no bidirectional override/isolate
 * controls that could visually spoof a review, collapsed runs of spaces,
 * at most one blank line in a row, trimmed. Zero-width joiners are kept -
 * Tamil, Hindi and emoji sequences need them.
 */
function astro_review_clean_text($value, bool $multiline = false): string
{
    if (!is_string($value)) {
        return '';
    }
    if (!preg_match('//u', $value)) {
        $value = function_exists('mb_convert_encoding') ? (string) mb_convert_encoding($value, 'UTF-8', 'UTF-8') : '';
        if (!preg_match('//u', $value)) {
            return '';
        }
    }
    $value = str_replace(["\r\n", "\r", "\t"], ["\n", "\n", ' '], $value);
    $value = (string) preg_replace('/[\x{0000}-\x{0009}\x{000B}-\x{001F}\x{007F}-\x{009F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $value);
    if (!$multiline) {
        $value = str_replace("\n", ' ', $value);
    }
    $value = (string) preg_replace('/[ \x{00A0}]{2,}/u', ' ', $value);
    if ($multiline) {
        $value = (string) preg_replace('/ *\n */u', "\n", $value);
        $value = (string) preg_replace("/\n{3,}/u", "\n\n", $value);
    }
    return trim($value);
}

/** Reviews are public: no web addresses (spam) and no email addresses (privacy). */
function astro_review_contains_link(string $value): bool
{
    return (bool) preg_match('~(?:https?://|www\.)~iu', $value);
}

function astro_review_contains_email(string $value): bool
{
    return (bool) preg_match('/[^\s@]+@[^\s@]+\.[a-z]{2,}/iu', $value);
}

function astro_review_truncate(string $value, int $max): string
{
    return function_exists('mb_substr') ? (string) mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

/**
 * Validates one submission against the services of the order it reviews.
 *
 * @param array    $body             decoded JSON request body
 * @param string[] $allowedServices  the order's reviewable service codes
 * @return array{ok:bool, errors:array<string,string>, value:array}
 */
function astro_review_validate_submission(array $body, array $allowedServices): array
{
    $errors = [];

    $serviceCode = is_string($body['serviceCode'] ?? null) ? strtoupper(trim($body['serviceCode'])) : '';
    if ($serviceCode === '' && count($allowedServices) === 1) {
        $serviceCode = (string) reset($allowedServices);
    }
    if (!in_array($serviceCode, $allowedServices, true)) {
        $errors['serviceCode'] = 'Choose the service from this order that you are reviewing.';
    }

    $ratingRaw = $body['rating'] ?? null;
    $rating = null;
    if (is_int($ratingRaw)) {
        $rating = $ratingRaw;
    } elseif (is_float($ratingRaw) && floor($ratingRaw) === $ratingRaw) {
        $rating = (int) $ratingRaw;
    } elseif (is_string($ratingRaw) && preg_match('/^\s*\d\s*$/', $ratingRaw)) {
        $rating = (int) trim($ratingRaw);
    }
    if ($rating === null || $rating < ASTRO_REVIEW_RATING_MIN || $rating > ASTRO_REVIEW_RATING_MAX) {
        $errors['rating'] = 'Choose a rating from 1 to 5 stars.';
    }

    $title = astro_review_clean_text($body['title'] ?? '', false);
    if (astro_review_strlen($title) > ASTRO_REVIEW_TITLE_MAX) {
        $errors['title'] = 'Keep the headline under ' . ASTRO_REVIEW_TITLE_MAX . ' characters.';
    }

    $text = astro_review_clean_text($body['body'] ?? '', true);
    $textLength = astro_review_strlen($text);
    if ($textLength < ASTRO_REVIEW_BODY_MIN) {
        $errors['body'] = 'Please write at least ' . ASTRO_REVIEW_BODY_MIN . ' characters about your experience.';
    } elseif ($textLength > ASTRO_REVIEW_BODY_MAX) {
        $errors['body'] = 'Please keep your review under ' . ASTRO_REVIEW_BODY_MAX . ' characters.';
    }

    $displayName = astro_review_clean_text($body['displayName'] ?? '', false);
    $nameLength = astro_review_strlen($displayName);
    if ($nameLength < ASTRO_REVIEW_NAME_MIN || $nameLength > ASTRO_REVIEW_NAME_MAX) {
        $errors['displayName'] = 'Your display name must be ' . ASTRO_REVIEW_NAME_MIN . '–' . ASTRO_REVIEW_NAME_MAX . ' characters.';
    }

    $location = astro_review_clean_text($body['location'] ?? '', false);
    if (astro_review_strlen($location) > ASTRO_REVIEW_LOCATION_MAX) {
        $errors['location'] = 'Keep the location under ' . ASTRO_REVIEW_LOCATION_MAX . ' characters.';
    }

    foreach (['title' => $title, 'body' => $text, 'displayName' => $displayName, 'location' => $location] as $field => $value) {
        if (isset($errors[$field]) || $value === '') {
            continue;
        }
        if (astro_review_contains_link($value)) {
            $errors[$field] = 'Please remove links — reviews cannot contain web addresses.';
        } elseif (astro_review_contains_email($value)) {
            $errors[$field] = 'Please remove email addresses — reviews are public.';
        }
    }

    if (($body['consent'] ?? null) !== true) {
        $errors['consent'] = 'Please confirm the review is your own experience and may be published.';
    }

    return [
        'ok' => count($errors) === 0,
        'errors' => $errors,
        'value' => [
            'serviceCode' => $serviceCode,
            'rating' => (int) $rating,
            'title' => $title,
            'body' => $text,
            'displayName' => $displayName,
            'location' => $location,
        ],
    ];
}

/**
 * THE rule: may this order be reviewed? Paid (PAID mode, amount > 0, payment
 * confirmed), delivered (COMPLETED, or the legacy GENERATED) and not refunded.
 *
 * @return array{eligible:bool, code:string, message:string}
 */
function astro_review_order_eligibility(array $order): array
{
    $status = strtoupper(trim((string) ($order['status'] ?? '')));
    $refundStatus = strtoupper(trim((string) ($order['refund_status'] ?? '')));
    $mode = strtoupper(trim((string) ($order['service_mode'] ?? '')));

    if ($mode !== 'PAID' || (float) ($order['amount'] ?? 0) <= 0) {
        return ['eligible' => false, 'code' => 'NOT_A_PAID_ORDER', 'message' => 'Reviews can be written for paid orders.'];
    }
    if ((int) ($order['payment_confirmed'] ?? 0) !== 1) {
        return ['eligible' => false, 'code' => 'PAYMENT_NOT_CONFIRMED', 'message' => 'You can review this order once its payment has been confirmed.'];
    }
    if ($status === 'REFUNDED' || $refundStatus === 'REFUNDED') {
        return ['eligible' => false, 'code' => 'ORDER_REFUNDED', 'message' => 'Refunded orders cannot be reviewed.'];
    }
    if (!in_array($status, ['COMPLETED', 'GENERATED'], true)) {
        return ['eligible' => false, 'code' => 'NOT_DELIVERED', 'message' => 'You can review this order once your report has been delivered.'];
    }
    return ['eligible' => true, 'code' => 'ELIGIBLE', 'message' => ''];
}

/**
 * Will this order be reviewable once the delivery being sent succeeds? The
 * same rule as astro_review_order_eligibility(), applied to the order as the
 * delivery routes leave it: they refuse to email a paid order whose payment
 * is unverified, and a successful delivery sets status = COMPLETED and
 * payment_confirmed = 1 in the same request. Rejected, cancelled and refunded
 * orders are never invited; free-beta and zero-amount orders never qualify.
 */
function astro_review_invite_applies(array $order): bool
{
    $status = strtoupper(trim((string) ($order['status'] ?? '')));
    if (in_array($status, ['REJECTED', 'CANCELLED', 'REFUNDED'], true)) {
        return false;
    }
    $delivered = $order;
    $delivered['status'] = 'COMPLETED';
    $delivered['payment_confirmed'] = 1;
    return astro_review_order_eligibility($delivered)['eligible'];
}

/** The invitation link: the dashboard opens the review form for this order (after sign-in). */
function astro_review_invite_url(string $orderNumber): string
{
    return ASTRO_REVIEW_PUBLIC_ORIGIN . '/dashboard?review=' . rawurlencode($orderNumber);
}

/**
 * The "How was your report?" block of a delivery email, or '' when the order
 * cannot be reviewed. Inline styles only (mail clients drop <style> blocks),
 * in the maroon/gold palette of the delivery emails. $plural words it for a
 * delivery carrying several reports (family bundle, multi-person order).
 */
function astro_review_invite_email_html(array $order, bool $plural = false): string
{
    $orderNumber = trim((string) ($order['order_number'] ?? ''));
    if ($orderNumber === '' || !astro_review_invite_applies($order)) {
        return '';
    }
    $url = htmlspecialchars(astro_review_invite_url($orderNumber), ENT_QUOTES, 'UTF-8');
    $heading = $plural ? 'How were your reports?' : 'How was your report?';
    $button = $plural ? 'Rate your reports' : 'Rate your report';
    $object = $plural ? 'them' : 'it';
    return "<div style='border:1px solid #e8d9b8; border-left:4px solid #c9962c; border-radius:6px; padding:14px 16px; margin-bottom:18px; background:#fffaf0;'>"
        . "<div style='color:#7a1f1f; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;'>{$heading}</div>"
        . "<p style='color:#4b3d28; font-size:13px; line-height:1.7; margin:0 0 12px;'>Once you have read {$object}, please tell us honestly how we did. "
        . "Your review helps other families choose, and it appears on our website as a <strong>verified purchase</strong> after a quick check.</p>"
        . "<a href='{$url}' style='display:inline-block; background:#7a1f1f; color:#ffffff; text-decoration:none; font-weight:700; font-size:13px; padding:10px 18px; border-radius:6px;'>{$button}</a>"
        . "<div style='color:#8a7a55; font-size:11.5px; line-height:1.6; margin-top:8px;'>Opens your ASTRO SIVAM dashboard &mdash; sign in with the account you ordered with.</div>"
        . '</div>';
}

/** The reviewable services of an order: its service, or every service of a multi-person order. */
function astro_review_order_services(PDO $pdo, array $order): array
{
    $type = strtoupper(trim((string) ($order['service_type'] ?? '')));
    if ($type !== 'MULTI_PERSON') {
        return astro_review_is_service_code($type) ? [$type] : [];
    }
    try {
        $stmt = $pdo->prepare('SELECT DISTINCT service_code FROM order_items WHERE order_id = ?');
        $stmt->execute([(string) ($order['id'] ?? '')]);
        $found = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN, 0) as $code) {
            $found[strtoupper(trim((string) $code))] = true;
        }
        // Stable, catalogue order.
        return array_values(array_filter(
            array_keys(astro_review_service_routes()),
            static function ($code) use ($found) {
                return isset($found[$code]);
            }
        ));
    } catch (Throwable $e) {
        error_log('ASTRO SIVAM reviews: order items unavailable for ' . ($order['id'] ?? '?') . ' - ' . $e->getMessage());
        return [];
    }
}

/** Creates customer_reviews when an installation has not run migration 011. */
function astro_reviews_ensure_table(PDO $pdo): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    $columns = "
      `id` VARCHAR(64) NOT NULL PRIMARY KEY,
      `order_id` VARCHAR(64) NOT NULL,
      `user_id` VARCHAR(64) NOT NULL,
      `service_code` VARCHAR(64) NOT NULL,
      `rating` TINYINT UNSIGNED NOT NULL,
      `title` VARCHAR(191) NULL,
      `body` TEXT NOT NULL,
      `display_name` VARCHAR(100) NOT NULL,
      `location` VARCHAR(120) NULL,
      `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      `rejection_reason` VARCHAR(255) NULL,
      `moderated_by` VARCHAR(64) NULL,
      `moderated_at` DATETIME NULL,
      `published_at` DATETIME NULL,
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY `uq_customer_reviews_order_service` (`order_id`, `service_code`),
      INDEX `idx_customer_reviews_status_published` (`status`, `published_at`),
      INDEX `idx_customer_reviews_user` (`user_id`)";
    $foreignKeys = ",
      CONSTRAINT `fk_customer_reviews_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
      CONSTRAINT `fk_customer_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE";
    $suffix = ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    try {
        $pdo->exec('CREATE TABLE IF NOT EXISTS `customer_reviews` (' . $columns . $foreignKeys . $suffix);
    } catch (Throwable $e) {
        // Some shared hosts refuse the foreign keys (MyISAM parents, collation
        // drift). Every query here checks ownership itself, so the table is
        // still correct without them - retry once rather than lose reviews.
        error_log('ASTRO SIVAM reviews: creating customer_reviews without foreign keys - ' . $e->getMessage());
        $pdo->exec('CREATE TABLE IF NOT EXISTS `customer_reviews` (' . $columns . $suffix);
    }
    $ready = true;
}

function astro_review_new_id(): string
{
    return 'rev_' . bin2hex(random_bytes(10));
}

/** 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD' (null when absent). */
function astro_review_date($value): ?string
{
    return is_string($value) && preg_match('/^(\d{4}-\d{2}-\d{2})/', $value, $m) ? $m[1] : null;
}

function astro_review_nullable_text($value): ?string
{
    return is_string($value) && $value !== '' ? $value : null;
}

/** Public fields only: no order, account, email or exact timestamps. */
function astro_review_public_shape(array $row): array
{
    $code = (string) ($row['service_code'] ?? '');
    return [
        'id' => (string) $row['id'],
        'serviceCode' => $code,
        'serviceRoute' => astro_review_service_routes()[$code] ?? null,
        'rating' => (int) $row['rating'],
        'title' => astro_review_nullable_text($row['title'] ?? null),
        'body' => (string) $row['body'],
        'displayName' => (string) $row['display_name'],
        'location' => astro_review_nullable_text($row['location'] ?? null),
        'publishedAt' => astro_review_date($row['published_at'] ?? null) ?? astro_review_date($row['created_at'] ?? null),
        'verifiedPurchase' => true,
    ];
}

/** What the customer sees of their own review. */
function astro_review_owner_shape(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'orderId' => (string) $row['order_id'],
        'orderNumber' => astro_review_nullable_text($row['order_number'] ?? null),
        'serviceCode' => (string) $row['service_code'],
        'rating' => (int) $row['rating'],
        'title' => astro_review_nullable_text($row['title'] ?? null),
        'body' => (string) $row['body'],
        'displayName' => (string) $row['display_name'],
        'location' => astro_review_nullable_text($row['location'] ?? null),
        'status' => (string) $row['status'],
        'rejectionReason' => astro_review_nullable_text($row['rejection_reason'] ?? null),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => astro_review_nullable_text($row['updated_at'] ?? null),
        'publishedAt' => astro_review_nullable_text($row['published_at'] ?? null),
    ];
}

/** The moderation view: the review plus the order it is verified against. */
function astro_review_admin_shape(array $row): array
{
    return astro_review_owner_shape($row) + [
        'userId' => (string) $row['user_id'],
        'customerName' => astro_review_nullable_text($row['customer_name'] ?? null),
        'customerEmail' => astro_review_nullable_text($row['customer_email'] ?? null),
        'orderServiceType' => astro_review_nullable_text($row['order_service_type'] ?? null),
        'orderAmount' => isset($row['order_amount']) ? (float) $row['order_amount'] : null,
        'orderCurrency' => astro_review_nullable_text($row['order_currency'] ?? null),
        'orderStatus' => astro_review_nullable_text($row['order_status'] ?? null),
        'moderatedAt' => astro_review_nullable_text($row['moderated_at'] ?? null),
        'moderatedBy' => astro_review_nullable_text($row['moderated_by'] ?? null),
    ];
}

function astro_review_find_order(PDO $pdo, string $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, order_number, user_id, service_type, amount, currency, service_mode, status,
                payment_confirmed, refund_status, created_at
           FROM orders WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$orderId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function astro_review_fetch_admin_row(PDO $pdo, string $reviewId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT r.*, o.order_number, o.service_type AS order_service_type, o.amount AS order_amount,
                o.currency AS order_currency, o.status AS order_status,
                COALESCE(u.name, o.user_name) AS customer_name, COALESCE(u.email, o.user_email) AS customer_email
           FROM customer_reviews r
           LEFT JOIN orders o ON o.id = r.order_id
           LEFT JOIN users u ON u.id = r.user_id
          WHERE r.id = ? LIMIT 1'
    );
    $stmt->execute([$reviewId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * Published = approved by an administrator AND still attached to an order that
 * has not been refunded since (the eligibility rule applied at read time too).
 */
function astro_review_published_where(): string
{
    return "r.status = 'APPROVED' AND o.status <> 'REFUNDED' AND (o.refund_status IS NULL OR o.refund_status <> 'REFUNDED')";
}

// ---------------------------------------------------------------------------
// Route handlers. Each one answers through jsonResponse() (config.php), which
// exits; the routers require config.php, db.php and rate_limit.php first.
// ---------------------------------------------------------------------------

/** GET /api/services/reviews?limit=&service= */
function astro_reviews_route_public_list(PDO $pdo): void
{
    $rows = [];
    $count = 0;
    $total = 0;
    try {
        astro_reviews_ensure_table($pdo);
        $limit = (int) ($_GET['limit'] ?? ASTRO_REVIEW_PUBLIC_LIMIT_DEFAULT);
        $limit = max(1, min(ASTRO_REVIEW_PUBLIC_LIMIT_MAX, $limit));
        $where = astro_review_published_where();
        $params = [];
        $service = strtoupper(trim((string) ($_GET['service'] ?? '')));
        if (astro_review_is_service_code($service)) {
            $where .= ' AND r.service_code = ?';
            $params[] = $service;
        }
        // $limit is a clamped integer, so it is safe to inline (LIMIT cannot be
        // bound portably with emulated prepares off).
        $stmt = $pdo->prepare(
            "SELECT r.id, r.service_code, r.rating, r.title, r.body, r.display_name, r.location, r.published_at, r.created_at
               FROM customer_reviews r
               INNER JOIN orders o ON o.id = r.order_id
              WHERE {$where}
              ORDER BY r.published_at DESC, r.created_at DESC
              LIMIT {$limit}"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totals = $pdo->prepare(
            "SELECT COUNT(*) AS review_count, COALESCE(SUM(r.rating), 0) AS rating_total
               FROM customer_reviews r
               INNER JOIN orders o ON o.id = r.order_id
              WHERE {$where}"
        );
        $totals->execute($params);
        $sum = $totals->fetch(PDO::FETCH_ASSOC) ?: [];
        $count = (int) ($sum['review_count'] ?? 0);
        $total = (int) ($sum['rating_total'] ?? 0);
    } catch (Throwable $e) {
        error_log('ASTRO SIVAM reviews: public list failed - ' . $e->getMessage());
        jsonResponse(['success' => false, 'reviews' => [], 'message' => 'Reviews are temporarily unavailable.'], 503);
    }

    jsonResponse([
        'success' => true,
        'reviews' => array_map('astro_review_public_shape', $rows),
        'aggregate' => [
            'reviewCount' => $count,
            'ratingTotal' => $total,
            'ratingValue' => $count > 0 ? round($total / $count, 1) : null,
        ],
    ]);
}

/** POST /api/services/reviews - create, or edit, the review of one service of one order. */
function astro_reviews_route_submit(PDO $pdo, array $user, array $body): void
{
    astro_reviews_ensure_table($pdo);
    $userId = (string) ($user['id'] ?? '');
    astro_rate_limit_enforce(
        $pdo,
        'review-submit',
        $userId,
        ASTRO_REVIEW_SUBMIT_MAX_PER_WINDOW,
        ASTRO_REVIEW_SUBMIT_WINDOW_SECONDS,
        'Too many review submissions. Please try again later.'
    );

    $orderId = is_string($body['orderId'] ?? null) ? trim($body['orderId']) : '';
    if ($orderId === '' || strlen($orderId) > 64) {
        jsonResponse(['success' => false, 'code' => 'ORDER_REQUIRED', 'message' => 'Choose the order you want to review.'], 422);
    }
    $order = astro_review_find_order($pdo, $orderId);
    // Someone else's order answers exactly like a missing one.
    if (!$order || (string) $order['user_id'] !== $userId) {
        jsonResponse(['success' => false, 'code' => 'ORDER_NOT_FOUND', 'message' => 'Order not found.'], 404);
    }
    $eligibility = astro_review_order_eligibility($order);
    if (!$eligibility['eligible']) {
        jsonResponse(['success' => false, 'code' => $eligibility['code'], 'message' => $eligibility['message']], 403);
    }
    $services = astro_review_order_services($pdo, $order);
    if (count($services) === 0) {
        jsonResponse(['success' => false, 'code' => 'NO_REVIEWABLE_SERVICE', 'message' => 'This order has no service that can be reviewed.'], 403);
    }

    $validation = astro_review_validate_submission($body, $services);
    if (!$validation['ok']) {
        jsonResponse([
            'success' => false,
            'code' => 'INVALID_REVIEW',
            'message' => implode(' ', array_values($validation['errors'])),
            'errors' => $validation['errors'],
        ], 422);
    }
    $v = $validation['value'];
    $title = $v['title'] !== '' ? $v['title'] : null;
    $location = $v['location'] !== '' ? $v['location'] : null;

    $existingStmt = $pdo->prepare('SELECT id, status FROM customer_reviews WHERE order_id = ? AND service_code = ? LIMIT 1');
    $existingStmt->execute([$orderId, $v['serviceCode']]);
    $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;

    if ($existing) {
        $reviewId = (string) $existing['id'];
        $wasPublished = (string) $existing['status'] === 'APPROVED';
        // An edit is new content: it goes back to moderation and off the site.
        $pdo->prepare(
            "UPDATE customer_reviews
                SET rating = ?, title = ?, body = ?, display_name = ?, location = ?,
                    status = 'PENDING', published_at = NULL, moderated_at = NULL, moderated_by = NULL,
                    rejection_reason = NULL, updated_at = NOW()
              WHERE id = ? AND user_id = ?"
        )->execute([$v['rating'], $title, $v['body'], $v['displayName'], $location, $reviewId, $userId]);
        $message = $wasPublished
            ? 'Your review has been updated. It will reappear on the site once our team has checked the changes.'
            : 'Your review has been updated and is waiting for a quick check by our team.';
        $action = 'REVIEW_UPDATED';
        $status = 200;
    } else {
        $reviewId = astro_review_new_id();
        try {
            $pdo->prepare(
                "INSERT INTO customer_reviews
                    (id, order_id, user_id, service_code, rating, title, body, display_name, location, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())"
            )->execute([$reviewId, $orderId, $userId, $v['serviceCode'], $v['rating'], $title, $v['body'], $v['displayName'], $location]);
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                // A parallel submission for the same order + service won the race.
                jsonResponse(['success' => false, 'code' => 'REVIEW_EXISTS', 'message' => 'A review for this service of this order was just saved. Refresh the page to edit it.'], 409);
            }
            throw $e;
        }
        $message = 'Thank you! Your review has been received and will appear on astrosivam.com once our team has checked it.';
        $action = 'REVIEW_SUBMITTED';
        $status = 201;
    }

    logAudit(
        $pdo,
        $userId,
        (string) ($user['name'] ?? ''),
        (string) ($user['role'] ?? 'customer'),
        $action,
        'Review ' . $reviewId . ' (' . $v['rating'] . '/5, ' . $v['serviceCode'] . ') for order #' . $order['order_number']
    );

    $rowStmt = $pdo->prepare(
        'SELECT r.*, o.order_number FROM customer_reviews r LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = ? LIMIT 1'
    );
    $rowStmt->execute([$reviewId]);
    $row = $rowStmt->fetch(PDO::FETCH_ASSOC);

    jsonResponse(['success' => true, 'message' => $message, 'review' => astro_review_owner_shape($row)], $status);
}

/** GET /api/services/my-reviews - the customer's reviews and the orders they can review. */
function astro_reviews_route_mine(PDO $pdo, array $user): void
{
    astro_reviews_ensure_table($pdo);
    $userId = (string) ($user['id'] ?? '');

    $ordersStmt = $pdo->prepare(
        'SELECT id, order_number, user_id, service_type, amount, currency, service_mode, status,
                payment_confirmed, refund_status, created_at
           FROM orders WHERE user_id = ? ORDER BY created_at DESC'
    );
    $ordersStmt->execute([$userId]);
    $eligibleOrders = [];
    foreach ($ordersStmt->fetchAll(PDO::FETCH_ASSOC) as $order) {
        if (!astro_review_order_eligibility($order)['eligible']) {
            continue;
        }
        $services = astro_review_order_services($pdo, $order);
        if (count($services) > 0) {
            $eligibleOrders[] = [
                'orderId' => (string) $order['id'],
                'orderNumber' => (string) $order['order_number'],
                'services' => $services,
            ];
        }
    }

    $reviewsStmt = $pdo->prepare(
        'SELECT r.*, o.order_number FROM customer_reviews r LEFT JOIN orders o ON o.id = r.order_id
          WHERE r.user_id = ? ORDER BY r.created_at DESC'
    );
    $reviewsStmt->execute([$userId]);

    jsonResponse([
        'success' => true,
        'eligibleOrders' => $eligibleOrders,
        'reviews' => array_map('astro_review_owner_shape', $reviewsStmt->fetchAll(PDO::FETCH_ASSOC)),
    ]);
}

/** GET /api/admin/reviews?status=ALL|PENDING|APPROVED|REJECTED */
function astro_reviews_route_admin_list(PDO $pdo): void
{
    astro_reviews_ensure_table($pdo);
    $status = strtoupper(trim((string) ($_GET['status'] ?? 'ALL')));
    $where = '';
    $params = [];
    if (in_array($status, ['PENDING', 'APPROVED', 'REJECTED'], true)) {
        $where = 'WHERE r.status = ?';
        $params[] = $status;
    }
    $stmt = $pdo->prepare(
        "SELECT r.*, o.order_number, o.service_type AS order_service_type, o.amount AS order_amount,
                o.currency AS order_currency, o.status AS order_status,
                COALESCE(u.name, o.user_name) AS customer_name, COALESCE(u.email, o.user_email) AS customer_email
           FROM customer_reviews r
           LEFT JOIN orders o ON o.id = r.order_id
           LEFT JOIN users u ON u.id = r.user_id
           {$where}
          ORDER BY r.created_at DESC
          LIMIT 500"
    );
    $stmt->execute($params);

    $counts = ['PENDING' => 0, 'APPROVED' => 0, 'REJECTED' => 0, 'ALL' => 0];
    foreach ($pdo->query('SELECT status, COUNT(*) AS n FROM customer_reviews GROUP BY status')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $key = strtoupper((string) $row['status']);
        if (isset($counts[$key])) {
            $counts[$key] = (int) $row['n'];
        }
        $counts['ALL'] += (int) $row['n'];
    }

    jsonResponse([
        'success' => true,
        'reviews' => array_map('astro_review_admin_shape', $stmt->fetchAll(PDO::FETCH_ASSOC)),
        'counts' => $counts,
    ]);
}

/** POST /api/admin/reviews/:id/approve | /reject */
function astro_reviews_route_admin_moderate(PDO $pdo, array $admin, string $reviewId, string $decision, array $body): void
{
    astro_reviews_ensure_table($pdo);
    $decision = strtolower($decision);
    if (!in_array($decision, ['approve', 'reject'], true)) {
        jsonResponse(['success' => false, 'message' => 'Unknown moderation decision.'], 400);
    }
    $review = astro_review_fetch_admin_row($pdo, $reviewId);
    if (!$review) {
        jsonResponse(['success' => false, 'message' => 'Review not found.'], 404);
    }
    $adminId = (string) ($admin['id'] ?? '');

    if ($decision === 'approve') {
        // Publishing re-checks the order: a refund since submission revokes it.
        $order = astro_review_find_order($pdo, (string) $review['order_id']);
        $eligibility = $order
            ? astro_review_order_eligibility($order)
            : ['eligible' => false, 'code' => 'ORDER_NOT_FOUND', 'message' => 'The order for this review no longer exists.'];
        if (!$eligibility['eligible']) {
            jsonResponse([
                'success' => false,
                'code' => $eligibility['code'],
                'message' => 'This review cannot be published: ' . $eligibility['message'],
            ], 409);
        }
        // Re-approving keeps the original publication date (no fake freshness).
        $pdo->prepare(
            "UPDATE customer_reviews
                SET published_at = CASE WHEN status = 'APPROVED' AND published_at IS NOT NULL THEN published_at ELSE NOW() END,
                    status = 'APPROVED', moderated_at = NOW(), moderated_by = ?, rejection_reason = NULL
              WHERE id = ?"
        )->execute([$adminId, $reviewId]);
        $action = 'REVIEW_APPROVED';
        $message = 'Review published.';
    } else {
        $reason = astro_review_truncate(astro_review_clean_text($body['reason'] ?? '', false), ASTRO_REVIEW_REASON_MAX);
        $pdo->prepare(
            "UPDATE customer_reviews
                SET status = 'REJECTED', published_at = NULL, moderated_at = NOW(), moderated_by = ?, rejection_reason = ?
              WHERE id = ?"
        )->execute([$adminId, $reason !== '' ? $reason : null, $reviewId]);
        $action = 'REVIEW_REJECTED';
        $message = 'Review hidden from the site.';
    }

    logAudit(
        $pdo,
        $adminId,
        (string) ($admin['name'] ?? ''),
        'admin',
        $action,
        'Review ' . $reviewId . ' for order #' . ($review['order_number'] ?? '?') . ' (' . $review['service_code'] . ', ' . (int) $review['rating'] . '/5)'
    );

    jsonResponse(['success' => true, 'message' => $message, 'review' => astro_review_admin_shape(astro_review_fetch_admin_row($pdo, $reviewId))]);
}

/** DELETE /api/admin/reviews/:id */
function astro_reviews_route_admin_delete(PDO $pdo, array $admin, string $reviewId): void
{
    astro_reviews_ensure_table($pdo);
    $review = astro_review_fetch_admin_row($pdo, $reviewId);
    if (!$review) {
        jsonResponse(['success' => false, 'message' => 'Review not found.'], 404);
    }
    $pdo->prepare('DELETE FROM customer_reviews WHERE id = ?')->execute([$reviewId]);
    logAudit(
        $pdo,
        (string) ($admin['id'] ?? ''),
        (string) ($admin['name'] ?? ''),
        'admin',
        'REVIEW_DELETED',
        'Review ' . $reviewId . ' for order #' . ($review['order_number'] ?? '?') . ' deleted'
    );
    jsonResponse(['success' => true, 'message' => 'Review deleted.']);
}
