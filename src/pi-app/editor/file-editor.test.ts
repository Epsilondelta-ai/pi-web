import { describe, expect, it, vi } from "vitest";
import { CodeMirrorFileEditor, codeMirrorLanguageExtension, codeMirrorLanguageName, editableFileState } from "./file-editor";

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
    expect(editableFileState({ previewKind: "unsupported", content: "bytes" }).reason).toBe("binary");
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
    expect(codeMirrorLanguageName({ path: "component.jsx" })).toBe("javascript");
    expect(codeMirrorLanguageName({ path: "component.mdx" })).toBe("markdown");
    expect(codeMirrorLanguageName({ path: "style.scss" })).toBe("css");
    expect(codeMirrorLanguageName({ path: "page.astro" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "notebook.ipynb" })).toBe("json");
  });

  it("uses filename and mime hints, then falls back to plain text", () => {
    expect(codeMirrorLanguageName({ path: "Dockerfile" })).toBe("dockerfile");
    expect(codeMirrorLanguageName({ path: "Makefile" })).toBe("makefile");
    expect(codeMirrorLanguageName({ path: "Justfile" })).toBe("makefile");
    expect(codeMirrorLanguageName({ path: ".env" })).toBe("shell");
    expect(codeMirrorLanguageName({ path: "icon.svg", mime: "image/svg+xml" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "feed.xml", mime: "application/rss+xml" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "index", mime: "text/html" })).toBe("html");
    expect(codeMirrorLanguageName({ path: "style", mime: "text/css" })).toBe("css");
    expect(codeMirrorLanguageName({ path: "data", mime: "application/json" })).toBe("json");
    expect(codeMirrorLanguageName({ path: "notes.unknown" })).toBe("text");
    expect(codeMirrorLanguageName({ path: "" })).toBe("text");
    expect(codeMirrorLanguageName({ path: "archive.tar.gz" })).toBe("text");
  });

  it("creates language extensions for each supported language", () => {
    for (const path of ["app.js", "app.tsx", "data.json", "README.md", "index.html", "style.css", "main.go", ".env"]) {
      expect(codeMirrorLanguageExtension({ path }).length).toBeGreaterThan(0);
    }
    expect(codeMirrorLanguageExtension({ path: "app.jsx" }).length).toBeGreaterThan(0);
    expect(codeMirrorLanguageExtension({ path: "script.bash" }).length).toBeGreaterThan(0);
    expect(codeMirrorLanguageExtension({ path: "Dockerfile" })).toEqual([]);
    expect(codeMirrorLanguageExtension({ path: "unknown" })).toEqual([]);
  });
});

describe("CodeMirrorFileEditor", () => {
  it("mounts, reports changes, handles save key, updates, focuses, and destroys", () => {
    const parent = document.createElement("div");
    const onChange = vi.fn();
    const onSave = vi.fn();
    const editor = new CodeMirrorFileEditor(parent, {
      file: { path: "demo.ts", previewKind: "text" },
      content: "let x = 1;",
      onChange,
      onSave,
    });

    expect(parent.querySelector(".fp-editor-search")).toBeTruthy();
    const searchInput = parent.querySelector<HTMLInputElement>(".fp-editor-search input")!;
    parent.querySelector<HTMLButtonElement>("[aria-label='next search match']")!.click();
    searchInput.value = "let";
    searchInput.dispatchEvent(new Event("input"));
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    parent.querySelector<HTMLButtonElement>("[aria-label='next search match']")!.click();
    parent.querySelector<HTMLButtonElement>("[aria-label='previous search match']")!.click();
    expect(editor.getValue()).toBe("let x = 1;");
    const emptyParent = document.createElement("div");
    const emptyEditor = new CodeMirrorFileEditor(emptyParent, { file: { path: "empty.txt", previewKind: "text" }, content: "", originalContent: "abc" });
    expect(emptyParent.querySelector(".cm-git-deleted")).toBeTruthy();
    const insertParent = document.createElement("div");
    const insertEditor = new CodeMirrorFileEditor(insertParent, { file: { path: "insert.txt", previewKind: "text" }, content: "abc", originalContent: "ac" });
    expect(insertParent.querySelector(".cm-git-added")).toBeTruthy();
    insertEditor.destroy();
    emptyEditor["view"].dispatch({ changes: { from: 0, insert: "x" } });
    emptyEditor.destroy();
    editor["view"].dispatch({ changes: { from: 8, insert: "2" } });
    expect(onChange).toHaveBeenCalledWith("let x = 21;");
    parent.querySelector(".cm-content")?.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    parent.querySelector(".cm-content")?.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));

    const oldToolbar = parent.querySelector(".fp-editor-search")!;
    editor.focus();
    editor.update({ file: { path: "demo.css", previewKind: "text" }, content: "body{}", readOnly: true, originalContent: "body{color:red}" });
    expect(editor.getValue()).toBe("body{}");
    editor.destroy();
    oldToolbar.querySelector("input")!.dispatchEvent(new Event("input"));
    expect(editor.getValue()).toBe("");
    expect(parent.children).toHaveLength(0);
  });
});
