import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";
import { resolvePdfTextScaleX, shouldSkipPdfWatermarkItem } from "../paperPdfTextLayer";

export type PdfMainPageLayout = { logicalWidth: number; logicalHeight: number; displayZoom: number };

export type UsePdfViewportResult = {
  mainViewportRef: MutableRefObject<HTMLDivElement | null>;
  thumbCanvasRefs: MutableRefObject<Map<number, HTMLCanvasElement | null>>;
  thumbButtonRefs: MutableRefObject<Map<number, HTMLButtonElement | null>>;
  mainCanvasRefs: MutableRefObject<Map<number, HTMLCanvasElement | null>>;
  mainPageRefs: MutableRefObject<Map<number, HTMLDivElement | null>>;
  textLayerRefs: MutableRefObject<Map<number, HTMLDivElement | null>>;
  selectedPdfPage: number;
  thumbnailItems: number[];
  renderedThumbPages: Set<number>;
  renderedMainPages: Set<number>;
  mainPageLayouts: Map<number, PdfMainPageLayout>;
  renderError: unknown | null;
  scrollToPage: (pageNo: number) => void;
};

const PDF_LOGICAL_PAGE_WIDTH = 920;
const PDF_MAIN_PAGE_SIDE_GAP = 24;
const PDF_INITIAL_THUMB_PAGE_COUNT = 6;
const PDF_INITIAL_MAIN_PAGE_COUNT = 3;

export function usePdfViewport(pdfDoc: PDFDocumentProxy | null, thumbRailVisible = true): UsePdfViewportResult {
  const [selectedPdfPage, setSelectedPdfPage] = useState(1);
  const [pdfResizeTick, setPdfResizeTick] = useState(0);
  const [visibleThumbPages, setVisibleThumbPages] = useState<Set<number>>(new Set());
  const [visibleMainPages, setVisibleMainPages] = useState<Set<number>>(new Set());
  const [renderedThumbPages, setRenderedThumbPages] = useState<Set<number>>(new Set());
  const [renderedMainPages, setRenderedMainPages] = useState<Set<number>>(new Set());
  const [mainPageLayouts, setMainPageLayouts] = useState<Map<number, PdfMainPageLayout>>(new Map());
  const [renderError, setRenderError] = useState<unknown | null>(null);
  const mainViewportRef = useRef<HTMLDivElement | null>(null);
  const thumbCanvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const thumbButtonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const mainCanvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const mainPageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const pdfPageCount = pdfDoc?.numPages ?? 0;
  const thumbnailItems = useMemo(() => Array.from({ length: pdfPageCount }, (_, idx) => idx + 1), [pdfPageCount]);

  useEffect(() => {
    if (!pdfDoc) return;
    if (selectedPdfPage > pdfDoc.numPages) {
      setSelectedPdfPage(pdfDoc.numPages);
    }
  }, [pdfDoc, selectedPdfPage]);

  useEffect(() => {
    if (!pdfDoc) {
      setSelectedPdfPage(1);
      setVisibleThumbPages(new Set());
      setVisibleMainPages(new Set());
      setRenderedThumbPages(new Set());
      setRenderedMainPages(new Set());
      setMainPageLayouts(new Map());
      setRenderError(null);
      return;
    }
    const initialThumbs = new Set<number>();
    const initialMainPages = new Set<number>();
    for (let i = 1; i <= Math.min(PDF_INITIAL_THUMB_PAGE_COUNT, pdfDoc.numPages); i += 1) {
      initialThumbs.add(i);
    }
    for (let i = 1; i <= Math.min(PDF_INITIAL_MAIN_PAGE_COUNT, pdfDoc.numPages); i += 1) {
      initialMainPages.add(i);
    }
    setSelectedPdfPage(1);
    setVisibleThumbPages(thumbRailVisible ? initialThumbs : new Set());
    setVisibleMainPages(initialMainPages);
    setRenderedThumbPages(new Set());
    setRenderedMainPages(new Set());
    setMainPageLayouts(new Map());
    setRenderError(null);
  }, [pdfDoc, thumbRailVisible]);

  useEffect(() => {
    if (!pdfDoc || !thumbRailVisible) return;
    const initialThumbs = new Set<number>();
    for (let i = 1; i <= Math.min(PDF_INITIAL_THUMB_PAGE_COUNT, pdfDoc.numPages); i += 1) {
      initialThumbs.add(i);
    }
    setVisibleThumbPages(initialThumbs);
    setRenderedThumbPages(new Set());
  }, [pdfDoc, thumbRailVisible]);

  useEffect(() => {
    const onResize = () => setPdfResizeTick((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!mainViewportRef.current || !mainPageLayouts.size) return;
    const availableWidth = Math.max(1, mainViewportRef.current.clientWidth - PDF_MAIN_PAGE_SIDE_GAP);
    setMainPageLayouts((prev) => {
      let changed = false;
      const next = new Map(prev);
      prev.forEach((layout, pageNo) => {
        const displayZoom = Math.min(1, availableWidth / layout.logicalWidth);
        if (Math.abs(layout.displayZoom - displayZoom) > 0.0001) {
          const pageRoot = mainPageRefs.current.get(pageNo);
          const shell = pageRoot?.querySelector(".pf-pdf-main-page-shell");
          const zoom = pageRoot?.querySelector(".pf-pdf-main-page-zoom");
          const content = pageRoot?.querySelector(".pf-pdf-main-page-content");
          if (shell instanceof HTMLElement) {
            shell.style.width = `${layout.logicalWidth * displayZoom}px`;
            shell.style.height = `${layout.logicalHeight * displayZoom}px`;
          }
          if (zoom instanceof HTMLElement) {
            zoom.style.width = `${layout.logicalWidth}px`;
            zoom.style.height = `${layout.logicalHeight}px`;
            zoom.style.transform = `scale(${displayZoom})`;
          }
          if (content instanceof HTMLElement) {
            content.style.width = `${layout.logicalWidth}px`;
            content.style.height = `${layout.logicalHeight}px`;
          }
          next.set(pageNo, { ...layout, displayZoom });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pdfResizeTick, mainPageLayouts]);

  useEffect(() => {
    if (!thumbnailItems.length || !thumbRailVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleThumbPages((prev) => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pageNo = Number((entry.target as HTMLElement).dataset.pageNo ?? 0);
              if (pageNo > 0 && !next.has(pageNo)) {
                next.add(pageNo);
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      },
      { root: null, rootMargin: "180px 0px", threshold: 0.05 }
    );
    thumbnailItems.forEach((pageNo) => {
      const node = thumbButtonRefs.current.get(pageNo);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [thumbnailItems, thumbRailVisible]);

  useEffect(() => {
    if (!thumbnailItems.length || !mainViewportRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleMainPages((prev) => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pageNo = Number((entry.target as HTMLElement).dataset.pageNo ?? 0);
              if (pageNo > 0 && !next.has(pageNo)) {
                next.add(pageNo);
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      },
      { root: mainViewportRef.current, rootMargin: "220px 0px", threshold: 0.02 }
    );
    thumbnailItems.forEach((pageNo) => {
      const node = mainPageRefs.current.get(pageNo);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [thumbnailItems]);

  useEffect(() => {
    if (!thumbnailItems.length || !mainViewportRef.current) return;
    const viewport = mainViewportRef.current;
    let raf = 0;
    const updateSelectedByScroll = () => {
      raf = 0;
      const anchor = viewport.scrollTop + viewport.clientHeight * 0.22;
      let bestPage = selectedPdfPage;
      let bestDistance = Number.POSITIVE_INFINITY;
      thumbnailItems.forEach((pageNo) => {
        const node = mainPageRefs.current.get(pageNo);
        if (!node) return;
        const distance = Math.abs(node.offsetTop - anchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = pageNo;
        }
      });
      setSelectedPdfPage((prev) => (prev === bestPage ? prev : bestPage));
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateSelectedByScroll);
    };
    updateSelectedByScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [thumbnailItems, selectedPdfPage]);

  useEffect(() => {
    const node = thumbButtonRefs.current.get(selectedPdfPage);
    if (!node) return;
    const rail = node.closest(".pf-pdf-rail") as HTMLElement | null;
    if (!rail) {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      return;
    }
    const nodeTop = node.offsetTop;
    const nodeBottom = nodeTop + node.offsetHeight;
    const viewTop = rail.scrollTop;
    const viewBottom = viewTop + rail.clientHeight;
    const padding = 10;
    if (nodeTop < viewTop + padding) {
      rail.scrollTo({ top: Math.max(0, nodeTop - padding), behavior: "smooth" });
      return;
    }
    if (nodeBottom > viewBottom - padding) {
      rail.scrollTo({ top: Math.max(0, nodeBottom - rail.clientHeight + padding), behavior: "smooth" });
    }
  }, [selectedPdfPage]);

  useEffect(() => {
    if (!pdfDoc || !visibleMainPages.size || !mainViewportRef.current) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];
    const renderAllVisiblePages = async () => {
      const sortedPages = Array.from(visibleMainPages).sort((a, b) => a - b);
      for (const pageNo of sortedPages) {
        if (cancelled) break;
        const canvas = mainCanvasRefs.current.get(pageNo);
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(pageNo);
          if (cancelled || !mainViewportRef.current) break;
          const baseViewport = page.getViewport({ scale: 1 });
          const logicalScale = PDF_LOGICAL_PAGE_WIDTH / baseViewport.width;
          const logicalViewport = page.getViewport({ scale: logicalScale });
          const availableWidth = Math.max(1, mainViewportRef.current.clientWidth - PDF_MAIN_PAGE_SIDE_GAP);
          const displayZoom = Math.min(1, availableWidth / logicalViewport.width);
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: logicalScale * dpr });
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          const pageRoot = mainPageRefs.current.get(pageNo);
          const shell = pageRoot?.querySelector(".pf-pdf-main-page-shell");
          const zoom = pageRoot?.querySelector(".pf-pdf-main-page-zoom");
          const content = pageRoot?.querySelector(".pf-pdf-main-page-content");
          if (shell instanceof HTMLElement) {
            shell.style.width = `${Math.floor(logicalViewport.width * displayZoom)}px`;
            shell.style.height = `${Math.floor(logicalViewport.height * displayZoom)}px`;
          }
          if (zoom instanceof HTMLElement) {
            zoom.style.width = `${Math.floor(logicalViewport.width)}px`;
            zoom.style.height = `${Math.floor(logicalViewport.height)}px`;
            zoom.style.transform = `scale(${displayZoom})`;
          }
          if (content instanceof HTMLElement) {
            content.style.width = `${Math.floor(logicalViewport.width)}px`;
            content.style.height = `${Math.floor(logicalViewport.height)}px`;
          }
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(logicalViewport.width)}px`;
          canvas.style.height = `${Math.floor(logicalViewport.height)}px`;
          const task = page.render({ canvasContext: ctx, viewport });
          tasks.push(task);
          setRenderedMainPages((prev) => {
            if (prev.has(pageNo)) return prev;
            const next = new Set(prev);
            next.add(pageNo);
            return next;
          });
          await task.promise;
          setMainPageLayouts((prev) => {
            const logicalWidth = Math.floor(logicalViewport.width);
            const logicalHeight = Math.floor(logicalViewport.height);
            const current = prev.get(pageNo);
            if (
              current &&
              current.logicalWidth === logicalWidth &&
              current.logicalHeight === logicalHeight &&
              Math.abs(current.displayZoom - displayZoom) <= 0.0001
            ) {
              return prev;
            }
            const next = new Map(prev);
            next.set(pageNo, { logicalWidth, logicalHeight, displayZoom });
            return next;
          });
          const textLayer = textLayerRefs.current.get(pageNo);
          if (textLayer) {
            textLayer.replaceChildren();
            textLayer.style.width = `${Math.floor(logicalViewport.width)}px`;
            textLayer.style.height = `${Math.floor(logicalViewport.height)}px`;
            const textContent = await page.getTextContent();
            for (const it of textContent.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
              if (!it?.str || !it.transform || it.str.trim().length === 0) continue;
              if (shouldSkipPdfWatermarkItem({ text: it.str, transform: it.transform, pageWidth: logicalViewport.width })) {
                continue;
              }
              const t = it.transform;
              const fontSize = Math.max(8, Math.hypot(t[2], t[3]) * logicalScale);
              const span = document.createElement("span");
              span.textContent = it.str;
              const textLeft = t[4] * logicalScale;
              span.style.left = `${textLeft}px`;
              span.style.top = `${Math.max(0, logicalViewport.height - t[5] * logicalScale - fontSize)}px`;
              span.style.fontSize = `${fontSize}px`;
              textLayer.appendChild(span);
              if (typeof it.width === "number" && it.width > 0) {
                const expectedWidth = it.width * logicalScale;
                const measuredWidth = span.getBoundingClientRect().width;
                if (measuredWidth > 0) {
                  const scaleX = resolvePdfTextScaleX({
                    measuredWidth,
                    expectedWidth,
                    left: textLeft,
                    pageWidth: logicalViewport.width
                  });
                  if (scaleX !== null && scaleX > 0.2 && scaleX < 2 && Math.abs(scaleX - 1) > 0.02) {
                    span.style.transform = `scaleX(${scaleX})`;
                  }
                }
              }
            }
          }
        } catch (err) {
          if (!cancelled) {
            setRenderError(err);
          }
        }
      }
    };
    void renderAllVisiblePages();
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [pdfDoc, visibleMainPages]);

  useEffect(() => {
    if (!pdfDoc || !thumbRailVisible || !visibleThumbPages.size) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];
    const renderThumbs = async () => {
      const sortedPages = Array.from(visibleThumbPages).sort((a, b) => a - b);
      for (const pageNo of sortedPages) {
        if (cancelled) break;
        const canvas = thumbCanvasRefs.current.get(pageNo);
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(pageNo);
          if (cancelled) break;
          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = 112;
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          const task = page.render({ canvasContext: ctx, viewport });
          tasks.push(task);
          await task.promise;
          if (!cancelled) {
            setRenderedThumbPages((prev) => {
              if (prev.has(pageNo)) return prev;
              const next = new Set(prev);
              next.add(pageNo);
              return next;
            });
          }
        } catch {
        }
      }
    };
    void renderThumbs();
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [pdfDoc, visibleThumbPages, thumbRailVisible]);

  const scrollToPage = (pageNo: number) => {
    setSelectedPdfPage(pageNo);
    const node = mainPageRefs.current.get(pageNo);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return {
    mainViewportRef,
    thumbCanvasRefs,
    thumbButtonRefs,
    mainCanvasRefs,
    mainPageRefs,
    textLayerRefs,
    selectedPdfPage,
    thumbnailItems,
    renderedThumbPages,
    renderedMainPages,
    mainPageLayouts,
    renderError,
    scrollToPage
  };
}
