// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./test-helper";

describe("pi-app core events", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("starts timers idempotently and cleans up resources on disconnect", async () => {
    vi.useFakeTimers();
    const app = await connectPiApp();
    app.style.setProperty = vi.fn();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 0 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { height: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    expect(() => app.installViewportSizing()).not.toThrow();
    if (app.runtimeStatusTimer) clearInterval(app.runtimeStatusTimer);
    app.runtimeStatusTimer = undefined;
    app.loadRuntimeStatus = vi.fn();
    app.startRuntimeStatusPolling();
    const runtimeTimer = app.runtimeStatusTimer;
    app.startRuntimeStatusPolling();
    expect(app.runtimeStatusTimer).toBe(runtimeTimer);
    vi.advanceTimersByTime(15000);
    expect(app.loadRuntimeStatus).toHaveBeenCalled();

    app.startSpinners();
    const spinnerTimer = app.spinnerTimer;
    app.startSpinners();
    expect(app.spinnerTimer).toBe(spinnerTimer);
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    app.append(spinner);
    app.tickSpinners();
    expect(spinner.dataset.frame).toBe("1");

    const backgroundSource = { close: vi.fn() };
    app.eventSource = { close: vi.fn() };
    app.backgroundSessionWatches = new Map([["s2", { source: backgroundSource }]]);
    app.streamingRenderFrame = 1;
    app.scrollFrame = 2;
    app.updateTipTimer = setTimeout(() => {}, 1000);
    app.uninstallViewportSizing = vi.fn();
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    app.disconnectedCallback();
    expect(app.eventSource.close).toHaveBeenCalled();
    expect(backgroundSource.close).toHaveBeenCalled();
    expect(app.uninstallViewportSizing).toHaveBeenCalled();
    app.eventSource = null;
    app.spinnerTimer = undefined;
    app.runtimeStatusTimer = undefined;
    app.streamingRenderFrame = undefined;
    app.scrollFrame = undefined;
    app.updateTipTimer = undefined;
    expect(() => app.disconnectedCallback()).not.toThrow();
    vi.useRealTimers();
  });

  it("binds DOM and window events to current methods", async () => {
    const app = await connectPiApp();
    const calls = [];
    let voicesChanged;
    vi.stubGlobal("speechSynthesis", {
      addEventListener: vi.fn((event, callback) => {
        if (event === "voiceschanged") voicesChanged = callback;
      }),
    });
    ["submitWorkspacePath", "submitCloneWorkspace", "submitShellCommand", "saveSettingsForm", "fillSettingsForm", "fillModelControls", "syncCustomSettingInput", "setModelControlsLoading",
      "submitPrompt", "cancelActiveSession", "handlePromptPaste", "navigateList", "pickSlash", "addFiles", "startResize",
      "shortcut", "closeSessionMenus", "populateBrowserVoiceLanguageOptions"].forEach((name) => { app[name] = (...args) => calls.push([name, ...args]); });
    app.slashPopover.hidden = false;
    app.slashPopover.removeAttribute("hidden");
    const pathForm = document.createElement("form");
    const cloneForm = document.createElement("form");
    const shellForm = document.createElement("form");
    const resizer = document.createElement("div");
    pathForm.dataset.pathForm = "";
    cloneForm.dataset.cloneForm = "";
    shellForm.dataset.shellForm = "";
    resizer.className = "sb-resizer";
    app.append(pathForm, cloneForm, shellForm, resizer);
    app.bindDomEvents();

    pathForm.dispatchEvent(new Event("submit"));
    cloneForm.dispatchEvent(new Event("submit"));
    shellForm.dispatchEvent(new Event("submit"));
    app.querySelector("[data-settings-form]").dispatchEvent(new Event("submit"));
    app.querySelector("[data-settings-scope]").dispatchEvent(new Event("change"));
    app.querySelector("[data-setting='defaultProvider']").dispatchEvent(new Event("change"));
    app.querySelector("[data-setting='defaultModel']").dispatchEvent(new Event("change"));
    app.sendButton.click();
    app.stopButton.click();
    app.prompt.dispatchEvent(new Event("input"));
    app.prompt.dispatchEvent(new Event("paste"));
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    app.slashPopover.hidden = false;
    app.slashPopover.removeAttribute("hidden");
    app.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    app.attachButton.click();
    app.fileInput.dispatchEvent(new Event("change"));
    resizer.dispatchEvent(new PointerEvent("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new Event("click"));
    voicesChanged();

    const tweaks = document.createElement("div");
    tweaks.dataset.tweaks = "";
    tweaks.hidden = true;
    app.append(tweaks);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "__activate_edit_mode" } }));
    expect(tweaks.hidden).toBe(false);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "__deactivate_edit_mode" } }));
    expect(tweaks.hidden).toBe(true);
    expect(calls.map(([name]) => name)).toContain("submitWorkspacePath");
    expect(calls.map(([name]) => name)).toContain("navigateList");
    expect(calls.map(([name]) => name)).toContain("populateBrowserVoiceLanguageOptions");
  });

  it("keeps settings controls usable when model discovery fails", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const path = String(url);
      if (path.includes("/settings")) return { ok: true, json: async () => ({ settings: { project: {}, global: {}, effective: { defaultProvider: "zai", defaultModel: "gpt-5.5" }, paths: { project: "p", global: "g" } } }) };
      if (path.includes("/models")) return { ok: false, status: 502, statusText: "Bad Gateway", json: async () => ({ error: "signal: killed" }) };
      if (path.includes("/auth/oauth/providers")) return { ok: true, json: async () => ({ providers: [] }) };
      if (path.includes("/auth/providers")) return { ok: true, json: async () => ({ providers: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    const app = await connectPiApp();
    app.dataset.activeWorkspaceId = "w1";
    app.apiConnected = true;
    await app.openSettingsModal();
    const provider = app.querySelector("[data-setting='defaultProvider']");
    const model = app.querySelector("[data-setting='defaultModel']");
    expect(provider.disabled).toBe(false);
    expect(model.disabled).toBe(false);
    expect([...provider.options].map((option) => option.value)).toContain("zai");
    expect([...model.options].map((option) => option.value)).toContain("gpt-5.5");
    expect(app.querySelector("[data-settings-status]").textContent).toBe("signal: killed");
  });

  it("connects event streams and applies every event branch", async () => {
    const listeners = {};
    class FakeEventSource {
      constructor(url) { this.url = url; }
      addEventListener(type, callback) { listeners[type] = callback; }
      close = vi.fn();
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const app = await connectPiApp();
    app.eventSource = { close: vi.fn() };
    app.setConnection = vi.fn();
    app.applyEvent = vi.fn();
    app.dataset.activeSessionId = "s1";
    app.connectEvents("s1", { replay: false });
    const source = app.eventSource;
    source.onopen();
    source.onerror(new Error("x"));
    app.eventStreamId = Symbol("stale");
    source.onopen();
    source.onerror(new Error("x"));
    listeners["session.message"]({ data: JSON.stringify({ type: "heartbeat", sessionId: "s1" }) });
    listeners.error({ data: "{" });
    expect(app.setConnection).toHaveBeenCalledWith("ok");
    expect(app.setConnection).toHaveBeenCalledWith("reconnecting");

    app.applyEvent = Object.getPrototypeOf(app).applyEvent.bind(app);
    app.appendMessage = vi.fn();
    app.appendDelta = vi.fn();
    app.updateSessionTitle = vi.fn();
    app.appendToolOutput = vi.fn();
    app.finishTool = vi.fn();
    app.setMode = vi.fn();
    app.running = false;
    app.applyEvent({ type: "heartbeat" });
    app.applyEvent({ type: "session.status", payload: { status: "idle" } });
    app.applyEvent({ type: "session.message", payload: { kind: "pi" } });
    app.applyEvent({ type: "session.delta", payload: { delta: "x" } });
    app.running = true;
    app.applyEvent({ type: "session.delta", payload: { delta: "again" } });
    app.applyEvent({ type: "session.renamed", payload: { title: "t" } });
    app.running = false;
    app.applyEvent({ type: "tool.started", payload: { tool: "x" } });
    app.running = true;
    app.applyEvent({ type: "tool.started", payload: { tool: "x2" } });
    app.running = false;
    app.applyEvent({ type: "tool.output", payload: { tool: "x" } });
    app.running = true;
    app.applyEvent({ type: "tool.output", payload: { tool: "x2" } });
    app.applyEvent({ type: "tool.finished", payload: { tool: "x" } });
    expect(app.appendMessage).toHaveBeenCalled();
    expect(app.appendDelta).toHaveBeenCalled();
    expect(app.finishTool).toHaveBeenCalled();
  });

  it("surfaces runtime auth warnings while loading prompt metadata", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url) => {
      const path = String(url);
      if (path.endsWith("/runtime-model")) {
        return { ok: true, json: async () => ({ status: { model: "M", warning: "OAuth token expired" } }) };
      }
      if (path.includes("/runtime-quota")) return { ok: true, json: async () => ({ status: { fiveHourQuota: 12 } }) };
      return { ok: true, json: async () => ({ workspaces: [] }) };
    });
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.loadRuntimeStatus();
    await Promise.resolve();

    expect(app.querySelector("[data-prompt-meta]").textContent).toContain("M");
    expect(document.querySelector(".session-toast.warning").textContent).toContain("인증 경고");
  });

  it("updates connection, mode, and prompt metadata branches", async () => {
    const app = await connectPiApp();
    app.setConnection("ok");
    expect(app.querySelector(".statusbtn")).toBeNull();
    const indicator = document.createElement("button");
    indicator.className = "statusbtn";
    app.append(indicator);
    app.setConnection("ok");
    expect(indicator.title).toBe("connected");
    app.setConnection("err");
    expect(indicator.title).toBe("backend disconnected");

    app.finishRunningTools = vi.fn();
    app.syncLoadingMessage = vi.fn();
    app.loadRuntimeStatus = vi.fn();
    app.setMode("cancelled");
    expect(app.finishRunningTools).toHaveBeenCalledWith({ status: "err", resultMeta: "cancelled" });
    app.notifyResponseCompletedOnce = vi.fn();
    app.setMode("thinking");
    expect(app.running).toBe(true);
    app.setMode("idle");
    expect(app.running).toBe(false);
    expect(app.notifyResponseCompletedOnce).not.toHaveBeenCalled();
    app.setMode("running");
    app.responseReceived = true;
    app.setMode("idle");
    expect(app.notifyResponseCompletedOnce).toHaveBeenCalledTimes(1);
    app.sendButton = null;
    app.setMode("idle");

    app.updatePromptMeta({ model: "M", branch: "b", fiveHourQuota: -1, weeklyQuota: 101 });
    expect(app.querySelector("[data-prompt-meta]").textContent).toContain("M");
    expect(app.quotaLabel("bad", Number.NaN)).toBeUndefined();
  });
});
