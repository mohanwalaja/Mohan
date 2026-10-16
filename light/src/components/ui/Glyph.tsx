import React from 'react';
import type { CatalogEntry } from '../../appConfig';

/**
 * Report glyphs.
 *
 * Drawn as line art rather than icons: a mariner's compass for the jathagam, a
 * pair of interlocking rings for porutham, a hanging cradle for namakaranam and
 * a temple-arch calendar for muhurtham. They are the visual shorthand the whole
 * UI leans on, so they carry the palette accent instead of a fixed colour.
 */
export const Glyph: React.FC<{
  glyph: CatalogEntry['glyph'];
  className?: string;
}> = ({ glyph, className = 'h-7 w-7' }) => {
  const common = {
    className,
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (glyph === 'compass') {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="16" />
        <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none" />
        <path d="M31.5 16.5 27 27l-10.5 4.5L21 21z" />
        <path d="M24 4v3M24 41v3M4 24h3M41 24h3" />
      </svg>
    );
  }

  if (glyph === 'hearts') {
    return (
      <svg {...common}>
        <circle cx="19" cy="24" r="10.5" />
        <circle cx="29" cy="24" r="10.5" />
        <path d="M24 14.5c2.6 2.4 2.6 16.6 0 19-2.6-2.4-2.6-16.6 0-19Z" />
      </svg>
    );
  }

  if (glyph === 'cradle') {
    return (
      <svg {...common}>
        <path d="M12 20h24l-3.5 12.5a4 4 0 0 1-3.85 2.9h-9.3a4 4 0 0 1-3.85-2.9L12 20Z" />
        <path d="M24 4v16" />
        <path d="M16 8.5c2.5-2 5-3 8-3" />
        <path d="M17 25.5c2.3 2 4.6 3 7 3s4.7-1 7-3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M8 18a16 16 0 0 1 32 0v22a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z" />
      <path d="M8 18h32" />
      <path d="M24 44V18" />
      <path d="M13 26h5M13 32h5M30 26h5M30 32h5" />
      <path d="M24 12V6M20 6h8" />
    </svg>
  );
};

export const glyphToneClass = (accent: CatalogEntry['accent']) => {
  switch (accent) {
    case 'accent':
      return 'text-accent bg-accent-soft border-accent/25';
    case 'rose':
      return 'text-rose bg-rose-soft border-rose/25';
    case 'leaf':
      return 'text-leaf bg-leaf-soft border-leaf/25';
    default:
      return 'text-brand-ink bg-brand-soft border-brand/30';
  }
};
