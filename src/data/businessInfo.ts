/**
 * ASTRO SIVAM — business identity & office address (single source of truth).
 *
 * WHERE EACH PIECE IS ALLOWED TO APPEAR (owner's instruction)
 * ----------------------------------------------------------
 *   • REGISTRATION NUMBER → the tax invoice (both layouts, both renderers) and
 *     the Contact page. Not in the footer, About page, policy pages or the
 *     JSON-LD block.
 *   • OFFICE ADDRESS → the Contact page ONLY. It is never printed on an invoice
 *     and never repeated elsewhere.
 *
 * WHY THIS LIVES IN A MODULE
 * --------------------------
 * The invoice is rendered twice by runtimes that cannot import each other:
 *   • in the browser by src/services/invoiceHtmlBuilder.ts (live preview, the
 *     customer download and the admin "Approved" email attachment), and
 *   • on the server by api/astrology/pdf_mpdf_invoice.php (mPDF).
 * Both read these helpers, so the number cannot drift between the two copies of
 * the same document. The PHP mirror of the number is `ASTRO_BUSINESS_REG_NO` in
 * `api/branding.php`.
 *
 * The address is the classic piece of copy that gets retyped slightly
 * differently in each template (a dropped PIN, "Kamakshi Puram" vs "Kamakshipuram"),
 * so it is written once, as data lines, and the Contact page renders it.
 *
 * `tests/business-registration.test.ts` executes both invoice renderers and
 * scans the shipped tree to hold this policy in place.
 */

export const BUSINESS_INFO = {
  legalName: 'ASTRO SIVAM',
  website: 'astrosivam.com',
  supportEmail: 'admin@astrosivam.com',
  country: 'India',
  countryCode: 'IN',
  state: 'Tamil Nadu',
  district: 'Ranipet District',
  /** Udyam Registration Number issued by the Government of India (MSME). */
  registrationNumber: 'UDYAM-TN-35-0058124',
  registrationLabel: 'Udyam Reg. No.',
  enterpriseType: 'Micro, Small & Medium Enterprise (MSME)',
  registrationScheme: 'Udyam Registration',
  registrationAuthority:
    'Ministry of Micro, Small & Medium Enterprises, Government of India',
  registrationStatus: 'Registered MSME in India',
  /**
   * Registered / office address, one line per rendered line, exactly as the
   * owner supplied it. Keep the order — it is a postal address.
   */
  officeAddressLines: [
    'ASTROSIVAM',
    'No 4 Thiruttani Thettu Street',
    'Kamakshi Puram',
    'Walajapet',
    'Ranipet District, PIN 632513',
    'Tamil Nadu, INDIA'
  ],
  /** Single-line form, for titles, tooltips and structured data. */
  officeAddressOneLine:
    'ASTROSIVAM, No 4 Thiruttani Thettu Street, Kamakshi Puram, Walajapet, Ranipet District, PIN 632513, Tamil Nadu, India'
} as const;

/** `Udyam Reg. No. UDYAM-TN-35-0058124` — the labelled registration number. */
export const BUSINESS_REGISTRATION_SHORT =
  `${BUSINESS_INFO.registrationLabel} ${BUSINESS_INFO.registrationNumber}`;

/**
 * `Udyam Reg. No. UDYAM-TN-35-0058124 (MSME, India)` — the single-line form used
 * in the invoice header metadata. The country matters because customers are
 * served worldwide and the enterprise is registered in India.
 */
export const BUSINESS_REGISTRATION_META =
  `${BUSINESS_REGISTRATION_SHORT} (MSME, ${BUSINESS_INFO.country})`;

/**
 * Invoice declaration sentence. States the registration only — no street
 * address, which belongs on the Contact page.
 */
export function businessRegistrationSentence(): string {
  return (
    `${BUSINESS_INFO.legalName} is registered in ${BUSINESS_INFO.country} as a ` +
    `${BUSINESS_INFO.enterpriseType} under ${BUSINESS_INFO.registrationScheme} No. ` +
    `${BUSINESS_INFO.registrationNumber}.`
  );
}
