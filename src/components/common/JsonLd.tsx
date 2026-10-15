import React from 'react';
import { serializeJsonLd } from '../../services/structuredData';

interface JsonLdProps {
  /** A schema.org JSON-LD object (or null to render nothing). */
  data: unknown;
  /** Stable label for tests and debugging, e.g. "faq" or "reviews". */
  id: string;
}

/**
 * Inline structured data rendered inside the page tree, so it is part of the
 * prerendered HTML and of the live DOM after the SPA mounts, and disappears
 * with the page on SPA navigation. Not marked data-prerender-seo on purpose:
 * main.tsx deletes those baked head tags at boot.
 */
export function JsonLd({ data, id }: JsonLdProps) {
  if (data == null) return null;
  return (
    <script
      type="application/ld+json"
      data-schema={id}
      // serializeJsonLd escapes <, > and & so the payload cannot end the element.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
