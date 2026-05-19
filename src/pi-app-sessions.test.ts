// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupPiAppFixture,
  connectPiApp,
  installEmptySessionFixture,
  installPiAppFixture,
} from "./pi-app-test-helper";

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
    expect(app.querySelector("[data-workspace-group='w1'] .ws-meta").textContent).toBe("0");
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

    await app.submitPrompt();
    expect(app.querySelector(".msg[data-kind='user']")).toBeNull();
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();

    app.applyEvent({ type: "session.message", payload: { kind: "user", text: "hello" } });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading")).toBeNull();
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
    expect(connected).toEqual({ sessionId: "s1", options: { replay: false } });
  });

  it("shows the update hint when a newer version is available", async () => {
    const app = await connectPiApp();
    app.renderVersionStatus({ currentVersion: "1.0.0", latestVersion: "1.1.0", updateAvailable: true });

    const button = app.querySelector("[data-action='show-update-tip']");
    expect(button.hidden).toBe(false);
    button.click();
    expect(app.querySelector("[data-update-tip]").hidden).toBe(false);
  });

  it("switches workspace metadata to the loaded session workspace", async () => {
    const app = await connectPiApp();
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();
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

  it("restores the remembered session on bootstrap", async () => {
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w2", sessionId: "s2" }));
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/workspaces")) return { workspaces: testWorkspaces() };
        return { session: { id: "s2", title: "second", workspaceId: "w2" }, messages: [] };
      },
    }));
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();

    await app.bootstrapAPI();
    expect(app.dataset.activeWorkspaceId).toBe("w2");
    expect(app.dataset.activeSessionId).toBe("s2");
    expect(app.loadWorkspaceMeta).toHaveBeenCalledWith("w2");
    expect(app.connectEvents).toHaveBeenCalledWith("s2", { replay: false });
  });
});

describe("pi-app empty session", () => {
  beforeEach(installEmptySessionFixture);
  afterEach(cleanupPiAppFixture);

  it("reveals the live transcript immediately when sending from the empty session view", async () => {
    const app = await connectPiApp();
    app.prompt.value = "hello";
    await app.submitPrompt();
    expect(app.querySelector("[data-main='session']").hidden).toBe(false);
    expect(app.querySelector("[data-main='empty']").hidden).toBe(true);
    expect(app.querySelector(".msg[data-kind='user'] .body").textContent).toBe("hello");
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
  });
});

function testWorkspaces() {
  return [
    {
      id: "w1",
      name: "one",
      path: "/one",
      sessionCount: 1,
      sessions: [{ id: "s1", title: "first" }],
    },
    {
      id: "w2",
      name: "two",
      path: "/two",
      sessionCount: 1,
      sessions: [{ id: "s2", title: "second" }],
    },
  ];
}
