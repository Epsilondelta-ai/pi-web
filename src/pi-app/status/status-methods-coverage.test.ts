// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutMethods } from "./layout-methods";
import { runtimeStatusMethods } from "./runtime-status-methods";
import { toastMethods } from "./toast-methods";
import { versionMethods } from "./version-methods";
import * as api from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getPiVersionStatus: vi.fn(),
    getVersionStatus: vi.fn(),
    getWorkspaceRuntimeModel: vi.fn(),
    getWorkspaceRuntimeQuota: vi.fn(),
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
  Object.assign(el, layoutMethods, versionMethods, runtimeStatusMethods, toastMethods);
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
      <button data-action="toggle-tree"></button><button data-action="open-drawer"></button>
      <div class="tree"></div><div class="sidebar-wrap"></div><button class="sb-expand-btn"></button>
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

    vi.spyOn(Storage.prototype, "getItem").mockReturnValueOnce(null).mockImplementationOnce(() => { throw new Error("blocked"); });
    el.restoreSidebar();
    el.restoreSidebar();
    vi.restoreAllMocks();
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    el.restoreSidebar();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
    localStorage.setItem("pi.sb.width", "bad");
    el.restoreSidebar();
    localStorage.setItem("pi.sb.width", "120");
    el.restoreSidebar();
    expect(el.dataset.sidebarWidth).toBe("200");
    el.dataset.sidebar = "open";
    el.applyGrid();
    expect(el.querySelector(".app-body").style.gridTemplateColumns).toContain("200px");
    el.toggleTree();
    el.toggleTree();
    el.toggleDrawer();
    el.toggleDrawer();
    el.dataset.tree = "off";
    el.closeTreeFromOutside({ target: document.createElement("span") });
    el.dataset.tree = "on";
    el.closeTreeFromOutside({ target: el.querySelector("[data-action='toggle-tree']") });
    const insideTree = document.createElement("span");
    insideTree.closest = (selector) => selector === ".tree, [data-action='toggle-tree']" ? insideTree : null;
    el.closeTreeFromOutside({ target: insideTree, composedPath: () => [] });
    el.closeTreeFromOutside({ target: document.createElement("span"), composedPath: () => [{ matches: () => true }] });
    const appBody = el.querySelector(".app-body");
    appBody.remove();
    el.toggleDrawer();
    el.append(appBody);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    el.dataset.sidebar = "collapsed";
    el.restoreSidebar();
    el.collapseSidebar(true);
    delete el.dataset.sidebarWidth;
    el.startResize({ preventDefault: vi.fn(), clientX: 10 });
    delete el.dataset.sidebarWidth;
    window.dispatchEvent(new PointerEvent("pointerup"));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 500 }));
    window.dispatchEvent(new PointerEvent("pointerup"));
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
    vi.mocked(api.getVersionStatus).mockResolvedValueOnce({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    vi.mocked(api.getPiVersionStatus).mockResolvedValueOnce({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    await el.loadVersionStatus();
    expect(el.notifyUpdateAvailable).toHaveBeenCalled();
    expect(el.notifyPiUpdateAvailable).toHaveBeenCalled();
    vi.mocked(api.getVersionStatus).mockRejectedValueOnce(new Error("web"));
    vi.mocked(api.getPiVersionStatus).mockRejectedValueOnce(new Error("pi"));
    await el.loadVersionStatus();
    el.renderVersionStatus(undefined);
    el.querySelector("[data-action='show-update-tip']").remove();
    el.renderVersionStatus({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    el.renderPiVersionStatus(undefined);
    el.renderPiVersionStatus({ updateAvailable: true, currentVersion: "2", latestVersion: "2" });
    vi.spyOn(window, "setTimeout").mockImplementation((cb) => { cb(); return 1; });
    el.showUpdateTip();
    el.querySelector("[data-update-tip]").remove();
    el.showUpdateTip();

    el.updatePromptMeta = vi.fn();
    el.notifyRuntimeWarning = vi.fn();
    vi.mocked(api.getWorkspaceRuntimeModel).mockResolvedValueOnce({ status: { model: "m", warning: "warn" } });
    vi.mocked(api.getWorkspaceRuntimeQuota).mockResolvedValueOnce({ status: { quota: 1 } });
    await el.loadRuntimeStatus("w1");
    await Promise.resolve();
    expect(el.notifyRuntimeWarning).toHaveBeenCalledWith("warn");
    vi.mocked(api.getWorkspaceRuntimeModel).mockRejectedValueOnce(new Error("model"));
    vi.mocked(api.getWorkspaceRuntimeStatus).mockResolvedValueOnce({ status: { model: "fallback" } });
    await el.loadRuntimeStatus("w1");
    expect(el.updatePromptMeta).toHaveBeenCalledWith({ model: "fallback" });
    vi.mocked(api.getWorkspaceRuntimeModel).mockRejectedValueOnce(new Error("model"));
    vi.mocked(api.getWorkspaceRuntimeStatus).mockRejectedValueOnce(new Error("status"));
    await el.loadRuntimeStatus("w1");
    vi.mocked(api.getWorkspaceRuntimeQuota).mockRejectedValueOnce(new Error("quota"));
    await el.loadRuntimeQuota("w1", "m");
    el.apiConnected = false;
    await el.loadRuntimeStatus("w1");
    await el.loadRuntimeQuota("w1", "m");
    el.applyRuntimeStatus(undefined);
  });

  it("covers toast helper and watch branches", () => {
    const el = host(`<span data-active-workspace>w</span><span data-active-session-title>s</span>`);
    el.setConnection = vi.fn();
    el.pickSession = vi.fn();
    el.markSessionRunning = vi.fn();
    el.updateSessionMeta = vi.fn();
    el.syncActiveWorkspaceRows = vi.fn();
    el.handleToastClick();
    expect(el.showSystemToast("warning", "T", "D", "k")).toBeTruthy();
    expect(el.showSystemToast("warning", "T", "D", "k")).toBeUndefined();
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
    const savedNotyf = el.notyf;
    el.notyf = undefined;
    document.querySelector(".notyf")?.remove();
    el.syncToastDismissAll();
    el.notyf = savedNotyf;
    el.dismissAllToasts();

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
    vi.mocked(api.sessionEvents).mockReturnValueOnce({ close: vi.fn() });
    const watch = el.watchBackgroundSession(row);
    expect(watch.wasRunning).toBe(true);
    el.backgroundSessionWatches = new Map([["s2", watch], ["gone", { source: { close: vi.fn() } }]]);
    el.apiConnected = false;
    el.syncBackgroundSessionWatches();
    expect(el.backgroundSessionWatches.size).toBe(0);
    el.apiConnected = true;
    vi.stubGlobal("EventSource", class {});
    vi.mocked(api.sessionEvents).mockReturnValue({ close: vi.fn() });
    el.syncBackgroundSessionWatches();
    el.handleBackgroundSessionEvent(undefined, watch);
    el.handleBackgroundSessionEvent({ type: "heartbeat" }, watch);
    el.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "running" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.message", payload: { text: "```json\n{\"type\":\"piweb_choice\",\"id\":\"c\",\"question\":\"q\",\"options\":[{\"label\":\"A\",\"value\":\"a\"}]}\n```" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.message", payload: { text: "plain" } }, watch);
    el.handleBackgroundSessionEvent({ type: "error", payload: { error: "boom" } }, watch);
    el.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "idle" } }, watch);
    el.dismissBackgroundSessionWatch("s2", watch);
    el.activateToastSession("");
    el.activateToastSession("s1");
    el.activateToastSession("s2");
    el.clearUnreadCompletedSession("");
    const staleWatch = { source: { close: vi.fn() }, row };
    el.backgroundSessionWatches = new Map([["s2", watch], ["stale", staleWatch]]);
    el.apiConnected = true;
    vi.stubGlobal("EventSource", class {});
    vi.mocked(api.sessionEvents).mockReturnValue({ close: vi.fn() });
    el.syncBackgroundSessionWatches();
    expect(staleWatch.source.close).toHaveBeenCalled();

    let watchOptions;
    vi.mocked(api.sessionEvents).mockImplementationOnce((_sessionId, options) => {
      watchOptions = options;
      return { close: vi.fn() };
    });
    el.watchBackgroundSession(row);
    expect(watchOptions.replay).toBe(false);
    expect(watchOptions.onError()).toBeUndefined();
  });
});
