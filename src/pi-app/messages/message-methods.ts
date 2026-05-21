import { escapeHtml, renderBannerBody, renderPiBody } from "../../lib/renderers";
import {
  parseFallbackChoiceAnswer,
  parseFallbackChoices,
  stripFallbackChoices,
  streamVisibleChoiceText,
} from "../input/fallback-choices";
import { PI_WEB_WELCOME_TEXT, TERMINAL_SPINNER_HTML } from "../constants";

export const messageMethods = {
  renderMessages(messages) {
    if (!this.termInner) return;
    this.piDeltaBuffer = "";
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
      if (choiceId) choiceIds.add(choiceId);
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
    if (message.kind === "pi") this.piDeltaBuffer = "";
    if (message.kind === "tool") this.finalizeStreamingMessages();
    const streamingRow = this.currentStreamingRow(message.kind);
    if (streamingRow) this.removeTranscriptNode(streamingRow);
    if (message.kind === "pi") this.flushStreamingRender();
    this.appendTranscriptNode(this.messageNode(message), { stickToBottom: true });
    if (message.kind === "pi" && !this.deferTranscriptRender && parseFallbackChoices(message.text).length) {
      this.notifyChoiceRequested?.();
    }
    if (message.kind === "user") this.disableAnsweredChoice(parseFallbackChoiceAnswer(message.text));
    if (message.kind !== "user") this.syncLoadingMessage();
    this.scrollTerm();
  },

  isDuplicateMessage(message) {
    if (!["user", "pi", "think"].includes(message.kind)) return false;
    const messages = [...this.termInner.querySelectorAll(".msg:not(.loading):not(.streaming)")];
    const last = messages.at(-1);
    return last?.dataset.kind === message.kind && last.querySelector(".body")?.textContent === message.text;
  },

  appendDelta(payload) {
    if (!this.termInner || !payload?.delta) return;
    this.removeWelcomeBanner();
    this.finishRunningTools();
    this.removeLoadingMessage();
    const kind = payload.kind === "think" ? "think" : "pi";
    let delta = payload.delta;
    if (kind === "pi") {
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
    const cached = this.streamingRows?.[kind];
    if (cached?.matches?.(`.msg.streaming[data-kind='${kind}']`)) return cached;
    return this.termInner?.querySelector(`.msg.streaming[data-kind='${kind}']`);
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
    const nodes = new Set(this.termInner?.querySelectorAll(".msg.loading") || []);
    for (const item of this.transcriptItems || []) {
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
    this.transcriptItems = (this.transcriptItems || []).filter(
      (item) => !(item?.nodes || []).some((node) => loadingSet.has(node)),
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
    const hasRunningTool = !!this.termInner?.querySelector(".tool-card[data-status='running']");
    const hasAssistantOutput = !!last?.matches?.(".msg[data-kind='pi'], .fallback-choice-list");
    return !!last?.matches?.(".msg.streaming") || hasRunningTool || hasAssistantOutput;
  },

  finalizeStreamingMessages() {
    this.flushStreamingRender();
    this.piDeltaBuffer = "";
    Object.values(this.streamingRows || {}).forEach((row: Element) => row.classList.remove("streaming"));
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
    const text = stripFallbackChoices(message.text);
    const messageRow = this.simpleMessage("pi", "pi >", "");
    const body = messageRow.querySelector(".body");
    body.classList.add("markdown-body");
    body.innerHTML = renderPiBody(choices.length ? text : message.text);
    if (!choices.length) return messageRow;

    const fragment = document.createDocumentFragment();
    fragment.append(messageRow);
    for (const choice of choices) fragment.append(this.choicePanel(choice));
    return fragment;
  },

  userMessageNode(message) {
    const messageRow = this.simpleMessage("user", "you >", message.text);
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
    messageRow.querySelector(".body")?.append(list);
    return messageRow;
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
      `<input type="text" placeholder="직접 답변 입력" data-choice-custom-input>`,
      `<button type="button" data-action="fallback-choice-custom"`,
      ` data-choice-id="${escapeHtml(choice.id)}">보내기</button>`,
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
    for (const choiceId of this.answeredChoiceIds || []) this.disableRenderedChoice(choiceId);
  },

  disableRenderedChoice(choiceId) {
    const panels = [...this.termInner?.querySelectorAll(".fallback-choice-list") ?? []];
    const panel = panels.find((item) => item.dataset.choiceId === choiceId);
    panel?.classList.add("answered");
    panel?.querySelectorAll("button, input").forEach((item) => item.disabled = true);
  },

  simpleMessage(kind, prefix, text) {
    const row = document.createElement("div");
    row.className = "msg";
    row.dataset.kind = kind.split(" ")[0];
    row.innerHTML = `<div class="prefix ${kind}"></div><div class="body"></div>`;
    row.querySelector(".prefix").textContent = prefix;
    row.querySelector(".body").textContent = text;
    return row;
  },

};
