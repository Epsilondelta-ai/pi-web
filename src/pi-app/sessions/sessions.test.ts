// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupPiAppFixture,
  connectPiApp,
  installPiAppFixture,
} from "../test-helper";

describe("pi-app sessions", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("opens session actions from an ellipsis menu", async () => {
    const app = await connectPiApp();
    const row = app.createSessionRow("w1", { id: "s1", title: "demo", lastUsed: "now" });
    app.append(row);
    const toggle = row.querySelector("[data-action='session-menu-toggle']");
    toggle.click();
    expect(row.querySelector(".session-menu").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the new session button below sessions created without reload", async () => {
    const app = await connectPiApp();
    app.connectEvents = () => {};
    app.append(app.createWorkspaceGroup({ id: "w1", name: "demo", path: "/demo", sessions: [] }));
    app.activateCreatedSession("w1", { id: "s1", title: "new session", lastUsed: "now" });
    const rows = [...app.querySelectorAll("[data-workspace-group='w1'] .sessions > .session-row")];
    expect(rows.map((row) => row.dataset.session || row.dataset.action)).toEqual([
      "s1",
      "delete-workspace-sessions",
      "new-session",
    ]);
    expect(rows.at(-1).classList.contains("new-session-row")).toBe(true);
  });

  it("groups child agent sessions below their parent with kind markers", async () => {
    const app = await connectPiApp();
    app.append(app.createWorkspaceGroup({
      id: "w1",
      name: "demo",
      path: "/demo",
      sessions: [
        { id: "p1", title: "parent" },
        { id: "s2", title: "standalone" },
        { id: "c1", title: "reviewer", parentId: "p1", kind: "subagent" },
        { id: "t1", title: "alice", parentId: "p1", kind: "team" },
      ],
    }));

    const rows = [...app.querySelectorAll("[data-workspace-group='w1'] .session-row[data-session]")];
    expect(rows.map((row) => row.dataset.session)).toEqual(["p1", "c1", "t1", "s2"]);
    expect(rows[1].classList.contains("child-session")).toBe(true);
    expect(rows[1].classList.contains("session-kind-subagent")).toBe(true);
    expect(rows[1].querySelector(".session-kind-badge").textContent).toBe("sub");
    expect(rows[2].classList.contains("session-kind-team")).toBe(true);
    expect(rows[2].querySelector(".session-kind-badge").textContent).toBe("team");
  });


  it("opens a backend-created session immediately", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({ session: { id: "s1", title: "new session", lastUsed: "now" } }),
    }));
    const app = await connectPiApp();
    const sessionMain = app.querySelector("main");
    const emptyMain = document.createElement("main");
    sessionMain.dataset.main = "session";
    sessionMain.hidden = true;
    emptyMain.dataset.main = "empty";
    app.append(emptyMain);
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.connectEvents = vi.fn();
    app.append(app.createWorkspaceGroup({ id: "w1", name: "demo", path: "/demo", sessions: [] }));

    await app.newSession("w1");

    expect(app.dataset.activeSessionId).toBe("s1");
    expect(app.dataset.session).toBe("active");
    expect(sessionMain.hidden).toBe(false);
    expect(emptyMain.hidden).toBe(true);
    expect(app.querySelector("[data-session='s1']").classList.contains("selected")).toBe(true);
    expect(app.querySelector("[data-session='s1']").classList.contains("active")).toBe(false);
  });

  it("deletes all sessions in a workspace and clears the active session", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ deletedCount: 2, sessions: [] }),
    }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.dataset.activeSessionId = "s1";
    app.eventSource = { close: vi.fn() };
    app.append(app.createWorkspaceGroup({
      id: "w1",
      name: "demo",
      path: "/demo",
      sessionCount: 2,
      sessions: [
        { id: "s1", title: "one", lastUsed: "now" },
        { id: "s2", title: "two", lastUsed: "1m ago" },
      ],
    }));
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w1", sessionId: "s1" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await app.deleteWorkspaceSessions("w1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://backend.test/api/workspaces/w1/sessions",
      expect.objectContaining({ method: "DELETE" }),
    );
    const sessionRows = app.querySelectorAll("[data-workspace-group='w1'] > .sessions > .session-row[data-session]");
    expect(sessionRows).toHaveLength(0);
    expect(app.querySelector("[data-workspace-group='w1'] .ws-count").textContent).toBe("0");
    expect(app.dataset.activeSessionId).toBe("");
    expect(localStorage.getItem("pi.activeSession")).toBeNull();
  });

  it("sends prompt text as steering while running", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      statusText: "Accepted",
      json: async () => ({ accepted: true }),
    }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.setMode("running");
    app.prompt.value = "one more thing";

    await app.submitPrompt();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://backend.test/api/sessions/s1/steer",
      expect.objectContaining({ method: "POST" }),
    );
    expect(app.prompt.value).toBe("");
  });

  it("waits for the backend prompt echo when connected", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      statusText: "Accepted",
      json: async () => ({ accepted: true }),
    }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.prompt.value = "hello";

    app.append(app.createSessionRow("w1", { id: "s1", title: "demo", lastUsed: "now" }));

    await app.submitPrompt();
    expect(app.querySelector(".msg[data-kind='user']")).toBeNull();
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    expect(app.querySelector("[data-session='s1']").classList.contains("active")).toBe(true);
    expect(app.querySelector("[data-session='s1'] .meta").textContent).toBe("waiting");

    app.applyEvent({ type: "session.message", payload: { kind: "user", text: "hello" } });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });
    expect(app.querySelector("[data-session='s1']").classList.contains("active")).toBe(false);
  });

  it("opens loaded sessions without replaying broker history", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ session: { id: "s1", title: "demo" }, messages: [] }),
    }));
    const app = await connectPiApp();
    let connected;
    app.connectEvents = (sessionId, options) => {
      connected = { sessionId, options };
    };

    await app.loadSession("s1");
    expect(globalThis.fetch.mock.calls.at(-1)[0]).toBe("http://backend.test/api/sessions/s1?limit=120");
    expect(connected).toEqual({ sessionId: "s1", options: { replay: false } });
  });

  it("shows the update hint when a newer version is available", async () => {
    const app = await connectPiApp();
    app.renderVersionStatus({ currentVersion: "1.0.0", latestVersion: "1.1.0", updateAvailable: true });
    app.renderPiVersionStatus({ currentVersion: "0.75.0", latestVersion: "0.75.5", updateAvailable: true });
    app.renderPiVersionStatus({ currentVersion: "0.75.5", latestVersion: "0.75.5", updateAvailable: true });
    app.renderPiVersionStatus({ updateAvailable: false });

    const button = app.querySelector("[data-action='show-update-tip']");
    expect(button.hidden).toBe(false);
    expect([...document.querySelectorAll(".session-toast.warning")].some((toast) => toast.textContent.includes("Do you want to update pi?"))).toBe(true);
    button.click();
    expect(app.querySelector("[data-update-tip]").hidden).toBe(false);
  });

  it("clears pi update polling on disconnect", async () => {
    const app = await connectPiApp();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    app.piUpdateTimer = 123;
    app.disconnectedCallback();
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
  });

  it("loads older session messages from the stored cursor", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        messages: [{ kind: "pi", text: "older" }],
        cursor: "old-cursor",
        hasMore: false,
      }),
    }));
    const app = await connectPiApp();
    app.dataset.activeSessionId = "s1";
    app.renderMessages([{ kind: "pi", text: "newer" }]);
    app.sessionHistoryCursor = "cursor";
    app.sessionHistoryHasMore = true;

    await app.loadOlderSessionMessages();

    expect(globalThis.fetch.mock.calls.at(-1)[0]).toBe("http://backend.test/api/sessions/s1?limit=120&before=cursor");
    expect(app.transcriptItems).toHaveLength(2);
    expect(app.transcriptItems[0].message.text).toBe("older");
    expect(app.sessionHistoryCursor).toBe("old-cursor");
    expect(app.sessionHistoryHasMore).toBe(false);
  });

  it("switches workspace metadata to the loaded session workspace", async () => {
    const app = await connectPiApp();
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.append(app.createWorkspaceGroup({ id: "w1", name: "one", path: "/one", sessions: [] }));
    app.append(app.createWorkspaceGroup({ id: "w2", name: "two", path: "/two", sessions: [] }));

    app.applyLoadedSession({ id: "s2", title: "second", workspaceId: "w2" }, [], "idle");

    expect(app.dataset.activeWorkspaceId).toBe("w2");
    expect(app.loadWorkspaceMeta).toHaveBeenCalledWith("w2");
    expect(app.querySelector("[data-workspace-group='w2'] .sessions").hidden).toBe(false);
    expect(app.querySelector("[data-workspace-group='w1'] .sessions").hidden).toBe(true);
  });

  it("remembers loaded sessions in localStorage", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s1", title: "demo", workspaceId: "w1" },
        messages: [],
      }),
    }));
    const app = await connectPiApp();
    app.dataset.activeWorkspaceId = "w1";
    app.connectEvents = () => {};

    await app.loadSession("s1");
    expect(JSON.parse(localStorage.getItem("pi.activeSession"))).toEqual({
      workspaceId: "w1",
      sessionId: "s1",
    });
  });

});
