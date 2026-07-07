import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader selection refactor integration", () => {
  it("主阅读页通过独立 hook 装配选区交互层", () => {
    const pageSourcePath = resolve(__dirname, "PaperPdfReaderPage.tsx");
    const selectionHookPath = resolve(__dirname, "pdfReader", "usePdfSelectionController.ts");
    const pageSource = readFileSync(pageSourcePath, "utf8");

    expect(existsSync(selectionHookPath)).toBe(true);
    expect(pageSource).toMatch(/import\s+\{\s*usePdfSelectionController\s*\}\s+from\s+"\.\/pdfReader\/usePdfSelectionController"/);
    expect(pageSource).toMatch(/const\s+pdfSelection\s*=\s*usePdfSelectionController\(\)/);
    expect(pageSource).toMatch(/onSelectionChange=\{pdfSelection\.updateSelectionPopover\}/);
    expect(pageSource).toMatch(/ref=\{pdfSelection\.selectionPopoverRef\}/);
    expect(pageSource).toMatch(/\{pdfSelection\.selectionPopover\s*\?/);
    expect(pageSource).not.toMatch(/window\.getSelection\(\)/);
    expect(pageSource).not.toMatch(/document\.addEventListener\("mousedown"/);
  });
});
