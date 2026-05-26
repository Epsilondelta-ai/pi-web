import { describe, expect, it } from "vitest";
import { fallbackValue, present } from "./fallbacks";

describe("fallback helpers", () => {
  it("normalizes fallback and present values", () => {
    expect(fallbackValue("", "x")).toBe("x");
    expect(fallbackValue("y", "x")).toBe("y");
    expect(fallbackValue(0, 1)).toBe(1);
    expect(fallbackValue(2, 1)).toBe(2);
    expect(present(null)).toBeUndefined();
    expect(present(undefined)).toBeUndefined();
    expect(present("x")).toBe("x");
  });
});
