import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("paperPdfReader header responsive", () => {
  it("阅读页头部在高倍率/窄宽度下切换为可换行的纵向排布", () => {
    const pageSource = readFileSync(resolve(__dirname, "PaperPdfReaderPage.tsx"), "utf8");
    const cssSource = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");

    expect(pageSource).toMatch(/headerClassName=\{\["pf-pdf-page-header",\s*responsiveLayout\.stackHeader \? "pf-pdf-page-header--stacked" : ""\]\.join\(" "\)\.trim\(\)\}/);
    expect(pageSource).toMatch(/responsiveLayout\.stackHeader \? "pf-pdf-page-header--stacked" : ""/);
    expect(pageSource).toMatch(/titleRowClassName="pf-pdf-page-header__title-row"/);
    expect(pageSource).toMatch(/actionsClassName="pf-pdf-page-header__actions"/);
    expect(cssSource).toMatch(/\.pf-pdf-page-header\s*\{/);
    expect(cssSource).toMatch(/\.pf-pdf-page-header__title-row\s*\{/);
    expect(cssSource).toMatch(/\.pf-pdf-page-header--stacked\s+\.pf-pdf-page-header__title-row\s*\{[\s\S]*flex-direction:\s*column/);
    expect(cssSource).toMatch(/\.pf-pdf-page-header--stacked\s+\.pf-pdf-page-header__actions\s*\{[\s\S]*width:\s*100%/);
  });
});
