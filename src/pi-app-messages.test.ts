// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

describe("pi-app messages", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("keeps message methods safe when transcript containers are absent", async () => {
    const app = await connectPiApp();
    app.termInner = null;
    expect(() => app.renderMessages([{ kind: "pi", text: "ignored" }])).not.toThrow();
    expect(() => app.appendMessage({ kind: "pi", text: "ignored" })).not.toThrow();
    expect(() => app.appendMessage()).not.toThrow();
    expect(() => app.appendDelta({ kind: "pi", delta: "ignored" })).not.toThrow();
  });

  it("renders banner, thinking, image, fallback choice, and unknown messages", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "banner", text: "<a>ready</a>" });
    app.appendMessage({ kind: "think", text: "<reason>" });
    app.appendMessage({ kind: "user", text: "see", attachments: [{ type: "image", dataUrl: "data:image/png;base64,a", name: "shot" }] });
    app.appendMessage({ kind: "custom", value: 1 });
    app.appendMessage({
      kind: "pi",
      text: [
        "```json",
        '{"type":"piweb_choice","id":"c1","question":"Pick?","options":[{"label":"A","value":"a","description":"Alpha"},{"label":"B","value":"b"}],"allowCustom":false}',
        "```",
      ].join("\n"),
    });

    expect(app.querySelector(".ascii-banner").textContent).toContain("ready");
    expect(app.querySelector(".thinking-block").textContent).toContain("<reason>");
    expect(app.querySelector(".msg-image").getAttribute("alt")).toBe("shot");
    expect(app.querySelector(".fallback-choice-list [data-choice-value='a'] small").textContent).toBe("Alpha");
    expect(app.querySelector("[data-choice-custom-input]")).not.toBeNull();
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("value");

    app.appendMessage({ kind: "user", text: "unnamed", attachments: [{ type: "image", dataUrl: "data:image/png;base64,b" }] });
    expect([...app.querySelectorAll(".msg-image")].at(-1).getAttribute("alt")).toBe("attached image");

    app.disableAnsweredChoice();
    const savedTerm = app.termInner;
    app.termInner = null;
    app.disableAnsweredChoice("missing");
    app.termInner = savedTerm;
    app.disableAnsweredChoice("c1");
    expect(app.querySelector(".fallback-choice-list").classList.contains("answered")).toBe(true);
    expect(app.querySelector(".fallback-choice-list button").disabled).toBe(true);
  });

  it("handles streaming and tool cleanup nodes with missing child elements", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const streaming = document.createElement("div");
    streaming.className = "msg streaming";
    streaming.dataset.kind = "think";
    app.termInner.append(streaming);
    app.appendDelta({ kind: "think", delta: "ignored" });

    const tool = document.createElement("div");
    tool.className = "tool-card";
    tool.dataset.status = "running";
    app.termInner.append(tool);
    expect(() => app.finishRunningTools()).not.toThrow();
  });

  it("deduplicates echoed user prompts and removes loading on response", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text: "hello" });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.appendMessage({ kind: "pi", text: "world" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("does not append new deltas to an old streaming row", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "old" });
    app.finalizeStreamingMessages();
    app.appendMessage({ kind: "user", text: "next" });
    app.appendDelta({ kind: "pi", delta: "new" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["old", "new"]);
  });

  it("starts a new stream segment after tool cards", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "before" });
    app.appendMessage({ kind: "tool", tool: "bash", status: "running" });
    app.appendDelta({ kind: "pi", delta: "after" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["before", "after"]);
  });

  it("covers fallback defaults for images and detached choice lookup", async () => {
    const app = await connectPiApp();
    const image = app.userMessageNode({ kind: "user", text: "img", attachments: [{ type: "image", dataUrl: "data:image/png;base64,x" }] });
    expect(image.querySelector("img").alt).toBe("attached image");
    const term = app.termInner;
    app.termInner = undefined;
    app.disableAnsweredChoice("missing");
    app.termInner = term;
  });

  it("finalizes uncached streaming rows", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const row = app.simpleMessage("pi streaming", "pi >", "stream");
    row.classList.add("streaming");
    app.termInner.append(row);
    app.finalizeStreamingMessages();
    expect(row.classList.contains("streaming")).toBe(false);
  });

  it("keeps loading out of the transcript between tool calls", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.finishTool({ kind: "tool", tool: "read", status: "ok" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.setMode("idle");
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("marks stale running tools complete when assistant output resumes", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    app.appendDelta({ kind: "pi", delta: "done" });
    const tool = app.querySelector(".tool-card");
    expect(tool.dataset.status).toBe("ok");
    expect(tool.querySelector(".tc-meta").textContent).toContain("done");
    expect(tool.querySelector(".tc-meta .spinner")).toBeNull();
  });

  it("marks stale running tools complete when a session becomes idle", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    app.setMode("idle");
    const tool = app.querySelector(".tool-card");
    expect(tool.dataset.status).toBe("ok");
    expect(tool.querySelector(".tc-meta .spinner")).toBeNull();
  });

  it("keeps streaming deltas in one row while the session is running", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["hello"]);
  });

  it("renders streaming assistant markdown", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "**bo" });
    app.appendDelta({ kind: "pi", delta: "ld**" });
    app.flushStreamingRender();
    const body = app.querySelector(".msg.streaming .body");
    expect(body.classList.contains("markdown-body")).toBe(true);
    expect(body.innerHTML).toContain("<strong>bold</strong>");
  });

  it("streams assistant deltas before the final message", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    app.flushStreamingRender();
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("hello");
  });

  it("does not show loading after a final assistant message while waiting for idle status", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "pi", text: "complete answer" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("wraps streaming thinking deltas immediately", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.appendDelta({ kind: "think", delta: "rea" });
    app.appendDelta({ kind: "think", delta: "son" });
    const block = app.querySelector(".msg.streaming[data-kind='think'] .thinking-block");
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(block).not.toBeNull();
    expect(block.querySelector(".label").textContent).toBe("thinking");
    expect(block.querySelector("[data-stream-text]").textContent).toBe("reason");
  });

  it("batches streaming assistant markdown rendering to an animation frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "**bo" });
    app.appendDelta({ kind: "pi", delta: "ld**" });

    const body = app.querySelector(".msg.streaming .body");
    expect(body.textContent).toBe("");

    frames.splice(0).forEach((callback) => callback(0));

    expect(body.innerHTML).toContain("<strong>bold</strong>");
  });

  it("renders loaded transcripts at bottom without a delayed scroll frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const app = await connectPiApp();
    frames.length = 0;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    app.isTermPinnedToBottom = () => true;

    app.renderMessages([{ kind: "pi", text: "loaded" }]);

    expect(app.term.scrollTop).toBe(900);
    expect(frames).toHaveLength(0);
  });

  it("coalesces repeated terminal scroll requests into one animation frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    app.scrollFrame = undefined;
    app.scrollTerm();
    app.scrollTerm();
    app.scrollTerm();

    expect(frames).toHaveLength(1);
  });
});
