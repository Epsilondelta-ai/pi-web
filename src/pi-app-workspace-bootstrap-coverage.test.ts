// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function failJson(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
}

describe("workspace bootstrap coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(cleanupPiAppFixture);

  it("covers workspace API fallback branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.renderWorkspaces = vi.fn();
    app.openWorkspace = vi.fn();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces/open")
      ? okJson({})
      : okJson({ workspaces: null }));
    await app.openWorkspacePath("/missing");
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);

    const cloneForm = document.createElement("form");
    cloneForm.innerHTML = `<input name="gitUrl" value="https://x/repo.git"><input name="name" value=""><button type="submit"></button>`;
    cloneForm.reset = vi.fn();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces/clone")
      ? okJson({ workspace: undefined })
      : okJson({ workspaces: null }));
    app.currentFolder = "";
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneForm });
    expect(cloneForm.reset).toHaveBeenCalled();
    const cloneFormNoButton = document.createElement("form");
    cloneFormNoButton.innerHTML = `<input name="gitUrl" value="https://x/repo.git"><input name="name" value="">`;
    cloneFormNoButton.reset = vi.fn();
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneFormNoButton });
    expect(cloneFormNoButton.reset).toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: null }));
    await app.deleteWorkspace("w1");
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);
  });

  it("covers bootstrap fallback branches", async () => {
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w-missing", sessionId: "missing" }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.renderWorkspaces = vi.fn();
    app.openActiveWorkspaceGroup = vi.fn();
    app.setConnection = vi.fn();
    app.querySelector("[data-action='refresh-workspaces']")?.remove();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: [{ id: "stored", name: "stored", path: "/stored", sessions: [{ id: "other", title: "other" }] }] })
      : okJson({}));
    await app.bootstrapAPI();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: null })
      : okJson({}));
    await app.refreshWorkspaces();
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);

    app.sessionLoadToken = Symbol("old");
    globalThis.fetch = vi.fn(async () => { throw new Error("session fail"); });
    await app.loadSession("missing");
    expect(app.setConnection).toHaveBeenCalledWith("err");
    app.setConnection.mockClear();
    globalThis.fetch = vi.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error("stale")), 0)));
    const loading = app.loadSession("stale");
    app.sessionLoadToken = Symbol("newer");
    await loading;
    expect(app.setConnection).not.toHaveBeenCalled();

    const row = document.createElement("div");
    row.dataset.session = "s-row";
    row.dataset.workspace = "w-row";
    app.append(row);
    expect(app.findSessionRow("s-row")).toBe(row);
    app.renderMessages = vi.fn();
    app.connectEvents = vi.fn();
    app.applyLoadedSession({ id: "s-row", title: "row" }, null, "");
    expect(app.dataset.activeWorkspaceId).toBe("w-row");

    const group = document.createElement("div");
    group.dataset.workspaceGroup = "bare";
    app.append(group);
    expect(() => app.openActiveWorkspaceGroup("bare")).not.toThrow();
  });

  it("boots, refreshes, and applies workspace metadata", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    const activeLabel = document.createElement("span");
    const activeTitle = document.createElement("span");
    const tree = document.createElement("div");
    const git = document.createElement("span");
    activeLabel.dataset.activeWorkspace = "";
    activeTitle.dataset.activeSessionTitle = "";
    tree.className = "tree-list";
    git.dataset.gitStatus = "";
    app.append(activeLabel, activeTitle, tree, git);
    app.renderSlashCommands = vi.fn();
    app.route = vi.fn();
    app.connectEvents = vi.fn();
    app.updatePromptMeta = vi.fn();
    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/workspaces-null")) return okJson({});
      if (value.endsWith("/workspaces")) return okJson({ workspaces: [{
        id: "w1", name: "one", path: "/one", sessions: [{ id: "s1", title: "first", lastUsed: "now" }],
      }] });
      if (value.includes("/files")) return okJson({ files: [{ type: "file", name: "a.ts", depth: 0 }] });
      if (value.includes("/git/status")) return okJson({ branch: "main", dirty: 2 });
      if (value.includes("/commands")) return okJson({ commands: [{ command: "/x" }] });
      if (value.includes("/runtime-status")) return okJson({});
      if (value.includes("/sessions/s1")) return okJson({ session: { id: "s1", title: "first", workspaceId: "w1" } });
      if (value.includes("/version")) return okJson({});
      return okJson({});
    });

    await app.bootstrapAPI();
    await app.loadWorkspaceCommands("w1");
    app.apiConnected = false;
    await app.refreshWorkspaces();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    await app.refreshWorkspaces();
    globalThis.fetch = vi.fn(async () => failJson("refresh failed"));
    await app.refreshWorkspaces();
    await app.refreshTree();
    app.dataset.activeWorkspaceId = "";
    await app.refreshTree();
    await app.loadSession("missing");
    app.renderGitStatus({ branch: "dev", dirty: 1 });
    app.renderWorkspaceTree(null);

    expect(app.apiConnected).toBe(true);
    expect(activeLabel.textContent).toBe("one");
    expect(activeTitle.textContent).toBe("first");
    expect(app.workspaceFiles?.[0]?.name).toBe("a.ts");
    expect(git.textContent).toBe("dev · 1 ✱");
    expect(app.renderSlashCommands).toHaveBeenCalledWith([{ command: "/x" }]);
    const row = document.createElement("button");
    row.dataset.session = "find-me";
    app.append(row);
    expect(app.findSessionRow("find-me")).toBe(row);
  });
});
