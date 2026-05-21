// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./test-helper";

function ok(body = {}) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function err(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
}

describe("pi-app input methods coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(cleanupPiAppFixture);

  it("covers prompt submit guards, local echo, creation failure, and post failure", async () => {
    const app = await connectPiApp();
    app.submitSteeringPrompt = vi.fn();
    app.running = true;
    app.prompt.value = "steer";
    await app.submitPrompt();
    expect(app.submitSteeringPrompt).toHaveBeenCalledWith("steer");

    app.running = false;
    app.submitSteeringPrompt = vi.fn();
    app.prompt.value = "";
    await app.submitPrompt();
    expect(app.submitSteeringPrompt).not.toHaveBeenCalled();

    app.apiConnected = false;
    app.prompt.value = "offline";
    await app.submitPrompt();
    expect(app.querySelector(".msg[data-kind='user'] .body").textContent).toBe("offline");

    app.apiConnected = true;
    app.dataset.activeSessionId = "";
    app.dataset.activeWorkspaceId = "w1";
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async () => err("cannot create"));
    app.prompt.value = "create";
    await app.submitPrompt();
    expect(app.setConnection).toHaveBeenCalledWith("err");

    globalThis.fetch = vi.fn(async (url) => String(url).includes("/workspaces/w1/sessions")
      ? ok({ session: { id: "s-new", title: "new" } })
      : ok({ accepted: true }));
    app.activateCreatedSession = vi.fn((workspaceId, session) => { app.dataset.activeSessionId = session.id; });
    app.prompt.value = "created";
    await app.submitPrompt();
    expect(app.activateCreatedSession).toHaveBeenCalledWith("w1", { id: "s-new", title: "new" });

    app.dataset.activeSessionId = "s1";
    app.setMode = vi.fn();
    globalThis.fetch = vi.fn(async () => err("cannot post"));
    app.prompt.value = "post";
    await app.submitPrompt();
    expect(app.setConnection).toHaveBeenCalledWith("err");
    app.prompt = null;
    app.attachments.append(document.createElement("span"));
    app.apiConnected = false;
    await app.submitPrompt();
  });

  it("covers optional DOM absences and outside clicks", async () => {
    const app = await connectPiApp();
    const prompt = app.prompt;
    const attachments = app.attachments;
    app.prompt = null;
    app.attachments = document.createElement("div");
    app.attachments.append(document.createElement("span"));
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    globalThis.fetch = vi.fn(async () => ok({ accepted: true }));
    await app.submitPrompt();
    await app.submitSteeringPrompt("x");
    const form = document.createElement("form");
    form.innerHTML = `<input name="command" value="pwd">`;
    app.dataset.activeWorkspaceId = "w1";
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    const outside = document.createElement("button");
    outside.dataset.action = "route-picker";
    app.handleAppClick({ target: outside });
    const actionOnly = document.createElement("span");
    actionOnly.dataset.action = "route-picker";
    app.append(actionOnly);
    actionOnly.click();
    const chip = document.createElement("span");
    chip.className = "attach-chip";
    chip.dataset.attachmentIndex = "nan";
    chip.innerHTML = `<button data-remove-attachment></button>`;
    app.append(chip);
    chip.querySelector("button").click();
    app.prompt = prompt;
    app.attachments = attachments;
  });

  it("covers connected prompt and steering error exits", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.prompt.value = "fail";
    globalThis.fetch = vi.fn(async () => err("post fail"));
    await app.submitPrompt();
    expect(app.querySelector(".msg.loading")).toBeNull();
    app.dataset.activeSessionId = "";
    await app.submitSteeringPrompt("ignored");
    app.dataset.activeSessionId = "s1";
    app.prompt = null;
    await app.submitSteeringPrompt("no prompt");
  });

  it("marks post failures while waiting for server echo", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s-post";
    app.setMode = vi.fn();
    app.setConnection = vi.fn();
    globalThis.fetch = vi.fn(async () => err("post failed"));
    app.prompt.value = "post failure";

    await app.submitPrompt();

    expect(app.setMode).toHaveBeenCalledWith("running");
    expect(app.setMode).toHaveBeenCalledWith("idle");
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });

  it("submits prompts and steering with attachments", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.attachmentContents = ["", "image-data"];
    app.attachments.hidden = false;
    app.attachments.append(document.createElement("span"));
    globalThis.fetch = vi.fn(async () => ok({ accepted: true }));
    app.prompt.value = "hello";

    await app.submitPrompt();
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body)).toEqual({ text: "hello", attachments: ["image-data"] });
    expect(app.attachments.hidden).toBe(true);

    app.setMode("running");
    app.prompt.value = "more";
    app.attachmentContents = ["attach"];
    app.attachments.hidden = false;
    app.attachments.append(document.createElement("span"));
    await app.submitPrompt();
    expect(String(globalThis.fetch.mock.calls.at(-1)[0])).toContain("/steer");
    expect(app.prompt.value).toBe("");

    globalThis.fetch = vi.fn(async () => err("steer fail"));
    app.setConnection = vi.fn();
    app.prompt.value = "bad";
    await app.submitSteeringPrompt("bad");
    expect(app.setConnection).toHaveBeenCalledWith("err");
  });

  it("runs shell commands through success, nonzero, and failure paths", async () => {
    const app = await connectPiApp();
    const form = document.createElement("form");
    form.innerHTML = `<input name="command"><button type="submit"></button>`;
    app.append(form);
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";
    app.loadRuntimeStatus = vi.fn();
    app.loadWorkspaceMeta = vi.fn();
    form.querySelector("input").value = "echo ok";
    globalThis.fetch = vi.fn(async () => ok({ exitCode: 0, durationMs: 1, output: "ok" }));

    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    expect(app.querySelector(".tool-card").dataset.status).toBe("ok");
    expect(form.querySelector("input").value).toBe("");

    form.querySelector("input").value = "false";
    globalThis.fetch = vi.fn(async () => ok({ exitCode: 2, durationMs: 2, output: "bad" }));
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    expect(app.querySelectorAll(".tool-card").item(1).dataset.status).toBe("err");

    form.querySelector("input").value = "empty";
    globalThis.fetch = vi.fn(async () => ok({ exitCode: 0, durationMs: 3, output: "" }));
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    expect([...app.querySelectorAll(".tool-card")].at(-1).textContent).toContain("[no output]");

    form.querySelector("input").value = "explode";
    globalThis.fetch = vi.fn(async () => err("shell failed"));
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    expect([...app.querySelectorAll(".tool-card")].at(-1).textContent).toContain("shell failed");
    form.querySelector("input").value = "throw-string";
    globalThis.fetch = vi.fn(async () => { throw "shell string failed"; });
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
    expect([...app.querySelectorAll(".tool-card")].at(-1).textContent).toContain("shell string failed");

    app.dataset.activeWorkspaceId = "";
    form.querySelector("input").value = "ignored";
    await app.submitShellCommand({ preventDefault: vi.fn(), currentTarget: form });
  });
});
