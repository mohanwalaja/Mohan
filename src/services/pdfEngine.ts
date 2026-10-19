/**
 * DEFERRED PDF ENGINE LOADER (audit PERF-1 — "the system loads only on click").
 *
 * The PDF engine is `jspdf` + `html2canvas` plus their raster helpers: one
 * `vendor-pdf` chunk of ~780 KB raw. It is a FEATURE, not part of any page, so
 * no module may import `./jathagamPdfExporter` statically. Every caller — the
 * sample download, the customer dashboard download, the admin preview download
 * and the approve/resend send — awaits `loadPdfEngine()` inside the click
 * handler that actually produces a PDF.
 *
 * Consequences, all intentional:
 *
 *   * opening the home page, a service page, a sample report or the dashboard
 *     downloads no PDF code at all;
 *   * the first click fetches the engine (a "Downloading…" state is already on
 *     screen), and the cached promise makes every later click instant;
 *   * `import()` here is a single, shared cache — two click paths cannot fetch
 *     the engine twice.
 *
 * tests/initial-js-budget.test.ts fails if any page/component imports the
 * exporter statically again, or if the built entry preloads `vendor-pdf`.
 */
export type PdfEngine = typeof import('./jathagamPdfExporter');

let enginePromise: Promise<PdfEngine> | null = null;

/** Fetches (once per tab) the browser PDF engine. Call from a click handler. */
export function loadPdfEngine(): Promise<PdfEngine> {
  if (!enginePromise) {
    enginePromise = import('./jathagamPdfExporter');
  }
  return enginePromise;
}
