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

describe("pi-app toast notifications", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("shows and dismisses a green toast when a running response completes", async () => {
    const app = await connectPiApp();

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(app.querySelector(".session-toast.success").textContent).toContain("응답 완료");
    app.querySelector(".session-toast.success").click();
    expect(app.querySelector(".session-toast")).toBeNull();
  });

  it("shows a red failure toast and suppresses completion after a response error", async () => {
    const app = await connectPiApp();

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "error", payload: { error: "boom" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });

    expect(app.querySelector(".session-toast.error").textContent).toContain("응답 실패");
    expect(app.querySelector(".session-toast.error").textContent).toContain("boom");
    expect(app.querySelector(".session-toast.success")).toBeNull();
  });

  it("shows a blue choice toast and can dismiss all visible toasts", async () => {
    const app = await connectPiApp();
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
