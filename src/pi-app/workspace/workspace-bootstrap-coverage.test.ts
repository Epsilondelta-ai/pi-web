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
    app.querySelector("[data-action='refresh-workspaces']")?.remove();
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/workspaces")
      ? okJson({ workspaces: [{ id: "stored", name: "stored", path: "/stored", sessions: [{ id: "other", title: "other" }] }] })
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

    const group = document.createElement("div");
    group.dataset.workspaceGroup = "bare";
    app.append(group);
    expect(() => app.openActiveWorkspaceGroup("bare")).not.toThrow();
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
