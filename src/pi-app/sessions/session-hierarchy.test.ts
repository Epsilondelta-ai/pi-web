import { describe, expect, it } from "vitest";
import { appendGroupedSessionRows, decorateSessionRow, sessionKindLabel } from "./session-hierarchy";

describe("session hierarchy helpers", () => {
  it("handles empty sessions, labels, decoration, and nested grouping", () => {
    const container = document.createElement("div");
    const createRow = (_workspaceId, session) => {
      const row = document.createElement("div");
      row.dataset.session = session.id;
      decorateSessionRow(row, session);
      return row;
    };

    appendGroupedSessionRows(container, "w1", undefined, createRow);
    expect(container.children).toHaveLength(0);
    expect(sessionKindLabel({ kind: "subagent" })).toBe("sub");
    expect(sessionKindLabel({ kind: "team" })).toBe("team");
    expect(sessionKindLabel({ kind: "other" })).toBe("");

    appendGroupedSessionRows(container, "w1", [
      { id: "root", title: "root" },
      { id: "child", title: "child", parentId: "root", kind: "subagent" },
      { id: "grandchild", title: "grandchild", parentId: "child", kind: "team" },
      { id: "orphan", title: "orphan", parentId: "missing" },
    ], createRow);

    expect([...container.children].map((row) => row.dataset.session)).toEqual(["root", "child", "grandchild", "orphan"]);
    expect(container.querySelector('[data-session="child"]')?.dataset.parentSession).toBe("root");
    expect(container.querySelector('[data-session="child"]')?.dataset.kind).toBe("subagent");
    expect(container.querySelector('[data-session="grandchild"]')?.dataset.depth).toBe("2");
    expect(container.querySelector('[data-session="orphan"]')?.classList.contains("child-session")).toBe(true);
  });
});
