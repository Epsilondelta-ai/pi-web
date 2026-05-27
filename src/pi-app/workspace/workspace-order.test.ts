import { afterEach, describe, expect, it } from "vitest";
import { applyStoredWorkspaceOrder, storeSessionOrder, storeWorkspaceOrder } from "./workspace-order";

afterEach(() => localStorage.clear());

describe("workspace-order", () => {
  it("orders workspaces and sessions from local preferences while keeping new items", () => {
    storeWorkspaceOrder(["w2", "w1"]);
    storeSessionOrder("w1", ["s2", "s1"]);

    const ordered = applyStoredWorkspaceOrder([
      { id: "w1", sessions: [{ id: "s1" }, { id: "s3" }, { id: "s2" }] },
      { id: "w3", sessions: [] },
      { id: "w2", sessions: [] },
    ]);

    expect(ordered.map((workspace) => workspace.id)).toEqual(["w2", "w1", "w3"]);
    expect(ordered[1].sessions.map((session) => session.id)).toEqual(["s2", "s1", "s3"]);
  });
});
