import React from 'react';
import { PaymentMethod, CurrencyPriceMap, SystemSettings, PaymentGatewayMode } from '../../types';
import { PAYMENT_METHOD_CURRENCY, formatMoney } from '../../services/pricing';

/**
 * Online-only: every gateway runs in 'online' mode. Manual/offline transfers are no longer accepted.
 */
export function getGatewayModeForMethod(
  method: PaymentMethod,
  settings?: SystemSettings | null
): PaymentGatewayMode {
  return 'online';
}

/**
 * "How would you like to pay?" — the ONE decision that sets the currency of the
 * whole family order. Birth places never appear here.
 */

export interface PaymentMethodOption {
  method: PaymentMethod;
  title: string;
  subtitle: string;
  accent: string;
  activeClass: string;
}

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    method: 'PAYPAL',
    title: 'PayPal',
    subtitle: 'Worldwide · VISA · Mastercard · Amex · Discover',
    accent: 'text-blue-400',
    activeClass: 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 text-white'
  },
  {
    method: 'CARD',
    title: 'Credit / Debit Card',
    subtitle: 'VISA · Mastercard · American Express · Discover',
    accent: 'text-indigo-400',
    activeClass: 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500 text-white'
  },
  {
    method: 'GPAY',
    title: 'Google Pay / UPI',
    subtitle: 'India',
    accent: 'text-emerald-400',
    activeClass: 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500 text-white'
  }
];

interface PaymentMethodSelectorProps {
  paymentMethod: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  /** Totals in every currency so each option can show what it would cost. */
  totals: CurrencyPriceMap;
  settings?: SystemSettings | null;
  isFreeBeta?: boolean;
  /** compact = family tray footer, full = checkout modal */
  variant?: 'compact' | 'full';
  disabled?: boolean;
  heading?: string;
  helperText?: string;
}

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onSelect,
  totals,
  settings,
  isFreeBeta = false,
  variant = 'full',
  disabled = false,
  heading = 'How would you like to pay?',
  helperText = 'Your whole family order is charged in the currency of the payment method you pick — the birth place of each family member does not change the price.'
}) => {
  const compact = variant === 'compact';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`font-bold uppercase tracking-wider text-slate-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {heading}
        </h3>
        {!isFreeBeta && (
          <span className="text-[10px] text-slate-500">One payment • One receipt</span>
        )}
      </div>

      <div className={`grid gap-2.5 ${compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {PAYMENT_METHOD_OPTIONS.map(option => {
          const optionCurrency = PAYMENT_METHOD_CURRENCY[option.method] || 'FJD';
          const isActive = paymentMethod === option.method;
          const gwMode = settings ? getGatewayModeForMethod(option.method, settings) : null;
          return (
            <button
              key={option.method}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.method)}
              aria-pressed={isActive}
              title={`${option.title} — pay in ${optionCurrency}`}
              className={`${compact ? 'p-2.5' : 'p-3'} rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                isActive ? option.activeClass : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold ${option.accent}`}>
                  {option.title}
                </div>
                {gwMode && !compact && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                      gwMode === 'online'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {gwMode === 'online' ? 'Online' : 'Offline'}
                  </span>
                )}
              </div>
              <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-slate-400`}>
                {option.subtitle} ({optionCurrency})
              </div>
              {totals?.[optionCurrency] !== undefined && (
                <div className={`${compact ? 'text-[11px] mt-1' : 'text-xs mt-1.5'} font-mono font-bold ${isActive ? 'text-white' : 'text-amber-400/90'}`}>
                  {totals[optionCurrency] > 0 ? formatMoney(totals[optionCurrency], optionCurrency) : 'FREE'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!compact && helperText && (
        <p className="text-[11px] text-slate-500 leading-relaxed">{helperText}</p>
      )}
    </div>
  );
};
