/**
 * ASTRO SIVAM — registered business identity (single source of truth).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The enterprise is registered in INDIA as a Micro, Small & Medium Enterprise
 * (MSME) under the Udyam Registration scheme run by the Ministry of Micro,
 * Small & Medium Enterprises, Government of India. The registration number is
 * a legal disclosure, so it has to be printed on every document the customer
 * keeps (tax invoices and payment receipts) and be publicly visible on the
 * website — and it has to be the SAME string everywhere. Retyping it into each
 * template is how a document ends up quoting a stale or mistyped number.
 *
 * The number is therefore written exactly once per runtime:
 *   • this module  — every frontend surface (invoice HTML, footer, About,
 *     Contact, policy pages); and
 *   • `ASTRO_BUSINESS_REG_NO` in `api/branding.php` — the PHP side, which
 *     renders the server-side mPDF invoice copies of the same documents.
 *
 * The two constants must stay identical; the invoice is rendered by BOTH
 * `src/services/invoiceHtmlBuilder.ts` (browser / jsPDF capture, and the email
 * attachment built in the admin portal) and
 * `api/astrology/pdf_mpdf_invoice.php` (server mPDF), so both renderers read
 * the number from their own constant instead of hard-coding it.
 */

export const BUSINESS_INFO = {
  legalName: 'ASTRO SIVAM',
  website: 'astrosivam.com',
  supportEmail: 'admin@astrosivam.com',
  country: 'India',
  countryCode: 'IN',
  state: 'Tamil Nadu',
  city: 'Chennai',
  /** Registered office as it is printed on invoices and shown in the footer. */
  registeredOffice: 'Chennai, Tamil Nadu, India',
  enterpriseType: 'Micro, Small & Medium Enterprise (MSME)',
  registrationScheme: 'Udyam Registration',
  registrationAuthority:
    'Ministry of Micro, Small & Medium Enterprises, Government of India',
  /** Udyam Registration Number issued by the Government of India. */
  registrationNumber: 'UDYAM-TN-35-0058124',
  /** Short label that always precedes the number. */
  registrationLabel: 'Udyam Reg. No.',
  /** Blog-friendly status line used by the website. */
  registrationStatus: 'Registered MSME in India',
} as const;

/** `Udyam Reg. No. UDYAM-TN-35-0058124` — the bare labelled number. */
export const BUSINESS_REGISTRATION_SHORT =
  `${BUSINESS_INFO.registrationLabel} ${BUSINESS_INFO.registrationNumber}`;

/**
 * `Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)` — the single-line form
 * used in document metadata rows (invoice header meta, report footers), where
 * the country matters because customers are served worldwide.
 */
export const BUSINESS_REGISTRATION_META =
  `${BUSINESS_REGISTRATION_SHORT} (MSME, India)`;

/**
 * `Registered MSME in India • Udyam Reg. No. UDYAM-TN-35-0058124` — the
 * website form, where the status is the readable part and the number is the
 * verifiable part.
 */
export const BUSINESS_REGISTRATION_DISPLAY =
  `${BUSINESS_INFO.registrationStatus} • ${BUSINESS_REGISTRATION_SHORT}`;

/**
 * Full declaration sentence for invoices/receipts. Written on its own so the
 * single-order invoice, the consolidated family invoice and any future
 * financial document certify the same registered entity in the same words.
 */
export function businessRegistrationSentence(): string {
  return (
    `${BUSINESS_INFO.legalName} is registered in ${BUSINESS_INFO.country} as a ` +
    `${BUSINESS_INFO.enterpriseType} under ${BUSINESS_INFO.registrationScheme} ` +
    `No. ${BUSINESS_INFO.registrationNumber}, with its registered office at ` +
    `${BUSINESS_INFO.registeredOffice}.`
  );
}
