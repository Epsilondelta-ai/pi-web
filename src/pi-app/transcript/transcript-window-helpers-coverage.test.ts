// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { isElement, measuredHeight, numericPixelValue, transcriptIndex } from "./transcript-window-methods";

describe("transcript window helper coverage", () => {
  it("covers node and measurement fallbacks", () => {
    expect(isElement(null)).toBe(false);
    expect(isElement(document.createElement("div"))).toBe(true);
    expect(numericPixelValue(undefined)).toBe(0);
    expect(numericPixelValue("bad")).toBe(0);
    expect(numericPixelValue("12.5px")).toBe(12.5);
    const node = document.createElement("div");
    node.getBoundingClientRect = vi.fn(() => ({ height: 5 }));
    vi.stubGlobal("getComputedStyle", () => ({ marginTop: "2px", marginBottom: "3px" }));
    expect(measuredHeight([node])).toBe(10);
    vi.unstubAllGlobals();
    const fallback = document.createElement("div");
    fallback.getBoundingClientRect = undefined;
    Object.defineProperty(fallback, "offsetHeight", { value: 7 });
    expect(measuredHeight([fallback])).toBe(7);
    const item = { id: 1 };
    expect(transcriptIndex(undefined, item)).toBe(-1);
    expect(transcriptIndex([item], item)).toBe(0);
  });
});
