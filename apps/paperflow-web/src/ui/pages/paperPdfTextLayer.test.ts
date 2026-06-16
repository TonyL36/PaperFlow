import { describe, expect, it } from "vitest";
import { buildPdfTextSpanStyle, shouldSkipPdfWatermarkItem } from "./paperPdfTextLayer";

describe("paperPdfTextLayer", () => {
  it("为水平文本输出稳定的定位、字号和宽度裁剪样式", () => {
    const style = buildPdfTextSpanStyle({
      text: "PaperFlow selection",
      scale: 1.2,
      viewportHeight: 900,
      transform: [12, 0, 0, 12, 100, 200],
      textWidth: 240,
      fontFamily: "Arial",
      ascentRatio: 0.8
    });

    expect(style.left).toBe("120px");
    expect(style.top).toBe("648.48px");
    expect(style.fontSize).toBe("14.4px");
    expect(style.fontFamily).toBe("Arial");
    expect(style.width).toBe("240px");
    expect(style.transform).toBeUndefined();
  });

  it("为旋转文本保留旋转角度而不是应用水平宽度裁剪", () => {
    const style = buildPdfTextSpanStyle({
      text: "Rotated",
      scale: 1,
      viewportHeight: 400,
      transform: [0, 10, -10, 0, 50, 150],
      textWidth: 80,
      fontFamily: "Times New Roman"
    });

    expect(style.left).toBe("50px");
    expect(style.top).toBe("241.8px");
    expect(style.fontSize).toBe("10px");
    expect(style.fontFamily).toBe("Times New Roman");
    expect(style.width).toBeUndefined();
    expect(style.transform).toBe(`rotate(${Math.PI / 2}rad)`);
  });

  it("只过滤左右边缘的竖排水印，不误伤水平页码和正文", () => {
    expect(
      shouldSkipPdfWatermarkItem({
        text: "11 Jun 2026",
        transform: [0, 12, -12, 0, 18, 320],
        pageWidth: 920
      })
    ).toBe(true);

    expect(
      shouldSkipPdfWatermarkItem({
        text: "CONFIDENTIAL",
        transform: [0, -12, 12, 0, 902, 320],
        pageWidth: 920
      })
    ).toBe(true);

    expect(
      shouldSkipPdfWatermarkItem({
        text: "12",
        transform: [12, 0, 0, 12, 460, 24],
        pageWidth: 920
      })
    ).toBe(false);

    expect(
      shouldSkipPdfWatermarkItem({
        text: "Abstract",
        transform: [12, 0, 0, 12, 216, 640],
        pageWidth: 920
      })
    ).toBe(false);
  });
});
