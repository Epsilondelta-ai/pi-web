// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupPiAppFixture,
  connectPiApp,
  installEmptySessionFixture,
  installPiAppFixture,
} from "../test-helper";

describe("pi-app session bootstrap", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("restores the remembered session on bootstrap", async () => {
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w2", sessionId: "s2" }));
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/health")) return { ok: true };
        return { session: { id: "s2", title: "second", workspaceId: "w2" }, messages: [] };
      },
    }));
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.dataset.initialWorkspaces = JSON.stringify(testWorkspaces());
    const sessionMain = app.querySelector("[data-main]");
    sessionMain.hidden = true;
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();

    await app.bootstrapAPI();
    expect(app.dataset.activeWorkspaceId).toBe("w2");
    expect(app.dataset.activeSessionId).toBe("s2");
    expect(sessionMain.hidden).toBe(false);
    expect(app.termInner.querySelector("[data-welcome-banner]")).toBeNull();
    expect(app.termInner.querySelector(".ascii-banner")).toBeNull();
    expect(app.loadWorkspaceMeta).toHaveBeenCalledWith("w2");
    expect(app.connectEvents).toHaveBeenCalledWith("s2", { replay: false });
  });

  it("shows loaded content when the remembered session has messages", async () => {
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w2", sessionId: "s2" }));
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/health")) return { ok: true };
        return { session: { id: "s2", title: "second", workspaceId: "w2" }, messages: [{ kind: "pi", text: "loaded" }] };
      },
    }));
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.dataset.initialWorkspaces = JSON.stringify(testWorkspaces());
    const sessionMain = app.querySelector("[data-main]");
    sessionMain.hidden = true;
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();

    await app.bootstrapAPI();

    expect(sessionMain.hidden).toBe(false);
    expect(app.termInner.textContent).toContain("loaded");
  });
});

describe("pi-app empty session", () => {
  beforeEach(installEmptySessionFixture);
  afterEach(cleanupPiAppFixture);

  it("reveals the live transcript immediately when sending from the empty session view", async () => {
    const app = await connectPiApp();
    app.prompt.value = "hello";
    await app.submitPrompt();
    expect(app.querySelector("[data-main]").hidden).toBe(false);
    expect(app.querySelector(".msg[data-kind='user'] .body").textContent).toBe("hello");
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    expect(app.querySelector(".ascii-banner")).toBeNull();
  });
});

function testWorkspaces() {
  return [
    { id: "w1", name: "one", path: "/one", sessionCount: 1, sessions: [{ id: "s1", title: "first" }] },
    { id: "w2", name: "two", path: "/two", sessionCount: 1, sessions: [{ id: "s2", title: "second" }] },
  ];
}
