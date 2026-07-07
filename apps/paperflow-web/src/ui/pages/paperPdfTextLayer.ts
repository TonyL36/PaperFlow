type BuildPdfTextSpanStyleInput = {
  text: string;
  scale: number;
  viewportHeight: number;
  transform: number[];
  textWidth?: number;
  fontFamily: string;
  ascentRatio?: number;
};

type PdfTextSpanStyle = {
  left: string;
  top: string;
  fontSize: string;
  fontFamily: string;
  transform?: string;
  width?: string;
};

type ShouldSkipPdfWatermarkItemInput = {
  text: string;
  transform: number[];
  pageWidth: number;
};

type ResolvePdfTextScaleXInput = {
  measuredWidth: number;
  expectedWidth: number;
  left: number;
  pageWidth: number;
};

function toPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

export function shouldSkipPdfWatermarkItem(input: ShouldSkipPdfWatermarkItemInput): boolean {
  const text = input.text.trim();
  if (text.length < 4) return false;
  const [a, b, , , x] = input.transform;
  const rotation = Math.atan2(b, a);
  // Only drop likely vertical edge watermarks so正文和页码仍可进入文字层。
  const isVertical = Math.abs(Math.cos(rotation)) < 0.35;
  if (!isVertical) return false;
  const edgeThreshold = Math.max(36, input.pageWidth * 0.08);
  const isOnLeftEdge = x <= edgeThreshold;
  const isOnRightEdge = x >= input.pageWidth - edgeThreshold;
  return isOnLeftEdge || isOnRightEdge;
}

export function resolvePdfTextScaleX(input: ResolvePdfTextScaleXInput): number | null {
  const { measuredWidth, expectedWidth, left, pageWidth } = input;
  if (!(measuredWidth > 0) || !(expectedWidth > 0) || !(pageWidth > 0)) {
    return null;
  }
  const safeLeft = Math.max(0, left);
  const remainingWidth = Math.max(0, pageWidth - safeLeft);
  if (remainingWidth <= 0) {
    return null;
  }
  // Near the right edge we cap text width by remaining space to avoid selection
  // spans continuing past the page boundary at high zoom levels.
  const targetWidth = Math.min(expectedWidth, remainingWidth);
  const scaleX = targetWidth / measuredWidth;
  if (!Number.isFinite(scaleX) || scaleX <= 0) {
    return null;
  }
  return Number(scaleX.toFixed(4));
}

export function buildPdfTextSpanStyle(input: BuildPdfTextSpanStyleInput): PdfTextSpanStyle {
  const { scale, viewportHeight, transform, textWidth, fontFamily, ascentRatio } = input;
  const fontSize = Math.max(8, Math.hypot(transform[2], transform[3]) * scale);
  const ascentHeight = Math.min(fontSize, Math.max(fontSize * 0.55, (ascentRatio || 0.82) * fontSize));
  const rotation = Math.atan2(transform[1], transform[0]);
  const isHorizontal = Math.abs(rotation) <= 0.001;

  return {
    left: toPx(transform[4] * scale),
    top: toPx(Math.max(0, viewportHeight - transform[5] * scale - ascentHeight)),
    fontSize: toPx(fontSize),
    fontFamily: fontFamily || "sans-serif",
    width: isHorizontal && typeof textWidth === "number" && textWidth > 0 ? toPx(textWidth) : undefined,
    transform: Math.abs(rotation) > 0.001 ? `rotate(${rotation}rad)` : undefined
  };
}
