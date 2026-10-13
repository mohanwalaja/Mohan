/**
 * ASTRO SIVAM — static prerender of the public routes.
 *
 * WHY: the app is a client-rendered SPA, so before this step EVERY route served
 * the identical <head> (same title, description, and a canonical that always
 * pointed at "/"). Crawlers that do not execute JavaScript therefore saw one
 * duplicated homepage. This script runs AFTER `vite build` and writes a
 * dedicated HTML file per public route, each carrying its own <title>,
 * description, canonical, Open Graph / Twitter tags and a Service JSON-LD block.
 *
 * HOW: it reuses the EXACT <script>/<link> asset tags emitted by Vite (with
 * their content hashes) so the prerendered pages boot the very same bundle. The
 * React app still mounts and react-helmet-async reconciles the head at runtime,
 * so the static tags and the live app never disagree. Pages that must stay out
 * of the index (login/register/dashboard/admin) get a noindex robots tag.
 *
 * No external dependencies — Node's fs only, consistent with the other scripts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const ORIGIN = 'https://astrosivam.com';
const SITE_NAME = 'ASTRO SIVAM';
const OG_IMAGE = `${ORIGIN}/astrosivam_og_image.jpg?v=20261003`;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the SEO <head> fragment for one route. */
function headTags(route, noindex) {
  const url = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];
  if (route.service) {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: route.service.name,
      serviceType: route.service.serviceType,
      description: route.service.description,
      url,
      provider: { '@type': 'Organization', name: SITE_NAME, url: `${ORIGIN}/` },
      areaServed: 'Worldwide',
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  }
  return tags.join('\n    ');
}

/** Replace the homepage's SEO tags in the built head with route-specific ones. */
function buildPage(baseHtml, route, noindex) {
  let html = baseHtml;
  // Drop the homepage-only SEO tags; keep favicons/manifest/fonts/JSON-LD/asset tags.
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
  html = html.replace(/<meta name="description"[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="robots"[^>]*>\s*/gi, '');
  html = html.replace(/<link rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace(/<meta property="og:[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="twitter:[^>]*>\s*/gi, '');
  const injected = headTags(route, noindex);
  return html.replace(/<head>/i, `<head>\n    ${injected}`);
}

/** Public routes worth prerendering. `path` becomes dist/<path>/index.html. */
const ROUTES = [
  {
    path: '/',
    title: 'ASTRO SIVAM - Understand Your Life Through Vedic Astrology',
    description:
      'Authentic Vedic astrology platform. Get precision Birth Jathagam (Kundali), 10-Poruthams Marriage Compatibility, Sacred Baby Naming & Subha Muhurtham auspicious dates in Tamil, English & Hindi.',
  },
  {
    path: '/services',
    title: 'Vedic Astrology Services - Jathagam, Marriage, Naming & Muhurtham | ASTRO SIVAM',
    description:
      'Explore authentic Vedic astrology services by ASTRO SIVAM: Birth Jathagam, 10-Poruthams Marriage Matching, Sacred Baby Naming, and a Subha Muhurtham Auspicious Date Calendar.',
  },
  {
    path: '/birth-jathagam',
    title: 'Birth Jathagam (Janma Kundali) Online Report | ASTRO SIVAM',
    description:
      'Calculate an accurate Birth Jathagam online with 12 Bhavas, Rasi & Navamsa charts, Vimshottari Mahadasa predictions, and Kuja dosha analysis in Tamil, English & Hindi.',
    service: {
      name: 'Birth Jathagam (Janma Kundali)',
      serviceType: 'Vedic Astrology Horoscope Calculation',
      description:
        'Complete precision Vedic horoscope with 12 Bhavas, Rasi & Navamsa charts, Vimshottari Mahadasa timeline, Kuja dosha, and personalized life predictions.',
    },
  },
  {
    path: '/marriage-compatibility',
    title: '10-Poruthams Thirumana Porutham (Marriage Matching) | ASTRO SIVAM',
    description:
      'Check classical 10-Porutham marriage compatibility online with Kuja Dosha, Papa Samyam balance, and authentic priest recommendations.',
    service: {
      name: 'Thirumana Porutham (10-Poruthams Marriage Compatibility)',
      serviceType: 'Horoscope Synastry Matching',
      description:
        'Classical 10-Porutham marriage compatibility assessment with Kuja Dosha, Papa Samyam balance, and an authentic priest compatibility verdict.',
    },
  },
  {
    path: '/baby-naming',
    title: 'Sacred Baby Naming (Namakaran / Peyar Sooduthal) | ASTRO SIVAM',
    description:
      'Find auspicious newborn baby naming syllables based on Janma Nakshatra Pada with deity alignment and meaningful Tamil, Sanskrit & Hindi name suggestions.',
    service: {
      name: 'Sacred Baby Naming (Namakaran / Peyar Sooduthal)',
      serviceType: 'Nakshatra Baby Naming Ceremony',
      description:
        'Auspicious newborn baby naming based on Janma Nakshatra Pada syllables, deity alignment, and meaningful Tamil, Sanskrit & Hindi name suggestions.',
    },
  },
  {
    path: '/muhurtham',
    title: 'Subha Muhurtham - Auspicious Dates Report | ASTRO SIVAM',
    description:
      'Get a personalized Subha Muhurtham auspicious date calendar across six months for 18 Vedic ceremonies, computed from tithi, nakshatra, lagna and Guru-Sukra strength.',
    service: {
      name: 'Subha Muhurtham (Auspicious Dates)',
      serviceType: 'Auspicious Muhurtham Date Selection',
      description:
        'Personalized Subha Muhurtham date calendar for 18 Vedic ceremonies, computed from tithi, nakshatra, yoga, karana, lagna and Guru-Sukra strength.',
    },
  },
  {
    path: '/how-it-works',
    title: 'How It Works - Authentic Vedic Astrology Process | ASTRO SIVAM',
    description:
      'See how ASTRO SIVAM guides you through service selection, secure checkout, traditional chart review, and report delivery by email.',
  },
  {
    path: '/about',
    title: 'About Us - Authentic Vedic Astrology Heritage | ASTRO SIVAM',
    description:
      "Learn about ASTRO SIVAM's mission to deliver uncompromisingly authentic Vedic astrology calculations, high-precision algorithms, and spiritual wisdom.",
  },
  {
    path: '/team',
    title: 'Our Vedic Scholars & Astrologers | ASTRO SIVAM',
    description:
      "Meet the expert Vedic scholars, Sanskrit pandits, and computational astrologers behind ASTRO SIVAM's precise calculations.",
  },
  {
    path: '/contact',
    title: 'Contact ASTRO SIVAM - Astrological Support & Inquiries',
    description:
      'Get in touch with ASTRO SIVAM for astrology consultations, order inquiries, and technical support. Available 7 days a week.',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | ASTRO SIVAM',
    description:
      'How ASTRO SIVAM safeguards your birth data, personal information, and payment details with strict confidentiality.',
  },
  {
    path: '/terms',
    title: 'Terms of Service | ASTRO SIVAM',
    description:
      "Terms and Conditions governing the use of ASTRO SIVAM's Vedic astrology services, calculations, and digital deliverables.",
  },
  {
    path: '/payment-policy',
    title: 'Payment Policy | ASTRO SIVAM',
    description:
      'Accepted payment methods, secure transaction processing, and multi-currency billing at ASTRO SIVAM.',
  },
  {
    path: '/refund-policy',
    title: 'Refund & Cancellation Policy | ASTRO SIVAM',
    description:
      'Our policy on refunds and cancellations for personalized astrological calculations and digital PDF deliverables.',
  },
];

/** Routes that must never be indexed but should still 200 (real SPA routes). */
const NOINDEX = [
  { path: '/login', title: 'Client Login | ASTRO SIVAM', description: 'Log in to your ASTRO SIVAM account to access your purchased reports and saved profiles.' },
  { path: '/register', title: 'Create an Account | ASTRO SIVAM', description: 'Register for an ASTRO SIVAM account to save birth profiles, track orders, and access PDF reports.' },
  { path: '/dashboard', title: 'Customer Order Dashboard | ASTRO SIVAM', description: 'Track your astrology orders, email-delivery status, and saved birth profile.' },
];

function main() {
  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  const all = [
    ...ROUTES.map((r) => ({ ...r, noindex: false })),
    ...NOINDEX.map((r) => ({ ...r, noindex: true })),
  ];
  let written = 0;

  for (const route of all) {
    const page = buildPage(baseHtml, route, route.noindex);
    if (route.path === '/') {
      writeFileSync(join(DIST, 'index.html'), page);
    } else {
      const dir = join(DIST, route.path);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), page);
    }
    written += 1;
  }

  console.log(`prerender: wrote ${written} static route(s) from dist/index.html`);
}

main();

