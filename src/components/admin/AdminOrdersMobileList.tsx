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

export const AdminOrdersMobileList: React.FC<{ ctx: any }> = ({ ctx }) => {
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
                {/* 1. MOBILE CARDS VIEW (Clean, Modern, Responsive for Mobile Screens) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
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
                    const unitBatchKey = getBatchKeyForUnit(unit);
                    const unitSelectable = canSelectUnitForBatch(unit);
                    const unitChecked = selectedBatchKeys.has(unitBatchKey);
                    const unitBlockReason = explainOrderApprovalBlockReason(unit.mainOrder);

                    const getLanguageBadge = (lang?: string) => {
                      const l = (lang || 'ta').toLowerCase();
                      if (l === 'ta' || l === 'tamil') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25">
                            Tamil
                          </span>
                        );
                      }
                      if (l === 'hi' || l === 'hindi') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-500/25">
                            Hindi
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/25">
                          English
                        </span>
                      );
                    };

                    const getStatusBadge = (st: string) => {
                      const s = st.toUpperCase();
                      if (s === 'COMPLETED') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Completed</span>
                          </span>
                        );
                      }
                      if (s === 'PROCESSING') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                            <span>Processing / Retry</span>
                          </span>
                        );
                      }
                      if (s === 'GENERATED') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                            <span>Generated</span>
                          </span>
                        );
                      }
                      if (s === 'PENDING' || s === 'PENDING_APPROVAL') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                            <span>Pending</span>
                          </span>
                        );
                      }
                      if (s === 'REFUNDED') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            <span>Refunded</span>
                          </span>
                        );
                      }
                      if (s === 'CANCELLED') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span>Cancelled</span>
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {st}
                        </span>
                      );
                    };

                    if (isGroup) {
                      const isApprovingGroup = isProcessing(`family-approve-${groupId}`);
                      const isEmailingGroup = isProcessing(`family-email-${groupId}`);
                      const isCancellingGroup = isProcessing(`family-cancel-${groupId}`);
                      const isRefundingGroup = isProcessing(`refund-${unit.mainOrder?.id || groupId}`);

                      return (
                        <div key={groupId} className="p-4 sm:p-5 space-y-3.5 bg-gradient-to-b from-amber-500/[0.04] to-transparent dark:from-amber-500/[0.03] dark:to-transparent hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-all">
                          {/* 1. Header: Family Group Badge & Status */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={unitChecked}
                                disabled={!unitSelectable || !!batchProgress?.isProcessing}
                                onChange={() => toggleBatchUnitSelection(unitBatchKey)}
                                aria-label={`Select family order ${groupId} for batch send`}
                                title={unitSelectable ? 'Select family order for batch send' : (unitBlockReason || 'Not eligible for batch send')}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                              />
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-xs">
                                <Users className="w-3.5 h-3.5" />
                                <span>Family Order ({unit.orders.length} People)</span>
                              </span>
                              <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                {groupId}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {getStatusBadge(unit.status)}
                              {((unit.emailStatus || '').toUpperCase() === 'FAILED' || (unit.emailStatus || '').toUpperCase() === 'ERROR') && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40" title="Email delivery failed">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  <span>Email Failed</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 2. Family Summary Info */}
                          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                                {unit.userName}
                              </span>
                              {unit.country && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-amber-300 border border-slate-300 dark:border-slate-600">
                                  {unit.country}
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-amber-500" />
                              <span className="truncate">{unit.userEmail}</span>
                            </div>

                            {/* Total Paid & Payment Ref */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Total Paid:</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-amber-400 text-sm">
                                  ${unit.totalAmount.toFixed(2)} {unit.currency}
                                </span>
                              </div>
                              {unit.paymentReference && (
                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-300">
                                  <span className="uppercase text-[9px] font-bold text-slate-400">Ref: </span>
                                  <strong className="text-slate-700 dark:text-amber-300 font-bold">{unit.paymentReference}</strong>
                                </div>
                              )}
                            </div>

                            {/* IP Address with Quick Copy */}
                            {unit.ipAddress && (
                              <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                                <span className="text-[9.5px] uppercase font-bold text-slate-400">IP:</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyIp(unit.ipAddress!)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                                  title="Click to copy IP for Block List"
                                >
                                  <span className="font-semibold">{unit.ipAddress}</span>
                                  {copiedIp === unit.ipAddress ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-slate-400" />
                                  )}
                                </button>
                                {copiedIp === unit.ipAddress && (
                                  <span className="text-[10px] text-emerald-500 font-bold">Copied!</span>
                                )}
                                {bannedIps.some(b => b.ipAddress === unit.ipAddress) && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-500 border border-rose-500/40">
                                    BANNED
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 3a. Live render progress for THIS family order */}
                          {familyRenderProgress?.groupId === groupId && (
                            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-400/40 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-bold text-purple-700 dark:text-purple-300">
                                <span className="flex items-center gap-1.5">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Rendering report {familyRenderProgress.index}/{familyRenderProgress.total}
                                  {familyRenderProgress.memberName ? ` — ${familyRenderProgress.memberName}` : ''}
                                </span>
                                {familyRenderProgress.bytes ? (
                                  <span>{(familyRenderProgress.bytes / 1048576).toFixed(1)} MB</span>
                                ) : null}
                              </div>
                              <div className="w-full h-1.5 bg-purple-200/60 dark:bg-purple-900/60 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                                  style={{ width: `${(familyRenderProgress.index / Math.max(1, familyRenderProgress.total)) * 100}%` }}
                                />
                              </div>
                              <div className="text-[10.5px] font-semibold text-purple-700/90 dark:text-purple-300/90">
                                {familyRenderProgress.message}
                              </div>
                            </div>
                          )}

                          {/* 3. Family Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {/* Expand/Collapse Member Breakdown Button */}
                            <button
                              type="button"
                              onClick={() => toggleGroupExpand(groupId)}
                              className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200 dark:border-slate-700/60 shadow-2xs"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-500" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-500" />}
                              <span>{isExpanded ? 'Hide Horoscopes' : `View ${unit.orders.length} Horoscopes`}</span>
                            </button>

                            {/* View Invoice live preview */}
                            <button
                              type="button"
                              onClick={() => handlePreviewFamilyInvoice(unit.orders, groupId)}
                              title="View official family tax invoice"
                              className="flex-1 py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-amber-500/30 shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Invoice</span>
                            </button>

                            {/* Approve & Send Combined Email Button (Only when pending) */}
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleApproveFamilyGroup(groupId, unit.orders)}
                                disabled={isApprovingGroup}
                                title={`Approve all ${unit.orders.length} family charts and deliver reports`}
                                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                              >
                                <Send className={`w-3.5 h-3.5 ${isApprovingGroup ? 'animate-spin' : ''}`} />
                                <span>{isApprovingGroup ? 'Processing...' : `Approve (${unit.orders.length})`}</span>
                              </button>
                            )}

                            {/* Cancel Family Order if pending AND unpaid */}
                            {isPending && !canOneClickRefundGroup(unit.orders) && (
                              <button
                                type="button"
                                onClick={() => handleCancelFamilyOrder(groupId)}
                                disabled={isCancellingGroup}
                                title="Cancel entire family order"
                                className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1 transition-colors disabled:opacity-40 cursor-pointer border border-rose-200 dark:border-rose-900/50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            )}

                            {/* ONE-CLICK 90% REFUND (family bundle) */}
                            {canOneClickRefundGroup(unit.orders) && (
                              <button
                                type="button"
                                onClick={() => handleProcessRefund(unit.mainOrder, true)}
                                disabled={isRefundingGroup}
                                title={`One-click refund: return 90% (${moneyLabel(preApprovalRefundAmount(unit.totalAmount), unit.currency)}) for all ${unit.orders.length} charts. Settles within 3 working days.`}
                                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${isRefundingGroup ? 'animate-spin' : ''}`} />
                                <span>{isRefundingGroup ? 'Refunding...' : `Refund 90% (${moneyLabel(preApprovalRefundAmount(unit.totalAmount), unit.currency)})`}</span>
                              </button>
                            )}

                            {/* Resend Email ONLY if email delivery failed */}
                            {unit.isAllCompleted && ((unit.emailStatus || '').toUpperCase() === 'FAILED' || (unit.emailStatus || '').toUpperCase() === 'ERROR') && (
                              <button
                                type="button"
                                onClick={() => handleResendFamilyEmail(groupId, unit.orders)}
                                disabled={isEmailingGroup}
                                title={`Email delivery failed. Click to resend family reports to ${unit.userEmail}`}
                                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${isEmailingGroup ? 'animate-spin' : ''}`} />
                                <span>{isEmailingGroup ? 'Resending...' : 'Resend Email'}</span>
                              </button>
                            )}
                          </div>

                          {/* Refunded bundle: what was returned and when it settles */}
                          {refundSummaryText(unit.mainOrder) && (
                            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl px-3 py-2">
                              💸 {refundSummaryText(unit.mainOrder)}
                            </div>
                          )}

                          {/* 4. Expanded Sub-items List (Individual Family Members) */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 animate-in fade-in">
                              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5" />
                                <span>Individual Horoscopes ({unit.orders.length}):</span>
                              </div>
                              <div className="space-y-2">
                                {unit.orders.map((mOrder, idx) => (
                                  <div key={mOrder.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 shadow-2xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                        #{idx + 1}. {mOrder.userName || mOrder.inputPayload?.name || 'User'}
                                      </span>
                                      {getLanguageBadge(mOrder.language)}
                                    </div>
                                    <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                      {mOrder.serviceType === 'BIRTH_JATHAGAM'
                                        ? '🪐 Birth Jathagam'
                                        : mOrder.serviceType === 'MARRIAGE_COMPATIBILITY'
                                        ? '💍 Wedding Matching'
                                        : mOrder.serviceType === 'BABY_NAMING'
                                        ? '👶 Baby Naming Syllables'
                                        : mOrder.serviceType === 'MUHURTHAM'
                                        ? '📅 Subha Muhurtham'
                                        : mOrder.serviceType}
                                    </div>
                                    {(mOrder.inputPayload?.dob || mOrder.inputPayload?.birthPlace) && (
                                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                        {mOrder.inputPayload?.dob && <span>DOB: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.dob}</strong></span>}
                                        {mOrder.inputPayload?.tob && <span>Time: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.tob}</strong></span>}
                                        {mOrder.inputPayload?.birthPlace && <span>Place: <strong className="text-slate-700 dark:text-slate-200">{mOrder.inputPayload.birthPlace}</strong></span>}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedOrder(mOrder)}
                                        className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3 text-amber-500" />
                                        <span>View Chart</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Single Order Mobile Card
                    const order = unit.mainOrder;
                    const isSendingEmail = isProcessing(`email-${order.id}`);
                    const isCancelling = isProcessing(order.id);
                    const isRefunding = isProcessing(`refund-${order.id}`);
                    const orderItems = order.items || [];
                    const isMultiPerson = isMultiPersonUnit(order);
                    const isItemsExpanded = !!expandedItemOrderIds[order.id];

                    return (
                      <div key={order.id} className="p-4 sm:p-5 space-y-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                        {/* 1. Header: Order #, Language, Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={unitChecked}
                              disabled={!unitSelectable || !!batchProgress?.isProcessing}
                              onChange={() => toggleBatchUnitSelection(unitBatchKey)}
                              aria-label={`Select order ${order.orderNumber || order.id} for batch send`}
                              title={unitSelectable ? 'Select order for batch send' : (unitBlockReason || 'Not eligible for batch send')}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                            />
                            <span className="font-mono font-bold text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                              #{order.orderNumber || order.id}
                            </span>
                            {getLanguageBadge(order.language)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {getStatusBadge(order.status)}
                            {((order.emailStatus || '').toUpperCase() === 'FAILED' || (order.emailStatus || '').toUpperCase() === 'ERROR') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/20 text-rose-500 border border-rose-500/40" title="Email delivery failed">
                                <AlertTriangle className="w-3 h-3 text-rose-500" />
                                <span>Email Failed</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 2. Customer & Service Details */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                              {order.userName || order.inputPayload?.name || 'User'}
                            </span>
                            {order.country && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-amber-300 border border-slate-300 dark:border-slate-600">
                                {order.country}
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            {isMultiPerson
                              ? `👪 Multi-Person Order (${orderItems.length} report${orderItems.length === 1 ? '' : 's'})`
                              : serviceDisplayName(order.serviceType)}
                          </div>

                          {/* Micro birth details */}
                          {(order.inputPayload?.dob || order.inputPayload?.birthPlace) && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-0.5 font-sans">
                              {order.inputPayload?.dob && (
                                <span>
                                  <span className="text-[9.5px] uppercase font-bold text-slate-400">DOB:</span>{' '}
                                  <strong className="font-bold text-slate-700 dark:text-slate-200">{order.inputPayload.dob}</strong>
                                </span>
                              )}
                              {order.inputPayload?.tob && (
                                <span>
                                  <span className="text-[9.5px] uppercase font-bold text-slate-400">Time:</span>{' '}
                                  <strong className="font-bold text-slate-700 dark:text-slate-200">{order.inputPayload.tob}</strong>
                                </span>
                              )}
                              {order.inputPayload?.birthPlace && (
                                <span className="truncate max-w-[200px]">
                                  <span className="text-[9.5px] uppercase font-bold text-slate-400">Place:</span>{' '}
                                  <strong className="font-bold text-slate-700 dark:text-slate-200">{order.inputPayload.birthPlace}</strong>
                                </span>
                              )}
                            </div>
                          )}

                          <div className="text-xs text-slate-600 dark:text-slate-300 font-mono flex items-center gap-1.5 pt-0.5">
                            <span className="truncate">{order.userEmail}</span>
                          </div>
                        </div>

                        {/* 3. Date & Payment Details Bar */}
                        <div className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400 px-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400">Ordered:</span>{' '}
                              <strong className="font-bold text-slate-700 dark:text-slate-200">
                                {order.createdAt
                                  ? new Date(order.createdAt).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })
                                  : 'N/A'}
                              </strong>
                            </div>
                            {order.paymentReference && (
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Ref:</span>{' '}
                                <strong className="font-bold text-slate-700 dark:text-amber-300">{order.paymentReference}</strong>
                              </div>
                            )}
                          </div>

                          {order.ipAddress && (
                            <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-slate-400">
                              <span className="text-[9.5px] uppercase font-bold text-slate-400">IP:</span>
                              <button
                                type="button"
                                onClick={() => handleCopyIp(order.ipAddress!)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                                title="Click to copy IP for Block List"
                              >
                                <span className="font-semibold">{order.ipAddress}</span>
                                {copiedIp === order.ipAddress ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400" />
                                )}
                              </button>
                              {copiedIp === order.ipAddress && (
                                <span className="text-[10px] text-emerald-500 font-bold">Copied!</span>
                              )}
                              {bannedIps.some(b => b.ipAddress === order.ipAddress) && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-500 border border-rose-500/40">
                                  BANNED
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 4. Action Buttons */}
                        <div className="flex items-center gap-2 pt-0.5">
                          {/* View button to review horoscope calculations, report & invoice */}
                          <button
                            type="button"
                            onClick={() => isMultiPerson ? toggleItemsExpand(order.id) : setSelectedOrder(order)}
                            title={isMultiPerson ? 'Show every person and preview/send their reports individually' : 'View full horoscope calculations, report and invoice'}
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs border border-slate-200 dark:border-slate-700/60"
                          >
                            {isMultiPerson && isItemsExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-amber-500" />
                              : <Eye className="w-3.5 h-3.5 text-amber-500" />}
                            <span>{isMultiPerson ? (isItemsExpanded ? 'Hide Reports' : `${orderItems.length} Reports`) : 'View'}</span>
                          </button>

                          {/* Approve & Send (Only when pending) */}
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleDirectSendCustomerEmail(order)}
                              disabled={isSendingEmail}
                              title={`Approve, generate PDF report & tax invoice, and email directly to ${order.userEmail}`}
                              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                            >
                              <Send className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                              <span>{isSendingEmail ? 'Processing...' : (isMultiPerson ? 'Approve All' : 'Approve')}</span>
                            </button>
                          )}

                          {/* Cancel button: STRICTLY ONLY when order is pending approval AND nothing was paid */}
                          {isPending && !canOneClickRefund(order) && (
                            <button
                              type="button"
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={isCancelling}
                              title="Cancel this order"
                              className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1 transition-colors disabled:opacity-40 cursor-pointer border border-rose-200 dark:border-rose-900/50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          )}

                          {/* ONE-CLICK 90% REFUND */}
                          {canOneClickRefund(order) && (
                            <button
                              type="button"
                              onClick={() => handleProcessRefund(order)}
                              disabled={isRefunding}
                              title={`One-click refund: return 90% (${moneyLabel(preApprovalRefundAmount(order.amount), order.currency)}) to ${order.userEmail}. Settles within 3 working days.`}
                              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isRefunding ? 'animate-spin' : ''}`} />
                              <span>{isRefunding ? 'Refunding...' : `Refund 90% (${moneyLabel(preApprovalRefundAmount(order.amount), order.currency)})`}</span>
                            </button>
                          )}

                          {/* Resend Email: STRICTLY ONLY if order is completed and email delivery failed */}
                          {isCompleted && ((order.emailStatus || '').toUpperCase() === 'FAILED' || (order.emailStatus || '').toUpperCase() === 'ERROR') && (
                            <button
                              type="button"
                              onClick={() => handleDirectSendCustomerEmail(order)}
                              disabled={isSendingEmail}
                              title={`Email delivery failed. Click to retry sending PDF report and tax invoice to ${order.userEmail}`}
                              className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                              <span>{isSendingEmail ? 'Resending...' : (isMultiPerson ? 'Resend All' : 'Resend Email')}</span>
                            </button>
                          )}

                          {/* Consolidated order invoice */}
                          {isMultiPerson && (
                            <button
                              type="button"
                              onClick={() => handleDownloadOrderInvoice(order)}
                              disabled={isProcessing(`inv-${order.id}`)}
                              title="Download the ONE consolidated tax invoice for this order"
                              className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center justify-center gap-1 transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-500" />
                              <span>Invoice</span>
                            </button>
                          )}
                        </div>

                        {/* Refunded order: summary */}
                        {refundSummaryText(order) && (
                          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl px-3 py-2">
                            💸 {refundSummaryText(order)}
                          </div>
                        )}

                        {/* People & reports: preview/send each report on its own */}
                        {isMultiPerson && isItemsExpanded && renderMultiPersonItems(order)}
                      </div>
                    );
                  })}
                </div>

    </>
  );
};
