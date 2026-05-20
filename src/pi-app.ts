import { sessionEvents } from "./api";
import { attachmentMethods } from "./pi-app/attachment-methods";
import { SPINNER_FRAMES } from "./pi-app/constants";
import { filePreviewMethods } from "./pi-app/file-preview-methods";
import { inputMethods } from "./pi-app/input-methods";
import { layoutMethods } from "./pi-app/layout-methods";
import { messageMethods } from "./pi-app/message-methods";
import { promptDraftMethods } from "./pi-app/prompt-draft-methods";
import { runtimeStatusMethods } from "./pi-app/runtime-status-methods";
import { sessionMethods } from "./pi-app/session-methods";
import { settingsMethods } from "./pi-app/settings-methods";
import { toastMethods } from "./pi-app/toast-methods";
import { toolMessageMethods } from "./pi-app/tool-message-methods";
import { transcriptWindowMethods } from "./pi-app/transcript-window-methods";
import { versionMethods } from "./pi-app/version-methods";
import { workspaceMethods } from "./pi-app/workspace-methods";

class PiApp extends HTMLElement {
  connectedCallback() {
    if (this.bound) return;
    this.bound = true;
    this.prompt = this.querySelector(".prompt-textarea");
    this.sendButton = this.querySelector(".send-btn");
    this.stopButton = this.querySelector(".stop-btn");
    this.attachButton = this.querySelector(".attach-btn");
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
    this.attachmentContents = [];
    this.spinnerIndex = 0;
    this.piDeltaBuffer = "";
    this.runtimeStatus = {};
    this.restorePromptDraft();
    this.installViewportSizing();
    this.bindDomEvents();
    this.restoreSidebar();
    this.updatePrompt();
    this.updatePromptMeta();
    this.scrollTerm();
    this.startSpinners();
    this.startRuntimeStatusPolling();
    this.bootstrapAPI();
  }
  disconnectedCallback() {
    this.eventSource?.close();
    this.backgroundSessionWatches?.forEach((watch) => watch.source?.close?.());
    this.backgroundSessionWatches?.clear?.();
    if (this.spinnerTimer) clearInterval(this.spinnerTimer);
    if (this.runtimeStatusTimer) clearInterval(this.runtimeStatusTimer);
    if (this.updateTipTimer) clearTimeout(this.updateTipTimer);
    if (this.connectionErrorTimer) clearTimeout(this.connectionErrorTimer);
    if (this.streamingRenderFrame) window.cancelAnimationFrame(this.streamingRenderFrame);
    if (this.scrollFrame) window.cancelAnimationFrame(this.scrollFrame);
    this.destroyTranscriptVirtualScroller?.();
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
    this.spinnerTimer = setInterval(() => this.tickSpinners(), 100);
  }

  tickSpinners() {
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
    this.querySelectorAll(".spinner").forEach((spinner) => {
      spinner.textContent = SPINNER_FRAMES[this.spinnerIndex];
    });
  }

  bindDomEvents() {
    this.addEventListener("click", (event) => (this as any).handleAppClick(event));
    this.querySelector("[data-path-form]")?.addEventListener("submit", (event) => this.submitWorkspacePath(event));
    this.querySelector("[data-clone-form]")?.addEventListener("submit", (event) => this.submitCloneWorkspace(event));
    this.querySelector("[data-shell-form]")?.addEventListener("submit", (event) => this.submitShellCommand(event));
    this.querySelector("[data-settings-form]")?.addEventListener("submit", (event) => this.saveSettingsForm(event));
    this.querySelector("[data-settings-scope]")?.addEventListener("change", () => this.fillSettingsForm());
    this.sendButton?.addEventListener("click", () => this.submitPrompt());
    this.stopButton?.addEventListener("click", () => this.cancelActiveSession());
    this.prompt?.addEventListener("input", () => this.updatePrompt());
    this.prompt?.addEventListener("paste", (event) => void this.handlePromptPaste(event));
    this.prompt?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.submitPrompt();
      const shouldNavigateSlashCommands = this.slashPopover
        && !this.slashPopover.hidden
        && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key);
      if (shouldNavigateSlashCommands) {
        this.navigateList(event, ".slash-item", (item) => this.pickSlash(item.dataset.slash));
      }
    });
    this.attachButton?.addEventListener("click", () => this.fileInput?.click());
    this.fileInput?.addEventListener("change", () => this.addFiles(this.fileInput.files));
    this.querySelector(".sb-resizer")?.addEventListener("pointerdown", (event) => this.startResize(event));
    window.addEventListener("keydown", (event) => this.shortcut(event));
    window.addEventListener("click", (event) => {
      if (!event.target.closest?.(".session-menu, .session-menu-button")) this.closeSessionMenus();
    });
    window.addEventListener("message", (event) => {
      if (event.data?.type === "__activate_edit_mode") this.querySelector("[data-tweaks]")?.removeAttribute("hidden");
      if (event.data?.type === "__deactivate_edit_mode") {
        this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
      }
    });
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
  }

  connectEvents(sessionId: string, options: any = {}) {
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

  applyEvent(event) {
    if (!this.isCurrentSessionEvent(event)) return;
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
    const wasRunning = this.running;
    const willRun = ["running", "thinking"].includes(mode);
    if (!wasRunning && willRun) this.responseFailureToastShown = false;
    if (mode === "idle") this.finishRunningTools?.();
    if (mode === "cancelled") this.finishRunningTools?.({ status: "err", resultMeta: "cancelled" });
    this.running = willRun;
    if (wasRunning && mode === "idle" && !this.responseFailureToastShown) this.notifySessionCompleted?.();
    this.syncCurrentSessionRunState?.(this.running);
    this.stopButton?.toggleAttribute("hidden", !this.running);
    if (this.sendButton) this.updatePrompt();
    this.syncLoadingMessage?.();
    if (!this.running) void this.loadRuntimeStatus?.();
  }

  updatePromptMeta(status: any = {}) {
    const meta = this.querySelector("[data-prompt-meta]");
    if (!meta) return;
    this.runtimeStatus = {
      ...this.runtimeStatus,
      ...status,
      currentBranch: status.currentBranch || status.branch || this.runtimeStatus?.currentBranch,
    };
    const model = this.runtimeStatus.model || "—";
    const currentBranch = this.runtimeStatus.currentBranch || "—";
    const parts = [model];
    const fiveHour = this.quotaLabel("5h", this.runtimeStatus.fiveHourQuota);
    const weekly = this.quotaLabel("Week", this.runtimeStatus.weeklyQuota);
    if (fiveHour) parts.push(fiveHour);
    if (weekly) parts.push(weekly);
    parts.push(` ${currentBranch}`);
    meta.textContent = parts.join(" | ");
  }

  quotaLabel(label, quota) {
    if (!Number.isFinite(quota)) return undefined;
    const percent = Math.max(0, Math.min(100, Math.round(quota)));
    return `${label} ${percent > 20 ? "🔋" : "🪫"}(${percent}%)`;
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
  filePreviewMethods,
  layoutMethods,
  toastMethods,
  runtimeStatusMethods,
  settingsMethods,
  versionMethods,
);

if (!customElements.get("pi-app")) customElements.define("pi-app", PiApp);

export { PiApp };
