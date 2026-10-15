<?php
/**
 * Every ASTRO SIVAM tax invoice must disclose the REGISTERED business identity.
 *
 * The enterprise is registered in India as an MSME under the Udyam Registration
 * scheme, and the registration number is a legal disclosure on the document the
 * customer keeps. The invoice is rendered twice — once in the browser
 * (src/services/invoiceHtmlBuilder.ts, guarded by tests/business-registration.test.ts)
 * and once here by mPDF — so this file EXECUTES the PHP renderer and asserts the
 * number, the label and the registered office are in the emitted HTML of BOTH
 * the single-order invoice and the consolidated family invoice.
 *
 * It also pins the source of truth: api/branding.php owns the number, the
 * templates must interpolate the helper instead of retyping the string, and the
 * stale placeholder that used to sit in the header metadata must not return.
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
$chk('the registration number follows the Udyam format (UDYAM-<state>-<district>-<serial>)',
    (bool) preg_match('/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/', (string) ASTRO_BUSINESS_REG_NO),
    (string) ASTRO_BUSINESS_REG_NO);
$chk('the helper renders `Udyam Reg. No. <number>`',
    astro_business_registration_short() === 'Udyam Reg. No. UDYAM-TN-35-0058124',
    astro_business_registration_short());
$chk('the meta helper names the country (customers are served worldwide)',
    astro_business_registration_meta() === 'Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)',
    astro_business_registration_meta());
$chk('the declaration sentence certifies the Indian entity and its registered office',
    strpos(astro_business_registration_sentence(), 'registered in India') !== false
    && strpos(astro_business_registration_sentence(), ASTRO_BUSINESS_REG_NO) !== false
    && strpos(astro_business_registration_sentence(), 'Chennai, Tamil Nadu, India') !== false);
$chk('the HTML variant escapes the ampersand for mPDF/HTML templates',
    strpos(astro_business_registration_sentence_html(), '&amp;') !== false
    && strpos(astro_business_registration_sentence_html(), 'Micro, Small & Medium') === false);

// ── 2. The templates must read the helper, never retype the number ───────────
$invoiceSource = file_get_contents(__DIR__ . '/../api/astrology/pdf_mpdf_invoice.php');
$chk('pdf_mpdf_invoice.php contains no hard-coded registration number (it uses the helper)',
    strpos($invoiceSource, 'UDYAM-TN-35-0058124') === false);
$chk('pdf_mpdf_invoice.php contains no stale regional business-registration placeholder',
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

$single = AstroMpdfInvoice::buildHtml($order);
$family = AstroMpdfInvoice::buildFamilyHtml([$order, $second], 'FAM-REG-1');

foreach (['single-order invoice' => $single, 'consolidated family invoice' => $family] as $label => $html) {
    $chk("$label: header metadata carries the Udyam registration number",
        strpos($html, astro_business_registration_meta()) !== false);
    $chk("$label: declaration discloses the registered Indian entity",
        strpos($html, astro_business_registration_sentence_html()) !== false);
    $chk("$label: registered office is printed on the document",
        strpos($html, 'Chennai, Tamil Nadu, India') !== false);
    $chk("$label: no stale regional registration placeholder survives",
        strpos($html, 'ASV-FJ') === false);
    $chk("$label: still a single A4 sheet (fill CSS stays valid)",
        strpos($html, 'page-break-inside: avoid') !== false);
}

// The registration number must appear with the country next to it, because the
// invoice is issued to customers in India and worldwide alike.
$chk('the invoice meta states the country of registration',
    substr_count($single, '(MSME, India)') >= 1 && substr_count($family, '(MSME, India)') >= 1);

if ($fail) { fwrite(STDERR, "FAILURES: $fail\n"); exit(1); }
echo "\nAll invoice business-registration checks passed.\n";
