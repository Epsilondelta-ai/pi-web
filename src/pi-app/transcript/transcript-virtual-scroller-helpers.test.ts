import { describe, expect, it, vi } from "vitest";
import type { TranscriptItem, TranscriptWindowOwner } from "./transcript-types";
import {
  transcriptItemHeight,
  transcriptItemId,
  transcriptItemNodes,
  transcriptRangeHeight,
} from "./transcript-virtual-scroller";

describe("transcript virtual scroller helpers", () => {
  it("covers fallback item height and node materialization", () => {
    expect(transcriptItemHeight(null)).toBe(80);
    expect(transcriptItemHeight({ height: 0 })).toBe(80);
    expect(transcriptItemHeight({ height: 42 })).toBe(42);
    expect(transcriptRangeHeight([{ height: 10 }, null, { height: 5 }], 0, 3)).toBe(95);
    const node = document.createElement("div");
    expect(transcriptItemNodes({}, null)).toEqual([]);
    expect(transcriptItemNodes({}, { nodes: [node] })).toEqual([node]);
    expect(transcriptItemNodes({}, { message: { kind: "pi", text: "missing helpers" } })).toEqual([]);
    const owner: Partial<TranscriptWindowOwner> = {
      messageNode: vi.fn((): HTMLDivElement => node),
      transcriptElementNodes: vi.fn((element?: Node | null): Element[] => element instanceof Element ? [element] : []),
    };
    const item: TranscriptItem = { id: 7, message: { kind: "pi", text: "hello" } };
    expect(transcriptItemNodes(owner, item)).toEqual([node]);
    expect(item.nodes).toEqual([node]);
    expect(transcriptItemId(item)).toBe(7);
  });
});
