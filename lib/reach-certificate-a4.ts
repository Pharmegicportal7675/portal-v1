/** A4 at 96 CSS px — matches browser print and jsPDF portrait A4 aspect ratio. */
export const REACH_CERT_A4_WIDTH_PX = 794;
export const REACH_CERT_A4_HEIGHT_PX = 1123;

/** ISO A4 (portrait). */
export const REACH_CERT_A4_WIDTH_MM = 210;
export const REACH_CERT_A4_HEIGHT_MM = 297;

/** Inner page margin — 50px @ 96dpi ≈ 13.23mm (screen / PDF preview). */
export const REACH_CERT_A4_PADDING_PX = 50;
export const REACH_CERT_A4_PADDING_BOTTOM_PX = 60;
export const REACH_CERT_A4_PADDING_MM = 13.23;

/**
 * Tighter inset for browser print so the lime frame and footer stay inside the
 * printer non-printable area. Bottom needs extra room (HP / Ink Tank, etc.).
 */
export const REACH_CERT_A4_PRINT_PADDING_TOP_MM = 10;
export const REACH_CERT_A4_PRINT_PADDING_X_MM = 10;
export const REACH_CERT_A4_PRINT_PADDING_BOTTOM_MM = 14;

/** @deprecated Use side-specific print padding constants */
export const REACH_CERT_A4_PRINT_PADDING_MM = REACH_CERT_A4_PRINT_PADDING_TOP_MM;

export const REACH_CERT_A4_CSS_VARS = {
  '--reach-a4-width': `${REACH_CERT_A4_WIDTH_PX}px`,
  '--reach-a4-height': `${REACH_CERT_A4_HEIGHT_PX}px`,
  '--reach-a4-width-mm': `${REACH_CERT_A4_WIDTH_MM}mm`,
  '--reach-a4-height-mm': `${REACH_CERT_A4_HEIGHT_MM}mm`,
  '--reach-a4-padding': `${REACH_CERT_A4_PADDING_PX}px`,
  '--reach-a4-padding-bottom': `${REACH_CERT_A4_PADDING_BOTTOM_PX}px`,
  '--reach-a4-padding-mm': `${REACH_CERT_A4_PADDING_MM}mm`,
  '--reach-a4-print-padding-mm': `${REACH_CERT_A4_PRINT_PADDING_TOP_MM}mm`,
  '--reach-a4-print-padding-top-mm': `${REACH_CERT_A4_PRINT_PADDING_TOP_MM}mm`,
  '--reach-a4-print-padding-x-mm': `${REACH_CERT_A4_PRINT_PADDING_X_MM}mm`,
  '--reach-a4-print-padding-bottom-mm': `${REACH_CERT_A4_PRINT_PADDING_BOTTOM_MM}mm`,
} as const;

export function applyReachCertificateA4Size(element: HTMLElement): void {
  element.style.width = `${REACH_CERT_A4_WIDTH_PX}px`;
  element.style.height = `${REACH_CERT_A4_HEIGHT_PX}px`;
  element.style.maxWidth = `${REACH_CERT_A4_WIDTH_PX}px`;
  element.style.minHeight = `${REACH_CERT_A4_HEIGHT_PX}px`;
  element.style.boxSizing = 'border-box';
  element.style.overflow = 'hidden';
  element.style.margin = '0';
  element.style.background = '#ffffff';
}
