// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./pi-app";

const nativeEventSource = globalThis.EventSource;
const nativeFetch = globalThis.fetch;

function appFixture() {
  document.body.innerHTML = `
    <pi-app data-tree="on" data-sidebar="open" data-active-workspace-id="w1">
      <span class="statusbtn"></span>
      <span data-active-session-title></span>
      <main data-main="session"><div class="term-inner"></div></main>
      <main data-main="empty" hidden></main>
      <div class="prompt-region">
        <div class="slash-pop" hidden></div>
        <div class="attach-chips" hidden></div>
        <textarea class="prompt-textarea"></textarea>
        <button class="stop-btn" hidden>stop</button>
        <button class="send-btn" disabled>send</button>
        <button class="attach-btn">attach</button>
        <input data-file-input type="file" />
        <div class="prompt-meta" data-prompt-meta></div>
      </div>
    </pi-app>
  `;
  return document.querySelector("pi-app");
}

async function connectedApp() {
  const app = appFixture();
  await customElements.whenDefined("pi-app");
  app.bootstrapAPI = vi.fn();
  app.startRuntimeStatusPolling = vi.fn();
  app.startSpinners = vi.fn();
  app.connectedCallback();
  return app;
}

describe("pi-app session isolation", () => {
  beforeEach(() => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.PI_WEB_API_BASE;
    globalThis.EventSource = nativeEventSource;
    globalThis.fetch = nativeFetch;
    document.body.innerHTML = "";
  });

  it("ignores events that belong to a different session", async () => {
    const app = await connectedApp();
    app.dataset.activeSessionId = "s2";
    app.renderMessages([]);

    app.applyEvent({
      type: "session.message",
      sessionId: "s1",
      payload: { kind: "pi", text: "old session output" },
    });

    expect(app.querySelector(".msg")).toBeNull();
  });

  it("ignores callbacks from a stale event stream", async () => {
    const sources = [];
    globalThis.EventSource = class {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        this.close = vi.fn();
        sources.push(this);
      }

      addEventListener(type, listener) {
        this.listeners[type] = listener;
      }
    };
    const app = await connectedApp();
    app.dataset.activeSessionId = "s1";
    app.connectEvents("s1");
    app.dataset.activeSessionId = "s2";
    app.connectEvents("s2");

    sources[0].listeners["session.message"]({
      data: JSON.stringify({
        type: "session.message",
        sessionId: "s1",
        payload: { kind: "pi", text: "old stream output" },
      }),
    });

    expect(sources[0].close).toHaveBeenCalled();
    expect(app.querySelector(".msg")).toBeNull();
  });

  it("keeps the latest session load when older requests finish later", async () => {
    let resolveFirst;
    globalThis.fetch = vi.fn((url) => {
      if (String(url).endsWith("/api/sessions/s1")) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          session: { id: "s2", title: "second", workspaceId: "w1" },
          messages: [{ kind: "pi", text: "second session" }],
        }),
      });
    });
    const app = await connectedApp();
    app.connectEvents = vi.fn();

    const firstLoad = app.loadSession("s1");
    await app.loadSession("s2");
    resolveFirst({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s1", title: "first", workspaceId: "w1" },
        messages: [{ kind: "pi", text: "first session" }],
      }),
    });
    await firstLoad;

    expect(app.dataset.activeSessionId).toBe("s2");
    expect(app.querySelector(".msg .body").textContent).toBe("second session");
    expect(app.connectEvents).toHaveBeenCalledTimes(1);
    expect(app.connectEvents).toHaveBeenCalledWith("s2", { replay: false });
  });

  it("resets transient running state when loading another session", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s2", title: "second", workspaceId: "w1" },
        messages: [],
      }),
    }));
    const app = await connectedApp();
    app.connectEvents = vi.fn();
    app.dataset.activeSessionId = "s1";
    app.setMode("running");

    await app.loadSession("s2");

    expect(app.running).toBe(false);
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(app.querySelector(".stop-btn").hidden).toBe(true);
  });

  it("restores running controls from loaded session status", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session: { id: "s2", title: "second", workspaceId: "w1" },
        messages: [],
        status: "running",
      }),
    }));
    const app = await connectedApp();
    app.connectEvents = vi.fn();

    await app.loadSession("s2");

    expect(app.running).toBe(true);
    expect(app.querySelector(".stop-btn").hidden).toBe(false);
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
  });

  it("restores running controls when deltas arrive without replayed status", async () => {
    const app = await connectedApp();
    app.dataset.activeSessionId = "s1";
    app.renderMessages([]);

    app.applyEvent({
      type: "session.delta",
      sessionId: "s1",
      payload: { kind: "pi", delta: "still streaming" },
    });

    expect(app.running).toBe(true);
    expect(app.querySelector(".stop-btn").hidden).toBe(false);
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("still streaming");
  });
});
