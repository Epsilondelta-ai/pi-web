// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

function appendSessionShell(app, workspaceId = "w1") {
  app.append(app.createWorkspaceGroup({
    id: workspaceId,
    name: "demo",
    path: "/demo",
    sessionCount: 0,
    sessions: [],
  }));
  const activeTitle = document.createElement("span");
  activeTitle.dataset.activeSessionTitle = "";
  app.append(activeTitle);
  const sessionMain = app.querySelector("main") || document.createElement("main");
  sessionMain.toggleAttribute("data-main", true);
  if (!sessionMain.isConnected) app.append(sessionMain);
  return { activeTitle, sessionMain };
}

function mockFetchJson(body, ok = true) {
  globalThis.PI_WEB_API_BASE = "http://backend.test";
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  }));
}

describe("pi-app session method mutations", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("updates session titles, running metadata, and autonames edge cases", async () => {
    const app = await connectPiApp();
    const { activeTitle } = appendSessionShell(app);
    app.dataset.activeSessionId = "s-safe";
    const safe = app.createSessionRow("w1", { id: "s safe/1", title: "old", lastUsed: "now", live: true });
    app.append(safe);

    app.updateSessionTitle(null);
    app.updateSessionTitle({ id: "s safe/1", title: "renamed" });
    expect(safe.dataset.title).toBe("renamed");
    expect(safe.querySelector(".session-main").dataset.title).toBe("renamed");
    expect(safe.querySelector(".title").textContent).toBe("renamed");
    expect(safe.querySelector(".meta").classList.contains("live")).toBe(true);
    expect(safe.querySelector(".gutter")).toBeNull();

    app.dataset.activeSessionId = "s safe/1";
    app.updateSessionTitle({ id: "s safe/1", title: "active" });
    expect(activeTitle.title).toBe("active · s safe/1");

    const partial = document.createElement("div");
    partial.className = "session-row";
    partial.dataset.session = "partial";
    app.append(partial);
    app.updateSessionTitle({ id: "partial", title: "no children" });
    app.markSessionRunning(partial, true);
    app.updateSessionMeta(partial, true);

    app.dataset.activeSessionId = "";
    app.autonameActiveSession("ignored");
    app.dataset.activeSessionId = "s safe/1";
    app.autonameActiveSession("   ");
    safe.dataset.title = "custom";
    app.autonameActiveSession("keep custom");
    safe.dataset.title = "new session";
    app.autonameActiveSession("short title");
    expect(safe.dataset.title).toBe("short title");
    safe.dataset.title = "no session";
    app.autonameActiveSession("x".repeat(60));
    expect(safe.dataset.title.endsWith("…")).toBe(true);
    safe.remove();
    app.autonameActiveSession("missing row still names");
  });

  it("picks sessions with and without backend loading", async () => {
    const app = await connectPiApp();
    const { activeTitle } = appendSessionShell(app);
    const oldRow = app.createSessionRow("w1", { id: "old", title: "old", lastUsed: "now", active: true });
    const row = app.createSessionRow("w1", { id: "s1", title: "one", lastUsed: "now" });
    app.append(oldRow, row);
    app.loadSession = vi.fn();
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.apiConnected = true;

    await app.pickSession(row);
    expect(app.loadWorkspaceMeta).toHaveBeenCalledWith("w1");
    expect(oldRow.classList.contains("selected")).toBe(false);
    expect(row.classList.contains("selected")).toBe(true);
    expect(activeTitle.textContent).toBe("one");
    expect(app.loadSession).toHaveBeenCalledWith("s1");

    activeTitle.remove();
    app.apiConnected = false;
    await app.pickSession(row);
    expect(JSON.parse(localStorage.getItem("pi.activeSession"))).toEqual({ workspaceId: "w1", sessionId: "s1" });
  });

  it("renames sessions through every outcome", async () => {
    const app = await connectPiApp();
    const { activeTitle } = appendSessionShell(app);
    const row = app.createSessionRow("w1", { id: "s1", title: "old", lastUsed: "now" });
    app.append(row);
    app.apiConnected = false;
    await app.renameSession("s1");
    app.apiConnected = true;
    await app.renameSession("");

    vi.spyOn(window, "prompt").mockReturnValueOnce("   ");
    await app.renameSession("s1");
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await app.renameSession("missing");

    mockFetchJson({ session: { id: "s1", title: "new name" } });
    vi.spyOn(window, "prompt").mockReturnValueOnce(" new name ");
    app.dataset.activeSessionId = "s1";
    await app.renameSession("s1");
    expect(row.dataset.title).toBe("new name");
    expect(activeTitle.textContent).toBe("new name");

    vi.spyOn(window, "prompt").mockReturnValueOnce("ghost");
    app.dataset.activeSessionId = "other";
    await app.renameSession("ghost");

    const savedWorkspaceId = app.dataset.activeWorkspaceId;
    delete app.dataset.activeWorkspaceId;
    vi.spyOn(window, "prompt").mockReturnValueOnce("nowhere");
    await app.renameSession("ghost");
    app.dataset.activeWorkspaceId = savedWorkspaceId;

    mockFetchJson({ session: { id: "ghost", title: "ghosted" } });
    app.dataset.activeWorkspaceId = "w1";
    vi.spyOn(window, "prompt").mockReturnValueOnce("ghosted");
    await app.renameSession("ghost");

    row.querySelector(".session-main")?.remove();
    row.querySelector(".title")?.remove();
    vi.spyOn(window, "prompt").mockReturnValueOnce("childless");
    await app.renameSession("s1");

    mockFetchJson({ error: "boom" }, false);
    app.setConnection = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValueOnce("fail");
    await app.renameSession("s1");
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });
});
