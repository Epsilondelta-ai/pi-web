// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteWorkspace, getPlugins, getVersionStatus, health, installPlugin, openWorkspace, saveWorkspaceSettings, startPiUpdate } from "./api";

describe("api adapter", () => {
  beforeEach(() => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options) => ({ ok: true, status: 200, statusText: "OK", json: async () => ({ url, options }) }));
  });
  afterEach(() => { delete globalThis.PI_WEB_API_BASE; vi.restoreAllMocks(); });

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
    Object.defineProperty(globalThis, "location", { value: { hostname: "localhost" }, configurable: true });
    expect((await getPlugins()).url).toBe("http://127.0.0.1:8732/api/plugins");
    Object.defineProperty(globalThis, "location", { value: original, configurable: true });
  });

  it("posts plugin, workspace, update, and settings requests", async () => {
    expect(JSON.parse((await installPlugin("github", "owner/repo")).options.body)).toEqual({ source: "github", url: "owner/repo" });
    expect(JSON.parse((await openWorkspace("/repo")).options.body)).toEqual({ path: "/repo" });
    expect((await deleteWorkspace("w1")).options.method).toBe("DELETE");
    expect(JSON.parse((await startPiUpdate("source", "w1")).options.body)).toEqual({ source: "source", workspaceId: "w1" });
    expect(JSON.parse((await saveWorkspaceSettings("w1", "project", { theme: "dark" })).options.body)).toEqual({ scope: "project", settings: { theme: "dark" } });
  });

  it("surfaces backend errors", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 418, statusText: "Teapot", json: async () => ({ error: "short and stout" }) }));
    await expect(health()).rejects.toThrow("short and stout");
  });
});
