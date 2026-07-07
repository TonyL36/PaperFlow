import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export type SelectionPopover = { text: string; left: number; top: number };
type ResolveSelectionPopoverPositionInput = {
  viewportWidth: number;
  popoverWidth: number;
  rectLeft: number;
  rectWidth: number;
  rectTop: number;
  rectBottom: number;
};

const SELECTION_POPOVER_HORIZONTAL_MARGIN = 12;
const SELECTION_POPOVER_DEFAULT_WIDTH = 242;

export type UsePdfSelectionControllerResult = {
  selectionPopover: SelectionPopover | null;
  selectionPopoverRef: MutableRefObject<HTMLDivElement | null>;
  clearCurrentSelection: () => void;
  hideSelectionPopover: () => void;
  updateSelectionPopover: () => void;
};

export function resolveSelectionPopoverPosition(input: ResolveSelectionPopoverPositionInput): { left: number; top: number } {
  const { viewportWidth, popoverWidth, rectLeft, rectWidth, rectTop, rectBottom } = input;
  const safePopoverWidth = Math.max(0, popoverWidth);
  const maxLeft = Math.max(SELECTION_POPOVER_HORIZONTAL_MARGIN, viewportWidth - safePopoverWidth - SELECTION_POPOVER_HORIZONTAL_MARGIN);
  const centeredLeft = rectLeft + rectWidth / 2 - safePopoverWidth / 2;
  const left = Math.max(SELECTION_POPOVER_HORIZONTAL_MARGIN, Math.min(maxLeft, centeredLeft));
  const top = rectTop > 70 ? Math.max(SELECTION_POPOVER_HORIZONTAL_MARGIN, rectTop - 52) : rectBottom + 10;
  return { left, top };
}

export function usePdfSelectionController(): UsePdfSelectionControllerResult {
  const [selectionPopover, setSelectionPopover] = useState<SelectionPopover | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);

  const hideSelectionPopover = useCallback(() => {
    setSelectionPopover(null);
  }, []);

  const clearCurrentSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
  }, []);

  const updateSelectionPopover = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideSelectionPopover();
      return;
    }
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) {
      hideSelectionPopover();
      return;
    }
    const range = selection.getRangeAt(0);
    let ancestor: Node | null = range.commonAncestorContainer;
    if (ancestor.nodeType === Node.TEXT_NODE) {
      ancestor = ancestor.parentNode;
    }
    const inPdfTextLayer = ancestor instanceof Element && !!ancestor.closest(".pf-pdf-text-layer");
    if (!inPdfTextLayer) {
      hideSelectionPopover();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideSelectionPopover();
      return;
    }
    const popoverWidth = selectionPopoverRef.current?.offsetWidth ?? SELECTION_POPOVER_DEFAULT_WIDTH;
    const { left, top } = resolveSelectionPopoverPosition({
      viewportWidth: window.innerWidth,
      popoverWidth,
      rectLeft: rect.left,
      rectWidth: rect.width,
      rectTop: rect.top,
      rectBottom: rect.bottom
    });
    setSelectionPopover({ text, left, top });
  }, [hideSelectionPopover]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (selectionPopoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".pf-pdf-text-layer")) return;
      hideSelectionPopover();
    };
    const onScroll = () => hideSelectionPopover();
    const onResize = () => hideSelectionPopover();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [hideSelectionPopover]);

  return {
    selectionPopover,
    selectionPopoverRef,
    clearCurrentSelection,
    hideSelectionPopover,
    updateSelectionPopover
  };
}
