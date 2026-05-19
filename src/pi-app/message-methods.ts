import { escapeHtml, renderAnsiBody, renderBannerBody, renderPiBody } from "../renderers";
import { parseFallbackChoiceAnswer, parseFallbackChoices, stripFallbackChoices, streamVisibleChoiceText } from "./fallback-choices";

export const messageMethods = {
  renderMessages(messages) {
    if (!this.termInner) return;
    this.piDeltaBuffer = "";
    this.termInner.replaceChildren();
    for (const msg of messages) this.appendMessage(msg);
    this.scrollTerm();
  },

  appendMessage(msg) {
    if (!this.termInner || !msg) return;
    if (this.isDuplicateMessage(msg)) return;
    this.removeLoadingMessage();
    if (msg.kind === "pi" || msg.kind === "think") this.finishRunningTools();
    if (msg.kind === "pi") this.piDeltaBuffer = "";
    if (msg.kind === "tool") this.finalizeStreamingMessages();
    this.termInner.querySelector(`.msg.streaming[data-kind='${msg.kind}']`)?.remove();
    this.termInner.append(this.messageNode(msg));
    if (msg.kind === "user") this.disableAnsweredChoice(parseFallbackChoiceAnswer(msg.text));
    if (msg.kind !== "user") this.syncLoadingMessage();
    this.scrollTerm();
  },

  isDuplicateMessage(msg) {
    if (!["user", "pi", "think"].includes(msg.kind)) return false;
    const messages = [...this.termInner.querySelectorAll(".msg:not(.loading):not(.streaming)")];
    const last = messages.at(-1);
    return last?.dataset.kind === msg.kind && last.querySelector(".body")?.textContent === msg.text;
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
    let row = this.termInner.lastElementChild?.matches?.(`.msg.streaming[data-kind='${kind}']`) ? this.termInner.lastElementChild : null;
    if (!row) {
      row = this.simpleMessage(`${kind} streaming`, kind === "think" ? "…" : "pi >", "");
      row.classList.add("streaming");
      row.dataset.kind = kind;
      if (kind === "think") {
        row.querySelector(".body").innerHTML = `<div class="thinking-block"><span class="label">thinking</span><span data-stream-text></span></div>`;
      }
      this.termInner.append(row);
    }
    const body = row.querySelector("[data-stream-text]") || row.querySelector(".body");
    if (body && kind === "pi") {
      const streamText = `${row.dataset.streamText || ""}${delta}`;
      row.dataset.streamText = streamText;
      body.classList.add("markdown-body");
      body.innerHTML = renderPiBody(streamText);
    } else if (body) {
      body.textContent += delta;
    }
    this.scrollTerm();
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

  messageNode(msg) {
    if (msg.kind === "banner") {
      const pre = document.createElement("pre");
      pre.className = "ascii-banner";
      pre.innerHTML = renderBannerBody(msg.text);
      return pre;
    }
    if (msg.kind === "user") return this.userMessageNode(msg);
    if (msg.kind === "think") {
      const row = this.simpleMessage("think", "…", "");
      row.querySelector(".body").innerHTML = `<div class="thinking-block"><span class="label">thinking</span>${escapeHtml(msg.text)}</div>`;
      return row;
    }
    if (msg.kind === "pi") {
      const choices = parseFallbackChoices(msg.text);
      const text = stripFallbackChoices(msg.text);
      const row = this.simpleMessage("pi", "pi >", "");
      const body = row.querySelector(".body");
      body.classList.add("markdown-body");
      body.innerHTML = renderPiBody(choices.length ? text : msg.text);
      if (!choices.length) return row;
      const fragment = document.createDocumentFragment();
      fragment.append(row);
      for (const choice of choices) fragment.append(this.choicePanel(choice));
      return fragment;
    }
    if (msg.kind === "tool") return this.toolCard(msg);
    return this.simpleMessage("pi", "pi >", JSON.stringify(msg));
  },

  userMessageNode(msg) {
    const row = this.simpleMessage("user", "you >", msg.text);
    const images = (msg.attachments || []).filter((item) => item.type === "image" && item.dataUrl);
    if (!images.length) return row;
    const list = document.createElement("div");
    list.className = "msg-attachments";
    for (const image of images) {
      const preview = document.createElement("img");
      preview.className = "msg-image";
      preview.src = image.dataUrl;
      preview.alt = image.name || "attached image";
      list.append(preview);
    }
    row.querySelector(".body")?.append(list);
    return row;
  },

  choicePanel(choice) {
    const panel = document.createElement("div");
    panel.className = "fallback-choice-list";
    panel.dataset.choiceId = choice.id;
    panel.innerHTML = `<div class="choice-head"><span>choice</span><strong></strong></div><div class="choice-options"></div>`;
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
    if (choice.allowCustom) {
      const custom = document.createElement("div");
      custom.className = "choice-custom";
      custom.innerHTML = `<input type="text" placeholder="직접 답변 입력" data-choice-custom-input><button type="button" data-action="fallback-choice-custom" data-choice-id="${escapeHtml(choice.id)}">submit</button>`;
      panel.append(custom);
    }
    return panel;
  },

  disableAnsweredChoice(choiceId) {
    if (!choiceId) return;
    const panel = [...this.termInner?.querySelectorAll(".fallback-choice-list") ?? []].find((item) => item.dataset.choiceId === choiceId);
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

  toolCard(msg) {
    const card = document.createElement("div");
    card.className = `tool-card ${msg.collapsedByDefault ? "collapsed" : ""}`.trim();
    card.dataset.tool = msg.tool || "tool";
    card.dataset.status = msg.status || "";
    const collapsed = !!msg.collapsedByDefault;
    card.innerHTML = `<button type="button" class="tc-head" aria-expanded="${!collapsed}" data-action="toggle-tool"><span class="tc-glyph">●</span><span class="tc-name"></span><span class="tc-args"></span><span class="tc-meta"></span></button><div class="tc-body"${collapsed || !msg.body ? " hidden" : ""}></div>`;
    card.querySelector(".tc-name").textContent = msg.tool || "tool";
    card.querySelector(".tc-args").textContent = msg.args || "";
    card.querySelector(".tc-meta").innerHTML = this.toolStatus(msg);
    if (msg.body) card.querySelector(".tc-body").innerHTML = renderAnsiBody(msg.body);
    return card;
  },

  toolStatus(msg) {
    if (msg.status === "running") return `<span class="spinner">⠋</span><span style="color:var(--accent)">running</span><span class="tc-caret">▾</span>`;
    if (msg.status === "err") return `<span class="err">✗</span>${escapeHtml(msg.resultMeta || "failed")}<span class="tc-caret">▾</span>`;
    return `<span class="ok">✓</span>${msg.durationMs ? `${msg.durationMs} ms` : ""}${msg.resultMeta ? ` · ${escapeHtml(msg.resultMeta)}` : ""}<span class="tc-caret">▾</span>`;
  },

  appendToolOutput(payload) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === payload?.tool);
    const body = card?.querySelector(".tc-body");
    if (!body) return;
    body.hidden = false;
    body.textContent += `${body.textContent ? "\n" : ""}${payload.chunk || ""}`;
  },

  finishTool(msg) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === msg?.tool);
    if (!card) {
      this.appendMessage(msg);
      return;
    }
    const next = this.toolCard(msg);
    card.replaceWith(next);
    this.syncLoadingMessage();
  },
};
