// @ts-nocheck
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/SortableWorkspaceSidebar", () => ({
  default: (props) => {
    globalThis.__lastSortableSidebarProps = props;
    return "sortable sidebar";
  },
}));
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function failJson(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
}

describe("workspace folder/render/bootstrap coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanupPiAppFixture();
  });

  it("renders recent workspaces, sidebar groups, and folder rows", async () => {
    const app = await connectPiApp();
    const recent = document.createElement("div");
    const count = document.createElement("span");
    const form = document.createElement("form");
    const input = document.createElement("input");
    const path = document.createElement("span");
    const list = document.createElement("div");
    recent.dataset.recentWorkspaces = "";
    count.dataset.workspaceCount = "";
    form.dataset.pathForm = "";
    input.name = "path";
    path.dataset.folderPath = "";
    list.dataset.folderList = "";
    form.append(input);
    app.append(recent, count, form, path, list);
    app.dataset.activeWorkspaceId = "w2";

    const workspaces = [
      { id: "w1", name: "one", path: "/one", sessionCount: 2, lastUsed: "1m", sessions: [] },
      { id: "w2", name: "two", path: "/two", sessionCount: 1, live: true, sessions: [
        { id: "s2", title: "run", lastUsed: "now", live: true },
      ] },
    ];
    app.renderWorkspaces();
    expect(count.textContent).toBe("0 known");
    app.renderWorkspaces(workspaces);
    app.renderWorkspaces(workspaces);
    app.renderFolderListing({ path: "/tmp", displayPath: "tmp", folders: [
      { name: "child", path: "/tmp/child", displayPath: "~/child" },
    ] });

    expect(count.textContent).toBe("2 known");
    expect(recent.querySelectorAll(".recent-row")).toHaveLength(2);
    expect(recent.querySelector(".ws-stat").innerHTML).toContain("1m");
    expect(recent.querySelectorAll(".ws-stat")[1].innerHTML).toContain("live");
    expect(app.querySelector("[data-workspace-group='w2'] .sessions").hidden).toBe(false);
    expect(app.querySelector("[data-workspace-group='w2'] .ws-name .dot").classList.contains("live")).toBe(true);
    const sidebarEvents = [];
    window.addEventListener("pi-sidebar-workspace-state", (event) => sidebarEvents.push(event.detail));
    app.toggleWorkspace("w2");
    expect(sidebarEvents.at(-1)).toEqual({ activeWorkspaceId: "w2", openWorkspaceId: "" });
    app.toggleWorkspace("w1");
    await Promise.resolve();
    expect(app.querySelector("[data-workspace-group='w1'] .ws-count").textContent).toBe("2");
    expect(app.querySelector("[data-workspace-group='w1'] .ws-count-label")).toBeNull();
    expect(app.querySelector("[data-workspace-group='w1'] .ws-meta").getAttribute("aria-label")).toBe("2 sessions");
    expect(app.dataset.activeWorkspaceId).toBe("w2");
    expect(app.sidebarOpenWorkspaceId).toBe("w1");
    expect(sidebarEvents.at(-1)).toEqual({ activeWorkspaceId: "w2", openWorkspaceId: "w1" });
    await act(async () => {
      app.querySelector(".sidebar .sb-section").dispatchEvent(new Event("pointerenter"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await app.renderSortableSidebarWorkspaces(app.querySelector(".sidebar .sb-section"), app.workspaceList);
    });
    expect(globalThis.__lastSortableSidebarProps.openWorkspaceId).toBe("w1");
    app.sidebarOpenWorkspaceId = "";
    await act(async () => {
      await app.renderSortableSidebarWorkspaces(app.querySelector(".sidebar .sb-section"), app.workspaceList);
    });
    expect(globalThis.__lastSortableSidebarProps.openWorkspaceId).toBe("");
    delete app.dataset.activeWorkspaceId;
    app.openActiveWorkspaceGroup("");
    expect(sidebarEvents.at(-1)).toEqual({ activeWorkspaceId: "", openWorkspaceId: "" });
    const emptyGroup = app.createWorkspaceGroup({ id: "empty", name: "empty", path: "/empty", sessionCount: 0 });
    expect(emptyGroup.querySelector(".clear-sessions-row")).toBeNull();
    expect(app.workspaceHasActiveSession({ id: "empty" })).toBe(false);
    expect(input.value).toBe("/tmp");
    expect(path.textContent).toBe("tmp");
    expect(list.querySelector(".folder-row").dataset.path).toBe("/tmp/child");

    app.renderFolderListing({ path: "/empty", folders: [] });
    expect(list.querySelector(".folder-empty").textContent).toBe("no folders");
  });

  it("polls workspace sessions while child agents are live", async () => {
    vi.useFakeTimers();
    await customElements.whenDefined("pi-app");
    const app = document.querySelector("pi-app");
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [
      { id: "w1", name: "one", path: "/one", sessionCount: 1, sessions: [] },
    ] }));

    app.renderWorkspaces([{ id: "w1", name: "one", path: "/one", sessionCount: 1, sessions: [
      { id: "parent", title: "parent" },
      { id: "child", title: "child", parentId: "parent", kind: "subagent", live: true },
    ] }]);

    expect(app.agentSessionStatusTimer).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1500);
    expect(globalThis.fetch).toHaveBeenCalledWith("http://backend.test/api/workspaces", {
      headers: { "Content-Type": "application/json" },
    });

    app.renderWorkspaces([{ id: "w1", name: "one", path: "/one", sessionCount: 1, sessions: [] }]);
    expect(app.agentSessionStatusTimer).toBeUndefined();
  });

  it("keeps polling briefly while hidden child agent sessions appear", async () => {
    vi.useFakeTimers();
    await customElements.whenDefined("pi-app");
    const app = document.querySelector("pi-app");
    app.apiConnected = true;
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [] }));

    app.startAgentSessionDiscoveryPolling();

    expect(app.agentSessionStatusTimer).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1500);
    expect(globalThis.fetch).toHaveBeenCalled();

    app.agentSessionDiscoveryUntil = Date.now() - 1;
    app.syncAgentSessionStatusPolling();
    expect(app.agentSessionStatusTimer).toBeUndefined();
  });

  it("renders the React sortable sidebar and persists drag callbacks", async () => {
    const app = await connectPiApp();
    const section = app.querySelector(".sidebar .sb-section");
    app.dataset.activeWorkspaceId = "w1";
    app.dataset.activeSessionId = "s1";

    section.append(app.createWorkspaceGroup({ id: "legacy", name: "legacy", path: "/legacy", sessionCount: 0, sessions: [] }));
    await act(async () => {
      await app.renderSortableSidebarWorkspaces(section, [{
        id: "w1",
        name: "one",
        path: "/one",
        sessionCount: 1,
        sessions: [{ id: "s1", title: "one", lastUsed: "now" }],
      }]);
    });

    expect(section.querySelector("[data-sortable-workspaces]")).not.toBeNull();
    expect(section.querySelector("[data-sortable-workspaces]").textContent).toBe("sortable sidebar");
    globalThis.__lastSortableSidebarProps.onWorkspaceOrder(["w1"]);
    globalThis.__lastSortableSidebarProps.onSessionOrder("w1", ["s1"]);
    expect(localStorage.getItem("pi.workspaceOrder")).toContain("w1");
    expect(localStorage.getItem("pi.sessionOrder")).toContain("s1");

    delete app.dataset.activeWorkspaceId;
    delete app.dataset.activeSessionId;
    await act(async () => {
      await app.renderSortableSidebarWorkspaces(section, [{ id: "w1", name: "one", path: "/one", sessionCount: 0, sessions: [] }]);
    });
    expect(section.querySelectorAll("[data-sortable-workspaces]")).toHaveLength(1);
    await act(async () => {
      app.renderSidebarWorkspaces([{ id: "w2", name: "two", path: "/two", sessionCount: 0, sessions: [] }]);
      await Promise.resolve();
    });
    expect(globalThis.__lastSortableSidebarProps.workspaces[0].id).toBe("w2");

    const staleSection = document.createElement("section");
    document.body.append(staleSection);
    const staleRender = app.renderSortableSidebarWorkspaces(staleSection, [{ id: "old", sessions: [] }]);
    app.sidebarSortableRenderToken = Symbol("newer-render");
    await staleRender;
    expect(staleSection.querySelector("[data-sortable-workspaces]")).toBeNull();

    const detached = document.createElement("div");
    await app.renderSortableSidebarWorkspaces(detached, []);
    expect(detached.querySelector("[data-sortable-workspaces]")).toBeNull();
    act(() => app.sidebarSortableRoot.unmount());
  });

  it("loads folders and opens workspaces through backend responses", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.renderFolderListing = vi.fn();
    app.renderWorkspaces = vi.fn();
    app.openWorkspace = vi.fn();
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async (url, _options = {}) => {
      const value = String(url);
      if (value.includes("/system/folders")) {
        return okJson({ path: "/root", folders: [] });
      }
      if (value.endsWith("/workspaces/open")) return okJson({ id: "w1" });
      if (value.endsWith("/workspaces")) {
        return okJson({ workspaces: [{ id: "w1", path: "/root" }] });
      }
      return okJson({});
    });

    const browser = document.createElement("div");
    browser.dataset.folderBrowser = "";
    browser.hidden = true;
    app.append(browser);
    app.currentFolder = "";
    await app.browseFolder();
    await app.loadFolder("");
    await app.openWorkspacePath("/root");
    await app.openWorkspacePath("");

    expect(app.currentFolder).toBe("/root");
    expect(app.currentFolderParent).toBe("/root");
    expect(app.renderFolderListing).toHaveBeenCalledWith(expect.objectContaining({ path: "/root" }));
    expect(browser.hidden).toBe(false);
    expect(app.renderWorkspaces).toHaveBeenCalledWith([{ id: "w1", path: "/root" }]);
    expect(app.openWorkspace).toHaveBeenCalledWith("w1");
    expect(app.setConnection).not.toHaveBeenCalledWith("err");
  });

  it("handles folder, clone, path, and delete failure branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = false;
    app.setConnection = vi.fn();
    await app.loadFolder("~");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    app.apiConnected = true;
    globalThis.fetch = vi.fn(async () => failJson("nope"));
    await app.loadFolder("~");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    const cloneForm = document.createElement("form");
    cloneForm.innerHTML = `<input name="gitUrl" value="https://x/repo.git"><input name="name" value="repo"><button type="submit"></button>`;
    cloneForm.reset = vi.fn();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneForm });
    expect(window.alert).toHaveBeenCalledWith("nope");
    globalThis.fetch = vi.fn(async () => { throw "string clone failure"; });
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneForm });
    expect(window.alert).toHaveBeenCalledWith("string clone failure");
    expect(cloneForm.querySelector("button").disabled).toBe(false);

    const emptyClone = document.createElement("form");
    emptyClone.innerHTML = `<input name="gitUrl" value=""><button type="submit"></button>`;
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: emptyClone });

    app.currentFolder = "";
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/workspaces/clone")) return okJson({});
      if (String(url).endsWith("/workspaces")) return okJson({ workspaces: [{ id: "fallback", path: "/fallback" }] });
      return okJson({});
    });
    app.openWorkspace = vi.fn();
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneForm });
    expect(cloneForm.reset).toHaveBeenCalled();
    expect(app.openWorkspace).toHaveBeenCalledWith("fallback");

    app.renderFolderListing({ path: "/none", folders: [{ name: "x", path: "/x" }] });

    const pathForm = document.createElement("form");
    pathForm.innerHTML = `<input name="path" value=" /bad ">`;
    app.route = vi.fn();
    app.openWorkspacePath = vi.fn(async () => { throw new Error("bad path"); });
    await app.submitWorkspacePath({ preventDefault: vi.fn(), currentTarget: pathForm });
    expect(app.route).toHaveBeenCalledWith("workspace");
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [{ id: "ok", path: "/ok" }] }));
    app.openWorkspacePath = vi.fn();
    pathForm.querySelector("input").value = "/ok";
    await app.submitWorkspacePath({ preventDefault: vi.fn(), currentTarget: pathForm });
    expect(app.openWorkspacePath).toHaveBeenCalledWith("/ok");

    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await app.deleteWorkspace("w1");
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [] }));
    app.renderWorkspaces = vi.fn();
    await app.deleteWorkspace("w1");
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);
    globalThis.fetch = vi.fn(async () => failJson("delete failed"));
    window.confirm.mockReturnValue(true);
    await app.deleteWorkspace("w1");
    expect(app.setConnection).toHaveBeenCalledWith("err");
    await app.deleteWorkspace("");
    delete app.openWorkspace;
    app.activateWorkspaceForSession = vi.fn();
    app.route = vi.fn();
    await app.openWorkspace("w1");
    expect(app.activateWorkspaceForSession).toHaveBeenCalledWith("w1", { loadContext: true, forceLoadContext: true });
  });

  it("browses on picker bootstrap and refreshes the tree button", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.dataset.route = "picker";
    app.browseFolder = vi.fn();
    app.renderWorkspaces = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [] }));
    await app.bootstrapAPI();
    expect(app.browseFolder).toHaveBeenCalled();

    const button = document.createElement("button");
    button.dataset.action = "refresh-tree";
    app.append(button);
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    await app.refreshTree();
    expect(app.loadWorkspaceMeta).toHaveBeenCalledWith("w1");
    expect(button.disabled).toBe(false);
  });

  it("covers picker bootstrap, refresh guards, and folder edge branches", async () => {
    const app = await connectPiApp();
    const browser = document.createElement("div");
    browser.dataset.folderBrowser = "";
    app.append(browser);
    app.dataset.route = "picker";
    app.browseFolder = vi.fn();
    app.renderWorkspaces = vi.fn();
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: [{ id: "w-empty", name: "empty", path: "/empty", sessions: [] }] })
      : okJson({}));

    await app.bootstrapAPI();
    expect(app.browseFolder).toHaveBeenCalled();

    app.apiConnected = false;
    await app.refreshWorkspaces();
    await app.refreshTree();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "";
    globalThis.fetch = vi.fn(async () => okJson({}));
    app.renderWorkspaces = vi.fn();
    await app.refreshWorkspaces();
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);

    app.dataset.activeWorkspaceId = "w1";
    app.workspaceList = [{ id: "w1", name: "one", path: "/one", sessions: [{ id: "s1" }], sessionCount: 1, live: true }];
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: [] }));
    app.openActiveWorkspaceGroup = vi.fn();
    await app.refreshWorkspaces();
    expect(app.renderWorkspaces).toHaveBeenLastCalledWith([
      { id: "w1", name: "one", path: "/one", sessions: [], sessionCount: 0, live: false },
    ]);

    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w-empty";
    const refresh = document.createElement("button");
    refresh.dataset.action = "refresh-tree";
    app.append(refresh);
    app.loadWorkspaceMeta = vi.fn();
    await app.refreshTree();
    expect(refresh.disabled).toBe(false);

    const list = app.querySelector("[data-folder-list]") || document.createElement("div");
    list.dataset.folderList = "";
    app.append(list);
    app.renderFolderListing({ path: "/fallback", folders: undefined });
    expect(list.querySelector(".folder-empty")).not.toBeNull();

    app.currentFolder = "";
    delete app.browseFolder;
    app.loadFolder = vi.fn();
    await app.browseFolder();
    expect(app.loadFolder).toHaveBeenCalledWith("~");

    const pathOnly = app.folderRow({ name: "plain", path: "/plain" });
    expect(pathOnly.querySelector(".folder-path").textContent).toBe("/plain");

    const form = document.createElement("form");
    form.innerHTML = `<input name="path" value=" ">`;
    await app.submitWorkspacePath({ preventDefault: vi.fn(), currentTarget: form });
    app.apiConnected = false;
    form.querySelector("input").value = "/offline";
    app.route = vi.fn();
    await app.submitWorkspacePath({ preventDefault: vi.fn(), currentTarget: form });
    expect(app.route).toHaveBeenCalledWith("workspace");
    app.activateBootstrapSession({ id: "s-default", title: "default" });
    app.renderMessages = vi.fn();
    app.connectEvents = vi.fn();
    app.applyLoadedSession({ id: "s-default", title: "default" }, undefined, "");
  });

  it("covers git panel guards, errors, empty state, details, refs, and escaping", async () => {
    const app = await connectPiApp();
    app.dataset.activeWorkspaceId = "";
    await app.showGitHistory();
    app.renderGitHistory([{ hash: "no-panel", shortHash: "n" }]);
    app.renderGitHistoryError("no panel");
    app.setGitPanelMode("loading");
    app.dataset.activeWorkspaceId = "w1";
    app.querySelector("[data-git-panel]")?.remove();
    expect(app.gitPanelOpen()).toBe(true);
    await app.showGitHistory();

    const panel = document.createElement("div");
    panel.dataset.gitPanel = "";
    const tree = document.createElement("div");
    tree.className = "tree-list";
    const show = document.createElement("button");
    show.dataset.action = "show-git-history";
    const file = document.createElement("button");
    file.dataset.action = "show-file-tree";
    app.append(panel, tree, show, file);

    globalThis.fetch = vi.fn(async () => failJson("git <bad>"));
    await app.showGitHistory();
    expect(panel.innerHTML).toContain("git &lt;bad&gt;");
    app.showFileTreePanel();
    expect(panel.hidden).toBe(true);
    expect(tree.hidden).toBe(false);
    await app.refreshGitHistory();

    panel.hidden = false;
    globalThis.fetch = vi.fn(async () => okJson({ commits: [] }));
    await app.showGitHistory();
    expect(panel.textContent).toContain("no commits found");

    app.renderGitHistory([{ hash: "h1", shortHash: "h1", subject: "<subject>", authorName: "", date: "not-date", files: [{ status: "renamed", oldPath: "old.js", path: "new.js", additions: 1, deletions: 2 }] }]);
    expect(panel.textContent).toContain("<subject>");
    expect(panel.innerHTML).toContain("not-date");
    globalThis.fetch = vi.fn(async () => failJson("commit <bad>"));
    await app.selectGitCommit("h1");
    expect(panel.innerHTML).toContain("commit &lt;bad&gt;");
    await app.selectGitCommit("");
    app.dataset.activeWorkspaceId = "";
    await app.selectGitCommit("h1");

    app.dataset.activeWorkspaceId = "w1";
    app.renderGitCommitDetail({ commit: { refs: ["main", "tag"], files: [{ oldPath: "a", path: "b", status: "renamed" }] }, truncated: true });
    expect(panel.querySelector(".git-refs")?.textContent).toContain("main");
    expect(panel.textContent).toContain("diff truncated");
    expect(panel.textContent).toContain("no diff");

    app.gitHistoryHasMore = false;
    await app.loadMoreGitHistory();
    app.gitHistoryHasMore = true;
    app.dataset.activeWorkspaceId = "";
    await app.loadMoreGitHistory();
    app.dataset.activeWorkspaceId = "w1";
    globalThis.fetch = vi.fn(async () => failJson("more failed"));
    await app.loadMoreGitHistory();
    expect(panel.textContent).toContain("more failed");
  });

  it("renders git history as a commit-only list", async () => {
    const app = await connectPiApp();
    const panel = document.createElement("div");
    panel.dataset.gitPanel = "";
    app.append(panel);

    app.renderGitHistory([
      {
        hash: "abc123",
        shortHash: "abc123",
        subject: "initial",
        authorName: "pi",
        date: "2026-01-01T00:00:00Z",
        parents: ["p0", "p1"],
        files: [],
      },
    ]);

    expect(panel.querySelector("[data-git-graph-library]")).toBeNull();
    expect(panel.querySelector("[data-action='toggle-git-graph']")).toBeNull();
    expect(panel.querySelector("[data-git-detail]")).toBeNull();
    expect(panel.querySelector(".git-commit-row")?.textContent).toContain("initial");
  });

  it("opens and closes git commit detail on demand", async () => {
    const app = await connectPiApp();
    const panel = document.createElement("div");
    panel.dataset.gitPanel = "";
    app.dataset.activeWorkspaceId = "w1";
    app.append(panel);
    app.renderGitHistory([
      {
        hash: "abc123",
        shortHash: "abc123",
        subject: "initial",
        authorName: "pi",
        date: "2026-01-01T00:00:00Z",
        files: [],
      },
    ]);
    globalThis.fetch = vi.fn(async () => okJson({
      commit: { shortHash: "abc123", subject: "initial", authorName: "pi", date: "2026-01-01T00:00:00Z", files: [] },
      body: "body",
      diff: "diff",
    }));

    await app.selectGitCommit("abc123");

    expect(panel.querySelector("[data-git-history-grid]").classList.contains("detail-open")).toBe(true);
    expect(panel.querySelector("[data-git-detail]")?.textContent).toContain("initial");
    expect(panel.querySelector("[data-action='close-git-detail']")).not.toBeNull();

    app.closeGitDetail();
    expect(panel.querySelector("[data-git-detail]")).toBeNull();
    expect(panel.querySelector(".git-commit-row")?.classList.contains("selected")).toBe(false);
  });

  it("covers git history fallback rows, errors, and guards", async () => {
    const app = await connectPiApp();
    app.dataset.activeWorkspaceId = "w1";
    app.setConnection = vi.fn();
    app.renderGitHistory([{ hash: "h0", shortHash: "s0", date: "bad-date", files: null }]);
    expect(app.querySelector("[data-git-panel]")).toBeNull();
    const panel = document.createElement("div");
    const tree = document.createElement("div");
    panel.dataset.gitPanel = "";
    tree.className = "tree-list";
    app.append(panel, tree);
    app.ensureGitPanel();
    app.setGitPanelMode("idle");
    expect(panel.dataset.mode).toBe("idle");
    app.renderGitHistory([{ hash: "h1", shortHash: "s1", date: "bad-date", files: null }]);
    expect(panel.textContent).toContain("unknown");
    expect(panel.textContent).toContain("bad-date");
    globalThis.fetch = vi.fn(async () => okJson({ commits: null }));
    await app.showGitHistory();
    expect(panel.textContent).toContain("no commits found");
    globalThis.fetch = vi.fn(async () => { throw "git string down"; });
    await app.showGitHistory();
    expect(panel.textContent).toContain("git history unavailable");
    app.gitHistoryHasMore = true;
    app.gitHistoryLimit = undefined;
    globalThis.fetch = vi.fn(async () => { throw "more string down"; });
    await app.loadMoreGitHistory();
    expect(panel.textContent).toContain("git history unavailable");
    app.renderGitHistory([{ hash: "h1", shortHash: "s1", date: "bad-date", files: null }]);
    app.showGitHistory = vi.fn();
    await app.refreshGitHistory();
    expect(app.showGitHistory).toHaveBeenCalled();
    await app.selectGitCommit("");
    globalThis.fetch = vi.fn(async () => { throw "commit string down"; });
    await app.selectGitCommit("h1");
    expect(panel.textContent).toContain("commit unavailable");
    app.renderGitCommitDetail({ commit: { refs: ["main"], files: [{ oldPath: "old.ts", path: "new.ts", status: "renamed" }] }, truncated: true });
    expect(panel.textContent).toContain("diff truncated");
    expect(panel.textContent).toContain("old.ts");
    app.renderGitCommitDetail({ commit: null, body: "", diff: "" });
    expect(panel.textContent).toContain("commit");
  });

  it("loads git history in 30 commit pages", async () => {
    const app = await connectPiApp();
    const panel = document.createElement("div");
    panel.dataset.gitPanel = "";
    app.dataset.activeWorkspaceId = "w1";
    app.gitHistoryLimit = 30;
    app.gitHistoryHasMore = true;
    app.append(panel);
    const commits = Array.from({ length: 60 }, (_, index) => ({
      hash: `hash${index}`,
      shortHash: `h${index}`,
      subject: `commit ${index}`,
      authorName: "pi",
      date: "2026-01-01T00:00:00Z",
      parents: index === 59 ? [] : [`h${index + 1}`],
      files: [],
    }));
    app.renderGitHistory(commits.slice(0, 30));
    panel.querySelector("[data-git-commit-scroll]").scrollTop = 320;
    globalThis.fetch = vi.fn(async () => okJson({ commits }));

    await app.loadMoreGitHistory();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("limit=60"), expect.anything());
    expect(panel.querySelectorAll(".git-commit-row")).toHaveLength(60);
    expect(panel.querySelector("[data-git-commit-scroll]").scrollTop).toBe(320);
    expect(panel.querySelector("[data-action='load-more-git-history']")?.textContent).toBe("load 30 more");
  });
});
