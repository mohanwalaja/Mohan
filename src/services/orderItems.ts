/**
 * Multi-person order items - shared Preview/Send helpers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A multi-person order stores one `order_items` row per report (person +
 * service). The admin must be able to Preview and Send every report on its own,
 * and both must always show the SAME numbers.
 *
 * `getOrCalculateResult()` is that single source of truth: it returns the item's
 * cached result and only asks the server to calculate (and cache) when the item
 * has none. Preview calls it, Send calls it, so they cannot drift apart.
 *
 * The PDF helpers below reuse the existing preview-exact pipeline
 * (`buildOrderReportHtml` + html2canvas/jsPDF) so a sent report is the same
 * document the admin previewed, and the invoice is the ORDER invoice (the
 * customer paid one total), with the same multi-line invoice the family flow
 * already uses.
 */

import { AppLanguage, Order, OrderItem, ServiceType } from '../types';
import { api } from './api';
// The PDF engine is deferred (audit PERF-1): this module is imported by the
// admin portal and the order modal for pure HTML/invoice helpers, so it must
// NOT pull jspdf + html2canvas into those pages. Every function below that
// renders a PDF awaits loadPdfEngine() at call time.
import { loadPdfEngine } from './pdfEngine';
import { buildInvoiceHtml, buildFamilyInvoiceHtml } from './invoiceHtmlBuilder';

export interface OrderItemResult {
  result: any;
  item: OrderItem;
  recalculated: boolean;
  message?: string;
}

/**
 * THE cache-read-through for one report.
 *
 * 1. An item that already carries `calculatedResult` (written at order creation
 *    or by an earlier Preview) is used as-is.
 * 2. Otherwise the admin API recalculates from the item's own payload and
 *    CACHES it on `order_items.calculated_result`.
 *
 * Both the Preview modal and the Send buttons call this, which is what keeps
 * "what the admin saw" and "what the customer received" identical.
 */
export async function getOrCalculateResult(orderId: string, item: OrderItem): Promise<OrderItemResult> {
  if (item.calculatedResult) {
    return { result: item.calculatedResult, item, recalculated: false };
  }
  const res = await api.getOrderItemResult(orderId, item.id);
  if (res.success && res.result) {
    return {
      result: res.result,
      item: { ...item, calculatedResult: res.result, reportStatus: res.item?.reportStatus || item.reportStatus },
      recalculated: res.recalculated !== false
    };
  }
  throw new Error(res.message || 'This report could not be calculated.');
}

/** A one-chart order view of an item - used by every existing report builder. */
export function orderItemAsOrder(header: Order, item: OrderItem): Order {
  return {
    ...header,
    serviceType: item.serviceCode as ServiceType,
    language: item.language,
    inputPayload: item.inputPayload || {},
    calculatedResult: item.calculatedResult,
    amount: item.unitPrice
  };
}

/** The order's tax invoice, as HTML: one line per report (one order, one total). */
export function buildOrderInvoiceHtmlForItems(header: Order, items: OrderItem[]): string {
  if (items.length <= 1) {
    // One report -> the official single-service invoice, unchanged.
    return buildInvoiceHtml({ ...header, language: 'en' });
  }
  const pseudoOrders: Order[] = items.map(item =>
    orderItemAsOrder(header, item)
  );
  return buildFamilyInvoiceHtml(pseudoOrders, header.orderNumber || header.id);
}

/**
 * Renders one item's report + the order invoice to base64 PDFs, using the same
 * preview-exact pipeline as the live preview.
 */
export async function prepareOrderItemPdfs(
  header: Order,
  item: OrderItem,
  result: any,
  lang?: AppLanguage
): Promise<{ reportPdfBase64: string; invoicePdfBase64: string; reportFileName: string; invoiceFileName: string }> {
  const {
    buildOrderReportHtml,
    mergeOrderPayloadIntoResult,
    renderEmailPdfBase64,
    orderReportFileName,
    orderInvoiceFileName,
    yieldToBrowser
  } = await loadPdfEngine();
  const chartOrder = orderItemAsOrder(header, item);
  const effectiveLang = (lang || item.language || 'ta') as AppLanguage;
  const reportHtml = buildOrderReportHtml(chartOrder, mergeOrderPayloadIntoResult(chartOrder, result), effectiveLang);
  if (!reportHtml) {
    throw new Error(`No report template exists for ${item.serviceCode}. Nothing was emailed.`);
  }
  // The invoice always describes the WHOLE order (the customer paid one total),
  // even when only this one report is being emailed.
  const invoiceHtml = buildOrderInvoiceHtmlForItems(
    header,
    header.items && header.items.length > 0 ? header.items : [item]
  );

  const reportPdfBase64 = await renderEmailPdfBase64(reportHtml, 'Report PDF');
  await yieldToBrowser();
  const invoicePdfBase64 = await renderEmailPdfBase64(invoiceHtml, 'Invoice PDF');

  return {
    reportPdfBase64,
    invoicePdfBase64,
    reportFileName: orderReportFileName(chartOrder, effectiveLang),
    invoiceFileName: orderInvoiceFileName(header)
  };
}

/**
 * Renders EVERY report of an order (plus the order invoice ONCE) and returns the
 * payload the admin send endpoints expect. One report per item, one invoice per
 * order - exactly the delivery rule for multi-person orders.
 */
export async function prepareOrderItemsSendPayload(
  header: Order,
  items: OrderItem[],
  onProgress?: (message: string, index: number, total: number) => void
): Promise<{
  reportPdfs: Array<{ itemId: number; fileName: string; pdfBase64: string }>;
  invoicePdfBase64: string;
  invoiceFileName: string;
}> {
  const {
    buildOrderReportHtml,
    mergeOrderPayloadIntoResult,
    renderEmailPdfBase64,
    orderReportFileName,
    orderInvoiceFileName,
    yieldToBrowser
  } = await loadPdfEngine();
  const reportPdfs: Array<{ itemId: number; fileName: string; pdfBase64: string }> = [];
  let invoicePdfBase64 = '';
  let invoiceFileName = orderInvoiceFileName(header);
  const total = items.length;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const label = item.personName || `Report ${index + 1}`;
    if (onProgress) onProgress(`Rendering report ${index + 1} of ${total} (${label})…`, index, total);

    const calculated = await getOrCalculateResult(header.id, item);
    const chartOrder = orderItemAsOrder(header, calculated.item);

    const reportHtml = buildOrderReportHtml(
      chartOrder,
      mergeOrderPayloadIntoResult(chartOrder, calculated.result),
      (calculated.item.language || 'ta') as AppLanguage
    );
    if (!reportHtml) {
      throw new Error(`No report template exists for ${calculated.item.serviceCode}. Nothing was emailed.`);
    }
    const pdfBase64 = await renderEmailPdfBase64(
      reportHtml,
      `Report PDF for ${calculated.item.personName || header.orderNumber || 'this order'}`
    );
    reportPdfs.push({
      itemId: calculated.item.id,
      fileName: orderReportFileName(chartOrder, (calculated.item.language || 'ta') as AppLanguage),
      pdfBase64
    });

    // The invoice is the order's document: render it once, from the first item.
    if (index === 0) {
      invoiceFileName = orderInvoiceFileName(header);
      const invoiceHtml = buildOrderInvoiceHtmlForItems(header, items);
      invoicePdfBase64 = await renderEmailPdfBase64(invoiceHtml, 'Invoice PDF');
    }
    await yieldToBrowser();
  }

  return { reportPdfs, invoicePdfBase64, invoiceFileName };
}

export interface PreparedOrderItemsPayload {
  reportPdfs: Array<{ itemId: number; fileName: string; pdfBase64: string }>;
  invoicePdfBase64: string;
  invoiceFileName: string;
}

/**
 * Stage multi-person high-resolution PDFs one document at a time whenever the
 * combined base64 payload exceeds typical reverse-proxy body limits (~5 MiB),
 * ensuring 5–10 person high-DPI orders deliver cleanly on every cPanel host.
 */
export async function deliverOrderItemsPdfPayload(
  header: Order,
  rendered: PreparedOrderItemsPayload,
  audience: 'admin' | 'customer' = 'admin'
): Promise<{
  staged?: boolean;
  reportPdfs: Array<{ itemId: number; fileName: string; pdfBase64: string }>;
  invoicePdfBase64: string;
}> {
  const totalBase64Bytes =
    rendered.invoicePdfBase64.length +
    rendered.reportPdfs.reduce((sum, entry) => sum + entry.pdfBase64.length, 0);

  if (totalBase64Bytes <= 7_000_000) {
    return {
      staged: false,
      reportPdfs: rendered.reportPdfs,
      invoicePdfBase64: rendered.invoicePdfBase64
    };
  }

  const stageFn = audience === 'customer' ? api.stageCustomerOrderDoc : api.stageOrderDoc;
  const clearFn = audience === 'customer' ? api.clearCustomerOrderStagedDocs : api.clearOrderStagedDocs;

  await clearFn(header.id);
  for (const entry of rendered.reportPdfs) {
    const saved = await stageFn(header.id, {
      kind: 'report',
      orderId: `item_${entry.itemId}`,
      orderNumber: header.orderNumber,
      fileName: entry.fileName,
      pdfBase64: entry.pdfBase64
    });
    if (!saved || !saved.success) {
      throw new Error(saved?.message || `Could not stage high-quality PDF for ${entry.fileName}.`);
    }
  }
  const savedInvoice = await stageFn(header.id, {
    kind: 'invoice',
    orderId: header.id,
    orderNumber: header.orderNumber,
    fileName: rendered.invoiceFileName,
    pdfBase64: rendered.invoicePdfBase64
  });
  if (!savedInvoice || !savedInvoice.success) {
    throw new Error(savedInvoice?.message || 'Could not stage high-quality tax invoice PDF.');
  }
  return { staged: true, reportPdfs: [], invoicePdfBase64: '' };
}

/**
 * Same staging protection when an admin emails a single person's report from a
 * multi-person order whose high-DPI report + multi-line invoice exceeds 7 MB base64.
 */
export async function deliverSingleOrderItemPdfPayload(
  header: Order,
  itemId: number,
  pdfs: { reportPdfBase64: string; invoicePdfBase64: string; reportFileName: string; invoiceFileName: string }
): Promise<{ reportPdfBase64?: string; invoicePdfBase64?: string; itemId: number }> {
  if (pdfs.reportPdfBase64.length + pdfs.invoicePdfBase64.length <= 7_000_000) {
    return {
      reportPdfBase64: pdfs.reportPdfBase64,
      invoicePdfBase64: pdfs.invoicePdfBase64,
      itemId
    };
  }
  await api.clearOrderStagedDocs(header.id);
  const savedReport = await api.stageOrderDoc(header.id, {
    kind: 'report',
    orderId: `item_${itemId}`,
    orderNumber: header.orderNumber,
    fileName: pdfs.reportFileName,
    pdfBase64: pdfs.reportPdfBase64
  });
  if (!savedReport || !savedReport.success) {
    throw new Error(savedReport?.message || 'Could not stage live-preview report PDF.');
  }
  const savedInvoice = await api.stageOrderDoc(header.id, {
    kind: 'invoice',
    orderId: header.id,
    orderNumber: header.orderNumber,
    fileName: pdfs.invoiceFileName,
    pdfBase64: pdfs.invoicePdfBase64
  });
  if (!savedInvoice || !savedInvoice.success) {
    throw new Error(savedInvoice?.message || 'Could not stage live-preview invoice PDF.');
  }
  return { itemId };
}

