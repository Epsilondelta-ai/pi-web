// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    app.applyEvent({ type: "session.status", payload: { status: "running" } });
    app.applyEvent({ type: "session.delta", payload: { kind: "pi", delta: "done" } });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });
    app.notifyChoiceRequested({ sessionId: "s1" });
    app.notifyResponseFailure("plain failure");
    app.notifyUpdateAvailable({ currentVersion: "1.0.0", latestVersion: "1.1.0" });
    app.notifyRuntimeWarning("Authentication failed for github-copilot");

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

    expect(detailMessage({ message: "boom" })).toBe("boom");
    expect(authProviderLabel("github-copilot")).toBe("GitHub Copilot");
    expect(notificationContextWorkspace(null)).toBe("워크스페이스 없음");
    expect(notificationContextWorkspace({ label: "Label workspace" })).toBe("Label workspace");
    expect(notificationContextSession({ sessionId: "sid" })).toBe("sid");
    expect(notificationContextSession({})).toBe("세션 없음");
    expect(app.notificationContextForSessionRow(row).prompt).toBe("last prompt");
  });

  it("keeps backend connection handling without showing a popup", async () => {
    const app = await connectPiApp();
    app.setConnection = (state) => {
      app.dataset.connection = state;
    };

    app.notifyResponseFailure("TypeError: Failed to fetch");

    expect(app.dataset.connection).toBe("err");
    expect(document.querySelector(".pi-web-notification-popup")).toBeNull();
  });
});
