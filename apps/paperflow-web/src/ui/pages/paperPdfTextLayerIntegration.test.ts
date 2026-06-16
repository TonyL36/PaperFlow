import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfTextLayer integration", () => {
  it("主阅读页使用固定逻辑尺寸容器和外层缩放壳，但仍保留手写文字层", () => {
    const sourcePath = resolve(__dirname, "PaperPdfReaderPage.tsx");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toMatch(/const\s+PDF_LOGICAL_PAGE_WIDTH\s*=\s*920/);
    expect(source).toMatch(/const\s+displayZoom\s*=\s*Math\.min\(/);
    expect(source).toMatch(/className="pf-pdf-main-page-shell"/);
    expect(source).toMatch(/className="pf-pdf-main-page-zoom"/);
    expect(source).toMatch(/className="pf-pdf-main-page-content"/);
    expect(source).toMatch(/const\s+textContent\s*=\s*await\s+page\.getTextContent\(\)/);
    expect(source).toMatch(/for\s*\(const\s+it\s+of\s+textContent\.items/);
    expect(source).toMatch(/const\s+span\s*=\s*document\.createElement\("span"\)/);
    expect(source).toMatch(/span\.textContent\s*=\s*it\.str/);
    expect(source).toMatch(/textLayer\.appendChild\(span\)/);
    expect(source).toMatch(/ancestor\s+instanceof\s+Element\s+&&\s+!!ancestor\.closest\("\.pf-pdf-text-layer"\)/);
    expect(source).not.toMatch(/import\s+\{[\s\S]*TextLayer[\s\S]*\}\s+from\s+"pdfjs-dist"/);
    expect(source).not.toMatch(/new\s+TextLayer\s*\(/);
  });
});
