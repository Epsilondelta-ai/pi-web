import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("lazy speech startup", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("syncs speech settings before the lazy speech module is loaded", async () => {
    const app = await connectPiApp();
    app.settingsState = {
      project: {},
      global: {},
      effective: {
        enableSpeechInput: true,
        speechInput: { language: "ko-KR", useLocalWhisper: true, whisperModel: "tiny" },
        voice: {},
      },
      paths: {},
    };

    app.speechInputAllowed = () => true;
    expect(app.speechMethodsLoaded).not.toBe(true);
    app.syncSettingsStateToApp();

    expect(app.enableSpeechInput).toBe(true);
    expect(app.useLocalWhisper).toBe(true);
    expect(app.whisperModel).toBe("tiny");
    expect(app.querySelector(".mic-btn")?.hidden).toBe(false);
  });

  it("loads full speech methods on first mic action", async () => {
    const app = await connectPiApp();
    app.enableSpeechInput = true;
    app.speechInputAllowed = () => true;
    const startSpeechInput = vi.fn();
    vi.doMock("./speech-methods", () => ({ speechMethods: { startSpeechInput, toggleSpeechInput() { this.startSpeechInput(); } } }));

    await app.toggleSpeechInput();

    expect(app.speechMethodsLoaded).toBe(true);
    expect(startSpeechInput).toHaveBeenCalled();
    vi.doUnmock("./speech-methods");
  });

  it("loads full speech methods on first Whisper model actions", async () => {
    const app = await connectPiApp();
    const downloadWhisperModel = vi.fn();
    const deleteWhisperModel = vi.fn();
    vi.doMock("./speech-methods", () => ({ speechMethods: { downloadWhisperModel, deleteWhisperModel } }));

    await app.downloadWhisperModel();
    await app.deleteWhisperModel();

    expect(app.speechMethodsLoaded).toBe(true);
    expect(downloadWhisperModel).toHaveBeenCalled();
    expect(deleteWhisperModel).toHaveBeenCalled();
    vi.doUnmock("./speech-methods");
  });
});
