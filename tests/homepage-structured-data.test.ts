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
 *   6. Every indexable page (not only the homepage) carries ONE WebPage
 *      JSON-LD rendered by its <SEO> inside the page tree, from the same
 *      canonical/title/description as its head tags — no longer a baked
 *      [data-prerender-seo] head tag that main.tsx deletes at boot.
 *      noindex pages carry none (webPageStructuredDataProblems).
 *
 * Google currently limits FAQ rich results to a few authoritative sites and
 * shows no stars for an organisation's reviews of itself; the markup is kept
 * valid and truthful rather than tuned for rich results.
 *
 * Extended by the index-coverage audit (2026-10-16): the four service pages
 * ship their OWN service-specific FAQPage (src/data/serviceFaqs.ts, rendered
 * by components/common/ServiceFaqSection) and every indexable page ships a
 * BreadcrumbList (buildBreadcrumbJsonLd) — both guarded at build time by
 * homepageStructuredDataProblems / breadcrumbProblems in scripts/prerender.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { SEO } from '../src/components/common/SEO';
import { HOME_FAQ_ITEMS } from '../src/data/homeFaq';
import { CURATED_TESTIMONIALS } from '../src/data/testimonials';
import { mergeReviews, summarizeRatings } from '../src/services/reviews';
import {
  SCHEMA_IDS,
  SERVICE_SCHEMA,
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  buildReviewsJsonLd,
  buildWebPageJsonLd,
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
const ROUTES: Array<{ path: string; file: string; noindex?: boolean }> = prerender.ROUTES;

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

check('the four service pages render their own FAQ + breadcrumb from the shared arrays', () => {
  const servicePages: Array<{ file: string; items: string; route: string; faqUrl: string }> = [
    { file: 'src/pages/MarriageCompatibilityPage.tsx', items: 'MARRIAGE_COMPATIBILITY_FAQ_ITEMS', route: 'marriage-compatibility', faqUrl: 'https://astrosivam.com/marriage-compatibility' },
    { file: 'src/pages/BabyNamingPage.tsx', items: 'BABY_NAMING_FAQ_ITEMS', route: 'baby-naming', faqUrl: 'https://astrosivam.com/baby-naming' },
    { file: 'src/pages/BirthJathagamPage.tsx', items: 'BIRTH_JATHAGAM_FAQ_ITEMS', route: 'birth-jathagam', faqUrl: 'https://astrosivam.com/birth-jathagam' },
    { file: 'src/pages/MuhurthamPage.tsx', items: 'MUHURTHAM_FAQ_ITEMS', route: 'muhurtham', faqUrl: 'https://astrosivam.com/muhurtham' }
  ];
  for (const page of servicePages) {
    const src = read(page.file);
    assert.match(src, new RegExp(`import \\{ ${page.items} \\} from '\\.\\.\\/data\\/serviceFaqs';`), `${page.file} must import its FAQ items from the shared data file`);
    assert.match(src, new RegExp(`items=\\{${page.items}\\}`), `${page.file} must render its FAQ items`);
    assert.match(src, new RegExp(`canonicalUrl="${page.faqUrl}"`), `${page.file} must name its canonical in the FAQ section`);
    assert.match(src, /<JsonLd\s+id="breadcrumb"/, `${page.file} must render its BreadcrumbList`);
  }
});

check('buildFaqPageJsonLd names the page it describes (homepage keeps its historical @id)', () => {
  const home = buildFaqPageJsonLd(HOME_FAQ_ITEMS);
  assert.equal(home['@id'], SCHEMA_IDS.faq);
  assert.equal(home.url, 'https://astrosivam.com/');
  const service = buildFaqPageJsonLd(HOME_FAQ_ITEMS, 'https://astrosivam.com/muhurtham');
  assert.equal(service['@id'], 'https://astrosivam.com/muhurtham#faq');
  assert.equal(service.url, 'https://astrosivam.com/muhurtham');
});

check('buildBreadcrumbJsonLd emits a BreadcrumbList with sequential positions', () => {
  const data = buildBreadcrumbJsonLd([
    { name: 'Home', url: 'https://astrosivam.com/' },
    { name: 'Services', url: 'https://astrosivam.com/services' },
    { name: 'Subha Muhurtham', url: 'https://astrosivam.com/muhurtham' }
  ]) as { '@type': string; itemListElement: Array<Record<string, unknown>> };
  assert.equal(data['@type'], 'BreadcrumbList');
  assert.deepEqual(data.itemListElement.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(data.itemListElement[2].item, 'https://astrosivam.com/muhurtham');
});

check('the FAQ guard fails the build on a wrong canonical, an invisible answer or a missing page FAQ', () => {
  const items = HOME_FAQ_ITEMS.slice(0, 3);
  const visible = items.map((item) => `<details><summary>${item.question}</summary><p>${item.answer}</p></details>`).join('');
  const faqBlock = (url: string, extra = '') => `<script type="application/ld+json" data-schema="faq">${serializeJsonLd({
    '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${url}#faq`, url,
    inLanguage: 'en', isPartOf: { '@id': SCHEMA_IDS.webapp },
    mainEntity: items.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } }))
  })}${extra}</script>`;

  const route = { path: '/muhurtham' };
  // A service page with no FAQ at all.
  assert.match(prerender.homepageStructuredDataProblems(route, visible).join(), /missing its FAQPage/);
  // A FAQ that names the wrong page.
  const wrongUrl = visible + faqBlock('https://astrosivam.com/baby-naming');
  assert.match(prerender.homepageStructuredDataProblems(route, wrongUrl).join(), /must be the page's canonical https:\/\/astrosivam\.com\/muhurtham/);
  // A correct FAQ whose answer is not visible on the page.
  const hiddenAnswer = faqBlock('https://astrosivam.com/muhurtham');
  assert.match(prerender.homepageStructuredDataProblems(route, hiddenAnswer).join(), /FAQ answer not visible/);
  // A page that is not an FAQ route must not carry any FAQPage.
  assert.match(prerender.homepageStructuredDataProblems({ path: '/about' }, visible + faqBlock('https://astrosivam.com/about')).join(), /belongs to the homepage or a service page only/);
  // The homepage keeps its stricter rule (5+ questions).
  assert.match(prerender.homepageStructuredDataProblems({ path: '/' }, visible + faqBlock('https://astrosivam.com/')).join(), /5\+ questions/);
});

check('the breadcrumb guard fails the build on a missing, duplicated or mis-aimed list', () => {
  const crumb = (last: string) => `<script type="application/ld+json" data-schema="breadcrumb">${serializeJsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://astrosivam.com/' },
      { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://astrosivam.com/services' },
      { '@type': 'ListItem', position: 3, name: 'Page', item: last }
    ]
  })}</script>`;

  const route = { path: '/contact' };
  assert.match(prerender.breadcrumbProblems(route, '<div></div>').join(), /expected exactly one BreadcrumbList/);
  assert.match(prerender.breadcrumbProblems(route, crumb('https://astrosivam.com/terms')).join(), /must be the canonical https:\/\/astrosivam\.com\/contact/);
  assert.match(prerender.breadcrumbProblems(route, crumb('https://astrosivam.com/contact') + crumb('https://astrosivam.com/contact')).join(), /expected exactly one BreadcrumbList/);
  assert.match(prerender.breadcrumbProblems({ path: '/' }, crumb('https://astrosivam.com/')).join(), /breadcrumb root/);
  assert.match(prerender.breadcrumbProblems({ path: '/login', noindex: true }, crumb('https://astrosivam.com/login')).join(), /noindex document must not carry BreadcrumbList/);
  assert.deepEqual(prerender.breadcrumbProblems(route, crumb('https://astrosivam.com/contact')), []);
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

/** Renders <SEO> the way the prerender does and splits off its head tags. */
function renderSeo(props: Record<string, unknown>) {
  const html = renderToString(React.createElement(HelmetProvider, null, React.createElement(SEO, props)));
  const headTags = [...html.matchAll(/<title[^>]*>[\s\S]*?<\/title>|<meta\s[^>]*>|<link\s[^>]*>/gi)].map((m) => m[0]);
  return { html, headTags };
}

check('every indexable page describes itself with one WebPage, from its own head tags', () => {
  const props = {
    title: 'Services & Prices | ASTRO SIVAM',
    description: 'Birth Jathagam, "10 Poruthams" & more — Tamil, English, Hindi.',
    canonical: 'https://astrosivam.com/services'
  };
  const { html, headTags } = renderSeo(props);
  const blocks: Array<{ schema: string; data: any }> = prerender.pageJsonLdBlocks(html);
  assert.deepEqual(blocks.map((block) => block.schema), ['webpage']);
  assert.deepEqual(blocks[0].data, buildWebPageJsonLd({ url: props.canonical, name: props.title, description: props.description }));
  assert.deepEqual(blocks[0].data, {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': 'https://astrosivam.com/services',
    url: 'https://astrosivam.com/services',
    name: 'Services & Prices | ASTRO SIVAM',
    description: 'Birth Jathagam, "10 Poruthams" & more — Tamil, English, Hindi.',
    isPartOf: { '@id': SCHEMA_IDS.webapp },
    inLanguage: 'en'
  }, 'name/description are the plain text, never HTML-escaped (the old baked tag leaked &amp;)');
  assert.deepEqual(prerender.webPageStructuredDataProblems({ path: '/services' }, html, headTags), []);

  const noindex = renderSeo({ ...props, canonical: 'https://astrosivam.com/dashboard', noindex: true });
  assert.deepEqual(prerender.pageJsonLdBlocks(noindex.html), [], 'a noindex page describes nothing');
  assert.deepEqual(prerender.webPageStructuredDataProblems({ path: '/dashboard', noindex: true }, noindex.html, noindex.headTags), []);
});

check('the WebPage guard fails the build on a missing, duplicated or drifted entity', () => {
  const props = { title: 'About | ASTRO SIVAM', description: 'Who we are.', canonical: 'https://astrosivam.com/about' };
  const { html, headTags } = renderSeo(props);
  const guard = (route: Record<string, unknown>, body: string) => prerender.webPageStructuredDataProblems(route, body, headTags) as string[];
  const without = html.replace(/<script type="application\/ld\+json" data-schema="webpage">[\s\S]*?<\/script>/, '');
  assert.match(guard({ path: '/about' }, without).join(), /exactly one WebPage/);
  assert.match(guard({ path: '/about' }, html + html).join(), /exactly one WebPage JSON-LD \(rendered by <SEO>\), found 2/);
  assert.match(guard({ path: '/contact' }, html).join(), /canonical https:\/\/astrosivam\.com\/contact/);
  const renamed = renderSeo({ ...props, title: 'Other' }).html;
  assert.match(guard({ path: '/about' }, renamed).join(), /is not the <title>/);
  assert.match(guard({ path: '/about', noindex: true }, html).join(), /noindex document must not carry WebPage/);
});

check('the WebPage is rendered by <SEO> in the page tree, no longer baked as a removable head tag', () => {
  const seo = read('src/components/common/SEO.tsx');
  assert.match(seo, /\{!noindex && \(\s*<JsonLd id="webpage" data=\{buildWebPageJsonLd\(\{ url: canonical, name: title, description \}\)\} \/>/);
  const helmet = seo.slice(seo.indexOf('<Helmet>'), seo.indexOf('</Helmet>'));
  assert.doesNotMatch(helmet, /JsonLd|ld\+json/, 'inside <Helmet> it would be hoisted to the head and deleted at boot');
  const script = read('scripts/prerender.mjs');
  assert.doesNotMatch(script, /'@type': 'WebPage'/, 'the prerender must not bake a second WebPage');
  assert.match(script, /\.\.\.webPageStructuredDataProblems\(route, bodyHtml, mappedHead\)/, 'the build must run the WebPage guard');
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
    assert.deepEqual(blocks.map((block) => block.schema).sort(), ['faq', 'reviews', 'webpage']);
  });

  check('only the FAQ routes ship a FAQPage; Review markup stays homepage-only; service FAQs name their own page', () => {
    const faqRoutes = new Set(prerender.FAQ_ROUTES);
    for (const route of ROUTES) {
      const html = fs.readFileSync(route.path === '/' ? path.join(distDir, 'index.html') : path.join(distDir, 'pages', route.file), 'utf8');
      const body = html.slice(html.indexOf('<div id="root">'));
      const blocks = prerender.pageJsonLdBlocks(body);
      const faqBlocks = blocks.filter((block) => block.schema === 'faq');
      const reviewBlocks = blocks.filter((block) => block.schema === 'reviews');
      assert.equal(reviewBlocks.length, route.path === '/' ? 1 : 0, `${route.path}: Review markup is homepage-only`);
      assert.equal(faqBlocks.length, faqRoutes.has(route.path) ? 1 : 0, `${route.path}: expected ${faqRoutes.has(route.path) ? 'one' : 'no'} FAQPage`);
      if (faqBlocks.length === 1 && route.path !== '/') {
        const canonical = `https://astrosivam.com${route.path}`;
        assert.equal(faqBlocks[0].data.url, canonical, `${route.path}: FAQPage must name its own page`);
        assert.equal(faqBlocks[0].data['@id'], `${canonical}#faq`);
      }
      assert.deepEqual(prerender.homepageStructuredDataProblems(route, body), [], `${route.path}: ${prerender.homepageStructuredDataProblems(route, body).join('; ')}`);
    }
  });

  check('every shipped indexable page carries one BreadcrumbList; noindex pages and the homepage carry none', () => {
    for (const route of ROUTES) {
      const html = fs.readFileSync(route.path === '/' ? path.join(distDir, 'index.html') : path.join(distDir, 'pages', route.file), 'utf8');
      const body = html.slice(html.indexOf('<div id="root">'));
      assert.deepEqual(prerender.breadcrumbProblems(route, body), [], `${route.path}: ${prerender.breadcrumbProblems(route, body).join('; ')}`);
    }
  });

  check('every shipped indexable document has one WebPage in its body; noindex documents and heads have none', () => {
    for (const route of ROUTES) {
      const html = fs.readFileSync(route.path === '/' ? path.join(distDir, 'index.html') : path.join(distDir, 'pages', route.file), 'utf8');
      // Comments dropped first: the template's boot comment MENTIONS <title>.
      const head = html.slice(0, html.indexOf('</head>')).replace(/<!--[\s\S]*?-->/g, '');
      const body = html.slice(html.indexOf('<div id="root">'));
      assert.doesNotMatch(head, /<script type="application\/ld\+json" data-prerender-seo/, `${route.path}: no baked WebPage in the head`);
      // Baked tags read <title data-prerender-seo> / <meta data-prerender-seo name=…>; the guard accepts both.
      const headTags = [...head.matchAll(/<title[^>]*>[\s\S]*?<\/title>|<meta\s[^>]*>|<link\s[^>]*>/gi)].map((m) => m[0]);
      const problems: string[] = prerender.webPageStructuredDataProblems(route, body, headTags);
      assert.deepEqual(problems, [], `${route.path}: ${problems.join('; ')}`);
      const pages = prerender.pageJsonLdBlocks(body).filter((block: { schema: string }) => block.schema === 'webpage');
      assert.equal(pages.length, route.noindex ? 0 : 1, route.path);
    }
  });
}

console.log(`\nHomepage structured data contract passed (${passed} checks).`);
