// @ts-nocheck
import { vi } from "vitest";
import "./index";

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
          <aside class="sidebar">
            <div class="sb-section">
              <div class="sb-head">
                <span>workspaces</span>
                <span class="sb-head-actions">
                  <button class="add" type="button" data-action="route-picker">+ open</button>
                  <button
                    class="refresh"
                    type="button"
                    data-action="refresh-workspaces"
                    title="refresh workspaces"
                    aria-label="refresh workspaces"
                  >↻</button>
                </span>
              </div>
            </div>
          </aside>
          <div class="sb-footer">
            <button class="update-release" type="button" data-action="show-update-tip" hidden>
              New Version Released!
            </button>
            <span class="update-tip" data-update-tip hidden>Run <code>pi-web update</code>, then restart pi-web.</span>
            <div class="sb-footer-status"><span class="status-dot"></span><span>connecting</span></div>
          </div>
        </div>
        <main data-main="session"><div class="term"><div class="term-inner"></div></div></main>
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
        <button class="mic-btn" data-action="toggle-speech-input" hidden>mic</button>
        <button class="send-btn" disabled>send</button>
        <button class="attach-btn">attach</button>
        <input data-file-input type="file" />
        <div class="prompt-meta" data-prompt-meta></div>
      </div>
      <div class="settings-modal" data-settings-modal hidden>
        <form data-settings-form>
          <select name="uiLanguage" data-ui-language>
            <option value="en">English</option>
            <option value="ko">한국어</option>
          </select>
          <strong data-i18n="settingsTitle">pi settings</strong>
          <select name="scope" data-settings-scope>
            <option value="project">project</option>
            <option value="global">global</option>
          </select>
          <span data-settings-path></span>
          <div data-auth-form>
            <select data-auth-provider></select>
            <input data-auth-api-key type="password" />
            <button type="button" data-action="save-auth-provider">save key</button>
            <button type="button" data-action="logout-auth-provider">logout</button>
            <span data-auth-status></span>
            <select data-oauth-provider></select>
            <a data-oauth-link href="#" hidden></a>
            <input data-oauth-input hidden />
            <button type="button" data-action="start-oauth-login">oauth</button>
            <button type="button" data-action="send-oauth-input" hidden>send oauth</button>
            <span data-oauth-status></span>
          </div>
          ${settingsSelect("defaultProvider", ["inherit", "custom"], true)}
          ${settingsSelect("defaultModel", ["inherit", "custom"], true)}
          ${settingsSelect("defaultThinkingLevel", ["inherit", "high"])}
          ${settingsSelect("compaction.enabled", ["inherit", "true", "false"])}
          ${settingsSelect("enableSkillCommands", ["inherit", "true", "false"])}
          ${settingsSelect("steeringMode", ["inherit", "all"])}
          ${settingsSelect("followUpMode", ["inherit", "all"])}
          ${settingsSelect("hideThinkingBlock", ["inherit", "true", "false"])}
          ${settingsCheckbox("readResponsesAloud")}
          ${settingsLanguageInput("voice.language")}
          ${settingsCheckbox("enableSpeechInput")}
          ${settingsLanguageInput("speechInput.language", true)}
          <details data-speech-advanced data-secure-context-only="https" hidden>
            ${settingsCheckbox("speechInput.useLocalWhisper")}
            ${settingsSelect("speechInput.whisperModel", [
              "tiny-q5",
              "tiny",
              "base-q5",
              "base",
              "small-q5",
              "small",
              "medium-q5",
              "medium",
              "large-v3-q5",
              "large-v3",
            ])}
            <span data-whisper-status></span>
            <button type="button" data-action="download-whisper-model">download model</button>
            <button type="button" data-action="delete-whisper-model">delete model</button>
          </details>
          ${settingsSelect("warnings.anthropicExtraUsage", ["inherit", "true", "false"])}
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

function settingsLanguageInput(name, secure = false) {
  const id = `language-options-${name.replace(/[^a-z0-9_-]/gi, "-")}`;
  const secureOnly = secure ? " data-secure-context-only=\"https\" hidden" : "";
  return `<label class="settings-field"${secureOnly}><input data-setting="${name}" list="${id}" /><datalist id="${id}"><option value="System default" label="system" data-language-value="system"></option><option value="English" label="en" data-language-value="en"></option><option value="한국어(Korean)" label="ko" data-language-value="ko"></option><option value="日本語(Japanese)" label="ja" data-language-value="ja"></option><option value="中文(Chinese)" label="zh" data-language-value="zh"></option></datalist><small></small></label>`;
}

function settingsSelect(name, values, custom = false, secure = false) {
  const options = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  const customInput = custom ? `<input data-custom-setting="${name}" hidden />` : "";
  const secureOnly = secure ? " data-secure-context-only=\"https\" hidden" : "";
  return `<label class="settings-field"${secureOnly}><select data-setting="${name}">${options}</select>${customInput}<small></small></label>`;
}

function settingsCheckbox(name) {
  const secureOnly = name === "enableSpeechInput" ? " data-secure-context-only=\"https\" hidden" : "";
  return `<label class="settings-field"${secureOnly}><span class="settings-checkbox"><input type="checkbox" data-setting="${name}" /> <span>Enabled</span></span><small></small></label>`;
}

export function installEmptySessionFixture() {
  vi.stubGlobal("localStorage", memoryStorage());
  document.body.innerHTML = `
    <pi-app data-active-session-id="s1" data-session="empty">
      <main data-main="session" hidden><div class="term"><div class="term-inner"></div></div></main>
      <main data-main="empty"><div class="empty-shell">new session</div></main>
      <div class="prompt-region">
        <div class="slash-pop" hidden></div>
        <div class="attach-chips" hidden></div>
        <textarea class="prompt-textarea"></textarea>
        <button class="stop-btn" hidden>stop</button>
        <button class="mic-btn" data-action="toggle-speech-input" hidden>mic</button>
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
