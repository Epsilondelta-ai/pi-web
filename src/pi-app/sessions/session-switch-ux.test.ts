// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("pi-app session switch UX", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });

  afterEach(cleanupPiAppFixture);

  it("shows a transcript loading placeholder while a session loads", async () => {
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    const app = await connectPiApp();
    app.connectEvents = vi.fn();
    app.append(app.createSessionRow("w1", { id: "s1", title: "large session", lastUsed: "now" }));

    const loading = app.loadSession("s1");

    expect(app.querySelector(".session-switch-loading")).not.toBeNull();
    expect(app.querySelector(".session-switch-label").textContent).toBe("loading large session…");

    resolveFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s1", title: "large session", workspaceId: "w1" },
        messages: [{ kind: "pi", text: "loaded" }],
      }),
    });
    await loading;

    expect(app.querySelector(".session-switch-loading")).toBeNull();
    expect(app.querySelector(".msg .body").textContent).toBe("loaded");
  });
});
