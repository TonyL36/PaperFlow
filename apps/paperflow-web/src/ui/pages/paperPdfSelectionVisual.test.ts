import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfSelectionVisual", () => {
  it("PDF 文字层为文档风格选区保留半透明高亮与文字隐藏规则", () => {
    const cssPath = resolve(__dirname, "../styles/global.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toMatch(/\.pf-pdf-main-page-shell\s*\{/);
    expect(css).toMatch(/\.pf-pdf-main-page-zoom\s*\{/);
    expect(css).toMatch(/\.pf-pdf-main-page-content\s*\{/);
    expect(css).toMatch(/\.pf-pdf-text-layer\s*::selection/);
    expect(css).toMatch(/\.pf-pdf-text-layer\s*::selection\s*\{[\s\S]*background:\s*rgba\(/);
    expect(css).toMatch(/\.pf-pdf-text-layer\s*::selection\s*\{[\s\S]*color:\s*transparent/);
    expect(css).toMatch(/\.pf-pdf-text-layer\s*::selection\s*\{[\s\S]*-webkit-text-fill-color:\s*transparent/);
    expect(css).toMatch(/\.pf-pdf-text-layer\s*span\s*\{[\s\S]*-webkit-text-fill-color:\s*transparent/);
    expect(css).not.toMatch(/\.pf-pdf-text-layer\s*:is\(span,\s*br\)/);
  });
});
