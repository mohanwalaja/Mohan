import React from 'react';
import { Order, ServiceType } from '../../types';
import { DEFAULT_CURRENCY, DEFAULT_SERVICE_PRICES, USD_TO_INR_RATE, usdToInr } from '../../services/pricing';


export const ADMIN_PRICED_SERVICES: Array<{ key: ServiceType; label: string; pages: string; badge: string }> = [
  { key: 'BIRTH_JATHAGAM', label: 'Birth Jathagam (Complete Life Horoscope)', pages: '3 Pages', badge: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' },
  { key: 'MARRIAGE_COMPATIBILITY', label: 'Wedding Matching (10 Poruthams)', pages: '1 Page', badge: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' },
  { key: 'BABY_NAMING', label: 'Baby Naming Syllables (Vedic Namakaran)', pages: '1 Page', badge: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' },
  { key: 'MUHURTHAM', label: 'Subha Muhurtham (6-Month Dates)', pages: '2 Pages', badge: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' }
];


export type AdminServicePricing = Record<ServiceType, { usd: number; inr: number }>;

export function buildAdminServicePricing(
  stored?: Partial<Record<ServiceType, { usd?: number; USD?: number }>> | null,
  rate: number = USD_TO_INR_RATE
): AdminServicePricing {
  const table = {} as AdminServicePricing;
  for (const { key } of ADMIN_PRICED_SERVICES) {
    const raw = stored?.[key];
    const usd = Number(raw?.usd ?? raw?.USD ?? DEFAULT_SERVICE_PRICES[key].USD);
    const safeUsd = Number.isFinite(usd) && usd >= 0 ? usd : DEFAULT_SERVICE_PRICES[key].USD;
    table[key] = { usd: safeUsd, inr: usdToInr(safeUsd, rate) };
  }
  return table;
}

export function describeEmailParts(response: any): string {
  const count = Math.max(1, Math.floor(Number(response?.emailPartCount) || 1));
  return count === 1 ? 'one email' : `${count} emails`;
}

export const SERVICE_DISPLAY: Record<string, string> = {
  BIRTH_JATHAGAM: '🪐 Birth Jathagam',
  MARRIAGE_COMPATIBILITY: '💍 Wedding Matching',
  BABY_NAMING: '👶 Baby Naming Syllables',
  MUHURTHAM: '📅 Subha Muhurtham',
  MULTI_PERSON: '👪 Multi-Person Order'
};

export const serviceDisplayName = (service?: string) => SERVICE_DISPLAY[service || ''] || service || 'Report';

/** Per-report fulfilment badge for multi-person orders. */
export function getItemStatusBadge(status?: string) {
  const s = (status || 'PENDING').toUpperCase();
  const cls =
    s === 'SENT'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : s === 'FAILED'
      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
      : s === 'CALCULATED'
      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  return <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${cls}`}>{s}</span>;
}


export function computeGroupedOrderUnits(orders: Order[], filterStatus: string, searchQuery: string) {
  const groupedOrderUnits: any = (() => {
    const groupsMap = new Map<string, Order[]>();
    const singleOrders: Order[] = [];

    // Group all orders by groupId
    orders.forEach(o => {
      if (o.groupId) {
        if (!groupsMap.has(o.groupId)) {
          groupsMap.set(o.groupId, []);
        }
        groupsMap.get(o.groupId)!.push(o);
      } else {
        singleOrders.push(o);
      }
    });

    const units: Array<{
      isGroup: boolean;
      groupId?: string;
      orders: Order[];
      mainOrder: Order;
      totalAmount: number;
      currency: string;
      paymentReference?: string;
      paymentMethod: any;
      status: string;
      emailStatus: string;
      isAllCompleted?: boolean;
      isAllCancelled?: boolean;
      /** One orders row with people/reports (multi-person checkout). */
      isMultiPerson?: boolean;
      createdAt: string;
      userName: string;
      userEmail: string;
      country: string;
      ipAddress?: string;
    }> = [];

    // Build Family Group Units
    groupsMap.forEach((gOrders, gId) => {
      gOrders.sort((a, b) => (a.groupOrderIndex ?? 0) - (b.groupOrderIndex ?? 0));
      const main = gOrders[0];
      const totalAmount = gOrders.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const allCompleted = gOrders.every(item => (item.status || '').toUpperCase() === 'COMPLETED');
      const allCancelled = gOrders.every(item => (item.status || '').toUpperCase() === 'CANCELLED');
      // A bundle refunded with one click has every chart in REFUNDED (the
      // pre-approval 90% refund path) — show that instead of the stale status.
      const allRefunded = gOrders.every(item =>
        (item.status || '').toUpperCase() === 'REFUNDED' || (item.refundStatus || '').toUpperCase() === 'REFUNDED');
      const anyPending = gOrders.some(item => {
        const s = (item.status || '').toUpperCase();
        return s === 'PENDING' || s === 'PENDING_APPROVAL';
      });
      const anyProcessing = gOrders.some(item => (item.status || '').toUpperCase() === 'PROCESSING');

      let combinedStatus = 'PENDING';
      if (allRefunded) combinedStatus = 'REFUNDED';
      else if (allCompleted) combinedStatus = 'COMPLETED';
      else if (allCancelled) combinedStatus = 'CANCELLED';
      else if (anyPending) combinedStatus = 'PENDING';
      else if (anyProcessing) combinedStatus = 'PROCESSING';
      else combinedStatus = main.status;

      const emailStatus = gOrders.every(item => (item.emailStatus || '').toUpperCase() === 'SENT')
        ? 'SENT'
        : gOrders.some(item => (item.emailStatus || '').toUpperCase() === 'FAILED' || (item.emailStatus || '').toUpperCase() === 'ERROR')
        ? 'FAILED'
        : main.emailStatus;

      units.push({
        isGroup: true,
        groupId: gId,
        orders: gOrders,
        mainOrder: main,
        totalAmount,
        currency: main.currency || DEFAULT_CURRENCY,
        paymentReference: main.paymentReference || gOrders.find(o => o.paymentReference)?.paymentReference,
        paymentMethod: main.paymentMethod,
        status: combinedStatus,
        emailStatus,
        isAllCompleted: allCompleted,
        isAllCancelled: allCancelled,
        createdAt: main.createdAt,
        userName: main.userName || main.inputPayload?.name || 'Family User Group',
        userEmail: main.userEmail,
        country: main.country,
        ipAddress: main.ipAddress
      });
    });

    // Build Single Order Units
    singleOrders.forEach(order => {
      units.push({
        isGroup: false,
        isMultiPerson: order.serviceType === 'MULTI_PERSON' || (Array.isArray(order.items) && order.items.length > 0),
        orders: [order],
        mainOrder: order,
        totalAmount: Number(order.amount) || 0,
        currency: order.currency || DEFAULT_CURRENCY,
        paymentReference: order.paymentReference,
        paymentMethod: order.paymentMethod,
        status: order.status,
        emailStatus: order.emailStatus,
        createdAt: order.createdAt,
        userName: order.userName || order.inputPayload?.name || 'User',
        userEmail: order.userEmail,
        country: order.country,
        ipAddress: order.ipAddress
      });
    });

    // Sort units newest first
    units.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter by filterStatus & searchQuery
    return units.filter(unit => {
      const unitStatus = (unit.status || '').toUpperCase();
      const matchesStatus =
        filterStatus === 'ALL' ||
        unitStatus === filterStatus ||
        (filterStatus === 'PENDING' && (unitStatus === 'PENDING' || unitStatus === 'PENDING_APPROVAL'));

      if (!matchesStatus) return false;

      if (!searchQuery) return true;

      const q = (searchQuery || '').toLowerCase();
      const matchGroup = unit.groupId?.toLowerCase().includes(q);
      const matchMain =
        unit.mainOrder?.orderNumber?.toLowerCase().includes(q) ||
        unit.userName?.toLowerCase().includes(q) ||
        unit.userEmail?.toLowerCase().includes(q) ||
        unit.country?.toLowerCase().includes(q) ||
        unit.paymentReference?.toLowerCase().includes(q);

      const matchMembers = unit.orders.some(o =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.userName?.toLowerCase().includes(q) ||
        o.inputPayload?.name?.toLowerCase().includes(q) ||
        o.serviceType?.toLowerCase().includes(q) ||
        o.inputPayload?.birthPlace?.toLowerCase().includes(q)
      );

      return !!(matchGroup || matchMain || matchMembers);
    });
  })();

  const filteredOrders = orders.filter(o => {
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    const q = (searchQuery || '').toLowerCase();
    const matchesSearch =
      o.orderNumber?.toLowerCase().includes(q) ||
      o.userName?.toLowerCase().includes(q) ||
      o.userEmail?.toLowerCase().includes(q) ||
      o.serviceType?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  /**
   * One row per ORDER, expanding to its PEOPLE and each person's REPORTS.
   * Preview and Send are per report and share the same cached result, so what
   * the admin previews is exactly what the customer receives.
   */
  return groupedOrderUnits;
}
