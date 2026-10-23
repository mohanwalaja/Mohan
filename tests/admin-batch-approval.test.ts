import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBatchProcessingPlan,
  canSelectOrderForBatch,
  canSelectUnitForBatch,
  explainOrderApprovalBlockReason,
  getBatchKeyForOrder,
  getBatchKeyForUnit,
  isOrderActionableForBatch,
  isOrderPaymentVerifiedForApproval,
  isUnitActionableForBatch,
} from '../src/services/adminBatchApproval';
import type { Order } from '../src/types';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: overrides.id ?? 'ord-1',
    orderNumber: overrides.orderNumber ?? 'AS-1001',
    userId: overrides.userId ?? 'u-1',
    userEmail: overrides.userEmail ?? 'customer@example.com',
    userName: overrides.userName ?? 'Arun Kumar',
    serviceType: overrides.serviceType ?? 'BIRTH_JATHAGAM',
    status: overrides.status ?? 'PENDING',
    emailStatus: overrides.emailStatus ?? 'PENDING',
    amount: overrides.amount ?? 499,
    currency: overrides.currency ?? 'INR',
    country: overrides.country ?? 'IN',
    paymentMethod: overrides.paymentMethod ?? 'RAZORPAY',
    paymentConfirmed: overrides.paymentConfirmed ?? true,
    paymentStatus: overrides.paymentStatus ?? 'PAID',
    createdAt: overrides.createdAt ?? '2026-10-23T08:00:00Z',
    language: overrides.language ?? 'ta',
    inputPayload: overrides.inputPayload ?? {
      name: 'Arun Kumar',
      dob: '1994-05-12',
      tob: '06:30',
      birthPlace: 'Chennai',
    },
    ...overrides,
  };
}

// 1. Payment verification parity with api/admin/index.php
{
  const paidPending = makeOrder({ id: 'paid-1', orderNumber: 'AS-2001', paymentConfirmed: true, paymentStatus: 'PAID' });
  const unpaidPending = makeOrder({
    id: 'unpaid-1',
    orderNumber: 'AS-2002',
    paymentConfirmed: false,
    paymentStatus: 'PENDING_ADMIN',
    amount: 499,
  });
  const freeBetaPending = makeOrder({
    id: 'free-1',
    orderNumber: 'AS-2003',
    paymentConfirmed: false,
    paymentStatus: 'NOT_REQUIRED',
    paymentMethod: 'FREE_BETA',
    amount: 0,
  });
  const refundedOrder = makeOrder({
    id: 'ref-1',
    orderNumber: 'AS-2004',
    status: 'PENDING',
    refundStatus: 'REFUNDED',
    paymentConfirmed: true,
  });
  const cancelledOrder = makeOrder({
    id: 'can-1',
    orderNumber: 'AS-2005',
    status: 'CANCELLED',
    paymentConfirmed: true,
  });

  assert.equal(isOrderPaymentVerifiedForApproval(paidPending), true);
  assert.equal(isOrderPaymentVerifiedForApproval(freeBetaPending), true);
  assert.equal(isOrderPaymentVerifiedForApproval(unpaidPending), false);
  assert.equal(isOrderActionableForBatch(unpaidPending), false);
  assert.equal(canSelectOrderForBatch(unpaidPending), false);
  assert.match(explainOrderApprovalBlockReason(unpaidPending) || '', /Payment is not verified/i);
  assert.match(explainOrderApprovalBlockReason(refundedOrder) || '', /refunded/i);
  assert.match(explainOrderApprovalBlockReason(cancelledOrder) || '', /cancelled/i);

  const plan = buildBatchProcessingPlan([
    paidPending,
    unpaidPending,
    freeBetaPending,
    refundedOrder,
    cancelledOrder,
  ]);

  assert.deepEqual(
    plan.units.map(u => u.batchKey),
    ['order:paid-1', 'order:free-1'],
    'Only verified paid orders and NOT_REQUIRED free-beta orders should be auto-queued'
  );
  assert.equal(plan.units.every(u => u.actionMode === 'approve'), true);
  assert.equal(
    plan.skipped.some(s => s.batchKey === 'order:unpaid-1'),
    true,
    'Unpaid pending order must be reported in skipped diagnostics'
  );
}

// 2. Stuck PROCESSING recovery + failed-email retry + explicit checkbox resend
{
  const stuckProcessing = makeOrder({
    id: 'proc-1',
    orderNumber: 'AS-3001',
    status: 'PROCESSING',
    emailStatus: 'PENDING',
  });
  const failedEmailGenerated = makeOrder({
    id: 'gen-fail-1',
    orderNumber: 'AS-3002',
    status: 'GENERATED',
    emailStatus: 'FAILED',
  });
  const alreadyCompleted = makeOrder({
    id: 'comp-1',
    orderNumber: 'AS-3003',
    status: 'COMPLETED',
    emailStatus: 'SENT',
  });

  const autoPlan = buildBatchProcessingPlan([
    stuckProcessing,
    failedEmailGenerated,
    alreadyCompleted,
  ]);
  assert.deepEqual(autoPlan.units.map(u => [u.batchKey, u.actionMode]), [
    ['order:proc-1', 'approve'],
    ['order:gen-fail-1', 'resend'],
  ]);

  // Explicit checkbox selection allows resending an already completed order safely
  const selectedPlan = buildBatchProcessingPlan(
    [stuckProcessing, failedEmailGenerated, alreadyCompleted],
    { selectedKeys: new Set(['order:comp-1', 'order:proc-1']) }
  );
  assert.deepEqual(selectedPlan.units.map(u => [u.batchKey, u.actionMode]), [
    ['order:proc-1', 'approve'],
    ['order:comp-1', 'resend'],
  ]);
}

// 3. Family group deduplication (1 consolidated email per family groupId)
{
  const fam1 = makeOrder({ id: 'f1', groupId: 'GRP-900', groupOrderIndex: 0, status: 'PENDING' });
  const fam2 = makeOrder({ id: 'f2', groupId: 'GRP-900', groupOrderIndex: 1, status: 'PROCESSING' });
  const fam3 = makeOrder({ id: 'f3', groupId: 'GRP-900', groupOrderIndex: 2, status: 'PENDING' });

  const plan = buildBatchProcessingPlan([fam2, fam3, fam1]);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.totalOrderCount, 3);
  const unit = plan.units[0];
  assert.equal(unit.type, 'family');
  assert.equal(unit.batchKey, 'group:GRP-900');
  assert.equal(unit.actionMode, 'approve');
  assert.deepEqual(
    unit.orders.map(o => o.id),
    ['f1', 'f2', 'f3'],
    'Family members must be sorted deterministically by groupOrderIndex'
  );

  assert.equal(getBatchKeyForOrder(fam1), 'group:GRP-900');
  assert.equal(getBatchKeyForUnit({ isGroup: true, groupId: 'GRP-900', mainOrder: fam1 }), 'group:GRP-900');
  assert.equal(canSelectUnitForBatch({ isGroup: true, groupId: 'GRP-900', orders: [fam1, fam2, fam3], mainOrder: fam1 }), true);
  assert.equal(isUnitActionableForBatch({ isGroup: true, groupId: 'GRP-900', orders: [fam1, fam2, fam3], mainOrder: fam1 }), true);
}

// 4. Architectural contracts on AdminPortal.tsx & api.ts
{
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const adminPortalSrc = fs.readFileSync(path.join(repoRoot, 'src/pages/AdminPortal.tsx'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(repoRoot, 'src/services/api.ts'), 'utf8');

  assert.match(
    adminPortalSrc,
    /const rendered = await prepareOrderItemsSendPayload\([\s\S]*?const payload = await deliverOrderItemsPdfPayload\(order, rendered, 'admin'\);/,
    'Multi-person batch delivery must stage 200 DPI PDFs via deliverOrderItemsPdfPayload before sendAllOrderItems/resendEmail'
  );
  assert.match(adminPortalSrc, /Approve Selected \(/, 'AdminPortal must render multi-select Approve Selected button');
  assert.match(adminPortalSrc, /Stop After Current/, 'AdminPortal must render safe Stop After Current button during batch runs');
  assert.match(adminPortalSrc, /Retry Failed \(/, 'AdminPortal must render 1-click Retry Failed action on batch error report');
  assert.match(adminPortalSrc, /Processing \/ Retry/, 'AdminPortal must surface stuck PROCESSING status badge');
  assert.match(apiSrc, /async sendAllOrderItems[\s\S]*?apiFetch\(/, 'sendAllOrderItems must use authenticated CSRF-aware apiFetch');
}

console.log('✓ admin-batch-approval: payment verification, PROCESSING retry, multi-select, staging & UI contracts verified');
