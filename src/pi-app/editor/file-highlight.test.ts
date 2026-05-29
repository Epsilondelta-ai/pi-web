// @ts-nocheck
import { describe, expect, it } from "vitest";
import { languageForFile, renderHighlightedCode } from "./file-highlight";

describe("file highlighting", () => {
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

  it("escapes source without loading a highlighter dependency", async () => {
    await expect(renderHighlightedCode("<x>&", { path: "README" })).resolves.toBe("&lt;x&gt;&amp;");
    await expect(renderHighlightedCode("const x = 1", { path: "main.ts" })).resolves.toBe("const x = 1");
  });
});
