import type { DisplayReview } from '../types';

/**
 * Curated testimonials shown on the homepage alongside verified customer
 * reviews (SEO audit 2026-10-15, finding 3).
 *
 * These six predate the review system and were added by the site owner. They
 * are kept exactly as published — wording, names, places and dates — because
 * re-dating or rewording a review would misrepresent it. Each one is now tied
 * to the service page it is about (`serviceCode`), and its date is machine-
 * readable ISO 8601 at the precision actually known (the month).
 *
 * `verifiedPurchase` is false: these were not submitted through an order, so
 * the homepage does not label them "Verified purchase". Freshness now comes
 * from real customers — every paid, delivered order can be reviewed from the
 * customer dashboard (api/reviews.php), and approved reviews are listed
 * before these.
 *
 * If you know a testimonial's exact day, use YYYY-MM-DD; never invent one.
 */
export const CURATED_TESTIMONIALS: readonly DisplayReview[] = [
  {
    id: 'curated-1',
    authorName: 'Rajesh & Priya Sharma',
    location: 'Chennai, Tamil Nadu, India',
    serviceCode: 'MARRIAGE_COMPATIBILITY',
    serviceLabel: 'Marriage Compatibility (Porutham)',
    rating: 5,
    datePublished: '2026-02',
    body: 'The 10 Poruthams matching report was so detailed and respectful. The explanations on Nakshatra alignment and Dasa Sandhi gave our families total peace of mind. Truly authentic traditional guidance from our revered priest team.',
    verifiedPurchase: false
  },
  {
    id: 'curated-2',
    authorName: 'Kavita Maharaj',
    location: 'Sydney, Australia',
    serviceCode: 'BIRTH_JATHAGAM',
    serviceLabel: 'Janma Jathagam (Birth Horoscope)',
    rating: 5,
    datePublished: '2026-01',
    body: 'Received my full Rasi and Navamsa chart with complete Vimshottari Dasa timeline within hours of admin approval. Clear, uplifting, and devoid of unnecessary fear. Highly recommended!',
    verifiedPurchase: false
  },
  {
    id: 'curated-3',
    authorName: 'Amit & Deepa Prasad',
    location: 'Auckland, New Zealand',
    serviceCode: 'BABY_NAMING',
    serviceLabel: 'Baby Naming (Namakaranam)',
    rating: 5,
    datePublished: '2026-02',
    body: 'We found the most beautiful Vedic name for our baby girl starting with the auspicious nakshatra syllables provided in the report. The printable birth certificate is framed in our nursery.',
    verifiedPurchase: false
  },
  {
    id: 'curated-6',
    authorName: 'Ganesh Iyer',
    location: 'Kuala Lumpur, Malaysia',
    serviceCode: 'MUHURTHAM',
    serviceLabel: 'Subha Muhurtham (Auspicious Dates)',
    rating: 5,
    datePublished: '2026-02',
    body: 'The 6-month muhurtham calendar made fixing our Griha Pravesam date so easy. Every auspicious window came with its Nalla Neram timings, verified by the priest team. Excellent authentic Panchangam work.',
    verifiedPurchase: false
  },
  {
    id: 'curated-4',
    authorName: 'Sunil Kumar',
    location: 'Bengaluru, Karnataka, India',
    serviceCode: 'BIRTH_JATHAGAM',
    serviceLabel: 'Janma Jathagam',
    rating: 5,
    datePublished: '2026-01',
    body: 'Very easy to order and pay using Google Pay UPI QR. The report arrived directly in my email with high-resolution chart diagrams in both English and Tamil. Excellent Vedic analysis.',
    verifiedPurchase: false
  },
  {
    id: 'curated-5',
    authorName: 'Meena Pillay',
    location: 'Vancouver, Canada',
    serviceCode: 'BIRTH_JATHAGAM',
    serviceLabel: 'Janma Jathagam & Dasa Analysis',
    rating: 5,
    datePublished: '2025-12',
    body: 'The precision of the Lahiri calculations matched my family priest in Tamil Nadu exactly. The clear transit predictions and planet strength indicators are wonderful.',
    verifiedPurchase: false
  }
];
