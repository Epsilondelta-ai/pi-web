// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { languageForFile, renderHighlightedCode } from "./file-highlight";
import { codeToHtml } from "shiki";

vi.mock("shiki", () => ({
  codeToHtml: vi.fn(async () => "<span>ok</span>"),
}));

describe("file highlighting", () => {
  beforeEach(() => {
    vi.mocked(codeToHtml).mockClear();
    vi.mocked(codeToHtml).mockResolvedValue("<span>ok</span>");
  });

  it("detects languages from MIME, basenames, extensions, and fallback text", () => {
    expect(languageForFile({ mime: "application/json", path: "x.txt" })).toBe("json");
    expect(languageForFile({ mime: "image/svg+xml", path: "icon.svg" })).toBe("xml");
    expect(languageForFile({ mime: "text/html", path: "index" })).toBe("html");
    expect(languageForFile({ path: "Dockerfile" })).toBe("dockerfile");
    expect(languageForFile({ path: "Makefile" })).toBe("makefile");
    expect(languageForFile({ path: "a.cjs" })).toBe("javascript");
    expect(languageForFile({ path: "a.mjs" })).toBe("javascript");
    expect(languageForFile({ path: "a.ts" })).toBe("typescript");
    expect(languageForFile({ path: "a.tsx" })).toBe("tsx");
    expect(languageForFile({ path: "a.yaml" })).toBe("yaml");
    expect(languageForFile({ path: "a.yml" })).toBe("yaml");
    expect(languageForFile({ path: "a.sh" })).toBe("shellscript");
    expect(languageForFile({ path: "a.unknown" })).toBe("text");
    expect(languageForFile({ path: "README" })).toBe("text");
    expect(languageForFile({})).toBe("text");
  });

  it("escapes plain text without loading shiki", async () => {
    await expect(renderHighlightedCode("<x>&", { path: "README" })).resolves.toBe("&lt;x&gt;&amp;");
    expect(codeToHtml).not.toHaveBeenCalled();
  });

  it("renders supported languages with shiki", async () => {
    await expect(renderHighlightedCode("const x = 1", { path: "main.ts" })).resolves.toBe("<span>ok</span>");
    expect(codeToHtml).toHaveBeenCalledWith("const x = 1", {
      lang: "typescript",
      theme: "github-dark",
      structure: "inline",
    });
  });

  it("falls back to escaped text when highlighting fails", async () => {
    vi.mocked(codeToHtml).mockRejectedValueOnce(new Error("boom"));
    await expect(renderHighlightedCode("<bad>", { path: "main.ts" })).resolves.toBe("&lt;bad&gt;");
  });
});
