import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Search,
  Settings,
  Users,
  FileText,
  Lock,
  Plus,
  Trash2,
  Edit2,
  UserCheck,
  GraduationCap,
  Award,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Mail,
  MessageSquare,
  Send,
  DollarSign,
  CreditCard,
  Database,
  ShieldCheck,
  RotateCcw,
  Activity,
  Check,
  X,
  Smartphone,
  Globe,
  Zap,
  TrendingUp,
  BarChart3,
  Receipt,
  Crown,
  ShieldAlert,
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronUp,
  Layers,
  Package,
  Copy,
  Calendar,
  MapPin,
  Palette,
  Star,
  IndianRupee,
  ImagePlus,
  Loader2,
  Link2
} from 'lucide-react';
import { api } from '../../services/api';
import { describeFamilyRenderQuality } from '../../services/formatUtils';
import logoImg from '../../assets/astrosivam_appicon.png';
import { Order, OrderItem, AppSettings, AdminStats, TeamMember, ContactMessage, BannedIpEntry, AiChatHandoff, ServiceType } from '../../types';
import { OrderReportModal } from '../common/OrderReportModal';
import { LivePdfPreviewModal } from '../common/LivePdfPreviewModal';
import { TeamMemberAvatar, isUsableTeamPhoto } from '../common/TeamMemberAvatar';
import { TEAM_PHOTO_ACCEPT, TEAM_PHOTO_MAX_BYTES, formatTeamPhotoBytes } from '../../services/teamPhoto';
import { canSelectUnitForBatch, explainOrderApprovalBlockReason, getBatchKeyForUnit, isUnitActionableForBatch } from '../../services/adminBatchApproval';
import { orderChartServiceType } from '../../services/multiPersonOrder';
import { DEFAULT_CURRENCY, DEFAULT_SERVICE_PRICES, MAX_USD_TO_INR_RATE, MIN_USD_TO_INR_RATE, USD_TO_INR_RATE, normalizeUsdToInrRate, usdToInr } from '../../services/pricing';
import { ADMIN_PRICED_SERVICES, type AdminServicePricing, serviceDisplayName, getItemStatusBadge } from './adminPortalHelpers';

export const AdminGeneralSettingsPanel: React.FC<{ ctx: any }> = ({ ctx }) => {
  const {
    orders,
    settings,
    activeSection,
    setActiveSection,
    setSuccessMessage,
    serviceMode,
    setServiceMode,
    intlPrice,
    setIntlPrice,
    usdToInrRate,
    setUsdToInrRate,
    servicePricing,
    setServicePricing,
    autoEmail,
    setAutoEmail,
    usdToInrRateIsValid,
    effectiveUsdToInrRate,
    handleSaveSettings,
  } = ctx;

  return (
    <>
      {activeSection === 'settings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 max-w-2xl">
          <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            System Operating Mode & Pricing Settings
          </h3>

          {/* The public site theme is a VISITOR preference (the navbar switch),
              not an admin-wide setting: the choice is stored in the visitor's
              own browser. The admin panel always keeps its dedicated dark UI.
              The API still accepts the legacy `userDesign` field so old
              clients keep working, but nothing in the frontend reads it. */}

          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Service Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                Active Service Mode:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setServiceMode('FREE_BETA')}
                  className={`p-4 rounded-2xl border text-left space-y-1 ${
                    serviceMode === 'FREE_BETA'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>★ FREE BETA TESTING</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    1 free report per customer (per IP address): the first chart of a customer's first order is free — in a family order only member 1 is free and the rest pay the standard price. Later orders from the same IP are paid.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setServiceMode('PAID')}
                  className={`p-4 rounded-2xl border text-left space-y-1 ${
                    serviceMode === 'PAID'
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>PAID SERVICE MODE</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Enforce payment verification via GPay/UPI, PayPal, or Card.
                  </p>
                </button>
              </div>
            </div>

            {/* Base Pricing (USD is the only price the admin enters) */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Default Base Rate (US$):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const usd = Number(intlPrice) || 0;
                    setServicePricing({
                      BIRTH_JATHAGAM: { usd, inr: usdToInr(usd, effectiveUsdToInrRate) },
                      MARRIAGE_COMPATIBILITY: { usd, inr: usdToInr(usd, effectiveUsdToInrRate) },
                      BABY_NAMING: { usd, inr: usdToInr(usd, effectiveUsdToInrRate) },
                      MUHURTHAM: { usd, inr: usdToInr(usd, effectiveUsdToInrRate) }
                    });
                    setSuccessMessage('Base rate applied to all 4 astrological services! Click Save Settings below.');
                    setTimeout(() => setSuccessMessage(''), 4000);
                  }}
                  className="text-xs px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold cursor-pointer w-fit"
                >
                  ⚡ Apply Base Rate To All Services
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Base Price (US$):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={intlPrice}
                    onChange={e => setIntlPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold"
                  />
                  <span className="text-[10px] text-slate-400">PayPal / Card (International)</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    India Price (₹ INR) — auto-calculated:
                  </span>
                  <div
                    data-testid="admin-base-inr"
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    ₹{usdToInr(Number(intlPrice) || 0, effectiveUsdToInrRate).toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-400">US${Number(intlPrice) || 0} × ₹{effectiveUsdToInrRate} • Google Pay / UPI</span>
                </div>
              </div>
            </div>

            {/* Exchange rate: the one number every India price is derived from */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label
                htmlFor="admin-usd-inr-rate"
                className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5"
              >
                <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
                <span>Exchange Rate (₹ per US$)</span>
              </label>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="w-full sm:max-w-40">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">₹</span>
                    <input
                      id="admin-usd-inr-rate"
                      data-testid="admin-usd-inr-rate"
                      type="number"
                      min={MIN_USD_TO_INR_RATE}
                      max={MAX_USD_TO_INR_RATE}
                      step="0.01"
                      value={usdToInrRate}
                      onChange={e => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        setUsdToInrRate(next);
                        // Every derived India price follows immediately.
                        setServicePricing(prev => {
                          const table = {} as AdminServicePricing;
                          for (const { key } of ADMIN_PRICED_SERVICES) {
                            const usd = Number(prev[key]?.usd ?? DEFAULT_SERVICE_PRICES[key].USD) || 0;
                            table[key] = { usd, inr: usdToInr(usd, normalizeUsdToInrRate(next)) };
                          }
                          return table;
                        });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    per 1 US$ • allowed {MIN_USD_TO_INR_RATE}–{MAX_USD_TO_INR_RATE}
                  </span>
                  {!usdToInrRateIsValid && (
                    <span data-testid="admin-usd-inr-rate-invalid" className="text-[10px] font-semibold text-rose-600 block mt-1">
                      Enter ₹{MIN_USD_TO_INR_RATE}–₹{MAX_USD_TO_INR_RATE}. The prices below keep using
                      ₹{USD_TO_INR_RATE} and nothing outside this range can be saved.
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed sm:flex-1">
                  1 US$ = ₹{effectiveUsdToInrRate}. Every India price is US$ × this rate, so a
                  US${Number(intlPrice) || 18} base price is charged as
                  ₹{usdToInr(Number(intlPrice) || 18, effectiveUsdToInrRate).toLocaleString('en-IN')}.
                  Change the rate when the rupee moves, then click <strong>Save Settings</strong>.
                  {effectiveUsdToInrRate === USD_TO_INR_RATE && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      (site default is ₹{USD_TO_INR_RATE})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Per-service pricing: admin sets USD only, INR is derived */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>Per-Service Pricing (US$ Base)</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Enter the US$ base price for each service. The India (₹ INR) price is calculated automatically at 1 USD = ₹{effectiveUsdToInrRate} and is the exact amount charged via Google Pay / UPI.
                </p>
              </div>

              {ADMIN_PRICED_SERVICES.map(({ key, label, pages, badge }, index) => {
                const usd = Number(servicePricing[key]?.usd ?? DEFAULT_SERVICE_PRICES[key].USD) || 0;
                return (
                  <div key={key} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>{index + 1}. {label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${badge}`}>{pages}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={`price-usd-${key}`} className="text-[10px] text-slate-500 block mb-0.5">Base Price (US$)</label>
                        <input
                          id={`price-usd-${key}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={usd}
                          onChange={e => {
                            const nextUsd = Number(e.target.value) || 0;
                            setServicePricing(prev => ({
                              ...prev,
                              [key]: { usd: nextUsd, inr: usdToInr(nextUsd, effectiveUsdToInrRate) }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">India (₹ INR) — auto</span>
                        <div
                          data-testid={`admin-inr-${key}`}
                          className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400"
                        >
                          ₹{usdToInr(usd, effectiveUsdToInrRate).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Automated Email delivery toggle */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="autoEmailToggle"
                checked={autoEmail}
                onChange={e => setAutoEmail(e.target.checked)}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="autoEmailToggle" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                Automatically email PDF report to customer upon admin approval
              </label>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              Save System Settings
            </button>
          </form>

          {/* Shortcuts to Payment Gateways & Social Setup */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 gap-4">
            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    3 Payment Systems — Offline &amp; Online Mode Control
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Switch India GPay/UPI, International PayPal, and Cards (VISA, MC, Amex, Discover) between Offline and Online modes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('payments')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                >
                  Open Payment Gateways &rarr;
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300">1. India GPay</span>
                  <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[10px] ${
                    settings?.indiaGpayPaymentMode === 'online'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  }`}>
                    {settings?.indiaGpayPaymentMode === 'online' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300">2. PayPal</span>
                  <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[10px] ${
                    settings?.paypalPaymentMode === 'online'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  }`}>
                    {settings?.paypalPaymentMode === 'online' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300" style={{display:"none"}}>3. M-PAiSA</span>
                  <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[10px] ${
                    settings?.vodafoneMPaisaPaymentMode === 'online'
                      ? 'bg-red-500/20 text-red-600 dark:text-red-300'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  }`}>
                    {settings?.vodafoneMPaisaPaymentMode === 'online' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Google Sign-In Setup
                </p>
                <p className="text-[11px] text-slate-500">
                  Configure Google Web Client ID.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('google')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Configure &rarr;
              </button>
            </div>

          </div>
        </div>
      )}

    </>
  );
};
