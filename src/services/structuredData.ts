import type { DisplayReview, ReviewServiceCode } from '../types';
import type { FaqItem } from '../data/homeFaq';
import type { RatingSummary } from './reviews';

/**
 * Homepage structured data (SEO audit 2026-10-15, finding 2).
 *
 * The site-wide Organization / WebApplication / Service graph lives in
 * index.html and ships with EVERY prerendered document. FAQPage and the review
 * markup describe content that only the homepage displays, so they are built
 * here and rendered by the homepage itself (components/common/JsonLd) from the
 * very arrays that render the visible FAQ and review cards — the markup can
 * never describe text the visitor cannot see.
 *
 * Rendering it inside the page (not as a baked head tag) keeps it in both the
 * prerendered HTML and the DOM after the SPA mounts, and drops it when the
 * visitor navigates away from the homepage.
 *
 * Note: Google shows FAQ rich results only for a few authoritative sites, and
 * no review stars for an organisation's reviews of itself ("self-serving").
 * The markup stays valid and machine-readable for other consumers; it is not a
 * promise of rich results.
 */
export const SITE_ORIGIN = 'https://astrosivam.com';

export const SCHEMA_IDS = Object.freeze({
  organization: `${SITE_ORIGIN}/#organization`,
  webapp: `${SITE_ORIGIN}/#webapp`,
  faq: `${SITE_ORIGIN}/#faq`,
});

/**
 * The Service nodes declared in index.html (same @id), plus the page each
 * service is sold on — a review's itemReviewed points at the service bought.
 */
export const SERVICE_SCHEMA: Readonly<Record<ReviewServiceCode, { id: string; name: string; url: string }>> = Object.freeze({
  BIRTH_JATHAGAM: {
    id: `${SITE_ORIGIN}/#birth-jathagam`,
    name: 'Birth Jathagam (Janma Kundali)',
    url: `${SITE_ORIGIN}/birth-jathagam`,
  },
  MARRIAGE_COMPATIBILITY: {
    id: `${SITE_ORIGIN}/#marriage-porutham`,
    name: 'Thirumana Porutham (10-Poruthams Marriage Compatibility)',
    url: `${SITE_ORIGIN}/marriage-compatibility`,
  },
  BABY_NAMING: {
    id: `${SITE_ORIGIN}/#baby-naming`,
    name: 'Sacred Baby Naming (Namakaran / Peyar Sooduthal)',
    url: `${SITE_ORIGIN}/baby-naming`,
  },
  MUHURTHAM: {
    id: `${SITE_ORIGIN}/#subha-muhurtham`,
    name: 'Subha Muhurtham (6-Month Auspicious Dates)',
    url: `${SITE_ORIGIN}/muhurtham`,
  },
});

type JsonLdObject = Record<string, unknown>;

/** FAQPage for the homepage's visible FAQ list — one Question per item, in display order. */
export function buildFaqPageJsonLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': SCHEMA_IDS.faq,
    url: `${SITE_ORIGIN}/`,
    inLanguage: 'en',
    isPartOf: { '@id': SCHEMA_IDS.webapp },
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * The WebPage entity of one indexable route: rendered by <SEO> from the same
 * title, description and canonical as the page's head tags, inside the page
 * tree — so it is in the prerendered HTML AND in the DOM Google renders
 * (main.tsx deletes the baked [data-prerender-seo] head tags at boot), and it
 * is replaced on SPA navigation with the rest of the page.
 */
export function buildWebPageJsonLd(page: { url: string; name: string; description: string }): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': page.url,
    url: page.url,
    name: page.name,
    description: page.description,
    isPartOf: { '@id': SCHEMA_IDS.webapp },
    inLanguage: 'en',
  };
}

const reviewNodeId = (id: string) => `${SITE_ORIGIN}/#review-${String(id).replace(/[^A-Za-z0-9_-]/g, '-')}`;

/**
 * One Review per displayed review (author, datePublished, reviewBody, rating,
 * and itemReviewed = the Service that was bought) plus the AggregateRating the
 * section displays, attached to the Organization. Null when there are no reviews.
 */
export function buildReviewsJsonLd(
  reviews: readonly DisplayReview[],
  summary: RatingSummary | null,
): JsonLdObject | null {
  if (reviews.length === 0) return null;
  const graph: JsonLdObject[] = [];
  if (summary && summary.reviewCount > 0) {
    graph.push({
      '@type': 'Organization',
      '@id': SCHEMA_IDS.organization,
      name: 'ASTRO SIVAM',
      url: `${SITE_ORIGIN}/`,
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: summary.ratingValue,
        bestRating: 5,
        worstRating: 1,
        ratingCount: summary.reviewCount,
        reviewCount: summary.reviewCount,
      },
    });
  }
  for (const review of reviews) {
    const service = SERVICE_SCHEMA[review.serviceCode];
    if (!service) continue;
    graph.push({
      '@type': 'Review',
      '@id': reviewNodeId(review.id),
      author: { '@type': 'Person', name: review.authorName },
      datePublished: review.datePublished,
      ...(review.title ? { name: review.title } : {}),
      reviewBody: review.body,
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
      itemReviewed: { '@type': 'Service', '@id': service.id, name: service.name, url: service.url },
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * JSON for an inline <script type="application/ld+json">. `<`, `>` and `&`
 * are escaped as \u-sequences (still the same JSON value), so user-written
 * review text can never close the script element or be mistaken for markup by
 * the prerender's head-tag extraction; U+2028/U+2029 are escaped for old parsers.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
