// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agui = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("@ag-ui/client", () => ({
  HttpAgent: vi.fn(function HttpAgent() {
    this.runAgent = agui.runAgent;
  }),
}));

import {
  cancelSession,
  cloneWorkspace,
  createSession,
  createWorkspaceFile,
  deleteSession,
  deleteWorkspace,
  deleteWorkspaceFile,
  deleteWorkspaceSessions,
  getGitCommit,
  getGitHistory,
  getGitStatus,
  getAuthProviders,
  getOAuthLoginSession,
  getOAuthProviders,
  getPiVersionStatus,
  getSession,
  getVersionStatus,
  getWorkspaceCommands,
  getWorkspaceFile,
  getWorkspaceFiles,
  getWorkspaceModels,
  getWorkspaceRuntimeModel,
  getWorkspaceRuntimeQuota,
  getWorkspaceRuntimeStatus,
  getWorkspaceSessions,
  getWorkspaceSettings,
  getWorkspaces,
  health,
  logoutProvider,
  listFolders,
  openWorkspace,
  postPrompt,
  renameSession,
  saveAPIKey,
  renameWorkspaceFile,
  runAguiSessionPrompt,
  steerSession,
  runShellCommand,
  saveWorkspaceFile,
  saveWorkspaceSettings,
  searchWorkspaceFiles,
  sendOAuthLoginInput,
  sessionEvents,
  startOAuthLogin,
  uploadWorkspaceFile,
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
    agui.runAgent.mockReset();
  });

  it("fetches workspaces from the configured backend", async () => {
    const result = await getWorkspaces();
    expect(result.url).toBe("http://backend.test/api/workspaces");
  });

  it("fetches version status", async () => {
    const result = await getVersionStatus();
    expect(result.url).toBe("http://backend.test/api/version");
  });

  it("fetches pi version status", async () => {
    const result = await getPiVersionStatus();
    expect(result.url).toBe("http://backend.test/api/pi/version");
  });

  it("defaults to same-origin API paths for the embedded app", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", { value: { port: "1234" }, configurable: true });
    const result = await getWorkspaces();
    expect(result.url).toBe("/api/workspaces");
    Object.defineProperty(globalThis, "location", { value: original, configurable: true });
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
    expect((await getSession("plain")).url).toBe("http://backend.test/api/sessions/plain");
    expect((await getSession("plain", { limit: 10 })).url).toBe("http://backend.test/api/sessions/plain?limit=10");
    expect((await getSession("plain", { before: "abc" })).url).toBe("http://backend.test/api/sessions/plain?before=abc");
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
    const reloadedCommands = await getWorkspaceCommands("w1", { reload: true });
    expect(reloadedCommands.url).toBe("http://backend.test/api/workspaces/w1/commands?reload=1");
    const models = await getWorkspaceModels("w1");
    expect(models.url).toBe("http://backend.test/api/workspaces/w1/models");
    const sessions = await getWorkspaceSessions("w/1");
    expect(sessions.url).toBe("http://backend.test/api/workspaces/w%2F1/sessions");
    const files = await getWorkspaceFiles("w/1");
    expect(files.url).toBe("http://backend.test/api/workspaces/w%2F1/files");
    const search = await searchWorkspaceFiles("w/1", "hello world");
    expect(search.url).toBe("http://backend.test/api/workspaces/w%2F1/files/search?q=hello%20world");
    const git = await getGitStatus("w/1");
    expect(git.url).toBe("http://backend.test/api/workspaces/w%2F1/git/status");
    const gitHistory = await getGitHistory("w/1", 25);
    expect(gitHistory.url).toBe("http://backend.test/api/workspaces/w%2F1/git/history?limit=25");
    const gitCommit = await getGitCommit("w/1", "a/b");
    expect(gitCommit.url).toBe("http://backend.test/api/workspaces/w%2F1/git/commit?hash=a%2Fb");
    const status = await getWorkspaceRuntimeStatus("w1");
    expect(status.url).toBe("http://backend.test/api/workspaces/w1/runtime-status");
    const model = await getWorkspaceRuntimeModel("w1");
    expect(model.url).toBe("http://backend.test/api/workspaces/w1/runtime-model");
    const quota = await getWorkspaceRuntimeQuota("w1", "GPT-5.5");
    expect(quota.url).toBe("http://backend.test/api/workspaces/w1/runtime-quota?model=GPT-5.5");
    const quotaDefault = await getWorkspaceRuntimeQuota("w1");
    expect(quotaDefault.url).toBe("http://backend.test/api/workspaces/w1/runtime-quota");
  });

  it("manages auth and oauth requests", async () => {
    expect((await getAuthProviders()).url).toBe("http://backend.test/api/auth/providers");
    expect(JSON.parse((await saveAPIKey("anthropic", "key")).options.body)).toEqual({ provider: "anthropic", apiKey: "key" });
    expect((await getOAuthProviders()).url).toBe("http://backend.test/api/auth/oauth/providers");
    expect((await startOAuthLogin("anthropic")).url).toBe("http://backend.test/api/auth/oauth/start");
    expect(JSON.parse((await startOAuthLogin("anthropic")).options.body)).toEqual({ provider: "anthropic" });
    expect((await getOAuthLoginSession("s/1")).url).toBe("http://backend.test/api/auth/oauth/sessions/s%2F1");
    const input = await sendOAuthLoginInput("s/1", "code");
    expect(input.url).toBe("http://backend.test/api/auth/oauth/sessions/s%2F1/input");
    expect(JSON.parse(input.options.body)).toEqual({ value: "code" });
    expect((await logoutProvider("gemini/web")).options.method).toBe("DELETE");
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

    const created = await createWorkspaceFile("w/1", "src/new.txt", "file", "hello");
    expect(created.url).toBe("http://backend.test/api/workspaces/w%2F1/files/create");
    expect(JSON.parse(created.options.body)).toEqual({ path: "src/new.txt", kind: "file", content: "hello" });
    expect(JSON.parse((await createWorkspaceFile("w/1", "empty")).options.body)).toEqual({ path: "empty", kind: "file", content: "" });
    const renamed = await renameWorkspaceFile("w/1", "old", "new");
    expect(renamed.options.method).toBe("PATCH");
    expect(JSON.parse(renamed.options.body)).toEqual({ oldPath: "old", newPath: "new" });
    const deleted = await deleteWorkspaceFile("w/1", "old");
    expect(deleted.options.method).toBe("DELETE");
    expect(JSON.parse(deleted.options.body)).toEqual({ path: "old" });
    const uploaded = await uploadWorkspaceFile("w/1", "asset.png", "base64", true);
    expect(uploaded.url).toBe("http://backend.test/api/workspaces/w%2F1/files/upload");
    expect(JSON.parse(uploaded.options.body)).toEqual({ path: "asset.png", content: "base64", overwrite: true });
    expect(JSON.parse((await uploadWorkspaceFile("w/1", "asset.png", "base64")).options.body)).toEqual({ path: "asset.png", content: "base64", overwrite: false });
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
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({}),
    }));
    await expect(getWorkspaces()).rejects.toThrow("400 Bad Request");
  });

  it("runs AG-UI prompts with EventSource fallback and tool callbacks", async () => {
    const originalEventSource = globalThis.EventSource;
    // @ts-expect-error exercise fallback branch
    delete globalThis.EventSource;
    expect(await runAguiSessionPrompt("s1", "hello", [{ path: "a" }])).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(
      "http://backend.test/api/sessions/s1/prompt",
      expect.objectContaining({ method: "POST" }),
    );

    globalThis.EventSource = originalEventSource || class {};
    const subscriber = {
      onRunStarted: vi.fn(),
      onTextDelta: vi.fn(),
      onTextEnd: vi.fn(),
      onThinkingDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolArgs: vi.fn(),
      onToolResult: vi.fn(),
      onToolEnd: vi.fn(),
      onRunError: vi.fn(),
      onRunFinished: vi.fn(),
    };
    const callbacks: any = {};
    agui.runAgent.mockImplementationOnce(async (_input, cb) => {
      Object.assign(callbacks, cb);
      cb.onRunStartedEvent();
      cb.onTextMessageContentEvent({ event: { delta: "a" } });
      cb.onTextMessageEndEvent({ textMessageBuffer: "done" });
      cb.onReasoningMessageContentEvent({ event: { delta: "think" } });
      cb.onToolCallStartEvent({ event: { toolCallId: "t1", toolCallName: "read" } });
      cb.onToolCallArgsEvent({ event: { toolCallId: "t1", delta: "{}" } });
      cb.onToolCallResultEvent({ event: { toolCallId: "t1", content: "ok" } });
      cb.onToolCallEndEvent({ event: { toolCallId: "t1" }, toolCallArgs: { path: "x" } });
      cb.onRunErrorEvent({ event: { message: "bad" } });
      cb.onRunFailed({ error: new Error("failed") });
      cb.onRunFinishedEvent();
    });
    expect(await runAguiSessionPrompt("s1", "hello", [], subscriber)).toBe(true);
    expect(subscriber.onToolEnd).toHaveBeenCalledWith({ id: "t1", name: "read", args: '{"path":"x"}', body: "ok" });
    expect(subscriber.onRunFinished).toHaveBeenCalled();
    callbacks.onToolCallArgsEvent({ event: { toolCallId: "t2", delta: "x" }, toolCallName: "write" });
    callbacks.onToolCallResultEvent({ event: { toolCallId: "t2", content: "" } });
    callbacks.onToolCallEndEvent({ event: { toolCallId: "t2" }, toolCallName: "write", toolCallArgs: "raw" });
    expect(subscriber.onToolEnd).toHaveBeenLastCalledWith({ id: "t2", name: "write", args: "raw", body: "x" });
  });

  it("covers AG-UI callback fallbacks without subscribers", async () => {
    globalThis.EventSource = class {};
    const callbacks: any = {};
    agui.runAgent.mockImplementationOnce(async (_input, cb) => {
      Object.assign(callbacks, cb);
      cb.onRunStartedEvent();
      cb.onTextMessageContentEvent({ event: {} });
      cb.onTextMessageEndEvent({});
      cb.onReasoningMessageContentEvent({ event: {} });
      cb.onToolCallStartEvent({ event: { toolCallId: "t0" } });
      cb.onToolCallArgsEvent({ event: { toolCallId: "t0" } });
      cb.onToolCallResultEvent({ event: { toolCallId: "t-missing" } });
      cb.onToolCallEndEvent({ event: { toolCallId: "t-missing" } });
      cb.onRunErrorEvent({ event: {} });
      cb.onRunFailed({ error: undefined });
      cb.onRunFinishedEvent();
    });
    expect(await runAguiSessionPrompt("s1", "hello")).toBe(true);

    const subscriber = {
      onTextDelta: vi.fn(),
      onTextEnd: vi.fn(),
      onThinkingDelta: vi.fn(),
      onToolEnd: vi.fn(),
      onRunError: vi.fn(),
    };
    agui.runAgent.mockImplementationOnce(async (_input, cb) => {
      cb.onTextMessageContentEvent({ event: { delta: "" } });
      cb.onTextMessageEndEvent({ textMessageBuffer: "" });
      cb.onReasoningMessageContentEvent({ event: { delta: "" } });
      cb.onToolCallArgsEvent({ event: { toolCallId: "new", delta: "" } });
      cb.onToolCallEndEvent({ event: { toolCallId: "new" }, toolCallArgs: undefined });
      cb.onRunErrorEvent({ event: { message: "" } });
      cb.onRunFailed({ error: null });
    });
    expect(await runAguiSessionPrompt("s2", "hello", [], subscriber)).toBe(true);
    expect(subscriber.onTextDelta).toHaveBeenCalledWith("");
    expect(subscriber.onToolEnd).toHaveBeenCalledWith({ id: "new", name: "tool", args: "{}", body: "" });
    expect(subscriber.onRunError).toHaveBeenCalledWith("AG-UI run failed");
  });

  it("falls back when AG-UI reader streaming is unavailable", async () => {
    globalThis.EventSource = class {};
    agui.runAgent.mockRejectedValueOnce(new Error("Failed to getReader"));
    expect(await runAguiSessionPrompt("s1", "hello")).toBe(false);
  });

  it("rethrows non-streaming AG-UI failures", async () => {
    globalThis.EventSource = class {};
    agui.runAgent.mockRejectedValueOnce(new Error("agent exploded"));
    await expect(runAguiSessionPrompt("s1", "hello")).rejects.toThrow("agent exploded");
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
