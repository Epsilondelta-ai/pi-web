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
    app.scrollTerm = vi.fn();
    app.scrollFrame = 321;
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    app.append(app.createSessionRow("w1", { id: "s1", title: "large session", lastUsed: "now" }));

    const loading = app.loadSession("s1");

    expect(cancelFrame).toHaveBeenCalledWith(321);
    expect(app.scrollFrame).toBeUndefined();
    expect(app.scrollTerm).not.toHaveBeenCalled();
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

  it("loads running sessions with one final scroll after the loading row is present", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s1", title: "running", workspaceId: "w1" },
        messages: [{ kind: "user", text: "work" }],
        status: "running",
      }),
    }));
    const app = await connectPiApp();
    app.connectEvents = vi.fn();
    app.isTermPinnedToBottom = () => true;
    const scrollWrites = [];
    let scrollTop = 0;
    Object.defineProperty(app.term, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(app.term, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollWrites.push(value);
        scrollTop = value;
      },
    });

    await app.loadSession("s1");

    expect(app.querySelector(".msg.loading")).not.toBeNull();
    expect(scrollWrites).toEqual([900]);
  });

  it("skips the background refresh render when cached session content is unchanged", async () => {
    const page = {
      session: { id: "s1", title: "demo", workspaceId: "w1" },
      messages: [{ kind: "pi", text: "cached" }],
      status: "idle",
      cursor: "cursor",
      hasMore: true,
    };
    const responses = [page, page].map((body) => Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
    }));
    globalThis.fetch = vi.fn(() => responses.shift());
    const app = await connectPiApp();
    app.connectEvents = vi.fn();

    await app.loadSession("s1");
    const renderMessages = vi.spyOn(app, "renderMessages");

    await app.loadSession("s1");

    expect(renderMessages).toHaveBeenCalledTimes(1);
  });

  it("renders fresh session messages without scrolling when refresh changes", async () => {
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
    const scrollWrites = [];
    let scrollTop = 42;
    Object.defineProperty(app.term, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollWrites.push(value);
        scrollTop = value;
      },
    });
    app.transcriptFollowBottom = false;
    app.scrollTerm = vi.fn();

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
    expect(app.term.scrollTop).toBe(42);
    expect(scrollWrites).toEqual([]);
    expect(app.transcriptFollowBottom).toBe(false);
    expect(app.scrollTerm).not.toHaveBeenCalled();
  });
});
