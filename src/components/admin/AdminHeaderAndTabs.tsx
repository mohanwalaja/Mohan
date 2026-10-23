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
import { ADMIN_PRICED_SERVICES, serviceDisplayName, getItemStatusBadge } from './adminPortalHelpers';

export const AdminHeaderAndTabs: React.FC<{ ctx: any }> = ({ ctx }) => {
  const {
    stats,
    orders,
    settings,
    usersList,
    auditLogs,
    teamMembers,
    messagesList,
    bannedIps,
    setClientErrors,
    activeSection,
    setActiveSection,
    aiHandoffs,
    isLoading,
    successMessage,
    errorMessage,
    serviceMode,
    fetchAdminData,
  } = ctx;

  return (
    <>
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-lg border-2 border-amber-400/60 bg-black p-1 shrink-0 flex items-center justify-center">
            <img
              src={logoImg}
              alt="ASTRO SIVAM Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              <span>ASTRO SIVAM Administration Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Administrative Control Center
            </h1>
            <p className="text-xs text-slate-400">
              Manage daily 9:00 AM – 11:00 AM IST priest preparation approvals, India astrology team members, Free Beta &amp; paid order verifications, and pricing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            onClick={fetchAdminData}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Records</span>
          </button>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-2xl text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Orders</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats?.totalOrders ?? orders.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-amber-500">Pending Review</div>
          <div className="text-2xl font-black text-amber-500 mt-1">
            {stats?.pendingOrders ?? orders.filter(o => o.status === 'PENDING' || o.status === 'PENDING_APPROVAL').length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-500">Generated / Sent</div>
          <div className="text-2xl font-black text-emerald-500 mt-1">
            {stats?.completedOrders ?? orders.filter(o => o.status === 'GENERATED' || o.status === 'COMPLETED').length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-sky-500">Astrology Team</div>
          <div className="text-2xl font-black text-sky-500 mt-1">
            {teamMembers.length} Scholars
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-purple-500">Service Mode</div>
          <div className="text-sm font-black text-purple-400 mt-1.5 truncate">
            {settings?.serviceMode === 'FREE_BETA' ? '★ Free Beta' : 'Paid Service'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-500">Email System</div>
          <div className="text-xs font-black text-slate-900 dark:text-emerald-300 mt-1.5 truncate flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
            <span>Ready for Delivery</span>
          </div>
        </div>
      </div>

      {/* Quick System Health Status Bar */}
      {(() => {
        const isEmailOk = Boolean(settings?.emailSettings?.smtpHost && settings?.emailSettings?.senderEmail);
        const isMPaisaOk = Boolean(settings?.vodafoneMPaisaNumber && settings.vodafoneMPaisaNumber.trim().length >= 6);
        const isPayPalOk = Boolean(settings?.paypalEmail || settings?.paypalClientId);
        const isPriceOk = Boolean((settings?.intlPriceUSD || 0) > 0 || (settings?.indiaPriceINR || 0) > 0);

        return (
          <div className="bg-slate-900/90 dark:bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Activity className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>System Health Status</span>
                  <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Diagnostics
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Programmatic status of core integrations and checkout gateways
                </div>
              </div>
            </div>

            {/* Micro Chips for Email, PayPal, Prices */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Email */}
              <button
                type="button"
                onClick={() => setActiveSection('checklist')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
                  isEmailOk
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <span>{isEmailOk ? '✓' : '✕'}</span>
                <span>Email SMTP</span>
              </button>

              {/* Cards indicator */}
              <button
                type="button"
                onClick={() => setActiveSection('payments')}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all border bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
              >
                <span>✓</span>
                <span>VISA · MC · Amex</span>
              </button>

              {/* PayPal */}
              <button
                type="button"
                onClick={() => setActiveSection('checklist')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
                  isPayPalOk
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <span>{isPayPalOk ? '✓' : '✕'}</span>
                <span>PayPal</span>
              </button>

              {/* Prices */}
              <button
                type="button"
                onClick={() => setActiveSection('checklist')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
                  isPriceOk
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <span>{isPriceOk ? '✓' : '✕'}</span>
                <span>Prices</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('checklist')}
                className="px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs ml-auto md:ml-0"
              >
                <span>Full Checklist</span>
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Admin Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSection('orders')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'orders'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Orders & Approvals ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('escalations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'escalations'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          <span>
            AI Chat Escalations
            {aiHandoffs.filter((h) => h.status === 'NEW').length > 0 && (
              <span className="ml-1 text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5">
                {aiHandoffs.filter((h) => h.status === 'NEW').length} new
              </span>
            )}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('analytics')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'analytics'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          <span>Analytics Dashboard</span>
        </button>

        <button
          onClick={() => setActiveSection('financial')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'financial'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          <span>Financial Reports</span>
        </button>

        <button
          onClick={() => setActiveSection('payments')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'payments'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-amber-500" />
          <span>Payment Gateways</span>
        </button>

        <button
          onClick={() => setActiveSection('emails')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'emails'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Mail className="w-3.5 h-3.5 text-blue-500" />
          <span>Email & SMTP</span>
        </button>

        <button
          onClick={() => setActiveSection('alerts')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'alerts'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
          <span>WhatsApp & Viber Alerts</span>
        </button>

        <button
          onClick={() => setActiveSection('aiastrologer')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'aiastrologer'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>Source-Based Astrologer</span>
        </button>

        <button
          onClick={() => setActiveSection('database')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'database'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-purple-400" />
          <span>Database & Backup</span>
        </button>

        <button
          onClick={() => setActiveSection('health')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'health'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>System Health</span>
        </button>

        <button
          onClick={() => setActiveSection('checklist')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'checklist'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Setup Checklist</span>
        </button>

        <button
          onClick={() => setActiveSection('team')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'team'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Astrology Team ({teamMembers.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('settings')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'settings'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Service Mode & Pricing</span>
        </button>


        <button
          id="tab-google-setup"
          onClick={() => setActiveSection('google')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'google'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          <span>Google Setup</span>
        </button>

        <button
          onClick={() => setActiveSection('reviews')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'reviews'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span>Customer Reviews</span>
        </button>

        <button
          onClick={() => setActiveSection('messages')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'messages'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Messages ({messagesList.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('users')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'users'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Users ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('logs')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'logs'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Audit Logs ({auditLogs.length})</span>
        </button>

        <button
          id="tab-security-banned-ips"
          onClick={() => setActiveSection('security')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSection === 'security'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
          <span>Security & Banned IPs ({bannedIps.length})</span>
        </button>
        <button onClick={() => { setActiveSection('errors'); api.getAdminClientErrors().then(r => r.success && setClientErrors(r.errors || [])).catch(() => {}); }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeSection === 'errors' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-900 border border-red-200 text-red-700'}`}>
          <ShieldAlert className="w-3.5 h-3.5" /><span>Request Errors</span>
        </button>
      </div>

    </>
  );
};
