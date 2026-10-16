/**
 * ASTRO SIVAM — Daylight UI: navigation, catalogue and copy.
 *
 * Everything a visitor reads here either comes from the repository's existing
 * verified data modules (FAQ, testimonials, team, business identity, prices —
 * see @shared below) or is new marketing copy written for this light design.
 * No claim is invented: the delivery promise, the calculation system and the
 * payment wording are the ones the live site already stands behind.
 */
import { HOME_FAQ_ITEMS, type FaqItem } from '@shared/data/homeFaq';
import { CURATED_TESTIMONIALS } from '@shared/data/testimonials';
import { DEFAULT_TEAM_MEMBERS } from '@shared/data/defaultTeamMembers';
import { BUSINESS_INFO } from '@shared/data/businessInfo';
import type { ServiceType } from '@shared/types';

export interface LightRoute {
  key: string;
  label: string;
  /** Short label for the compact dock / footer columns. */
  short?: string;
}

export const PRIMARY_NAV: LightRoute[] = [
  { key: 'home', label: 'Home' },
  { key: 'jathagam', label: 'Birth Jathagam', short: 'Jathagam' },
  { key: 'porutham', label: 'Marriage Porutham', short: 'Porutham' },
  { key: 'naming', label: 'Baby Naming', short: 'Naming' },
  { key: 'muhurtham', label: 'Subha Muhurtham', short: 'Muhurtham' },
  { key: 'studio', label: 'Free Preview Lab', short: 'Preview Lab' },
];

export const SECONDARY_NAV: LightRoute[] = [
  { key: 'services', label: 'All services' },
  { key: 'how-it-works', label: 'How it works' },
  { key: 'team', label: 'Our priest team' },
  { key: 'about', label: 'About us' },
  { key: 'contact', label: 'Contact' },
];

export const ALL_ROUTES: LightRoute[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

export interface CatalogEntry {
  service: ServiceType;
  route: string;
  title: string;
  sanskrit: string;
  tagline: string;
  description: string;
  includes: string[];
  accent: 'brand' | 'accent' | 'rose' | 'leaf';
  glyph: 'compass' | 'hearts' | 'cradle' | 'calendar';
}

/**
 * The four reports ASTRO SIVAM prepares. Wording follows the product pages the
 * priest team already delivers; `includes` mirrors the capability lists the
 * service pages describe (no extra promise is created here).
 */
export const CATALOG: CatalogEntry[] = [
  {
    service: 'BIRTH_JATHAGAM',
    route: 'jathagam',
    title: 'Birth Jathagam',
    sanskrit: 'ஜென்ம ஜாதகம்',
    tagline: 'Your chart, read like a story',
    description:
      'A complete natal horoscope built from your birth particulars — the twelve bhavas, the Navagraha longitudes, your Vimshottari dasha timeline, dosha findings and eight life-aspect readings.',
    includes: [
      'Rasi and Navamsa charts with Lagna',
      'Navagraha positions, retrograde and combustion notes',
      'Vimshottari Mahadasha and Antardasha timeline',
      'Sade Sati status and dosha findings',
      'Eight life-aspect predictions in plain language',
      'Lucky indicators calculated from your chart'
    ],
    accent: 'brand',
    glyph: 'compass'
  },
  {
    service: 'MARRIAGE_COMPATIBILITY',
    route: 'porutham',
    title: 'Marriage Porutham',
    sanskrit: 'திருமணப் பொருத்தம்',
    tagline: 'Two charts, ten poruthams, one clear answer',
    description:
      'The classical ten-fold matching system applied to both charts, with the dasa-sandhi, Rajju, Vedha and Kuja Dosha checks spoken plainly so both families can read the same page.',
    includes: [
      'All ten poruthams scored with reasoning',
      'Rajju, Vedha and Nadi checks',
      'Kuja Dosha (Mars affliction) analysis for both charts',
      'Dasa Sandhi timing comparison',
      'Sevvai / Chevvai dosham notes where present',
      'A marriage guidance summary you can share'
    ],
    accent: 'rose',
    glyph: 'hearts'
  },
  {
    service: 'BABY_NAMING',
    route: 'naming',
    title: 'Vedic Baby Naming',
    sanskrit: 'நாமகரணம்',
    tagline: 'The first syllable a child is called by',
    description:
      'From the baby’s Janma Nakshatra and pada we derive the traditional name syllables, then place curated names beside the meaning, sound and birth-star details — with a naming certificate.',
    includes: [
      'Janma Nakshatra, rasi and pada for the baby',
      'Auspicious naming syllables (ezhuthu)',
      'Curated boy and girl name suggestions with meanings',
      'Name-sound guidance from the birth star',
      'Vedic naming certificate',
      'A keepsake layout for the family album'
    ],
    accent: 'accent',
    glyph: 'cradle'
  },
  {
    service: 'MUHURTHAM',
    route: 'muhurtham',
    title: 'Subha Muhurtham',
    sanskrit: 'சுப முஹூர்த்தம்',
    tagline: 'Dates that agree with your own stars',
    description:
      'A six-month calendar of auspicious dates for your ceremony, each day checked against the panchangam and cross-checked with Tara Balam, Chandrashtama and the Janma Nakshatra of everyone involved.',
    includes: [
      'Pick from eighteen ceremony types',
      'Panchangam checks: tithi, nakshatra, yoga, karana',
      'Nalla Neram, Rahu Kalam and Yamagandam windows',
      'Tara Balam and Chandrashtama for each person',
      'Guru / Sukra asta and Panchaka avoidance',
      'Best, good and fair days marked, never a Janma day'
    ],
    accent: 'brand',
    glyph: 'calendar'
  }
];

export function catalogFor(route: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.route === route);
}

export const DELIVERY_STEPS = [
  {
    step: '01',
    title: 'Choose the report',
    body: 'Read what each report contains and pick the one that answers your question. Every option is a single flat report — no subscription, no hidden add-ons.'
  },
  {
    step: '02',
    title: 'Enter the birth particulars',
    body: 'Name, date, exact time and birth place. For marriage matching, both people’s details. Your details stay private and are used only to prepare the report.'
  },
  {
    step: '03',
    title: 'Our priest team prepares it',
    body: 'Our India-based Vedic priest team runs the sidereal calculation with Chitra Paksha Lahiri ayanamsa and reviews the chart by hand before the PDF is generated.'
  },
  {
    step: '04',
    title: 'Receive the PDF by email',
    body: 'Charts are prepared daily between 9:00 AM and 11:00 AM IST. After administrator review and approval, your PDF report and tax invoice are emailed to you.'
  }
];

export const TRUST_POINTS = [
  {
    title: 'Prepared by priests, not scripts',
    body: 'Every chart is computed, then read and reviewed by our Vedic priest team in India before it is sent.'
  },
  {
    title: 'Chitra Paksha Lahiri',
    body: 'Sidereal calculations with true ayanamsa — the same convention, the same numbers, in every report.'
  },
  {
    title: 'English, Tamil and Hindi',
    body: 'Read a report in the language your family actually speaks, without a second delivery.'
  },
  {
    title: 'Three families of light palettes',
    body: 'This new design is daytime-first: an ivory, a monsoon-blue and a lotus-pink palette, so reading a long chart is easy on the eyes.'
  }
];

export const FAQ_ITEMS: readonly FaqItem[] = HOME_FAQ_ITEMS;
export const TESTIMONIALS = CURATED_TESTIMONIALS;
export const TEAM_MEMBERS = DEFAULT_TEAM_MEMBERS;
export const BUSINESS = BUSINESS_INFO;

/**
 * The credit line shown in the footer. It is the same website the brand
 * guidelines pin, and the only contact address the business publishes.
 */
export const FOOTER_META = {
  website: BUSINESS.website,
  email: BUSINESS.supportEmail,
  legalName: BUSINESS.legalName,
  country: BUSINESS.country
};

/** Language surfaces: the report languages the priest team prepares. */
export const REPORT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' }
] as const;

export type ReportLanguage = (typeof REPORT_LANGUAGES)[number]['code'];
