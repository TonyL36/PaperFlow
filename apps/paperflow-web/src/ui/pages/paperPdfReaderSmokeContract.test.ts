import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader smoke contract", () => {
  it("论文阅读页保留关键阅读与对话入口", () => {
    const sourcePath = resolve(__dirname, "PaperPdfReaderPage.tsx");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toMatch(/论文阅读/);
    expect(source).toMatch(/pf-paper-page-title-offset/);
    expect(source).toMatch(/resolvePdfReaderResponsiveLayout/);
    expect(source).toMatch(/← 返回文章详情/);
    expect(source).toMatch(/隐藏缩略栏/);
    expect(source).toMatch(/在新标签页打开原始 PDF/);
    expect(source).toMatch(/<h3>AI 对话<\/h3>/);
  });
});
