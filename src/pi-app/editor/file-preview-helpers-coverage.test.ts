import { describe, expect, it } from "vitest";
import {
  defaultPreviewMode,
  errorMessage,
  fallbackMessage,
  gitOriginalContent,
  imagePreviewNode,
  setPreviewHeader,
  truncatedSuffix,
  updatePreviewActions,
} from "./file-preview-methods";

function previewShell() {
  const preview = document.createElement("div");
  preview.innerHTML = `
    <span class="fp-path"></span><small></small>
    <button data-action="save-file-preview"></button>
    <button data-action="toggle-file-preview-mode"></button>
  `;
  return preview;
}

describe("file preview helper coverage", () => {
  it("covers preview action and fallback helper branches", () => {
    const preview = previewShell();
    expect(() => updatePreviewActions(null, null)).not.toThrow();
    expect(() => updatePreviewActions(preview, {})).not.toThrow();
    setPreviewHeader(preview, { mime: "text/plain", path: "", truncated: true, dirty: false, saveStatus: "saved" });
    expect(preview.querySelector(".fp-path").textContent).toBe("file");
    updatePreviewActions(preview, { file: { path: "icon.svg", mime: "image/svg+xml", dataUrl: "data:", content: "<svg/>" }, mode: "image", dirty: true, saveStatus: "" });
    expect(preview.querySelector("[data-action='toggle-file-preview-mode']").hidden).toBe(false);
    expect(preview.querySelector("[data-action='save-file-preview']").hidden).toBe(true);
    updatePreviewActions(preview, { file: { path: "note.txt", mime: "text/plain", content: "x" }, mode: "text", dirty: false, saveStatus: "workspace changed" });
    expect(preview.querySelector("[data-action='save-file-preview']").textContent).toBe("workspace changed");
    updatePreviewActions(preview, { file: { path: "note.txt", mime: "text/plain", content: "x" }, mode: "text", dirty: false, saveStatus: "saved" });
    expect(preview.querySelector("[data-action='save-file-preview']").textContent).toBe("saved");
    expect(gitOriginalContent({ originalContent: "old", content: "new" })).toBe("old");
    expect(gitOriginalContent({ content: "new" })).toBe("new");
    expect(gitOriginalContent(null)).toBe("");
    expect(defaultPreviewMode({ previewKind: "image", dataUrl: "data:", mime: "image/png" })).toBe("image");
    expect(defaultPreviewMode({ previewKind: "text", mime: "text/plain" })).toBe("text");
    expect(defaultPreviewMode({ previewKind: "image", mime: "image/png" })).toBe("unsupported");
    expect(truncatedSuffix({ truncated: true })).toContain("truncated");
    expect(truncatedSuffix({ truncated: false })).toBe("");
    expect(imagePreviewNode({ dataUrl: "data:", path: "" }).alt).toBe("file preview");
    expect(fallbackMessage({ previewKind: "error", content: "bad" })).toBe("bad");
    expect(fallbackMessage({ truncated: true })).toContain("너무 커서");
    expect(fallbackMessage({ previewKind: "image" })).toContain("이미지는");
    expect(fallbackMessage({})).toContain("지원하지");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
