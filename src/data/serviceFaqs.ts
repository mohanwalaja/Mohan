/**
 * Service-page FAQs — the ONE source for both the visible <details> list each
 * service page renders (via components/common/ServiceFaqSection.tsx) and the
 * FAQPage JSON-LD built from it (services/structuredData.ts).
 *
 * Why these exist (index-coverage audit 2026-10-16): a site: query returned
 * only the homepage even though every service page is indexable. The money
 * pages (10-Porutham matching, baby naming by nakshatra, …) were thin —
 * almost nothing but a form — and Google had little unique content to rank.
 * Each FAQ below is service-specific, states only what the product really
 * does (delivery, calculation system, languages, sample reports), and must
 * stay verbatim-true to the page: the prerender guard
 * (scripts/prerender.mjs faqStructuredDataProblems) fails the build if a
 * question or answer is not visible on the page.
 *
 * Shared delivery/payment/calculation facts (kept in sync with the homepage
 * FAQ in src/data/homeFaq.ts):
 *   - reports are checked every 6 hours by the India-based priest team,
 *     approved by the administrator, then emailed (PDF + Tax Invoice);
 *   - sidereal zodiac with Chitra Paksha Lahiri Ayanamsa;
 *   - English, Tamil or Hindi;
 *   - PayPal / cards / Google Pay + UPI (India).
 */
import type { FaqItem } from './homeFaq';

export const MARRIAGE_COMPATIBILITY_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'What is 10 Porutham (Thirumana Porutham) marriage matching?',
    answer: 'Thirumana Porutham is the classical Vedic compatibility test for a couple. The report evaluates all 10 Poruthams — Dina, Gana, Mahendra, Stree Dheerkha, Yoni, Rasi, Rasiyathipathi, Vasiya, Rajju and Vedha — and adds a complete Kuja (Mars) Dosha analysis with dosha balance (Samyam) before the priest team issues a certified compatibility verdict.'
  },
  {
    question: 'What details do I need to check 10 Porutham online?',
    answer: 'Both partners’ full name, date of birth, exact time of birth and birth place. An accurate birth time and place improve the chart calculation; when the birth time is truly unknown, the form defaults to 12:00 PM so you can still proceed.'
  },
  {
    question: 'What does the Marriage Compatibility report contain?',
    answer: 'A PDF with each of the 10 Porutham verdicts, the Rajju & Vedha checks, the Kuja (Mars) Dosha analysis and balance, and the priest team’s compatibility assessment. Your order, and its delivery status, is tracked in the Customer Dashboard.'
  },
  {
    question: 'When and how will I receive my Porutham report?',
    answer: 'Our India-based priest team checks all reports every 6 hours. Following administrator approval, your official PDF report and Tax Invoice are emailed to your registered address — please check your Spam / Junk folder as well.'
  },
  {
    question: 'Can couples outside India use the Porutham matching?',
    answer: 'Yes. ASTRO SIVAM serves couples worldwide: pick the birth place on the map (or use GPS auto-detect), choose the report language — English, Tamil or Hindi — and pay by card, PayPal or, for India, Google Pay / UPI.'
  }
];

export const BABY_NAMING_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'How does baby naming by nakshatra work?',
    answer: 'In Vedic Jyotisha, the Moon’s exact position at the moment of birth determines the Janma Nakshatra and its Pada, which fixes the set of auspicious first syllables (Namakshara) for the child’s name. The report names those syllables and selects curated names that begin with them, so the name carries the child’s birth-star sound.'
  },
  {
    question: 'What is included in the Baby Naming (Namakaran) report?',
    answer: 'The Janma Nakshatra details, the pada syllables, curated Tamil, Sanskrit and Hindi name suggestions, and an official ASTRO SIVAM naming certificate PDF, delivered by email with the Tax Invoice.'
  },
  {
    question: 'Which details do I need for a Namakaran report?',
    answer: 'The baby’s date of birth, exact time of birth, birth place and gender. The exact birth time matters, because the Pada — and therefore the syllables — changes within a nakshatra.'
  },
  {
    question: 'When and how will I receive the baby naming report?',
    answer: 'Our India-based priest team checks all reports every 6 hours. Following administrator approval, your PDF certificate and Tax Invoice are emailed to your registered address — please check your Spam / Junk folder as well.'
  },
  {
    question: 'Can I see the certificate format before ordering?',
    answer: 'Yes. The “View Sample Report” option opens a complete example certificate made with fixed sample details (01 Jan 2000, 2:00 AM, Chennai). No customer data is ever used in a sample.'
  }
];

export const BIRTH_JATHAGAM_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'What is a Birth Jathagam (Janma Kundali) report?',
    answer: 'Your complete natal horoscope, calculated from the exact moment and place of birth: the 12 Bhavas, Navagraha planetary longitudes, Rasi and Navamsa charts, the Vimshottari Mahadasha timeline, Sade Sati & Dosha analysis, and 8 personalized life aspect predictions.'
  },
  {
    question: 'How accurate is the online Jathagam calculation?',
    answer: 'Charts are computed from a precision sidereal ephemeris using the Chitra Paksha Lahiri Ayanamsa, and every report is checked by the India-based priest team before it is released. The exact birth time and place drive the lagna and house placement, so a verified birth time gives the most accurate reading.'
  },
  {
    question: 'What if I don’t know my exact birth time?',
    answer: 'The form defaults to 12:00 PM when the birth time is unknown, so you can still order. If you can confirm the time later — from a birth certificate or hospital record — an exact time always improves the lagna and dasha readings.'
  },
  {
    question: 'When and how will I receive my Jathagam report?',
    answer: 'Our India-based priest team checks all reports every 6 hours. Following administrator approval, your official PDF report and Tax Invoice are emailed to your registered address — please check your Spam / Junk folder as well.'
  },
  {
    question: 'Can I see a sample Jathagam report before ordering?',
    answer: 'Yes. The “View Sample Report” option opens a complete example report — every bhava, chart, dasha table and life-aspect page — made with fixed sample details (01 Jan 2000, 2:00 AM, Chennai). No customer data is ever used in a sample.'
  }
];

export const MUHURTHAM_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'What is Subha Muhurtham (auspicious date) selection?',
    answer: 'Muhurtham is the traditional selection of an auspicious date and time for an event. We compute it from tithi, nakshatra, yoga, karana, lagna and Guru–Sukra strength, and mark the Nalla Neram best-time windows for the ceremony you choose.'
  },
  {
    question: 'Which ceremonies can I choose a Muhurtham for?',
    answer: '18 Vedic ceremonies, including Wedding, Engagement, Griha Pravesam, house purchase, house construction, land purchase, shifting home, Business Start, New Job, gold and vehicle purchase, Education Start, Namakaranam, Annaprasanam, Seemantham, Upanayanam, Karnavedha and Mundan.'
  },
  {
    question: 'How far ahead does the Muhurtham report look?',
    answer: 'Six months: the two months before the month you select, that month itself, and the following three months — a full auspicious date matrix with local time windows.'
  },
  {
    question: 'Which location should I enter — my birth place or where the event happens?',
    answer: 'Both, for different reasons. The birth place is used for the Janma Nakshatra and Rasi, while a separate Muhurtham location — where you live or where the function will happen — is used for the report dates and local times.'
  },
  {
    question: 'When and how will I receive my Muhurtham report?',
    answer: 'Our India-based priest team checks all reports every 6 hours. Following administrator approval, your official PDF report and Tax Invoice are emailed to your registered address — please check your Spam / Junk folder as well.'
  }
];
