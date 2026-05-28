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
    app.dataset.activeWorkspaceId = "w1";
    app.workspaceList = [{
      id: "w1",
      name: "demo",
      path: "/demo",
      sessions: [
        { id: "p1", title: "parent" },
        { id: "c1", title: "reviewer", parentId: "p1", kind: "subagent" },
        { id: "g1", title: "nested", parentId: "c1", kind: "subagent" },
        { id: "t1", title: "alice", parentId: "p1", kind: "team" },
        { id: "s2", title: "standalone", live: true },
      ],
    }];
    app.querySelector(".sidebar .sb-section").append(app.createWorkspaceGroup(app.workspaceList[0]));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteSession("p1");

    expect([...app.querySelectorAll("[data-workspace-group='w1'] .session-row[data-session]")]
      .map((row) => row.dataset.session)).toEqual(["s2"]);
    expect(app.querySelector("[data-workspace-group='w1'] .ws-count").textContent).toBe("1");
    expect(app.workspaceList[0].sessions.map((session) => session.id)).toEqual(["s2"]);
    expect(app.workspaceList[0].live).toBe(true);
  });

  it("clears all workspace sessions from DOM, state, and active session", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.dataset.activeSessionId = "s1";
    app.eventSource = { close: vi.fn() };
    app.workspaceList = [{
      id: "w1",
      name: "demo",
      path: "/demo",
      sessionCount: 2,
      sessions: [{ id: "s1", title: "one" }, { id: "s2", title: "two" }],
    }];
    const group = app.createWorkspaceGroup(app.workspaceList[0]);
    const sessions = group.querySelector(".sessions");
    const sortable = document.createElement("div");
    sortable.className = "session-sortable";
    sortable.append(sessions.querySelector(".session-row[data-session='s1']"));
    sessions.insertBefore(sortable, sessions.firstChild);
    app.append(group);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteWorkspaceSessions("w1");

    expect([...app.querySelectorAll("[data-workspace-group='w1'] .session-row[data-session]")]).toEqual([]);
    expect(app.querySelector("[data-workspace-group='w1'] .session-sortable")).toBeNull();
    expect(app.querySelector("[data-workspace-group='w1'] .sessions-empty").textContent).toContain("no sessions yet");
    expect(app.workspaceList[0].sessions).toEqual([]);
    expect(app.workspaceList[0].sessionCount).toBe(0);
    expect(app.dataset.activeSessionId).toBe("");
  });

  it("clears rows before replacing sidebar state", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.workspaceList = [{ id: "w1", sessions: [{ id: "s1", title: "one" }], sessionCount: 1 }];
    const calls = [];
    app.clearWorkspaceSessionRows = vi.fn(() => calls.push("clear"));
    app.replaceWorkspaceSessionsInState = vi.fn(() => calls.push("replace"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteWorkspaceSessions("w1");

    expect(calls).toEqual(["clear", "replace"]);
  });

  it("does not mutate React sortable sidebar DOM when deleting one session", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.sidebarSortableRoot = { render: vi.fn() };
    app.dataset.activeWorkspaceId = "w1";
    app.workspaceList = [{
      id: "w1",
      name: "demo",
      path: "/demo",
      sessionCount: 3,
      sessions: [
        { id: "p1", title: "parent" },
        { id: "c1", title: "child", parentId: "p1" },
        { id: "s2", title: "keep" },
      ],
    }];
    const section = app.querySelector(".sidebar .sb-section");
    const rootHost = document.createElement("div");
    rootHost.dataset.sortableWorkspaces = "";
    section.append(rootHost);
    section.append(app.createWorkspaceGroup(app.workspaceList[0]));
    app.removeSessionRows = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteSession("p1");
    await Promise.resolve();

    expect(app.removeSessionRows).not.toHaveBeenCalled();
    expect(app.workspaceList[0].sessions.map((session) => session.id)).toEqual(["s2"]);
  });

  it("keeps React sortable sidebar mounted when deleting all sessions", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.sidebarSortableRoot = { render: vi.fn() };
    const calls = [];
    app.clearWorkspaceSessionRows = vi.fn(() => calls.push("clear"));
    app.replaceWorkspaceSessionsInState = vi.fn(() => calls.push("replace"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteWorkspaceSessions("w1");

    expect(calls).toEqual(["replace"]);
  });

  it("covers session deletion state helper edge branches", async () => {
    const app = await connectPiApp();
    app.renderWorkspaces = vi.fn((workspaces) => { app.workspaceList = workspaces; });
    app.openActiveWorkspaceGroup = vi.fn();
    app.workspaceList = [{ id: "other", sessions: [{ id: "keep" }], sessionCount: 1 }];

    app.removeWorkspaceSessionsFromState("missing", new Set(["gone"]));
    expect(app.workspaceList[0].id).toBe("other");

    app.replaceWorkspaceSessionsInState("other");
    expect(app.workspaceList[0].sessions).toEqual([]);
    expect(app.openActiveWorkspaceGroup).not.toHaveBeenCalled();

    const row = document.createElement("div");
    row.className = "session-row";
    row.dataset.session = "row-session";
    app.append(row);
    expect([...app.removeSessionRowsWithDescendants("row-session")]).toEqual(["row-session"]);
    expect([...app.deletedSessionIdsFromList(undefined, "missing")]).toEqual(["missing"]);

    app.removeWorkspaceSessionsFromState("", new Set(["gone"]));
    app.removeWorkspaceSessionsFromState("other", new Set());
    delete app.workspaceList;
    app.replaceWorkspaceSessionsInState("other", []);
    expect(app.renderWorkspaces).toHaveBeenCalledTimes(2);
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
