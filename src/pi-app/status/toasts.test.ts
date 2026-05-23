// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

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
    app.notifyRuntimeWarning("Authentication failed for github-copilot. Credentials may have expired.");

    const warnings = [...document.querySelectorAll(".session-toast.warning")];
    expect(warnings).toHaveLength(2);
    expect(warnings[0].textContent).toContain("업데이트 가능");
    expect(warnings[0].textContent).toContain("pi-web update");
    expect(warnings[1].textContent).toContain("인증 경고");
    expect(warnings[1].textContent).toContain("Settings에서 다시 로그인");
  });

  it("shows auth warnings instead of generic response errors for credential failures", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.notifyResponseFailure({ message: "No API key found for provider github-copilot" });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(document.querySelector(".session-toast.warning").textContent).toContain("인증 경고");
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
