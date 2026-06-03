import { fallbackValue } from "../../shared/fallbacks/fallbacks";
import VirtualScroller from "virtual-scroller/dom";
import type {
  TranscriptItem,
  TranscriptRenderOptions,
  TranscriptVirtualScrollerInstance,
  TranscriptVirtualState,
  TranscriptWindowOwner,
} from "./transcript-types";

export const DEFAULT_TRANSCRIPT_ITEM_HEIGHT: number = 80;
export const TRANSCRIPT_OVERSCAN_ITEM_COUNT: number = 30;

interface VirtualScrollerConstructor {
  new (
    container: HTMLElement,
    items: TranscriptItem[],
    renderItem: (item: TranscriptItem) => Element,
    options: TranscriptVirtualScrollerOptions,
  ): TranscriptVirtualScrollerInstance;
}

interface TranscriptVirtualScrollerOptions {
  state?: TranscriptVirtualState;
  readyToStart: boolean;
  getScrollableContainer: () => HTMLElement | null | undefined;
  getEstimatedItemHeight: () => number;
  getEstimatedVisibleItemRowsCount: () => number;
  getItemId: (item: TranscriptItem) => number | string;
  initialScrollPosition?: number;
  onItemUnmount: (element: Element) => void;
  onStateChange: (state: TranscriptVirtualState) => void;
}

export function transcriptItemHeight(item?: TranscriptItem | null): number {
  return item?.height || DEFAULT_TRANSCRIPT_ITEM_HEIGHT;
}

export function transcriptRangeHeight(items: Array<TranscriptItem | null | undefined>, start: number, end: number): number {
  let height: number = 0;

  for (let index: number = start; index < end; index += 1) height += transcriptItemHeight(items[index]);

  return height;
}

export function transcriptItemNodes(owner: Partial<TranscriptWindowOwner>, item?: TranscriptItem | null): Element[] {
  if (!item) return [];

  if (!item.nodes && item.message) item.nodes = owner.transcriptElementNodes?.(owner.messageNode?.(item.message)) || [];

  return fallbackValue(item.nodes, []);
}

export function transcriptItemId(item: TranscriptItem): number | string {
  return item.id;
}

function compactTranscriptItems(items: Array<TranscriptItem | null | undefined>): TranscriptItem[] {
  return items.filter((item: TranscriptItem | null | undefined): item is TranscriptItem => Boolean(item));
}

function initialTranscriptState(items: TranscriptItem[]): TranscriptVirtualState {
  const firstShownItemIndex: number = Math.max(0, items.length - TRANSCRIPT_OVERSCAN_ITEM_COUNT);
  const lastShownItemIndex: number = Math.max(0, items.length - 1);
  const beforeItemsHeight: number = transcriptRangeHeight(items, 0, firstShownItemIndex);

  return {
    items,
    itemHeights: new Array<number>(items.length),
    itemStates: new Array<unknown>(items.length),
    firstShownItemIndex,
    lastShownItemIndex,
    beforeItemsHeight,
    afterItemsHeight: 0,
    columnsCount: 1,
    verticalSpacing: 0,
  };
}

function observeTranscriptItem(owner: TranscriptWindowOwner, item: TranscriptItem, element: Element): void {
  if (!globalThis.ResizeObserver) return;

  const observer: ResizeObserver = new ResizeObserver((): void => owner.notifyTranscriptItemHeightDidChange(item, element));
  observer.observe(element);
  owner.transcriptResizeObservers?.set(element, observer);
}

function unobserveTranscriptItem(owner: TranscriptWindowOwner, element: Element): void {
  const observer: ResizeObserver | undefined = owner.transcriptResizeObservers?.get(element);
  observer?.disconnect();
  owner.transcriptResizeObservers?.delete(element);
}

export function createTranscriptVirtualScroller(
  owner: TranscriptWindowOwner,
  { stickToBottom = false }: TranscriptRenderOptions = {},
): TranscriptVirtualScrollerInstance {
  owner.transcriptResizeObservers ??= new Map<Element, ResizeObserver>();
  const items: TranscriptItem[] = compactTranscriptItems(fallbackValue(owner.transcriptItems, []));
  const readyToStart: boolean = fallbackValue(owner.term?.clientHeight, 0) > 0;
  const state: TranscriptVirtualState | undefined = stickToBottom || !readyToStart ? initialTranscriptState(items) : undefined;
  const Scroller: VirtualScrollerConstructor = VirtualScroller as unknown as VirtualScrollerConstructor;
  const scroller: TranscriptVirtualScrollerInstance = new Scroller(
    owner.termInner as HTMLElement,
    items,
    (item: TranscriptItem): Element => owner.renderVirtualTranscriptItem(item) as Element,
    {
      state,
      readyToStart,
      getScrollableContainer: (): HTMLElement | null | undefined => owner.term,
      getEstimatedItemHeight: (): number => DEFAULT_TRANSCRIPT_ITEM_HEIGHT,
      getEstimatedVisibleItemRowsCount: (): number => TRANSCRIPT_OVERSCAN_ITEM_COUNT,
      getItemId: transcriptItemId,
      initialScrollPosition: state?.beforeItemsHeight,
      onItemUnmount: (element: Element): void => unobserveTranscriptItem(owner, element),
      onStateChange: (newState: TranscriptVirtualState): void => owner.applyTranscriptVirtualState(newState),
    },
  );
  owner.transcriptVirtualScrollerStarted = readyToStart;
  return scroller;
}

export function renderVirtualTranscriptItem(owner: TranscriptWindowOwner, item: TranscriptItem): Element {
  const element: HTMLDivElement = document.createElement("div");
  element.className = "transcript-item";
  element.dataset.transcriptItem = String(item.id);
  element.append(...transcriptItemNodes(owner, item));
  observeTranscriptItem(owner, item, element);
  return element;
}

export function resetTranscriptVirtualSpacing(owner: Partial<TranscriptWindowOwner>): void {
  if (!owner.termInner) return;

  owner.termInner.style.paddingTop = "";
  owner.termInner.style.paddingBottom = "";
}

export function renderFullTranscriptWindow(
  owner: TranscriptWindowOwner,
  { preservePrepend = false, stickToBottom = false }: TranscriptRenderOptions = {},
): void {
  const previousScrollHeight: number = owner.term?.scrollHeight || 0;
  const previousScrollTop: number = owner.term?.scrollTop || 0;
  owner.destroyTranscriptVirtualScroller?.();
  resetTranscriptVirtualSpacing(owner);
  const items: TranscriptItem[] = compactTranscriptItems(fallbackValue(owner.transcriptItems, []));
  owner.termInner?.replaceChildren(...items.map((item: TranscriptItem): Element => renderVirtualTranscriptItem(owner, item)));
  owner.transcriptVisibleStart = 0;
  owner.transcriptVisibleEnd = items.length;
  owner.syncRenderedTranscriptItemHeights?.();

  if (stickToBottom) owner.scrollTerm({ force: true });
  else if (preservePrepend && owner.term) {
    owner.term.scrollTop = previousScrollTop + Math.max(0, owner.term.scrollHeight - previousScrollHeight);
  }
}

export function updateTranscriptVirtualScroller(
  owner: TranscriptWindowOwner,
  { preservePrepend = false, stickToBottom = false }: TranscriptRenderOptions = {},
): void {
  if (!owner.termInner) return;

  const items: TranscriptItem[] = compactTranscriptItems(fallbackValue(owner.transcriptItems, []));

  if (!items.length) {
    owner.destroyTranscriptVirtualScroller?.();
    resetTranscriptVirtualSpacing(owner);
    owner.termInner.replaceChildren();
    return;
  }

  if (owner.shouldRenderFullTranscriptWindow?.()) {
    renderFullTranscriptWindow(owner, { preservePrepend, stickToBottom });
    return;
  }

  if (!owner.transcriptVirtualScroller) {
    owner.transcriptVirtualScroller = createTranscriptVirtualScroller(owner, { stickToBottom });
  } else if (!owner.transcriptVirtualScrollerStarted && (owner.term?.clientHeight || 0) === 0) {
    owner.destroyTranscriptVirtualScroller?.();
    owner.transcriptVirtualScroller = createTranscriptVirtualScroller(owner, { stickToBottom });
  } else {
    if (!owner.transcriptVirtualScrollerStarted) {
      owner.transcriptVirtualScroller.start?.();
      owner.transcriptVirtualScrollerStarted = true;
    }

    owner.syncRenderedTranscriptItemHeights?.();
    owner.transcriptVirtualScroller.setItems?.(items, {
      preserveScrollPositionOnPrependItems: preservePrepend,
    });
  }

  if (stickToBottom) owner.scrollTerm({ force: true });
}
