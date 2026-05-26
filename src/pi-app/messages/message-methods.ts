import { fallbackValue } from "../../lib/fallbacks";
import { escapeHtml, renderBannerBody, renderPiBody, renderUserBody } from "../../lib/renderers";
import { parseDesignDecks, stripDesignDecks } from "../input/design-decks";
import {
  parseFallbackChoiceAnswer,
  parseFallbackChoices,
  stripFallbackChoices,
  streamVisibleChoiceText,
} from "../input/fallback-choices";
import { PI_WEB_WELCOME_TEXT, TERMINAL_SPINNER_HTML } from "../constants";

export function streamingRowsStart(replaced) {
  return replaced ? 1 : 0;
}

export const messageMethods = {
  renderMessages(messages) {
    if (!this.termInner) return;
    this.piDeltaBuffer = "";
    this.piStreamText = "";
    this.streamingRows = {};
    this.termInner.replaceChildren();
    this.resetTranscriptWindow();
    this.deferTranscriptRender = false;
    this.answeredChoiceIds = this.answeredChoiceIdsFrom(messages);
    this.transcriptItems = messages.map((message) => this.createTranscriptItem(message));
    this.renderTranscriptWindow({ stickToBottom: true });
    this.syncWelcomeBanner(messages);
    this.scrollTerm();
  },

  syncWelcomeBanner(messages) {
    if (!this.termInner || messages.length > 0) return;
    this.termInner.append(this.welcomeBannerNode());
  },

  removeWelcomeBanner() {
    this.termInner?.querySelector("[data-welcome-banner]")?.remove();
  },

  welcomeBannerNode() {
    const bannerElement = document.createElement("pre");
    bannerElement.className = "ascii-banner welcome-banner";
    bannerElement.dataset.welcomeBanner = "";
    bannerElement.innerHTML = renderBannerBody(PI_WEB_WELCOME_TEXT);
    return bannerElement;
  },

  answeredChoiceIdsFrom(messages) {
    const choiceIds = new Set();
    for (const message of messages) {
      if (message.kind !== "user") continue;
      const choiceId = parseFallbackChoiceAnswer(message.text);
      choiceIds.add(choiceId);
      choiceIds.delete(undefined);
    }
    return choiceIds;
  },

  appendMessage(message) {
    if (!this.termInner || !message) return;
    this.removeWelcomeBanner();
    if (this.isDuplicateMessage(message)) {
      if (message.kind !== "user") this.removeLoadingMessage();
      return;
    }
    this.removeLoadingMessage();
    if (message.kind === "pi" || message.kind === "think") this.finishRunningTools();
    if (message.kind === "pi") this.clearStreamingState("pi");
    if (message.kind === "tool") this.finalizeStreamingMessages();
    for (const streamingRow of this.streamingRowsForKind(message.kind)) this.removeTranscriptNode(streamingRow);
    this.appendTranscriptNode(this.messageNode(message), { stickToBottom: true });
    this.notifyPiMessageCommitted(message);
    if (message.kind === "user") this.disableAnsweredChoice(parseFallbackChoiceAnswer(message.text));
    if (message.kind !== "user") this.syncLoadingMessage();
    this.scrollTerm();
  },

  isDuplicateMessage(message) {
    if (!["user", "pi", "think"].includes(message.kind)) return false;
    const messages = [...this.termInner.querySelectorAll(".msg:not(.loading):not(.streaming)")];
    const last = messages.at(-1);
    return last?.dataset.kind === message.kind && (last.dataset.rawText ?? last.querySelector(".body")?.textContent) === message.text;
  },

  appendDelta(payload) {
    if (!this.termInner || !payload?.delta) return;
    this.removeWelcomeBanner();
    this.finishRunningTools();
    const kind = payload.kind === "think" ? "think" : "pi";
    this.removeLoadingMessage();
    let delta = payload.delta;
    if (kind === "pi") {
      this.piStreamText = `${this.piStreamText || ""}${payload.delta}`;
      const filtered = streamVisibleChoiceText(this.piDeltaBuffer + payload.delta);
      this.piDeltaBuffer = filtered.pending;
      delta = filtered.visible;
      if (!delta) return;
    }
    let messageRow = this.currentStreamingRow(kind);
    if (!messageRow) {
      messageRow = this.simpleMessage(`${kind} streaming`, kind === "think" ? "…" : "pi >", "");
      messageRow.classList.add("streaming");
      messageRow.dataset.kind = kind;
      this.streamingRows = { ...(this.streamingRows || {}), [kind]: messageRow };
      if (kind === "think") this.attachThinkingStream(messageRow);
      this.appendTranscriptNode(messageRow, { stickToBottom: true });
    }
    const body = messageRow.querySelector("[data-stream-text]") || messageRow.querySelector(".body");
    if (body && kind === "pi") {
      messageRow.dataset.streamText = `${messageRow.dataset.streamText || ""}${delta}`;
      body.classList.add("markdown-body");
      this.scheduleStreamingRender(messageRow);
    } else if (body) {
      body.textContent += delta;
      this.notifyTranscriptNodeHeightDidChange(messageRow);
    }
    if (kind !== "pi") this.syncLoadingMessage();
    this.scrollTerm();
  },

  flushStreamingRender() {
    if (this.streamingRenderFrame) {
      window.cancelAnimationFrame(this.streamingRenderFrame);
      this.streamingRenderFrame = undefined;
    }
    const row = this.pendingStreamingRow;
    const body = row?.querySelector("[data-stream-text]") || row?.querySelector(".body");
    if (body && row?.dataset.streamText !== undefined) {
      body.innerHTML = renderPiBody(row.dataset.streamText);
      this.notifyTranscriptNodeHeightDidChange(row);
    }
    this.pendingStreamingRow = undefined;
  },

  scheduleStreamingRender(row) {
    this.pendingStreamingRow = row;
    if (this.streamingRenderFrame) return;
    this.streamingRenderFrame = window.requestAnimationFrame(() => {
      this.streamingRenderFrame = undefined;
      this.flushStreamingRender();
    });
  },

  currentStreamingRow(kind) {
    return this.streamingRowsForKind(kind)[0];
  },

  streamingRowsForKind(kind) {
    const rows = new Set();
    const selector = `.msg.streaming[data-kind='${kind}']`;
    const cached = this.streamingRows?.[kind];
    if (cached?.matches?.(selector)) rows.add(cached);
    this.termInner?.querySelectorAll(selector).forEach((row) => rows.add(row));
    for (const item of this.transcriptItems || []) {
      for (const node of item?.nodes || []) {
        if (node?.matches?.(selector)) rows.add(node);
      }
    }
    return [...rows];
  },

  finalizePiStream(text) {
    if (!this.termInner) return;
    const message = { kind: "pi", text };
    this.removeWelcomeBanner();
    const streamingRows = this.streamingRowsForKind("pi");
    if (this.isDuplicateMessage(message)) {
      this.removeLoadingMessage();
      this.clearStreamingState("pi");
      for (const row of streamingRows) this.removeTranscriptNode(row);
      return;
    }
    this.removeLoadingMessage();
    this.finishRunningTools();
    this.clearStreamingState("pi");
    const finalNode = this.messageNode(message);
    const replaced = streamingRows[0] && this.replaceTranscriptNode(streamingRows[0], finalNode);
    for (const row of streamingRows.slice(replaced ? 1 : 0)) this.removeTranscriptNode(row);
    if (!replaced) this.appendTranscriptNode(finalNode, { stickToBottom: true });
    this.notifyPiMessageCommitted(message);
    this.syncLoadingMessage();
    this.scrollTerm();
  },

  clearStreamingState(kind) {
    this.flushStreamingRender();
    if (kind === "pi") {
      this.piDeltaBuffer = "";
      this.piStreamText = "";
    }
    if (this.streamingRows?.[kind]) this.streamingRows = { ...fallbackValue(this.streamingRows, {}), [kind]: undefined };
    if (this.pendingStreamingRow?.matches?.(`.msg.streaming[data-kind='${kind}']`)) this.pendingStreamingRow = undefined;
  },

  notifyPiMessageCommitted(message) {
    if (message.kind !== "pi") return;
    if (this.isReadAloudEnabled()) this.speakAssistantText(message.text);
    const choices = parseFallbackChoices(message.text);
    if (!this.deferTranscriptRender && choices.length) {
      this.notifyChoiceRequested?.();
      return;
    }
    if (this.running) this.notifyResponseCompletedOnce?.();
  },

  attachThinkingStream(messageRow) {
    messageRow.querySelector(".body").innerHTML =
      `<div class="thinking-block"><span class="label">thinking</span><span data-stream-text></span></div>`;
  },

  appendLoadingMessage() {
    if (!this.termInner || this.hasLoadingMessage()) return;
    this.removeWelcomeBanner();
    const row = this.simpleMessage("pi loading", "pi >", "");
    row.querySelector(".body").innerHTML = `${TERMINAL_SPINNER_HTML}<span>waiting for response…</span>`;
    row.classList.add("loading");
    row.dataset.kind = "loading";
    this.appendTranscriptNode(row, { stickToBottom: true });
    this.scrollTerm();
  },

  hasLoadingMessage() {
    return !!this.loadingMessageNodes().length;
  },

  loadingMessageNodes() {
    const nodes = new Set(fallbackValue(this.termInner?.querySelectorAll(".msg.loading"), []));
    for (const item of fallbackValue(this.transcriptItems, [])) {
      for (const node of item?.nodes || []) {
        if (node?.matches?.(".msg.loading")) nodes.add(node);
      }
    }
    return [...nodes];
  },

  removeLoadingMessage() {
    const loadingNodes = this.loadingMessageNodes();
    if (!loadingNodes.length) return;
    const loadingSet = new Set(loadingNodes);
    this.transcriptItems = fallbackValue(this.transcriptItems, []).filter(
      (item) => !fallbackValue(item?.nodes, []).some((node) => loadingSet.has(node)),
    );
    loadingNodes.forEach((loading) => loading.remove?.());
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom: false });
  },

  syncLoadingMessage() {
    if (!this.running) {
      this.removeLoadingMessage();
      return;
    }
    if (this.hasActiveTranscriptItem()) {
      this.removeLoadingMessage();
      return;
    }
    this.appendLoadingMessage();
  },

  hasActiveTranscriptItem() {
    const last = this.termInner?.lastElementChild?.matches?.(".transcript-item")
      ? this.termInner.lastElementChild.lastElementChild
      : this.termInner?.lastElementChild;
    return !!last?.matches?.([
      ".msg.streaming[data-kind='pi']",
      ".msg[data-kind='pi']",
      ".fallback-choice-list",
      ".design-deck-panel",
    ].join(", "));
  },

  finalizeStreamingMessages() {
    this.flushStreamingRender();
    const piText = this.piStreamText || "";
    const piRows = this.streamingRowsForKind("pi");
    if (piText && piRows.length) {
      const finalNode = this.messageNode({ kind: "pi", text: piText });
      const replaced = this.replaceTranscriptNode(piRows[0], finalNode);
      for (const row of piRows.slice(streamingRowsStart(replaced))) this.removeTranscriptNode(row);
      this.notifyPiMessageCommitted({ kind: "pi", text: piText });
    }
    this.piDeltaBuffer = "";
    this.piStreamText = "";
    Object.values(this.streamingRows || {}).forEach((row: Element) => row?.classList?.remove("streaming"));
    this.streamingRows = {};
    this.termInner?.querySelectorAll(".msg.streaming").forEach((row) => row.classList.remove("streaming"));
  },

  finishRunningTools({ status = "ok", resultMeta = "done" } = {}) {
    this.termInner?.querySelectorAll(".tool-card[data-status='running']").forEach((card) => {
      card.dataset.status = status;
      const meta = card.querySelector(".tc-meta");
      if (meta) meta.innerHTML = this.toolStatus({ status, resultMeta });
      this.notifyTranscriptNodeHeightDidChange(card);
    });
  },

  messageNode(message) {
    if (message.kind === "banner") return this.bannerMessageNode(message);
    if (message.kind === "user") return this.userMessageNode(message);
    if (message.kind === "think") return this.thinkingMessageNode(message);
    if (message.kind === "pi") return this.assistantMessageNode(message);
    if (message.kind === "tool") return this.toolCard(message);
    return this.simpleMessage("pi", "pi >", JSON.stringify(message));
  },

  bannerMessageNode(message) {
    const bannerElement = document.createElement("pre");
    bannerElement.className = "ascii-banner";
    bannerElement.innerHTML = renderBannerBody(message.text);
    return bannerElement;
  },

  thinkingMessageNode(message) {
    const messageRow = this.simpleMessage("think", "…", "");
    messageRow.querySelector(".body").innerHTML =
      `<div class="thinking-block"><span class="label">thinking</span>${escapeHtml(message.text)}</div>`;
    return messageRow;
  },

  assistantMessageNode(message) {
    const choices = parseFallbackChoices(message.text);
    const decks = parseDesignDecks(message.text);
    const text = stripDesignDecks(stripFallbackChoices(message.text));
    const messageRow = this.simpleMessage("pi", "pi >", "");
    const body = messageRow.querySelector(".body");
    messageRow.dataset.rawText = message.text;
    body.classList.add("markdown-body");
    body.innerHTML = renderPiBody(choices.length || decks.length ? text : message.text);
    this.syncReadAloudButton(messageRow);
    if (!choices.length && !decks.length) return messageRow;

    const fragment = document.createDocumentFragment();
    if (text) fragment.append(messageRow);
    for (const deck of decks) fragment.append(this.designDeckPanel(deck));
    for (const choice of choices) fragment.append(this.choicePanel(choice));
    return fragment;
  },

  userMessageNode(message) {
    const messageRow = this.simpleMessage("user", "you >", "");
    const body = messageRow.querySelector(".body");
    messageRow.dataset.rawText = message.text;
    body.classList.add("markdown-body");
    body.innerHTML = renderUserBody(message.text);
    const images = (message.attachments || []).filter((item) => item.type === "image" && item.dataUrl);
    if (!images.length) return messageRow;
    const list = document.createElement("div");
    list.className = "msg-attachments";
    for (const image of images) {
      const preview = document.createElement("img");
      preview.className = "msg-image";
      preview.src = image.dataUrl;
      preview.alt = image.name || "attached image";
      list.append(preview);
    }
    body?.append(list);
    return messageRow;
  },

  designDeckPanel(deck) {
    const panel = document.createElement("section");
    panel.className = "design-deck-panel";
    panel.dataset.deckId = deck.id;
    const header = document.createElement("div");
    header.className = "design-deck-head";
    header.innerHTML = `<span>design</span><strong></strong>`;
    header.querySelector("strong").textContent = deck.title;
    panel.append(header);

    for (const slide of deck.slides) {
      const slideElement = document.createElement("div");
      slideElement.className = "design-slide";
      const title = document.createElement("div");
      title.className = "design-slide-title";
      title.textContent = slide.title;
      slideElement.append(title);
      if (slide.context) {
        const context = document.createElement("p");
        context.className = "design-slide-context";
        context.textContent = slide.context;
        slideElement.append(context);
      }
      const options = document.createElement("div");
      options.className = "design-options";
      for (const option of slide.options) options.append(this.designOptionCard(option));
      slideElement.append(options);
      panel.append(slideElement);
    }
    return panel;
  },

  designOptionCard(option) {
    const card = document.createElement("article");
    card.className = "design-option-card";
    if (option.recommended) card.dataset.recommended = "true";
    const meta = document.createElement("div");
    meta.className = "design-option-meta";
    meta.innerHTML = `<div><strong></strong>${option.description ? `<p></p>` : ""}</div>${option.recommended ? `<span>recommended</span>` : ""}`;
    meta.querySelector("strong").textContent = option.label;
    if (option.description) meta.querySelector("p").textContent = option.description;
    card.append(meta);

    const frame = document.createElement("iframe");
    frame.className = "design-preview-frame";
    frame.title = `${option.label} preview`;
    frame.setAttribute("sandbox", "");
    frame.srcdoc = option.previewHtml;
    card.append(frame);

    if (option.aside) {
      const aside = document.createElement("p");
      aside.className = "design-option-aside";
      aside.textContent = option.aside;
      card.append(aside);
    }
    return card;
  },

  choicePanel(choice) {
    const panel = document.createElement("div");
    panel.className = "fallback-choice-list";
    panel.dataset.choiceId = choice.id;
    panel.innerHTML = [
      `<div class="choice-head"><span>choice</span><strong></strong></div>`,
      `<div class="choice-options"></div>`,
    ].join("");
    panel.querySelector("strong").textContent = choice.question;
    const options = panel.querySelector(".choice-options");
    for (const option of choice.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = "fallback-choice";
      button.dataset.choiceId = choice.id;
      button.dataset.choiceValue = option.value;
      button.innerHTML = `<span class="choice-label"></span>${option.description ? `<small></small>` : ""}`;
      button.querySelector(".choice-label").textContent = option.label;
      if (option.description) button.querySelector("small").textContent = option.description;
      options.append(button);
    }
    const custom = document.createElement("div");
    custom.className = "choice-custom";
    custom.innerHTML = [
      `<input type="text" placeholder="Type a custom answer" data-choice-custom-input>`,
      `<button type="button" data-action="fallback-choice-custom"`,
      ` data-choice-id="${escapeHtml(choice.id)}">Send</button>`,
    ].join("");
    panel.append(custom);
    return panel;
  },

  disableAnsweredChoice(choiceId) {
    if (!choiceId) return;
    this.answeredChoiceIds ??= new Set();
    this.answeredChoiceIds.add(choiceId);
    this.disableRenderedChoice(choiceId);
  },

  syncAnsweredChoices() {
    for (const choiceId of fallbackValue(this.answeredChoiceIds, [])) this.disableRenderedChoice(choiceId);
  },

  disableRenderedChoice(choiceId) {
    const panels = [...this.termInner?.querySelectorAll(".fallback-choice-list") ?? []];
    const panel = panels.find((item) => item.dataset.choiceId === choiceId);
    panel?.classList.add("answered");
    panel?.querySelectorAll("button, input").forEach((item) => item.disabled = true);
  },

  isReadAloudEnabled() {
    return this.readResponsesAloud === true;
  },

  syncReadAloudControls() {
    const nodes = new Set(fallbackValue(this.termInner?.querySelectorAll(".msg[data-kind='pi']"), []));
    for (const item of this.transcriptItems || []) {
      for (const node of item?.nodes || []) {
        if (node?.matches?.(".msg[data-kind='pi']")) nodes.add(node);
      }
    }
    for (const node of nodes) this.syncReadAloudButton(node);
    if (!this.isReadAloudEnabled()) globalThis.speechSynthesis?.cancel?.();
  },

  syncReadAloudButton(messageRow) {
    if (!messageRow?.matches?.(".msg[data-kind='pi']")) return;
    messageRow.querySelector(".read-response-actions")?.remove();
    if (!this.isReadAloudEnabled()) return;
    const actions = document.createElement("span");
    actions.className = "read-response-actions";
    actions.append(
      this.readResponseButton("read-response", "Read response aloud", this.speakerIcon()),
      this.readResponseButton("stop-response", "Stop reading", this.stopIcon()),
    );
    messageRow.append(actions);
  },

  readResponseButton(action, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "read-response-btn";
    button.dataset.action = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    return button;
  },

  speakerIcon() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"`,
      ` stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`,
      ` aria-hidden="true" data-lucide="volume-2">`,
      `<path d="M11 5 6 9H2v6h4l5 4V5z"></path>`,
      `<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`,
      `<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>`,
      `</svg>`,
    ].join("");
  },

  stopIcon() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"`,
      ` stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`,
      ` aria-hidden="true" data-lucide="square">`,
      `<rect width="18" height="18" x="3" y="3" rx="2"></rect>`,
      `</svg>`,
    ].join("");
  },

  readAssistantMessageNode(messageRow) {
    if (!messageRow) return;
    this.speakAssistantText(messageRow.dataset.rawText || messageRow.querySelector(".body")?.textContent || "");
  },

  stopReadingResponse() {
    globalThis.speechSynthesis?.cancel?.();
  },

  speakAssistantText(text) {
    const content = this.speechTextFromAssistantText(text);
    if (!content) return;
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
    synth.cancel?.();
    const utterance = new SpeechSynthesisUtterance(content);
    const language = this.voiceLanguage || this.speechLanguage || "system";
    utterance.lang = language === "system" ? fallbackValue(navigator.language, "en-US") : fallbackValue(language, "en-US");
    synth.speak?.(utterance);
  },

  speechTextFromAssistantText(text) {
    const visibleText = stripDesignDecks(stripFallbackChoices(text || "")).trim();
    if (!visibleText) return "";
    const scratch = document.createElement("div");
    scratch.innerHTML = renderPiBody(visibleText);
    return (scratch.textContent || visibleText).replace(/\s+/g, " ").trim();
  },

  async copyCodeBlock(button) {
    const code = button?.closest?.(".code-block")?.querySelector?.("pre code")?.textContent ?? "";
    if (!code) return;
    button.disabled = true;
    try {
      await this.copyTextToClipboard(code);
      this.markCodeCopyButton(button, "copied");
    } catch {
      this.markCodeCopyButton(button, "failed");
    } finally {
      button.disabled = false;
    }
  },

  async copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand?.("copy");
    textarea.remove();
    if (copied === false) throw new Error("copy failed");
  },

  markCodeCopyButton(button, status) {
    if (!button) return;
    if (button.copyResetTimer) window.clearTimeout(button.copyResetTimer);
    button.dataset.copyStatus = status;
    button.textContent = status === "copied" ? "copied" : "failed";
    button.copyResetTimer = window.setTimeout(() => {
      button.dataset.copyStatus = "";
      button.textContent = "copy";
      button.copyResetTimer = undefined;
    }, 1400);
  },

  simpleMessage(kind, prefix, text) {
    const row = document.createElement("div");
    row.className = "msg";
    row.dataset.kind = kind.split(" ")[0];
    row.dataset.rawText = text;
    row.innerHTML = `<div class="prefix ${kind}"></div><div class="body"></div>`;
    row.querySelector(".prefix").textContent = prefix;
    row.querySelector(".body").textContent = text;
    return row;
  },

};
