import { escapeHtml, renderAnsiBody, renderBannerBody, renderPiBody } from "../renderers";
import {
  parseFallbackChoiceAnswer,
  parseFallbackChoices,
  stripFallbackChoices,
  streamVisibleChoiceText,
} from "./fallback-choices";

export const messageMethods = {
  renderMessages(messages) {
    if (!this.termInner) return;
    this.piDeltaBuffer = "";
    this.termInner.replaceChildren();
    for (const message of messages) this.appendMessage(message);
    this.scrollTerm();
  },

  appendMessage(message) {
    if (!this.termInner || !message) return;
    if (this.isDuplicateMessage(message)) return;
    this.removeLoadingMessage();
    if (message.kind === "pi" || message.kind === "think") this.finishRunningTools();
    if (message.kind === "pi") this.piDeltaBuffer = "";
    if (message.kind === "tool") this.finalizeStreamingMessages();
    this.termInner.querySelector(`.msg.streaming[data-kind='${message.kind}']`)?.remove();
    this.termInner.append(this.messageNode(message));
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
      if (kind === "think") this.attachThinkingStream(messageRow);
      this.termInner.append(messageRow);
    }
    const body = messageRow.querySelector("[data-stream-text]") || messageRow.querySelector(".body");
    if (body && kind === "pi") {
      const streamText = `${messageRow.dataset.streamText || ""}${delta}`;
      messageRow.dataset.streamText = streamText;
      body.classList.add("markdown-body");
      body.innerHTML = renderPiBody(streamText);
    } else if (body) {
      body.textContent += delta;
    }
    this.scrollTerm();
  },

  currentStreamingRow(kind) {
    const lastElement = this.termInner.lastElementChild;
    return lastElement?.matches?.(`.msg.streaming[data-kind='${kind}']`) ? lastElement : null;
  },

  attachThinkingStream(messageRow) {
    messageRow.querySelector(".body").innerHTML =
      `<div class="thinking-block"><span class="label">thinking</span><span data-stream-text></span></div>`;
  },

  appendLoadingMessage() {
    if (!this.termInner || this.termInner.querySelector(".msg.loading")) return;
    const row = this.simpleMessage("pi loading", "pi >", "");
    row.querySelector(".body").innerHTML = `<span class="spinner">⠋</span><span>waiting for response…</span>`;
    row.classList.add("loading");
    row.dataset.kind = "loading";
    this.termInner.append(row);
    this.scrollTerm();
  },

  removeLoadingMessage() {
    this.termInner?.querySelector(".msg.loading")?.remove();
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
    const last = this.termInner?.lastElementChild;
    const hasRunningTool = !!this.termInner?.querySelector(".tool-card[data-status='running']");
    const hasAssistantOutput = !!last?.matches?.(".msg[data-kind='pi']");
    return !!last?.matches?.(".msg.streaming") || hasRunningTool || hasAssistantOutput;
  },

  finalizeStreamingMessages() {
    this.piDeltaBuffer = "";
    this.termInner?.querySelectorAll(".msg.streaming").forEach((row) => row.classList.remove("streaming"));
  },

  finishRunningTools({ status = "ok", resultMeta = "done" } = {}) {
    this.termInner?.querySelectorAll(".tool-card[data-status='running']").forEach((card) => {
      card.dataset.status = status;
      const meta = card.querySelector(".tc-meta");
      if (meta) meta.innerHTML = this.toolStatus({ status, resultMeta });
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

  toolCard(message) {
    const card = document.createElement("div");
    card.className = `tool-card ${message.collapsedByDefault ? "collapsed" : ""}`.trim();
    card.dataset.tool = message.tool || "tool";
    card.dataset.status = message.status || "";
    const collapsed = !!message.collapsedByDefault;
    card.innerHTML = this.toolCardTemplate(collapsed, !!message.body);
    card.querySelector(".tc-name").textContent = message.tool || "tool";
    card.querySelector(".tc-args").textContent = message.args || "";
    card.querySelector(".tc-meta").innerHTML = this.toolStatus(message);
    if (message.body) card.querySelector(".tc-body").innerHTML = renderAnsiBody(message.body);
    return card;
  },

  toolCardTemplate(collapsed, hasBody) {
    return [
      `<button type="button" class="tc-head" aria-expanded="${!collapsed}" data-action="toggle-tool">`,
      `<span class="tc-glyph">●</span><span class="tc-name"></span>`,
      `<span class="tc-args"></span><span class="tc-meta"></span></button>`,
      `<div class="tc-body"${collapsed || !hasBody ? " hidden" : ""}></div>`,
    ].join("");
  },

  toolStatus(message) {
    if (message.status === "running") return this.runningToolStatus();
    if (message.status === "err") return this.errorToolStatus(message);
    return this.completedToolStatus(message);
  },

  runningToolStatus() {
    return [
      `<span class="spinner">⠋</span><span style="color:var(--accent)">running</span>`,
      `<span class="tc-caret">▾</span>`,
    ].join("");
  },

  errorToolStatus(message) {
    return `<span class="err">✗</span>${escapeHtml(message.resultMeta || "failed")}<span class="tc-caret">▾</span>`;
  },

  completedToolStatus(message) {
    const duration = message.durationMs ? `${message.durationMs} ms` : "";
    const result = message.resultMeta ? ` · ${escapeHtml(message.resultMeta)}` : "";
    return `<span class="ok">✓</span>${duration}${result}<span class="tc-caret">▾</span>`;
  },

  appendToolOutput(payload) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === payload?.tool);
    const body = card?.querySelector(".tc-body");
    if (!body) return;
    body.hidden = false;
    body.textContent += `${body.textContent ? "\n" : ""}${payload.chunk || ""}`;
  },

  finishTool(message) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === message?.tool);
    if (!card) {
      this.appendMessage(message);
      return;
    }
    const next = this.toolCard(message);
    card.replaceWith(next);
    this.syncLoadingMessage();
  },
};
