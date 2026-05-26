import { describe, expect, it } from "vitest";
import { fileTemplate, formatGitDate, refsTemplate } from "./git-history-methods";

describe("git history helper coverage", () => {
  it("covers fallback formatting branches", () => {
    expect(fileTemplate({})).toContain("modified");
    expect(fileTemplate({ oldPath: "old.ts", path: "new.ts", status: "renamed", additions: 2, deletions: 1 })).toContain("old.ts");
    expect(refsTemplate(undefined)).toBe("");
    expect(refsTemplate(["main", "tag"])).toContain("main");
    expect(formatGitDate(undefined)).toBe("—");
    expect(formatGitDate("not-a-date")).toBe("not-a-date");
    expect(formatGitDate("2026-01-01T00:00:00Z")).toContain("01");
  });
});
