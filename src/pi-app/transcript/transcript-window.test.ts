// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

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

  it("adopts server-rendered transcript nodes with their collapsed margin height", async () => {
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? 35.6953125 : 21.6953125;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation((node) => ({
      marginTop: "0px",
      marginBottom: node.classList?.contains("msg") ? "14px" : "0px",
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    app.termInner.innerHTML = [
      `<div class="transcript-spacer"></div>`,
      `<div class="msg" data-kind="pi"><div class="prefix pi">pi &gt;</div><div class="body">existing</div></div>`,
    ].join("");

    app.adoptRenderedTranscript();

    expect(app.transcriptItems).toHaveLength(1);
    expect(app.transcriptItems[0].height).toBe(35.6953125);
    expect(app.querySelector(".term-inner .msg").textContent).toContain("existing");
    expect(warn.mock.calls.some((call) => call.some((part) => String(part).includes("height changed unexpectedly"))))
      .toBe(false);
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

    let itemHeight = 80;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? itemHeight : 0;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    app.renderMessages([]);
    app.appendMessage({ kind: "tool", tool: "bash", status: "running", collapsedByDefault: true });
    const heightChanged = vi.spyOn(app.transcriptVirtualScroller, "onItemHeightDidChange");
    app.appendToolOutput({ tool: "bash", chunk: "streaming output" });
    frames.splice(0).forEach((callback) => callback(0));

    const body = app.querySelector(".tool-card .tc-body");
    expect(body.hidden).toBe(true);
    expect(body.textContent).toContain("streaming output");
    expect(heightChanged).not.toHaveBeenCalled();

    itemHeight = 120;
    app.toggleTool(app.querySelector(".tc-head"));
    expect(body.hidden).toBe(false);
    expect(heightChanged).toHaveBeenCalled();
  });

  it("keeps expanded live tool output pinned when it grows at the bottom", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    let itemHeight = 80;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? itemHeight : 0;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const app = await connectPiApp();
    let scrollHeight = 1000;
    let scrollTop = 900;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });
    app.renderMessages([]);
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    app.appendMessage({ kind: "tool", tool: "bash", status: "running", collapsedByDefault: false });
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));
    app.toggleTool(app.querySelector(".tc-head"));
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));
    scrollHeight = 1200;
    itemHeight = 280;
    app.appendToolOutput({ tool: "bash", chunk: "streaming output" });
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollTop).toBe(1200);
  });

  it("notifies the virtual scroller after streamed assistant markup changes height", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    let itemHeight = 80;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? itemHeight : 0;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "start" });
    const heightChanged = vi.spyOn(app.transcriptVirtualScroller, "onItemHeightDidChange");

    itemHeight = 120;
    app.appendDelta({ kind: "pi", delta: "\nsecond line" });
    frames.splice(0).forEach((callback) => callback(0));

    expect(app.querySelector(".msg.streaming .markdown-body").innerHTML).toContain("<br>");
    expect(heightChanged).toHaveBeenCalled();
  });

  it("syncs rendered item heights before updating virtual-scroller items", async () => {
    let itemHeight = 80;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? itemHeight : 0;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    app.renderMessages(Array.from({ length: 35 }, (_, index) => ({ kind: "pi", text: `message ${index}` })));
    const heightChanged = vi.spyOn(app.transcriptVirtualScroller, "onItemHeightDidChange");

    itemHeight = 120;
    app.appendMessage({ kind: "pi", text: "new tail" });

    expect(heightChanged).toHaveBeenCalled();
  });

  it("ignores sub-pixel transcript height jitter", async () => {
    let itemHeight = 35.6953125;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const height = this.classList?.contains("transcript-item") ? itemHeight : 0;
      return { x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    app.renderMessages([{ kind: "pi", text: "message" }]);
    const heightChanged = vi.spyOn(app.transcriptVirtualScroller, "onItemHeightDidChange");

    itemHeight = 35.6875;
    app.notifyTranscriptItemHeightDidChange(app.transcriptItems[0]);

    expect(app.transcriptItems[0].height).toBe(35.6875);
    expect(heightChanged).not.toHaveBeenCalled();
  });

  it("skips virtual-scroller notifications for unrendered transcript items", async () => {
    const app = await connectPiApp();
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 600 });
    app.renderMessages(Array.from({ length: 35 }, (_, index) => ({ kind: "pi", text: `message ${index}` })));
    app.transcriptVisibleStart = 5;
    app.transcriptVisibleEnd = 35;
    const heightChanged = vi.spyOn(app.transcriptVirtualScroller, "onItemHeightDidChange");
    const staleElement = document.createElement("div");
    staleElement.className = "transcript-item";
    staleElement.dataset.transcriptItem = String(app.transcriptItems[0].id);
    app.termInner.append(staleElement);

    app.notifyTranscriptItemHeightDidChange(app.transcriptItems[0], staleElement);

    expect(heightChanged).not.toHaveBeenCalled();
  });

  it("covers transcript guard fallback paths", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    app.handleTranscriptScroll = vi.fn();
    app.term.dispatchEvent(new Event("scroll"));
    expect(app.handleTranscriptScroll).toHaveBeenCalled();
    const boundButton = app.ensureTranscriptScrollButton();
    app.scrollTranscriptToBottom = vi.fn();
    boundButton.click();
    expect(app.scrollTranscriptToBottom).toHaveBeenCalled();
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

    const loading = document.createElement("div");
    const replacement = document.createElement("div");
    app.transcriptItems = [{ message: { kind: "pi", text: "not materialized" } }, { nodes: [loading] }];
    expect(() => app.removeTranscriptNode(loading)).not.toThrow();
    app.transcriptItems = [{ message: { kind: "pi", text: "not materialized" } }, { nodes: [loading] }];
    expect(app.replaceTranscriptNode(loading, replacement)).toBe(true);
    expect(app.replaceTranscriptNode(document.createElement("div"), document.createTextNode("no element"))).toBe(false);
    expect(app.transcriptElementNodes(document.createTextNode("text"))).toEqual([]);
    const fragment = document.createDocumentFragment();
    const span = document.createElement("span");
    fragment.append("text", span);
    expect(app.transcriptElementNodes(fragment)).toEqual([span]);
    expect(app.transcriptItemNodes(0)[0].textContent).toContain("not materialized");
    expect(app.transcriptItemNodes(99)).toEqual([]);
    expect(app.transcriptRangeHeight(0, 2)).toBeGreaterThan(0);
    expect(app.transcriptItemHeight(9)).toBe(80);
    expect(app.isTranscriptVirtualized()).toBe(Boolean(app.transcriptVirtualScroller));
    app.transcriptVirtualScroller = { virtualScroller: { updateLayout: vi.fn() } };
    app.scheduleTranscriptWindowRender();
    expect(app.transcriptVirtualScroller.virtualScroller.updateLayout).toHaveBeenCalled();
    app.destroyTranscriptVirtualScroller();
    app.destroyTranscriptVirtualScroller();
    app.transcriptItems = [];
    app.renderTranscriptWindow();
    expect(app.termInner.children).toHaveLength(0);

    app.installTranscriptScrollGuard();
    app.transcriptScrollButton = null;
    app.updateTranscriptScrollButton();
    app.transcriptItems = [{ id: 5, message: { kind: "pi", text: "from item" } }];
    expect(app.transcriptItemNodes(0)[0].textContent).toContain("from item");
    expect(app.transcriptElementNodes(null)).toEqual([]);
    const unattached = document.createElement("div");
    app.notifyTranscriptNodeHeightDidChange(unattached);
    app.notifyTranscriptItemHeightDidChange({ id: "missing", height: 1 }, unattached);
    app.appendTranscriptNode(document.createTextNode("x"));
    app.deferTranscriptRender = true;
    const deferred = document.createElement("div");
    app.appendTranscriptNode(deferred);
    app.removeTranscriptNode(deferred);
    app.deferTranscriptRender = false;
    app.removeTranscriptNode(null);
    app.transcriptItems = [];
    app.removeTranscriptNode(document.createElement("div"));
    app.transcriptItems = [{ id: 1, nodes: [document.createElement("div")], height: 1 }];
    app.transcriptVisibleStart = 1;
    app.transcriptVisibleEnd = 1;
    expect(app.isTranscriptItemVisible(app.transcriptItems[0])).toBe(false);
    app.transcriptVirtualScroller = { getState: () => ({ firstShownItemIndex: 0, lastShownItemIndex: 0 }), onItemHeightDidChange: vi.fn() };
    expect(app.isTranscriptItemVisibleInScroller({ id: 99 })).toBe(false);
    expect(app.isTranscriptItemVisibleInScroller(app.transcriptItems[0])).toBe(true);
    app.applyTranscriptVirtualState({ firstShownItemIndex: 0, lastShownItemIndex: 0, itemHeights: [120, 0] });
    expect(app.transcriptItems[0].height).toBe(120);
    const rendered = document.createElement("div");
    rendered.className = "transcript-item";
    rendered.dataset.transcriptItem = "1";
    app.termInner.append(rendered);
    app.measureRenderedTranscriptItems();
    app.transcriptResizeObservers = new Map([[rendered, { disconnect: vi.fn() }]]);
    app.destroyTranscriptVirtualScroller();
    expect(app.transcriptResizeObservers.size).toBe(0);

    const orphan = document.createElement("span");
    const parent = document.createElement("div");
    parent.append(orphan);
    app.transcriptItems = [{ id: 2, nodes: [parent], height: 1 }];
    app.notifyTranscriptNodeHeightDidChange(orphan);
    expect(app.transcriptItems[0].height).toBe(1);
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

  it("forces programmatic bottom scrolls to skip smooth behavior", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    app.term.style.scrollBehavior = "smooth";
    let scrollTop = 0;
    const scrollWrites = [];
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollWrites.push({ behavior: app.term.style.scrollBehavior, value });
        scrollTop = value;
      },
    });

    app.scrollTerm({ force: true });
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollWrites).toEqual([
      { behavior: "auto", value: 1000 },
      { behavior: "auto", value: 1000 },
      { behavior: "auto", value: 1000 },
    ]);
    expect(app.term.style.scrollBehavior).toBe("smooth");
  });

  it("coalesces repeated forced bottom scrolls without canceling the pending frame", async () => {
    let nextFrameId = 0;
    const frames = new Map();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const runFrames = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    };

    const app = await connectPiApp();
    frames.clear();
    app.scrollFrame = undefined;
    let scrollHeight = 1000;
    let scrollTop = 0;
    const scrollWrites = [];
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollWrites.push(value);
        scrollTop = value;
      },
    });

    app.scrollTerm({ force: true });
    scrollHeight = 1100;
    app.scrollTerm({ force: true });
    scrollHeight = 1200;
    app.scrollTerm({ force: true });

    expect(cancelFrame).not.toHaveBeenCalled();
    expect(scrollWrites).toEqual([1000, 1100, 1200]);

    runFrames();
    runFrames();

    expect(scrollWrites).toEqual([1000, 1100, 1200, 1200, 1200]);
  });

  it("keeps pending bottom follow when scrollTop changes without a release gesture", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    let scrollTop = 900;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.scrollTerm();
    app.term.scrollTop = 100;
    app.handleTranscriptScroll();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollTop).toBe(1000);
    expect(app.transcriptFollowBottom).toBe(true);
  });

  it("keeps forced follow-up when scrollTop changes without a release gesture", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    let scrollTop = 900;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.scrollTerm({ force: true });
    app.term.scrollTop = 100;
    app.handleTranscriptScroll();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollTop).toBe(1000);
    expect(app.transcriptFollowBottom).toBe(true);
  });

  it("keeps following after repeated scroll requests without a release gesture", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    let scrollTop = 900;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.scrollTerm();
    app.term.scrollTop = 100;
    app.scrollTerm();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollTop).toBe(1000);
    expect(app.transcriptFollowBottom).toBe(true);
  });

  it("keeps following when bottom-pinned content grows before the scroll frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    let scrollTop = 900;
    let scrollHeight = 1000;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.transcriptFollowBottom = true;
    scrollHeight = 1200;
    app.appendTranscriptNode(app.messageNode({ kind: "pi", text: "new tail" }), { stickToBottom: true });
    app.handleTranscriptScroll();
    frames.splice(0).forEach((callback) => callback(0));
    frames.splice(0).forEach((callback) => callback(0));

    expect(scrollTop).toBe(1200);
    expect(app.transcriptFollowBottom).toBe(true);
  });

  it("continues following delayed bottom growth across several frames", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    frames.length = 0;
    app.scrollFrame = undefined;
    let scrollTop = 900;
    let scrollHeight = 1000;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.scrollTerm({ force: true });
    for (const height of [1100, 1250, 1400]) {
      scrollHeight = height;
      frames.splice(0).forEach((callback) => callback(0));
    }

    expect(scrollTop).toBe(1400);
    expect(app.transcriptFollowBottom).toBe(true);
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

    app.term.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
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

  it("treats wheel-up and touch scroll gestures as explicit bottom-follow release", async () => {
    const app = await connectPiApp();
    app.transcriptFollowBottom = true;

    app.term.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
    expect(app.transcriptFollowBottom).toBe(false);

    app.scrollTranscriptToBottom();
    app.term.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 100 } as Touch] }));
    app.term.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 90 } as Touch] }));
    expect(app.transcriptFollowBottom).toBe(true);

    app.term.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 110 } as Touch] }));
    expect(app.transcriptFollowBottom).toBe(false);
  });

  it("ignores wheel-up and touch gestures that start outside the transcript area", async () => {
    const app = await connectPiApp();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    app.term.append(modal);
    app.transcriptFollowBottom = true;

    modal.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -1 }));
    expect(app.transcriptFollowBottom).toBe(true);

    modal.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [{ clientY: 100 } as Touch] }));
    app.term.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 120 } as Touch] }));
    expect(app.transcriptFollowBottom).toBe(true);
  });

  it("does not re-enable follow from a near-bottom scroll event after an explicit release", async () => {
    const app = await connectPiApp();
    let scrollTop = 880;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });

    app.scrollTerm({ force: true });
    scrollTop = 870;
    app.term.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
    app.handleTranscriptScroll();

    expect(app.transcriptFollowBottom).toBe(false);
    expect(app.transcriptScrollButton.hidden).toBe(false);

    app.scrollTerm();

    expect(scrollTop).toBe(870);
  });
});
