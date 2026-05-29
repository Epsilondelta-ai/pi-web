// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../index";
import { cleanupPiAppFixture } from "../test-helper";

function renderApp() {
  document.body.innerHTML = `
    <pi-app>
      <div class="prompt-bar">
        <div class="attach-chips" hidden></div>
        <textarea class="prompt-textarea"></textarea>
      </div>
      <button class="send-btn" aria-disabled="true">send</button>
      <button class="attach-btn">attach</button>
      <input data-file-input type="file" />
    </pi-app>
  `;
}

describe("pi-app prompt input", () => {
  beforeEach(() => {
    renderApp();
  });

  afterEach(() => {
    cleanupPiAppFixture();
  });

  it("renders image attachments in user messages", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.termInner = document.createElement("div");
    app.append(app.termInner);

    app.appendMessage({
      kind: "user",
      text: "잘 보이나? 이미지?",
      attachments: [{ type: "image", name: "clip.png", dataUrl: "data:image/png;base64,ZmFrZQ==" }],
    });

    expect(app.querySelector(".msg[data-kind='user'] .body").textContent).toContain("잘 보이나? 이미지?");
    expect(app.querySelector(".msg-image").getAttribute("src")).toBe("data:image/png;base64,ZmFrZQ==");
  });

  it("attaches pasted clipboard images instead of inserting them into the prompt", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();

    const image = new File(["fake image"], "clip.png", { type: "image/png" });
    const paste = new Event("paste", { cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
      },
    });

    app.prompt.dispatchEvent(paste);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(paste.defaultPrevented).toBe(true);
    expect(app.prompt.value).toBe("");
    expect(app.querySelector(".attach-chips").hidden).toBe(false);
    expect(app.querySelector(".attach-chip .ac-preview").getAttribute("src")).toContain("data:image/png;base64,");
    expect(app.querySelector(".attach-chip .ac-name").textContent).toBe("clip.png");
    expect(app.attachmentContents[0]).toMatchObject({
      type: "image",
      name: "clip.png",
      mimeType: "image/png",
    });
    expect(app.attachmentContents[0].dataUrl).toContain("data:image/png;base64,");
    expect(app.querySelector(".send-btn").getAttribute("aria-disabled")).toBe("false");
  });

  it("attaches files dropped onto the prompt bar with a visible drop target", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const promptBar = app.querySelector(".prompt-bar");
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };

    const drag = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(drag, "dataTransfer", { value: dataTransfer });
    promptBar.dispatchEvent(drag);

    expect(drag.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(promptBar.classList.contains("drag-over")).toBe(true);
    expect(app.querySelector("[data-drop-overlay]").textContent).toBe("Drop files to attach");

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    promptBar.dispatchEvent(drop);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(drop.defaultPrevented).toBe(true);
    expect(promptBar.classList.contains("drag-over")).toBe(false);
    expect(app.querySelector("[data-drop-overlay]")).toBeNull();
    expect(app.attachmentContents[0]).toMatchObject({ type: "file", name: "note.txt", content: "hello" });
    expect(app.querySelector(".attach-chip .ac-name").textContent).toBe("note.txt");
  });

  it("covers prompt drop zone enter, leave, no-file, and uninstall guards", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const promptBar = app.querySelector(".prompt-bar");
    const withFiles = { types: ["Files"], files: [], dropEffect: "none" };
    const withoutFiles = { types: ["text/plain"], files: [], dropEffect: "none" };

    for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
      const ignored = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ignored, "dataTransfer", { value: withoutFiles });
      promptBar.dispatchEvent(ignored);
      expect(ignored.defaultPrevented).toBe(false);
    }
    const missingTransfer = new Event("dragenter", { bubbles: true, cancelable: true });
    promptBar.dispatchEvent(missingTransfer);
    expect(missingTransfer.defaultPrevented).toBe(false);
    expect(promptBar.classList.contains("drag-over")).toBe(false);

    for (const type of ["dragenter", "dragenter"]) {
      const enter = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(enter, "dataTransfer", { value: withFiles });
      promptBar.dispatchEvent(enter);
    }
    expect(promptBar.classList.contains("drag-over")).toBe(true);
    expect(app.querySelectorAll("[data-drop-overlay]")).toHaveLength(1);

    const firstLeave = new Event("dragleave", { bubbles: true, cancelable: true });
    Object.defineProperty(firstLeave, "dataTransfer", { value: withFiles });
    promptBar.dispatchEvent(firstLeave);
    expect(promptBar.classList.contains("drag-over")).toBe(true);

    const secondLeave = new Event("dragleave", { bubbles: true, cancelable: true });
    Object.defineProperty(secondLeave, "dataTransfer", { value: withFiles });
    promptBar.dispatchEvent(secondLeave);
    expect(promptBar.classList.contains("drag-over")).toBe(false);

    app.uninstallPromptDropZone();
    const afterUninstall = new Event("dragenter", { bubbles: true, cancelable: true });
    Object.defineProperty(afterUninstall, "dataTransfer", { value: withFiles });
    promptBar.dispatchEvent(afterUninstall);
    expect(promptBar.classList.contains("drag-over")).toBe(false);

    app.promptBar = null;
    expect(() => app.installPromptDropZone()).not.toThrow();
  });

  it("lists workspace files for @ prompt references and ignores backtick-prefixed @", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.workspaceFiles = [
      { type: "dir", name: "src", path: "src", children: [
        { type: "file", name: "App.astro", path: "src/App.astro" },
        { type: "file", name: "api.ts", path: "src/lib/api.ts" },
      ] },
      { type: "file", name: "package.json", path: "package.json" },
    ];

    app.prompt.value = "check @app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();

    expect(app.querySelector(".prompt-file-ref-pop").hidden).toBe(false);
    expect(app.querySelector(".prompt-file-ref-item .pfr-path").textContent).toBe("src/App.astro");

    app.pickPromptFileRef("src/App.astro");
    expect(app.prompt.value).toBe("check @src/App.astro ");

    app.prompt.value = "open @api";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    app.querySelector(".prompt-file-ref-item").click();
    expect(app.prompt.value).toBe("open @src/lib/api.ts ");

    app.prompt.value = "jump @app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.prompt.value).toBe("jump @src/App.astro ");

    app.prompt.value = "hide @app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    app.prompt.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(app.querySelector(".prompt-file-ref-pop").hidden).toBe(true);

    app.prompt.value = "ignore `@app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    expect(app.querySelector(".prompt-file-ref-pop").hidden).toBe(true);

    app.prompt.value = "missing @zzz";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    expect(app.querySelector(".prompt-file-ref-pop").hidden).toBe(true);

    expect(app.currentPromptFileRef("x")).toBeNull();
    app.promptShellMode = true;
    expect(app.currentPromptFileRef("@app")).toBeNull();
    app.promptShellMode = false;
    app.prompt.value = "range @app";
    app.prompt.setSelectionRange(0, app.prompt.value.length);
    expect(app.currentPromptFileRef(app.prompt.value)).toBeNull();
    app.prompt.value = "plain text";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    expect(app.currentPromptFileRef(app.prompt.value)).toBeNull();
    app.prompt.value = "ignore `@app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    expect(app.currentPromptFileRef(app.prompt.value)).toBeNull();
    app.pickPromptFileRef("");
    app.prompt.value = "plain";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.pickPromptFileRef("src/App.astro");
    expect(app.prompt.value).toBe("plain");
    app.prompt.value = "range @app";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePromptFileRefs();
    expect(app.matchPromptFileRefs(null)).toHaveLength(4);
    const oldPrompt = app.prompt;
    app.prompt = null;
    expect(app.currentPromptFileRef()).toBeNull();
    expect(() => app.updatePromptFileRefs()).not.toThrow();
    app.prompt = oldPrompt;
    const oldWorkspaceFiles = app.workspaceFiles;
    app.workspaceFiles = undefined;
    expect(app.matchPromptFileRefs("app")).toEqual([]);
    app.workspaceFiles = oldWorkspaceFiles;
    expect(app.flattenWorkspaceFiles([null, {}, { type: "file", name: "README.md" }, { type: "dir", name: "./docs", path: ".\\docs" }])).toEqual([
      { name: "README.md", path: "README.md", type: "file" },
      { name: "./docs", path: "./docs", type: "dir" },
    ]);
    app.renderPromptFileRefs([{ type: "dir", name: "src", path: "src" }]);
    expect(app.querySelector(".prompt-file-ref-item .pfr-kind").textContent).toBe("dir");
    const popover = app.promptFileRefPopover;
    popover.replaceChildren();
    expect(() => app.renderPromptFileRefs([{ type: "file", name: "x", path: "x" }])).not.toThrow();
    app.promptFileRefPopover = popover;
    popover.remove();
    expect(app.ensurePromptFileRefPopover()).not.toBe(popover);
    expect(() => app.pickPromptFileRef("")).not.toThrow();
  });

  it("lazy-loads workspace metadata for @ prompt references", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.dataset.activeWorkspaceId = "ws1";
    let loadedWorkspace = "";
    app.loadWorkspaceMeta = async (workspaceId) => {
      loadedWorkspace = workspaceId;
      app.workspaceFiles = [{ type: "file", name: "README.md", path: "README.md" }];
    };

    app.prompt.value = "see @read";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.updatePrompt();
    expect(app.promptFileRefLoading).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadedWorkspace).toBe("ws1");
    expect(app.promptFileRefLoading).toBe(false);
    expect(app.querySelector(".prompt-file-ref-item .pfr-path").textContent).toBe("README.md");
    app.prompt.value = "see @read";
    app.prompt.setSelectionRange(app.prompt.value.length, app.prompt.value.length);
    app.workspaceFiles = [];
    app.promptFileRefLoading = false;
    app.loadWorkspaceMeta = async () => {
      app.workspaceFiles = [{ type: "file", name: "README.md", path: "README.md" }];
    };
    app.updatePromptFileRefs(app.prompt.value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("handles file attachments, unnamed pasted images, glyphs, sizes, and no-op guards", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();

    expect(await app.handlePromptPaste({ clipboardData: { items: [] }, preventDefault() { throw new Error("no prevent"); } })).toBeUndefined();
    expect(app.imageExtension("image/jpeg")).toBe("jpg");
    expect(app.imageExtension("image/svg+xml;charset=utf-8")).toBe("svg");
    expect(app.imageExtension()).toBe("png");
    expect(app.kindGlyph(new File(["img"], "clip.png", { type: "image/png" }))).toBe("img");
    expect(app.formatBytes(512)).toBe("512 B");
    expect(app.formatBytes(2048)).toBe("2.0 KB");
    expect(app.formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");

    const nameless = new File(["svg"], "", { type: "image/svg+xml" });
    const pasted = app.pastedImageFiles({ files: [nameless, new File(["x"], "note.txt", { type: "text/plain" })] });
    const itemPasted = app.pastedImageFiles({ items: [{ getAsFile: () => ({ name: "", type: "image/png", lastModified: 0 }) }] });
    expect(pasted[0].name).toBe("pasted-image-1.svg");
    expect(itemPasted[0].name).toBe("pasted-image-1.png");

    const huge = new File(["x"], "huge.txt", { type: "text/plain" });
    Object.defineProperty(huge, "size", { value: 300 * 1024 });
    await app.addFiles([
      new File(["hello"], "note.txt", { type: "" }),
      new File(["pdf"], "doc.pdf", { type: "application/pdf" }),
      new File(["code"], "main.ts", { type: "text/typescript" }),
      huge,
    ]);
    expect(app.attachmentContents[0]).toMatchObject({ type: "file", name: "note.txt", mimeType: "text/plain", content: "hello" });
    expect([...app.querySelectorAll(".ac-glyph")].map((node) => node.innerHTML)).toEqual(["txt", "pdf", "&lt;/&gt;", "txt"]);
    expect(app.attachmentContents[3].content).toBe("x");
    expect(app.attachmentPreviewMarkup(null)).toContain("file");
    await app.addFiles(undefined);
    const octet = new File(["bin"], "bin", { type: "" });
    expect((await app.imageAttachment(octet)).mimeType).toBe("image/png");
    expect(await app.fileDataUrl(octet)).toContain("application/octet-stream");
    app.attachments = null;
    await app.addFiles([new File(["ignored"], "ignored.txt")]);
    expect(app.attachmentContents).toHaveLength(4);
  });
});
