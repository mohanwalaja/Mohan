import React from 'react';
import { api } from '../../services/api';
import { describeFamilyRenderQuality } from '../../services/formatUtils';
import { Order, AppSettings, TeamMember } from '../../types';
import { loadPdfEngine, type FamilyRenderProgress, type FamilyStagingResult } from '../../services/pdfEngine';
import { buildOrderInvoiceHtmlForItems, deliverOrderItemsPdfPayload, prepareOrderItemsSendPayload } from '../../services/orderItems';
import { buildBatchProcessingPlan, explainOrderApprovalBlockReason, getBatchKeyForUnit, type BatchFailureRecord, type BatchRunSummary } from '../../services/adminBatchApproval';
import { DEFAULT_CURRENCY, MAX_USD_TO_INR_RATE, MIN_USD_TO_INR_RATE, normalizeUsdToInrRate, usdToInr } from '../../services/pricing';
import { isUsableTeamPhoto } from '../common/TeamMemberAvatar';
import { TEAM_PHOTO_MAX_BYTES, formatTeamPhotoBytes, prepareTeamPhoto } from '../../services/teamPhoto';
import { buildAdminServicePricing, describeEmailParts } from './adminPortalHelpers';

export function useAdminPortalActions(deps: any) {
  const {
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
  } = deps;

  const handleStopBatchRun = () => {
    batchStopRequestedRef.current = true;
    setBatchStopping(true);
  };

  const runBatchDelivery = async (targetKeys?: ReadonlySet<string>) => {
    const plan = buildBatchProcessingPlan(
      orders,
      targetKeys ? { selectedKeys: targetKeys } : {}
    );

    if (plan.units.length === 0) {
      if (plan.skipped.length > 0) {
        const previewReasons = plan.skipped
          .slice(0, 3)
          .map(s => `${s.label}: ${s.reason}`)
          .join(' • ');
        setErrorMessage(
          `No eligible paid orders to send (${plan.skipped.length} skipped — ${previewReasons}).`
        );
      } else {
        setErrorMessage('No eligible orders found to approve and email.');
      }
      return;
    }

    const skippedNote =
      plan.skipped.length > 0
        ? `\n\nNote: ${plan.skipped.length} unpaid/cancelled/refunded item(s) will be safely skipped.`
        : '';

    const modeDescription = targetKeys
      ? `selected ${plan.units.length} package(s) (${plan.totalOrderCount} horoscope chart(s))`
      : `all ${plan.units.length} verified pending/retry package(s) (${plan.totalOrderCount} horoscope chart(s))`;

    if (
      !window.confirm(
        `Ready to generate live-preview 200 DPI PDFs and email ${modeDescription}?${skippedNote}`
      )
    ) {
      return;
    }

    batchStopRequestedRef.current = false;
    setBatchStopping(false);
    setLastBatchSummary(null);
    setErrorMessage('');
    setSuccessMessage('');

    setBatchProgress({
      total: plan.units.length,
      current: 0,
      currentOrderNum: '',
      successCount: 0,
      failCount: 0,
      isProcessing: true
    });

    let succeeded = 0;
    let failed = 0;
    let stoppedEarly = false;
    const failedRecords: BatchFailureRecord[] = [];
    const succeededKeys = new Set<string>();

    for (let i = 0; i < plan.units.length; i++) {
      const unit = plan.units[i];
      const identifier = unit.label;

      setBatchProgress(prev =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentOrderNum: identifier
            }
          : null
      );

      if (unit.type === 'family') {
        startProcessing(`family-approve-${unit.groupId}`);
        try {
          const prepared = await buildFamilyPreviewPayload(unit.orders, unit.groupId);
          const res =
            unit.actionMode === 'resend'
              ? await api.resendFamilyEmail(unit.groupId, prepared.payload)
              : await api.approveFamilyOrder(unit.groupId, prepared.payload);
          if (res && res.success) {
            succeeded++;
            succeededKeys.add(unit.batchKey);
            setOrders(prev =>
              prev.map(o =>
                o.groupId === unit.groupId
                  ? { ...o, status: 'COMPLETED', emailStatus: 'SENT' }
                  : o
              )
            );
          } else {
            failed++;
            failedRecords.push({
              batchKey: unit.batchKey,
              label: unit.label,
              userEmail: unit.orders[0]?.userEmail || '',
              error: res?.message || 'Server declined family order approval/delivery.'
            });
          }
        } catch (e: any) {
          console.error(`Error processing family group #${unit.groupId}:`, e);
          failed++;
          failedRecords.push({
            batchKey: unit.batchKey,
            label: unit.label,
            userEmail: unit.orders[0]?.userEmail || '',
            error: e?.message || 'Unexpected error while rendering or staging family PDFs.'
          });
        } finally {
          stopProcessing(`family-approve-${unit.groupId}`);
          setBatchProgress(prev =>
            prev
              ? {
                  ...prev,
                  successCount: succeeded,
                  failCount: failed
                }
              : null
          );
        }
      } else if (isMultiPersonUnit(unit.order)) {
        const order = unit.order;
        startProcessing(`email-${order.id}`);
        try {
          const rendered = await prepareOrderItemsSendPayload(
            order,
            order.items || [],
            message =>
              setBatchProgress(prev =>
                prev ? { ...prev, currentOrderNum: `${identifier} • ${message}` } : null
              )
          );
          // Stage high-res 200 DPI PDFs one file at a time so multi-person bundles
          // never exceed server post_max_size / client_max_body_size limits.
          const payload = await deliverOrderItemsPdfPayload(order, rendered, 'admin');
          const res: any =
            unit.actionMode === 'resend'
              ? await api.resendEmail(order.id, payload as any)
              : await api.sendAllOrderItems(order.id, payload);
          if (res && res.success) {
            succeeded++;
            succeededKeys.add(unit.batchKey);
            setOrders(prev =>
              prev.map(o =>
                o.id === order.id
                  ? {
                      ...o,
                      status: 'COMPLETED',
                      emailStatus: 'SENT',
                      items: (o.items || []).map(item => ({
                        ...item,
                        reportStatus: 'SENT'
                      }))
                    }
                  : o
              )
            );
          } else {
            failed++;
            failedRecords.push({
              batchKey: unit.batchKey,
              label: unit.label,
              userEmail: order.userEmail || '',
              error: res?.message || 'Server declined multi-person report delivery.'
            });
          }
        } catch (e: any) {
          console.error(`Error processing multi-person order #${order.orderNumber}:`, e);
          failed++;
          failedRecords.push({
            batchKey: unit.batchKey,
            label: unit.label,
            userEmail: order.userEmail || '',
            error: e?.message || 'Unexpected error while rendering or staging multi-person PDFs.'
          });
        } finally {
          stopProcessing(`email-${order.id}`);
          setBatchProgress(prev =>
            prev
              ? {
                  ...prev,
                  successCount: succeeded,
                  failCount: failed
                }
              : null
          );
        }
      } else {
        const order = unit.order;
        startProcessing(`email-${order.id}`);

        try {
          const language = order.language || 'ta';
          const { generateOrderPdfsBase64, deliverOrderPdfPayload } = await loadPdfEngine();
          const pdfs = await generateOrderPdfsBase64(order, language);
          const payload = await deliverOrderPdfPayload(order, { ...pdfs, language });
          const res =
            unit.actionMode === 'resend'
              ? await api.resendEmail(order.id, payload)
              : await api.approveOrder(order.id, payload);
          if (res && res.success) {
            succeeded++;
            succeededKeys.add(unit.batchKey);
            setOrders(prev =>
              prev.map(o =>
                o.id === order.id ? { ...o, status: 'COMPLETED', emailStatus: 'SENT' } : o
              )
            );
          } else {
            failed++;
            failedRecords.push({
              batchKey: unit.batchKey,
              label: unit.label,
              userEmail: order.userEmail || '',
              error: res?.message || 'Server declined order approval/delivery.'
            });
          }
        } catch (e: any) {
          console.error(`Error processing batch order #${order.orderNumber}:`, e);
          failed++;
          failedRecords.push({
            batchKey: unit.batchKey,
            label: unit.label,
            userEmail: order.userEmail || '',
            error: e?.message || 'Unexpected error while rendering or staging order PDFs.'
          });
        } finally {
          stopProcessing(`email-${order.id}`);
          setBatchProgress(prev =>
            prev
              ? {
                  ...prev,
                  successCount: succeeded,
                  failCount: failed
                }
              : null
          );
        }
      }

      if (batchStopRequestedRef.current && i < plan.units.length - 1) {
        stoppedEarly = true;
        break;
      }
    }

    setBatchProgress(null);
    setBatchStopping(false);
    batchStopRequestedRef.current = false;

    setSelectedBatchKeys(prev => {
      const next = new Set(prev);
      succeededKeys.forEach(k => next.delete(k));
      failedRecords.forEach(f => next.add(f.batchKey));
      return next;
    });

    const summary: BatchRunSummary = {
      succeeded,
      failed: failedRecords,
      skipped: plan.skipped,
      stoppedEarly,
      finishedAt: new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    setLastBatchSummary(summary);

    if (failedRecords.length > 0) {
      setErrorMessage(
        `Batch finished with ${failedRecords.length} failure(s) (${succeeded} sent). Review details below or click Retry Failed.`
      );
    } else if (stoppedEarly) {
      setSuccessMessage(
        `Batch stopped safely after completing ${succeeded} package(s). Remaining orders stay untouched in queue.`
      );
      setTimeout(() => setSuccessMessage(''), 8000);
    } else {
      setSuccessMessage(
        `🎉 Batch complete! Successfully processed & emailed ${succeeded} package(s) at 200 DPI live-preview quality.`
      );
      setTimeout(() => setSuccessMessage(''), 8000);
    }

    fetchAdminData();
  };

  const handleBatchApproveAndSendAllPending = async () => {
    await runBatchDelivery();
  };

  /**
   * Renders the EXACT same high-quality PDFs shown in the admin live preview
   * for a family bundle - one report PDF per member + ONE consolidated family
   * tax invoice (premium invoiceHtmlBuilder design) - and uploads each of them
   * with its own request, member by member, exactly like the single-order
   * "Send Email" button does.
   *
   * Why not one big request? A family bundle is N * ~2 MB of PDF; a single JSON
   * body that large is discarded by PHP's post_max_size, and the server then
   * emails its own low-quality render instead. Staging one document per request
   * is what makes the group order quality identical to the single order.
   */
  const buildFamilyPreviewPayload = async (
    memberOrders: Order[],
    groupId: string,
    preferredLang?: string
  ): Promise<{ payload: any; staging: FamilyStagingResult }> => {
    const { prepareFamilyFulfilPayload } = await loadPdfEngine();
    const onProgress = (progress: FamilyRenderProgress) => {
      setFamilyRenderProgress({ groupId, ...progress });
      setSuccessMessage(`⏳ ${progress.message}`);
    };

    const prepared = await prepareFamilyFulfilPayload(
      memberOrders,
      groupId,
      onProgress,
      preferredLang ? { preferredLang: preferredLang as any } : undefined
    );

    if (prepared.staging.warnings.length > 0) {
      console.warn(`Family group ${groupId} render warnings:`, prepared.staging.warnings);
      // A failed staged upload may use a bounded inline preview-PDF payload;
      // render/upload warnings never trigger server-rendered substitutions.
      setErrorMessage(`Preview-quality upload warning for group ${groupId}: ${prepared.staging.warnings.join(' ')}`);
    }
    if (prepared.staging.skipped.length > 0) {
      setErrorMessage(
        `${prepared.staging.skipped.length} family member report(s) could not be rendered: ` +
          prepared.staging.skipped.map(s => `#${s.orderNumber} (${s.memberName})`).join(', ')
      );
    }

    return { payload: prepared.payload, staging: prepared.staging };
  };


  const handleApproveFamilyGroup = async (groupId: string, memberOrders: Order[]) => {
    const count = memberOrders.length;
    startProcessing(`family-approve-${groupId}`);
    setErrorMessage('');
    try {
      setSuccessMessage(`⏳ Rendering ${count} preview-quality report(s) & the consolidated family tax invoice in this browser...`);
      // A render or staging failure aborts the operation; there is no
      // server-side renderer left to substitute.
      const prepared = await buildFamilyPreviewPayload(memberOrders, groupId);
      const res = await api.approveFamilyOrder(groupId, prepared.payload);
      if (res.success) {
        setSuccessMessage(
          `🎉 Family Order group (${count} charts) approved. All preview-quality reports and the consolidated invoice were delivered in ${describeEmailParts(res)}.${describeFamilyRenderQuality(res)}`
        );
        setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, status: 'COMPLETED', emailStatus: 'SENT' } : o));
        setTimeout(() => setSuccessMessage(''), 6000);
        fetchAdminData();
      } else {
        setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, emailStatus: 'FAILED' } : o));
        setErrorMessage(res.message || 'Family group approval failed');
      }
    } catch (err: any) {
      setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, emailStatus: 'FAILED' } : o));
      setErrorMessage(err.message || 'Family group approval failed');
    } finally {
      stopProcessing(`family-approve-${groupId}`);
    }
  };

  const handleResendFamilyEmail = async (groupId: string, memberOrders: Order[]) => {
    startProcessing(`family-email-${groupId}`);
    setErrorMessage('');
    try {
      setSuccessMessage(`⏳ Rendering preview-quality reports & family tax invoice for group ${groupId}...`);
      const prepared = await buildFamilyPreviewPayload(memberOrders, groupId);
      const res = await api.resendFamilyEmail(groupId, prepared.payload);
      if (res.success) {
        setSuccessMessage(`🎉 All preview-quality family reports and the consolidated invoice were delivered in ${describeEmailParts(res)}.${describeFamilyRenderQuality(res)}`);
        setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, emailStatus: 'SENT' } : o));
        setTimeout(() => setSuccessMessage(''), 5000);
        fetchAdminData();
      } else {
        setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, emailStatus: 'FAILED' } : o));
        setErrorMessage(res.message || 'Failed to send family email');
      }
    } catch (err: any) {
      setOrders(prev => prev.map(o => o.groupId === groupId ? { ...o, emailStatus: 'FAILED' } : o));
      setErrorMessage(err.message || 'Failed to send family email');
    } finally {
      stopProcessing(`family-email-${groupId}`);
    }
  };

  const handleCancelFamilyOrder = async (groupId: string) => {
    const reason = window.prompt('Enter reason for cancelling entire family package:', 'Cancelled by administrator') || 'Cancelled by administrator';
    startProcessing(`family-cancel-${groupId}`);
    try {
      const res = await api.cancelFamilyOrder(groupId, reason);
      if (res.success) {
        setSuccessMessage('Entire family package cancelled successfully.');
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Cancellation failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Cancellation failed');
    } finally {
      stopProcessing(`family-cancel-${groupId}`);
    }
  };

  /** Opens the LIVE high-quality preview of the consolidated family tax invoice. */
  const handlePreviewFamilyInvoice = (memberOrders: Order[], groupId: string) => {
    setErrorMessage('');
    setFamilyInvoicePreview({ orders: memberOrders, groupId });
  };

  const handleDownloadFamilyInvoice = async (memberOrders: Order[], groupId: string) => {
    startProcessing(`family-inv-${groupId}`);
    try {
      // High-quality consolidated family invoice rendered from the exact same
      // HTML builder as the admin live preview. There is no server-side
      // renderer to fall back to; a failure is reported, never downgraded.
      const { exportFamilyInvoiceHtmlToPdf } = await loadPdfEngine();
      await exportFamilyInvoiceHtmlToPdf(memberOrders, groupId, `ASTRO_SIVAM_Family_Invoice_${groupId}.pdf`);
    } catch (e: any) {
      setErrorMessage(e?.message || 'The family invoice could not be rendered at print quality on this device. Please retry.');
    } finally {
      stopProcessing(`family-inv-${groupId}`);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = window.prompt('Enter reason for order cancellation:', 'Cancelled by administrator') || 'Cancelled by administrator';
    startProcessing(orderId);
    try {
      const res = await api.cancelOrder(orderId, reason);
      if (res.success) {
        setSuccessMessage('Order has been cancelled successfully.');
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Cancellation failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Cancellation failed');
    } finally {
      stopProcessing(orderId);
    }
  };

  const handleBanOrderIp = async (order: Order) => {
    const ip = order.ipAddress;
    const defaultReason = `Fake / spam order #${order.orderNumber || order.id} (${order.paymentReference ? 'Invalid payment ref: ' + order.paymentReference : 'Unverified user submission'})`;
    const reason = window.prompt(
      `Enter reason for banning IP address ${ip ? `(${ip})` : ''} from Order #${order.orderNumber || order.id}:`,
      defaultReason
    );
    if (!reason) return;

    startProcessing(`ban-${order.id}`);
    try {
      const res = await api.banIpFromOrder(order.id, reason);
      if (res.success) {
        setSuccessMessage(`🛡️ IP Address ${res.ip ? `(${res.ip})` : ''} has been banned successfully! Future requests from this IP will be blocked.`);
        setTimeout(() => setSuccessMessage(''), 6000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Failed to ban IP address');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to ban IP address');
    } finally {
      stopProcessing(`ban-${order.id}`);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete Order #${orderNumber}? This will remove it from the system completely.`)) {
      return;
    }
    startProcessing(orderId);
    try {
      const res = await api.deleteOrder(orderId);
      if (res.success) {
        setSuccessMessage(`Order #${orderNumber} deleted successfully.`);
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Delete failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Delete failed');
    } finally {
      stopProcessing(orderId);
    }
  };

  /**
   * REFUND & CANCELLATION POLICY helpers — these mirror api/refunds.php, which
   * is the authority. They exist so the portal never renders a refund button
   * for an order the policy does not allow to be refunded:
   *
   *   • BEFORE admin approval  →  refundable at 90% (one click, 3 working days)
   *   • AFTER admin approval   →  report emailed, order completed, NOT refundable
   */
  const REFUND_DELIVERED_STATUSES = ['APPROVED', 'GENERATED', 'PROCESSING', 'COMPLETED'];

  /** True once the order has been approved and its report emailed (completed). */
  const refundBlockedByPolicy = (order?: Order) => {
    if (!order) return true;
    const status = (order.status || '').toUpperCase();
    const refundStatus = (order.refundStatus || '').toUpperCase();
    if (status === 'REFUNDED' || refundStatus === 'REFUNDED') return true;
    return REFUND_DELIVERED_STATUSES.includes(status);
  };

  /** 90% of the amount paid — the pre-approval refundable figure. */
  const preApprovalRefundAmount = (amount: number) => Math.round((Number(amount) || 0) * 0.9 * 100) / 100;

  const moneyLabel = (amount: number, currency?: string | null) =>
    `${(currency || DEFAULT_CURRENCY).toUpperCase()} ${(Math.round((Number(amount) || 0) * 100) / 100).toFixed(2)}`;

  /** A single order can be refunded in one click when it is still pre-approval and was paid for. */
  const canOneClickRefund = (order?: Order) =>
    !!order && !refundBlockedByPolicy(order) && Number(order.amount || 0) > 0;

  /** A family bundle refunds as a whole: every chart must still be pre-approval. */
  const canOneClickRefundGroup = (groupOrders: Order[]) =>
    groupOrders.length > 0 &&
    groupOrders.every(member => !refundBlockedByPolicy(member)) &&
    groupOrders.reduce((sum, member) => sum + (Number(member.amount) || 0), 0) > 0;

  /** The refunded-order summary line (amount + the 3-working-day settlement date). */
  const refundSummaryText = (order?: Order) => {
    if (!order || (order.refundStatus || '').toUpperCase() !== 'REFUNDED') return '';
    const amount = order.refundAmount != null ? moneyLabel(order.refundAmount, order.refundCurrency || order.currency) : '';
    const percent = order.refundPercent != null ? `${Math.round(order.refundPercent)}%` : '90%';
    const deadline = order.refundDeadline
      ? new Date(order.refundDeadline.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    const reference = order.refundReference
      ? ` • ${(order.refundMethod || '').toUpperCase() === 'GATEWAY' ? 'refunded' : 'settled'} via ${order.refundReference}`
      : '';
    return `Refunded ${amount}${amount ? ' ' : ''}(${percent})${deadline ? ` • settles by ${deadline} (3 working days)` : ' • settles within 3 working days'}${reference}`;
  };

  /**
   * ONE-CLICK REFUND.
   *
   * One click, no dialog and no amount to type: the API refunds 90% of what was
   * paid (the remaining 10% is the non-refundable payment-gateway fee) and
   * answers with the amount plus the settlement date, 3 working days out.
   * Approving the order is what makes it non-refundable, so the button is only
   * rendered for orders that are still awaiting approval.
   */
  const handleProcessRefund = async (order: Order, refundWholeGroup = false) => {
    const orderId = order.id;
    startProcessing(`refund-${orderId}`);
    setErrorMessage('');
    try {
      const res = await api.processRefund(orderId, { refundGroup: refundWholeGroup });
      if (res.success) {
        setSuccessMessage(`✅ ${res.message}`);
        setTimeout(() => setSuccessMessage(''), 10000);
        fetchAdminData();
      } else {
        setErrorMessage(res.message || 'Refund failed');
        setTimeout(() => setErrorMessage(''), 10000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Refund processing failed');
    } finally {
      stopProcessing(`refund-${orderId}`);
    }
  };

  const handleUpdateSettingsGeneric = async (updates: Partial<AppSettings>) => {
    try {
      const res = await api.updateAdminSettings(updates);
      if (res.success) {
        setSuccessMessage('Settings updated successfully!');
        await refreshSettings();
        fetchAdminData();
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update settings');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    // An out-of-band rate is refused here as well as on the server, so the
    // admin never walks away believing a typo was saved.
    if (!usdToInrRateIsValid) {
      setErrorMessage(
        `Enter an exchange rate between ₹${MIN_USD_TO_INR_RATE} and ₹${MAX_USD_TO_INR_RATE} per US$. Nothing was saved.`
      );
      setTimeout(() => setErrorMessage(''), 6000);
      return;
    }
    try {
      const savedRate = normalizeUsdToInrRate(usdToInrRate);
      const res = await api.updateAdminSettings({
        serviceMode,
        intlPriceUSD: Number(intlPrice),
        // The rate the server must price with (₹ per US$).
        usdToInrRate: savedRate,
        // INR is derived from USD at that rate — saved only so the server-side
        // order check and every reader see the same auto-calculated number.
        indiaPriceINR: usdToInr(Number(intlPrice) || 0, savedRate),
        servicePricing: buildAdminServicePricing(servicePricing, savedRate),
        autoEmailReports: autoEmail
      });
      if (res.success) {
        setSuccessMessage('System settings & service pricing saved successfully!');
        await refreshSettings();
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update settings');
    }
  };

  // Team CRUD Handlers
  const handleOpenAddTeamModal = () => {
    setEditingMember(null);
    setTeamPhotoError('');
    setTeamPhotoInfo(null);
    setShowPhotoUrlField(false);
    setMemberFormData({
      nameEn: '',
      nameTa: '',
      nameHi: '',
      titleEn: 'Senior Sivachariyar & Astrological Consultant',
      titleTa: 'முதுநிலை சிவாச்சாரியார் மற்றும் வேத ஜோதிட ஆலோசகர்',
      photoUrl: '',
      educationEn: 'Veda Agama Praveena, Sanskrit University',
      educationTa: 'வேத ஆகம பிரவீணா, சமஸ்கிருத வித்யாபீடம்',
      experienceYears: 15,
      specializations: 'Birth Jathagam, 10 Poruthams Matching, Navagraha Dosha Pariharam',
      bioEn: 'Over 15 years of dedicated practice in traditional South Indian Vedic astrology and temple ritual sciences.',
      bioTa: 'பாரம்பரிய வேத ஜோதிட கணிப்பு மற்றும் கோவில் பூஜை வழிபாடுகளில் 15 ஆண்டுகளுக்கும் மேலான அனுபவம் கொண்டவர்.',
      isActive: true,
      order: teamMembers.length + 1
    });
    setTeamSaveError('');
    setIsTeamModalOpen(true);
  };

  const handleOpenEditTeamModal = (member: TeamMember) => {
    setEditingMember(member);
    setTeamPhotoError('');
    setTeamPhotoInfo(null);
    // A pasted link stays visible if that is how this member was set up.
    setShowPhotoUrlField(isUsableTeamPhoto(member.photoUrl) && !member.photoUrl.startsWith('/api/uploads/team/'));
    setMemberFormData({
      nameEn: member.nameEn,
      nameTa: member.nameTa || '',
      nameHi: member.nameHi || '',
      titleEn: member.titleEn,
      titleTa: member.titleTa || '',
      photoUrl: member.photoUrl,
      educationEn: member.educationEn,
      educationTa: member.educationTa || '',
      experienceYears: member.experienceYears,
      specializations: member.specializations.join(', '),
      bioEn: member.bioEn || '',
      bioTa: member.bioTa || '',
      isActive: member.isActive,
      order: member.displayOrder ?? member.order ?? 1
    });
    setTeamSaveError('');
    setIsTeamModalOpen(true);
  };

  /**
   * The admin picked a photo file. It is shrunk in the browser first (so the
   * upload is small even on mobile data), then stored on the server, and the
   * returned /api/uploads/team/… URL is what gets saved on the member.
   */
  const handleTeamPhotoSelected = async (file: File | null) => {
    if (!file) return;
    setTeamPhotoError('');
    setIsTeamPhotoUploading(true);
    try {
      const prepared = await prepareTeamPhoto(file);
      const res = await api.uploadTeamPhoto(prepared.base64);
      if (!res.success || !res.photoUrl) {
        throw new Error(res.message || 'The photo could not be uploaded. Please try again.');
      }
      setMemberFormData(prev => ({ ...prev, photoUrl: res.photoUrl as string }));
      setTeamPhotoInfo({
        bytes: res.bytes ?? prepared.bytes,
        width: res.width ?? prepared.width,
        height: res.height ?? prepared.height
      });
      setShowPhotoUrlField(false);
    } catch (err: any) {
      setTeamPhotoError(err?.message || 'The photo could not be uploaded. Please try again.');
    } finally {
      setIsTeamPhotoUploading(false);
      if (teamPhotoInputRef.current) teamPhotoInputRef.current.value = '';
    }
  };

  const handleRemoveTeamPhoto = () => {
    setMemberFormData(prev => ({ ...prev, photoUrl: '' }));
    setTeamPhotoInfo(null);
    setTeamPhotoError('');
  };

  const handleSaveTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingTeamMember) return;
    if (isTeamPhotoUploading) {
      setTeamPhotoError('Please wait for the photo to finish uploading.');
      return;
    }
    if (!memberFormData.photoUrl.trim()) {
      setTeamPhotoError('Add a photo first: upload one from your phone or computer, or paste an image link.');
      return;
    }
    setTeamPhotoError('');
    setTeamSaveError('');
    setIsSavingTeamMember(true);
    try {
      const payload = {
        nameEn: memberFormData.nameEn,
        nameTa: memberFormData.nameTa,
        nameHi: memberFormData.nameHi,
        titleEn: memberFormData.titleEn,
        titleTa: memberFormData.titleTa,
        photoUrl: memberFormData.photoUrl,
        educationEn: memberFormData.educationEn,
        educationTa: memberFormData.educationTa,
        experienceYears: Number(memberFormData.experienceYears),
        specializations: memberFormData.specializations.split(',').map(s => s.trim()).filter(Boolean),
        bioEn: memberFormData.bioEn,
        bioTa: memberFormData.bioTa,
        isActive: memberFormData.isActive,
        order: Number(memberFormData.order)
      };

      const res = editingMember
        ? await api.updateTeamMember(editingMember.id, payload)
        : await api.createTeamMember(payload);
      // Never fail silently: this used to only act when success was true, so a
      // rejected save (or a 500 from the server) left the button looking dead.
      if (!res || res.success === false) {
        throw new Error((res && (res as any).message) || 'The team member could not be saved. Please try again.');
      }
      setSuccessMessage(
        editingMember
          ? `Team member ${res.member?.nameEn || memberFormData.nameEn} updated successfully!`
          : `New team member ${res.member?.nameEn || memberFormData.nameEn} added successfully!`
      );
      setIsTeamModalOpen(false);
      fetchAdminData();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      const message = err?.message || 'Failed to save team member';
      setTeamSaveError(message);
      setErrorMessage(message);
    } finally {
      setIsSavingTeamMember(false);
    }
  };

  const handleToggleMemberActive = async (member: TeamMember) => {
    try {
      const res = await api.updateTeamMember(member.id, { isActive: !member.isActive });
      if (res.success) {
        setSuccessMessage(`Member status changed to ${!member.isActive ? 'Active' : 'Inactive'}`);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchAdminData();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update member status');
    }
  };

  const handleDeleteTeamMember = async (id: string, name?: string) => {
    const memberName = name || 'this team scholar';
    if (!window.confirm(`Are you sure you want to remove ${memberName} from the astrology team?`)) {
      return;
    }
    try {
      const res = await api.deleteTeamMember(id);
      if (res && res.success) {
        setTeamMembers(prev => prev.filter(m => m.id !== id));
        setSuccessMessage(`Team scholar ${memberName} removed successfully`);
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchAdminData();
      } else {
        setErrorMessage(res?.message || 'Failed to remove team member');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove team member');
    }
  };

  const handleUpdateMessageStatus = async (id: string, status: 'NEW' | 'REVIEWED' | 'RESPONDED') => {
    try {
      const res = await api.updateAdminMessage(id, { status });
      if (res.success) {
        setSuccessMessage(`Inquiry marked as ${status}`);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchAdminData();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update message');
    }
  };

  const handleDeleteMessage = async (id: string, name: string) => {
    if (!window.confirm(`Delete inquiry message from ${name}?`)) return;
    try {
      const res = await api.deleteAdminMessage(id);
      if (res.success) {
        setSuccessMessage('Inquiry message removed');
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchAdminData();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete message');
    }
  };

  // Head metadata must render on EVERY branch (the auth-loading spinner and the
  // admin login gate used to return before <SEO>, leaving the document with no
  // title at all whenever a visitor landed there).

  return {
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
  };
}
