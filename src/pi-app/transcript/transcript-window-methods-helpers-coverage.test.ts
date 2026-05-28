import { describe, expect, it, vi } from "vitest";
import { transcriptWindowMethods } from "./transcript-window-methods";

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
    const owner: any = {
      ...transcriptWindowMethods,
      term: { scrollTop: 0, scrollHeight: 100, clientHeight: 100 },
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
    const owner: any = {
      ...transcriptWindowMethods,
      term: undefined,
      updateTranscriptScrollButton: vi.fn(),
      shouldLoadOlderTranscriptMessages: vi.fn(() => false),
      isTermPinnedToBottom: vi.fn(() => false),
    };

    owner.handleTranscriptScroll();
    expect(owner.transcriptLastScrollTop).toBe(0);

    owner.term = { scrollTop: 10 };
    owner.transcriptFollowBottom = false;
    owner.isTermPinnedToBottom = vi.fn(() => true);
    owner.handleTranscriptScroll();
    expect(owner.transcriptFollowBottom).toBe(false);
  });

  it("covers gesture follow-release fallbacks", () => {
    const term = document.createElement("div");
    const child = document.createElement("div");
    term.append(child);
    const outside = document.createElement("div");
    const owner: any = {
      ...transcriptWindowMethods,
      term,
      updateTranscriptScrollButton: vi.fn(),
      stopFollowingTranscriptBottom: vi.fn(),
    };

    expect(transcriptWindowMethods.isTranscriptGestureEvent.call({ term: undefined }, {})).toBe(false);
    expect(owner.isTranscriptGestureEvent({ composedPath: () => [outside], target: outside })).toBe(false);
    expect(owner.isTranscriptGestureEvent({ target: outside })).toBe(false);
    expect(owner.isTranscriptGestureEvent({})).toBe(true);

    owner.handleTranscriptUserWheel();
    owner.handleTranscriptUserWheel({ deltaY: 1, target: child });
    expect(owner.stopFollowingTranscriptBottom).not.toHaveBeenCalled();

    owner.handleTranscriptTouchStart();
    expect(owner.transcriptLastTouchY).toBeUndefined();
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 3 }], target: child });
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 1 }], target: child });
    expect(owner.stopFollowingTranscriptBottom).not.toHaveBeenCalled();

    owner.handleTranscriptUserWheel({ deltaY: -1, target: child });
    owner.handleTranscriptTouchMove({ touches: [{ clientY: 20 }], target: child });
    expect(owner.stopFollowingTranscriptBottom).toHaveBeenCalledTimes(2);
  });
});
