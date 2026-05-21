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
}

describe("pi-app toast notifications", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("shows and dismisses a green toast when a running response completes", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(document.querySelector(".session-toast.success").textContent).toContain("응답 완료");
    expect(document.querySelector(".session-toast.success").textContent).toContain("workspace: demo (w1)");
    expect(document.querySelector(".session-toast.success").textContent).toContain("session: chat (s1)");
    expect(document.querySelector(".session-toast.success")).toBeTruthy();
  });

  it("shows a red failure toast and suppresses completion after a response error", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "error", payload: { error: "boom" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(document.querySelector(".session-toast.error").textContent).toContain("응답 실패");
    expect(document.querySelector(".session-toast.error").textContent).toContain("boom");
    expect(document.querySelector(".session-toast.error").textContent).toContain("workspace: demo (w1)");
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

  it("shows a blue choice toast and can dismiss all visible toasts", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);
    app.renderMessages([]);

    app.appendMessage({ kind: "pi", text: fallbackChoiceJson });
    app.notifySessionCompleted();

    expect(document.querySelector(".session-toast.choice").textContent).toContain("선택지 요청");
    app.dismissAllToasts();
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
    expect(toastText).toContain("workspace: other (other-workspace)");
    expect(toastText).toContain("session: background (background-session)");
    expect(sources[0].close).toHaveBeenCalled();

    app.loadSession = vi.fn();
    toast.click();
    expect(app.dataset.activeSessionId).toBe("background-session");
    expect(app.loadSession).toHaveBeenCalledWith("background-session");
  });
});
