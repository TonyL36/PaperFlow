import type { UsePdfViewportResult } from "./usePdfViewport";
import { Card } from "../../components/Card";

type PdfThumbnailRailProps = {
  pdfViewport: UsePdfViewportResult;
};

export function PdfThumbnailRail({ pdfViewport }: PdfThumbnailRailProps) {
  const { thumbnailItems, selectedPdfPage, renderedThumbPages, thumbButtonRefs, thumbCanvasRefs, scrollToPage } = pdfViewport;

  return (
    <Card className="pf-pdf-rail">
      <div className="pf-pdf-thumbs">
        {thumbnailItems.map((page) => (
          <button
            key={`thumb_${page}`}
            type="button"
            className={["pf-pdf-thumb", selectedPdfPage === page ? "pf-pdf-thumb--active" : ""].join(" ").trim()}
            data-page-no={page}
            ref={(el) => thumbButtonRefs.current.set(page, el)}
            onClick={() => scrollToPage(page)}
          >
            {!renderedThumbPages.has(page) ? <div className="pf-pdf-thumb__skeleton" /> : null}
            <canvas
              ref={(el) => thumbCanvasRefs.current.set(page, el)}
              className={["pf-pdf-thumb__canvas", renderedThumbPages.has(page) ? "" : "pf-pdf-thumb__canvas--hidden"].join(" ").trim()}
            />
            <span className="pf-pdf-thumb__page">P{page}</span>
            <span className="pf-pdf-thumb__title">第 {page} 页</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
