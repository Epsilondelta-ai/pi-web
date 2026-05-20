// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

describe("pi-app core events coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
  });
  afterEach(cleanupPiAppFixture);

  it("connects and disconnects with missing optional DOM", async () => {
    document.body.innerHTML = `<pi-app></pi-app>`;
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.bootstrapAPI = vi.fn();
    app.connectedCallback();
    app.connectedCallback();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 0 });
    app.installViewportSizing();
    app.applyEvent({ type: "unknown" });
    app.disconnectedCallback();
    expect(app.bound).toBe(true);
  });

  it("exercises bound send and slash keyboard listeners", async () => {
    const app = await connectPiApp();
    Element.prototype.scrollIntoView = vi.fn();
    app.submitPrompt = vi.fn();
    app.pickSlash = vi.fn();
    app.slashPopover.hidden = false;
    app.sendButton.disabled = false;
    app.sendButton.click();
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(app.submitPrompt).toHaveBeenCalledTimes(2);
    expect(app.pickSlash).toHaveBeenCalledWith("/model");
  });

  it("guards timers and dispatches every event type", async () => {
    const app = await connectPiApp();
    app.runtimeStatusTimer = 1;
    app.spinnerTimer = 1;
    app.startRuntimeStatusPolling();
    app.startSpinners();
    app.setConnection("ok");
    app.setConnection("err");
    app.appendMessage = vi.fn();
    app.appendDelta = vi.fn();
    app.updateSessionTitle = vi.fn();
    app.appendToolOutput = vi.fn();
    app.finishTool = vi.fn();
    app.finalizeStreamingMessages = vi.fn();
    app.setMode = vi.fn();
    app.running = false;

    app.applyEvent({ type: "heartbeat" });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });
    app.applyEvent({ type: "session.status", payload: { status: "cancelled" } });
    app.applyEvent({ type: "session.status", payload: {} });
    app.applyEvent({ type: "session.message", payload: { kind: "pi", text: "hi" } });
    app.applyEvent({ type: "session.delta", payload: { delta: "d" } });
    app.applyEvent({ type: "session.renamed", payload: { id: "s", title: "t" } });
    app.applyEvent({ type: "tool.started", payload: { kind: "tool", tool: "read" } });
    app.applyEvent({ type: "tool.output", payload: { tool: "read", chunk: "x" } });
    app.applyEvent({ type: "tool.finished", payload: { tool: "read", status: "ok" } });
    app.applyEvent({ sessionId: "other", type: "session.message", payload: { kind: "pi", text: "skip" } });

    expect(app.appendMessage).toHaveBeenCalled();
    expect(app.appendDelta).toHaveBeenCalled();
    expect(app.updateSessionTitle).toHaveBeenCalled();
    expect(app.appendToolOutput).toHaveBeenCalled();
    expect(app.finishTool).toHaveBeenCalled();
  });

  it("keeps transient event stream errors from disabling the API", async () => {
    const app = await connectPiApp();
    const indicator = document.createElement("span");
    indicator.className = "statusbtn";
    app.append(indicator);
    app.apiConnected = false;
    app.eventSource = { readyState: 0, close: vi.fn() };

    app.confirmConnection();
    expect(app.apiConnected).toBe(true);
    expect(indicator.title).toBe("connected");

    app.deferEventStreamError();
    expect(indicator.title).toBe("reconnecting to event stream");
    expect(indicator.style.color).toBe("var(--fg-3)");
    expect(app.apiConnected).toBe(true);

    app.confirmConnection();
    expect(indicator.title).toBe("connected");
  });

  it("marks the backend disconnected when the event stream stays down", async () => {
    let timeoutCallback;
    vi.spyOn(window, "setTimeout").mockImplementation((callback) => {
      timeoutCallback = callback;
      return 1;
    });
    const app = await connectPiApp();
    const indicator = document.createElement("span");
    indicator.className = "statusbtn";
    app.append(indicator);
    app.eventSource = { readyState: 0, close: vi.fn() };
    app.deferEventStreamError();
    timeoutCallback();
    expect(indicator.title).toBe("backend disconnected");
  });

  it("connects events, checks stream identity, mode, connection, and quota labels", async () => {
    const app = await connectPiApp();
    const source = { close: vi.fn() };
    app.eventSource = source;
    let handlers;
    globalThis.EventSource = undefined;
    const api = await import("./api");
    vi.spyOn(api, "sessionEvents").mockImplementation((sessionId, options) => {
      handlers = options;
      return { close: vi.fn(), sessionId };
    });
    app.dataset.activeSessionId = "s1";
    app.applyEvent = vi.fn();
    app.connectEvents("s1", { replay: true });
    handlers.onOpen();
    handlers.onError();
    handlers.onEvent({ type: "heartbeat" });
    expect(source.close).toHaveBeenCalled();
    expect(app.applyEvent).toHaveBeenCalledWith({ type: "heartbeat" });
    expect(app.isActiveEventStream(app.eventStreamId, "s1")).toBe(true);
    expect(app.isActiveEventStream(Symbol("x"), "s1")).toBe(false);
    expect(app.isCurrentSessionEvent({ sessionId: "s1" })).toBe(true);
    expect(app.isCurrentSessionEvent({ sessionId: "s2" })).toBe(false);
    app.dataset.activeSessionId = "";
    expect(app.isCurrentSessionEvent({ sessionId: "s2" })).toBe(true);

    app.stopButton = document.createElement("button");
    app.sendButton = document.createElement("button");
    app.finishRunningTools = vi.fn();
    app.syncLoadingMessage = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.syncCurrentSessionRunState = vi.fn();
    app.setMode("thinking");
    app.setMode("cancelled");
    app.setMode("idle");
    expect(app.syncCurrentSessionRunState).toHaveBeenCalledWith(true);
    expect(app.syncCurrentSessionRunState).toHaveBeenCalledWith(false);
    expect(app.finishRunningTools).toHaveBeenCalled();

    expect(app.quotaLabel("5h", 120)).toBe("5h 🔋(100%)");
    expect(app.quotaLabel("5h", -1)).toBe("5h 🪫(0%)");
    expect(app.quotaLabel("5h", Number.NaN)).toBeUndefined();
    vi.resetModules();
    await import("./pi-app");
  });
});
