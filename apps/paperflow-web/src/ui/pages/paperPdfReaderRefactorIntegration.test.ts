import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader refactor integration", () => {
  it("主阅读页通过独立 hook 与子组件装配 PDF 渲染层", () => {
    const sourcePath = resolve(__dirname, "PaperPdfReaderPage.tsx");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toMatch(/import\s+\{\s*usePdfDocument\s*\}\s+from\s+"\.\/pdfReader\/usePdfDocument"/);
    expect(source).toMatch(/import\s+\{\s*usePdfViewport\s*\}\s+from\s+"\.\/pdfReader\/usePdfViewport"/);
    expect(source).toMatch(/import\s+\{\s*PdfThumbnailRail\s*\}\s+from\s+"\.\/pdfReader\/PdfThumbnailRail"/);
    expect(source).toMatch(/import\s+\{\s*PdfMainViewport\s*\}\s+from\s+"\.\/pdfReader\/PdfMainViewport"/);
    expect(source).toMatch(/const\s+pdf\s*=\s*usePdfDocument\(renderPdfUrl\)/);
    expect(source).toMatch(/const\s+pdfViewport\s*=\s*usePdfViewport\(\s*pdf\.doc\s*,\s*!effectiveRailHidden\s*\)/);
    expect(source).toMatch(/<PdfThumbnailRail[\s\S]*pdfViewport=/);
    expect(source).toMatch(/<PdfMainViewport[\s\S]*pdfViewport=/);
  });

  it("App 通过懒加载隔离 PDF 阅读页依赖，避免首屏静态引入 pdfjs", () => {
    const appSourcePath = resolve(__dirname, "..", "App.tsx");
    const appSource = readFileSync(appSourcePath, "utf8");

    expect(appSource).toMatch(/import\s+\{\s*Suspense,\s*lazy\s*\}\s+from\s+"react"/);
    expect(appSource).toMatch(/const\s+PaperPdfReaderPage\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/pages\/PaperPdfReaderPage"\)[\s\S]*\)/);
    expect(appSource).toMatch(/path="\/papers\/:postId"/);
    expect(appSource).toMatch(/<Suspense[\s\S]*<PaperPdfReaderPage\s*\/>[\s\S]*<\/Suspense>/);
    expect(appSource).not.toMatch(/import\s+\{\s*PaperPdfReaderPage\s*\}\s+from\s+"\.\/pages\/PaperPdfReaderPage"/);
  });
});
