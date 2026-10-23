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

export const AdminOrdersDesktopTable: React.FC<{ ctx: any }> = ({ ctx }) => {
  const {
    orders,
    bannedIps,
    copiedIp,
    handleCopyIp,
    expandedGroupIds,
    toggleGroupExpand,
    isProcessing,
    familyRenderProgress,
    batchProgress,
    selectedBatchKeys,
    setSelectedBatchKeys,
    setSelectedOrder,
    expandedItemOrderIds,
    isMultiPersonUnit,
    toggleItemsExpand,
    handleDownloadOrderInvoice,
    handleDirectSendCustomerEmail,
    toggleBatchUnitSelection,
    handleApproveFamilyGroup,
    handleResendFamilyEmail,
    handleCancelFamilyOrder,
    handlePreviewFamilyInvoice,
    handleCancelOrder,
    preApprovalRefundAmount,
    moneyLabel,
    canOneClickRefund,
    canOneClickRefundGroup,
    refundSummaryText,
    handleProcessRefund,
    groupedOrderUnits,
    renderMultiPersonItems,
  } = ctx;

  return (
    <>
                {/* 2. DESKTOP COMPUTER VIEW (Redesigned Modern Dashboard Order List for screens >= md) */}
                <div className="hidden md:block">
                  {/* Table Header Bar */}
                  <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold border-b border-slate-200 dark:border-slate-800 tracking-wider items-center">
                    <div className="col-span-3 flex items-center gap-2.5">
                      {(() => {
                        const visibleSelectableKeys = groupedOrderUnits
                          .filter((u: any) => canSelectUnitForBatch(u))
                          .map((u: any) => getBatchKeyForUnit(u));
                        const selectedVisibleCount = visibleSelectableKeys.filter((k: string) =>
                          selectedBatchKeys.has(k)
                        ).length;
                        const allChecked =
                          visibleSelectableKeys.length > 0 &&
                          selectedVisibleCount === visibleSelectableKeys.length;
                        const someChecked = selectedVisibleCount > 0 && !allChecked;
                        return (
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => {
                              if (el) el.indeterminate = someChecked;
                            }}
                            disabled={visibleSelectableKeys.length === 0 || !!batchProgress?.isProcessing}
                            onChange={() => {
                              setSelectedBatchKeys(prev => {
                                const next = new Set(prev);
                                if (allChecked) {
                                  visibleSelectableKeys.forEach((k: string) => next.delete(k));
                                } else {
                                  visibleSelectableKeys.forEach((k: string) => next.add(k));
                                }
                                return next;
                              });
                            }}
                            aria-label="Select all visible eligible orders"
                            title="Select or deselect all eligible paid orders in this view"
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                          />
                        );
                      })()}
                      <span>Order & Language</span>
                    </div>
                    <div className="col-span-3">User & Astro Service</div>
                    <div className="col-span-2">Contact & Origin</div>
                    <div className="col-span-2">Payment & Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {/* Order Rows */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {groupedOrderUnits.map(unit => {
                      const normalizedStatus = (unit.status || '').toString().trim().toUpperCase();
                      const isCompleted = normalizedStatus === 'COMPLETED';
                      const isCancelled = normalizedStatus === 'CANCELLED';
                      const isPending =
                        normalizedStatus === 'PENDING' ||
                        normalizedStatus === 'PENDING_APPROVAL' ||
                        normalizedStatus === 'PROCESSING';
                      const isGroup = unit.isGroup;
                      const groupId = unit.groupId || '';
                      const isExpanded = !!expandedGroupIds[groupId];
                      const isEmailFailed = (unit.emailStatus || '').toUpperCase() === 'FAILED' || (unit.emailStatus || '').toUpperCase() === 'ERROR';
                      const unitBatchKey = getBatchKeyForUnit(unit);
                      const unitSelectable = canSelectUnitForBatch(unit);
                      const unitChecked = selectedBatchKeys.has(unitBatchKey);
                      const unitBlockReason = explainOrderApprovalBlockReason(unit.mainOrder);

                      const getLanguageDisplay = (lang?: string) => {
                        const l = (lang || 'ta').toLowerCase();
                        if (l === 'ta' || l === 'tamil') {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                              Tamil
                            </span>
                          );
                        }
                        if (l === 'hi' || l === 'hindi') {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-500/20">
                              Hindi
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20">
                            English
                          </span>
                        );
                      };

                      const getStatusBadge = (st: string) => {
                        const s = st.toUpperCase();
                        if (s === 'COMPLETED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Completed</span>
                            </span>
                          );
                        }
                        if (s === 'PROCESSING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                              <span>Processing / Retry</span>
                            </span>
                          );
                        }
                        if (s === 'GENERATED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                              <span>Generated</span>
                            </span>
                          );
                        }
                        if (s === 'PENDING' || s === 'PENDING_APPROVAL') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                              <span>Pending</span>
                            </span>
                          );
                        }
                        if (s === 'REFUNDED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                              <span>Refunded</span>
                            </span>
                          );
                        }
                        if (s === 'CANCELLED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              <span>Cancelled</span>
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {st}
                          </span>
                        );
                      };

                      // --- 2A. FAMILY ORDER ROW ---
                      if (isGroup) {
                        const isApprovingGroup = isProcessing(`family-approve-${groupId}`);
                        const isEmailingGroup = isProcessing(`family-email-${groupId}`);
                        const isCancellingGroup = isProcessing(`family-cancel-${groupId}`);

                        return (
                          <div key={groupId} className="bg-amber-500/[0.02] dark:bg-amber-500/[0.03] hover:bg-amber-500/[0.06] transition-all">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                              {/* 1. Order & Language */}
                              <div className="col-span-3 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <input
                                    type="checkbox"
                                    checked={unitChecked}
                                    disabled={!unitSelectable || !!batchProgress?.isProcessing}
                                    onChange={() => toggleBatchUnitSelection(unitBatchKey)}
                                    aria-label={`Select family order ${groupId} for batch send`}
                                    title={unitSelectable ? 'Select family order for batch send' : (unitBlockReason || 'Not eligible for batch send')}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                                  />
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-black text-xs bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-2xs">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>Family ({unit.orders.length})</span>
                                  </span>
                                  {getLanguageDisplay(unit.mainOrder.language)}
                                </div>
                                <div className="font-mono text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <span>ID:</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">{groupId}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>
                                    {unit.createdAt
                                      ? new Date(unit.createdAt).toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric'
                                        })
                                      : 'N/A'}
                                  </span>
                                </div>
                              </div>

                              {/* 2. User & Astro Service */}
                              <div className="col-span-3 space-y-1">
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                  {unit.userName}
                                </div>
                                <div className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                                  <span>Bundle of {unit.orders.length} Users:</span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                  {unit.orders.map(o => o.userName || o.inputPayload?.name).filter(Boolean).join(', ')}
                                </div>

                                {familyRenderProgress?.groupId === groupId && (
                                  <div className="mt-2 space-y-1 p-2 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-700 dark:text-purple-300">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>
                                        Rendering {familyRenderProgress.index}/{familyRenderProgress.total}
                                        {familyRenderProgress.memberName ? ` (${familyRenderProgress.memberName})` : ''}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-purple-600 transition-all duration-300 rounded-full"
                                        style={{ width: `${(familyRenderProgress.index / Math.max(1, familyRenderProgress.total)) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 3. Contact & Origin */}
                              <div className="col-span-2 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-300 truncate" title={unit.userEmail}>
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{unit.userEmail}</span>
                                </div>
                                {unit.country && (
                                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                    <Globe className="w-3 h-3 text-amber-500" />
                                    <span>{unit.country}</span>
                                  </div>
                                )}
                                {unit.ipAddress && (
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                                    <span>IP:</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyIp(unit.ipAddress!)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                                      title="Copy IP"
                                    >
                                      <span>{unit.ipAddress}</span>
                                      {copiedIp === unit.ipAddress ? (
                                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5 text-slate-400" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* 4. Payment & Status */}
                              <div className="col-span-2 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-sm text-slate-900 dark:text-amber-400">
                                    ${unit.totalAmount.toFixed(2)} {unit.currency}
                                  </span>
                                  {getStatusBadge(unit.status)}
                                </div>
                                {unit.paymentReference && (
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                    Ref: <span className="font-semibold text-slate-700 dark:text-slate-200">{unit.paymentReference}</span>
                                  </div>
                                )}
                                {isEmailFailed && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800" title="Email delivery failed">
                                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                                    <span>Email Failed</span>
                                  </span>
                                )}
                              </div>

                              {/* 5. Actions */}
                              <div className="col-span-2">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {/* Expand/Collapse Chevron Button */}
                                  <button
                                    type="button"
                                    onClick={() => toggleGroupExpand(groupId)}
                                    title={isExpanded ? 'Hide member charts' : 'View member charts'}
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    <span>{isExpanded ? 'Hide' : `${unit.orders.length} Charts`}</span>
                                  </button>

                                  {/* Consolidated Invoice Preview */}
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewFamilyInvoice(unit.orders, groupId)}
                                    title="View Consolidated Family Invoice"
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center gap-1 transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Invoice</span>
                                  </button>

                                  {/* Approve All when pending */}
                                  {isPending && (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveFamilyGroup(groupId, unit.orders)}
                                      disabled={isApprovingGroup}
                                      title={`Approve all ${unit.orders.length} charts, generate PDFs, and send email`}
                                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                    >
                                      <Send className={`w-3.5 h-3.5 ${isApprovingGroup ? 'animate-spin' : ''}`} />
                                      <span>{isApprovingGroup ? 'Processing...' : `Approve All (${unit.orders.length})`}</span>
                                    </button>
                                  )}

                                  {/* Resend Email button ONLY when completed and email delivery failed */}
                                  {unit.isAllCompleted && isEmailFailed && (
                                    <button
                                      type="button"
                                      onClick={() => handleResendFamilyEmail(groupId, unit.orders)}
                                      disabled={isEmailingGroup}
                                      title={`Email delivery failed. Click to resend family reports to ${unit.userEmail}`}
                                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                    >
                                      <RotateCcw className={`w-3.5 h-3.5 ${isEmailingGroup ? 'animate-spin' : ''}`} />
                                      <span>{isEmailingGroup ? 'Resending...' : 'Resend Email'}</span>
                                    </button>
                                  )}

                                  {/* ONE-CLICK 90% REFUND (family bundle) */}
                                  {canOneClickRefundGroup(unit.orders) && (
                                    <button
                                      type="button"
                                      onClick={() => handleProcessRefund(unit.mainOrder, true)}
                                      disabled={isProcessing(`refund-${unit.mainOrder?.id || groupId}`)}
                                      title={`One-click refund: return 90% (${moneyLabel(preApprovalRefundAmount(unit.totalAmount), unit.currency)}) for all ${unit.orders.length} charts. Settles within 3 working days.`}
                                      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                    >
                                      <RotateCcw className={`w-3.5 h-3.5 ${isProcessing(`refund-${unit.mainOrder?.id || groupId}`) ? 'animate-spin' : ''}`} />
                                      <span>{isProcessing(`refund-${unit.mainOrder?.id || groupId}`) ? 'Refunding...' : `Refund 90%`}</span>
                                    </button>
                                  )}

                                  {/* Cancel Family Order Button */}
                                  {isPending && !canOneClickRefundGroup(unit.orders) && (
                                    <button
                                      type="button"
                                      onClick={() => handleCancelFamilyOrder(groupId)}
                                      disabled={isCancellingGroup}
                                      title="Cancel this family package"
                                      className="px-2 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center gap-1 transition-colors border border-rose-200 dark:border-rose-900/50 cursor-pointer"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Cancel</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Refunded bundle summary */}
                            {refundSummaryText(unit.orders[0]) && (
                              <div className="px-6 py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800/60">
                                💸 {refundSummaryText(unit.orders[0])}
                              </div>
                            )}

                            {/* Expanded Nested Member Cards */}
                            {isExpanded && (
                              <div className="px-6 pb-4 pt-1 bg-slate-50/70 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800">
                                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
                                  <div className="text-xs font-bold text-slate-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <Package className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Included Member Horoscopes ({unit.orders.length}):</span>
                                  </div>
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                                    {unit.orders.map((mOrder, idx) => (
                                      <div key={mOrder.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">#{idx + 1}.</span>
                                            <span className="font-bold text-slate-900 dark:text-white text-xs">{mOrder.userName || mOrder.inputPayload?.name || 'User'}</span>
                                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                              ({mOrder.serviceType === 'BIRTH_JATHAGAM'
                                                ? '🪐 Birth Jathagam'
                                                : mOrder.serviceType === 'MARRIAGE_COMPATIBILITY'
                                                ? '💍 Wedding Matching'
                                                : mOrder.serviceType === 'BABY_NAMING'
                                                ? '👶 Baby Naming Syllables'
                                                : mOrder.serviceType === 'MUHURTHAM'
                                                ? '📅 Subha Muhurtham'
                                                : mOrder.serviceType})
                                            </span>
                                          </div>
                                          {(mOrder.inputPayload?.dob || mOrder.inputPayload?.birthPlace) && (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 pl-4 flex-wrap">
                                              {mOrder.inputPayload?.dob && <span>DOB: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.dob}</strong></span>}
                                              {mOrder.inputPayload?.tob && <span>Time: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.tob}</strong></span>}
                                              {mOrder.inputPayload?.birthPlace && <span>Place: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.birthPlace}</strong></span>}
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedOrder(mOrder)}
                                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer shadow-2xs shrink-0"
                                        >
                                          <Eye className="w-3 h-3 text-amber-500" />
                                          <span>View Chart</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // --- 2B. SINGLE ORDER ROW ---
                      const order = unit.mainOrder;
                      const isSendingEmail = isProcessing(`email-${order.id}`);
                      const isCancelling = isProcessing(order.id);
                      const orderItems = order.items || [];
                      const isMultiPerson = isMultiPersonUnit(order);
                      const isItemsExpanded = !!expandedItemOrderIds[order.id];
                      const singleEmailFailed = ((order.emailStatus || '').toUpperCase() === 'FAILED' || (order.emailStatus || '').toUpperCase() === 'ERROR');

                      return (
                        <div key={order.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-all">
                          <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                            {/* 1. Order & Language */}
                            <div className="col-span-3 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="checkbox"
                                  checked={unitChecked}
                                  disabled={!unitSelectable || !!batchProgress?.isProcessing}
                                  onChange={() => toggleBatchUnitSelection(unitBatchKey)}
                                  aria-label={`Select order ${order.orderNumber || order.id} for batch send`}
                                  title={unitSelectable ? 'Select order for batch send' : (unitBlockReason || 'Not eligible for batch send')}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                                />
                                <span className="font-mono font-extrabold text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shadow-2xs">
                                  #{order.orderNumber || order.id}
                                </span>
                                {getLanguageDisplay(order.language)}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>
                                  {order.createdAt
                                    ? new Date(order.createdAt).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })
                                    : 'N/A'}
                                  {order.createdAt
                                    ? ` · ${new Date(order.createdAt).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                      })}`
                                    : ''}
                                </span>
                              </div>
                            </div>

                            {/* 2. User & Astro Service */}
                            <div className="col-span-3 space-y-1">
                              <div className="font-bold text-slate-900 dark:text-white text-sm">
                                {order.userName || order.inputPayload?.name || 'User'}
                              </div>
                              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                {isMultiPerson
                                  ? `👪 Multi-Person Order (${orderItems.length} report${orderItems.length === 1 ? '' : 's'})`
                                  : serviceDisplayName(order.serviceType)}
                              </div>
                              {(order.inputPayload?.dob || order.inputPayload?.birthPlace) && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                                  {order.inputPayload?.dob && (
                                    <span>
                                      DOB: <strong className="text-slate-700 dark:text-slate-200">{order.inputPayload.dob}</strong>
                                    </span>
                                  )}
                                  {order.inputPayload?.tob && (
                                    <span>
                                      Time: <strong className="text-slate-700 dark:text-slate-200">{order.inputPayload.tob}</strong>
                                    </span>
                                  )}
                                  {order.inputPayload?.birthPlace && (
                                    <span className="truncate max-w-[150px]" title={order.inputPayload.birthPlace}>
                                      Place: <strong className="text-slate-700 dark:text-slate-200">{order.inputPayload.birthPlace}</strong>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 3. Contact & Origin */}
                            <div className="col-span-2 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-300 truncate" title={order.userEmail}>
                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{order.userEmail}</span>
                              </div>
                              {order.country && (
                                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                  <Globe className="w-3 h-3 text-amber-500" />
                                  <span>{order.country}</span>
                                </div>
                              )}
                              {order.ipAddress && (
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                                  <span>IP:</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyIp(order.ipAddress!)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                                    title="Copy IP"
                                  >
                                    <span>{order.ipAddress}</span>
                                    {copiedIp === order.ipAddress ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                                    )}
                                  </button>
                                  {bannedIps.some(b => b.ipAddress === order.ipAddress) && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-500 border border-rose-500/40">
                                      BANNED
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 4. Payment & Status */}
                            <div className="col-span-2 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-sm text-slate-900 dark:text-amber-400 font-mono">
                                  ${order.totalAmount ? order.totalAmount.toFixed(2) : '0.00'} {order.currency || 'USD'}
                                </span>
                                {getStatusBadge(order.status)}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                Ref: <span className="font-semibold text-slate-700 dark:text-slate-200">{order.paymentReference || order.orderNumber || order.id || 'N/A'}</span>
                              </div>
                              {singleEmailFailed && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800" title="Email delivery failed">
                                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                                  <span>Email Failed</span>
                                </span>
                              )}
                              {/* Refunded order: the amount returned and its 3-working-day settlement date */}
                              {refundSummaryText(order) && (
                                <div className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 truncate" title={refundSummaryText(order)}>
                                  💸 {refundSummaryText(order)}
                                </div>
                              )}
                            </div>

                            {/* 5. Actions */}
                            <div className="col-span-2">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* View Button (Available for all orders) */}
                                <button
                                  type="button"
                                  onClick={() => isMultiPerson ? toggleItemsExpand(order.id) : setSelectedOrder(order)}
                                  title={isMultiPerson ? 'Show every person and preview/send their reports individually' : 'View full horoscope details, predictions, report and invoice'}
                                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs border border-slate-200 dark:border-slate-700"
                                >
                                  {isMultiPerson && isItemsExpanded
                                    ? <ChevronUp className="w-3.5 h-3.5 text-amber-500" />
                                    : <Eye className="w-3.5 h-3.5 text-amber-500" />}
                                  <span>{isMultiPerson ? (isItemsExpanded ? 'Hide Reports' : `${orderItems.length} Reports`) : 'View'}</span>
                                </button>

                                {/* Approve Button (Shown when pending) */}
                                {isPending && (
                                  <button
                                    type="button"
                                    onClick={() => handleDirectSendCustomerEmail(order)}
                                    disabled={isSendingEmail}
                                    title={`Approve, generate Vedic PDF report and invoice, emailing to ${order.userEmail}`}
                                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                  >
                                    <Send className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                                    <span>{isSendingEmail ? 'Processing...' : (isMultiPerson ? 'Approve All' : 'Approve')}</span>
                                  </button>
                                )}

                                {/* Resend Email button ONLY when completed and email delivery failed */}
                                {isCompleted && singleEmailFailed && (
                                  <button
                                    type="button"
                                    onClick={() => handleDirectSendCustomerEmail(order)}
                                    disabled={isSendingEmail}
                                    title={`Email delivery failed. Click to retry emailing official PDF report & invoice to ${order.userEmail}`}
                                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                  >
                                    <RotateCcw className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                                    <span>{isSendingEmail ? 'Resending...' : (isMultiPerson ? 'Resend All' : 'Resend Email')}</span>
                                  </button>
                                )}

                                {/* ONE-CLICK 90% REFUND */}
                                {canOneClickRefund(order) && (
                                  <button
                                    type="button"
                                    onClick={() => handleProcessRefund(order)}
                                    disabled={isProcessing(`refund-${order.id}`)}
                                    title={`One-click refund: return 90% (${moneyLabel(preApprovalRefundAmount(order.amount), order.currency)}) to ${order.userEmail}. Settles within 3 working days.`}
                                    className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                                  >
                                    <RotateCcw className={`w-3.5 h-3.5 ${isProcessing(`refund-${order.id}`) ? 'animate-spin' : ''}`} />
                                    <span>{isProcessing(`refund-${order.id}`) ? 'Refunding...' : 'Refund 90%'}</span>
                                  </button>
                                )}

                                {/* Cancel Button (shown only when pending and unpaid) */}
                                {isPending && !canOneClickRefund(order) && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelOrder(order.id)}
                                    disabled={isCancelling}
                                    title="Cancel this order"
                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center gap-1 transition-colors border border-rose-200 dark:border-rose-900/50 cursor-pointer"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Cancel</span>
                                  </button>
                                )}

                                {/* Consolidated order invoice */}
                                {isMultiPerson && (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadOrderInvoice(order)}
                                    disabled={isProcessing(`inv-${order.id}`)}
                                    title="Download the ONE consolidated tax invoice for this order"
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center gap-1 transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Invoice</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* People & reports: preview/send each report on its own */}
                          {isMultiPerson && isItemsExpanded && renderMultiPersonItems(order)}
                        </div>
                      );
                    })}
                  </div>
                </div>
    </>
  );
};
