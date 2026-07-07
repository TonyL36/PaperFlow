import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader layout contract", () => {
  it("主阅读区使用 transform 缩放而不是 zoom 布局", () => {
    const viewportSource = readFileSync(resolve(__dirname, "pdfReader", "PdfMainViewport.tsx"), "utf8");
    const hookSource = readFileSync(resolve(__dirname, "pdfReader", "usePdfViewport.ts"), "utf8");
    const cssSource = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");

    expect(viewportSource).toContain("transform: `scale(${mainPageLayouts.get(page)!.displayZoom})`");
    expect(hookSource).toMatch(/style\.transform\s*=\s*`scale\(\$\{displayZoom\}\)`/);
    expect(hookSource).not.toMatch(/style\.zoom\s*=/);
    expect(hookSource).not.toMatch(/Math\.max\(0\.4,\s*availableWidth\s*\/\s*layout\.logicalWidth\)/);
    expect(hookSource).not.toMatch(/Math\.max\(0\.4,\s*availableWidth\s*\/\s*logicalViewport\.width\)/);
    expect(cssSource).toMatch(/\.pf-pdf-main-page-zoom\s*\{[\s\S]*transform-origin:\s*top left/);
  });
});
