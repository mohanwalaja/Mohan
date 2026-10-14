/** Lightweight sample copy and watermark helpers — no calculation dependencies. */
import type { AppLanguage, ServiceType } from '../types';

/** The four services that publish a public sample report. */
export type SampleServiceType = ServiceType;

export const SAMPLE_SERVICE_TYPES: SampleServiceType[] = [
  'BIRTH_JATHAGAM',
  'MARRIAGE_COMPATIBILITY',
  'BABY_NAMING',
  'MUHURTHAM'
];

/**
 * THE fixed sample birth — 01/01/2000, 2:00 AM, Chennai.
 * Chennai (Madras) coordinates and the Indian Standard Time offset are used
 * both for the astronomy and for the "birth place" line of every sample PDF.
 */
export const SAMPLE_BIRTH = {
  dob: '2000-01-01',
  tob: '02:00',
  birthPlace: 'Chennai, Tamil Nadu, India',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5,
  timeZoneId: 'Asia/Kolkata'
} as const;

/** Fixed sample names shown on the sample reports (never customer data). */
export const SAMPLE_DEVOTEE_NAME = 'Karthik Raman';
export const SAMPLE_BABY_NAME = 'Aarav';
export const SAMPLE_GROOM_NAME = SAMPLE_DEVOTEE_NAME;
export const SAMPLE_BRIDE_NAME = 'Priya Devi';

/** Second fixed sample person — the bride of the Marriage Matching sample. */
export const SAMPLE_BRIDE = {
  ...SAMPLE_BIRTH,
  dob: '1998-06-15',
  tob: '06:30'
} as const;

/** The ceremony the Subha Muhurtham sample shows (fixed, not a user choice). */
export const SAMPLE_MUHURTHAM_EVENT_KEY = 'wedding';

/** Human-readable label of the fixed sample birth (used in the UI). */
export const SAMPLE_BIRTH_LABEL = '01/01/2000, 2:00 AM, Chennai (India)';
export const SAMPLE_BRIDE_LABEL = '15/06/1998, 6:30 AM, Chennai (India)';

/** Localized "SAMPLE REPORT" heading + explanation shown above the preview. */
export const SAMPLE_BANNER: Record<AppLanguage, { title: string; note: string }> = {
  en: {
    title: 'SAMPLE REPORT',
    note: 'Fixed example details — no customer data is used. Your own report is calculated from the birth details you enter.'
  },
  ta: {
    title: 'மாதிரி அறிக்கை',
    note: 'நிலையான எடுத்துக்காட்டு விவரங்கள் — வாடிக்கையாளர் தரவு எதுவும் பயன்படுத்தப்படவில்லை. உங்கள் அறிக்கை நீங்கள் உள்ளிடும் பிறப்பு விவரங்களிலிருந்து கணக்கிடப்படும்.'
  },
  hi: {
    title: 'नमूना रिपोर्ट',
    note: 'निश्चित उदाहरण विवरण — किसी ग्राहक का डेटा उपयोग नहीं किया गया है। आपकी रिपोर्ट आपके द्वारा भरे गए जन्म विवरण से गणना की जाती है।'
  }
};

/** One-line description of the fixed details behind each sample. */
export function sampleDetailsLine(serviceType: SampleServiceType, lang: AppLanguage = 'en'): string {
  if (serviceType === 'MARRIAGE_COMPATIBILITY') {
    return lang === 'ta'
      ? `நிலையான எடுத்துக்காட்டு: மணமகன் ${SAMPLE_BIRTH_LABEL} • மணமகள் ${SAMPLE_BRIDE_LABEL}`
      : lang === 'hi'
        ? `निश्चित उदाहरण: वर ${SAMPLE_BIRTH_LABEL} • वधू ${SAMPLE_BRIDE_LABEL}`
        : `Fixed example: Groom ${SAMPLE_BIRTH_LABEL} • Bride ${SAMPLE_BRIDE_LABEL}`;
  }
  if (serviceType === 'MUHURTHAM') {
    return lang === 'ta'
      ? `நிலையான எடுத்துக்காட்டு: பிறந்தது ${SAMPLE_BIRTH_LABEL} • திருமண விழா • அடுத்த ஆறு மாதங்கள்`
      : lang === 'hi'
        ? `निश्चित उदाहरण: जन्म ${SAMPLE_BIRTH_LABEL} • विवाह समारोह • अगले छह महीने`
        : `Fixed example: born ${SAMPLE_BIRTH_LABEL} • Wedding ceremony • next six-month window`;
  }
  return lang === 'ta'
    ? `நிலையான எடுத்துக்காட்டு: ${SAMPLE_BIRTH_LABEL}`
    : lang === 'hi'
      ? `निश्चित उदाहरण: ${SAMPLE_BIRTH_LABEL}`
      : `Fixed example: ${SAMPLE_BIRTH_LABEL}`;
}

/** Title used by the sample preview modal. */
export function sampleReportTitle(serviceType: SampleServiceType, lang: AppLanguage = 'en'): string {
  const title: Record<SampleServiceType, Record<AppLanguage, string>> = {
    BIRTH_JATHAGAM: {
      en: 'Sample Report — Birth Jathagam',
      ta: 'மாதிரி அறிக்கை — பிறந்த ஜாதகம்',
      hi: 'नमूना रिपोर्ट — जन्म कुंडली'
    },
    MARRIAGE_COMPATIBILITY: {
      en: 'Sample Report — Marriage Compatibility (10 Poruthams)',
      ta: 'மாதிரி அறிக்கை — திருமணப் பொருத்தம் (10 பொருத்தங்கள்)',
      hi: 'नमूना रिपोर्ट — विवाह मिलान (10 पोरुतम)'
    },
    BABY_NAMING: {
      en: 'Sample Report — Vedic Baby Naming Certificate',
      ta: 'மாதிரி அறிக்கை — குழந்தைப் பெயர் சூட்டுதல் சான்றிதழ்',
      hi: 'नमूना रिपोर्ट — वैदिक शिशु नामकरण प्रमाणपत्र'
    },
    MUHURTHAM: {
      en: 'Sample Report — Subha Muhurtham Calendar',
      ta: 'மாதிரி அறிக்கை — சுப முகூர்த்த நாட்காட்டி',
      hi: 'नमूना रिपोर्ट — शुभ मुहूर्त कैलेंडर'
    }
  };
  return title[serviceType][lang];
}

/** Download name of the sample PDF. */
export function sampleReportFileName(serviceType: SampleServiceType, lang: AppLanguage): string {
  const part: Record<SampleServiceType, string> = {
    BIRTH_JATHAGAM: 'Birth_Jathagam',
    MARRIAGE_COMPATIBILITY: 'Marriage_Matching',
    BABY_NAMING: 'Baby_Naming',
    MUHURTHAM: 'Subha_Muhurtham'
  };
  return `ASTRO_SIVAM_Sample_${part[serviceType]}_${String(lang).toUpperCase()}.pdf`;
}

/**
 * The Muhurtham sample window: automatically the same "current month + 2"
 * anchor the Subha Muhurtham page defaults to, so the sample always shows
 * upcoming auspicious dates. This is derived, never chosen by the visitor.
 */
export function sampleMuhurthamMonth(now: Date = new Date()): string {
  const target = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * SAMPLE watermark
 * ------------------------------------------------------------------ */

export const SAMPLE_WATERMARK_TEXT = 'SAMPLE';
const SAMPLE_WATERMARK_STYLE_ID = 'astro-sample-watermark-style';

/**
 * CSS for the per-page watermark. Injected into the report document itself, so
 * the watermark is part of the live preview, the html2canvas capture and the
 * HTML→PDF export alike.
 */
const SAMPLE_WATERMARK_STYLE = `<style id="${SAMPLE_WATERMARK_STYLE_ID}">
  .astro-sample-watermark {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 60;
    overflow: hidden;
  }
  .astro-sample-watermark span {
    font-family: 'Cinzel', 'Noto Sans', 'Noto Sans Tamil', 'Noto Sans Devanagari', serif;
    font-size: 92px;
    font-weight: 900;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(180, 83, 9, 0.13);
    transform: rotate(-28deg);
    white-space: nowrap;
  }
</style>`;

/** The watermark node placed inside every A4 page of a sample report. */
export const SAMPLE_WATERMARK_MARKUP =
  `<div class="astro-sample-watermark" aria-hidden="true"><span>${SAMPLE_WATERMARK_TEXT}</span></div>`;

/**
 * Matches the opening tag of a report page (`class="page"` or
 * `class="page some-page-class"`) that is NOT already followed by the
 * watermark. Deliberately does NOT match other classes that merely start with
 * "page" (e.g. `.page-bottom-brand`). The negative lookahead keeps the
 * function idempotent, so calling it twice can never double-stamp a page.
 */
const SAMPLE_PAGE_OPEN_TAG = /<div\s+class="page(?:\s[^"]*)?"[^>]*>(?!<div class="astro-sample-watermark")/gi;

/** Counts the watermarks already present in a report HTML string. */
export function countSampleWatermarks(html: string): number {
  if (!html) return 0;
  return (html.match(/class="astro-sample-watermark"/g) || []).length;
}

/**
 * Adds the light "SAMPLE" watermark to EVERY page of a report HTML document.
 * The function is idempotent and never alters the report content itself.
 */
export function applySampleWatermark(html: string): string {
  if (!html || typeof html !== 'string') return html;

  let output = html;
  if (!output.includes(SAMPLE_WATERMARK_STYLE_ID)) {
    output = output.includes('</head>')
      ? output.replace(/<\/head>/i, `${SAMPLE_WATERMARK_STYLE}\n</head>`)
      : `${SAMPLE_WATERMARK_STYLE}\n${output}`;
  }
  return output.replace(SAMPLE_PAGE_OPEN_TAG, tag => `${tag}${SAMPLE_WATERMARK_MARKUP}`);
}
