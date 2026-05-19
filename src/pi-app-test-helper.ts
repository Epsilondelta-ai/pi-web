// @ts-nocheck
import { vi } from "vitest";
import "./pi-app";

const nativeFetch = globalThis.fetch;

function memoryStorage() {
  const items = new Map();
  return {
    clear: vi.fn(() => items.clear()),
    getItem: vi.fn((key) => items.get(String(key)) || null),
    removeItem: vi.fn((key) => items.delete(String(key))),
    setItem: vi.fn((key, value) => items.set(String(key), String(value))),
  };
}

export function installPiAppFixture() {
  vi.stubGlobal("localStorage", memoryStorage());
  document.body.innerHTML = `
    <pi-app data-tree="on" data-sidebar="open">
      <button
        class="hamburger"
        type="button"
        data-action="open-drawer"
        aria-label="open sidebar"
        aria-expanded="false"
      >≡</button>
      <section data-view="picker" hidden></section>
      <section class="app-body with-tree" data-view="workspace">
        <div class="sidebar-wrap">
          <div class="sb-footer">
            <button class="update-release" type="button" data-action="show-update-tip" hidden>
              New Version Released!
            </button>
            <span class="update-tip" data-update-tip hidden>Run <code>pi-web update</code>, then restart pi-web.</span>
          </div>
        </div>
        <main><div class="term-inner"></div></main>
        <aside class="tree"></aside>
        <div class="scrim" data-action="close-drawer"></div>
      </section>
      <button class="sb-expand-btn"></button>
      <div class="prompt-region">
        <div class="slash-pop" hidden>
          <div class="slash-list">
            <button class="slash-item selected" data-slash="/model">/model</button>
          </div>
        </div>
        <div class="attach-chips" hidden></div>
        <textarea class="prompt-textarea"></textarea>
        <button class="stop-btn" hidden>stop</button>
        <button class="send-btn" disabled>send</button>
        <button class="attach-btn">attach</button>
        <input data-file-input type="file" />
        <div class="prompt-meta" data-prompt-meta></div>
      </div>
      <div class="settings-modal" data-settings-modal hidden>
        <form data-settings-form>
          <select name="scope" data-settings-scope>
            <option value="project">project</option>
            <option value="global">global</option>
          </select>
          <span data-settings-path></span>
          ${settingsField("input", "defaultModel")}
          ${settingsSelect("defaultThinkingLevel", ["inherit", "high"])}
          ${settingsField("input", "theme")}
          ${settingsSelect("steeringMode", ["inherit", "all"])}
          ${settingsSelect("followUpMode", ["inherit", "all"])}
          ${settingsSelect("transport", ["inherit", "sse"])}
          ${settingsSelect("hideThinkingBlock", ["inherit", "true", "false"])}
          ${settingsSelect("compaction.enabled", ["inherit", "true", "false"])}
          ${settingsSelect("enableSkillCommands", ["inherit", "true", "false"])}
          <span data-settings-status></span>
          <button type="submit">save</button>
        </form>
      </div>
    </pi-app>
  `;
}

function settingsField(tag, name) {
  if (tag === "input") return `<label class="settings-field"><input data-setting="${name}" /><small></small></label>`;
  return "";
}

function settingsSelect(name, values) {
  const options = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  return `<label class="settings-field"><select data-setting="${name}">${options}</select><small></small></label>`;
}

export function installEmptySessionFixture() {
  vi.stubGlobal("localStorage", memoryStorage());
  document.body.innerHTML = `
    <pi-app data-active-session-id="s1" data-session="empty">
      <main data-main="session" hidden><div class="term-inner"></div></main>
      <main data-main="empty"><div class="empty-shell">new session</div></main>
      <div class="prompt-region">
        <div class="slash-pop" hidden></div>
        <div class="attach-chips" hidden></div>
        <textarea class="prompt-textarea"></textarea>
        <button class="stop-btn" hidden>stop</button>
        <button class="send-btn">send</button>
        <button class="attach-btn">attach</button>
        <input data-file-input type="file" />
      </div>
    </pi-app>
  `;
}

export async function connectPiApp() {
  const app = document.querySelector("pi-app");
  await customElements.whenDefined("pi-app");
  app.connectedCallback();
  return app;
}

export function cleanupPiAppFixture() {
  document.querySelectorAll("pi-app").forEach((app) => app.remove());
  localStorage?.clear?.();
  vi.restoreAllMocks();
  delete globalThis.PI_WEB_API_BASE;
  globalThis.fetch = nativeFetch;
  document.body.innerHTML = "";
}
