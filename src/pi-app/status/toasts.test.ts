// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";
import { authProviderLabel, detailMessage, toastContextSession, toastContextWorkspace } from "./toast-methods";

const fallbackChoiceJson = [
  "```json",
  JSON.stringify({
    type: "piweb_choice",
    id: "runtime",
    question: "Runtime?",
    options: [{ label: "Go", value: "go" }],
    allowCustom: false,
  }),
  "```",
].join("\n");

function setActiveToastContext(app) {
  app.dataset.activeWorkspaceId = "w1";
  app.dataset.activeSessionId = "s1";
  const workspace = document.createElement("span");
  const session = document.createElement("span");
  workspace.dataset.activeWorkspace = "";
  session.dataset.activeSessionTitle = "";
  workspace.textContent = "demo";
  session.textContent = "chat";
  app.append(workspace, session);
  app.writeLastSessionPrompt?.("s1", "explain the failure and suggest a fix");
}

describe("pi-app toast notifications", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("shows and dismisses a green toast when a running response completes", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    const toast = document.querySelector(".session-toast.success");
    expect(toast.textContent).toContain("응답 완료");
    expect(toast.querySelector(".toast-workspace").textContent).toBe("demo");
    expect(toast.querySelector(".toast-session").textContent).toBe("chat");
    expect(toast.querySelector(".toast-prompt").textContent).toBe("explain the failure and suggest a fix");
  });

  it("shows a red failure toast and suppresses completion after a response error", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "error", payload: { error: "boom" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(document.querySelector(".session-toast.error").textContent).toContain("응답 실패");
    expect(document.querySelector(".session-toast.error").querySelector(".toast-prompt").textContent).toBe("explain the failure and suggest a fix");
    expect(document.querySelector(".session-toast.error").querySelector(".toast-workspace").textContent).toBe("demo");
    expect(document.querySelector(".session-toast.success")).toBeNull();
  });

  it("shows a backend connection toast instead of response failure for disconnects", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);
    app.setConnection = vi.fn();

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.notifyResponseFailure("TypeError: Failed to fetch");
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(document.querySelector(".session-toast.connection").textContent).toContain("백엔드 연결 끊김");
    expect(document.querySelector(".session-toast.error")).toBeNull();
    expect(document.querySelector(".session-toast.success")).toBeNull();
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });

  it("shows system warnings for update and auth credential failures once", async () => {
    const app = await connectPiApp();

    app.notifyUpdateAvailable({ currentVersion: "1.0.0", latestVersion: "1.1.0" });
    app.notifyUpdateAvailable({ currentVersion: "1.0.0", latestVersion: "1.1.0" });
    app.notifyPiUpdateAvailable({ currentVersion: "0.75.0", latestVersion: "0.75.5", note: "security fix" });
    app.notifyRuntimeWarning("Authentication failed for github-copilot. Credentials may have expired.");

    const warnings = [...document.querySelectorAll(".session-toast.warning")];
    expect(warnings).toHaveLength(3);
    expect(warnings[0].textContent).toContain("pi-web 업데이트 가능");
    expect(warnings[0].textContent).toContain("pi-web update");
    expect(warnings[1].textContent).toContain("Do you want to update pi?");
    expect(warnings[1].textContent).toContain("Yes");
    expect(warnings[1].textContent).toContain("No");
    expect(warnings[2].textContent).toContain("인증 경고: GitHub Copilot");
    expect(warnings[2].textContent).toContain("대상: GitHub Copilot (github-copilot)");
    expect(warnings[2].textContent).toContain("방식: OAuth");
    expect(warnings[2].textContent).toContain("문제: 토큰/인증 정보 만료 가능");
    expect(warnings[2].textContent).toContain(
      "원본: Authentication failed for github-copilot. Credentials may have expired.",
    );
    app.startPiUpdateFlow = vi.fn();
    warnings[1].querySelector("[data-pi-update-confirm='yes']").click();
    expect(app.startPiUpdateFlow).toHaveBeenCalled();
    app.notifyPiUpdateAvailable({ currentVersion: "0.75.0", latestVersion: "0.75.6" });
    const nextWarning = [...document.querySelectorAll(".session-toast.warning")]
      .filter((toast) => toast.textContent.includes("Do you want to update pi?"))
      .at(-1);
    nextWarning.querySelector("[data-pi-update-confirm='no']").click();
    expect(app.isPiUpdateIgnored("0.75.0", "0.75.6")).toBe(true);
    app.notifyPiUpdateAvailable({ currentVersion: "0.75.0", latestVersion: "0.75.6" });
    app.notifyPiUpdateRunning();
    app.notifyPiUpdateComplete();
    app.notifyPiUpdateFailed("");
    expect(document.body.textContent).toContain("pi update in progress");
    expect(document.body.textContent).toContain("pi update complete");
    expect(document.body.textContent).toContain("pi update failed");
  });

  it("covers generic auth warning provider and context fallbacks", async () => {
    const app = await connectPiApp();
    expect(detailMessage(null)).toBe("");
    expect(detailMessage({ message: "object message" })).toBe("object message");
    expect(toastContextWorkspace(null)).toBe("워크스페이스 없음");
    expect(toastContextWorkspace({ label: "Label workspace" })).toBe("Label workspace");
    expect(toastContextSession({ sessionId: "sid" })).toBe("sid");
    expect(toastContextSession({})).toBe("세션 없음");
    expect(authProviderLabel("")).toBe("알 수 없음");
    app.notifyRuntimeWarning("No API key configured");
    app.notifyRuntimeWarning({ message: "Authentication failed for provider custom-provider" });
    app.showToast("success", undefined, { workspace: "Workspace ID", session: "Session name", prompt: "Prompt text", sessionId: "sid" });
    app.showToast("success", undefined, "string-session");
    app.activateToastSession("missing-session");
    app.dataset.activeSessionId = "same-session";
    const same = document.createElement("button");
    same.className = "session-row active";
    same.dataset.session = "same-session";
    app.append(same);
    expect(app.backgroundWatchRows().has("same-session")).toBe(false);
    const text = document.body.textContent;
    expect(text).toContain("대상: 알 수 없음");
    expect(text).toContain("custom-provider");
    expect(text).toContain("Workspace ID");
    expect(text).toContain("세션 없음");
  });

  it("shows auth warnings instead of generic response errors for credential failures", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.notifyResponseFailure({ message: "No API key found for provider github-copilot" });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    const warningText = document.querySelector(".session-toast.warning").textContent;
    expect(warningText).toContain("인증 경고: GitHub Copilot");
    expect(warningText).toContain("방식: API 키");
    expect(warningText).toContain("문제: API 키가 저장되어 있지 않음");
    expect(document.querySelector(".session-toast.error")).toBeNull();
    expect(document.querySelector(".session-toast.success")).toBeNull();
  });

  it("ignores toast body activation when the dismiss button is clicked", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);
    app.activateToastSession = vi.fn();
    app.dismissToast = vi.fn();

    const notification = app.showToast("success");
    notification.triggerEvent("click", { target: { closest: (selector) => selector === ".notyf__dismiss" } });

    expect(app.activateToastSession).not.toHaveBeenCalled();
    expect(app.dismissToast).not.toHaveBeenCalled();
  });

  it("shows a blue choice toast and can dismiss all visible toasts", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);
    app.renderMessages([]);

    app.appendMessage({ kind: "pi", text: fallbackChoiceJson });
    app.notifySessionCompleted();

    expect(document.querySelector(".session-toast.choice").textContent).toContain("선택지 요청");
    expect(document.querySelector(".toast-dismiss-all").hidden).toBe(false);
    const visibleToasts = [...document.querySelectorAll(".notyf__toast:not(.notyf__toast--disappear)")];
    expect(visibleToasts.map((toast) => toast.style.getPropertyValue("--toast-stack-index"))).toEqual(["0", "1"]);
    expect(visibleToasts.map((toast) => toast.style.zIndex)).toEqual(["1", "2"]);
    document.querySelector(".toast-dismiss-all").click();
    expect(document.querySelectorAll(".notyf__toast--disappear")).toHaveLength(2);
  });

  it("notifies when an inactive watched session completes", async () => {
    const sources = [];
    class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        this.close = vi.fn();
        sources.push(this);
      }
      addEventListener(type, callback) { this.listeners[type] = callback; }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "active-session";
    app.dataset.activeWorkspaceId = "active-workspace";

    app.writeLastSessionPrompt("background-session", "finish the background task");
    app.renderWorkspaces([
      { id: "active-workspace", name: "active", sessionCount: 1, sessions: [{ id: "active-session", title: "now" }] },
      { id: "other-workspace", name: "other", sessionCount: 1, sessions: [
        { id: "background-session", title: "background", active: true },
      ] },
    ]);

    expect(sources).toHaveLength(1);
    sources[0].listeners["session.status"]({
      data: JSON.stringify({
        type: "session.status",
        sessionId: "background-session",
        payload: { status: "idle" },
      }),
    });

    const toast = document.querySelector(".session-toast.success");
    const toastText = toast.textContent;
    expect(toastText).toContain("응답 완료");
    expect(toast.querySelector(".toast-workspace").textContent).toBe("other");
    expect(toast.querySelector(".toast-session").textContent).toBe("background");
    expect(toast.querySelector(".toast-prompt").textContent).toBe("finish the background task");
    expect(sources[0].close).toHaveBeenCalled();
    expect(app.querySelector("[data-session='background-session']").classList.contains("unread-completed")).toBe(true);

    app.loadSession = vi.fn();
    toast.click();
    expect(app.dataset.activeSessionId).toBe("background-session");
    expect(app.loadSession).toHaveBeenCalledWith("background-session");
    expect(app.querySelector("[data-session='background-session']").classList.contains("unread-completed")).toBe(false);
  });

  it("drops unread completed sessions that are no longer visible", async () => {
    localStorage.setItem("piweb:unread-completed-sessions", JSON.stringify(["missing"]));
    const app = await connectPiApp();

    app.syncUnreadCompletedSessions();

    expect(localStorage.getItem("piweb:unread-completed-sessions")).toBe("[]");
  });

  it("covers toast storage, background watch cleanup, auth labels, and default contexts", async () => {
    const app = await connectPiApp();
    app.handleToastClick();
    app.showToast("unknown", "<detail>", "workspace label");
    expect(document.querySelector(".session-toast.success").textContent).toContain("workspace label");
    app.showSystemToast("unknown", "T", "D");
    expect([...document.querySelectorAll(".session-toast.warning")].at(-1).textContent).toContain("T");
    app.dismissToast(undefined);

    app.notifyRuntimeWarning("invalid_grant for provider anthropic");
    app.notifyRuntimeWarning("Unauthorized for provider openai");
    app.notifyRuntimeWarning("models.json error for custom");
    expect([...document.querySelectorAll(".session-toast.warning")].map((node) => node.textContent).join(" ")).toContain("OAuth grant");

    localStorage.setItem("piweb:last-session-prompts", "not-json");
    expect(app.readLastSessionPrompt("s1")).toBe("");
    app.writeLastSessionPrompt("", "skip");
    app.writeLastSessionPrompt("s1", "  prompt  ");
    expect(app.readLastSessionPrompt("s1")).toBe("prompt");
    localStorage.setItem("piweb:unread-completed-sessions", "not-json");
    expect(app.readUnreadCompletedSessions().size).toBe(0);
    app.writeUnreadCompletedSessions(new Set(["s1"]));
    app.clearUnreadCompletedSession("missing");
    app.markUnreadCompletedSession("");
    app.dataset.activeSessionId = "s1";
    app.markUnreadCompletedSession("s1");

    app.apiConnected = false;
    const close = vi.fn();
    app.backgroundSessionWatches = new Map([["s2", { source: { close } }]]);
    app.syncBackgroundSessionWatches();
    expect(close).toHaveBeenCalled();
    expect(app.backgroundSessionWatches.size).toBe(0);

    app.apiConnected = true;
    vi.stubGlobal("EventSource", undefined);
    app.syncBackgroundSessionWatches();
    const row = document.createElement("div");
    row.className = "session-row active";
    row.dataset.session = "s2";
    row.dataset.workspace = "w2";
    row.dataset.title = "row title";
    app.append(row);
    const group = document.createElement("div");
    group.dataset.workspaceGroup = "w2";
    group.innerHTML = `<span class="label">Workspace 2</span>`;
    app.append(group);
    app.writeLastSessionPrompt("s2", "last prompt");
    const context = app.toastContextForSessionRow(row);
    expect(context).toMatchObject({ workspaceName: "Workspace 2", sessionName: "row title", prompt: "last prompt", sessionId: "s2" });

    const watch = { row, source: { close: vi.fn() }, failed: false, wasRunning: false };
    app.notifyResponseFailure = vi.fn();
    app.notifyChoiceRequested = vi.fn();
    app.notifySessionCompleted = vi.fn();
    app.dismissBackgroundSessionWatch = vi.fn();
    app.handleBackgroundSessionEvent(null, watch);
    app.handleBackgroundSessionEvent({ type: "heartbeat" }, watch);
    app.handleBackgroundSessionEvent({ type: "error", payload: { error: "boom" } }, watch);
    app.handleBackgroundSessionEvent({ type: "session.message", payload: { text: fallbackChoiceJson } }, watch);
    app.handleBackgroundSessionEvent({ type: "session.status", payload: { status: "thinking" }, sessionId: "s2" }, watch);
    app.handleBackgroundSessionEvent({ type: "session.status", payload: { status: "cancelled" }, sessionId: "s2" }, watch);
    expect(app.notifyResponseFailure).toHaveBeenCalled();
    expect(app.notifyChoiceRequested).toHaveBeenCalled();
    expect(app.dismissBackgroundSessionWatch).toHaveBeenCalled();
  });

  it("restores unread completed session glow from local storage until the session is opened", async () => {
    localStorage.setItem("piweb:unread-completed-sessions", JSON.stringify(["s2"]));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.dataset.activeSessionId = "s1";
    app.renderWorkspaces([
      { id: "w1", name: "demo", sessionCount: 2, sessions: [
        { id: "s1", title: "current" },
        { id: "s2", title: "done" },
      ] },
    ]);

    const row = app.querySelector("[data-session='s2']");
    expect(row.classList.contains("unread-completed")).toBe(true);

    app.loadSession = vi.fn();
    await app.pickSession(row);

    expect(row.classList.contains("unread-completed")).toBe(false);
    expect(localStorage.getItem("piweb:unread-completed-sessions")).toBe("[]");
  });
});
