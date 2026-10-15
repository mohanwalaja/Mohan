import React from 'react';
import { ShieldCheck, FileText, CreditCard, RotateCcw } from 'lucide-react';
import { SEO } from '../components/common/SEO';
import { RouteLink } from '../components/common/RouteLink';

interface PoliciesProps {
  type: 'privacy' | 'terms' | 'payment' | 'refund';
  onNavigate: (route: string) => void;
}

const POLICY_META = {
  privacy: {
    title: 'Privacy Policy | ASTRO SIVAM',
    description: "Read ASTRO SIVAM's Privacy Policy. Learn how we safeguard your birth data, personal information, and payment details with strict confidentiality.",
    canonical: 'https://astrosivam.com/privacy-policy'
  },
  terms: {
    title: 'Terms of Service | ASTRO SIVAM',
    description: "Terms and Conditions governing the use of ASTRO SIVAM's Vedic astrology services, calculations, and digital deliverables.",
    canonical: 'https://astrosivam.com/terms'
  },
  payment: {
    title: 'Payment Policy | ASTRO SIVAM',
    description: 'Information regarding accepted payment methods, secure transaction processing, and multi-currency billing at ASTRO SIVAM.',
    canonical: 'https://astrosivam.com/payment-policy'
  },
  refund: {
    title: 'Refund & Cancellation Policy | ASTRO SIVAM',
    description: 'Before admin approval, cancel and receive a 90% refund in 3 working days. Once your personalised PDF report is approved and emailed, the order is completed and non-refundable.',
    canonical: 'https://astrosivam.com/refund-policy'
  }
};

export const PoliciesPage: React.FC<PoliciesProps> = ({ type, onNavigate }) => {
  const meta = POLICY_META[type] || POLICY_META.privacy;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <SEO
        title={meta.title}
        description={meta.description}
        canonical={meta.canonical}
      />
      
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <RouteLink
          route="policy-privacy"
          onNavigate={onNavigate}
          aria-current={type === 'privacy' ? 'page' : undefined}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            type === 'privacy'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Privacy Policy</span>
        </RouteLink>

        <RouteLink
          route="policy-terms"
          onNavigate={onNavigate}
          aria-current={type === 'terms' ? 'page' : undefined}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            type === 'terms'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Terms & Conditions</span>
        </RouteLink>

        <RouteLink
          route="policy-payment"
          onNavigate={onNavigate}
          aria-current={type === 'payment' ? 'page' : undefined}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            type === 'payment'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Payment Policy</span>
        </RouteLink>

        <RouteLink
          route="policy-refund"
          onNavigate={onNavigate}
          aria-current={type === 'refund' ? 'page' : undefined}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            type === 'refund'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refund & Cancellation</span>
        </RouteLink>
      </div>

      {/* Policy Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm text-slate-700 dark:text-slate-300 space-y-6 text-xs sm:text-sm leading-relaxed">
        
        {type === 'privacy' && (
          <div className="space-y-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Privacy Policy
            </h1>
            <p className="text-xs text-slate-500">Last updated: January 2026</p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              1. Information We Collect
            </h3>
            <p>
              ASTRO SIVAM collects personal identity and astrological birth details, including your full name, email address, mobile contact number, date of birth, exact time of birth, and geographic coordinates of your birthplace (latitude, longitude, and timezone).
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              2. How Your Birth Data is Used
            </h3>
            <p>
              Your birth data is used strictly and exclusively for calculating Vedic astrological positions (Ascendant/Lagna, 12 Bhavas, Navagraha longitudes, Mahadashas, and matching scores) and generating your requested PDF reports. We never sell, lease, or monetize your personal data.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              3. Branding & Strict Confidentiality
            </h3>
            <p>
              All astrology reports and certificates generated by ASTRO SIVAM bear official ASTRO SIVAM branding exclusively. No priest, temple, or external third-party details are attached to your reports.
            </p>
          </div>
        )}

        {type === 'terms' && (
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Terms & Conditions
            </h2>
            <p className="text-xs text-slate-500">Last updated: January 2026</p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              1. Astrological Interpretations Disclaimer
            </h3>
            <p>
              Astrological reports, charts, and predictions provided by ASTRO SIVAM are calculated based on ancient Vedic principles (Chitra Paksha Lahiri ephemeris). Astrology is an advisory spiritual science; all reports are provided for guidance and self-awareness.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              2. Accuracy of Input Data
            </h3>
            <p>
              The accuracy of your Vedic horoscope depends entirely on the precision of the birth date, exact birth time, and birth location provided. ASTRO SIVAM is not responsible for discrepancies arising from inaccurate client inputs.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              3. Service Delivery
            </h3>
            <p>
              Reports and official tax invoices are generated in digital PDF format and delivered directly to your registered email address upon priest team verification. Order history and live delivery tracking are maintained in your Customer Dashboard.
            </p>
          </div>
        )}

        {type === 'payment' && (
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Payment Policy
            </h2>
            <p className="text-xs text-slate-500">Last updated: January 2026</p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              1. Accepted Payment Methods
            </h3>
            <div className="space-y-2">
              <p><strong>1. India Payments:</strong> Google Pay (GPay) / UPI direct transfer to our verified registered account.</p>
              <p><strong>2. PayPal Worldwide:</strong> PayPal checkout accepting PayPal balance and all major cards: VISA, Mastercard, American Express, and Discover.</p>
              <p><strong>3. Credit / Debit Cards:</strong> All major international credit and debit cards processed securely via PayPal (no PayPal account required).</p>
            </div>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              2. Payment Verification
            </h3>
            <p>
              When placing a paid order, clients must submit their transaction reference/receipt number. The order is reviewed by the administrator before calculations are finalized and dispatched.
            </p>
            <p>
              Until that review is completed the order is still changeable: cancelling before admin approval entitles you to a <strong>90% refund</strong>, settled within <strong>3 working days</strong>. Once approved and emailed, the order is completed and non-refundable. See our <RouteLink route="policy-refund" onNavigate={onNavigate} className="text-amber-700 dark:text-amber-400 font-semibold underline cursor-pointer">Refund &amp; Cancellation Policy</RouteLink> for the full details.
            </p>
          </div>
        )}

        {type === 'refund' && (
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Refund &amp; Cancellation Policy
            </h2>
            <p className="text-xs text-slate-500">Last updated: October 2026</p>

            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 sm:p-5 space-y-1.5">
              <p className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                The short version
              </p>
              <p className="text-emerald-900/90 dark:text-emerald-200/90">
                <strong>Before admin approval</strong> — you may cancel and receive a <strong>90% refund</strong> of the amount paid. The remaining 10% is the non-refundable payment-gateway / processing fee that we are charged even when an order is refunded.
              </p>
              <p className="text-emerald-900/90 dark:text-emerald-200/90">
                <strong>After admin approval</strong> — your personalised PDF report and tax invoice have been generated and emailed, so the order is <strong>completed and non-refundable</strong>.
              </p>
              <p className="text-emerald-900/90 dark:text-emerald-200/90">
                Refunds are processed within <strong>3 working days</strong> (Monday to Friday, public holidays excluded) to your original payment method.
              </p>
            </div>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              1. Before Admin Approval — 90% Refund
            </h3>
            <p>
              Every paid order passes a manual verification step. Until our administrator approves the order and generates your report, nothing has been calculated, printed or dispatched, so the order can still be cancelled. If you cancel at this stage, <strong>90% of the amount you paid is refunded</strong>. The retained 10% covers bank, card-network and wallet charges (PayPal, card, UPI/GPay) that are not returned to us when a transaction is refunded.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              2. After Admin Approval — Order Completed, Non-Refundable
            </h3>
            <p>
              Your horoscope, matrimonial matching report, baby naming certificate or Subha Muhurtham date report is uniquely calculated for your birth details and is delivered as a personalised digital PDF. Once the administrator has approved the order and the report and tax invoice have been emailed to you, the order is <strong>completed</strong>. Because the product is personalised, delivered and cannot be returned, <strong>no refund or cancellation is available after approval</strong>.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              3. Refund Processing Time — 3 Working Days
            </h3>
            <p>
              Once a refund is approved it is completed within <strong>3 working days</strong>, counted in working days only (Saturday, Sunday and public holidays are excluded). The money is returned to the <strong>same payment method and in the same currency</strong> you paid with — PayPal, credit/debit card, UPI/GPay or your wallet. Your bank or wallet provider may take one further working day to display the credit on your statement.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              4. Wrong Birth Details Before Approval
            </h3>
            <p>
              If you discover an error in your birth date, birth time or birthplace before approval, contact us immediately at <a href="mailto:admin@astrosivam.com" className="text-amber-700 dark:text-amber-400 font-semibold underline">admin@astrosivam.com</a> with your order number. Input corrections made before the report is generated are free of charge, and no refund is needed — we simply recalculate your chart with the corrected details.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              5. How to Request a Refund
            </h3>
            <p>
              Email <a href="mailto:admin@astrosivam.com" className="text-amber-700 dark:text-amber-400 font-semibold underline">admin@astrosivam.com</a> from your registered email address, quoting your <strong>order number</strong> (it starts with <span className="font-mono">ASTRO-</span>) and the reason for cancellation. Our team verifies that the order has not yet been approved, then approves the 90% refund in a single click from the admin dashboard — no further paperwork, no forms to sign. You will receive a refund confirmation email with the exact amount and the expected settlement date.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              6. Free Beta Reports
            </h3>
            <p>
              Free beta reports (the first report offered free of charge under the beta programme) carry no payment, so no refund arises. They may be cancelled at any time before approval.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              7. Duplicate or Failed Payments
            </h3>
            <p>
              If a payment was deducted twice, or money left your account without an order being created, contact us with the transaction reference. Verified duplicate or orphaned payments are returned in full (100%), since no service was ordered or delivered.
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white text-base pt-2">
              8. Chargebacks
            </h3>
            <p>
              Please contact us before asking your bank or card provider to raise a chargeback. Once a report has been emailed, a chargeback raised for a delivered personalised digital product will be contested with the delivery records (the dated email, the generated PDF report and the tax invoice) we retain for every order.
            </p>

            <p className="text-xs text-slate-500 pt-2">
              This policy is governed by the laws applicable at the place where ASTRO SIVAM is registered and applies to all ASTRO SIVAM orders placed on astrosivam.com. For any clarification, write to <a href="mailto:admin@astrosivam.com" className="text-amber-700 dark:text-amber-400 font-semibold underline">admin@astrosivam.com</a>.
            </p>
          </div>
        )}

      </div>

    </div>
  );
};
