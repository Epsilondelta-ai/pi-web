// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

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

  it("renders and clears the connected welcome banner", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    expect(app.querySelector("[data-welcome-banner]").textContent).toContain("____  _");
    expect(app.textContent).not.toContain("connecting to local backend");

    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelector("[data-welcome-banner]")).toBeNull();
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

  it("renders user prompts through markdown with preserved line breaks", async () => {
    const app = await connectPiApp();
    const text = [
      "PR 올림: https://github.com/Epsilondelta-ai/juun-ai/pull/14",
      "",
      "Checks:",
      "- Branch pushed",
      "- PR created",
      "- Docs-only change",
    ].join("\n");
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text });

    const body = app.querySelector(".msg[data-kind='user'] .body");
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(body.classList.contains("markdown-body")).toBe(true);
    expect(body.querySelector("a").textContent).toBe("https://github.com/Epsilondelta-ai/juun-ai/pull/14");
    expect([...body.querySelectorAll("p")].map((item) => item.textContent)).toEqual([
      "PR 올림: https://github.com/Epsilondelta-ai/juun-ai/pull/14",
      "Checks:",
    ]);
    expect([...body.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Branch pushed",
      "PR created",
      "Docs-only change",
    ]);
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

  it("renders lucide-style tool icons while unknown tools keep the dot", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "tool", tool: "read", status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "git status" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun test" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun run build" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun install" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "pwd" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "unknown_tool", status: "ok" });

    const glyphs = [...app.querySelectorAll(".tool-card .tc-glyph")];
    expect(glyphs[0].querySelector("[data-tool-icon='book-open']")).not.toBeNull();
    expect(glyphs[1].querySelector("[data-tool-icon='git-branch']")).not.toBeNull();
    expect(glyphs[2].querySelector("[data-tool-icon='circle-check']")).not.toBeNull();
    expect(glyphs[3].querySelector("[data-tool-icon='hammer']")).not.toBeNull();
    expect(glyphs[4].querySelector("[data-tool-icon='package']")).not.toBeNull();
    expect(glyphs[5].querySelector("[data-tool-icon='terminal']")).not.toBeNull();
    expect(glyphs[6].querySelector("svg")).toBeNull();
    expect(glyphs[6].textContent).toBe("●");
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

  it("replaces streamed AG-UI text with one final assistant message", async () => {
    const app = await connectPiApp();
    const text = [
      "계획: `.pi/tasks/fix-agui-stream-duplicate-final-render.md` 확인",
      "",
      "- inline `code` 유지",
      "```ts",
      "const path = '.pi/tasks/example.md';",
      "```",
    ].join("\n");
    app.dataset.activeSessionId = "s1";
    app.renderMessages([]);

    const subscriber = app.aguiSubscriber("s1");
    subscriber.onRunStarted();
    subscriber.onTextDelta(text.slice(0, 12));
    subscriber.onTextDelta(text.slice(12));
    subscriber.onTextEnd(text);

    const messages = [...app.querySelectorAll(".msg[data-kind='pi']")];
    expect(messages).toHaveLength(1);
    expect(app.querySelector(".msg.streaming")).toBeNull();
    expect(messages[0].dataset.rawText).toBe(text);
    expect(messages[0].textContent).toContain("계획:");
    expect(messages[0].textContent).not.toContain("계획계획");
    expect(messages[0].textContent).not.toContain(". .pipi");
  });

  it("finalizes a virtualized streaming assistant row in transcript state", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "계획: `.pi/tasks/example.md`" });
    const streaming = app.querySelector(".msg.streaming[data-kind='pi']");
    app.termInner.replaceChildren();

    app.finalizePiStream("계획: `.pi/tasks/example.md`");

    const messages = [...app.querySelectorAll(".msg[data-kind='pi']")];
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toBe(streaming);
    expect(app.transcriptItems).toHaveLength(1);
    expect(app.transcriptItems[0].nodes).toEqual([messages[0]]);
    expect(app.streamingRows?.pi).toBeUndefined();
    expect(app.pendingStreamingRow).toBeUndefined();
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

  it("removes virtualized loading messages from transcript state", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.termInner.replaceChildren();

    app.appendLoadingMessage();
    expect(app.transcriptItems.filter((item) => item.nodes?.some((node) => node.matches?.(".msg.loading")))).toHaveLength(1);

    app.removeLoadingMessage();
    expect(app.transcriptItems.some((item) => item.nodes?.some((node) => node.matches?.(".msg.loading")))).toBe(false);
    expect(app.querySelector(".msg.loading")).toBeNull();
  });
});
