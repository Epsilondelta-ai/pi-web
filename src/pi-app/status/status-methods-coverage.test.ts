import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutMethods } from "./layout-methods";
import { runtimeStatusMethods } from "./runtime-status-methods";
import { notificationMethods } from "./notification-methods";
import { versionMethods } from "./version-methods";
import * as api from "../../shared/api/api";

vi.mock("../../shared/api/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api/api")>("../../shared/api/api");
  return {
    ...actual,
    getPiPackageUpdateStatus: vi.fn(),
    getPiUpdateStatus: vi.fn(),
    getPiVersionStatus: vi.fn(),
    getVersionStatus: vi.fn(),
    startPiUpdate: vi.fn(),
    getWorkspaceRuntimeStatus: vi.fn(),
    sessionEvents: vi.fn(),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  localStorage.clear();
});

function host(html = "") {
  const el = document.createElement("div");
  el.innerHTML = html;
  Object.assign(el, layoutMethods, versionMethods, runtimeStatusMethods, notificationMethods);
  el.dataset.activeWorkspaceId = "w1";
  el.dataset.activeSessionId = "s1";
  el.apiConnected = true;
  document.body.append(el);
  return el;
}

describe("status method branch coverage", () => {
  it("covers layout storage, shortcut, grid, resize, tool, and scroll branches", () => {
    const el = host(`
      <section data-view="picker"><div class="picker-shell"><input name="path"></div></section>
      <section data-view="workspace" class="app-body"><div class="term"></div></section>
      <div class="tree" data-plugin-sidebar><div data-plugin-panel="file-browser"></div><div data-plugin-panel="git-viewer"></div><div data-plugin-sidebar-empty></div></div>
    `);
    el.trapSettingsFocus = vi.fn();
    el.closeModals = vi.fn();
    el.browseFolder = vi.fn();
    el.shortcut({ key: "Tab" });
    el.shortcut({ key: "Escape" });
    expect(el.trapSettingsFocus).toHaveBeenCalled();
    expect(el.closeModals).toHaveBeenCalled();
    el.route("picker");
    expect(el.querySelector('[data-view="picker"]').hidden).toBe(false);
    expect(el.browseFolder).toHaveBeenCalled();
    el.route("workspace");
    expect(el.querySelector('[data-view="workspace"]').hidden).toBe(false);

    el.restoreSidebar();
    el.applyGrid();
    expect(el.querySelector(".app-body").style.gridTemplateColumns).toBe("1fr");
    el.togglePluginSidebar("file-browser");
    el.togglePluginSidebar("git-viewer");
    expect(el.querySelector('[data-plugin-panel="git-viewer"]').hidden).toBe(false);
    delete el.querySelector("[data-plugin-sidebar]").dataset.activePluginPanel;
    el.syncPluginSidebarPanels();
    el.togglePluginSidebar();
    el.togglePluginSidebar("file-browser");
    el.dataset.tree = "off";
    el.closeTreeFromOutside({ target: document.createElement("span") });
    const treeForNoTreeBranch = el.querySelector("[data-plugin-sidebar]");
    treeForNoTreeBranch.remove();
    el.syncPluginSidebarPanels();
    el.append(treeForNoTreeBranch);
    el.dataset.tree = "on";
    el.closeTreeFromOutside({ target: el.querySelector(".tree") });
    el.dataset.tree = "on";
    const insideTree = document.createElement("span");
    insideTree.closest = (selector) => selector === ".tree, [data-file-editor-modal]" ? insideTree : null;
    el.closeTreeFromOutside({ target: insideTree, composedPath: () => [] });
    el.closeTreeFromOutside({ target: document.createElement("span"), composedPath: () => [{ matches: () => true }] });
    el.closeTreeFromOutside({ target: null, composedPath: () => [] });
    el.closeTreeFromOutside({ target: { closest: () => null }, composedPath: () => [] });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    el.restoreSidebar();
    vi.restoreAllMocks();

    el.notifyTranscriptNodeHeightDidChange = vi.fn();
    const card = document.createElement("div");
    card.className = "tool-card";
    card.innerHTML = `<button><span class="tc-caret"></span></button><pre class="tc-body"></pre>`;
    el.append(card);
    el.toggleTool(card.querySelector("button"));
    el.showFullToolOutput(undefined);
    const body = card.querySelector(".tc-body");
    body.__fullToolBody = "full";
    const button = document.createElement("button");
    body.append(button);
    el.showFullToolOutput(button);
    expect(body.textContent).toBe("full");

    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
    const term = el.querySelector(".term");
    term.remove();
    el.scrollTerm();
    el.scrollTerm();
    frames.splice(0).forEach((cb) => cb());
    frames.splice(0).forEach((cb) => cb());
    el.append(term);
  });

  it("covers version and runtime fallback branches", async () => {
    const el = host(`<button data-action="show-update-tip" hidden></button><span data-update-tip hidden></span>`);
    el.notifyUpdateAvailable = vi.fn();
    el.notifyPiUpdateAvailable = vi.fn();
    el.notifyPiPackageUpdateAvailable = vi.fn();
    vi.mocked(api.getVersionStatus).mockResolvedValueOnce({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    vi.mocked(api.getPiVersionStatus).mockResolvedValueOnce({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    vi.mocked(api.getPiPackageUpdateStatus).mockResolvedValueOnce({ updates: [{ source: "npm:pkg" }] });
    vi.mocked(api.getPiUpdateStatus).mockResolvedValueOnce({ state: "idle" });
    await el.loadVersionStatus();
    expect(el.notifyUpdateAvailable).toHaveBeenCalled();
    expect(el.notifyPiUpdateAvailable).toHaveBeenCalled();
    expect(el.notifyPiPackageUpdateAvailable).toHaveBeenCalledWith([{ source: "npm:pkg" }]);
    vi.mocked(api.getVersionStatus).mockRejectedValueOnce(new Error("web"));
    vi.mocked(api.getPiVersionStatus).mockRejectedValueOnce(new Error("pi"));
    vi.mocked(api.getPiPackageUpdateStatus).mockRejectedValueOnce(new Error("packages"));
    vi.mocked(api.getPiUpdateStatus).mockRejectedValueOnce(new Error("update"));
    await el.loadVersionStatus();
    el.renderVersionStatus(undefined);
    el.querySelector("[data-action='show-update-tip']").remove();
    el.renderVersionStatus({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    el.renderPiVersionStatus(undefined);
    el.renderPiVersionStatus({ updateAvailable: true, currentVersion: "2", latestVersion: "2" });
    el.renderPiPackageUpdateStatus(undefined);
    el.renderPiPackageUpdateStatus({ updates: [] });
    el.notifyWorkspacePackageUpdateAvailable = vi.fn();
    el.renderPiPackageUpdateStatus({ scope: "workspace", workspaceId: "ws-1", updates: [{ source: "npm:pkg" }] });
    expect(el.notifyWorkspacePackageUpdateAvailable).toHaveBeenCalledWith([{ source: "npm:pkg" }], "ws-1");
    vi.mocked(api.getPiPackageUpdateStatus).mockResolvedValueOnce({ scope: "workspace", workspaceId: "ws-1", updates: [{ source: "npm:ws-pkg" }] });
    await el.loadWorkspacePackageStatus("ws-1");
    expect(el.notifyWorkspacePackageUpdateAvailable).toHaveBeenCalledWith([{ source: "npm:ws-pkg" }], "ws-1");
    el.notifyPiUpdateRunning = vi.fn();
    el.notifyPiUpdateComplete = vi.fn();
    el.notifyPiUpdateFailed = vi.fn();
    let poll;
    vi.spyOn(window, "setInterval").mockImplementation(((cb: TimerHandler) => { poll = cb; return 7; }) as typeof window.setInterval);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);
    el.renderPiUpdateStatus({ state: "updating" });
    el.renderPiUpdateStatus({ state: "updated" });
    el.renderPiUpdateStatus({ state: "failed", error: "bad" });
    expect(el.notifyPiUpdateRunning).toHaveBeenCalled();
    expect(el.notifyPiUpdateComplete).toHaveBeenCalled();
    expect(el.notifyPiUpdateFailed).toHaveBeenCalledWith("bad");
    vi.mocked(api.getPiUpdateStatus).mockResolvedValueOnce({ state: "updating" });
    await poll();
    vi.mocked(api.getPiUpdateStatus).mockResolvedValueOnce({ state: "updated" });
    await poll();
    vi.mocked(api.getPiUpdateStatus).mockRejectedValueOnce(new Error("poll"));
    el.startPiUpdatePolling();
    await poll();
    vi.mocked(api.startPiUpdate).mockResolvedValueOnce({ state: "updating" });
    await el.startPiUpdateFlow();
    vi.mocked(api.startPiUpdate).mockRejectedValueOnce(new Error("start"));
    await el.startPiUpdateFlow();
    vi.mocked(api.startPiUpdate).mockRejectedValueOnce("string start");
    await el.startPiUpdateFlow();
    el.notifyPiUpdateFailed = undefined;
    vi.mocked(api.startPiUpdate).mockRejectedValueOnce("string start");
    await el.startPiUpdateFlow();
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    expect(el.isPiUpdateIgnored("1", "2")).toBe(false);
    el.rememberIgnoredPiUpdate("1", "2");
    expect(el.isPiPackageUpdateIgnored("pkg-key")).toBe(false);
    el.rememberIgnoredPiPackageUpdate("pkg-key");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
    localStorage.setItem("piweb:ignored-pi-package-update", "legacy-key");
    expect(el.isPiPackageUpdateIgnored("legacy-key")).toBe(true);
    localStorage.setItem("piweb:ignored-pi-package-update", "");
    expect(el.isPiPackageUpdateIgnored("legacy-key")).toBe(false);
    localStorage.setItem("piweb:ignored-pi-package-update", JSON.stringify(["array-key"]));
    expect(el.isPiPackageUpdateIgnored("array-key")).toBe(true);
    localStorage.setItem("piweb:ignored-pi-package-update", JSON.stringify({ key: "object" }));
    expect(el.isPiPackageUpdateIgnored("object")).toBe(false);
    vi.spyOn(window, "setTimeout").mockImplementation(((cb: TimerHandler) => {
      if (typeof cb === "function") cb();
      return 1;
    }) as typeof window.setTimeout);
    el.showUpdateTip();
    el.querySelector("[data-update-tip]").remove();
    el.showUpdateTip();

    el.updatePromptMeta = vi.fn();
    el.notifyRuntimeWarning = vi.fn();
    vi.mocked(api.getWorkspaceRuntimeStatus).mockResolvedValueOnce({ status: { model: "m", warning: "warn" } });
    await el.loadRuntimeStatus("w1");
    expect(el.notifyRuntimeWarning).toHaveBeenCalledWith("warn");
    vi.mocked(api.getWorkspaceRuntimeStatus).mockResolvedValueOnce({ status: { model: "fallback" } });
    await el.loadRuntimeStatus("w1");
    expect(el.updatePromptMeta).toHaveBeenCalledWith({ model: "fallback" });
    vi.mocked(api.getWorkspaceRuntimeStatus).mockRejectedValueOnce(new Error("status"));
    await el.loadRuntimeStatus("w1");
    el.apiConnected = false;
    await el.loadRuntimeStatus("w1");
    el.applyRuntimeStatus(undefined);
  });

  it("covers notification helper and watch branches", () => {
    const el = host(`<span data-active-workspace>w</span><span data-active-session-title>s</span>`);
    el.setConnection = vi.fn();
    el.pickSession = vi.fn();
    el.markSessionRunning = vi.fn();
    el.updateSessionMeta = vi.fn();
    el.syncActiveWorkspaceRows = vi.fn();
    el.notifyUpdateAvailable({});
    el.notifyPiUpdateAvailable({ note: "note" });
    const term = document.createElement("div");
    term.className = "term";
    el.append(term);
    term.remove();
    el.scrollTerm();
    el.notifyRuntimeWarning("authentication failed");
    for (const message of [
      "No API key found for provider openai.",
      "invalid_grant for provider anthropic",
      "token expired for provider github-copilot",
      "unauthorized for provider openai-codex",
      "authentication failed for provider unknown",
      "no models available for provider custom",
      "models.json error for provider custom",
      "oauth failed",
      "plain auth issue",
      "",
    ]) el.notifyRuntimeWarning(message);
    el.notifyResponseFailure("event stream closed");
    el.notifyResponseFailure("oauth token expired");
    el.notifyResponseFailure("plain failure", { sessionId: "other", workspace: "w", session: "s" });
    el.notifyResponseFailure("again");
    el.notifyResponseFailure("again");
    el.notifyResponseCompletedOnce({ sessionId: "other" });
    el.notifyResponseCompletedOnce({ sessionId: "other" });
    el.notifyChoiceRequested("workspace-only");
    expect(el.currentNotificationContext().workspaceName).toBe("w");

    expect(el.readLastSessionPrompts()).toEqual({});
    localStorage.setItem("piweb:last-session-prompts", "[]");
    expect(el.readLastSessionPrompts()).toEqual({});
    el.writeLastSessionPrompt("s2", " prompt ");
    expect(el.readLastSessionPrompt("s2")).toBe("prompt");
    localStorage.setItem("piweb:unread-completed-sessions", "{}");
    expect(el.readUnreadCompletedSessions().size).toBe(0);
    el.writeUnreadCompletedSessions(new Set(["ghost"]));
    el.syncUnreadCompletedSessions();
    expect(localStorage.getItem("piweb:unread-completed-sessions")).toBe("[]");

    const row = document.createElement("div");
    row.className = "session-row active";
    row.dataset.session = "s2";
    row.dataset.workspace = "w2";
    row.dataset.title = "row";
    el.append(row);
    const group = document.createElement("div");
    group.dataset.workspaceGroup = "w2";
    group.innerHTML = `<span class="label">workspace</span>`;
    el.append(group);
    expect(el.backgroundWatchRows().has("s2")).toBe(true);
    vi.mocked(api.sessionEvents).mockReturnValueOnce({ close: vi.fn() } as unknown as EventSource);
    const watch = el.watchBackgroundSession(row);
    expect(watch.wasRunning).toBe(true);
    el.backgroundSessionWatches = new Map([["s2", watch], ["gone", { source: { close: vi.fn() } as unknown as EventSource }]]);
    el.apiConnected = false;
    el.syncBackgroundSessionWatches();
    expect(el.backgroundSessionWatches.size).toBe(0);
    el.apiConnected = true;
    vi.stubGlobal("EventSource", class {});
    vi.mocked(api.sessionEvents).mockReturnValue({ close: vi.fn() } as unknown as EventSource);
    el.syncBackgroundSessionWatches();
    el.handleBackgroundSessionEvent(undefined, watch);
    el.handleBackgroundSessionEvent({ type: "heartbeat" }, watch);
    el.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "running" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.message", payload: { text: "```json\n{\"type\":\"piweb_choice\",\"id\":\"c\",\"question\":\"q\",\"options\":[{\"label\":\"A\",\"value\":\"a\"}]}\n```" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.message", payload: { text: "plain" } }, watch);
    el.handleBackgroundSessionEvent({ type: "error", payload: { error: "boom" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "idle" } }, watch);
    el.dismissBackgroundSessionWatch("s2", watch);
    el.clearUnreadCompletedSession("");
    const staleWatch = { source: { close: vi.fn() }, row };
    el.backgroundSessionWatches = new Map([["s2", watch], ["stale", staleWatch]]);
    el.apiConnected = true;
    vi.stubGlobal("EventSource", class {});
    vi.mocked(api.sessionEvents).mockReturnValue({ close: vi.fn() } as unknown as EventSource);
    el.syncBackgroundSessionWatches();
    expect(staleWatch.source.close).toHaveBeenCalled();

    let watchOptions;
    vi.mocked(api.sessionEvents).mockImplementationOnce((_sessionId, options) => {
      watchOptions = options;
      return { close: vi.fn() } as unknown as EventSource;
    });
    el.watchBackgroundSession(row);
    expect(watchOptions.replay).toBe(false);
    expect(watchOptions.onError()).toBeUndefined();
  });
});
