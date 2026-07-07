import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("top nav responsive contract", () => {
  it("introduces compact/collapsed classes and a More menu structure", () => {
    const source = readFileSync(resolve(__dirname, "TopNav.tsx"), "utf8");

    expect(source).toMatch(/type\s+TopNavLayoutMode\s*=\s*"full"\s*\|\s*"compact"\s*\|\s*"collapsed"/);
    expect(source).toMatch(/pf-topnav__primary/);
    expect(source).toMatch(/pf-topnav__secondary/);
    expect(source).toMatch(/pf-topnav__more-trigger/);
    expect(source).toMatch(/pf-topnav__more-menu/);
  });

  it("keeps favorites and messages pinned outside More in compact and collapsed layouts", () => {
    const source = readFileSync(resolve(__dirname, "TopNav.tsx"), "utf8");

    expect(source).toMatch(/const\s+PINNED_SECONDARY_LINKS:\s*TopNavItem\[\]\s*=\s*\[/);
    expect(source).toMatch(/label:\s*"Favorites"/);
    expect(source).toMatch(/label:\s*"Messages"/);
    expect(source).toMatch(/const\s+inlineSecondaryLinks\s*=\s*layoutMode === "full"\s*\?/);
    expect(source).toMatch(/PINNED_SECONDARY_LINKS/);
    expect(source).toMatch(/const\s+overflowSecondaryLinks\s*=\s*AUTH_SECONDARY_LINKS\.filter/);
  });

  it("adds More menu state, close handlers, and grouped menu sections", () => {
    const source = readFileSync(resolve(__dirname, "TopNav.tsx"), "utf8");

    expect(source).toMatch(/const\s+\[menuOpen,\s*setMenuOpen\]\s*=\s*useState\(false\)/);
    expect(source).toMatch(/document\.addEventListener\("mousedown"/);
    expect(source).toMatch(/window\.addEventListener\("keydown"/);
    expect(source).toMatch(/event\.key\s*===\s*"Escape"/);
    expect(source).toMatch(/pf-topnav__more-group/);
  });

  it("adds responsive top nav CSS contracts", () => {
    const cssSource = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");

    expect(cssSource).toMatch(/\.pf-topnav__primary\s*\{/);
    expect(cssSource).toMatch(/\.pf-topnav--compact\s+\.pf-navtile__label\s*\{[\s\S]*display:\s*none/);
    expect(cssSource).toMatch(/\.pf-topnav__more-menu\s*\{/);
    expect(cssSource).toMatch(/@media\s*\(max-width:\s*1240px\)/);
  });
});
