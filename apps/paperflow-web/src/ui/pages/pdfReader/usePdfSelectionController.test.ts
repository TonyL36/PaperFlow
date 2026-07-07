import { describe, expect, it } from "vitest";
import { resolveSelectionPopoverPosition } from "./usePdfSelectionController";

describe("resolveSelectionPopoverPosition", () => {
  it("clamps the selection popover within the viewport at high zoom levels", () => {
    expect(
      resolveSelectionPopoverPosition({
        viewportWidth: 320,
        popoverWidth: 242,
        rectLeft: 276,
        rectWidth: 40,
        rectTop: 120,
        rectBottom: 148
      })
    ).toEqual({
      left: 66,
      top: 68
    });
  });

  it("falls back below the selection when there is not enough top space", () => {
    expect(
      resolveSelectionPopoverPosition({
        viewportWidth: 320,
        popoverWidth: 242,
        rectLeft: 30,
        rectWidth: 80,
        rectTop: 42,
        rectBottom: 66
      })
    ).toEqual({
      left: 12,
      top: 76
    });
  });
});
