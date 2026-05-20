// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

describe("pi-app transcript window", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("renders only the newest 30 transcript items by default", async () => {
    const app = await connectPiApp();
    const messages = Array.from({ length: 35 }, (_, index) => ({
      kind: "pi",
      text: `message ${index}`,
    }));

    app.renderMessages(messages);

    const renderedMessages = [...app.querySelectorAll(".term-inner .msg")];
    expect(app.transcriptItems).toHaveLength(35);
    expect(renderedMessages).toHaveLength(30);
    expect(renderedMessages[0].textContent).toContain("message 5");
    expect(renderedMessages.at(-1).textContent).toContain("message 34");
  });

  it("keeps live tool output collapsed until the user opens it", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendMessage({ kind: "tool", tool: "bash", status: "running", collapsedByDefault: true });
    app.appendToolOutput({ tool: "bash", chunk: "streaming output" });
    frames.splice(0).forEach((callback) => callback(0));

    const body = app.querySelector(".tool-card .tc-body");
    expect(body.hidden).toBe(true);
    expect(body.textContent).toContain("streaming output");

    app.toggleTool(app.querySelector(".tc-head"));
    expect(body.hidden).toBe(false);
  });

  it("stops following when the user scrolls up and resumes only from the bottom button", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    app.renderMessages(Array.from({ length: 35 }, (_, index) => ({ kind: "pi", text: `message ${index}` })));
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    app.term.scrollTop = 100;
    app.handleTranscriptScroll();
    app.scrollTerm();
    frames.splice(0).forEach((callback) => callback(0));

    expect(app.term.scrollTop).toBe(100);
    expect(app.transcriptScrollButton.hidden).toBe(false);

    app.scrollTranscriptToBottom();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(app.term.scrollTop).toBe(1000);
    expect(app.transcriptFollowBottom).toBe(true);
  });
});
