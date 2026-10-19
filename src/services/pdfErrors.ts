/**
 * The ONE message a device gets when the browser cannot capture a PDF at print
 * density. There is no server-side renderer any more, so this is never replaced
 * by a lower-quality server document: the operator/customer is told instead.
 *
 * Deliberately its own tiny module: the dashboard compares against this string
 * on every download, and importing it must never pull the PDF engine (jspdf +
 * html2canvas, ~780 KB) into a page that is merely being read.
 */
export const PDF_CAPTURE_ERROR =
  'The PDF could not be rendered at print quality on this device. Please retry, or open this page in a desktop browser.';
