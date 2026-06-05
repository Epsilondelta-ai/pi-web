import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("default plugin sidebar styles", () => {
  it("keeps the git viewer sidebar closed before plugin styles load", () => {
    const cssPath: string = "src/styles/parts/tree-preview-status.css";
    const css: string = readFileSync(cssPath, "utf8");

    expect(css).toContain("[data-git-viewer-sidebar]");
    expect(css).toContain("transform: translateX(100%)");
    expect(css).toContain("[data-git-viewer-sidebar][data-open=\"true\"] { transform: translateX(0); }");
  });
});
