/**
 * Test-only PDF fixtures shaped exactly like the admin panel's browser output.
 *
 * The admin panel rasterises each A4 page with html2canvas and hands the JPEG
 * to jsPDF (see src/services/jathagamPdfExporter.ts). These fixtures go through
 * the SAME jsPDF code path - one full-page JPEG per page - so the server sees
 * the real object layout (/Subtype /Image /Width 1985 /Height 2807 /DCTDecode,
 * one image per page, %%EOF trailer).
 *
 * Node has no canvas, so the JPEG is synthetic: a valid SOI/APP0/DQT/SOF0/SOS
 * header with the requested pixel size followed by deterministic filler scan
 * data. jsPDF and the server's quality gate read the headers and dictionary,
 * never the pixels, so this is a faithful stand-in. The default sizes put a
 * 3-page report at ~1.8 MB, matching the "~2 MB per report" the real renderer
 * produces.
 */
import { createHash } from 'node:crypto';
import { jsPDF } from 'jspdf';

/** Device pixels the browser renderer captures per A4 page (300 dpi / 2480x3508 minimum). */
export const PREVIEW_PAGE_WIDTH = 2540;
export const PREVIEW_PAGE_HEIGHT = 3592;

export function syntheticJpeg(width: number, height: number, scanBytes: number, seed = 1): Uint8Array {
  const app0 = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const dqt = [0xff, 0xdb, 0x00, 0x43, 0x00, ...Array.from({ length: 64 }, (_, i) => 1 + (i % 16))];
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00
  ];
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00];
  const out = new Uint8Array(app0.length + dqt.length + sof0.length + sos.length + scanBytes + 2);
  let offset = 0;
  for (const part of [app0, dqt, sof0, sos]) {
    out.set(part, offset);
    offset += part.length;
  }
  // xorshift32 filler; 0xFF would start a marker inside the scan, so avoid it.
  let x = (seed >>> 0) || 1;
  for (let i = 0; i < scanBytes; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    const byte = x & 0xff;
    out[offset++] = byte === 0xff ? 0xfe : byte;
  }
  out[offset++] = 0xff;
  out[offset++] = 0xd9;
  return out;
}

export interface PreviewPdfOptions {
  pages?: number;
  width?: number;
  height?: number;
  /** JPEG scan bytes per page; ~600 KB matches a real report page. */
  scanBytesPerPage?: number;
  seed?: number;
}

/** A jsPDF document with one full-page JPEG per A4 page, as base64 (no data: prefix). */
export function buildPreviewPdfBase64(options: PreviewPdfOptions = {}): string {
  const {
    pages = 3,
    width = PREVIEW_PAGE_WIDTH,
    height = PREVIEW_PAGE_HEIGHT,
    scanBytesPerPage = 600 * 1024,
    seed = 1
  } = options;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();
    doc.addImage(syntheticJpeg(width, height, scanBytesPerPage, seed * 1000 + page), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return doc.output('datauristring').split(',')[1];
}

export function sha256OfBase64(base64: string): string {
  return createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
}

export function binaryBytesOfBase64(base64: string): number {
  return Buffer.from(base64, 'base64').length;
}
