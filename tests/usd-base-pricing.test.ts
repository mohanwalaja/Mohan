import { readRepoSource } from './helpers/module-sources.js';
/**
 * USD is the base price; India (INR) is ALWAYS auto-calculated from it.
 *
 * The admin enters only US$ prices. The INR price shown on the Services page
 * ("Full Service Catalogue & Plans"), the service pages, checkout and the
 * admin panel must all be US$ x USD_TO_INR_RATE — a stale INR value stored by
 * an older admin panel (e.g. ₹499) must never be shown or charged.
 *
 * The PHP side mirrors this (astro_usd_to_inr / astro_normalize_service_pricing
 * in api/config.php), checked here by source contract because native PHP is
 * not always available locally.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SERVICE_PRICES,
  MAX_USD_TO_INR_RATE,
  MIN_USD_TO_INR_RATE,
  USD_TO_INR_RATE,
  cartTotalForPaymentMethod,
  getServicePrices,
  normalizeUsdToInrRate,
  usdToInr
} from '../src/services/pricing';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- USD BASE PRICE, AUTO-CALCULATED INR ---');

check('usdToInr converts at USD_TO_INR_RATE and rounds to whole rupees', () => {
  assert.equal(usdToInr(18), Math.round(18 * USD_TO_INR_RATE));
  assert.equal(usdToInr(9.99), Math.round(9.99 * USD_TO_INR_RATE));
  assert.equal(usdToInr(0), 0);
  assert.equal(usdToInr(Number.NaN), 0);
  assert.equal(usdToInr(-5), 0);
});

check('a stale stored INR price is ignored — INR always follows USD', () => {
  const settings = {
    indiaPriceINR: 499,
    servicePricing: {
      BIRTH_JATHAGAM: { usd: 18, inr: 499 },
      MARRIAGE_COMPATIBILITY: { usd: 25, inr: 699 },
      BABY_NAMING: { USD: 15, INR: 399 },
      MUHURTHAM: { usd: 20 }
    }
  };
  assert.deepEqual(getServicePrices(settings, 'BIRTH_JATHAGAM'), { USD: 18, INR: usdToInr(18) });
  assert.deepEqual(getServicePrices(settings, 'MARRIAGE_COMPATIBILITY'), { USD: 25, INR: usdToInr(25) });
  assert.deepEqual(getServicePrices(settings, 'BABY_NAMING'), { USD: 15, INR: usdToInr(15) });
  assert.deepEqual(getServicePrices(settings, 'MUHURTHAM'), { USD: 20, INR: usdToInr(20) });
});

check('built-in defaults are USD-based with derived INR', () => {
  for (const [service, prices] of Object.entries(DEFAULT_SERVICE_PRICES)) {
    assert.equal(prices.INR, usdToInr(prices.USD), `${service} default INR must be derived from USD`);
  }
});

check('GPay/UPI checkout charges exactly the derived INR amount', () => {
  const settings = { serviceMode: 'PAID', servicePricing: { BIRTH_JATHAGAM: { usd: 18, inr: 499 } } };
  const result = cartTotalForPaymentMethod([{ serviceType: 'BIRTH_JATHAGAM' }], settings, 'GPAY');
  assert.equal(result.currency, 'INR');
  assert.equal(result.total, usdToInr(18));
});

check('Services page and service pages read prices from the shared helper only', () => {
  for (const file of [
    'src/pages/ServicesPage.tsx',
    'src/pages/BirthJathagamPage.tsx',
    'src/pages/MarriageCompatibilityPage.tsx',
    'src/pages/BabyNamingPage.tsx',
    'src/pages/MuhurthamPage.tsx'
  ]) {
    const src = read(file);
    assert.ok(src.includes('getServicePrices('), `${file} must use getServicePrices`);
    assert.doesNotMatch(src, /servicePricing\?\.\w+\?\.inr/, `${file} must not read a stored INR price`);
    assert.doesNotMatch(src, /indiaPriceINR/, `${file} must not read indiaPriceINR`);
  }
  const services = read('src/pages/ServicesPage.tsx');
  assert.match(services, /data-testid=\{`service-fee-usd-\$\{route\}`\}/, 'the US$ base price is always shown');
  assert.doesNotMatch(services, /isBeta \? '1st FREE \(Beta\)' : fee/, 'beta mode must not hide the US$ price');
});

check('admin panel has no editable India price — INR is displayed, derived from USD', () => {
  const admin = read('src/pages/AdminPortal.tsx');
  assert.doesNotMatch(admin, /setIndiaPrice/, 'no India price state');
  assert.doesNotMatch(admin, /inr: Number\(e\.target\.value\)/, 'no INR input fields');
  assert.match(admin, /indiaPriceINR: usdToInr\(/, 'saved indiaPriceINR is derived');
  assert.match(admin, /\[key\]: \{ usd: nextUsd, inr: usdToInr\(nextUsd, effectiveUsdToInrRate\) \}/, 'per-service INR follows USD at the live rate');
  assert.match(admin, /data-testid="admin-usd-inr-rate-invalid"/, 'an out-of-band rate is called out, not silently applied');
});

check('PHP mirrors the rule: INR derived from USD everywhere the server prices an order', () => {
  const config = read('api/config.php');
  assert.match(config, /function astro_usd_to_inr\(/);
  assert.match(config, /function astro_normalize_service_pricing\(/);
  assert.match(config, /\$row\['inr'\] = astro_usd_to_inr\(\$usd, \$rate\);/);

  const services = read('api/services/index.php');
  const rawPricingReads = services.match(/\$pricing = (?!astro_normalize_service_pricing)[^;]*json_decode\([^;]*'pricing'/g) || [];
  assert.equal(rawPricingReads.length, 0, 'every pricing read in services/index.php is normalised');
  assert.match(services, /\$maxSessionAmount = in_array\(\$pm, \['GPAY', 'UPI'\], true\) \? 1000 \* \$inrRate : 1000;/,
    'the payment-session ceiling is currency-aware so derived INR amounts are accepted');
  assert.match(services, /\$inrRate = astro_usd_inr_rate\(\$general\);/,
    'the session ceiling uses the admin-set rate, not a fixed constant');

  const multi = read('api/services/multi_person_order.php');
  assert.doesNotMatch(multi, /\$override = \$row\['inr'\]/, 'multi-person orders never trust a stored INR price');

  const admin = read('api/admin/index.php');
  assert.match(admin, /\$pricing = astro_normalize_service_pricing\(\s*isset\(\$body\['pricing'\]\)/, 'admin save normalises pricing');
  assert.match(admin, /\$body\['indiaPriceINR'\] = astro_usd_to_inr\(/, 'admin save derives indiaPriceINR');
});

console.log('--- ADMIN-SET USD → INR RATE ---');

check('the shipped default rate is ₹95, not the stale ₹84', () => {
  assert.equal(USD_TO_INR_RATE, 95, 'a hard-coded ₹84 was ~12% below the real rate');
  assert.ok(MIN_USD_TO_INR_RATE < USD_TO_INR_RATE && USD_TO_INR_RATE < MAX_USD_TO_INR_RATE);
});

check('the rate is normalised: out-of-band or non-numeric values fall back', () => {
  assert.equal(normalizeUsdToInrRate(95), 95);
  assert.equal(normalizeUsdToInrRate('90'), 90);
  assert.equal(normalizeUsdToInrRate(95.456), 95.46);
  for (const bad of [0, -5, 9.5, 9500, 'abc', '', null, undefined, Number.NaN]) {
    assert.equal(normalizeUsdToInrRate(bad), USD_TO_INR_RATE, `bad rate ${String(bad)} must fall back`);
  }
});

check('an explicit rate is what usdToInr multiplies by', () => {
  assert.equal(usdToInr(18, 90), 1620);
  assert.equal(usdToInr(18, 95), 1710);
  assert.equal(usdToInr(9.99, 95), 949);
  assert.equal(usdToInr(18, 0), usdToInr(18), 'an unusable rate falls back to the default');
});

check('a saved admin rate flows through every service price and the cart', () => {
  const settings = {
    usdToInrRate: 90,
    servicePricing: { BIRTH_JATHAGAM: { usd: 18, inr: 499 } }
  };
  assert.deepEqual(getServicePrices(settings, 'BIRTH_JATHAGAM'), { USD: 18, INR: 1620 });
  assert.deepEqual(getServicePrices(settings, 'MUHURTHAM'), { USD: 20, INR: 1800 });
  const cart = cartTotalForPaymentMethod([{ serviceType: 'BIRTH_JATHAGAM' }], settings, 'GPAY');
  assert.equal(cart.currency, 'INR');
  assert.equal(cart.total, 1620);
  // A different method still charges US$ — the rate never changes the currency.
  const paypal = cartTotalForPaymentMethod([{ serviceType: 'BIRTH_JATHAGAM' }], settings, 'PAYPAL');
  assert.equal(paypal.currency, 'USD');
  assert.equal(paypal.total, 18);
});

check('PHP derives at the admin rate and rejects an out-of-band save', () => {
  const config = read('api/config.php');
  assert.match(config, /define\('USD_TO_INR_RATE', 95\);/);
  assert.match(config, /define\('MIN_USD_TO_INR_RATE', 40\);/);
  assert.match(config, /define\('MAX_USD_TO_INR_RATE', 300\);/);
  assert.match(config, /function astro_normalize_usd_to_inr_rate\(/);
  assert.match(config, /function astro_usd_inr_rate\(/);
  assert.match(config, /function astro_usd_inr_rate_for_row\(/);
  assert.match(config, /function astro_usd_to_inr\(\$usd, \$rate = null\): int/);
  assert.match(config, /function astro_normalize_service_pricing\(\$pricing, \$rate = null\): array/);

  const admin = read('api/admin/index.php');
  assert.match(admin, /array_key_exists\('usdToInrRate', \$body\)/, 'admin save accepts a rate');
  assert.match(admin, /\$numericRate < MIN_USD_TO_INR_RATE \|\| \$numericRate > MAX_USD_TO_INR_RATE/,
    'admin save rejects an out-of-band rate instead of storing it');
  assert.match(admin, /\$mergedGeneral\['usdToInrRate'\] = \$savedInrRate;/, 'the rate is persisted');
  assert.match(admin, /astro_normalize_service_pricing\([\s\S]{0,80}\$savedInrRate\)/,
    'saving re-derives every INR price at the saved rate');

  const services = read('api/services/index.php');
  assert.match(services, /\$settings\['usdToInrRate'\] = \$inrRate;/, 'the public settings expose the rate');
  assert.match(services, /'usdToInrRate' => \(float\)USD_TO_INR_RATE/, 'the no-row fallback states the default');
  assert.doesNotMatch(services, /round\(\d+ \* USD_TO_INR_RATE\)/,
    'no price table may bypass the resolved rate');

  const multi = read('api/services/multi_person_order.php');
  assert.match(multi, /function astro_multi_person_unit_price\(\$serviceCode, \$pricing, \$currency, \$rate = null\)/);
  assert.match(multi, /astro_multi_person_unit_price\(\$item\['serviceCode'\], \$pricing, \$currency, \$inrRate\)/);
});

check('the admin panel has an exchange-rate field that re-derives every INR', () => {
  const admin = read('src/pages/AdminPortal.tsx');
  assert.match(admin, /data-testid="admin-usd-inr-rate"/, 'the rate input exists');
  assert.match(admin, /setUsdToInrRate\(next\)/, 'the admin can change the rate');
  assert.match(admin, /usdToInrRate: savedRate,/, 'the rate is sent on save');
  assert.match(admin, /indiaPriceINR: usdToInr\(Number\(intlPrice\) \|\| 0, savedRate\)/,
    'the saved India price uses the saved rate');
  assert.match(admin, /inr: usdToInr\(nextUsd, effectiveUsdToInrRate\)/, 'per-service INR follows the live rate');

  const checklist = read('src/components/admin/SetupChecklistPanel.tsx');
  assert.match(checklist, /resolveUsdToInrRate\(settings/, 'the setup audit quotes the live rate');
  assert.doesNotMatch(checklist, /USD_TO_INR_RATE/, 'the audit cannot quote a fixed rate');
});

// The arithmetic above is mirrored in PHP; run the real helpers in a real PHP
// runtime when the dev-only wasm build is installed (CI runs the same file
// natively via scripts/run-php-tests.sh).
if (fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'))) {
  check('tests/usd-inr-rate.test.php passes under PHP 8.1', () => {
    const run = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/php-wasm-run.mjs'), '--php', '8.1', 'tests/usd-inr-rate.test.php'],
      { cwd: root, encoding: 'utf8', timeout: 180000 }
    );
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /USD\/INR rate tests passed \(\d+ checks\)/);
  });
} else {
  console.log('  [SKIP] @php-wasm/node is not installed - tests/usd-inr-rate.test.php runs in CI (npm run test:php).');
}

console.log(`\nUSD base pricing contract passed (${passed} checks).`);
