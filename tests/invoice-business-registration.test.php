<?php
/**
 * The tax invoice must PRINT the registered business number (India, Udyam/MSME)
 * and must NEVER print the office address.
 *
 * Owner's instruction (15 Oct 2026): the registration number belongs on the
 * invoice and on the Contact page; the office address belongs on the Contact
 * page ONLY.
 *
 * The invoice is rendered twice — in the browser by
 * src/services/invoiceHtmlBuilder.ts (guarded by
 * tests/business-registration.test.ts) and here by mPDF — so this file EXECUTES
 * the PHP renderer and asserts the emitted HTML for BOTH the single-order
 * invoice and the consolidated family invoice. It also pins the source of truth:
 * api/branding.php owns the number, the templates interpolate the helper, and
 * neither the stale placeholder nor the street address may appear.
 */
require_once __DIR__ . '/../api/astrology/pdf_mpdf_invoice.php';

$fail = 0;
$chk = function (string $label, bool $ok, string $detail = '') use (&$fail) {
    if (!$ok) { $fail++; }
    echo ($ok ? '[PASS] ' : '[FAIL] ') . $label . ($detail !== '' ? " ($detail)" : '') . "\n";
};

// ── 1. The source of truth itself ────────────────────────────────────────────
$chk('branding.php defines the India Udyam registration number',
    defined('ASTRO_BUSINESS_REG_NO') && ASTRO_BUSINESS_REG_NO === 'UDYAM-TN-35-0058124',
    defined('ASTRO_BUSINESS_REG_NO') ? ASTRO_BUSINESS_REG_NO : 'undefined');
$chk('the number follows the Udyam format (UDYAM-<state>-<district>-<serial>)',
    (bool) preg_match('/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/', (string) ASTRO_BUSINESS_REG_NO),
    (string) ASTRO_BUSINESS_REG_NO);
$chk('the helper renders `Udyam Reg. No. <number>`',
    astro_business_registration_short() === 'Udyam Reg. No. UDYAM-TN-35-0058124',
    astro_business_registration_short());
$chk('the meta helper names the country (customers are served worldwide)',
    astro_business_registration_meta() === 'Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)',
    astro_business_registration_meta());
$chk('the declaration sentence quotes the number and no street address',
    strpos(astro_business_registration_sentence(), 'registered in India') !== false
    && strpos(astro_business_registration_sentence(), ASTRO_BUSINESS_REG_NO) !== false
    && strpos(astro_business_registration_sentence(), 'Walajapet') === false
    && strpos(astro_business_registration_sentence(), '632513') === false);
$chk('the HTML variant escapes the ampersand for mPDF/HTML templates',
    strpos(astro_business_registration_sentence_html(), '&amp;') !== false
    && strpos(astro_business_registration_sentence_html(), 'Micro, Small & Medium') === false);

// ── 2. The templates must read the helper, never retype anything ─────────────
$invoiceSource = file_get_contents(__DIR__ . '/../api/astrology/pdf_mpdf_invoice.php');
$brandingSource = file_get_contents(__DIR__ . '/../api/branding.php');
$chk('pdf_mpdf_invoice.php retypes neither the number nor the address',
    strpos($invoiceSource, 'UDYAM-TN-35-0058124') === false
    && strpos($invoiceSource, 'Walajapet') === false
    && strpos($invoiceSource, '632513') === false);
$chk('the PHP API carries no office address (Contact page only)',
    strpos($brandingSource, 'Walajapet') === false && strpos($brandingSource, '632513') === false);
$chk('no stale regional business-registration placeholder survives',
    strpos($invoiceSource, 'ASV-FJ') === false);

// ── 3. The rendered documents ────────────────────────────────────────────────
$order = [
    'id' => 'ord-1',
    'order_number' => 'REG-1001',
    'user_name' => 'Client Name',
    'user_email' => 'client@example.com',
    'user_mobile' => '+91 98765 43210',
    'country' => 'India',
    'currency' => 'INR',
    'amount' => 2500.0,
    'service_type' => 'MARRIAGE_COMPATIBILITY',
    'language' => 'en',
    'payment_method' => 'GPAY',
    'payment_reference' => 'REG-PAY-1',
    'created_at' => '2026-10-02 09:00:00',
];
$second = array_merge($order, [
    'id' => 'ord-2',
    'order_number' => 'REG-1002',
    'user_name' => 'Second Member',
    'service_type' => 'BABY_NAMING',
    'amount' => 1500.0,
]);

$docs = [
    'single-order invoice' => AstroMpdfInvoice::buildHtml($order),
    'consolidated family invoice' => AstroMpdfInvoice::buildFamilyHtml([$order, $second], 'FAM-REG-1'),
];

foreach ($docs as $label => $html) {
    $chk("$label: header metadata carries the Udyam registration number",
        strpos($html, astro_business_registration_meta()) !== false);
    $chk("$label: declaration certifies the registered Indian entity",
        strpos($html, astro_business_registration_sentence_html()) !== false);
    $chk("$label: the country of registration is stated next to the number",
        strpos($html, '(MSME, India)') !== false);
    $chk("$label: never prints the office address or the PIN",
        strpos($html, 'Walajapet') === false
        && strpos($html, 'Kamakshi') === false
        && strpos($html, 'Thiruttani') === false
        && strpos($html, '632513') === false);
    $chk("$label: no stale regional registration placeholder survives",
        strpos($html, 'ASV-FJ') === false);
    $chk("$label: still one A4 sheet (fill CSS stays valid)",
        strpos($html, 'page-break-inside: avoid') !== false);
}

if ($fail) { fwrite(STDERR, "FAILURES: $fail\n"); exit(1); }
echo "\nAll invoice business-registration checks passed.\n";
