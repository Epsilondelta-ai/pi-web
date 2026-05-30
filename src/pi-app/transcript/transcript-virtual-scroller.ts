import { fallbackValue } from "../../shared/fallbacks/fallbacks";
import VirtualScroller from "virtual-scroller/dom";

export const DEFAULT_TRANSCRIPT_ITEM_HEIGHT = 80;
export const TRANSCRIPT_OVERSCAN_ITEM_COUNT = 30;

export function transcriptItemHeight(item) {
  return item?.height || DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
}

export function transcriptRangeHeight(items, start, end) {
  let height = 0;
  for (let index = start; index < end; index += 1) height += transcriptItemHeight(items[index]);
  return height;
}

export function transcriptItemNodes(owner, item) {
  if (!item) return [];
  if (!item.nodes && item.message) item.nodes = owner.transcriptElementNodes(owner.messageNode(item.message));
  return fallbackValue(item.nodes, []);
}

export function transcriptItemId(item) {
  return item.id;
}

function initialTranscriptState(items) {
  const firstShownItemIndex = Math.max(0, items.length - TRANSCRIPT_OVERSCAN_ITEM_COUNT);
  const lastShownItemIndex = Math.max(0, items.length - 1);
  const beforeItemsHeight = transcriptRangeHeight(items, 0, firstShownItemIndex);

  return {
    items,
    itemHeights: new Array(items.length),
    itemStates: new Array(items.length),
    firstShownItemIndex,
    lastShownItemIndex,
    beforeItemsHeight,
    afterItemsHeight: 0,
    columnsCount: 1,
    verticalSpacing: 0,
  };
}

function observeTranscriptItem(owner, item, element) {
  if (!globalThis.ResizeObserver) return;
  const observer = new ResizeObserver(() => owner.notifyTranscriptItemHeightDidChange(item, element));
  observer.observe(element);
  owner.transcriptResizeObservers?.set(element, observer);
}

function unobserveTranscriptItem(owner, element) {
  const observer = owner.transcriptResizeObservers?.get(element);
  observer?.disconnect();
  owner.transcriptResizeObservers?.delete(element);
}

export function createTranscriptVirtualScroller(owner, { stickToBottom = false } = {}) {
  owner.transcriptResizeObservers ??= new Map();
  const items = fallbackValue(owner.transcriptItems, []);
  const readyToStart = fallbackValue(owner.term?.clientHeight, 0) > 0;
  const state = stickToBottom || !readyToStart ? initialTranscriptState(items) : undefined;
  const scroller = new VirtualScroller(
    owner.termInner,
    items,
    (item) => owner.renderVirtualTranscriptItem(item),
    {
      state,
      readyToStart,
      getScrollableContainer: () => owner.term,
      getEstimatedItemHeight: () => DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
      getEstimatedVisibleItemRowsCount: () => TRANSCRIPT_OVERSCAN_ITEM_COUNT,
      getItemId: transcriptItemId,
      initialScrollPosition: state?.beforeItemsHeight,
      onItemUnmount: (element) => unobserveTranscriptItem(owner, element),
      onStateChange: (newState) => owner.applyTranscriptVirtualState(newState),
    },
  );
  owner.transcriptVirtualScrollerStarted = readyToStart;
  return scroller;
}

export function renderVirtualTranscriptItem(owner, item) {
  const element = document.createElement("div");
  element.className = "transcript-item";
  element.dataset.transcriptItem = String(item.id);
  element.append(...transcriptItemNodes(owner, item));
  observeTranscriptItem(owner, item, element);
  return element;
}

export function updateTranscriptVirtualScroller(owner, { preservePrepend = false, stickToBottom = false } = {}) {
  if (!owner.termInner) return;
  if (!owner.transcriptItems?.length) {
    owner.destroyTranscriptVirtualScroller?.();
    owner.termInner.replaceChildren();
    return;
  }
  if (!owner.transcriptVirtualScroller) {
    owner.transcriptVirtualScroller = createTranscriptVirtualScroller(owner, { stickToBottom });
  } else if (!owner.transcriptVirtualScrollerStarted && (owner.term?.clientHeight || 0) === 0) {
    owner.destroyTranscriptVirtualScroller?.();
    owner.transcriptVirtualScroller = createTranscriptVirtualScroller(owner, { stickToBottom });
  } else {
    if (!owner.transcriptVirtualScrollerStarted) {
      owner.transcriptVirtualScroller.start();
      owner.transcriptVirtualScrollerStarted = true;
    }
    owner.syncRenderedTranscriptItemHeights?.();
    owner.transcriptVirtualScroller.setItems(owner.transcriptItems, {
      preserveScrollPositionOnPrependItems: preservePrepend,
    });
  }
  if (stickToBottom) owner.scrollTerm({ force: true });
}
