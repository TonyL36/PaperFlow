import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfTextLayer integration", () => {
  it("PDF 主视图保持固定逻辑尺寸与手写文字层方案", () => {
    const viewportPath = resolve(__dirname, "pdfReader", "PdfMainViewport.tsx");
    const viewportSource = readFileSync(viewportPath, "utf8");
    const hookPath = resolve(__dirname, "pdfReader", "usePdfViewport.ts");
    const hookSource = readFileSync(hookPath, "utf8");

    expect(hookSource).toMatch(/const\s+PDF_LOGICAL_PAGE_WIDTH\s*=\s*920/);
    expect(hookSource).toMatch(/const\s+displayZoom\s*=\s*Math\.min\(/);
    expect(viewportSource).toMatch(/className="pf-pdf-main-page-shell"/);
    expect(viewportSource).toMatch(/className="pf-pdf-main-page-zoom"/);
    expect(viewportSource).toMatch(/className="pf-pdf-main-page-content"/);
    expect(hookSource).toMatch(/const\s+textContent\s*=\s*await\s+page\.getTextContent\(\)/);
    expect(hookSource).toMatch(/for\s*\(const\s+it\s+of\s+textContent\.items/);
    expect(hookSource).toMatch(/const\s+span\s*=\s*document\.createElement\("span"\)/);
    expect(hookSource).toMatch(/span\.textContent\s*=\s*it\.str/);
    expect(hookSource).toMatch(/textLayer\.appendChild\(span\)/);
    expect(hookSource).not.toMatch(/import\s+\{[\s\S]*TextLayer[\s\S]*\}\s+from\s+"pdfjs-dist"/);
    expect(hookSource).not.toMatch(/new\s+TextLayer\s*\(/);
  });
});
