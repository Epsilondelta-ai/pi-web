type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }> }) => void) | null;
  onspeechend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onstart: (() => void) | null;
  piManualStop?: boolean;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function mergeSpeechTranscript(current, next) {
  const incoming = String(next || "");
  if (!current || !incoming) return current || incoming;
  const maxOverlap = Math.min(current.length, incoming.length);
  for (let size = maxOverlap; size >= 2; size -= 1) {
    if (current.endsWith(incoming.slice(0, size))) return current + incoming.slice(size);
  }
  return current + incoming;
}

function composeSpeechSegments(segments) {
  return segments.reduce((text, segment) => mergeSpeechTranscript(text, segment?.text), "");
}

const WHISPER_MODELS = {
  "tiny-q5": { id: "whisper-tiny", size: "~30MB" },
  tiny: { id: "whisper-tiny", size: "~30MB" },
  "base-q5": { id: "whisper-base", size: "~70MB" },
  base: { id: "whisper-base", size: "~70MB" },
  "small-q5": { id: "whisper-small", size: "~240MB" },
  small: { id: "whisper-small", size: "~240MB" },
  "medium-q5": { id: "whisper-small", size: "~240MB" },
  medium: { id: "whisper-small", size: "~240MB" },
  "large-v3-q5": { id: "whisper-large", size: "~1.5GB" },
  "large-v3": { id: "whisper-large", size: "~1.5GB" },
};

function whisperPreset(name) {
  return WHISPER_MODELS[name] || WHISPER_MODELS["tiny-q5"];
}

function whisperTranscriptionOptions(model, speechLanguage) {
  return {
    model: whisperPreset(model).id,
    language: speechLanguage === "system" ? undefined : speechLanguage.slice(0, 2),
    onProgress: undefined,
  };
}

function whisperCacheMarkerKey(model) {
  return `pi-web:whisper-model:${whisperPreset(model).id}`;
}

function reportSpeechWarning(host, title, detail) {
  host.setWhisperStatus?.(`${title}: ${detail}`, true);
  console.warn(`${title}: ${detail}`);
}

function appendTranscriptToPrompt(prompt, basePrompt, transcript) {
  const cleanTranscript = String(transcript || "").trimStart();
  const needsSpace = basePrompt
    && cleanTranscript
    && !/\s$/.test(basePrompt)
    && !/^[\s.,!?;:)]/.test(cleanTranscript);
  prompt.value = `${basePrompt}${needsSpace ? " " : ""}${cleanTranscript}`;
}

export const speechMethods = {
  toggleSpeechInput() {
    if (this.speechListening) {
      this.stopSpeechInput();
      return;
    }
    this.startSpeechInput();
  },

  speechInputAllowed() {
    return window.isSecureContext === true;
  },

  startSpeechInput() {
    if (!this.enableSpeechInput || !this.prompt) return;
    if (this.speechInputAllowed?.() !== true) {
      reportSpeechWarning(
        this,
        "음성 입력 보안 컨텍스트 필요",
        "음성 입력은 HTTPS 또는 localhost 같은 보안 컨텍스트에서만 사용할 수 있습니다.",
      );
      return;
    }
    if (this.useLocalWhisper) {
      void this.startLocalWhisperInput();
      return;
    }
    this.startWebSpeechInput();
  },

  startWebSpeechInput() {
    const SpeechRecognition = (window as SpeechRecognitionWindow).SpeechRecognition
      || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reportSpeechWarning(
        this,
        "음성 입력 미지원",
        "이 브라우저는 Web Speech API 음성 입력을 지원하지 않습니다. Chrome/Safari에서 사용하세요.",
      );
      return;
    }
    this.stopSpeechInput();
    const recognition = new SpeechRecognition();
    const basePrompt = this.prompt.value;
    const resultSegments = [];
    const clearSilenceTimer = () => {
      if (!this.speechSilenceTimer) return;
      clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
    };
    const resetSilenceTimer = () => {
      clearSilenceTimer();
      this.speechSilenceTimer = setTimeout(() => this.stopSpeechInput(), 3000);
    };
    const applyTranscript = (transcript = "") => {
      appendTranscriptToPrompt(this.prompt, basePrompt, transcript);
      this.updatePrompt();
    };
    recognition.lang = this.speechLanguage === "system" ? navigator.language : this.speechLanguage;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
      this.speechRecognition = recognition;
      this.speechListening = true;
      this.syncSpeechInputControls();
      resetSilenceTimer();
    };
    recognition.onspeechstart = clearSilenceTimer;
    recognition.onspeechend = resetSilenceTimer;
    recognition.onresult = (event) => {
      const resultIndex = Number.isInteger(event.resultIndex) ? event.resultIndex : 0;
      resultSegments.length = event.results.length;
      for (let index = resultIndex; index < event.results.length; index += 1) {
        resultSegments[index] = {
          isFinal: event.results[index]?.isFinal === true,
          text: event.results[index]?.[0]?.transcript || "",
        };
      }
      applyTranscript(composeSpeechSegments(resultSegments));
    };
    recognition.onerror = (event) => {
      if (!recognition.piManualStop && event.error !== "no-speech" && event.error !== "aborted") {
        reportSpeechWarning(this, "음성 입력 오류", event.error || "음성 입력을 시작하지 못했습니다.");
      }
    };
    recognition.onend = () => {
      if (this.speechRecognition !== recognition) return;
      if (this.speechSilenceTimer) clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
      this.speechRecognition = null;
      this.speechListening = false;
      this.syncSpeechInputControls();
    };
    this.speechRecognition = recognition;
    try {
      recognition.start();
    } catch (error) {
      recognition.piManualStop = true;
      this.speechRecognition = null;
      this.speechListening = false;
      this.syncSpeechInputControls();
      reportSpeechWarning(this, "음성 입력 오류", error instanceof Error ? error.message : String(error));
    }
  },

  async startLocalWhisperInput() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      reportSpeechWarning(this, "Whisper 녹음 미지원", "이 브라우저는 로컬 녹음을 지원하지 않습니다.");
      return;
    }
    this.stopSpeechInput();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      this.speechRecorder = recorder;
      this.speechRecordingChunks = chunks;
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.speechRecorder = null;
        this.speechListening = false;
        this.syncSpeechInputControls();
        void this.transcribeWhisperRecording(chunks);
      };
      recorder.start();
      this.speechListening = true;
      this.syncSpeechInputControls();
    } catch (error) {
      this.speechRecorder = null;
      this.speechListening = false;
      this.syncSpeechInputControls();
      reportSpeechWarning(this, "Whisper 녹음 오류", error instanceof Error ? error.message : String(error));
    }
  },

  async transcribeWhisperRecording(chunks) {
    if (!chunks?.length || !this.prompt) return;
    const basePrompt = this.prompt.value;
    this.setWhisperStatus("transcribing…");
    try {
      const transcriber = await this.loadWhisperPipeline();
      const audio = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const stream = transcriber.transcribe(audio, {
        ...whisperTranscriptionOptions(this.whisperModel, this.speechLanguage),
        onProgress: (progress) => this.queueWhisperStatus(this.whisperProgressText(progress)),
      });
      const result = typeof stream?.collect === "function" ? await stream.collect() : stream;
      const text = Array.isArray(result) ? result.map((item) => item.text || "").join(" ") : result?.text;
      appendTranscriptToPrompt(this.prompt, basePrompt, text || "");
      this.updatePrompt();
      this.setWhisperStatus("transcribed");
    } catch (error) {
      const message = this.whisperErrorMessage(error);
      this.setWhisperStatus(message, true);
      reportSpeechWarning(this, "Whisper 변환 오류", message);
    }
  },

  whisperErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/OrtRun\(\)|ERROR_CODE:\s*1|model execution/i.test(message)) {
      return "이 디바이스에서 사용하기에 너무 큰 Whisper 모델입니다. 더 작은 모델을 선택하세요.";
    }
    return message;
  },

  async loadWhisperPipeline() {
    const preset = whisperPreset(this.whisperModel);
    const key = preset.id;
    if (this.whisperPipeline && this.whisperPipelineKey === key) return this.whisperPipeline;
    if (this.whisperLoadingPromise && this.whisperLoadingKey === key) return this.whisperLoadingPromise;
    this.setWhisperModelButtons(true);
    this.setWhisperStatus(`loading ${this.whisperModel} ${preset.size}…`);
    this.whisperLoadingKey = key;
    this.whisperLoadingPromise = (async () => {
      const { BrowserWhisper } = await import("browser-whisper");
      this.resetWhisperProgress();
      this.whisperPipeline = new BrowserWhisper({ model: preset.id });
      this.whisperPipelineKey = key;
      this.markWhisperModelCached?.(this.whisperModel);
      this.setWhisperStatus(`ready: ${this.whisperModel} ${preset.size}`);
      return this.whisperPipeline;
    })();
    try {
      return await this.whisperLoadingPromise;
    } finally {
      this.whisperLoadingPromise = null;
      this.whisperLoadingKey = "";
      this.setWhisperModelButtons(false);
    }
  },

  resetWhisperProgress() {
    this.whisperProgressByFile = new Map();
    this.whisperProgressLoaded = 0;
    this.whisperProgressTotal = 0;
  },

  whisperProgressText(progress) {
    if (!progress) return `downloading ${this.whisperModel}…`;
    const rawProgress = Number(progress.progress);
    if ((progress.status === "progress" || progress.stage) && Number.isFinite(rawProgress)) {
      const percent = Math.min(100, Math.round(rawProgress <= 1 ? rawProgress * 100 : rawProgress));
      const stage = progress.stage || "downloading";
      return `${stage} ${this.whisperModel}: ${percent}%`;
    }
    return `${progress.stage || progress.status || "loading"} ${this.whisperModel}`;
  },

  async downloadWhisperModel() {
    try {
      const whisper = await this.loadWhisperPipeline();
      await whisper.downloadModel?.(whisperPreset(this.whisperModel).id);
      this.markWhisperModelCached?.(this.whisperModel);
      await this.updateWhisperCacheStatus();
    } catch (error) {
      this.setWhisperStatus("download failed", true);
      reportSpeechWarning(this, "Whisper 다운로드 오류", error instanceof Error ? error.message : String(error));
    }
  },

  async deleteWhisperModel() {
    if (this.whisperLoadingPromise) return;
    this.whisperPipeline = null;
    this.clearWhisperModelCached?.(this.whisperModel);
    this.whisperPipelineKey = "";
    this.setWhisperStatus("browser-whisper cache is managed by the browser");
  },

  async updateWhisperCacheStatus() {
    if (this.whisperLoadingPromise) return;
    if (this.whisperPipeline && this.whisperPipelineKey === whisperPreset(this.whisperModel).id) {
      this.setWhisperStatus(`ready: ${this.whisperModel} ${whisperPreset(this.whisperModel).size}`);
      this.refreshWhisperModelRequirement?.();
      return;
    }
    this.setWhisperStatus("download required before saving");
    this.refreshWhisperModelRequirement?.();
  },

  selectedWhisperModel() {
    const control = this.querySelector("[data-setting='speechInput.whisperModel']");
    return control?.value || this.whisperModel || "tiny-q5";
  },

  isWhisperModelCached(model) {
    if (this.whisperPipelineKey === whisperPreset(model).id) return true;
    try {
      return window.localStorage.getItem(whisperCacheMarkerKey(model)) === "1";
    } catch {
      return false;
    }
  },

  markWhisperModelCached(model) {
    try {
      window.localStorage.setItem(whisperCacheMarkerKey(model), "1");
    } catch {}
  },

  clearWhisperModelCached(model) {
    try {
      window.localStorage.removeItem(whisperCacheMarkerKey(model));
    } catch {}
  },

  refreshWhisperModelRequirement() {
    const useLocalControl = this.querySelector?.("[data-setting='speechInput.useLocalWhisper']");
    const model = this.selectedWhisperModel();
    const missing = useLocalControl?.checked === true && !this.isWhisperModelCached(model);
    const button = this.querySelector?.("[data-action='download-whisper-model']");
    const saveButton = this.querySelector?.("[data-settings-form] button[type='submit']");
    if (button) {
      button.hidden = !missing;
      button.dataset.missing = missing ? "true" : "false";
      button.textContent = `download ${model}`;
    }
    if (saveButton) saveButton.disabled = missing;
    return !missing;
  },

  /* v8 ignore start -- animation-frame throttling is exercised through integration behavior */
  queueWhisperStatus(message, error = false) {
    if (!message) return;
    this.whisperStatusPending = { message, error };
    if (this.whisperStatusFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 100));
    this.whisperStatusFrame = schedule(() => {
      this.whisperStatusFrame = null;
      const pending = this.whisperStatusPending;
      this.whisperStatusPending = null;
      if (!pending) return;
      const now = Date.now();
      const current = this.querySelector?.("[data-whisper-status]")?.textContent || "";
      const isProgress = /%$/.test(pending.message);
      if (isProgress && pending.message === current) return;
      if (isProgress && now - (this.whisperStatusLastAt || 0) < 200 && !pending.message.endsWith("100%")) {
        this.queueWhisperStatus(pending.message, pending.error);
        return;
      }
      this.setWhisperStatus(pending.message, pending.error);
    });
  },

  setWhisperStatus(message, error = false) {
    const status = this.querySelector?.("[data-whisper-status]");
    if (!status) return;
    if (status.textContent === message && status.classList.contains("err") === error) return;
    status.textContent = message;
    status.classList.toggle("err", error);
    this.whisperStatusLastAt = Date.now();
  },

  setWhisperModelButtons(disabled) {
    for (const button of this.querySelectorAll?.("[data-action='download-whisper-model']") || []) {
      button.disabled = disabled;
    }
  },
  /* v8 ignore stop */

  stopSpeechInput() {
    if (this.speechRecorder && this.speechRecorder.state !== "inactive") {
      this.speechRecorder.stop();
      return;
    }
    if (this.speechSilenceTimer) clearTimeout(this.speechSilenceTimer);
    this.speechSilenceTimer = null;
    if (!this.speechRecognition) {
      this.speechListening = false;
      this.syncSpeechInputControls?.();
      return;
    }
    const recognition = this.speechRecognition;
    recognition.piManualStop = true;
    this.speechRecognition = null;
    this.speechListening = false;
    try {
      recognition.stop();
    } catch {}
    this.syncSpeechInputControls?.();
  },

  syncSpeechInputControls() {
    if (!this.micButton) return;
    this.micButton.hidden = !this.enableSpeechInput || this.speechInputAllowed?.() !== true;
    this.micButton.classList.toggle("listening", this.speechListening);
    this.micButton.setAttribute("aria-pressed", this.speechListening ? "true" : "false");
    this.micButton.setAttribute("aria-label", this.speechListening ? "stop voice input" : "start voice input");
    this.micButton.title = this.speechListening ? "stop voice input" : "voice input";
  },

};
