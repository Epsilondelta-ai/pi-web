import { describe, expect, it, vi } from "vitest";
import { messageMethods, streamingRowsStart } from "./message-methods";

describe("message method direct branch coverage", () => {
  it("covers collection fallback branches directly", () => {
    const owner = {
      ...messageMethods,
      termInner: document.createElement("div"),
      transcriptItems: undefined,
      streamingRows: {},
      flushStreamingRender: vi.fn(),
      removeLoadingMessage: vi.fn(),
      finishRunningTools: vi.fn(),
      clearStreamingState: vi.fn(),
      messageNode: (message) => {
        const row = document.createElement("div");
        row.className = "msg";
        row.dataset.kind = message.kind;
        row.textContent = message.text;
        return row;
      },
      appendTranscriptNode: vi.fn(),
      replaceTranscriptNode: vi.fn(() => false),
      removeTranscriptNode: vi.fn(),
      notifyPiMessageCommitted: vi.fn(),
      syncLoadingMessage: vi.fn(),
      scrollTerm: vi.fn(),
    };
    expect(owner.answeredChoiceIdsFrom([{ kind: "user", text: "선택지 응답:\nid: direct\nvalue: x" }]).has("direct")).toBe(true);
    expect(owner.streamingRowsForKind("pi")).toEqual([]);
    expect(owner.loadingMessageNodes()).toEqual([]);
    owner.finalizePiStream("final without row");
    expect(owner.appendTranscriptNode).toHaveBeenCalled();
    (owner as any).piStreamText = "stream";
    owner.finalizeStreamingMessages();
    expect(owner.replaceTranscriptNode).not.toHaveBeenCalled();
    owner.syncAnsweredChoices();
    owner.syncReadAloudControls();
    expect(streamingRowsStart(true)).toBe(1);
    expect(streamingRowsStart(false)).toBe(0);
  });

  it("clears a matching pending streaming row directly", () => {
    const row = document.createElement("div");
    row.className = "msg streaming";
    row.dataset.kind = "pi";
    const owner = {
      ...messageMethods,
      flushStreamingRender: vi.fn(),
      piDeltaBuffer: "x",
      piStreamText: "y",
      streamingRows: { pi: row },
      pendingStreamingRow: row,
    };
    owner.clearStreamingState("pi");
    expect(owner.pendingStreamingRow).toBeUndefined();
    expect(owner.streamingRows.pi).toBeUndefined();
  });
});
