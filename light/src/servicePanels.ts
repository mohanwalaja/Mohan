/**
 * ASTRO SIVAM — light UI: the four report pages' own content blocks.
 *
 * Wording source (unchanged, page by page):
 *   • panel headings + bullets → the side column of each live service page
 *   • verification notes        → each page's "Priest Team …" assurance box
 *   • related links             → each page's <RelatedReports> list
 *   • FAQ heading + intro       → each page's <ServiceFaqSection> props
 *   • sample panel              → the site's own sample-report wording
 */
import type { ServiceType } from '@shared/types';
import { SAMPLE_BIRTH_LABEL } from '@shared/services/sampleReportInfo';
import type { PageKey } from './appConfig';

export interface AsidePanel {
  heading: string;
  /** Optional intro paragraph above the bullets. */
  intro?: string;
  items: Array<{ title: string; text: string }>;
}

export interface ServicePanels {
  /** Heading + bullets shown beside the form on the live page. */
  aside: AsidePanel;
  /** The sample-report explanation on the live page (fixed example details). */
  sampleNote: string;
  /** Heading + body of the page's priest-team assurance box. */
  assurance: { heading: string; body: string };
  faq: { heading: string; intro: string };
  related: Array<{ route: PageKey; label: string }>;
  /** Live "what's included" / verification note printed next to the order form. */
  note: string;
}

export const SERVICE_PANELS: Record<ServiceType, ServicePanels> = {
  BIRTH_JATHAGAM: {
    aside: {
      heading: 'What is included in the Birth Jathagam PDF?',
      items: [
        {
          title: '12 Vedic Bhavas & Houses',
          text: 'Detailed positions of Ascendant (Lagna) and all 12 astrological houses.'
        },
        {
          title: 'Navagraha Positions & Degrees',
          text: 'Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu with exact degrees and retrogradation.'
        },
        {
          title: 'Rasi & Navamsa (D-9) Charts',
          text: 'Authentic South & North Indian chart layouts based on Chitra Paksha Lahiri Ayanamsa.'
        },
        {
          title: 'Vimshottari Mahadasha Timeline',
          text: 'Complete major planetary periods from birth up to 120 years with current Bhukti.'
        },
        {
          title: 'Sade Sati (Sani) & Dosha Status',
          text: 'Sevvay, Rahu-Ketu, Kala Sarpa evaluation with traditional remedies.'
        },
        {
          title: '8 Life Aspect Indications',
          text: 'Health, Wealth, Career, Education, Marriage, Family, Foreign Travel & Current Period Guidance.'
        }
      ]
    },
    sampleNote:
      'Open a complete sample Birth Jathagam PDF — every bhava, chart, dasha table and life-aspect page exactly as delivered, with a light SAMPLE watermark. The sample uses fixed example details (01 Jan 2000, 2:00 AM, Chennai) and no customer data is ever used.',
    assurance: {
      heading: 'ASTRO SIVAM Priest Team Sanctification & Quality Assurance',
      body:
        'Every order is assigned to our experienced Vedic Astrologer & Priest team for thorough planetary review. Your certified Vedic PDF horoscope report and Tax Invoice will be prepared, sanctified, and delivered directly to your registered email (with live order history tracked in your Customer Dashboard).'
    },
    faq: {
      heading: 'Birth Jathagam (Janma Kundali) — questions, answered',
      intro: 'What the report contains, how the calculation is done, and how it reaches you.'
    },
    related: [
      { route: 'marriage-compatibility', label: '10 Porutham marriage compatibility (Kundali matching)' },
      { route: 'muhurtham', label: 'Subha Muhurtham auspicious dates' },
      { route: 'baby-naming', label: 'Baby naming by nakshatra (Namakaran)' }
    ],
    note:
      'Every birth horoscope is calculated and carefully verified by our dedicated Vedic priest and astrologer team using authentic Drik Panchanga and Chitra Paksha Lahiri principles. All charts are sanctified before official report generation.'
  },

  MARRIAGE_COMPATIBILITY: {
    aside: {
      heading: 'The 10 Classical Poruthams Evaluated',
      items: [
        { title: 'Dina Porutham', text: 'Longevity, health, vitality, and prosperity for the couple.' },
        {
          title: 'Gana Porutham',
          text: 'Temperament, emotional resonance, and compatibility of natures (Deva, Manushya, Rakshasa).'
        },
        { title: 'Mahendra Porutham', text: 'Children, lineage continuity, and marital happiness.' },
        {
          title: 'Stree Dheerkha',
          text: 'Financial security, longevity, and auspicious well-being of the bride.'
        },
        { title: 'Yoni Porutham', text: 'Physical intimacy and mutual biological harmony.' },
        {
          title: 'Rasi & Rasiyathipathi',
          text: 'Mental affinity, friendship, and harmonious relationship between planetary rulers.'
        },
        {
          title: 'Rajju & Vedha (Crucial)',
          text: 'Marital bond longevity, auspicious tying of the knot, and freedom from afflictions.'
        },
        {
          title: 'Kuja / Sevvay Dosham (Manglik)',
          text: 'Complete Mars placement balance analysis and traditional remedies.'
        }
      ]
    },
    sampleNote:
      'Open a complete sample Marriage Compatibility PDF — the 10 Porutham verdicts, Rajju & Vedha checks and Kuja Dosha analysis exactly as delivered, with a light SAMPLE watermark. The sample uses fixed example details (Groom 01 Jan 2000, 2:00 AM, Chennai · Bride 15 Jun 1998, 6:30 AM, Chennai) and no customer data is ever used.',
    assurance: {
      heading: 'ASTRO SIVAM Priest Team Porutham Assessment & Privacy',
      body:
        'Every matrimonial match is meticulously analyzed by our venerable Vedic Priest and Astrologer team. All 10 Poruthams, Rajju alignments, and Kuja Dosha balances are thoroughly evaluated before your certified compatibility PDF report and Tax Invoice are delivered directly to your registered email (with live order history tracked in your Customer Dashboard).'
    },
    faq: {
      heading: '10 Porutham marriage matching — questions, answered',
      intro:
        'What the 10 Poruthams check, what you need, and how the compatibility report reaches you.'
    },
    related: [
      { route: 'birth-jathagam', label: 'Birth Jathagam (Janma Kundali) for each partner' },
      { route: 'muhurtham', label: 'Subha Muhurtham for the wedding date' },
      { route: 'baby-naming', label: 'Baby naming by nakshatra (Namakaran)' }
    ],
    note:
      'Every matrimonial match is calculated and carefully reviewed by our Vedic priest and astrologer team using classical Porutham rules, Rajju and Vedha checks and Kuja Dosha cancellation principles.'
  },

  BABY_NAMING: {
    aside: {
      heading: 'Why Vedic Nakshatra Naming Matters',
      intro:
        'In Vedic Jyotisha, the Moon’s exact position at the moment of birth activates a specific sound frequency (Namakshara). Naming a newborn with this vibrational syllable brings harmony, mental clarity, health, and auspicious planetary protection throughout life.',
      items: [
        {
          title: 'Exact Janma Pada Syllables',
          text: 'Auspicious starting letters for all 4 padas of the birth star.'
        },
        {
          title: 'Nakshatra Lord & Astronomical Attributes',
          text: 'Planetary lord, gana, yoni archetype, and rajju classification.'
        },
        {
          title: 'Curated Vedic Names',
          text: 'Authentic traditional and contemporary baby names with sacred meanings.'
        },
        {
          title: 'Official ASTRO SIVAM Certificate',
          text: 'Commemorative naming certificate PDF delivered directly to your inbox.'
        }
      ]
    },
    sampleNote:
      'Open a complete sample Vedic Baby Naming Certificate — the Namakshara syllables for all four padas, the curated name list and the naming certificate exactly as delivered, with a light SAMPLE watermark. The sample uses fixed example details (01 Jan 2000, 2:00 AM, Chennai) and no customer data is ever used.',
    assurance: {
      heading: 'ASTRO SIVAM Priest Team Sanctification & Privacy Assurance',
      body:
        'Every newborn naming certificate is carefully calculated and verified by our Vedic Priest & Astrologer team. Syllables and curated sacred names are sanctified and delivered directly to your registered email (with live order history tracked in your Customer Dashboard).'
    },
    faq: {
      heading: 'Baby naming by nakshatra — questions, answered',
      intro:
        'How the janma nakshatra fixes the naming syllables, what the report contains, and delivery.'
    },
    related: [
      { route: 'birth-jathagam', label: 'Birth Jathagam (Janma Kundali) for the baby' },
      { route: 'muhurtham', label: 'Subha Muhurtham for the Namakaranam ceremony' },
      { route: 'marriage-compatibility', label: '10 Porutham marriage compatibility' }
    ],
    note:
      'Every newborn naming certificate is carefully calculated and verified by our Vedic Priest & Astrologer team. Syllables and curated sacred names are sanctified and delivered directly to your registered email (with live order history tracked in your Customer Dashboard).'
  },

  MUHURTHAM: {
    aside: {
      heading: 'What is included in the Subha Muhurtham PDF?',
      items: [
        {
          title: '6-Month Auspicious Date Matrix',
          text: 'The two months before your selected month, that month and the following three.'
        },
        {
          title: '18 Vedic Ceremonies Covered',
          text: 'Wedding, Griha Pravesam, Bhoomi Pooja, Business Start, Annaprasanam, Seemantham, Upanayanam and more.'
        },
        {
          title: 'Nalla Neram, Rahu Kalam & Yamaganda',
          text: 'Timings worked out for your function location’s local sunrise and timezone.'
        },
        {
          title: 'Tara Balam & Chandrashtama Checks',
          text: 'Dates are checked against your own Janma Nakshatra and Rasi from your birth details.'
        },
        {
          title: 'English, Tamil & Hindi PDF',
          text: 'Choose your report language; the approved PDF is emailed to you.'
        }
      ]
    },
    sampleNote:
      'Open a complete sample Subha Muhurtham PDF — the six-month auspicious date matrix, Panchangam, Nalla Neram windows and local timings exactly as delivered, with a light SAMPLE watermark. The sample uses fixed example details (01 Jan 2000, 2:00 AM, Chennai) and no customer data is ever used.',
    assurance: {
      heading: 'ASTRO SIVAM Priest Team Panchangam Review & Quality Assurance',
      body:
        'Every Muhurtham report is calculated with the Chitra Paksha Lahiri ephemeris and reviewed by our Vedic priest and astrologer team before approval. Your approved PDF report is emailed to your registered address, with live order history in your Customer Dashboard.'
    },
    faq: {
      heading: 'Subha Muhurtham — questions, answered',
      intro: 'Which ceremonies are covered, how the six-month date matrix is built, and delivery.'
    },
    related: [
      { route: 'marriage-compatibility', label: '10 Porutham marriage compatibility' },
      { route: 'birth-jathagam', label: 'Birth Jathagam (Janma Kundali)' },
      { route: 'baby-naming', label: 'Baby naming by nakshatra (Namakaran)' }
    ],
    note:
      'Every muhurtham scan is computed from the Drik Panchangam and reviewed by our India-based priest team, with Tara Balam and Chandrashtama star checks for the people involved before the report is issued.'
  }
};

/** The site's own sample-report wording (labels from SampleReportButton). */
export const SAMPLE_REPORT_COPY = {
  heading: 'See the report before you order',
  button: 'View Sample Report (PDF)',
  fixedExample: `Fixed example: ${SAMPLE_BIRTH_LABEL}`,
  note: 'The sample report always uses fixed example details (01 Jan 2000, 2:00 AM, Chennai) and a light SAMPLE watermark — no form filling needed.'
};

/** Live <RelatedReports> eyebrow. */
export const RELATED_REPORTS_EYEBROW = 'Complete your reading';
