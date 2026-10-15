/**
 * Homepage structured data (SEO audit 2026-10-15, finding 2).
 *
 * The audit found no FAQPage for the five homepage FAQs and no Review /
 * AggregateRating for the testimonials. Both are now rendered by the homepage
 * itself from the SAME arrays that render the visible FAQ and review cards:
 *
 *   1. FAQPage = src/data/homeFaq.ts (5 Q&As), verbatim, in display order.
 *   2. Review per displayed review (author, datePublished, reviewBody, rating,
 *      itemReviewed = the Service node from index.html + its page URL) and an
 *      AggregateRating on the Organization that equals the visible summary.
 *   3. Homepage only — index.html is the template of EVERY prerendered page,
 *      so it must not carry either type.
 *   4. The serializer cannot be broken out of by user-written review text.
 *   5. When dist/ exists: the shipped homepage passes the build guard
 *      (homepageStructuredDataProblems in scripts/prerender.mjs: markup ==
 *      visible text) and no other document carries FAQPage/Review.
 *
 * Google currently limits FAQ rich results to a few authoritative sites and
 * shows no stars for an organisation's reviews of itself; the markup is kept
 * valid and truthful rather than tuned for rich results.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_FAQ_ITEMS } from '../src/data/homeFaq';
import { CURATED_TESTIMONIALS } from '../src/data/testimonials';
import { mergeReviews, summarizeRatings } from '../src/services/reviews';
import {
  SCHEMA_IDS,
  SERVICE_SCHEMA,
  buildFaqPageJsonLd,
  buildReviewsJsonLd,
  serializeJsonLd
} from '../src/services/structuredData';
import type { DisplayReview } from '../src/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const prerender = await import(new URL('../scripts/prerender.mjs', import.meta.url).href);
const ROUTES: Array<{ path: string; file: string }> = prerender.ROUTES;

/** The site-wide JSON-LD graph in the index.html template. */
const templateGraph: Array<Record<string, any>> = (() => {
  const html = read('index.html');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html must keep its site-wide JSON-LD');
  return JSON.parse(match[1])['@graph'];
})();

console.log('--- HOMEPAGE STRUCTURED DATA (SEO audit 2026-10-15, finding 2) ---');

check('FAQPage lists the five homepage questions verbatim, in display order', () => {
  const faq = buildFaqPageJsonLd(HOME_FAQ_ITEMS);
  assert.equal(faq['@type'], 'FAQPage');
  assert.equal(faq['@context'], 'https://schema.org');
  assert.equal(faq['@id'], SCHEMA_IDS.faq);
  const entities = faq.mainEntity as Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }>;
  assert.equal(HOME_FAQ_ITEMS.length, 5);
  assert.equal(entities.length, HOME_FAQ_ITEMS.length);
  entities.forEach((entity, index) => {
    assert.equal(entity['@type'], 'Question');
    assert.equal(entity.name, HOME_FAQ_ITEMS[index].question);
    assert.equal(entity.acceptedAnswer['@type'], 'Answer');
    assert.equal(entity.acceptedAnswer.text, HOME_FAQ_ITEMS[index].answer);
  });
});

check('the homepage renders the FAQ and its JSON-LD from one array (no second copy)', () => {
  const home = read('src/pages/HomePage.tsx');
  assert.match(home, /import \{ HOME_FAQ_ITEMS \} from '\.\.\/data\/homeFaq';/);
  assert.match(home, /buildFaqPageJsonLd\(HOME_FAQ_ITEMS\)/);
  assert.match(home, /HOME_FAQ_ITEMS\.map\(/);
  assert.match(home, /<JsonLd data=\{FAQ_JSON_LD\} id="faq" \/>/);
  assert.doesNotMatch(home, /const FAQ_ITEMS\s*=/, 'the FAQ must not be typed twice');
  const section = read('src/components/common/TestimonialsSection.tsx');
  assert.match(section, /buildReviewsJsonLd\(reviews, summary\)/, 'review markup must be built from the reviews on screen');
  assert.match(section, /<JsonLd data=\{structuredData\} id="reviews" \/>/);
});

check('each review carries author, date, body, rating and the service it reviews (with its page)', () => {
  const summary = summarizeRatings(CURATED_TESTIMONIALS, null);
  const data = buildReviewsJsonLd(CURATED_TESTIMONIALS, summary) as { '@graph': Array<Record<string, any>> };
  const reviews = data['@graph'].filter((node) => node['@type'] === 'Review');
  assert.equal(reviews.length, CURATED_TESTIMONIALS.length);
  const routePaths = new Set(ROUTES.map((route) => route.path));
  reviews.forEach((node, index) => {
    const source = CURATED_TESTIMONIALS[index];
    assert.equal(node.author['@type'], 'Person');
    assert.equal(node.author.name, source.authorName);
    assert.equal(node.datePublished, source.datePublished);
    assert.match(node.datePublished, /^\d{4}-\d{2}(-\d{2})?$/, 'datePublished must be ISO 8601');
    assert.equal(node.reviewBody, source.body);
    assert.deepEqual(node.reviewRating, { '@type': 'Rating', ratingValue: source.rating, bestRating: 5, worstRating: 1 });
    const service = SERVICE_SCHEMA[source.serviceCode];
    assert.deepEqual(node.itemReviewed, { '@type': 'Service', '@id': service.id, name: service.name, url: service.url });
    assert.ok(routePaths.has(new URL(service.url).pathname), `${service.url} must be a prerendered page`);
    assert.ok(String(node['@id']).startsWith('https://astrosivam.com/#review-'));
  });
  assert.equal(new Set(reviews.map((node) => node['@id'])).size, reviews.length, 'review @ids must be unique');
});

check('the Service @ids and names match the site-wide graph in index.html', () => {
  for (const service of Object.values(SERVICE_SCHEMA)) {
    const node = templateGraph.find((entry) => entry['@id'] === service.id);
    assert.ok(node, `index.html declares no Service ${service.id}`);
    assert.equal(node['@type'], 'Service');
    assert.equal(node.name, service.name, `${service.id} name drifted from index.html`);
  }
  assert.ok(templateGraph.some((entry) => entry['@id'] === SCHEMA_IDS.organization && entry['@type'] === 'Organization'));
  assert.ok(templateGraph.some((entry) => entry['@id'] === SCHEMA_IDS.webapp));
});

check('the AggregateRating is the visible summary: curated + every published review', () => {
  const curatedOnly = buildReviewsJsonLd(CURATED_TESTIMONIALS, summarizeRatings(CURATED_TESTIMONIALS, null)) as any;
  const org = curatedOnly['@graph'].find((node: any) => node['@type'] === 'Organization');
  assert.equal(org['@id'], SCHEMA_IDS.organization);
  assert.deepEqual(org.aggregateRating, {
    '@type': 'AggregateRating', ratingValue: 5, bestRating: 5, worstRating: 1, ratingCount: 6, reviewCount: 6
  });

  // 2 published reviews on screen, 10 published in total (40 stars): the
  // aggregate counts all 16, the Review list only what is displayed.
  const verified: DisplayReview[] = [
    { id: 'rev_a', authorName: 'Anu R.', serviceCode: 'BABY_NAMING', rating: 3, body: 'Helpful list of names.', datePublished: '2026-10-10', verifiedPurchase: true },
    { id: 'rev_b', authorName: 'Vel K.', serviceCode: 'MUHURTHAM', rating: 4, body: 'Dates arrived on time.', datePublished: '2026-10-12', verifiedPurchase: true }
  ];
  const merged = mergeReviews(verified, CURATED_TESTIMONIALS);
  const summary = summarizeRatings(CURATED_TESTIMONIALS, { reviewCount: 10, ratingTotal: 40 });
  assert.deepEqual(summary, { ratingValue: 4.4, reviewCount: 16 });
  const data = buildReviewsJsonLd(merged, summary) as any;
  assert.equal(data['@graph'].find((node: any) => node.aggregateRating).aggregateRating.ratingValue, 4.4);
  assert.equal(data['@graph'].filter((node: any) => node['@type'] === 'Review').length, 8);
  assert.equal(buildReviewsJsonLd([], null), null, 'no reviews -> no review markup');
});

check('user-written text cannot break out of the JSON-LD script element', () => {
  const hostile = '</script><script>alert(1)</script> & <!-- \u2028 <meta name="x">';
  const out = serializeJsonLd({ reviewBody: hostile });
  assert.doesNotMatch(out, /<|>/, 'no raw angle brackets may reach the HTML');
  assert.doesNotMatch(out, /&/, 'no raw ampersand may reach the HTML');
  assert.doesNotMatch(out, /\u2028/);
  assert.equal(JSON.parse(out).reviewBody, hostile, 'the escaped JSON must still decode to the same text');
});

check('index.html (the template of every page) carries neither FAQPage nor Review markup', () => {
  const types = new Set(templateGraph.map((node) => node['@type']));
  assert.ok(!types.has('FAQPage') && !types.has('Review'), 'homepage-only markup leaked into the shared template');
  assert.doesNotMatch(read('index.html'), /"FAQPage"|"Review"|aggregateRating/);
});

check('the page markup is not baked as a removable head tag', () => {
  const jsonLd = read('src/components/common/JsonLd.tsx');
  assert.doesNotMatch(jsonLd.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /data-prerender-seo/,
    'main.tsx deletes [data-prerender-seo] at boot — the page JSON-LD must survive into the live DOM');
  assert.match(jsonLd, /type="application\/ld\+json"/);
  assert.match(jsonLd, /serializeJsonLd\(data\)/);
});

const distDir = path.join(root, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('  [SKIP] dist/ not built — run `npm run build` to check the shipped documents.');
} else {
  check('the shipped homepage carries FAQPage + Review JSON-LD that matches its visible text', () => {
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const body = html.slice(html.indexOf('<div id="root">'));
    const problems: string[] = prerender.homepageStructuredDataProblems({ path: '/' }, body);
    assert.deepEqual(problems, [], problems.join('; '));
    const blocks: Array<{ schema: string; data: any }> = prerender.pageJsonLdBlocks(body);
    assert.deepEqual(blocks.map((block) => block.schema).sort(), ['faq', 'reviews']);
  });

  check('no other shipped document carries the homepage FAQPage / Review markup', () => {
    for (const route of ROUTES.filter((entry) => entry.path !== '/')) {
      const html = fs.readFileSync(path.join(distDir, 'pages', route.file), 'utf8');
      assert.doesNotMatch(html, /data-schema="(faq|reviews)"/, `${route.path} carries homepage-only JSON-LD`);
    }
  });
}

console.log(`\nHomepage structured data contract passed (${passed} checks).`);
