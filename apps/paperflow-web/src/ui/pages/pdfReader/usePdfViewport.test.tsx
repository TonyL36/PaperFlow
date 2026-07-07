import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("usePdfViewport render ordering", () => {
  it("marks the page as rendered as soon as the render task is scheduled", () => {
    const source = readFileSync(resolve(__dirname, "usePdfViewport.ts"), "utf8");
    const renderTaskIndex = source.indexOf("const task = page.render({ canvasContext: ctx, viewport });");
    const renderPromiseIndex = source.indexOf("await task.promise;", renderTaskIndex);
    const renderedIndex = source.indexOf("setRenderedMainPages(", renderTaskIndex);
    const textContentIndex = source.indexOf("await page.getTextContent()", renderTaskIndex);

    expect(renderTaskIndex).toBeGreaterThan(-1);
    expect(renderPromiseIndex).toBeGreaterThan(-1);
    expect(renderedIndex).toBeGreaterThan(-1);
    expect(textContentIndex).toBeGreaterThan(-1);
    expect(renderedIndex).toBeGreaterThan(renderTaskIndex);
    expect(renderedIndex).toBeLessThan(renderPromiseIndex);
    expect(renderedIndex).toBeLessThan(textContentIndex);
  });
});
