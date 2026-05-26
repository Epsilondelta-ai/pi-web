// @ts-nocheck
import { beforeEach, describe, expect, it } from "vitest";
import "../index";

function renderApp() {
  document.body.innerHTML = `
    <pi-app>
      <div class="attach-chips" hidden></div>
      <textarea class="prompt-textarea"></textarea>
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
