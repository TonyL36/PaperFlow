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

function toPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

export function shouldSkipPdfWatermarkItem(input: ShouldSkipPdfWatermarkItemInput): boolean {
  const text = input.text.trim();
  if (text.length < 4) return false;
  const [a, b, , , x] = input.transform;
  const rotation = Math.atan2(b, a);
  const isVertical = Math.abs(Math.cos(rotation)) < 0.35;
  if (!isVertical) return false;
  const edgeThreshold = Math.max(36, input.pageWidth * 0.08);
  const isOnLeftEdge = x <= edgeThreshold;
  const isOnRightEdge = x >= input.pageWidth - edgeThreshold;
  return isOnLeftEdge || isOnRightEdge;
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
