// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["old", "new"]);
  });

  it("starts a new stream segment after tool cards", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "before" });
    app.appendMessage({ kind: "tool", tool: "bash", status: "running" });
    app.appendDelta({ kind: "pi", delta: "after" });
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
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["hello"]);
  });

  it("renders streaming assistant markdown", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "**bo" });
    app.appendDelta({ kind: "pi", delta: "ld**" });
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
});
