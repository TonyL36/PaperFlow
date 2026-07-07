import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader chat refactor integration", () => {
  it("主阅读页通过独立 hook 装配 AI 对话层", () => {
    const pageSourcePath = resolve(__dirname, "PaperPdfReaderPage.tsx");
    const chatHookPath = resolve(__dirname, "pdfReader", "usePaperReaderChat.ts");
    const pageSource = readFileSync(pageSourcePath, "utf8");

    expect(existsSync(chatHookPath)).toBe(true);
    expect(pageSource).toMatch(/import\s+\{\s*usePaperReaderChat\s*\}\s+from\s+"\.\/pdfReader\/usePaperReaderChat"/);
    expect(pageSource).toMatch(/const\s+paperReaderChat\s*=\s*usePaperReaderChat\(/);
    expect(pageSource).toMatch(/paperReaderChat\.messages\.map/);
    expect(pageSource).toMatch(/onClick=\{paperReaderChat\.sendAiMessage\}/);
    expect(pageSource).toMatch(/paperReaderChat\.translateReferenceToChat\(/);
    expect(pageSource).not.toMatch(/const\s+\[aiInput,\s*setAiInput\]/);
    expect(pageSource).not.toMatch(/const\s+\[aiMessages,\s*setAiMessages\]/);
    expect(pageSource).not.toMatch(/const\s+sendAiMessage\s*=\s*async/);
  });
});
