import { describe, expect, it } from "vitest";
import { codeMirrorLanguageName, editableFileState } from "./pi-app/file-editor";

describe("editableFileState", () => {
  it("allows normal text and svg text editing", () => {
    expect(editableFileState({ previewKind: "text", content: "hello", mime: "text/plain" })).toEqual({
      editable: true,
      readOnly: false,
      reason: "editable",
    });
    expect(editableFileState({ previewKind: "image", content: "<svg />", mime: "image/svg+xml" }).editable).toBe(true);
  });

  it("rejects binary, image, large, loading, error, and missing content cases", () => {
    expect(editableFileState({ previewKind: "unsupported", mime: "application/octet-stream" }).reason).toBe("missing");
    expect(editableFileState({ previewKind: "image", mime: "image/png" }).reason).toBe("image");
    expect(editableFileState({ previewKind: "text", content: "x", truncated: true }).reason).toBe("large");
    expect(editableFileState({ previewKind: "loading" }).reason).toBe("loading");
    expect(editableFileState({ previewKind: "error", content: "denied" }).reason).toBe("error");
  });
});

describe("codeMirrorLanguageName", () => {
  it("maps common project files to CodeMirror languages", () => {
    expect(codeMirrorLanguageName({ path: "src/app.js" })).toBe("javascript");
    expect(codeMirrorLanguageName({ path: "src/app.ts" })).toBe("typescript");
    expect(codeMirrorLanguageName({ path: "src/app.tsx" })).toBe("typescript");
    expect(codeMirrorLanguageName({ path: "package.json" })).toBe("json");
    expect(codeMirrorLanguageName({ path: "README.md" })).toBe("markdown");
    expect(codeMirrorLanguageName({ path: "index.html" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "src/styles.css" })).toBe("css");
    expect(codeMirrorLanguageName({ path: "script.sh" })).toBe("shell");
    expect(codeMirrorLanguageName({ path: "main.go" })).toBe("go");
  });

  it("uses filename and mime hints, then falls back to plain text", () => {
    expect(codeMirrorLanguageName({ path: "Dockerfile" })).toBe("dockerfile");
    expect(codeMirrorLanguageName({ path: ".env" })).toBe("shell");
    expect(codeMirrorLanguageName({ path: "icon.svg", mime: "image/svg+xml" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "notes.unknown" })).toBe("text");
  });
});
