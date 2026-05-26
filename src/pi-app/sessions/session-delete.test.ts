// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("pi-app session deletion", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("removes child agent session rows when deleting their parent", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.append(app.createWorkspaceGroup({
      id: "w1",
      name: "demo",
      path: "/demo",
      sessions: [
        { id: "p1", title: "parent" },
        { id: "c1", title: "reviewer", parentId: "p1", kind: "subagent" },
        { id: "g1", title: "nested", parentId: "c1", kind: "subagent" },
        { id: "t1", title: "alice", parentId: "p1", kind: "team" },
        { id: "s2", title: "standalone" },
      ],
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteSession("p1");

    expect([...app.querySelectorAll("[data-workspace-group='w1'] .session-row[data-session]")]
      .map((row) => row.dataset.session)).toEqual(["s2"]);
    expect(app.querySelector("[data-workspace-group='w1'] .ws-count").textContent).toBe("1");
  });

  it("clears the active session when deleting an active child with its parent", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "c1";
    app.eventSource = { close: vi.fn() };
    app.append(app.createWorkspaceGroup({
      id: "w1",
      name: "demo",
      path: "/demo",
      sessions: [
        { id: "p1", title: "parent" },
        { id: "c1", title: "reviewer", parentId: "p1", kind: "subagent" },
      ],
    }));
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w1", sessionId: "c1" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteSession("p1");

    expect(app.dataset.activeSessionId).toBe("");
    expect(localStorage.getItem("pi.activeSession")).toBeNull();
  });
});
