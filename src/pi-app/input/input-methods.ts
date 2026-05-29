import { cancelSession, createSession, runAguiSessionPrompt, runShellCommand, steerSession } from "../../lib/api";
import { fallbackChoicePrompt } from "./fallback-choices";

const SHELL_PROMPT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 17 6-6-6-6"></path><path d="M12 19h8"></path></svg>`;
const PROMPT_FILE_REF_LIMIT = 12;

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

function whisperCacheMarkerKey(model) {
  return `pi-web:whisper-model:${whisperPreset(model).id}`;
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
    const workspaceId = this.dataset.activeWorkspaceId;
    this.promptSubmitting = true;
    this.promptSubmittingKey = submitKey;
    this.promptSubmittingToken = submitToken;
    try {
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
      if (text === "/reload" && workspaceId && this.apiConnected) {
        void this.loadWorkspaceCommands?.(workspaceId, { reload: true });
      }
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
      onSuccess: () => { input.value = ""; },
      onFinish: () => { if (button) button.disabled = false; },
    });
  },

  async submitPromptShellCommand(command) {
    if (!this.prompt) return;
    await this.runPromptShellCommand(command, {
      onStart: () => {
        this.prompt.value = "";
        this.exitPromptShellMode();
        this.updatePrompt();
        this.prompt.focus();
      },
      onFinish: () => {
        this.updatePrompt();
        this.prompt.focus();
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

  async handleAppClick(event) {
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
    if (action === "prompt-file-ref") {
      this.pickPromptFileRef(actionTarget.dataset.path);
      return;
    }
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
    if (action === "toggle-speech-input") void this.toggleSpeechInput?.();
    if (action === "download-whisper-model") void this.downloadWhisperModel?.();
    if (action === "delete-whisper-model") void this.deleteWhisperModel?.();
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

  async ensureSpeechMethods() {
    if (this.speechMethodsLoaded) return;
    const { speechMethods } = await import("./speech-methods");
    Object.assign(Object.getPrototypeOf(this), speechMethods);
    this.speechMethodsLoaded = true;
  },

  speechInputAllowed() {
    return window.isSecureContext === true;
  },

  stopSpeechInput() {
    this.speechListening = false;
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

  selectedWhisperModel() {
    const control = this.querySelector("[data-setting='speechInput.whisperModel']");
    if (control?.value) return control.value;
    if (this.whisperModel) return this.whisperModel;
    return "tiny-q5";
  },

  isWhisperModelCached(model) {
    try {
      return window.localStorage.getItem(whisperCacheMarkerKey(model)) === "1";
    } catch {
      return false;
    }
  },

  refreshWhisperModelRequirement() {
    const useLocalControl = this.querySelector("[data-setting='speechInput.useLocalWhisper']");
    const model = this.selectedWhisperModel();
    let missing = false;
    if (useLocalControl?.checked === true) missing = !this.isWhisperModelCached(model);
    const button = this.querySelector("[data-action='download-whisper-model']");
    const saveButton = this.querySelector("[data-settings-form] button[type='submit']");
    if (button) {
      button.hidden = !missing;
      button.dataset.missing = missing ? "true" : "false";
      button.textContent = `download ${model}`;
    }
    if (saveButton) saveButton.disabled = missing;
    return !missing;
  },

  updateWhisperCacheStatus() {
    this.refreshWhisperModelRequirement?.();
  },

  async toggleSpeechInput() {
    await this.ensureSpeechMethods?.();
    return this.toggleSpeechInput?.();
  },

  async downloadWhisperModel() {
    await this.ensureSpeechMethods?.();
    return this.downloadWhisperModel?.();
  },

  async deleteWhisperModel() {
    await this.ensureSpeechMethods?.();
    return this.deleteWhisperModel?.();
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
    this.updatePromptFileRefs(value);
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
    if (this.attachButtonOriginalHtml === undefined) this.attachButtonOriginalHtml = this.attachButton?.innerHTML || "";
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
      this.attachButton.innerHTML = this.attachButtonOriginalHtml;
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

  renderSlashCommands(commands = [], diagnostics = []) {
    const list = this.querySelector(".slash-list");
    if (!list) return;
    list.replaceChildren();
    for (const diagnostic of diagnostics.slice(0, 3)) {
      const warning = document.createElement("div");
      warning.className = "slash-empty slash-warning";
      warning.textContent = `command warning: ${diagnostic.error || "unknown error"}`;
      list.append(warning);
    }
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

  currentPromptFileRef(value = this.prompt?.value || "") {
    if (!this.prompt || this.promptShellMode) return null;
    const cursor = this.prompt.selectionStart ?? value.length;
    if (cursor !== (this.prompt.selectionEnd ?? cursor)) return null;
    const prefix = value.slice(0, cursor);
    const match = /(^|\s)@([^\s@`]*)$/.exec(prefix);
    if (!match) return null;
    const at = prefix.length - match[2].length - 1;
    if (value[at - 1] === "`") return null;
    return { query: match[2], start: at, end: cursor };
  },

  updatePromptFileRefs(value = this.prompt?.value || "") {
    const ref = this.currentPromptFileRef(value);
    if (!ref || !ref.query) {
      this.hidePromptFileRefs();
      return;
    }
    if (!this.workspaceFiles?.length && !this.promptFileRefLoading) {
      this.promptFileRefLoading = true;
      void this.loadWorkspaceMeta?.(this.dataset.activeWorkspaceId).finally(() => {
        this.promptFileRefLoading = false;
        this.updatePromptFileRefs();
      });
    }
    const items = this.matchPromptFileRefs(ref.query);
    if (!items.length) {
      this.hidePromptFileRefs();
      return;
    }
    this.renderPromptFileRefs(items);
  },

  matchPromptFileRefs(query) {
    const needle = String(query || "").toLowerCase();
    return this.flattenWorkspaceFiles(this.workspaceFiles || [])
      .filter((item) => item.path.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle))
      .slice(0, PROMPT_FILE_REF_LIMIT);
  },

  flattenWorkspaceFiles(nodes = []) {
    const out = [];
    const visit = (node) => {
      if (!node?.name) return;
      const path = String(node.path || node.name).replace(/^\.\//, "").replace(/\\/g, "/");
      out.push({ name: node.name, path, type: node.type === "dir" ? "dir" : "file" });
      (node.children || []).forEach(visit);
    };
    nodes.forEach(visit);
    return out;
  },

  ensurePromptFileRefPopover() {
    if (this.promptFileRefPopover?.isConnected) return this.promptFileRefPopover;
    const popover = document.createElement("div");
    popover.className = "prompt-file-ref-pop";
    popover.hidden = true;
    const list = document.createElement("div");
    list.className = "prompt-file-ref-list";
    popover.append(list);
    this.promptBar?.append(popover);
    this.promptFileRefPopover = popover;
    return popover;
  },

  renderPromptFileRefs(items) {
    const popover = this.ensurePromptFileRefPopover();
    const list = popover?.querySelector(".prompt-file-ref-list");
    if (!list) return;
    list.replaceChildren();
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prompt-file-ref-item";
      button.dataset.action = "prompt-file-ref";
      button.dataset.path = item.path;
      button.classList.toggle("selected", index === 0);
      button.innerHTML = `<span class="pfr-kind"></span><span class="pfr-main"><span class="pfr-name"></span><span class="pfr-path"></span></span>`;
      button.querySelector(".pfr-kind").textContent = item.type === "dir" ? "dir" : "file";
      button.querySelector(".pfr-name").textContent = item.name;
      button.querySelector(".pfr-path").textContent = item.path;
      list.append(button);
    });
    popover.hidden = false;
  },

  hidePromptFileRefs() {
    this.promptFileRefPopover?.setAttribute("hidden", "");
  },

  pickPromptFileRef(path) {
    const ref = this.currentPromptFileRef();
    if (!this.prompt || !ref || !path) return;
    const value = this.prompt.value;
    const insert = `@${path} `;
    this.prompt.value = value.slice(0, ref.start) + insert + value.slice(ref.end);
    const cursor = ref.start + insert.length;
    this.prompt.setSelectionRange(cursor, cursor);
    this.hidePromptFileRefs();
    this.updatePrompt();
    this.prompt.focus();
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
