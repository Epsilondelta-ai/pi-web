import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeMirrorLanguageExtension } from "./editor/file-editor";
import { filePreviewMethods, setCodeMirrorFileEditorLoaderForTest } from "./editor/file-preview-methods";
import { inputMethods } from "./input/input-methods";
import { speechMethods } from "./input/speech-methods";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./test-helper";
import { workspaceBootstrapMethods } from "./workspace/workspace-bootstrap-methods";

describe("performance split coverage", () => {
  beforeEach(installPiAppFixture);
  afterEach(async () => {
    cleanupPiAppFixture();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("covers lightweight input fallbacks before lazy speech loads", async () => {
    const app = await connectPiApp();
    const originalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: () => { throw new Error("blocked"); } } });
    expect(app.isWhisperModelCached("tiny")).toBe(false);
    Object.defineProperty(window, "localStorage", { configurable: true, value: originalStorage });

    const deleteWhisperModel = vi.fn();
    vi.doMock("./input/speech-methods", () => ({ speechMethods: { deleteWhisperModel } }));
    await inputMethods.deleteWhisperModel.call(app);
    expect(deleteWhisperModel).toHaveBeenCalled();
    vi.doUnmock("./input/speech-methods");
  });

  it("covers speech control without a mic button", async () => {
    const app = await connectPiApp();
    app.micButton = null;
    expect(() => speechMethods.syncSpeechInputControls.call(app)).not.toThrow();
  });

  it("covers editor language fallback without a file path", () => {
    expect(codeMirrorLanguageExtension({})).toEqual([]);
  });

  async function renderPreviewWithFailingEditor({ stale = false, mismatch = false, connected = true, thrown = new Error("editor failed") as any } = {}) {
    const container = document.createElement("div");
    document.body.append(container);
    const state: any = {
      file: { path: "bad.ts", mime: "text/typescript", previewKind: "text", content: "x" },
      mode: "text",
      cleanContent: "x",
      originalContent: "x",
    };
    const app: any = { filePreview: state, querySelector: () => null, saveFilePreview: vi.fn() };
    setCodeMirrorFileEditorLoaderForTest(async () => ({
      CodeMirrorFileEditor: class {
        constructor() { throw thrown; }
      },
    }));
    Object.assign(app, filePreviewMethods);
    const modal = document.createElement("div");
    modal.dataset.filePreview = "";
    modal.innerHTML = `<div class="fp-head"><strong class="fp-path"></strong><small></small><button data-action="save-file-preview"></button><button data-action="toggle-file-preview-mode"></button></div>`;
    const body = document.createElement("div");
    body.className = "fp-body";
    modal.append(body);
    if (connected) document.body.append(modal);
    app.querySelector = (selector: string) => selector === "[data-file-preview]" ? modal : null;
    app.destroyFilePreviewEditor = vi.fn();
    app.renderFilePreviewBody();
    if (stale) state.editorLoadToken = Symbol("stale");
    if (mismatch) app.filePreview = {};
    expect(state.editorReady).toBeTruthy();
    await state.editorReady;
    await Promise.resolve();
    setCodeMirrorFileEditorLoaderForTest(undefined as any);
    return body.textContent || "";
  }

  it("shows lazy editor import errors when preview still matches", async () => {
    await expect(renderPreviewWithFailingEditor()).resolves.toContain("editor failed");
    await expect(renderPreviewWithFailingEditor({ thrown: "string failure" })).resolves.toContain("string failure");
    await expect((async () => {
      const text = await renderPreviewWithFailingEditor();
      return text;
    })()).resolves.toContain("editor failed");
  });

  it("covers workspace tree lazy mount guards and invalid initial files", async () => {
    const app = await connectPiApp();
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);

    const root = document.createElement("div");
    root.dataset.workspaceTreeRoot = "";
    root.dataset.initialFiles = "not json";
    app.append(root);
    app.workspaceTreeMounting = true;
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.workspaceTreeMounting = false;
    app.workspaceTreeMounted = true;
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.workspaceTreeMounted = false;
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    expect(app.workspaceTreeMounted).toBe(true);
    app.workspaceTreeMounted = false;
    root.dataset.initialFiles = "";
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    expect(app.workspaceTreeMounted).toBe(true);
    app.workspaceTreeRoot?.unmount?.();
    app.workspaceTreeMounted = false;
    root.remove();
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.append(root);
    app.workspaceTreeMounted = false;
    const mounting = workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    root.remove();
    await mounting;
    app.workspaceTreeRoot?.unmount?.();
    app.workspaceTreeMounted = false;
  });

  it("covers initial speech control branches", async () => {
    const app = await connectPiApp();
    app.speechMethodsLoaded = true;
    await app.ensureSpeechMethods();
    app.speechListening = true;
    app.enableSpeechInput = true;
    app.syncSpeechInputControls();
    expect(app.micButton.getAttribute("aria-pressed")).toBe("true");
    app.speechListening = false;
    app.syncSpeechInputControls();
    expect(app.micButton.getAttribute("aria-pressed")).toBe("false");
    const whisperSelect = document.createElement("select");
    whisperSelect.dataset.setting = "speechInput.whisperModel";
    whisperSelect.value = "unknown-model";
    app.append(whisperSelect);
    localStorage.setItem("pi-web:whisper-model:whisper-tiny", "1");
    expect(app.isWhisperModelCached("unknown-model")).toBe(true);
    const localWhisper = app.querySelector("[data-setting='speechInput.useLocalWhisper']") as HTMLInputElement;
    localStorage.removeItem("pi-web:whisper-model:whisper-tiny");
    localWhisper.checked = true;
    expect(app.refreshWhisperModelRequirement()).toBe(false);
    expect(app.querySelector("[data-action='download-whisper-model']")?.dataset.missing).toBe("true");
    localWhisper.checked = false;
    expect(app.refreshWhisperModelRequirement()).toBe(true);
    expect(app.querySelector("[data-action='download-whisper-model']")?.dataset.missing).toBe("false");
    app.querySelectorAll("[data-setting='speechInput.whisperModel']").forEach((item) => item.remove());
    app.whisperModel = "";
    expect(app.selectedWhisperModel()).toBe("tiny-q5");
    app.querySelector("[data-action='download-whisper-model']")?.remove();
    app.querySelector("[data-settings-form] button[type='submit']")?.remove();
    localWhisper.remove();
    expect(app.refreshWhisperModelRequirement()).toBe(true);
  });
});
