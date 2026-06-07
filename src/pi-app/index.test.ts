// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  deleteWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
}));

vi.mock("../shared/api/api", () => api);

describe("pi-app element", () => {
  beforeEach(async () => {
    document.body.innerHTML = "";
    api.deleteWorkspace.mockResolvedValue({});
    api.openWorkspace.mockResolvedValue({ id: "w1", path: "/repo" });
    globalThis.__PI_WEB_DISABLE_AUTOMATIC_STARTUP__ = true;
    globalThis.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = true;
    await import("./index");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function createApp(markup = "") {
    const app = document.createElement("pi-app");
    app.dataset.initialWorkspaces = JSON.stringify([{ id: "existing" }, { bad: true }]);
    app.innerHTML = markup;
    document.body.append(app);
    return app;
  }

  it("initializes once, reads workspaces, binds settings events, and disconnects plugins", async () => {
    const app = createApp(`
      <form data-settings-form></form>
      <select data-settings-scope></select>
      <select data-ui-language><option value="en">English</option><option value="ko">Korean</option></select>
      <select data-setting="defaultProvider"><option value="inherit">inherit</option></select>
      <select data-setting="defaultModel"><option value="inherit">inherit</option></select>
      <input data-oauth-input />
    `);
    app.saveSettingsForm = vi.fn();
    app.fillSettingsForm = vi.fn();
    app.fillModelControls = vi.fn();
    app.syncCustomSettingInput = vi.fn();
    app.sendOAuthInput = vi.fn();
    app.deactivateLoadedPlugins = vi.fn();

    app.connectedCallback();
    app.connectedCallback();
    app.querySelector("[data-settings-form]").dispatchEvent(new Event("submit"));
    app.querySelector("[data-settings-scope]").dispatchEvent(new Event("change"));
    app.querySelector("[data-ui-language]").value = "ko";
    app.querySelector("[data-ui-language]").dispatchEvent(new Event("change"));
    app.querySelector("[data-ui-language]").value = "missing";
    app.querySelector("[data-ui-language]").dispatchEvent(new Event("change"));
    app.querySelector("[data-setting='defaultProvider']").dispatchEvent(new Event("change"));
    app.querySelector("[data-setting='defaultModel']").dispatchEvent(new Event("change"));
    app.querySelector("[data-oauth-input]").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    app.querySelector("[data-oauth-input]").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    app.disconnectedCallback();

    expect(app.workspaceList).toEqual([{ id: "existing" }]);
    expect(app.saveSettingsForm).toHaveBeenCalledOnce();
    expect(app.fillSettingsForm).toHaveBeenCalledOnce();
    expect(app.fillModelControls).toHaveBeenCalledOnce();
    expect(app.syncCustomSettingInput).toHaveBeenCalledTimes(2);
    expect(app.sendOAuthInput).toHaveBeenCalledOnce();
    expect(app.deactivateLoadedPlugins).toHaveBeenCalledOnce();
  });

  it("handles malformed dataset, startup, clicks, and workspace events", async () => {
    const app = document.createElement("pi-app");
    app.dataset.initialWorkspaces = JSON.stringify({ id: "not-array" });
    app.innerHTML = `<button data-action="open-settings"></button><button data-action="open-settings"><svg><path></path></svg></button><button data-action="unknown"></button><button data-action=""></button>`;
    document.body.append(app);
    app.loadPlugins = vi.fn(async () => undefined);
    app.openSettingsModal = vi.fn();
    app.closeSettingsModal = vi.fn();
    app.saveAuthForm = vi.fn();
    app.logoutAuthProvider = vi.fn();
    app.startOAuthLogin = vi.fn();
    app.sendOAuthInput = vi.fn();
    app.logoutOAuthProvider = vi.fn();
    app.installPluginFromForm = vi.fn();
    app.checkPluginUpdates = vi.fn();
    app.refreshPlugins = vi.fn();
    app.updatePluginById = vi.fn();
    app.togglePlugin = vi.fn();
    app.uninstallPluginById = vi.fn();

    delete globalThis.__PI_WEB_DISABLE_AUTOMATIC_STARTUP__;
    delete globalThis.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__;
    await app.startApplication();
    globalThis.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = true;
    app.bound = false;
    app.connectedCallback();
    app.dataset.initialWorkspaces = "[";
    app.bound = false;
    app.connectedCallback();
    app.setConnection("err");
    app.querySelector("[data-action='open-settings']").click();
    app.querySelector("path").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.querySelector("[data-action='unknown']").click();
    app.querySelector("[data-action='']").click();
    app.handleAppClick({ target: document.createTextNode("text") } as unknown as MouseEvent);

    const actions = [
      ["close-settings"],
      ["save-auth-provider"],
      ["logout-auth-provider"],
      ["start-oauth-login"],
      ["send-oauth-input"],
      ["logout-oauth-provider"],
      ["install-plugin"],
      ["check-plugin-updates"],
      ["reload-plugins"],
      ["update-plugin", "plug", ""],
      ["update-plugin", "", ""],
      ["toggle-plugin", "plug", "true"],
      ["toggle-plugin", "plug", "false"],
      ["toggle-plugin", "", ""],
      ["uninstall-plugin", "plug", ""],
      ["uninstall-plugin", "", ""],
    ];
    for (const [action, pluginId, enabled] of actions) {
      const button = document.createElement("button");
      button.dataset.action = action;
      if (pluginId !== undefined) button.dataset.pluginId = pluginId;
      if (enabled !== undefined) button.dataset.pluginEnabled = enabled;
      app.append(button);
      button.click();
    }

    const opened = [];
    const deleted = [];
    app.addEventListener("pi-workspace:opened", (event) => opened.push(event.detail.workspace.id));
    app.addEventListener("pi-workspace:deleted", (event) => deleted.push(event.detail.workspaceId));
    app.workspaceList = [{ id: "old" }, { id: "w1" }];
    await app.openWorkspacePath("  /repo  ");
    await app.openWorkspacePath(" ");
    await app.deleteWorkspace("w1");
    await app.deleteWorkspace("");
    for (const method of ["newSession", "deleteWorkspaceSessions", "renameSession", "deleteSession"]) {
      const received = [];
      app.addEventListener("pi-session:new", (event) => received.push(event.detail.workspaceId));
      await app[method]("id1");
    }

    expect(app.loadPlugins).toHaveBeenCalledOnce();
    expect(app.dataset.connection).toBe("err");
    expect(app.openSettingsModal).toHaveBeenCalled();
    expect(app.closeSettingsModal).toHaveBeenCalled();
    expect(app.updatePluginById).toHaveBeenCalledWith("plug");
    expect(app.togglePlugin).toHaveBeenCalledWith("plug", true);
    expect(opened).toEqual(["w1"]);
    expect(deleted).toEqual(["w1"]);
    expect(app.speechInputAllowed()).toBe(false);
    expect(app.loadRuntimeStatus()).toBeUndefined();
  });

  it("delegates SVG child clicks to their action button", async () => {
    const app = createApp(`<button data-action="open-settings"><svg><path></path></svg></button>`);
    app.openSettingsModal = vi.fn();

    app.querySelector("path").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(app.openSettingsModal).toHaveBeenCalledOnce();
  });

  it("ignores plugin autoload errors and disabled autoload", async () => {
    const app = createApp();
    app.loadPlugins = vi.fn(async () => { throw new Error("offline"); });
    delete globalThis.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__;
    await expect(app.startApplication()).resolves.toBeUndefined();
    globalThis.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = true;
    await app.startApplication();
    expect(app.loadPlugins).toHaveBeenCalledOnce();
  });
});
