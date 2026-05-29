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
  sessionMain.dataset.main = "session";
  const emptyMain = document.createElement("main");
  emptyMain.dataset.main = "empty";
  emptyMain.hidden = true;
  if (!sessionMain.isConnected) app.append(sessionMain);
  app.append(emptyMain);
  const emptyWorkspace = document.createElement("span");
  emptyWorkspace.dataset.emptyWorkspace = "";
  app.append(emptyWorkspace);
  return { activeTitle, sessionMain, emptyMain, emptyWorkspace };
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

describe("pi-app session method display states", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("clears active sessions, workspace rows, and session controls", async () => {
    const app = await connectPiApp();
    const { activeTitle } = appendSessionShell(app);
    app.dataset.activeSessionId = "s1";
    app.eventSource = { close: vi.fn() };
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w1", sessionId: "s1" }));
    app.clearActiveSession("s1");
    expect(app.eventSource.close).toHaveBeenCalled();
    expect(activeTitle.textContent).toBe("no session");
    expect(localStorage.getItem("pi.activeSession")).toBeNull();

    const row = app.createSessionRow("w1", { id: "s2", title: "two", lastUsed: "now" });
    app.querySelector("[data-workspace-group='w1'] .sessions").prepend(row);
    app.findWorkspaceGroup = vi.fn(() => app.querySelector("[data-workspace-group='w1']"));
    app.clearWorkspaceSessionRows("w1");
    expect(app.querySelector("[data-session='s2']")).toBeNull();
    delete app.findWorkspaceGroup;
    app.clearWorkspaceSessionRows("missing");

    app.refreshWorkspaceSessionControls("missing");
    const group = app.querySelector("[data-workspace-group='w1']");
    group.querySelector(".ws-meta").remove();
    group.querySelector(".new-session-row").remove();
    app.refreshWorkspaceSessionControls("w1");

    app.dataset.activeSessionId = "";
    app.syncCurrentSessionRunState(true);
    app.dataset.activeSessionId = "missing";
    app.syncCurrentSessionRunState(true);
  });

  it("starts new sessions for backend, fallback, and failure states", async () => {
    const app = await connectPiApp();
    const shell = appendSessionShell(app);
    app.apiConnected = false;
    app.dataset.activeWorkspaceId = "";
    await app.newSession();
    expect(shell.emptyWorkspace.textContent).toBe("workspace");

    app.dataset.activeWorkspaceId = "w1";
    await app.newSession();
    expect(shell.emptyWorkspace.textContent).toBe("demo");
    expect(shell.activeTitle.textContent).toBe("new session");
    app.querySelector("[data-workspace='w1'] .label")?.remove();
    await app.newSession("w1");
    expect(shell.emptyWorkspace.textContent).toBe("w1");

    app.dataset.activeSessionId = "existing";
    await app.newSession("w1");
    expect(shell.activeTitle.textContent).toBe("new session");

    app.dataset.activeSessionId = "";
    mockFetchJson({ session: { id: "created", title: "new session", lastUsed: "now" } });
    app.apiConnected = true;
    app.connectEvents = vi.fn();
    await app.newSession("w1");
    expect(shell.sessionMain.hidden).toBe(true);
    expect(shell.emptyMain.hidden).toBe(false);
    expect(shell.emptyWorkspace.textContent).toBe("w1");
    expect(app.dataset.activeSessionId).toBe("created");

    app.dataset.activeSessionId = "";
    mockFetchJson({ error: "boom" }, false);
    app.apiConnected = true;
    app.setConnection = vi.fn();
    await app.newSession("w1");
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });

  it("activates created sessions with existing and missing sidebar groups", async () => {
    const app = await connectPiApp();
    const { activeTitle } = appendSessionShell(app);
    const old = app.createSessionRow("w1", { id: "old", title: "old", lastUsed: "now", active: true });
    const sessions = app.querySelector("[data-workspace-group='w1'] .sessions");
    sessions.prepend(old);
    app.connectEvents = vi.fn();
    app.activateCreatedSession("w1", { id: "s1", title: "created", lastUsed: "now" });
    app.activateCreatedSession("w1", { id: "s1", title: "created", lastUsed: "now" });
    expect(old.classList.contains("selected")).toBe(false);
    expect(activeTitle.title).toBe("created · s1");
    expect(app.connectEvents).toHaveBeenCalledWith("s1");

    activeTitle.remove();
    app.activateCreatedSession("missing", { id: "s2", title: "missing", lastUsed: "now" });
    expect(app.dataset.activeSessionId).toBe("s2");

    app.workspaceList = [{ id: "w1", name: "demo", path: "/demo", sessionCount: 1, sessions: [{ id: "old", title: "old" }] }];
    app.sidebarSortableRoot = { render: vi.fn() };
    app.activateCreatedSession("w1", { id: "s3", title: "sortable", lastUsed: "now" });
    expect(app.workspaceList[0].sessions.map((session) => session.id)).toEqual(["s3", "old"]);
    expect(app.workspaceList[0].sessionCount).toBe(2);

    app.addWorkspaceSessionToState("", { id: "ignored" });
    app.addWorkspaceSessionToState("w1", {});
    app.workspaceList = undefined;
    app.addWorkspaceSessionToState("w1", { id: "ignored" });
    app.workspaceList = [{ id: "other", name: "other", path: "/other", sessions: [] }, { id: "w1", name: "demo", path: "/demo" }];
    app.addWorkspaceSessionToState("w1", { id: "live", title: "live", active: true });
    expect(app.workspaceList[1].sessions.map((session) => session.id)).toEqual(["live"]);
    expect(app.workspaceList[1].live).toBe(true);
  });

  it("handles display helpers and menu variants", async () => {
    const app = await connectPiApp();
    const { sessionMain, emptyMain } = appendSessionShell(app);
    app.removeLoadingMessage = vi.fn();
    app.updatePrompt = vi.fn();
    app.resetActiveSessionState();
    expect(app.running).toBe(false);
    expect(app.stopButton.hidden).toBe(true);

    delete app.removeLoadingMessage;
    delete app.updatePrompt;
    app.stopButton.remove();
    app.resetActiveSessionState();

    app.showSessionMain();
    expect(sessionMain.hidden).toBe(false);
    expect(emptyMain.hidden).toBe(true);
    app.showEmptyMain();
    expect(sessionMain.hidden).toBe(true);
    expect(emptyMain.hidden).toBe(false);
    sessionMain.remove();
    emptyMain.remove();
    app.showSessionMain();
    app.showEmptyMain();

    app.toggleSessionMenu(null);
    const row = app.createSessionRow("w1", { id: "s1", title: "one", lastUsed: "now" });
    app.append(row);
    app.toggleSessionMenu(row);
    expect(row.querySelector(".session-menu").hidden).toBe(false);
    app.toggleSessionMenu(row);
    expect(row.querySelector(".session-menu").hidden).toBe(true);
    row.querySelector(".session-menu").remove();
    row.querySelector(".session-menu-button").remove();
    app.toggleSessionMenu(row);

    const rowTwo = app.createSessionRow("w1", { id: "s2", title: "two", lastUsed: "now" });
    app.append(rowTwo);
    app.closeSessionMenus(rowTwo);
    app.closeFilePreview = vi.fn();
    app.closeSettingsModal = vi.fn();
    app.closeModals();
    expect(app.closeFilePreview).toHaveBeenCalled();
    expect(app.closeSettingsModal).toHaveBeenCalled();
  });

  it("finds a workspace id for a session", async () => {
    const app = await connectPiApp();
    appendSessionShell(app);
    app.connectEvents = vi.fn();
    app.activateCreatedSession("w1", { id: "s1", title: "one", lastUsed: "now" });
    expect(app.findWorkspaceIdForSession("s1")).toBe("w1");
    expect(app.findWorkspaceIdForSession("missing")).toBeUndefined();
  });
});
