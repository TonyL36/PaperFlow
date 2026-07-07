import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader responsive rail integration", () => {
  it("在左栏自动隐藏后恢复时，重新接入缩略图渲染，并在高倍率下切到仅保留 PDF 的聚焦模式", () => {
    const pageSource = readFileSync(resolve(__dirname, "PaperPdfReaderPage.tsx"), "utf8");
    const hookSource = readFileSync(resolve(__dirname, "pdfReader", "usePdfViewport.ts"), "utf8");
    const cssSource = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");

    expect(pageSource).toMatch(/usePdfViewport\(pdf\.doc,\s*!effectiveRailHidden\)/);
    expect(pageSource).toMatch(/responsiveLayout\.focusPdfOnly \? "pf-pdf-layout--agent-focus" : ""/);
    expect(pageSource).toMatch(/\{!responsiveLayout\.focusPdfOnly \? \(/);
    expect(hookSource).toMatch(/thumbRailVisible/);
    expect(hookSource).toMatch(/setRenderedThumbPages\(new Set\(\)\)/);
    expect(cssSource).toMatch(/\.pf-pdf-layout--agent-no-rail\s*\{[\s\S]*justify-content:\s*center/);
    expect(cssSource).toMatch(/\.pf-pdf-layout--agent-focus\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
