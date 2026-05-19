import { getWorkspaceFile, saveWorkspaceFile } from "../api";
import { languageForFile, renderHighlightedCode } from "./file-highlight";

export const filePreviewMethods = {
  async openFile(button) {
    const path = button?.dataset.filePath;
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!path || !workspaceId || !this.apiConnected) return;
    try {
      this.querySelectorAll(".tree-node.selected").forEach((node) => node.classList.remove("selected"));
      button.classList.add("selected");
      this.renderFilePreview({ path, previewKind: "loading" });
      const file = await getWorkspaceFile(workspaceId, path);
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
    preview.hidden = false;
    this.filePreview = { file, mode: defaultPreviewMode(file) };
    setPreviewHeader(preview, file);
    this.renderFilePreviewBody();
  },

  renderFilePreviewBody() {
    const preview = this.querySelector("[data-file-preview]");
    const body = preview?.querySelector(".fp-body");
    const state = this.filePreview;
    if (!preview || !body || !state) return;
    const { file, mode } = state;
    body.replaceChildren();
    updatePreviewActions(preview, file, mode);
    if (file.previewKind === "loading") {
      body.textContent = "loading preview…";
      return;
    }
    if (mode === "text") {
      body.append(textPreviewNode(file));
      return;
    }
    if (mode === "image" && file.dataUrl) {
      body.append(imagePreviewNode(file));
      return;
    }
    body.textContent = file.previewKind === "error" ? file.content : "미리보기를 지원하지 않습니다.";
  },

  closeFilePreview() {
    this.querySelector("[data-file-preview]")?.setAttribute("hidden", "");
  },

  toggleFilePreviewMode() {
    if (!this.filePreview?.file) return;
    this.filePreview.mode = this.filePreview.mode === "image" ? "text" : "image";
    this.renderFilePreviewBody();
  },

  async saveFilePreview() {
    const workspaceId = this.dataset.activeWorkspaceId;
    const file = this.filePreview?.file;
    const editor = this.querySelector("[data-file-preview-editor]");
    if (!workspaceId || !file?.path || !editor || !this.apiConnected) return;
    const save = this.querySelector("[data-action='save-file-preview']");
    if (save) save.disabled = true;
    try {
      const next = await saveWorkspaceFile(workspaceId, file.path, editor.value);
      this.renderFilePreview(next);
      await this.loadWorkspaceMeta(workspaceId);
    } catch (error) {
      alert(errorMessage(error));
      this.setConnection("err");
    } finally {
      if (save) save.disabled = false;
    }
  },
};

function setPreviewHeader(preview, file) {
  const meta = [file.mime, file.truncated ? "truncated" : ""].filter(Boolean).join(" · ");
  preview.querySelector(".fp-path").textContent = file.path || "file";
  preview.querySelector("small").textContent = meta;
}

function updatePreviewActions(preview, file, mode) {
  const canEdit = isTextEditable(file) && !file.truncated;
  const canToggle = file.mime === "image/svg+xml" && file.dataUrl && file.content;
  const save = preview.querySelector("[data-action='save-file-preview']");
  const toggle = preview.querySelector("[data-action='toggle-file-preview-mode']");
  save.hidden = !canEdit || mode !== "text";
  toggle.hidden = !canToggle;
  toggle.textContent = mode === "image" ? "text" : "image";
}

function defaultPreviewMode(file) {
  if (file.previewKind === "image" && file.dataUrl) return "image";
  if (isTextEditable(file)) return "text";
  return "unsupported";
}

function isTextEditable(file) {
  return file.previewKind === "text" || file.mime === "image/svg+xml";
}

function textPreviewNode(file) {
  const container = document.createElement("div");
  container.className = "fp-code-editor";
  container.dataset.language = languageForFile(file);

  const highlight = document.createElement("pre");
  highlight.className = "fp-highlight";
  highlight.setAttribute("aria-hidden", "true");
  const code = document.createElement("code");
  highlight.append(code);

  const textarea = document.createElement("textarea");
  textarea.dataset.filePreviewEditor = "";
  textarea.spellcheck = false;
  textarea.value = `${file.content || ""}${file.truncated ? "\n\n[truncated]" : ""}`;
  textarea.disabled = !!file.truncated;
  textarea.setAttribute("aria-label", `edit ${file.path || "file"}`);

  let highlightRequest = 0;
  const refreshHighlight = async () => {
    const request = ++highlightRequest;
    const html = await renderHighlightedCode(textarea.value, file);
    if (request === highlightRequest) code.innerHTML = html;
  };
  const syncScroll = () => {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  };
  textarea.addEventListener("input", () => {
    void refreshHighlight();
  });
  textarea.addEventListener("scroll", syncScroll);
  void refreshHighlight();

  container.append(highlight, textarea);
  return container;
}

function imagePreviewNode(file) {
  const image = document.createElement("img");
  image.src = file.dataUrl;
  image.alt = file.path || "file preview";
  return image;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
