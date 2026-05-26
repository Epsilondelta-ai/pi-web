import { describe, expect, it } from "vitest";
import { fullToolBody, isLargeToolBody, renderToolBody, renderToolBodyPreview, storeFullToolBody } from "./tool-output-rendering";

describe("tool output rendering", () => {
  it("renders small output directly and stores only large full bodies", () => {
    expect(isLargeToolBody("x")).toBe(false);
    expect(renderToolBodyPreview("<a>ok</a>")).toContain("ansi-green");
    expect(renderToolBody("<r>bad</r>", { collapsed: true })).toContain("ansi-red");

    const element = document.createElement("pre");
    storeFullToolBody(element, "small");
    expect(fullToolBody(element)).toBe("");
    storeFullToolBody(element, "x".repeat(16_001));
    expect(element.dataset.largeToolBody).toBe("true");
    expect(fullToolBody(element)).toHaveLength(16_001);
    expect(fullToolBody(null)).toBe("");
  });

  it("renders large collapsed output as a preview with omitted count", () => {
    const body = `<a>${"x".repeat(16_010)}</a>`;
    expect(isLargeToolBody(body)).toBe(true);
    const preview = renderToolBody(body, { collapsed: true });
    expect(preview).toContain("tc-body-notice");
    expect(preview).toContain("characters omitted");
    expect(preview).toContain("show full output");
    expect(renderToolBody(body)).not.toContain("tc-body-notice");
  });
});
