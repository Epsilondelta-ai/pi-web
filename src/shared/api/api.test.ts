// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectPluginEvents,
  deleteWorkspace,
  getAuthProviders,
  getOAuthLoginSession,
  getOAuthProviders,
  getPiPackageUpdateStatus,
  getPiUpdateStatus,
  getPiVersionStatus,
  getPluginUpdates,
  getPlugins,
  getVersionStatus,
  getWorkspaceCommands,
  getWorkspaceModels,
  getWorkspaceRuntimeStatus,
  getWorkspaceSettings,
  health,
  installPlugin,
  logoutProvider,
  openWorkspace,
  publishPluginEvent,
  reloadPlugins,
  saveAPIKey,
  saveWorkspaceSettings,
  sendOAuthLoginInput,
  setPluginEnabled,
  startOAuthLogin,
  startPiUpdate,
  uninstallPlugin,
  updatePlugin,
} from "./api";

describe("api adapter", () => {
  beforeEach(() => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ url, options }),
    }));
  });

  afterEach(() => {
    delete globalThis.PI_WEB_API_BASE;
    vi.restoreAllMocks();
  });

  it("uses configured backend base", async () => {
    expect((await getVersionStatus()).url).toBe("http://backend.test/api/version");
  });

  it("defaults to same-origin API paths", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", { value: { hostname: "example.test" }, configurable: true });
    expect((await health()).url).toBe("/api/health");
    Object.defineProperty(globalThis, "location", { value: original, configurable: true });
  });

  it("uses loopback dev backend", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", { value: { hostname: "::1" }, configurable: true });
    expect((await getPlugins()).url).toBe("http://127.0.0.1:8732/api/plugins");
    Object.defineProperty(globalThis, "location", { value: { hostname: "127.0.0.1" }, configurable: true });
    expect((await getPlugins()).url).toBe("http://127.0.0.1:8732/api/plugins");
    Object.defineProperty(globalThis, "location", { value: original, configurable: true });
  });

  it("calls get endpoints", async () => {
    await getPiVersionStatus();
    await getPiUpdateStatus();
    await getPluginUpdates();
    await getAuthProviders();
    await getOAuthProviders();
    await getWorkspaceModels("w/1");
    await getWorkspaceRuntimeStatus("w/1");
    await getWorkspaceSettings("w/1");
    await getWorkspaceCommands("w/1");
    await getWorkspaceCommands("w/1", { reload: true });
    await getPiPackageUpdateStatus();
    await getPiPackageUpdateStatus("w/1");
    await getOAuthLoginSession("s/1");

    const urls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(urls).toContain("http://backend.test/api/pi/version");
    expect(urls).toContain("http://backend.test/api/workspaces/w%2F1/commands?reload=1");
    expect(urls).toContain("http://backend.test/api/pi/package-updates?workspaceId=w%2F1");
    expect(urls).toContain("http://backend.test/api/auth/oauth/sessions/s%2F1");
  });

  it("posts plugin, workspace, update, oauth, and settings requests", async () => {
    expect(JSON.parse((await installPlugin("github", "owner/repo")).options.body)).toEqual({ source: "github", url: "owner/repo" });
    expect(JSON.parse((await installPlugin("local", "/repo")).options.body)).toEqual({ source: "local", path: "/repo" });
    expect((await reloadPlugins()).options.method).toBe("POST");
    expect((await updatePlugin("p/1")).url).toBe("http://backend.test/api/plugins/p%2F1/update");
    expect((await setPluginEnabled("p/1", true)).url).toBe("http://backend.test/api/plugins/p%2F1/enable");
    expect((await setPluginEnabled("p/1", false)).url).toBe("http://backend.test/api/plugins/p%2F1/disable");
    expect((await uninstallPlugin("p/1")).options.method).toBe("DELETE");
    expect(JSON.parse((await openWorkspace("/repo")).options.body)).toEqual({ path: "/repo" });
    expect((await deleteWorkspace("w/1")).options.method).toBe("DELETE");
    expect(JSON.parse((await publishPluginEvent("p/1", "active/state", "active.start", { sessionId: "s1" })).options.body)).toEqual({
      payload: { sessionId: "s1" },
      type: "active.start",
    });
    expect((await publishPluginEvent("p/1", "active/state", "active.start", { sessionId: "s1" })).url).toBe(
      "http://backend.test/api/plugins/p%2F1/events/active%2Fstate",
    );
    expect(JSON.parse((await startPiUpdate()).options.body)).toEqual({ source: "", workspaceId: "" });
    expect(JSON.parse((await startPiUpdate("source", "w1")).options.body)).toEqual({ source: "source", workspaceId: "w1" });
    expect(JSON.parse((await saveAPIKey("anthropic", "key")).options.body)).toEqual({ provider: "anthropic", apiKey: "key" });
    expect(JSON.parse((await startOAuthLogin("claude")).options.body)).toEqual({ provider: "claude" });
    expect(JSON.parse((await sendOAuthLoginInput("s/1", "code")).options.body)).toEqual({ value: "code" });
    expect((await logoutProvider("anthropic")).options.method).toBe("DELETE");
    expect(JSON.parse((await saveWorkspaceSettings("w1", "project", { theme: "dark" })).options.body)).toEqual({ scope: "project", settings: { theme: "dark" } });
  });

  it("connects plugin event streams", () => {
    const listeners = new Map<string, EventListener>();
    const close = vi.fn();
    globalThis.EventSource = vi.fn(function MockEventSource(url) {
      this.addEventListener = vi.fn((type, listener) => listeners.set(type, listener));
      this.close = close;
      this.url = url;
    });
    const received = [];
    const cleanup = connectPluginEvents("p/1", "active/state", (event) => received.push(event), ["active.start"]);
    listeners.get("active.start")?.({ data: JSON.stringify({
      id: 1,
      type: "active.start",
      payload: { sessionId: "s1", workspaceId: "w1" },
    }) });

    expect(globalThis.EventSource).toHaveBeenCalledWith("http://backend.test/api/plugins/p%2F1/events/active%2Fstate");
    expect(received).toEqual([{ id: 1, payload: { sessionId: "s1", workspaceId: "w1" }, type: "active.start" }]);
    cleanup();
    expect(close).toHaveBeenCalledOnce();
  });

  it("surfaces backend errors and fallback messages", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 418, statusText: "Teapot", json: async () => ({ error: "short and stout" }) }));
    await expect(health()).rejects.toThrow("short and stout");
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, statusText: "Broken", json: async () => ({}) }));
    await expect(health()).rejects.toThrow("500 Broken");
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 502, statusText: "Bad Gateway", json: async () => { throw new Error("not json"); } }));
    await expect(health()).rejects.toThrow("502 Bad Gateway");
  });
});
