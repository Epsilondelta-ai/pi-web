// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSession,
  cloneWorkspace,
  createSession,
  deleteSession,
  deleteWorkspace,
  deleteWorkspaceSessions,
  getGitStatus,
  getSession,
  getVersionStatus,
  getWorkspaceCommands,
  getWorkspaceFile,
  getWorkspaceFiles,
  getWorkspaceRuntimeModel,
  getWorkspaceRuntimeQuota,
  getWorkspaceRuntimeStatus,
  getWorkspaceSettings,
  getWorkspaces,
  health,
  listFolders,
  openWorkspace,
  postPrompt,
  renameSession,
  steerSession,
  runShellCommand,
  saveWorkspaceFile,
  saveWorkspaceSettings,
  sessionEvents,
} from "./api";

describe("api adapter", () => {
  beforeEach(() => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options) => ({
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

  it("fetches workspaces from the configured backend", async () => {
    const result = await getWorkspaces();
    expect(result.url).toBe("http://backend.test/api/workspaces");
  });

  it("fetches version status", async () => {
    const result = await getVersionStatus();
    expect(result.url).toBe("http://backend.test/api/version");
  });

  it("defaults to same-origin API paths for the embedded app", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const result = await getWorkspaces();
    expect(result.url).toBe("/api/workspaces");
  });

  it("uses the development backend for known dev ports", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", { value: { port: "4321" }, configurable: true });
    expect((await health()).url).toBe("http://127.0.0.1:8732/api/health");
    Object.defineProperty(globalThis, "location", { value: { port: "6006" }, configurable: true });
    expect((await health()).url).toBe("http://127.0.0.1:8732/api/health");
    Object.defineProperty(globalThis, "location", { value: original, configurable: true });
  });

  it("escapes session ids in paths and supports message paging", async () => {
    const result = await getSession("a/b", { limit: 25, before: "123" });
    expect(result.url).toBe("http://backend.test/api/sessions/a%2Fb?limit=25&before=123");
  });

  it("lists folders from the backend browser", async () => {
    const result = await listFolders("~");
    expect(result.url).toBe("http://backend.test/api/system/folders?path=~");
  });

  it("creates sessions in a workspace", async () => {
    const result = await createSession("w1");
    expect(result.url).toBe("http://backend.test/api/workspaces/w1/sessions");
    expect(result.options.method).toBe("POST");
  });

  it("supports workspace and session management", async () => {
    expect((await deleteWorkspace("w1")).options.method).toBe("DELETE");
    const deletedWorkspaceSessions = await deleteWorkspaceSessions("w1");
    expect(deletedWorkspaceSessions.url).toBe("http://backend.test/api/workspaces/w1/sessions");
    expect(deletedWorkspaceSessions.options.method).toBe("DELETE");
    expect((await deleteSession("s1")).options.method).toBe("DELETE");
    expect((await cancelSession("s1")).options.method).toBe("POST");
    const renamed = await renameSession("s1", "next");
    expect(renamed.options.method).toBe("PATCH");
    expect(JSON.parse(renamed.options.body)).toEqual({ title: "next" });
  });

  it("fetches workspace slash commands and runtime status", async () => {
    const opened = await openWorkspace("/repo");
    expect(opened.url).toBe("http://backend.test/api/workspaces/open");
    expect(JSON.parse(opened.options.body)).toEqual({ path: "/repo" });
    const commands = await getWorkspaceCommands("w1");
    expect(commands.url).toBe("http://backend.test/api/workspaces/w1/commands");
    const files = await getWorkspaceFiles("w/1");
    expect(files.url).toBe("http://backend.test/api/workspaces/w%2F1/files");
    const git = await getGitStatus("w/1");
    expect(git.url).toBe("http://backend.test/api/workspaces/w%2F1/git/status");
    const status = await getWorkspaceRuntimeStatus("w1");
    expect(status.url).toBe("http://backend.test/api/workspaces/w1/runtime-status");
    const model = await getWorkspaceRuntimeModel("w1");
    expect(model.url).toBe("http://backend.test/api/workspaces/w1/runtime-model");
    const quota = await getWorkspaceRuntimeQuota("w1", "GPT-5.5");
    expect(quota.url).toBe("http://backend.test/api/workspaces/w1/runtime-quota?model=GPT-5.5");
    const quotaDefault = await getWorkspaceRuntimeQuota("w1");
    expect(quotaDefault.url).toBe("http://backend.test/api/workspaces/w1/runtime-quota");
  });

  it("reads and saves workspace settings and files", async () => {
    const settings = await getWorkspaceSettings("w1");
    expect(settings.url).toBe("http://backend.test/api/workspaces/w1/settings");
    const savedSettings = await saveWorkspaceSettings("w1", "project", { theme: "dark" });
    expect(savedSettings.url).toBe("http://backend.test/api/workspaces/w1/settings");
    expect(savedSettings.options.method).toBe("PUT");
    expect(JSON.parse(savedSettings.options.body)).toEqual({ scope: "project", settings: { theme: "dark" } });

    const result = await getWorkspaceFile("w1", "src/main.go");
    expect(result.url).toBe("http://backend.test/api/workspaces/w1/files/read?path=src%2Fmain.go");
    const saved = await saveWorkspaceFile("w1", "src/main.go", "package main");
    expect(saved.url).toBe("http://backend.test/api/workspaces/w1/files/write?path=src%2Fmain.go");
    expect(saved.options.method).toBe("PUT");
    expect(JSON.parse(saved.options.body)).toEqual({ content: "package main" });
  });

  it("posts prompts as json", async () => {
    const result = await postPrompt("s1", "hello");
    expect(result.options.method).toBe("POST");
    expect(JSON.parse(result.options.body)).toEqual({ text: "hello", attachments: [] });
  });

  it("posts steering messages as json", async () => {
    const result = await steerSession("s1", "look here");
    expect(result.url).toBe("http://backend.test/api/sessions/s1/steer");
    expect(result.options.method).toBe("POST");
    expect(JSON.parse(result.options.body)).toEqual({ text: "look here", attachments: [] });
  });

  it("clones workspaces and runs shell commands", async () => {
    const cloned = await cloneWorkspace("/tmp", "https://example.test/repo.git", "repo");
    expect(cloned.url).toBe("http://backend.test/api/workspaces/clone");
    expect(JSON.parse(cloned.options.body)).toEqual({ parentPath: "/tmp", gitUrl: "https://example.test/repo.git", name: "repo" });
    const shell = await runShellCommand("w/1", "pwd");
    expect(shell.url).toBe("http://backend.test/api/workspaces/w%2F1/shell");
    expect(JSON.parse(shell.options.body)).toEqual({ command: "pwd" });
  });

  it("surfaces backend errors", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 418,
      statusText: "Teapot",
      json: async () => ({ error: "short and stout" }),
    }));
    await expect(getWorkspaces()).rejects.toThrow("short and stout");
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => {
        throw new Error("bad json");
      },
    }));
    await expect(getWorkspaces()).rejects.toThrow("500 Server Error");
  });

  it("creates EventSource connections for session streams", () => {
    const sources = [];
    const onEvent = vi.fn();
    const onOpen = vi.fn();
    const onError = vi.fn();
    globalThis.EventSource = class {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        sources.push(this);
      }
      addEventListener(type, cb) {
        this.listeners[type] = cb;
      }
      close() {}
    };
    const source = sessionEvents("s1", { onEvent, onOpen, onError });
    expect(source.url).toBe("http://backend.test/api/sessions/s1/events");
    expect(sources[0].listeners["session.message"]).toBeTypeOf("function");
    source.onopen();
    source.onerror("err");
    sources[0].listeners["session.message"]({ data: JSON.stringify({ type: "session.message" }) });
    sources[0].listeners.heartbeat({ data: "not-json" });
    expect(onOpen).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith({ type: "session.message" });

    const noReplay = sessionEvents("s1", { replay: false });
    expect(noReplay.url).toBe("http://backend.test/api/sessions/s1/events?replay=false");
  });
});
