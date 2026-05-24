// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_DRAFT_STORAGE_KEY } from "../constants";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

const pipelineMock = vi.hoisted(() => vi.fn());
vi.mock("@huggingface/transformers", () => ({ pipeline: pipelineMock }));

describe("pi-app controls", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("enables send and shows slash commands as the prompt changes", async () => {
    const app = await connectPiApp();
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "/mo";
    prompt.dispatchEvent(new Event("input"));
    expect(app.querySelector(".send-btn").disabled).toBe(false);
    expect(app.querySelector(".slash-pop").hidden).toBe(false);
  });

  it("toggles voice input and writes speech recognition text into the prompt", async () => {
    vi.useFakeTimers();
    const instances = [];
    class MockSpeechRecognition {
      constructor() {
        instances.push(this);
      }
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn(() => this.onend?.());
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.speechLanguage = "ko-KR";
    app.syncSpeechInputControls();
    const mic = app.querySelector(".mic-btn");
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "기존";

    mic.click();
    const recognition = instances[0];
    expect(recognition.lang).toBe("ko-KR");
    expect(mic.classList.contains("listening")).toBe(true);
    recognition.onresult({
      resultIndex: 0,
      results: [{ 0: { transcript: "음성" }, isFinal: true }],
    });
    recognition.onresult({
      resultIndex: 0,
      results: [
        { 0: { transcript: "음성" }, isFinal: true },
        { 0: { transcript: " 입력" }, isFinal: false },
      ],
    });
    expect(prompt.value).toBe("기존 음성 입력");
    recognition.onresult({
      resultIndex: 0,
      results: [
        { 0: { transcript: "PR" }, isFinal: true },
        { 0: { transcript: "PR 올려" }, isFinal: false },
      ],
    });
    expect(prompt.value).toBe("기존 PR 올려");
    recognition.onresult({
      resultIndex: 1,
      results: [
        { 0: { transcript: "PR" }, isFinal: true },
        { 0: { transcript: " 올려" }, isFinal: true },
      ],
    });
    expect(prompt.value).toBe("기존 PR 올려");
    recognition.onresult({
      resultIndex: 0,
      results: [{ 0: { transcript: "다시" }, isFinal: false }],
    });
    expect(prompt.value).toBe("기존 다시");
    recognition.onerror({ error: "not-allowed" });
    expect(app.querySelector(".send-btn").disabled).toBe(false);

    recognition.onend();
    expect(mic.classList.contains("listening")).toBe(false);
    mic.click();
    expect(instances[1].start).toHaveBeenCalled();
    mic.click();
    expect(instances[1].stop).toHaveBeenCalled();

    mic.click();
    expect(instances[2].start).toHaveBeenCalled();
    mic.click();
    expect(instances[2].stop).toHaveBeenCalled();
    expect(mic.classList.contains("listening")).toBe(false);
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    vi.useRealTimers();
  });

  it("ignores speech input when disabled or prompt is missing", async () => {
    const app = await connectPiApp();
    app.speechInputAllowed = vi.fn(() => true);

    app.enableSpeechInput = false;
    app.startSpeechInput();
    expect(app.speechInputAllowed).not.toHaveBeenCalled();

    app.enableSpeechInput = true;
    app.prompt = null;
    app.startSpeechInput();
    expect(app.speechInputAllowed).not.toHaveBeenCalled();
  });

  it("blocks speech input outside HTTPS", async () => {
    const app = await connectPiApp();
    app.speechInputAllowed = () => false;
    app.enableSpeechInput = true;
    app.showSystemToast = vi.fn();

    app.startSpeechInput();

    expect(app.showSystemToast).toHaveBeenCalledWith(
      "warning",
      "음성 입력 HTTPS 필요",
      "음성 입력은 HTTPS에서만 사용할 수 있습니다.",
      "speech-input:insecure-context",
    );
  });

  it("covers speech recognition edge branches", async () => {
    vi.useFakeTimers();
    const instances = [];
    class MockSpeechRecognition {
      constructor() {
        instances.push(this);
      }
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn(() => this.onend?.());
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    const app = await connectPiApp();
    expect(app.speechInputAllowed()).toBe(false);
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.speechLanguage = "system";
    app.showSystemToast = vi.fn();

    app.startSpeechInput();
    const recognition = instances[0];
    expect(recognition.lang).toBe(navigator.language);
    recognition.onresult({ results: [{}] });
    expect(app.prompt.value).toBe("");
    recognition.onerror({ error: "no-speech" });
    recognition.onerror({ error: "aborted" });
    expect(app.showSystemToast).not.toHaveBeenCalled();
    recognition.onerror({});
    expect(app.showSystemToast).toHaveBeenCalledWith(
      "warning",
      "음성 입력 오류",
      "음성 입력을 시작하지 못했습니다.",
      "speech-input:error",
    );
    vi.advanceTimersByTime(2999);
    expect(recognition.stop).not.toHaveBeenCalled();
    recognition.onspeechstart();
    vi.advanceTimersByTime(3000);
    expect(recognition.stop).not.toHaveBeenCalled();
    recognition.onspeechend();
    vi.advanceTimersByTime(3000);
    expect(recognition.stop).toHaveBeenCalled();
    app.speechRecognition = recognition;
    app.speechSilenceTimer = null;
    recognition.onend();
    app.speechRecognition = recognition;
    app.stopSpeechInput();
    recognition.onerror({ error: "not-allowed" });
    expect(app.showSystemToast).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    vi.useRealTimers();
  });

  it("handles missing speech recognition support", async () => {
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.showSystemToast = vi.fn();

    app.startSpeechInput();

    expect(app.showSystemToast).toHaveBeenCalledWith(
      "warning",
      "음성 입력 미지원",
      "이 브라우저는 Web Speech API 음성 입력을 지원하지 않습니다. Chrome/Safari에서 사용하세요.",
      "speech-input:unsupported",
    );
  });

  it("handles speech recognition start failures", async () => {
    class ThrowingSpeechRecognition {
      start() {
        throw new Error("blocked");
      }
      stop = vi.fn();
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: ThrowingSpeechRecognition,
    });
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.showSystemToast = vi.fn();

    app.startSpeechInput();

    expect(app.speechListening).toBe(false);
    expect(app.speechRecognition).toBeNull();
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "음성 입력 오류", "blocked", "speech-input:start");

    class StringThrowingSpeechRecognition {
      start() {
        throw "string blocked";
      }
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: StringThrowingSpeechRecognition,
    });
    app.startSpeechInput();
    expect(app.showSystemToast).toHaveBeenCalledWith(
      "warning",
      "음성 입력 오류",
      "string blocked",
      "speech-input:start",
    );
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });

  it("handles local Whisper recorder setup failures", async () => {
    const app = await connectPiApp();
    app.showSystemToast = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    vi.stubGlobal("MediaRecorder", undefined);

    await app.startLocalWhisperInput();
    expect(app.showSystemToast).toHaveBeenCalledWith(
      "warning",
      "Whisper 녹음 미지원",
      "이 브라우저는 로컬 녹음을 지원하지 않습니다.",
      "speech-input:recorder",
    );

    vi.stubGlobal("MediaRecorder", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw "denied"; }) },
    });
    await app.startLocalWhisperInput();
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 녹음 오류", "denied", "speech-input:record");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error("blocked mic"); }) },
    });
    await app.startLocalWhisperInput();
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 녹음 오류", "blocked mic", "speech-input:record");
  });

  it("records local Whisper audio and writes the transcription", async () => {
    const chunks = [new Blob(["audio"], { type: "audio/webm" })];
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks };
    const instances = [];
    class MockMediaRecorder {
      constructor() {
        instances.push(this);
        this.state = "inactive";
      }
      start = vi.fn(() => {
        this.state = "recording";
        this.ondataavailable?.({ data: chunks[0] });
      });
      stop = vi.fn(() => {
        this.state = "inactive";
        this.onstop?.();
      });
    }
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.enableSpeechInput = true;
    app.useLocalWhisper = true;
    app.loadWhisperPipeline = vi.fn(async () => vi.fn(async () => ({ text: "로컬 위스퍼" })));
    app.prompt.value = "기존";

    app.startSpeechInput();
    await Promise.resolve();
    instances[0].ondataavailable?.({ data: new Blob([]) });
    expect(instances[0].start).toHaveBeenCalled();
    expect(app.speechListening).toBe(true);
    app.stopSpeechInput();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(app.prompt.value).toBe("기존 로컬 위스퍼");
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("transcribed");
  });

  it("loads local Whisper models and reports progress", async () => {
    const transcriber = vi.fn(async () => [{ text: "배열" }, { text: "" }, { text: "결과" }]);
    class MockAudioContext {
      async decodeAudioData() {
        return {
          length: 2,
          numberOfChannels: 2,
          sampleRate: 8000,
          getChannelData: (channel) => channel === 0 ? new Float32Array([0.2, 0.4]) : new Float32Array([0.6, 0.8]),
        };
      }
      close = vi.fn(async () => undefined);
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    pipelineMock.mockImplementation(async (_task, _model, options) => {
      options.progress_callback();
      options.progress_callback({ status: "progress", file: "a", progress: 80, loaded: 80, total: 100 });
      options.progress_callback({ status: "progress", file: "b", progress: 10, loaded: 10, total: 100 });
      options.progress_callback({ status: "progress", file: "a", progress: 60, loaded: 60, total: 100 });
      options.progress_callback({ status: "ready" });
      return transcriber;
    });
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    const app = await connectPiApp();
    app.whisperModel = "unknown";
    app.prompt.value = "기존";

    const loaded = await app.loadWhisperPipeline();
    expect(loaded).toBe(transcriber);
    expect(pipelineMock).toHaveBeenCalledWith(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      expect.objectContaining({ dtype: "q4", device: "webgpu" }),
    );
    expect(app.whisperProgressLoaded).toBe(90);
    expect(app.whisperProgressText({ status: "progress", name: "c", progress: 30 })).toBe("downloading unknown: 45%");
    expect(app.whisperProgressText({ status: "progress", url: "d", progress: 120 })).toBe("downloading unknown: 45%");
    app.resetWhisperProgress();
    expect(app.whisperProgressText({ status: "progress", progress: 120 })).toBe("downloading unknown: 100%");
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("ready: unknown ~31MB");
    await app.updateWhisperCacheStatus();
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("downloaded: unknown ~31MB");
    expect(await app.loadWhisperPipeline()).toBe(transcriber);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    app.whisperLoadingKey = app.whisperPipelineKey;
    app.whisperLoadingPromise = Promise.resolve("loading-pipeline");
    expect(await app.loadWhisperPipeline()).toBe(transcriber);
    app.whisperPipeline = null;
    expect(await app.loadWhisperPipeline()).toBe("loading-pipeline");
    app.whisperLoadingPromise = null;
    app.whisperLoadingKey = "";

    app.speechLanguage = "ko-KR";
    await app.transcribeWhisperRecording([new Blob(["x"])]);
    expect(transcriber).toHaveBeenLastCalledWith(expect.any(Float32Array), { language: "ko", task: "transcribe" });
    expect([...transcriber.mock.calls.at(-1)[0]]).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.4666667),
      expect.closeTo(0.5333333),
      expect.closeTo(0.6),
    ]);
    expect(app.prompt.value).toBe("기존 배열  결과");
    app.whisperModel = "medium";
    await app.transcribeWhisperRecording([new Blob(["x"])]);
    expect(transcriber).toHaveBeenLastCalledWith(expect.any(Float32Array), {});
    class MockAudioContext16k {
      async decodeAudioData() {
        return {
          length: 1,
          numberOfChannels: 0,
          sampleRate: 16000,
          getChannelData: () => new Float32Array([0.25]),
        };
      }
      close = vi.fn(async () => undefined);
    }
    vi.stubGlobal("AudioContext", MockAudioContext16k);
    await app.transcribeWhisperRecording([new Blob(["x"])]);
    expect([...transcriber.mock.calls.at(-1)[0]]).toEqual([expect.closeTo(0.25)]);
    pipelineMock.mockImplementationOnce(async () => vi.fn(async () => ({})));
    app.whisperPipeline = null;
    app.whisperPipelineKey = "";
    app.whisperModel = "tiny";
    await app.loadWhisperPipeline();
    await app.transcribeWhisperRecording([new Blob(["x"], { type: "audio/webm" })]);
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    app.whisperPipeline = null;
    app.whisperPipelineKey = "";
    app.whisperModel = "base";
    pipelineMock.mockImplementationOnce(async (_task, _model, options) => {
      options.progress_callback({});
      return vi.fn(async () => ({ text: "" }));
    });
    await app.loadWhisperPipeline();
    expect(pipelineMock).toHaveBeenLastCalledWith(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
      expect.not.objectContaining({ dtype: expect.anything(), device: expect.anything() }),
    );
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    app.whisperStatusFrame = null;
    app.whisperStatusPending = null;
    app.setWhisperStatus("downloading base: 1%");
    app.queueWhisperStatus("downloading base: 1%");
    frames.shift()?.(Date.now());
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("downloading base: 1%");
    app.whisperStatusLastAt = Date.now();
    app.queueWhisperStatus("downloading base: 2%");
    frames.shift()?.(Date.now());
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("downloading base: 1%");
    app.whisperStatusLastAt = 0;
    while (frames.length) frames.shift()?.(Date.now() + 250);
    app.setWhisperStatus("downloading base: 2%");
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("downloading base: 2%");
    app.querySelector("[data-whisper-status]").remove();
    expect(() => app.setWhisperStatus("hidden")).not.toThrow();
  });

  it("handles local Whisper model actions", async () => {
    const app = await connectPiApp();
    app.whisperModel = "tiny";
    app.whisperPipeline = vi.fn();
    app.whisperPipelineKey = "old";
    app.loadWhisperPipeline = vi.fn(async () => "pipeline");

    app.querySelector("[data-action='download-whisper-model']").click();
    await Promise.resolve();
    expect(app.loadWhisperPipeline).toHaveBeenCalled();

    app.querySelector("[data-action='delete-whisper-model']").click();
    app.whisperPipeline = vi.fn();
    app.whisperLoadingPromise = Promise.resolve("loading");
    await app.deleteWhisperModel();
    await app.updateWhisperCacheStatus();
    expect(app.whisperPipeline).not.toBeNull();
    app.whisperLoadingPromise = null;
    await app.deleteWhisperModel();
    const modelRequest = { url: "https://huggingface.co/onnx-community/whisper-tiny/resolve/main/model.onnx" };
    const otherRequest = { url: "https://example.test/other" };
    const cache = {
      keys: vi.fn(async () => [modelRequest, otherRequest]),
      delete: vi.fn(async () => true),
    };
    globalThis.caches = {
      keys: vi.fn(async () => ["transformers-cache", "other"]),
      open: vi.fn(async () => cache),
    };
    await app.deleteWhisperModel();
    expect(app.whisperPipeline).toBeNull();
    expect(cache.delete).toHaveBeenCalledWith(modelRequest);
    expect(cache.delete).not.toHaveBeenCalledWith(otherRequest);
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("model cache cleared");
    await app.updateWhisperCacheStatus();
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("downloaded: tiny ~75MB");
    globalThis.caches.keys = vi.fn(async () => ["other"]);
    cache.keys = vi.fn(async () => [otherRequest, null]);
    await app.updateWhisperCacheStatus();
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("not downloaded");
    globalThis.caches.keys = vi.fn(async () => { throw new Error("blocked"); });
    expect(await app.isWhisperModelCached("tiny")).toBe(false);
    globalThis.caches.keys = vi.fn(async () => ["onnx-community/whisper-tiny-cache"]);
    expect(await app.isWhisperModelCached("tiny")).toBe(true);
    globalThis.caches.keys = vi.fn(async () => ["other"]);
    cache.keys = vi.fn(async () => ["https://huggingface.co/onnx-community/whisper-tiny/resolve/main/tokenizer.json"]);
    expect(await app.isWhisperModelCached("tiny")).toBe(true);
    delete globalThis.caches;
    expect(await app.isWhisperModelCached("tiny")).toBe(false);
    await app.updateWhisperCacheStatus();
    expect(app.querySelector("[data-whisper-status]").textContent).toBe("cache status unavailable");
  });

  it("handles local Whisper failures", async () => {
    const app = await connectPiApp();
    app.showSystemToast = vi.fn();
    app.setWhisperStatus = vi.fn();
    app.loadWhisperPipeline = vi.fn(async () => { throw new Error("model failed"); });

    await app.downloadWhisperModel();
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 다운로드 오류", "model failed", "speech-input:download");
    app.loadWhisperPipeline = vi.fn(async () => { throw "download failed"; });
    await app.downloadWhisperModel();
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 다운로드 오류", "download failed", "speech-input:download");

    app.loadWhisperPipeline = vi.fn(async () => { throw new Error("model failed"); });
    await app.transcribeWhisperRecording([new Blob(["x"])]);
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 변환 오류", "model failed", "speech-input:whisper");
    app.loadWhisperPipeline = vi.fn(async () => { throw "transcribe failed"; });
    await app.transcribeWhisperRecording([new Blob(["x"])]);
    expect(app.showSystemToast).toHaveBeenCalledWith("warning", "Whisper 변환 오류", "transcribe failed", "speech-input:whisper");
    await app.transcribeWhisperRecording([]);
    app.prompt = null;
    await app.transcribeWhisperRecording([new Blob(["x"])]);
  });

  it("restores unsent prompt text and clears the draft on send", async () => {
    const app = await connectPiApp();
    const prompt = app.querySelector(".prompt-textarea");
    localStorage.setItem(PROMPT_DRAFT_STORAGE_KEY, "saved draft");
    app.restorePromptDraft();
    expect(prompt.value).toBe("saved draft");

    prompt.value = "new draft";
    prompt.dispatchEvent(new Event("input"));
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBe("new draft");

    prompt.value = "";
    prompt.dispatchEvent(new Event("input"));
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBeNull();

    prompt.value = "send me";
    prompt.dispatchEvent(new Event("input"));
    app.apiConnected = false;
    app.sendButton.click();
    expect(localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY)).toBeNull();

    app.prompt = null;
    expect(() => app.restorePromptDraft()).not.toThrow();
    expect(() => app.savePromptDraft()).not.toThrow();
  });

  it("keeps send and stop as separate running controls", async () => {
    const app = await connectPiApp();
    const send = app.querySelector(".send-btn");
    const stop = app.querySelector(".stop-btn");

    app.setMode("running");
    expect(stop.hidden).toBe(false);
    expect(send.textContent).toBe("send");
    expect(send.disabled).toBe(true);

    app.prompt.value = "one more thing";
    app.updatePrompt();
    expect(send.disabled).toBe(false);

    app.setMode("idle");
    expect(stop.hidden).toBe(true);
  });

  it("renders global and project slash commands", async () => {
    const app = await connectPiApp();
    app.renderSlashCommands([
      { command: "/team", description: "global team", source: "extension", scope: "global" },
      { command: "/review", description: "project review", source: "prompt", scope: "project" },
    ]);
    const items = [...app.querySelectorAll(".slash-item")];
    expect(items.map((item) => item.dataset.slash)).toEqual(["/team", "/review"]);
    expect(items[0].querySelector(".sl-scope").textContent).toBe("global");
    expect(items[1].querySelector(".sl-scope").textContent).toBe("project");
  });

  it("renders the compact prompt status line from runtime status", async () => {
    const app = await connectPiApp();
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("— | —");
    app.updatePromptMeta({
      model: "GPT-5.5",
      thinkingLevel: "high",
      fiveHourQuota: 84,
      weeklyQuota: 14,
      currentBranch: "feature/ui",
    });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe(
      "GPT-5.5 (high) | 5h (84%) | Week (14%) | feature/ui",
    );
    expect(app.querySelector(".prompt-meta-battery-full svg")).not.toBeNull();
    expect(app.querySelector(".prompt-meta-battery-low svg")).not.toBeNull();
    expect(app.querySelector(".prompt-meta-branch svg")).not.toBeNull();
    app.updatePromptMeta({ fiveHourQuota: 20, weeklyQuota: 21 });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe(
      "GPT-5.5 (high) | 5h (20%) | Week (21%) | feature/ui",
    );
    expect(app.querySelector(".prompt-meta-battery-low svg")).not.toBeNull();
    app.runtimeStatus = {};
    app.updatePromptMeta({ model: "Claude", thinkingLevel: "off", currentBranch: "main" });
    expect(app.querySelector("[data-prompt-meta]").textContent).toBe("Claude (off) | main");
  });

  it("opens and saves workspace settings from the settings modal", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/auth/providers")) {
          return { providers: [{ id: "anthropic", name: "Anthropic", configured: false }], path: "/home/me/.pi/agent/auth.json" };
        }
        if (String(url).endsWith("/auth/oauth/providers")) {
          return { providers: [{ id: "openai-codex", name: "ChatGPT Plus/Pro", configured: false }] };
        }
        if (String(url).endsWith("/models")) {
          return { providers: [{ id: "zai", models: [{ id: "gpt-5.5", provider: "zai" }] }] };
        }
        if (String(url).endsWith("/auth/oauth/start")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "waiting", authUrl: "https://login.test", progress: [] } };
        }
        if (String(url).endsWith("/auth/oauth/sessions/oauth-1/input")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "success", progress: [] } };
        }
        if (String(url).endsWith("/auth/oauth/sessions/oauth-1")) {
          return { session: { id: "oauth-1", provider: "openai-codex", status: "success", progress: [] } };
        }
        if (String(url).endsWith("/auth/api-key")) {
          return { provider: { id: "anthropic", name: "Anthropic", configured: true, source: "api_key" } };
        }
        if (String(url).endsWith("/settings") && options.method === "PUT") {
          return { settings: { project: JSON.parse(options.body).settings, effective: {}, paths: {} } };
        }
        if (String(url).endsWith("/settings")) {
          return {
            settings: {
              global: { theme: "dark" },
              project: { defaultProvider: "zai", defaultModel: "gpt-5.5" },
              effective: {
                theme: "dark",
                defaultProvider: "zai",
                defaultModel: "gpt-5.5",
                compaction: { enabled: true },
                readResponsesAloud: true,
                enableSpeechInput: true,
                speechInput: { useLocalWhisper: true, whisperModel: "base" },
                speechLanguage: "ko-KR",
              },
              paths: { project: "/demo/.pi/settings.json", global: "/home/me/.pi/agent/settings.json" },
            },
          };
        }
        return { workspaces: [] };
      },
    }));
    const app = await connectPiApp();
    app.speechInputAllowed = () => true;
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.openSettingsModal();
    expect(app.querySelector("[data-settings-modal]").hidden).toBe(false);
    expect(app.querySelector("[data-settings-path]").textContent).toBe("/demo/.pi/settings.json");
    expect(app.querySelector("[data-setting='defaultProvider']").value).toBe("zai");
    expect(app.querySelector("[data-setting='defaultModel']").value).toBe("gpt-5.5");
    expect(app.querySelector("[data-setting='readResponsesAloud']").type).toBe("checkbox");
    expect(app.querySelector("[data-setting='readResponsesAloud']").checked).toBe(true);
    expect(app.querySelector("[data-setting='enableSpeechInput']").checked).toBe(true);
    expect(app.querySelector("[data-setting='speechLanguage']").value).toBe("ko-KR");
    expect(app.querySelector("[data-setting='speechInput.useLocalWhisper']").checked).toBe(true);
    expect(app.querySelector("[data-setting='speechInput.whisperModel']").value).toBe("base");
    app.updateWhisperCacheStatus = vi.fn();
    const whisperSelect = app.querySelector("[data-setting='speechInput.whisperModel']");
    whisperSelect.value = "tiny";
    whisperSelect.dispatchEvent(new Event("change"));
    expect(app.whisperModel).toBe("tiny");
    expect(app.updateWhisperCacheStatus).toHaveBeenCalled();
    whisperSelect.prepend(new Option("", ""));
    whisperSelect.value = "";
    whisperSelect.dispatchEvent(new Event("change"));
    expect(app.whisperModel).toBe("tiny-q5");
    app.querySelector("[data-setting='speechInput.whisperModel']").value = "base";
    app.whisperModel = "base";
    expect(app.readResponsesAloud).toBe(true);
    expect(app.enableSpeechInput).toBe(true);
    expect(app.useLocalWhisper).toBe(true);
    expect(app.whisperModel).toBe("base");
    expect(app.querySelector(".mic-btn").hidden).toBe(false);
    expect(app.speechLanguage).toBe("ko-KR");
    expect(app.querySelector("[data-setting='theme']")).toBeNull();
    expect(app.querySelector("[data-setting='transport']")).toBeNull();
    expect(app.querySelector("[data-auth-provider]").value).toBe("anthropic");
    expect(app.querySelector("[data-oauth-provider]").value).toBe("openai-codex");

    await app.startOAuthLogin();
    expect(app.querySelector("[data-oauth-link]").href).toBe("https://login.test/");
    app.querySelector("[data-oauth-input]").value = "code";
    await app.sendOAuthInput();
    expect(app.querySelector("[data-oauth-status]").textContent).toBe("OAuth login saved");

    app.querySelector("[data-auth-api-key]").value = "sk-test";
    await app.saveAuthForm(new Event("submit"));
    const authCall = globalThis.fetch.mock.calls.find(([url]) => String(url).endsWith("/auth/api-key"));
    expect(JSON.parse(authCall[1].body)).toEqual({ provider: "anthropic", apiKey: "sk-test" });
    expect(app.querySelector("[data-auth-api-key]").value).toBe("");

    app.querySelector("[data-setting='defaultModel']").value = "custom";
    app.querySelector("[data-setting='defaultModel']").dispatchEvent(new Event("change"));
    app.querySelector("[data-custom-setting='defaultModel']").value = "my-model";
    app.querySelector("[data-setting='compaction.enabled']").value = "false";
    app.querySelector("[data-setting='readResponsesAloud']").checked = true;
    app.querySelector("[data-setting='enableSpeechInput']").checked = true;
    app.querySelector("[data-setting='speechInput.useLocalWhisper']").checked = true;
    app.querySelector("[data-setting='speechInput.whisperModel']").value = "tiny";
    app.querySelector("[data-setting='speechLanguage']").value = "ja-JP";
    await app.saveSettingsForm(new Event("submit"));
    const putCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(putCall[1].body)).toMatchObject({
      scope: "project",
      settings: {
        defaultModel: "my-model",
        compaction: { enabled: false },
        readResponsesAloud: true,
        enableSpeechInput: true,
        speechInput: { useLocalWhisper: true, whisperModel: "tiny" },
        speechLanguage: "ja-JP",
      },
    });
  });

  it("hides voice input setting and skips saving it outside https", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options = {}) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (String(url).endsWith("/auth/providers")) return { providers: [] };
        if (String(url).endsWith("/auth/oauth/providers")) return { providers: [] };
        if (String(url).endsWith("/models")) return { providers: [] };
        if (String(url).endsWith("/settings") && options.method === "PUT") {
          return { settings: { project: JSON.parse(options.body).settings, effective: {}, paths: {} } };
        }
        if (String(url).endsWith("/settings")) {
          return {
            settings: {
              global: {},
              project: {},
              effective: { enableSpeechInput: true, speechLanguage: "ko-KR" },
              paths: {},
            },
          };
        }
        return {};
      },
    }));
    const app = await connectPiApp();
    app.speechInputAllowed = () => false;
    app.apiConnected = true;
    app.dataset.activeWorkspaceId = "w1";

    await app.openSettingsModal();
    const field = app.querySelector("[data-setting='enableSpeechInput']").closest(".settings-field");
    expect(field.hidden).toBe(true);
    expect(app.enableSpeechInput).toBe(false);
    expect(app.querySelector(".mic-btn").hidden).toBe(true);

    await app.saveSettingsForm(new Event("submit"));
    const putCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PUT");
    const settings = JSON.parse(putCall[1].body).settings;
    expect(settings).not.toHaveProperty("enableSpeechInput");
    expect(settings).not.toHaveProperty("speechInput");
  });

  it("sets app height from the visual viewport for mobile browser chrome", async () => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 567,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    installPiAppFixture();
    const app = await connectPiApp();
    expect(app.style.getPropertyValue("--app-viewport-height")).toBe("567px");
  });

  it("toggles the mobile sidebar drawer from the hamburger button", async () => {
    const app = await connectPiApp();
    const hamburger = app.querySelector(".hamburger");
    const body = app.querySelector(".app-body");
    hamburger.click();
    expect(body.classList.contains("drawer-open")).toBe(true);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");
    expect(hamburger.getAttribute("aria-label")).toBe("close sidebar");
    hamburger.click();
    expect(body.classList.contains("drawer-open")).toBe(false);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
    expect(hamburger.getAttribute("aria-label")).toBe("open sidebar");
  });

  it("renders a terminal dot spinner and advances its frame", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    const spinner = app.querySelector(".spinner");
    expect(spinner.children).toHaveLength(6);
    app.tickSpinners();
    expect(spinner.dataset.frame).toBe("1");
  });

  it("switches between picker and workspace routes", async () => {
    const app = await connectPiApp();
    app.route("picker");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(false);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(true);
    app.route("workspace");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(true);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(false);
  });

  it("closes the file tree when clicking outside it", async () => {
    const app = await connectPiApp();
    const body = app.querySelector(".app-body");
    const tree = app.querySelector(".tree");
    const main = app.querySelector("main");

    app.toggleTree(true);
    tree.click();
    expect(app.dataset.tree).toBe("on");

    main.click();
    expect(app.dataset.tree).toBe("off");
    expect(body.classList.contains("tree-open")).toBe(false);
    expect(tree.hidden).toBe(true);
  });

  it("keeps the file tree open when an inside click removes its target", async () => {
    const app = await connectPiApp();
    const tree = app.querySelector(".tree");
    const removable = document.createElement("button");
    removable.type = "button";
    removable.addEventListener("click", () => removable.remove());
    tree.append(removable);

    app.toggleTree(true);
    removable.click();

    expect(app.dataset.tree).toBe("on");
    expect(tree.hidden).toBe(false);
  });

  it("refreshes workspaces from the sidebar refresh button", async () => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        workspaces: [{ id: "w1", name: "demo", path: "/demo", sessionCount: 0, sessions: [] }],
      }),
    }));
    const app = await connectPiApp();
    app.apiConnected = true;

    await app.refreshWorkspaces();

    expect(globalThis.fetch).toHaveBeenCalledWith("http://backend.test/api/workspaces", expect.any(Object));
    expect(app.querySelector("[data-workspace-group='w1'] .label").textContent).toBe("demo");
  });
});
