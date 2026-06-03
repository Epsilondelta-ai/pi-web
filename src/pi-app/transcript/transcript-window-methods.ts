import {
  DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
  renderVirtualTranscriptItem,
  updateTranscriptVirtualScroller,
} from "./transcript-virtual-scroller";
import type {
  TranscriptItem,
  TranscriptItemInit,
  TranscriptMessage,
  TranscriptRenderOptions,
  TranscriptScrollOptions,
  TranscriptTouchEvent,
  TranscriptVirtualState,
  TranscriptWheelEvent,
  TranscriptWindowOwner,
} from "./transcript-types";

const OLDER_MESSAGE_LOAD_THRESHOLD = 160;
const TRANSCRIPT_HEIGHT_CHANGE_EPSILON = 0.5;
const TRANSCRIPT_BOTTOM_FOLLOW_MAX_FRAMES = 12;
const TRANSCRIPT_BOTTOM_FOLLOW_STABLE_FRAMES = 2;
export const TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY = "pi-web.transcriptFollowBottom";

export function isElement(node?: Node | null): node is Element {
  return node?.nodeType === Node.ELEMENT_NODE;
}

export function numericPixelValue(value?: string): number {
  const parsed: number = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function measuredHeight(nodes: Element[]): number {
  return nodes.reduce((total: number, node: Element): number => {
    const height: number = node.getBoundingClientRect?.().height || (node as HTMLElement).offsetHeight || 0;
    const style: CSSStyleDeclaration | undefined = globalThis.getComputedStyle?.(node);
    return total + height + numericPixelValue(style?.marginTop) + numericPixelValue(style?.marginBottom);
  }, 0);
}

export function transcriptIndex(
  items: Array<TranscriptItem | null | undefined> | null | undefined,
  item?: TranscriptItem | null,
): number {
  if (!items) return -1;
  return items.indexOf(item);
}

export function readTranscriptBottomFollowFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeTranscriptBottomFollowFlag(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(TRANSCRIPT_BOTTOM_FOLLOW_STORAGE_KEY, value ? "true" : "false");
  } catch {}
}

export const transcriptWindowMethods = {
  initTranscriptWindow(this: TranscriptWindowOwner): void {
    this.term = this.querySelector(".term");
    this.transcriptItems = [];
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.transcriptFollowBottom = readTranscriptBottomFollowFlag();
    writeTranscriptBottomFollowFlag(this.transcriptFollowBottom);
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

  ensureTranscriptScrollButton(this: TranscriptWindowOwner): HTMLButtonElement | Element {
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

  installTranscriptScrollGuard(this: TranscriptWindowOwner): void {
    if (this.transcriptScrollGuardInstalled) return;
    this.transcriptScrollGuardInstalled = true;
    this.scrollTerm = ({ force = false }: TranscriptScrollOptions = {}): void => {
      if (!force && this.transcriptFollowBottom === false) return;
      if (force) {
        this.startFollowingTranscriptBottom();
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

  scheduleTranscriptBottomFollowFrame(this: TranscriptWindowOwner): void {
    this.transcriptFollowBaseline = this.term?.scrollTop || 0;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      if (!this.followTranscriptBottomOnce()) return;
      this.updateTranscriptBottomFollowStability();
      this.transcriptBottomFollowFramesRemaining = Math.max((this.transcriptBottomFollowFramesRemaining || 0) - 1, 0);
      if (this.shouldContinueTranscriptBottomFollow()) this.scheduleTranscriptBottomFollowFrame();
    });
  },

  updateTranscriptBottomFollowStability(this: TranscriptWindowOwner): void {
    const height = this.term?.scrollHeight || 0;
    if (this.isTermPinnedToBottom() && height === this.transcriptBottomFollowLastHeight) {
      this.transcriptBottomFollowStableFrames = (this.transcriptBottomFollowStableFrames || 0) + 1;
    } else {
      this.transcriptBottomFollowStableFrames = 0;
    }
    this.transcriptBottomFollowLastHeight = height;
  },

  shouldContinueTranscriptBottomFollow(this: TranscriptWindowOwner): boolean {
    return (this.transcriptBottomFollowFramesRemaining || 0) > 0
      && (this.transcriptBottomFollowStableFrames || 0) < TRANSCRIPT_BOTTOM_FOLLOW_STABLE_FRAMES;
  },

  followTranscriptBottomOnce(this: TranscriptWindowOwner): boolean {
    const term = this.term;
    if (!term || this.transcriptFollowBottom === false) return false;
    this.scrollTermToBottomImmediately();
    this.updateTranscriptScrollButton();
    return Boolean(this.transcriptFollowBottom);
  },

  scrollTermToBottomImmediately(this: TranscriptWindowOwner): void {
    const term = this.term;
    if (!term) return;
    const previousScrollBehavior = term.style.scrollBehavior;
    term.style.scrollBehavior = "auto";
    term.scrollTop = term.scrollHeight;
    this.transcriptLastScrollTop = term.scrollTop;
    term.style.scrollBehavior = previousScrollBehavior;
  },

  startFollowingTranscriptBottom(this: TranscriptWindowOwner): void {
    if (this.transcriptFollowBottom === true) return;
    this.transcriptFollowBottom = true;
    writeTranscriptBottomFollowFlag(true);
  },

  stopFollowingTranscriptBottom(this: TranscriptWindowOwner): void {
    if (this.transcriptFollowBottom === false) return;
    this.transcriptFollowBottom = false;
    this.transcriptBottomFollowFramesRemaining = 0;
    writeTranscriptBottomFollowFlag(false);
    this.updateTranscriptScrollButton();
  },

  handleTranscriptUserWheel(this: TranscriptWindowOwner, event?: TranscriptWheelEvent): void {
    if ((event?.deltaY || 0) < 0) this.stopFollowingTranscriptBottom();
  },

  handleTranscriptTouchStart(this: TranscriptWindowOwner, event?: TranscriptTouchEvent): void {
    this.transcriptLastTouchY = event?.touches?.[0]?.clientY;
  },

  handleTranscriptTouchMove(this: TranscriptWindowOwner, event?: TranscriptTouchEvent): void {
    const currentY = event?.touches?.[0]?.clientY;
    const previousY = this.transcriptLastTouchY;
    if (Number.isFinite(currentY) && Number.isFinite(previousY) && currentY > previousY + 4) {
      this.stopFollowingTranscriptBottom();
    }
    this.transcriptLastTouchY = currentY;
  },

  handleTranscriptScroll(this: TranscriptWindowOwner): void {
    this.ensureTranscriptVirtualScrollerStarted();
    const term = this.term;
    const scrollTop = term?.scrollTop || 0;
    const pinned = this.isTermPinnedToBottom();
    if (pinned) this.startFollowingTranscriptBottom();
    this.transcriptLastScrollTop = scrollTop;
    this.updateTranscriptScrollButton();
    if (this.shouldLoadOlderTranscriptMessages()) void this.loadOlderSessionMessages?.();
  },

  shouldLoadOlderTranscriptMessages(this: TranscriptWindowOwner): boolean {
    return !!this.sessionHistoryHasMore
      && !this.running
      && !this.sessionHistoryLoading
      && (this.term?.scrollTop || 0) <= OLDER_MESSAGE_LOAD_THRESHOLD;
  },

  scrollTranscriptToBottom(this: TranscriptWindowOwner): void {
    this.startFollowingTranscriptBottom();
    this.renderTranscriptWindow({ stickToBottom: true });
    this.scrollTerm({ force: true });
    this.updateTranscriptScrollButton();
  },

  updateTranscriptScrollButton(this: TranscriptWindowOwner): void {
    if (!this.transcriptScrollButton) return;
    this.transcriptScrollButton.hidden = this.isTermPinnedToBottom();
  },

  adoptRenderedTranscript(this: TranscriptWindowOwner): void {
    const existingNodes = [...(this.termInner?.children || [])].filter(
      (node) => !node.classList.contains("transcript-spacer"),
    );
    if (!existingNodes.length) return;
    this.transcriptItems = existingNodes.map((node) => this.createTranscriptItem(undefined, { nodes: [node] }));
    this.renderTranscriptWindow({ stickToBottom: true });
  },

  resetTranscriptWindow(this: TranscriptWindowOwner): void {
    this.destroyTranscriptVirtualScroller();
    this.transcriptItems = [];
    this.transcriptLastScrollTop = 0;
    this.transcriptVisibleStart = 0;
    this.transcriptVisibleEnd = 0;
    this.startFollowingTranscriptBottom();
    this.answeredChoiceIds = new Set();
    this.updateTranscriptScrollButton();
  },

  destroyTranscriptVirtualScroller(this: TranscriptWindowOwner): void {
    if (this.transcriptVirtualScroller) {
      if (this.transcriptVirtualScrollerStarted) this.transcriptVirtualScroller.stop?.();
      this.transcriptVirtualScroller = undefined;
      this.transcriptVirtualScrollerStarted = false;
    }
    this.transcriptResizeObservers?.forEach((observer) => observer.disconnect?.());
    this.transcriptResizeObservers?.clear?.();
  },

  createTranscriptItem(
    this: TranscriptWindowOwner,
    message?: TranscriptMessage,
    options: TranscriptItemInit = {},
  ): TranscriptItem {
    return {
      id: this.transcriptNextItemId++,
      message,
      nodes: options.nodes,
      height: measuredHeight(options.nodes || []) || DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
    };
  },

  appendTranscriptNode(this: TranscriptWindowOwner, node?: Node | null, { stickToBottom = true }: TranscriptRenderOptions = {}): void {
    const nodes = this.transcriptElementNodes(node);
    if (!nodes.length) return;
    this.transcriptItems = [
      ...(this.transcriptItems || []),
      this.createTranscriptItem(undefined, { nodes }),
    ];
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom });
  },

  removeTranscriptNode(this: TranscriptWindowOwner, node?: Element | null): void {
    if (!node || !this.transcriptItems?.length) return;
    this.transcriptItems = this.transcriptItems.filter((item) => !item?.nodes?.includes(node));
    node.remove?.();
    if (!this.deferTranscriptRender) this.renderTranscriptWindow({ stickToBottom: false });
  },

  replaceTranscriptNode(this: TranscriptWindowOwner, oldNode: Element, newNode?: Node | null): boolean {
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

  transcriptElementNodes(this: TranscriptWindowOwner, node?: Node | null): Element[] {
    if (!node) return [];
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].filter(isElement);
    return isElement(node) ? [node] : [];
  },

  isTranscriptVirtualized(this: TranscriptWindowOwner): boolean {
    return !!this.transcriptVirtualScroller;
  },

  scheduleTranscriptWindowRender(this: TranscriptWindowOwner): void {
    this.transcriptVirtualScroller?.virtualScroller?.updateLayout?.();
  },

  renderTranscriptWindow(
    this: TranscriptWindowOwner,
    { stickToBottom = false, preservePrepend = false }: TranscriptRenderOptions = {},
  ): void {
    const pinned = stickToBottom && this.shouldStickToBottom();
    updateTranscriptVirtualScroller(this, { preservePrepend, stickToBottom: pinned });
    if (pinned) this.scrollTerm({ force: true });
    this.syncAnsweredChoices?.();
    this.updateTranscriptScrollButton();
  },

  shouldStickToBottom(this: TranscriptWindowOwner): boolean {
    return this.transcriptFollowBottom !== false;
  },

  shouldRenderFullTranscriptWindow(this: TranscriptWindowOwner): boolean {
    return !this.running && !this.isTermPinnedToBottom();
  },

  ensureTranscriptVirtualScrollerStarted(this: TranscriptWindowOwner): void {
    if (!this.transcriptVirtualScroller || this.transcriptVirtualScrollerStarted || (this.term?.clientHeight || 0) <= 0) return;
    this.transcriptVirtualScroller.start?.();
    this.transcriptVirtualScrollerStarted = true;
  },

  renderVirtualTranscriptItem(this: TranscriptWindowOwner, item: TranscriptItem): Element {
    return renderVirtualTranscriptItem(this, item);
  },

  applyTranscriptVirtualState(this: TranscriptWindowOwner, state: TranscriptVirtualState): void {
    this.transcriptVisibleStart = state.firstShownItemIndex || 0;
    this.transcriptVisibleEnd = (state.lastShownItemIndex || 0) + 1;
    state.itemHeights?.forEach((height, index) => {
      if (height > 0 && this.transcriptItems?.[index]) this.transcriptItems[index].height = height;
    });
  },

  measureTranscriptItem(this: TranscriptWindowOwner, item: TranscriptItem | null | undefined, element: Element): boolean {
    const height = measuredHeight([element]);
    const previousHeight = item?.height;
    if (height > 0) item.height = height;
    return height > 0
      && (previousHeight === undefined || Math.abs(previousHeight - height) > TRANSCRIPT_HEIGHT_CHANGE_EPSILON);
  },

  notifyTranscriptNodeHeightDidChange(this: TranscriptWindowOwner, node?: Element | null): void {
    const itemElement = node?.closest?.(".transcript-item");
    const itemId = itemElement?.dataset?.transcriptItem;
    const item = itemId
      ? this.transcriptItems?.find((candidate) => String(candidate?.id) === itemId)
      : this.transcriptItems?.find((candidate) => candidate?.nodes?.some((root) => root === node || root.contains?.(node)));
    this.notifyTranscriptItemHeightDidChange(item, itemElement);
  },

  notifyTranscriptItemHeightDidChange(this: TranscriptWindowOwner, item?: TranscriptItem | null, element?: Element | null): void {
    if (!item) return;
    const itemElement = element || this.termInner?.querySelector(`[data-transcript-item='${item.id}']`);
    if (!itemElement?.isConnected || !this.termInner?.contains?.(itemElement)) return;
    const changed = this.measureTranscriptItem(item, itemElement);
    if (changed && this.transcriptVirtualScrollerStarted && this.isTranscriptItemVisibleInScroller(item)) {
      this.transcriptVirtualScroller?.onItemHeightDidChange(item);
    }
    if (this.transcriptFollowBottom !== false && (changed || this.isTermPinnedToBottom())) this.scrollTerm({ force: true });
  },

  isTranscriptItemVisible(this: TranscriptWindowOwner, item?: TranscriptItem | null): boolean {
    const index = transcriptIndex(this.transcriptItems, item);
    return index >= this.transcriptVisibleStart && index < this.transcriptVisibleEnd;
  },

  isTranscriptItemVisibleInScroller(this: TranscriptWindowOwner, item?: TranscriptItem | null): boolean {
    const index = transcriptIndex(this.transcriptItems, item);
    if (index < 0) return false;
    const state = this.transcriptVirtualScroller?.getState?.();
    if (!state) return this.isTranscriptItemVisible(item);
    return index >= (state.firstShownItemIndex || 0) && index <= (state.lastShownItemIndex || 0);
  },

  measureRenderedTranscriptItems(this: TranscriptWindowOwner): void {
    for (const item of this.transcriptItems || []) {
      if (!item) continue;
      const element = this.termInner?.querySelector(`[data-transcript-item='${item.id}']`);
      if (element) this.measureTranscriptItem(item, element);
    }
  },

  syncRenderedTranscriptItemHeights(this: TranscriptWindowOwner): void {
    this.termInner?.querySelectorAll(".transcript-item[data-transcript-item]").forEach((element) => {
      const itemId = element.dataset.transcriptItem;
      const item = this.transcriptItems?.find((candidate) => String(candidate?.id) === itemId);
      this.notifyTranscriptItemHeightDidChange(item, element);
    });
  },

  transcriptRangeHeight(this: TranscriptWindowOwner, start: number, end: number): number {
    let height = 0;
    for (let index = start; index < end; index += 1) height += this.transcriptItemHeight(index);
    return height;
  },

  transcriptItemNodes(this: TranscriptWindowOwner, index: number): Element[] {
    const item = this.transcriptItems[index];
    if (!item) return [];
    if (!item.nodes && item.message) item.nodes = this.transcriptElementNodes(this.messageNode(item.message));
    return item.nodes || [];
  },

  transcriptItemHeight(this: TranscriptWindowOwner, index: number): number {
    return this.transcriptItems[index]?.height || DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
  },

  isTermPinnedToBottom(this: TranscriptWindowOwner): boolean {
    const term = this.term;
    if (!term) return true;
    return term.scrollHeight - term.scrollTop - term.clientHeight < 48;
  },
};
