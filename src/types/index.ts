export type AppLanguage = 'ta' | 'en' | 'hi';

export enum Rasi {
  MESHAM = 1,
  RISHABAM = 2,
  MITHUNAM = 3,
  KADAGAM = 4,
  SIMHAM = 5,
  KANNI = 6,
  THULAM = 7,
  VIRUCHIGAM = 8,
  DHANUSU = 9,
  MAGARAM = 10,
  KUMBAM = 11,
  MEENAM = 12
}

export enum Graha {
  SURYA = 'sun',
  CHANDRA = 'moon',
  CHEVVAI = 'mars',
  BUDHA = 'mercury',
  GURU = 'jupiter',
  SUKRA = 'venus',
  SANI = 'saturn',
  RAHU = 'rahu',
  KETU = 'ketu'
}

export interface PlanetPosition {
  graha?: Graha;
  planetKey?: string;
  nameTa: string;
  nameEn: string;
  nameHi: string;
  shortTa?: string;
  shortEn?: string;
  shortHi?: string;
  rasi?: Rasi;
  rasiNumber?: number;
  rasiNameTa?: string;
  rasiNameEn?: string;
  longitudeInRasiDeg?: number;
  degrees?: number;
  formattedDeg?: string;
  nakshatraNameEn?: string;
  nakshatraNameTa?: string;
  nakshatraNameHi?: string;
  pada?: number;
  isRetrograde?: boolean;
  navamsaRasi?: Rasi;
  isVargottama?: boolean;
  isCombust?: boolean;
}

export type UserRole = 'customer' | 'admin';
export type ServiceType = 'BIRTH_JATHAGAM' | 'MARRIAGE_COMPATIBILITY' | 'BABY_NAMING' | 'MUHURTHAM';
/**
 * `MULTI_PERSON` is the header of a multi-person order (one order = up to 6
 * people, each with one or more of the services above). It is never a chart:
 * the charts live in `Order.items`.
 */
export type OrderServiceType = ServiceType | 'MULTI_PERSON';
export type ServiceMode = 'FREE_BETA' | 'PAID';
export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'PENDING_PAYMENT_VERIFICATION'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'PENDING'
  | 'GENERATED'
  | 'CANCELLED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED';
export type EmailStatus = 'NOT_SENT' | 'PROCESSING' | 'SENT' | 'FAILED';
/**
 * @deprecated MPAISA and MYCASH are retained only for historical order compatibility
 * and are no longer offered at checkout.
 */
export type PaymentMethod = 'NONE' | 'MPAISA' | 'MYCASH' | 'PAYPAL' | 'GPAY' | 'UPI' | 'CARD';

/**
 * Each payment system (India GPay/UPI, International PayPal/Cards) can run in either:
 *  - 'offline': customer pays via manual transfer/QR/app and submits the
 *    Transaction Reference / Receipt ID for admin verification.
 *  - 'online': customer completes instant automated checkout via the online
 *    payment gateway API, which issues a verified transaction reference.
 * Both configurations are stored simultaneously so the admin can switch modes
 * at any time in the Admin Panel.
 *
 * Note: PayPal online checkout accepts VISA, Mastercard, American Express, Discover,
 * and all other cards supported by PayPal, plus PayPal balance/bank accounts worldwide.
 */
export type PaymentGatewayMode = 'offline' | 'online';

export type IndiaGpayOnlineProvider = 'razorpay' | 'cashfree' | 'phonepe' | 'upi_intent';

export interface OnlinePaymentSession {
  sessionId: string;
  paymentIntentId?: string;
  paymentMethod: PaymentMethod;
  mode: PaymentGatewayMode;
  provider: string;
  environment: 'sandbox' | 'live';
  amount: number;
  currency: CurrencyCode;
  gatewayOrderId: string;
  description?: string;
  merchantName?: string;
  // India GPay / Razorpay / UPI Online
  keyId?: string;
  merchantId?: string;
  upiId?: string;
  upiUri?: string;
  // International PayPal Online (accepts VISA, Mastercard, Amex, Discover, etc.)
  clientId?: string;
  paypalEmail?: string;
  businessName?: string;
  approvalUrl?: string;
  // Retained for legacy order compatibility (M-PAiSA discontinued)
  mpaisaNumber?: string;
  mpaisaName?: string;
  mpaisaMerchantCode?: string;
  checkoutUrl?: string;
}

/**
 * Settlement currencies supported by ASTRO SIVAM.
 * The currency of a charge is decided by the PAYMENT METHOD the customer
 * chooses (GPay/UPI -> INR, PayPal/Card -> USD) and never by
 * the birth place of a family member.
 */
export type CurrencyCode = 'INR' | 'USD';

/** A price expressed in all three currencies at once. */
export type CurrencyPriceMap = Record<CurrencyCode, number>;

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  country: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface CustomerBirthProfile {
  userId: string;
  name: string;
  dob: string; // YYYY-MM-DD
  tob: string; // HH:mm
  birthPlace: string;
  country: string;
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number;
  gender: 'M' | 'F';
  updatedAt: string;
}

export type BirthProfile = CustomerBirthProfile;

/** How a saved family member is related to the account holder. */
export type FamilyRelation =
  | 'SPOUSE'
  | 'SON'
  | 'DAUGHTER'
  | 'FATHER'
  | 'MOTHER'
  | 'BROTHER'
  | 'SISTER'
  | 'CHILD'
  | 'RELATIVE'
  | 'FRIEND'
  | 'OTHER';

/** Maximum saved people per account — the account holder counts as one of the six. */
export const MAX_FAMILY_MEMBERS = 6;

/**
 * One saved family member's birth details. Saved once in the dashboard and
 * explicitly picked on an order form — never auto-filled by default — so a
 * repeat order for that person needs no form filling.
 */
/**
 * Verified WhatsApp/Viber alert contact: one saved number, verified
 * separately per app by OTP. Order-status alerts go only to verified apps;
 * reports and invoices are delivered by email, never over chat.
 */
export interface ChatDeliveryState {
  phone: string;
  whatsappVerified: boolean;
  viberVerified: boolean;
  whatsappAvailable: boolean;
  viberAvailable: boolean;
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  relation: FamilyRelation;
  dob: string; // YYYY-MM-DD
  tob: string; // HH:mm
  birthPlace: string;
  country: string;
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number;
  timeZoneId?: string;
  gender: 'M' | 'F';
  createdAt?: string;
  updatedAt: string;
}

export interface EmailConfig {
  senderName: string;
  senderEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword?: string;
  /** Admin API boolean: secret exists without returning the secret to the client. */
  smtpPasswordConfigured?: boolean;
  tlsSecure: boolean;
  replyTo: string;
  status: 'NOT_CONFIGURED' | 'CONNECTED' | 'TEST_SUCCESSFUL' | 'FAILED';
  lastTestedAt?: string;
  lastTestMessage?: string;
}

export interface ChatAlertChannelResult {
  success: boolean;
  channel: 'whatsapp' | 'viber';
  message: string;
}

export interface ChatAlertConfig {
  /** Master switch for WhatsApp/Viber order alerts. */
  enabled: boolean;
  notifyOrderConfirmed: boolean;
  notifyOrderCompleted: boolean;
  whatsapp: {
    enabled: boolean;
    /** 'meta' = WhatsApp Cloud API, 'webhook' = any gateway (WATI/AiSensy/Interakt...). */
    provider: 'meta' | 'webhook';
    phoneNumberId: string;
    accessToken: string;
    accessTokenConfigured?: boolean;
    webhookUrlConfigured?: boolean;
    apiVersion: string;
    /** Approved utility template name (required for proactive alerts). */
    templateName: string;
    templateLanguage: string;
    webhookUrl: string;
    messageType: 'template' | 'text';
  };
  viber: {
    enabled: boolean;
    /** 'viber_bot' = official PA REST API, 'webhook' = business-messages partner. */
    provider: 'viber_bot' | 'webhook';
    authToken: string;
    authTokenConfigured?: boolean;
    webhookUrlConfigured?: boolean;
    senderName: string;
    webhookUrl: string;
  };
  orderConfirmedMessage: string;
  orderCompletedMessage: string;
}

export interface EmailTemplate {
  id?: string;
  key: string;
  name: string;
  subject: string;
  bodyText: string;
  isActive?: boolean;
  lastModified?: string;
}

/**
 * Per-service price in the two offered currencies. A stored row may still carry
 * keys from a currency this version no longer offers; those keys are ignored
 * (see services/pricing.ts) instead of being trusted.
 */
export interface ServicePriceItem {
  usd: number;
  inr: number;
}

export interface SystemSettings {
  serviceMode: ServiceMode;
  /**
   * FREE BETA: the PHP API also exposes this flag alongside serviceMode.
   */
  freeBetaActive?: boolean;
  /**
   * FREE BETA RULE — 1 free report per customer, tracked per IP address.
   * `true`  = this customer's free chart is still unused (first chart free),
   * `false` = already used / not in beta (every chart is charged).
   * Served per requesting IP by GET /api/services/settings.
   */
  betaFreeChartAvailable?: boolean;
  intlPriceUSD: number;
  indiaPriceINR?: number;
  /**
   * Admin-set USD → INR rate (₹ per US$). Every India price is US$ × this rate.
   * Absent or out of range → the site default in src/services/pricing.ts.
   */
  usdToInrRate?: number;
  /** @deprecated Vodafone M-PAiSA / Digicel MyCash fields retained for legacy DB compatibility; these payment methods are no longer offered at checkout. */
  vodafoneMPaisaActive?: boolean;
  vodafoneMPaisaPaymentMode?: PaymentGatewayMode;
  vodafoneMPaisaNumber: string;
  vodafoneMPaisaName?: string;
  vodafoneMPaisaMerchantCode?: string;
  vodafoneMPaisaQrUrl?: string;
  vodafoneMPaisaInstructions?: string;
  vodafoneMPaisaMerchantId?: string;
  vodafoneMPaisaApiSecret?: string;
  vodafoneMPaisaApiSecretConfigured?: boolean;
  vodafoneMPaisaApiUrl?: string;
  vodafoneMPaisaEnvironment?: 'sandbox' | 'live';
  vodafoneMPaisaOnlineConfigured?: boolean;
  digicelMyCashActive?: boolean;
  digicelMyCashNumber: string;
  digicelMyCashName?: string;
  digicelMyCashInstructions?: string;
  // 1. India Google Pay (GPay) & UPI (Offline & Online)
  indiaGpayActive?: boolean;
  indiaGpayPaymentMode?: PaymentGatewayMode;
  // Offline settings
  indiaGpayUpiId?: string;
  indiaGpayNumber?: string;
  indiaGpayName?: string;
  indiaGpayQrUrl?: string;
  indiaGpayInstructions?: string;
  // Online settings (Razorpay / Cashfree / PhonePe / UPI Intent)
  indiaGpayOnlineProvider?: IndiaGpayOnlineProvider;
  indiaGpayMerchantId?: string;
  indiaGpayKeyId?: string;
  indiaGpayKeySecret?: string;
  indiaGpayKeySecretConfigured?: boolean;
  indiaGpayWebhookSecret?: string;
  indiaGpayWebhookSecretConfigured?: boolean;
  indiaGpayEnvironment?: 'sandbox' | 'live';
  indiaGpayOnlineConfigured?: boolean;
  // 2. International PayPal (Offline & Online)
  paypalActive?: boolean;
  paypalPaymentMode?: PaymentGatewayMode;
  // Offline settings
  paypalEmail: string;
  paypalBusinessName?: string;
  paypalMeLink?: string;
  paypalInstructions?: string;
  // Online settings (PayPal REST API v2)
  paypalClientId?: string;
  paypalSecret?: string;
  paypalSecretConfigured?: boolean;
  paypalClientSecret?: string;
  paypalClientSecretConfigured?: boolean;
  paypalWebhookId?: string;
  paypalMode?: 'sandbox' | 'live';
  paypalOnlineConfigured?: boolean;
  // Legacy / convenience currency fields (retained for DB compat)
  currencyIntl?: string;
  currencyIndia?: string;
  // Per-Service Pricing Override (Separate pricing for each service)
  servicePricing?: {
    BIRTH_JATHAGAM?: ServicePriceItem;
    MARRIAGE_COMPATIBILITY?: ServicePriceItem;
    BABY_NAMING?: ServicePriceItem;
    MUHURTHAM?: ServicePriceItem;
  };
  // Facebook Login Integration
  facebookLoginEnabled?: boolean;
  facebookAppId?: string;
  facebookAppSecret?: string;
  facebookAppSecretConfigured?: boolean;
  // Google Login Integration
  googleLoginEnabled?: boolean;
  googleClientId?: string;
  // Web Design Theme Template (South Indian Styles)
  activeThemeTemplate?: ThemeTemplateId;
  /** Public/customer UI only. Admin always keeps the original dark design. */
  userDesign?: 'original' | 'ivory';
  // General & Email
  supportEmail: string;
  supportPhone: string;
  enableEmailNotifications?: boolean;
  autoEmailReports?: boolean;
  betaNoticeMessage: string;
  emailSettings?: EmailConfig;
  emailTemplates?: EmailTemplate[];
  chatAlertSettings?: ChatAlertConfig;
}

export type AppSettings = SystemSettings;

export interface TeamMember {
  id: string;
  nameEn?: string;
  nameTa?: string;
  nameHi?: string;
  titleEn?: string;
  titleTa?: string;
  fullName?: string;
  photoUrl: string;
  education?: string;
  educationEn?: string;
  educationTa?: string;
  vedicEducation?: string;
  experienceYears?: number;
  yearsOfExperience?: number;
  biography?: string;
  bioEn?: string;
  bioTa?: string;
  specialization?: string;
  specializations?: string[];
  isActive: boolean;
  order?: number;
  displayOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  id: string;
  serviceType: ServiceType;
  language: AppLanguage;
  devoteeName: string;
  summaryText: string;
  country: string;
  inputPayload: Record<string, any>;
  calculatedResult?: any;
  /**
   * Price of THIS chart in every currency, captured when the chart was added.
   * The tray/checkout always prices the whole family in the ONE currency the
   * customer pays with, so `country` (birth place) never changes the currency.
   */
  prices?: CurrencyPriceMap;
  /** @deprecated legacy single-currency price, kept for old saved carts */
  unitPrice: number;
  /** @deprecated currency implied by birth place — no longer used for totals */
  currency: CurrencyCode;
  saveAsProfile?: boolean;
}

export interface MultiOrderPayload {
  items: Array<{
    serviceType: ServiceType;
    language: AppLanguage;
    country: string;
    inputPayload: Record<string, any>;
    saveAsProfile?: boolean;
  }>;
  language?: AppLanguage;
  country?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  /** Currency the customer chose to pay in (derived from paymentMethod). */
  currency?: CurrencyCode;
  /** Total shown to the customer, for the server-side sanity check. */
  totalAmount?: number;
}

/**
 * One person of a multi-person order (row of `order_persons`). Legacy orders
 * carry exactly one person with seq 1 (backfilled by migration 003).
 */
export interface OrderPerson {
  id?: number;
  seq: number;
  fullName: string;
  gender: 'M' | 'F' | 'O' | string;
  dob: string;
  tob: string;
  place: string;
  country?: string;
  lat?: number | null;
  lon?: number | null;
  tz?: number | null;
}

export type OrderItemReportStatus = 'PENDING' | 'CALCULATED' | 'SENT' | 'FAILED';

/**
 * One report of a multi-person order (row of `order_items`): a service bought
 * for one person, with its own price, language, payload and cached result.
 * `calculatedResult` is the ONE cache Preview and Send both read.
 */
export interface OrderItem {
  id: number;
  orderId: string;
  personId?: number;
  personSeq?: number;
  personName?: string;
  serviceCode: OrderServiceType;
  unitPrice: number;
  reportStatus: OrderItemReportStatus;
  language: AppLanguage;
  inputPayload: Record<string, any>;
  calculatedResult?: any;
  sentAt?: string | null;
  /** Frozen at order placement: the dashboard download renders this snapshot
   *  exactly as ordered and never recalculates it. Lists expose date-only
   *  metadata; the owner-only report-snapshot route returns the body for the
   *  one report being downloaded. */
  hasReportSnapshot?: boolean;
  reportSnapshotAt?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  userMobile: string;
  serviceType: OrderServiceType;
  language: AppLanguage;
  country: string;
  currency: CurrencyCode;
  amount: number;
  serviceMode: ServiceMode;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentIntentId?: string;
  paymentStatus?: 'NOT_REQUIRED' | 'CREATED' | 'CAPTURED' | 'PENDING_MANUAL' | 'PENDING_ADMIN' | 'VERIFIED_MANUAL' | 'FAILED' | 'CONSUMED' | 'EXPIRED';
  status: OrderStatus;
  emailStatus: EmailStatus;
  emailDeliveryAttempts: number;
  emailSentAt?: string;
  emailLastStatusMessage?: string;
  inputPayload: Record<string, any>;
  calculatedResult?: any;
  /** Frozen report snapshot metadata (body stays server-side): the dashboard
   *  "Download Report" renders the report exactly as prepared on
   *  `reportSnapshotAt` (the order date) and never recalculates it, so a
   *  download a year later is the same report the customer paid for. */
  hasReportSnapshot?: boolean;
  reportSnapshotAt?: string | null;
  hasPdf: boolean;
  hasInvoice?: boolean;
  adminNotes?: string;
  refundStatus?: 'NONE' | 'REQUESTED' | 'REFUNDED' | 'REJECTED';
  refundReason?: string;
  refundRequestedAt?: string;
  refundProcessedAt?: string;
  refundAdminNotes?: string;
  /**
   * Pre-approval refund trail (Refund & Cancellation Policy: 90% back if the
   * order is refunded BEFORE admin approval; non-refundable once approved).
   * All four values are computed server-side by api/refunds.php.
   */
  refundPercent?: number | null;
  refundAmount?: number | null;
  refundCurrency?: string | null;
  /** refundProcessedAt + 3 working days — the settlement date shown to the customer. */
  refundDeadline?: string | null;
  /**
   * How the money actually went back: 'GATEWAY' means the payment provider was
   * called and acknowledged the refund (refundReference holds its refund id);
   * 'MANUAL' means the payment was offline/verified by hand and the
   * administrator settles it within the 3 working days.
   */
  refundMethod?: string | null;
  refundReference?: string | null;
  ipAddress?: string;
  isIpBanned?: boolean;
  groupId?: string;
  groupOrderIndex?: number;
  groupOrderCount?: number;
  /** People of this order (multi-person checkout; legacy orders have one). */
  persons?: OrderPerson[];
  /** Reports of this order - one row per person + service. */
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BannedIpEntry {
  id: string;
  ipAddress: string;
  reason: string;
  bannedBy: string;
  bannedAt: string;
}

/**
 * The server's answer to one-click refund call (api/admin/index.php
 * `process-refund`). Every money value is computed by api/refunds.php at the
 * policy percentage — the admin portal only displays them.
 */
export interface RefundResult {
  orderIds: string[];
  orderNumbers: string[];
  /** True when one click refunded every chart of a family bundle. */
  wholeGroup: boolean;
  /** 90 before admin approval; a refund after approval is refused instead. */
  percent: number;
  /** Amount returned to the customer (percent of amountPaid). */
  amount: number;
  /** What the customer originally paid. */
  amountPaid: number;
  /** The non-refundable 10% gateway/processing share. */
  feeRetained: number;
  currency: string;
  /** Working days the customer is told to allow. */
  workingDays: number;
  processedAt: string;
  /** refundProcessedAt + working days (weekends/holidays excluded). */
  deadline: string;
  /** Human label for the deadline, e.g. "19 Oct 2026". */
  deadlineLabel: string;
  /**
   * 'GATEWAY' — the provider refund API accepted the refund and
   * gatewayReference identifies it; 'MANUAL' — offline payment recorded for
   * manual settlement; 'FAILED' — the provider refused and nothing changed.
   */
  settlement?: 'GATEWAY' | 'MANUAL' | 'FAILED';
  gatewayProvider?: string;
  gatewayReference?: string;
  /** Sentence the portal shows verbatim (gateway reference or manual notice). */
  gatewayMessage?: string;
  emailSent: boolean;
  emailMessage?: string;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  reason: string;
  status: 'PENDING' | 'PROCESSED' | 'REJECTED';
  requestedAt: string;
  processedAt?: string;
  adminNotes?: string;
}

export interface FinancialSummaryReport {
  generatedAt: string;
  dateRange: { startDate?: string; endDate?: string };
  totalPaymentsCount: number;
  totalPaymentsAmountUSD: number;
  totalPaymentsAmountINR?: number;
  grossRevenueUSD: number;
  grossRevenueINR?: number;
  pendingPaymentsCount: number;
  approvedPaymentsCount: number;
  rejectedPaymentsCount: number;
  totalRefundsCount: number;
  totalRefundsAmountUSD: number;
  totalRefundsAmountINR?: number;
  totalRefundsUSD?: number;
  totalRefundsINR?: number;
  refundsCount: number;
  totalOrdersCount: number;
  paidOrdersCount: number;
  betaOrdersCount: number;
  pendingRefundsCount: number;
  netRevenueUSD: number;
  netRevenueINR?: number;
  /** `usd` also holds legacy rows whose stored currency is no longer offered. */
  revenueByService: Record<string, { usd: number; inr?: number; count: number }>;
  revenueByPaymentMethod: Record<string, { usd: number; inr?: number; count: number }>;
  byPaymentMethod: {
    GPAY: { amount: number; inrAmount?: number; count: number };
    UPI?: { amount: number; count: number };
    PAYPAL: { amount: number; count: number };
  };
  byServiceType: {
    BIRTH_JATHAGAM: { amount: number; count: number };
    MARRIAGE_COMPATIBILITY: { amount: number; count: number };
    BABY_NAMING: { amount: number; count: number };
    MUHURTHAM: { amount: number; count: number };
  };
  betaUsageCount: number;
  orders: Order[];
}

export interface AuditLog {
  id: string;
  /** Database column: created_at (TIMESTAMP / DATETIME) */
  created_at: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
}

/** One customer complaint / "talk to our astrologer" escalation from the AI chat queue. */
export interface AiChatHandoff {
  id: number;
  session_id: string | null;
  user_id: string;
  user_name: string;
  user_email: string | null;
  user_mobile: string | null;
  language: string;
  question: string;
  reason: string;
  order_number: string | null;
  status: 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED';
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Statistics {
  totalOrders: number;
  completedOrders: number;
  pendingApproval: number;
  pendingOrders?: number;
  rejectedOrders: number;
  totalRevenueUSD: number;
  totalRevenueINR?: number;
  serviceCounts: Record<string, number>;
  languageCounts: Record<string, number>;
  countryCounts: Record<string, number>;
  totalUsers: number;
  currentServiceMode: ServiceMode;
}

export type AdminStats = Statistics;

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'NEW' | 'REVIEWED' | 'RESPONDED';
  adminNotes?: string;
  autoEmailDispatched: boolean;
  dispatchedTo: string;
  emailDispatchedAt?: string;
  createdAt: string;
  ip?: string;
}

export interface MonthlyUserStat {
  month: string;
  activeUsers: number;
  newSignups: number;
  ordersPlaced: number;
}

export interface PopularServiceStat {
  serviceType: string;
  name: string;
  count: number;
  percentage: number;
  revenueINR: number;
  revenueUSD: number;
  avgRating: number;
}

export interface RevenueTimelineStat {
  period: string;
  inr: number;
  usd: number;
  totalOrders: number;
  avgOrderINR: number;
  avgOrderUSD: number;
}

export interface ProcessingTimeStat {
  avgMinutes: number;
  medianMinutes: number;
  fastestMinutes: number;
  sla12hCompliancePercent: number;
  byService: Record<string, number>;
  distribution: Array<{ range: string; count: number; percentage: number }>;
}

export interface EmailDeliveryStat {
  totalAttempted: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
  avgDeliveryLatencySec: number;
  recentLogs: Array<{
    id: string;
    orderNumber: string;
    recipient: string;
    serviceType: string;
    status: 'SENT' | 'FAILED' | 'PENDING';
    timestamp: string;
    attempts: number;
    latencySec: number;
  }>;
}

export interface AdminAnalyticsData {
  timeframe: string;
  generatedAt: string;
  kpis: {
    monthlyActiveUsers: number;
    mauGrowthPercent: number;
    totalRevenueINR: number;
    totalRevenueUSD: number;
    revenueGrowthPercent: number;
    avgProcessingMinutes: number;
    emailDeliveryRate: number;
    totalCompletedOrders: number;
    slaComplianceRate: number;
    totalRegisteredUsers: number;
  };
  monthlyActiveUsersTrend: MonthlyUserStat[];
  popularServices: PopularServiceStat[];
  revenueOverTime: RevenueTimelineStat[];
  processingTimeMetrics: ProcessingTimeStat;
  emailDeliveryMetrics: EmailDeliveryStat;
  geographicBreakdown: Array<{
    region: string;
    orderCount: number;
    percentage: number;
    revenueINR: number;
    revenueUSD: number;
  }>;
}
export type ThemeTemplateId = 'classic-primary';

export interface ThemeTemplateConfig {
  id: ThemeTemplateId;
  modelNumber: number;
  modelName: string;
  name: string;
  subtitle: string;
  badge: string;
  isPrimary?: boolean;
  tagline: string;
  description: string;
  culturalOrigin: string;
  highlightPills: string[];
  layoutVariant: 'standard';
  heroLayoutVariant: 'split-modern';
  fontPairing: {
    display: string;
    body: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bgPageLight: string;
    bgPageDark: string;
    cardBgLight: string;
    cardBgDark: string;
    borderColorLight: string;
    borderColorDark: string;
    goldShimmer: string;
    textHeadingLight: string;
    textHeadingDark: string;
  };
  attributes: {
    mandapamArch: boolean;
    kolamPattern: boolean;
    brassDiyaGlow: boolean;
    zariSilkBorder: boolean;
    astralRings: boolean;
    palmLeafTexture: boolean;
    waxSealEmblem: boolean;
    hudTelemetry: boolean;
    cardCornerStyle: string;
    cardSurfaceClass: string;
    buttonGradient: string;
    bannerGradient: string;
    sectionDividerStyle: string;
  };
}

// ---------------------------------------------------------------------------
// Customer reviews (SEO audit 2026-10-15, finding 3). Server side: api/reviews.php.
// A review is always about ONE report service of ONE paid, delivered order.
// ---------------------------------------------------------------------------

/** A review names exactly one of the four report services. */
export type ReviewServiceCode = ServiceType;
/** PENDING until an administrator approves (publishes) or rejects it. */
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * One review as the homepage renders it — a verified customer review from the
 * API or a curated testimonial from src/data/testimonials.ts.
 */
export interface DisplayReview {
  id: string;
  authorName: string;
  location?: string;
  serviceCode: ReviewServiceCode;
  /** The customer's own wording for what they ordered (falls back to the service name). */
  serviceLabel?: string;
  /** Whole stars, 1-5. */
  rating: number;
  title?: string;
  body: string;
  /** ISO 8601: YYYY-MM-DD, or YYYY-MM when only the month is known. */
  datePublished: string;
  /** True only for reviews written through the customer's own paid, delivered order. */
  verifiedPurchase: boolean;
}

/** GET /api/services/reviews — a published review (public fields only). */
export interface PublishedReview {
  id: string;
  serviceCode: ReviewServiceCode;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  location: string | null;
  /** YYYY-MM-DD */
  publishedAt: string;
  verifiedPurchase: boolean;
}

/** Totals over every published review (not only the page returned). */
export interface ReviewAggregate {
  reviewCount: number;
  ratingTotal: number;
  ratingValue: number | null;
}

/** The signed-in customer's own review, in any moderation state. */
export interface CustomerReview {
  id: string;
  orderId: string;
  orderNumber: string | null;
  serviceCode: ReviewServiceCode;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  location: string | null;
  status: ReviewStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
}

/** An order the customer may review, with the services it contained. */
export interface ReviewEligibleOrder {
  orderId: string;
  orderNumber: string;
  services: ReviewServiceCode[];
}

/** POST /api/services/reviews body. */
export interface ReviewSubmission {
  orderId: string;
  serviceCode: ReviewServiceCode;
  rating: number;
  title?: string;
  body: string;
  displayName: string;
  location?: string;
  /** The customer confirms it is their own experience and agrees to publication. */
  consent: boolean;
}

/** Admin moderation view: the review plus the order it is verified against. */
export interface AdminReview extends CustomerReview {
  userId: string;
  customerName: string | null;
  customerEmail: string | null;
  orderServiceType: string | null;
  orderAmount: number | null;
  orderCurrency: string | null;
  orderStatus: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
}
