// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

describe("pi-app session switch UX", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });

  afterEach(cleanupPiAppFixture);

  it("shows a transcript loading placeholder while an uncached session loads", async () => {
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

  it("renders cached session messages immediately while refreshing in the background", async () => {
    const responses = [
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          session: { id: "s1", title: "demo", workspaceId: "w1" },
          messages: [{ kind: "pi", text: "cached" }],
        }),
      }),
    ];
    let resolveRefresh;
    responses.push(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    globalThis.fetch = vi.fn(() => responses.shift());
    const app = await connectPiApp();
    app.connectEvents = vi.fn();

    await app.loadSession("s1");
    app.renderMessages([{ kind: "pi", text: "other session" }]);

    const refreshing = app.loadSession("s1");

    expect(app.querySelector(".session-switch-loading")).toBeNull();
    expect(app.querySelector(".msg .body").textContent).toBe("cached");

    resolveRefresh({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s1", title: "demo", workspaceId: "w1" },
        messages: [{ kind: "pi", text: "fresh" }],
      }),
    });
    await refreshing;

    expect(app.querySelector(".msg .body").textContent).toBe("fresh");
  });
});
