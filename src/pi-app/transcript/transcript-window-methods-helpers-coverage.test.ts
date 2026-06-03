import { describe, expect, it, vi } from "vitest";
import type { TranscriptWindowOwner } from "./transcript-types";
import {
  TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY,
  readTranscriptBottomFollowFlag,
  transcriptWindowMethods,
  writeTranscriptBottomFollowFlag,
} from "./transcript-window-methods";

describe("transcript window direct method branches", () => {
  it("covers undefined transcript item collection fallbacks", () => {
    const node = document.createElement("div");
    const owner = {
      ...transcriptWindowMethods,
      transcriptItems: undefined,
      transcriptVisibleStart: 0,
      transcriptVisibleEnd: 1,
      transcriptElementNodes: vi.fn(() => [node]),
      createTranscriptItem: vi.fn((_message, init) => ({ id: 1, ...init })),
      renderTranscriptWindow: vi.fn(),
      isTermPinnedToBottom: vi.fn(() => false),
      transcriptVirtualScroller: undefined,
      messageNode: vi.fn(() => node),
    };
    owner.appendTranscriptNode(node);
    expect(owner.transcriptItems).toHaveLength(1);
    expect(owner.isTranscriptItemVisible({})).toBe(false);
    expect(owner.isTranscriptItemVisibleInScroller({})).toBe(false);
    owner.transcriptItems = [{ id: 2 }];
    expect(owner.transcriptItemNodes(0)).toEqual([]);
  });

  it("covers bottom-follow fallback counters", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      term: { scrollTop: 0, scrollHeight: 100, clientHeight: 100 } as HTMLElement,
      followTranscriptBottomOnce: vi.fn(() => true),
      updateTranscriptBottomFollowStability: vi.fn(),
      shouldContinueTranscriptBottomFollow: vi.fn(() => false),
    };

    owner.scheduleTranscriptBottomFollowFrame();
    expect(owner.transcriptBottomFollowFramesRemaining).toBe(0);
    expect(owner.shouldContinueTranscriptBottomFollow()).toBe(false);
    expect(transcriptWindowMethods.shouldContinueTranscriptBottomFollow.call({
      transcriptBottomFollowFramesRemaining: 1,
      transcriptBottomFollowStableFrames: 2,
    })).toBe(false);
    expect(transcriptWindowMethods.shouldContinueTranscriptBottomFollow.call({})).toBe(false);
    raf.mockRestore();
  });

  it("covers scroll handling with missing and pinned terms", () => {
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      term: undefined,
      updateTranscriptScrollButton: vi.fn(),
      shouldLoadOlderTranscriptMessages: vi.fn(() => false),
      isTermPinnedToBottom: vi.fn(() => false),
    };

    owner.handleTranscriptScroll();
    expect(owner.transcriptLastScrollTop).toBe(0);

    owner.term = { scrollTop: 10 } as HTMLElement;
    owner.transcriptFollowBottom = false;
    owner.isTermPinnedToBottom = vi.fn(() => true);
    owner.handleTranscriptScroll();
    expect(owner.transcriptFollowBottom).toBe(true);
  });

  it("starts deferred virtual scrollers on first real scroll", () => {
    const start = vi.fn();
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      term: { scrollTop: 0, clientHeight: 600 } as HTMLElement,
      transcriptVirtualScroller: { start },
      transcriptVirtualScrollerStarted: false,
      updateTranscriptScrollButton: vi.fn(),
      shouldLoadOlderTranscriptMessages: vi.fn(() => false),
      isTermPinnedToBottom: vi.fn(() => false),
    };

    owner.handleTranscriptScroll();

    expect(start).toHaveBeenCalledTimes(1);
    expect(owner.transcriptVirtualScrollerStarted).toBe(true);
    expect(transcriptWindowMethods.shouldRenderFullTranscriptWindow.call({ isTermPinnedToBottom: () => true, running: true }))
      .toBe(false);
    expect(transcriptWindowMethods.shouldRenderFullTranscriptWindow.call({ isTermPinnedToBottom: () => false, running: true }))
      .toBe(false);
    expect(transcriptWindowMethods.shouldRenderFullTranscriptWindow.call({ isTermPinnedToBottom: () => false, running: false }))
      .toBe(true);
  });

  it("keeps following during programmatic bottom scroll frames", () => {
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      term: { scrollTop: 90, scrollHeight: 240, clientHeight: 100, style: {} } as HTMLElement,
      transcriptLastScrollTop: 100,
      transcriptFollowBottom: true,
      scrollFrame: 1,
      updateTranscriptScrollButton: vi.fn(),
      shouldLoadOlderTranscriptMessages: vi.fn(() => false),
      isTermPinnedToBottom: vi.fn(() => false),
    };

    owner.handleTranscriptScroll();
    expect(owner.transcriptFollowBottom).toBe(true);

    owner.scrollFrame = undefined;
    owner.term.scrollTop = 0;
    owner.handleTranscriptScroll();
    expect(owner.transcriptFollowBottom).toBe(true);

    owner.transcriptLastScrollTop = 100;
    owner.term.scrollTop = 80;
    owner.handleTranscriptScroll();
    expect(owner.transcriptFollowBottom).toBe(true);
  });

  it("covers deferred virtual scroller startup guards", () => {
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      term: { clientHeight: 0 } as HTMLElement,
      transcriptVirtualScroller: { start: vi.fn() },
      transcriptVirtualScrollerStarted: false,
    };

    owner.ensureTranscriptVirtualScrollerStarted();
    Object.defineProperty(owner.term, "clientHeight", { configurable: true, value: 600 });
    owner.transcriptVirtualScrollerStarted = true;
    owner.ensureTranscriptVirtualScrollerStarted();
    owner.transcriptVirtualScroller = undefined;
    owner.ensureTranscriptVirtualScrollerStarted();

    expect(owner.transcriptVirtualScroller).toBeUndefined();
  });

  it("covers gesture follow-release fallbacks", () => {
    const owner: TranscriptWindowOwner = {
      ...transcriptWindowMethods,
      updateTranscriptScrollButton: vi.fn(),
      stopFollowingTranscriptBottom: vi.fn(),
    };

    owner.handleTranscriptUserWheel();
    owner.handleTranscriptUserWheel({ deltaY: 1 });
    expect(owner.stopFollowingTranscriptBottom).not.toHaveBeenCalled();

    owner.handleTranscriptTouchStart();
    expect(owner.transcriptLastTouchY).toBeUndefined();
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 3 }] });
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 1 }] });
    expect(owner.stopFollowingTranscriptBottom).not.toHaveBeenCalled();

    owner.handleTranscriptUserWheel({ deltaY: -1 });
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 20 }] });
    expect(owner.stopFollowingTranscriptBottom).toHaveBeenCalledTimes(2);

    const stoppedOwner: TranscriptWindowOwner = { ...transcriptWindowMethods, transcriptFollowBottom: false };
    stoppedOwner.stopFollowingTranscriptBottom();
    expect(stoppedOwner.transcriptFollowBottom).toBe(false);
  });

  it("persists bottom-follow state and tolerates blocked storage", () => {
    const items = new Map();
    vi.stubGlobal("localStorage", {
      clear: vi.fn(() => items.clear()),
      getItem: vi.fn((key) => items.get(String(key)) || null),
      removeItem: vi.fn((key) => items.delete(String(key))),
      setItem: vi.fn((key, value) => items.set(String(key), String(value))),
    });
    writeTranscriptBottomFollowFlag(false);
    expect(localStorage.getItem(TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY)).toBe("false");
    expect(readTranscriptBottomFollowFlag()).toBe(false);
    writeTranscriptBottomFollowFlag(true);
    expect(localStorage.getItem(TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY)).toBe("true");

    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(readTranscriptBottomFollowFlag()).toBe(true);
    expect(() => writeTranscriptBottomFollowFlag(false)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
