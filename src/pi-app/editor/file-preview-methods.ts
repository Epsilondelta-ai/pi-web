import { getWorkspaceFile, saveWorkspaceFile } from "../../lib/api";
import { fallbackValue } from "../../lib/fallbacks";
import { CodeMirrorFileEditor, codeMirrorLanguageName, editableFileState, isTextFile } from "./file-editor";

export const filePreviewMethods = {
  async openFile(button) {
    return this.openFilePath?.(button?.dataset.filePath, button);
  },

  async openFilePath(path, button = undefined) {
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!path || !workspaceId || !this.apiConnected || !this.confirmCleanFilePreview?.()) return;
    try {
      this.querySelectorAll(".tree-node.selected").forEach((node) => node.classList.remove("selected"));
      button?.classList.add("selected");
      window.dispatchEvent(new CustomEvent("pi-workspace-tree:update", {
        detail: { files: this.workspaceFiles || [], statusMap: this.workspaceFileStatuses || {}, selectedPath: path },
      }));
      this.renderFilePreview({ path, previewKind: "loading" });
      const file = await getWorkspaceFile(workspaceId, path);
      if (this.dataset.activeWorkspaceId !== workspaceId) return;
      this.renderFilePreview(file);
    } catch (error) {
      this.renderFilePreview({ path, previewKind: "error", content: errorMessage(error) });
      this.setConnection("err");
    }
  },

  renderFilePreview(file) {
    const preview = this.querySelector("[data-file-preview]");
    const body = preview?.querySelector(".fp-body");
    if (!preview || !body) return;
    this.destroyFilePreviewEditor?.();
    preview.hidden = false;
    this.filePreview = {
      workspaceId: this.dataset.activeWorkspaceId,
      file,
      mode: defaultPreviewMode(file),
      cleanContent: file.content || "",
      originalContent: gitOriginalContent(file),
      dirty: false,
      editor: undefined,
      saveStatus: "",
    };
    setPreviewHeader(preview, this.filePreview);
    this.renderFilePreviewBody();
  },

  renderFilePreviewBody() {
    const preview = this.querySelector("[data-file-preview]");
    const body = preview?.querySelector(".fp-body");
    const state = this.filePreview;
    if (!preview || !body || !state) return;
    const { file, mode } = state;
    this.destroyFilePreviewEditor?.();
    body.replaceChildren();
    updatePreviewActions(preview, state);
    if (file.previewKind === "loading") {
      body.textContent = "loading preview…";
      return;
    }
    if (mode === "text" && isTextFile(file)) {
      const node = textPreviewNode(this, state);
      body.append(node);
      return;
    }
    if (mode === "image" && file.dataUrl) {
      body.append(imagePreviewNode(file));
      return;
    }
    body.textContent = fallbackMessage(file);
  },

  closeFilePreview() {
    if (!this.confirmCleanFilePreview?.()) return;
    this.destroyFilePreviewEditor?.();
    this.filePreview = undefined;
    this.querySelector("[data-file-preview]")?.setAttribute("hidden", "");
  },

  toggleFilePreviewMode() {
    if (!this.filePreview?.file || !this.confirmCleanFilePreview?.()) return;
    this.filePreview.mode = this.filePreview.mode === "image" ? "text" : "image";
    this.filePreview.cleanContent = fallbackValue(this.filePreview.file.content, "");
    this.filePreview.originalContent = gitOriginalContent(this.filePreview.file);
    this.filePreview.dirty = false;
    this.filePreview.saveStatus = "";
    this.renderFilePreviewBody();
  },

  async saveFilePreview() {
    const workspaceId = this.dataset.activeWorkspaceId;
    const state = this.filePreview;
    const file = state?.file;
    if (!workspaceId || !file?.path || !state?.editor || !this.apiConnected) return;
    if (state.workspaceId && state.workspaceId !== workspaceId) {
      state.saveStatus = "workspace changed";
      updatePreviewActions(this.querySelector("[data-file-preview]"), state);
      return;
    }
    const save = this.querySelector("[data-action='save-file-preview']");
    if (save) save.disabled = true;
    try {
      const content = state.editor.getValue();
      const next = await saveWorkspaceFile(workspaceId, file.path, content);
      const currentContent = fallbackValue(state.editor?.getValue?.(), "");
      if (currentContent !== content) {
        state.file = next;
        state.cleanContent = fallbackValue(next.content, content);
        state.originalContent = gitOriginalContent(next);
        state.dirty = currentContent !== state.cleanContent;
        state.saveStatus = "saved";
        updatePreviewActions(this.querySelector("[data-file-preview]"), state);
        await this.loadWorkspaceMeta(workspaceId);
        return;
      }
      this.destroyFilePreviewEditor?.();
      this.filePreview = {
        workspaceId,
        file: next,
        mode: defaultPreviewMode(next),
        cleanContent: fallbackValue(next.content, content),
        originalContent: gitOriginalContent(next),
        dirty: false,
        editor: undefined,
        saveStatus: "saved",
      };
      this.renderFilePreviewBody();
      await this.loadWorkspaceMeta(workspaceId);
    } catch (error) {
      state.saveStatus = errorMessage(error);
      updatePreviewActions(this.querySelector("[data-file-preview]"), state);
      alert(errorMessage(error));
      this.setConnection("err");
    } finally {
      if (save) save.disabled = !this.filePreview?.dirty;
    }
  },

  destroyFilePreviewEditor() {
    this.filePreview?.editor?.destroy?.();
    if (this.filePreview) this.filePreview.editor = undefined;
  },

  hasDirtyFilePreview() {
    return !!this.filePreview?.dirty;
  },

  confirmCleanFilePreview() {
    if (!this.hasDirtyFilePreview?.()) return true;
    return window.confirm("Discard unsaved file changes?");
  },

  installFilePreviewUnloadGuard() {
    if (this.uninstallFilePreviewUnloadGuard) return;
    const guard = (event) => {
      if (!this.hasDirtyFilePreview?.()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    this.uninstallFilePreviewUnloadGuard = () => window.removeEventListener("beforeunload", guard);
  },
};

export function setPreviewHeader(preview, state) {
  const file = state.file || state;
  const meta = [file.mime, file.truncated ? "truncated" : "", state.dirty ? "modified" : state.saveStatus]
    .filter(Boolean)
    .join(" · ");
  preview.querySelector(".fp-path").textContent = file.path || "file";
  preview.querySelector("small").textContent = meta;
}

export function updatePreviewActions(preview, state) {
  if (!preview || !state?.file) return;
  const file = state.file;
  const mode = state.mode;
  const eligibility = editableFileState(file);
  const canEdit = eligibility.editable;
  const canToggle = file.mime === "image/svg+xml" && file.dataUrl && file.content;
  const save = preview.querySelector("[data-action='save-file-preview']");
  const toggle = preview.querySelector("[data-action='toggle-file-preview-mode']");
  const workspaceChanged = state.saveStatus === "workspace changed";
  save.hidden = !canEdit || mode !== "text";
  save.disabled = !state.dirty || workspaceChanged;
  save.textContent = workspaceChanged
    ? "workspace changed"
    : state.dirty ? "save *" : state.saveStatus === "saved" ? "saved" : "save";
  save.title = state.saveStatus && state.saveStatus !== "saved" ? state.saveStatus : "";
  toggle.hidden = !canToggle;
  toggle.textContent = mode === "image" ? "text" : "image";
  setPreviewHeader(preview, state);
}

export function gitOriginalContent(file) {
  return typeof file?.originalContent === "string" ? file.originalContent : file?.content || "";
}

export function defaultPreviewMode(file) {
  if (file.previewKind === "image" && file.dataUrl) return "image";
  if (isTextFile(file)) return "text";
  return "unsupported";
}

function textPreviewNode(app, state) {
  const file = state.file;
  const container = document.createElement("div");
  container.dataset.filePreviewEditor = "";
  container.dataset.language = codeMirrorLanguageName(file);

  const readOnly = editableFileState(file).readOnly;
  const content = `${fallbackValue(file.content, "")}${truncatedSuffix(file)}`;
  state.editor = new CodeMirrorFileEditor(container, {
    file,
    content,
    originalContent: state.originalContent,
    readOnly,
    onChange: (nextContent) => {
      state.dirty = nextContent !== state.cleanContent;
      state.saveStatus = "";
      updatePreviewActions(app.querySelector("[data-file-preview]"), state);
    },
    onSave: () => void app.saveFilePreview?.(),
  });
  container.setAttribute("aria-label", `${readOnly ? "view" : "edit"} ${fallbackValue(file.path, "file")}`);
  return container;
}

export function truncatedSuffix(file) {
  return file.truncated ? "\n\n[truncated]" : "";
}

export function imagePreviewNode(file) {
  const image = document.createElement("img");
  image.src = file.dataUrl;
  image.alt = file.path || "file preview";
  return image;
}

export function fallbackMessage(file) {
  if (file.previewKind === "error") return file.content;
  if (file.truncated) return "파일이 너무 커서 편집할 수 없습니다.";
  if (file.previewKind === "image") return "이미지는 미리보기만 지원합니다.";
  return "미리보기를 지원하지 않습니다.";
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
