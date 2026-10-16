/**
 * ASTRO SIVAM — light UI: the site's own copy, in one place.
 *
 * RULE FOR THIS FILE: every visitor-facing string here is the string the live
 * site already publishes. Nothing is paraphrased, renamed or invented — the
 * light UI is a re-skin, not a rewrite, so the marketing wording, the service
 * names, the fees, the delivery promise and the page structure all come from
 * the existing application:
 *
 *   • nav labels / button labels  → src/context/LanguageContext.tsx (t())
 *   • home hero, services, steps  → src/pages/HomePage.tsx
 *   • catalogue, fees, CTAs       → src/pages/ServicesPage.tsx + services/pricing
 *   • service page headers        → ServicePageHeader props on each service page
 *   • FAQ, testimonials, team     → the shared data modules
 *   • business identity           → src/data/businessInfo.ts
 */
import { BRAND_NAME, BRAND_SLOGAN } from '@shared/components/common/BrandLockup';
import { HOME_FAQ_ITEMS, type FaqItem } from '@shared/data/homeFaq';
import { CURATED_TESTIMONIALS } from '@shared/data/testimonials';
import { DEFAULT_TEAM_MEMBERS } from '@shared/data/defaultTeamMembers';
import { BUSINESS_INFO } from '@shared/data/businessInfo';
import {
  BIRTH_JATHAGAM_FAQ_ITEMS,
  MARRIAGE_COMPATIBILITY_FAQ_ITEMS,
  BABY_NAMING_FAQ_ITEMS,
  MUHURTHAM_FAQ_ITEMS
} from '@shared/data/serviceFaqs';
import type { ServiceType } from '@shared/types';
import { isDocumentMode } from './documentMode';

export const BRAND = {
  name: BRAND_NAME,
  slogan: BRAND_SLOGAN,
  /** "ASTRO SIVAM" under the legal copy, as the live footer prints it. */
  legalName: BUSINESS_INFO.legalName,
  website: BUSINESS_INFO.website,
  email: BUSINESS_INFO.supportEmail,
  facebook: 'https://www.facebook.com/Astrosivamofficial'
};

/** Where the signed-in surfaces live: this preview has no backend of its own. */
export const LIVE_SITE = 'https://astrosivam.com';
export const ACCOUNT_LINKS = {
  login: { label: 'Log In', href: `${LIVE_SITE}/login` },
  register: { label: 'Sign Up', href: `${LIVE_SITE}/register` }
};

/**
 * The account links inside the LIGHT design.
 *
 * On the deployed site the account surfaces are the classic design's own pages
 * (they are signed-in tools — see LIGHT_DESIGN_EXCLUDED_ROUTES in
 * src/services/designSwitch.ts), so the links are same-origin `/login` and
 * `/register`. In the standalone preview there is no backend at all, so they
 * point at the live site instead — and the preview says so on screen.
 */
export function accountHref(kind: 'login' | 'register'): string {
  return isDocumentMode() ? `/${kind}` : ACCOUNT_LINKS[kind].href;
}

/** True only in the deployed documents: the preview must not pretend otherwise. */
export const isPreviewBuild = (): boolean => !isDocumentMode();

export type PageKey =
  | 'home'
  | 'services'
  | 'birth-jathagam'
  | 'marriage-compatibility'
  | 'baby-naming'
  | 'muhurtham'
  | 'how-it-works'
  | 'team'
  | 'about'
  | 'contact'
  | 'policy-privacy'
  | 'policy-terms'
  | 'policy-payment'
  | 'policy-refund';

/** Exactly the live navbar: same order, same labels (LanguageContext t()). */
export const NAV_LINKS: Array<{ key: PageKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'birth-jathagam', label: 'Birth Jathagam' },
  { key: 'marriage-compatibility', label: 'Marriage Compatibility' },
  { key: 'baby-naming', label: 'Baby Naming' },
  { key: 'muhurtham', label: 'Subha Muhurtham' },
  { key: 'team', label: 'Astrology Team' }
];

/** The phone menu keeps the same extra item the live site adds. */
export const MOBILE_EXTRA_LINK: { key: PageKey; label: string } = {
  key: 'how-it-works',
  label: 'How It Works'
};

export const GOVERNANCE_LINKS: Array<{ key: PageKey; label: string }> = [
  { key: 'services', label: 'Services' },
  { key: 'how-it-works', label: 'How It Works' },
  { key: 'about', label: 'About Us' },
  { key: 'contact', label: 'Contact' }
];

export const POLICY_LINKS: Array<{ key: PageKey; label: string }> = [
  { key: 'policy-privacy', label: 'Privacy Policy' },
  { key: 'policy-terms', label: 'Terms & Conditions' },
  { key: 'policy-payment', label: 'Payment Policy' },
  { key: 'policy-refund', label: 'Refund & Cancellation Policy' }
];

/* --------------------------------------------------------------- home page */
/** src/pages/HomePage.tsx — hero block, verbatim. */
export const HOME_HERO = {
  eyebrow: 'Online Vedic astrology',
  title: 'Understand your life through',
  titleItalic: 'Vedic astrology.',
  body:
    'Order a personalised Birth Jathagam, Marriage Compatibility, Baby Naming, or Subha Muhurtham report. Each report is prepared by our Vedic priest team in India and delivered as a clear PDF in English, Tamil, or Hindi.',
  primaryCta: 'View services',
  secondaryCta: 'How it works',
  trust: [
    'Private birth details',
    'Prepared daily 9–11 AM IST & emailed',
    'English, Tamil & Hindi'
  ]
};

export const HOME_SECTIONS = {
  servicesEyebrow: 'Services',
  servicesTitle: 'Choose the report you need',
  servicesLead:
    'Every option includes a personalised PDF prepared from the birth details you provide.',
  workflowEyebrow: 'How it works',
  workflowTitle: 'From your details to your report',
  workflowLead:
    'The order process is straightforward and works on mobile, tablet, or desktop.',
  reviewsEyebrow: 'Reviews',
  reviewsTitle: 'What readers say',
  reviewsLead:
    'Experiences shared by customers who ordered ASTRO SIVAM reports. Reviews marked Verified purchase were written by customers from their own paid, delivered order.',
  faqEyebrow: 'Frequently asked questions',
  faqTitle: 'Helpful details before you order',
  faqLead: 'Quick answers about ordering, delivery, calculations, samples, and payment.'
};

export interface HomeService {
  service: ServiceType;
  title: string;
  description: string;
  detail: string;
  route: PageKey;
  accent: 'brand' | 'accent' | 'rose' | 'leaf';
  glyph: 'compass' | 'hearts' | 'cradle' | 'calendar';
}

/** src/pages/HomePage.tsx HOME_SERVICES — same four cards, same order, same text. */
export const HOME_SERVICES: HomeService[] = [
  {
    service: 'BIRTH_JATHAGAM',
    title: 'Birth Jathagam',
    description:
      'A personal horoscope reading of your chart, life seasons, strengths, and planetary periods.',
    detail: 'Rasi and Navamsa charts, Vimshottari Dasa, doshas, and remedies',
    route: 'birth-jathagam',
    accent: 'brand',
    glyph: 'compass'
  },
  {
    service: 'MARRIAGE_COMPATIBILITY',
    title: 'Marriage Compatibility',
    description:
      'A clear comparison of two charts using the classical 10-Poruthams matching system.',
    detail: 'Porutham scores, Rajju and Vedha checks, Kuja Dosha, and Dasa Sandhi',
    route: 'marriage-compatibility',
    accent: 'rose',
    glyph: 'hearts'
  },
  {
    service: 'BABY_NAMING',
    title: 'Baby Naming',
    description: 'Meaningful Vedic name guidance based on the baby’s birth star and chart.',
    detail: 'Auspicious syllables, curated names, birth-star details, and certificate',
    route: 'baby-naming',
    accent: 'accent',
    glyph: 'cradle'
  },
  {
    service: 'MUHURTHAM',
    title: 'Subha Muhurtham',
    description: 'A six-month calendar of suitable dates and times for your chosen ceremony.',
    detail: 'Panchangam checks, Nalla Neram, Rahu Kalam, and Tara Balam',
    route: 'muhurtham',
    accent: 'leaf',
    glyph: 'calendar'
  }
];

/** src/pages/HomePage.tsx HOW_IT_WORKS — the four steps, verbatim. */
export const HOME_STEPS = [
  {
    number: '1',
    title: 'Choose a report',
    description: 'Compare the available services, then open the report that fits your question.'
  },
  {
    number: '2',
    title: 'Enter birth details',
    description: 'Add the required names, birth date, exact time, and place in the secure form.'
  },
  {
    number: '3',
    title: 'India-based Priest Team prepares',
    description:
      'Our India-based Vedic priest team calculates and reviews the chart before your personalised PDF is created.'
  },
  {
    number: '4',
    title: 'Receive your PDF by email',
    description:
      'Our priest team prepares reports daily between 9:00 AM – 11:00 AM IST. Following admin review and approval, your verified PDF report and tax invoice are emailed directly to you.'
  }
];

/* ----------------------------------------------------------- services page */
export interface CatalogueEntry {
  service: ServiceType;
  route: PageKey;
  title: string;
  category: string;
  description: string;
  features: string[];
  action: string;
  accent: 'brand' | 'accent' | 'rose' | 'leaf';
  glyph: HomeService['glyph'];
  /** ServicePageHeader props from the report's own page, verbatim. */
  header: { eyebrow: string; title: string; description: string };
  /** The verification note the report page prints above its order form. */
  note: string;
}

/** src/pages/ServicesPage.tsx — titles, categories, descriptions and feature lists. */
export const CATALOGUE: CatalogueEntry[] = [
  {
    service: 'BIRTH_JATHAGAM',
    route: 'birth-jathagam',
    title: 'Birth Jathagam (Vedic Horoscope & Ephemeris)',
    category: 'Full Natal Horoscope & Life Guidance',
    description:
      'A comprehensive 2-page astrological dossier mapping your planetary karma, soul purpose, and life timings. Computed with precise latitude, longitude, and timezone calculations for any global birthplace.',
    features: [
      '12 Bhavas & Navagraha Longitudes',
      'Vimshottari Mahadasha Sequence',
      'Sade Sati (Ezharai Sani) Status & Remedies',
      'Available in Tamil, English & Hindi'
    ],
    action: 'Order Birth Jathagam',
    accent: 'brand',
    glyph: 'compass',
    header: {
      eyebrow: 'Vedic Horoscope Computation · Thirukanitha Sidereal Jyotish',
      title: 'Birth Jathagam & Comprehensive Natal Chart',
      description:
        'Detailed natal horoscope calculated with precision sidereal ephemeris using Lahiri Ayanamsa. Includes 12 Bhavas, Navagraha planetary longitudes, Vimshottari Mahadasha timeline, Sade Sati & Dosha analysis, and 8 life aspect predictions.'
    },
    note:
      'Every birth horoscope is calculated and carefully verified by our dedicated Vedic priest and astrologer team using authentic Drik Panchanga and Chitra Paksha Lahiri principles. All charts are sanctified before official report generation.'
  },
  {
    service: 'MARRIAGE_COMPATIBILITY',
    route: 'marriage-compatibility',
    title: 'Marriage Compatibility (10 Vedic Poruthams & Koota Matching)',
    category: 'Matrimonial Matching & 10 Poruthams',
    description:
      'Authentic Kuta matching evaluating the 10 classical Poruthams, Rajju concordance, and Kuja (Mars) Dosha cancellation rules between bride and groom horoscopes.',
    features: [
      '10 Classical Poruthams Breakdown',
      'Rajju & Vedha Crucial Check',
      'Kuja Dosha Samyam Analysis',
      'Uses Customer Profile for Person 1'
    ],
    action: 'Order Marriage Match',
    accent: 'rose',
    glyph: 'hearts',
    header: {
      eyebrow: '10 Poruthams · Kuja Dosha · Vedic Matrimonial Compatibility',
      title: 'Vedic Marriage Compatibility & Matrimonial Horoscope Match',
      description:
        'Detailed 10-Porutham evaluation including Dina, Gana, Mahendra, Stree Dheerkha, Yoni, Rasi, Rasiyathipathi, Vasiya, Rajju, and Vedha. Features in-depth Kuja (Mars) Dosha analysis and Dosha Samyam balance.'
    },
    note:
      'Every matrimonial match is calculated and carefully reviewed by our Vedic priest and astrologer team using classical Porutham rules, Rajju and Vedha checks and Kuja Dosha cancellation principles.'
  },
  {
    service: 'BABY_NAMING',
    route: 'baby-naming',
    title: 'Baby Naming (Vedic Namakaranam & Auspicious Syllables)',
    category: 'Namakaran Syllables & Suggestions',
    description:
      'Calculate the auspicious sound vibrations for your newborn based on exact Moon nakshatra and pada at birth. Receive curated meaningful names in English, Tamil, and Hindi.',
    features: [
      'Primary Starting Syllable for Birth Pada',
      'Syllables for all 4 Padas of Nakshatra',
      'Curated Vedic Baby Name Repository',
      'Official ASTRO SIVAM Naming Certificate'
    ],
    action: 'Order Baby Naming',
    accent: 'accent',
    glyph: 'cradle',
    header: {
      eyebrow: 'Vedic Namakaran · Sacred Baby Naming',
      title: 'Vedic Baby Naming & Nakshatra Initial Letters',
      description:
        'Determine the exact astrological initial sound vibrations (Namaksharas) for all 4 padas of the baby’s birth star. Includes ruling deities, animal/nature energies, and Vedic Gunam (innate strengths & virtues) analysis.'
    },
    note:
      'Every newborn naming certificate is carefully calculated and verified by our Vedic Priest & Astrologer team. Syllables and curated sacred names are sanctified and delivered directly to your registered email (with live order history tracked in your Customer Dashboard).'
  },
  {
    service: 'MUHURTHAM',
    route: 'muhurtham',
    title: 'Subha Muhurtham (6-Month Auspicious Dates)',
    category: 'Panchangam Auspicious Date Calendar',
    description:
      'Receive muhurtham dates across six months: the two months before your selected month, then that month and the following three. Available for 18 ceremonies including Wedding, Griha Pravesam, Bhoomi Pooja, Business Start, Annaprasanam, Seemantham, Upanayanam and more. Computed from tithi, nakshatra, yoga, karana, lagna and Guru-Sukra strength.',
    features: [
      '18 Vedic Ceremonies Covered',
      'Nalla Neram, Rahu Kalam & Yamaganda',
      'Tara Balam & Chandrashtama Star Checks',
      'English, Tamil & Hindi PDF Reports'
    ],
    action: 'Order Subha Muhurtham',
    accent: 'leaf',
    glyph: 'calendar',
    header: {
      eyebrow: 'Personalized Vedic Timing · Ceremony Muhurtham',
      title: 'Subha Muhurtham Report',
      description:
        'Enter the birth details, choose the ceremony, and select where you live or where the function will happen. Birth place is used for your Janma Nakshatra and Rasi; the selected Muhurtham location is used for the report dates and local times.'
    },
    note:
      'Every muhurtham scan is computed from the Drik Panchangam and reviewed by our India-based priest team, with Tara Balam and Chandrashtama star checks for the people involved before the report is issued.'
  }
];

export function catalogueFor(route: string): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.route === route);
}

/* -------------------------------------------------------- how it works page */
export const HOW_IT_WORKS_COPY = {
  heroEyebrow: 'A clear process, from start to finish',
  heroTitle: 'How ASTRO SIVAM works',
  heroLead: 'Your journey, clearly explained.',
  stepsTitle: 'Six steps. One considered journey.',
  trustEyebrow: 'TRADITIONAL REVIEW · CLEAR DELIVERY',
  trustTitle: 'Thoughtful astrology, with a process you can follow.',
  trustBody:
    'Our team reviews each order before delivery. Your astrological report and tax invoice are prepared as separate documents and sent together after approval.',
  ctaEyebrow: 'BEGIN WHEN YOU’RE READY',
  ctaTitle: 'Start with the service that matters to you.',
  ctaBody:
    'Explore a birth Jathagam, marriage compatibility, baby naming, or an auspicious Muhurtham consultation.'
};

/** src/pages/HowItWorksPage.tsx STEPS — titles, taglines, descriptions, features. */
export const HOW_IT_WORKS_STEPS = [
  {
    id: 1,
    title: 'Sign in securely',
    tagline: 'A private user account, ready in moments.',
    description: 'Sign in with Google or your email to open a secure, personal ASTRO SIVAM dashboard.',
    features: ['Google or email sign-in', 'Private user dashboard', 'A simple, guided start']
  },
  {
    id: 2,
    title: 'Choose a service',
    tagline: 'Find the Vedic service that fits your occasion.',
    description:
      'Explore Janma Kundali, marriage compatibility, baby naming, and Subha Muhurtham services.',
    features: ['Birth Jathagam & Kundali', '10-Porutham matching', 'Baby naming & Muhurtham']
  },
  {
    id: 3,
    title: 'Share the details',
    tagline: 'Birth information or ceremony preferences, entered with care.',
    description:
      'Provide the birth or event details needed for a careful reading; location search helps map coordinates.',
    features: ['Exact date and time', 'Ceremony and month preferences', 'Place search with coordinates']
  },
  {
    id: 4,
    title: 'Complete payment',
    tagline: 'Choose a convenient payment option for your region.',
    description:
      'Review the available checkout options: Google Pay / UPI in India, and PayPal with VISA, Mastercard, American Express and Discover for international customers worldwide.',
    features: [
      'Google Pay / UPI · India',
      'PayPal · Worldwide',
      'VISA · Mastercard · Amex · Discover'
    ]
  },
  {
    id: 5,
    title: 'The priest team prepares your report',
    tagline: 'A considered review of charts, timing, and tradition.',
    description:
      'Senior Sivachariyar scholars review the relevant chart, compatibility factors, or Panchanga windows for your service.',
    features: ['12-house Rāsi & D-9 preview', 'Dasha and Bhukti review', 'Panchanga & Tara Balam']
  },
  {
    id: 6,
    title: 'Review, approve, and deliver',
    tagline: 'Your report and official tax invoice travel together.',
    description:
      'After the administration reviews the order, the horoscope report and tax invoice are prepared and emailed directly to you.',
    features: ['Report PDF', 'Official tax invoice PDF', 'Email and client-portal delivery']
  }
];

/* ------------------------------------------------------------- other pages */
export const TEAM_PAGE_COPY = {
  eyebrow: 'India-Based Vedic Astrological Council',
  title: 'Our Vedic Astrological Team',
  lead:
    'ASTRO SIVAM collaborates directly with seasoned Sanskrit Vedic scholars and Jyothida Vidwans located in Tamil Nadu and Kerala (India). Every horoscope calculation, marriage compatibility score, baby naming certificate, and Subha Muhurtham date selection is calculated using classical ephemeris formulas and supported by our India-based astrology scholars.',
  badgePrimary: 'Daily 9:00 AM – 11:00 AM IST Preparation',
  badgeSecondary: 'Admin Approval & Verified PDF + Invoice Delivery',
  workflowTitle: 'How Our Team Collaborates With ASTRO SIVAM',
  workflow: [
    {
      step: '01',
      title: 'Customer Order & Coordinates',
      body:
        'When a user submits birth details, latitude, longitude, and timezone via Google Maps, the order enters our secure queue.'
    },
    {
      step: '02',
      title: 'Admin Approval & Vedic Review',
      body:
        'The ASTRO SIVAM administrator approves the order. The system triggers planetary ephemeris calculation with the backing of our India astrology team.'
    },
    {
      step: '03',
      title: 'Certified PDF Email Delivery',
      body:
        'Upon priest team verification and admin approval, the official PDF report and tax invoice are emailed directly to your registered email (with live status tracked in your Customer Dashboard).'
    }
  ],
  action: 'Order Your Birth Jathagam Report'
};

export const ABOUT_PAGE_COPY = {
  eyebrow: 'About ASTRO SIVAM',
  title: 'Authentic Vedic Astrology from Chennai, India to Global Users',
  lead:
    'Based in Chennai, India — serving Australia, New Zealand, USA, UK, Canada, Southeast Asia and the worldwide global community with sacred Vedic Jyotish wisdom — ASTRO SIVAM (astrosivam.com) is an authentic Vedic platform. Every reading, calculation, and horoscope is prepared directly by our revered India-based Vedic priest team daily between 9:00 AM – 11:00 AM IST, delivering mathematical precision, multilingual accessibility, and verified email delivery upon admin approval.',
  pillars: [
    {
      title: 'Chitra Paksha Lahiri Ephemeris',
      body:
        'We adhere strictly to the traditional sidereal Nirayana zodiac using standard Lahiri Ayanamsa and J2000 epoch astronomical matrices for planetary coordinates, house cusps, and dasha balances.'
    },
    {
      title: 'Absolute Privacy & Dignity',
      body:
        'All reports and certificates bear official ASTRO SIVAM branding exclusively. No third-party advertisements or promotional data is attached to your personal astrological documents.'
    },
    {
      title: 'Multilingual PDF Export',
      body:
        'Astrology reports and certificates are available for PDF export in English, Tamil, and Hindi, honoring the linguistic traditions of our global users and families.'
    }
  ],
  location: 'Chennai, India • Serving Australia, NZ, USA, UK, Canada & worldwide',
  missionTitle: 'Empowering Life Decisions Through Timeless Vedic Wisdom',
  missionBody:
    'Whether you are navigating career transitions, matching horoscopes for a sacred matrimony, or selecting an auspicious vibrational name for a newborn child, ASTRO SIVAM provides clear, verifiable, and sacred astrological clarity handled personally by our dedicated Vedic priest team.'
};

export const CONTACT_PAGE_COPY = {
  header: {
    eyebrow: 'Direct Astrological Inquiry · Support',
    title: 'Contact ASTRO SIVAM',
    description:
      'Have an inquiry regarding a service report, birth time clarification, or payment verification? Send us a message; it will be saved in our admin inbox for review.'
  },
  centre: 'Astrological Advisory Centre',
  addressLabel: 'Office Address',
  addressNote: 'Serving Australia, NZ, USA, UK, Canada & worldwide',
  emailLabel: 'Email Address',
  registrationLabel: 'Business Registration',
  facebookLabel: 'Official Facebook Page',
  inboxTitle: 'Administrator Inbox',
  inboxBody:
    'Inquiries are saved in our administrator inbox for review. For time-sensitive matters, please use the support contact details listed on this page.',
  inboxNote: '★ The team will respond as soon as possible.',
  formTitle: 'Send a Message to Admin',
  formTag: 'Admin Inbox',
  fields: {
    name: { label: 'Your full name', placeholder: 'e.g. Anand Prasad' },
    email: { label: 'Your Email Address', placeholder: 'e.g. anand@example.com' },
    subject: { label: 'Subject / Order Number', placeholder: 'e.g. Inquiry regarding Birth Horoscope or Order #AF-2026-1002' },
    message: { label: 'Message Details', placeholder: 'Write your questions, consultation notes, or report inquiry here...' }
  },
  submit: 'Send Message to Admin',
  submitting: 'Saving your message...',
  sentTitle: 'Message Received',
  sentBody: 'Your inquiry has been saved in the ASTRO SIVAM administrator inbox.',
  sendAnother: 'Send Another Message'
};

export const POLICY_META = {
  privacy: { tab: 'Privacy Policy', title: 'Privacy Policy', updated: 'January 2026' },
  terms: { tab: 'Terms & Conditions', title: 'Terms & Conditions', updated: 'January 2026' },
  payment: { tab: 'Payment Policy', title: 'Payment Policy', updated: 'January 2026' },
  refund: {
    tab: 'Refund & Cancellation',
    title: 'Refund & Cancellation Policy',
    updated: 'October 2026'
  }
} as const;

export type PolicyType = keyof typeof POLICY_META;

/** SEO titles from each page's own <SEO> block — the document title follows them. */
export const PAGE_TITLES: Record<PageKey, string> = {
  home: 'ASTRO SIVAM - Understand Your Life Through Vedic Astrology',
  services: 'ASTRO SIVAM - Vedic Astrology Services',
  'birth-jathagam': 'Birth Jathagam (Janma Kundali) Online Report | ASTRO SIVAM',
  'marriage-compatibility': '10 Porutham Online: Marriage Compatibility (Kundali Matching) | ASTRO SIVAM',
  'baby-naming': 'Vedic Baby Naming (Namakaranam) Report | ASTRO SIVAM',
  muhurtham: 'Subha Muhurtham: Auspicious Dates (6-Month Report) | ASTRO SIVAM',
  'how-it-works': 'How ASTRO SIVAM Works | ASTRO SIVAM',
  team: 'Our Vedic Scholars & Astrologers | ASTRO SIVAM',
  about: 'About Us - Authentic Vedic Astrology Heritage | ASTRO SIVAM',
  contact: 'Contact ASTRO SIVAM - Astrological Support & Inquiries',
  'policy-privacy': 'Privacy Policy | ASTRO SIVAM',
  'policy-terms': 'Terms of Service | ASTRO SIVAM',
  'policy-payment': 'Payment Policy | ASTRO SIVAM',
  'policy-refund': 'Refund & Cancellation Policy | ASTRO SIVAM'
};

export const FAQ_ITEMS: readonly FaqItem[] = HOME_FAQ_ITEMS;
export const SERVICE_FAQ: Record<ServiceType, readonly FaqItem[]> = {
  BIRTH_JATHAGAM: BIRTH_JATHAGAM_FAQ_ITEMS,
  MARRIAGE_COMPATIBILITY: MARRIAGE_COMPATIBILITY_FAQ_ITEMS,
  BABY_NAMING: BABY_NAMING_FAQ_ITEMS,
  MUHURTHAM: MUHURTHAM_FAQ_ITEMS
};

export const TESTIMONIALS = CURATED_TESTIMONIALS;
export const TEAM_MEMBERS = DEFAULT_TEAM_MEMBERS;
export const BUSINESS = BUSINESS_INFO;
