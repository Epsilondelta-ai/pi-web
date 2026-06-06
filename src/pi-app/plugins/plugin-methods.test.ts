// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  apiBase: vi.fn(() => "http://backend.test"),
  cancelSession: vi.fn(),
  getPluginUpdates: vi.fn(),
  getPlugins: vi.fn(),
  getSession: vi.fn(),
  getWorkspaceFile: vi.fn(),
  installPlugin: vi.fn(),
  postPrompt: vi.fn(),
  reloadPlugins: vi.fn(),
  runShellCommand: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
  sessionEvents: vi.fn(),
  setPluginEnabled: vi.fn(),
  steerSession: vi.fn(),
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
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.values(api).forEach((mock) => mock.mockReset?.());
    api.apiBase.mockReturnValue("http://backend.test");
    api.getPlugins.mockResolvedValue({ plugins: [] });
    api.getPluginUpdates.mockResolvedValue({ plugins: [] });
    api.cancelSession.mockResolvedValue({ cancelled: true });
    api.getSession.mockResolvedValue({ session: { id: "s1" } });
    api.getWorkspaceFile.mockResolvedValue({ file: { path: "a" } });
    api.installPlugin.mockResolvedValue({});
    api.postPrompt.mockResolvedValue({ accepted: true });
    api.reloadPlugins.mockResolvedValue({});
    api.runShellCommand.mockResolvedValue({ output: "ok" });
    api.searchWorkspaceFiles.mockResolvedValue({ files: [] });
    api.sessionEvents.mockReturnValue({ close: vi.fn() });
    api.setPluginEnabled.mockResolvedValue({});
    api.steerSession.mockResolvedValue({ accepted: true });
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

    expect(listed.querySelector("[data-plugin-list]").textContent).toBe(
      "No plugins installed.",
    );
  });

  it("uses the default dynamic importer", async () => {
    const host = hostWithList();
    api.apiBase.mockReturnValue(
      "data:text/javascript,export default () => {}//",
    );
    api.getPlugins.mockResolvedValue({
      plugins: [{ id: "inline", entry: "index.js" }],
    });

    await host.loadPlugins();

    expect(host.loadedPlugins.has("inline")).toBe(true);
  });

  it("loads enabled plugins, skips disabled and loaded plugins, and reports failures", async () => {
    const host = hostWithList();
    const activated = [];
    host.loadedPlugins = new Set(["already"]);
    host.importPluginModule = vi.fn(async (url) => {
      if (url.includes("default-plugin"))
        return {
          default: (context) => activated.push(["default", context.plugin.id]),
        };
      if (url.includes("activate-plugin"))
        return {
          activate: (context) =>
            activated.push(["activate", context.plugin.id]),
        };
      throw new Error("bad plugin");
    });
    api.getPlugins.mockResolvedValue({
      plugins: [
        { id: "disabled", entry: "index.js", enabled: false },
        { id: "already", entry: "index.js" },
        {
          id: "default-plugin",
          name: "Default",
          version: "1",
          cacheKey: "sha",
          entry: "main.js",
        },
        { id: "activate-plugin", entry: "entry.js" },
        { id: "broken", name: "Broken", entry: "broken.js" },
      ],
    });

    await host.loadPlugins();

    expect(host.importPluginModule).toHaveBeenCalledWith(
      "http://backend.test/api/plugins/default-plugin/assets/main.js?v=sha",
    );
    expect(activated).toEqual([
      ["default", "default-plugin"],
      ["activate", "activate-plugin"],
    ]);
    expect(host.loadedPlugins.has("default-plugin")).toBe(true);
    expect(
      host.querySelector(
        "[data-plugin-id='disabled'] [data-action='toggle-plugin']",
      ).textContent,
    ).toBe("enable");
    expect(host.querySelector("[data-plugin-id='default-plugin'] [data-plugin-version]").textContent).toBe(
      "default-plugin · 1",
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Broken"),
      expect.any(Error),
    );
  });

  it("deactivates loaded plugins through returned cleanup and module hooks", async () => {
    const host = hostWithList();
    const cleanup = vi.fn();
    const objectDeactivate = vi.fn();
    const objectDispose = vi.fn();
    const moduleDeactivate = vi.fn();
    host.importPluginModule = vi.fn(async (url) => {
      if (url.includes("cleanup-plugin")) return { default: () => cleanup };
      if (url.includes("object-deactivate"))
        return { default: () => ({ deactivate: objectDeactivate }) };
      if (url.includes("object-dispose"))
        return { default: () => ({ dispose: objectDispose }) };
      if (url.includes("failing-cleanup")) {
        return {
          default: () => () => {
            throw new Error("cleanup failed");
          },
        };
      }
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
    await host.deactivateLoadedPlugin("cleanup-plugin");
    await host.deactivateLoadedPlugins();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(objectDeactivate).toHaveBeenCalledOnce();
    expect(objectDispose).toHaveBeenCalledOnce();
    expect(moduleDeactivate).toHaveBeenCalledWith(
      expect.objectContaining({
        plugin: expect.objectContaining({ id: "module-plugin" }),
      }),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("failing-cleanup"),
      expect.any(Error),
    );
    expect(host.loadedPlugins.size).toBe(0);
    expect(host.activePlugins.size).toBe(0);
  });

  it("provides plugin context API helpers", async () => {
    const host = hostWithList();
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    await context.api.get("/one");
    await context.api.post("/two", { ok: true });
    await context.backend("run", { ok: true });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => "nope",
    }));

    await expect(context.api.get("/fail")).rejects.toThrow("nope");
    expect(context.app).toBe(host);
    expect(typeof context.rxjs.BehaviorSubject).toBe("function");
    expect(piWeb.version).toBe(packageJson.version);
    expect(typeof piWeb.subject).toBe("function");
    expect(api.apiBase).toHaveBeenCalled();
  });

  it("provides a shared global piWeb subject registry", () => {
    const host = hostWithList();
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const first = piWeb.behaviorSubject("core.language", "en");
    const second = piWeb.behaviorSubject("core.language", "ko");
    const closed = piWeb.subject("plugin.p.closed");
    const replay = piWeb.replaySubject("plugin.p.replayed", 2);
    const async = piWeb.asyncSubject("plugin.p.async");

    first.next("ja");

    expect(context.plugin.id).toBe("p");
    expect(first).toBe(second);
    expect(second.value).toBe("ja");
    expect(piWeb.hasSubject("plugin.p.closed")).toBe(true);
    expect(piWeb.hasSubject("plugin.p.replayed")).toBe(true);
    expect(piWeb.hasSubject("plugin.p.async")).toBe(true);
    expect(piWeb.listSubjects()).toContain("core.language");
    expect(() => piWeb.subject("core.language")).toThrow("already exists as behaviorSubject");
    expect(closed).toBe(piWeb.subject("plugin.p.closed"));
    expect(replay).toBe(piWeb.replaySubject("plugin.p.replayed"));
    expect(async).toBe(piWeb.asyncSubject("plugin.p.async"));
    piWeb.completeSubject("plugin.p.closed");
    piWeb.completeSubject("plugin.p.missing");
    expect(piWeb.deleteSubject("plugin.p.closed")).toBe(true);
    expect(piWeb.deleteSubject("plugin.p.closed")).toBe(false);
  });

  it("provides plugin mount and host surface APIs", async () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"></section>`;
    host.refreshChatSurfaceRefs = vi.fn();
    host.bindChatSurfaceEvents = vi.fn();
    host.initTranscriptWindow = vi.fn();
    host.updatePrompt = vi.fn();
    host.appendMessage = vi.fn();
    host.appendDelta = vi.fn();
    host.renderMessages = vi.fn();
    host.finalizeStreamingMessages = vi.fn();
    host.scrollTerm = vi.fn();
    host.submitPrompt = vi.fn(async () => undefined);
    host.cancelActiveSession = vi.fn(async () => undefined);
    host.addFiles = vi.fn(async () => undefined);
    host.prompt = null;
    host.attachments = document.createElement("div");
    host.attachmentContents = [{ name: "x" }];
    host.dataset.activeWorkspaceId = "w1";
    host.dataset.activeSessionId = "s1";
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const chat = document.createElement("section");
    chat.innerHTML = `<div class="term-inner"></div>`;
    const composer = document.createElement("section");
    composer.innerHTML = `<textarea class="prompt-textarea"></textarea>`;
    const cleanupChat = context.mount.chat(chat);
    const cleanupComposer = context.mount.composer(composer);
    host.prompt = composer.querySelector(".prompt-textarea");

    context.chat.appendMessage({ kind: "pi" });
    context.chat.appendDelta({ delta: "x" });
    context.chat.renderMessages([{ kind: "user" }]);
    context.chat.finalizeStreamingMessages();
    context.chat.scrollToBottom();
    context.composer.setPrompt("hello");
    await context.composer.submitPrompt();
    await context.composer.cancelActiveSession();
    await context.composer.addAttachment(new File(["x"], "x.txt"));
    context.composer.clearAttachments();
    await context.session.get("s1");
    await context.session.postPrompt("s1", "p");
    await context.session.steer("s1", "p");
    await context.session.cancel("s1");
    expect(context.session.activeId()).toBe("s1");
    expect(context.session.activeWorkspaceId()).toBe("w1");
    expect(context.session.running()).toBe(false);
    host.classList.add("running");
    expect(context.session.running()).toBe(true);
    context.session.events("s1");
    await context.files.search("w1", "a");
    await context.files.read("w1", "a.txt");
    await context.shell.run("w1", "pwd");

    expect(host.querySelector(".app-body > [data-plugin-chat-root]")).toBe(chat);
    expect(host.querySelector(".app-body > [data-plugin-composer-root]")).toBe(composer);
    expect(context.composer.getPrompt()).toBe("hello");
    expect(host.appendMessage).toHaveBeenCalledWith({ kind: "pi" });
    expect(api.postPrompt).toHaveBeenCalledWith("s1", "p", []);
    expect(api.runShellCommand).toHaveBeenCalledWith("w1", "pwd");
    cleanupChat();
    cleanupComposer();
    expect(host.querySelector("[data-plugin-chat-root]")).toBeNull();
    expect(host.querySelector("[data-plugin-composer-root]")).toBeNull();
  });

  it("does not create required fallback when chat and composer already exist", async () => {
    const host = hostWithList();
    host.innerHTML += `
      <section class="app-body">
        <main><div class="term-inner"></div></main>
        <section><textarea class="prompt-textarea"></textarea></section>
      </section>
    `;
    api.getPlugins.mockResolvedValueOnce({ plugins: [] });

    await host.loadPlugins();

    expect(host.querySelector("[data-plugin-chat-root]")).toBeNull();
    expect(host.requiredChatFallbackCleanup).toBeUndefined();
  });

  it("creates a required chat fallback when no chat plugin mounts", async () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"></section>`;
    host.refreshChatSurfaceRefs = vi.fn();
    host.initTranscriptWindow = vi.fn();
    api.getPlugins.mockResolvedValueOnce({ plugins: [] });

    await host.loadPlugins();

    expect(host.querySelector("[data-plugin-chat-root] .term-inner")?.textContent).toContain("pi-web-chat");
    expect(host.querySelector("[data-plugin-composer-root] .prompt-textarea")?.disabled).toBe(true);
    expect(host.requiredChatFallbackCleanup).toEqual(expect.any(Function));
    await host.loadPlugins();
    expect(host.querySelectorAll("[data-plugin-chat-root]")).toHaveLength(1);
  });

  it("covers optional plugin host fallbacks", async () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"></section>`;
    host.refreshChatSurfaceRefs = vi.fn();
    host.bindChatSurfaceEvents = vi.fn();
    host.initTranscriptWindow = vi.fn();
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const chat = document.createElement("section");
    const cleanupChat = context.mount.chat(chat);

    expect(host.querySelector(".app-body > [data-plugin-chat-root]")).toBe(chat);
    expect(context.composer.getPrompt()).toBe("");
    context.composer.setPrompt("ignored");
    await expect(context.composer.submitPrompt()).resolves.toBeUndefined();
    await expect(context.composer.cancelActiveSession()).resolves.toBeUndefined();
    await expect(context.composer.addAttachment(new File(["x"], "x.txt"))).resolves.toBeUndefined();
    context.composer.clearAttachments();
    expect(context.session.activeId()).toBe("");
    expect(context.session.activeWorkspaceId()).toBe("");
    expect(context.session.running()).toBe(false);
    host.dataset.mode = "running";
    expect(context.session.running()).toBe(true);
    cleanupChat();
  });

  it("mounts plugin surfaces into existing roots", () => {
    const host = hostWithList();
    host.innerHTML += `<section class="app-body"><div data-plugin-chat-root hidden></div></section>`;
    host.refreshChatSurfaceRefs = vi.fn();
    host.bindChatSurfaceEvents = vi.fn();
    host.initTranscriptWindow = vi.fn();
    host.updatePrompt = vi.fn();
    const context = host.pluginContext({ id: "p", entry: "index.js" });
    const chat = document.createElement("section");
    const cleanupChat = context.mount.chat(chat);

    expect(host.querySelector("[data-plugin-chat-root] > section")).toBe(chat);
    cleanupChat();
    expect(host.querySelector("[data-plugin-chat-root]")?.hidden).toBe(true);
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

  it("restores plugin update rows when checking fails", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockRejectedValueOnce(new Error("offline"));

    await host.loadPlugins();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0 · update check failed");
  });

  it("restores empty plugin update rows when checking fails", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockRejectedValueOnce(new Error("offline"));

    await host.loadPlugins();
    host.querySelector("[data-plugin-version]").textContent = "";
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe(" · update check failed");
  });

  it("shows plugin-specific update check failures", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockResolvedValueOnce({
      plugins: [{ id: "chat", currentVersion: "1.0.0", error: "clone failed" }],
    });

    await host.loadPlugins();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0 · update check failed");
  });

  it("clears checking text for current plugins and ignores missing update rows", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates.mockResolvedValueOnce({
      plugins: [
        { id: "missing", currentVersion: "1.0.0", latestVersion: "1.1.0", updateAvailable: true },
        { id: "chat", currentVersion: "1.0.0", latestVersion: "1.0.0", updateAvailable: false },
      ],
    });

    await host.loadPlugins();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · 1.0.0");
    expect(host.querySelector("[data-plugin-version]").hasAttribute("title")).toBe(false);
  });

  it("handles sparse plugin update payloads and partial row markup", async () => {
    const host = hostWithList();
    api.getPlugins.mockResolvedValueOnce({ plugins: [{ id: "chat", version: "1.0.0", entry: "index.js" }] });
    api.getPluginUpdates
      .mockResolvedValueOnce({ plugins: undefined })
      .mockResolvedValueOnce({ plugins: [{ id: "chat", latestVersion: "1.2.0", updateAvailable: true }] })
      .mockResolvedValueOnce({ plugins: [{ id: "chat", error: "clone failed" }] });

    await host.loadPlugins();
    await host.checkPluginUpdates();
    host.querySelector("[data-action='update-plugin']").remove();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-version]").textContent).toBe("chat · dev → 1.2.0 · update available");

    host.querySelector("[data-plugin-version]").remove();
    await host.checkPluginUpdates();

    expect(host.querySelector("[data-plugin-id='chat']")).not.toBeNull();
  });
});
