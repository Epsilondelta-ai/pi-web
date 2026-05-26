import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  getGitCommit: vi.fn(),
  getGitHistory: vi.fn(),
  getGitStatus: vi.fn(),
  getSession: vi.fn(),
  getWorkspaceCommands: vi.fn(),
  getWorkspaceFiles: vi.fn(),
  getWorkspaces: vi.fn(),
  getOAuthLoginSession: vi.fn(),
  getOAuthProviders: vi.fn(),
  getAuthProviders: vi.fn(),
  sendOAuthLoginInput: vi.fn(),
  startOAuthLogin: vi.fn(),
}));

import * as api from "../../lib/api";
import { gitHistoryMethods } from "./git-history-methods";
import { oauthMethods } from "./oauth-methods";
import { workspaceBootstrapMethods } from "./workspace-bootstrap-methods";

function owner(html = "") {
  const root = document.createElement("div");
  root.innerHTML = html;
  Object.assign(root, {
    apiConnected: true,
    setConnection: vi.fn(),
    renderWorkspaces: vi.fn(),
    renderMessages: vi.fn(),
    renderSlashCommands: vi.fn(),
    renderTranscriptWindow: vi.fn(),
    renderWorkspaceTree: vi.fn(),
    renderGitStatus: vi.fn(),
    resetActiveSessionState: vi.fn(),
    resetTranscriptWindow: vi.fn(),
    simpleMessage: vi.fn(() => {
      const row = document.createElement("div");
      row.innerHTML = `<span class="body"></span>`;
      return row;
    }),
    appendTranscriptNode: vi.fn(),
    answeredChoiceIdsFrom: vi.fn(() => ["choice"]),
    createTranscriptItem: vi.fn((message) => ({ message, id: Math.random() })),
    setMode: vi.fn(),
    connectEvents: vi.fn(),
    markSelectedSessionRow: vi.fn(),
    syncActiveWorkspaceRows: vi.fn(),
    updatePromptMeta: vi.fn(),
    loadRuntimeStatus: vi.fn(),
    loadWorkspaceSettingsState: vi.fn(() => Promise.resolve()),
    loadVersionStatus: vi.fn(),
    route: vi.fn(),
    browseFolder: vi.fn(),
    fillAuthForm: vi.fn(),
    fillOAuthForm: vi.fn(),
    pollOAuthSession: vi.fn(),
    setOAuthStatus: vi.fn(),
    refreshAuthAfterOAuth: vi.fn(),
  }, gitHistoryMethods, oauthMethods, workspaceBootstrapMethods);
  root.dataset.activeWorkspaceId = "w1";
  root.termInner = document.createElement("div");
  return root;
}

describe("workspace residual method coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("covers bootstrap session selection, metadata, older messages, and workspace activation branches", async () => {
    const app = owner(`<span data-active-workspace></span><span data-empty-workspace></span><span data-active-session-title></span><div data-git-status></div><div data-workspace-group="w1"><button class="ws-row"></button><div class="sessions"></div><span class="label">One</span><button data-session="s1" data-title="Saved" data-workspace="w1"></button></div>`);
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w2", sessionId: "s2" }));
    vi.mocked(api.getWorkspaces).mockResolvedValueOnce({ workspaces: [
      { id: "w1", name: "One", sessions: [{ id: "s1", title: "First" }] },
      { id: "w2", name: "Two", sessions: [{ id: "s2", title: "Stored", workspaceId: "w2" }] },
    ] });
    vi.mocked(api.getWorkspaceFiles).mockResolvedValue({ files: [{ name: "a" }] });
    vi.mocked(api.getGitStatus).mockResolvedValue({ branch: "main", dirty: 1, files: { a: "modified" } });
    vi.mocked(api.getWorkspaceCommands).mockResolvedValue({ commands: ["/x"] });
    vi.mocked(api.getSession).mockResolvedValueOnce({ session: { id: "s2", title: "Stored", workspaceId: "w2" }, messages: [{ kind: "pi" }], status: "running", cursor: "c1", hasMore: true });

    await app.bootstrapAPI();
    expect(app.dataset.activeWorkspaceId).toBe("w2");
    expect(app.route).toHaveBeenCalledWith("workspace");
    expect(app.renderMessages).toHaveBeenCalledWith([{ kind: "pi" }]);

    app.renderWorkspaceTree([{ name: "f" }], { f: "modified" }, "f");
    app.renderGitStatus({ branch: "dev", dirty: 2 });
    expect(app.updatePromptMeta).toHaveBeenCalledWith({ currentBranch: "dev" });
    await app.loadWorkspaceCommands("w1");
    expect(app.renderSlashCommands).toHaveBeenCalledWith(["/x"]);
    vi.mocked(api.getWorkspaceCommands).mockRejectedValueOnce(new Error("commands"));
    await app.loadWorkspaceCommands("w1");

    app.sessionHistoryHasMore = true;
    app.sessionHistoryLoading = false;
    app.dataset.activeSessionId = "s2";
    app.sessionHistoryCursor = "c1";
    vi.mocked(api.getSession).mockResolvedValueOnce({ messages: [{ kind: "user" }], cursor: "c0", hasMore: false });
    await app.loadOlderSessionMessages();
    expect(app.renderTranscriptWindow).toHaveBeenCalledWith({ stickToBottom: false, preservePrepend: true });
    app.prependLoadedMessages([]);

    app.apiConnected = true;
    app.loadWorkspaceContext = vi.fn();
    app.activateWorkspaceForSession("w1", { loadContext: true, forceLoadContext: true });
    expect(app.loadWorkspaceContext).toHaveBeenCalledWith("w1");
    app.openActiveWorkspaceGroup("w1");
    expect(app.querySelector(".sessions").hidden).toBe(false);
    app.updateActiveWorkspaceLabel("missing");
    expect(app.querySelector("[data-active-workspace]").textContent).toBe("missing");
  });

  it("covers bootstrap failure and stale load/older-message guards", async () => {
    const app = owner();
    vi.mocked(api.getWorkspaces).mockRejectedValueOnce(new Error("offline"));
    await app.bootstrapAPI();
    expect(app.apiConnected).toBe(false);
    expect(app.setConnection).toHaveBeenCalledWith("err");

    vi.mocked(api.getSession).mockImplementationOnce(async () => {
      app.sessionLoadToken = Symbol("newer");
      return { session: { id: "old" }, messages: [] };
    });
    await app.loadSession("old");
    app.sessionLoadToken = Symbol("old");
    vi.mocked(api.getSession).mockRejectedValueOnce(new Error("bad"));
    await app.loadSession("old");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    app.dataset.activeSessionId = "s1";
    app.sessionHistoryHasMore = true;
    app.sessionHistoryLoading = false;
    app.sessionHistoryCursor = "a";
    vi.mocked(api.getSession).mockImplementationOnce(async () => {
      app.dataset.activeSessionId = "other";
      return { messages: [{ kind: "pi" }], cursor: "b", hasMore: true };
    });
    await app.loadOlderSessionMessages();
    app.dataset.activeSessionId = "s1";
    app.sessionHistoryCursor = "a";
    vi.mocked(api.getSession).mockRejectedValueOnce(new Error("older"));
    await app.loadOlderSessionMessages();
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });

  it("covers git history panels, pagination, details, templates, and errors", async () => {
    const app = owner(`<div data-git-panel hidden></div><div class="tree-list"></div><button data-action="show-git-history"></button><button data-action="show-file-tree"></button>`);
    vi.mocked(api.getGitHistory).mockResolvedValueOnce({ commits: [] });
    await app.showGitHistory();
    expect(app.querySelector("[data-git-panel]").textContent).toContain("no commits");
    app.showFileTreePanel();
    expect(app.querySelector(".tree-list").hidden).toBe(false);
    await app.refreshGitHistory();

    vi.mocked(api.getGitHistory).mockResolvedValueOnce({ commits: Array.from({ length: 30 }, (_, i) => ({ hash: `h${i}`, shortHash: `s${i}`, subject: `sub${i}`, date: "bad-date", files: [{ path: "p", oldPath: "o", status: "renamed" }] })) });
    await app.showGitHistory();
    expect(app.gitHistoryHasMore).toBe(true);
    expect(app.querySelectorAll(".git-commit-row")).toHaveLength(30);

    app.gitHistoryLimit = 170;
    vi.mocked(api.getGitHistory).mockResolvedValueOnce({ commits: Array.from({ length: 200 }, (_, i) => ({ hash: `x${i}`, shortHash: `x${i}`, files: [] })) });
    await app.loadMoreGitHistory();
    expect(app.gitHistoryHasMore).toBe(false);

    vi.mocked(api.getGitCommit).mockResolvedValueOnce({ commit: { shortHash: "s", subject: "subject", refs: ["main"], files: [] }, body: "body", diff: "diff", truncated: true });
    await app.selectGitCommit("h1");
    expect(app.querySelector("[data-git-detail]").textContent).toContain("diff truncated");
    app.closeGitDetail();
    expect(app.querySelector("[data-git-detail]")).toBeNull();

    vi.mocked(api.getGitCommit).mockRejectedValueOnce(new Error("commit failed"));
    await app.selectGitCommit("h2");
    expect(app.querySelector("[data-git-detail]").textContent).toContain("commit failed");
    vi.mocked(api.getGitHistory).mockRejectedValueOnce(new Error("history failed"));
    await app.showGitHistory();
    expect(app.querySelector("[data-git-panel]").textContent).toContain("history failed");
    vi.mocked(api.getGitHistory).mockRejectedValueOnce(new Error("more failed"));
    app.gitHistoryHasMore = true;
    await app.loadMoreGitHistory();
    expect(app.querySelector("[data-git-panel]").textContent).toContain("more failed");
  });

  it("covers oauth provider/session/input success and failure branches", async () => {
    const app = owner(`<select data-oauth-provider><option value="old">old</option></select><a data-oauth-link hidden></a><input data-oauth-input hidden><button data-action="start-oauth-login"></button><button data-action="send-oauth-input" hidden></button><span data-oauth-status></span>`);
    app.oauthState = { providers: [{ id: "old", name: "Old", configured: true }, { id: "new", name: "New" }] };
    app.fillOAuthForm();
    expect(app.querySelector("[data-oauth-provider]").value).toBe("old");

    vi.mocked(api.startOAuthLogin).mockResolvedValueOnce({ session: { id: "o1", status: "waiting", authUrl: "https://auth", prompt: { message: "Code", placeholder: "Paste" } } });
    await app.startOAuthLogin();
    expect(app.oauthSessionId).toBe("o1");
    expect(app.querySelector("[data-oauth-link]").hidden).toBe(false);

    app.applyOAuthSession({ id: "o1", status: "success" });
    expect(app.oauthSessionId).toBe("");

    app.applyOAuthSession({ status: "error", error: "denied" });
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("denied");
    expect(app.querySelector("[data-oauth-status]").classList.contains("err")).toBe(true);
    app.applyOAuthSession({ status: "pending", instructions: "follow", progress: ["p1"] });
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("follow");

    app.oauthSessionId = "o2";
    app.querySelector("[data-oauth-input]").value = "123";
    vi.mocked(api.sendOAuthLoginInput).mockResolvedValueOnce({ session: { status: "pending", prompt: { message: "again" } } });
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-input]").value).toBe("");
    vi.mocked(api.sendOAuthLoginInput).mockRejectedValueOnce(new Error("input failed"));
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("input failed");

    vi.mocked(api.startOAuthLogin).mockRejectedValueOnce(new Error("start failed"));
    await app.startOAuthLogin();
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });
});
