// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

function ok(body = {}) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function err(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
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

    globalThis.fetch = vi.fn(async (url) => String(url).endsWith("/auth/oauth/start") ? err("start failed") : ok({}));
    await app.startOAuthLogin();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("start failed");

    app.oauthSessionId = "bad";
    globalThis.fetch = vi.fn(async () => err("poll failed"));
    const pollError = app.pollOAuthSession("bad");
    await vi.advanceTimersByTimeAsync(1000);
    await pollError;
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("poll failed");

    app.oauthSessionId = "input-error";
    globalThis.fetch = vi.fn(async () => err("input failed"));
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("input failed");
  });

  it("covers optional DOM and guard branches", async () => {
    const app = await connectPiApp();
    app.fillOAuthForm();
    app.querySelector("[data-oauth-provider]").remove();
    app.fillOAuthForm();
    await app.startOAuthLogin();
    await app.pollOAuthSession("");
    app.querySelector("[data-oauth-input]").remove();
    app.oauthSessionId = "s";
    await app.sendOAuthInput();
    app.querySelector("[data-oauth-status]").remove();
    app.setOAuthStatus("ignored");
  });
});
