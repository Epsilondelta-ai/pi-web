import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputMethods } from "./input/input-methods";
import { speechMethods } from "./input/speech-methods";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./test-helper";
import { workspaceBootstrapMethods } from "./workspace/workspace-bootstrap-methods";

describe("performance split coverage", () => {
  beforeEach(installPiAppFixture);
  afterEach(async () => {
    cleanupPiAppFixture();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("covers lightweight input fallbacks before lazy speech loads", async () => {
    const app = await connectPiApp();
    const originalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: () => { throw new Error("blocked"); } } });
    expect(app.isWhisperModelCached("tiny")).toBe(false);
    Object.defineProperty(window, "localStorage", { configurable: true, value: originalStorage });

    const deleteWhisperModel = vi.fn();
    vi.doMock("./input/speech-methods", () => ({ speechMethods: { deleteWhisperModel } }));
    await inputMethods.deleteWhisperModel.call(app);
    expect(deleteWhisperModel).toHaveBeenCalled();
    vi.doUnmock("./input/speech-methods");
  });

  it("covers runtime plugin autoload when tests explicitly allow it", async () => {
    const testGlobal = globalThis as typeof globalThis & {
      __PI_WEB_DISABLE_AUTOMATIC_STARTUP__?: boolean;
      __PI_WEB_DISABLE_PLUGIN_AUTOLOAD__?: boolean;
    };
    testGlobal.__PI_WEB_DISABLE_AUTOMATIC_STARTUP__ = false;
    testGlobal.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = false;
    const app = document.querySelector("pi-app") as HTMLElement & {
      bound: boolean;
      bootstrapAPI: () => void;
      loadPlugins: () => Promise<void>;
      startRuntimeStatusPolling: () => void;
    };
    app.bound = false;
    app.bootstrapAPI = vi.fn();
    app.loadPlugins = vi.fn(async () => {
      throw new Error("autoload failed");
    });
    app.startRuntimeStatusPolling = vi.fn();

    try {
      await connectPiApp();
      await Promise.resolve();
      await Promise.resolve();
      expect(app.loadPlugins).toHaveBeenCalled();
      testGlobal.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = true;
      app.bound = false;
      app.loadPlugins = vi.fn(async () => undefined);
      await connectPiApp();
      expect(app.loadPlugins).not.toHaveBeenCalled();
    } finally {
      testGlobal.__PI_WEB_DISABLE_AUTOMATIC_STARTUP__ = true;
      testGlobal.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ = true;
    }
  });

  it("covers speech control without a mic button", async () => {
    const app = await connectPiApp();
    app.micButton = null;
    expect(() => speechMethods.syncSpeechInputControls.call(app)).not.toThrow();
  });

  it("covers workspace tree lazy mount guards and initial files", async () => {
    const rootHost = document.createElement("section") as HTMLElement & {
      workspaceFileStatuses?: Record<string, string>;
      workspaceFiles?: Array<{ path: string; type: string }>;
      workspaceTreeMounted?: boolean;
      workspaceTreeMounting?: boolean;
      workspaceTreeRoot?: { unmount?: () => void };
    };
    const initialRoot = document.createElement("div");
    initialRoot.dataset.workspaceTreeRoot = "";
    initialRoot.dataset.initialFiles = JSON.stringify([{ path: "README.md", type: "file" }]);
    rootHost.append(initialRoot);
    document.body.append(rootHost);
    await act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(rootHost);
    });
    expect(rootHost.workspaceTreeMounted).toBe(true);
    await act(async () => rootHost.workspaceTreeRoot?.unmount?.());
    rootHost.workspaceTreeMounted = false;
    initialRoot.dataset.initialFiles = "";
    await act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(rootHost);
    });
    await act(async () => rootHost.workspaceTreeRoot?.unmount?.());
    rootHost.workspaceTreeMounted = false;
    initialRoot.dataset.initialFiles = "not json";
    await act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(rootHost);
    });
    await act(async () => rootHost.workspaceTreeRoot?.unmount?.());
    rootHost.remove();

    const app = await connectPiApp();
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);

    const root = document.createElement("div");
    root.dataset.workspaceTreeRoot = "";
    root.dataset.initialFiles = "not json";
    app.append(root);
    app.workspaceTreeMounting = true;
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.workspaceTreeMounting = false;
    app.workspaceTreeMounted = true;
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.workspaceTreeMounted = false;
    await act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    });
    expect(app.workspaceTreeMounted).toBe(true);
    root.remove();
    const secondRoot = document.createElement("div");
    secondRoot.dataset.workspaceTreeRoot = "";
    app.append(secondRoot);
    app.workspaceTreeRoot = undefined;
    app.workspaceTreeMounted = false;
    await act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    });
    expect(app.workspaceTreeMounted).toBe(true);
    await act(async () => app.workspaceTreeRoot?.unmount?.());
    app.workspaceTreeMounted = false;
    secondRoot.remove();
    await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    app.append(root);
    app.workspaceTreeMounted = false;
    const mounting = act(async () => {
      await workspaceBootstrapMethods.ensureWorkspaceTreeMounted.call(app);
    });
    root.remove();
    await mounting;
    await act(async () => app.workspaceTreeRoot?.unmount?.());
    app.workspaceTreeMounted = false;
  });

  it("covers initial speech control branches", async () => {
    const app = await connectPiApp();
    app.speechMethodsLoaded = true;
    await app.ensureSpeechMethods();
    app.speechListening = true;
    app.enableSpeechInput = true;
    await act(async () => app.syncSpeechInputControls());
    expect(app.micButton.getAttribute("aria-pressed")).toBe("true");
    app.speechListening = false;
    app.syncSpeechInputControls();
    expect(app.micButton.getAttribute("aria-pressed")).toBe("false");
    const whisperSelect = document.createElement("select");
    whisperSelect.dataset.setting = "speechInput.whisperModel";
    whisperSelect.value = "unknown-model";
    app.append(whisperSelect);
    localStorage.setItem("pi-web:whisper-model:whisper-tiny", "1");
    expect(app.isWhisperModelCached("unknown-model")).toBe(true);
    const localWhisper = app.querySelector("[data-setting='speechInput.useLocalWhisper']") as HTMLInputElement;
    localStorage.removeItem("pi-web:whisper-model:whisper-tiny");
    localWhisper.checked = true;
    expect(app.refreshWhisperModelRequirement()).toBe(false);
    expect(app.querySelector("[data-action='download-whisper-model']")?.dataset.missing).toBe("true");
    localWhisper.checked = false;
    expect(app.refreshWhisperModelRequirement()).toBe(true);
    expect(app.querySelector("[data-action='download-whisper-model']")?.dataset.missing).toBe("false");
    app.querySelectorAll("[data-setting='speechInput.whisperModel']").forEach((item) => item.remove());
    app.whisperModel = "";
    expect(app.selectedWhisperModel()).toBe("tiny-q5");
    app.querySelector("[data-action='download-whisper-model']")?.remove();
    app.querySelector("[data-settings-form] button[type='submit']")?.remove();
    localWhisper.remove();
    expect(app.refreshWhisperModelRequirement()).toBe(true);
  });
});
