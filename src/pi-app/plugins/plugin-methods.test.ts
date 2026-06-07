// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ apiBase: vi.fn(() => "http://backend.test"), getPluginUpdates: vi.fn(), getPlugins: vi.fn(), installPlugin: vi.fn(), reloadPlugins: vi.fn(), setPluginEnabled: vi.fn(), uninstallPlugin: vi.fn(), updatePlugin: vi.fn() }));
vi.mock("../../shared/api/api", () => api);
import packageJson from "../../../package.json";
import { pluginMethods } from "./plugin-methods";

function hostWithList() {
  const host = document.createElement("section");
  host.innerHTML = `<div data-plugin-list></div><select data-plugin-source><option value="github">github</option><option value="local">local</option></select><input data-plugin-path />`;
  Object.assign(host, pluginMethods);
  return host;
}

describe("pluginMethods", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.values(api).forEach((mock) => mock.mockReset?.());
    api.apiBase.mockReturnValue("http://backend.test");
    api.getPlugins.mockResolvedValue({ plugins: [] });
    api.getPluginUpdates.mockResolvedValue({ plugins: [] });
    api.installPlugin.mockResolvedValue({});
    api.reloadPlugins.mockResolvedValue({});
    api.setPluginEnabled.mockResolvedValue({});
    api.uninstallPlugin.mockResolvedValue({});
    api.updatePlugin.mockResolvedValue({});
  });
  afterEach(() => { piWeb?.listSubjects().forEach((name) => piWeb.deleteSubject(name)); vi.restoreAllMocks(); });

  it("renders empty plugin list", async () => {
    const host = hostWithList();
    await host.loadPlugins();
    expect(host.querySelector("[data-plugin-list]").textContent).toBe("No plugins installed.");
  });

  it("loads plugins and exposes context", async () => {
    const host = hostWithList();
    host.workspaceList = [{ id: "w1", name: "workspace" }];
    host.importPluginModule = vi.fn(async () => ({ default: (context) => { context.api.get("/one"); context.backend("run", {}); expect(context.initialWorkspaces).toEqual(host.workspaceList); } }));
    api.getPlugins.mockResolvedValue({ plugins: [{ id: "plug", version: "1", cacheKey: "sha", entry: "main.js" }] });
    await host.loadPlugins();
    expect(host.importPluginModule).toHaveBeenCalledWith("http://backend.test/api/plugins/plug/assets/main.js?v=sha");
    expect(host.loadedPlugins.has("plug")).toBe(true);
    expect(piWeb.version).toBe(packageJson.version);
  });

  it("mounts plugin surfaces", () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"></section>`;
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const chat = document.createElement("section");
    const cleanup = context.mount.chat(chat);
    expect(host.querySelector(".app-body > [data-plugin-chat-root]")).toBe(chat);
    cleanup();
    expect(host.querySelector("[data-plugin-chat-root]")).toBeNull();
  });

  it("manages plugins", async () => {
    const host = hostWithList();
    host.loadPlugins = vi.fn();
    host.querySelector("[data-plugin-path]").value = "owner/repo";
    await host.installPluginFromForm();
    await host.refreshPlugins();
    await host.togglePlugin("plug", true);
    await host.updatePluginById("plug");
    await host.uninstallPluginById("plug");
    expect(api.installPlugin).toHaveBeenCalledWith("github", "owner/repo");
    expect(api.reloadPlugins).toHaveBeenCalledOnce();
    expect(api.setPluginEnabled).toHaveBeenCalledWith("plug", false);
    expect(api.updatePlugin).toHaveBeenCalledWith("plug");
    expect(api.uninstallPlugin).toHaveBeenCalledWith("plug");
  });

  it("shows plugin updates", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockResolvedValueOnce({ plugins: [{ id: "chat", currentVersion: "1.0.0", latestVersion: "1.1.0", updateAvailable: true }] });
    await host.loadPlugins();
    await host.checkPluginUpdates();
    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0 → 1.1.0 · update available");
  });
});
