// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";
import { oauthErrorMessage } from "./oauth-methods";

function ok(body = {}) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

describe("oauth methods", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanupPiAppFixture();
  });

  it("covers oauth error message helper", () => {
    expect(oauthErrorMessage(new Error("boom"))).toBe("boom");
    expect(oauthErrorMessage("plain")).toBe("plain");
  });

  it("fills providers, applies waiting, error, and success sessions", async () => {
    const app = await connectPiApp();
    app.oauthState = {
      providers: [
        { id: "anthropic", name: "Anthropic", configured: true },
        { id: "openai-codex", name: "Codex", configured: false },
      ],
    };
    const select = app.querySelector("[data-oauth-provider]");
    select.innerHTML = `<option value="openai-codex">old</option>`;
    select.value = "openai-codex";
    app.fillOAuthForm();
    expect(select.value).toBe("openai-codex");
    expect(select.textContent).toContain("Anthropic ✓");

    app.applyOAuthSession({
      id: "s1",
      status: "waiting",
      authUrl: "https://login.example",
      instructions: "complete login",
      prompt: { message: "paste code", placeholder: "code" },
      progress: [],
    });
    expect(app.querySelector("[data-oauth-link]").hidden).toBe(false);
    expect(app.querySelector("[data-oauth-input]").placeholder).toBe("code");
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("paste code");

    app.applyOAuthSession({ id: "s1", status: "error", error: "denied", progress: [] });
    expect(app.querySelector("[data-oauth-status]").classList.contains("err")).toBe(true);
    app.applyOAuthSession({ id: "s1", status: "error", progress: [] });
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("OAuth login failed");

    app.refreshAuthAfterOAuth = vi.fn();
    app.applyOAuthSession({ id: "s1", status: "waiting", authUrl: "", prompt: null, progress: ["latest"] });
    expect(app.querySelector("[data-oauth-link]").hidden).toBe(true);
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("latest");
    const input = app.querySelector("[data-oauth-input]");
    const send = app.querySelector("[data-action='send-oauth-input']");
    input.remove();
    send.remove();
    app.applyOAuthSession({ id: "s1", status: "waiting", instructions: "no input" });
    app.applyOAuthSession({ id: "s1", status: "success", progress: [] });
    expect(app.refreshAuthAfterOAuth).toHaveBeenCalled();
  });

  it("starts, polls, sends input, refreshes auth, and handles failures", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.querySelector("[data-oauth-provider]").innerHTML = `<option value="openai-codex">Codex</option>`;
    let sessionPolls = 0;
    globalThis.fetch = vi.fn(async (url, _options = {}) => {
      const value = String(url);
      if (value.endsWith("/auth/oauth/start")) {
        return ok({ session: { id: "oauth-1", provider: "openai-codex", status: "running", progress: ["started"] } });
      }
      if (value.endsWith("/auth/oauth/sessions/oauth-1/input")) {
        return ok({ session: { id: "oauth-1", provider: "openai-codex", status: "running", prompt: null, progress: ["sent"] } });
      }
      if (value.endsWith("/auth/oauth/sessions/oauth-1")) {
        sessionPolls += 1;
        return ok({ session: { id: "oauth-1", provider: "openai-codex", status: sessionPolls > 1 ? "success" : "running", progress: ["poll"] } });
      }
      if (value.endsWith("/auth/providers")) return ok({ providers: [{ id: "openai-codex", name: "Codex", configured: true }] });
      if (value.endsWith("/auth/oauth/providers")) return ok({ providers: [{ id: "openai-codex", name: "Codex", configured: true }] });
      return ok({});
    });
    vi.useFakeTimers();
    const poll = app.startOAuthLogin();
    await vi.runOnlyPendingTimersAsync();
    await poll;
    app.querySelector("[data-oauth-input]").hidden = false;
    app.querySelector("[data-oauth-input]").value = "code";
    await app.sendOAuthInput();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(app.querySelector("[data-oauth-input]").value).toBe("");

    globalThis.fetch = vi.fn(async () => { throw "start string failed"; });
    await app.startOAuthLogin();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("start string failed");

    app.oauthSessionId = "bad";
    globalThis.fetch = vi.fn(async () => { throw "poll string failed"; });
    const pollError = app.pollOAuthSession("bad");
    await vi.advanceTimersByTimeAsync(1000);
    await pollError;
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("poll string failed");

    app.oauthSessionId = "input-error";
    globalThis.fetch = vi.fn(async () => { throw "input string failed"; });
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("input string failed");
  });

  it("logs out the selected OAuth provider", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.querySelector("[data-oauth-provider]").innerHTML = `<option value="openai-codex">Codex</option>`;
    const calls = [];
    globalThis.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || "GET" });
      if (String(url).endsWith("/auth/providers")) return ok({ providers: [{ id: "openai-codex", name: "Codex", configured: false }] });
      if (String(url).endsWith("/auth/oauth/providers")) return ok({ providers: [{ id: "openai-codex", name: "Codex", configured: false }] });
      return ok({});
    });

    await app.logoutOAuthProvider();

    expect(calls).toContainEqual({ url: "http://backend.test/api/auth/openai-codex", method: "DELETE" });
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("OAuth credential removed");

    globalThis.fetch = vi.fn(async () => { throw "logout string failed"; });
    app.setConnection = vi.fn();
    await app.logoutOAuthProvider();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("logout string failed");
    expect(app.setConnection).toHaveBeenCalledWith("err");

    app.apiConnected = false;
    await app.logoutOAuthProvider();
    app.apiConnected = true;
    app.querySelector("[data-oauth-provider]").innerHTML = "";
    await app.logoutOAuthProvider();
  });

  it("covers optional DOM and guard branches", async () => {
    const app = await connectPiApp();
    app.fillOAuthForm();
    app.querySelector("[data-oauth-provider]").remove();
    app.fillOAuthForm();
    app.querySelector("[data-oauth-link]").remove();
    app.applyOAuthSession({ status: "waiting", authUrl: "https://ignored" });
    await app.startOAuthLogin();
    await app.pollOAuthSession("");
    app.querySelector("[data-oauth-input]").remove();
    app.oauthSessionId = "s";
    await app.sendOAuthInput();
    app.querySelector("[data-oauth-status]").remove();
    app.setOAuthStatus("ignored");
  });
});
