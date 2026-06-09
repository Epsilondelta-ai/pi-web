// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  apiBase: vi.fn(() => "http://backend.test"),
  connectPluginEvents: vi.fn(),
  getPluginUpdates: vi.fn(),
  getPlugins: vi.fn(),
  installPlugin: vi.fn(),
  publishPluginEvent: vi.fn(),
  reloadPlugins: vi.fn(),
  setPluginEnabled: vi.fn(),
  uninstallPlugin: vi.fn(),
  updatePlugin: vi.fn(),
}));

vi.mock("../../shared/api/api", () => api);

import packageJson from "../../../package.json";
import { pluginMethods } from "./plugin-methods";

function hostWithList() {
  const host = document.createElement("section");
  host.innerHTML = `
    <div data-plugin-list></div>
    <select data-plugin-source><option value="github">github</option><option value="local">local</option></select>
    <input data-plugin-path />
  `;
  Object.assign(host, pluginMethods);
  return host;
}

describe("pluginMethods", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.values(api).forEach((mock) => mock.mockReset?.());
    api.apiBase.mockReturnValue("http://backend.test");
    api.getPlugins.mockResolvedValue({ plugins: [] });
    api.connectPluginEvents.mockReturnValue(vi.fn());
    api.getPluginUpdates.mockResolvedValue({ plugins: [] });
    api.installPlugin.mockResolvedValue({});
    api.publishPluginEvent.mockResolvedValue({});
    api.reloadPlugins.mockResolvedValue({});
    api.setPluginEnabled.mockResolvedValue({});
    api.uninstallPlugin.mockResolvedValue({});
    api.updatePlugin.mockResolvedValue({});
  });

  afterEach(() => {
    piWeb?.listSubjects().forEach((name) => piWeb.deleteSubject(name));
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders empty and missing plugin lists", async () => {
    const host = document.createElement("section");
    Object.assign(host, pluginMethods);
    api.getPlugins.mockResolvedValueOnce({});
    await host.loadPlugins();

    const listed = hostWithList();
    await listed.loadPlugins();

    expect(listed.querySelector("[data-plugin-list]").textContent).toBe("No plugins installed.");
  });

  it("uses the default dynamic importer", async () => {
    const host = hostWithList();
    api.apiBase.mockReturnValue("data:text/javascript,export default () => {}//");
    api.getPlugins.mockResolvedValue({ plugins: [{ id: "inline", entry: "index.js" }] });

    await host.loadPlugins();

    expect(host.loadedPlugins.has("inline")).toBe(true);
  });

  it("loads enabled plugins, skips disabled and loaded plugins, and reports failures", async () => {
    const host = hostWithList();
    const activated = [];
    host.activePlugins = new Map([["already", {}]]);
    host.importPluginModule = vi.fn(async (url) => {
      if (url.includes("default-plugin")) return { default: (context) => activated.push(["default", context.plugin.id]) };
      if (url.includes("activate-plugin")) return { activate: (context) => activated.push(["activate", context.plugin.id]) };
      throw new Error("bad plugin");
    });
    api.getPlugins.mockResolvedValue({
      plugins: [
        { id: "disabled", entry: "index.js", enabled: false },
        { id: "already", entry: "index.js" },
        { id: "default-plugin", name: "Default", version: "1", cacheKey: "sha", entry: "main.js" },
        { id: "activate-plugin", entry: "entry.js" },
        { id: "broken", name: "Broken", entry: "broken.js" },
      ],
    });

    await host.loadPlugins();

    expect(host.importPluginModule).toHaveBeenCalledWith("http://backend.test/api/plugins/default-plugin/assets/main.js?v=sha");
    expect(activated).toEqual([["default", "default-plugin"], ["activate", "activate-plugin"]]);
    expect(host.loadedPlugins.has("default-plugin")).toBe(true);
    expect(host.querySelector("[data-plugin-id='disabled'] [data-action='toggle-plugin']").textContent).toBe("enable");
    expect(host.querySelector("[data-plugin-id='default-plugin'] [data-plugin-version]").textContent).toBe("default-plugin · 1");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Broken"), expect.any(Error));
  });

  it("deactivates loaded plugins through returned cleanup and module hooks", async () => {
    const host = hostWithList();
    const cleanup = vi.fn();
    const objectDeactivate = vi.fn();
    const objectDispose = vi.fn();
    const moduleDeactivate = vi.fn();
    host.importPluginModule = vi.fn(async (url) => {
      if (url.includes("cleanup-plugin")) return { default: () => cleanup };
      if (url.includes("object-deactivate")) return { default: () => ({ deactivate: objectDeactivate }) };
      if (url.includes("object-dispose")) return { default: () => ({ dispose: objectDispose }) };
      if (url.includes("failing-cleanup")) return { default: () => () => { throw new Error("cleanup failed"); } };
      if (url.includes("empty-plugin")) return {};
      return { activate: () => undefined, deactivate: moduleDeactivate };
    });
    api.getPlugins.mockResolvedValue({
      plugins: [
        { id: "cleanup-plugin", entry: "index.js" },
        { id: "object-deactivate", entry: "index.js" },
        { id: "object-dispose", entry: "index.js" },
        { id: "failing-cleanup", entry: "index.js" },
        { id: "empty-plugin", entry: "index.js" },
        { id: "module-plugin", entry: "index.js" },
      ],
    });

    await host.loadPlugins();
    await host.deactivateLoadedPlugin("missing");
    await host.deactivateLoadedPlugin("cleanup-plugin");
    await host.deactivateLoadedPlugins();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(objectDeactivate).toHaveBeenCalledOnce();
    expect(objectDispose).toHaveBeenCalledOnce();
    expect(moduleDeactivate).toHaveBeenCalledWith(expect.objectContaining({ plugin: expect.objectContaining({ id: "module-plugin" }) }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("failing-cleanup"), expect.any(Error));
    expect(host.loadedPlugins.size).toBe(0);
    expect(host.activePlugins.size).toBe(0);
  });

  it("provides plugin context API helpers and subject registry", async () => {
    const host = hostWithList();
    host.workspaceList = [{ id: "w1" }];
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    await context.api.get("/one");
    await context.api.post("/two", { ok: true });
    await context.backend("run", { ok: true });
    await context.backendStream("stream", { ok: true });
    await context.events.publish("active-state", "active.start", { sessionId: "s1" });
    const cleanupEvents = context.events.subscribe("active-state", ["active.start"], () => undefined);
    cleanupEvents();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://backend.test/api/plugins/p/backend/stream",
      expect.objectContaining({
        method: "POST",
        headers: { "Accept": "text/event-stream", "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = vi.fn(async () => ({ ok: false, text: async () => "nope" }));

    await expect(context.api.get("/fail")).rejects.toThrow("nope");
    await expect(context.backendStream("stream", { ok: false })).rejects.toThrow("nope");
    expect(context.app).toBe(host);
    expect(context.initialWorkspaces).toEqual([{ id: "w1" }]);
    expect(api.publishPluginEvent).toHaveBeenCalledWith("p", "active-state", "active.start", { sessionId: "s1" });
    expect(api.connectPluginEvents).toHaveBeenCalledWith("p", "active-state", expect.any(Function), ["active.start"]);
    expect(typeof context.rxjs.BehaviorSubject).toBe("function");
    expect(piWeb.version).toBe(packageJson.version);
    const first = piWeb.behaviorSubject("core.language", "en");
    const second = piWeb.behaviorSubject("core.language", "ko");
    const closed = piWeb.subject("plugin.p.closed");
    const replay = piWeb.replaySubject("plugin.p.replayed", 2);
    const asyncSubject = piWeb.asyncSubject("plugin.p.async");
    first.next("ja");
    expect(first).toBe(second);
    expect(second.value).toBe("ja");
    expect(piWeb.hasSubject("plugin.p.closed")).toBe(true);
    expect(piWeb.listSubjects()).toContain("core.language");
    expect(() => piWeb.subject("core.language")).toThrow("already exists as behaviorSubject");
    expect(closed).toBe(piWeb.subject("plugin.p.closed"));
    expect(replay).toBe(piWeb.replaySubject("plugin.p.replayed"));
    expect(asyncSubject).toBe(piWeb.asyncSubject("plugin.p.async"));
    piWeb.completeSubject("plugin.p.closed");
    piWeb.completeSubject("plugin.p.missing");
    expect(piWeb.deleteSubject("plugin.p.closed")).toBe(true);
    expect(piWeb.deleteSubject("plugin.p.closed")).toBe(false);
  });

  it("mounts plugin surfaces into new and existing roots", () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"><div data-plugin-composer-root hidden></div></section>`;
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const chat = document.createElement("section");
    const composer = document.createElement("section");
    const newComposer = document.createElement("section");
    const cleanupChat = context.mount.chat(chat);
    const cleanupComposer = context.mount.composer(composer);
    cleanupComposer();
    host.querySelector("[data-plugin-composer-root]").remove();
    const cleanupNewComposer = context.mount.composer(newComposer);

    expect(host.querySelector(".app-body > [data-plugin-chat-root]")).toBe(chat);
    expect(host.querySelector(".app-body > [data-plugin-composer-root]")).toBe(newComposer);
    cleanupChat();
    cleanupNewComposer();
    expect(host.querySelector("[data-plugin-chat-root]")).toBeNull();
    expect(host.querySelector("[data-plugin-composer-root]")).toBeNull();
  });

  it("requires an app body when plugins create mount roots", () => {
    const host = hostWithList();
    const context = host.pluginContext({ id: "p", entry: "index.js" });

    expect(() => context.mount.chat(document.createElement("section"))).toThrow("missing .app-body");
  });

  it("refreshes, installs, toggles, updates, and removes plugins", async () => {
    const host = hostWithList();
    host.loadPlugins = vi.fn();
    const source = host.querySelector("[data-plugin-source]");
    const input = host.querySelector("[data-plugin-path]");

    await host.refreshPlugins();
    await host.installPluginFromForm();
    source.value = "local";
    await host.installPluginFromForm();
    input.value = "/repo/plugin";
    await host.installPluginFromForm();
    source.value = "github";
    input.value = "owner/repo";
    await host.installPluginFromForm();
    await host.togglePlugin("", true);
    await host.togglePlugin("plug", true);
    await host.togglePlugin("plug", false);
    await host.updatePluginById("");
    await host.updatePluginById("plug");
    await host.uninstallPluginById("");
    await host.uninstallPluginById("plug");

    expect(api.reloadPlugins).toHaveBeenCalledOnce();
    expect(api.installPlugin).toHaveBeenCalledWith("local", "/repo/plugin");
    expect(api.installPlugin).toHaveBeenCalledWith("github", "owner/repo");
    expect(api.setPluginEnabled).toHaveBeenCalledWith("plug", false);
    expect(api.setPluginEnabled).toHaveBeenCalledWith("plug", true);
    expect(api.updatePlugin).toHaveBeenCalledWith("plug");
    expect(api.uninstallPlugin).toHaveBeenCalledWith("plug");
    expect(host.loadPlugins).toHaveBeenCalledTimes(7);
  });

  it("keeps an active plugin loaded when its update request fails", async () => {
    const host = hostWithList();
    host.deactivateLoadedPlugin = vi.fn();
    host.loadPlugins = vi.fn();
    api.updatePlugin.mockRejectedValueOnce(new Error("offline"));

    await expect(host.updatePluginById("plug")).rejects.toThrow("offline");

    expect(host.deactivateLoadedPlugin).not.toHaveBeenCalled();
    expect(host.loadPlugins).not.toHaveBeenCalled();
  });

  it("checks plugin updates and shows row actions", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockResolvedValueOnce({
      plugins: [{ id: "chat", currentVersion: "1.0.0", latestVersion: "1.1.0", updateAvailable: true }],
    });

    await host.loadPlugins();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0 → 1.1.0 · update available");
    expect(host.querySelector("[data-action='update-plugin']").hidden).toBe(false);
  });

  it("handles plugin update failures and sparse update payloads", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ plugins: [{ id: "chat", currentVersion: "1.0.0", error: "clone failed" }] })
      .mockResolvedValueOnce({ plugins: [{ id: "missing", updateAvailable: true }, { id: "chat", updateAvailable: false }] })
      .mockResolvedValueOnce({ plugins: undefined })
      .mockResolvedValueOnce({ plugins: [{ id: "chat", latestVersion: "1.2.0", updateAvailable: true }] })
      .mockResolvedValueOnce({ plugins: [{ id: "chat", error: "clone failed" }] });

    await host.loadPlugins();
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0 · update check failed");
    host.querySelector("[data-plugin-version]").textContent = "";
    host.querySelector("[data-plugin-version]").dataset.baseText = "";
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-version]").title).toBe("clone failed");
    host.querySelector("[data-plugin-version]").textContent = "chat · 1.0.0";
    host.querySelector("[data-plugin-version]").dataset.baseText = "";
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0");
    await host.checkPluginUpdates();
    host.querySelector("[data-action='update-plugin']").remove();
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · dev → 1.2.0 · update available");
    host.querySelector("[data-plugin-version]").remove();
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-id='chat']")).not.toBeNull();
  });
});
