/**
 * THE ORDER JOURNEY, STATED EVERYWHERE — copy contract.
 *
 * Owner request (2026-10-24): "clearly mention every place the astrology order
 * goes to the priest team in India, they calculate and verify, after admin
 * approval the email goes to the user's email — with the priest data."
 *
 * Before this test the flow was described eight slightly different ways. Some
 * pages dropped "India", some dropped the priest verification, some dropped the
 * tax invoice, and two service pages described delivery as if the report were
 * generated and mailed without a person ever looking at it.
 *
 * Pinned here:
 *   1. src/data/orderJourney.ts is the ONE source, and it names all four facts:
 *      the India-based priest team, their calculation + verification, the
 *      administrator's approval, and the email to the registered address that
 *      carries the priest-team verification line with the report + tax invoice;
 *   2. every public page that sells a report renders <OrderJourneyNotice>;
 *   3. every delivery FAQ (homepage + four service pages) uses the canonical
 *      answer instead of restating the promise in its own words;
 *   4. the Policies page's "Service Delivery" clause states the same flow;
 *   5. the AI Astrologer has the same four steps as a guided option, in
 *      English, Tamil and Hindi (executed for real by
 *      tests/ai-astrologer-order-journey.test.ts under PHP-WASM).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORDER_JOURNEY_FAQ_ANSWER,
  ORDER_JOURNEY_STEPS
} from '../src/data/orderJourney';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- ORDER JOURNEY (priest team → admin approval → email) ---');

check('the canonical answer names all four facts', () => {
  for (const fact of ['India', 'priest team', 'calculate', 'verify', 'administrator', 'approv', 'emailed', 'registered email', 'PDF report', 'Tax Invoice', 'verification line']) {
    assert.ok(
      ORDER_JOURNEY_FAQ_ANSWER.toLowerCase().includes(fact.toLowerCase()),
      `the canonical answer must mention "${fact}"`
    );
  }
  assert.equal(ORDER_JOURNEY_STEPS.length, 4, 'the journey must be stated in four steps');
});

check('the four steps run in the customer’s order: priest team → verify → approve → email', () => {
  const text = ORDER_JOURNEY_STEPS.map((step) => `${step.title} ${step.description}`.toLowerCase());
  assert.match(text[0], /india/);
  assert.match(text[0], /priest team/);
  assert.match(text[1], /calculat/);
  assert.match(text[1], /verif/);
  assert.match(text[2], /administrator/);
  assert.match(text[2], /approv/);
  assert.match(text[3], /email/);
  assert.match(text[3], /verification line/);
});

/** Every public page that sells or explains a report. */
const PAGES = [
  'src/pages/HomePage.tsx',
  'src/pages/ServicesPage.tsx',
  'src/pages/BirthJathagamPage.tsx',
  'src/pages/MarriageCompatibilityPage.tsx',
  'src/pages/BabyNamingPage.tsx',
  'src/pages/MuhurthamPage.tsx',
  'src/pages/HowItWorksPage.tsx',
  'src/pages/AboutPage.tsx',
  'src/pages/AstrologyTeamPage.tsx'
];

for (const page of PAGES) {
  check(`${page} renders the order journey`, () => {
    const source = read(page);
    assert.match(source, /import \{ OrderJourneyNotice \}/, `${page} must import OrderJourneyNotice`);
    assert.match(source, /<OrderJourneyNotice/, `${page} must render <OrderJourneyNotice />`);
  });
}

check('the notice is the ONE component reading the ONE source', () => {
  // Comments explain the promise; only the rendered code must stop retyping it.
  const component = read('src/components/common/OrderJourneyNotice.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(component, /from '\.\.\/\.\.\/data\/orderJourney'/, 'the notice must read src/data/orderJourney.ts');
  // Only the eyebrow is literal; the promise itself (the four steps, the
  // delivery facts and the FAQ answer) must come from the data module.
  assert.doesNotMatch(component, /registered email|Tax Invoice|administrator/i,
    'the notice must not retype the promise — it renders the source');
});

check('every delivery FAQ uses the canonical answer', () => {
  const homeFaq = read('src/data/homeFaq.ts');
  assert.match(homeFaq, /import \{ ORDER_JOURNEY_FAQ_ANSWER \} from '\.\/orderJourney'/);
  assert.match(homeFaq, /answer: ORDER_JOURNEY_FAQ_ANSWER/);

  const serviceFaqs = read('src/data/serviceFaqs.ts');
  assert.match(serviceFaqs, /ORDER_JOURNEY_FAQ_ANSWER/, 'report services must use the canonical answer');
  assert.match(serviceFaqs, /orderJourneyFaqAnswer\('certificate'\)/, 'Baby Naming must use the certificate wording');
  // The old per-page promise must be gone: it promised "checks every 6 hours"
  // while the pages promised a daily 9–11 AM review.
  assert.doesNotMatch(serviceFaqs, /checks all reports every 6 hours/i);
  assert.doesNotMatch(homeFaq, /checks all reports every 6 hours/i);
});

check('the Policies page states the same delivery flow', () => {
  const policies = read('src/pages/PoliciesPage.tsx');
  const delivery = policies.slice(policies.indexOf('3. Service Delivery'));
  assert.match(delivery, /India-based Vedic priest team/, 'the delivery clause must name the India priest team');
  assert.match(delivery, /administrator’s approval/, 'the delivery clause must name the administrator approval');
  assert.match(delivery, /verification line/, 'the delivery clause must name the verification line');
});

check('the AI Astrologer menu carries the journey in en, ta and hi', () => {
  const api = read('api/knowledge/ai-astrologer/rules/guided-questions.json');
  const mirror = read('knowledge/ai-astrologer/rules/guided-questions.json');
  assert.equal(api, mirror, 'the two guided-questions copies must stay byte-identical');
  const menu = JSON.parse(api);
  const order = menu.categories.find((category: any) => category.id === 'order');
  assert.ok(order, 'the "My Order & Report" category must exist');
  const option = order.questions.find((question: any) => question.id === 'order-process');
  assert.ok(option, 'the menu must offer "Who prepares my report, and when is it emailed?"');
  assert.equal(option.kind, 'order');
  assert.equal(option.topic, 'process');
  for (const lang of ['en', 'ta', 'hi']) {
    assert.ok(String(option.text[lang] || '').length > 10, `the option needs a ${lang} label`);
  }
});

check('the PHP answerer carries the four steps in en, ta and hi', () => {
  const php = read('api/astrology/ai_astrologer_offline.php');
  assert.match(php, /private static function orderProcessText\(string \$lang\): string/);
  assert.match(php, /\$topic === 'process'/, 'the guided topic must be routed');
  assert.match(php, /isOrderProcessQuestion\(\$q\)/, 'a typed question must reach the same answer');
  const fn = php.slice(php.indexOf('private static function orderProcessText'));
  const body = fn.slice(0, fn.indexOf('private static function isOrderProcessQuestion'));
  for (const lang of ["'en' =>", "'ta' =>", "'hi' =>"]) {
    assert.ok(body.includes(lang), `orderProcessText must carry ${lang}`);
  }
  for (const fact of ['India', 'priest team', 'administrator', 'emailed', 'verification line']) {
    assert.ok(body.includes(fact), `the English answer must mention "${fact}"`);
  }
});

/**
 * The built pages must really carry the promise, not just the source. Skipped
 * when dist/ has not been built (the suite runs before the first build too).
 */
const distIndex = path.join(root, 'dist', 'index.html');
if (fs.existsSync(distIndex)) {
  check('the prerendered pages ship the journey text', () => {
    const targets = ['dist/index.html', 'dist/pages/services.html', 'dist/pages/muhurtham.html', 'dist/pages/about.html'];
    for (const target of targets) {
      const file = path.join(root, target);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      assert.match(html, /What happens after you order/, `${target} must show the order-journey panel`);
      assert.match(html, /India-based Vedic priest team/, `${target} must name the India priest team`);
    }
  });
} else {
  console.log('  [SKIP] dist/ not built — run `npm run build` to check the shipped pages.');
}

console.log(`\n[OK] order journey copy: ${passed} checks passed`);
