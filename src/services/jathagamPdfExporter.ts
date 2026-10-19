import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { HoroscopeResult, WeddingMatchResult, BabyNamingResult, AppLanguage } from '../lib/astrology/types';
import { Order } from '../types';
import { buildJathagamHtml } from './jathagamHtmlBuilder';
import { buildWeddingMatchHtml } from './weddingHtmlBuilder';
import { buildBabyNamingHtml } from './babyNamingHtmlBuilder';
import { buildMuhurthamHtml, MuhurthamScanResult } from './muhurthamHtmlBuilder';
import {
  canonicalCalculationPayload,
  familyMemberDisplayName,
  getFamilyGroupId,
  mergeOrderPayloadIntoResult,
  resultNeedsRecalculation
} from './orderPayload';
import { PDF_CAPTURE_ERROR } from './pdfErrors';

// Re-exported for the Node test suites (and for compatibility); page code
// imports the constant from './pdfErrors' directly so comparing an error
// message never pulls this module into a route chunk.
export { PDF_CAPTURE_ERROR } from './pdfErrors';

// Re-exported so the report/admin/customer code (and the Node test suites) that
// has always imported these from the exporter keeps compiling unchanged.
export {
  canonicalCalculationPayload,
  familyMemberDisplayName,
  getFamilyGroupId,
  mergeOrderPayloadIntoResult,
  resultNeedsRecalculation
} from './orderPayload';
import { buildInvoiceHtml, buildFamilyInvoiceHtml } from './invoiceHtmlBuilder';
import { orderChartServiceType } from './multiPersonOrder';
import { ensureReportFonts, type ReportFontStatus } from './reportFonts';
import { installCanvasFontMetricsReset } from './reportCapture';
import { fitJathagamLifeCardText, fitJathagamSummaryText } from './jathagamLifeCardLayout';

function fitPageToA4Element(pageEl: HTMLElement) {
  const rect = pageEl.getBoundingClientRect();
  const mmToPx = rect.width ? rect.width / 210 : 3.78; // 96dpi fallback
  const targetPx = 297 * mmToPx;

  const inner = (
    pageEl.querySelector('.inner') ||
    pageEl.querySelector('.card') ||
    pageEl.querySelector('.royal-frame') ||
    pageEl.querySelector('.inner-content') ||
    pageEl.firstElementChild
  ) as HTMLElement;

  if (!inner) {
    pageEl.style.height = '297mm';
    pageEl.style.maxHeight = '297mm';
    pageEl.style.overflow = 'hidden';
    pageEl.style.boxSizing = 'border-box';
    return;
  }

  // Temporarily unconstrain height & overflow to measure true natural content height
  pageEl.style.height = 'auto';
  pageEl.style.maxHeight = 'none';
  pageEl.style.overflow = 'visible';
  inner.style.height = 'auto';
  inner.style.maxHeight = 'none';
  inner.style.overflow = 'visible';
  inner.style.transform = 'none';
  inner.style.width = '100%';

  const style = window.getComputedStyle(pageEl);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const naturalInnerPx = inner.scrollHeight || inner.offsetHeight;
  const naturalPx = Math.max(pageEl.scrollHeight, naturalInnerPx + paddingTop + paddingBottom);

  // scrollHeight is rounded to an integer, whereas 297mm is fractional.
  // Do not shrink an already-fitting A4 page for that subpixel difference.
  if (naturalPx > targetPx + 1) {
    // Never scale below 0.5 to keep readability, and leave 8px breathing room
    const scale = Math.max(0.5, (targetPx - 8) / naturalPx);
    inner.style.transform = `scale(${scale})`;
    inner.style.transformOrigin = 'top center';
    inner.style.width = '100%';
  } else {
    inner.style.transform = 'none';
  }

  pageEl.style.height = '297mm';
  pageEl.style.maxHeight = '297mm';
  pageEl.style.overflow = 'hidden';
  pageEl.style.boxSizing = 'border-box';
}

/**
 * Global render queue — prevents two html2canvas renders from overlapping.
 * Overlapping renders share GPU/canvas memory and cause the \"last 3 PDFs render
 * in 1 second but are blank/low-quality\" bug seen in 4-member family bundles.
 */
/**
 * Capture settings for the html2canvas → jsPDF pipeline.
 *
 * `scale` is the real quality knob: it multiplies the CSS pixel density of the
 * capture, so a scale of 3.2 on an A4 page produces a 2540 × 3592 px raster
 * (≈307 dpi print quality) instead of the ~794 px the on-screen layout uses.
 * `jpegQuality` only affects compression of that raster, never its resolution.
 */
export interface HtmlPdfRenderOptions {
  scale?: number;
  jpegQuality?: number;
  /** Email-only guards: fail closed if any A4 page raster is below this size. */
  minimumCaptureWidthPx?: number;
  minimumCaptureHeightPx?: number;
}

/**
 * PRINT-QUALITY CONTRACT — paid reports are captured at 300 dpi (A4).
 *
 * A report page is a real A4 sheet laid out at 210mm × 297mm, which the browser
 * paints as 793.7 × 1122.5 CSS px at 96 dpi. The capture scale is therefore a
 * direct dpi multiplier:
 *
 *     dpi = 96 × scale          scale = dpi / 96
 *
 * A4 at 300 dpi is 2480 × 3508 px (8.2677in × 11.6929in at 300 dpi), so the
 * scale must be ≥ 3.1246. We capture at 3.2 — the extra 2% keeps html2canvas'
 * integer canvas size and pages whose height is stored in whole pixels from
 * landing one pixel under the floor — for a 2540 × 3592 px raster (≈307 dpi).
 *
 * EVERY paid report and invoice is captured at this density on every device:
 * the emailed document, a document staged for a family bundle, the admin's
 * preview download and the customer's own download. Devices that cannot
 * allocate the print canvas fail closed (email) or fall back to the documented
 * last-resort capture below (download); they never silently deliver a lighter
 * report. The PHP API enforces the same 300 dpi floor independently — see
 * ASTRO_FAMILY_DOC_MIN_PREVIEW_WIDTH_PX / _HEIGHT_PX in api/admin/family_docs.php.
 */
export const REPORT_PRINT_DPI = 300;
export const A4_PRINT_MIN_WIDTH_PX = 2480;
export const A4_PRINT_MIN_HEIGHT_PX = 3508;
export const PRINT_CAPTURE_SCALE = 3.2;

/**
 * Email PDFs use the same print-density capture as the admin's preview download.
 * Family delivery is split into size-bounded emails, so reducing raster quality
 * just to squeeze 10–15 reports into one message is no longer necessary.
 *
 * There is no lighter email profile: an emailed document below the 300 dpi
 * floor is refused before upload (here) and again by the API.
 */
export const EMAIL_RENDER_OPTIONS: HtmlPdfRenderOptions = {
  scale: PRINT_CAPTURE_SCALE,
  jpegQuality: 0.95,
  minimumCaptureWidthPx: A4_PRINT_MIN_WIDTH_PX,
  minimumCaptureHeightPx: A4_PRINT_MIN_HEIGHT_PX
};

/** A download is a paid report too: same 300 dpi capture as the emailed one. */
export const DOWNLOAD_RENDER_OPTIONS: HtmlPdfRenderOptions = {
  scale: PRINT_CAPTURE_SCALE,
  jpegQuality: 0.95
};

/**
 * PAID QUALITY IS THE CONTRACT; THE PUBLIC SAMPLE IS THE ONE DOCUMENTED
 * EXCEPTION.
 *
 * The emailed report + invoice, the admin preview download, the family bundle
 * and the customer dashboard download are all captured at this print profile
 * (3.2× ≈ 307 dpi, JPEG 0.95, A4 2480 × 3508 px floor). Nothing may lower them:
 * there is no reduced-density retry ladder any more.
 *
 * PUBLIC SAMPLE REPORTS are fixed marketing documents that carry no order and
 * are usually opened on a phone, so the owner allows one lighter profile:
 * 40% below the print capture density (3.2 × 0.6 = 1.92× ≈ 184 dpi, same JPEG
 * 0.95). It is reachable ONLY from the sample branch of LivePdfPreviewModal;
 * every paid/admin/email path resolves to the print profile above.
 *
 * Treat these numbers as a contract — see tests/pdf-pipeline-integrity.test.ts.
 */
export const PDF_RENDER_OPTIONS: HtmlPdfRenderOptions = EMAIL_RENDER_OPTIONS;

/** Public samples may be at most 40% below the paid print density. */
export const SAMPLE_QUALITY_REDUCTION = 0.4;

/** The ONE lighter profile in the app: public samples, 40% below print. */
export const SAMPLE_RENDER_OPTIONS: HtmlPdfRenderOptions = {
  // 3.2 × (1 − 0.4) = 1.92× ≈ 184 dpi on A4.
  scale: Number((PRINT_CAPTURE_SCALE * (1 - SAMPLE_QUALITY_REDUCTION)).toFixed(2)),
  // Compression does not change resolution: samples keep the print JPEG quality.
  jpegQuality: 0.95
};

/** Two attempts at the SAME density: enough for transient canvas pressure. */
const RENDER_ATTEMPTS = 2;

/**
 * Paid / admin / email renders: always the print profile with the 300 dpi
 * floors. Nothing a caller passes can lower the scale or the JPEG quality.
 */
function resolvePrintRenderOptions(options?: HtmlPdfRenderOptions): HtmlPdfRenderOptions {
  return {
    ...PDF_RENDER_OPTIONS,
    minimumCaptureWidthPx: options?.minimumCaptureWidthPx ?? PDF_RENDER_OPTIONS.minimumCaptureWidthPx,
    minimumCaptureHeightPx: options?.minimumCaptureHeightPx ?? PDF_RENDER_OPTIONS.minimumCaptureHeightPx
  };
}

/**
 * Download captures (paid and sample). The requested profile is clamped to the
 * two documented densities — never above print, never below the 40%-lighter
 * sample profile. The 300 dpi pixel floor is attached only when the capture is
 * the print profile, so the intentional sample raster is not rejected by the
 * email quality gate.
 */
function resolveDownloadRenderOptions(options?: HtmlPdfRenderOptions): HtmlPdfRenderOptions {
  const printScale = PDF_RENDER_OPTIONS.scale ?? PRINT_CAPTURE_SCALE;
  const sampleScale = SAMPLE_RENDER_OPTIONS.scale ?? printScale;
  const requestedScale = options?.scale ?? printScale;
  const scale = Math.min(Math.max(requestedScale, sampleScale), printScale);
  const resolved: HtmlPdfRenderOptions = {
    scale,
    jpegQuality: Math.max(
      options?.jpegQuality ?? PDF_RENDER_OPTIONS.jpegQuality ?? 0.95,
      SAMPLE_RENDER_OPTIONS.jpegQuality ?? 0.95
    )
  };
  if (scale >= printScale) {
    resolved.minimumCaptureWidthPx =
      options?.minimumCaptureWidthPx ?? PDF_RENDER_OPTIONS.minimumCaptureWidthPx;
    resolved.minimumCaptureHeightPx =
      options?.minimumCaptureHeightPx ?? PDF_RENDER_OPTIONS.minimumCaptureHeightPx;
  }
  return resolved;
}

/**
 * Email delivery must never fall back to a reduced-resolution page capture:
 * the emailed document is the print-density capture, or nothing is sent.
 */
function highQualityEmailRenderOptions(): HtmlPdfRenderOptions {
  return {
    ...PDF_RENDER_OPTIONS,
    minimumCaptureWidthPx: PDF_RENDER_OPTIONS.minimumCaptureWidthPx,
    minimumCaptureHeightPx: PDF_RENDER_OPTIONS.minimumCaptureHeightPx
  };
}

let _renderQueue: Promise<void> = Promise.resolve();

/** Runs `task` after every previously queued render has finished. */
function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const resultPromise = _renderQueue.then(task, task);
  _renderQueue = resultPromise.then(
    () => {},
    () => {}
  );
  return resultPromise;
}

/**
 * Captures one report page with html2canvas and appends it to `doc`.
 *
 * The `onclone` hook is the important part: html2canvas regenerates the report
 * inside a brand-new iframe, and it AWAITS an async `onclone`. We use that to
 * (a) drop the report stylesheet into the clone and (b) wait for every report
 * font face to be live in the clone *before* html2canvas photographs it. That
 * is what makes the downloaded PDF use the same typefaces — and therefore the
 * same metrics, line breaks and pagination — as the on-screen preview instead
 * of fallback serif/sans glyphs.
 */
async function capturePageIntoDoc(
  doc: jsPDF,
  pageEl: HTMLElement,
  options: {
    captureScale: number;
    jpegQuality: number;
    pageNumber: number;
    windowWidth?: number;
    windowHeight?: number;
    minimumCaptureWidthPx?: number;
    minimumCaptureHeightPx?: number;
  }
): Promise<void> {
  const {
    captureScale,
    jpegQuality,
    pageNumber,
    minimumCaptureWidthPx,
    minimumCaptureHeightPx
  } = options;
  const ownerDoc = pageEl.ownerDocument || document;
  const ownerWindow = ownerDoc.defaultView || window;
  let canvas: HTMLCanvasElement | null = null;
  let attempts = 0;
  let success = false;

  while (attempts < 3 && !success) {
    let restoreFontMetrics: (() => void) | undefined;
    try {
      const w = pageEl.offsetWidth || pageEl.getBoundingClientRect().width || 794;
      const h = pageEl.offsetHeight || pageEl.getBoundingClientRect().height || 1123;

      if (w < 20 || h < 20) {
        await new Promise(r => setTimeout(r, 150));
        attempts++;
        continue;
      }

      // html2canvas measures baselines in the CALLING document, not in its
      // clone. Keep Tailwind's block-image reset out of those hidden probes.
      restoreFontMetrics = installCanvasFontMetricsReset(document);
      canvas = await html2canvas(pageEl, {
        scale: captureScale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        width: w,
        height: h,
        windowWidth: options.windowWidth ?? ownerWindow.innerWidth ?? 1280,
        windowHeight: options.windowHeight ?? ownerWindow.innerHeight ?? 1024,
        onclone: async (clonedDocument: Document) => {
          // (1) Guarantee the cloned report really has the webfonts. html2canvas
          //     awaits this promise, so the capture cannot race the font load.
          try {
            const status: ReportFontStatus = await ensureReportFonts(clonedDocument, { timeoutMs: 6000 });
            if (!status.ready && !status.unsupported && status.missing.length > 0) {
              console.warn(
                '[ASTRO SIVAM] Preview-exact capture: font(s) unavailable, the fallback glyphs are used:',
                status.missing.join(', ')
              );
            }
          } catch (fontError) {
            console.warn('[ASTRO SIVAM] Font wait failed for the capture clone:', fontError);
          }
          // Refit Birth Jathagam page-2 card text and page-3 Short Summary
          // type with the clone's loaded fonts. Never shrink the whole page
          // or truncate a card's content.
          fitJathagamLifeCardText(clonedDocument);
          fitJathagamSummaryText(clonedDocument);
          // (2) html2canvas creates an internal canvas for CSS linear-gradients.
          //     A very thin gradient rule can have a positive fractional CSS
          //     size (< 0.5px) that rounds to a 0px canvas dimension; calling
          //     createPattern on that canvas throws the group-render error.
          //     Such subpixel gradients are invisible in the final PDF, so omit
          //     only those backgrounds in the cloned capture document.
          const clonedWindow = clonedDocument.defaultView;
          if (!clonedWindow) return;
          const elements = clonedDocument.querySelectorAll<HTMLElement>('*');
          elements.forEach(element => {
            const style = clonedWindow.getComputedStyle(element);
            if (!style.backgroundImage.includes('gradient(')) return;
            const rect = element.getBoundingClientRect();
            if ((rect.width > 0 && rect.width < 1) || (rect.height > 0 && rect.height < 1)) {
              element.style.setProperty('background-image', 'none', 'important');
            }
          });
        }
      });

      if (
        (minimumCaptureWidthPx && canvas.width < minimumCaptureWidthPx) ||
        (minimumCaptureHeightPx && canvas.height < minimumCaptureHeightPx)
      ) {
        throw new Error(
          `Page ${pageNumber + 1} rendered at ${canvas.width} × ${canvas.height}px; ` +
          `print-quality PDFs require at least ${minimumCaptureWidthPx || 0} × ${minimumCaptureHeightPx || 0}px per A4 page.`
        );
      }

      // Compression only — never resolution. Preview emails and direct
      // downloads use the same JPEG quality so fine Tamil/Devanagari strokes
      // remain as crisp as the admin's high-resolution preview export.
      let imgData = canvas.toDataURL('image/jpeg', jpegQuality);

      // Heuristic: a valid A4 JPEG at print density should be >25KB. If it is
      // tiny, the canvas was blank and we should retry.
      if (imgData.length < 25000 && attempts < 2) {
        imgData = '';
        // Do not resize the returned canvas to 0x0. Group renders run many
        // captures back-to-back, and a browser/html2canvas image cache can
        // still hold a reference to the canvas briefly. Reusing that
        // zero-sized canvas as a pattern source throws InvalidStateError.
        // Drop our reference instead and let the browser collect it once the
        // render task has fully unwound.
        canvas = null;
        await new Promise(r => setTimeout(r, 250 + attempts * 150));
        attempts++;
        continue;
      }

      if (pageNumber > 0) {
        doc.addPage('a4', 'portrait');
      }
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'SLOW');
      // Drop the multi-megabyte data URL before the next canvas starts.
      imgData = '';
      success = true;
    } catch (e) {
      console.warn(`html2canvas failed for page ${pageNumber + 1}, attempt ${attempts + 1}`, e);
      attempts++;
      if (attempts >= 3) throw e;
      await new Promise(r => setTimeout(r, 400));
    } finally {
      // Also restore the capture environment on blank-canvas retries / errors.
      restoreFontMetrics?.();
      // Release only our JS reference. Resizing html2canvas's result to 0x0 can
      // invalidate a canvas still temporarily referenced by the browser or
      // html2canvas while the next group member starts.
      canvas = null;
    }
  }

  if (!success) {
    throw new Error(`Failed to render page ${pageNumber + 1} after ${attempts} attempts`);
  }
}

/**
 * Renders a list of ALREADY LAID OUT A4 page elements — i.e. the pages of the
 * live preview iframe the visitor is looking at — into a PDF document.
 *
 * Nothing is re-parsed and nothing is re-fitted: the very same DOM nodes the
 * browser has already painted (fonts loaded, gradients applied, charts drawn)
 * are photographed at print density, so the download is the preview.
 */
export async function renderPageElementsToPdfDoc(
  pages: HTMLElement[],
  options?: HtmlPdfRenderOptions
): Promise<jsPDF> {
  if (!pages || pages.length === 0) {
    throw new Error('No report pages available to render.');
  }
  const resolved = resolveDownloadRenderOptions(options);
  const captureScale = resolved.scale ?? PRINT_CAPTURE_SCALE;
  const jpegQuality = resolved.jpegQuality ?? 0.95;

  const task = async (): Promise<jsPDF> => {
    const ownerDoc = pages[0].ownerDocument || document;
    // The source, the clone AND html2canvas's canvas / font probes must have
    // the same fonts. Those probes live in the calling (parent) document even
    // when the report itself lives in the preview iframe.
    await Promise.all([
      ensureReportFonts(document, { timeoutMs: 7000 }).catch(() => undefined),
      ...(ownerDoc !== document
        ? [ensureReportFonts(ownerDoc, { timeoutMs: 5000 }).catch(() => undefined)]
        : [])
    ]);
    fitJathagamLifeCardText(ownerDoc);
    fitJathagamSummaryText(ownerDoc);
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let idx = 0; idx < pages.length; idx++) {
      await capturePageIntoDoc(doc, pages[idx], {
        captureScale,
        jpegQuality,
        pageNumber: idx,
        windowWidth: ownerDoc.defaultView?.innerWidth,
        windowHeight: ownerDoc.defaultView?.innerHeight,
        minimumCaptureWidthPx: resolved.minimumCaptureWidthPx,
        minimumCaptureHeightPx: resolved.minimumCaptureHeightPx
      });
      await new Promise(r => setTimeout(r, 180));
    }
    return doc;
  };

  return enqueueRender(task);
}

export async function renderHtmlToPdfDoc(
  htmlContent: string,
  options?: HtmlPdfRenderOptions
): Promise<jsPDF> {
  const resolved = resolveDownloadRenderOptions(options);
  const captureScale = resolved.scale ?? PRINT_CAPTURE_SCALE;
  const jpegQuality = resolved.jpegQuality ?? 0.95;

  const task = async (): Promise<jsPDF> => {
    // Reports are complete HTML documents, just like the live srcDoc preview.
    // Keep them in their own document: inserting <html>/<head>/<body> into a
    // div leaked report CSS into the app and inherited Tailwind's line-height,
    // image and table resets, so HTML/email exports could reflow differently.
    const container = document.createElement('iframe');
    container.setAttribute('data-astrosivam-capture', 'report');
    container.setAttribute('aria-hidden', 'true');
    container.setAttribute('sandbox', 'allow-same-origin'); // static report; no scripts
    container.tabIndex = -1;
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '-10000px';
    container.style.width = '210mm';
    container.style.height = '297mm';
    container.style.border = '0';
    container.style.background = '#ffffff';
    container.style.opacity = '1';
    container.style.pointerEvents = 'none';
    const frameReady = new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        container.removeEventListener('load', finish);
        resolve();
      };
      // A blocked image / stylesheet must not hold the download indefinitely.
      const timer = setTimeout(finish, 8000);
      container.addEventListener('load', finish);
    });
    container.srcdoc = htmlContent;
    document.body.appendChild(container);

    try {
      await frameReady;
      const reportDoc = container.contentDocument;
      if (!reportDoc?.body) throw new Error('The report document could not be loaded.');
      // Wait for the report webfonts with a timeout so we never hang forever.
      // `ensureReportFonts` injects the stylesheet itself and waits for the
      // individual faces — plain `document.fonts.ready` resolved before the
      // freshly imported families had even been requested, which is how the
      // capture ended up with fallback glyphs while the preview looked right.
      await ensureReportFonts(document, { timeoutMs: 7000 }).catch(() => null);
      const fontStatus = await ensureReportFonts(reportDoc, { timeoutMs: 7000 }).catch(() => null);
      if (fontStatus && !fontStatus.ready && !fontStatus.unsupported) {
        console.warn(
          '[ASTRO SIVAM] Report fonts unavailable for this capture (the preview would fall back too):',
          fontStatus.missing.join(', ')
        );
      }

      // Ensure all images are fully loaded AND decoded
      const allImages = Array.from(reportDoc.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(
        allImages.map(async (img) => {
          try {
            if (img.complete && img.naturalHeight !== 0) {
              const d = (img as any).decode;
              if (typeof d === 'function') {
                await d.call(img).catch(() => {});
              }
              return;
            }
            await new Promise<void>(resolve => {
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                resolve();
              };
              img.onload = () => {
                const dec = (img as any).decode;
                if (typeof dec === 'function') {
                  dec.call(img).then(finish).catch(finish);
                } else {
                  finish();
                }
              };
              img.onerror = () => finish();
              setTimeout(finish, 2500);
            });
          } catch {
            // Non-fatal: allow render to continue even if an image fails
          }
        })
      );

      // Let the browser paint the final layout (double RAF ensures styles applied)
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const pages = reportDoc.querySelectorAll('.page') as NodeListOf<HTMLElement>;
      if (pages.length === 0) {
        throw new Error('No pages found in HTML export.');
      }

      // The grid-heavy pages (Muhurtham calendar, Birth Jathagam life cards)
      // already budget an exact A4 box, and enlarge/refit only the text inside
      // them. Every page still goes through the sheet fitter: with the pages'
      // `min-height: 297mm` contract it is a no-op while the content fits, and
      // it scales the sheet down if a report ever has more to say than one
      // page — which is what keeps a grown page from being squashed into the
      // 210 × 297 mm image below.
      fitJathagamLifeCardText(reportDoc);
      fitJathagamSummaryText(reportDoc);
      pages.forEach(p => fitPageToA4Element(p));

      // Wait a tick after fitting so transforms are applied
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 80));
      });

      // Create the PDF before capturing pages and add each page immediately.
      //
      // IMPORTANT: do not keep an imgDataList. A print-density A4 canvas is
      // about 36 MB before encoding. Keeping every JPEG data URL until the end left
      // several large UTF-16 strings alive after each report; by member 4 the
      // browser/GPU was under enough pressure that html2canvas returned a fast,
      // degraded capture. Incremental insertion keeps peak memory bounded by
      // ONE page, whether the bundle contains 4, 10, or more reports.
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      for (let idx = 0; idx < pages.length; idx++) {
        await capturePageIntoDoc(doc, pages[idx] as HTMLElement, {
          captureScale,
          jpegQuality,
          pageNumber: idx,
          windowWidth: reportDoc.defaultView?.innerWidth,
          windowHeight: reportDoc.defaultView?.innerHeight,
          minimumCaptureWidthPx: resolved.minimumCaptureWidthPx,
          minimumCaptureHeightPx: resolved.minimumCaptureHeightPx
        });

        // Yield between pages to let the browser GC and keep UI responsive
        await new Promise(r => setTimeout(r, 180));
      }

      return doc;
    } finally {
      try {
        document.body.removeChild(container);
      } catch {}
      // Extra tick for GC after container removal
      await new Promise(r => setTimeout(r, 50));
    }
  };

  // Chain onto global queue so family bundle renders never overlap
  return enqueueRender(task);
}

export async function generatePdfBase64FromHtml(
  htmlContent: string,
  options?: HtmlPdfRenderOptions
): Promise<string> {
  const doc = await renderHtmlToPdfDoc(htmlContent, options);
  const dataUri = doc.output('datauristring');
  const commaIdx = dataUri.indexOf(',');
  return commaIdx !== -1 ? dataUri.substring(commaIdx + 1) : dataUri;
}

/** Reject blank, truncated, or non-PDF captures before they reach email delivery. */
export function assertPreviewQualityPdfBase64(
  pdfBase64: string,
  label: string,
  minimumBytes = 1024
): number {
  const normalized = (pdfBase64 || '').replace(/\s/g, '');
  if (!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`${label} is not a valid PDF capture. Nothing was emailed.`);
  }
  const paddingBytes = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((normalized.length * 3) / 4) - paddingBytes);
  if (byteLength < minimumBytes) {
    throw new Error(`${label} is incomplete (${byteLength} bytes). Nothing was emailed.`);
  }
  return byteLength;
}

/**
 * The failure text an admin sees when a device cannot capture at print density.
 * It names the density, states that nothing left the server, and says what to
 * do next — never a raw html2canvas/canvas error.
 */
export function emailPrintDensityFailureMessage(label: string, error?: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : String(error || '');
  const detail = raw ? ` (${raw.length > 140 ? `${raw.slice(0, 137)}…` : raw})` : '';
  return (
    `${label} could not be rendered at print quality (300 dpi: ${A4_PRINT_MIN_WIDTH_PX} × ` +
    `${A4_PRINT_MIN_HEIGHT_PX} px per A4 page) on this device${detail}. Nothing was emailed and the order ` +
    'is still pending — ASTRO SIVAM never sends a report below 300 dpi. Close other tabs to free memory and ' +
    'retry, or approve this order from a desktop browser.'
  );
}

/**
 * THE email render — every paid document (report, invoice, family member
 * report, multi-person item) goes through this function.
 *
 * It captures at the print density and never below it. The admin's device is
 * irrelevant to the result: 300 dpi from a phone, 300 dpi from a desktop. A
 * capture that fails (usually a phone that cannot allocate the
 * 2540 × 3592 px canvas) is retried ONCE at the SAME density, because canvas
 * pressure is often transient, and then fails closed with the actionable
 * message above. There is no lighter retry step here — that is the whole point.
 */
export async function renderEmailPdfBase64(
  htmlContent: string,
  label: string,
  options?: HtmlPdfRenderOptions
): Promise<string> {
  const renderOptions = options ? resolvePrintRenderOptions(options) : highQualityEmailRenderOptions();
  const maxAttempts = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const pdfBase64 = await generatePdfBase64FromHtml(htmlContent, renderOptions);
      assertPreviewQualityPdfBase64(pdfBase64, label, 8 * 1024);
      return pdfBase64;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await yieldToBrowser();
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
  }

  throw new Error(emailPrintDensityFailureMessage(label, lastError));
}

/**
 * Lets the browser paint pending UI updates before a heavy html2canvas render
 * (~8 s per report). Without this the progress bar would freeze on the first
 * member and the admin would think the family render had hung.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(() => resolve(), 100));
      });
    } else {
      setTimeout(() => resolve(), 150);
    }
  });
}

/**
 * Single source of truth for "which HTML builder renders this order".
 * The single-order live preview and every family member report both call this,
 * so a family bundle can never be rendered by a different (lower quality)
 * code path than a single order.
 */
export function buildOrderReportHtml(order: Order, result: any, lang: AppLanguage): string {
  if (!order || !result) return '';
  if (order.serviceType === 'BIRTH_JATHAGAM') {
    return buildJathagamHtml(result as HoroscopeResult, lang);
  }
  if (order.serviceType === 'MARRIAGE_COMPATIBILITY') {
    return buildWeddingMatchHtml(result as WeddingMatchResult, lang, { orderNumber: order?.orderNumber });
  }
  if (order.serviceType === 'BABY_NAMING') {
    return buildBabyNamingHtml(result as BabyNamingResult, lang);
  }
  if (order.serviceType === 'MUHURTHAM') {
    return buildMuhurthamHtml(result as MuhurthamScanResult, lang);
  }
  return '';
}
export async function generateOrderPdfsBase64(
  order: Order,
  preferredLang?: AppLanguage,
  resultOverride?: any
): Promise<{ reportPdfBase64: string; invoicePdfBase64: string }> {
  const lang = preferredLang || (order.language as AppLanguage) || 'ta';
  let effectiveResult = resultOverride || order.calculatedResult;
  let resolveError = '';
  if (!effectiveResult || resultNeedsRecalculation(order, effectiveResult)) {
    const resolved = await resolveCalculatedResult({ ...order, calculatedResult: effectiveResult } as Order);
    effectiveResult = resolved.result;
    resolveError = resolved.error;
  }
  if (!effectiveResult) {
    throw new Error(
      `The report calculation is not available${resolveError ? `: ${resolveError}` : ''}. ` +
      'Nothing was emailed.'
    );
  }

  const reportHtml = buildOrderReportHtml(order, mergeOrderPayloadIntoResult(order, effectiveResult), lang);
  if (!reportHtml) {
    throw new Error(`No report template exists for ${order.serviceType}. Nothing was emailed.`);
  }
  const invoiceHtml = buildInvoiceHtml({ ...order, language: lang });
  const renderOptions = highQualityEmailRenderOptions();

  // Sequential rendering avoids competing canvas allocations and uses the
  // same density/quality profile as the admin live-preview download.
  const reportPdfBase64 = await renderEmailPdfBase64(reportHtml, 'Report PDF', renderOptions);
  await yieldToBrowser();
  const invoicePdfBase64 = await renderEmailPdfBase64(invoiceHtml, 'Invoice PDF', renderOptions);

  return { reportPdfBase64, invoicePdfBase64 };
}

/** Keeps a download recognisable in the customer's downloads folder. */
export function safeFilePart(value: string, fallback: string): string {
  const cleaned = (value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\u0900-\u0D7F]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export function orderReportFileName(order: Order, lang: AppLanguage): string {
  const service = (order.serviceType || 'REPORT').toLowerCase();
  const who = safeFilePart(
    familyMemberDisplayName(order) || order.userName || order.orderNumber || '',
    'Report'
  );
  return `ASTRO_SIVAM_${service}_${who}_${order.orderNumber || lang}.pdf`;
}

export function orderInvoiceFileName(order: Order): string {
  return `ASTRO_SIVAM_Invoice_${safeFilePart(order.orderNumber || order.id, 'invoice')}.pdf`;
}

/**
 * THE download path: renders the very same HTML string the live preview iframe
 * shows, with the same html2canvas + jsPDF pipeline used for family bundles, so
 * a downloaded report is pixel-identical to the preview instead of the thinner
 * server-side render.
 *
 * There is ONE quality: the print profile. A failed capture is retried at that
 * same density (transient canvas pressure); it never drops to a lighter raster,
 * and there is no server renderer to fall back to.
 */
export async function downloadHtmlPdf(
  htmlContent: string,
  fileName: string,
  options?: HtmlPdfRenderOptions
): Promise<void> {
  if (!htmlContent) throw new Error('Nothing to render — the report HTML is empty.');

  const attempt = resolveDownloadRenderOptions(options);
  let lastError: any = null;
  for (let attemptNumber = 1; attemptNumber <= RENDER_ATTEMPTS; attemptNumber++) {
    try {
      const doc = await renderHtmlToPdfDoc(htmlContent, attempt);
      doc.save(fileName);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Preview-exact PDF render failed at scale ${attempt.scale}; retrying…`, error);
      await yieldToBrowser();
    }
  }
  throw lastError || new Error('PDF rendering failed.');
}

/**
 * Saves a base64 PDF payload under `fileName` with the same browser download
 * behaviour as `doc.save()`. Needed by the customer download because it reuses
 * the emailed document's render helper, which returns bytes rather than a
 * jsPDF document.
 */
export function savePdfBase64AsFile(pdfBase64: string, fileName: string): void {
  const normalized = (pdfBase64 || '').replace(/\s/g, '');
  if (!normalized) throw new Error('The rendered report PDF is empty.');
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a moment to start the download before revoking the URL.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1500);
}

/**
 * THE customer dashboard download: the emailed document, fetched again.
 *
 * The dashboard renders the frozen snapshot through the SAME HTML builders and
 * the SAME print-density capture (`PDF_RENDER_OPTIONS`, 300 dpi, JPEG 0.95
 * with the 2480 × 3508 px floor) that produced the emailed PDF and the admin's
 * approved preview. The server-side mPDF renderer used to be the dashboard's
 * only download, which is why customers saw a thinner, differently paginated
 * document than the one in their email.
 *
 * The bytes come from the same fail-closed helper every paid email uses, at
 * the same print density: there is no lower-quality download path at all.
 * If the device cannot capture at print density, the caller surfaces
 * PDF_CAPTURE_ERROR — nothing lighter is ever downloaded.
 */
export async function downloadPaidReportPdf(
  htmlContent: string,
  fileName: string
): Promise<void> {
  if (!htmlContent) throw new Error('Nothing to render — the report HTML is empty.');
  try {
    // Identical profile, retry policy and quality gate as the emailed report.
    const pdfBase64 = await renderEmailPdfBase64(htmlContent, 'Report PDF');
    savePdfBase64AsFile(pdfBase64, fileName);
  } catch (error) {
    console.error('Print-density report download failed on this device; nothing was saved:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

/**
 * THE download path for the live preview: photographs the page elements of the
 * preview iframe itself — the exact DOM nodes the visitor is looking at — at
 * print density, so the saved PDF cannot differ from what is on screen.
 *
 * Same retry policy as `downloadHtmlPdf`: the same print profile on every
 * attempt, never a lighter capture.
 */
export async function downloadPreviewPagesPdf(
  pages: HTMLElement[],
  fileName: string,
  options?: HtmlPdfRenderOptions
): Promise<void> {
  if (!pages || pages.length === 0) {
    throw new Error('The preview has no rendered report pages yet.');
  }

  const attempt = resolveDownloadRenderOptions(options);
  let lastError: any = null;
  for (let attemptNumber = 1; attemptNumber <= RENDER_ATTEMPTS; attemptNumber++) {
    try {
      const doc = await renderPageElementsToPdfDoc(pages, attempt);
      doc.save(fileName);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Live-preview PDF capture failed at scale ${attempt.scale}; retrying…`, error);
      await yieldToBrowser();
    }
  }
  throw lastError || new Error('PDF rendering failed.');
}

/**
 * Every service exporter below follows the same rule: build the preview HTML in
 * the browser and capture it at print resolution. The server has no PDF
 * renderer any more, so a failed capture throws PDF_CAPTURE_ERROR instead of
 * silently substituting a lower-quality document.
 */
export async function exportJathagamHtmlToPdf(
  result: HoroscopeResult,
  lang: AppLanguage = 'en',
  customFileName?: string
): Promise<void> {
  const fileName =
    customFileName || `ASTRO_SIVAM_Jathagam_${safeFilePart(result.devoteeName || '', 'User')}_${lang}.pdf`;
  try {
    await downloadHtmlPdf(buildJathagamHtml(result, lang), fileName);
  } catch (error) {
    console.error('Jathagam PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportWeddingHtmlToPdf(
  result: WeddingMatchResult,
  lang: AppLanguage = 'en',
  customFileName?: string
): Promise<void> {
  const fileName =
    customFileName ||
    `ASTRO_SIVAM_Matchmaking_${safeFilePart(result.brideName || '', 'Bride')}_${safeFilePart(result.groomName || '', 'Groom')}_${lang}.pdf`;
  try {
    await downloadHtmlPdf(buildWeddingMatchHtml(result, lang), fileName);
  } catch (error) {
    console.error('Marriage compatibility PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportBabyNamingHtmlToPdf(
  result: BabyNamingResult,
  lang: AppLanguage = 'en',
  customFileName?: string
): Promise<void> {
  const baby = result.babyName || (result.gender === 'M' ? 'Baby_Boy' : 'Baby_Girl');
  const fileName = customFileName || `ASTRO_SIVAM_BabyNaming_${safeFilePart(baby, 'Baby')}_${lang}.pdf`;
  try {
    await downloadHtmlPdf(buildBabyNamingHtml(result, lang), fileName);
  } catch (error) {
    console.error('Baby naming PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportMuhurthamHtmlToPdf(
  result: MuhurthamScanResult,
  lang: AppLanguage = 'en',
  customFileName?: string
): Promise<void> {
  const fileName =
    customFileName ||
    `ASTRO_SIVAM_Muhurtham_${safeFilePart(result.eventKey || '', 'muhurtham')}_${safeFilePart(result.devoteeName || '', 'User')}_${lang}.pdf`;
  try {
    await downloadHtmlPdf(buildMuhurthamHtml(result, lang), fileName);
  } catch (error) {
    console.error('Muhurtham PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportInvoiceHtmlToPdf(
  order: Order,
  _lang?: AppLanguage,
  customFileName?: string
): Promise<void> {
  const fileName = customFileName || orderInvoiceFileName(order);
  try {
    // Tax invoices are always the English official document.
    await downloadHtmlPdf(buildInvoiceHtml({ ...order, language: 'en' }), fileName);
  } catch (error) {
    console.error('Invoice PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportOrderInvoicePdf(
  order: Order,
  lang?: AppLanguage,
  customFileName?: string
): Promise<void> {
  return exportInvoiceHtmlToPdf(order, lang, customFileName);
}

export async function exportFamilyInvoiceHtmlToPdf(
  familyOrders: Order[],
  familyGroupId: string,
  customFileName?: string
): Promise<void> {
  const fileName = customFileName || `ASTRO_SIVAM_Family_Invoice_${safeFilePart(familyGroupId, 'FAMILY')}.pdf`;
  try {
    await downloadHtmlPdf(buildFamilyInvoiceHtml(familyOrders, familyGroupId), fileName);
  } catch (error) {
    console.error('Family invoice PDF capture failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

/**
 * Downloads one order's report in preview-exact quality.
 *
 * `resultOverride` lets a caller that has already calculated a fresher result
 * (the order View modal recalculates stale charts on open) pass it in, so the
 * downloaded PDF is built from exactly the data on screen.
 */
export async function exportOrderReportPdf(
  order: Order,
  preferredLang?: AppLanguage,
  resultOverride?: any
): Promise<void> {
  const lang = preferredLang || (order.language as AppLanguage) || 'ta';
  const fileName = orderReportFileName(order, lang);
  const resolved = resultOverride
    ? { result: resultOverride, error: '' }
    : await resolveCalculatedResult(order);
  const html = buildOrderReportHtml(order, mergeOrderPayloadIntoResult(order, resolved.result), lang);
  if (!html) {
    throw new Error(
      resolved.result
        ? `No report template exists for ${order.serviceType}.`
        : resolved.error || 'The report could not be calculated from the saved inputs.'
    );
  }
  try {
    await downloadHtmlPdf(html, fileName);
  } catch (error) {
    console.error('Preview-exact order download failed on this device:', error);
    throw new Error(PDF_CAPTURE_ERROR);
  }
}

export async function exportOrderPdf(
  order: Order,
  preferredLang?: AppLanguage
): Promise<void> {
  return exportOrderReportPdf(order, preferredLang);
}

/* ══════════════════════════════════════════════════════════════════════════
 * FAMILY PACKAGE — high-quality consolidated invoice + per-member reports
 *
 * The family package must be delivered with the EXACT same render quality as
 * the single-order "View" live preview in the admin panel. Everything below
 * reuses the same HTML builders + responsive high-resolution html2canvas/jsPDF
 * pipeline (300 dpi / 2540 × 3592 px per A4 page on every device), never a
 * server-side substitute.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface FamilyReportPdfItem {
  orderId: string;
  orderNumber: string;
  fileName: string;
  pdfBase64: string;
}

export interface FamilyOrderPdfs {
  reportPdfs: FamilyReportPdfItem[];
  invoicePdfBase64: string;
  invoiceFileName: string;
}

export async function generateFamilyInvoicePdfBase64(
  orders: Order[],
  groupId?: string
): Promise<string> {
  const effectiveGroupId = getFamilyGroupId(orders, groupId);
  return renderEmailPdfBase64(
    buildFamilyInvoiceHtml(orders, effectiveGroupId),
    'Family invoice PDF'
  );
}

/**
 * Ensures an order has its calculated astrology result, computing it on the
 * fly through the same calculate-preview API the live preview modal uses.
 * Stale results (older algorithm versions) are recalculated too, exactly like
 * the single-order live preview does.
 *
 * When no result can be resolved, `error` carries the concrete reason (for
 * example the server's "the saved birth date, time, place, coordinates, or
 * time zone are incomplete" message) so the skip/abort the operator sees says
 * WHAT to fix on the order instead of a generic "no results available".
 */
export interface ResolvedOrderResult {
  result: any;
  error: string;
}

export async function resolveCalculatedResult(order: Order): Promise<ResolvedOrderResult> {
  const needsRecalculation = resultNeedsRecalculation(order, order.calculatedResult);
  if (order.calculatedResult && !needsRecalculation) return { result: order.calculatedResult, error: '' };
  // A stale result is never a fallback when its original input is unavailable.
  if (!order.inputPayload) {
    return {
      result: null,
      error: 'the saved chart is outdated and the saved birth particulars are missing, so it cannot be recalculated'
    };
  }
  try {
    const { api } = await import('./api');
    const res = await api.calculateService(
      orderChartServiceType(order),
      canonicalCalculationPayload(order.inputPayload)
    );
    if (res.success && res.result && !resultNeedsRecalculation(order, res.result)) {
      return { result: res.result, error: '' };
    }
    return {
      result: null,
      error: res.message || 'the recalculated chart was rejected as inconsistent with the saved birth inputs'
    };
  } catch (e) {
    console.warn('Failed to calculate result for family member report; the stale result will not be used:', e);
    return { result: null, error: e instanceof Error ? e.message : 'the calculation request failed' };
  }
}

/** Progress report emitted while a family bundle is rendered member by member. */
export interface FamilyRenderProgress {
  /** calculating = fetching/refreshing the chart, rendering = html2canvas, uploading = staging the PDF */
  phase: 'calculating' | 'rendering' | 'uploading' | 'invoice' | 'done';
  index: number;
  total: number;
  memberName: string;
  orderNumber: string;
  message: string;
  bytes?: number;
  elapsedMs?: number;
}

export type FamilyRenderProgressCallback = (progress: FamilyRenderProgress) => void;

export interface FamilyStagingResult {
  /**
   * 'staged'  - every document was uploaded with its own request (the normal
   *             path; the approve call then only carries metadata).
   * 'inline'  - small legacy bundles use a bounded base64 payload; larger
   *             bundles fail closed if the staging endpoint is unavailable.
   */
  mode: 'staged' | 'inline';
  stagedReports: number;
  stagedInvoice: boolean;
  stagedBytes: number;
  skipped: Array<{ orderNumber: string; memberName: string; reason: string }>;
  warnings: string[];
  /** Only populated when mode === 'inline' (or for documents that failed to stage). */
  reportPdfs: FamilyReportPdfItem[];
  invoicePdfBase64: string;
  invoiceFileName: string;
}

const FAMILY_RENDER_HINT_SECONDS = 8;
const MAX_FAMILY_INLINE_BYTES = 5 * 1024 * 1024;

/**
 * Renders a whole family bundle in live-preview quality the SAME way the admin
 * panel renders a single order: one report at a time, with each finished PDF
 * uploaded immediately, then the consolidated family invoice.
 *
 * Uploading one document per request avoids request-body limits. Render or
 * upload failures are retried and then fail closed; the backend never replaces
 * a missing preview render with a lower-quality server-side PDF.
 */
export async function stageFamilyOrderPdfs(
  orders: Order[],
  groupId?: string,
  onProgress?: FamilyRenderProgressCallback,
  options?: { preferredLang?: AppLanguage; stagingAudience?: 'admin' | 'customer' }
): Promise<FamilyStagingResult> {
  const { api } = await import('./api');

  const effectiveGroupId = getFamilyGroupId(orders, groupId);
  const stageDocument = (doc: Parameters<typeof api.stageFamilyDoc>[1]) =>
    options?.stagingAudience === 'customer'
      ? api.stageCustomerFamilyDoc(effectiveGroupId, doc)
      : api.stageFamilyDoc(effectiveGroupId, doc);
  const clearStagedScope = () => options?.stagingAudience === 'customer'
    ? api.clearCustomerFamilyStagedDocs(effectiveGroupId)
    : api.clearFamilyStagedDocs(effectiveGroupId);
  const sorted = [...orders].sort(
    (a, b) => ((a as any).groupOrderIndex ?? 0) - ((b as any).groupOrderIndex ?? 0)
  );
  const total = sorted.length;

  const result: FamilyStagingResult = {
    mode: 'staged',
    stagedReports: 0,
    stagedInvoice: false,
    stagedBytes: 0,
    skipped: [],
    warnings: [],
    reportPdfs: [],
    invoicePdfBase64: '',
    invoiceFileName: `ASTRO_SIVAM_Family_Invoice_${effectiveGroupId}.pdf`
  };

  const base64ToBytes = (b64: string) => Math.round((b64.length * 3) / 4);
  const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
  const renderOptions = highQualityEmailRenderOptions();

  // A group id is reused on retries. Never merge this render with files left
  // by an interrupted earlier attempt, for either an admin or customer resend.
  await clearStagedScope();

  const retryStage = async (
    doc: Parameters<typeof api.stageFamilyDoc>[1],
    initial: Awaited<ReturnType<typeof api.stageFamilyDoc>>
  ) => {
    let response = initial;
    for (let attempt = 1; attempt < 3 && !response.staged && !response.unsupported; attempt++) {
      await new Promise(r => setTimeout(r, 600 * attempt));
      response = await stageDocument(doc);
    }
    return response;
  };

  for (let i = 0; i < total; i++) {
    const order = sorted[i];
    const memberName = familyMemberDisplayName(order);
    const lang = (options?.preferredLang || (order.language as AppLanguage) || 'ta');
    const startedAt = Date.now();

    onProgress?.({
      phase: 'calculating',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      message: `Preparing ${memberName}'s chart (${i + 1} of ${total})...`
    });

    const resolved = await resolveCalculatedResult(order);
    const reportHtml = buildOrderReportHtml(
      order,
      mergeOrderPayloadIntoResult(order, resolved.result),
      lang
    );

    if (!reportHtml) {
      // Say exactly WHY: a missing template vs. a birth-data problem, with the
      // server's message when the recalculation rejected the saved inputs.
      const reason = resolved.result
        ? `no report template exists for service type ${order.serviceType}`
        : `no calculated astrology result available for this member: ` +
          `${resolved.error || 'the saved chart and birth particulars could not be resolved'} ` +
          "- verify this member's saved birth date, time, place, coordinates and time zone on the order";
      result.skipped.push({ orderNumber: order.orderNumber, memberName, reason });
      result.warnings.push(`#${order.orderNumber} (${memberName}) was skipped: ${reason}.`);
      continue;
    }

    onProgress?.({
      phase: 'rendering',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      message: `Rendering high-quality report for ${memberName} (${i + 1} of ${total}) - about ${FAMILY_RENDER_HINT_SECONDS}s...`
    });
    await yieldToBrowser();
    await new Promise(r => setTimeout(r, 300));

    const safeName = memberName.replace(/[^a-zA-Z0-9_\u0900-\u0D7F]/g, '_');
    const fileName = `ASTRO_SIVAM_Report_${order.orderNumber}_${safeName}_${lang}.pdf`;

    let pdfBase64 = '';
    let renderAttempts = 0;
    let finalRenderMs = 0;
    while (renderAttempts < 3) {
      const renderStart = Date.now();
      pdfBase64 = await renderEmailPdfBase64(reportHtml, `Report PDF for ${order.orderNumber}`, renderOptions);
      const renderMs = Date.now() - renderStart;
      finalRenderMs = renderMs;
      const b = base64ToBytes(pdfBase64);
      const isTooSmall = b < 120 * 1024;
      const isTooFast = renderMs < 1200 && b < 300 * 1024;

      if ((isTooSmall || isTooFast) && renderAttempts < 2) {
        console.warn(
          `Report for ${memberName} looks low-quality (bytes=${b}, ms=${renderMs}), retrying...`
        );
        onProgress?.({
          phase: 'rendering',
          index: i + 1,
          total,
          memberName,
          orderNumber: order.orderNumber,
          message: `Low-quality capture detected for ${memberName}, retrying high-quality render...`
        });
        await new Promise(r => setTimeout(r, 800 + renderAttempts * 500));
        renderAttempts++;
        continue;
      }
      break;
    }

    const bytes = base64ToBytes(pdfBase64);
    const elapsedMs = Date.now() - startedAt;

    if (bytes < 120 * 1024 || (finalRenderMs < 1200 && bytes < 300 * 1024)) {
      const reason = `rendered PDF failed the high-quality check (${mb(bytes)}, ${(finalRenderMs / 1000).toFixed(1)}s)`;
      result.skipped.push({ orderNumber: order.orderNumber, memberName, reason });
      result.warnings.push(`#${order.orderNumber} (${memberName}) was not staged: ${reason}.`);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    onProgress?.({
      phase: 'uploading',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      bytes,
      elapsedMs,
      message: `Uploading ${memberName}'s ${mb(bytes)} report (rendered in ${(elapsedMs / 1000).toFixed(1)}s)...`
    });
    await yieldToBrowser();

    let stageRes = await stageDocument({
      kind: 'report',
      orderId: order.id,
      orderNumber: order.orderNumber,
      fileName,
      pdfBase64
    });
    if (!stageRes.staged && !stageRes.unsupported) {
      stageRes = await retryStage({
        kind: 'report', orderId: order.id, orderNumber: order.orderNumber, fileName, pdfBase64
      }, stageRes);
    }

    if (stageRes.success && stageRes.staged) {
      result.stagedReports++;
      result.stagedBytes += stageRes.sizeBytes || bytes;
    } else {
      if (stageRes.unsupported && total > 2) {
        await clearStagedScope().catch(() => undefined);
        throw new Error(
          'The preview-PDF upload endpoint is unavailable for this family bundle. ' +
          'Nothing was emailed; install the current API staging routes and retry.'
        );
      }
      if (stageRes.unsupported) {
        result.mode = 'inline';
      }
      const reason = stageRes.message || 'staging endpoint rejected the document';
      result.warnings.push(`#${order.orderNumber} (${memberName}): ${reason}`);
      result.reportPdfs.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        fileName,
        pdfBase64
      });
    }

    onProgress?.({
      phase: 'rendering',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      bytes,
      elapsedMs: Date.now() - startedAt,
      message: `${memberName}'s report ready (${i + 1} of ${total}) - ${mb(bytes)}.`
    });

    await new Promise(r => setTimeout(r, 700));
    await yieldToBrowser();
  }

  onProgress?.({
    phase: 'invoice',
    index: total,
    total,
    memberName: 'Family invoice',
    orderNumber: effectiveGroupId,
    message: `Rendering the consolidated family tax invoice for ${total} user(s)...`
  });
  await yieldToBrowser();
  await new Promise(r => setTimeout(r, 400));

  const invoiceHtml = buildFamilyInvoiceHtml(sorted, effectiveGroupId);

  let invoicePdfBase64 = '';
  let invAttempts = 0;
  let finalInvoiceMs = 0;
  while (invAttempts < 3) {
    const invStart = Date.now();
    invoicePdfBase64 = await renderEmailPdfBase64(invoiceHtml, 'Family invoice PDF', renderOptions);
    const invMs = Date.now() - invStart;
    finalInvoiceMs = invMs;
    const invBytes = base64ToBytes(invoicePdfBase64);
    const tooSmall = invBytes < 80 * 1024;
    const tooFast = invMs < 800 && invBytes < 200 * 1024;
    if ((tooSmall || tooFast) && invAttempts < 2) {
      console.warn(`Family invoice low-quality (bytes=${invBytes}, ms=${invMs}), retrying...`);
      await new Promise(r => setTimeout(r, 600 + invAttempts * 400));
      invAttempts++;
      continue;
    }
    break;
  }

  const invoiceBytes = base64ToBytes(invoicePdfBase64);
  if (invoiceBytes < 80 * 1024 || (finalInvoiceMs < 800 && invoiceBytes < 200 * 1024)) {
    throw new Error(
      `The consolidated invoice failed the high-quality render check (${mb(invoiceBytes)}, ${(finalInvoiceMs / 1000).toFixed(1)}s). ` +
      'Nothing was emailed. Please retry; the already-staged partial run will be replaced.'
    );
  }

  let invoiceStageRes = await stageDocument({
    kind: 'invoice',
    fileName: result.invoiceFileName,
    pdfBase64: invoicePdfBase64
  });
  if (!invoiceStageRes.staged && !invoiceStageRes.unsupported) {
    invoiceStageRes = await retryStage({
      kind: 'invoice', fileName: result.invoiceFileName, pdfBase64: invoicePdfBase64
    }, invoiceStageRes);
  }

  if (invoiceStageRes.success && invoiceStageRes.staged) {
    result.stagedInvoice = true;
    result.stagedBytes += invoiceStageRes.sizeBytes || invoiceBytes;
  } else {
    if (invoiceStageRes.unsupported && total > 2) {
      await clearStagedScope().catch(() => undefined);
      throw new Error(
        'The preview-PDF upload endpoint is unavailable for this family bundle. ' +
        'Nothing was emailed; install the current API staging routes and retry.'
      );
    }
    if (invoiceStageRes.unsupported) {
      result.mode = 'inline';
    }
    result.warnings.push(
      `Consolidated family invoice: ${invoiceStageRes.message || 'could not be staged'}`
    );
    result.invoicePdfBase64 = invoicePdfBase64;
  }

  if (result.reportPdfs.length > 0 || result.invoicePdfBase64) {
    const inlineBytes =
      result.reportPdfs.reduce((sum, r) => sum + base64ToBytes(r.pdfBase64), 0) +
      (result.invoicePdfBase64 ? base64ToBytes(result.invoicePdfBase64) : 0);
    if (inlineBytes > MAX_FAMILY_INLINE_BYTES) {
      await clearStagedScope().catch(() => undefined);
      throw new Error(
        `${mb(inlineBytes)} of preview-quality PDFs could not be staged and will exceed the safe request limit. ` +
        'Nothing was emailed; restore the document-upload route and retry.'
      );
    }
    if (result.mode === 'staged') {
      result.mode = result.stagedReports > 0 || result.stagedInvoice ? 'staged' : 'inline';
    }
  }

  onProgress?.({
    phase: 'done',
    index: total,
    total,
    memberName: 'Family package',
    orderNumber: effectiveGroupId,
    message: `Preview-quality rendering complete: ${result.stagedReports + result.reportPdfs.length} report(s) + 1 invoice (${mb(
      result.stagedBytes
    )}).`
  });

  return result;
}



/**
 * Renders the FULL family package client-side in live-preview quality:
 * one high-resolution report PDF per member + ONE consolidated family tax
 * invoice, all produced from the exact same HTML the admin live preview shows.
 *
 * Kept for the inline (single-body) delivery path and for callers that only
 * need the documents locally; `stageFamilyOrderPdfs` is the preferred pipeline
 * because it uploads each PDF separately and therefore never hits the server's
 * request-body limit.
 */
export async function generateFamilyOrderPdfsBase64(
  orders: Order[],
  groupId?: string,
  onProgress?: FamilyRenderProgressCallback,
  options?: { preferredLang?: AppLanguage }
): Promise<FamilyOrderPdfs> {
  const effectiveGroupId = getFamilyGroupId(orders, groupId);
  const sorted = [...orders].sort(
    (a, b) => ((a as any).groupOrderIndex ?? 0) - ((b as any).groupOrderIndex ?? 0)
  );
  const total = sorted.length;
  const reportPdfs: FamilyReportPdfItem[] = [];
  const renderOptions = highQualityEmailRenderOptions();

  for (let i = 0; i < total; i++) {
    const order = sorted[i];
    const memberName = familyMemberDisplayName(order);
    const lang = (options?.preferredLang || (order.language as AppLanguage) || 'ta');
    const startedAt = Date.now();

    onProgress?.({
      phase: 'calculating',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      message: `Preparing ${memberName}'s chart (${i + 1} of ${total})...`
    });

    const resolved = await resolveCalculatedResult(order);
    const reportHtml = buildOrderReportHtml(
      order,
      mergeOrderPayloadIntoResult(order, resolved.result),
      lang
    );

    if (!reportHtml) {
      throw new Error(
        `No preview-quality report is available for ${order.orderNumber}` +
        (resolved.error ? ` (${resolved.error})` : '') +
        `. Nothing was emailed.`
      );
    }

    onProgress?.({
      phase: 'rendering',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      message: `Rendering high-quality report for ${memberName} (${i + 1} of ${total}) - about ${FAMILY_RENDER_HINT_SECONDS}s...`
    });
    await yieldToBrowser();
    await new Promise(r => setTimeout(r, 300));

    const safeName = memberName.replace(/[^a-zA-Z0-9_\u0900-\u0D7F]/g, '_');
    const fileName = `ASTRO_SIVAM_Report_${order.orderNumber}_${safeName}_${lang}.pdf`;

    // Quality-validated sequential render
    let pdfBase64 = '';
    let attempts = 0;
    let finalRenderMs = 0;
    while (attempts < 3) {
      const s = Date.now();
      pdfBase64 = await renderEmailPdfBase64(reportHtml, `Report PDF for ${order.orderNumber}`, renderOptions);
      const ms = Date.now() - s;
      finalRenderMs = ms;
      const b = Math.round((pdfBase64.length * 3) / 4);
      if ((b < 120 * 1024 || (ms < 1200 && b < 300 * 1024)) && attempts < 2) {
        await new Promise(r => setTimeout(r, 700 + attempts * 400));
        attempts++;
        continue;
      }
      break;
    }
    const finalReportBytes = Math.round((pdfBase64.length * 3) / 4);
    if (finalReportBytes < 120 * 1024 || (finalRenderMs < 1200 && finalReportBytes < 300 * 1024)) {
      throw new Error(
        `The preview-quality report for ${order.orderNumber} failed validation. Nothing was emailed.`
      );
    }

    reportPdfs.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      fileName,
      pdfBase64
    });

    onProgress?.({
      phase: 'rendering',
      index: i + 1,
      total,
      memberName,
      orderNumber: order.orderNumber,
      bytes: Math.round((pdfBase64.length * 3) / 4),
      elapsedMs: Date.now() - startedAt,
      message: `${memberName}'s report rendered (${i + 1} of ${total}).`
    });
    await new Promise(r => setTimeout(r, 600));
    await yieldToBrowser();
  }

  const invoiceHtml = buildFamilyInvoiceHtml(sorted, effectiveGroupId);
  let invoicePdfBase64 = '';
  let invAttempts = 0;
  let finalInvoiceMs = 0;
  while (invAttempts < 3) {
    const s = Date.now();
    invoicePdfBase64 = await renderEmailPdfBase64(invoiceHtml, 'Family invoice PDF', renderOptions);
    const ms = Date.now() - s;
    finalInvoiceMs = ms;
    const b = Math.round((invoicePdfBase64.length * 3) / 4);
    if ((b < 80 * 1024 || (ms < 800 && b < 200 * 1024)) && invAttempts < 2) {
      await new Promise(r => setTimeout(r, 600 + invAttempts * 400));
      invAttempts++;
      continue;
    }
    break;
  }
  const finalInvoiceBytes = Math.round((invoicePdfBase64.length * 3) / 4);
  if (finalInvoiceBytes < 80 * 1024 || (finalInvoiceMs < 800 && finalInvoiceBytes < 200 * 1024)) {
    throw new Error('The preview-quality family invoice failed validation. Nothing was emailed.');
  }
  const invoiceFileName = `ASTRO_SIVAM_Family_Invoice_${effectiveGroupId}.pdf`;

  return { reportPdfs, invoicePdfBase64, invoiceFileName };
}

/** Payload accepted by api.approveFamilyOrder / api.resendFamilyEmail. */
export interface FamilyFulfilPayloadPreparation {
  payload: {
    useStagedDocs?: boolean;
    stagedReports?: number;
    stagedInvoice?: boolean;
    stagedBytes?: number;
    reportPdfs?: FamilyReportPdfItem[];
    invoicePdfBase64?: string;
    language: string;
    requirePreviewQuality: true;
  };
  staging: FamilyStagingResult;
  memberCount: number;
}

/**
 * One-call helper shared by every "approve / send family email" button (admin
 * order list, family card, order View modal and the live PDF preview): renders
 * each member report + the consolidated invoice in live-preview quality,
 * uploads them one document per request, and returns the small payload the
 * approval endpoint needs.
 *
 * Small legacy bundles may use a bounded inline payload when the staging route
 * is absent. Nothing is ever downgraded: a document that cannot be captured in
 * the browser fails the send instead of being replaced by a server render.
 */
export async function prepareFamilyFulfilPayload(
  orders: Order[],
  groupId?: string,
  onProgress?: FamilyRenderProgressCallback,
  options?: { preferredLang?: AppLanguage; stagingAudience?: 'admin' | 'customer' }
): Promise<FamilyFulfilPayloadPreparation> {
  const staging = await stageFamilyOrderPdfs(orders, groupId, onProgress, options);
  const language = (options?.preferredLang ||
    (orders[0]?.language as AppLanguage) ||
    'ta') as string;

  // All-or-nothing fulfilment: never call approve when member 4 (or any later
  // member) failed capture/upload. The old partial-success behaviour let the
  // backend silently substitute a lower-quality server report, which is why a
  // 4+ member package looked inconsistent. This invariant is independent of N.
  const readyReports = staging.stagedReports + staging.reportPdfs.length;
  const invoiceReady = staging.stagedInvoice || !!staging.invoicePdfBase64;
  if (staging.skipped.length > 0 || readyReports !== orders.length || !invoiceReady) {
    const details = staging.warnings.length ? ` ${staging.warnings.join(' ')}` : '';
    throw new Error(
      `Family package is not complete (${readyReports}/${orders.length} high-quality reports, invoice ${invoiceReady ? 'ready' : 'missing'}). ` +
      `Nothing was emailed; retry the render.${details}`
    );
  }

  if (staging.stagedReports > 0 || staging.stagedInvoice) {
    return {
      payload: {
        useStagedDocs: true,
        stagedReports: staging.stagedReports,
        stagedInvoice: staging.stagedInvoice,
        stagedBytes: staging.stagedBytes,
        language,
        requirePreviewQuality: true,
        // Documents that could not be staged still travel inline.
        ...(staging.reportPdfs.length > 0 ? { reportPdfs: staging.reportPdfs } : {}),
        ...(staging.invoicePdfBase64 ? { invoicePdfBase64: staging.invoicePdfBase64 } : {})
      },
      staging,
      memberCount: orders.length
    };
  }

  return {
    payload: {
      reportPdfs: staging.reportPdfs,
      invoicePdfBase64: staging.invoicePdfBase64,
      language,
      requirePreviewQuality: true
    },
    staging,
    memberCount: orders.length
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * SINGLE ORDER — same protection as the family pipeline
 *
 * A single order usually fits in one request body; unusually large reports or
 * invoices are staged one document per request. If staging still fails and the
 * remaining inline payload exceeds the safe request limit, fulfillment aborts
 * before anything is emailed (the server has no renderer to fall back to).
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Combined report + invoice size (decoded PDF bytes) above which a single order
 * is uploaded document-by-document. Inline, the approve body is ~4/3 of this
 * (base64) - about 6.7 MB at the limit. The server reads delivery bodies with
 * ASTRO_DOCUMENT_JSON_MAX_BYTES (api/request_body.php, 64 MiB); keep this well
 * below it (tests/admin-report-delivery.test.ts enforces that). The ordinary
 * 1 MiB JSON cap in config.php's getJsonBody() must never be used for these
 * routes again: it silently emptied every preview-quality delivery body.
 */
export const SINGLE_ORDER_INLINE_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * Keeps a single order's delivery inside the server's request-body limit.
 * Small PDFs remain inline; large PDFs are staged individually, and an
 * oversized unstaged payload throws instead of being silently discarded.
 */
export async function deliverOrderPdfPayload(
  order: Order,
  payload: { reportPdfBase64: string; invoicePdfBase64: string; language?: string },
  options?: { stagingAudience?: 'admin' | 'customer' }
): Promise<{
  reportPdfBase64?: string;
  invoicePdfBase64?: string;
  language?: string;
  useStagedDocs?: boolean;
  stagedDocs?: number;
  requirePreviewQuality: true;
}> {
  const reportBytes = assertPreviewQualityPdfBase64(payload.reportPdfBase64, 'Report PDF', 8 * 1024);
  const invoiceBytes = assertPreviewQualityPdfBase64(payload.invoicePdfBase64, 'Invoice PDF', 8 * 1024);
  const approxBytes = reportBytes + invoiceBytes;

  if (approxBytes <= SINGLE_ORDER_INLINE_LIMIT_BYTES) {
    return { ...payload, requirePreviewQuality: true };
  }

  const { api } = await import('./api');
  const stageOrderDocument = (doc: Parameters<typeof api.stageOrderDoc>[1]) =>
    options?.stagingAudience === 'customer'
      ? api.stageCustomerOrderDoc(order.id, doc)
      : api.stageOrderDoc(order.id, doc);
  const clearOrderScope = () => options?.stagingAudience === 'customer'
    ? api.clearCustomerOrderStagedDocs(order.id)
    : api.clearOrderStagedDocs(order.id);
  const stageWithRetry = async (doc: Parameters<typeof api.stageOrderDoc>[1]) => {
    let response = await stageOrderDocument(doc);
    for (let attempt = 1; attempt < 3 && !response.staged && !response.unsupported; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 600 * attempt));
      response = await stageOrderDocument(doc);
    }
    return response;
  };

  // Reused order ids can have leftovers from a prior partial attempt. Clearing
  // this scope first prevents an older staged PDF from winning a resend retry.
  await clearOrderScope();

  const reportRes = await stageWithRetry({
    kind: 'report',
    orderId: order.id,
    orderNumber: order.orderNumber,
    fileName: `ASTRO_SIVAM_Report_${order.orderNumber}.pdf`,
    pdfBase64: payload.reportPdfBase64
  });
  const invoiceRes = await stageWithRetry({
    kind: 'invoice',
    fileName: `ASTRO_SIVAM_Invoice_${order.orderNumber}.pdf`,
    pdfBase64: payload.invoicePdfBase64
  });
  const reportStaged = reportRes.success && reportRes.staged;
  const invoiceStaged = invoiceRes.success && invoiceRes.staged;
  const stagedDocs = Number(reportStaged) + Number(invoiceStaged);
  const inlineBytes = (reportStaged ? 0 : reportBytes) + (invoiceStaged ? 0 : invoiceBytes);

  if (inlineBytes > SINGLE_ORDER_INLINE_LIMIT_BYTES) {
    await clearOrderScope().catch(() => undefined);
    throw new Error(
      'The preview-quality PDFs could not be uploaded and exceed the safe request limit. ' +
      'Nothing was emailed; restore the document-upload route and retry.'
    );
  }

  return {
    language: payload.language,
    useStagedDocs: stagedDocs > 0,
    stagedDocs,
    requirePreviewQuality: true,
    ...(reportStaged ? {} : { reportPdfBase64: payload.reportPdfBase64 }),
    ...(invoiceStaged ? {} : { invoicePdfBase64: payload.invoicePdfBase64 })
  };
}
