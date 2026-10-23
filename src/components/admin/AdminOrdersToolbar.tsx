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
import { buildBatchProcessingPlan, canSelectUnitForBatch, explainOrderApprovalBlockReason, getBatchKeyForUnit, isUnitActionableForBatch } from '../../services/adminBatchApproval';
import { orderChartServiceType } from '../../services/multiPersonOrder';
import { DEFAULT_CURRENCY, DEFAULT_SERVICE_PRICES, MAX_USD_TO_INR_RATE, MIN_USD_TO_INR_RATE, USD_TO_INR_RATE, normalizeUsdToInrRate, usdToInr } from '../../services/pricing';
import { ADMIN_PRICED_SERVICES, serviceDisplayName, getItemStatusBadge } from './adminPortalHelpers';

export const AdminOrdersToolbar: React.FC<{ ctx: any; children: React.ReactNode }> = ({ ctx, children }) => {
  const {
    orders,
    activeSection,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    isProcessing,
    familyRenderProgress,
    batchProgress,
    batchStopping,
    selectedBatchKeys,
    setSelectedBatchKeys,
    lastBatchSummary,
    setLastBatchSummary,
    handleStopBatchRun,
    runBatchDelivery,
    handleBatchApproveAndSendAllPending,
    groupedOrderUnits,
  } = ctx;

  return (
    <>
      {activeSection === 'orders' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Daily Priest Review &amp; Approval Workflow:</strong> When you click <strong>Approve</strong>, ASTRO SIVAM instantly generates both the official Report PDF and Tax Invoice PDF with our India priest team verification, archives the records, and automatically emails both documents together to the customer.
                <br />
                <strong>Refund policy:</strong> before approval an order can be refunded in <strong>one click</strong> at <strong>90%</strong> (the other 10% is the non-refundable payment gateway fee) and settles in <strong>3 working days</strong>. Once approved and emailed the order is completed and <strong>non-refundable</strong>, so the refund button disappears.
              </span>
            </div>
          </div>

          {/* Filters & Search & Batch Actions */}
          {(() => {
            const actionableBatchPlan = buildBatchProcessingPlan(orders);
            const processingCount = orders.filter(o => (o.status || '').toUpperCase() === 'PROCESSING').length;
            const visibleActionableKeys = groupedOrderUnits
              .filter((u: any) => isUnitActionableForBatch(u))
              .map((u: any) => getBatchKeyForUnit(u));
            const allVisibleActionableSelected =
              visibleActionableKeys.length > 0 &&
              visibleActionableKeys.every((k: string) => selectedBatchKeys.has(k));

            return (
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                {/* Filter Tabs with Live Counts */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/70 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
                  {[
                    { id: 'ALL', label: 'All Orders', count: orders.length },
                    { id: 'PENDING', label: 'Pending', count: orders.filter(o => { const s = (o.status || '').toUpperCase(); return s === 'PENDING' || s === 'PENDING_APPROVAL'; }).length },
                    ...(processingCount > 0 || filterStatus === 'PROCESSING'
                      ? [{ id: 'PROCESSING', label: 'Processing', count: processingCount }]
                      : []),
                    { id: 'GENERATED', label: 'Generated', count: orders.filter(o => (o.status || '').toUpperCase() === 'GENERATED').length },
                    { id: 'COMPLETED', label: 'Completed', count: orders.filter(o => (o.status || '').toUpperCase() === 'COMPLETED').length },
                    { id: 'CANCELLED', label: 'Cancelled', count: orders.filter(o => (o.status || '').toUpperCase() === 'CANCELLED').length },
                    { id: 'REFUNDED', label: 'Refunded', count: orders.filter(o => { const s = (o.status || '').toUpperCase(); return s === 'REFUNDED' || (o.refundStatus || '').toUpperCase() === 'REFUNDED'; }).length }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterStatus(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        filterStatus === tab.id
                          ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        filterStatus === tab.id
                          ? 'bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950'
                          : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Quick Select Actionable Toggle (Desktop + Mobile) */}
                  {visibleActionableKeys.length > 0 && (
                    <button
                      type="button"
                      disabled={!!batchProgress?.isProcessing}
                      onClick={() => {
                        setSelectedBatchKeys(prev => {
                          const next = new Set(prev);
                          if (allVisibleActionableSelected) {
                            visibleActionableKeys.forEach((k: string) => next.delete(k));
                          } else {
                            visibleActionableKeys.forEach((k: string) => next.add(k));
                          }
                          return next;
                        });
                      }}
                      className="px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      title="Select or deselect all actionable paid orders in the current view"
                    >
                      <Check className="w-3.5 h-3.5 text-amber-500" />
                      <span>
                        {allVisibleActionableSelected
                          ? 'Deselect Queue'
                          : `Select Actionable (${visibleActionableKeys.length})`}
                      </span>
                    </button>
                  )}

                  {/* Multi-Select Batch Approve / Resend Button */}
                  {selectedBatchKeys.size > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => runBatchDelivery(selectedBatchKeys)}
                        disabled={!!batchProgress?.isProcessing}
                        className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        title="Approve & email all selected paid orders at live-preview 200 DPI quality"
                      >
                        <Send className={`w-3.5 h-3.5 ${batchProgress?.isProcessing ? 'animate-spin' : ''}`} />
                        <span>Approve Selected ({selectedBatchKeys.size})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBatchKeys(new Set())}
                        disabled={!!batchProgress?.isProcessing}
                        className="px-2.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                        title="Clear selection"
                      >
                        Clear
                      </button>
                    </>
                  )}

                  {/* Batch Approve & Send All Verified Actionable Button */}
                  {actionableBatchPlan.units.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchApproveAndSendAllPending}
                      disabled={!!batchProgress?.isProcessing}
                      className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      title="Automatically generate 200 DPI live-preview PDFs and email all verified pending/retry orders"
                    >
                      <Send className={`w-3.5 h-3.5 ${batchProgress?.isProcessing ? 'animate-spin' : ''}`} />
                      <span>
                        {batchProgress?.isProcessing
                          ? `Processing ${batchProgress.current}/${batchProgress.total}...`
                          : `⚡ Send All Pending (${actionableBatchPlan.units.length})`}
                      </span>
                    </button>
                  )}

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search orders..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-amber-400 focus:outline-none shadow-2xs"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Family (group order) render progress banner: one report at a time */}
          {familyRenderProgress && (
            <div className="p-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 rounded-2xl space-y-2 shadow-sm">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-purple-900 dark:text-purple-200">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping"></span>
                  Family Order {familyRenderProgress.groupId} — rendering report {familyRenderProgress.index} of {familyRenderProgress.total}
                  {familyRenderProgress.memberName ? ` (${familyRenderProgress.memberName})` : ''}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="rounded-full bg-purple-600/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                    Report {familyRenderProgress.index}/{familyRenderProgress.total}
                  </span>
                  {familyRenderProgress.bytes
                    ? `${(familyRenderProgress.bytes / 1048576).toFixed(1)} MB`
                    : ''}
                  {Math.round((familyRenderProgress.index / Math.max(1, familyRenderProgress.total)) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300 rounded-full"
                  style={{ width: `${(familyRenderProgress.index / Math.max(1, familyRenderProgress.total)) * 100}%` }}
                />
              </div>
              <div className="text-[11px] font-semibold text-purple-800 dark:text-purple-300">
                {familyRenderProgress.phase === 'rendering'
                  ? `Rendering report ${familyRenderProgress.index}/${familyRenderProgress.total} — ${familyRenderProgress.message}`
                  : familyRenderProgress.message}
              </div>
            </div>
          )}

          {/* Batch Progress Banner */}
          {batchProgress?.isProcessing && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl space-y-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>
                    {batchStopping ? 'Stopping cleanly after current order: ' : 'Processing '}
                    {batchProgress.currentOrderNum} ({batchProgress.current} of {batchProgress.total})
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold">
                    Sent: <strong>{batchProgress.successCount}</strong> • Failed: <strong>{batchProgress.failCount}</strong> • {Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleStopBatchRun}
                    disabled={batchStopping}
                    className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black transition-all cursor-pointer disabled:opacity-60"
                    title="Finish the current PDF upload & email cleanly, then pause remaining orders"
                  >
                    {batchStopping ? 'Stopping After Current…' : 'Stop After Current'}
                  </button>
                </div>
              </div>
              <div className="w-full h-2 bg-emerald-200 dark:bg-emerald-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                  style={{ width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Last Batch Run Summary & Retry Failed Panel */}
          {lastBatchSummary && !batchProgress?.isProcessing && (
            <div
              className={`p-4 rounded-2xl border space-y-2.5 shadow-xs text-xs ${
                lastBatchSummary.failed.length > 0
                  ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/80 text-rose-950 dark:text-rose-200'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-extrabold flex items-center gap-2 flex-wrap">
                  <span>
                    Batch Report ({lastBatchSummary.finishedAt})
                    {lastBatchSummary.stoppedEarly ? ' • Paused cleanly by admin' : ''}:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-black">
                    {lastBatchSummary.succeeded} Sent
                  </span>
                  {lastBatchSummary.failed.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-800 dark:text-rose-300 font-black">
                      {lastBatchSummary.failed.length} Failed
                    </span>
                  )}
                  {lastBatchSummary.skipped.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-black">
                      {lastBatchSummary.skipped.length} Skipped (Unpaid/Blocked)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {lastBatchSummary.failed.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        runBatchDelivery(new Set(lastBatchSummary.failed.map(f => f.batchKey)))
                      }
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Failed ({lastBatchSummary.failed.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLastBatchSummary(null)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {lastBatchSummary.failed.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-rose-200/80 dark:border-rose-800/60">
                  {lastBatchSummary.failed.map(item => (
                    <div key={item.batchKey} className="font-medium flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-black">{item.label}</span>
                      {item.userEmail && <span className="opacity-75">({item.userEmail})</span>}
                      <span>—</span>
                      <span className="font-bold">{item.error}</span>
                    </div>
                  ))}
                </div>
              )}

              {lastBatchSummary.skipped.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-amber-200/70 dark:border-amber-800/50 text-[11px] opacity-90">
                  {lastBatchSummary.skipped.map(item => (
                    <div key={item.batchKey}>
                      <strong className="font-mono">{item.label}</strong>: {item.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders Section: Mobile Responsive Modern Card List + Desktop Modern Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            
            {groupedOrderUnits.length === 0 ? (
              <div className="px-5 py-14 text-center text-slate-400">
                <div className="max-w-xs mx-auto space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      No {filterStatus !== 'ALL' ? filterStatus.toLowerCase() : ''} orders found
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {searchQuery
                        ? `No orders matching "${searchQuery}". Try a different keyword.`
                        : filterStatus === 'PENDING'
                        ? 'All incoming orders have been processed and emailed successfully!'
                        : 'There are currently no orders in this list.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {children}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
