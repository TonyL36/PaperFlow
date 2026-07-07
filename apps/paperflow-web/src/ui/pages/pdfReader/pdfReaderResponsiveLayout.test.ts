import { describe, expect, it } from "vitest";
import { resolvePdfReaderResponsiveLayout } from "./pdfReaderResponsiveLayout";

describe("pdfReaderResponsiveLayout", () => {
  it("在宽度收窄时先自动隐藏左侧缩略栏，再进入仅保留 PDF 的聚焦模式", () => {
    expect(resolvePdfReaderResponsiveLayout(1500)).toEqual({
      autoHideRail: false,
      focusPdfOnly: false,
      stackHeader: false
    });

    expect(resolvePdfReaderResponsiveLayout(1360)).toEqual({
      autoHideRail: true,
      focusPdfOnly: false,
      stackHeader: true
    });

    expect(resolvePdfReaderResponsiveLayout(1180)).toEqual({
      autoHideRail: true,
      focusPdfOnly: true,
      stackHeader: true
    });

    expect(resolvePdfReaderResponsiveLayout(1024)).toEqual({
      autoHideRail: true,
      focusPdfOnly: true,
      stackHeader: true
    });
  });
});
