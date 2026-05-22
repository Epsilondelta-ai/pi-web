import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import "../index";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    saveWorkspaceFile: vi.fn(),
  };
});

function mountPreview() {
  document.body.innerHTML = `
    <pi-app data-active-workspace-id="workspace-1">
      <div class="file-preview-modal" data-file-preview hidden>
        <div class="fp-dialog">
          <div class="fp-head">
            <div><strong class="fp-path">file</strong><small></small></div>
            <div class="fp-actions">
              <button type="button" data-action="save-file-preview" hidden>save</button>
              <button type="button" data-action="toggle-file-preview-mode" hidden>text</button>
              <button type="button" data-action="close-file-preview">×</button>
            </div>
          </div>
          <div class="fp-body"></div>
        </div>
      </div>
    </pi-app>
  `;
  const app = document.querySelector("pi-app");
  app.apiConnected = true;
  app.loadWorkspaceMeta = vi.fn();
  return app;
}

function dispatchEditorChange(app, text: string) {
  const view = app.filePreview.editor.view;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

describe("file preview CodeMirror editor", () => {
  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders editable text files in CodeMirror and tracks dirty state", () => {
    const app = mountPreview();
    app.renderFilePreview({
      path: "src/demo.ts",
      mime: "text/typescript",
      previewKind: "text",
      content: "const answer = 1;",
    });

    const preview = app.querySelector("[data-file-preview]");
    const editor = app.querySelector("[data-file-preview-editor]");
    const save = app.querySelector("[data-action='save-file-preview']");

    expect(preview.hidden).toBe(false);
    expect(editor.querySelector(".cm-editor")).toBeTruthy();
    expect(editor.dataset.language).toBe("typescript");
    expect(app.filePreview.editor.getValue()).toBe("const answer = 1;");
    expect(save.hidden).toBe(false);
    expect(save.disabled).toBe(true);

    dispatchEditorChange(app, "const answer = 2;");

    expect(app.filePreview.dirty).toBe(true);
    expect(editor.querySelector(".cm-gitChangeGutter")).toBeTruthy();
    expect(editor.querySelector(".cm-git-modified")).toBeTruthy();
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe("save *");
    expect(app.querySelector(".fp-head small").textContent).toContain("modified");
  });

  it("shows added and deleted git gutter marker types", () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "new.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;", originalContent: "" });
    expect(app.querySelector(".cm-git-added")).toBeTruthy();

    app.renderFilePreview({ path: "short.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;\n", originalContent: "let x = 1;\nlet y = 2;\n" });
    expect(app.querySelector(".cm-git-deleted")).toBeTruthy();
  });

  it("shows git-based gutter markers without treating opened git changes as unsaved", () => {
    const app = mountPreview();
    app.renderFilePreview({
      path: "demo.js",
      mime: "text/javascript",
      previewKind: "text",
      content: "let x = 2;",
      originalContent: "let x = 1;",
      gitStatus: "tracked",
    });

    expect(app.filePreview.dirty).toBe(false);
    expect(app.filePreview.cleanContent).toBe("let x = 2;");
    expect(app.filePreview.originalContent).toBe("let x = 1;");
    expect(app.querySelector(".cm-git-modified")).toBeTruthy();
    expect(app.querySelector("[data-action='save-file-preview']").disabled).toBe(true);
  });

  it("saves current CodeMirror document and keeps edits after save failure", async () => {
    const app = mountPreview();
    vi.mocked(api.saveWorkspaceFile).mockRejectedValueOnce(new Error("permission denied"));
    app.renderFilePreview({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    dispatchEditorChange(app, "let x = 2;");

    await app.saveFilePreview();

    expect(api.saveWorkspaceFile).toHaveBeenCalledWith("workspace-1", "demo.js", "let x = 2;");
    expect(app.filePreview.editor.getValue()).toBe("let x = 2;");
    expect(app.filePreview.dirty).toBe(true);
    expect(window.alert).toHaveBeenCalledWith("permission denied");
  });

  it("updates clean baseline after save success", async () => {
    const app = mountPreview();
    vi.mocked(api.saveWorkspaceFile).mockResolvedValueOnce({
      path: "demo.js",
      mime: "text/javascript",
      previewKind: "text",
      content: "let x = 2;",
    });
    app.renderFilePreview({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    dispatchEditorChange(app, "let x = 2;");

    await app.saveFilePreview();

    expect(app.filePreview.dirty).toBe(false);
    expect(app.filePreview.cleanContent).toBe("let x = 2;");
    expect(app.filePreview.editor.getValue()).toBe("let x = 2;");
    expect(app.querySelector("[data-action='save-file-preview']").textContent).toBe("saved");
  });

  it("keeps newer edits typed while save is in flight", async () => {
    const app = mountPreview();
    let resolveSave: (file: unknown) => void = () => undefined;
    vi.mocked(api.saveWorkspaceFile).mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }) as never);
    app.renderFilePreview({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    dispatchEditorChange(app, "let x = 2;");

    const saving = app.saveFilePreview();
    dispatchEditorChange(app, "let x = 3;");
    resolveSave({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 2;" });
    await saving;

    expect(app.filePreview.editor.getValue()).toBe("let x = 3;");
    expect(app.filePreview.cleanContent).toBe("let x = 2;");
    expect(app.filePreview.dirty).toBe(true);
  });

  it("asks before switching files with unsaved changes and guards reload", () => {
    const app = mountPreview();
    app.installFilePreviewUnloadGuard();
    app.renderFilePreview({ path: "a.txt", mime: "text/plain", previewKind: "text", content: "a" });
    dispatchEditorChange(app, "changed");
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    const clean = app.confirmCleanFilePreview();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(clean).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith("Discard unsaved file changes?");
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps image, large, and unsupported files on preview fallback paths", () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "logo.png", mime: "image/png", previewKind: "image", dataUrl: "data:image/png;base64,aa" });
    expect(app.querySelector(".fp-body img")).toBeTruthy();
    expect(app.querySelector("[data-file-preview-editor]")).toBeFalsy();

    app.renderFilePreview({ path: "big.txt", mime: "text/plain", previewKind: "text", content: "abc", truncated: true });
    expect(app.querySelector("[data-file-preview-editor] .cm-editor")).toBeTruthy();
    expect(app.querySelector("[data-action='save-file-preview']").hidden).toBe(true);

    app.renderFilePreview({ path: "app.bin", mime: "application/octet-stream", previewKind: "unsupported" });
    expect(app.querySelector(".fp-body").textContent).toContain("미리보기를 지원하지 않습니다");
  });

  it("clears discarded dirty state when closing preview", () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "a.txt", mime: "text/plain", previewKind: "text", content: "a" });
    dispatchEditorChange(app, "changed");

    app.closeFilePreview();

    expect(app.filePreview).toBeUndefined();
    expect(app.hasDirtyFilePreview()).toBe(false);
  });
});
