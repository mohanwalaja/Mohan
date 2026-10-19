<?php
/**
 * The tax invoice must PRINT the registered business number (India, Udyam/MSME)
 * and must NEVER print the office address.
 *
 * Owner's instruction (15 Oct 2026): the registration number belongs on the
 * invoice and on the Contact page; the office address belongs on the Contact
 * page ONLY.
 *
 * Invoices are rendered ONLY in the browser now (src/services/invoiceHtmlBuilder.ts,
 * guarded by tests/business-registration.test.ts). The server-side mPDF invoice
 * was retired in Oct 2026, so this file pins what remains on the PHP side: the
 * shared helpers in api/branding.php that any future document reads, and the
 * fact that no PHP invoice renderer (or its duplicate copy of the number and
 * address) comes back.
 */
require_once __DIR__ . '/../api/branding.php';

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
$chk('the HTML variant escapes the ampersand for HTML templates',
    strpos(astro_business_registration_sentence_html(), '&amp;') !== false
    && strpos(astro_business_registration_sentence_html(), 'Micro, Small & Medium') === false);

// ── 2. No PHP invoice renderer (or duplicate copy) may come back ────────────
require_once __DIR__ . '/../api/astrology/engine.php';
$brandingSource = file_get_contents(__DIR__ . '/../api/branding.php');
$chk('the PHP API carries no office address (Contact page only)',
    strpos($brandingSource, 'Walajapet') === false && strpos($brandingSource, '632513') === false);
$chk('the server-side invoice renderer is gone',
    !file_exists(__DIR__ . '/../api/astrology/pdf_mpdf_invoice.php')
    && !class_exists('AstroMpdfInvoice'));
$chk('the engine cannot generate an invoice PDF on the server',
    !method_exists('AstroEngine', 'generateInvoicePdf')
    && !method_exists('AstroEngine', 'generateFamilyInvoicePdf'));
$chk('no stale regional business-registration placeholder survives',
    strpos($brandingSource, 'ASV-FJ') === false);

if ($fail) { fwrite(STDERR, "FAILURES: $fail\n"); exit(1); }
echo "\nAll invoice business-registration checks passed.\n";
