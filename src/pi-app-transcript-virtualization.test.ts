// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

function installVirtualizedTranscriptFixture() {
  installPiAppFixture();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const height = this.classList?.contains("transcript-item") ? 80 : 0;
    return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
  });
}

describe("pi-app transcript virtualization", () => {
  beforeEach(installVirtualizedTranscriptFixture);
  afterEach(cleanupPiAppFixture);

  it("virtualizes long transcripts to the visible message window", async () => {
    const app = await connectPiApp();
    const messages = Array.from({ length: 250 }, (_, index) => ({
      kind: "pi",
      text: `message ${index}`,
    }));
    const messageNode = vi.spyOn(app, "messageNode");

    app.renderMessages(messages);

    const renderedMessages = [...app.querySelectorAll(".term-inner .msg")];
    expect(app.transcriptItems).toHaveLength(250);
    expect(messageNode).toHaveBeenCalledTimes(30);
    expect(renderedMessages.length).toBeLessThan(250);
    expect(app.querySelectorAll(".term-inner .transcript-item")).toHaveLength(30);
    expect(app.termInner.style.paddingTop).not.toBe("0px");
    expect(renderedMessages.at(-1).textContent).toContain("message 249");
  });

  it("moves the virtual transcript window when the user scrolls upward", async () => {
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    const messages = Array.from({ length: 250 }, (_, index) => ({
      kind: "pi",
      text: `message ${index}`,
    }));
    app.renderMessages(messages);

    app.term.scrollTop = 0;
    app.renderTranscriptWindow({ stickToBottom: false });

    const renderedMessages = [...app.querySelectorAll(".term-inner .msg")];
    expect(renderedMessages[0].textContent).toContain("message 0");
    expect(renderedMessages.at(-1).textContent).not.toContain("message 249");
  });

  it("renders appended transcript items without waiting for a user scroll", async () => {
    const app = await connectPiApp();
    const messages = Array.from({ length: 250 }, (_, index) => ({
      kind: "pi",
      text: `message ${index}`,
    }));
    app.renderMessages(messages);
    const previousTranscriptItems = app.transcriptItems;

    app.appendMessage({ kind: "pi", text: "new tail message" });

    const renderedMessages = [...app.querySelectorAll(".term-inner .msg")];
    expect(app.transcriptItems).not.toBe(previousTranscriptItems);
    expect(app.transcriptItems).toHaveLength(251);
    expect(renderedMessages.at(-1).textContent).toContain("new tail message");
  });

  it("renders only a preview for collapsed large tool output", async () => {
    const app = await connectPiApp();
    const largeBody = `${"line\n".repeat(5000)}tail-marker`;

    app.renderMessages([]);
    app.appendMessage({
      kind: "tool",
      tool: "bash",
      status: "ok",
      collapsedByDefault: true,
      body: largeBody,
    });

    const body = app.querySelector(".tool-card .tc-body");
    expect(body.hidden).toBe(true);
    expect(body.textContent).not.toContain("tail-marker");
    expect(body.textContent.length).toBeLessThan(largeBody.length);
  });

  it("renders full large tool output only after explicit request", async () => {
    const app = await connectPiApp();
    const largeBody = `${"line\n".repeat(5000)}tail-marker`;

    app.renderMessages([]);
    app.appendMessage({
      kind: "tool",
      tool: "bash",
      status: "ok",
      collapsedByDefault: true,
      body: largeBody,
    });

    app.toggleTool(app.querySelector(".tc-head"));
    expect(app.querySelector(".tool-card .tc-body").textContent).not.toContain("tail-marker");

    app.showFullToolOutput(app.querySelector("[data-action='show-full-tool-output']"));
    expect(app.querySelector(".tool-card .tc-body").textContent).toContain("tail-marker");
  });
});
