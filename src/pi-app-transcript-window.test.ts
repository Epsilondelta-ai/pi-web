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

  it("adopts server-rendered transcript nodes on connect", async () => {
    const app = await connectPiApp();
    app.termInner.innerHTML = [
      `<div class="transcript-spacer"></div>`,
      `<div class="msg" data-kind="pi"><div class="prefix pi">pi &gt;</div><div class="body">existing</div></div>`,
    ].join("");

    app.adoptRenderedTranscript();

    expect(app.transcriptItems).toHaveLength(1);
    expect(app.querySelector(".term-inner .msg").textContent).toContain("existing");
  });

  it("covers tool fallback metadata and output chunks", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const card = app.toolCard({ kind: "tool", tool: "read" });
    expect(card.dataset.status).toBe("");
    expect(app.toolStatus({ status: "err" })).toContain("failed");
    app.appendTranscriptNode(card, { stickToBottom: true });
    app.appendToolOutput({ tool: "read" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(card.querySelector(".tc-body").textContent).toBe("");
  });

  it("renders error tools and appends finished tools that were not visible", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "tool", tool: "bash", status: "err", resultMeta: "failed" });
    expect(app.querySelector(".tool-card .tc-meta").textContent).toContain("failed");

    app.renderMessages([]);
    app.finishTool({ kind: "tool", tool: "missing", status: "ok", body: "done" });
    expect(app.querySelector(".tool-card[data-tool='missing'] .tc-body").textContent).toContain("done");
  });

  it("keeps tool output flushing guarded and replaces cards when window replacement misses", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    app.renderMessages([]);
    frames.length = 0;
    app.appendToolOutput({ tool: "missing", chunk: "ignored" });

    const busyBody = document.createElement("div");
    busyBody.__toolOutputFrame = 1;
    app.scheduleToolOutputFlush(busyBody);
    expect(frames).toHaveLength(0);

    const emptyBody = document.createElement("div");
    app.scheduleToolOutputFlush(emptyBody);
    frames.splice(0).forEach((callback) => callback(0));
    expect(emptyBody.textContent).toBe("");

    const bodyWithContent = document.createElement("div");
    bodyWithContent.textContent = "old";
    bodyWithContent.__pendingToolOutput = ["new"];
    app.scheduleToolOutputFlush(bodyWithContent);
    frames.splice(0).forEach((callback) => callback(0));
    expect(bodyWithContent.textContent).toBe("old\nnew");

    app.appendMessage({ kind: "tool", tool: "bash", status: "running" });
    vi.spyOn(app, "replaceTranscriptNode").mockReturnValue(false);
    app.finishTool({ kind: "tool", tool: "bash", status: "ok", body: "finished" });
    expect(app.querySelector(".tool-card[data-tool='bash'] .tc-body").textContent).toContain("finished");
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

  it("covers transcript guard fallback paths", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    const term = app.term;
    app.term = null;
    app.scrollTerm({ force: true });
    frames.splice(0).forEach((callback) => callback(0));
    expect(app.isTermPinnedToBottom()).toBe(true);
    app.term = term;

    app.transcriptItems = null;
    app.measureRenderedTranscriptItems();
    app.transcriptItems = [undefined, { nodes: [document.createElement("div")], height: 0 }];
    app.transcriptVisibleStart = 0;
    app.transcriptVisibleEnd = 2;
    app.measureRenderedTranscriptItems();
    expect(app.transcriptItemHeight(9)).toBe(80);
  });

  it("covers tool card default and expanded paths", async () => {
    const app = await connectPiApp();
    const card = app.toolCard({ status: "ok", collapsedByDefault: false, body: "body" });
    const errorStatus = app.toolStatus({ status: "err" });
    const outputCard = app.toolCard({ tool: "pi", status: "running", body: "" });
    app.append(outputCard);
    app.appendToolOutput({ tool: "pi" });

    expect(card.dataset.tool).toBe("tool");
    expect(card.querySelector(".tc-body").hidden).toBe(false);
    expect(card.querySelector(".tc-caret").textContent).toBe("▾");
    expect(errorStatus).toContain("failed");
  });

  it("binds an existing scroll-bottom button", async () => {
    const app = await connectPiApp();
    const existingButton = document.createElement("button");
    existingButton.dataset.action = "scroll-bottom";
    app.transcriptScrollButton.remove();
    app.append(existingButton);

    expect(app.ensureTranscriptScrollButton()).toBe(existingButton);
  });

  it("loads older messages when the user scrolls near the top", async () => {
    const app = await connectPiApp();
    app.sessionHistoryHasMore = true;
    app.sessionHistoryLoading = false;
    app.loadOlderSessionMessages = vi.fn(() => {
      app.sessionHistoryLoading = true;
    });

    app.term.scrollTop = 0;
    app.handleTranscriptScroll();
    app.handleTranscriptScroll();

    expect(app.loadOlderSessionMessages).toHaveBeenCalledTimes(1);
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

    app.transcriptScrollButton.click();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(app.term.scrollTop).toBe(1000);
    expect(app.transcriptFollowBottom).toBe(true);
  });
});
