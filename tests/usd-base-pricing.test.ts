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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SERVICE_PRICES,
  USD_TO_INR_RATE,
  cartTotalForPaymentMethod,
  getServicePrices,
  usdToInr
} from '../src/services/pricing';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

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
  assert.match(admin, /\[key\]: \{ usd: nextUsd, inr: usdToInr\(nextUsd\) \}/, 'per-service INR follows USD');
});

check('PHP mirrors the rule: INR derived from USD everywhere the server prices an order', () => {
  const config = read('api/config.php');
  assert.match(config, /function astro_usd_to_inr\(/);
  assert.match(config, /function astro_normalize_service_pricing\(/);
  assert.match(config, /\$row\['inr'\] = astro_usd_to_inr\(\$usd\);/);

  const services = read('api/services/index.php');
  const rawPricingReads = services.match(/\$pricing = (?!astro_normalize_service_pricing)[^;]*json_decode\([^;]*'pricing'/g) || [];
  assert.equal(rawPricingReads.length, 0, 'every pricing read in services/index.php is normalised');
  assert.match(services, /\$maxSessionAmount = in_array\(\$pm, \['GPAY', 'UPI'\], true\) \? 1000 \* USD_TO_INR_RATE : 1000;/,
    'the payment-session ceiling is currency-aware so derived INR amounts are accepted');

  const multi = read('api/services/multi_person_order.php');
  assert.doesNotMatch(multi, /\$override = \$row\['inr'\]/, 'multi-person orders never trust a stored INR price');

  const admin = read('api/admin/index.php');
  assert.match(admin, /\$pricing = astro_normalize_service_pricing\(isset\(\$body\['pricing'\]\)/, 'admin save normalises pricing');
  assert.match(admin, /\$body\['indiaPriceINR'\] = astro_usd_to_inr\(/, 'admin save derives indiaPriceINR');
});

console.log(`\nUSD base pricing contract passed (${passed} checks).`);
