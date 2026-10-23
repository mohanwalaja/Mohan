/**
 * ASTRO SIVAM — Admin Batch Approval & Bulk Delivery Planner
 *
 * Centralises payment eligibility, stuck-`PROCESSING` retry detection, family
 * bundle deduplication, selection-key mapping, and detailed failure reporting
 * for AdminPortal's batch approval & bulk email delivery workflow.
 */

import type { Order } from '../types';

export type BatchUnitActionMode = 'approve' | 'resend';

export type BatchProcessingUnit =
  | {
      batchKey: string;
      type: 'family';
      actionMode: BatchUnitActionMode;
      groupId: string;
      orders: Order[];
      label: string;
      userEmail: string;
      customerName: string;
    }
  | {
      batchKey: string;
      type: 'single';
      actionMode: BatchUnitActionMode;
      order: Order;
      label: string;
      userEmail: string;
      customerName: string;
    };

export interface BatchSkippedRecord {
  batchKey: string;
  label: string;
  userEmail: string;
  reason: string;
}

export interface BatchFailureRecord {
  batchKey: string;
  label: string;
  userEmail: string;
  error: string;
}

export interface BatchRunSummary {
  succeeded: number;
  failed: BatchFailureRecord[];
  skipped: BatchSkippedRecord[];
  stoppedEarly: boolean;
  finishedAt: string;
}

export interface BuildBatchPlanOptions {
  /**
   * When provided and non-empty, restricts the batch to these unit keys
   * (`group:<groupId>` or `order:<orderId>`). Explicitly selected COMPLETED /
   * GENERATED orders run with `actionMode: 'resend'`.
   * When omitted, all actionable unfulfilled units in `orders` are planned.
   */
  selectedKeys?: ReadonlySet<string>;
}

export interface BatchPlanResult {
  units: BatchProcessingUnit[];
  skipped: BatchSkippedRecord[];
  totalOrderCount: number;
}

const BLOCKED_STATUSES = new Set(['CANCELLED', 'REJECTED', 'REFUNDED']);
const ALLOWED_PAYMENT_STATUSES = new Set([
  '',
  'CAPTURED',
  'PAID',
  'NOT_REQUIRED',
  'CONSUMED',
  'VERIFIED_MANUAL',
]);

/** Canonical selection key shared by desktop rows, mobile cards, and batch runner. */
export function getBatchKeyForOrder(order: Pick<Order, 'id' | 'groupId'>): string {
  return order.groupId ? `group:${order.groupId}` : `order:${order.id}`;
}

/** Canonical selection key for a rendered `groupedOrderUnits` item in AdminPortal. */
export function getBatchKeyForUnit(unit: {
  isGroup?: boolean;
  groupId?: string | null;
  mainOrder: Pick<Order, 'id' | 'groupId'>;
}): string {
  if (unit.isGroup && unit.groupId) {
    return `group:${unit.groupId}`;
  }
  return getBatchKeyForOrder(unit.mainOrder);
}

/**
 * Mirrors `api/admin/index.php` lines 177–181:
 *   - Paid orders require `paymentConfirmed === true` AND an accepted paymentStatus
 *   - Free-beta / zero-amount orders with `paymentStatus === 'NOT_REQUIRED'`
 *     have `paymentConfirmed === false` in SQL by design and ARE valid to fulfil
 *   - Refunded, cancelled, rejected, or uncaptured online orders are NEVER approved
 */
export function explainOrderApprovalBlockReason(order: Order): string | null {
  const status = (order.status || '').trim().toUpperCase();
  const refundStatus = (order.refundStatus || '').trim().toUpperCase();
  if (BLOCKED_STATUSES.has(status) || refundStatus === 'REFUNDED') {
    return `Order has already been ${(refundStatus === 'REFUNDED' ? 'refunded' : status.toLowerCase())}`;
  }

  const paymentStatus = (order.paymentStatus || '').trim().toUpperCase();
  if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) {
    return `Payment is not verified yet (${paymentStatus})`;
  }

  const isFreeNoPayment =
    paymentStatus === 'NOT_REQUIRED' ||
    (Number(order.amount || 0) <= 0 && (order.serviceMode || '').toUpperCase() === 'FREE_BETA');

  if (!order.paymentConfirmed && !isFreeNoPayment) {
    return 'Payment is not verified yet';
  }

  if (!(order.userEmail || '').trim()) {
    return 'Customer email address is missing';
  }

  return null;
}

export function isOrderPaymentVerifiedForApproval(order: Order): boolean {
  return explainOrderApprovalBlockReason(order) === null;
}

export function canSelectOrderForBatch(order: Order): boolean {
  return isOrderPaymentVerifiedForApproval(order);
}

/**
 * True when an order still needs first-time approval OR automatic retry after
 * an interrupted/failed email delivery (`PROCESSING`, or `GENERATED` with failed email).
 */
export function isOrderActionableForBatch(order: Order): boolean {
  const status = (order.status || '').trim().toUpperCase();
  if (BLOCKED_STATUSES.has(status) || status === 'COMPLETED') {
    return false;
  }
  const emailFailed =
    (order.emailStatus || '').trim().toUpperCase() === 'FAILED' ||
    (order.emailStatus || '').trim().toUpperCase() === 'ERROR';

  const needsFulfilment =
    status === 'PENDING' ||
    status === 'PENDING_APPROVAL' ||
    status === 'PROCESSING' ||
    (status === 'GENERATED' && emailFailed);

  if (!needsFulfilment) {
    return false;
  }

  return isOrderPaymentVerifiedForApproval(order);
}

function extractOrdersFromUnitInput(
  unitOrOrders: Order[] | { orders?: Order[]; mainOrder?: Order }
): Order[] {
  if (Array.isArray(unitOrOrders)) {
    return unitOrOrders;
  }
  if (Array.isArray(unitOrOrders?.orders) && unitOrOrders.orders.length > 0) {
    return unitOrOrders.orders;
  }
  return unitOrOrders?.mainOrder ? [unitOrOrders.mainOrder] : [];
}

/**
 * True when an order row/group checkbox is enabled in AdminPortal:
 * all confirmed/free orders that are not cancelled/rejected/refunded may be
 * selected (pending/processing units approve; already-completed units resend).
 */
export function canSelectUnitForBatch(
  unitOrOrders: Order[] | { orders?: Order[]; mainOrder?: Order }
): boolean {
  const unitOrders = extractOrdersFromUnitInput(unitOrOrders);
  if (unitOrders.length === 0) return false;
  return unitOrders.every(o => explainOrderApprovalBlockReason(o) === null);
}

/** True when a grouped/single unit needs approval or retry in the actionable queue. */
export function isUnitActionableForBatch(
  unitOrOrders: Order[] | { orders?: Order[]; mainOrder?: Order }
): boolean {
  const unitOrders = extractOrdersFromUnitInput(unitOrOrders);
  if (unitOrders.length === 0) return false;
  if (!unitOrders.every(o => explainOrderApprovalBlockReason(o) === null)) {
    return false;
  }
  return unitOrders.some(o => isOrderActionableForBatch(o));
}

/**
 * Build the deduplicated list of family bundles & standalone/multi-person orders
 * to execute in one batch run, separating any ineligible orders with clear reasons.
 */
export function buildBatchProcessingPlan(
  allOrders: Order[],
  options: BuildBatchPlanOptions = {}
): BatchPlanResult {
  const { selectedKeys } = options;
  const hasExplicitSelection = Boolean(selectedKeys && selectedKeys.size > 0);

  const units: BatchProcessingUnit[] = [];
  const skipped: BatchSkippedRecord[] = [];
  const seenGroupIds = new Set<string>();
  const seenOrderIds = new Set<string>();
  let totalOrderCount = 0;

  for (const order of allOrders) {
    if (order.groupId) {
      if (seenGroupIds.has(order.groupId)) continue;
      seenGroupIds.add(order.groupId);

      const batchKey = `group:${order.groupId}`;
      if (hasExplicitSelection && !selectedKeys!.has(batchKey)) {
        continue;
      }

      const groupOrders = allOrders
        .filter(candidate => candidate.groupId === order.groupId)
        .sort((a, b) => (a.groupOrderIndex ?? 0) - (b.groupOrderIndex ?? 0));

      const lead = groupOrders[0] || order;
      const badMember = groupOrders.find(m => explainOrderApprovalBlockReason(m) !== null);
      if (badMember) {
        const anyUncompleted = groupOrders.some(m => {
          const s = (m.status || '').trim().toUpperCase();
          return !BLOCKED_STATUSES.has(s) && s !== 'COMPLETED';
        });
        if (hasExplicitSelection || anyUncompleted) {
          skipped.push({
            batchKey,
            label: `Family ${order.groupId}`,
            userEmail: lead.userEmail || '',
            reason: explainOrderApprovalBlockReason(badMember) || 'Not eligible for approval',
          });
        }
        continue;
      }

      const allAlreadyGeneratedOrCompleted = groupOrders.every(m => {
        const s = (m.status || '').trim().toUpperCase();
        return s === 'COMPLETED' || s === 'GENERATED';
      });
      const anyActionable = groupOrders.some(m => isOrderActionableForBatch(m));

      if (!hasExplicitSelection && !anyActionable) {
        continue;
      }

      totalOrderCount += groupOrders.length;
      units.push({
        batchKey,
        type: 'family',
        actionMode: allAlreadyGeneratedOrCompleted ? 'resend' : 'approve',
        groupId: order.groupId,
        orders: groupOrders,
        label: `Family ${order.groupId}`,
        userEmail: lead.userEmail || '',
        customerName: lead.userName || lead.inputPayload?.name || 'Family Group',
      });
      continue;
    }

    if (seenOrderIds.has(order.id)) continue;
    seenOrderIds.add(order.id);

    const batchKey = `order:${order.id}`;
    if (hasExplicitSelection && !selectedKeys!.has(batchKey)) {
      continue;
    }

    const blockReason = explainOrderApprovalBlockReason(order);
    const status = (order.status || '').trim().toUpperCase();
    if (blockReason !== null) {
      if (hasExplicitSelection || (!BLOCKED_STATUSES.has(status) && status !== 'COMPLETED')) {
        skipped.push({
          batchKey,
          label: `#${order.orderNumber || order.id}`,
          userEmail: order.userEmail || '',
          reason: blockReason,
        });
      }
      continue;
    }

    const alreadyGeneratedOrCompleted = status === 'COMPLETED' || status === 'GENERATED';
    if (!hasExplicitSelection && !isOrderActionableForBatch(order)) {
      continue;
    }

    const chartCount =
      Array.isArray(order.items) && order.items.length > 0 ? order.items.length : 1;
    totalOrderCount += chartCount;

    units.push({
      batchKey,
      type: 'single',
      actionMode: alreadyGeneratedOrCompleted ? 'resend' : 'approve',
      order,
      label: `#${order.orderNumber || order.id}`,
      userEmail: order.userEmail || '',
      customerName: order.userName || order.inputPayload?.name || 'Customer',
    });
  }

  return { units, skipped, totalOrderCount };
}
