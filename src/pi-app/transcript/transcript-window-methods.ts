import {
  DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
  renderVirtualTranscriptItem,
  updateTranscriptVirtualScroller,
} from "./transcript-virtual-scroller";

const OLDER_MESSAGE_LOAD_THRESHOLD = 160;
const TRANSCRIPT_HEIGHT_CHANGE_EPSILON = 0.5;
const TRANSCRIPT_BOTTOM_FOLLOW_MAX_FRAMES = 12;
const TRANSCRIPT_BOTTOM_FOLLOW_STABLE_FRAMES = 2;

export function isElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE;
}

export function numericPixelValue(value) {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function measuredHeight(nodes) {
  return nodes.reduce((total, node) => {
    const height = node.getBoundingClientRect?.().height || node.offsetHeight || 0;
    const style = globalThis.getComputedStyle?.(node);
    return total + height + numericPixelValue(style?.marginTop) + numericPixelValue(style?.marginBottom);
  }, 0);
}

export function transcriptIndex(items, item) {
  if (!items) return -1;
  return items.indexOf(item);
}

export const transcriptWindowMethods = {
  initTranscriptWindow() {
    this.term = this.querySelector(".term");
    this.transcriptItems = [];
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.transcriptFollowBottom = true;
    this.transcriptLastScrollTop = this.term?.scrollTop || 0;
    this.transcriptNextItemId = 1;
    this.transcriptResizeObservers = new Map();
    this.answeredChoiceIds = new Set();
    this.transcriptScrollButton = this.ensureTranscriptScrollButton();
    this.installTranscriptScrollGuard();
    this.term?.addEventListener("scroll", () => this.handleTranscriptScroll());
    this.term?.addEventListener("wheel", (event) => this.handleTranscriptUserWheel(event), { passive: true });
    this.term?.addEventListener("touchstart", (event) => this.handleTranscriptTouchStart(event), { passive: true });
    this.term?.addEventListener("touchmove", (event) => this.handleTranscriptTouchMove(event), { passive: true });
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
      if (force) {
        this.scrollTermToBottomImmediately();
        this.updateTranscriptScrollButton();
      }
      this.transcriptBottomFollowFramesRemaining = TRANSCRIPT_BOTTOM_FOLLOW_MAX_FRAMES;
      this.transcriptBottomFollowStableFrames = 0;
      this.transcriptBottomFollowLastHeight = undefined;
      if (this.scrollFrame) return;
      if (!force) this.transcriptLastScrollTop = this.term?.scrollTop || 0;
      this.scheduleTranscriptBottomFollowFrame();
    };
  },

  scheduleTranscriptBottomFollowFrame() {
    this.transcriptFollowBaseline = this.term?.scrollTop || 0;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      if (!this.followTranscriptBottomOnce()) return;
      this.updateTranscriptBottomFollowStability();
      this.transcriptBottomFollowFramesRemaining = Math.max((this.transcriptBottomFollowFramesRemaining || 0) - 1, 0);
      if (this.shouldContinueTranscriptBottomFollow()) this.scheduleTranscriptBottomFollowFrame();
    });
  },

  updateTranscriptBottomFollowStability() {
    const height = this.term?.scrollHeight || 0;
    if (this.isTermPinnedToBottom() && height === this.transcriptBottomFollowLastHeight) {
      this.transcriptBottomFollowStableFrames = (this.transcriptBottomFollowStableFrames || 0) + 1;
    } else {
      this.transcriptBottomFollowStableFrames = 0;
    }
    this.transcriptBottomFollowLastHeight = height;
  },

  shouldContinueTranscriptBottomFollow() {
    return (this.transcriptBottomFollowFramesRemaining || 0) > 0
      && (this.transcriptBottomFollowStableFrames || 0) < TRANSCRIPT_BOTTOM_FOLLOW_STABLE_FRAMES;
  },

  followTranscriptBottomOnce() {
    const term = this.term;
    const baseline = this.transcriptFollowBaseline || 0;
    if (!term || this.transcriptFollowBottom === false) return false;
    if (term.scrollTop < baseline - 1) {
      this.transcriptFollowBottom = false;
      this.updateTranscriptScrollButton();
      return false;
    }
    this.scrollTermToBottomImmediately();
    this.updateTranscriptScrollButton();
    return this.transcriptFollowBottom !== false;
  },

  scrollTermToBottomImmediately() {
    const term = this.term;
    if (!term) return;
    const previousScrollBehavior = term.style.scrollBehavior;
    term.style.scrollBehavior = "auto";
    term.scrollTop = term.scrollHeight;
    this.transcriptLastScrollTop = term.scrollTop;
    term.style.scrollBehavior = previousScrollBehavior;
  },

  stopFollowingTranscriptBottom() {
    this.transcriptFollowBottom = false;
    this.updateTranscriptScrollButton();
  },

  handleTranscriptUserWheel(event) {
    if ((event?.deltaY || 0) < 0) this.stopFollowingTranscriptBottom();
  },

  handleTranscriptTouchStart(event) {
    this.transcriptLastTouchY = event?.touches?.[0]?.clientY;
  },

  handleTranscriptTouchMove(event) {
    const currentY = event?.touches?.[0]?.clientY;
    const previousY = this.transcriptLastTouchY;
    if (Number.isFinite(currentY) && Number.isFinite(previousY) && currentY > previousY + 4) {
      this.stopFollowingTranscriptBottom();
    }
    this.transcriptLastTouchY = currentY;
  },

  handleTranscriptScroll() {
    const term = this.term;
    const scrollTop = term?.scrollTop || 0;
    const previousScrollTop = this.transcriptLastScrollTop ?? scrollTop;
    const pinned = this.isTermPinnedToBottom();
    if (pinned) this.transcriptFollowBottom = true;
    else if (scrollTop < previousScrollTop - 1) this.stopFollowingTranscriptBottom();
    this.transcriptLastScrollTop = scrollTop;
    this.updateTranscriptScrollButton();
    if (this.shouldLoadOlderTranscriptMessages()) void this.loadOlderSessionMessages?.();
  },

  shouldLoadOlderTranscriptMessages() {
    return !!this.sessionHistoryHasMore
      && !this.sessionHistoryLoading
      && (this.term?.scrollTop || 0) <= OLDER_MESSAGE_LOAD_THRESHOLD;
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
    this.transcriptItems = existingNodes.map((node) => this.createTranscriptItem(undefined, { nodes: [node] }));
    this.renderTranscriptWindow({ stickToBottom: true });
  },

  resetTranscriptWindow() {
    this.destroyTranscriptVirtualScroller();
    this.transcriptItems = [];
    this.transcriptLastScrollTop = 0;
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.transcriptFollowBottom = true;
    this.answeredChoiceIds = new Set();
    this.updateTranscriptScrollButton();
  },

  destroyTranscriptVirtualScroller() {
    if (this.transcriptVirtualScroller) {
      if (this.transcriptVirtualScrollerStarted) this.transcriptVirtualScroller.stop?.();
      this.transcriptVirtualScroller = undefined;
      this.transcriptVirtualScrollerStarted = false;
    }
    this.transcriptResizeObservers?.forEach((observer) => observer.disconnect?.());
    this.transcriptResizeObservers?.clear?.();
  },

  createTranscriptItem(message, options: any = {}) {
    return {
      id: this.transcriptNextItemId++,
      message,
      nodes: options.nodes,
      height: measuredHeight(options.nodes || []) || DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
    };
  },

  appendTranscriptNode(node, { stickToBottom = true } = {}) {
    const nodes = this.transcriptElementNodes(node);
    if (!nodes.length) return;
    this.transcriptItems = [
      ...(this.transcriptItems || []),
      this.createTranscriptItem(undefined, { nodes }),
    ];
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom });
  },

  removeTranscriptNode(node) {
    if (!node || !this.transcriptItems?.length) return;
    this.transcriptItems = this.transcriptItems.filter((item) => !item?.nodes?.includes(node));
    node.remove?.();
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom: false });
  },

  replaceTranscriptNode(oldNode, newNode) {
    const nodes = this.transcriptElementNodes(newNode);
    const item = this.transcriptItems?.find((candidate) => candidate?.nodes?.includes(oldNode));
    if (!item || !nodes.length) return false;
    item.nodes = nodes;
    item.message = undefined;
    item.height = measuredHeight(nodes) || DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
    oldNode.replaceWith?.(...nodes);
    this.renderTranscriptWindow({ stickToBottom: true });
    return true;
  },

  transcriptElementNodes(node) {
    if (!node) return [];
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].filter(isElement);
    return isElement(node) ? [node] : [];
  },

  isTranscriptVirtualized() {
    return !!this.transcriptVirtualScroller;
  },

  scheduleTranscriptWindowRender() {
    this.transcriptVirtualScroller?.virtualScroller?.updateLayout?.();
  },

  renderTranscriptWindow({ stickToBottom = false, preservePrepend = false } = {}) {
    const pinned = stickToBottom && this.shouldStickToBottom();
    updateTranscriptVirtualScroller(this, { preservePrepend, stickToBottom: pinned });
    if (pinned) this.scrollTerm({ force: true });
    this.syncAnsweredChoices?.();
    this.updateTranscriptScrollButton();
  },

  shouldStickToBottom() {
    return this.transcriptFollowBottom !== false;
  },

  shouldRenderFullTranscriptWindow() {
    return !!this.running || !this.isTermPinnedToBottom();
  },

  renderVirtualTranscriptItem(item) {
    return renderVirtualTranscriptItem(this, item);
  },

  applyTranscriptVirtualState(state) {
    this.transcriptVisibleStart = state.firstShownItemIndex || 0;
    this.transcriptVisibleEnd = (state.lastShownItemIndex || 0) + 1;
    state.itemHeights?.forEach((height, index) => {
      if (height > 0 && this.transcriptItems?.[index]) this.transcriptItems[index].height = height;
    });
  },

  measureTranscriptItem(item, element) {
    const height = measuredHeight([element]);
    const previousHeight = item?.height;
    if (height > 0) item.height = height;
    return height > 0
      && (previousHeight === undefined || Math.abs(previousHeight - height) > TRANSCRIPT_HEIGHT_CHANGE_EPSILON);
  },

  notifyTranscriptNodeHeightDidChange(node) {
    const itemElement = node?.closest?.(".transcript-item");
    const itemId = itemElement?.dataset?.transcriptItem;
    const item = itemId
      ? this.transcriptItems?.find((candidate) => String(candidate?.id) === itemId)
      : this.transcriptItems?.find((candidate) => candidate?.nodes?.some((root) => root === node || root.contains?.(node)));
    this.notifyTranscriptItemHeightDidChange(item, itemElement);
  },

  notifyTranscriptItemHeightDidChange(item, element) {
    if (!item) return;
    const itemElement = element || this.termInner?.querySelector(`[data-transcript-item='${item.id}']`);
    if (!itemElement?.isConnected || !this.termInner?.contains?.(itemElement)) return;
    const changed = this.measureTranscriptItem(item, itemElement);
    if (changed && this.transcriptVirtualScrollerStarted && this.isTranscriptItemVisibleInScroller(item)) {
      this.transcriptVirtualScroller?.onItemHeightDidChange(item);
    }
    if (this.transcriptFollowBottom !== false && (changed || this.isTermPinnedToBottom())) this.scrollTerm({ force: true });
  },

  isTranscriptItemVisible(item) {
    const index = transcriptIndex(this.transcriptItems, item);
    return index >= this.transcriptVisibleStart && index < this.transcriptVisibleEnd;
  },

  isTranscriptItemVisibleInScroller(item) {
    const index = transcriptIndex(this.transcriptItems, item);
    if (index < 0) return false;
    const state = this.transcriptVirtualScroller?.getState?.();
    if (!state) return this.isTranscriptItemVisible(item);
    return index >= (state.firstShownItemIndex || 0) && index <= (state.lastShownItemIndex || 0);
  },

  measureRenderedTranscriptItems() {
    for (const item of this.transcriptItems || []) {
      if (!item) continue;
      const element = this.termInner?.querySelector(`[data-transcript-item='${item.id}']`);
      if (element) this.measureTranscriptItem(item, element);
    }
  },

  syncRenderedTranscriptItemHeights() {
    this.termInner?.querySelectorAll(".transcript-item[data-transcript-item]").forEach((element) => {
      const itemId = element.dataset.transcriptItem;
      const item = this.transcriptItems?.find((candidate) => String(candidate?.id) === itemId);
      this.notifyTranscriptItemHeightDidChange(item, element);
    });
  },

  transcriptRangeHeight(start, end) {
    let height = 0;
    for (let index = start; index < end; index += 1) height += this.transcriptItemHeight(index);
    return height;
  },

  transcriptItemNodes(index) {
    const item = this.transcriptItems[index];
    if (!item) return [];
    if (!item.nodes && item.message) item.nodes = this.transcriptElementNodes(this.messageNode(item.message));
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
