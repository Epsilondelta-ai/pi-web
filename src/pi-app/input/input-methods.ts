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

export const inputMethods = {
  async submitPrompt() {
    this.stopSpeechInput?.();
    const text = this.prompt?.value.trim() || "";
    if (!text && !this.attachments?.children.length) return;
    this.clearPromptDraft?.();
    if (this.running) {
      await this.submitSteeringPrompt(text);
      return;
    }
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
    this.writeLastSessionPrompt(sessionId, text);
    if (text) {
      if (!waitForServerEcho || useAguiPrompt) this.appendMessage({ kind: "user", text });
      this.appendLoadingMessage();
      this.autonameActiveSession(text);
    }
    if (this.prompt) this.prompt.value = "";
    const attachments = this.attachmentContents.filter(Boolean);
    this.attachmentContents = [];
    this.attachments?.replaceChildren();
    if (this.attachments) this.attachments.hidden = true;
    this.updatePrompt();
    if (waitForServerEcho) {
      this.eventSource?.close();
      this.eventSource = null;
      this.setMode("running");
      try {
        const completedInAguiStream = await runAguiSessionPrompt(sessionId, text, attachments, this.aguiSubscriber(sessionId));
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
          this.connectEvents(sessionId, { replay: false });
        }
      }
    }
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
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!command || !workspaceId || !this.apiConnected) return;
    const button = event.currentTarget.querySelector("button[type='submit']");
    if (button) button.disabled = true;
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
      if (input) input.value = "";
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
      if (button) button.disabled = false;
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
    if (action === "open-file") this.openFile(button);
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
    if (action === "save-settings") this.saveSettingsForm?.(event);
    if (action === "save-auth-provider") this.saveAuthForm?.(event);
    if (action === "logout-auth-provider") this.logoutAuthProvider?.();
    if (action === "start-oauth-login") this.startOAuthLogin?.();
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
    return window.location?.protocol === "https:";
  },

  startSpeechInput() {
    if (!this.enableSpeechInput || !this.prompt) return;
    if (this.speechInputAllowed?.() !== true) {
      this.showSystemToast?.(
        "warning",
        "음성 입력 HTTPS 필요",
        "음성 입력은 HTTPS에서만 사용할 수 있습니다.",
        "speech-input:insecure-context",
      );
      return;
    }
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
      const cleanTranscript = transcript.trimStart();
      const needsSpace = basePrompt
        && cleanTranscript
        && !/\s$/.test(basePrompt)
        && !/^[\s.,!?;:)]/.test(cleanTranscript);
      this.prompt.value = `${basePrompt}${needsSpace ? " " : ""}${cleanTranscript}`;
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

  stopSpeechInput() {
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
    this.savePromptDraft?.();
    const hasAttachments = !!this.attachments?.children.length;
    this.sendButton.disabled = !value.trim() && !hasAttachments;
    this.slashPopover?.toggleAttribute("hidden", !(value.startsWith("/") && !value.includes("\n")));
    this.filterSlash(value);
    this.prompt.style.height = "auto";
    this.prompt.style.height = Math.min(180, this.prompt.scrollHeight) + "px";
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
