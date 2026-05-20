// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

function ok(body = {}) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function err(message = "boom") {
  return { ok: false, status: 500, statusText: "ERR", json: async () => ({ error: message }) };
}

describe("pi-app input actions coverage", () => {
  beforeEach(() => {
    installPiAppFixture();
    globalThis.PI_WEB_API_BASE = "http://backend.test";
  });
  afterEach(cleanupPiAppFixture);

  it("dispatches click actions and list navigation", async () => {
    const app = await connectPiApp();
    const calls = [];
    [
      "route", "refreshWorkspaces", "browseFolder", "loadFolder", "openWorkspacePath", "toggleTree", "refreshTree",
      "toggleTreeNode", "openFile", "closeFilePreview", "toggleFilePreviewMode", "saveFilePreview", "collapseSidebar",
      "toggleDrawer", "toggleTool", "showFullToolOutput", "toggleWorkspace", "deleteWorkspace", "deleteWorkspaceSessions",
      "newSession", "toggleSessionMenu", "renameSession", "deleteSession", "submitFallbackChoice", "showUpdateTip", "openSettingsModal",
      "closeSettingsModal", "saveSettingsForm", "pickSession", "openWorkspace", "fillPrompt", "pickSlash",
    ].forEach((name) => { app[name] = (...args) => calls.push([name, ...args]); });
    app.currentFolder = "/cwd";
    app.currentFolderParent = "/";
    const actions = [
      "route-picker", "route-workspace", "refresh-workspaces", "browse-folder", "folder-enter", "folder-up",
      "folder-open-current", "toggle-tree", "refresh-tree", "toggle-tree-node", "open-file", "close-file-preview",
      "toggle-file-preview-mode", "save-file-preview", "collapse-sidebar", "expand-sidebar", "open-drawer", "close-drawer",
      "toggle-tool", "show-full-tool-output", "toggle-workspace", "delete-workspace", "delete-workspace-sessions", "new-session",
      "session-menu-toggle", "rename-session", "delete-session", "show-update-tip", "open-settings", "close-settings", "save-settings",
    ];
    for (const action of actions) {
      const row = document.createElement("div");
      row.className = "session-row";
      row.dataset.session = "s1";
      const button = document.createElement("button");
      button.dataset.action = action;
      button.dataset.workspace = "w1";
      button.dataset.path = "/p";
      row.append(button);
      app.append(row);
      button.click();
    }
    const recent = document.createElement("button");
    recent.className = "recent-row";
    recent.dataset.workspace = "w1";
    app.append(recent);
    recent.click();
    const seed = document.createElement("button");
    seed.dataset.seed = "seed";
    app.append(seed);
    seed.click();
    const skill = document.createElement("button");
    skill.dataset.skill = "worker";
    app.append(skill);
    skill.click();
    const slash = document.createElement("button");
    slash.dataset.slash = "/model";
    app.append(slash);
    slash.click();

    const insideSpan = document.createElement("span");
    app.append(insideSpan);
    app.handleAppClick({ target: insideSpan });
    app.handleAppClick({ target: document.createElement("span") });
    const outsideButton = document.createElement("button");
    app.handleAppClick({ target: outsideButton });
    const spanAction = document.createElement("span");
    spanAction.dataset.action = "route-picker";
    app.append(spanAction);
    app.handleAppClick({ target: spanAction });
    const fallbackButton = document.createElement("button");
    fallbackButton.dataset.action = "fallback-choice";
    fallbackButton.dataset.choiceId = "c";
    fallbackButton.dataset.choiceValue = "v";
    const fallbackPanel = document.createElement("div");
    fallbackPanel.className = "fallback-choice-list";
    fallbackPanel.append(fallbackButton);
    app.append(fallbackPanel);
    fallbackButton.click();
    const tweaks = document.createElement("div");
    tweaks.dataset.tweaks = "";
    app.append(tweaks);
    const closeTweaks = document.createElement("button");
    closeTweaks.dataset.action = "close-tweaks";
    app.append(closeTweaks);
    closeTweaks.click();
    const sessionButton = document.createElement("button");
    sessionButton.dataset.session = "solo";
    app.append(sessionButton);
    sessionButton.click();

    const chip = document.createElement("span");
    chip.className = "attach-chip";
    chip.dataset.attachmentIndex = "0";
    chip.innerHTML = `<button data-remove-attachment></button>`;
    app.attachmentContents = ["x"];
    app.append(chip);
    chip.querySelector("button").click();
    expect(app.attachmentContents[0]).toBe("");
    const badChip = document.createElement("span");
    badChip.className = "attach-chip";
    badChip.dataset.attachmentIndex = "bad";
    badChip.innerHTML = `<button data-remove-attachment></button>`;
    app.append(badChip);
    badChip.querySelector("button").click();
    expect(calls.some(([name]) => name === "newSession")).toBe(true);

    Element.prototype.scrollIntoView = vi.fn();
    const event = { preventDefault: vi.fn(), key: "ArrowDown" };
    app.navigateList(event, ".slash-item", (item) => calls.push(["nav", item.dataset.slash]));
    app.navigateList({ ...event, key: "ArrowUp" }, ".slash-item", () => {});
    app.navigateList({ ...event, key: "Enter" }, ".slash-item", (item) => calls.push(["enter", item.dataset.slash]));
    app.navigateList({ preventDefault: vi.fn(), key: "Enter" }, ".missing-item", vi.fn());
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("submits fallback choices and renders slash command variants", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    const panel = document.createElement("div");
    panel.className = "fallback-choice-list";
    panel.innerHTML = `<button></button><input><div class="choice-custom"><input data-choice-custom-input value="custom"></div>`;
    globalThis.fetch = vi.fn(async () => ok({ accepted: true }));
    await app.submitFallbackChoice("id", "yes", panel);
    expect(panel.classList.contains("answered")).toBe(true);
    expect(panel.querySelector("button").disabled).toBe(true);

    globalThis.fetch = vi.fn(async () => err("prompt failed"));
    app.setConnection = vi.fn();
    await app.submitFallbackChoice("id", "no", panel);
    expect(app.setConnection).toHaveBeenCalledWith("err");

    const detached = document.createElement("pi-app");
    detached.renderSlashCommands([]);
    detached.fillPrompt("ignored");
    await app.submitFallbackChoice("", "", null);
    app.renderSlashCommands([
      { command: "/one", description: "one", scope: "project", source: "prompt" },
      { cmd: "/two", desc: "two", location: "global" },
      { name: "three" },
      { name: undefined },
    ]);
    expect([...app.querySelectorAll(".slash-item")].map((item) => item.dataset.slash)).toEqual(["/one", "/two", "/three"]);
    app.prompt.value = "/tw";
    app.updatePrompt();
    expect(app.querySelector(".slash-pop").hidden).toBe(false);
    app.pickSlash("/one");
    expect(app.prompt.value).toBe("/one ");

    app.querySelector(".slash-list").replaceChildren();
    app.renderSlashCommands([]);
    expect(app.querySelector(".slash-empty").textContent).toBe("no slash commands found");
  });

  it("cancels active sessions", async () => {
    const app = await connectPiApp();
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    globalThis.fetch = vi.fn(async () => ok({ cancelled: true }));
    await app.cancelActiveSession();
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain("/cancel");
    globalThis.fetch = vi.fn(async () => err("cancel failed"));
    app.setConnection = vi.fn();
    await app.cancelActiveSession();
    expect(app.setConnection).toHaveBeenCalledWith("err");
    app.apiConnected = false;
    await app.cancelActiveSession();
  });
});
