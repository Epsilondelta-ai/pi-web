import { beforeEach, describe, expect, it } from "vitest";
import "./pi-app.js";

function renderApp() {
  document.body.innerHTML = `
    <pi-app>
      <div class="attach-chips" hidden></div>
      <textarea class="prompt-textarea"></textarea>
      <button class="send-btn" disabled>send</button>
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
    expect(app.querySelector(".send-btn").disabled).toBe(false);
  });
});
