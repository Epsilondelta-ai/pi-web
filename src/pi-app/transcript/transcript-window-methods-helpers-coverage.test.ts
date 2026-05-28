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

  it("covers scroll handling with missing and pinned terms", () => {
    const owner = {
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
    expect(owner.transcriptFollowBottom).toBe(true);
  });
});
