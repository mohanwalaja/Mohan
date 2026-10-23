/**
 * Homepage FAQ — the ONE source for both the visible <details> list in
 * pages/HomePage.tsx and the FAQPage JSON-LD built from it
 * (services/structuredData.ts). Structured data must describe what the visitor
 * can read on the page, so the two are never typed twice.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const HOME_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'When and how will I receive my report?',
    answer: 'Our India-based priest team checks all reports every 6 hours. Once every report is reviewed and the administrator approves it, your official PDF report and Tax Invoice are emailed directly to your registered address.'
  },
  {
    question: 'What birth details do I need?',
    answer: 'Please provide the person’s name, date of birth, exact time of birth, and birth place. Marriage Compatibility needs these details for both people. An accurate birth time and place improve the chart calculation.'
  },
  {
    question: 'Which calculation system and languages do you use?',
    answer: 'ASTRO SIVAM uses the sidereal zodiac with Chitra Paksha Lahiri Ayanamsa. Reports can be prepared in English, Tamil, or Hindi.'
  },
  {
    question: 'Which payment methods can I use?',
    answer: 'Available checkout methods include PayPal (accepting VISA, Mastercard, American Express, Discover and more), Credit/Debit Cards, and Google Pay / UPI for India. The options available to you are shown during checkout.'
  },
  {
    question: 'Can I see the report format before ordering?',
    answer: 'Yes. Each service page has an ‘Open sample PDF’ option that opens a full example made with fixed sample details. No customer data is used in a sample report.'
  }
];
