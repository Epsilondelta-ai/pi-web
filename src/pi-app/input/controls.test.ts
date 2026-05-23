// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_DRAFT_STORAGE_KEY } from "../constants";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("pi-app controls", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("enables send and shows slash commands as the prompt changes", async () => {
    const app = await connectPiApp();
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "/mo";
    prompt.dispatchEvent(new Event("input"));
    expect(app.querySelector(".send-btn").disabled).toBe(false);
    expect(app.querySelector(".slash-pop").hidden).toBe(false);
  });

  it("toggles voice input and writes speech recognition text into the prompt", async () => {
    vi.useFakeTimers();
    const instances = [];
    class MockSpeechRecognition {
      constructor() {
        instances.push(this);
      }
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn(() => this.onend?.());
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.speechLanguage = "ko-KR";
    app.syncSpeechInputControls();
    const mic = app.querySelector(".mic-btn");
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "기존";

    mic.click();
    const recognition = instances[0];
    expect(recognition.lang).toBe("ko-KR");
    expect(mic.classList.contains("listening")).toBe(true);
    recognition.onresult({
      resultIndex: 0,
      results: [{ 0: { transcript: "음성" }, isFinal: true }],
    });
    recognition.onresult({
      resultIndex: 0,
      results: [
        { 0: { transcript: "음성" }, isFinal: true },
        { 0: { transcript: " 입력" }, isFinal: false },
      ],
    });
    expect(prompt.value).toBe("기존 음성 입력");
    recognition.onresult({
      resultIndex: 0,
      results: [
        { 0: { transcript: "PR" }, isFinal: true },
        { 0: { transcript: "PR 올려" }, isFinal: false },
      ],
    });
    expect(prompt.value).toBe("기존 PR 올려");
    expect(app.querySelector(".send-btn").disabled).toBe(false);

    mic.click();
    expect(recognition.stop).toHaveBeenCalled();
    expect(mic.classList.contains("listening")).toBe(false);
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    vi.useRealTimers();
  });

  it("restores unsent prompt text and clears the draft on send", async () => {
    const app = await connectPiApp();
    const prompt = app.querySelector(".prompt-textarea");
    localStorage.setItem(PROMPT_DRAFT_STORAGE_KEY, "saved draft");
    app.restorePromptDraft();
    expect(prompt.value).toBe("saved draft");

    prompt.value = "new draft";
    prompt.dispatchEvent(new Event("input"));
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBe("new draft");

    prompt.value = "";
    prompt.dispatchEvent(new Event("input"));
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBeNull();

    prompt.value = "send me";
    prompt.dispatchEvent(new Event("input"));
    app.apiConnected = false;
    app.sendButton.click();
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBeNull();

    app.prompt = null;
    expect(() => app.restorePromptDraft()).not.toThrow();
    expect(() => app.savePromptDraft()).not.toThrow();
  });

  it("keeps send and stop as separate running controls", async () => {
    const app = await connectPiApp();
    const send = app.querySelector(".send-btn");
    const stop = app.querySelector(".stop-btn");

    app.setMode("running");
    expect(stop.hidden).toBe(false);
    expect(send.textContent).toBe("send");
    expect(send.disabled).toBe(true);

    app.prompt.value = "one more thing";
    app.updatePrompt();
    expect(send.disabled).toBe(false);

    app.setMode("idle");
    expect(stop.hidden).toBe(true);
  });

  it("renders global and project slash commands", async () => {
    const app = await connectPiApp();
    app.renderSlashCommands([
      { command: "/team", description: "global team", source: "extension", scope: "global" },
      { command: "/review", description: "project review", source: "prompt", scope: "project" },
    ]);
    const items = [...app.querySelectorAll(".slash-item")];
    expect(items.map((item) => item.dataset.slash)).toEqual(["/team", "/review"]);
    expect(items[0].querySelector(".sl-scope").textContent).toBe("global");
    expect(items[1].querySelector(".sl-scope").textContent).toBe("project");
  });

  it("renders the compact prompt status line from runtime status", async () => {
    const app = await connectPiApp();
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("— | —");
    app.updatePromptMeta({
      model: "GPT-5.5",
      fiveHourQuota: 84,
      weeklyQuota: 14,
      currentBranch: "feature/ui",
    });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe(
      "GPT-5.5 | 5h (84%) | Week (14%) | feature/ui",
    );
    expect(app.querySelector(".prompt-meta-battery-full svg")).not.toBeNull();
    expect(app.querySelector(".prompt-meta-battery-low svg")).not.toBeNull();
    expect(app.querySelector(".prompt-meta-branch svg")).not.toBeNull();
    app.updatePromptMeta({ fiveHourQuota: 20, weeklyQuota: 21 });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe(
      "GPT-5.5 | 5h (20%) | Week (21%) | feature/ui",
    );
    expect(app.querySelector(".prompt-meta-battery-low svg")).not.toBeNull();
    app.runtimeStatus = {};
    app.updatePromptMeta({ model: "Claude", currentBranch: "main" });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("Claude | main");
  });

  it("opens and saves workspace settings from the settings modal", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/auth/providers")) {
          return { providers: [{ id: "anthropic", name: "Anthropic", configured: false }], path: "/home/me/.pi/agent/auth.json" };
        }
        if (String(url).endsWith("/auth/oauth/providers")) {
          return { providers: [{ id: "openai-codex", name: "ChatGPT Plus/Pro", configured: false }] };
        }
        if (String(url).endsWith("/models")) {
          return { providers: [{ id: "zai", models: [{ id: "gpt-5.5", provider: "zai" }] }] };
        }
        if (String(url).endsWith("/auth/oauth/start")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "waiting", authUrl: "https://login.test", progress: [] } };
        }
        if (String(url).endsWith("/auth/oauth/sessions/oauth-1/input")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "success", progress: [] } };
        }
        if (String(url).endsWith("/auth/oauth/sessions/oauth-1")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "success", progress: [] } };
        }
        if (String(url).endsWith("/auth/api-key")) {
          return { provider: { id: "anthropic", name: "Anthropic", configured: true, source: "api_key" } };
        }
        if (String(url).endsWith("/settings") && options.method === "PUT") {
          return { settings: { project: JSON.parse(options.body).settings, effective: {}, paths: {} } };
        }
        if (String(url).endsWith("/settings")) {
          return {
            settings: {
              global: { theme: "dark" },
              project: { defaultProvider: "zai", defaultModel: "gpt-5.5" },
              effective: {
                theme: "dark",
                defaultProvider: "zai",
                defaultModel: "gpt-5.5",
                compaction: { enabled: true },
                readResponsesAloud: true,
                enableSpeechInput: true,
                speechLanguage: "ko-KR",
              },
              paths: { project: "/demo/.pi/settings.json", global: "/home/me/.pi/agent/settings.json" },
            },
          };
        }
        return { workspaces: [] };
      },
    }));
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-modal]").hidden).toBe(false);
    expect(app.querySelector("[data-settings-path]").textContent).toBe("/demo/.pi/settings.json");
    expect(app.querySelector("[data-setting='defaultProvider']").value).toBe("zai");
    expect(app.querySelector("[data-setting='defaultModel']").value).toBe("gpt-5.5");
    expect(app.querySelector("[data-setting='readResponsesAloud']").type).toBe("checkbox");
    expect(app.querySelector("[data-setting='readResponsesAloud']").checked).toBe(true);
    expect(app.querySelector("[data-setting='enableSpeechInput']").checked).toBe(true);
    expect(app.querySelector("[data-setting='speechLanguage']").value).toBe("ko-KR");
    expect(app.readResponsesAloud).toBe(true);
    expect(app.enableSpeechInput).toBe(true);
    expect(app.querySelector(".mic-btn").hidden).toBe(false);
    expect(app.speechLanguage).toBe("ko-KR");
    expect(app.querySelector("[data-setting='theme']")).toBeNull();
    expect(app.querySelector("[data-setting='transport']")).toBeNull();
    expect(app.querySelector("[data-auth-provider]").value).toBe("anthropic");
    expect(app.querySelector("[data-oauth-provider]").value).toBe("openai-codex");

    await app.startOAuthLogin();
    expect(app.querySelector("[data-oauth-link]").href).toBe("https://login.test/");
    app.querySelector("[data-oauth-input]").value = "code";
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("OAuth login saved");

    app.querySelector("[data-auth-api-key]").value = "sk-test";
    await app.saveAuthForm(new Event("submit"));
    const authCall = globalThis.fetch.mock.calls.find(([url]) => String(url).endsWith("/auth/api-key"));
    expect(JSON.parse(authCall[1].body)).toEqual({ provider: "anthropic", apiKey: "sk-test" });
    expect(app.querySelector("[data-auth-api-key]").value).toBe("");

    app.querySelector("[data-setting='defaultModel']").value = "custom";
    app.querySelector("[data-setting='defaultModel']").dispatchEvent(new Event("change"));
    app.querySelector("[data-custom-setting='defaultModel']").value = "my-model";
    app.querySelector("[data-setting='compaction.enabled']").value = "false";
    app.querySelector("[data-setting='readResponsesAloud']").checked = true;
    app.querySelector("[data-setting='enableSpeechInput']").checked = true;
    app.querySelector("[data-setting='speechLanguage']").value = "ja-JP";
    await app.saveSettingsForm(new Event("submit"));
    const putCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(putCall[1].body)).toMatchObject({
      scope: "project",
      settings: { defaultModel: "my-model", compaction: { enabled: false }, readResponsesAloud: true, enableSpeechInput: true, speechLanguage: "ja-JP" },
    });
  });

  it("hides voice input setting and skips saving it outside https", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/auth/providers")) return { providers: [] };
        if (String(url).endsWith("/auth/oauth/providers")) return { providers: [] };
        if (String(url).endsWith("/models")) return { providers: [] };
        if (String(url).endsWith("/settings") && options.method === "PUT") {
          return { settings: { project: JSON.parse(options.body).settings, effective: {}, paths: {} } };
        }
        if (String(url).endsWith("/settings")) {
          return {
            settings: {
              global: {},
              project: {},
              effective: { enableSpeechInput: true, speechLanguage: "ko-KR" },
              paths: {},
            },
          };
        }
        return {};
      },
    }));
    const app = await connectPiApp();
    app.speechInputAllowed = () => false;
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.openSettingsModal();
    const field = app.querySelector("[data-setting='enableSpeechInput']").closest(".settings-field");
    expect(field.hidden).toBe(true);
    expect(app.enableSpeechInput).toBe(false);
    expect(app.querySelector(".mic-btn").hidden).toBe(true);

    await app.saveSettingsForm(new Event("submit"));
    const putCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(putCall[1].body).settings).not.toHaveProperty("enableSpeechInput");
  });

  it("sets app height from the visual viewport for mobile browser chrome", async () => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 567,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    installPiAppFixture();
    const app = await connectPiApp();
    expect(app.style.getPropertyValue("--app-viewport-height")).toBe("567px");
  });

  it("toggles the mobile sidebar drawer from the hamburger button", async () => {
    const app = await connectPiApp();
    const hamburger = app.querySelector(".hamburger");
    const body = app.querySelector(".app-body");
    hamburger.click();
    expect(body.classList.contains("drawer-open")).toBe(true);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");
    expect(hamburger.getAttribute("aria-label")).toBe("close sidebar");
    hamburger.click();
    expect(body.classList.contains("drawer-open")).toBe(false);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
    expect(hamburger.getAttribute("aria-label")).toBe("open sidebar");
  });

  it("renders a terminal dot spinner and advances its frame", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    const spinner = app.querySelector(".spinner");
    expect(spinner.children).toHaveLength(6);
    app.tickSpinners();
    expect(spinner.dataset.frame).toBe("1");
  });

  it("switches between picker and workspace routes", async () => {
    const app = await connectPiApp();
    app.route("picker");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(false);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(true);
    app.route("workspace");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(true);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(false);
  });

  it("closes the file tree when clicking outside it", async () => {
    const app = await connectPiApp();
    const body = app.querySelector(".app-body");
    const tree = app.querySelector(".tree");
    const main = app.querySelector("main");

    app.toggleTree(true);
    tree.click();
    expect(app.dataset.tree).toBe("on");

    main.click();
    expect(app.dataset.tree).toBe("off");
    expect(body.classList.contains("tree-open")).toBe(false);
    expect(tree.hidden).toBe(true);
  });

  it("keeps the file tree open when an inside click removes its target", async () => {
    const app = await connectPiApp();
    const tree = app.querySelector(".tree");
    const removable = document.createElement("button");
    removable.type = "button";
    removable.addEventListener("click", () => removable.remove());
    tree.append(removable);

    app.toggleTree(true);
    removable.click();

    expect(app.dataset.tree).toBe("on");
    expect(tree.hidden).toBe(false);
  });

  it("refreshes workspaces from the sidebar refresh button", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        workspaces: [{ id: "w1", name: "demo", path: "/demo", sessionCount: 0, sessions: [] }],
      }),
    }));
    const app = await connectPiApp();
    app.apiConnected = true;

    await app.refreshWorkspaces();

    expect(globalThis.fetch).toHaveBeenCalledWith("http://backend.test/api/workspaces", expect.any(Object));
    expect(app.querySelector("[data-workspace-group='w1'] .label").textContent).toBe("demo");
  });
});
