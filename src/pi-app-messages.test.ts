// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

describe("pi-app messages", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

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

  it("shows loading again after a tool finishes while the session is still running", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.finishTool({ kind: "tool", tool: "read", status: "ok" });
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
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
