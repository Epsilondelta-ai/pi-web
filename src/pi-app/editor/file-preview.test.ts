import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../shared/api/api";
import "../index";

vi.mock("../../shared/api/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api/api")>("../../shared/api/api");
  return {
    ...actual,
    getWorkspaceFile: vi.fn(),
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

async function renderPreview(app, file) {
  app.renderFilePreview(file);
  await app.filePreview?.editorReady;
  app.apiConnected = true;
}

async function dispatchEditorChange(app, text: string) {
  const view = app.filePreview.editor.view;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  await new Promise((resolve) => setTimeout(resolve, 0));
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

  it("renders editable text files in CodeMirror and tracks dirty state", async () => {
    const app = mountPreview();
    await renderPreview(app, {
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

    await dispatchEditorChange(app, "const answer = 2;");

    expect(app.filePreview.dirty).toBe(true);
    expect(editor.querySelector(".cm-gitChangeGutter")).toBeTruthy();
    expect(editor.querySelector(".cm-git-modified")).toBeTruthy();
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe("save *");
    expect(app.querySelector(".fp-head small").textContent).toContain("modified");
  });

  it("focuses the editor after opening a text file", async () => {
    const app = mountPreview();
    await renderPreview(app, { path: "new-file.txt", mime: "text/plain", previewKind: "text", content: "" });

    expect(app.filePreview.editor.view.hasFocus).toBe(true);
  });

  it("searches file content with highlighted next and previous matches", async () => {
    const app = mountPreview();
    await renderPreview(app, { path: "demo.txt", mime: "text/plain", previewKind: "text", content: "alpha beta alpha" });

    const input = app.querySelector<HTMLInputElement>(".fp-editor-search input");
    input!.value = "alpha";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    app.querySelector<HTMLButtonElement>("[aria-label='next search match']")!.click();

    expect(app.querySelector(".fp-editor-search")).toBeTruthy();
    expect(app.filePreview.editor.view.state.selection.main.from).toBe(0);

    app.querySelector<HTMLButtonElement>("[aria-label='next search match']")!.click();
    expect(app.filePreview.editor.view.state.selection.main.from).toBe(11);

    app.querySelector<HTMLButtonElement>("[aria-label='previous search match']")!.click();
    expect(app.filePreview.editor.view.state.selection.main.from).toBe(0);
  });

  it("shows added and deleted git gutter marker types", async () => {
    const app = mountPreview();
    await renderPreview(app, { path: "new.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;", originalContent: "" });
    expect(app.querySelector(".cm-git-added")).toBeTruthy();

    await renderPreview(app, { path: "short.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;\n", originalContent: "let x = 1;\nlet y = 2;\n" });
    expect(app.querySelector(".cm-git-deleted")).toBeTruthy();
  });

  it("shows git-based gutter markers without treating opened git changes as unsaved", async () => {
    const app = mountPreview();
    await renderPreview(app, {
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

  it("does not save a preview after the active workspace changes", async () => {
    const app = mountPreview();
    await renderPreview(app, { path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    await dispatchEditorChange(app, "let x = 2;");
    app.dataset.activeWorkspaceId = "workspace-2";

    await app.saveFilePreview();

    expect(api.saveWorkspaceFile).not.toHaveBeenCalled();
    expect(app.filePreview.dirty).toBe(true);
    expect(app.querySelector("[data-action='save-file-preview']").textContent).toBe("workspace changed");
  });

  it("ignores file previews that finish loading after a workspace switch", async () => {
    const app = mountPreview();
    vi.mocked(api.getWorkspaceFile).mockResolvedValueOnce({
      path: "demo.js",
      mime: "text/javascript",
      previewKind: "text",
      content: "let x = 1;",
    });

    const loading = app.openFilePath("demo.js");
    app.dataset.activeWorkspaceId = "workspace-2";
    await loading;

    expect(api.getWorkspaceFile).toHaveBeenCalledWith("workspace-1", "demo.js");
    expect(app.filePreview.file.previewKind).toBe("loading");
  });

  it("saves current CodeMirror document and keeps edits after save failure", async () => {
    const app = mountPreview();
    vi.mocked(api.saveWorkspaceFile).mockRejectedValueOnce(new Error("permission denied"));
    await renderPreview(app, { path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    await dispatchEditorChange(app, "let x = 2;");

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
    await renderPreview(app, { path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    await dispatchEditorChange(app, "let x = 2;");

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
    await renderPreview(app, { path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });
    await dispatchEditorChange(app, "let x = 2;");

    const saving = app.saveFilePreview();
    await dispatchEditorChange(app, "let x = 3;");
    resolveSave({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 2;" });
    await saving;

    expect(app.filePreview.editor.getValue()).toBe("let x = 3;");
    expect(app.filePreview.cleanContent).toBe("let x = 2;");
    expect(app.filePreview.dirty).toBe(true);
  });

  it("asks before switching files with unsaved changes and guards reload", async () => {
    const app = mountPreview();
    app.installFilePreviewUnloadGuard();
    await renderPreview(app, { path: "a.txt", mime: "text/plain", previewKind: "text", content: "a" });
    await dispatchEditorChange(app, "changed");
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    const clean = app.confirmCleanFilePreview();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(clean).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith("Discard unsaved file changes?");
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens a successful file preview from the backend", async () => {
    const app = mountPreview();
    vi.mocked(api.getWorkspaceFile).mockResolvedValueOnce({ path: "ok.txt", mime: "text/plain", previewKind: "text", content: "ok" });
    await app.openFilePath("ok.txt");
    expect(api.getWorkspaceFile).toHaveBeenCalledWith("workspace-1", "ok.txt");
    expect(app.filePreview.file.path).toBe("ok.txt");
  });

  it("covers file open guards, errors, svg toggle, read-only labels, and save guards", async () => {
    const app = mountPreview();
    vi.mocked(api.getWorkspaceFile).mockClear();
    app.apiConnected = false;
    await app.openFilePath("skip.txt");
    expect(api.getWorkspaceFile).not.toHaveBeenCalled();
    app.apiConnected = true;
    app.confirmCleanFilePreview = vi.fn(() => false);
    await app.openFilePath("skip.txt");
    expect(api.getWorkspaceFile).not.toHaveBeenCalled();

    app.confirmCleanFilePreview = vi.fn(() => true);
    vi.mocked(api.getWorkspaceFile).mockImplementationOnce(async () => { throw new Error("read failed"); });
    app.setConnection = vi.fn();
    const button = document.createElement("button");
    button.className = "tree-node selected";
    button.dataset.filePath = "bad.txt";
    app.append(button);
    await app.openFile(button);
    expect(button.classList.contains("selected")).toBe(true);
    expect(app.querySelector(".fp-body").textContent).toBe("read failed");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    app.renderFilePreview({ path: "icon.svg", mime: "image/svg+xml", previewKind: "image", dataUrl: "data:image/svg+xml;base64,x", content: "<svg/>" });
    expect(app.querySelector("[data-action='toggle-file-preview-mode']").hidden).toBe(false);
    expect(app.querySelector(".fp-body img").alt).toBe("icon.svg");
    app.toggleFilePreviewMode();
    expect(app.querySelector("[data-file-preview-editor]").getAttribute("aria-label")).toBe("edit icon.svg");
    app.toggleFilePreviewMode();
    expect(app.querySelector(".fp-body img")).toBeTruthy();

    app.renderFilePreview({ path: "loading.txt", previewKind: "loading" });
    expect(app.querySelector(".fp-body").textContent).toBe("loading preview…");
    await renderPreview(app, { path: "readonly.txt", mime: "text/plain", previewKind: "text", content: "abc", truncated: true });
    expect(app.querySelector("[data-file-preview-editor]").getAttribute("aria-label")).toBe("view readonly.txt");
    const realSaveFilePreview = app.saveFilePreview;
    app.saveFilePreview = vi.fn();
    app.querySelector(".cm-content")?.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    app.saveFilePreview = realSaveFilePreview;
    app.confirmCleanFilePreview = vi.fn(() => false);
    app.closeFilePreview();
    expect(app.querySelector("[data-file-preview]").hidden).toBe(false);
    app.confirmCleanFilePreview = vi.fn(() => true);
    app.filePreview.editor = undefined;
    await app.saveFilePreview();
    app.dataset.activeWorkspaceId = "";
    await app.saveFilePreview();
    app.dataset.activeWorkspaceId = "workspace-1";
    app.filePreview = undefined;
    app.renderFilePreviewBody();
    app.toggleFilePreviewMode();
    app.filePreview = { file: { path: "x.txt", previewKind: "text", content: "x" }, editor: null };
    await app.saveFilePreview();
    app.apiConnected = false;
    app.filePreview = { file: { path: "x.txt", previewKind: "text", content: "x" }, editor: { getValue: () => "x" } };
    await app.saveFilePreview();
    app.apiConnected = true;
    app.renderFilePreview({ path: "nameless-image", mime: "image/png", previewKind: "image", dataUrl: "data:image/png;base64,x" });
    expect(app.querySelector(".fp-body img").alt).toBe("nameless-image");
    app.renderFilePreview({ path: "broken.png", mime: "image/png", previewKind: "image" });
    expect(app.querySelector(".fp-body").textContent).toContain("이미지는");
    app.installFilePreviewUnloadGuard();
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
    app.querySelector("[data-file-preview]").remove();
    await renderPreview(app, { path: "missing-modal.txt", previewKind: "text", content: "x" });
    expect(app.hasDirtyFilePreview()).toBe(false);
    await app.saveFilePreview();
  });

  it("keeps image, large, and unsupported files on preview fallback paths", async () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "logo.png", mime: "image/png", previewKind: "image", dataUrl: "data:image/png;base64,aa" });
    expect(app.querySelector(".fp-body img")).toBeTruthy();
    expect(app.querySelector("[data-file-preview-editor]")).toBeFalsy();

    await renderPreview(app, { path: "big.txt", mime: "text/plain", previewKind: "text", content: "abc", truncated: true });
    expect(app.querySelector("[data-file-preview-editor] .cm-editor")).toBeTruthy();
    expect(app.querySelector("[data-action='save-file-preview']").hidden).toBe(true);

    app.renderFilePreview({ path: "app.bin", mime: "application/octet-stream", previewKind: "unsupported" });
    expect(app.querySelector(".fp-body").textContent).toContain("미리보기를 지원하지 않습니다");
  });

  it("clears discarded dirty state when closing preview", async () => {
    const app = mountPreview();
    await renderPreview(app, { path: "a.txt", mime: "text/plain", previewKind: "text", content: "a" });
    await dispatchEditorChange(app, "changed");

    app.closeFilePreview();

    expect(app.filePreview).toBeUndefined();
    expect(app.hasDirtyFilePreview()).toBe(false);
  });
});
