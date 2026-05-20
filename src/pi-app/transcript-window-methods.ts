const TRANSCRIPT_WINDOW_SIZE = 30;
const DEFAULT_TRANSCRIPT_ITEM_HEIGHT = 80;

function elementNodes(node) {
  if (!node) return [];
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].filter(isElement);
  return isElement(node) ? [node] : [];
}

function isElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function measuredHeight(nodes) {
  const heights = nodes.map((node) => node.getBoundingClientRect?.().height || node.offsetHeight || 0);
  return heights.reduce((total, height) => total + height, 0);
}

function clampTranscriptStart(start, total) {
  return Math.max(0, Math.min(start, Math.max(0, total - TRANSCRIPT_WINDOW_SIZE)));
}

export const transcriptWindowMethods = {
  initTranscriptWindow() {
    this.term = this.querySelector(".term");
    this.transcriptItems = [];
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.transcriptFollowBottom = true;
    this.answeredChoiceIds = new Set();
    this.transcriptTopSpacer = document.createElement("div");
    this.transcriptBottomSpacer = document.createElement("div");
    this.transcriptTopSpacer.className = "transcript-spacer transcript-spacer-top";
    this.transcriptBottomSpacer.className = "transcript-spacer transcript-spacer-bottom";
    this.transcriptTopSpacer.setAttribute("aria-hidden", "true");
    this.transcriptBottomSpacer.setAttribute("aria-hidden", "true");
    this.transcriptScrollButton = this.ensureTranscriptScrollButton();
    this.installTranscriptScrollGuard();
    this.term?.addEventListener("scroll", () => this.handleTranscriptScroll());
    this.adoptRenderedTranscript();
    this.updateTranscriptScrollButton();
  },

  ensureTranscriptScrollButton() {
    const existingButton = this.querySelector("[data-action='scroll-bottom']");
    if (existingButton) {
      existingButton.addEventListener("click", () => this.scrollTranscriptToBottom());
      return existingButton;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scroll-bottom-btn";
    button.dataset.action = "scroll-bottom";
    button.setAttribute("aria-label", "scroll to bottom");
    button.title = "scroll to bottom";
    button.textContent = "↓";
    button.hidden = true;
    button.addEventListener("click", () => this.scrollTranscriptToBottom());
    this.term?.parentElement?.append(button);
    return button;
  },

  installTranscriptScrollGuard() {
    if (this.transcriptScrollGuardInstalled) return;
    this.transcriptScrollGuardInstalled = true;
    this.scrollTerm = ({ force = false } = {}) => {
      if (!force && this.transcriptFollowBottom === false) return;
      if (this.scrollFrame) {
        if (!force) return;
        window.cancelAnimationFrame?.(this.scrollFrame);
        this.scrollFrame = undefined;
      }
      const scroll = () => {
        if (!this.term) return;
        this.term.scrollTop = this.term.scrollHeight;
        this.updateTranscriptScrollButton();
      };
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = undefined;
        scroll();
        window.requestAnimationFrame(scroll);
      });
    };
  },

  handleTranscriptScroll() {
    this.transcriptFollowBottom = this.isTermPinnedToBottom();
    this.updateTranscriptScrollButton();
    this.scheduleTranscriptWindowRender();
  },

  scrollTranscriptToBottom() {
    this.transcriptFollowBottom = true;
    this.renderTranscriptWindow({ stickToBottom: true });
    this.scrollTerm({ force: true });
    this.updateTranscriptScrollButton();
  },

  updateTranscriptScrollButton() {
    if (!this.transcriptScrollButton) return;
    this.transcriptScrollButton.hidden = this.isTermPinnedToBottom();
  },

  adoptRenderedTranscript() {
    const existingNodes = [...(this.termInner?.children || [])].filter(
      (node) => !node.classList.contains("transcript-spacer"),
    );
    if (!existingNodes.length) return;
    this.transcriptItems = existingNodes.map((node) => ({
      nodes: [node],
      height: measuredHeight([node]) || DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
    }));
    this.renderTranscriptWindow({ stickToBottom: true });
  },

  resetTranscriptWindow() {
    this.transcriptItems = [];
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.transcriptWindowFrame = undefined;
    this.transcriptFollowBottom = true;
    this.answeredChoiceIds = new Set();
    this.transcriptTopSpacer?.remove();
    this.transcriptBottomSpacer?.remove();
    this.updateTranscriptScrollButton();
  },

  createTranscriptItem(message) {
    return { message, height: DEFAULT_TRANSCRIPT_ITEM_HEIGHT };
  },

  appendTranscriptNode(node, { stickToBottom = true } = {}) {
    const nodes = elementNodes(node);
    if (!nodes.length) return;
    this.transcriptItems.push({ nodes, height: DEFAULT_TRANSCRIPT_ITEM_HEIGHT });
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom });
  },

  removeTranscriptNode(node) {
    if (!node || !this.transcriptItems?.length) return;
    this.transcriptItems = this.transcriptItems.filter((item) => !item.nodes.includes(node));
    node.remove?.();
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom: false });
  },

  replaceTranscriptNode(oldNode, newNode) {
    const nodes = elementNodes(newNode);
    const item = this.transcriptItems?.find((candidate) => candidate.nodes.includes(oldNode));
    if (!item || !nodes.length) return false;
    item.nodes = nodes;
    item.height = DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
    oldNode.replaceWith?.(...nodes);
    this.renderTranscriptWindow({ stickToBottom: true });
    return true;
  },

  isTranscriptVirtualized() {
    return (this.transcriptItems?.length || 0) > TRANSCRIPT_WINDOW_SIZE;
  },

  scheduleTranscriptWindowRender() {
    if (!this.isTranscriptVirtualized() || this.transcriptWindowFrame) return;
    this.transcriptWindowFrame = window.requestAnimationFrame(() => {
      this.transcriptWindowFrame = undefined;
      this.renderTranscriptWindow({ stickToBottom: false });
    });
  },

  renderTranscriptWindow({ stickToBottom = false } = {}) {
    if (!this.termInner) return;
    const pinned = stickToBottom && this.shouldStickToBottom();
    if (!this.isTranscriptVirtualized()) {
      this.renderTranscriptRange(0, this.transcriptItems.length);
      if (pinned) this.scrollTerm({ force: true });
      this.updateTranscriptScrollButton();
      return;
    }
    const range = pinned ? this.bottomTranscriptRange() : this.visibleTranscriptRange();
    this.renderTranscriptRange(range.start, range.end);
    if (pinned) this.scrollTerm({ force: true });
    this.updateTranscriptScrollButton();
  },

  shouldStickToBottom() {
    return this.transcriptFollowBottom !== false && this.isTermPinnedToBottom();
  },

  bottomTranscriptRange() {
    return {
      start: Math.max(0, this.transcriptItems.length - TRANSCRIPT_WINDOW_SIZE),
      end: this.transcriptItems.length,
    };
  },

  visibleTranscriptRange() {
    const total = this.transcriptItems.length;
    const viewportTop = Math.max(0, this.term?.scrollTop || 0);
    let offset = 0;
    let start = 0;

    for (let index = 0; index < total; index += 1) {
      const nextOffset = offset + this.transcriptItemHeight(index);
      if (nextOffset >= viewportTop) {
        start = index;
        break;
      }
      offset = nextOffset;
    }

    start = clampTranscriptStart(start, total);
    return { start, end: Math.min(total, start + TRANSCRIPT_WINDOW_SIZE) };
  },

  renderTranscriptRange(start, end) {
    this.measureRenderedTranscriptItems();
    this.transcriptVisibleStart = start;
    this.transcriptVisibleEnd = end;
    const fragment = document.createDocumentFragment();
    const topHeight = this.transcriptRangeHeight(0, start);
    const bottomHeight = this.transcriptRangeHeight(end, this.transcriptItems.length);

    if (topHeight > 0) {
      this.transcriptTopSpacer.style.height = `${topHeight}px`;
      fragment.append(this.transcriptTopSpacer);
    }
    for (let index = start; index < end; index += 1) {
      for (const node of this.transcriptItemNodes(index)) fragment.append(node);
    }
    if (bottomHeight > 0) {
      this.transcriptBottomSpacer.style.height = `${bottomHeight}px`;
      fragment.append(this.transcriptBottomSpacer);
    }
    this.termInner.replaceChildren(fragment);
    this.measureRenderedTranscriptItems();
    this.syncAnsweredChoices?.();
  },

  measureRenderedTranscriptItems() {
    if (!this.transcriptItems) return;
    const start = Math.max(0, this.transcriptVisibleStart || 0);
    const end = Math.min(this.transcriptItems.length, this.transcriptVisibleEnd || 0);
    for (let index = start; index < end; index += 1) {
      const item = this.transcriptItems[index];
      if (!item?.nodes) continue;
      const height = measuredHeight(item.nodes);
      if (height > 0) item.height = height;
    }
  },

  transcriptRangeHeight(start, end) {
    let height = 0;
    for (let index = start; index < end; index += 1) height += this.transcriptItemHeight(index);
    return height;
  },

  transcriptItemNodes(index) {
    const item = this.transcriptItems[index];
    if (!item) return [];
    if (!item.nodes && item.message) item.nodes = elementNodes(this.messageNode(item.message));
    return item.nodes || [];
  },

  transcriptItemHeight(index) {
    return this.transcriptItems[index]?.height || DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
  },

  isTermPinnedToBottom() {
    const term = this.term;
    if (!term) return true;
    return term.scrollHeight - term.scrollTop - term.clientHeight < 48;
  },
};
