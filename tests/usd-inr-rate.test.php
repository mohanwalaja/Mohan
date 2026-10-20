<?php
/**
 * ASTRO SIVAM — USD → INR exchange rate (admin setting, not a code constant).
 *
 * Runs with plain `php tests/usd-inr-rate.test.php` (no database, no network,
 * no SMTP) and is executed by CI via scripts/run-php-tests.sh, and locally
 * under PHP-WASM by tests/usd-base-pricing.test.ts.
 *
 * Why this exists: the site shipped a hard-coded 1 USD = ₹84 while the real
 * rate was ~₹95, so every India price was ~12% too cheap and fixing it needed
 * a code deploy. The rate is now an admin setting; these checks prove the
 * helpers (a) default to ₹95, (b) use the stored rate everywhere, (c) refuse
 * an out-of-band rate instead of pricing reports with it, and (d) still never
 * trust a stored INR value.
 */

putenv('APP_SECRET_KEY=test-only-app-secret-key-0123456789abcdef');

require_once __DIR__ . '/../api/config.php';

$checks = 0;
function checkRate($condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
    echo "[PASS] " . $message . "\n";
}

// ---------------------------------------------------------------------------
// 1. The shipped default is the current market rate, not the stale 84.
// ---------------------------------------------------------------------------
checkRate(USD_TO_INR_RATE === 95, 'The default USD → INR rate is ₹95 (was ₹84)');
checkRate(MIN_USD_TO_INR_RATE === 40 && MAX_USD_TO_INR_RATE === 300, 'The accepted band is ₹40–₹300 per US$');

// ---------------------------------------------------------------------------
// 2. Conversion at the default rate (no settings involved yet).
// ---------------------------------------------------------------------------
checkRate(astro_usd_to_inr(18) === 1710, 'US$18 → ₹1710 at the default rate');
checkRate(astro_usd_to_inr(22) === 2090, 'US$22 → ₹2090 at the default rate');
checkRate(astro_usd_to_inr(0) === 0, 'A zero price converts to zero');
checkRate(astro_usd_to_inr('not-a-number') === 0, 'A non-numeric price converts to zero');
checkRate(astro_usd_to_inr(-5) === 0, 'A negative price converts to zero');

// ---------------------------------------------------------------------------
// 3. Conversion at an explicit admin rate.
// ---------------------------------------------------------------------------
checkRate(astro_usd_to_inr(18, 90) === 1620, 'US$18 → ₹1620 at an explicit ₹90 rate');
checkRate(astro_usd_to_inr(9.99, 95) === 949, 'Fractional US$ prices round to whole rupees');
checkRate(astro_usd_to_inr(18, '88.5') === 1593, 'A numeric string rate is accepted');

// ---------------------------------------------------------------------------
// 4. A bad stored rate falls back to the default instead of pricing reports.
// ---------------------------------------------------------------------------
checkRate(astro_normalize_usd_to_inr_rate(0) === 95.0, 'A zero rate falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate(-12) === 95.0, 'A negative rate falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate(9500) === 95.0, 'An absurd typo rate (9500) falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate(9.5) === 95.0, 'A rate below the band falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate('') === 95.0, 'An empty rate falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate('abc') === 95.0, 'A non-numeric rate falls back to the default');
checkRate(astro_normalize_usd_to_inr_rate(95.456) === 95.46, 'A valid rate keeps two decimals');

// ---------------------------------------------------------------------------
// 5. Service pricing: INR is re-derived at the rate, stored INR is ignored.
// ---------------------------------------------------------------------------
$stored = [
    'BIRTH_JATHAGAM' => ['usd' => 18, 'inr' => 499],
    'MARRIAGE_COMPATIBILITY' => ['USD' => 22, 'INR' => 699],
];
$normalized = astro_normalize_service_pricing($stored, 90);
checkRate($normalized['BIRTH_JATHAGAM']['inr'] === 1620, 'A stored ₹499 birth price is re-derived at the admin rate');
checkRate($normalized['MARRIAGE_COMPATIBILITY']['inr'] === 1980, 'A stored ₹699 match price is re-derived at the admin rate');
checkRate($normalized['MARRIAGE_COMPATIBILITY']['usd'] === 22.0, 'The US$ base price is preserved');
checkRate(!isset($normalized['BIRTH_JATHAGAM']['USD']), 'Legacy USD/INR key spellings are normalised away');

$defaultsAt90 = astro_default_pricing(90);
checkRate($defaultsAt90['BIRTH_JATHAGAM']['inr'] === 1620, 'The built-in price table follows the given rate');
checkRate($defaultsAt90['MUHURTHAM']['usd'] === 20, 'The built-in US$ prices are unchanged');

// ---------------------------------------------------------------------------
// 6. Request-wide resolution: the settings rate wins, then it is cached so a
//    deep price helper (order binding, catalog) uses the same number.
// ---------------------------------------------------------------------------
unset($GLOBALS['ASTRO_USD_INR_RATE']);
checkRate(astro_usd_inr_rate([]) === 95.0, 'No stored rate → the default');
checkRate(astro_usd_inr_rate_for_row(null) === 95.0, 'No settings row → the default rate');
checkRate(astro_usd_inr_rate_for_row(['general_settings' => 'not-json']) === 95.0, 'Corrupt settings JSON → the default rate');
checkRate(astro_usd_inr_rate(['usdToInrRate' => 0]) === 95.0, 'A corrupt stored rate → the default');
checkRate(astro_usd_to_inr(10) === 950, 'A fallback rate is what later helpers use too');
checkRate(astro_usd_inr_rate(['usdToInrRate' => 100]) === 100.0, 'A stored rate is used');
checkRate(astro_usd_to_inr(10) === 1000, 'The request caches the stored rate for later helpers');
checkRate(astro_usd_inr_rate_for_row(['general_settings' => '{"usdToInrRate":101}']) === 101.0, 'A system_settings row carries the rate');

echo "\nUSD/INR rate tests passed ({$checks} checks).\n";
