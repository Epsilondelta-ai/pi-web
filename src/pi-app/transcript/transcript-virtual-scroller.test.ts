import { beforeEach, describe, expect, it, vi } from "vitest";

const virtualScroller = vi.hoisted(() => ({ instances: [] as any[] }));

vi.mock("virtual-scroller/dom", () => ({
  default: vi.fn(function MockVirtualScroller(this: any, container, items, renderItem, options) {
    this.container = container;
    this.items = items;
    this.renderItem = renderItem;
    this.options = options;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.setItems = vi.fn();
    this.onItemHeightDidChange = vi.fn();
    this.getState = vi.fn();
    this.virtualScroller = { updateLayout: vi.fn() };
    virtualScroller.instances.push(this);
  }),
}));

import {
  DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
  TRANSCRIPT_OVERSCAN_ITEM_COUNT,
  createTranscriptVirtualScroller,
  renderFullTranscriptWindow,
  renderVirtualTranscriptItem,
  resetTranscriptVirtualSpacing,
  updateTranscriptVirtualScroller,
} from "./transcript-virtual-scroller";

describe("transcript virtual scroller helpers", () => {
  beforeEach(() => {
    virtualScroller.instances.length = 0;
    delete globalThis.ResizeObserver;
  });

  it("creates configured scrollers with initial bottom state, overscan height, and callbacks", () => {
    const term = document.createElement("div");
    Object.defineProperty(term, "clientHeight", { configurable: true, value: 0 });
    const owner: any = {
      term,
      termInner: document.createElement("div"),
      transcriptItems: Array.from({ length: 35 }, (_, index) => ({ id: index + 1, height: index < 5 ? 10 : undefined })),
      renderVirtualTranscriptItem: vi.fn((item) => document.createTextNode(String(item.id))),
      applyTranscriptVirtualState: vi.fn(),
    };

    const scroller: any = createTranscriptVirtualScroller(owner, { stickToBottom: true });

    expect(scroller.options.readyToStart).toBe(false);
    expect(scroller.options.getScrollableContainer()).toBe(term);
    expect(scroller.options.getEstimatedItemHeight()).toBe(DEFAULT_TRANSCRIPT_ITEM_HEIGHT);
    expect(scroller.options.getEstimatedVisibleItemRowsCount()).toBe(TRANSCRIPT_OVERSCAN_ITEM_COUNT);
    expect(scroller.options.getItemId({ id: "x" })).toBe("x");
    expect(scroller.options.initialScrollPosition).toBe(50);
    scroller.options.onStateChange({ firstShownItemIndex: 1, lastShownItemIndex: 2 });
    expect(owner.applyTranscriptVirtualState).toHaveBeenCalledWith({ firstShownItemIndex: 1, lastShownItemIndex: 2 });
  });

  it("observes rendered items and disconnects observers on unmount", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    globalThis.ResizeObserver = vi.fn(function ResizeObserver(callback) {
      this.callback = callback;
      this.observe = observe;
      this.disconnect = disconnect;
    }) as any;
    const owner: any = {
      transcriptResizeObservers: new Map(),
      notifyTranscriptItemHeightDidChange: vi.fn(),
      transcriptElementNodes: (node) => [node],
      messageNode: (message) => {
        const node = document.createElement("div");
        node.textContent = message.text;
        return node;
      },
    };
    const item: any = { id: 7, message: { text: "lazy" } };

    const element = renderVirtualTranscriptItem(owner, item);

    expect(element.dataset.transcriptItem).toBe("7");
    expect(element.textContent).toBe("lazy");
    expect(observe).toHaveBeenCalledWith(element);
    const observer = owner.transcriptResizeObservers.get(element);
    observer.callback();
    expect(owner.notifyTranscriptItemHeightDidChange).toHaveBeenCalledWith(item, element);

    const scrollerOwner: any = {
      term: document.createElement("div"),
      termInner: document.createElement("div"),
      transcriptItems: [item],
      renderVirtualTranscriptItem: vi.fn(),
      applyTranscriptVirtualState: vi.fn(),
      transcriptResizeObservers: owner.transcriptResizeObservers,
    };
    Object.defineProperty(scrollerOwner.term, "clientHeight", { configurable: true, value: 100 });
    const scroller: any = createTranscriptVirtualScroller(scrollerOwner);
    scroller.options.onItemUnmount(element);
    expect(disconnect).toHaveBeenCalled();
    expect(owner.transcriptResizeObservers.has(element)).toBe(false);
  });

  it("renders the full transcript while pruning is deferred", () => {
    let scrollHeight = 500;
    let scrollTop = 120;
    const term = document.createElement("div");
    Object.defineProperty(term, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => { scrollTop = value; },
    });
    const termInner = document.createElement("div");
    termInner.style.paddingTop = "3000px";
    termInner.style.paddingBottom = "2000px";
    const owner: any = {
      term,
      termInner,
      transcriptItems: [{ id: 1 }, { id: 2 }],
      destroyTranscriptVirtualScroller: vi.fn(() => { scrollHeight = 620; }),
      scrollTerm: vi.fn(),
      syncRenderedTranscriptItemHeights: vi.fn(),
      transcriptResizeObservers: new Map(),
      transcriptElementNodes: (node) => [node],
      messageNode: (message) => {
        const node = document.createElement("div");
        node.textContent = message?.text || "";
        return node;
      },
    };

    renderFullTranscriptWindow(owner, { preservePrepend: true });

    expect(owner.destroyTranscriptVirtualScroller).toHaveBeenCalled();
    expect(owner.termInner.querySelectorAll(".transcript-item")).toHaveLength(2);
    expect(owner.transcriptVisibleStart).toBe(0);
    expect(owner.transcriptVisibleEnd).toBe(2);
    expect(owner.syncRenderedTranscriptItemHeights).toHaveBeenCalled();
    expect(owner.termInner.style.paddingTop).toBe("");
    expect(owner.termInner.style.paddingBottom).toBe("");
    expect(scrollTop).toBe(240);

    renderFullTranscriptWindow(owner, { stickToBottom: true });
    expect(owner.scrollTerm).toHaveBeenCalledWith({ force: true });
  });

  it("clears virtual spacing safely without a transcript container", () => {
    expect(() => resetTranscriptVirtualSpacing({ termInner: null })).not.toThrow();
  });

  it("renders a full transcript with preserve-prepend and no scroll container", () => {
    const owner: any = {
      term: null,
      termInner: document.createElement("div"),
      transcriptItems: [{ id: 1 }],
      destroyTranscriptVirtualScroller: vi.fn(),
      syncRenderedTranscriptItemHeights: vi.fn(),
      transcriptResizeObservers: new Map(),
      transcriptElementNodes: (node) => [node],
      messageNode: () => document.createElement("div"),
    };

    expect(() => renderFullTranscriptWindow(owner, { preservePrepend: true })).not.toThrow();
  });

  it("updates, restarts deferred scrollers, clears empty transcripts, and scrolls to bottom", () => {
    const termInner = document.createElement("div");
    termInner.style.paddingTop = "3000px";
    termInner.style.paddingBottom = "2000px";
    termInner.append(document.createElement("span"));
    const owner: any = {
      term: document.createElement("div"),
      termInner,
      transcriptItems: [],
      destroyTranscriptVirtualScroller: vi.fn(),
      scrollTerm: vi.fn(),
      syncRenderedTranscriptItemHeights: vi.fn(),
      renderVirtualTranscriptItem: vi.fn(),
      applyTranscriptVirtualState: vi.fn(),
    };

    updateTranscriptVirtualScroller(owner);
    expect(owner.destroyTranscriptVirtualScroller).toHaveBeenCalled();
    expect(termInner.children).toHaveLength(0);
    expect(termInner.style.paddingTop).toBe("");
    expect(termInner.style.paddingBottom).toBe("");

    owner.transcriptItems = [{ id: 1 }];
    owner.shouldRenderFullTranscriptWindow = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    updateTranscriptVirtualScroller(owner, { stickToBottom: true });
    expect(owner.destroyTranscriptVirtualScroller).toHaveBeenCalledTimes(2);
    expect(owner.scrollTerm).toHaveBeenCalledWith({ force: true });

    owner.transcriptVirtualScroller = { start: vi.fn(), setItems: vi.fn() };
    owner.transcriptVirtualScrollerStarted = false;
    Object.defineProperty(owner.term, "clientHeight", { configurable: true, value: 100 });
    updateTranscriptVirtualScroller(owner, { preservePrepend: true, stickToBottom: true });
    expect(owner.transcriptVirtualScroller.start).toHaveBeenCalled();
    expect(owner.transcriptVirtualScrollerStarted).toBe(true);
    expect(owner.syncRenderedTranscriptItemHeights).toHaveBeenCalled();
    expect(owner.transcriptVirtualScroller.setItems).toHaveBeenCalledWith(owner.transcriptItems, {
      preserveScrollPositionOnPrependItems: true,
    });
    expect(owner.scrollTerm).toHaveBeenCalledWith({ force: true });

    owner.transcriptVirtualScrollerStarted = false;
    Object.defineProperty(owner.term, "clientHeight", { configurable: true, value: 0 });
    updateTranscriptVirtualScroller(owner);
    expect(owner.destroyTranscriptVirtualScroller).toHaveBeenCalledTimes(3);
    expect(virtualScroller.instances.at(-1).options.readyToStart).toBe(false);

    owner.transcriptVirtualScroller = undefined;
    owner.transcriptItems = [{ id: 2 }];
    Object.defineProperty(owner.term, "clientHeight", { configurable: true, value: 100 });
    updateTranscriptVirtualScroller(owner);
    expect(virtualScroller.instances.at(-1).options.readyToStart).toBe(true);

    owner.termInner = null;
    expect(() => updateTranscriptVirtualScroller(owner)).not.toThrow();
  });
});
