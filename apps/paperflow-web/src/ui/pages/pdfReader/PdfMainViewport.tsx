import type { UsePdfViewportResult } from "./usePdfViewport";

type PdfMainViewportProps = {
  pdfViewport: UsePdfViewportResult;
  pdfRenderError: unknown | null;
  pdfRendering: boolean;
  pdfUrl?: string;
  onSelectionChange: () => void;
};

export function PdfMainViewport({
  pdfViewport,
  pdfRenderError,
  pdfRendering,
  pdfUrl,
  onSelectionChange
}: PdfMainViewportProps) {
  const { mainViewportRef, thumbnailItems, mainPageRefs, mainPageLayouts, renderedMainPages, mainCanvasRefs, textLayerRefs } = pdfViewport;

  return (
    <div className="pf-pdf-reader-surface">
      <div
        ref={mainViewportRef}
        className="pf-pdf-canvas-wrap"
        onMouseUp={() => window.setTimeout(onSelectionChange, 0)}
        onKeyUp={() => window.setTimeout(onSelectionChange, 0)}
        onTouchEnd={() => window.setTimeout(onSelectionChange, 0)}
      >
        {pdfRenderError ? (
          <div className="pf-pdf-fallback">
            PDF 渲染失败，请
            <a href={pdfUrl || undefined} target="_blank" rel="noopener noreferrer">
              打开原始文件
            </a>
          </div>
        ) : (
          thumbnailItems.map((page) => (
            <div
              key={`main_page_${page}`}
              data-page-no={page}
              ref={(el) => mainPageRefs.current.set(page, el)}
              className="pf-pdf-main-page"
            >
              <div
                className="pf-pdf-main-page-shell"
                style={
                  mainPageLayouts.get(page)
                    ? {
                        width: `${mainPageLayouts.get(page)!.logicalWidth * mainPageLayouts.get(page)!.displayZoom}px`,
                        height: `${mainPageLayouts.get(page)!.logicalHeight * mainPageLayouts.get(page)!.displayZoom}px`
                      }
                    : undefined
                }
              >
                {!renderedMainPages.has(page) ? <div className="pf-pdf-main-skeleton" /> : null}
                <div
                  className="pf-pdf-main-page-zoom"
                  style={
                    mainPageLayouts.get(page)
                      ? {
                          width: `${mainPageLayouts.get(page)!.logicalWidth}px`,
                          height: `${mainPageLayouts.get(page)!.logicalHeight}px`,
                          transform: `scale(${mainPageLayouts.get(page)!.displayZoom})`
                        }
                      : undefined
                  }
                >
                  <div
                    className="pf-pdf-main-page-content"
                    style={
                      mainPageLayouts.get(page)
                        ? {
                            width: `${mainPageLayouts.get(page)!.logicalWidth}px`,
                            height: `${mainPageLayouts.get(page)!.logicalHeight}px`
                          }
                        : undefined
                    }
                  >
                    <canvas
                      ref={(el) => mainCanvasRefs.current.set(page, el)}
                      className={["pf-pdf-main-canvas", renderedMainPages.has(page) ? "" : "pf-pdf-main-canvas--hidden"].join(" ").trim()}
                    />
                    <div ref={(el) => textLayerRefs.current.set(page, el)} className="pf-pdf-text-layer" />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        {pdfRendering ? <div className="pf-pdf-canvas-loading">PDF 渲染中...</div> : null}
      </div>
    </div>
  );
}
