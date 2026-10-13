<?php
/**
 * ASTRO SIVAM — Refund policy engine (the single source of truth).
 *
 * THE POLICY (mirrored word-for-word in the customer-facing Refund &
 * Cancellation page, src/pages/PoliciesPage.tsx, and summarised in the admin
 * Setup Checklist):
 *
 *   1. BEFORE ADMIN APPROVAL — the order is still a queued calculation: no PDF
 *      report has been generated and nothing has been emailed. The customer may
 *      cancel and is refunded 90% of the amount paid. The 10% that is retained
 *      is the non-refundable payment-gateway / processing fee we are charged
 *      even when an order is refunded.
 *   2. AFTER ADMIN APPROVAL — the personalised PDF report and tax invoice have
 *      been generated and emailed, so the order IS the delivered digital
 *      product: completed and NOT refundable. process-refund refuses it with
 *      HTTP 409 instead of silently refunding a delivered order.
 *   3. SETTLEMENT TIME — 3 working days (Monday–Friday, public holidays
 *      excluded) counted from the moment the admin approves the refund. The
 *      money is returned to the original payment method in the original
 *      currency.
 *
 * The admin refund is ONE CLICK: the percent, the amount and the settlement
 * deadline are computed here, so the portal never has to ask the administrator
 * to type an amount (a mistyped amount is a real money bug).
 *
 * WHY A SHARED FILE: the percent and the working-day count are quoted to
 * customers and used by the admin API. Keeping both numbers in one place means
 * a future policy change cannot desynchronise the page from the money path.
 * tests/refund-policy-contract.test.ts pins this file, the admin handler and
 * the customer-facing page together.
 */

if (!defined('ASTRO_REFUND_PERCENT_PRE_APPROVAL')) {
    /** Percentage of the amount paid that a pre-approval cancellation refunds. */
    define('ASTRO_REFUND_PERCENT_PRE_APPROVAL', 90.0);
}

if (!defined('ASTRO_REFUND_WORKING_DAYS')) {
    /** Working days the customer is told to allow for the money to arrive. */
    define('ASTRO_REFUND_WORKING_DAYS', 3);
}

/**
 * Public holidays that are NOT working days. Extend this list for a specific
 * year from the cPanel cron/one-off script, or leave empty to skip only
 * Saturdays and Sundays. Dates are 'YYYY-MM-DD' in the server timezone.
 */
if (!defined('ASTRO_REFUND_HOLIDAYS')) {
    define('ASTRO_REFUND_HOLIDAYS', '');
}

/**
 * Order states where the report + invoice have been generated and emailed to
 * the customer. These are the DELIVERED states: approval has happened, so the
 * order is completed and outside the refund policy.
 *
 * Kept as words (not an enum) because older databases still hold 'APPROVED'
 * rows from before the status vocabulary settled on PENDING/PROCESSING/
 * COMPLETED.
 */
function astro_refund_delivered_statuses() {
    return array('APPROVED', 'GENERATED', 'PROCESSING', 'COMPLETED');
}

/** True when the admin has approved the order (report generated / emailed). */
function astro_refund_status_is_delivered($status) {
    return in_array(strtoupper(trim((string) $status)), astro_refund_delivered_statuses(), true);
}

/** True when this order has already been refunded (nothing left to do). */
function astro_refund_is_already_refunded($order) {
    if (!is_array($order)) {
        return false;
    }
    $refundStatus = strtoupper(trim((string) ($order['refund_status'] ?? 'NONE')));
    $status = strtoupper(trim((string) ($order['status'] ?? '')));
    return $refundStatus === 'REFUNDED' || $status === 'REFUNDED';
}

/**
 * The refund percentage that applies to one order right now.
 * 90% before approval (the policy), 0% once approved/delivered.
 */
function astro_refund_percent_for_order($order) {
    if (astro_refund_status_is_delivered(is_array($order) ? ($order['status'] ?? '') : $order)) {
        return 0.0;
    }
    return (float) ASTRO_REFUND_PERCENT_PRE_APPROVAL;
}

/** The retained gateway/processing share of the refund (the other 10%). */
function astro_refund_retained_percent() {
    return round(100.0 - (float) ASTRO_REFUND_PERCENT_PRE_APPROVAL, 2);
}

/**
 * Refund amount for one order: the paid amount at the policy percentage,
 * rounded to cents the way the customer's invoice is rounded.
 */
function astro_refund_amount_for_order($order) {
    $amount = is_array($order) ? (float) ($order['amount'] ?? 0) : (float) $order;
    $percent = astro_refund_percent_for_order($order);
    if ($amount <= 0 || $percent <= 0) {
        return 0.0;
    }
    return round($amount * $percent / 100, 2);
}

/** Holiday list as a lookup map. */
function astro_refund_holiday_map() {
    $map = array();
    $raw = (string) ASTRO_REFUND_HOLIDAYS;
    if ($raw === '') {
        return $map;
    }
    foreach (preg_split('/[^0-9\-]+/', $raw) as $date) {
        if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $map[$date] = true;
        }
    }
    return $map;
}

/** True when a date is a working day (Mon–Fri and not a listed holiday). */
function astro_refund_is_working_day(DateTimeInterface $date) {
    $dow = (int) $date->format('N'); // 1 = Monday ... 7 = Sunday
    if ($dow > 5) {
        return false;
    }
    $map = astro_refund_holiday_map();
    return !isset($map[$date->format('Y-m-d')]);
}

/**
 * The settlement deadline: N working days after the refund is approved.
 * Weekends and listed holidays do not count, which is what "3 working days"
 * means to the customer.
 *
 * @param int                     $workingDays how many working days to add
 * @param DateTimeInterface|null  $from        starting instant (default: now)
 * @return DateTimeImmutable
 */
function astro_refund_settle_deadline($workingDays = ASTRO_REFUND_WORKING_DAYS, $from = null) {
    $cursor = $from instanceof DateTimeInterface
        ? new DateTimeImmutable($from->format('Y-m-d H:i:s'))
        : new DateTimeImmutable('now');
    $remaining = max(1, (int) $workingDays);
    // Guard the loop: a pathological holiday list must not hang a request.
    $maxHops = ($remaining * 3) + 30;
    $hops = 0;
    while ($remaining > 0 && $hops < $maxHops) {
        $cursor = $cursor->add(new DateInterval('P1D'));
        $hops++;
        if (astro_refund_is_working_day($cursor)) {
            $remaining--;
        }
    }
    return $cursor;
}

/** 'YYYY-MM-DD HH:MM:SS' for the refund_deadline column. */
function astro_refund_settle_deadline_sql($workingDays = ASTRO_REFUND_WORKING_DAYS, $from = null) {
    return astro_refund_settle_deadline($workingDays, $from)->format('Y-m-d H:i:s');
}

/** Human label the admin portal and the customer email both show. */
function astro_refund_settle_deadline_label($deadline = null) {
    if ($deadline === null || $deadline === '') {
        $date = astro_refund_settle_deadline();
    } else {
        $date = $deadline instanceof DateTimeInterface
            ? $deadline
            : new DateTimeImmutable((string) $deadline);
    }
    return $date->format('d M Y');
}

/**
 * ---------------------------------------------------------------------------
 * AUTOMATIC REFUNDS — provider request/response shapes (pure, testable)
 * ---------------------------------------------------------------------------
 *
 * The one-click refund in the Admin Portal really returns money for payments
 * this server captured online. The wire format is decided HERE, in the policy
 * module, so the admin handler, the tests and any future caller speak to the
 * provider the same way:
 *
 *   Razorpay  POST /v1/payments/{payment_id}/refund   (amount in minor units)
 *   PayPal    POST /v2/payments/captures/{capture_id}/refund
 *
 * These helpers are pure: no database, no HTTP. api/payments.php performs the
 * call and feeds the response back through astro_refund_gateway_result().
 */

/** Minor units (paise) as Razorpay expects them. */
function astro_refund_minor_units($amount) {
    return (int) round(round((float) $amount, 2) * 100);
}

/** True when an intent holds money a provider can actually return. */
function astro_refund_intent_is_refundable($intent) {
    if (!is_array($intent)) {
        return false;
    }
    $status = strtoupper(trim((string) ($intent['status'] ?? '')));
    $captureId = trim((string) ($intent['gateway_payment_id'] ?? ''));
    $provider = strtolower(trim((string) ($intent['provider'] ?? '')));
    return $captureId !== ''
        && in_array($provider, array('razorpay', 'paypal'), true)
        && in_array($status, array('CAPTURED', 'PAID', 'COMPLETED'), true);
}

/**
 * Build the provider refund request. Returns null when the intent has no online
 * capture to reverse, so callers fall back to a manual settlement.
 *
 * @return array|null{provider:string,url:string,headers:array,body:array|string,basicUser:?string,basicPassword:?string,requestId:string}
 */
function astro_refund_gateway_request($intent, $amount, $currency, $requestId, $config, $intentId = '') {
    if (!astro_refund_intent_is_refundable($intent)) {
        return null;
    }
    $amount = round((float) $amount, 2);
    if ($amount <= 0) {
        return null;
    }
    $currency = strtoupper(trim((string) $currency));
    $captureId = trim((string) $intent['gateway_payment_id']);
    $provider = strtolower(trim((string) $intent['provider']));
    $intentId = $intentId !== '' ? $intentId : (string) ($intent['id'] ?? '');
    $requestId = trim((string) $requestId);
    if ($requestId === '') {
        $requestId = 'refund-' . ($intentId !== '' ? $intentId : $captureId);
    }

    if ($provider === 'razorpay') {
        return array(
            'provider' => 'razorpay',
            'url' => 'https://api.razorpay.com/v1/payments/' . rawurlencode($captureId) . '/refund',
            'headers' => array('Content-Type: application/json'),
            'body' => array(
                'amount' => astro_refund_minor_units($amount),
                'speed' => 'normal',
                // Deterministic provider-side receipt: the same click can never
                // turn into two refunds.
                'receipt' => $requestId,
                'notes' => array(
                    'intent_id' => $intentId,
                    'policy' => 'pre-approval refund',
                    'source' => 'astrosivam_admin_one_click'
                )
            ),
            'basicUser' => (string) ($config['razorpay']['key_id'] ?? ''),
            'basicPassword' => (string) ($config['razorpay']['key_secret'] ?? ''),
            'requestId' => $requestId
        );
    }

    if ($provider === 'paypal') {
        $base = rtrim((string) ($config['paypal']['base_url'] ?? 'https://api-m.paypal.com'), '/');
        return array(
            'provider' => 'paypal',
            'url' => $base . '/v2/payments/captures/' . rawurlencode($captureId) . '/refund',
            'headers' => array(
                'Content-Type: application/json',
                'Accept: application/json',
                // PayPal replays the original refund for a repeated request id
                // instead of refunding twice.
                'PayPal-Request-Id: ' . $requestId
            ),
            'body' => array(
                'amount' => array(
                    'value' => number_format($amount, 2, '.', ''),
                    'currency_code' => $currency !== '' ? $currency : 'USD'
                ),
                'note_to_payer' => 'ASTRO SIVAM refund of ' . number_format($amount, 2) . ' ' . ($currency !== '' ? $currency : 'USD')
            ),
            'basicUser' => null,
            'basicPassword' => null,
            'requestId' => $requestId
        );
    }

    return null;
}

/**
 * Interpret a provider refund response.
 *
 * @return array{ok:bool,reference:string,status:string,message:string}
 */
function astro_refund_gateway_result($provider, $httpStatus, $body, $amount, $currency) {
    $amount = round((float) $amount, 2);
    $currency = strtoupper(trim((string) $currency));
    $httpStatus = (int) $httpStatus;
    $body = is_array($body) ? $body : array();
    $reference = (string) ($body['id'] ?? '');
    $ok = $httpStatus >= 200 && $httpStatus < 300 && $reference !== '';

    if (!$ok) {
        $reason = (string) ($body['error']['description'] ?? $body['error']['reason'] ?? $body['message'] ?? $body['name'] ?? 'no reason given');
        return array(
            'ok' => false,
            'reference' => $reference,
            'status' => 'FAILED',
            'message' => ucfirst((string) $provider) . ' refused the refund (' . $httpStatus . '): ' . $reason
                . '. Nothing was marked as refunded — retry from the portal.'
        );
    }

    return array(
        'ok' => true,
        'reference' => $reference,
        'status' => strtoupper((string) ($body['status'] ?? ($provider === 'paypal' ? 'COMPLETED' : 'PROCESSED'))),
        'message' => ucfirst((string) $provider) . ' refund ' . $reference . ' issued for '
            . ($currency !== '' ? $currency : 'USD') . ' ' . number_format($amount, 2) . '.'
    );
}

/** Money formatting shared by the admin toast and the customer email. */
function astro_refund_money($amount, $currency) {
    $currency = $currency !== null && $currency !== ''
        ? strtoupper((string) $currency)
        : (defined('DEFAULT_CURRENCY') ? DEFAULT_CURRENCY : 'USD');
    return $currency . ' ' . number_format((float) $amount, 2, '.', ',');
}

/** The policy sentence stored on the order as refund_reason. */
function astro_refund_policy_reason($order) {
    $percent = astro_refund_percent_for_order($order);
    $percentLabel = rtrim(rtrim(number_format($percent, 2, '.', ''), '0'), '.');
    $retained = rtrim(rtrim(number_format(astro_refund_retained_percent(), 2, '.', ''), '0'), '.');
    return 'Pre-approval cancellation refund: ' . $percentLabel . '% of the amount paid refunded; '
        . $retained . '% retained as the non-refundable payment gateway/processing fee. '
        . 'Policy: orders are non-refundable once approved and the PDF report has been emailed.';
}

/** The default note recorded when the admin uses the one-click refund button. */
function astro_refund_one_click_note() {
    return 'One-click pre-approval refund approved from the Admin Portal (90% refund, 3 working days settlement).';
}

/** Admin override note (a refund deliberately outside the standard policy). */
function astro_refund_override_note($percent) {
    return 'Manual refund approved by administrator at ' . rtrim(rtrim(number_format((float) $percent, 2, '.', ''), '0'), '.') . '%.';
}

/**
 * Customer-facing refund confirmation email.
 * Plain inline HTML on purpose: it must render in Gmail, Outlook and every
 * Indian mobile mail client the same way the approval emails do.
 */
function astro_refund_customer_email_html($order, $refund) {
    $name = htmlspecialchars((string) ($order['user_name'] ?? 'Devotee'), ENT_QUOTES, 'UTF-8');
    $orderNumber = htmlspecialchars((string) ($order['order_number'] ?? $order['id'] ?? ''), ENT_QUOTES, 'UTF-8');
    $amount = htmlspecialchars(astro_refund_money($refund['amount'], $refund['currency']), ENT_QUOTES, 'UTF-8');
    $paid = htmlspecialchars(astro_refund_money($refund['amountPaid'], $refund['currency']), ENT_QUOTES, 'UTF-8');
    $fee = htmlspecialchars(astro_refund_money($refund['feeRetained'], $refund['currency']), ENT_QUOTES, 'UTF-8');
    $percent = rtrim(rtrim(number_format((float) $refund['percent'], 2, '.', ''), '0'), '.');
    $deadline = htmlspecialchars((string) $refund['deadlineLabel'], ENT_QUOTES, 'UTF-8');
    $workingDays = (int) $refund['workingDays'];
    $method = htmlspecialchars(strtoupper(str_replace('_', ' ', (string) ($order['payment_method'] ?? 'original payment method'))), ENT_QUOTES, 'UTF-8');
    $reference = htmlspecialchars((string) ($order['payment_reference'] ?? ''), ENT_QUOTES, 'UTF-8');
    $bundleSize = (int) ($refund['bundleSize'] ?? 1);
    $bundleLine = $bundleSize > 1
        ? "<p style='margin:0 0 12px;'>This refund covers all <strong>" . $bundleSize . " charts</strong> in your family bundle, which was cancelled as a whole before approval.</p>"
        : '';

    return "<!DOCTYPE html><html><body style='margin:0; padding:24px 12px; background:#f6f1e6; font-family:Segoe UI, Arial, sans-serif; color:#3b2f1c;'>"
        . "<div style='max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e8d9b8; border-radius:10px; overflow:hidden;'>"
        . "<div style='background:#7a1f1f; padding:18px 24px; color:#f7e9c8;'>"
        . "<div style='font-size:17px; font-weight:700;'>ASTRO SIVAM</div>"
        . "<div style='font-size:12px; color:#e9cfa0; margin-top:2px;'>Refund approved for order #" . $orderNumber . "</div>"
        . "</div>"
        . "<div style='padding:22px 24px; font-size:13.5px; line-height:1.7;'>"
        . "<p style='margin:0 0 12px;'>Dear " . $name . ",</p>"
        . "<p style='margin:0 0 12px;'>Your cancellation refund for order <strong>#" . $orderNumber . "</strong> has been approved. "
        . "As the order was cancelled <strong>before</strong> our scholars approved and generated your personalised PDF report, "
        . "the " . $percent . "% pre-approval refund applies.</p>"
        . $bundleLine
        . "<table style='width:100%; border-collapse:collapse; margin:0 0 14px; font-size:13px;'>"
        . "<tr><td style='padding:7px 0; border-bottom:1px solid #efe6d3;'>Amount paid</td><td style='padding:7px 0; border-bottom:1px solid #efe6d3; text-align:right; font-weight:700;'>" . $paid . "</td></tr>"
        . "<tr><td style='padding:7px 0; border-bottom:1px solid #efe6d3;'>Refund approved</td><td style='padding:7px 0; border-bottom:1px solid #efe6d3; text-align:right; font-weight:700; color:#1c7a4a;'>" . $amount . " (" . $percent . "%)</td></tr>"
        . "<tr><td style='padding:7px 0; border-bottom:1px solid #efe6d3;'>Non-refundable gateway fee</td><td style='padding:7px 0; border-bottom:1px solid #efe6d3; text-align:right;'>" . $fee . "</td></tr>"
        . "<tr><td style='padding:7px 0;'>Refunded to</td><td style='padding:7px 0; text-align:right;'>" . $method . ($reference !== '' ? " (" . $reference . ")" : "") . "</td></tr>"
        . "</table>"
        . "<p style='margin:0 0 12px;'>The money is returned to your original payment method within <strong>" . $workingDays . " working days</strong> "
        . "(Monday to Friday, public holidays excluded) &mdash; expected on or before <strong>" . $deadline . "</strong>. "
        . "Your bank or wallet may take a further day to display the credit.</p>"
        . "<p style='margin:0 0 12px; color:#6b5c3e; font-size:12.5px;'>If you still wish to receive your report, reply to this email or write to "
        . "<a href='mailto:admin@astrosivam.com' style='color:#7a1f1f;'>admin@astrosivam.com</a> and our team will raise a fresh order for you.</p>"
        . "<p style='margin:16px 0 0;'>Blessings &amp; Warm Regards,<br/><strong>ASTRO SIVAM Team</strong></p>"
        . "</div>"
        . "<div style='background:#faf3e3; border-top:1px solid #e8d9b8; padding:14px 24px; text-align:center; color:#a67c1f; font-size:11.5px;'>"
        . "astrosivam.com &bull; admin@astrosivam.com"
        . "</div>"
        . "</div></body></html>";
}
