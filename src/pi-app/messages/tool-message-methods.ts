import { escapeHtml } from "../../lib/renderers";
import { renderToolBody, storeFullToolBody } from "./tool-output-rendering";

export const toolMessageMethods = {
  toolCard(message) {
    const card = document.createElement("div");
    const collapsed = message.collapsedByDefault !== false;
    card.className = `tool-card ${collapsed ? "collapsed" : ""}`.trim();
    card.dataset.tool = message.tool || "tool";
    card.dataset.status = message.status || "";
    this.latestToolCards = { ...(this.latestToolCards || {}), [card.dataset.tool]: card };
    card.innerHTML = this.toolCardTemplate(collapsed, !!message.body);
    card.querySelector(".tc-name").textContent = message.tool || "tool";
    card.querySelector(".tc-args").textContent = message.args || "";
    card.querySelector(".tc-meta").innerHTML = this.toolStatus(message);
    card.querySelector(".tc-caret").textContent = collapsed ? "▸" : "▾";
    if (message.body) {
      const body = card.querySelector(".tc-body");
      body.innerHTML = renderToolBody(message.body, { collapsed });
      storeFullToolBody(body, message.body);
    }
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
    const result = escapeHtml(message.resultMeta || "failed");
    return `<span class="err">✗</span>${result}<span class="tc-caret">▾</span>`;
  },

  completedToolStatus(message) {
    const duration = message.durationMs ? `${message.durationMs} ms` : "";
    const result = message.resultMeta ? ` · ${escapeHtml(message.resultMeta)}` : "";
    return `<span class="ok">✓</span>${duration}${result}<span class="tc-caret">▾</span>`;
  },

  appendToolOutput(payload) {
    const cards = [...this.querySelectorAll(".tool-card")];
    const visibleCard = cards.reverse().find((item) => item.dataset.tool === payload?.tool);
    const card = visibleCard || this.latestToolCards?.[payload?.tool];
    const body = card?.querySelector(".tc-body");
    if (!body) return;
    body.__pendingToolOutput = body.__pendingToolOutput || [];
    body.__pendingToolOutput.push(payload.chunk || "");
    this.scheduleToolOutputFlush(body);
  },

  scheduleToolOutputFlush(body) {
    if (body.__toolOutputFrame) return;
    body.__toolOutputFrame = window.requestAnimationFrame(() => {
      body.__toolOutputFrame = undefined;
      const chunks = body.__pendingToolOutput || [];
      body.__pendingToolOutput = [];
      if (!chunks.length) return;
      const prefix = body.__hasToolOutput || body.childNodes.length ? "\n" : "";
      body.append(document.createTextNode(`${prefix}${chunks.join("\n")}`));
      body.__hasToolOutput = true;
    });
  },

  finishTool(message) {
    const cards = [...this.querySelectorAll(".tool-card")];
    const visibleCard = cards.reverse().find((item) => item.dataset.tool === message?.tool);
    const card = visibleCard || this.latestToolCards?.[message?.tool];
    if (!card) {
      this.appendMessage(message);
      return;
    }
    const body = card.querySelector(".tc-body");
    const next = this.toolCard({ ...message, collapsedByDefault: body?.hidden !== false });
    if (!this.replaceTranscriptNode(card, next)) card.replaceWith(next);
  },
};
