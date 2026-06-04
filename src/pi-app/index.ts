import { applyUiLocale, currentUiLocale, setUiLocale } from "../i18n/client";
import { normalizeUiLocale } from "../i18n/locales";
import { sessionEvents } from "../shared/api/api";
import { escapeHtml } from "../shared/renderers/renderers";
import { SPINNER_FRAME_COUNT } from "./constants";
import { attachmentMethods } from "./input/attachment-methods";
import { inputMethods } from "./input/input-methods";
import { promptDraftMethods } from "./input/prompt-draft-methods";
import { messageMethods } from "./messages/message-methods";
import { toolMessageMethods } from "./messages/tool-message-methods";
import { pluginMethods } from "./plugins/plugin-methods";
import { sessionMethods } from "./sessions/session-methods";
import { layoutMethods } from "./status/layout-methods";
import { runtimeStatusMethods } from "./status/runtime-status-methods";
import { notificationMethods } from "./status/notification-methods";
import { versionMethods } from "./status/version-methods";
import { transcriptWindowMethods } from "./transcript/transcript-window-methods";
import { oauthMethods } from "./workspace/oauth-methods";
import { settingsMethods } from "./workspace/settings-methods";
import { workspaceMethods } from "./workspace/workspace-methods";

class PiApp extends HTMLElement {
  connectedCallback() {
    if (this.bound) return;
    this.bound = true;
    this.prompt = this.querySelector(".prompt-textarea");
    this.promptBar = this.querySelector(".prompt-bar");
    this.promptShellMode = false;
    this.sendButton = this.querySelector(".send-btn");
    this.stopButton = this.querySelector(".stop-btn");
    this.micButton = this.querySelector(".mic-btn");
    this.attachButton = this.querySelector(".attach-btn");
    this.readResponsesAloud = false;
    this.enableSpeechInput = false;
    this.useLocalWhisper = false;
    this.whisperModel = "tiny-q5";
    this.whisperPipeline = null;
    this.whisperPipelineKey = "";
    this.whisperLoadingPromise = null;
    this.whisperLoadingKey = "";
    this.whisperStatusFrame = null;
    this.whisperStatusPending = null;
    this.whisperStatusLastAt = 0;
    this.whisperProgressByFile = new Map();
    this.whisperProgressLoaded = 0;
    this.whisperProgressTotal = 0;
    this.voiceLanguage = "system";
    this.speechLanguage = "system";
    this.speechRecognition = null;
    this.speechListening = false;
    this.speechSilenceTimer = null;
    this.speechRecorder = null;
    this.speechRecordingChunks = [];
    this.fileInput = this.querySelector("[data-file-input]");
    this.attachments = this.querySelector(".attach-chips");
    this.slashPopover = this.querySelector(".slash-pop");
    this.settingsModal = this.querySelector("[data-settings-modal]");
    this.termInner = this.querySelector(".term-inner");
    this.initTranscriptWindow();
    this.eventSource = null;
    this.apiConnected = false;
    this.currentFolder = "~";
    this.running = false;
    this.responseReceived = false;
    this.fallbackChoiceNotified = false;
    this.attachmentContents = [];
    this.spinnerIndex = 0;
    this.piDeltaBuffer = "";
    this.runtimeStatus = {};
    applyUiLocale(currentUiLocale(), this);
    this.restorePromptDraft();
    this.installViewportSizing();
    this.bindDomEvents();
    this.restoreSidebar();
    this.syncUnreadCompletedSessions?.();
    this.updatePrompt();
    this.updatePromptMeta();
    this.scrollTerm();
    this.startSpinners();
    this.startRuntimeStatusPolling();
    this.bootstrapAPI();
    if (import.meta.env.MODE !== "test") {
      void this.loadPlugins?.().catch(() => {});
    }
  }
  disconnectedCallback() {
    this.stopSpeechInput?.();
    this.uninstallPromptDropZone?.();
    this.eventSource?.close();
    this.backgroundSessionWatches?.forEach((watch) => watch.source?.close?.());
    this.backgroundSessionWatches?.clear?.();
    if (this.agentSessionStatusTimer) clearInterval(this.agentSessionStatusTimer);
    if (this.spinnerTimer) clearInterval(this.spinnerTimer);
    if (this.runtimeStatusTimer) clearInterval(this.runtimeStatusTimer);
    if (this.piUpdateTimer) clearInterval(this.piUpdateTimer);
    if (this.updateTipTimer) clearTimeout(this.updateTipTimer);
    if (this.connectionErrorTimer) clearTimeout(this.connectionErrorTimer);
    if (this.streamingRenderFrame) window.cancelAnimationFrame(this.streamingRenderFrame);
    if (this.scrollFrame) window.cancelAnimationFrame(this.scrollFrame);
    this.destroyTranscriptVirtualScroller?.();
    this.sidebarSortableRoot?.unmount?.();
    this.sidebarSortableRoot = undefined;
    this.uninstallViewportSizing?.();
  }
  installViewportSizing() {
    const applyViewportHeight = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      if (height > 0) this.style.setProperty("--app-viewport-height", `${height}px`);
    };
    const viewport = window.visualViewport;
    applyViewportHeight();
    window.addEventListener("resize", applyViewportHeight);
    viewport?.addEventListener("resize", applyViewportHeight);
    viewport?.addEventListener("scroll", applyViewportHeight);
    this.uninstallViewportSizing = () => {
      window.removeEventListener("resize", applyViewportHeight);
      viewport?.removeEventListener("resize", applyViewportHeight);
      viewport?.removeEventListener("scroll", applyViewportHeight);
    };
  }

  startRuntimeStatusPolling() {
    if (this.runtimeStatusTimer) return;
    this.runtimeStatusTimer = setInterval(() => this.loadRuntimeStatus?.(), 15000);
  }

  startSpinners() {
    if (this.spinnerTimer) return;
    this.spinnerTimer = setInterval(() => this.tickSpinners(), 150);
  }

  tickSpinners() {
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAME_COUNT;
    this.querySelectorAll(".spinner").forEach((spinner) => {
      spinner.dataset.frame = String(this.spinnerIndex);
    });
  }

  bindDomEvents() {
    this.addEventListener("click", (event) => {
      (this as unknown as { handleAppClick(event: MouseEvent): void }).handleAppClick(event);
    });
    this.querySelector("[data-path-form]")?.addEventListener("submit", (event) => this.submitWorkspacePath(event));
    this.querySelector("[data-clone-form]")?.addEventListener("submit", (event) => this.submitCloneWorkspace(event));
    this.querySelector("[data-shell-form]")?.addEventListener("submit", (event) => this.submitShellCommand(event));
    this.querySelector("[data-settings-form]")?.addEventListener("submit", (event) => this.saveSettingsForm(event));
    this.querySelector("[data-settings-scope]")?.addEventListener("change", () => this.fillSettingsForm());
    this.querySelector("[data-ui-language]")?.addEventListener("change", (event) => {
      const locale = normalizeUiLocale((event.currentTarget as HTMLSelectElement).value);
      if (locale) setUiLocale(locale, this);
    });
    globalThis.speechSynthesis?.addEventListener?.("voiceschanged", () => {
      this.populateBrowserVoiceLanguageOptions?.();
      this.fillSettingsForm?.();
    });
    this.querySelector("[data-setting='defaultProvider']")?.addEventListener("change", (event) => {
      this.syncCustomSettingInput(event.currentTarget);
      this.fillModelControls();
    });
    this.querySelector("[data-setting='defaultModel']")?.addEventListener("change", (event) => {
      this.syncCustomSettingInput(event.currentTarget);
    });
    this.querySelector("[data-setting='speechInput.useLocalWhisper']")?.addEventListener("change", () => {
      this.refreshWhisperModelRequirement?.();
    });
    this.querySelector("[data-setting='speechInput.whisperModel']")?.addEventListener("change", (event) => {
      this.whisperModel = event.currentTarget.value || "tiny-q5";
      void this.updateWhisperCacheStatus?.();
    });
    this.sendButton?.addEventListener("click", () => this.submitPrompt());
    this.stopButton?.addEventListener("click", () => this.cancelActiveSession());
    this.prompt?.addEventListener("input", () => this.updatePrompt());
    this.prompt?.addEventListener("paste", (event) => void this.handlePromptPaste(event));
    this.prompt?.addEventListener("keydown", (event) => {
      this.handlePromptKeydown(event);
      const shouldNavigateSlashCommands = this.slashPopover
        && !this.slashPopover.hidden
        && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key);
      if (shouldNavigateSlashCommands) {
        this.navigateList(event, ".slash-item", (item) => this.pickSlash(item.dataset.slash));
        return;
      }
      const shouldNavigatePromptFileRefs = this.promptFileRefPopover
        && !this.promptFileRefPopover.hidden
        && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key);
      if (shouldNavigatePromptFileRefs) {
        if (event.key === "Escape") {
          event.preventDefault();
          this.hidePromptFileRefs();
          return;
        }
        this.navigateList(event, ".prompt-file-ref-item", (item) => this.pickPromptFileRef(item.dataset.path));
      }
    });
    this.attachButton?.addEventListener("click", () => this.fileInput?.click());
    this.fileInput?.addEventListener("change", () => this.addFiles(this.fileInput.files));
    this.installPromptDropZone?.();
    this.querySelector(".sb-resizer")?.addEventListener("pointerdown", (event) => this.startResize(event));
    window.addEventListener("pi-workspace-tree:refresh", (event) => {
      const workspaceId = this.dataset.activeWorkspaceId;
      const selectedPath = (event as CustomEvent)?.detail?.selectedPath || "";
      if (workspaceId) void this.loadWorkspaceMeta(workspaceId, { selectedPath });
    });
    window.addEventListener("keydown", (event) => this.shortcut(event));
    window.addEventListener("click", (event) => {
      if (!event.target.closest?.(".session-menu, .session-menu-button")) this.closeSessionMenus();
      this.closeTreeFromOutside?.(event);
    });
    window.addEventListener("message", (event) => {
      if (event.data?.type === "__activate_edit_mode") this.querySelector("[data-tweaks]")?.removeAttribute("hidden");
      if (event.data?.type === "__deactivate_edit_mode") {
        this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
      }
    });
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
  }

  connectEvents(sessionId: string, options: { replay?: boolean } = {}) {
    this.eventSource?.close();
    const eventStreamId = Symbol(sessionId);
    this.eventStreamId = eventStreamId;
    this.eventSource = sessionEvents(sessionId, {
      replay: options.replay,
      onOpen: () => {
        if (this.isActiveEventStream(eventStreamId, sessionId)) this.confirmConnection();
      },
      onError: () => {
        if (this.isActiveEventStream(eventStreamId, sessionId)) this.deferEventStreamError();
      },
      onEvent: (event) => {
        if (!this.isActiveEventStream(eventStreamId, sessionId)) return;
        this.confirmConnection();
        this.applyEvent(event);
      },
    });
  }

  isActiveEventStream(eventStreamId, sessionId) {
    return this.eventStreamId === eventStreamId && this.dataset.activeSessionId === sessionId;
  }

  aguiSubscriber(sessionId) {
    let textBuffer = "";
    const nextTextDelta = (value) => {
      const delta = String(value);
      if (textBuffer && delta.startsWith(textBuffer)) {
        const nextDelta = delta.slice(textBuffer.length);
        textBuffer = delta;
        return nextDelta;
      }
      textBuffer += delta;
      return delta;
    };
    return {
      onRunStarted: () => {
        if (this.dataset.activeSessionId !== sessionId) return;
        textBuffer = "";
        this.confirmConnection();
        this.setMode("running");
      },
      onTextDelta: (delta) => {
        if (this.dataset.activeSessionId !== sessionId || !delta) return;
        const visibleDelta = nextTextDelta(delta);
        this.setMode("running");
        if (visibleDelta) this.appendDelta({ kind: "pi", delta: visibleDelta });
      },
      onTextEnd: (text) => {
        if (this.dataset.activeSessionId !== sessionId || (!text && !textBuffer)) return;
        const finalText = textBuffer || text;
        textBuffer = "";
        this.finalizePiStream(finalText);
      },
      onThinkingDelta: (delta) => {
        if (this.dataset.activeSessionId !== sessionId || !delta) return;
        this.setMode("running");
        this.appendDelta({ kind: "think", delta });
      },
      onToolStart: ({ name }) => {
        if (this.dataset.activeSessionId !== sessionId) return;
        this.setMode("running");
        this.appendMessage({ kind: "tool", tool: name, status: "running", collapsedByDefault: true });
      },
      onToolArgs: ({ name, chunk }) => {
        if (this.dataset.activeSessionId !== sessionId || !chunk) return;
        this.setMode("running");
        this.appendToolOutput({ tool: name, chunk });
      },
      onToolResult: ({ name, content }) => {
        if (this.dataset.activeSessionId !== sessionId || !content) return;
        this.appendToolOutput({ tool: name, chunk: content });
      },
      onToolEnd: ({ name, args, body }) => {
        if (this.dataset.activeSessionId !== sessionId) return;
        this.finishTool({ kind: "tool", tool: name, args, status: "ok", resultMeta: "done", body });
      },
      onRunError: (message) => {
        if (this.dataset.activeSessionId !== sessionId) return;
        textBuffer = "";
        this.notifyResponseFailure?.(message);
        this.setMode("idle");
        this.finalizeStreamingMessages();
      },
      onRunFinished: () => {
        if (this.dataset.activeSessionId !== sessionId) return;
        textBuffer = "";
        this.setMode(this.isSessionCancellationPending(sessionId) ? "cancelled" : "idle");
        this.finalizeStreamingMessages();
      },
    };
  }

  applyEvent(event) {
    if (!this.isCurrentSessionEvent(event)) return;
    if (this.shouldSkipRenderedReplayEvent?.(event)) return;
    if (event.type === "heartbeat") return;
    if (event.type === "error") {
      this.notifyResponseFailure?.(event.payload?.error);
      return;
    }
    if (event.type === "session.status") {
      const mode = event.payload?.status || "auto-accept";
      this.setMode(mode);
      if (mode === "idle" || mode === "cancelled") this.finalizeStreamingMessages();
      return;
    }
    if (event.type === "session.message") {
      this.appendMessage(event.payload);
      return;
    }
    if (event.type === "session.delta") {
      if (!this.running) this.setMode("running");
      if (event.payload?.kind === "pi" && event.payload?.delta) this.responseReceived = true;
      this.appendDelta(event.payload);
      return;
    }
    if (event.type === "session.renamed") {
      this.updateSessionTitle(event.payload);
      return;
    }
    if (event.type === "tool.started") {
      if (!this.running) this.setMode("running");
      this.appendMessage(event.payload);
      return;
    }
    if (event.type === "tool.output") {
      if (!this.running) this.setMode("running");
      this.appendToolOutput(event.payload);
      return;
    }
    if (event.type === "tool.finished") this.finishTool(event.payload);
  }

  confirmConnection() {
    if (this.connectionErrorTimer) clearTimeout(this.connectionErrorTimer);
    this.connectionErrorTimer = undefined;
    this.setConnection("ok");
  }

  deferEventStreamError() {
    const source = this.eventSource;
    const closedState = globalThis.EventSource?.CLOSED ?? 2;
    if (source?.readyState === closedState) {
      this.setConnection("err");
      return;
    }
    this.setConnection("reconnecting");
    if (this.connectionErrorTimer) clearTimeout(this.connectionErrorTimer);
    this.connectionErrorTimer = window.setTimeout(() => {
      if (this.eventSource === source) this.setConnection("err");
    }, 20000);
  }

  setConnection(status) {
    const indicator = this.querySelector(".statusbtn");
    if (status === "ok") this.apiConnected = true;
    if (!indicator) return;
    const styles = {
      ok: ["var(--accent)", "connected"],
      reconnecting: ["var(--fg-3)", "reconnecting to event stream"],
      err: ["var(--danger)", "backend disconnected"],
    };
    const [color, title] = styles[status] || styles.err;
    indicator.style.color = color;
    indicator.title = title;
  }

  isCurrentSessionEvent(event) {
    const eventSessionId = event?.sessionId;
    const activeSessionId = this.dataset.activeSessionId;
    return !eventSessionId || !activeSessionId || eventSessionId === activeSessionId;
  }

  setMode(mode) {
    const sessionId = this.dataset.activeSessionId;
    if (mode === "idle" && this.isSessionCancellationPending(sessionId)) mode = "cancelled";
    const wasRunning = this.running;
    const willRun = ["running", "thinking"].includes(mode);
    if (!wasRunning && willRun) {
      this.responseFailureToastShown = false;
      this.responseCompletionToastShown = false;
      this.responseReceived = false;
      this.fallbackChoiceNotified = false;
    }
    if (mode === "idle") this.finishRunningTools?.();
    if (mode === "cancelled") this.finishRunningTools?.({ status: "err", resultMeta: "cancelled" });
    this.running = willRun;
    if (!wasRunning && willRun) this.renderTranscriptWindow?.({ stickToBottom: this.transcriptFollowBottom !== false });
    if (wasRunning && !willRun) {
      this.renderTranscriptWindow?.({ stickToBottom: this.transcriptFollowBottom !== false && this.isTermPinnedToBottom?.() });
      void this.refreshWorkspaces?.({ quiet: true });
    }
    if (wasRunning && mode === "idle" && this.responseReceived && !this.responseFailureToastShown && !this.fallbackChoiceNotified) {
      this.notifyResponseCompletedOnce?.();
    }
    if (!willRun && mode === "cancelled") this.clearSessionCancellationPending(sessionId);
    this.syncCurrentSessionRunState?.(this.running);
    if (willRun) this.startAgentSessionDiscoveryPolling?.();
    this.syncAgentSessionStatusPolling?.();
    this.stopButton?.toggleAttribute("hidden", !this.running);
    if (this.sendButton) this.updatePrompt();
    this.syncLoadingMessage?.();
    if (!this.running) void this.loadRuntimeStatus?.();
  }

  markSessionCancellationPending(sessionId) {
    if (!sessionId) return;
    this.cancelledSessionIds ??= new Set();
    this.cancelledSessionIds.add(sessionId);
  }

  isSessionCancellationPending(sessionId) {
    return !!sessionId && !!this.cancelledSessionIds?.has(sessionId);
  }

  clearSessionCancellationPending(sessionId) {
    if (sessionId) this.cancelledSessionIds?.delete(sessionId);
  }

  updatePromptMeta(status: { branch?: string; currentBranch?: string } = {}) {
    const meta = this.querySelector("[data-prompt-meta]");
    if (!meta) return;
    this.runtimeStatus = {
      ...this.runtimeStatus,
      ...status,
      currentBranch: status.currentBranch || status.branch || this.runtimeStatus?.currentBranch,
    };
    const model = this.modelLabel(this.runtimeStatus.model || "—", this.runtimeStatus.thinkingLevel);
    const currentBranch = this.runtimeStatus.currentBranch || "—";
    const parts = [model];
    const fiveHour = this.quotaLabel("5h", this.runtimeStatus.fiveHourQuota);
    const weekly = this.quotaLabel("Week", this.runtimeStatus.weeklyQuota);
    if (fiveHour) parts.push(fiveHour);
    if (weekly) parts.push(weekly);
    parts.push(this.branchLabel(currentBranch));
    meta.innerHTML = parts.join(" | ");
  }

  branchLabel(branch) {
    return `<span class="prompt-meta-item prompt-meta-branch">${this.promptMetaIcon("git-branch")}<span>${escapeHtml(branch)}</span></span>`;
  }

  modelLabel(model, thinkingLevel) {
    const safeModel = escapeHtml(model);
    return thinkingLevel ? `${safeModel} (${escapeHtml(thinkingLevel)})` : safeModel;
  }

  quotaLabel(label, quota) {
    if (!Number.isFinite(quota)) return undefined;
    const percent = Math.max(0, Math.min(100, Math.round(quota)));
    const level = percent >= 70 ? "full" : percent >= 30 ? "medium" : "low";
    return `<span class="prompt-meta-item prompt-meta-battery prompt-meta-battery-${level}">${escapeHtml(label)} ${this.promptMetaIcon(`battery-${level}`)}(${percent}%)</span>`;
  }

  promptMetaIcon(name) {
    const icons = {
      "battery-full": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10v4"></path><path d="M14 10v4"></path><path d="M22 14v-4"></path><path d="M6 10v4"></path><rect x="2" y="6" width="16" height="12" rx="2"></rect></svg>`,
      "battery-medium": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14v-4"></path><path d="M22 14v-4"></path><path d="M6 14v-4"></path><rect x="2" y="6" width="16" height="12" rx="2"></rect></svg>`,
      "battery-low": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 14v-4"></path><path d="M6 14v-4"></path><rect x="2" y="6" width="16" height="12" rx="2"></rect></svg>`,
      "git-branch": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6a9 9 0 0 0-9 9V3"></path><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle></svg>`,
    };
    return icons[name] || "";
  }
}

Object.assign(
  PiApp.prototype,
  workspaceMethods,
  sessionMethods,
  messageMethods,
  toolMessageMethods,
  transcriptWindowMethods,
  promptDraftMethods,
  inputMethods,
  attachmentMethods,
  layoutMethods,
  notificationMethods,
  pluginMethods,
  runtimeStatusMethods,
  settingsMethods,
  oauthMethods,
  versionMethods,
);

if (!customElements.get("pi-app")) customElements.define("pi-app", PiApp);

export { PiApp };
