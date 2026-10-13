<?php
/**
 * Refund policy probe — runs INSIDE PHP-WASM (see scripts/php-refund-policy-check.mjs).
 *
 * Two jobs:
 *   1. PARSE every PHP file the refund path touches with token_get_all(TOKEN_PARSE),
 *      i.e. a real syntax check of files that cannot be included on their own.
 *   2. EXECUTE api/refunds.php and assert the policy arithmetic: 90% of the paid
 *      amount, 3 working days with weekends/holidays skipped, refusal after
 *      approval, and the customer email that quotes both numbers.
 *
 * Results are written to /repo/out.json for the Node side to assert on.
 */

$root = getenv('REPO_ROOT') ?: '/repo';
$checks = array();
$syntax = array();

// Pin a known public holiday so the working-day arithmetic is exercised with
// holidays as well as weekends (api/refunds.php honours a pre-defined list).
if (!defined('ASTRO_REFUND_HOLIDAYS')) {
    define('ASTRO_REFUND_HOLIDAYS', '2026-12-25');
}

require_once $root . '/api/refunds.php';

function probe_check(&$checks, $name, $ok, $detail = '') {
    $checks[] = array('name' => $name, 'ok' => (bool) $ok, 'detail' => (string) $detail);
}

// ---------------------------------------------------------------- syntax ----
foreach (array(
    'api/refunds.php',
    'api/admin/index.php',
    'api/admin/orders.php',
    'api/db.php',
    'api/services/index.php',
    'api/payments.php',
) as $relative) {
    $path = $root . '/' . $relative;
    $ok = true;
    $message = '';
    if (!is_file($path)) {
        $ok = false;
        $message = 'file not mounted';
    } else {
        try {
            // TOKEN_PARSE turns the tokenizer into a real parser: it throws a
            // ParseError on a syntax error, which is what `php -l` reports.
            token_get_all(file_get_contents($path), TOKEN_PARSE);
        } catch (Throwable $e) {
            $ok = false;
            $message = $e->getMessage();
        }
    }
    $syntax[$relative] = array('ok' => $ok, 'message' => $message);
}

// ---------------------------------------------------------------- policy ----
probe_check($checks, 'pre-approval percentage is 90', ASTRO_REFUND_PERCENT_PRE_APPROVAL === 90.0, (string) ASTRO_REFUND_PERCENT_PRE_APPROVAL);
probe_check($checks, 'settlement window is 3 working days', ASTRO_REFUND_WORKING_DAYS === 3, (string) ASTRO_REFUND_WORKING_DAYS);
probe_check($checks, 'the retained share is the other 10%', astro_refund_retained_percent() === 10.0, (string) astro_refund_retained_percent());

// Delivered (approved) orders are outside the policy.
foreach (array('COMPLETED', 'PROCESSING', 'GENERATED', 'APPROVED') as $status) {
    probe_check($checks, $status . ' counts as delivered/approved', astro_refund_status_is_delivered($status));
}
foreach (array('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION', 'CANCELLED') as $status) {
    probe_check($checks, $status . ' is still pre-approval', !astro_refund_status_is_delivered($status));
}

// Money: 90% of what was paid, and 0 once approved.
$preApprovalOrder = array('status' => 'PENDING', 'amount' => 100.00, 'currency' => 'USD');
$deliveredOrder = array('status' => 'COMPLETED', 'amount' => 100.00, 'currency' => 'USD');
probe_check($checks, 'a $100.00 pre-approval order refunds $90.00', astro_refund_amount_for_order($preApprovalOrder) === 90.00, (string) astro_refund_amount_for_order($preApprovalOrder));
probe_check($checks, 'a $100.00 approved order refunds $0.00', astro_refund_amount_for_order($deliveredOrder) === 0.00, (string) astro_refund_amount_for_order($deliveredOrder));
$oddOrder = array('status' => 'PENDING', 'amount' => 12.34, 'currency' => 'USD');
probe_check($checks, '12.34 at 90% rounds to 11.11', astro_refund_amount_for_order($oddOrder) === 11.11, (string) astro_refund_amount_for_order($oddOrder));
probe_check($checks, 'money is formatted with the order currency', astro_refund_money(11.11, 'USD') === 'USD 11.11', astro_refund_money(11.11, 'USD'));

// Working days: a Wednesday + 3 working days lands on Monday (the weekend is skipped).
$wednesday = new DateTimeImmutable('2026-10-14 12:00:00'); // Wed
$friday = new DateTimeImmutable('2026-10-16 12:00:00');    // Fri
probe_check(
    $checks,
    'Wed 14 Oct 2026 + 3 working days = Mon 19 Oct 2026',
    astro_refund_settle_deadline(3, $wednesday)->format('Y-m-d') === '2026-10-19',
    astro_refund_settle_deadline(3, $wednesday)->format('Y-m-d H:i:s')
);
probe_check(
    $checks,
    'Fri 16 Oct 2026 + 3 working days = Wed 21 Oct 2026',
    astro_refund_settle_deadline(3, $friday)->format('Y-m-d') === '2026-10-21',
    astro_refund_settle_deadline(3, $friday)->format('Y-m-d H:i:s')
);
probe_check(
    $checks,
    'the settlement keeps the time of day',
    astro_refund_settle_deadline(3, $wednesday)->format('H:i:s') === '12:00:00',
    astro_refund_settle_deadline(3, $wednesday)->format('H:i:s')
);
probe_check(
    $checks,
    'the deadline is quoted to the customer as a readable date',
    astro_refund_settle_deadline_label('2026-10-19 12:00:00') === '19 Oct 2026',
    astro_refund_settle_deadline_label('2026-10-19 12:00:00')
);

// Public holidays are not working days either.
probe_check($checks, 'a listed public holiday is not a working day', !astro_refund_is_working_day(new DateTimeImmutable('2026-12-25')));
probe_check($checks, 'an ordinary weekday is a working day', astro_refund_is_working_day(new DateTimeImmutable('2026-12-24')));
probe_check($checks, 'a Saturday is not a working day', !astro_refund_is_working_day(new DateTimeImmutable('2026-12-26')));
$christmasEve = new DateTimeImmutable('2026-12-23 09:00:00'); // Wed, with Fri 25 Dec a holiday
probe_check(
    $checks,
    'Wed 23 Dec 2026 + 3 working days skips the 25 Dec holiday = Tue 29 Dec 2026',
    astro_refund_settle_deadline(3, $christmasEve)->format('Y-m-d') === '2026-12-29',
    astro_refund_settle_deadline(3, $christmasEve)->format('Y-m-d')
);

// The customer email must carry the amount, the percent and the 3-working-day promise.
$emailOrder = array(
    'user_name' => 'Priya',
    'order_number' => 'ASTRO-1234',
    'payment_method' => 'PAYPAL',
    'payment_reference' => 'PAYPAL-ONL-abc12345',
);
$email = astro_refund_customer_email_html($emailOrder, array(
    'amount' => 90.00,
    'amountPaid' => 100.00,
    'feeRetained' => 10.00,
    'percent' => 90.0,
    'currency' => 'USD',
    'workingDays' => 3,
    'deadlineLabel' => '19 Oct 2026',
    'bundleSize' => 1,
));
probe_check($checks, 'refund email names the order', strpos($email, 'ASTRO-1234') !== false);
probe_check($checks, 'refund email states the refunded amount', strpos($email, 'USD 90.00') !== false);
probe_check($checks, 'refund email states the 90% basis', strpos($email, '90%') !== false);
probe_check($checks, 'refund email promises 3 working days', strpos($email, '3 working days') !== false);
probe_check($checks, 'refund email names the settlement date', strpos($email, '19 Oct 2026') !== false);
probe_check($checks, 'refund email tells the customer the refund path', strpos($email, 'admin@astrosivam.com') !== false);
$bundleEmail = astro_refund_customer_email_html($emailOrder, array(
    'amount' => 90.00,
    'amountPaid' => 100.00,
    'feeRetained' => 10.00,
    'percent' => 90.0,
    'currency' => 'USD',
    'workingDays' => 3,
    'deadlineLabel' => '19 Oct 2026',
    'bundleSize' => 3,
));
probe_check($checks, 'a family bundle email says how many charts were refunded', strpos($bundleEmail, '3 charts') !== false);
probe_check($checks, 'a single-order email carries no bundle line', strpos($email, 'charts in your family bundle') === false);

// The policy sentence stored on the order must quote both numbers.
$reason = astro_refund_policy_reason($preApprovalOrder);
probe_check($checks, 'the stored reason quotes 90% and the 10% fee', strpos($reason, '90%') !== false && strpos($reason, '10%') !== false, $reason);

// ------------------------------------------------- automatic gateway refund ----
// The one-click refund must really return money for payments captured online.
// These assertions execute the pure request/response builders that
// api/payments.php uses for the provider calls (no network, no database).
$config = array(
    'razorpay' => array('configured' => true, 'key_id' => 'rzp_test_key', 'key_secret' => 'rzp_test_secret'),
    'paypal' => array('configured' => true, 'base_url' => 'https://api-m.sandbox.paypal.com', 'client_id' => 'cid', 'client_secret' => 'csecret')
);

$capturedPaypal = array(
    'id' => 'pi_paypal_1', 'provider' => 'paypal', 'status' => 'CAPTURED',
    'amount' => 100.00, 'currency' => 'USD', 'gateway_payment_id' => 'CAPTURE-9'
);
$capturedRazorpay = array(
    'id' => 'pi_rzp_1', 'provider' => 'razorpay', 'status' => 'CAPTURED',
    'amount' => 100.00, 'currency' => 'INR', 'gateway_payment_id' => 'pay_9'
);
$offlineIntent = array(
    'id' => 'pi_offline_1', 'provider' => 'manual', 'status' => 'VERIFIED_MANUAL',
    'amount' => 100.00, 'currency' => 'USD', 'gateway_payment_id' => ''
);

probe_check($checks, 'only a captured online payment is auto-refundable',
    astro_refund_intent_is_refundable($capturedPaypal)
    && astro_refund_intent_is_refundable($capturedRazorpay)
    && !astro_refund_intent_is_refundable($offlineIntent)
    && !astro_refund_intent_is_refundable(array_merge($capturedPaypal, array('status' => 'CREATED'))));

$paypalRequest = astro_refund_gateway_request($capturedPaypal, 90.00, 'USD', 'refund-ord-1', $config);
probe_check($checks, 'PayPal refunds hit the captures endpoint for the capture id',
    is_array($paypalRequest)
    && $paypalRequest['url'] === 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE-9/refund'
    && $paypalRequest['body']['amount']['value'] === '90.00'
    && $paypalRequest['body']['amount']['currency_code'] === 'USD');
probe_check($checks, 'PayPal refunds carry a deterministic idempotency request id',
    in_array('PayPal-Request-Id: refund-ord-1', $paypalRequest['headers'], true));

$paypalVerdict = astro_refund_gateway_result('paypal', 201, array('id' => 'REFUND-1', 'status' => 'COMPLETED'), 90.00, 'USD');
probe_check($checks, 'a PayPal refund response yields the provider refund id',
    $paypalVerdict['ok'] && $paypalVerdict['reference'] === 'REFUND-1' && strpos($paypalVerdict['message'], 'REFUND-1') !== false);

$rzpRequest = astro_refund_gateway_request($capturedRazorpay, 11.11, 'INR', 'refund-ord-2', $config);
probe_check($checks, 'Razorpay refunds are sent in minor units to the payments endpoint',
    is_array($rzpRequest)
    && $rzpRequest['url'] === 'https://api.razorpay.com/v1/payments/pay_9/refund'
    && $rzpRequest['body']['amount'] === 1111
    && $rzpRequest['basicUser'] === 'rzp_test_key'
    && $rzpRequest['body']['receipt'] === 'refund-ord-2');

$refused = astro_refund_gateway_result('rizp', 400, array('error' => array('description' => 'Payment has already been refunded')), 90.00, 'USD');
probe_check($checks, 'a refused refund reports failure and promises no state change',
    !$refused['ok'] && strpos($refused['message'], 'Nothing was marked as refunded') !== false, $refused['message']);

probe_check($checks, 'an offline payment has no provider request (manual settlement)',
    astro_refund_gateway_request($offlineIntent, 90.00, 'USD', 'refund-ord-3', $config) === null);
probe_check($checks, 'a zero amount is never sent to a provider',
    astro_refund_gateway_request($capturedPaypal, 0.0, 'USD', 'refund-ord-4', $config) === null
    && astro_refund_minor_units(11.11) === 1111);

$failed = 0;
foreach ($checks as $check) {
    if (!$check['ok']) {
        $failed++;
    }
}
foreach ($syntax as $file => $info) {
    if (!$info['ok']) {
        $failed++;
    }
}

file_put_contents('/repo/out.json', json_encode(array(
    'checks' => $checks,
    'syntax' => $syntax,
    'failed' => $failed,
), JSON_PRETTY_PRINT));

foreach ($syntax as $file => $info) {
    echo '  [' . ($info['ok'] ? 'PARSE OK' : 'PARSE FAIL') . '] ' . $file . ($info['message'] !== '' ? ' - ' . $info['message'] : '') . "\n";
}
foreach ($checks as $check) {
    echo '  [' . ($check['ok'] ? 'PASS' : 'FAIL') . '] ' . $check['name'] . ($check['ok'] ? '' : ' (got: ' . $check['detail'] . ')') . "\n";
}
echo "\n" . (count($checks) + count($syntax) - $failed) . ' refund policy runtime assertions passed, ' . $failed . " failed.\n";

exit($failed === 0 ? 0 : 1);
