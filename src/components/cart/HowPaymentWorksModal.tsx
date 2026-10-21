import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, Globe2, HelpCircle, Lock, ShieldCheck, X } from 'lucide-react';

/**
 * "How payment works" — the trust popup behind one tap at payment time.
 *
 * Owner request (2026-10-22): customers outside India read a USD price and
 * stall — "how do I pay US dollars from Australia?" They do not need to hold
 * dollars at all: PayPal and the card networks bill the customer in their OWN
 * currency (AUD, NZD, CAD, EUR, GBP, …) at their own exchange rate, and any
 * PayPal-enabled card works with or without a PayPal account. This popup says
 * exactly that, in plain words, before the customer reaches the pay button:
 *
 *   - one tap on "How payment works" opens it (it never opens by itself and
 *     never blocks the form),
 *   - the close button sits in the TOP RIGHT, as the owner described; Escape
 *     and a tap on the backdrop close it too,
 *   - after closing, the customer continues to payment where they left off.
 *
 * Rendered through a portal so no checkout modal or sliding drawer (which use
 * transforms and overflow) can clip or reposition it, and stacked above the
 * z-50 checkout overlays.
 */
export const HowPaymentWorksModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="how-payment-works-trigger"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[10.5px] font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition-colors cursor-pointer"
      >
        <HelpCircle className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
        <span>How payment works</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How payment works"
          data-testid="how-payment-works-dialog"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/50"
            onClick={event => event.stopPropagation()}
          >
            {/* Owner: "after reading user can click the close button in top right". */}
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              title="Close"
              data-testid="how-payment-works-close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2 className="display-serif pr-10 text-lg font-bold text-[#fffdfa]">
              How payment works
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
              One minute of reading before you pay — wherever in the world you are.
            </p>

            <div className="mt-4 space-y-3.5 text-xs leading-relaxed text-slate-300">
              <div className="flex items-start gap-2.5">
                <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <div>
                  <div className="font-bold text-white">You pay in YOUR currency, from any country</div>
                  <p className="mt-0.5 text-slate-400">
                    Our prices are listed in US dollars (and in rupees for India's GPay / UPI), but you
                    never need to hold dollars. PayPal and the card networks simply bill your own
                    currency — Australian dollars, New Zealand dollars, Canadian dollars, euros,
                    pounds, or whatever your home currency is — at their own exchange rate. The exact
                    amount in your currency is shown on the PayPal or card page BEFORE you approve it.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <div>
                  <div className="font-bold text-white">Any PayPal-enabled card works — no PayPal account needed</div>
                  <p className="mt-0.5 text-slate-400">
                    VISA, Mastercard, American Express, Discover and other major cards are accepted
                    through PayPal's secure checkout, even if you have never created a PayPal account.
                    If you do have PayPal balance or a linked bank, you can use that instead.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                <div>
                  <div className="font-bold text-white">Your card details never touch our site</div>
                  <p className="mt-0.5 text-slate-400">
                    The card step happens on our payment processors' own secure pages (PayPal, or
                    Razorpay for some card payments). We receive only the confirmation and a
                    transaction reference — never your card number, CVV or password.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <div>
                  <div className="font-bold text-white">What your payment is protected by</div>
                  <p className="mt-0.5 text-slate-400">
                    Every order is reviewed by our Vedic team before anything is sent; your report PDF
                    and tax invoice arrive together by email; and if you cancel before approval, 90% is
                    refunded to your payment method within 3 working days.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-950/40 transition-all hover:from-amber-300 hover:to-amber-400 active:scale-98 cursor-pointer"
            >
              Got it — continue to payment
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
