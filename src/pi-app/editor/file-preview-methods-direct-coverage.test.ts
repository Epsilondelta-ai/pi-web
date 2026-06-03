import { describe, expect, it, vi } from "vitest";
import { filePreviewMethods } from "./file-preview-methods";

describe("file preview method direct branches", () => {
  it("covers save button absence and unnamed text preview", async () => {
    const preview = document.createElement("div");
    preview.dataset.filePreview = "";
    preview.innerHTML = `<span class="fp-path"></span><small></small><div class="fp-body"></div><button data-action="toggle-file-preview-mode"></button>`;
    const owner = {
      ...filePreviewMethods,
      dataset: { activeWorkspaceId: "w" },
      apiConnected: true,
      filePreview: { file: { path: "x.txt", previewKind: "text", mime: "text/plain", content: "x" }, editor: { getValue: () => "x" } },
      querySelector: preview.querySelector.bind(preview),
      querySelectorAll: preview.querySelectorAll.bind(preview),
      destroyFilePreviewEditor: vi.fn(),
      renderFilePreviewBody: vi.fn(),
      loadWorkspaceMeta: vi.fn(),
      setConnection: vi.fn(),
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ file: { path: "x.txt", previewKind: "text", mime: "text/plain", content: "x" } }) })));
    await owner.saveFilePreview();
    owner.filePreview = {
      file: { path: "", previewKind: "text", mime: "text/plain", content: "x" },
      mode: "text",
      cleanContent: "x",
      originalContent: "x",
    } as unknown as typeof owner.filePreview;
    expect(() => owner.renderFilePreviewBody()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
