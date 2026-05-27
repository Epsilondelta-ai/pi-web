// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("pi-app workspace navigation", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("creates a new session in the workspace selected from the sidebar", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({ session: { id: "s2", title: "new session", lastUsed: "now" } }),
    }));
    const app = await connectPiApp();
    const sessionMain = app.querySelector("main");
    const emptyMain = document.createElement("main");
    const activeWorkspace = document.createElement("span");
    sessionMain.dataset.main = "session";
    emptyMain.dataset.main = "empty";
    activeWorkspace.dataset.activeWorkspace = "";
    app.append(emptyMain, activeWorkspace);
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "hahn";
    app.loadWorkspaceCommands = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.connectEvents = vi.fn();
    app.renderWorkspaces([
      { id: "hahn", name: "hahn-monorepo", path: "/hahn", sessionCount: 0, sessions: [] },
      { id: "juun", name: "juun-ai", path: "/juun", sessionCount: 0, sessions: [] },
    ]);

    app.querySelector("[data-workspace='juun'].ws-row").click();
    expect(app.dataset.activeWorkspaceId).toBe("hahn");
    expect(activeWorkspace.textContent).not.toBe("juun-ai");
    expect(app.querySelector("[data-workspace='hahn'].ws-row").getAttribute("aria-current")).toBe("true");
    expect(app.querySelector("[data-workspace='juun'].ws-row").getAttribute("aria-expanded")).toBe("true");
    expect(app.loadWorkspaceMeta).not.toHaveBeenCalled();
    await app.newSession("juun");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://backend.test/api/workspaces/juun/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(app.dataset.activeWorkspaceId).toBe("juun");
    expect(activeWorkspace.textContent).toBe("juun-ai");
    expect(app.querySelector("[data-workspace='juun'].ws-row").getAttribute("aria-current")).toBe("true");
    expect(app.querySelector("[data-session='s2']").classList.contains("selected")).toBe(true);
    expect(app.querySelector("[data-session='s2']").classList.contains("active")).toBe(false);
    expect(app.querySelector("[data-session='s2'] .meta").hidden).toBe(true);
  });

  it("keeps workspace rendering no-ops safe without optional containers", async () => {
    const app = await connectPiApp();
    const bare = document.createElement("div");
    bare.dataset.workspaceGroup = "bare";
    bare.innerHTML = `<button class="ws-row"></button>`;
    app.append(bare);
    expect(() => app.toggleWorkspace("bare")).not.toThrow();
    app.querySelector(".sidebar .sb-section").remove();
    expect(() => app.renderSidebarWorkspaces([{ id: "w1", name: "one", path: "/one", sessions: [] }])).not.toThrow();
    expect(() => app.renderRecentWorkspaces([{ id: "w1", name: "one", path: "/one", sessions: [] }])).not.toThrow();
  });

  it("renders recent workspaces and marks workspaces that contain a waiting session", async () => {
    const app = await connectPiApp();
    const count = document.createElement("span");
    const recent = document.createElement("div");
    count.dataset.workspaceCount = "";
    recent.dataset.recentWorkspaces = "";
    recent.append(document.createElement("button"));
    recent.firstElementChild.className = "recent-row";
    app.prepend(count, recent);
    app.dataset.activeSessionId = "s2";

    app.renderWorkspaces([
      { id: "w1", name: "one", path: "/one", sessionCount: 1, lastUsed: "<old>", sessions: [{ id: "s1", title: "first" }] },
      { id: "w2", name: "two", path: "/two", sessionCount: 1, live: true, sessions: [{ id: "s2", title: "second", live: true }] },
      { id: "w3", name: "three", path: "/three", sessionCount: 0, sessions: [] },
      { id: "w4", name: "four", path: "/four", sessionCount: 0, sessions: [] },
      { id: "w5", name: "five", path: "/five", sessionCount: 0, sessions: [] },
    ]);

    const row = app.querySelector("[data-workspace='w2'].ws-row");
    expect(count.textContent).toBe("5 known");
    expect(recent.querySelectorAll(".recent-row")).toHaveLength(4);
    expect(recent.querySelector(".recent-row").getAttribute("aria-label")).toBe("open one");
    expect(recent.querySelector(".ws-stat").innerHTML).toContain("&lt;old&gt;");
    expect(recent.querySelectorAll(".ws-stat")[1].textContent).toContain("● live");
    expect(row.classList.contains("has-active-session")).toBe(true);
    expect(row.querySelector(".ws-name .dot").classList.contains("live")).toBe(true);
    expect(app.querySelector("[data-session='s2']").classList.contains("active")).toBe(true);
    expect(app.querySelector("[data-session='s2']").getAttribute("aria-current")).toBe("true");
  });
});
