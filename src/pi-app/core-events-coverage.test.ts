// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./test-helper";

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

  it("maps AG-UI subscriber callbacks into existing UI events", async () => {
    const app = await connectPiApp();
    app.dataset.activeSessionId = "s1";
    app.confirmConnection = vi.fn();
    app.setMode = vi.fn((mode) => { app.running = mode === "running" || mode === "thinking"; });
    app.appendDelta = vi.fn();
    app.appendMessage = vi.fn();
    app.appendToolOutput = vi.fn();
    app.finishTool = vi.fn();
    app.notifyResponseFailure = vi.fn();
    app.finalizeStreamingMessages = vi.fn();

    const subscriber = app.aguiSubscriber("s1");
    subscriber.onRunStarted();
    app.running = false;
    subscriber.onTextDelta("hello");
    app.running = true;
    subscriber.onTextDelta("hello again");
    subscriber.onTextEnd("done");
    app.running = false;
    subscriber.onThinkingDelta("think");
    app.running = true;
    subscriber.onThinkingDelta("think again");
    app.running = false;
    subscriber.onToolStart({ name: "bash" });
    app.running = true;
    subscriber.onToolStart({ name: "bash" });
    app.running = false;
    subscriber.onToolArgs({ name: "bash", chunk: "args" });
    app.running = true;
    subscriber.onToolArgs({ name: "bash", chunk: "args again" });
    subscriber.onToolResult({ name: "bash", content: "result" });
    subscriber.onToolEnd({ name: "bash", args: "{}", body: "body" });
    subscriber.onRunError("boom");
    subscriber.onRunFinished();

    expect(app.confirmConnection).toHaveBeenCalled();
    expect(app.appendDelta).toHaveBeenCalledWith({ kind: "pi", delta: "hello" });
    expect(app.appendDelta).toHaveBeenCalledWith({ kind: "think", delta: "think" });
    expect(app.appendMessage).toHaveBeenCalledWith({ kind: "pi", text: "done" });
    expect(app.appendToolOutput).toHaveBeenCalledWith({ tool: "bash", chunk: "args" });
    expect(app.appendToolOutput).toHaveBeenCalledWith({ tool: "bash", chunk: "result" });
    expect(app.finishTool).toHaveBeenCalledWith({ kind: "tool", tool: "bash", args: "{}", status: "ok", resultMeta: "done", body: "body" });
    expect(app.notifyResponseFailure).toHaveBeenCalledWith("boom");

    app.dataset.activeSessionId = "other";
    subscriber.onRunStarted();
    subscriber.onTextDelta("skip");
    subscriber.onTextEnd("skip");
    subscriber.onThinkingDelta("skip");
    subscriber.onToolStart({ name: "skip" });
    subscriber.onToolArgs({ name: "skip", chunk: "skip" });
    subscriber.onToolResult({ name: "skip", content: "skip" });
    subscriber.onToolEnd({ name: "skip", args: "", body: "" });
    subscriber.onRunError("skip");
    subscriber.onRunFinished();
    subscriber.onTextDelta("");
    subscriber.onTextEnd("");
    subscriber.onThinkingDelta("");
    subscriber.onToolArgs({ name: "skip", chunk: "" });
    subscriber.onToolResult({ name: "skip", content: "" });
    expect(app.appendMessage).not.toHaveBeenCalledWith({ kind: "pi", text: "skip" });
  });

  it("suppresses completion notifications after user cancellation", async () => {
    const app = await connectPiApp();
    app.dataset.activeSessionId = "s1";
    app.running = true;
    app.notifySessionCompleted = vi.fn();
    app.markSessionCancellationPending("");
    app.markSessionCancellationPending("s1");

    app.setMode("idle");

    expect(app.running).toBe(false);
    expect(app.notifySessionCompleted).not.toHaveBeenCalled();
    expect(app.isSessionCancellationPending("s1")).toBe(false);

    app.markSessionCancellationPending("s1");
    app.aguiSubscriber("s1").onRunFinished();
    expect(app.isSessionCancellationPending("s1")).toBe(false);
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

    globalThis.EventSource = { CLOSED: 2 };
    app.eventSource = { readyState: 2, close: vi.fn() };
    app.deferEventStreamError();
    expect(indicator.title).toBe("backend disconnected");
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
    app.connectionErrorTimer = 7;
    vi.spyOn(window, "clearTimeout").mockImplementation(() => undefined);
    app.deferEventStreamError();
    timeoutCallback();
    expect(window.clearTimeout).toHaveBeenCalledWith(7);
    expect(indicator.title).toBe("backend disconnected");

    app.eventSource = { readyState: 0, close: vi.fn() };
    app.deferEventStreamError();
    app.eventSource = { readyState: 0, close: vi.fn() };
    expect(() => timeoutCallback()).not.toThrow();

    app.setConnection("unexpected");
    expect(indicator.title).toBe("backend disconnected");
  });

  it("connects events, checks stream identity, mode, connection, and quota labels", async () => {
    const app = await connectPiApp();
    const source = { close: vi.fn() };
    app.eventSource = source;
    let handlers;
    globalThis.EventSource = undefined;
    const api = await import("../lib/api");
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

    expect(app.quotaLabel("5h", 120)).toContain("prompt-meta-battery-full");
    expect(app.quotaLabel("5h", 120)).toContain("(100%)");
    expect(app.quotaLabel("5h", 42)).toContain("prompt-meta-battery-medium");
    expect(app.quotaLabel("5h", -1)).toContain("prompt-meta-battery-low");
    expect(app.quotaLabel("5h", -1)).toContain("(0%)");
    expect(app.quotaLabel("5h", Number.NaN)).toBeUndefined();
    expect(app.promptMetaIcon("missing")).toBe("");
    vi.resetModules();
    await import("./index");
  });
});
