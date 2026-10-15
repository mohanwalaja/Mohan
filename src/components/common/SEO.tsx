import React from 'react';
import { Helmet } from 'react-helmet-async';
import { JsonLd } from './JsonLd';
import { buildWebPageJsonLd } from '../../services/structuredData';

export interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'profile';
  noindex?: boolean;
}

const DEFAULT_TITLE = 'ASTRO SIVAM - Understand Your Life Through Vedic Astrology';
const DEFAULT_DESCRIPTION = 'ASTRO SIVAM offers Birth Jathagam, 10-Poruthams Marriage Compatibility, Vedic Baby Naming, and Subha Muhurtham reports in Tamil, English, and Hindi.';
const DEFAULT_IMAGE = 'https://astrosivam.com/assets/images/astrosivam_og_image.jpg?v=20261003';
const SITE_NAME = 'ASTRO SIVAM';
const SITE_ORIGIN = 'https://astrosivam.com';

/**
 * Self-referencing canonical for the current path. The previous hardcoded
 * default ("https://astrosivam.com/") made EVERY page that forgot to pass a
 * canonical declare itself a duplicate of the homepage (SEO audit 2026-10-14,
 * finding 2) — derive it from the location instead so a missing prop can
 * never consolidate interior pages away.
 */
function defaultCanonical(): string {
  if (typeof window !== 'undefined' && window.location && window.location.pathname) {
    const path = window.location.pathname.replace(/\/+$/, '');
    return path === '' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
  }
  return `${SITE_ORIGIN}/`;
}

export const SEO: React.FC<SEOProps> = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonical = defaultCanonical(),
  ogImage = DEFAULT_IMAGE,
  ogType = 'website',
  noindex = false,
}) => {
  return (
    <>
      <Helmet>
        {/* Standard Meta Tags */}
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {noindex ? (
          <meta name="robots" content="noindex, nofollow" />
        ) : (
          <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        )}

        {/* OpenGraph Meta Tags */}
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content={ogType} />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:secure_url" content={ogImage} />
        <meta property="og:image:alt" content={title} />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      {/* The page's WebPage entity, from the same title/description/canonical.
          Rendered in the page tree (not the head) so it survives the SPA boot
          and leaves with the page; noindex pages describe nothing. */}
      {!noindex && (
        <JsonLd id="webpage" data={buildWebPageJsonLd({ url: canonical, name: title, description })} />
      )}
    </>
  );
};
