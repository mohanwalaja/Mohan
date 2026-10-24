import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { describeFamilyRenderQuality } from '../services/formatUtils';
// The simplified Surya + Chandra mark stays legible at avatar sizes; the full
// 12-rasi emblem is used for the large brand moments (Navbar / Login / Footer).
import logoImg from '../assets/astrosivam_appicon.png';
import { Order, OrderItem, AppSettings, AdminStats, TeamMember, ContactMessage, BannedIpEntry, AiChatHandoff } from '../types';
import { OrderReportModal } from '../components/common/OrderReportModal';
import { LivePdfPreviewModal } from '../components/common/LivePdfPreviewModal';
import { AdminLogin } from '../components/admin/AdminLogin';
// The PDF engine (jspdf + html2canvas, ~780 KB) is DEFERRED: every function
// below awaits loadPdfEngine() inside the click that actually renders a PDF, so
// opening the admin portal downloads no PDF code at all. Only the progress /
// staging TYPES are imported statically — they vanish at build time.
import type { FamilyRenderProgress, FamilyStagingResult } from '../services/jathagamPdfExporter';
import { loadPdfEngine } from '../services/pdfEngine';
import {
  buildOrderInvoiceHtmlForItems,
  deliverOrderItemsPdfPayload,
  deliverSingleOrderItemPdfPayload,
  getOrCalculateResult,
  orderItemAsOrder,
  prepareOrderItemPdfs,
  prepareOrderItemsSendPayload
} from '../services/orderItems';
import {
  buildBatchProcessingPlan,
  canSelectUnitForBatch,
  explainOrderApprovalBlockReason,
  getBatchKeyForUnit,
  isUnitActionableForBatch,
  type BatchFailureRecord,
  type BatchRunSummary
} from '../services/adminBatchApproval';
import { orderChartServiceType } from '../services/multiPersonOrder';
import {
  DEFAULT_CURRENCY,
  DEFAULT_SERVICE_PRICES,
  MAX_USD_TO_INR_RATE,
  MIN_USD_TO_INR_RATE,
  USD_TO_INR_RATE,
  normalizeUsdToInrRate,
  usdToInr
} from '../services/pricing';
import type { ServiceType } from '../types';

import {
  ADMIN_PRICED_SERVICES,
  type AdminServicePricing,
  buildAdminServicePricing,
  computeGroupedOrderUnits,
  describeEmailParts,
  getItemStatusBadge,
  serviceDisplayName,
} from '../components/admin/adminPortalHelpers';
import {
  TEAM_PHOTO_ACCEPT,
  TEAM_PHOTO_MAX_BYTES,
  formatTeamPhotoBytes,
  prepareTeamPhoto,
} from '../services/teamPhoto';
import { SEO } from '../components/common/SEO';
import { AdminHeaderAndTabs } from '../components/admin/AdminHeaderAndTabs';
import { AdminOrdersToolbar } from '../components/admin/AdminOrdersToolbar';
import { AdminOrdersMobileList } from '../components/admin/AdminOrdersMobileList';
import { AdminOrdersDesktopTable } from '../components/admin/AdminOrdersDesktopTable';
import { AdminOperationsPanels } from '../components/admin/AdminOperationsPanels';
import { useAdminPortalActions } from '../components/admin/useAdminPortalActions';

const FinancialDashboard = lazy(() =>
  import('../components/admin/FinancialDashboard').then((m) => ({ default: m.FinancialDashboard }))
);
const AdminAnalyticsDashboard = lazy(() =>
  import('../components/admin/AdminAnalyticsDashboard').then((m) => ({ default: m.AdminAnalyticsDashboard }))
);
const PaymentConfigPanel = lazy(() =>
  import('../components/admin/PaymentConfigPanel').then((m) => ({ default: m.PaymentConfigPanel }))
);
const EmailConfigPanel = lazy(() =>
  import('../components/admin/EmailConfigPanel').then((m) => ({ default: m.EmailConfigPanel }))
);
const ChatAlertConfigPanel = lazy(() =>
  import('../components/admin/ChatAlertConfigPanel').then((m) => ({ default: m.ChatAlertConfigPanel }))
);
const AiAstrologerConfigPanel = lazy(() =>
  import('../components/admin/AiAstrologerConfigPanel').then((m) => ({ default: m.AiAstrologerConfigPanel }))
);
const DatabaseBackupPanel = lazy(() =>
  import('../components/admin/DatabaseBackupPanel').then((m) => ({ default: m.DatabaseBackupPanel }))
);
const SystemHealthPanel = lazy(() =>
  import('../components/admin/SystemHealthPanel').then((m) => ({ default: m.SystemHealthPanel }))
);
const SetupChecklistPanel = lazy(() =>
  import('../components/admin/SetupChecklistPanel').then((m) => ({ default: m.SetupChecklistPanel }))
);
const GoogleSetupPanel = lazy(() =>
  import('../components/admin/GoogleSetupPanel').then((m) => ({ default: m.GoogleSetupPanel }))
);
const SecurityBannedIpPanel = lazy(() =>
  import('../components/admin/SecurityBannedIpPanel').then((m) => ({ default: m.SecurityBannedIpPanel }))
);
const CustomerReviewsPanel = lazy(() =>
  import('../components/admin/CustomerReviewsPanel').then((m) => ({ default: m.CustomerReviewsPanel }))
);
const AdminTeamSection = lazy(() =>
  import('../components/admin/AdminTeamSection').then((m) => ({ default: m.AdminTeamSection }))
);
const AdminGeneralSettingsPanel = lazy(() =>
  import('../components/admin/AdminGeneralSettingsPanel').then((m) => ({ default: m.AdminGeneralSettingsPanel }))
);

interface AdminPortalProps {
  onNavigate: (route: string) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onNavigate }) => {
  const { isAdmin, isLoading: isAuthLoading, settings: authSettings, refreshSettings } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(authSettings);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [auditLogTotalPages, setAuditLogTotalPages] = useState(1);
  const [auditLogTotal, setAuditLogTotal] = useState(0);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [messagesList, setMessagesList] = useState<ContactMessage[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIpEntry[]>([]);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<any[]>([]);

  const handleCopyIp = (ip: string) => {
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const toggleGroupExpand = (groupId: string) =>
    setExpandedGroupIds(prev => ({ ...prev, [groupId]: !prev[groupId] }));

  const [activeSection, setActiveSection] = useState<
    'orders' | 'analytics' | 'financial' | 'payments' | 'emails' | 'alerts' | 'aiastrologer' | 'database' | 'health' | 'checklist' | 'messages' | 'reviews' | 'team' | 'settings' | 'users' | 'logs' | 'google' | 'security' | 'errors' | 'escalations'
  >('orders');

  // Astrologer escalation queue: complaints forwarded from the source-based chat and
  // "Talk to our astrologer" handoffs waiting for a human reply.
  const [aiHandoffs, setAiHandoffs] = useState<AiChatHandoff[]>([]);
  const [aiHandoffNotes, setAiHandoffNotes] = useState<Record<number, string>>({});
  const [aiHandoffBusy, setAiHandoffBusy] = useState<number | null>(null);

  const loadAiHandoffs = async () => {
    try {
      const res = await api.getAiHandoffs();
      if (res.success && Array.isArray(res.handoffs)) setAiHandoffs(res.handoffs);
    } catch {
      // The queue is best-effort on the admin screen; a fetch failure must not
      // break the rest of the portal.
    }
  };

  useEffect(() => {
    loadAiHandoffs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAiHandoff = async (id: number, status: 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED') => {
    setAiHandoffBusy(id);
    try {
      const notes = (aiHandoffNotes[id] || '').trim();
      const res = await api.updateAiHandoff(id, status, notes || undefined);
      if (res.success) {
        setAiHandoffNotes((prev) => { const next = { ...prev }; delete next[id]; return next; });
        await loadAiHandoffs();
      }
    } finally {
      setAiHandoffBusy(null);
    }
  };
  const [filterStatus, setFilterStatus] = useState<string>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
  const startProcessing = (id: string) => setProcessingIds(prev => ({ ...prev, [id]: true }));
  const stopProcessing = (id: string) => setProcessingIds(prev => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
  const isProcessing = (id: string) => !!processingIds[id];

  /**
   * Live progress of the family (group order) render pipeline. Every member
   * report is rendered one at a time in the browser at live-preview quality
   * (~2 MB, ~8 s each) and uploaded before the next one starts - exactly like
   * the single-order flow - so the operator can see which user is being
   * rendered instead of staring at a frozen button.
   */
  const [familyRenderProgress, setFamilyRenderProgress] = useState<{
    groupId: string;
    phase: FamilyRenderProgress['phase'];
    index: number;
    total: number;
    memberName: string;
    orderNumber: string;
    message: string;
    bytes?: number;
  } | null>(null);

  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    current: number;
    currentOrderNum: string;
    successCount: number;
    failCount: number;
    isProcessing: boolean;
  } | null>(null);
  const [batchStopping, setBatchStopping] = useState(false);
  const batchStopRequestedRef = useRef(false);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<Set<string>>(() => new Set());
  const [lastBatchSummary, setLastBatchSummary] = useState<BatchRunSummary | null>(null);

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Setting edit state
  const [serviceMode, setServiceMode] = useState<'FREE_BETA' | 'PAID'>(authSettings?.serviceMode || 'FREE_BETA');

  const [intlPrice, setIntlPrice] = useState(authSettings?.intlPriceUSD || 5);
  // The USD → INR rate is an admin setting: a fixed constant goes stale as soon
  // as the rupee moves, and every India price is derived from it.
  const [usdToInrRate, setUsdToInrRate] = useState<number>(() =>
    normalizeUsdToInrRate((authSettings as any)?.usdToInrRate)
  );
  // India (INR) is never entered by the admin: it is always US$ × the rate above.
  const [servicePricing, setServicePricing] = useState<AdminServicePricing>(() =>
    buildAdminServicePricing(
      (authSettings?.servicePricing ?? (authSettings as any)?.pricing) as any,
      normalizeUsdToInrRate((authSettings as any)?.usdToInrRate)
    )
  );
  const [autoEmail, setAutoEmail] = useState(authSettings?.autoEmailReports ?? true);
  // What the field shows may be a half-typed number. Prices are only derived
  // from a rate inside the accepted band; until the admin fixes it, the page
  // keeps quoting the default so no price ever looks wildly wrong.
  const usdToInrRateIsValid =
    Number.isFinite(usdToInrRate) && usdToInrRate >= MIN_USD_TO_INR_RATE && usdToInrRate <= MAX_USD_TO_INR_RATE;
  const effectiveUsdToInrRate = usdToInrRateIsValid ? usdToInrRate : USD_TO_INR_RATE;

  // Modal inspection
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [previewOrderForPdf, setPreviewOrderForPdf] = useState<Order | null>(null);
  const [isPreviewPdfLoading, setIsPreviewPdfLoading] = useState(false);
  const [familyInvoicePreview, setFamilyInvoicePreview] = useState<{ orders: Order[]; groupId: string } | null>(null);
  // MULTI-PERSON ORDERS: one row per order, expanding to people + their reports.
  const [expandedItemOrderIds, setExpandedItemOrderIds] = useState<Record<string, boolean>>({});
  const [reportItemView, setReportItemView] = useState<{ header: Order; item: OrderItem; chartOrder: Order } | null>(null);
  const [itemSendProgress, setItemSendProgress] = useState('');

  // Team Member Form Modal State
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberFormData, setMemberFormData] = useState({
    nameEn: '',
    nameTa: '',
    nameHi: '',
    titleEn: '',
    titleTa: '',
    photoUrl: '',
    educationEn: '',
    educationTa: '',
    experienceYears: 15,
    specializations: 'Birth Jathagam, Navagraha Doshas, Matrimonial Poruthams',
    bioEn: '',
    bioTa: '',
    isActive: true,
    order: 1
  });
  // Team photo upload (the admin picks a file instead of pasting a URL).
  const [isTeamPhotoUploading, setIsTeamPhotoUploading] = useState(false);
  // Guards the Add/Update button: a second click while the first save is in
  // flight used to send a duplicate create and leave the modal open.
  const [isSavingTeamMember, setIsSavingTeamMember] = useState(false);
  // Shown directly above the Add/Update button, where the admin is looking when
  // a save fails (the photo error lives under the photo picker instead).
  const [teamSaveError, setTeamSaveError] = useState('');
  const [teamPhotoError, setTeamPhotoError] = useState('');
  const [teamPhotoInfo, setTeamPhotoInfo] = useState<{ bytes: number; width: number; height: number } | null>(null);
  const [showPhotoUrlField, setShowPhotoUrlField] = useState(false);
  const teamPhotoInputRef = React.useRef<HTMLInputElement>(null);

  const fetchAdminData = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const sectionNames = [
        'order statistics',
        'orders',
        'settings',
        'customers',
        'audit logs',
        'astrology team',
        'messages',
        'blocked IP addresses'
      ];
      const results = await Promise.allSettled([
        api.getAdminStats(),
        api.getAdminOrders(),
        api.getAdminSettings(),
        api.getAdminUsers(),
        api.getAdminAuditLogs(),
        api.getAdminTeamMembers(),
        api.getAdminMessages(),
        api.getAdminBannedIps()
      ]);
      const [statsResult, ordersResult, settingsResult, usersResult, logsResult, teamResult, msgsResult, bannedResult] = results;
      const statsRes = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const ordersRes = ordersResult.status === 'fulfilled' ? ordersResult.value : null;
      const settingsRes = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      const usersRes = usersResult.status === 'fulfilled' ? usersResult.value : null;
      const logsRes = logsResult.status === 'fulfilled' ? logsResult.value : null;
      const teamRes = teamResult.status === 'fulfilled' ? teamResult.value : null;
      const msgsRes = msgsResult.status === 'fulfilled' ? msgsResult.value : null;
      const bannedRes = bannedResult.status === 'fulfilled' ? bannedResult.value : null;

      // Render every healthy section even when another endpoint is slow or
      // unavailable. Promise.all used to discard all of these responses when
      // just one request rejected (notably the admin-settings abort timeout).
      if (statsRes?.success && statsRes.stats) setStats(statsRes.stats);
      // Defensive: API may return a non-array value for lists. Force arrays to
      // prevent .filter/.map/.length crashes during render after a page reload.
      if (ordersRes?.success && ordersRes.orders) setOrders(Array.isArray(ordersRes.orders) ? ordersRes.orders : []);
      if (settingsRes?.success && settingsRes.settings) {
        setSettings(settingsRes.settings);
        setServiceMode(settingsRes.settings.serviceMode);

        setIntlPrice(settingsRes.settings.intlPriceUSD);
        const loadedRate = normalizeUsdToInrRate((settingsRes.settings as any).usdToInrRate);
        setUsdToInrRate(loadedRate);
        setServicePricing(buildAdminServicePricing(
          (settingsRes.settings.servicePricing ?? (settingsRes.settings as any).pricing) as any,
          loadedRate
        ));
        setAutoEmail(settingsRes.settings.autoEmailReports);
      }
      if (usersRes?.success && usersRes.users) setUsersList(Array.isArray(usersRes.users) ? usersRes.users : []);
      if (logsRes?.success && logsRes.logs) {
        setAuditLogs(Array.isArray(logsRes.logs) ? logsRes.logs : []);
        if (logsRes.pagination) {
          setAuditLogTotalPages(logsRes.pagination.totalPages);
          setAuditLogTotal(logsRes.pagination.total);
        }
      }
      if (teamRes?.success && teamRes.team) setTeamMembers(Array.isArray(teamRes.team) ? teamRes.team : []);
      if (msgsRes?.success && msgsRes.messages) setMessagesList(Array.isArray(msgsRes.messages) ? msgsRes.messages : []);
      if (bannedRes?.success && bannedRes.bannedIps) setBannedIps(Array.isArray(bannedRes.bannedIps) ? bannedRes.bannedIps : []);

      const failedSections = results.reduce<string[]>((failures, result, index) => {
        if (result.status === 'rejected' || !result.value.success) failures.push(sectionNames[index]);
        return failures;
      }, []);
      if (failedSections.length > 0) {
        setErrorMessage(
          `Some admin records could not be loaded: ${failedSections.join(', ')}. ` +
          'Loaded sections are still available. Check your connection and tap Refresh Records to retry.'
        );
      }
    } catch (err: any) {
      console.error('Unexpected admin data loading failure', err);
      setErrorMessage('Admin records could not be refreshed. Check your connection and tap Refresh Records to retry.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  /** Fetch a specific page of audit logs (called by pagination controls). */
  const loadAuditLogPage = async (page: number) => {
    try {
      const res = await api.getAdminAuditLogs({ page, limit: 50 });
      if (res.success && res.logs) {
        setAuditLogs(Array.isArray(res.logs) ? res.logs : []);
        setAuditLogPage(page);
        if (res.pagination) {
          setAuditLogTotalPages(res.pagination.totalPages);
          setAuditLogTotal(res.pagination.total);
        }
      }
    } catch {
      // Non-critical; existing logs stay visible
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    startProcessing(orderId);
    setErrorMessage('');
    try {
      const order = orders.find(candidate => candidate.id === orderId);
      if (!order) throw new Error('The order is no longer available. Refresh the admin list and retry.');

      let res;
      const { prepareFamilyFulfilPayload, generateOrderPdfsBase64, deliverOrderPdfPayload } =
        await loadPdfEngine();
      if (order.groupId) {
        const groupOrders = orders.filter(candidate => candidate.groupId === order.groupId);
        const prepared = await prepareFamilyFulfilPayload(groupOrders, order.groupId);
        res = await api.approveFamilyOrder(order.groupId, prepared.payload);
      } else {
        const pdfs = await generateOrderPdfsBase64(order, order.language || 'ta');
        const payload = await deliverOrderPdfPayload(order, {
          ...pdfs,
          language: order.language || 'ta'
        });
        res = await api.approveOrder(orderId, payload);
      }

      if (res.success) {
        setSuccessMessage(order.groupId
          ? `Family group approved; all preview-quality reports and the consolidated invoice were delivered in ${describeEmailParts(res)}.`
          : `Order ${res.order?.orderNumber || orderId} approved and emailed with preview-quality PDFs.`);
        setOrders(prev => prev.map(o => o.id === orderId || (order.groupId && o.groupId === order.groupId)
          ? { ...o, status: 'COMPLETED', emailStatus: 'SENT' }
          : o));
        setTimeout(() => setSuccessMessage(''), 5000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Approval failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Approval failed; no email was sent.');
    } finally {
      stopProcessing(orderId);
    }
  };

  const handlePreviewOrderPdf = async (order: Order) => {
    setErrorMessage('');
    if (order.calculatedResult) {
      setPreviewOrderForPdf(order);
      return;
    }

    // If pending, calculate on the fly so admin can preview the exact result before approving
    setIsPreviewPdfLoading(true);
    startProcessing(order.id);
    try {
      const res = await api.calculateService(orderChartServiceType(order), order.inputPayload);
      if (res.success && res.result) {
        const simulatedOrder: Order = {
          ...order,
          calculatedResult: res.result
        };
        setPreviewOrderForPdf(simulatedOrder);
      } else {
        setErrorMessage(res.message || 'Failed to calculate astrology result for preview');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating preview');
    } finally {
      setIsPreviewPdfLoading(false);
      stopProcessing(order.id);
    }
  };

  /**
   * MULTI-PERSON ORDERS ------------------------------------------------------
   * One `orders` row now holds up to 6 people and their reports. Preview and
   * Send are PER REPORT, and both read the same cached result through
   * getOrCalculateResult() - so the PDF the customer receives is exactly the
   * report the admin previewed. The customer still gets ONE email per order
   * (all reports + the single consolidated invoice).
   */
  const isMultiPersonUnit = (order: Order) =>
    order.serviceType === 'MULTI_PERSON' || (Array.isArray(order.items) && order.items.length > 1);

  const toggleItemsExpand = (orderId: string) =>
    setExpandedItemOrderIds(prev => ({ ...prev, [orderId]: !prev[orderId] }));

  const handlePreviewOrderItem = async (header: Order, item: OrderItem) => {
    setErrorMessage('');
    startProcessing(`item-preview-${item.id}`);
    try {
      const calculated = await getOrCalculateResult(header.id, item);
      const chartOrder = orderItemAsOrder(header, calculated.item);
      setReportItemView({
        header: {
          ...header,
          items: (header.items || []).map(candidate => candidate.id === item.id ? calculated.item : candidate)
        },
        item: calculated.item,
        chartOrder
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to calculate this report');
    } finally {
      stopProcessing(`item-preview-${item.id}`);
    }
  };

  const handleSendOrderItem = async (header: Order, item: OrderItem) => {
    setErrorMessage('');
    setItemSendProgress(`Rendering report for ${item.personName || 'this person'}…`);
    startProcessing(`item-send-${item.id}`);
    try {
      const calculated = await getOrCalculateResult(header.id, item);
      const pdfs = await prepareOrderItemPdfs(header, calculated.item, calculated.result);
      const sendPayload = await deliverSingleOrderItemPdfPayload(header, item.id, pdfs);
      const res: any = await api.sendOrderItemEmail(header.id, item.id, sendPayload as any);
      if (res && res.success) {
        setSuccessMessage(`✅ ${res.message || `Report emailed to ${header.userEmail}.`}`);
        setOrders(prev => prev.map(o => o.id === header.id ? {
          ...o,
          emailStatus: 'SENT',
          status: (res.orderStatus as any) || o.status,
          items: (o.items || []).map(candidate => candidate.id === item.id
            ? { ...candidate, reportStatus: 'SENT' as any, sentAt: new Date().toISOString() }
            : candidate)
        } : o));
        setTimeout(() => setSuccessMessage(''), 6000);
        fetchAdminData();
      } else {
        setErrorMessage(res?.message || 'Failed to send this report');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to prepare this report PDF; no email was sent.');
    } finally {
      setItemSendProgress('');
      stopProcessing(`item-send-${item.id}`);
    }
  };

  const handleSendAllOrderItems = async (order: Order) => {
    const items = order.items || [];
    if (items.length === 0) return;
    setErrorMessage('');
    setItemSendProgress('Preparing reports…');
    startProcessing(`email-${order.id}`);
    try {
      const rendered = await prepareOrderItemsSendPayload(order, items, message => setItemSendProgress(message));
      const payload = await deliverOrderItemsPdfPayload(order, rendered, 'admin');
      const res: any = await api.sendAllOrderItems(order.id, payload as any);
      if (res && res.success) {
        setSuccessMessage(`✅ ${res.message || `All ${items.length} reports plus the order invoice were emailed to ${order.userEmail}.`}`);
        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          status: (res.orderStatus as any) || 'COMPLETED',
          emailStatus: 'SENT',
          items: (o.items || []).map(candidate => ({ ...candidate, reportStatus: 'SENT' as any }))
        } : o));
        setTimeout(() => setSuccessMessage(''), 6000);
        fetchAdminData();
      } else {
        setErrorMessage(res?.message || 'Failed to email the order reports');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to prepare the order PDFs; no email was sent.');
    } finally {
      setItemSendProgress('');
      stopProcessing(`email-${order.id}`);
    }
  };

  /** The order's ONE tax invoice (all reports on one document). */
  const handleDownloadOrderInvoice = async (order: Order) => {
    startProcessing(`inv-${order.id}`);
    try {
      const items = order.items || [];
      const { downloadHtmlPdf, orderInvoiceFileName } = await loadPdfEngine();
      await downloadHtmlPdf(buildOrderInvoiceHtmlForItems(order, items), orderInvoiceFileName(order));
    } catch (e: any) {
      // No server renderer any more: report the failure instead of opening a
      // lower-quality server PDF that no longer exists.
      setErrorMessage(e?.message || 'The invoice could not be rendered at print quality on this device. Please retry.');
    } finally {
      stopProcessing(`inv-${order.id}`);
    }
  };

  const handleDownloadReport = async (order: Order) => {
    startProcessing(`pdf-${order.id}`);
    try {
      const { exportOrderPdf } = await loadPdfEngine();
      await exportOrderPdf(order);
    } catch (e: any) {
      setErrorMessage(e?.message || 'The report could not be rendered at print quality on this device. Please retry.');
    } finally {
      stopProcessing(`pdf-${order.id}`);
    }
  };

  const handleDownloadInvoice = async (order: Order) => {
    startProcessing(`inv-${order.id}`);
    try {
      const { exportOrderInvoicePdf } = await loadPdfEngine();
      await exportOrderInvoicePdf(order);
    } catch (e: any) {
      setErrorMessage(e?.message || 'The invoice could not be rendered at print quality on this device. Please retry.');
    } finally {
      stopProcessing(`inv-${order.id}`);
    }
  };

  const handleDirectSendCustomerEmail = async (order: Order) => {
    // A multi-person order is delivered per report + one invoice, through the
    // per-item endpoints - never through the single-chart approve path.
    if (isMultiPersonUnit(order)) {
      await handleSendAllOrderItems(order);
      return;
    }
    setErrorMessage('');
    startProcessing(`email-${order.id}`);
    try {
      setSuccessMessage(`⏳ Preparing preview-quality report & invoice for Order #${order.orderNumber}...`);
      const { generateOrderPdfsBase64, deliverOrderPdfPayload } = await loadPdfEngine();

      let res;
      let fulfilledOrderIds = [order.id];
      if (order.groupId) {
        const groupOrders = orders.filter(candidate => candidate.groupId === order.groupId);
        fulfilledOrderIds = groupOrders.map(member => member.id);
        const prepared = await buildFamilyPreviewPayload(groupOrders, order.groupId);
        const anyPending = groupOrders.some(member => ['PENDING', 'PENDING_APPROVAL'].includes((member.status || '').toUpperCase()));
        res = anyPending
          ? await api.approveFamilyOrder(order.groupId, prepared.payload)
          : await api.resendFamilyEmail(order.groupId, prepared.payload);
      } else {
        const language = order.language || 'ta';
        const pdfs = await generateOrderPdfsBase64(order, language);
        const payload = await deliverOrderPdfPayload(order, { ...pdfs, language });
        if (order.status === 'PENDING' || order.status === 'PENDING_APPROVAL') {
          res = await api.approveOrder(order.id, payload);
        } else {
          res = await api.resendEmail(order.id, payload);
        }
      }

      if (res && res.success) {
        setSuccessMessage(order.groupId
          ? `✅ All preview-quality family reports and the consolidated invoice were emailed to ${order.userEmail} in ${describeEmailParts(res)}.`
          : `✅ Preview-quality report & invoice successfully emailed to ${order.userEmail}!`);
        setOrders(prev => prev.map(o => fulfilledOrderIds.includes(o.id)
          ? { ...o, status: 'COMPLETED', emailStatus: 'SENT' }
          : o));
        setTimeout(() => setSuccessMessage(''), 6000);
        fetchAdminData();
      } else {
        // Drop the "⏳ Preparing…" banner so it does not sit next to the error
        // as if the delivery were still in progress.
        setSuccessMessage('');
        setOrders(prev => prev.map(o => fulfilledOrderIds.includes(o.id) ? { ...o, emailStatus: 'FAILED' } : o));
        setErrorMessage(res?.message || 'Failed to email customer');
      }
    } catch (err: any) {
      setSuccessMessage('');
      setOrders(prev => prev.map(o => o.id === order.id || (order.groupId && o.groupId === order.groupId)
        ? { ...o, emailStatus: 'FAILED' }
        : o));
      console.error('Error sending customer email directly:', err);
      setErrorMessage(err.message || 'Failed to prepare preview-quality PDFs; no email was sent.');
    } finally {
      stopProcessing(`email-${order.id}`);
    }
  };

  const toggleBatchUnitSelection = (batchKey: string) => {
    setSelectedBatchKeys(prev => {
      const next = new Set(prev);
      if (next.has(batchKey)) {
        next.delete(batchKey);
      } else {
        next.add(batchKey);
      }
      return next;
    });
  };

  const {
    handleStopBatchRun,
    runBatchDelivery,
    handleBatchApproveAndSendAllPending,
    buildFamilyPreviewPayload,
    handleApproveFamilyGroup,
    handleResendFamilyEmail,
    handleCancelFamilyOrder,
    handlePreviewFamilyInvoice,
    handleDownloadFamilyInvoice,
    handleCancelOrder,
    handleBanOrderIp,
    handleDeleteOrder,
    REFUND_DELIVERED_STATUSES,
    refundBlockedByPolicy,
    preApprovalRefundAmount,
    moneyLabel,
    canOneClickRefund,
    canOneClickRefundGroup,
    refundSummaryText,
    handleProcessRefund,
    handleUpdateSettingsGeneric,
    handleSaveSettings,
    handleOpenAddTeamModal,
    handleOpenEditTeamModal,
    handleTeamPhotoSelected,
    handleRemoveTeamPhoto,
    handleSaveTeamMember,
    handleToggleMemberActive,
    handleDeleteTeamMember,
    handleUpdateMessageStatus,
    handleDeleteMessage,
  } = useAdminPortalActions({
    refreshSettings,
    orders,
    setOrders,
    settings,
    teamMembers,
    setTeamMembers,
    startProcessing,
    stopProcessing,
    isProcessing,
    setFamilyRenderProgress,
    setBatchProgress,
    setBatchStopping,
    batchStopRequestedRef,
    setSelectedBatchKeys,
    setLastBatchSummary,
    setSuccessMessage,
    setErrorMessage,
    serviceMode,
    intlPrice,
    usdToInrRate,
    servicePricing,
    autoEmail,
    usdToInrRateIsValid,
    setFamilyInvoicePreview,
    setIsTeamModalOpen,
    editingMember,
    setEditingMember,
    memberFormData,
    setMemberFormData,
    isTeamPhotoUploading,
    setIsTeamPhotoUploading,
    isSavingTeamMember,
    setIsSavingTeamMember,
    setTeamSaveError,
    setTeamPhotoError,
    setTeamPhotoInfo,
    setShowPhotoUrlField,
    teamPhotoInputRef,
    fetchAdminData,
    isMultiPersonUnit,
  });

  const seo = (
    <SEO
      title="Admin Management Portal | ASTRO SIVAM"
      description="Secure administration portal for ASTRO SIVAM order processing, astrologer review, and financial metrics."
      noindex={true}
    />
  );

  if (isAuthLoading) {
    return (
      <>
        {seo}
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-300">Authenticating Astro Sivam Admin Gateway...</p>
        </div>
      </div>
    </>
  );
  }

  if (!isAdmin) {
    return (
      <>
        {seo}
        <AdminLogin
          onNavigate={onNavigate}
          onLoginSuccess={() => {
            fetchAdminData();
          }}
        />
      </>
    );
  }


  const groupedOrderUnits: any = computeGroupedOrderUnits(orders, filterStatus, searchQuery);

  const renderMultiPersonItems = (order: Order) => {
    const people = order.persons || [];
    const allItems = order.items || [];
    const usedItemIds = new Set<number>();
    const groups: Array<{ key: string; seq: number; title: string; meta: string; items: OrderItem[] }> = people.map(person => {
      const personItems = allItems.filter(item =>
        (person.id && item.personId ? item.personId === person.id : item.personSeq === person.seq)
      );
      personItems.forEach(item => usedItemIds.add(item.id));
      return {
        key: `${order.id}-person-${person.seq}`,
        seq: person.seq,
        title: person.fullName,
        meta: [
          person.gender,
          person.dob ? `DOB ${person.dob}` : '',
          person.tob ? `Tob ${person.tob}` : '',
          person.place ? `${person.place}${person.country ? `, ${person.country}` : ''}` : ''
        ].filter(Boolean).join(' · '),
        items: personItems
      };
    });
    const leftovers = allItems.filter(item => !usedItemIds.has(item.id));
    if (leftovers.length > 0) {
      groups.push({
        key: `${order.id}-person-other`,
        seq: groups.length + 1,
        title: 'Other reports',
        meta: '',
        items: leftovers
      });
    }

    const sendingAll = isProcessing(`email-${order.id}`);
    return (
      <div className="px-4 sm:px-6 pb-4 pt-1">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-amber-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {people.length} {people.length === 1 ? 'Person' : 'People'} · {allItems.length} {allItems.length === 1 ? 'Report' : 'Reports'} · {(Number(order.amount) || 0).toFixed(2)} {order.currency}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {itemSendProgress && (
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{itemSendProgress}</span>
              )}
              <button
                type="button"
                onClick={() => handleDownloadOrderInvoice(order)}
                className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Receipt className="w-3 h-3 text-amber-500" />
                <span>Order Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendAllOrderItems(order)}
                disabled={sendingAll || allItems.length === 0}
                title="Email every report plus the ONE order invoice to the customer"
                className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                <Send className={`w-3 h-3 ${sendingAll ? 'animate-spin' : ''}`} />
                <span>{sendingAll ? 'Sending…' : 'Send All Reports + Invoice'}</span>
              </button>
            </div>
          </div>

          {groups.length === 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              No people/report rows are stored for this order yet. If it was placed before the multi-person rollout, run
              <code className="mx-1 font-mono">api/migrations/003_multi_person_orders.sql</code> in phpMyAdmin and refresh.
            </p>
          )}

          {groups.map(group => (
            <div key={group.key} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">#{group.seq}</span>
                <span className="font-bold text-xs text-slate-900 dark:text-white">{group.title}</span>
                {group.meta && <span className="text-[11px] text-slate-500 dark:text-slate-400">{group.meta}</span>}
              </div>

              <div className="space-y-1.5">
                {group.items.map(item => {
                  const previewing = isProcessing(`item-preview-${item.id}`);
                  const sending = isProcessing(`item-send-${item.id}`);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{serviceDisplayName(item.serviceCode)}</span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {Number(item.unitPrice || 0).toFixed(2)} {order.currency}
                        </span>
                        {getItemStatusBadge(item.reportStatus)}
                        {item.calculatedResult ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            CACHED
                          </span>
                        ) : null}
                        {item.language && (
                          <span className="text-[9px] font-mono uppercase text-slate-400">{item.language}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePreviewOrderItem(order, item)}
                          disabled={previewing || sending}
                          title="Preview this report (uses the same cached result the customer will receive)"
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-amber-500" />
                          <span>{previewing ? 'Loading…' : 'Preview'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendOrderItem(order, item)}
                          disabled={previewing || sending}
                          title="Email THIS report plus the order invoice to the customer"
                          className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <Send className={`w-3 h-3 ${sending ? 'animate-spin' : ''}`} />
                          <span>
                            {sending ? 'Sending…' : (item.reportStatus === 'SENT' || item.reportStatus === 'FAILED' ? 'Resend' : 'Send')}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {group.items.length === 0 && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">No reports stored for this person.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };


  const adminCtx = {
    stats,
    setStats,
    orders,
    setOrders,
    settings,
    setSettings,
    usersList,
    setUsersList,
    auditLogs,
    setAuditLogs,
    auditLogPage,
    setAuditLogPage,
    auditLogTotalPages,
    setAuditLogTotalPages,
    auditLogTotal,
    setAuditLogTotal,
    teamMembers,
    setTeamMembers,
    messagesList,
    setMessagesList,
    bannedIps,
    setBannedIps,
    copiedIp,
    setCopiedIp,
    clientErrors,
    setClientErrors,
    handleCopyIp,
    expandedGroupIds,
    setExpandedGroupIds,
    toggleGroupExpand,
    activeSection,
    setActiveSection,
    aiHandoffs,
    setAiHandoffs,
    aiHandoffNotes,
    setAiHandoffNotes,
    aiHandoffBusy,
    setAiHandoffBusy,
    loadAiHandoffs,
    updateAiHandoff,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    isLoading,
    setIsLoading,
    processingIds,
    setProcessingIds,
    startProcessing,
    stopProcessing,
    isProcessing,
    familyRenderProgress,
    setFamilyRenderProgress,
    batchProgress,
    setBatchProgress,
    batchStopping,
    setBatchStopping,
    batchStopRequestedRef,
    selectedBatchKeys,
    setSelectedBatchKeys,
    lastBatchSummary,
    setLastBatchSummary,
    successMessage,
    setSuccessMessage,
    errorMessage,
    setErrorMessage,
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
    selectedOrder,
    setSelectedOrder,
    previewOrderForPdf,
    setPreviewOrderForPdf,
    isPreviewPdfLoading,
    setIsPreviewPdfLoading,
    familyInvoicePreview,
    setFamilyInvoicePreview,
    expandedItemOrderIds,
    setExpandedItemOrderIds,
    reportItemView,
    setReportItemView,
    itemSendProgress,
    setItemSendProgress,
    isTeamModalOpen,
    setIsTeamModalOpen,
    editingMember,
    setEditingMember,
    memberFormData,
    setMemberFormData,
    isTeamPhotoUploading,
    setIsTeamPhotoUploading,
    isSavingTeamMember,
    setIsSavingTeamMember,
    teamSaveError,
    setTeamSaveError,
    teamPhotoError,
    setTeamPhotoError,
    teamPhotoInfo,
    setTeamPhotoInfo,
    showPhotoUrlField,
    setShowPhotoUrlField,
    teamPhotoInputRef,
    fetchAdminData,
    loadAuditLogPage,
    handleApproveOrder,
    handlePreviewOrderPdf,
    isMultiPersonUnit,
    toggleItemsExpand,
    handlePreviewOrderItem,
    handleSendOrderItem,
    handleSendAllOrderItems,
    handleDownloadOrderInvoice,
    handleDownloadReport,
    handleDownloadInvoice,
    handleDirectSendCustomerEmail,
    toggleBatchUnitSelection,
    handleStopBatchRun,
    runBatchDelivery,
    handleBatchApproveAndSendAllPending,
    buildFamilyPreviewPayload,
    handleApproveFamilyGroup,
    handleResendFamilyEmail,
    handleCancelFamilyOrder,
    handlePreviewFamilyInvoice,
    handleDownloadFamilyInvoice,
    handleCancelOrder,
    handleBanOrderIp,
    handleDeleteOrder,
    REFUND_DELIVERED_STATUSES,
    refundBlockedByPolicy,
    preApprovalRefundAmount,
    moneyLabel,
    canOneClickRefund,
    canOneClickRefundGroup,
    refundSummaryText,
    handleProcessRefund,
    handleUpdateSettingsGeneric,
    handleSaveSettings,
    handleOpenAddTeamModal,
    handleOpenEditTeamModal,
    handleTeamPhotoSelected,
    handleRemoveTeamPhoto,
    handleSaveTeamMember,
    handleToggleMemberActive,
    handleDeleteTeamMember,
    handleUpdateMessageStatus,
    handleDeleteMessage,
    groupedOrderUnits,
    renderMultiPersonItems,
  };

  const panelFallback = (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
      Loading admin module…
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 select-none">
      {seo}
      <AdminHeaderAndTabs ctx={adminCtx} />

      {activeSection === 'orders' && (
        <AdminOrdersToolbar ctx={adminCtx}>
          <AdminOrdersMobileList ctx={adminCtx} />
          <AdminOrdersDesktopTable ctx={adminCtx} />
        </AdminOrdersToolbar>
      )}

      <Suspense fallback={panelFallback}>
      {activeSection === 'analytics' && (
        <AdminAnalyticsDashboard
          onRefreshOrders={fetchAdminData}
          onNavigateTab={tab => setActiveSection(tab as any)}
        />
      )}

      {/* SECTION: FINANCIAL DASHBOARD */}
      {activeSection === 'financial' && (
        <FinancialDashboard onRefreshOrders={fetchAdminData} />
      )}

      {/* SECTION: PAYMENT GATEWAY CONFIGURATION */}
      {activeSection === 'payments' && (
        <PaymentConfigPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettingsGeneric}
        />
      )}

      {/* SECTION: EMAIL & SMTP CONFIGURATION */}
      {activeSection === 'emails' && (
        <EmailConfigPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettingsGeneric}
        />
      )}

      {/* SECTION: WHATSAPP & VIBER CHAT ALERTS */}
      {activeSection === 'alerts' && (
        <ChatAlertConfigPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettingsGeneric}
        />
      )}

      {/* SECTION: LOCAL SOURCE-BASED ASTROLOGER */}
      {activeSection === 'aiastrologer' && <AiAstrologerConfigPanel />}

      {/* SECTION: DATABASE BACKUP & RESTORE */}
      {activeSection === 'database' && (
        <DatabaseBackupPanel onDataImported={fetchAdminData} />
      )}

      {/* SECTION: SYSTEM HEALTH (live ops report from /api/admin/health.php) */}
      {activeSection === 'health' && <SystemHealthPanel />}

      {/* SECTION: ADMIN SETUP CHECKLIST */}
      {activeSection === 'checklist' && (
        <SetupChecklistPanel
          settings={settings}
          teamMembers={teamMembers}
          onNavigateTab={tab => setActiveSection(tab as any)}
        />
      )}

        {activeSection === 'team' && <AdminTeamSection ctx={adminCtx} />}
        {activeSection === 'settings' && <AdminGeneralSettingsPanel ctx={adminCtx} />}
        {activeSection === 'google' && <GoogleSetupPanel />}
        {activeSection === 'reviews' && (
          <CustomerReviewsPanel
            onSetSuccess={(msg) => {
              setSuccessMessage(msg);
              setTimeout(() => setSuccessMessage(''), 5000);
            }}
            onSetError={(msg) => {
              setErrorMessage(msg);
              setTimeout(() => setErrorMessage(''), 6000);
            }}
          />
        )}
      {/* SECTION 6: SECURITY & BANNED IPS */}
      {activeSection === 'security' && (
        <SecurityBannedIpPanel
          bannedIps={bannedIps}
          onRefresh={fetchAdminData}
          onSetSuccess={(msg) => {
            setSuccessMessage(msg);
            setTimeout(() => setSuccessMessage(''), 5000);
          }}
          onSetError={(msg) => {
            setErrorMessage(msg);
            setTimeout(() => setErrorMessage(''), 6000);
          }}
        />
      )}

      </Suspense>

      <AdminOperationsPanels ctx={adminCtx} />
    </div>
  );
};
