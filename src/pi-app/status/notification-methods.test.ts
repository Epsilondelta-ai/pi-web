// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";
import { authProviderLabel, detailMessage, notificationContextSession, notificationContextWorkspace } from "./notification-methods";

function setActiveContext(app) {
  app.dataset.activeWorkspaceId = "w1";
  app.dataset.activeSessionId = "s1";
  const workspace = document.createElement("span");
  const session = document.createElement("span");
  workspace.dataset.activeWorkspace = "";
  session.dataset.activeSessionTitle = "";
  workspace.textContent = "demo";
  session.textContent = "chat";
  app.append(workspace, session);
}

describe("pi-app notification-free session helpers", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("does not render built-in notification popups for completion, choice, error, update, or auth warnings", async () => {
    const app = await connectPiApp();
    setActiveContext(app);

    app.notifyResponseFailure = vi.fn(app.notifyResponseFailure.bind(app));
    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "error", payload: { error: "boom" } });
    app.applyEvent({ type: "session.delta", payload: { kind: "pi", delta: "done" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });
    app.notifyChoiceRequested({ sessionId: "s1" });
    app.notifyResponseFailure("plain failure");
    app.notifyUpdateAvailable({ currentVersion: "1.0.0", latestVersion: "1.1.0" });
    app.notifyRuntimeWarning("Authentication failed for github-copilot");

    expect(app.notifyResponseFailure).toHaveBeenCalledWith("boom");
    expect(document.querySelector(".pi-web-notification-popup")).toBeNull();
  });

  it("keeps context and storage helpers without a notification renderer", async () => {
    const app = await connectPiApp();
    const row = document.createElement("button");
    row.dataset.workspaceName = "workspace";
    row.dataset.title = "session";
    row.dataset.session = "s2";
    row.dataset.workspace = "w2";
    app.writeLastSessionPrompt("s2", "last prompt");

    expect(detailMessage("plain")).toBe("plain");
    expect(detailMessage("null")).toBe("");
    expect(detailMessage("undefined")).toBe("");
    expect(detailMessage({ message: "boom" })).toBe("boom");
    expect(detailMessage({ message: "" })).toBe("");
    expect(detailMessage({})).toBe("[object Object]");
    expect(detailMessage(0)).toBe("0");
    expect(detailMessage(null)).toBe("");
    expect(detailMessage(undefined)).toBe("");
    expect(authProviderLabel("anthropic")).toBe("Anthropic");
    expect(authProviderLabel("github-copilot")).toBe("GitHub Copilot");
    expect(authProviderLabel("openai-codex")).toBe("OpenAI Codex");
    expect(authProviderLabel("openai")).toBe("OpenAI");
    expect(authProviderLabel("custom")).toBe("custom");
    expect(authProviderLabel("")).toBe("알 수 없음");
    expect(notificationContextWorkspace(null)).toBe("워크스페이스 없음");
    expect(notificationContextWorkspace("plain workspace")).toBe("plain workspace");
    expect(notificationContextWorkspace({ workspace: "Workspace field" })).toBe("Workspace field");
    expect(notificationContextWorkspace({ label: "Label workspace" })).toBe("Label workspace");
    expect(notificationContextWorkspace({})).toBe("워크스페이스 없음");
    expect(notificationContextSession("plain session")).toBe("세션 없음");
    expect(notificationContextSession({ session: "Session field" })).toBe("Session field");
    expect(notificationContextSession({ sessionId: "sid" })).toBe("sid");
    expect(notificationContextSession({})).toBe("세션 없음");
    expect(app.notificationContextForSessionRow(row).prompt).toBe("last prompt");
    expect(app.notificationContextForSessionRow(null).workspaceName).toBe("알 수 없음");
    expect(app.currentNotificationContext().sessionId).toBeUndefined();
    app.clearUnreadCompletedSession = vi.fn();
    app.notifyUpdateAvailable();
    app.notifyPiUpdateAvailable();
    app.notifyPiPackageUpdateAvailable();
    app.notifyWorkspacePackageUpdateAvailable();
    app.notifyPiUpdateRunning();
    app.notifyPiUpdateComplete();
    app.notifyPiUpdateFailed();
    app.notifyRuntimeWarning();
    app.notifyChoiceRequested();
    app.notifySessionCompleted("string context");
    app.currentNotificationContext = vi.fn(() => ({ sessionId: "s4" }));
    app.notifySessionCompleted();
    app.notifySessionCompleted({ sessionId: "s2" });
    app.notifyResponseCompletedOnce({ sessionId: "s2" });
    app.notifyResponseCompletedOnce({ sessionId: "s2" });
    expect(app.clearUnreadCompletedSession).toHaveBeenCalledWith("s4");
    expect(app.clearUnreadCompletedSession).toHaveBeenCalledWith("s2");
    expect(app.readLastSessionPrompt("")).toBe("");
    app.writeLastSessionPrompt("", "ignored");
    app.writeLastSessionPrompt("s3", "");
    expect(app.readLastSessionPrompt("s3")).toBe("");
  });

  it("tracks unread completed sessions", async () => {
    const app = await connectPiApp();
    app.dataset.activeSessionId = "active";
    app.innerHTML = `
      <button class="session-row" data-session="visible"></button>
    `;
    app.writeUnreadCompletedSessions(new Set(["old", "visible"]));
    app.markUnreadCompletedSession("");
    app.markUnreadCompletedSession("active");
    app.markUnreadCompletedSession("visible");
    app.syncUnreadCompletedSessions();

    expect(app.querySelector("[data-session='visible']").classList.contains("unread-completed")).toBe(true);
    expect(app.readUnreadCompletedSessions().has("old")).toBe(false);

    app.clearUnreadCompletedSession("");
    app.clearUnreadCompletedSession("missing");
    app.clearUnreadCompletedSession("visible");
    expect(app.querySelector("[data-session='visible']").classList.contains("unread-completed")).toBe(false);
  });

  it("handles invalid notification storage", async () => {
    const app = await connectPiApp();
    localStorage.setItem("piweb:last-session-prompts", "[]");
    localStorage.setItem("piweb:unread-completed-sessions", "{}");
    expect(app.readLastSessionPrompts()).toEqual({});
    expect([...app.readUnreadCompletedSessions()]).toEqual([]);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(app.readLastSessionPrompts()).toEqual({});
    expect([...app.readUnreadCompletedSessions()]).toEqual([]);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    app.writeLastSessionPrompt("s", "prompt");
    app.writeUnreadCompletedSessions(new Set(["s"]));
  });

  it("watches and dismisses background sessions", async () => {
    const app = await connectPiApp();
    const close = vi.fn();
    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.close = close;
        this.listeners = new Map();
        this.addEventListener = vi.fn((type, listener) => this.listeners.set(type, listener));
      }
    }
    vi.stubGlobal("EventSource", MockEventSource);
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.innerHTML = `
      <div data-workspace-group="w1"><span class="label">Workspace</span></div>
      <button class="session-row active" data-session="s1" data-workspace="w1"></button>
      <button class="session-row active" data-session="s2" data-workspace="w1" data-title="Background"></button>
    `;

    app.syncBackgroundSessionWatches();
    expect(app.backgroundSessionWatches.has("s2")).toBe(true);
    const watch = app.backgroundSessionWatches.get("s2");
    watch.source.listeners.get("session.status")({ data: JSON.stringify({ type: "session.status", sessionId: "s2", payload: { status: "thinking" } }) });
    app.handleBackgroundSessionEvent(null, watch);
    app.handleBackgroundSessionEvent({ type: "heartbeat" }, watch);
    app.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "thinking" } }, watch);
    app.handleBackgroundSessionEvent({ type: "tool.started", sessionId: "s2", payload: {} }, watch);
    app.notifySessionCompleted = vi.fn();
    app.readCompletedBackgroundSessionAloud = vi.fn();
    app.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "idle" } }, watch);

    expect(app.notifySessionCompleted).toHaveBeenCalledWith(expect.objectContaining({ sessionName: "Background" }));
    expect(app.readCompletedBackgroundSessionAloud).toHaveBeenCalledWith("s2");
    expect(close).toHaveBeenCalled();
  });

  it("handles background errors, choices, cancellation, and watch cleanup", async () => {
    const app = await connectPiApp();
    const close = vi.fn();
    const row = document.createElement("button");
    row.dataset.session = "s2";
    row.dataset.workspace = "w2";
    row.dataset.title = "Background";
    const watch = { row, source: { close }, failed: false, wasRunning: true, fallbackChoiceNotified: false };
    app.backgroundSessionWatches = new Map([["s2", watch]]);
    app.notifyResponseFailure = vi.fn();
    app.notifyChoiceRequested = vi.fn();
    app.notifySessionCompleted = vi.fn();

    app.handleBackgroundSessionEvent({ type: "error", sessionId: "s2", payload: { error: "boom" } }, watch);
    app.handleBackgroundSessionEvent({ type: "session.message", sessionId: "s2", payload: { text: '```json\n{"type":"piweb_choice","id":"x","question":"q","options":[{"label":"A","value":"a"}]}\n```' } }, watch);
    app.handleBackgroundSessionEvent({ type: "session.status", sessionId: "s2", payload: { status: "cancelled" } }, watch);
    expect(app.notifyResponseFailure).toHaveBeenCalledWith("boom", expect.any(Object));
    expect(app.notifyChoiceRequested).toHaveBeenCalled();
    expect(app.notifySessionCompleted).not.toHaveBeenCalled();

    app.apiConnected = false;
    app.backgroundSessionWatches = new Map([["s2", { row, source: { close } }]]);
    app.syncBackgroundSessionWatches();
    expect(app.backgroundSessionWatches.size).toBe(0);
  });

  it("reads completed background sessions aloud when enabled", async () => {
    const app = await connectPiApp();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ kind: "user", text: "q" }, { kind: "pi", text: "answer" }] }),
    }));
    app.dataset.activeSessionId = "active";
    app.isReadAloudEnabled = () => true;
    app.speakAssistantText = vi.fn();
    await app.readCompletedBackgroundSessionAloud("s2");
    expect(app.speakAssistantText).toHaveBeenCalledWith("answer");

    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));
    await app.readCompletedBackgroundSessionAloud("s5");

    app.speakAssistantText = vi.fn();
    await app.readCompletedBackgroundSessionAloud("");
    await app.readCompletedBackgroundSessionAloud("active");
    expect(app.speakAssistantText).not.toHaveBeenCalled();

    app.readAloudGeneration = 1;
    app.canReadCompletedBackgroundSessionAloud = () => true;
    globalThis.fetch = vi.fn(async () => {
      app.readAloudGeneration = 2;
      return { ok: true, json: async () => ({ messages: [{ kind: "pi", text: "late" }] }) };
    });
    await app.readCompletedBackgroundSessionAloud("s3");
    expect(app.speakAssistantText).not.toHaveBeenCalled();

    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    });
    await app.readCompletedBackgroundSessionAloud("s4");
  });

  it("keeps backend connection handling without showing a popup", async () => {
    const app = await connectPiApp();
    app.setConnection = (state) => {
      app.dataset.connection = state;
    };

    app.notifyResponseFailure("plain failure");
    expect(app.dataset.connection).toBeUndefined();
    for (const detail of [
      "TypeError: Failed to fetch",
      "fetch failed",
      "load failed",
      "network error",
      "err_connection",
      "connection refused",
      "connection reset",
      "connection closed",
      "connection aborted",
      "backend disconnected",
      "event stream",
      "body stream",
      "terminated",
    ]) {
      app.responseFailureToastShown = false;
      app.notifyResponseFailure(detail);
    }

    expect(app.dataset.connection).toBe("err");
    expect(document.querySelector(".pi-web-notification-popup")).toBeNull();
  });
});
