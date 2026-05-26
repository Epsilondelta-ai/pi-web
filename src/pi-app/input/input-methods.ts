import { cancelSession, createSession, runAguiSessionPrompt, runShellCommand, steerSession } from "../../lib/api";
import { fallbackChoicePrompt } from "./fallback-choices";

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

const SHELL_PROMPT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 17 6-6-6-6"></path><path d="M12 19h8"></path></svg>`;

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

function appendTranscriptToPrompt(prompt, basePrompt, transcript) {
  const cleanTranscript = String(transcript || "").trimStart();
  const needsSpace = basePrompt
    && cleanTranscript
    && !/\s$/.test(basePrompt)
    && !/^[\s.,!?;:)]/.test(cleanTranscript);
  prompt.value = `${basePrompt}${needsSpace ? " " : ""}${cleanTranscript}`;
}

export const inputMethods = {
  async submitPrompt() {
    this.stopSpeechInput?.();
    this.updatePrompt?.();
    const text = this.prompt?.value.trim() || "";
    if (this.promptShellMode) {
      if (!text) return;
      await this.submitPromptShellCommand(text);
      return;
    }
    if (!text && !this.attachments?.children.length) return;
    this.clearPromptDraft?.();
    if (this.running) {
      await this.submitSteeringPrompt(text);
      return;
    }
    const submitKey = this.promptSubmitKey?.() || "";
    if (this.promptSubmitting && this.promptSubmittingKey === submitKey) return;
    const submitToken = Symbol("prompt-submit");
    this.promptSubmitting = true;
    this.promptSubmittingKey = submitKey;
    this.promptSubmittingToken = submitToken;
    try {
      const workspaceId = this.dataset.activeWorkspaceId;
      let sessionId = this.dataset.activeSessionId;
      if (sessionId && workspaceId && !this.activeSessionBelongsToWorkspace(sessionId, workspaceId)) {
        sessionId = "";
      }
      if (!sessionId && this.apiConnected && workspaceId) {
        try {
          const { session } = await createSession(workspaceId);
          this.activateCreatedSession(workspaceId, session);
          sessionId = session.id;
        } catch {
          this.setConnection("err");
          return;
        }
      }
      this.showSessionMain();
      this.finalizeStreamingMessages();
      const waitForServerEcho = this.apiConnected && sessionId;
      const useAguiPrompt = waitForServerEcho && typeof EventSource !== "undefined";
      const attachments = this.attachmentContents.filter(Boolean);
      const hasVisiblePrompt = !!text || attachments.length > 0;
      this.writeLastSessionPrompt(sessionId, text);
      if (hasVisiblePrompt) {
        if (!waitForServerEcho || useAguiPrompt) this.appendMessage({ kind: "user", text, attachments });
        this.appendLoadingMessage();
        if (text) this.autonameActiveSession(text);
      }
      if (this.prompt) this.prompt.value = "";
      this.attachmentContents = [];
      this.attachments?.replaceChildren();
      if (this.attachments) this.attachments.hidden = true;
      this.updatePrompt();
      if (waitForServerEcho) {
        this.eventSource?.close();
        this.eventSource = null;
        this.setMode("running");
        let replayEventsOnReconnect = true;
        try {
          const completedInAguiStream = await runAguiSessionPrompt(
            sessionId,
            text,
            attachments,
            this.aguiSubscriber(sessionId),
          );
          replayEventsOnReconnect = !completedInAguiStream;
          if (completedInAguiStream && this.dataset.activeSessionId === sessionId) {
            this.setMode("idle");
            this.finalizeStreamingMessages();
            this.removeLoadingMessage();
          }
        } catch {
          this.setMode("idle");
          this.removeLoadingMessage();
          this.setConnection("err");
        } finally {
          if (this.dataset.activeSessionId === sessionId && typeof EventSource !== "undefined") {
            this.connectEvents(sessionId, { replay: replayEventsOnReconnect });
          }
        }
      }
    } finally {
      if (this.promptSubmittingToken === submitToken) {
        this.promptSubmitting = false;
        this.promptSubmittingKey = "";
        this.promptSubmittingToken = undefined;
      }
    }
  },

  promptSubmitKey() {
    const sessionId = this.dataset.activeSessionId;
    if (sessionId) return `session:${sessionId}`;
    return `workspace:${this.dataset.activeWorkspaceId || ""}`;
  },

  activeSessionBelongsToWorkspace(sessionId, workspaceId) {
    const row = this.findSessionRow?.(sessionId)
      || [...this.querySelectorAll("[data-session]")].find((item) => item.dataset.session === sessionId);
    const rowWorkspace = row?.dataset.workspace;
    return !rowWorkspace || rowWorkspace === workspaceId;
  },

  async submitSteeringPrompt(text) {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !this.apiConnected) return;
    this.writeLastSessionPrompt(sessionId, text);
    const attachments = this.attachmentContents.filter(Boolean);
    try {
      await steerSession(sessionId, text, attachments);
      this.appendMessage({ kind: "user", text, attachments });
      if (this.prompt) this.prompt.value = "";
      this.attachmentContents = [];
      this.attachments?.replaceChildren();
      if (this.attachments) this.attachments.hidden = true;
      this.updatePrompt();
    } catch {
      this.setConnection("err");
    }
  },

  async submitShellCommand(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input[name='command']");
    const command = input?.value.trim();
    const button = event.currentTarget.querySelector("button[type='submit']");
    await this.runPromptShellCommand(command, {
      onStart: () => { if (button) button.disabled = true; },
      onSuccess: () => { if (input) input.value = ""; },
      onFinish: () => { if (button) button.disabled = false; },
    });
  },

  async submitPromptShellCommand(command) {
    if (!this.prompt) return;
    await this.runPromptShellCommand(command, {
      onStart: () => { this.prompt.disabled = true; },
      onSuccess: () => {
        this.prompt.value = "";
        this.exitPromptShellMode();
      },
      onFinish: () => {
        if (this.prompt) this.prompt.disabled = false;
        this.updatePrompt();
        this.prompt?.focus();
      },
    });
  },

  async runPromptShellCommand(command, hooks: any = {}) {
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!command || !workspaceId || !this.apiConnected) return;
    hooks.onStart?.();
    this.showSessionMain();
    this.finalizeStreamingMessages();
    this.appendMessage({
      kind: "tool",
      tool: "shell",
      args: `$ ${command}`,
      status: "running",
      collapsedByDefault: false,
    });
    try {
      const result = await runShellCommand(workspaceId, command);
      this.finishTool({
        kind: "tool",
        tool: "shell",
        args: `$ ${command}`,
        status: result.exitCode === 0 ? "ok" : "err",
        durationMs: result.durationMs,
        resultMeta: result.exitCode === 0 ? "done" : `exit ${result.exitCode}`,
        body: result.output || "[no output]",
      });
      hooks.onSuccess?.();
      void this.loadRuntimeStatus?.(workspaceId);
      void this.loadWorkspaceMeta?.(workspaceId);
    } catch (error) {
      this.finishTool({
        kind: "tool",
        tool: "shell",
        args: `$ ${command}`,
        status: "err",
        resultMeta: error instanceof Error ? error.message : String(error),
        body: "",
      });
      this.setConnection("err");
    } finally {
      hooks.onFinish?.();
    }
  },

  async cancelActiveSession() {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !this.apiConnected) return;
    this.markSessionCancellationPending(sessionId);
    try {
      const result = await cancelSession(sessionId);
      if (result?.cancelled) this.setMode("cancelled");
      else this.clearSessionCancellationPending(sessionId);
    } catch {
      this.clearSessionCancellationPending(sessionId);
      this.setConnection("err");
    }
  },

  handleAppClick(event) {
    const removeAttachmentButton = event.target.closest("[data-remove-attachment]");
    if (removeAttachmentButton) {
      const chip = removeAttachmentButton.closest(".attach-chip");
      const index = Number(chip?.dataset.attachmentIndex);
      if (Number.isInteger(index)) this.attachmentContents[index] = "";
      chip?.remove();
      this.updatePrompt();
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    const button = event.target.closest("button");
    if ((!button && !actionTarget) || !this.contains(button || actionTarget)) return;
    const action = actionTarget?.dataset.action || button?.dataset.action;
    if (action === "copy-code") {
      void this.copyCodeBlock(button);
      return;
    }
    if (action === "read-response") {
      this.readAssistantMessageNode(actionTarget.closest(".msg"));
      return;
    }
    if (action === "stop-response") {
      this.stopReadingResponse();
      return;
    }
    if (action === "route-picker") this.route("picker");
    if (action === "route-workspace") this.route("workspace");
    if (action === "refresh-workspaces") this.refreshWorkspaces();
    if (action === "browse-folder") this.browseFolder();
    if (action === "folder-enter") this.loadFolder(actionTarget.dataset.path);
    if (action === "folder-up") this.loadFolder(this.currentFolderParent);
    if (action === "folder-open-current") this.openWorkspacePath(this.currentFolder);
    if (action === "toggle-tree") this.toggleTree();
    if (action === "show-file-tree") this.showFileTreePanel?.();
    if (action === "show-git-history") this.showGitHistory?.();
    if (action === "load-more-git-history") this.loadMoreGitHistory?.();
    if (action === "select-git-commit") this.selectGitCommit?.(actionTarget.dataset.hash);
    if (action === "close-git-detail") this.closeGitDetail?.();
    if (action === "refresh-tree") {
      this.refreshTree();
      this.refreshGitHistory?.();
    }
    if (action === "tree-root-menu") {
      const rect = button?.getBoundingClientRect?.();
      window.dispatchEvent(new CustomEvent("pi-workspace-tree:root-menu", {
        detail: { x: rect?.left || 24, y: rect?.bottom || 88 },
      }));
    }
    if (action === "open-file") this.openFile(actionTarget);
    if (action === "close-file-preview") this.closeFilePreview();
    if (action === "toggle-file-preview-mode") this.toggleFilePreviewMode();
    if (action === "save-file-preview") this.saveFilePreview();
    if (action === "collapse-sidebar") this.collapseSidebar(true);
    if (action === "expand-sidebar") this.collapseSidebar(false);
    if (action === "open-drawer") this.toggleDrawer();
    if (action === "close-drawer") this.toggleDrawer(false);
    if (action === "toggle-tool") this.toggleTool(button);
    if (action === "show-full-tool-output") this.showFullToolOutput(actionTarget);
    if (action !== "session-menu-toggle") this.closeSessionMenus(actionTarget?.closest(".session-row"));
    if (action === "toggle-workspace") this.toggleWorkspace(button.dataset.workspace);
    if (action === "delete-workspace") this.deleteWorkspace(actionTarget.dataset.workspace);
    if (action === "delete-workspace-sessions") this.deleteWorkspaceSessions(button.dataset.workspace);
    if (action === "new-session") this.newSession(button.dataset.workspace);
    if (action === "session-menu-toggle") this.toggleSessionMenu(actionTarget.closest(".session-row"));
    if (action === "rename-session") this.renameSession(actionTarget.closest(".session-row")?.dataset.session);
    if (action === "delete-session") this.deleteSession(actionTarget.closest(".session-row")?.dataset.session);
    if (action === "fallback-choice") {
      this.submitFallbackChoice(
        actionTarget.dataset.choiceId,
        actionTarget.dataset.choiceValue,
        actionTarget.closest(".fallback-choice-list"),
      );
    }
    if (action === "fallback-choice-custom") {
      this.submitFallbackChoice(
        actionTarget.dataset.choiceId,
        actionTarget.closest(".choice-custom")?.querySelector("[data-choice-custom-input]")?.value,
        actionTarget.closest(".fallback-choice-list"),
      );
    }
    if (action === "show-update-tip") this.showUpdateTip?.();
    if (action === "open-settings") this.openSettingsModal?.();
    if (action === "close-settings") this.closeSettingsModal?.();
    if (action === "toggle-speech-input") this.toggleSpeechInput?.();
    if (action === "download-whisper-model") this.downloadWhisperModel?.();
    if (action === "delete-whisper-model") this.deleteWhisperModel?.();
    if (action === "save-settings") this.saveSettingsForm?.(event);
    if (action === "save-auth-provider") this.saveAuthForm?.(event);
    if (action === "logout-auth-provider") this.logoutAuthProvider?.();
    if (action === "start-oauth-login") this.startOAuthLogin?.();
    if (action === "logout-oauth-provider") this.logoutOAuthProvider?.();
    if (action === "send-oauth-input") this.sendOAuthInput?.();
    if (action === "close-tweaks") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    if (!actionTarget?.closest(".session-menu") && action !== "session-menu-toggle" && button?.dataset.session) {
      this.pickSession(button.closest(".session-row") || button);
    }
    if (button?.dataset.workspace && button.classList.contains("recent-row")) {
      this.openWorkspace(button.dataset.workspace);
    }
    if (button?.dataset.seed) this.fillPrompt(button.dataset.seed);
    if (button?.dataset.skill) this.fillPrompt(`/skill ${button.dataset.skill}\n\n`);
    if (button?.dataset.slash) this.pickSlash(button.dataset.slash);
  },

  async submitFallbackChoice(choiceId, value, panel) {
    const prompt = fallbackChoicePrompt(choiceId, value);
    if (!prompt || !this.apiConnected || !this.dataset.activeSessionId) return;
    panel?.classList.add("answered");
    panel?.querySelectorAll("button, input").forEach((item) => item.disabled = true);
    this.finalizeStreamingMessages();
    this.appendMessage({ kind: "user", text: prompt });
    this.appendLoadingMessage();
    this.setMode("running");
    try {
      this.eventSource?.close();
      this.eventSource = null;
      const sessionId = this.dataset.activeSessionId;
      const completedInAguiStream = await runAguiSessionPrompt(sessionId, prompt, [], this.aguiSubscriber(sessionId));
      if (completedInAguiStream && this.dataset.activeSessionId === sessionId) {
        this.setMode("idle");
        this.finalizeStreamingMessages();
        this.removeLoadingMessage();
      }
    } catch {
      this.setMode("idle");
      this.removeLoadingMessage();
      this.setConnection("err");
    } finally {
      if (this.dataset.activeSessionId && typeof EventSource !== "undefined") {
        this.connectEvents(this.dataset.activeSessionId, { replay: false });
      }
    }
  },

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
      this.showSystemToast?.(
        "warning",
        "음성 입력 보안 컨텍스트 필요",
        "음성 입력은 HTTPS 또는 localhost 같은 보안 컨텍스트에서만 사용할 수 있습니다.",
        "speech-input:insecure-context",
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showSystemToast?.(
        "warning",
        "음성 입력 미지원",
        "이 브라우저는 Web Speech API 음성 입력을 지원하지 않습니다. Chrome/Safari에서 사용하세요.",
        "speech-input:unsupported",
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
        this.showSystemToast?.("warning", "음성 입력 오류", event.error || "음성 입력을 시작하지 못했습니다.", `speech-input:${event.error || "error"}`);
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
      this.showSystemToast?.("warning", "음성 입력 오류", error instanceof Error ? error.message : String(error), "speech-input:start");
    }
  },

  async startLocalWhisperInput() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      this.showSystemToast?.("warning", "Whisper 녹음 미지원", "이 브라우저는 로컬 녹음을 지원하지 않습니다.", "speech-input:recorder");
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
      this.showSystemToast?.("warning", "Whisper 녹음 오류", error instanceof Error ? error.message : String(error), "speech-input:record");
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
      this.showSystemToast?.("warning", "Whisper 변환 오류", message, "speech-input:whisper");
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
      this.showSystemToast?.("warning", "Whisper 다운로드 오류", error instanceof Error ? error.message : String(error), "speech-input:download");
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

  updatePrompt() {
    if (!this.prompt || !this.sendButton) return;
    const value = this.prompt.value;
    if (!this.promptShellMode && value.startsWith("! ")) {
      this.prompt.value = value.slice(2);
      this.enterPromptShellMode();
      return;
    }
    this.savePromptDraft?.();
    const hasAttachments = !!this.attachments?.children.length;
    const canSend = !!value.trim() || hasAttachments;
    this.sendButton.disabled = false;
    this.sendButton.setAttribute("aria-disabled", canSend ? "false" : "true");
    this.sendButton.classList.toggle("is-disabled", !canSend);
    this.slashPopover?.toggleAttribute("hidden", !(value.startsWith("/") && !value.includes("\n")));
    this.filterSlash(value);
    this.prompt.style.height = "auto";
    this.prompt.style.height = Math.min(180, this.prompt.scrollHeight) + "px";
  },

  handlePromptKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.submitPrompt();
    if (event.key === " " && !this.promptShellMode && this.prompt?.value === "!" && this.prompt.selectionStart === 1 && this.prompt.selectionEnd === 1) {
      event.preventDefault();
      this.prompt.value = "";
      this.enterPromptShellMode();
      return;
    }
    if (event.key === "Backspace" && this.promptShellMode && !this.prompt?.value) {
      event.preventDefault();
      this.exitPromptShellMode();
    }
  },

  enterPromptShellMode() {
    if (this.promptShellMode) return;
    this.promptShellMode = true;
    this.promptBar?.classList.add("shell-mode");
    this.prompt?.setAttribute("placeholder", "run shell command in workspace…");
    this.attachButtonOriginalHtml ??= this.attachButton?.innerHTML || "";
    if (this.attachButton) {
      this.attachButton.innerHTML = SHELL_PROMPT_ICON;
      this.attachButton.disabled = true;
      this.attachButton.setAttribute("aria-label", "shell command mode");
      this.attachButton.setAttribute("title", "shell command mode");
    }
    this.updatePrompt();
  },

  exitPromptShellMode() {
    if (!this.promptShellMode) return;
    this.promptShellMode = false;
    this.promptBar?.classList.remove("shell-mode");
    this.prompt?.setAttribute("placeholder", "ask pi to do something…");
    if (this.attachButton) {
      this.attachButton.innerHTML = this.attachButtonOriginalHtml || this.attachButton.innerHTML;
      this.attachButton.disabled = false;
      this.attachButton.setAttribute("aria-label", "attach files");
      this.attachButton.setAttribute("title", "attach files");
    }
    this.updatePrompt();
  },

  fillPrompt(value) {
    if (!this.prompt) return;
    this.prompt.value = value;
    this.updatePrompt();
    this.prompt.focus();
  },

  renderSlashCommands(commands = []) {
    const list = this.querySelector(".slash-list");
    if (!list) return;
    list.replaceChildren();
    for (const command of commands) {
      const name = command.command || command.cmd || `/${command.name}`;
      if (!name || name === "/undefined") continue;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "slash-item";
      item.dataset.slash = name;
      const scope = command.scope || command.location || "global";
      const source = command.source || "command";
      item.innerHTML = [
        `<span class="sl-cmd"></span>`,
        `<span class="sl-tags"><span class="sl-scope"></span><span class="sl-source"></span></span>`,
        `<span class="sl-desc"></span>`,
      ].join("");
      item.querySelector(".sl-cmd").textContent = name;
      item.querySelector(".sl-scope").textContent = scope;
      item.querySelector(".sl-source").textContent = source;
      item.querySelector(".sl-desc").textContent = command.description || command.desc || "";
      list.append(item);
    }
    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.className = "slash-empty";
      empty.textContent = "no slash commands found";
      list.append(empty);
    }
    this.filterSlash();
  },

  filterSlash(value = this.prompt?.value || "") {
    const query = value.replace(/^\//, "").toLowerCase();
    const items = [...this.querySelectorAll(".slash-item")];
    let first = true;
    items.forEach((item) => {
      const match = !query || item.textContent.toLowerCase().includes(query);
      item.hidden = !match;
      item.classList.toggle("selected", match && first);
      if (match) first = false;
    });
  },

  pickSlash(command) {
    this.fillPrompt(command + " ");
    this.slashPopover?.setAttribute("hidden", "");
  },

  navigateList(event, selector, onSelect) {
    event.preventDefault();
    const items = [...this.querySelectorAll(selector)].filter((item) => !item.hidden);
    if (!items.length) return;
    let index = Math.max(0, items.findIndex((item) => item.classList.contains("selected")));
    if (event.key === "ArrowDown") index = Math.min(items.length - 1, index + 1);
    if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    items.forEach((item) => item.classList.remove("selected"));
    items[index].classList.add("selected");
    items[index].scrollIntoView({ block: "nearest" });
    if (event.key === "Enter") onSelect(items[index]);
  },

};
