export type PdfReaderResponsiveLayout = {
  autoHideRail: boolean;
  focusPdfOnly: boolean;
  stackHeader: boolean;
};

const PDF_READER_AUTO_HIDE_RAIL_BREAKPOINT = 1360;
const PDF_READER_FOCUS_PDF_ONLY_BREAKPOINT = 1320;

export function resolvePdfReaderResponsiveLayout(viewportWidth: number): PdfReaderResponsiveLayout {
  const safeWidth = Math.max(0, viewportWidth);
  const autoHideRail = safeWidth <= PDF_READER_AUTO_HIDE_RAIL_BREAKPOINT;
  const focusPdfOnly = safeWidth <= PDF_READER_FOCUS_PDF_ONLY_BREAKPOINT;
  const stackHeader = safeWidth <= PDF_READER_AUTO_HIDE_RAIL_BREAKPOINT;
  return { autoHideRail, focusPdfOnly, stackHeader };
}
