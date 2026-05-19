import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./pi-app.js";

const nativeFetch = globalThis.fetch;

describe("pi-app runtime", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <pi-app data-tree="on" data-sidebar="open">
        <section data-view="picker" hidden></section>
        <section class="app-body with-tree" data-view="workspace"><div class="sidebar-wrap"></div><main><div class="term-inner"></div></main><aside class="tree"></aside></section>
        <button class="sb-expand-btn"></button>
        <div class="prompt-region">
          <div class="slash-pop" hidden><div class="slash-list"><button class="slash-item selected" data-slash="/model">/model</button></div></div>
          <div class="attach-chips" hidden></div>
          <textarea class="prompt-textarea"></textarea>
          <button class="send-btn" disabled>send</button>
          <button class="attach-btn">attach</button>
          <input data-file-input type="file" />
          <div class="prompt-meta" data-prompt-meta></div>
        </div>
        <div class="settings-modal" data-settings-modal hidden>
          <form data-settings-form>
            <select name="scope" data-settings-scope><option value="project">project</option><option value="global">global</option></select>
            <span data-settings-path></span>
            <label class="settings-field"><input data-setting="defaultModel" /><small></small></label>
            <label class="settings-field"><select data-setting="defaultThinkingLevel"><option value="inherit">inherit</option><option value="high">high</option></select><small></small></label>
            <label class="settings-field"><input data-setting="theme" /><small></small></label>
            <label class="settings-field"><select data-setting="steeringMode"><option value="inherit">inherit</option><option value="all">all</option></select><small></small></label>
            <label class="settings-field"><select data-setting="followUpMode"><option value="inherit">inherit</option><option value="all">all</option></select><small></small></label>
            <label class="settings-field"><select data-setting="transport"><option value="inherit">inherit</option><option value="sse">sse</option></select><small></small></label>
            <label class="settings-field"><select data-setting="hideThinkingBlock"><option value="inherit">inherit</option><option value="true">true</option><option value="false">false</option></select><small></small></label>
            <label class="settings-field"><select data-setting="compaction.enabled"><option value="inherit">inherit</option><option value="true">true</option><option value="false">false</option></select><small></small></label>
            <label class="settings-field"><select data-setting="enableSkillCommands"><option value="inherit">inherit</option><option value="true">true</option><option value="false">false</option></select><small></small></label>
            <span data-settings-status></span>
            <button type="submit">save</button>
          </form>
        </div>
      </pi-app>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.PI_WEB_API_BASE;
    globalThis.fetch = nativeFetch;
  });

  it("enables send and shows slash commands as the prompt changes", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "/mo";
    prompt.dispatchEvent(new Event("input"));
    expect(app.querySelector(".send-btn").disabled).toBe(false);
    expect(app.querySelector(".slash-pop").hidden).toBe(false);
  });

  it("renders global and project slash commands", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
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
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("— |  —");
    app.updatePromptMeta({ model: "GPT-5.5", fiveHourQuota: 84, weeklyQuota: 14, currentBranch: "feature/ui" });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("GPT-5.5 | 5h 🔋(84%) | Week 🪫(14%) |  feature/ui");
    app.updatePromptMeta({ fiveHourQuota: 20, weeklyQuota: 21 });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("GPT-5.5 | 5h 🪫(20%) | Week 🔋(21%) |  feature/ui");
    app.runtimeStatus = {};
    app.updatePromptMeta({ model: "Claude", currentBranch: "main" });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("Claude |  main");
  });

  it("opens and saves workspace settings from the settings modal", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/settings") && options.method === "PUT") {
          return { settings: { project: JSON.parse(options.body).settings, effective: {}, paths: {} } };
        }
        if (String(url).endsWith("/settings")) {
          return {
            settings: {
              global: { theme: "dark" },
              project: { defaultModel: "gpt-5.5" },
              effective: { theme: "dark", defaultModel: "gpt-5.5", compaction: { enabled: true } },
              paths: { project: "/demo/.pi/settings.json", global: "/home/me/.pi/agent/settings.json" },
            },
          };
        }
        return { workspaces: [] };
      },
    }));
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-modal]").hidden).toBe(false);
    expect(app.querySelector("[data-settings-path]").textContent).toBe("/demo/.pi/settings.json");
    expect(app.querySelector("[data-setting='defaultModel']").value).toBe("gpt-5.5");
    expect(app.querySelector("[data-setting='theme']").placeholder).toBe("dark");

    app.querySelector("[data-setting='transport']").value = "sse";
    app.querySelector("[data-setting='compaction.enabled']").value = "false";
    await app.saveSettingsForm(new Event("submit"));
    const putCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(putCall[1].body)).toMatchObject({
      scope: "project",
      settings: { transport: "sse", compaction: { enabled: false } },
    });
  });

  it("opens session actions from an ellipsis menu", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const row = app.createSessionRow("w1", { id: "s1", title: "demo", lastUsed: "now" });
    app.append(row);
    const toggle = row.querySelector("[data-action='session-menu-toggle']");
    toggle.click();
    expect(row.querySelector(".session-menu").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the new session button below sessions created without reload", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.connectEvents = () => {};
    app.append(app.createWorkspaceGroup({ id: "w1", name: "demo", path: "/demo", sessions: [] }));
    app.activateCreatedSession("w1", { id: "s1", title: "new session", lastUsed: "now" });
    const rows = [...app.querySelectorAll("[data-workspace-group='w1'] .sessions > .session-row")];
    expect(rows.map((row) => row.dataset.session || row.dataset.action)).toEqual(["s1", "new-session"]);
    expect(rows.at(-1).classList.contains("new-session-row")).toBe(true);
  });

  it("deduplicates echoed user prompts and removes loading on response", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text: "hello" });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.appendMessage({ kind: "pi", text: "world" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("does not append new deltas to an old streaming row", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "old" });
    app.finalizeStreamingMessages();
    app.appendMessage({ kind: "user", text: "next" });
    app.appendDelta({ kind: "pi", delta: "new" });
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["old", "new"]);
  });

  it("starts a new stream segment after tool cards", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "before" });
    app.appendMessage({ kind: "tool", tool: "bash", status: "running" });
    app.appendDelta({ kind: "pi", delta: "after" });
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["before", "after"]);
  });

  it("shows loading again after a tool finishes while the session is still running", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.finishTool({ kind: "tool", tool: "read", status: "ok" });
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.setMode("idle");
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("keeps streaming deltas in one row while the session is running", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.setMode("running");
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["hello"]);
  });

  it("streams assistant deltas before the final message", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("hello");
  });

  it("reveals the live transcript immediately when sending from the empty session view", async () => {
    document.body.innerHTML = `
      <pi-app data-active-session-id="s1" data-session="empty">
        <main data-main="session" hidden><div class="term-inner"></div></main>
        <main data-main="empty"><div class="empty-shell">new session</div></main>
        <div class="prompt-region">
          <div class="slash-pop" hidden></div>
          <div class="attach-chips" hidden></div>
          <textarea class="prompt-textarea"></textarea>
          <button class="send-btn">send</button>
          <button class="attach-btn">attach</button>
          <input data-file-input type="file" />
        </div>
      </pi-app>
    `;
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.prompt.value = "hello";
    await app.submitPrompt();
    expect(app.querySelector("[data-main='session']").hidden).toBe(false);
    expect(app.querySelector("[data-main='empty']").hidden).toBe(true);
    expect(app.querySelector(".msg[data-kind='user'] .body").textContent).toBe("hello");
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
  });

  it("replaces streamed fallback choice JSON with clickable answer options", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    const text = "```json\n{\"type\":\"piweb_choice\",\"id\":\"runtime\",\"question\":\"Runtime?\",\"options\":[{\"label\":\"Go\",\"value\":\"go\"}],\"allowCustom\":false}\n```";
    app.appendDelta({ kind: "pi", delta: "질문입니다\n`" });
    app.appendDelta({ kind: "pi", delta: `\`\`json${text.slice(7)}` });
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("질문입니다\n");
    expect(app.querySelector(".msg.streaming .body").textContent).not.toContain("piweb_choice");
    expect(app.querySelector(".fallback-choice-list")).toBeNull();
    app.appendMessage({ kind: "pi", text: `질문입니다\n${text}` });
    expect(app.querySelector(".msg.streaming")).toBeNull();
    expect(app.querySelector(".fallback-choice-list strong").textContent).toBe("Runtime?");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).not.toContain("piweb_choice");
  });

  it("renders fallback choice blocks as clickable answer options", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendMessage({ kind: "pi", text: "Pick one\n```json\n{\"type\":\"piweb_choice\",\"id\":\"runtime\",\"question\":\"Runtime?\",\"options\":[{\"label\":\"Go\",\"value\":\"go\",\"description\":\"Use Go\"}],\"allowCustom\":true}\n```" });
    expect(app.querySelector(".fallback-choice-list strong").textContent).toBe("Runtime?");
    expect(app.querySelector("[data-action='fallback-choice'] .choice-label").textContent).toBe("Go");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("Pick one");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).not.toContain("piweb_choice");
  });

  it("disables already answered fallback choices on reload", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([
      { kind: "pi", text: "Pick one\n```json\n{\"type\":\"piweb_choice\",\"id\":\"runtime\",\"question\":\"Runtime?\",\"options\":[{\"label\":\"Go\",\"value\":\"go\"}],\"allowCustom\":true}\n```" },
      { kind: "user", text: "선택지 응답:\nid: runtime\nvalue: go" },
    ]);
    expect(app.querySelector(".fallback-choice-list").classList.contains("answered")).toBe(true);
    expect(app.querySelector("[data-action='fallback-choice']").disabled).toBe(true);
    expect(app.querySelector("[data-choice-custom-input]").disabled).toBe(true);
  });

  it("animates spinner frames by swapping glyphs", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendLoadingMessage();
    const spinner = app.querySelector(".spinner");
    const first = spinner.textContent;
    app.tickSpinners();
    expect(spinner.textContent).not.toBe(first);
  });

  it("switches between picker and workspace routes", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.route("picker");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(false);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(true);
    app.route("workspace");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(true);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(false);
  });
});
