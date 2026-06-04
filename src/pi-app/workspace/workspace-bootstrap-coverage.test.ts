// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function failJson(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
}

describe("workspace bootstrap coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(cleanupPiAppFixture);

  it("covers version and runtime status fallback branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.renderVersionStatus({ updateAvailable: false, currentVersion: "1", latestVersion: "2" });
    expect(app.querySelector("[data-action='show-update-tip']").hidden).toBe(true);
    app.notifyUpdateAvailable = vi.fn();
    app.renderVersionStatus({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    expect(app.querySelector("[data-action='show-update-tip']").hidden).toBe(false);
    app.renderVersionStatus({ updateAvailable: true, currentVersion: "2", latestVersion: "2" });
    app.renderVersionStatus(null);
    app.querySelector("[data-action='show-update-tip']").remove();
    app.renderVersionStatus({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });

    app.notifyPiUpdateAvailable = vi.fn();
    app.renderPiVersionStatus({ updateAvailable: true, currentVersion: "1", latestVersion: "2" });
    app.renderPiVersionStatus({ updateAvailable: true, currentVersion: "2", latestVersion: "2" });
    app.renderPiVersionStatus(null);
    expect(app.notifyPiUpdateAvailable).toHaveBeenCalledTimes(1);

    const tip = document.createElement("span");
    tip.dataset.updateTip = "";
    tip.hidden = true;
    app.append(tip);
    vi.spyOn(window, "setTimeout").mockImplementation((callback) => { callback(); return 1; });
    app.showUpdateTip();
    expect(tip.hidden).toBe(true);

    app.updatePromptMeta = vi.fn();
    app.notifyRuntimeWarning = vi.fn();
    app.applyRuntimeStatus({ model: "m", warning: "careful" });
    app.applyRuntimeStatus(null);
    expect(app.notifyRuntimeWarning).toHaveBeenCalledWith("careful");
    globalThis.fetch = vi.fn(async (url) => String(url).includes("runtime-model")
      ? failJson("model failed")
      : okJson({ status: { model: "fallback" } }));
    await app.loadRuntimeStatus("w1");
    expect(app.updatePromptMeta).toHaveBeenLastCalledWith({ model: "fallback" });
    globalThis.fetch = vi.fn(async () => failJson("quota failed"));
    await app.loadRuntimeQuota("w1", "m");
    app.apiConnected = false;
    await app.loadRuntimeStatus("w1");
    await app.loadRuntimeQuota("w1", "m");
  });

  it("covers settings form language, auth, focus, and patch branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.settingsState = {
      project: { defaultProvider: "custom-provider", voice: { language: "ko-KR" }, speechInput: { language: "ja-JP", useLocalWhisper: true } },
      global: {},
      effective: { defaultProvider: "anthropic", defaultModel: "claude", readResponsesAloud: true, enableSpeechInput: true, voice: { language: "en-US" }, speechInput: { language: "ko", whisperModel: "base" } },
      paths: { project: "/p", global: "/g" },
    };
    app.speechInputAllowed = vi.fn(() => true);
    app.updateWhisperCacheStatus = vi.fn();
    app.stopSpeechInput = vi.fn();
    app.syncReadAloudControls = vi.fn();
    app.syncSpeechInputControls = vi.fn();
    vi.stubGlobal("speechSynthesis", { getVoices: () => [{ lang: "en-US", default: true }, { lang: "ko-KR" }] });
    app.modelState = { providers: [{ id: "anthropic", models: [{ id: "claude" }] }, { id: "openai", models: [{ id: "gpt" }] }] };
    app.populateBrowserVoiceLanguageOptions();
    app.fillModelControls();
    app.fillSettingsForm();
    expect(app.updateWhisperCacheStatus).toHaveBeenCalled();
    expect(app.querySelector("[data-settings-path]").textContent).toBe("/p");
    expect(app.querySelector("[data-custom-setting='defaultProvider']").value).toBe("custom-provider");
    expect(app.querySelector("[data-setting='voice.language']").value).toMatch(/Korean|한국어|ko/i);
    app.fillFallbackModelControls();
    expect(app.settingsFieldLabel("speechInput.whisperModel")).toBe("Speech Input · whisper Model");

    const provider = app.querySelector("[data-auth-provider]");
    provider.innerHTML = `<option value="anthropic">anthropic</option>`;
    provider.value = "anthropic";
    app.authState = { providers: [{ id: "anthropic", name: "Anthropic", configured: true }] };
    app.fillAuthForm();
    expect(provider.textContent).toContain("✓");
    app.setAuthStatus("bad", true);
    expect(app.querySelector("[data-auth-status]").classList.contains("err")).toBe(true);
    await app.saveAuthForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-auth-status]").textContent).toContain("required");
    app.querySelector("[data-auth-api-key]").value = "key";
    globalThis.fetch = vi.fn(async (url) => String(url).includes("api-key") ? okJson({}) : okJson({ providers: [] }));
    app.loadRuntimeStatus = vi.fn();
    await app.saveAuthForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-auth-api-key]").value).toBe("");
    app.authState = { providers: [{ id: "anthropic", name: "Anthropic", configured: true }] };
    app.fillAuthForm();
    globalThis.fetch = vi.fn(async (url) => String(url).includes("/api/auth/") ? okJson({}) : okJson({ providers: [] }));
    await app.logoutAuthProvider();
    expect(app.querySelector("[data-auth-status]").textContent).toContain("removed");

    app.refreshWhisperModelRequirement = vi.fn(() => false);
    await app.saveSettingsForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-settings-status]").textContent).toContain("download selected Whisper");
    app.refreshWhisperModelRequirement = vi.fn(() => true);
    globalThis.fetch = vi.fn(async () => okJson({ settings: { global: {}, project: {}, effective: { readResponsesAloud: false }, paths: {} } }));
    await app.saveSettingsForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-settings-status]").textContent).toBe("saved");

    app.settingsModal.hidden = false;
    app.focusSettingsModal();
    const event = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    app.trapSettingsFocus(event);
    app.closeSettingsModal();
    expect(app.settingsModal.hidden).toBe(true);
  });

  it("covers remaining settings method branches", async () => {
    const app = await connectPiApp();
    const validSettings = { global: {}, project: {}, effective: { defaultProvider: "anthropic", defaultModel: "claude", enableSpeechInput: true, speechInput: { language: "en", useLocalWhisper: false }, voice: { language: "system" } }, paths: { project: "/p", global: "/g" } };

    app.dataset.activeWorkspaceId = "w1";
    app.apiConnected = false;
    await app.loadWorkspaceSettingsState("w1");
    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-status]").textContent).toContain("backend disconnected");
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "";
    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-status]").textContent).toContain("open a workspace first");

    app.dataset.activeWorkspaceId = "w1";
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/settings")) throw new Error("settings down");
      return okJson({});
    });
    await app.openSettingsModal();
    expect(app.setConnection).toHaveBeenCalledWith("err");

    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/settings")) return okJson({ settings: validSettings });
      if (value.includes("auth/providers")) throw new Error("auth down");
      if (value.includes("oauth/providers")) throw "oauth down";
      if (value.endsWith("/models")) return okJson({ error: "models warning", providers: [] });
      return okJson({});
    });
    app.fillAuthForm = vi.fn();
    app.fillOAuthForm = vi.fn();
    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-status]").textContent).toContain("auth down");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    await app.loadWorkspaceSettingsState("w1");
    expect(app.settingsState.effective.defaultProvider).toBe("anthropic");

    app.settingsState = validSettings;
    app.speechInputAllowed = vi.fn(() => false);
    app.stopSpeechInput = vi.fn();
    app.syncReadAloudControls = vi.fn();
    app.syncSpeechInputControls = vi.fn();
    app.syncSettingsStateToApp();
    expect(app.enableSpeechInput).toBe(false);
    expect(app.stopSpeechInput).toHaveBeenCalled();
    expect([...app.querySelectorAll("[data-secure-context-only='https']")].every((node) => node.hidden)).toBe(true);

    const providerControl = app.querySelector("[data-setting='defaultProvider']");
    const modelControl = app.querySelector("[data-setting='defaultModel']");
    app.modelState = { providers: [{ id: "openai", models: [{ id: "gpt" }] }, { id: "anthropic", models: undefined }] };
    providerControl.value = "openai";
    app.fillModelControls();
    expect([...modelControl.options].map((option) => option.value)).toContain("gpt");
    app.modelState = { providers: [{ id: "empty" }, { id: "fallback", models: [{ id: "fallback-model" }] }] };
    providerControl.value = "custom";
    app.fillModelControls();
    expect([...modelControl.options].map((option) => option.value)).toContain("fallback-model");
    app.modelState = null;
    expect(() => app.fillModelControls()).not.toThrow();

    const customProvider = app.querySelector("[data-custom-setting='defaultProvider']");
    providerControl.value = "custom";
    app.syncCustomSettingInput(providerControl);
    expect(customProvider.hidden).toBe(false);
    const bareSelect = document.createElement("select");
    bareSelect.dataset.setting = "missingCustom";
    app.syncCustomSettingInput(bareSelect);

    const text = document.createElement("input");
    text.value = " abc ";
    expect(app.settingValueFromControl(text, { type: "text" })).toBe("abc");
    text.value = "";
    expect(app.settingValueFromControl(text, { type: "password" })).toBeNull();
    text.value = "42";
    expect(app.settingValueFromControl(text, { type: "numberText" })).toBe(42);
    const select = document.createElement("select");
    select.innerHTML = `<option value="inherit">inherit</option><option value="true">true</option><option value="7">7</option><option value="x">x</option>`;
    select.value = "true";
    expect(app.settingValueFromControl(select, { type: "boolean" })).toBe(true);
    select.value = "7";
    expect(app.settingValueFromControl(select, { type: "numberSelect" })).toBe(7);
    select.value = "x";
    expect(app.settingValueFromControl(select, { type: "select" })).toBe("x");

    const lang = app.querySelector("[data-setting='speechInput.language']");
    lang.value = "English";
    expect(app.settingValueFromControl(lang, { type: "speechLanguage" })).toBe("en");
    lang.value = "System default";
    expect(app.settingValueFromControl(lang, { type: "speechLanguage" })).toBeNull();

    app.settingsState = { project: {}, global: {}, effective: { defaultProvider: "anthropic", speechInput: { language: "en" } }, paths: {} };
    app.speechInputAllowed = vi.fn(() => true);
    providerControl.value = "custom";
    customProvider.value = "custom-provider";
    const patch = app.settingsPatchFromForm(app.querySelector("[data-settings-form]"));
    expect(patch.defaultProvider).toBe("custom-provider");
    expect(patch.speechInput).toBeTruthy();

    const modal = app.settingsModal;
    modal.hidden = false;
    modal.querySelectorAll("button, input, select").forEach((el) => { el.getClientRects = () => [{ width: 1, height: 1 }]; });
    const first = modal.querySelector("select");
    const last = [...modal.querySelectorAll("button, input, select")].at(-1);
    first.focus();
    const shift = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    app.trapSettingsFocus(shift);
    expect(shift.preventDefault).toHaveBeenCalled();
    last.focus();
    const tab = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    app.trapSettingsFocus(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
    modal.hidden = true;
    app.trapSettingsFocus({ key: "Escape", preventDefault: vi.fn() });

    app.settingsModal = null;
    app.focusSettingsModal();
    app.closeSettingsModal();
    app.setSettingsStatus("missing target");
    app.setAuthStatus("missing target");
  });

  it("covers settings remaining fallback and focus branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    app.settingsModal.hidden = false;
    const active = document.createElement("button");
    document.body.append(active);
    active.focus();
    await app.openSettingsModal();
    expect(app.settingsReturnFocus).toBe(active);

    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/settings")
      ? Promise.reject("plain settings failure")
      : okJson({ providers: [] }));
    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-status]").textContent).toContain("plain settings failure");

    const modal = app.settingsModal;
    modal.hidden = false;
    const controls = [...modal.querySelectorAll("button, input, select")];
    controls.forEach((el) => { el.getClientRects = () => [{ width: 1, height: 1 }]; });
    const first = controls[0];
    const last = controls.at(-1);
    document.body.focus();
    const outsideShift = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    app.trapSettingsFocus(outsideShift);
    expect(outsideShift.preventDefault).toHaveBeenCalled();
    first.focus();
    const forward = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    app.trapSettingsFocus(forward);
    expect(forward.preventDefault).not.toHaveBeenCalled();
    last.focus();
    const wrap = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    app.trapSettingsFocus(wrap);
    expect(wrap.preventDefault).toHaveBeenCalled();

    vi.stubGlobal("speechSynthesis", { getVoices: () => [
      { lang: "en-US", default: false },
      { lang: "en-GB", default: true },
      { lang: "ko-KR", default: false },
    ] });
    const voice = app.querySelector("[data-setting='voice.language']");
    voice.value = "en-US";
    app.populateBrowserVoiceLanguageOptions();
    expect(voice.value).toMatch(/English|en/i);

    const provider = app.querySelector("[data-setting='defaultProvider']");
    const model = app.querySelector("[data-setting='defaultModel']");
    const customProvider = app.querySelector("[data-custom-setting='defaultProvider']");
    app.modelState = { providers: [{ id: "p1", models: [{ id: "m1" }] }] };
    provider.innerHTML = `<option value="custom">custom</option>`;
    provider.value = "custom";
    app.fillModelControls();
    expect(customProvider.value).toBe("");
    app.modelState = { providers: [{ id: "p1", models: [] }] };
    model.innerHTML = `<option value="custom">custom</option>`;
    model.value = "custom";
    app.fillModelControls();

    app.settingsState = { project: {}, global: {}, effective: {}, paths: {} };
    app.fillFallbackModelControls();
    app.settingsState = { project: {}, global: {}, effective: { defaultProvider: 1, defaultModel: 2 }, paths: {} };
    app.fillFallbackModelControls();

    const select = document.createElement("select");
    select.dataset.setting = "defaultProvider";
    select.innerHTML = `<option value="known">known</option><option value="custom">custom</option>`;
    app.fillSettingsControl(select, { type: "providerSelect" }, "known", undefined);
    expect(select.value).toBe("known");
    app.fillSettingsControl(select, { type: "providerSelect" }, "unknown", undefined);
    expect(select.value).toBe("custom");
    app.fillSettingsControl(select, { type: "voiceEngine" }, "cloud", undefined);
    expect(select.value).toBe("");
    app.fillSettingsControl(select, { type: "whisperModel" }, "large", undefined);
    expect(select.value).toBe("");
    app.fillSettingsControl(select, { type: "select" }, "explicit", undefined);
    expect(select.value).toBe("");

    const form = app.querySelector("[data-settings-form]");
    form.querySelector("[name='scope']").value = "";
    app.settingsState = undefined;
    expect(app.settingsPatchFromForm(form).readResponsesAloud).toBe(false);

    const bareProvider = document.createElement("select");
    bareProvider.dataset.setting = "defaultProvider";
    app.append(bareProvider);
    app.setModelControlsLoading();
    app.settingsState = undefined;
    app.fillFallbackModelControls();
    const savedProvider = app.querySelector("[data-setting='defaultProvider']");
    const savedModel = app.querySelector("[data-setting='defaultModel']");
    savedProvider.remove();
    savedModel.remove();
    bareProvider.remove();
    app.fillFallbackModelControls();
    app.append(savedProvider, savedModel);

    app.settingsState = { project: {}, global: {}, effective: { apiKey: "secret", voice: {}, speechInput: {} }, paths: {} };
    app.querySelector("[name='scope']").value = "";
    app.fillSettingsForm();
    app.fillSettingsControl(select, { type: "voiceEngine" }, "", undefined);
    expect(select.value).toBe("");
    app.fillSettingsControl(select, { type: "whisperModel" }, "", undefined);
    expect(select.value).toBe("");
    app.fillSettingsControl(select, { type: "speechLanguage" }, "", undefined);
    expect(select.value).toBe("");

    const num = document.createElement("input");
    num.value = "";
    expect(app.settingValueFromControl(num, { type: "numberText" })).toBeNull();
    provider.value = "custom";
    customProvider.value = "";
    expect(app.settingValueFromControl(provider, { type: "providerSelect" })).toBeNull();

    const activeInside = document.createElement("button");
    app.settingsModal.append(activeInside);
    activeInside.focus();
    await app.openSettingsModal();
    expect(app.settingsReturnFocus).not.toBe(activeInside);

    app.querySelector("[data-auth-provider]").innerHTML = `<option value="anthropic">Anthropic</option>`;
    app.querySelector("[data-auth-api-key]").value = "key";
    globalThis.fetch = vi.fn(async () => { throw "auth string failed"; });
    await app.saveAuthForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-auth-status]").textContent).toContain("auth string failed");
    globalThis.fetch = vi.fn(async () => { throw "logout string failed"; });
    await app.logoutAuthProvider();
    expect(app.querySelector("[data-auth-status]").textContent).toContain("logout string failed");
    app.refreshWhisperModelRequirement = vi.fn(() => true);
    globalThis.fetch = vi.fn(async () => { throw "settings string failed"; });
    await app.saveSettingsForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-settings-status]").textContent).toContain("settings string failed");
  });

  it("covers settings success, guard, and error branches", async () => {
    const app = await connectPiApp();
    const validSettings = { global: {}, project: {}, effective: {}, paths: {} };
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.setConnection = vi.fn();
    app.fillAuthForm = vi.fn();
    app.fillOAuthForm = vi.fn();
    app.fillModelControls = vi.fn();
    app.fillFallbackModelControls = vi.fn();
    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/settings")) return okJson({ settings: validSettings });
      if (value.includes("auth/providers")) return okJson({ providers: [{ id: "anthropic", name: "Anthropic" }] });
      if (value.includes("oauth/providers")) return okJson({ providers: [{ id: "anthropic", name: "Anthropic" }] });
      if (value.endsWith("/models")) return okJson({ providers: [] });
      return okJson({});
    });
    await app.openSettingsModal();
    expect(app.fillAuthForm).toHaveBeenCalled();
    expect(app.fillOAuthForm).toHaveBeenCalled();
    expect(app.fillModelControls).toHaveBeenCalled();

    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/models") ? Promise.reject("models rejected") : okJson({ settings: validSettings, providers: [] }));
    await app.openSettingsModal();
    expect(app.fillFallbackModelControls).toHaveBeenCalled();

    app.syncReadAloudFromSettingsState();
    app.querySelector("[data-auth-form]").remove();
    await app.saveAuthForm({ preventDefault: vi.fn() });
    app.querySelector("[data-settings-form]").remove();
    await app.saveSettingsForm({ preventDefault: vi.fn() });
    await app.logoutAuthProvider();
    app.querySelector("[data-auth-status]")?.remove();
    app.setAuthStatus("gone");
    app.querySelector("[data-settings-status]")?.remove();
    app.setSettingsStatus("gone");
  });

  it("covers settings direct control and failure branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.setConnection = vi.fn();
    app.speechInputAllowed = vi.fn(() => true);

    const input = document.createElement("input");
    app.fillSettingsControl(input, { type: "text" }, "explicit", "effective");
    expect(input.value).toBe("explicit");
    app.fillSettingsControl(input, { type: "password" }, undefined, "secret");
    expect(input.placeholder).toBe("set");
    app.fillSettingsControl(input, { type: "numberText" }, undefined, 7);
    expect(input.placeholder).toBe("7");
    const select = document.createElement("select");
    select.innerHTML = `<option value="inherit">inherit</option><option value="false">false</option><option value="browser">browser</option><option value="tiny-q5">tiny-q5</option>`;
    app.fillSettingsControl(select, { type: "boolean" }, false, true);
    expect(select.value).toBe("false");
    app.fillSettingsControl(select, { type: "voiceEngine" }, undefined, undefined);
    expect(select.value).toBe("browser");
    app.fillSettingsControl(select, { type: "whisperModel" }, undefined, undefined);
    expect(select.value).toBe("tiny-q5");
    app.fillSettingsControl(select, { type: "select" }, undefined, "x");
    expect(select.value).toBe("inherit");

    app.authState = { providers: [{ id: "anthropic", name: "Anthropic" }] };
    app.fillAuthForm();
    app.querySelector("[data-auth-api-key]").value = "key";
    globalThis.fetch = vi.fn(async () => failJson("save key failed"));
    await app.saveAuthForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-auth-status]").textContent).toContain("save key failed");
    globalThis.fetch = vi.fn(async () => failJson("logout failed"));
    await app.logoutAuthProvider();
    expect(app.querySelector("[data-auth-status]").textContent).toContain("logout failed");

    app.refreshWhisperModelRequirement = vi.fn(() => true);
    globalThis.fetch = vi.fn(async () => failJson("save settings failed"));
    await app.saveSettingsForm({ preventDefault: vi.fn() });
    expect(app.querySelector("[data-settings-status]").textContent).toMatch(/save settings failed|invalid settings patch/);

    app.settingsState = { project: {}, global: {}, effective: { enableSpeechInput: true, speechInput: { language: "en" } }, paths: {} };
    app.speechInputAllowed = vi.fn(() => false);
    const patch = app.settingsPatchFromForm(app.querySelector("[data-settings-form]"));
    expect(patch.speechInput).toBeUndefined();
    expect(patch.enableSpeechInput).toBeUndefined();
  });

  it("covers settings helper edge paths", async () => {
    const app = await connectPiApp();
    app.settingsState = { project: {}, global: {}, effective: {}, paths: {} };

    const lang = document.createElement("input");
    lang.value = "";
    expect(app.settingValueFromControl(lang, { type: "speechLanguage" })).toBeNull();
    lang.value = "Custom Lang";
    expect(app.settingValueFromControl(lang, { type: "speechLanguage" })).toBe("Custom Lang");
    const blankLike = { toString: () => "" };
    app.fillSettingsControl(lang, { type: "speechLanguage" }, blankLike, "");
    expect(lang.value).toBe("System default");

    const voice = app.querySelector("[data-setting='voice.language']");
    const listId = voice.getAttribute("list");
    voice.removeAttribute("list");
    app.populateBrowserVoiceLanguageOptions();
    voice.setAttribute("list", listId);
    vi.stubGlobal("speechSynthesis", { getVoices: () => [{ lang: "" }, { lang: " " }, { lang: "zh-CN", default: true }] });
    voice.value = "zh";
    app.populateBrowserVoiceLanguageOptions();
    expect(voice.value).toMatch(/Chinese|中文|zh/i);

    app.settingsModal.hidden = false;
    const returnButton = document.createElement("button");
    document.body.append(returnButton);
    returnButton.focus = vi.fn();
    app.settingsReturnFocus = returnButton;
    app.closeSettingsModal();
    expect(returnButton.focus).toHaveBeenCalled();

    app.settingsModal.hidden = false;
    const first = app.settingsModal.querySelector("select");
    first.getClientRects = () => [{ width: 1, height: 1 }];
    document.body.focus();
    const outside = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    app.trapSettingsFocus(outside);
    expect(outside.preventDefault).toHaveBeenCalled();

    const form = app.querySelector("[data-settings-form]");
    form.remove();
    app.fillSettingsForm();
    app.fillSpeechInputAdvancedControls({}, {});
    app.append(form);
    app.querySelector("[data-setting='speechInput.useLocalWhisper']")?.remove();
    app.querySelector("[data-setting='speechInput.whisperModel']")?.remove();
    app.fillSpeechInputAdvancedControls({}, {});

    const provider = app.querySelector("[data-setting='defaultProvider']");
    provider.innerHTML = `<option value="openai">openai</option>`;
    provider.value = "openai";
    expect(app.settingValueFromControl(provider, { type: "providerSelect" })).toBe("openai");
  });

  it("covers workspace API fallback branches", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.renderWorkspaces = vi.fn();
    app.openWorkspace = vi.fn();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces/open")
      ? okJson({})
      : okJson({ workspaces: null }));
    await app.openWorkspacePath("/missing");
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);

    const cloneForm = document.createElement("form");
    cloneForm.innerHTML = `<input name="gitUrl" value="https://x/repo.git"><input name="name" value=""><button type="submit"></button>`;
    cloneForm.reset = vi.fn();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces/clone")
      ? okJson({ workspace: undefined })
      : okJson({ workspaces: null }));
    app.currentFolder = "";
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneForm });
    expect(cloneForm.reset).toHaveBeenCalled();
    const cloneFormNoButton = document.createElement("form");
    cloneFormNoButton.innerHTML = `<input name="gitUrl" value="https://x/repo.git"><input name="name" value="">`;
    cloneFormNoButton.reset = vi.fn();
    await app.submitCloneWorkspace({ preventDefault: vi.fn(), currentTarget: cloneFormNoButton });
    expect(cloneFormNoButton.reset).toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch = vi.fn(async () => okJson({ workspaces: null }));
    await app.deleteWorkspace("w1");
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);
  });

  it("covers bootstrap fallback branches", async () => {
    localStorage.setItem("pi.activeSession", JSON.stringify({ workspaceId: "w-missing", sessionId: "missing" }));
    const app = await connectPiApp();
    app.apiConnected = true;
    app.renderWorkspaces = vi.fn();
    app.openActiveWorkspaceGroup = vi.fn();
    app.setConnection = vi.fn();
    const savedTermInner = app.termInner;
    app.termInner = null;
    app.showSessionSwitchLoading("none");
    app.termInner = savedTermInner;
    app.querySelector("[data-action='refresh-workspaces']")?.remove();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: [{ id: "stored", name: "stored", path: "/stored", sessions: [{ id: "other", title: "other" }] }] })
      : okJson({}));
    await app.bootstrapAPI();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({})
      : okJson({}));
    await app.bootstrapAPI();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: null })
      : okJson({}));
    await app.refreshWorkspaces();
    expect(app.renderWorkspaces).toHaveBeenCalledWith([]);

    app.sessionLoadToken = Symbol("old");
    globalThis.fetch = vi.fn(async () => { throw new Error("session fail"); });
    await app.loadSession("missing");
    expect(app.setConnection).toHaveBeenCalledWith("err");
    app.setConnection.mockClear();
    globalThis.fetch = vi.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error("stale")), 0)));
    const loading = app.loadSession("stale");
    app.sessionLoadToken = Symbol("newer");
    await loading;
    expect(app.setConnection).not.toHaveBeenCalled();

    const row = document.createElement("div");
    row.dataset.session = "s-row";
    row.dataset.workspace = "w-row";
    app.append(row);
    expect(app.findSessionRow("s-row")).toBe(row);
    app.renderMessages = vi.fn();
    app.connectEvents = vi.fn();
    app.applyLoadedSession({ id: "s-row", title: "row" }, null, "");
    expect(app.dataset.activeWorkspaceId).toBe("w-row");
    app.sessionHistoryHasMore = true;
    app.sessionHistoryLoading = false;
    app.dataset.activeSessionId = "older";
    globalThis.fetch = vi.fn(async () => failJson("older failed"));
    await app.loadOlderSessionMessages();
    expect(app.setConnection).toHaveBeenCalledWith("err");
    app.sessionHistoryHasMore = true;
    app.sessionHistoryLoading = false;
    app.sessionHistoryCursor = "cursor";
    app.prependLoadedMessages = vi.fn();
    globalThis.fetch = vi.fn(async () => okJson({}));
    await app.loadOlderSessionMessages();
    expect(app.prependLoadedMessages).toHaveBeenCalledWith([]);
    expect(app.sessionHistoryCursor).toBe("");

    const group = document.createElement("div");
    group.dataset.workspaceGroup = "bare";
    app.append(group);
    expect(() => app.openActiveWorkspaceGroup("bare")).not.toThrow();
  });

  it("shows the empty shell when bootstrap has no session to load", async () => {
    const app = await connectPiApp();
    app.dataset.route = "workspace";
    const sessionMain = app.querySelector("main") || document.createElement("main");
    const emptyMain = document.createElement("main");
    const emptyWorkspace = document.createElement("span");
    sessionMain.dataset.main = "session";
    emptyMain.dataset.main = "empty";
    emptyMain.hidden = true;
    emptyWorkspace.dataset.emptyWorkspace = "";
    if (!sessionMain.isConnected) app.append(sessionMain);
    app.append(emptyMain, emptyWorkspace);
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: [] })
      : okJson({}));

    await app.bootstrapAPI();

    expect(sessionMain.hidden).toBe(true);
    expect(emptyMain.hidden).toBe(false);
    expect(emptyWorkspace.textContent).toBe("pi-web");
  });

  it("boots, refreshes, and applies workspace metadata", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    const activeLabel = document.createElement("span");
    const activeTitle = document.createElement("span");
    const tree = document.createElement("div");
    const git = document.createElement("span");
    activeLabel.dataset.activeWorkspace = "";
    activeTitle.dataset.activeSessionTitle = "";
    tree.className = "tree-list";
    git.dataset.gitStatus = "";
    app.append(activeLabel, activeTitle, tree, git);
    app.renderSlashCommands = vi.fn();
    app.route = vi.fn();
    app.connectEvents = vi.fn();
    app.updatePromptMeta = vi.fn();
    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/workspaces-null")) return okJson({});
      if (value.endsWith("/workspaces")) return okJson({ workspaces: [{
        id: "w1", name: "one", path: "/one", sessions: [{ id: "s1", title: "first", lastUsed: "now" }],
      }] });
      if (value.includes("/files")) return okJson({ files: [{ type: "file", name: "a.ts", depth: 0 }] });
      if (value.includes("/git/status")) return okJson({ branch: "main", dirty: 2 });
      if (value.includes("/commands")) return okJson({ commands: [{ command: "/x" }] });
      if (value.includes("/runtime-status")) return okJson({});
      if (value.includes("/sessions/s1")) return okJson({ session: { id: "s1", title: "first", workspaceId: "w1" } });
      if (value.includes("/version")) return okJson({});
      return okJson({});
    });

    await app.bootstrapAPI();
    await app.loadWorkspaceCommands("w1");
    app.apiConnected = false;
    await app.refreshWorkspaces();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    await app.refreshWorkspaces();
    globalThis.fetch = vi.fn(async () => failJson("refresh failed"));
    await app.refreshWorkspaces();
    await app.refreshTree();
    app.dataset.activeWorkspaceId = "";
    await app.refreshTree();
    await app.loadSession("missing");
    app.renderGitStatus({ branch: "dev", dirty: 1 });
    app.renderWorkspaceTree(null);
    app.renderedReplayEventSignatures = undefined;
    expect(app.shouldSkipRenderedReplayEvent({ type: "session.message", payload: { kind: "pi" } })).toBe(false);
    expect(app.shouldSkipRenderedReplayEvent(null)).toBe(false);
    expect(app.replayEventSignatureForMessage(null)).toBe("");
    expect(app.replayEventSignatureForMessage({ kind: "tool", tool: "bash", status: "running" })).toContain("tool.started");
    expect(app.replayEventSignature("session.message", { kind: "pi" })).toContain('"text":"undefined"');
    expect(app.replayEventSignature("", { kind: "pi" })).toBe("");
    expect(app.replayEventSignature("session.message", null)).toBe("");

    expect(app.apiConnected).toBe(true);
    expect(activeLabel.textContent).toBe("one");
    expect(activeTitle.textContent).toBe("first");
    expect(app.workspaceFiles?.[0]?.name).toBe("a.ts");
    expect(git.textContent).toBe("dev · 1 ✱");
    expect(app.renderSlashCommands).toHaveBeenCalledWith([{ command: "/x" }]);
    const row = document.createElement("button");
    row.dataset.session = "find-me";
    app.append(row);
    expect(app.findSessionRow("find-me")).toBe(row);
  });
});
