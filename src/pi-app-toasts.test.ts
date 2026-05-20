// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

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

    expect(app.querySelector(".session-toast.success").textContent).toContain("응답 완료");
    expect(app.querySelector(".session-toast.success").textContent).toContain("workspace: demo (w1)");
    expect(app.querySelector(".session-toast.success").textContent).toContain("session: chat (s1)");
    app.querySelector(".session-toast.success").click();
    expect(app.querySelector(".session-toast")).toBeNull();
  });

  it("shows a red failure toast and suppresses completion after a response error", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "error", payload: { error: "boom" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(app.querySelector(".session-toast.error").textContent).toContain("응답 실패");
    expect(app.querySelector(".session-toast.error").textContent).toContain("boom");
    expect(app.querySelector(".session-toast.error").textContent).toContain("workspace: demo (w1)");
    expect(app.querySelector(".session-toast.success")).toBeNull();
  });

  it("shows a blue choice toast and can dismiss all visible toasts", async () => {
    const app = await connectPiApp();
    setActiveToastContext(app);
    app.renderMessages([]);

    app.appendMessage({ kind: "pi", text: fallbackChoiceJson });
    app.notifySessionCompleted();

    expect(app.querySelector(".session-toast.choice").textContent).toContain("선택지 요청");
    expect(app.querySelector(".toast-dismiss-all").hidden).toBe(false);
    app.querySelector(".toast-dismiss-all").click();
    expect(app.querySelector(".session-toast")).toBeNull();
    expect(app.querySelector(".toast-dismiss-all").hidden).toBe(true);
  });
});
